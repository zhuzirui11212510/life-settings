import { createHash, randomInt, randomUUID } from 'node:crypto';
import { defaultLessonId, getLesson, summarizeAnswers, validateAnswer, viewStep } from './lessons.mjs';
import { openClassroomDatabase } from './schema.mjs';

const ROOM_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
const TOKEN = /^[a-f0-9]{64}$/;
const REQUEST_ID = /^(?:[a-f0-9]{32}|[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12})$/;

function fail(status, code, message) {
  throw Object.assign(new Error(message), { status, code });
}

function digest(value) {
  return createHash('sha256').update(value).digest('hex');
}

function requireSecret(value, label) {
  if (typeof value !== 'string' || !TOKEN.test(value)) {
    fail(400, 'INVALID_CREDENTIAL', `${label}无效。`);
  }
  return digest(value);
}

function requireRequestId(value) {
  if (typeof value !== 'string' || !REQUEST_ID.test(value)) {
    fail(400, 'INVALID_REQUEST_ID', '请求编号无效。');
  }
}

function requireNumber(value) {
  if (!Number.isSafeInteger(value) || value < 1) {
    fail(400, 'INVALID_NUMBER', '参与编号无效。');
  }
}

function roomCode() {
  return Array.from({ length: 6 }, () => ROOM_ALPHABET[randomInt(ROOM_ALPHABET.length)]).join('');
}

function encode(value) {
  return JSON.stringify(value);
}

function decode(value) {
  return value == null ? null : JSON.parse(value);
}

function commandDigest(body) {
  const { requestId, ...command } = body;
  const fields = Object.keys(command).sort().map(key => {
    const value = command[key];
    if (value === null || typeof value === 'string' || typeof value === 'boolean' || Number.isFinite(value)) {
      return [key, value];
    }
    if (key === 'counts' && value && typeof value === 'object' && !Array.isArray(value) &&
        Object.values(value).every(Number.isFinite)) {
      return [key, Object.keys(value).sort().map(id => [id, value[id]])];
    }
    fail(400, 'INVALID_COMMAND', '课堂指令的参数格式无效。');
  });
  return digest(encode(fields));
}

function countMap(result) {
  return Object.fromEntries(result.choices.map(({ id, count }) => [id, count]));
}

function receipt(row) {
  return row ? { runId: row.run, requestId: row.request_id, value: row.value, receivedAt: row.received_at } : null;
}

