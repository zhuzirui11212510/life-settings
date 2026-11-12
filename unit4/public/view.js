export function escape(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
}

const h = escape;
const phases = { open: '正在收答', locked: '已锁定', revealed: '已揭晓', aborted: '线上已中止' };
const disable = (value) => value ? ' disabled' : '';
const numberLabel = (value) => '#' + String(value).padStart(3, '0');

export function roomCode(value) {
  const code = String(value ?? '').trim().toUpperCase();
  return /^[A-Z0-9]{6}$/.test(code) ? code : '';
}

export function inviteOrigin(value) {
  try {
    const url = new URL(value);
    return /^https?:$/.test(url.protocol) && !url.username && !url.password ? url.origin : '';
  } catch {
    return '';
  }
}

function heading(title, line = '') {
  return `<header class="page-head"><h1>${h(title)}</h1>${line ? `<p class="quiet">${h(line)}</p>` : ''}</header>`;
}

export function landing() {
  return `<section class="intro stack">
    <h1>书评里，<br>谁被看见了？</h1>
    <p class="copy">读同一段材料，做一张自己的书评头版。全班揭晓后，再讨论样本能支持怎样的判断。</p>
    <form data-form="find" class="row">
      <label for="find-room">房间码</label>
      <input class="field-short" id="find-room" name="code" autocomplete="off" autocapitalize="characters" maxlength="6" required>
      <button type="submit">进入课堂</button>
    </form>
    <nav class="row" aria-label="其他课堂入口">
      <a href="/?mode=host">主持台</a>
      <a href="/?mode=preview">独立试玩</a>
    </nav>
  </section>`;
}

export function hostEntry({ lessons, busy, pending, code }) {
  return `<section class="narrow stack">${heading('主持台', code ? '创建或恢复一间课堂。' : '选定教案后开房，再把学生入口发给全班。')}
    <form class="panel" data-form="create">
      ${pending ? `<p>上一条开房请求待确认。重试会找回同一间课堂。</p>
        <button type="submit"${disable(busy)}>重试开房</button>` : `
        <label class="field-wide">教案
          <select id="lesson" name="lessonId" required${disable(busy)}>
            ${lessons.map((lesson) => `<option value="${h(lesson.id)}">${h(lesson.title)} (${h(lesson.version)})</option>`).join('')}
          </select>
        </label>
        <label class="check-label"><input type="checkbox" id="lottery" name="lottery"${disable(busy)}> 启用个人编号与抽奖</label>
        <p class="quiet compact">启用后需为每人发放一条专属入场链接，换设备时可由主持重新发放。</p>
        <button type="submit"${disable(busy || !lessons.length)}>创建课堂</button>`}
    </form>
    <form class="panel" data-form="restore">
      <h2>用凭证恢复主持台</h2>
      <label class="field-short">房间码
        <input id="restore-code" name="code" maxlength="6" value="${h(code)}" autocomplete="off" required>
      </label>
      <label class="field-wide">主持凭证
        <input id="restore-token" name="token" type="password" autocomplete="off" maxlength="64" required>
      </label>
      <button type="submit" class="secondary"${disable(busy)}>恢复主持台</button>
    </form>
  </section>`;
}

export function joinEntry({ code, needsSeat, seat, busy, expired }) {
  return `<section class="narrow stack">${heading('加入课堂', '房间 ' + code)}
    <form class="panel" data-form="join">
      ${expired ? '<p>原凭证已失效。请联系主持核对编号并领取新的入场链接。</p>' : ''}
      <p>${needsSeat ? '使用主持单独发给你的入场链接，或输入其中的入场凭证。' : '加入后，主持发起活动时会自动显示题面。'}</p>
      ${needsSeat || seat ? `<label class="field-wide">个人入场凭证
        <input id="seat" name="seatKey" type="password" maxlength="64" value="${h(seat)}" autocomplete="off" required>
      </label>` : ''}
      <button type="submit"${disable(busy)}>加入课堂</button>
    </form>
    <a href="/">换一个房间</a>
  </section>`;
}

