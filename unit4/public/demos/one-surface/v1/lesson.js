(() => {
  "use strict";

  const TAU = 2 * Math.PI;
  const phases = ["build", "trace", "cut"];
  const names = { build: "扭合", trace: "描线", cut: "剪开" };
  const state = {
    mode: "build",
    twists: 1,
    progress: 0,
    cutting: 0,
    offset: 0,
    split: 0,
    highlight: "all",
    showGrid: false,
    showSeam: true,
    playing: false,
    mark: 0,
  };
  const consoleRoot = document.getElementById("lesson-controls");
  const stageRoot = document.getElementById("ribbon-stage");
  if (!consoleRoot || !stageRoot) return;

  consoleRoot.innerHTML = `
    <div class="lab-console">
      <div class="lab-tabs" role="tablist" aria-label="实验步骤">
        ${phases.map((phase, i) => `<button id="lab-tab-${phase}" type="button" role="tab" class="lab-tab" data-mode="${phase}" aria-controls="lab-panel-${phase}" aria-selected="${i === 0}" tabindex="${i === 0 ? "0" : "-1"}"><span>0${i + 1}</span>${names[phase]}</button>`).join("")}
      </div>

      <section class="lab-panel" id="lab-panel-build" role="tabpanel" aria-labelledby="lab-tab-build" data-panel="build">
        <header class="lab-panel-heading">
          <p class="lab-kicker">01 / 接缝</p>
          <h2>把纸头接起来</h2>
          <p>让纸带的一端翻半圈，再合上接缝。看看两端的纸边怎样相接。</p>
        </header>
        <div class="lab-row">
          <span class="lab-label" id="lab-twist-label">半扭次数 <small>每次 180°</small></span>
          <div class="lab-group lab-twists" role="group" aria-labelledby="lab-twist-label">
            ${[0, 1, 2, 3].map(twists => `<button type="button" class="lab-chip" data-twists="${twists}" aria-label="${twists} 次半扭" aria-pressed="${twists === 1}">${twists}</button>`).join("")}
          </div>
        </div>
        <div class="lab-stat" id="lab-join-stat">
          <span>接缝</span><strong id="lab-join"></strong>
        </div>
        <p class="lab-detail" id="lab-join-note"></p>
        <button type="button" class="lab-seam-card" data-guide="true">
          <span class="lab-seam-diagram" data-join-kind="odd" aria-hidden="true">
            <span class="lab-seam-side"><i data-joint="a">A</i><i data-joint="b">B</i></span>
            <span class="lab-seam-links"><i data-joint="a"></i><i data-joint="b"></i></span>
            <span class="lab-seam-side"><i id="lab-seam-top" data-joint="b">A</i><i id="lab-seam-bottom" data-joint="a">B</i></span>
          </span>
          <span class="lab-seam-caption">展开接缝图 <span aria-hidden="true">↗</span></span>
        </button>
        <div class="lab-actions">
          <button type="button" class="lab-primary" data-go="trace">沿着纸带描线 <span aria-hidden="true">↗</span></button>
          <button type="button" class="lab-secondary" id="lab-parity"></button>
        </div>
      </section>

      <section class="lab-panel" id="lab-panel-trace" role="tabpanel" aria-labelledby="lab-tab-trace" data-panel="trace" hidden>
        <header class="lab-panel-heading">
          <p class="lab-kicker">02 / 墨线</p>
          <h2>沿一面一直走</h2>
          <p>从偏离中线的位置出发。绕环一周时，观察笔尖落在起点的哪一侧。</p>
        </header>
        <div class="lab-row">
          <label class="lab-label" for="lab-start">起点方位 <output id="lab-start-value" for="lab-start"></output></label>
          <input class="lab-slider" id="lab-start" type="range" min="0" max="359" value="0">
          <small class="lab-detail" id="lab-mark-hint">也可以直接在纸带上点一个起点。</small>
        </div>
        <div class="lab-row lab-timeline">
          <label class="lab-label" for="lab-trace-progress">描线进度 <output class="lab-readout" id="lab-trace-value" for="lab-trace-progress"></output></label>
          <input class="lab-slider" id="lab-trace-progress" type="range" min="0" max="1000" value="0" step="1">
          <div class="lab-scale">
            <button type="button" class="lab-tick" data-seek="0">起点</button>
            <button type="button" class="lab-tick" id="lab-lap-one" data-seek="first">一周</button>
            <button type="button" class="lab-tick" data-seek="1">返回</button>
          </div>
        </div>
        <p class="lab-feedback" id="lab-trace-feedback" role="status"></p>
        <div class="lab-actions">
          <button type="button" class="lab-primary" id="lab-trace-play" data-play="trace"></button>
          <div class="lab-transport" aria-label="描线控制">
            <button type="button" class="lab-secondary" data-step="trace" title="前进 15°">单步</button>
            <button type="button" class="lab-secondary" data-rewind="trace">清除</button>
            <button type="button" class="lab-secondary" data-speed title="切换描线速度">1×</button>
          </div>
          <button type="button" class="lab-secondary" data-go="cut">试试剪开 <span aria-hidden="true">↗</span></button>
        </div>
      </section>

      <section class="lab-panel" id="lab-panel-cut" role="tabpanel" aria-labelledby="lab-tab-cut" data-panel="cut" hidden>
        <header class="lab-panel-heading">
          <p class="lab-kicker">03 / 剪口</p>
          <h2>剪完还是一条吗？</h2>
          <p>选一条纵向路线，让剪刀沿纸带走到起剪点。</p>
        </header>
        <div id="lab-cut-before">
          <div class="lab-row">
            <span class="lab-label" id="lab-cut-path-label">剪切路线</span>
            <div class="lab-group" role="group" aria-labelledby="lab-cut-path-label">
              <button type="button" class="lab-chip" data-path="center" aria-pressed="true">沿中线</button>
              <button type="button" class="lab-chip" data-path="offset" aria-label="距最近纸边三分之一带宽" aria-pressed="false">距纸边 ⅓</button>
            </div>
          </div>
          <div class="lab-row lab-prediction">
            <span class="lab-label" id="lab-predict-label">先猜会得到几个纸环</span>
            <div class="lab-group" role="group" aria-labelledby="lab-predict-label">
              ${[1, 2, 3].map(count => `<button type="button" class="lab-chip" data-guess="${count}" aria-pressed="false">${count} 个</button>`).join("")}
            </div>
          </div>
        </div>
        <div id="lab-cut-after" hidden>
          <div class="lab-result-card">
            <span id="lab-cut-verdict"></span>
            <strong id="lab-cut-count"></strong>
            <p id="lab-cut-evidence"></p>
            <p id="lab-comparison" class="lab-comparison" hidden></p>
          </div>
          <div id="lab-cut-components" class="lab-row" hidden>
            <span class="lab-label" id="lab-component-label">单看一条</span>
            <div class="lab-group" role="group" aria-labelledby="lab-component-label">
              <button type="button" class="lab-chip" data-highlight="all" aria-pressed="true">全部</button>
              <button type="button" class="lab-chip" data-highlight="a" aria-pressed="false"></button>
              <button type="button" class="lab-chip" data-highlight="b" aria-pressed="false"></button>
            </div>
          </div>
          <label class="lab-label" for="lab-separation">撑开剪缝 <output id="lab-separation-value" for="lab-separation"></output></label>
          <input class="lab-slider" id="lab-separation" type="range" min="0" max="100" value="100">
        </div>
        <div class="lab-row lab-timeline">
          <label class="lab-label" for="lab-cut-progress">剪切进度 <output class="lab-readout" id="lab-cut-value" for="lab-cut-progress"></output></label>
          <input class="lab-slider" id="lab-cut-progress" type="range" min="0" max="1000" value="0" step="1">
        </div>
        <p class="lab-feedback" id="lab-cut-feedback" role="status"></p>
        <div class="lab-actions">
          <button type="button" class="lab-primary" id="lab-cut-play" data-play="cut"></button>
          <div class="lab-transport" aria-label="剪切控制">
            <button type="button" class="lab-secondary" data-step="cut" title="前进 15°">单步</button>
            <button type="button" class="lab-secondary" data-rewind="cut">复原</button>
            <button type="button" class="lab-secondary" data-speed title="切换剪切速度">1×</button>
          </div>
          <button type="button" class="lab-secondary" id="lab-cut-compare" hidden></button>
          <button type="button" class="lab-secondary" id="lab-cut-parity" hidden></button>
        </div>
      </section>
    </div>`;

  const byId = id => document.getElementById(id);
  const all = selector => Array.from(document.querySelectorAll(selector));
  if (byId("lesson-live")) {
    byId("lab-trace-feedback").removeAttribute("role");
    byId("lab-cut-feedback").removeAttribute("role");
  }
  const displayButtons = all("[data-display]");
  const viewButtons = all("[data-view]");
  const motionReduced = window.matchMedia("(prefers-reduced-motion: reduce)");
  const tabs = all(".lab-tab");
  const panels = all(".lab-panel");
  const progressInputs = { trace: byId("lab-trace-progress"), cut: byId("lab-cut-progress") };
  const progressReadouts = { trace: byId("lab-trace-value"), cut: byId("lab-cut-value") };
  const speedValues = [1, 1.5, 0.5];
  const speedText = ["1×", "1.5×", "0.5×"];
  let speedIndex = 0;
  let prediction = null;
  let active = null;
  let currentView = "default";
  let usingFallback = false;
  let frame = 0;
  let lastTime = 0;
  let requestedSeparation = 1;
  let pendingMarkFrame = 0;
  let cutReference = null;
  let publishedOutcome = null;

  const odd = () => state.twists % 2 === 1;
  const offsetCut = () => state.offset > 0;
  const loops = phase => phase === "trace" ? (odd() ? 2 : 1) : (odd() && offsetCut() ? 2 : 1);
  const phaseProgress = phase => phase === "trace" ? state.progress : state.cutting;
  const cutCount = () => odd() && !offsetCut() ? 1 : 2;
  const currentAngle = () => Math.round(state.mark / TAU * 360) % 360;
  const pressed = (elements, predicate) => {
    for (const element of elements) element.setAttribute("aria-pressed", String(predicate(element)));
  };
  const setText = (element, value) => {
    if (element && element.textContent !== value) element.textContent = value;
  };
  const emitCue = type => document.dispatchEvent(new CustomEvent("ribbon:cue", { detail: { type } }));

  function renderSpeed() {
    for (const button of all("[data-speed]")) {
      setText(button, speedText[speedIndex]);
      button.setAttribute("aria-label", `切换速度，当前 ${speedValues[speedIndex]} 倍`);
    }
  }

  function stageState() {
    return {
      ...state,
      progress: state.mode === "trace" ? state.progress : 0,
      cutting: state.mode === "cut" ? state.cutting : 0,
      split: state.mode === "cut" ? state.split : 0,
      highlight: state.mode === "cut" ? state.highlight : "all",
    };
  }

  function drawStage() {
    if (active) active.update(stageState());
  }

  function cutEvidence() {
    if (odd() && !offsetCut()) return "两半在接缝处首尾相接。得到的纸环有两面，沿原纸带绕行两周。";
    if (odd()) return "窄环仍是一面。外环有两面，沿原纸带绕行两周。两个环互相套住。";
    return "每一条剪边都在接缝处接回自己。两个纸环各有两面，各绕原纸带一周。";
  }

  function publishCut() {
    const outcome = state.mode === "cut" && state.cutting >= 1
      ? (odd() ? (offsetCut() ? "linked-rings" : "single-ring") : "separate-rings")
      : null;
    if (outcome === publishedOutcome) return;
    publishedOutcome = outcome;
    if (outcome) window.Unit4Demo?.publish(outcome);
    else window.Unit4Demo?.reset();
  }

  function rememberCut() {
    cutReference = { twists: state.twists, offset: state.offset, count: cutCount() };
  }

  function renderMotion() {
    const phase = state.mode;
    if (phase === "build") return;
    const progress = phaseProgress(phase);
    const degrees = Math.round(progress * 360 * loops(phase));
    const degreesText = `${degrees}° / ${360 * loops(phase)}°`;
    const input = progressInputs[phase];
    input.value = Math.round(progress * 1000);
    input.setAttribute("aria-valuetext", `已绕行 ${degrees} 度，共 ${360 * loops(phase)} 度`);
    setText(progressReadouts[phase], degreesText);
    const meter = byId("lesson-meter");
    if (meter) {
      meter.style.setProperty("--progress", `${Math.round(progress * 100)}%`);
      if (meter.getAttribute("role") === "progressbar") meter.setAttribute("aria-valuenow", String(Math.round(progress * 100)));
    }
  }

  function renderNarration() {
    const phase = state.mode;
    let summary = "";
    let status = "";
    let result = "";
    if (phase === "build") {
      summary = odd() ? "接缝处，纸带两边交叉对接。" : "接缝处，纸带两边各自接回自己。";
      status = `${state.twists} 次半扭 / ${odd() ? "反向接缝" : "同向接缝"}`;
    } else if (phase === "trace") {
      const walked = state.progress;
      if (walked >= 1) {
        summary = odd() ? "第二周结束，笔尖回到起点的同一侧。" : "一周结束，笔尖已回到起点的同一侧。";
        result = odd() ? "墨线贯通整张纸带的一面" : "纸带有两面，墨线只走过其中一面";
      } else if (walked >= 0.5 && odd()) {
        summary = "第一周结束，笔尖来到起点的另一侧。再走一周才会重合。";
      } else {
        summary = walked > 0 ? "笔尖沿着纸带前进。观察它穿过接缝时的位置。" : "纸带上的圆点是起笔位置。拖进度或播放描线。";
      }
      status = "纵向描线 / 起点偏离中线";
      setText(byId("lab-trace-feedback"), summary);
      setText(byId("lab-mark-hint"), walked > 0 ? "清除墨线后，可点纸带另选起点。" : "也可以直接在纸带上点一个起点。");
    } else {
      const done = state.cutting >= 1;
      if (done) {
        summary = cutEvidence();
        result = `${cutCount()} 个纸环`;
      } else if (odd() && offsetCut() && state.cutting >= 0.5) {
        summary = "已经绕了一周，剪刀到了起剪点的另一侧。继续剪到原来的切口。";
      } else if (state.cutting > 0) {
        summary = "沿着选定的路线继续，直到剪口连成一条闭线。";
      } else {
        summary = prediction === null ? "可以先留下预测，再观察剪开后的纸环数。" : `已记下预测：${prediction} 个纸环。`;
      }
      status = offsetCut() ? "偏离中线 / 距纸边 ⅓" : "沿中线 / 宽度对半分";
      setText(byId("lab-cut-feedback"), done ? "" : summary);
    }
    setText(byId("lesson-live"), summary);
    setText(byId("lesson-meta"), status);
    const resultNode = byId("lesson-result");
    if (resultNode) {
      setText(resultNode, result);
      resultNode.hidden = !result;
    }
  }

  function renderCut() {
    const finished = state.cutting >= 1;
    byId("lab-cut-before").hidden = finished;
    byId("lab-cut-after").hidden = !finished;
    byId("lab-cut-compare").hidden = !finished;
    byId("lab-cut-parity").hidden = !finished;
    const count = cutCount();
    byId("lab-cut-components").hidden = count === 1;
    if (!finished) return;
    const verdict = byId("lab-cut-verdict");
    verdict.dataset.tone = prediction === count ? "ok" : "neutral";
    setText(verdict, prediction === null ? "实测" : prediction === count ? "猜中了" : `你猜了 ${prediction} 个`);
    setText(byId("lab-cut-count"), `${count} 个纸环`);
    setText(byId("lab-cut-evidence"), cutEvidence());
    const comparison = byId("lab-comparison");
    const hasComparison = cutReference && (state.twists !== cutReference.twists || state.offset !== cutReference.offset);
    comparison.hidden = !hasComparison;
    if (hasComparison) {
      setText(comparison, `上次 ${cutReference.twists} 次半扭，${cutReference.offset === 0 ? "中线剪" : "偏心剪"}，得到 ${cutReference.count} 个纸环。`);
    }
    setText(consoleRoot.querySelector('[data-highlight="a"]'), odd() ? "窄环" : "纸环 A");
    setText(consoleRoot.querySelector('[data-highlight="b"]'), odd() ? "外环" : "纸环 B");
    setText(byId("lab-cut-compare"), offsetCut() ? "改沿中线剪" : "改从距纸边 ⅓ 剪");
    setText(byId("lab-cut-parity"), odd() ? "换偶数半扭" : "换奇数半扭");
    byId("lab-separation").value = Math.round(requestedSeparation * 100);
    setText(byId("lab-separation-value"), `${Math.round(requestedSeparation * 100)}%`);
  }

  function renderTransport() {
    for (const phase of ["trace", "cut"]) {
      const playing = state.mode === phase && state.playing;
      const progress = phaseProgress(phase);
      const button = byId(`lab-${phase}-play`);
      const name = phase === "trace" ? "描线" : "剪切";
      const action = playing ? "暂停" : progress >= 1 ? (phase === "trace" ? "重描一遍" : "重新剪开") : progress > 0 ? `继续${name}` : (phase === "trace" ? "播放描线" : "剪开纸带");
      if (button.dataset.action !== action) {
        button.dataset.action = action;
        const icon = document.createElement("span");
        icon.className = "lab-icon";
        icon.setAttribute("aria-hidden", "true");
        icon.textContent = playing ? "Ⅱ" : phase === "trace" ? "▶" : "✂";
        button.replaceChildren(document.createTextNode(action), icon);
      }
      button.setAttribute("aria-pressed", String(playing));
      consoleRoot.querySelector(`[data-step="${phase}"]`).disabled = progress >= 1 || playing;
      consoleRoot.querySelector(`[data-rewind="${phase}"]`).disabled = progress === 0 && !playing;
    }
  }

  function renderAll() {
    consoleRoot.dataset.mode = state.mode;
    stageRoot.dataset.mode = state.mode;
    stageRoot.dataset.twists = String(state.twists);
    for (const tab of tabs) {
      const selected = tab.dataset.mode === state.mode;
      tab.setAttribute("aria-selected", String(selected));
      tab.tabIndex = selected ? 0 : -1;
    }
    for (const panel of panels) panel.hidden = panel.dataset.panel !== state.mode;
    pressed(consoleRoot.querySelectorAll("button[data-twists]"), button => Number(button.dataset.twists) === state.twists);
    pressed(all("[data-path]"), button => (button.dataset.path === "offset") === offsetCut());
    pressed(all("[data-guess]"), button => Number(button.dataset.guess) === prediction);
    pressed(all("[data-highlight]"), button => button.dataset.highlight === state.highlight);
    pressed(viewButtons, button => button.dataset.view === currentView);
    pressed(displayButtons, button => Boolean(state[button.dataset.display]));
    setText(byId("lab-join"), odd() ? "反向接合" : "同向接合");
    setText(byId("lab-join-note"), odd() ? "越过接缝，长边 A 接到原来的长边 B。" : "越过接缝，长边 A 仍然接到长边 A。");
    consoleRoot.querySelector(".lab-seam-diagram").dataset.joinKind = odd() ? "odd" : "even";
    byId("lab-seam-top").dataset.joint = odd() ? "b" : "a";
    byId("lab-seam-bottom").dataset.joint = odd() ? "a" : "b";
    setText(byId("lab-seam-top"), odd() ? "B" : "A");
    setText(byId("lab-seam-bottom"), odd() ? "A" : "B");
    setText(byId("lab-parity"), odd() ? "换成偶数对照" : "换成奇数对照");
    byId("lab-start").value = currentAngle();
    setText(byId("lab-start-value"), `${currentAngle()}°`);
    byId("lab-lap-one").hidden = !odd();
    renderSpeed();
    if (state.mode === "build") byId("lesson-meter")?.style.setProperty("--progress", "0%");
    renderMotion();
    renderNarration();
    renderCut();
    publishCut();
    renderTransport();
    drawStage();
  }

  function pause() {
    cancelAnimationFrame(frame);
    frame = 0;
    lastTime = 0;
    state.playing = false;
  }

  function changeMode(mode, focus = false) {
    if (!phases.includes(mode) || state.mode === mode) return;
    pause();
    state.mode = mode;
    renderAll();
    if (focus) byId(`lab-tab-${mode}`).focus({ preventScroll: true });
  }

  function resetPaths() {
    state.progress = 0;
    state.cutting = 0;
    state.split = 0;
    state.highlight = "all";
    prediction = null;
  }

  function changeTwists(twists) {
    if (twists === state.twists) return;
    pause();
    state.twists = twists;
    resetPaths();
    renderAll();
  }

  function setMark(angle) {
    if (!Number.isFinite(angle)) return;
    pause();
    state.mark = ((angle % TAU) + TAU) % TAU;
    resetPaths();
    renderAll();
  }

  function chooseOffset(offset) {
    if (state.offset === offset) return;
    pause();
    state.offset = offset;
    state.cutting = 0;
    state.split = 0;
    state.highlight = "all";
    prediction = null;
    renderAll();
  }

  function updateProgress(phase, value, cue = false) {
    const before = phaseProgress(phase);
    const next = Math.max(0, Math.min(1, value));
    if (phase === "trace") {
      state.progress = next;
    } else {
      state.cutting = next;
      state.split = next >= 1 ? requestedSeparation : 0;
      if (next < 1) state.highlight = "all";
    }
    if (cue && loops(phase) === 2 && before < .5 && next >= .5) emitCue("seam");
    if (cue && before < 1 && next >= 1) emitCue(phase === "cut" ? "cut" : "seam");
    if (next >= 1) pause();
    const crossedCheckpoint = (before >= 1) !== (next >= 1)
      || (before >= .5) !== (next >= .5)
      || (before === 0) !== (next === 0);
    if (crossedCheckpoint) renderAll();
    else {
      renderMotion();
      drawStage();
    }
  }

  function play(phase) {
    if (state.mode !== phase) return;
    if (state.playing) {
      pause();
      renderTransport();
      drawStage();
      return;
    }
    if (phaseProgress(phase) >= 1) updateProgress(phase, 0);
    state.playing = true;
    renderTransport();
    drawStage();
    function tick(time) {
      const elapsed = lastTime ? Math.min(time - lastTime, 80) : 0;
      lastTime = time;
      const duration = loops(phase) * (phase === "trace" ? 6000 : 4750);
      const next = phaseProgress(phase) + elapsed / duration * speedValues[speedIndex];
      updateProgress(phase, next, true);
      if (state.playing) frame = requestAnimationFrame(tick);
    }
    frame = requestAnimationFrame(tick);
  }

  function seek(phase, value) {
    if (state.mode !== phase || !Number.isFinite(value)) return;
    pause();
    updateProgress(phase, value);
    renderTransport();
  }

  function setView(view) {
    if (!["default", "top", "side"].includes(view)) return;
    currentView = view;
    if (active) active.setView(view);
    pressed(viewButtons, button => button.dataset.view === currentView);
  }

  function resetView() {
    currentView = "default";
    if (active) active.resetView();
    pressed(viewButtons, button => button.dataset.view === currentView);
  }

  function resetExperiment() {
    pause();
    Object.assign(state, { mode: "build", twists: 1, offset: 0, mark: 0, showSeam: true, showGrid: false });
    speedIndex = 0;
    requestedSeparation = 1;
    cutReference = null;
    resetPaths();
    resetView();
    renderAll();
  }

  function pickMark(angle) {
    if (state.mode === "build" || phaseProgress(state.mode) === 0) setMark(angle);
  }

  function scrubFromStage(value) {
    if (state.mode === "build") return;
    const phase = state.mode;
    cancelAnimationFrame(pendingMarkFrame);
    pendingMarkFrame = requestAnimationFrame(() => {
      pendingMarkFrame = 0;
      seek(phase, value);
    });
  }

  function attachRenderer() {
    function create(factory) {
      let initialError = null;
      let starting = true;
      const renderer = factory.create(stageRoot, {
        onMark: pickMark,
        onScrub: scrubFromStage,
        onReady() { stageRoot.dataset.ready = "true"; },
        onError(message) {
          if (starting) initialError = message || "绘图未能启动";
          else queueMicrotask(() => useFallback(message));
        },
      });
      starting = false;
      if (initialError || !renderer?.update) {
        renderer?.destroy?.();
        throw new Error(initialError || "绘图未能启动");
      }
      return renderer;
    }

    function useFallback(message) {
      if (usingFallback) {
        stageRoot.dataset.ready = "false";
        setText(byId("lesson-live"), "纸带画面暂时无法显示。右侧控件仍可操作。");
        return;
      }
      usingFallback = true;
      active?.destroy();
      stageRoot.replaceChildren();
      stageRoot.dataset.renderer = "canvas";
      try {
        if (!window.RibbonFallback?.create) throw new Error(message);
        active = create(window.RibbonFallback);
        active.setView(currentView);
        drawStage();
      } catch {
        stageRoot.dataset.ready = "false";
        active = null;
        setText(byId("lesson-live"), "纸带画面暂时无法显示。右侧控件仍可操作。");
      }
    }

    try {
      if (!window.RibbonStage?.create) throw new Error("3D 画面无法启动");
      active = create(window.RibbonStage);
      stageRoot.dataset.renderer = "webgl";
      drawStage();
    } catch (error) {
      useFallback(error.message);
    }
  }

  consoleRoot.addEventListener("click", event => {
    const button = event.target.closest("button");
    if (!button || button.disabled) return;
    const { mode, go, twists, seek: seekPosition, play: playPhase, step, rewind, speed, path, guess, highlight } = button.dataset;
    if (mode) changeMode(mode);
    else if (go) changeMode(go, true);
    else if (twists !== undefined) changeTwists(Number(twists));
    else if (seekPosition !== undefined) seek("trace", seekPosition === "first" ? 1 / loops("trace") : Number(seekPosition));
    else if (playPhase) play(playPhase);
    else if (step) seek(step, phaseProgress(step) + 1 / (24 * loops(step)));
    else if (rewind) seek(rewind, 0);
    else if (speed !== undefined) {
      speedIndex = (speedIndex + 1) % speedValues.length;
      renderSpeed();
    }
    else if (path) chooseOffset(path === "offset" ? 1 / 3 : 0);
    else if (guess) {
      prediction = Number(guess);
      pressed(all("[data-guess]"), choice => Number(choice.dataset.guess) === prediction);
      renderNarration();
    }
    else if (highlight) {
      state.highlight = highlight;
      pressed(all("[data-highlight]"), choice => choice.dataset.highlight === state.highlight);
      drawStage();
    }
    else if (button.id === "lab-parity") changeTwists(odd() ? state.twists - 1 : state.twists + 1);
    else if (button.id === "lab-cut-compare" || button.id === "lab-cut-parity") {
      rememberCut();
      if (button.id === "lab-cut-compare") chooseOffset(offsetCut() ? 0 : 1 / 3);
      else changeTwists(odd() ? state.twists - 1 : state.twists + 1);
      consoleRoot.querySelector('[data-path][aria-pressed="true"]').focus({ preventScroll: true });
    }
  });
  consoleRoot.addEventListener("keydown", event => {
    const tab = event.target.closest(".lab-tab");
    if (!tab) return;
    const current = phases.indexOf(tab.dataset.mode);
    let next;
    if (event.key === "ArrowRight") next = (current + 1) % phases.length;
    else if (event.key === "ArrowLeft") next = (current + phases.length - 1) % phases.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = phases.length - 1;
    else return;
    event.preventDefault();
    changeMode(phases[next], true);
  });
  for (const [phase, input] of Object.entries(progressInputs)) {
    input.addEventListener("input", () => seek(phase, Number(input.value) / 1000));
  }
  byId("lab-start").addEventListener("input", event => setMark(Number(event.target.value) / 360 * TAU));
  byId("lab-separation").addEventListener("input", event => {
    requestedSeparation = Number(event.target.value) / 100;
    state.split = requestedSeparation;
    setText(byId("lab-separation-value"), `${event.target.value}%`);
    drawStage();
  });
  for (const button of viewButtons) button.addEventListener("click", () => setView(button.dataset.view));
  for (const button of all("[data-reset-view]")) button.addEventListener("click", resetView);
  for (const button of all("[data-reset-lab]")) button.addEventListener("click", resetExperiment);
  for (const button of displayButtons) {
    button.addEventListener("click", () => {
      const key = button.dataset.display;
      if (key !== "showGrid" && key !== "showSeam") return;
      state[key] = !state[key];
      pressed(displayButtons, item => Boolean(state[item.dataset.display]));
      drawStage();
    });
  }
  document.addEventListener("keydown", event => {
    if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || document.querySelector("dialog[open]")) return;
    const target = event.target;
    if (target instanceof HTMLElement && target.closest("input, textarea, select, button, a, [contenteditable], [role='slider']")) return;
    const phase = { "1": "build", "2": "trace", "3": "cut" }[event.key];
    if (phase) changeMode(phase, true);
    else if (event.key === " " && state.mode !== "build") {
      event.preventDefault();
      play(state.mode);
    }
    else if (event.key.toLowerCase() === "r") resetView();
  });
  motionReduced.addEventListener("change", () => {
    if (!motionReduced.matches || !state.playing) return;
    pause();
    renderAll();
  });
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden || !state.playing) return;
    pause();
    renderAll();
  });

  renderAll();
  attachRenderer();
})();
