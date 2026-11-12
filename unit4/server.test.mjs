import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { once } from 'node:events';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createConnection } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import test from 'node:test';
import { createClassroomServer } from './server.mjs';

const secret = () => randomBytes(32).toString('hex');
const requestId = () => randomBytes(16).toString('hex');

async function fixture(t) {
  const dataDir = await mkdtemp(path.join(tmpdir(), 'unit4-test-'));
  const servers = new Set();
  t.after(async () => {
    await Promise.all([...servers].map(close));
    await rm(dataDir, { recursive: true, force: true });
  });
  async function close(server) {
    if (!servers.delete(server)) return;
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
  async function start(options = {}, factory = createClassroomServer) {
    const server = factory({ dataDir, ...options });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    servers.add(server);
    const origin = `http://127.0.0.1:${server.address().port}`;
    async function request(endpoint, { body, token, status = 200 } = {}) {
      const headers = new Headers(token === undefined ? {} : { Authorization: `Bearer ${token}` });
      if (body !== undefined) headers.set('Content-Type', 'application/json');
      const response = await fetch(`${origin}/api/${endpoint}`, {
        method: body === undefined ? 'GET' : 'POST', headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(8000),
      });
      const value = await response.json();
      if (status === null) return { status: response.status, value };
      assert.equal(response.status, status, `${endpoint}: ${JSON.stringify(value)}`);
      return value;
    }
    return { origin, request, close: () => close(server) };
  }
  return { start, dataDir };
}

async function createRoom(client, options = {}) {
  const token = secret();
  const body = { ...options, token };
  const { code } = await client.request('rooms', { body, status: 201 });
  return { code, token, body };
}

function roomApi(client, code) {
  const call = (endpoint, options) => client.request(`rooms/${code}/${endpoint}`, options);
  return {
    state: (token, status) => call('state', { token, status }),
    join: (token, seatKey, status = 201) => call('join', { body: { token, seatKey }, status }),
    command: (token, action, fields, status = 200) => call('commands', { token, body: { requestId: requestId(), action, ...fields }, status }),
    answer: (token, body, status) => call('answers', { token, body, status }),
  };
}

async function openDemo(room, host, stepId = 'one-surface-ribbon-cut') {
  const before = await room.state(host);
  await room.command(host, 'select-demo', { stepId, expectedStep: before.step?.id ?? null, expectedRun: before.run?.id ?? null });
  const opened = await room.state(host);
  assert.equal(opened.step.id, stepId);
  assert.equal(opened.step.module, 'demo@1');
  assert.equal(opened.run.status, 'open');
  return opened.run.id;
}

async function openEventStream(client, code) {
  const controller = new AbortController();
  const response = await fetch(`${client.origin}/api/rooms/${code}/events`, {
    signal: AbortSignal.any([controller.signal, AbortSignal.timeout(20_000)]),
  });
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /text\/event-stream/);
  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = '';
  async function next() {
    for (;;) {
      const split = buffer.indexOf('\n\n');
      if (split !== -1) {
        const frame = buffer.slice(0, split);
        buffer = buffer.slice(split + 2);
        if (frame.startsWith(':')) continue;
        assert.match(frame, /^(retry: \d+\n)?event: revision\ndata: \d+$/);
        return Number(frame.split('data: ')[1]);
      }
      const { value, done } = await reader.read();
      assert.equal(done, false, 'SSE disconnected while waiting for a revision');
      buffer += value;
    }
  }
  return { next, close: () => controller.abort() };
}

