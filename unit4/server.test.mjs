import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { once } from 'node:events';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
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

async function openBook(room, host) {
  let intro = await room.state(host);
  if (intro.step === null) {
    await room.command(host, 'advance', { stepId: 'intro' });
    intro = await room.state(host);
  }
  assert.equal(intro.step.id, 'intro');
  assert.equal(intro.nextStep.id, 'book-review');
  await room.command(host, 'advance', { stepId: 'book-review' });
  const opened = await room.state(host);
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
  await room.command(student, 'advance', { stepId: 'book-review' }, 403);

  const other = await createRoom(client);
  await roomApi(client, other.code).state(student, 401);
  const preview = await client.request('lessons/reading-2');
  assert.ok(preview.steps.some(step => step.type === 'activity'));
  assert.doesNotMatch(JSON.stringify(preview), /"(?:teacher|answer|correctOptionId)":/);
  for (const url of ['/unit4/lessons/reading-2.json', '/store.mjs', '/classroom.sqlite', '/.git/config']) {
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

  const runId = await openBook(room, host);
  const answer = { requestId: requestId(), runId, value: 'care' };
  const original = await room.answer(student, answer);
  assert.equal(original.requestId, answer.requestId);
  assert.equal((await room.state(student)).participant.receipt.value, 'care');
  await room.answer(student, { ...answer, requestId: requestId(), value: 'action' }, 409);
  assert.equal((await room.state()).run.counts, undefined);
  await room.command(host, 'reveal', { runId }, 409);
  const lock = { runId, requestId: requestId() };
  const locked = await room.command(host, 'lock', lock);
  const lockedRevision = (await room.state(host)).revision;
  assert.deepEqual(await room.answer(student, answer), original);
  await room.answer(student, { ...answer, value: 'action' }, 409);
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
  await room.command(host, 'advance', { stepId: 'discussion' });
  const discussion = await room.state();
  assert.equal(discussion.step.id, 'discussion');
  assert.ok(discussion.step.discussion);
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
  const runId = await openBook(room, host);
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

  const attempts = students.map((token, i) => ({ token, body: { requestId: requestId(), runId, value: i % 2 ? 'care' : 'action' } }));
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
  await room.answer(neverSubmitted, { requestId: requestId(), runId, value: 'care' }, 409);
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
  await skipRoom.command(skipped.token, 'advance', { stepId: 'intro' });
  await skipRoom.command(skipped.token, 'skip', { stepId: 'book-review' });
  await skipRoom.command(skipped.token, 'advance', { stepId: 'discussion' });
  const fallback = (await skipRoom.state()).step;
  assert.equal(fallback.discussion, null);
  assert.ok(fallback.fallback);

  const { code, token: host } = await createRoom(client);
  const room = roomApi(client, code);
  const runId = await openBook(room, host);
  const student = secret();
  await room.join(student);
  const body = { requestId: requestId(), runId, value: 'care' };
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
  await room.command(host, 'advance', { stepId: 'discussion' });
  const empty = (await room.state()).step.discussion;
  assert.equal(empty.count, 0);
  assert.equal(empty.sourceRunId, reopened.id);
  await room.command(host, 'advance', { stepId: 'exit-ticket' });
  const activeRun = (await room.state()).run.id;
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
  const denied = await restoredRoom.answer(student, { requestId: requestId(), runId: activeRun, value: 'reviews' }, null);
  assert.ok(denied.status >= 400 && denied.status < 500, JSON.stringify(denied));
});

test('a room pins the published lesson through a compatible release', { timeout: 20_000 }, async t => {
  const { start, dataDir } = await fixture(t);
  let client = await start();
  const old = await createRoom(client);
  const original = (await roomApi(client, old.code).state()).lesson;
  await client.close();

  const release = path.join(dataDir, 'release');
  const moduleDir = path.join(release, 'unit4');
  await cp(new URL('./', import.meta.url), moduleDir, { recursive: true });
  const lessonFile = path.join(moduleDir, 'lessons', 'reading-2.json');
  const updated = JSON.parse(await readFile(lessonFile, 'utf8'));
  updated.title = 'Reading 2 · revised';
  updated.version = '1.0.1';
  await writeFile(lessonFile, JSON.stringify(updated));
  const { createClassroomServer: updatedFactory } = await import(pathToFileURL(path.join(moduleDir, 'server.mjs')).href);
  client = await start({}, updatedFactory);
  assert.deepEqual((await roomApi(client, old.code).state()).lesson, original);
  const fresh = await createRoom(client);
  assert.equal((await roomApi(client, fresh.code).state()).lesson.title, updated.title);
  const oldRoom = roomApi(client, old.code);
  assert.ok(await openBook(oldRoom, old.token));
});

test('another lesson inserts a briefing and binds a different activity without new room logic', { timeout: 20_000 }, async t => {
  const { start } = await fixture(t);
  const client = await start();
  const { code, token: host } = await createRoom(client, { lessonId: 'reading-2-workshop' });
  const room = roomApi(client, code);
  const student = secret();
  await room.join(student);
  for (const stepId of ['workshop-intro', 'fictional-desk', 'choose-evidence']) {
    await room.command(host, 'advance', { stepId });
    assert.equal((await room.state(student)).step.id, stepId);
  }
  const { run, step } = await room.state(student);
  assert.equal(step.answer, undefined);
  await room.answer(student, { requestId: requestId(), runId: run.id, value: 'care' }, 400);
  await room.answer(student, { requestId: requestId(), runId: run.id, value: 'wording' });
  await room.command(host, 'lock', { runId: run.id });
  assert.equal((await room.state()).step.answer, undefined);
  await room.command(host, 'reveal', { runId: run.id });
  assert.equal((await room.state()).step.answer.correctOptionId, 'wording');
  await room.command(host, 'advance', { stepId: 'workshop-discussion' });
  assert.equal((await room.state()).step.discussion.sourceRunId, run.id);
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
  const runId = await openBook(room, host);
  const body = { requestId: requestId(), runId, value: 'action' };
  const receipt = await room.answer(student, body);
  const newKey = secret();
  await room.command(host, 'transfer-seat', { number, seatKey: newKey });
  await room.state(student, 401);
  const newStudent = secret();
  assert.deepEqual(await room.join(newStudent, newKey), { number });
  assert.deepEqual(await room.answer(newStudent, body), receipt);
  await room.command(host, 'lock', { runId });
  await room.command(host, 'paper-tally', { runId, counts: { care: 15, action: 0 } });
  assert.equal((await room.state()).run.count, 1);
  assert.equal((await room.state()).run.paperCounts, undefined);
  await room.command(host, 'reveal', { runId });
  assert.deepEqual((await room.state()).run.paperCounts, { care: 15, action: 0 });
  await room.command(host, 'paper-credit', { number });
  assert.equal((await room.state(host)).lottery.eligibleCount, 1);
  await room.command(host, 'paper-credit', { number: paperOnly });
  await room.command(host, 'advance', { stepId: 'discussion' });
  const discussion = (await room.state()).step;
  assert.equal(discussion.discussion.count, 1);
  assert.equal(discussion.paperDiscussion.count, 15);
  await room.command(host, 'skip', { stepId: 'exit-ticket' });
  await room.command(host, 'advance', { stepId: null });
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
