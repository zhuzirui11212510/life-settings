import { mkdirSync, readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { homedir, networkInterfaces } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { getLesson, listLessons, viewStep } from './lessons.mjs';
import { createStore } from './store.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const defaultDataDir = path.join(homedir(), '.life-settings', 'unit4');
const maxBodyBytes = 8192;
const assets = new Map([
  ['/', ['public/index.html', 'text/html; charset=utf-8']],
  ['/index.html', ['public/index.html', 'text/html; charset=utf-8']],
  ['/unit4.css', ['public/unit4.css', 'text/css; charset=utf-8']],
  ['/app.js', ['public/app.js', 'text/javascript; charset=utf-8']],
  ['/connection.js', ['public/connection.js', 'text/javascript; charset=utf-8']],
  ['/view.js', ['public/view.js', 'text/javascript; charset=utf-8']],
  ['/qr.js', ['../public/qr.js', 'text/javascript; charset=utf-8']],
  ['/QR-LICENSE.txt', ['../public/QR-LICENSE.txt', 'text/plain; charset=utf-8']],
]);
const securityHeaders = {
  'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; base-uri 'none'; form-action 'self'; frame-ancestors 'none'; object-src 'none'",
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
};

function fail(status, code, message) {
  throw Object.assign(new Error(message), { status, code });
}

function json(response, status, data) {
  response.writeHead(status, {
    ...securityHeaders,
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  response.end(JSON.stringify(data));
}

function method(request, response, allowed) {
  if (allowed.includes(request.method)) return;
  response.setHeader('Allow', allowed.join(', '));
  fail(405, 'method', '此入口不支持该请求方式。');
}

async function readBody(request) {
  const mediaType = request.headers['content-type']?.split(';', 1)[0].trim().toLowerCase();
  if (mediaType !== 'application/json') fail(415, 'content_type', '请发送 JSON。');
  if (Number(request.headers['content-length']) > maxBodyBytes) fail(413, 'body_size', '请求内容太大。');
  const chunks = [];
  let length = 0;
  for await (const chunk of request.iterator({ destroyOnReturn: false })) {
    length += chunk.length;
    if (length > maxBodyBytes) fail(413, 'body_size', '请求内容太大。');
    chunks.push(chunk);
  }
  let data;
  try {
    data = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks, length)));
  } catch {
    fail(400, 'invalid_json', '请求内容不是有效的 JSON。');
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) fail(400, 'invalid_json', '请发送 JSON 对象。');
  return data;
}

function bearer(request) {
  const header = request.headers.authorization;
  if (header === undefined) return undefined;
  const token = /^Bearer ([a-f0-9]{64})$/i.exec(header)?.[1];
  if (!token) fail(401, 'invalid_token', '课堂凭证无效。');
  return token;
}

function lanOrigins(address) {
  if (!address || !['0.0.0.0', '::'].includes(address.address)) return [];
  return [...new Set(Object.values(networkInterfaces()).flat().filter(entry =>
    entry.family === 'IPv4' && !entry.internal && !entry.address.startsWith('169.254.')
  ).map(entry => `http://${entry.address}:${address.port}`))];
}