test('role boundaries, transport errors, and persisted idempotent receipts', { timeout: 25_000 }, async t => {
  const { start } = await fixture(t);
  let client = await start();
  const created = await createRoom(client);
  const { code, token: host } = created;
  let room = roomApi(client, code);
  const student = secret();
  assert.deepEqual(await client.request('rooms', { body: created.body, status: 201 }), { code });
  const joined = await room.join(student);
  assert.deepEqual(await room.join(student), joined);
  assert.equal((await room.state()).role, 'screen');
  assert.equal((await room.state(student)).role, 'student');
  assert.equal((await room.state(host)).role, 'host');
  await room.state(secret(), 401);
  await room.command(student, 'select-demo', { stepId: 'one-surface-ribbon-cut', expectedStep: null, expectedRun: null }, 403);

  const other = await createRoom(client);
  await roomApi(client, other.code).state(student, 401);
  const preview = await client.request('lessons/demo-classroom');
  assert.equal(preview.steps.length, 21);
  assert.doesNotMatch(JSON.stringify(preview), /"(?:teacher|answer|correctOptionId)":/);
  for (const url of ['/demos/one-surface/v1/manifest.json', '/store.mjs', '/classroom.sqlite', '/.git/config']) {
    assert.equal((await fetch(client.origin + url)).status, 404, url);
  }
  const html = await fetch(client.origin);
  assert.equal(html.status, 200);
  assert.match(html.headers.get('content-security-policy'), /script-src 'self'/);
  await html.text();
  const malformed = await fetch(`${client.origin}/api/rooms`, {
    method: 'POST', body: '{', headers: { 'Content-Type': 'application/json' },
  });
  assert.equal(malformed.status, 400);
  assert.equal((await malformed.json()).code, 'invalid_json');
  const oversized = await fetch(`${client.origin}/api/rooms`, {
    method: 'POST', body: 'x'.repeat(8193), headers: { 'Content-Type': 'application/json' },
  });
  assert.equal(oversized.status, 413);
  await oversized.text();
  const form = await fetch(`${client.origin}/api/rooms`, { method: 'POST', body: 'token=abc' });
  assert.equal(form.status, 415);
  await form.text();

  const runId = await openDemo(room, host);
  const answer = { requestId: requestId(), runId, value: 'single-ring' };
  const original = await room.answer(student, answer);
  assert.equal(original.requestId, answer.requestId);
  assert.equal((await room.state(student)).participant.receipt.value, 'single-ring');
  await room.answer(student, { ...answer, requestId: requestId(), value: 'linked-rings' }, 409);
  assert.equal((await room.state()).run.counts, undefined);
  await room.command(host, 'reveal', { runId }, 409);
  const lock = { runId, requestId: requestId() };
  const locked = await room.command(host, 'lock', lock);
  const lockedRevision = (await room.state(host)).revision;
  assert.deepEqual(await room.answer(student, answer), original);
  await room.answer(student, { ...answer, value: 'linked-rings' }, 409);
  assert.equal((await room.state(host)).revision, lockedRevision);
  assert.equal((await room.state()).run.counts, undefined);
  const health = await client.request('health');
  assert.ok(health.databaseId);
  await client.close();

  client = await start();
  room = roomApi(client, code);
  assert.equal((await client.request('health')).databaseId, health.databaseId);
  assert.deepEqual(await room.command(host, 'lock', lock), locked);
  assert.deepEqual(await room.answer(student, answer), original);
  await room.command(host, 'reveal', { runId });
  const revealed = (await room.state()).run;
  assert.equal(revealed.status, 'revealed');
  assert.equal(revealed.count, 1);
  assert.ok(revealed.counts);
  const nextRun = await openDemo(room, host, 'interaction-atlas-refraction');
  assert.notEqual(nextRun, runId);
  assert.equal((await room.state(student)).participant.receipt, null);
  assert.deepEqual(await room.answer(student, answer), original);
});