export function invitePanel({ code, invite, screen, origins = [], edit = false }) {
  const loopback = /^(localhost|127\.|\[::1\])/.test(new URL(invite).hostname);
  return `<section class="panel">
    <h2>学生入场</h2>
    <div class="invite">
      <figure class="qr" data-qr="${h(invite)}" role="img" aria-label="学生入场二维码"></figure>
      <div class="stack"><p class="room-code">${h(code)}</p>${edit ? `<a href="${h(screen)}" target="_blank" rel="noopener">打开投影</a>` : ''}</div>
      ${edit ? `<input id="invite-url" type="text" readonly value="${h(invite)}" aria-label="学生入场链接">`
        : `<a href="${h(invite)}" target="_blank" rel="noopener">打开学生入口</a>`}
      ${edit ? `<button type="button" class="secondary" data-copy="invite-url">复制链接</button>
        <details id="invite-settings">
          <summary>更改学生访问地址</summary>
          <form data-form="address">
            ${loopback ? '<p class="quiet compact">手机请使用主讲电脑在同一网络中的地址。</p>' : ''}
            <label class="field-wide">课堂服务器地址
              <input id="address" name="address" type="url" list="addresses" value="${h(new URL(invite).origin)}" required>
            </label>
            <datalist id="addresses">${origins.map((origin) => `<option value="${h(origin)}"></option>`).join('')}</datalist>
            <button class="secondary" type="submit">更新入场码</button>
          </form>
        </details>` : ''}
    </div>
  </section>`;
}

function copyBlock(config = {}) {
  return `${config.body ? `<p class="copy">${h(config.body)}</p>` : ''}
    ${config.prompt ? `<p class="prompt" lang="en">${h(config.prompt)}</p>` : ''}`;
}

function results(title, choices, count) {
  if (!choices?.length) return '';
  return `<section class="stack">
    <div class="row space-between"><h2>${h(title)}</h2><span>${count} 份</span></div>
    ${count === 0 ? '<p class="quiet">本轮收到 0 份结果。</p>' : ''}
    <dl class="result-list">${choices.map(({ label, headline, count: optionCount }) => `
      <div><dt>${h(label)}${headline ? `<small lang="en">${h(headline)}</small>` : ''}</dt><dd>${optionCount}</dd>
        ${count ? `<meter min="0" max="${count}" value="${optionCount}" aria-label="${h(label)}"></meter>` : ''}
      </div>`).join('')}</dl>
  </section>`;
}

function fromCounts(options, counts) {
  return (options || []).map(({ id, label, artifact }) => ({ label, headline: artifact?.title, count: counts[id] || 0 }));
}

function paperResults(options, counts) {
  if (!counts) return '';
  const choices = fromCounts(options, counts);
  return results('纸面统计', choices, choices.reduce((sum, choice) => sum + choice.count, 0));
}

function artifact(option) {
  if (!option?.artifact) return '';
  return `<figure class="artifact" lang="en">
    <blockquote>${h(option.artifact.title)}</blockquote>
    <figcaption>${h(option.artifact.body)}</figcaption>
  </figure>`;
}