export function createClassroomServer({ dataDir = defaultDataDir, readOnly = false, advertiseLan = false } = {}) {
  if (!path.isAbsolute(dataDir)) throw new Error('UNIT4_DATA_DIR must be an absolute path.');
  if (!readOnly) mkdirSync(dataDir, { recursive: true });
  const store = createStore({ databasePath: path.join(dataDir, 'classroom.sqlite'), readOnly });
  const streams = new Map();
  let streamCount = 0;

  function push(response, chunk) {
    // A slow device can recover by reloading its state. Do not queue an unbounded stream.
    if (!response.destroyed && !response.writableEnded && !response.write(chunk)) response.destroy();
  }

  function watch(response, code) {
    const { revision } = store.watch(code);
    let roomStreams = streams.get(code);
    if (streamCount >= 512 || (roomStreams?.listeners.size ?? 0) >= 128) {
      response.setHeader('Retry-After', '5');
      fail(503, 'stream_capacity', '实时连接繁忙，页面可继续通过轮询同步。');
    }
    if (!roomStreams) streams.set(code, roomStreams = { listeners: new Map(), timer: null });
    roomStreams.listeners.set(response, revision);
    streamCount++;
    response.on('close', () => {
      if (roomStreams.listeners.delete(response)) streamCount--;
      if (!roomStreams.listeners.size) {
        clearTimeout(roomStreams.timer);
        streams.delete(code);
      }
    });
    response.writeHead(200, {
      ...securityHeaders,
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'X-Accel-Buffering': 'no',
    });
    push(response, `retry: 3000\nevent: revision\ndata: ${revision}\n\n`);
  }

  function notify(code) {
    const roomStreams = streams.get(code);
    if (!roomStreams || roomStreams.timer) return;
    // Invalidation carries the latest revision. One broadcast covers a burst of submissions.
    roomStreams.timer = setTimeout(() => {
      roomStreams.timer = null;
      try {
        const { revision } = store.watch(code);
        for (const [stream, seen] of roomStreams.listeners) {
          if (revision <= seen) continue;
          roomStreams.listeners.set(stream, revision);
          push(stream, `event: revision\ndata: ${revision}\n\n`);
        }
      } catch (error) {
        console.error(error);
        for (const stream of roomStreams.listeners.keys()) stream.destroy();
      }
    }, 35);
  }

  const heartbeat = setInterval(() => {
    for (const roomStreams of streams.values()) {
      for (const stream of roomStreams.listeners.keys()) push(stream, ': heartbeat\n\n');
    }
  }, 15_000);
  heartbeat.unref();

  const server = createServer({ requestTimeout: 15_000, headersTimeout: 10_000 }, async (request, response) => {
    try {
      const pathname = new URL(request.url, 'http://localhost').pathname;
      const asset = assets.get(pathname);
      if (asset) {
        method(request, response, ['GET', 'HEAD']);
        const [file, contentType] = asset;
        const bytes = readFileSync(path.join(here, file));
        response.writeHead(200, {
          ...securityHeaders,
          'Content-Type': contentType,
          'Content-Length': bytes.length,
          'Cache-Control': 'no-cache',
        });
        return response.end(request.method === 'HEAD' ? undefined : bytes);
      }

      if (pathname === '/api/health' || pathname === '/api/network' || pathname === '/api/lessons') {
        method(request, response, ['GET']);
        if (pathname === '/api/health') return json(response, 200, store.health());
        if (pathname === '/api/network') return json(response, 200, { origins: advertiseLan ? lanOrigins(server.address()) : [] });
        return json(response, 200, listLessons());
      }
      const lessonId = /^\/api\/lessons\/([a-z0-9-]+)$/.exec(pathname)?.[1];
      if (lessonId) {
        method(request, response, ['GET']);
        const lesson = getLesson(lessonId);
        if (!lesson) fail(404, 'lesson_not_found', '没有找到这份教案。');
        const { id, version, title, steps } = lesson;
        return json(response, 200, { id, version, title, steps: steps.map(step => viewStep(step, { role: 'student', phase: 'preview' })) });
      }
      if (pathname === '/api/rooms') {
        method(request, response, ['POST']);
        return json(response, 201, store.createRoom(await readBody(request)));
      }
      const room = /^\/api\/rooms\/([a-z0-9]{1,12})\/(state|events|join|commands|answers)$/i.exec(pathname);
      if (!room) fail(404, 'not_found', '没有找到该页面或入口。');
      const code = room[1].toUpperCase();
      const endpoint = room[2].toLowerCase();
      if (endpoint === 'state' || endpoint === 'events') {
        method(request, response, ['GET']);
        if (endpoint === 'events') return watch(response, code);
        return json(response, 200, store.state(code, bearer(request)));
      }
      method(request, response, ['POST']);
      const body = await readBody(request);
      let result;
      if (endpoint === 'join') result = store.join(code, body);
      else if (endpoint === 'commands') result = store.command(code, bearer(request), body);
      else result = store.submit(code, bearer(request), body);
      notify(code);
      return json(response, endpoint === 'join' ? 201 : 200, result);
    } catch (error) {
      if (response.destroyed) return;
      if (response.headersSent) return response.end();
      if (error.status >= 400 && error.status < 600) {
        if (error.status === 413 || error.status === 415) {
          response.setHeader('Connection', 'close');
          request.resume();
        }
        return json(response, error.status, { code: error.code ?? 'request_error', message: error.message });
      }
      console.error(error);
      json(response, 500, { code: 'server_error', message: '课堂服务暂时无法处理此请求。' });
    }
  });

  // End open event streams before waiting for the HTTP server to close.
  const close = server.close.bind(server);
  let shutdownTimer;
  server.close = callback => {
    for (const roomStreams of streams.values()) {
      clearTimeout(roomStreams.timer);
      for (const response of roomStreams.listeners.keys()) response.end();
    }
    // Browsers can leave an idle preconnection or an incomplete request during restart.
    shutdownTimer ??= setTimeout(() => server.closeAllConnections(), 2000).unref();
    return close(callback);
  };
  server.once('close', () => {
    clearTimeout(shutdownTimer);
    clearInterval(heartbeat);
    store.close();
  });
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const lan = process.argv.includes('--lan');
  const host = process.env.UNIT4_HOST || (lan ? '0.0.0.0' : '127.0.0.1');
  const port = Number(process.env.UNIT4_PORT || 8794);
  const dataDir = process.env.UNIT4_DATA_DIR || defaultDataDir;
  const readOnly = process.env.UNIT4_READ_ONLY === '1';
  const advertiseLan = process.env.UNIT4_ADVERTISE_LAN === undefined ? lan : process.env.UNIT4_ADVERTISE_LAN === '1';
  const server = createClassroomServer({ dataDir, readOnly, advertiseLan });
  server.listen(port, host, () => {
    const address = server.address();
    console.log(`Unit 4 主持台  http://127.0.0.1:${address.port}/?mode=host`);
    for (const origin of advertiseLan ? lanOrigins(address) : []) console.log(`教室网络  ${origin}`);
    console.log(`数据目录  ${dataDir}${readOnly ? '（只读）' : ''}`);
  });
  process.once('SIGINT', () => server.close());
  process.once('SIGTERM', () => server.close());
}
