import { cache, randomHex, request, roomFeed } from './connection.js';
import { escape, hostEntry, inviteOrigin, joinEntry, landing, live, preview, roomCode } from './view.js';

const main = document.querySelector('#main');
const notice = document.querySelector('#notice');
const connection = document.querySelector('#connection');
const params = new URLSearchParams(location.search);
const requestedMode = params.get('mode');
const requestedCode = roomCode(params.get('room'));
const view = ['host', 'screen', 'preview'].includes(requestedMode) ? requestedMode : requestedCode ? 'student' : 'home';
const freshHost = view === 'host' && params.get('new') === '1';
let code = requestedCode || (view === 'host' && !freshHost ? cache.get('host.last') : '');
let token = code ? cache.get(credentialKey()) : null;
let seat = new URLSearchParams(location.hash.slice(1)).get('seat') || '';
let state;
let feed;
let busy = false;
let expired = false;
let failure;
let needsSeat = Boolean(seat);
let lessons = [];
let previewLesson;
let previewStep;
let origins = [];
let choice = '';
let receipt = null;
let pendingAnswer = null;
let pendingCommand = null;
let seatShare = null;
let retryAt = 0;
let renderKey;
let qrCache;
let addressOverride;

document.body.dataset.view = view;
document.querySelector('#role-label').textContent =
  ({ host: '主持台', student: '学生端', screen: '投影', preview: '独立试玩' })[view] || '';

function credentialKey() {
  return `credential.${view}.${code}`;
}

function roomCache(field) {
  return `${field}.${code}`;
}

function roomPath(route) {
  return 'rooms/' + encodeURIComponent(code) + '/' + route;
}

function link(query, origin = location.origin) {
  return new URL('/?' + new URLSearchParams(query), origin).href;
}

function accessOrigin() {
  const override = view === 'host' ? addressOverride : params.get('invite');
  return inviteOrigin(override) || location.origin;
}

function setNotice(message = '', level = '') {
  notice.hidden = !message;
  notice.textContent = message;
  notice.dataset.level = level;
}

function connectionLabel(message, error = false) {
  if (connection.textContent !== message) connection.textContent = message;
  connection.dataset.level = error ? 'error' : '';
}

function remember(key, value) {
  if (!cache.set(key, value)) {
    setNotice('浏览器存储不可用。请保持此页打开，主持可下载凭证备份。', 'error');
  }
}

function updateUrl(query) {
  history.replaceState(null, '', '/?' + new URLSearchParams(query));
}

function replaceContent(html) {
  const currentFrame = main.querySelector('[data-demo-key]');
  if (!currentFrame) {
    main.innerHTML = html;
    return;
  }
  const template = document.createElement('template');
  template.innerHTML = html;
  const newFrame = template.content.querySelector('[data-demo-key]');
  if (currentFrame.dataset.demoKey !== newFrame?.dataset.demoKey) {
    main.replaceChildren(template.content);
    return;
  }
  // Removing or moving an iframe reloads its document. Keep its ancestors mounted
  // and update the siblings that contain progress, receipts, and host controls.
  let current = currentFrame;
  let replacement = newFrame;
  while (current !== main) {
    const siblings = Array.from(replacement.parentNode.childNodes);
    const index = siblings.indexOf(replacement);
    while (current.previousSibling) current.previousSibling.remove();
    while (current.nextSibling) current.nextSibling.remove();
    current.before(...siblings.slice(0, index));
    current.after(...siblings.slice(index + 1));
    current = current.parentNode;
    replacement = replacement.parentNode;
  }
}