function activityView(step, { view, run, receipt, choice, pending, busy, readOnly }) {
  const options = step.config?.options || [];
  const selected = receipt?.value ?? (pending && pending.runId === run?.id ? pending.value : choice);
  const selectable = view === 'preview' || (view === 'student' && run?.status === 'open' && !readOnly && !receipt && !pending);
  const option = options.find(({ id }) => id === selected);
  const answer = step.answer;
  const correct = options.find(({ id }) => id === answer?.correctOptionId);
  const question = `${copyBlock(step.config)}
    <ul class="choices">${options.map(({ id, label }) => `<li>
      ${selectable ? `<button type="button" id="choice-${h(id)}" class="choice" lang="en" data-choice="${h(id)}"
        aria-pressed="${id === selected}"${disable(busy)}>${h(label)}</button>` : `<span lang="en">${id === selected ? '● ' : '○ '}${h(label)}</span>`}
    </li>`).join('')}</ul>
    ${view === 'student' || view === 'preview' ? artifact(option) : ''}
    ${view === 'student' && receipt ? '<p class="receipt" role="status">已收到你的成品。</p>' : ''}
    ${selectable && view === 'student' ? `<button type="button" id="submit-answer" data-submit${disable(busy || !option)}>提交最终选择</button>
      <small>提交前可以试其他选项。每轮只收一份最终选择。</small>` : ''}`;
  const outcome = `${run?.status === 'revealed' && run.counts ? results('线上结果', fromCounts(options, run.counts), run.count) : ''}
    ${paperResults(options, run?.paperCounts)}
    ${answer?.explanation || correct ? `<section class="stack">
      <h2>揭晓讲解</h2>${correct ? `<p lang="en">${h(correct.label)}</p>` : ''}
      ${answer?.explanation ? `<p>${h(answer.explanation)}</p>` : ''}
    </section>` : ''}`;
  return view === 'screen' && run?.status === 'revealed'
    ? `${outcome}<details id="revealed-question"><summary>查看原题</summary><div class="stack">${question}</div></details>`
    : question + outcome;
}

function stepView(step, context) {
  if (!step) return '<p>等同学入场后，主持会开启本课的第一环节。</p>';
  if (step.type === 'activity') return activityView(step, context);
  if (step.type === 'briefing') return copyBlock(step.config);
  const online = step.discussion;
  const paper = step.paperDiscussion;
  return `${copyBlock(online?.count ? step.config : { prompt: step.config.prompt })}
    ${online ? results('本课线上结果', online.choices, online.count) : ''}
    ${!online?.count ? `<section class="stack"><h2>${online ? '示范讨论' : '备用讨论'}</h2><p>${h(step.fallback)}</p></section>` : ''}
    ${paper ? results('本课纸面统计', paper.choices, paper.count) : ''}`;
}

const actions = {
  advance: '开始下一环节', skip: '跳过下一环节', lock: '锁定作答', reveal: '揭晓结果', abort: '中止线上轮次',
  reopen: '重新开放新一轮', 'freeze-draw': '冻结抽奖名单'
};

function actionButton(action, { runId, stepId, label = actions[action], secondary = false, disabled = false } = {}) {
  return `<button id="action-${action}" type="button" data-action="${action}"
    ${runId ? `data-run="${h(runId)}"` : ''}${stepId ? `data-step="${h(stepId)}"` : ''}
    ${secondary ? 'class="secondary"' : ''}${disable(disabled)}>${h(label)}</button>`;
}

function hostControls(state, disabled) {
  const { step, run, nextStep, finished } = state;
  const phase = run?.status;
  return `<section class="panel">
    <h2>课堂控制</h2>
    ${nextStep ? `<p class="compact">下一环节 <strong>${h(nextStep.title)}</strong></p>` : ''}
    <div class="actions">
      ${phase === 'open' ? actionButton('lock', { runId: run.id, disabled }) : ''}
      ${phase === 'open' || phase === 'locked' ? actionButton('abort', { runId: run.id, disabled, secondary: true }) : ''}
      ${phase === 'locked' ? actionButton('reveal', { runId: run.id, disabled }) : ''}
      ${phase && phase !== 'open' && !finished ? actionButton('reopen', { runId: run.id, disabled, secondary: true }) : ''}
      ${!finished && phase !== 'open' ? actionButton('advance', {
        stepId: nextStep?.id,
        label: !nextStep ? '结束教案' : !step ? '开始上课' : actions.advance,
        disabled
      }) : ''}
      ${!finished && nextStep && phase !== 'open' ? actionButton('skip', {
        stepId: nextStep.id, secondary: true, disabled
      }) : ''}
    </div>
    ${step?.teacher?.note || step?.teacher?.explanation ? `<details id="teacher-notes">
      <summary>教师提示</summary><div class="stack">
        ${step.teacher.note ? `<p>${h(step.teacher.note)}</p>` : ''}
        ${step.teacher.explanation ? `<p>${h(step.teacher.explanation)}</p>` : ''}
      </div>
    </details>` : ''}
    ${phase && phase !== 'open' && !run.paperCounts && step?.config?.options ? `<details id="paper-${h(run.id)}">
      <summary>另记纸面统计</summary>
      <form data-form="paper-tally" data-run="${h(run.id)}">
        <p class="quiet compact">按纸面实际收到的份数填写。纸面统计单独展示。</p>
        <div class="count-fields">${step.config.options.map(({ id, label }) => `
          <label><span>${h(label)}</span>
            <input id="paper-${h(run.id)}-${h(id)}" type="number" min="0" max="999" name="${h(id)}" value="0" required>
          </label>`).join('')}</div>
        <button type="submit" class="secondary"${disable(disabled)}>保存纸面统计</button>
      </form>
    </details>` : ''}
    ${state.runs?.length ? `<details id="run-history"><summary>查看本场轮次</summary>
      <ol class="roster">${state.runs.map((entry) => `<li>
        <code>${h(entry.stepId)}</code><span>${h(phases[entry.status])} · 线上 ${entry.count} 份</span>
      </li>`).join('')}</ol></details>` : ''}
  </section>`;
}