test('Take the Light carries an actual classroom result into the textbook discussion', { timeout: 15_000 }, async t => {
  const { start } = await fixture(t);
  const client = await start();
  const listing = await client.request('lessons');
  assert.ok(listing.some(({ id }) => id === 'take-the-light'));
  const preview = await client.request('lessons/take-the-light');
  assert.deepEqual(preview.steps.map(({ id }) => id), ['night-reading', 'edit-lede', 'compare-leads', 'review-unit', 'exit-line']);
  assert.doesNotMatch(JSON.stringify(preview), /"(?:teacher|answer|correctOptionId)":/);
  const { demoUrl } = preview.steps[1].config;
  assert.equal((await fetch(client.origin + demoUrl, { method: 'HEAD' })).status, 200);

  const { code, token: host } = await createRoom(client, { lessonId: 'take-the-light' });
  const room = roomApi(client, code);
  const student = secret();
  const advance = stepId => room.command(host, 'advance', { stepId });
  await room.join(student);
  assert.deepEqual((await room.state(host)).demoSteps, []);
  await room.command(host, 'select-demo', { stepId: 'edit-lede', expectedStep: null, expectedRun: null }, 400);
  await advance('night-reading');
  assert.equal((await room.state(student)).step.id, 'night-reading');
  const { runId: editRunId } = await advance('edit-lede');
  await room.answer(student, { requestId: requestId(), runId: editRunId, value: 'crew' });
  await room.command(host, 'lock', { runId: editRunId });
  assert.equal((await room.state()).run.counts, undefined);
  await room.command(host, 'reveal', { runId: editRunId });
  await advance('compare-leads');
  const discussion = (await room.state()).step;
  assert.equal(discussion.discussion.sourceRunId, editRunId);
  assert.equal(discussion.discussion.count, 1);
  assert.deepEqual(discussion.discussion.counts, { care: 0, crew: 1 });
  assert.match(discussion.config.body, /p\.103/);

  const { runId: reviewRunId } = await advance('review-unit');
  assert.equal((await room.state(student)).step.answer, undefined);
  await room.answer(student, { requestId: requestId(), runId: reviewRunId, value: 'reviews' });
  await room.command(host, 'lock', { runId: reviewRunId });
  await room.command(host, 'reveal', { runId: reviewRunId });
  assert.equal((await room.state(student)).step.answer.correctOptionId, 'reviews');
  await advance('exit-line');
  assert.equal((await room.state(student)).step.id, 'exit-line');
  await advance(null);
  assert.equal((await room.state()).finished, true);
});

test('an incomplete browser request cannot prevent the service from restarting', { timeout: 10_000 }, async t => {
  const { start } = await fixture(t);
  const client = await start();
  const port = Number(new URL(client.origin).port);
  const socket = createConnection(port, '127.0.0.1');
  t.after(() => socket.destroy());
  await once(socket, 'connect');
  const expectingContinue = once(socket, 'data');
  socket.write('POST /api/rooms HTTP/1.1\r\nHost: localhost\r\nContent-Type: application/json\r\nContent-Length: 100\r\nExpect: 100-continue\r\n\r\n');
  const [response] = await expectingContinue;
  assert.match(response.toString(), /^HTTP\/1\.1 100 Continue/);
  socket.write('{');
  const disconnected = once(socket, 'close');
  await client.close();
  await disconnected;
  const restarted = await start();
  assert.ok((await restarted.request('health')).databaseId);
});

test('versioned demo files are embeddable and compressed while manifests stay private', { timeout: 15_000 }, async t => {
  const { start } = await fixture(t);
  const client = await start();
  const preview = await client.request('lessons/demo-classroom');
  for (const bundle of new Set(preview.steps.map(step => new URL(step.config.demoUrl, client.origin).pathname))) {
    const response = await fetch(client.origin + bundle);
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-security-policy'), /frame-ancestors 'self'/);
    assert.match(response.headers.get('cache-control'), /immutable/);
    assert.match(await response.text(), /demo-bridge\.js/);
  }
  const script = `${client.origin}/demos/one-surface/v1/assets/three-r181.js`;
  const compressed = await fetch(script, { headers: { 'Accept-Encoding': 'gzip' } });
  assert.equal(compressed.headers.get('content-encoding'), 'gzip');
  assert.equal(compressed.headers.get('vary'), 'Accept-Encoding');
  assert.ok(Number(compressed.headers.get('content-length')) < 600_000);
  const etag = compressed.headers.get('etag');
  assert.match(await compressed.text(), /Three\.js Authors/);
  const cached = await fetch(script, { headers: { 'If-None-Match': etag } });
  assert.equal(cached.status, 304);
  const uncompressed = await fetch(script, { method: 'HEAD', headers: { 'Accept-Encoding': 'gzip;q=0' } });
  assert.equal(uncompressed.headers.get('content-encoding'), null);
  for (const forbidden of ['manifest.json', 'assets/../../manifest.json', 'assets/%2e%2e%2fmanifest.json']) {
    assert.equal((await fetch(`${client.origin}/demos/one-surface/v1/${forbidden}`)).status, 404);
  }
});