function replace(html) {
  if (html === renderKey) return;
  renderKey = html;
  const active = document.activeElement;
  const focusId = main.contains(active) ? active.id : null;
  const caret = focusId && active.selectionStart != null ? [active.selectionStart, active.selectionEnd] : null;
  const drafts = Array.from(main.querySelectorAll('[data-edited][id]'), (element) =>
    [element.id, element.type === 'checkbox' ? element.checked : element.value]);
  const details = Array.from(main.querySelectorAll('details[open][id]'), (element) => element.id);
  replaceContent(html);
  for (const [id, value] of drafts) {
    const element = document.getElementById(id);
    if (!element) continue;
    if (element.type === 'checkbox') element.checked = value;
    else if (element.tagName !== 'SELECT' || Array.from(element.options).some((option) => option.value === value)) {
      element.value = value;
    }
    element.dataset.edited = '';
  }
  for (const id of details) {
    const element = document.getElementById(id);
    if (element) element.open = true;
  }
  const next = focusId && document.getElementById(focusId);
  if (next && next !== active && !next.disabled) {
    next.focus({ preventScroll: true });
    if (caret) next.setSelectionRange(...caret);
  }
  for (const qr of main.querySelectorAll('[data-qr]')) {
    if (!window.qrcode) continue;
    try {
      if (qrCache?.link !== qr.dataset.qr) {
        const generator = window.qrcode(0, 'M');
        generator.addData(qr.dataset.qr);
        generator.make();
        qrCache = { link: qr.dataset.qr, svg: generator.createSvgTag({ cellSize: 4, margin: 16, scalable: true }) };
      }
      qr.innerHTML = qrCache.svg;
    } catch {
      qr.hidden = true;
    }
  }
}

function render() {
  if (view === 'home' || (view === 'screen' && !code)) return replace(landing());
  if (view === 'preview') return replace(preview({ lessons, lesson: previewLesson, step: previewStep, choice }));
  if (view === 'host' && (!code || !token || expired)) {
    return replace(hostEntry({ lessons, busy, code, pending: cache.get('create') || createAttempt }));
  }
  if (view === 'student' && (!token || expired) && (state || expired)) {
    return replace(joinEntry({ code, needsSeat, seat, busy, expired }));
  }
  if (!state) {
    return replace(`<section class="panel narrow">
      <h1>房间 ${escape(code)}</h1>
      <p>${failure ? escape(failure.message) : '正在连接课堂…'}</p>
      ${failure ? '<button type="button" class="secondary" data-refresh>重新连接</button><a href="/">返回课堂首页</a>' : ''}
    </section>`);
  }
  const origin = accessOrigin();
  const invite = link({ room: code }, origin);
  const screen = link({ mode: 'screen', room: code, invite: origin });
  const seatInvite = seatShare && {
    number: seatShare.number,
    url: invite + '#seat=' + encodeURIComponent(seatShare.seatKey)
  };
  return replace(live({
    state, view, invite, screen, origins, busy, choice, seatInvite, pendingCommand,
    offerSeatSwitch: view === 'student' && Boolean(token && seat),
    receipt: !state.readOnly && receipt?.runId === state.run?.id ? receipt : null,
    pending: pendingAnswer
  }));
}

function acceptState(next) {
  const recovering = Boolean(failure);
  failure = null;
  if (token && next.role !== view) {
    connectionLabel('凭证失效', true);
    expireCredential();
    return;
  }
  const rolledBack = state && next.revision < state.revision;
  if (rolledBack || state?.run?.id !== next.run?.id) choice = '';
  if (rolledBack) {
    receipt = null;
    setNotice();
  }
  if (view === 'student' && !token) needsSeat = next.lottery.enabled || Boolean(seat);
  const confirmed = next.participant?.receipt;
  if (pendingAnswer && confirmed?.requestId === pendingAnswer.requestId && confirmed.runId === pendingAnswer.runId) {
    receipt = confirmed;
    clearAnswer();
    setNotice('已收到你的成品。');
  }
  if (recovering || !state || next.revision !== state.revision || next.readOnly !== state.readOnly || next.role !== state.role) {
    state = next;
    render();
  }
  if (pendingAnswer && token && !next.readOnly && !busy && Date.now() >= retryAt) {
    queueMicrotask(() => {
      if (pendingAnswer && !busy && !expired) sendAnswer();
    });
  }
}

function expireCredential() {
  expired = true;
  feed?.close();
  if (view === 'student') {
    cache.remove(credentialKey());
    cache.remove(roomCache('join'));
    clearAnswer();
    token = null;
    needsSeat = true;
  }
  render();
}