function lotteryControls(state, { disabled, seatInvite }) {
  const { lottery, roster = [], finished } = state;
  const transferOptions = roster.map(({ number }) => `<option value="${number}">${numberLabel(number)}</option>`).join('');
  const paperOptions = roster.filter(({ eligible }) => !eligible)
    .map(({ number }) => `<option value="${number}">${numberLabel(number)}</option>`).join('');
  return `<section class="panel">
    <h2>个人编号与抽奖</h2>
    <p>${roster.length} 个编号 · ${lottery.eligibleCount ?? 0} 人符合资格${lottery.frozen ? ' · 票池已冻结' : ''}</p>
    ${!lottery.frozen && !finished ? actionButton('issue-seat', { label: '生成一个专属入场链接', disabled }) : ''}
    ${seatInvite ? `<label class="field-wide">${numberLabel(seatInvite.number)} 的专属入场链接
      <input id="seat-invite" type="text" readonly value="${h(seatInvite.url)}">
    </label>
    <button class="secondary" data-copy="seat-invite" type="button">复制专属链接</button>
    <p class="quiet compact">请仅发送给该同学。此链接含个人入场凭证。</p>` : ''}
    ${roster.length ? `<details id="roster"><summary>核对个人编号</summary>
      <ul class="roster">${roster.map(({ number, claimed, eligible }) =>
        `<li><strong>${numberLabel(number)}</strong><span>${claimed ? '已入场' : '待入场'}</span><span>${eligible ? '有资格' : '待核对'}</span></li>`).join('')}</ul>
    </details>` : ''}
    ${transferOptions ? `<details id="transfer"><summary>换设备</summary>
      <form data-form="transfer-seat">
        <label>参与编号<select id="transfer-number" name="number" required>${transferOptions}</select></label>
        <p class="quiet compact">确认是同一位同学后重新发放。原设备的凭证会失效。</p>
        <button class="secondary" type="submit"${disable(disabled)}>更新个人入场链接</button>
      </form></details>` : ''}
    ${!lottery.frozen && paperOptions ? `<details id="paper-credit"><summary>补记个人纸面产出</summary>
      <form data-form="paper-credit">
        <label>参与编号<select id="paper-number" name="number" required>${paperOptions}</select></label>
        <button class="secondary" type="submit"${disable(disabled)}>确认个人资格</button>
      </form></details>` : ''}
    ${finished && !lottery.frozen ? actionButton('freeze-draw', { disabled: disabled || !lottery.eligibleCount }) : ''}
    ${lottery.frozen && !lottery.winners?.length && lottery.eligibleCount ? `<form data-form="draw">
      <label>抽取人数<input id="draw-count" name="count" type="number" min="1" max="${lottery.eligibleCount}" value="1" required></label>
      <button type="submit"${disable(disabled)}>公布中奖编号</button>
    </form>` : ''}
  </section>`;
}