test('60 listening students submit together with a competing lock', { timeout: 35_000 }, async t => {
  const { start } = await fixture(t);
  const client = await start();
  const { code, token: host } = await createRoom(client);
  const room = roomApi(client, code);
  const students = Array.from({ length: 60 }, secret);
  await Promise.all(students.map(token => room.join(token)));
  const streams = [];
  t.after(() => streams.forEach(stream => stream.close()));
  await Promise.all(students.map(async () => streams.push(await openEventStream(client, code))));
  const initial = (await room.state(host)).revision;
  assert.deepEqual(await Promise.all(streams.map(stream => stream.next())), Array(60).fill(initial));
  const runId = await openDemo(room, host);
  const openedRevision = (await room.state(host)).revision;
  async function waitForRevision(previous, target) {
    await Promise.all(streams.map(async stream => {
      let revision = previous;
      while (revision < target) {
        const next = await stream.next();
        assert.ok(next > revision);
        revision = next;
      }
      assert.equal(revision, target);
    }));
  }
  await waitForRevision(initial, openedRevision);

  const attempts = students.map((token, i) => ({ token, body: { requestId: requestId(), runId, value: i % 2 ? 'single-ring' : 'linked-rings' } }));
  const latencies = [];
  async function send(attempt) {
    const started = performance.now();
    const result = await room.answer(attempt.token, attempt.body, null);
    latencies.push(performance.now() - started);
    return { ...attempt, ...result };
  }
  const beforeLock = await Promise.all(attempts.slice(0, 30).map(send));
  assert.ok(beforeLock.every(result => result.status === 200));
  // Model a phone whose request has started but whose last bytes arrive after the lock.
  const lateAttempt = attempts.at(-1);
  const finishBody = Promise.withResolvers();
  const startedBody = Promise.withResolvers();
  const bytes = Buffer.from(JSON.stringify(lateAttempt.body));
  const lateResponse = fetch(`${client.origin}/api/rooms/${code}/answers`, {
    method: 'POST', duplex: 'half', signal: AbortSignal.timeout(8000),
    headers: { Authorization: `Bearer ${lateAttempt.token}`, 'Content-Type': 'application/json' },
    body: new ReadableStream({
      async start(controller) {
        controller.enqueue(bytes.subarray(0, -1));
        startedBody.resolve();
        await finishBody.promise;
        controller.enqueue(bytes.subarray(-1));
        controller.close();
      },
    }),
  });
  await startedBody.promise;
  const duringLock = Promise.all(attempts.slice(30, -1).map(send));
  await room.command(host, 'lock', { runId }).finally(finishBody.resolve);
  const late = await lateResponse;
  assert.equal(late.status, 409);
  assert.equal((await late.json()).code, 'RUN_CLOSED');
  const all = [...beforeLock, ...await duringLock];
  const accepted = all.filter(result => result.status === 200);
  assert.ok(all.every(result => [200, 409].includes(result.status)), JSON.stringify(all));
  const afterLock = (await room.state()).run;
  assert.equal(afterLock.status, 'locked');
  assert.equal(afterLock.count, accepted.length);
  assert.equal(afterLock.counts, undefined);
  const lockedRevision = (await room.state(host)).revision;
  await waitForRevision(openedRevision, lockedRevision);
  await Promise.all(accepted.map(async result => assert.deepEqual(await room.answer(result.token, result.body), result.value)));
  const neverSubmitted = secret();
  await room.join(neverSubmitted);
  await room.answer(neverSubmitted, { requestId: requestId(), runId, value: 'single-ring' }, 409);
  await room.command(host, 'reveal', { runId });
  assert.equal((await room.state()).run.count, accepted.length);
  latencies.sort((a, b) => a - b);
  t.diagnostic(`60 SSE streams, ${accepted.length}/60 accepted before lock, HTTP submit p95 ${latencies[56].toFixed(1)} ms on loopback`);
});