function startFeed() {
  feed?.close();
  connectionLabel('正在连接');
  feed = roomFeed({
    code, token,
    onState: acceptState,
    onStatus(message, error) {
      if (expired) return;
      connectionLabel(message, Boolean(error));
      if (token && error?.status === 401) {
        connectionLabel('凭证失效', true);
        expireCredential();
        return;
      }
      if (error) {
        const changed = error.message !== failure?.message;
        failure = error;
        if (changed) render();
      }
    }
  });
}

function attach(nextCode, nextToken) {
  feed?.close();
  code = nextCode;
  token = nextToken;
  expired = false;
  state = null;
  failure = null;
  choice = '';
  receipt = null;
  retryAt = 0;
  pendingAnswer = view === 'student' ? cache.get(roomCache('answer')) : null;
  pendingCommand = view === 'host' ? cache.get(roomCache('command')) : null;
  seatShare = view === 'host' ? cache.get(roomCache('seat-share')) : null;
  addressOverride = view === 'host' ? cache.get(roomCache('address')) : null;
  if (nextToken) remember(credentialKey(), nextToken);
  if (view === 'host') {
    remember('host.last', nextCode);
    updateUrl({ mode: 'host', room: nextCode });
  }
  startFeed();
  render();
}

function terminal(error) {
  return error.status >= 400 && error.status < 500 && ![408, 429].includes(error.status);
}

async function perform(action) {
  if (busy) return;
  busy = true;
  setNotice();
  render();
  try {
    await action();
  } catch (error) {
    setNotice(error.message, 'error');
  } finally {
    busy = false;
    render();
  }
}

let createAttempt = cache.get('create');

async function createRoom(fields) {
  await perform(async () => {
    if (!createAttempt) {
      createAttempt = { token: randomHex(32), lessonId: fields.get('lessonId'), lottery: fields.has('lottery') };
      remember('create', createAttempt);
    }
    try {
      const result = await request('rooms', { data: createAttempt });
      attach(result.code, createAttempt.token);
    } catch (error) {
      if (!terminal(error)) throw new Error('开房结果待确认。请重试开房。');
      cache.remove('create');
      createAttempt = null;
      throw error;
    }
    cache.remove('create');
    createAttempt = null;
  });
}

async function restoreRoom(fields) {
  const nextCode = roomCode(fields.get('code'));
  const nextToken = String(fields.get('token')).trim();
  if (!nextCode || !/^[0-9a-f]{64}$/.test(nextToken)) {
    return setNotice('请输入有效的房间码和主持凭证。', 'error');
  }
  await perform(async () => {
    const next = await request('rooms/' + encodeURIComponent(nextCode) + '/state', { token: nextToken });
    if (next.role !== 'host') throw new Error('这条凭证不能打开主持台。');
    attach(nextCode, nextToken);
  });
}

let joinAttempt;

async function joinRoom(seatKey = seat) {
  seat = String(seatKey || '').trim();
  await perform(async () => {
    joinAttempt ||= cache.get(roomCache('join'));
    if (joinAttempt?.seatKey !== (seat || undefined)) joinAttempt = null;
    joinAttempt ||= { token: randomHex(32), ...(seat ? { seatKey: seat } : {}) };
    remember(roomCache('join'), joinAttempt);
    try {
      await request(roomPath('join'), { data: joinAttempt });
      if (token !== joinAttempt.token) clearAnswer();
      attach(code, joinAttempt.token);
      updateUrl({ room: code });
      seat = '';
    } catch (error) {
      if (error.code === 'SEAT_REQUIRED') needsSeat = true;
      if (!terminal(error)) throw new Error('入场结果待确认。请再按一次加入课堂。');
      cache.remove(roomCache('join'));
      joinAttempt = null;
      throw error;
    }
    cache.remove(roomCache('join'));
    joinAttempt = null;
  });
}

function clearAnswer() {
  cache.remove(roomCache('answer'));
  pendingAnswer = null;
}