export function live(context) {
  const { state, view, invite, screen, pending, pendingCommand, busy, seatInvite, origins, offerSeatSwitch } = context;
  const { step, run, participant, code, lesson, lottery, readOnly, finished } = state;
  const host = view === 'host';
  const receipt = participant?.receipt || context.receipt;
  const headline = finished ? '本场课堂结束' : step?.title || '等待课堂开始';
  const subtitle = [lesson.title, '房间 ' + code, participant ? numberLabel(participant.number) : null].filter(Boolean).join('　');
  const activity = `<section class="panel lesson-panel">
    ${run && !finished ? `<div class="row space-between">
      <span class="phase" data-phase="${h(run.status)}">${h(phases[run.status])}</span><span>线上 ${run.count} 份</span>
    </div>` : ''}
    ${!finished ? stepView(step, { ...context, run, receipt, readOnly }) : '<p>请按主持安排继续讨论或离场。</p>'}
  </section>`;
  const draw = lottery.winners?.length ? `<section class="panel"><h2>中奖编号</h2>
    <p class="room-code">${lottery.winners.map(numberLabel).join('　')}</p></section>` : '';
  const status = `${readOnly ? '<p class="receipt">恢复核对模式。可查看已保存的进度和结果。</p>' : ''}
    ${offerSeatSwitch ? `<section class="panel"><p>此浏览器已有一个参与编号。要使用刚打开的专属链接换编号吗？</p>
      <div class="actions">
        <button data-switch-seat${disable(busy || Boolean(pending) || readOnly)}>使用链接里的编号</button>
        <button class="secondary" data-keep-seat${disable(busy)}>保留当前编号</button>
      </div></section>` : ''}
    ${pending ? `<section class="panel"><p>你有一份答卷待确认。${readOnly ? '' : '重试会沿用原提交。'}</p>
      ${readOnly ? '' : `<button class="secondary" data-retry-answer${disable(busy)}>确认这份提交</button>`}</section>` : ''}
    ${pendingCommand ? `<section class="panel"><p>上一条主持操作待确认。${readOnly ? '' : '请先重试原操作。'}</p>
      ${readOnly ? '' : `<button class="secondary" data-retry-command${disable(busy)}>确认原操作</button>`}</section>` : ''}`;
  return `${heading(headline, subtitle)}
    <div class="${host || view === 'screen' ? 'classroom-grid' : 'narrow'}">
      <div class="stack">${status}${activity}${draw}
        ${host ? `<details id="host-credential"><summary>主持凭证备份</summary>
          <div class="stack">
            <p class="quiet compact">可用房间码和凭证恢复主持台。请仅保存在自己能访问的位置。</p>
            <button class="secondary" type="button" data-export>下载主持凭证</button>
          </div></details>` : ''}
      </div>
      ${host || view === 'screen' ? `<aside class="stack">
        ${invitePanel({ code, invite, screen, origins, edit: host })}
        ${host && !readOnly ? hostControls(state, busy || Boolean(pendingCommand)) : ''}
        ${host && !readOnly && lottery.enabled ? lotteryControls(state, {
          disabled: busy || Boolean(pendingCommand), seatInvite
        }) : ''}
        ${host ? '<a href="/?mode=host&new=1">开另一间课堂</a>' : ''}
      </aside>` : ''}
    </div>`;
}

export function preview({ lessons, lesson, step, choice }) {
  return `<section class="narrow stack">${heading(step?.title || '独立试玩', lesson?.title || '')}
    <nav class="row" aria-label="试玩教案">${lessons.map(({ id, title }) =>
      `<a href="/?mode=preview&lesson=${encodeURIComponent(id)}">${h(title)}</a>`).join('')}</nav>
    ${lesson ? `<nav class="row" aria-label="试玩环节">${lesson.steps.map(({ id, title }) =>
      `<button type="button" class="secondary" data-preview-step="${h(id)}"
        aria-current="${id === step?.id ? 'step' : 'false'}">${h(title)}</button>`).join('')}</nav>` : ''}
    ${step ? `<section class="panel lesson-panel">${stepView(step, { view: 'preview', choice })}</section>` : ''}
  </section>`;
}