test('skips and interrupted runs preserve scope, recovered databases open read-only', { timeout: 20_000 }, async t => {
  const { start, dataDir } = await fixture(t);
  let client = await start();
  const skipped = await createRoom(client);
  const skipRoom = roomApi(client, skipped.code);
  await skipRoom.command(skipped.token, 'skip', { stepId: 'one-surface-ribbon-cut' });
  await skipRoom.command(skipped.token, 'advance', { stepId: 'live-stages-wave' });
  assert.equal((await skipRoom.state()).step.id, 'live-stages-wave');

  const { code, token: host } = await createRoom(client);
  const room = roomApi(client, code);
  const runId = await openDemo(room, host);
  const student = secret();
  await room.join(student);
  const body = { requestId: requestId(), runId, value: 'single-ring' };
  const original = await room.answer(student, body);
  await room.command(host, 'abort', { runId });
  assert.equal((await room.state()).run.status, 'aborted');
  await room.command(host, 'reopen', { runId });
  const reopened = (await room.state()).run;
  assert.notEqual(reopened.id, runId);
  assert.equal(reopened.count, 0);
  assert.deepEqual(await room.answer(student, body), original);
  await room.command(host, 'lock', { runId: reopened.id });
  await room.command(host, 'reveal', { runId: reopened.id });
  const empty = (await room.state()).run;
  assert.equal(empty.count, 0);
  assert.deepEqual(empty.counts, { 'single-ring': 0, 'linked-rings': 0, 'separate-rings': 0 });
  const activeRun = await openDemo(room, host, 'live-stages-cut');
  const identity = (await client.request('health')).databaseId;
  await client.close();

  const restored = await mkdtemp(path.join(tmpdir(), 'unit4-restored-'));
  t.after(async () => {
    await client.close();
    await rm(restored, { recursive: true, force: true });
  });
  await cp(path.join(dataDir, 'classroom.sqlite'), path.join(restored, 'classroom.sqlite'));
  client = await start({ dataDir: restored, readOnly: true });
  assert.equal((await client.request('health')).databaseId, identity);
  assert.equal((await client.request('health')).readOnly, true);
  const restoredRoom = roomApi(client, code);
  assert.equal((await restoredRoom.state()).run.id, activeRun);
  assert.equal((await restoredRoom.state()).readOnly, true);
  const denied = await restoredRoom.answer(student, { requestId: requestId(), runId: activeRun, value: 'same-reading' }, null);
  assert.ok(denied.status >= 400 && denied.status < 500, JSON.stringify(denied));
});