export function createStore({ databasePath, readOnly = false }) {
  const { db, schemaVersion, databaseId } = openClassroomDatabase(databasePath, readOnly);
  const statements = new Map();

  function statement(sql) {
    if (!statements.has(sql)) statements.set(sql, db.prepare(sql));
    return statements.get(sql);
  }
  const get = (sql, ...args) => statement(sql).get(...args);
  const all = (sql, ...args) => statement(sql).all(...args);
  const write = (sql, ...args) => statement(sql).run(...args);

  function transaction(work, writable = false) {
    if (writable && readOnly) fail(409, 'READ_ONLY', '当前课堂数据仅供核对。');
    db.exec(writable ? 'BEGIN IMMEDIATE' : 'BEGIN');
    try {
      const value = work();
      db.exec('COMMIT');
      return value;
    } catch (error) {
      if (db.isTransaction) db.exec('ROLLBACK');
      throw error;
    }
  }

  function roomFor(code) {
    const room = typeof code === 'string' && get('SELECT * FROM rooms WHERE code = ?', code.toUpperCase());
    if (!room) fail(404, 'ROOM_NOT_FOUND', '没有找到该课堂。');
    return room;
  }

  function authorize(room, token, expectedRole) {
    let session = { role: 'screen' };
    if (token !== undefined) {
      if (typeof token !== 'string' || !TOKEN.test(token)) {
        fail(401, 'INVALID_CREDENTIAL', '课堂凭证无效。');
      }
      const hash = digest(token);
      if (hash === room.host_hash) {
        session = { role: 'host' };
      } else {
        const participant = get('SELECT number FROM participants WHERE room = ? AND token_hash = ?', room.code, hash);
        if (!participant) fail(401, 'INVALID_CREDENTIAL', '课堂凭证无效或已被收回。');
        session = { role: 'student', number: participant.number };
      }
    }
    if (expectedRole && expectedRole !== session.role) {
      fail(403, 'FORBIDDEN', '当前身份无法执行这项操作。');
    }
    return session;
  }

  function bump(code) {
    return get('UPDATE rooms SET revision = revision + 1 WHERE code = ? RETURNING revision', code).revision;
  }

  function createRoom({ lessonId = defaultLessonId, lottery = false, token }) {
    const hostHash = requireSecret(token, '主持凭证');
    if (typeof lessonId !== 'string' || typeof lottery !== 'boolean') {
      fail(400, 'INVALID_ROOM', '教案或抽奖设置无效。');
    }
    return transaction(() => {
      const existing = get('SELECT code, lesson, lottery FROM rooms WHERE host_hash = ?', hostHash);
      if (existing) {
        if (decode(existing.lesson).id !== lessonId || Boolean(existing.lottery) !== lottery) {
          fail(409, 'CREATE_CONFLICT', '该主持凭证已用于另一个设置不同的课堂。');
        }
        return { code: existing.code };
      }
      const lesson = getLesson(lessonId);
      if (!lesson) fail(404, 'LESSON_NOT_FOUND', '没有找到该教案。');
      for (let attempt = 0; attempt < 10; attempt += 1) {
        const code = roomCode();
        const result = write(
          'INSERT INTO rooms (code, host_hash, lesson, lottery, created_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(code) DO NOTHING',
          code, hostHash, encode(lesson), Number(lottery), Date.now()
        );
        if (result.changes) return { code };
      }
      fail(503, 'ROOM_CODE_UNAVAILABLE', '未能生成房间码，请重试。');
    }, true);
  }

  function reserveCredential(code, kind, hash) {
    const result = write(
      'INSERT INTO participant_credentials (room, kind, digest) VALUES (?, ?, ?) ON CONFLICT DO NOTHING',
      code, kind, hash
    );
    if (!result.changes) fail(409, 'CREDENTIAL_ALREADY_USED', '该课堂凭证已被使用。');
  }

  function addParticipant(code, tokenHash = null, seatHash = null) {
    return get(`
      INSERT INTO participants (room, number, token_hash, seat_hash)
      SELECT ?, coalesce(max(number), 0) + 1, ?, ? FROM participants WHERE room = ?
      RETURNING number
    `, code, tokenHash, seatHash, code).number;
  }

  function join(code, { token, seatKey }) {
    const tokenHash = requireSecret(token, '学生凭证');
    const seatHash = seatKey === undefined ? null : requireSecret(seatKey, '参与码');
    return transaction(() => {
      const room = roomFor(code);
      if (tokenHash === room.host_hash) fail(403, 'FORBIDDEN', '请从主持台进入该课堂。');
      const existing = get('SELECT number, seat_hash FROM participants WHERE room = ? AND token_hash = ?', room.code, tokenHash);
      if (existing) {
        if (seatHash && seatHash !== existing.seat_hash) {
          fail(409, 'JOIN_CONFLICT', '该凭证已用于另一参与编号，请使用新参与链接入场。');
        }
        return { number: existing.number };
      }

      let number;
      if (seatHash) {
        const participant = get('SELECT number, token_hash FROM participants WHERE room = ? AND seat_hash = ?', room.code, seatHash);
        if (!participant || participant.token_hash) {
          fail(403, 'SEAT_UNAVAILABLE', '参与码无效或已领取，请联系主持。');
        }
        reserveCredential(room.code, 'student', tokenHash);
        number = participant.number;
        write('UPDATE participants SET token_hash = ? WHERE room = ? AND number = ?', tokenHash, room.code, number);
      } else {
        if (room.lottery) fail(403, 'SEAT_REQUIRED', '请向主持领取个人参与码。');
        if (room.finished) fail(409, 'ROOM_FINISHED', '本场课堂已结束。');
        reserveCredential(room.code, 'student', tokenHash);
        number = addParticipant(room.code, tokenHash);
      }
      bump(room.code);
      return { number };
    }, true);
  }

  function findRun(code, runId) {
    return runId == null ? null : get('SELECT * FROM runs WHERE room = ? AND id = ?', code, runId);
  }

  function answerCount(run) {
    return get('SELECT count(*) AS count FROM answers WHERE room = ? AND run = ?', run.room, run.id).count;
  }

  function summarizeRun(run, step) {
    const answers = all('SELECT value FROM answers WHERE room = ? AND run = ?', run.room, run.id);
    return summarizeAnswers(step, answers.map(answer => answer.value));
  }

  function runView(run, step, role) {
    let snapshot = decode(run.snapshot);
    if (role === 'host' && !snapshot) snapshot = summarizeRun(run, step);
    const result = { id: run.id, stepId: step.id, status: run.status, count: snapshot?.count ?? answerCount(run) };
    if (role === 'host' || run.status === 'revealed') result.counts = countMap(snapshot);
    if (run.paper_counts && (role === 'host' || run.status === 'revealed')) {
      result.paperCounts = decode(run.paper_counts);
    }
    return result;
  }

  function rosterFor(code) {
    return all(`
      SELECT p.number, p.token_hash IS NOT NULL AS claimed,
        p.paper_credited_at IS NOT NULL OR EXISTS (
          SELECT 1 FROM answers a WHERE a.room = p.room AND a.participant = p.number
        ) AS eligible
      FROM participants p WHERE p.room = ? ORDER BY p.number
    `, code).map(row => ({ number: row.number, claimed: Boolean(row.claimed), eligible: Boolean(row.eligible) }));
  }

  function nextStepSummary(step) {
    return step ? { id: step.id, type: step.type, title: step.title } : null;
  }

  function state(code, token) {
    return transaction(() => {
      const room = roomFor(code);
      const { role, number } = authorize(room, token);
      const lesson = decode(room.lesson);
      const activeStep = lesson.steps[room.step_index];
      const activeRun = findRun(room.code, room.active_run);
      const step = activeStep ? viewStep(activeStep, { role, phase: activeRun?.status }) : null;
      if (step?.type === 'discussion') {
        const binding = decode(room.discussion);
        step.discussion = binding?.online ?? null;
        if (binding?.paper) step.paperDiscussion = binding.paper;
      }
      const lottery = {
        enabled: Boolean(room.lottery),
        frozen: room.frozen_pool !== null,
        winners: decode(room.winners) ?? [],
      };
      const result = {
        code: room.code,
        role,
        revision: room.revision,
        readOnly,
        finished: Boolean(room.finished),
        lesson: { id: lesson.id, version: lesson.version, title: lesson.title },
        step,
        nextStep: nextStepSummary(lesson.steps[room.next_index]),
        run: activeRun ? runView(activeRun, activeStep, role) : null,
        participant: null,
        lottery,
      };
      if (role === 'student') {
        const answer = activeRun && get('SELECT * FROM answers WHERE room = ? AND run = ? AND participant = ?',
          room.code, activeRun.id, number);
        result.participant = { number, receipt: receipt(answer) };
      }
      if (role === 'host') {
        result.demoSteps = lesson.steps.filter(step => step.module === 'demo@1').map(({ id, title }) => ({ id, title }));
        result.roster = rosterFor(room.code);
        lottery.eligibleCount = decode(room.frozen_pool)?.length ?? result.roster.filter(seat => seat.eligible).length;
        result.runs = all('SELECT * FROM runs WHERE room = ? ORDER BY step_index, attempt', room.code)
          .map(run => run.id === activeRun?.id ? result.run : runView(run, lesson.steps[run.step_index], role));
      }
      return result;
    });
  }

  function watch(code, token) {
    return transaction(() => {
      const room = roomFor(code);
      return { role: authorize(room, token).role, revision: room.revision };
    });
  }

  function submit(code, token, { requestId, runId, value }) {
    requireRequestId(requestId);
    if (typeof runId !== 'string' || typeof value !== 'string') {
      fail(400, 'INVALID_ANSWER', '请提交本轮活动编号和一个答案。');
    }
    return transaction(() => {
      const room = roomFor(code);
      const { number } = authorize(room, token, 'student');
      const existing = get('SELECT * FROM answers WHERE room = ? AND run = ? AND participant = ?', room.code, runId, number);
      if (existing?.request_id === requestId) {
        if (existing.value !== value) fail(409, 'REQUEST_CONFLICT', '该请求编号已用于提交另一份答案。');
        return receipt(existing);
      }
      const run = findRun(room.code, runId);
      if (!run) fail(404, 'RUN_NOT_FOUND', '没有找到该轮活动。');
      if (room.active_run !== runId || run.status !== 'open') fail(409, 'RUN_CLOSED', '本轮已停止收答。');
      if (existing) fail(409, 'ANSWER_FINAL', '本轮的最终答案已确认。');
      const validated = validateAnswer(decode(room.lesson).steps[run.step_index], value);
      const row = get(`
        INSERT INTO answers (room, run, participant, request_id, value, received_at)
        VALUES (?, ?, ?, ?, ?, ?) RETURNING *
      `, room.code, runId, number, requestId, validated, Date.now());
      bump(room.code);
      return receipt(row);
    }, true);
  }

  function startRun(code, stepIndex) {
    const { attempt } = get('SELECT coalesce(max(attempt), 0) + 1 AS attempt FROM runs WHERE room = ? AND step_index = ?',
      code, stepIndex);
    const runId = randomUUID();
    write('INSERT INTO runs (room, id, step_index, attempt, status, opened_at) VALUES (?, ?, ?, ?, ?, ?)',
      code, runId, stepIndex, attempt, 'open', Date.now());
    return runId;
  }

  function discussionBinding(room, step, lesson) {
    const sourceIndex = lesson.steps.findIndex(item => item.id === step.sourceStepId);
    const source = get('SELECT * FROM runs WHERE room = ? AND step_index = ? ORDER BY attempt DESC LIMIT 1',
      room.code, sourceIndex);
    if (!source) return null;
    const online = source.status === 'revealed' ? decode(source.snapshot) : null;
    const paper = decode(source.paper_counts);
    return {
      online: online ? { sourceRunId: source.id, ...online, counts: countMap(online) } : null,
      paper: paper ? {
        sourceRunId: source.id,
        count: Object.values(paper).reduce((sum, count) => sum + count, 0),
        choices: lesson.steps[sourceIndex].config.options.map(({ id, label }) => ({ id, label, count: paper[id] })),
      } : null,
    };
  }

  function finishRoom(code) {
    write('UPDATE rooms SET step_index = NULL, active_run = NULL, discussion = NULL, finished = 1 WHERE code = ?', code);
    return {};
  }

  function enterStep(room, lesson, index) {
    const step = lesson.steps[index];
    const runId = step.type === 'activity' ? startRun(room.code, index) : null;
    const binding = step.type === 'discussion' ? discussionBinding(room, step, lesson) : null;
    write(`
      UPDATE rooms SET step_index = ?, next_index = ?, active_run = ?, discussion = ?
      WHERE code = ?
    `, index, index + 1, runId, binding ? encode(binding) : null, room.code);
    // Keep the selected source in the receipt after the current step moves on.
    return step.type === 'discussion' ? { stepId: step.id, runId, binding } : { stepId: step.id, runId };
  }

  function moveStep(room, lesson, run, { action, stepId, expectedStep, expectedRun }) {
    if (room.finished || run?.status === 'open') {
      fail(409, 'INVALID_PHASE', '请先结束当前活动，再切换环节。');
    }
    if (action === 'select-demo' || action === 'finish') {
      if (expectedStep !== (lesson.steps[room.step_index]?.id ?? null) || expectedRun !== (run?.id ?? null)) {
        fail(409, 'STALE_STEP', '课堂环节已变化，请刷新主持台。');
      }
      if (action === 'finish') return finishRoom(room.code);
      const index = lesson.steps.findIndex(step => step.id === stepId && step.module === 'demo@1');
      if (index < 0) fail(400, 'DEMO_NOT_FOUND', '请选择本场的互动作品。');
      return enterStep(room, lesson, index);
    }
    const next = lesson.steps[room.next_index];
    if (stepId !== (next?.id ?? null)) fail(409, 'STALE_STEP', '课堂环节已变化，请刷新主持台。');
    if (action === 'skip') {
      if (!next) fail(409, 'INVALID_PHASE', '当前没有可跳过的环节。');
      write('UPDATE rooms SET next_index = next_index + 1 WHERE code = ?', room.code);
      return { stepId };
    }
    return next ? enterStep(room, lesson, room.next_index) : finishRoom(room.code);
  }

  function changeRun(room, lesson, run, { action, runId }) {
    if (!run || run.id !== runId) fail(409, 'STALE_RUN', '活动轮次已变化，请刷新主持台。');
    if (action === 'reopen' && run.status !== 'open') {
      const newRunId = startRun(room.code, run.step_index);
      write('UPDATE rooms SET active_run = ? WHERE code = ?', newRunId, room.code);
      return { runId: newRunId };
    }
    if (action === 'reveal' && run.status === 'locked') {
      write("UPDATE runs SET status = 'revealed', revealed_at = ? WHERE room = ? AND id = ?", Date.now(), room.code, run.id);
      return { runId };
    }
    if ((action === 'lock' && run.status === 'open') ||
        (action === 'abort' && (run.status === 'open' || run.status === 'locked'))) {
      const snapshot = run.snapshot ?? encode(summarizeRun(run, lesson.steps[run.step_index]));
      const status = action === 'lock' ? 'locked' : 'aborted';
      write('UPDATE runs SET status = ?, snapshot = ?, closed_at = coalesce(closed_at, ?) WHERE room = ? AND id = ?',
        status, snapshot, Date.now(), room.code, run.id);
      return { runId };
    }
    fail(409, 'INVALID_PHASE', '当前活动阶段无法执行这项操作。');
  }

  function requireUnfrozen(room) {
    if (room.frozen_pool !== null) fail(409, 'DRAW_FROZEN', '抽奖票池已冻结。');
  }

  function paperTally(room, lesson, { runId, counts }) {
    requireUnfrozen(room);
    if (typeof runId !== 'string') fail(400, 'INVALID_PAPER_TALLY', '请选择纸面汇总对应的活动轮次。');
    const run = findRun(room.code, runId);
    if (!run) fail(404, 'RUN_NOT_FOUND', '没有找到该轮活动。');
    if (run.status === 'open') fail(409, 'INVALID_PHASE', '请结束线上收答后再记录纸面汇总。');
    if (run.paper_counts) fail(409, 'PAPER_TALLY_EXISTS', '该轮已记录纸面汇总。');
    const ids = lesson.steps[run.step_index].config.options.map(option => option.id);
    if (!counts || typeof counts !== 'object' || Array.isArray(counts) ||
        Object.entries(counts).some(([id, count]) => !ids.includes(id) || !Number.isSafeInteger(count) || count < 0) ||
        !Number.isSafeInteger(Object.values(counts).reduce((sum, count) => sum + count, 0))) {
      fail(400, 'INVALID_PAPER_TALLY', '请为每个纸面选项填写非负整数。');
    }
    const tally = Object.fromEntries(ids.map(id => [id, Object.hasOwn(counts, id) ? counts[id] : 0]));
    write('UPDATE runs SET paper_counts = ? WHERE room = ? AND id = ?', encode(tally), room.code, runId);
    return { runId };
  }

  function paperCredit(room, number) {
    requireUnfrozen(room);
    requireNumber(number);
    const result = write(`
      UPDATE participants SET paper_credited_at = coalesce(paper_credited_at, ?) WHERE room = ? AND number = ?
    `, Date.now(), room.code, number);
    if (!result.changes) fail(404, 'PARTICIPANT_NOT_FOUND', '没有找到该参与编号。');
    return { number };
  }

  function issueSeat(room, seatKey) {
    requireUnfrozen(room);
    const hash = requireSecret(seatKey, '参与码');
    reserveCredential(room.code, 'seat', hash);
    return { number: addParticipant(room.code, null, hash) };
  }

  function transferSeat(room, { number, seatKey }) {
    requireNumber(number);
    const hash = requireSecret(seatKey, '参与码');
    reserveCredential(room.code, 'seat', hash);
    const result = write('UPDATE participants SET token_hash = NULL, seat_hash = ? WHERE room = ? AND number = ?',
      hash, room.code, number);
    if (!result.changes) fail(404, 'PARTICIPANT_NOT_FOUND', '没有找到该参与编号。');
    return { number };
  }

  function freezeDraw(room) {
    if (!room.lottery) fail(409, 'LOTTERY_DISABLED', '本场未启用抽奖。');
    requireUnfrozen(room);
    if (!room.finished) fail(409, 'INVALID_PHASE', '请结束课堂后再冻结抽奖票池。');
    const pool = rosterFor(room.code).filter(seat => seat.eligible).map(seat => seat.number);
    if (!pool.length) fail(409, 'EMPTY_DRAW_POOL', '当前没有符合抽奖资格的参与编号。');
    write('UPDATE rooms SET frozen_pool = ? WHERE code = ?', encode(pool), room.code);
    return { eligibleCount: pool.length };
  }

  function draw(room, count) {
    if (!Number.isSafeInteger(count) || count < 1) {
      fail(400, 'INVALID_DRAW_COUNT', '请填写正整数中奖名额。');
    }
    if (!room.lottery) fail(409, 'LOTTERY_DISABLED', '本场未启用抽奖。');
    if (room.winners !== null) return { winners: decode(room.winners) };
    const pool = decode(room.frozen_pool);
    if (!pool) fail(409, 'DRAW_NOT_FROZEN', '请先冻结抽奖票池。');
    if (count > pool.length) fail(400, 'INVALID_DRAW_COUNT', '中奖名额超过符合资格的参与人数。');
    const winners = [];
    for (let i = 0; i < count; i += 1) {
      const index = randomInt(pool.length);
      winners.push(pool[index]);
      const last = pool.pop();
      if (index < pool.length) pool[index] = last;
    }
    write('UPDATE rooms SET winners = ? WHERE code = ?', encode(winners), room.code);
    return { winners };
  }

  function command(code, token, body) {
    const { requestId, action } = body;
    requireRequestId(requestId);
    return transaction(() => {
      const room = roomFor(code);
      authorize(room, token, 'host');
      const fingerprint = commandDigest(body);
      const existing = get('SELECT digest, receipt FROM command_receipts WHERE room = ? AND request_id = ?', room.code, requestId);
      if (existing) {
        if (existing.digest !== fingerprint) fail(409, 'REQUEST_CONFLICT', '该请求编号已用于另一项课堂操作。');
        return decode(existing.receipt);
      }

      const lesson = decode(room.lesson);
      const run = findRun(room.code, room.active_run);
      let result;
      switch (action) {
        case 'advance':
        case 'finish':
        case 'select-demo':
        case 'skip': result = moveStep(room, lesson, run, body); break;
        case 'lock':
        case 'reveal':
        case 'abort':
        case 'reopen': result = changeRun(room, lesson, run, body); break;
        case 'paper-tally': result = paperTally(room, lesson, body); break;
        case 'paper-credit': result = paperCredit(room, body.number); break;
        case 'issue-seat': result = issueSeat(room, body.seatKey); break;
        case 'transfer-seat': result = transferSeat(room, body); break;
        case 'freeze-draw': result = freezeDraw(room); break;
        case 'draw': result = draw(room, body.count); break;
        default: fail(400, 'INVALID_COMMAND', '课堂指令无效。');
      }
      const revision = action === 'draw' && room.winners !== null ? room.revision : bump(room.code);
      const confirmed = { ...result, revision };
      write('INSERT INTO command_receipts (room, request_id, digest, receipt) VALUES (?, ?, ?, ?)',
        room.code, requestId, fingerprint, encode(confirmed));
      return confirmed;
    }, true);
  }

  function health() {
    return { schemaVersion, databaseId, readOnly };
  }

  return { createRoom, join, state, submit, command, watch, health, close: () => db.close() };
}