async function sendAnswer() {
  if (!pendingAnswer) return;
  const data = pendingAnswer;
  retryAt = Date.now() + 7000;
  await perform(async () => {
    let requestError;
    try {
      receipt = await request(roomPath('answers'), { token, data });
      clearAnswer();
      setNotice('已收到你的成品。');
    } catch (error) {
      requestError = error;
    }
    if (feed) await feed.refresh();
    if (!requestError || (receipt?.requestId === data.requestId && receipt.runId === data.runId)) return;
    if (!terminal(requestError)) throw new Error('还未确认收到这份答卷。连接恢复后会再次核对。');
    if (requestError.code !== 'READ_ONLY') clearAnswer();
    throw requestError;
  });
}

function submitAnswer() {
  if (busy || pendingAnswer || state.run?.status !== 'open' || !choice || state.readOnly) return;
  if (state.step?.module === 'demo@1' && activeDemoFrame()?.contentWindow.Unit4Demo?.result !== choice) return;
  if (!state.step?.config?.options?.some(({ id }) => id === choice)) return;
  pendingAnswer = { requestId: randomHex(16), runId: state.run.id, value: choice };
  remember(roomCache('answer'), pendingAnswer);
  sendAnswer();
}

async function command(action, fields = {}) {
  if (busy || (!pendingCommand && !action)) return;
  await perform(async () => {
    if (!pendingCommand) {
      pendingCommand = { action, requestId: randomHex(16), ...fields };
      remember(roomCache('command'), pendingCommand);
      render();
    }
    const data = pendingCommand;
    try {
      const result = await request(roomPath('commands'), { token, data });
      if (['issue-seat', 'transfer-seat'].includes(data.action)) {
        seatShare = { number: result.number, seatKey: data.seatKey };
        remember(roomCache('seat-share'), seatShare);
        document.getElementById('seat-invite')?.removeAttribute('data-edited');
        setNotice('专属入场链接已生成。');
      } else {
        setNotice('已完成主持操作。');
      }
    } catch (error) {
      if (!terminal(error)) throw new Error('主持操作待确认。请重试原操作。');
      if (error.code === 'READ_ONLY') throw error;
      pendingCommand = null;
      cache.remove(roomCache('command'));
      throw error;
    } finally {
      if (feed) await feed.refresh();
    }
    pendingCommand = null;
    cache.remove(roomCache('command'));
  });
}

