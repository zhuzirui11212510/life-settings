(() => {
  "use strict";

  const TAU = Math.PI * 2;
  const rad = Math.PI / 180;
  const clamp = (value, lower, upper) => Math.max(lower, Math.min(upper, value));
  const motionReduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
  const rounded = (value, digits = 1) => Number(value).toFixed(digits);
  const find = (root, selector) => root.querySelector(selector);
  const all = (root, selector) => [...root.querySelectorAll(selector)];
  const read = input => input.valueAsNumber;

  function setPressed(root, selector, active) {
    all(root, selector).forEach(button => button.setAttribute("aria-pressed", String(button.dataset.value === active)));
  }

  function canvasSize(canvas) {
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    const density = Math.min(devicePixelRatio || 1, 2);
    const pixelsWide = Math.round(width * density);
    const pixelsHigh = Math.round(height * density);
    if (canvas.width !== pixelsWide || canvas.height !== pixelsHigh) {
      canvas.width = pixelsWide;
      canvas.height = pixelsHigh;
    }
    const ctx = canvas.getContext("2d");
    ctx.setTransform(density, 0, 0, density, 0, 0);
    return { width, height, ctx };
  }

  function circle(ctx, x, y, radius) {
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, TAU);
  }

  function pointerControl(button, box, change, step) {
    let pointer = null;
    function move(event) {
      const { left, top } = box.getBoundingClientRect();
      change((event.clientX - left - box.clientLeft) / box.clientWidth, (event.clientY - top - box.clientTop) / box.clientHeight);
    }
    button.addEventListener("pointerdown", event => {
      if (event.button !== 0) return;
      pointer = event.pointerId;
      button.setPointerCapture(pointer);
    });
    button.addEventListener("pointermove", event => {
      if (pointer === event.pointerId) move(event);
    });
    for (const type of ["pointercancel", "pointerup", "lostpointercapture"]) {
      button.addEventListener(type, event => {
        if (pointer === event.pointerId) pointer = null;
      });
    }
    button.addEventListener("keydown", event => {
      const direction = {
        ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0],
      }[event.key];
      if (!direction) return;
      event.preventDefault();
      step(direction[0], direction[1], event.shiftKey ? 3 : 1);
    });
  }

  function mountWave(root, api) {
    root.innerHTML = `
      <div class="wa-top">
        <div><p class="wa-kicker">波动光谱实验</p><h2>两源一静点<span>.</span></h2></div>
        <p class="wa-task">两列波都在传播。把探针处的合振幅压到 <strong>5%</strong> 以下，再锁定它。</p>
      </div>
      <div class="wa-stage" role="group" aria-label="干涉水槽">
        <canvas aria-hidden="true"></canvas>
        <div class="wa-inset"><b>叠加场</b><span class="wa-live">流动中</span></div>
        <button type="button" class="wa-handle wa-a" data-point="0" aria-label="波源 A，拖动或方向键移动">A</button>
        <button type="button" class="wa-handle wa-b" data-point="1" aria-label="波源 B，拖动或方向键移动">B</button>
        <button type="button" class="wa-handle wa-probe" data-point="2" aria-label="探针，拖动或方向键移动"><i></i><span>探针</span></button>
        <div class="wa-tag"><span>路径差</span> <output id="wa-path">0.0</output><span> λ</span></div>
      </div>
      <div class="wa-read">
        <div><span>探针合振幅</span><output id="wa-amplitude" aria-live="off"></output></div>
        <div class="wa-meter" aria-hidden="true"><i></i></div>
        <button type="button" class="wa-lock">锁定静点</button>
        <p class="wa-result" role="status"></p>
      </div>
      <div class="wa-controls">
        <fieldset>
          <legend>波源</legend>
          <label for="wa-phase">相位差 <output for="wa-phase">0°</output></label>
          <input id="wa-phase" type="range" min="-180" max="180" step="1" value="0">
          <label for="wa-lambda">波长 <output for="wa-lambda">14</output></label>
          <input id="wa-lambda" type="range" min="8" max="25" value="14" step=".5">
          <div class="wa-options" role="group" aria-label="激活波源"><button type="button" data-wa-source data-value="both" aria-pressed="true">双源</button><button type="button" data-wa-source data-value="a" aria-pressed="false">只开 A</button><button type="button" data-wa-source data-value="b" aria-pressed="false">只开 B</button></div>
        </fieldset>
        <fieldset>
          <legend>观察</legend>
          <div class="wa-options" role="group" aria-label="显示模式"><button type="button" data-wa-mode data-value="surface" aria-pressed="true">瞬时波形</button><button type="button" data-wa-mode data-value="envelope" aria-pressed="false">合振幅</button></div>
          <div class="wa-options">
            <button type="button" class="wa-fronts" aria-pressed="false">标记波峰</button>
            <button type="button" class="wa-pause" aria-pressed="false">暂停</button>
            <button type="button" class="wa-step">前进 ⅛ 周期</button>
          </div>
          <label for="wa-speed">播放速度 <output for="wa-speed">1.0×</output></label>
          <input id="wa-speed" type="range" min=".2" max="2" value="1" step=".1">
        </fieldset>
        <fieldset>
          <legend>对照</legend>
          <div class="wa-options">
            <button type="button" data-wa-preset="same">同相</button>
            <button type="button" data-wa-preset="opposite">反相</button>
            <button type="button" data-wa-preset="offset">错开探针</button>
            <button type="button" class="wa-reset">复位</button>
          </div>
          <details><summary>怎么看这片波纹？</summary><p>瞬时图显示波峰与波谷，合振幅图显示波动的最大幅度。这里两源等幅、同频，并忽略传播损耗。探针处的两波相差半个周期时彼此抵消。</p></details>
        </fieldset>
      </div>`;

    const stage = find(root, ".wa-stage");
    const canvas = find(stage, "canvas");
    const phase = find(root, "#wa-phase");
    const lambda = find(root, "#wa-lambda");
    const speed = find(root, "#wa-speed");
    const pause = find(root, ".wa-pause");
    const frontsButton = find(root, ".wa-fronts");
    const live = find(root, ".wa-live");
    const handles = all(stage, ".wa-handle");
    const output = find(root, "#wa-amplitude");
    const path = find(root, "#wa-path");
    const meter = find(root, ".wa-meter i");
    const result = find(root, ".wa-result");
    const field = document.createElement("canvas");
    const pixels = field.getContext("2d");
    const initial = [[.33, .60], [.67, .60], [.50, .30]];
    let points = initial.map(point => [...point]);
    let source = "both";
    let mode = "surface";
    let fronts = false;
    let running = !motionReduced();
    let time = 0;
    let timestamp = 0;
    let frame = 0;
    let dirty = true;
    let fieldPixels;
    let cosine;
    let sine;
    let amplitude;
    let view;
    const palette = Array.from({ length: 257 }, (_, i) => {
      const v = i / 128 - 1;
      const contour = Math.pow(1 - Math.abs(v), 7);
      const peak = Math.pow(Math.abs(v), 1.6);
      return v > 0
        ? [10 + 204 * peak + 13 * contour, 27 + 217 * peak + 30 * contour, 36 + 162 * peak + 30 * contour]
        : [8 + 11 * peak + 13 * contour, 22 + 88 * peak + 30 * contour, 31 + 103 * peak + 28 * contour];
    });

    function wave(x, y, aspect) {
      const first = Math.hypot(x - points[0][0], (y - points[0][1]) * aspect) * 100;
      const second = Math.hypot(x - points[1][0], (y - points[1][1]) * aspect) * 100;
      const thetaA = -TAU * first / read(lambda);
      const thetaB = -TAU * second / read(lambda) + read(phase) * rad;
      const a = source === "b" ? 0 : 1;
      const b = source === "a" ? 0 : 1;
      return [
        (a * Math.cos(thetaA) + b * Math.cos(thetaB)) / 2,
        (a * Math.sin(thetaA) + b * Math.sin(thetaB)) / 2,
        (second - first) / read(lambda),
      ];
    }

    function buildField(aspect) {
      field.width = 364;
      field.height = Math.max(1, Math.round(field.width * aspect));
      const count = field.width * field.height;
      fieldPixels = pixels.createImageData(field.width, field.height);
      cosine = new Float32Array(count);
      sine = new Float32Array(count);
      amplitude = new Float32Array(count);
      const ax = points[0][0], ay = points[0][1];
      const bx = points[1][0], by = points[1][1];
      const k = -TAU * 100 / read(lambda);
      const delay = read(phase) * rad;
      const enableA = source !== "b";
      const enableB = source !== "a";
      for (let i = 0, p = 0; i < field.height; i++) {
        const y = i / field.height;
        for (let j = 0; j < field.width; j++, p++) {
          const x = j / field.width;
          const a = k * Math.hypot(x - ax, (y - ay) * aspect);
          const b = k * Math.hypot(x - bx, (y - by) * aspect) + delay;
          const real = ((enableA ? Math.cos(a) : 0) + (enableB ? Math.cos(b) : 0)) / 2;
          const imaginary = ((enableA ? Math.sin(a) : 0) + (enableB ? Math.sin(b) : 0)) / 2;
          cosine[p] = real;
          sine[p] = imaginary;
          amplitude[p] = Math.hypot(real, imaginary);
          fieldPixels.data[p * 4 + 3] = 255;
        }
      }
    }

    function drawField() {
      const { width, height, ctx } = view;
      const phaseCos = Math.cos(time);
      const phaseSin = Math.sin(time);
      const envelope = mode === "envelope";
      for (let i = 0, p = 0; i < amplitude.length; i++, p += 4) {
        const value = envelope ? amplitude[i] * 2 - 1 : cosine[i] * phaseCos - sine[i] * phaseSin;
        const color = palette[clamp(Math.round(value * 128) + 128, 0, 256)];
        fieldPixels.data[p] = color[0];
        fieldPixels.data[p + 1] = color[1];
        fieldPixels.data[p + 2] = color[2];
      }
      pixels.putImageData(fieldPixels, 0, 0);
      ctx.drawImage(field, 0, 0, width, height);

      if (fronts) {
        const spacing = width * read(lambda) / 100;
        for (const index of [0, 1]) {
          if ((index === 0 && source === "b") || (index === 1 && source === "a")) continue;
          const [x, y] = points[index];
          const offset = ((time + (index === 1 ? read(phase) * rad : 0)) % TAU + TAU) % TAU;
          ctx.strokeStyle = index === 0 ? "#fff4b4b3" : "#ffd59eb3";
          ctx.setLineDash([3, 5]);
          for (let r = spacing * offset / TAU; r < Math.hypot(width, height); r += spacing) {
            circle(ctx, x * width, y * height, r);
            ctx.stroke();
          }
          ctx.setLineDash([]);
        }
      }
      const px = points[2][0] * width;
      const py = points[2][1] * height;
      ctx.strokeStyle = "#effff9a8";
      ctx.setLineDash([2, 6]);
      ctx.beginPath();
      ctx.moveTo(points[0][0] * width, points[0][1] * height);
      ctx.lineTo(px, py);
      ctx.lineTo(points[1][0] * width, points[1][1] * height);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    function render(ms) {
      frame = 0;
      if (timestamp && running) time += Math.min((ms - timestamp) / 1000, .055) * 3.8 * read(speed);
      timestamp = ms;
      if (!view?.width || !view.height) return;
      if (dirty) {
        buildField(view.height / view.width);
        dirty = false;
      }
      drawField();
      if (running && (mode === "surface" || fronts)) request();
    }

    function request() {
      if (!frame) frame = requestAnimationFrame(render);
    }

    function measure() {
      const [real, imaginary, diff] = wave(...points[2], view?.height / view?.width || .5);
      return { fraction: Math.hypot(real, imaginary), diff };
    }

    function sync({ clear = true } = {}) {
      if (clear) {
        result.textContent = "";
        api.reset();
      }
      const { fraction, diff } = measure();
      path.textContent = rounded(diff, 2);
      output.textContent = Math.round(fraction * 100) + "%";
      meter.style.width = fraction * 100 + "%";
      root.toggleAttribute("data-wa-node", fraction < .05 && source === "both");
      for (const [i, handle] of handles.entries()) {
        handle.style.left = points[i][0] * 100 + "%";
        handle.style.top = points[i][1] * 100 + "%";
      }
      find(root, 'output[for="wa-phase"]').textContent = phase.value + "°";
      find(root, 'output[for="wa-lambda"]').textContent = lambda.value;
      find(root, 'output[for="wa-speed"]').textContent = rounded(read(speed)) + "×";
      setPressed(root, "[data-wa-source]", source);
      setPressed(root, "[data-wa-mode]", mode);
      pause.textContent = running ? "暂停" : "继续";
      pause.setAttribute("aria-pressed", String(!running));
      frontsButton.setAttribute("aria-pressed", String(fronts));
      live.textContent = running ? "流动中" : "静帧";
      request();
    }

    function movePoint(index, x, y) {
      points[index] = [clamp(x, .065, .935), clamp(y, .14, .86)];
      if (index < 2) dirty = true;
      sync();
    }

    handles.forEach((handle, i) => pointerControl(handle, stage,
      (x, y) => movePoint(i, x, y),
      (dx, dy, size) => movePoint(i, points[i][0] + dx * size * .012, points[i][1] + dy * size * .018)));

    for (const input of [phase, lambda, speed]) input.addEventListener("input", () => {
      if (input !== speed) dirty = true;
      sync({ clear: input !== speed });
    });
    all(root, "[data-wa-source]").forEach(button => button.addEventListener("click", () => {
      source = button.dataset.value;
      dirty = true;
      sync();
    }));
    all(root, "[data-wa-mode]").forEach(button => button.addEventListener("click", () => {
      mode = button.dataset.value;
      timestamp = 0;
      sync({ clear: false });
    }));
    pause.addEventListener("click", () => {
      running = !running;
      timestamp = 0;
      sync({ clear: false });
    });
    frontsButton.addEventListener("click", () => {
      fronts = !fronts;
      sync({ clear: false });
    });
    find(root, ".wa-step").addEventListener("click", () => {
      running = false;
      time += TAU / 8;
      sync({ clear: false });
    });
    all(root, "[data-wa-preset]").forEach(button => button.addEventListener("click", () => {
      const preset = button.dataset.waPreset;
      points = initial.map(point => [...point]);
      phase.value = preset === "opposite" ? "180" : "0";
      if (preset === "offset") points[2] = [.42, .40];
      source = "both";
      dirty = true;
      sync();
    }));
    find(root, ".wa-reset").addEventListener("click", () => {
      points = initial.map(point => [...point]);
      phase.value = phase.defaultValue;
      lambda.value = lambda.defaultValue;
      speed.value = speed.defaultValue;
      source = "both";
      mode = "surface";
      fronts = false;
      time = 0;
      timestamp = 0;
      running = !motionReduced();
      dirty = true;
      sync();
    });
    find(root, ".wa-lock").addEventListener("click", () => {
      if (source !== "both") result.textContent = "打开双源，才可以验证两列波的抵消。";
      else if (measure().fraction >= .05) result.textContent = "这里还在起伏。试着改变相位差，或把探针移向合振幅图的暗纹。";
      else {
        result.textContent = "锁定成功。两列波在此处相抵，暗纹所在就是低振幅区。";
        api.complete("捕捉到干涉静点");
      }
    });
    function resize() {
      view = canvasSize(canvas);
      dirty = true;
      sync({ clear: false });
    }
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize();
    api.onCleanup(() => { observer.disconnect(); cancelAnimationFrame(frame); });
  }

  window.LiveStages.register({
    id: "wave", title: "两源一静点", subject: "波的干涉", style: "液晶水槽",
    summary: "移动波源和探针，让两列波在指定位置刚好相抵。",
    mount: mountWave,
  });

  const flightKinds = { circle: "近圆绕行", ellipse: "椭圆绕行", escape: "逃逸", impact: "撞入天体" };
  const flightStep = .012;
  const planetRadius = .255;

  function flight(radius, speed, angle, mass) {
    let x = 0, y = -radius;
    let vx = speed * Math.cos(angle), vy = speed * Math.sin(angle);
    const energy = speed ** 2 / 2 - mass / radius;
    const momentum = radius * vx;
    const eccentricity = Math.sqrt(Math.max(0, 1 + 2 * energy * momentum ** 2 / mass ** 2));
    const period = energy < 0 ? TAU * Math.sqrt((-mass / (2 * energy)) ** 3 / mass) : Infinity;
    const trace = [[x, y, vx, vy]];
    let impact = false;
    const duration = Math.min(26, period);
    const accel = (px, py) => -mass / Math.max(Math.hypot(px, py), planetRadius) ** 3;
    for (let t = flightStep; t <= duration; t += flightStep) {
      const a = accel(x, y);
      vx += a * x * flightStep / 2;
      vy += a * y * flightStep / 2;
      x += vx * flightStep;
      y += vy * flightStep;
      const nextA = accel(x, y);
      vx += nextA * x * flightStep / 2;
      vy += nextA * y * flightStep / 2;
      trace.push([x, y, vx, vy]);
      if (Math.hypot(x, y) <= planetRadius) {
        impact = true;
        break;
      }
      if (Math.hypot(x, y) > 7.8) break;
    }
    const kind = impact ? "impact" : energy >= 0 ? "escape" : eccentricity < .065 ? "circle" : "ellipse";
    return { energy, eccentricity, trace, kind };
  }

  function mountOrbit(root, api) {
    root.innerHTML = `
      <div class="orb-title">
        <p>轨道试验场</p><h2>离心试飞</h2>
        <div class="orb-title-rule"></div><span>Orbital Trial</span>
      </div>
      <div class="orb-table">
        <figure class="orb-instrument">
          <div class="orb-sky" role="group" aria-label="黄铜轨道钟">
            <canvas aria-hidden="true"></canvas>
            <button type="button" class="orb-aim" aria-label="发射速度矢量，拖动或用方向键调整"><b>↗</b></button>
            <span class="orb-scale" aria-hidden="true">每圈 0.5 距离单位</span>
          </div>
          <figcaption><i></i> 金色是飞行实迹 <b></b> 虚线是预测轨道 <span class="orb-compare-legend" hidden>蓝线是保留轨道</span></figcaption>
        </figure>
        <aside class="orb-journal">
          <p class="orb-journal-note">任务</p>
          <h3>猜它会<br>飞去哪里</h3>
          <p>拽住箭头设定速度和方向。先猜结局，再点「发射」验证。</p>
          <div class="orb-choices" role="group" aria-label="预测飞行结果">${Object.entries(flightKinds).map(([id, label]) => `<button type="button" data-orb-guess data-value="${id}" aria-pressed="false">${label}</button>`).join("")}</div>
          <p class="orb-answer" role="status">拖动箭头，或在刻度盘下调整参数。</p>
          <details><summary>为什么有时回不来？</summary><p>机械能 E = v²/2 − μ/r。E 为负时，路径受到束缚。E 为零或正时，物体可能离开引力中心。若路径先碰到天体表面，则提前结束。</p></details>
        </aside>
      </div>
      <div class="orb-transport">
        <button type="button" class="orb-play">发射</button>
        <button type="button" class="orb-step">步进</button>
        <button type="button" class="orb-back">回到发射点</button>
        <label class="orb-tape"><span>飞行时间 <b id="orb-clock">0.00</b></span><input type="range" id="orb-time" min="0" value="0" max="100"></label>
        <div class="orb-telemetry"><span>当前速度 <b id="orb-v"></b></span><span>单位质量机械能 <b id="orb-energy"></b></span></div>
      </div>
      <div class="orb-parameters">
        <div class="orb-levers">
          <label>初始速度 <output for="orb-speed"></output><input type="range" id="orb-speed" min=".10" max="2.5" step=".01" value="1.14"></label>
          <label>发射方向 <output for="orb-angle"></output><input type="range" id="orb-angle" min="-75" max="75" step="1" value="12"></label>
          <label>发射半径 <output for="orb-radius"></output><input type="range" id="orb-radius" min=".65" max="1.45" step=".01" value="1"></label>
          <label>引力参数 μ <output for="orb-mass"></output><input type="range" id="orb-mass" min=".55" max="1.45" step=".01" value="1"></label>
        </div>
        <div class="orb-toggles">
          <div role="group" aria-label="飞行预设">
            <button type="button" data-orb-preset="circle">圆轨参考</button><button type="button" data-orb-preset="ellipse">椭圆参考</button><button type="button" data-orb-preset="escape">逃逸参考</button><button type="button" data-orb-preset="impact">撞击参考</button>
          </div>
          <div role="group" aria-label="观测方式">
            <button type="button" class="orb-prediction" aria-pressed="false">显影预测</button><button type="button" class="orb-compare" aria-pressed="false">留轨对照</button><button type="button" class="orb-vectors" aria-pressed="false">速度矢量</button><button type="button" class="orb-zoom" aria-pressed="false">广角</button>
            <label>倍率 <select id="orb-rate"><option value=".5">0.5×</option><option value="1" selected>1×</option><option value="2">2×</option><option value="4">4×</option></select></label>
          </div>
        </div>
      </div>`;

    const sky = find(root, ".orb-sky");
    const canvas = find(sky, "canvas");
    const aim = find(sky, ".orb-aim");
    const speed = find(root, "#orb-speed");
    const angle = find(root, "#orb-angle");
    const radius = find(root, "#orb-radius");
    const mass = find(root, "#orb-mass");
    const timeline = find(root, "#orb-time");
    const rate = find(root, "#orb-rate");
    const play = find(root, ".orb-play");
    const answer = find(root, ".orb-answer");
    const prediction = find(root, ".orb-prediction");
    const compare = find(root, ".orb-compare");
    const vectors = find(root, ".orb-vectors");
    const zoom = find(root, ".orb-zoom");
    let view;
    let trajectory;
    let reference = null;
    let guess = "";
    let active = false;
    let showPrediction = false;
    let showVectors = false;
    let wide = false;
    let time = 0;
    let previous = 0;
    let frame = 0;

    function scale() { return Math.min(view.width, view.height) / (wide ? 10.4 : 4.6); }
    function locate(x, y) { return [view.width / 2 + x * scale(), view.height / 2 + y * scale()]; }

    function paintCurve(ctx, trace, end, color, dash, lineWidth) {
      if (end < 1) return;
      const skip = Math.max(1, Math.floor(end / 270));
      ctx.strokeStyle = color;
      ctx.setLineDash(dash);
      ctx.lineWidth = lineWidth;
      ctx.beginPath();
      for (let index = 0; index <= end; index += skip) {
        const [x, y] = locate(...trace[index]);
        if (index === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.lineTo(...locate(...trace[end]));
      ctx.stroke();
      ctx.setLineDash([]);
    }

    function render() {
      const { width, height, ctx } = view;
      if (!width || !height) return;
      const [cx, cy] = locate(0, 0);
      const unit = scale();
      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = "#18110f";
      ctx.fillRect(0, 0, width, height);
      for (let i = 0; i < 95; i++) {
        const x = (Math.sin(i * 734.37 + 5) * .5 + .5) * width;
        const y = (Math.cos(i * 423.41 + 7) * .5 + .5) * height;
        ctx.fillStyle = i % 7 ? "#e3c88a41" : "#fff0b7a0";
        circle(ctx, x, y, i % 7 ? .7 : 1.2);
        ctx.fill();
      }
      for (let r = .5; r <= (wide ? 5 : 2); r += .5) {
        circle(ctx, cx, cy, r * unit);
        ctx.strokeStyle = r % 1 ? "#9b6e4b60" : "#c28f616e";
        ctx.lineWidth = 1;
        ctx.stroke();
      }
      const outer = Math.min(width, height) * .475;
      ctx.beginPath();
      for (let i = 0; i < 96; i++) {
        const theta = i * TAU / 96;
        const len = i % 8 === 0 ? 9 : 4;
        ctx.moveTo(cx + Math.cos(theta) * outer, cy + Math.sin(theta) * outer);
        ctx.lineTo(cx + Math.cos(theta) * (outer - len), cy + Math.sin(theta) * (outer - len));
      }
      ctx.strokeStyle = "#c89864ae";
      ctx.stroke();
      ctx.strokeStyle = "#8a604866";
      ctx.beginPath();
      ctx.moveTo(cx, 16); ctx.lineTo(cx, height - 16);
      ctx.moveTo(16, cy); ctx.lineTo(width - 16, cy);
      ctx.stroke();

      const gradient = ctx.createRadialGradient(cx - .13 * unit, cy - .11 * unit, 0, cx, cy, planetRadius * unit);
      gradient.addColorStop(0, "#fff1b8");
      gradient.addColorStop(.37, "#dbae74");
      gradient.addColorStop(.72, "#a2593a");
      gradient.addColorStop(1, "#4b2829");
      circle(ctx, cx, cy, planetRadius * unit);
      ctx.save();
      ctx.fillStyle = gradient;
      ctx.fill();
      ctx.clip();
      for (let i = 0; i < 10; i++) {
        const y = cy + (i - 5) * unit * .05;
        ctx.beginPath();
        ctx.moveTo(cx - unit / 2, y);
        ctx.bezierCurveTo(cx - unit / 5, y + unit * .13, cx + unit / 9, y - unit * .15, cx + unit / 2, y + unit * .15);
        ctx.strokeStyle = i % 2 ? "#ffefbe44" : "#4f231851";
        ctx.stroke();
      }
      ctx.restore();
      circle(ctx, cx, cy, planetRadius * unit);
      ctx.strokeStyle = "#f6cc9370";
      ctx.stroke();

      const trace = trajectory.trace;
      const index = clamp(Math.floor(time / flightStep), 0, trace.length - 1);
      if (reference) paintCurve(ctx, reference, reference.length - 1, "#82c9dbb8", [2, 5], 1.7);
      if (showPrediction) paintCurve(ctx, trace, trace.length - 1, "#c7a47d8c", [4, 5], 1.2);
      paintCurve(ctx, trace, index, "#f5c485", [], 2);
      const next = trace[Math.min(index + 1, trace.length - 1)];
      const fraction = time / flightStep - index;
      const [px, py] = locate(trace[index][0] + (next[0] - trace[index][0]) * fraction, trace[index][1] + (next[1] - trace[index][1]) * fraction);
      const [, , vx, vy] = trace[index];
      const [sx, sy] = locate(0, -read(radius));
      const aimDX = sx + trace[0][2] * unit * .54 - cx;
      const aimDY = sy + trace[0][3] * unit * .54 - cy;
      const aimLimit = Math.min(width, height) * .5 - 24;
      const aimScale = Math.min(1, aimLimit / Math.hypot(aimDX, aimDY));
      const aimX = cx + aimDX * aimScale;
      const aimY = cy + aimDY * aimScale;
      if (time === 0 || showVectors) {
        const size = unit * .54;
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(time === 0 ? aimX : px + vx * size, time === 0 ? aimY : py + vy * size);
        ctx.strokeStyle = "#fff0b6";
        ctx.lineWidth = 1.8;
        ctx.stroke();
      }
      circle(ctx, px, py, 4);
      ctx.fillStyle = "#fff4c7";
      ctx.shadowBlur = 13;
      ctx.shadowColor = "#ffd493";
      ctx.fill();
      ctx.shadowBlur = 0;

      aim.hidden = time > 0;
      aim.style.left = aimX + "px";
      aim.style.top = aimY + "px";
      find(root, "#orb-clock").textContent = rounded(time, 2);
      find(root, "#orb-v").textContent = rounded(Math.hypot(vx, vy), 2);
      timeline.value = String(index);
    }

    function update() {
      api.reset();
      active = false;
      previous = 0;
      time = 0;
      play.textContent = "发射";
      trajectory = flight(read(radius), read(speed), read(angle) * rad, read(mass));
      timeline.max = String(trajectory.trace.length - 1);
      find(root, "#orb-energy").textContent = rounded(trajectory.energy, 3);
      for (const input of [speed, radius, mass, angle]) {
        find(root, `output[for="${input.id}"]`).textContent = input === angle ? input.value + "°" : rounded(read(input), 2);
      }
      answer.textContent = "切向为 0°，正角朝向天体。选定猜测再发射。";
      render();
    }

    function verdict() {
      const label = flightKinds[trajectory.kind];
      if (guess === trajectory.kind) {
        answer.textContent = "猜中了。结果为「" + label + "」。";
        api.complete("预判并验证了一次飞行", trajectory.kind);
      } else {
        answer.textContent = guess ? "实际结果是「" + label + "」。可以调参再试，或打开预测线检查。" : "实际结果是「" + label + "」。选择这个结果并重飞可以验证猜测。";
      }
    }

    function advance(amount) {
      const limit = (trajectory.trace.length - 1) * flightStep;
      time = Math.min(time + amount, limit);
      if (time === limit) {
        active = false;
        play.textContent = "重飞";
        verdict();
      }
      render();
    }

    function animate(timestamp) {
      frame = 0;
      if (!active) return;
      const delta = previous ? Math.min((timestamp - previous) / 1000, .045) : 0;
      previous = timestamp;
      advance(delta * 3 * Number(rate.value));
      if (active) frame = requestAnimationFrame(animate);
    }

    play.addEventListener("click", () => {
      if (active) {
        active = false;
        play.textContent = "继续";
        return;
      }
      if (time >= (trajectory.trace.length - 1) * flightStep) {
        api.reset();
        time = 0;
      }
      if (motionReduced()) {
        advance(26);
        return;
      }
      previous = 0;
      active = true;
      play.textContent = "暂停";
      if (!frame) frame = requestAnimationFrame(animate);
    });
    find(root, ".orb-step").addEventListener("click", () => {
      active = false;
      if (time >= (trajectory.trace.length - 1) * flightStep) {
        api.reset();
        time = 0;
      }
      play.textContent = "继续";
      advance(flightStep * 16);
    });
    find(root, ".orb-back").addEventListener("click", () => { update(); });
    timeline.addEventListener("input", () => {
      active = false;
      time = read(timeline) * flightStep;
      play.textContent = time === 0 ? "发射" : "继续";
      render();
    });
    all(root, "[data-orb-guess]").forEach(button => button.addEventListener("click", () => {
      if (guess !== button.dataset.value) api.reset();
      guess = button.dataset.value;
      setPressed(root, "[data-orb-guess]", guess);
      answer.textContent = "记录预测「" + flightKinds[guess] + "」。";
    }));
    prediction.addEventListener("click", () => {
      showPrediction = !showPrediction;
      prediction.setAttribute("aria-pressed", String(showPrediction));
      render();
    });
    compare.addEventListener("click", () => {
      reference = reference ? null : trajectory.trace;
      compare.setAttribute("aria-pressed", String(Boolean(reference)));
      compare.textContent = reference ? "清除对照" : "留轨对照";
      find(root, ".orb-compare-legend").hidden = !reference;
      if (reference) answer.textContent = "蓝色轨道已留存。改变发射条件可以在同一刻度下比较。";
      render();
    });
    vectors.addEventListener("click", () => {
      showVectors = !showVectors;
      vectors.setAttribute("aria-pressed", String(showVectors));
      render();
    });
    zoom.addEventListener("click", () => {
      wide = !wide;
      zoom.setAttribute("aria-pressed", String(wide));
      render();
    });
    all(root, "[data-orb-preset]").forEach(button => button.addEventListener("click", () => {
      const [v, a] = { circle: [1, 0], ellipse: [1.14, 12], escape: [1.52, -9], impact: [.45, 33] }[button.dataset.orbPreset];
      radius.value = "1";
      mass.value = "1";
      speed.value = String(v);
      angle.value = String(a);
      update();
    }));
    for (const input of [speed, angle, radius, mass]) input.addEventListener("input", update);
    pointerControl(aim, sky, (x, y) => {
      const [sx, sy] = locate(0, -read(radius));
      const vx = (x * view.width - sx) / (scale() * .54);
      const vy = (y * view.height - sy) / (scale() * .54);
      speed.value = rounded(clamp(Math.hypot(vx, vy), .1, 2.5), 2);
      angle.value = String(Math.round(clamp(Math.atan2(vy, vx) / rad, -75, 75)));
      update();
    }, (dx, dy, step) => {
      speed.value = rounded(clamp(read(speed) + dx * step * .04, .1, 2.5), 2);
      angle.value = String(clamp(read(angle) + dy * step * 3, -75, 75));
      update();
    });
    function resize() {
      view = canvasSize(canvas);
      if (trajectory) render();
    }
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize();
    update();
    api.onCleanup(() => { observer.disconnect(); cancelAnimationFrame(frame); });
  }

  window.LiveStages.register({
    id: "orbit", title: "离心试飞", subject: "天体力学", style: "黄铜天文钟",
    summary: "推一把探测器，推演它的轨迹并验证预测。",
    mount: mountOrbit,
  });

  const rectangle = [[-.99, -.83], [.99, -.83], [.99, .83], [-.99, .83]];
  const plates = [
    { id: "kite", title: "纸鸢", angle: 90, color: "#2d37db", shapes: [
      [[-.6, .16], [-.12, .65], [.43, .16], [.04, .24]],
      [[-.15, .70], [.22, .58], [.55, .34], [.33, .64]],
      [[.52, .25], [.63, .15], [.74, .27], [.66, .33]],
    ] },
    { id: "reef", title: "珊瑚", angle: 0, color: "#e74929", shapes: [
      [[-.48, .19], [-.41, .38], [-.66, .47], [-.57, .57], [-.30, .48], [-.14, .74], [-.04, .62], [-.15, .41], [.19, .51], [.17, .63], [.28, .68], [.39, .45], [.65, .37], [.62, .26], [.18, .33], [-.19, .26], [-.19, .15]],
      [[.39, .60], [.49, .63], [.53, .74], [.43, .73]],
      [[-.68, .21], [-.61, .30], [-.73, .35], [-.79, .29]],
    ] },
    { id: "signal", title: "信号", angle: 35, color: "#6633ab", shapes: [
      [[-.65, .18], [-.44, .28], [-.53, .61], [-.70, .54]],
      [[-.36, .32], [-.15, .21], [.03, .67], [-.16, .68]],
      [[.10, .18], [.31, .18], [.25, .47], [.08, .54]],
      [[.48, .22], [.69, .23], [.61, .44], [.44, .46]],
    ] },
  ];

  function mountFold(root, api) {
    root.innerHTML = `
      <header class="fd-head">
        <div class="fd-name"><p>图形制版</p><h2>折痕<br><span>印刷所</span></h2></div>
        <div class="fd-brief"><strong>让两面的墨迹套准。</strong><p>旋转、平移折痕，再试压。折好的图案要落在虚线轮廓内。</p></div>
        <div class="fd-samples" role="group" aria-label="选择版样">
          ${plates.map((plate, i) => `<button type="button" data-fd-plate data-value="${plate.id}" aria-pressed="${i === 0}"><i aria-hidden="true"></i>${plate.title}</button>`).join("")}
        </div>
      </header>
      <div class="fd-press">
        <div class="fd-rulers" aria-hidden="true"></div>
        <div class="fd-paper" role="group" aria-label="可折叠的套印纸">
          <canvas aria-hidden="true"></canvas>
          <button type="button" class="fd-knob fd-shift" aria-label="拖动或用方向键平移折痕">↔</button>
          <button type="button" class="fd-knob fd-turn" aria-label="拖动或用方向键旋转折痕">↻</button>
          <span class="fd-paper-tag">⌖ 套准台</span>
        </div>
        <div class="fd-status-band">
          <span>预估套准度 <output class="fd-score"></output></span>
          <div class="fd-score-track" aria-hidden="true"><i></i></div>
          <button type="button" class="fd-test">核对套准</button>
          <p class="fd-result" role="status"></p>
        </div>
      </div>
      <div class="fd-workbench">
        <fieldset class="fd-adjust">
          <legend>校版</legend>
          <label>折痕角度 <output for="fd-angle"></output><input id="fd-angle" type="range" min="-90" max="90" step="1" value="57"></label>
          <label>偏移 <output for="fd-offset"></output><input id="fd-offset" type="range" min="-.45" max=".45" step=".01" value=".12"></label>
          <label>翻折幅度 <output for="fd-fold"></output><input id="fd-fold" type="range" min="0" max="180" step="1" value="22"></label>
        </fieldset>
        <div class="fd-tools">
          <button type="button" class="fd-cycle">试压至合拢</button>
          <button type="button" class="fd-unfold">展开纸张</button>
          <button type="button" class="fd-side" aria-pressed="false">改折另一侧</button>
          <button type="button" class="fd-outline" aria-pressed="true">目标轮廓</button>
          <button type="button" class="fd-grid" aria-pressed="true">定位格</button>
          <button type="button" class="fd-ghost" aria-pressed="false">透印预测</button>
          <button type="button" class="fd-reset">重置校版</button>
          <details><summary>读折痕</summary><p>完全合拢时，翻折的一侧绕折痕镜像。正确套准需要每对对应点到折痕的垂直距离相等。</p></details>
        </div>
      </div>`;

    const paper = find(root, ".fd-paper");
    const canvas = find(paper, "canvas");
    const angle = find(root, "#fd-angle");
    const offset = find(root, "#fd-offset");
    const degree = find(root, "#fd-fold");
    const shift = find(root, ".fd-shift");
    const turn = find(root, ".fd-turn");
    const result = find(root, ".fd-result");
    let plate = plates[0];
    let view;
    let frame = 0;
    let side = 1;
    let outline = true;
    let grid = true;
    let ghost = false;
    let shownDegree = read(degree);

    function basis(value) {
      const phi = value * rad;
      return { u: [Math.cos(phi), Math.sin(phi)], n: [-Math.sin(phi), Math.cos(phi)] };
    }

    function distance(point, axis, delta) { return point[0] * axis.n[0] + point[1] * axis.n[1] - delta; }

    function shapes() {
      const { u, n } = basis(plate.angle);
      return plate.shapes.map(shape => shape.map(([x, y]) => [x * u[0] + y * n[0], x * u[1] + y * n[1]]));
    }

    function clip(points, axis, delta, sign) {
      const selected = [];
      for (const [i, current] of points.entries()) {
        const next = points[(i + 1) % points.length];
        const start = distance(current, axis, delta) * sign;
        const end = distance(next, axis, delta) * sign;
        if (start >= 0) selected.push(current);
        if ((start > 0 && end < 0) || (start < 0 && end > 0)) {
          const portion = start / (start - end);
          selected.push([current[0] + (next[0] - current[0]) * portion, current[1] + (next[1] - current[1]) * portion]);
        }
      }
      return selected;
    }

    function flip(point, axis, delta, fold) {
      const gap = distance(point, axis, delta);
      const change = gap * (Math.cos(fold) - 1);
      return [point[0] + change * axis.n[0], point[1] + change * axis.n[1] - Math.abs(gap * Math.sin(fold)) * .27];
    }

    function metrics(axis, delta, print) {
      const goal = basis(plate.angle);
      let error = 0;
      let count = 0;
      for (const shape of print) {
        for (const point of shape) {
          const target = flip(point, goal, 0, Math.PI);
          const moved = distance(point, axis, delta) * side >= 0 ? flip(point, axis, delta, Math.PI) : point;
          error += (moved[0] - target[0]) ** 2 + (moved[1] - target[1]) ** 2;
          count++;
        }
      }
      const rms = Math.sqrt(error / count);
      return { score: clamp(100 - Math.round(rms * 95), 0, 100), rms };
    }

    function scale() { return Math.min(view.width * .37, view.height * .475); }
    function project([x, y]) { return [view.width / 2 + x * scale(), view.height / 2 + y * scale()]; }

    function draw() {
      const { width, height, ctx } = view;
      if (!width || !height) return;
      const axis = basis(read(angle));
      const delta = read(offset);
      const print = shapes();
      const goal = basis(plate.angle);
      const targetShapes = print.map(shape => shape.map(point => flip(point, goal, 0, Math.PI)));
      const opening = shownDegree * rad;
      const transformation = point => flip(point, axis, delta, opening);

      function trace(points) {
        if (!points.length) return false;
        ctx.beginPath();
        ctx.moveTo(...project(points[0]));
        for (const point of points.slice(1)) ctx.lineTo(...project(point));
        ctx.closePath();
        return true;
      }

      function fill(points, color) {
        if (trace(points)) {
          ctx.fillStyle = color;
          ctx.fill();
        }
      }

      function strip(a, b) {
        ctx.beginPath();
        ctx.moveTo(...project(a)); ctx.lineTo(...project(b));
        ctx.stroke();
      }

      ctx.clearRect(0, 0, width, height);
      const stationary = clip(rectangle, axis, delta, -side);
      const movable = clip(rectangle, axis, delta, side);
      ctx.save();
      ctx.shadowColor = "#17267542";
      ctx.shadowBlur = 24;
      ctx.shadowOffsetY = 10;
      fill(stationary, "#fff9eb");
      ctx.restore();

      if (trace(stationary)) {
        ctx.save();
        ctx.clip();
        if (grid) {
          ctx.strokeStyle = "#2734d928";
          ctx.lineWidth = .7;
          for (let i = -8; i <= 8; i++) {
            const p = i / 8;
            strip([p, -.9], [p, .9]);
            strip([-1, p], [1, p]);
          }
        }
        print.forEach(shape => fill(shape, plate.color));
        ctx.restore();
      }

      const folded = movable.map(transformation);
      ctx.save();
      ctx.shadowColor = "#211f6445";
      ctx.shadowBlur = 6 + 26 * Math.sin(opening);
      ctx.shadowOffsetY = 4 + 11 * Math.sin(opening);
      const surface = opening < Math.PI / 2 ? "#fff5df" : "#ffe69c";
      fill(folded, surface);
      ctx.restore();
      if (trace(folded)) {
        ctx.strokeStyle = "#3532aa51";
        ctx.stroke();
        ctx.save();
        ctx.clip();
        const frontInk = opening < Math.PI / 2 ? plate.color : plate.color + "b0";
        print.forEach(shape => fill(clip(shape, axis, delta, side).map(transformation), frontInk));
        if (grid && opening < Math.PI / 2) {
          ctx.strokeStyle = "#2734d923";
          ctx.lineWidth = .7;
          for (let i = -8; i <= 8; i++) {
            const p = i / 8;
            strip(transformation([p, -.9]), transformation([p, .9]));
            strip(transformation([-1, p]), transformation([1, p]));
          }
        }
        ctx.restore();
      }

      if (ghost) {
        for (const shape of print) {
          const mirrored = clip(shape, axis, delta, side).map(point => flip(point, axis, delta, Math.PI));
          fill(mirrored, "#b83a8c3c");
          if (trace(mirrored)) { ctx.strokeStyle = "#a8277b"; ctx.stroke(); }
        }
      }
      if (outline) {
        ctx.setLineDash([5, 5]);
        ctx.strokeStyle = "#141c77";
        ctx.lineWidth = 1.5;
        targetShapes.forEach(shape => { if (trace(shape)) ctx.stroke(); });
        ctx.setLineDash([]);
      }
      ctx.setLineDash([3, 5]);
      ctx.strokeStyle = "#ce351e";
      const origin = axis.n.map(value => value * delta);
      strip([origin[0] - axis.u[0] * 1.15, origin[1] - axis.u[1] * 1.15],
        [origin[0] + axis.u[0] * 1.15, origin[1] + axis.u[1] * 1.15]);
      ctx.setLineDash([]);

      const knobs = [origin, [origin[0] + axis.u[0] * .70, origin[1] + axis.u[1] * .70]];
      [shift, turn].forEach((handle, i) => {
        const [x, y] = project(knobs[i]);
        handle.style.left = x + "px";
        handle.style.top = y + "px";
      });
    }

    function update(clear = true) {
      const match = metrics(basis(read(angle)), read(offset), shapes());
      find(root, ".fd-score").textContent = match.score + "%";
      find(root, ".fd-score-track i").style.width = match.score + "%";
      find(root, 'output[for="fd-angle"]').textContent = angle.value + "°";
      find(root, 'output[for="fd-offset"]').textContent = rounded(read(offset), 2);
      find(root, 'output[for="fd-fold"]').textContent = degree.value + "°";
      if (clear) {
        result.textContent = "";
        api.reset();
      }
      draw();
    }

    function selectPlate(next) {
      cancelAnimationFrame(frame);
      plate = next;
      side = 1;
      angle.value = String(plate.angle - 28);
      offset.value = ".12";
      degree.value = "22";
      shownDegree = 22;
      find(root, ".fd-side").setAttribute("aria-pressed", "false");
      setPressed(root, "[data-fd-plate]", plate.id);
      update();
    }

    function roll(target) {
      cancelAnimationFrame(frame);
      if (motionReduced()) {
        shownDegree = target;
        degree.value = String(target);
        update();
        return;
      }
      const from = shownDegree;
      let start;
      function move(ms) {
        start ??= ms;
        const t = Math.min(1, (ms - start) / 650);
        shownDegree = from + (target - from) * (1 - (1 - t) ** 3);
        degree.value = String(Math.round(shownDegree));
        update();
        if (t < 1) frame = requestAnimationFrame(move);
      }
      frame = requestAnimationFrame(move);
    }

    const physical = (x, y) => [(x - .5) * view.width / scale(), (y - .5) * view.height / scale()];
    pointerControl(shift, paper, (x, y) => {
      offset.value = rounded(clamp(distance(physical(x, y), basis(read(angle)), 0), -.45, .45), 2);
      update();
    }, (dx, dy, step) => {
      offset.value = rounded(clamp(read(offset) + (dx || dy) * step * .01, -.45, .45), 2);
      update();
    });
    pointerControl(turn, paper, (x, y) => {
      const [px, py] = physical(x, y);
      const axis = basis(read(angle));
      const delta = read(offset);
      let phi = Math.atan2(py - axis.n[1] * delta, px - axis.n[0] * delta) / rad;
      if (phi < -90) phi += 180;
      if (phi > 90) phi -= 180;
      angle.value = String(Math.round(phi));
      update();
    }, (dx, dy, step) => {
      angle.value = String(clamp(read(angle) + (dx || dy) * step * 2, -90, 90));
      update();
    });
    for (const input of [angle, offset, degree]) input.addEventListener("input", () => {
      if (input === degree) {
        cancelAnimationFrame(frame);
        shownDegree = read(degree);
      }
      update();
    });
    all(root, "[data-fd-plate]").forEach(button => button.addEventListener("click", () => {
      selectPlate(plates.find(item => item.id === button.dataset.value));
    }));
    find(root, ".fd-cycle").addEventListener("click", () => roll(180));
    find(root, ".fd-unfold").addEventListener("click", () => roll(0));
    find(root, ".fd-reset").addEventListener("click", () => {
      outline = true; grid = true; ghost = false;
      find(root, ".fd-outline").setAttribute("aria-pressed", "true");
      find(root, ".fd-grid").setAttribute("aria-pressed", "true");
      find(root, ".fd-ghost").setAttribute("aria-pressed", "false");
      selectPlate(plate);
    });
    const toggles = {
      ".fd-side": () => { side *= -1; return side < 0; },
      ".fd-outline": () => (outline = !outline),
      ".fd-grid": () => (grid = !grid),
      ".fd-ghost": () => (ghost = !ghost),
    };
    for (const [selector, toggle] of Object.entries(toggles)) {
      const button = find(root, selector);
      button.addEventListener("click", () => {
        button.setAttribute("aria-pressed", String(toggle()));
        update(selector === ".fd-side");
      });
    }
    find(root, ".fd-test").addEventListener("click", () => {
      const { rms } = metrics(basis(read(angle)), read(offset), shapes());
      if (shownDegree < 177) result.textContent = "先把纸合拢到 180°，再核对两面的印迹。";
      else if (rms > .042) result.textContent = "印迹还有错位。对照虚线微调折痕，或试着翻折另一侧。";
      else {
        result.textContent = "套准完成。每对对应点都沿折痕垂直平分。";
        api.complete("完成一次镜像套准", plate.id);
      }
    });

    function resize() {
      view = canvasSize(canvas);
      draw();
    }
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize();
    update();
    api.onCleanup(() => { observer.disconnect(); cancelAnimationFrame(frame); });
  }

  window.LiveStages.register({
    id: "fold", title: "折痕印刷所", subject: "轴对称", style: "撞色套印海报",
    summary: "把折痕当作印版的准星，移动轴线，让折过去的墨迹套准。",
    mount: mountFold,
  });
})();