test('a room pins the demo version through a compatible release', { timeout: 20_000 }, async t => {
  const { start, dataDir } = await fixture(t);
  let client = await start();
  const old = await createRoom(client, { lessonId: 'one-surface' });
  const original = (await roomApi(client, old.code).state()).lesson;
  await client.close();

  const release = path.join(dataDir, 'release');
  const moduleDir = path.join(release, 'unit4');
  await cp(new URL('./', import.meta.url), moduleDir, { recursive: true });
  const bundleDir = path.join(moduleDir, 'public', 'demos', 'one-surface');
  await cp(path.join(bundleDir, 'v1'), path.join(bundleDir, 'v2'), { recursive: true });
  const manifestFile = path.join(bundleDir, 'v2', 'manifest.json');
  const updated = JSON.parse(await readFile(manifestFile, 'utf8'));
  updated[0].title += '（新版）';
  await writeFile(manifestFile, JSON.stringify(updated));
  const { createClassroomServer: updatedFactory } = await import(pathToFileURL(path.join(moduleDir, 'server.mjs')).href);
  client = await start({}, updatedFactory);
  assert.deepEqual((await roomApi(client, old.code).state()).lesson, original);
  const fresh = await createRoom(client, { lessonId: 'one-surface' });
  const freshRoom = roomApi(client, fresh.code);
  assert.equal((await freshRoom.state()).lesson.version, '2.0.0');
  const oldRoom = roomApi(client, old.code);
  await openDemo(oldRoom, old.token, 'ribbon-cut');
  await openDemo(freshRoom, fresh.token, 'ribbon-cut');
  const oldStep = (await oldRoom.state()).step;
  const freshStep = (await freshRoom.state()).step;
  assert.match(oldStep.config.demoUrl, /\/v1\//);
  assert.match(freshStep.config.demoUrl, /\/v2\//);
  assert.equal(freshStep.title, updated[0].title);
  assert.equal((await fetch(client.origin + oldStep.config.demoUrl, { method: 'HEAD' })).status, 200);
});

test('hosts can jump across suites, with stale actions and wrong demo results rejected', { timeout: 20_000 }, async t => {
  const { start } = await fixture(t);
  const client = await start();
  const { code, token: host } = await createRoom(client);
  const room = roomApi(client, code);
  const student = secret();
  await room.join(student);
  const selection = { stepId: 'live-stages-orbit', expectedStep: null, expectedRun: null, requestId: requestId() };
  const opened = await room.command(host, 'select-demo', selection);
  assert.deepEqual(await room.command(host, 'select-demo', selection), opened);
  const runId = opened.runId;
  const other = { stepId: 'interaction-atlas-refraction', expectedStep: selection.stepId, expectedRun: runId };
  await room.command(host, 'select-demo', other, 409);
  await room.answer(student, { requestId: requestId(), runId, value: 'single-ring' }, 400);
  await room.answer(student, { requestId: requestId(), runId, value: 'ellipse' });
  await room.command(host, 'lock', { runId });
  assert.equal((await room.state()).run.counts, undefined);
  await room.command(host, 'reveal', { runId });
  assert.equal((await room.state()).run.counts.ellipse, 1);
  await room.command(host, 'select-demo', { ...other, expectedRun: null }, 409);
  const next = await room.command(host, 'select-demo', other);
  assert.notEqual(next.runId, runId);
  assert.equal((await room.state(student)).step.id, other.stepId);
  await room.command(host, 'abort', { runId: next.runId });
  await room.command(host, 'finish', { expectedStep: other.stepId, expectedRun: next.runId });
  assert.equal((await room.state()).finished, true);
});

test('numbered seats, paper eligibility, and published draw survive recovery', { timeout: 20_000 }, async t => {
  const { start } = await fixture(t);
  let client = await start();
  const { code, token: host } = await createRoom(client, { lottery: true });
  let room = roomApi(client, code);
  await room.join(secret(), undefined, 403);
  const student = secret();
  const firstKey = secret();
  const issue = { seatKey: firstKey, requestId: requestId() };
  const { number } = await room.command(host, 'issue-seat', issue);
  assert.equal((await room.command(host, 'issue-seat', issue)).number, number);
  assert.deepEqual(await room.join(student, firstKey), { number });
  await room.join(secret(), firstKey, 403);
  const paperOnly = (await room.command(host, 'issue-seat', { seatKey: secret() })).number;
  await room.command(host, 'issue-seat', { seatKey: secret() });
  const runId = await openDemo(room, host);
  const body = { requestId: requestId(), runId, value: 'linked-rings' };
  const receipt = await room.answer(student, body);
  const newKey = secret();
  await room.command(host, 'transfer-seat', { number, seatKey: newKey });
  await room.state(student, 401);
  const newStudent = secret();
  assert.deepEqual(await room.join(newStudent, newKey), { number });
  assert.deepEqual(await room.answer(newStudent, body), receipt);
  await room.command(host, 'lock', { runId });
  await room.command(host, 'paper-tally', { runId, counts: { 'single-ring': 15, 'linked-rings': 0 } });
  assert.equal((await room.state()).run.count, 1);
  assert.equal((await room.state()).run.paperCounts, undefined);
  await room.command(host, 'reveal', { runId });
  assert.deepEqual((await room.state()).run.paperCounts, { 'single-ring': 15, 'linked-rings': 0, 'separate-rings': 0 });
  await room.command(host, 'paper-credit', { number });
  assert.equal((await room.state(host)).lottery.eligibleCount, 1);
  await room.command(host, 'paper-credit', { number: paperOnly });
  const revealed = (await room.state()).run;
  assert.equal(revealed.count, 1);
  assert.equal(revealed.paperCounts['single-ring'], 15);
  await room.command(host, 'finish', { expectedStep: 'one-surface-ribbon-cut', expectedRun: runId });
  assert.equal((await room.command(host, 'freeze-draw')).eligibleCount, 2);
  await room.command(host, 'paper-credit', { number: paperOnly }, 409);
  const draw = { count: 2, requestId: requestId() };
  const winner = await room.command(host, 'draw', draw);
  assert.deepEqual(new Set(winner.winners), new Set([number, paperOnly]));
  await client.close();
  client = await start();
  room = roomApi(client, code);
  assert.deepEqual((await room.state()).lottery.winners, winner.winners);
  assert.deepEqual(await room.command(host, 'draw', draw), winner);
  assert.deepEqual((await room.command(host, 'draw', { count: 1 })).winners, winner.winners);
});