function exportHost() {
  const blob = new Blob([JSON.stringify({ code, token }, null, 2) + '\n'], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `Unit4_Host_${code}.json`;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
  setNotice('已生成主持凭证备份，请私下保存。');
}

async function copy(id) {
  const input = document.getElementById(id);
  try {
    await navigator.clipboard.writeText(input.value);
    setNotice('已复制链接。');
  } catch {
    input.focus();
    input.select();
    setNotice('已选中链接，请使用浏览器的复制功能。');
  }
}

main.addEventListener('input', (event) => {
  if (event.target.id && !event.target.readOnly) event.target.dataset.edited = '';
});

main.addEventListener('load', (event) => {
  const frame = event.target;
  if (frame.matches?.('iframe[data-demo-key]')) {
    frame.contentWindow.postMessage({ type: 'unit4-demo-ready' }, location.origin);
  }
}, true);

function activeDemoFrame() {
  const frame = document.getElementById('demo-frame');
  if (!frame) return null;
  try {
    const expected = new URL(frame.src);
    const active = frame.contentWindow.location;
    if (active.pathname === expected.pathname && active.search === expected.search && (!expected.hash || active.hash === expected.hash)) return frame;
  } catch {
    // The frame may have followed an external link.
  }
  return null;
}

window.addEventListener('message', (event) => {
  if (event.origin !== location.origin) return;
  const frame = activeDemoFrame();
  if (!frame || event.source !== frame.contentWindow) return;
  if (event.data?.type === 'unit4-demo-height' && Number.isFinite(event.data.height)) {
    frame.style.height = Math.ceil(Math.max(260, Math.min(event.data.height + 2, 3200))) + 'px';
    return;
  }
  if (event.data?.type !== 'unit4-demo-result') return;
  const step = view === 'preview' ? previewStep : state?.step;
  if (step?.module !== 'demo@1') return;
  const value = event.data.value;
  if (value !== frame.contentWindow.Unit4Demo?.result) return;
  if (value !== null && !step.config.options.some(({ id }) => id === value)) return;
  const next = value ?? '';
  if (choice !== next) {
    choice = next;
    render();
  }
});

function openPreviewStep(id) {
  const next = previewLesson?.steps.find((step) => step.id === id);
  if (!next || previewStep === next) return;
  previewStep = next;
  choice = '';
  render();
}

main.addEventListener('submit', (event) => {
  event.preventDefault();
  if (busy) return;
  const form = event.target;
  const fields = new FormData(form);
  switch (form.dataset.form) {
    case 'find': {
      const nextCode = roomCode(fields.get('code'));
      if (!nextCode) return setNotice('请输入六位房间码。', 'error');
      location.assign(link({ room: nextCode }));
      break;
    }
    case 'create': createRoom(fields); break;
    case 'restore': restoreRoom(fields); break;
    case 'join': joinRoom(fields.get('seatKey') || seat); break;
    case 'preview-step': openPreviewStep(fields.get('stepId')); break;
    case 'select-demo':
      command('select-demo', {
        stepId: fields.get('stepId'),
        expectedStep: state.step?.id ?? null,
        expectedRun: state.run?.id ?? null
      });
      break;
    case 'address': {
      const origin = inviteOrigin(fields.get('address'));
      if (!origin) return setNotice('请输入有效的 HTTP 或 HTTPS 地址。', 'error');
      addressOverride = origin;
      remember(roomCache('address'), origin);
      document.getElementById('address')?.removeAttribute('data-edited');
      render();
      setNotice('入场链接和二维码已更新。');
      break;
    }
    case 'paper-tally':
      command('paper-tally', {
        runId: form.dataset.run, counts: Object.fromEntries(Array.from(fields, ([id, value]) => [id, Number(value)]))
      });
      break;
    case 'transfer-seat': command('transfer-seat', { number: Number(fields.get('number')), seatKey: randomHex(32) }); break;
    case 'paper-credit': command('paper-credit', { number: Number(fields.get('number')) }); break;
    case 'draw': command('draw', { count: Number(fields.get('count')) }); break;
  }
});

main.addEventListener('click', (event) => {
  const button = event.target.closest('button');
  if (!button || button.disabled) return;
  const data = button.dataset;
  if ('choice' in data) {
    choice = data.choice;
    render();
  } else if ('submit' in data) submitAnswer();
  else if ('switchSeat' in data && !pendingAnswer) joinRoom();
  else if ('keepSeat' in data) {
    seat = '';
    updateUrl({ room: code });
    render();
  }
  else if ('retryAnswer' in data) sendAnswer();
  else if ('retryCommand' in data) command();
  else if ('action' in data) {
    const fields = {};
    if (data.action === 'issue-seat') fields.seatKey = randomHex(32);
    if (data.run) fields.runId = data.run;
    if (['advance', 'skip'].includes(data.action)) fields.stepId = data.step || null;
    if (data.action === 'finish') {
      fields.expectedStep = state.step?.id ?? null;
      fields.expectedRun = state.run?.id ?? null;
    }
    command(data.action, fields);
  } else if ('copy' in data) copy(data.copy);
  else if ('refresh' in data) feed?.refresh();
  else if ('export' in data) exportHost();
  else if ('previewStep' in data) openPreviewStep(data.previewStep);
});

async function boot() {
  render();
  if (code && (token || view === 'student' || view === 'screen')) attach(code, token);
  if (view !== 'host' && view !== 'preview') return;
  try {
    lessons = await request('lessons');
    render();
    if (view === 'preview') {
      const selected = lessons.find(({ id }) => id === params.get('lesson')) || lessons[0];
      if (selected) {
        previewLesson = await request('lessons/' + encodeURIComponent(selected.id));
        previewStep = previewLesson.steps.find(({ type }) => type === 'activity') || previewLesson.steps[0];
        render();
      }
    } else {
      ({ origins } = await request('network'));
      render();
    }
  } catch (error) {
    setNotice(error.message, 'error');
  }
}

boot();
