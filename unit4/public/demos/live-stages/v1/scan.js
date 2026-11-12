(() => {
  "use strict";

  const size = 76;
  const bins = 111;
  const count = 36;
  const radians = degrees => degrees * Math.PI / 180;
  const constrain = (value, min, max) => Math.min(max, Math.max(min, value));
  const hue = [[16, 33, 35], [47, 53, 104], [160, 66, 128], [248, 127, 108], [255, 232, 169]];
  const specimens = [
    { id: "ceramic", name: "双孔陶片", ellipses: [[0, 0, .71, .56, .62, -.29], [-.29, .08, .15, .17, -.58, 0], [.24, -.13, .13, .15, -.57, 0], [.1, .28, .18, .075, .31, .25]] },
    { id: "layers", name: "三枚夹层", ellipses: [[0, 0, .74, .66, .28, -.16], [-.34, -.18, .16, .26, .52, -.5], [.25, -.25, .14, .18, .67, .6], [.12, .29, .27, .1, .66, -.2]] },
    { id: "ring", name: "偏心环", ellipses: [[.04, .02, .64, .66, .72, .28], [-.09, -.04, .48, .43, -.64, -.15], [-.02, -.02, .13, .14, .85, .15]] },
  ];
  const kernel = Array.from({ length: bins }, (_, offset) => offset === 0 ? .25 : offset % 2 ? -1 / (Math.PI * offset) ** 2 : 0);
  const coordinates = Array.from({ length: size * size }, (_, pixel) => [
    ((pixel % size + .5) / size) * 2 - 1,
    ((Math.floor(pixel / size) + .5) / size) * 2 - 1,
  ]);
  const lookup = Array.from({ length: count }, (_, shot) => {
    const angle = radians(shot * 5);
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    return Float32Array.from(coordinates, ([x, y]) => (bins - 1) * (.5 + (x * dx + y * dy) / 3));
  });

  function truthFor(specimen) {
    return Float32Array.from(coordinates, ([x, y]) => {
      const density = specimen.ellipses.reduce((sum, [cx, cy, a, b, add, turn]) => {
        const rx = Math.cos(turn) * (x - cx) + Math.sin(turn) * (y - cy);
        const ry = Math.cos(turn) * (y - cy) - Math.sin(turn) * (x - cx);
        return sum + (((rx / a) ** 2 + (ry / b) ** 2 <= 1) ? add : 0);
      }, 0);
      return Math.max(0, density);
    });
  }

  function project(truth, positions) {
    const raw = new Float32Array(bins);
    for (let pixel = 0; pixel < truth.length; pixel++) {
      if (truth[pixel] === 0) continue;
      const bin = Math.floor(positions[pixel]);
      const blend = positions[pixel] - bin;
      raw[bin] += truth[pixel] * (1 - blend);
      raw[bin + 1] += truth[pixel] * blend;
    }
    const filtered = Float32Array.from(raw, (_, bin) => raw.reduce(
      (sum, value, otherBin) => sum + value * kernel[Math.abs(bin - otherBin)], 0));
    return { raw, filtered };
  }

  function backProject(shots, views, filter) {
    const result = new Float32Array(size * size);
    for (const shot of shots) {
      const positions = lookup[shot];
      const profile = filter ? views[shot].filtered : views[shot].raw;
      for (let pixel = 0; pixel < result.length; pixel++) {
        const position = positions[pixel];
        const bin = Math.floor(position);
        result[pixel] += profile[bin] + (profile[bin + 1] - profile[bin]) * (position - bin);
      }
    }
    return result;
  }

  function thermal(value) {
    const position = constrain(value, 0, 1) * (hue.length - 1);
    const stop = Math.min(hue.length - 2, Math.floor(position));
    const fraction = position - stop;
    return hue[stop].map((channel, i) => Math.round(channel + (hue[stop + 1][i] - channel) * fraction));
  }

  function renderPixels(canvas, values, gain = 1) {
    const context = canvas.getContext("2d");
    const pixels = context.createImageData(size, size);
    const maximum = Math.max(.0001, ...values);
    for (let pixel = 0; pixel < values.length; pixel++) {
      const [x, y] = coordinates[pixel];
      const value = values[pixel] / maximum * gain;
      const color = thermal(value);
      pixels.data.set([...color, x * x + y * y <= .97 ? 255 : 0], pixel * 4);
    }
    context.putImageData(pixels, 0, 0);
  }

  function fitCanvas(canvas) {
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const pixelWidth = Math.max(1, Math.round(width * ratio));
    const pixelHeight = Math.max(1, Math.round(height * ratio));
    if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
      canvas.width = pixelWidth;
      canvas.height = pixelHeight;
    }
    const context = canvas.getContext("2d");
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, width, height);
    return { context, width, height };
  }

  function mount(root, api) {
    root.innerHTML = `
      <header class="ct-head">
        <div><p>平行束断层成像</p><h2>别切开它<span>。</span></h2></div>
        <p>转动扫描架，收集不同方向的影子。把它们叠回去，看看密封样本里有什么。</p>
      </header>
      <div class="ct-workbench">
        <section class="ct-instrument" aria-label="扫描架">
          <div class="ct-instrument-top"><span>扫描架</span><strong data-ct-angle>0°</strong><span class="ct-cue">拖动转角</span></div>
          <div class="ct-scanner-wrap">
            <canvas class="ct-scanner" role="img" aria-label="旋转的扫描架显示当前角度的一组平行射线。可直接拖动，也可用扫描角度滑杆操作。"></canvas>
          </div>
          <div class="ct-probe">
            <canvas class="ct-profile" aria-hidden="true"></canvas>
            <div><label for="ct-detector">探测通道</label><output for="ct-detector" data-ct-signal></output></div>
            <input id="ct-detector" type="range" min="10" max="100" value="55" aria-label="探测通道">
          </div>
        </section>
        <section class="ct-screen" aria-label="断层监视器">
          <div class="ct-screen-top">
            <div class="ct-tabs" role="group" aria-label="监视器视图">
              <button type="button" data-ct-view="recon" aria-pressed="true">重建</button>
              <button type="button" data-ct-view="film" aria-pressed="false">投影带</button>
              <button type="button" data-ct-view="compare" aria-pressed="false">对照</button>
            </div>
            <span class="ct-count"><b>03</b> / 36</span>
          </div>
          <div class="ct-display" data-view="recon">
            <div class="ct-image-pair">
              <canvas class="ct-result" width="${size}" height="${size}" role="img" aria-label="从已采集投影计算出的重建断面"></canvas>
              <canvas class="ct-reference" width="${size}" height="${size}" role="img" aria-label="真实样本断面" hidden></canvas>
              <i class="ct-divider" aria-hidden="true" hidden></i>
            </div>
            <canvas class="ct-film" role="img" aria-label="横轴为探测通道，纵轴为扫描角度。亮的条带表示密度累积较高。" hidden></canvas>
            <span class="ct-readout">反投影</span>
          </div>
          <div class="ct-screen-foot">
            <label class="ct-compare" hidden>真值占比 <input type="range" id="ct-split" min="0" max="100" value="50"></label>
            <label class="ct-gain">显示对比度 <input type="range" id="ct-gain" min="60" max="170" value="100"></label>
            <button type="button" class="ct-filter" aria-pressed="false">去模糊滤波</button>
          </div>
        </section>
      </div>
      <section class="ct-console" aria-label="扫描控制台">
        <div class="ct-console-transport">
          <label for="ct-angle">扫描角度 <output for="ct-angle">0°</output></label>
          <input id="ct-angle" type="range" min="0" max="175" step="5" value="0">
          <button type="button" class="ct-capture">采集这一角</button>
          <button type="button" class="ct-undo">撤回最近</button>
        </div>
        <div class="ct-console-setup">
          <label for="ct-sample">样本</label><select id="ct-sample">${specimens.map(({ name }, i) => `<option value="${i}">${name}</option>`).join("")}</select>
          <label for="ct-step">扫掠间隔</label><select id="ct-step"><option value="30">30°</option><option value="15" selected>15°</option><option value="5">5°</option></select>
          <button type="button" class="ct-auto" aria-pressed="false">开始扫掠</button>
          <button type="button" class="ct-reset">清空胶片</button>
        </div>
        <div class="ct-strip" aria-label="已采集的角度"></div>
        <div class="ct-result-line"><p class="ct-message" aria-live="polite"></p><details><summary>为什么要从多角度扫描？</summary><p>每条射线记录路径上的密度总和。反投影把读数涂回路径，方向少时会留下条纹。平行束的相反方向给出互为镜像的投影，旋转半圈便已覆盖所有方向。图像各自归一化，适合比较结构。</p></details></div>
      </section>`;

    const find = selector => root.querySelector(selector);
    const scanner = find(".ct-scanner");
    const profile = find(".ct-profile");
    const resultCanvas = find(".ct-result");
    const refCanvas = find(".ct-reference");
    const film = find(".ct-film");
    const sample = find("#ct-sample");
    const angleInput = find("#ct-angle");
    const probe = find("#ct-detector");
    const contrast = find("#ct-gain");
    const split = find("#ct-split");
    const pair = find(".ct-image-pair");
    const capture = find(".ct-capture");
    const undo = find(".ct-undo");
    const auto = find(".ct-auto");
    const message = find(".ct-message");
    const strip = find(".ct-strip");
    const filterButton = find(".ct-filter");
    const viewButtons = [...root.querySelectorAll("[data-ct-view]")];
    const reduced = matchMedia("(prefers-reduced-motion: reduce)");
    let truth;
    let views;
    let shots = [0, 9, 18];
    let filtered = false;
    let view = "recon";
    let angle = 0;
    let shownAngle = 0;
    let sweep = null;
    let frame = 0;
    let pulseAt = -Infinity;
    let heldPointer = null;
    let emitted = false;

    function loadSample() {
      truth = truthFor(specimens[Number(sample.value)]);
      views = lookup.map(positions => project(truth, positions));
    }

    function drawScanner() {
      const { context: ctx, width, height } = fitCanvas(scanner);
      const radius = Math.min(width, height) * .422;
      const centerX = width * .5;
      const centerY = height * .515;
      ctx.translate(centerX, centerY);
      const radial = ctx.createRadialGradient(-radius * .29, -radius * .32, radius * .08, 0, 0, radius * 1.07);
      radial.addColorStop(0, "#f3fff2");
      radial.addColorStop(.58, "#cddfd2");
      radial.addColorStop(1, "#78968c");
      function circle(r, color, stroke, weight = 1) {
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, Math.PI * 2);
        if (color) { ctx.fillStyle = color; ctx.fill(); }
        if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = weight; ctx.stroke(); }
      }
      ctx.shadowColor = "#173e3b4a";
      ctx.shadowBlur = 25;
      ctx.shadowOffsetY = 10;
      circle(radius, radial, "#335a57", 1.5);
      ctx.shadowColor = "transparent";
      circle(radius * .905, "#d8eadb", "#698b81");
      circle(radius * .715, "#243d3b", "#9eac9d", 2);
      circle(radius * .655, "#496d64", "#b0c9ad");
      circle(radius * .59, null, "#b3caba89");
      ctx.font = `750 ${Math.max(8, radius * .071)}px Inter, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      for (let tick = 0; tick < 72; tick++) {
        const angle = tick * Math.PI / 36;
        const start = tick % 6 === 0 ? .805 : .86;
        ctx.strokeStyle = shots.includes(tick % count) ? "#ad4969" : "#4e7368";
        ctx.lineWidth = shots.includes(tick % count) ? 2.5 : 1;
        ctx.beginPath();
        ctx.moveTo(Math.sin(angle) * radius * start, -Math.cos(angle) * radius * start);
        ctx.lineTo(Math.sin(angle) * radius * .892, -Math.cos(angle) * radius * .892);
        ctx.stroke();
        if (tick % 12 === 0) {
          ctx.fillStyle = "#3e655c";
          ctx.fillText(`${tick * 5 % 180}°`, Math.sin(angle) * radius * .755, -Math.cos(angle) * radius * .755);
        }
      }
      ctx.save();
      ctx.rotate(radians(shownAngle));
      for (let i = 18; i < bins - 18; i += 4) {
        const x = (i / (bins - 1) - .5) * radius * 1.3;
        ctx.strokeStyle = i % 8 === 2 ? "#c6ffab44" : "#a7dfc82e";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x, -radius * .69);
        ctx.lineTo(x, radius * .69);
        ctx.stroke();
      }
      const line = (Number(probe.value) / (bins - 1) - .5) * radius * 1.3;
      ctx.shadowBlur = 8;
      ctx.shadowColor = "#e8fbb6";
      ctx.strokeStyle = "#e8fbb6";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(line, -radius * .68);
      ctx.lineTo(line, radius * .69);
      ctx.stroke();
      ctx.shadowColor = "transparent";
      const pulse = (performance.now() - pulseAt) / 380;
      if (pulse < 1 && !reduced.matches) {
        const distance = (pulse * 1.38 - .69) * radius;
        ctx.globalAlpha = (1 - pulse) * .84;
        ctx.shadowColor = "#dcffa6";
        ctx.shadowBlur = 21;
        ctx.strokeStyle = "#ddffac";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(-radius * .48, distance);
        ctx.lineTo(radius * .48, distance);
        ctx.stroke();
        ctx.globalAlpha = 1;
        ctx.shadowColor = "transparent";
      }
      ctx.fillStyle = "#c5edaa";
      ctx.strokeStyle = "#253c38";
      ctx.lineWidth = 1.7;
      for (const sign of [-1, 1]) {
        const w = radius * .82;
        const y = sign * radius * .69 - radius * .047;
        ctx.beginPath();
        ctx.roundRect(-w / 2, y, w, radius * .094, radius * .045);
        ctx.fill();
        ctx.stroke();
      }
      ctx.restore();
      ctx.fillStyle = "#ddf3ce";
      ctx.font = `700 ${Math.max(9, radius * .073)}px Inter, sans-serif`;
      ctx.fillText("密封样本", 0, 2);
    }

    function animateScanner() {
      if (frame) return;
      function draw() {
        const difference = (angle - shownAngle + 540) % 360 - 180;
        const rotating = Math.abs(difference) >= .6;
        if ((!rotating && performance.now() - pulseAt >= 380) || reduced.matches) {
          frame = 0;
          shownAngle = angle;
          drawScanner();
          return;
        }
        if (rotating) shownAngle += difference * .27;
        drawScanner();
        frame = requestAnimationFrame(draw);
      }
      if (reduced.matches) draw();
      else frame = requestAnimationFrame(draw);
    }

    function drawProfile() {
      const { context: ctx, width, height } = fitCanvas(profile);
      const values = views[angle / 5].raw;
      const maximum = Math.max(...values, .01);
      const index = Number(probe.value);
      ctx.strokeStyle = "#345b50";
      ctx.fillStyle = "#a9c4a951";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(0, height - 2);
      for (let i = 0; i < bins; i++) ctx.lineTo(i / (bins - 1) * width, height - 2 - values[i] / maximum * (height - 6));
      ctx.lineTo(width, height - 2);
      ctx.fill();
      ctx.stroke();
      ctx.strokeStyle = "#a73963";
      ctx.beginPath();
      ctx.moveTo(index / (bins - 1) * width, 0);
      ctx.lineTo(index / (bins - 1) * width, height);
      ctx.stroke();
      probe.setAttribute("aria-valuetext", `通道 ${index}，密度和 ${values[index].toFixed(1)}`);
      find("[data-ct-signal]").textContent = `${String(index).padStart(2, "0")} / 密度和 ${values[index].toFixed(1)}`;
    }

    function drawFilm() {
      if (view !== "film") return;
      const { context: ctx, width, height } = fitCanvas(film);
      const cellWidth = width / bins;
      const cellHeight = height / count;
      ctx.fillStyle = "#243835";
      ctx.fillRect(0, 0, width, height);
      for (const shot of shots) {
        const values = views[shot].raw;
        const maximum = Math.max(.001, ...values);
        for (let i = 0; i < bins; i++) {
          ctx.fillStyle = `rgb(${thermal(values[i] / maximum).join(",")})`;
          ctx.fillRect(i * cellWidth, shot * cellHeight + 1, cellWidth + .4, cellHeight - 1);
        }
      }
      ctx.strokeStyle = "#e9fda9";
      ctx.lineWidth = 1;
      ctx.strokeRect(.5, angle / 5 * cellHeight + .5, width - 1, cellHeight - 1);
    }

    function updateImage() {
      if (view === "film") {
        drawFilm();
        return;
      }
      const gain = Number(contrast.value) / 100;
      renderPixels(resultCanvas, backProject(shots, views, filtered), gain);
      if (view === "compare") renderPixels(refCanvas, truth, gain);
    }

    function updateAngle(next) {
      angle = constrain(next, 0, 175);
      angleInput.value = angle;
      angleInput.setAttribute("aria-valuetext", `${angle} 度`);
      find("[data-ct-angle]").textContent = `${angle}°`;
      find(".ct-console-transport output").textContent = `${angle}°`;
      capture.disabled = shots.includes(angle / 5);
      strip.querySelectorAll("button").forEach(button => button.setAttribute("aria-pressed", String(Number(button.dataset.shot) * 5 === angle)));
      animateScanner();
      drawProfile();
      drawFilm();
    }

    function verify() {
      const order = [...shots].sort((a, b) => a - b);
      const evenCoverage = shots.length >= 12 && filtered &&
        order.every((shot, i) => (order[(i + 1) % order.length] - shot + count) % count <= 6);
      if (evenCoverage && !emitted) {
        emitted = true;
        api.complete("断面已成像。多角度投影与滤波让样本内部结构显现。", specimens[Number(sample.value)].id);
      } else if (!evenCoverage && emitted) {
        emitted = false;
        api.reset();
      }
      return evenCoverage;
    }

    function updateShots(text) {
      find(".ct-count b").textContent = String(shots.length).padStart(2, "0");
      strip.replaceChildren(...[...shots].sort((a, b) => a - b).map(shot => {
        const button = document.createElement("button");
        button.type = "button";
        button.dataset.shot = shot;
        button.textContent = `${shot * 5}°`;
        button.addEventListener("click", () => { stopSweep(); updateAngle(shot * 5); });
        return button;
      }));
      undo.disabled = shots.length === 0;
      updateAngle(angle);
      updateImage();
      if (verify()) text = "角度已均匀覆盖半圈。打开「对照」，拖动分界线核对截面。";
      if (message.textContent !== text) message.textContent = text;
    }

    function takeShot(note) {
      if (shots.includes(angle / 5)) return;
      shots.push(angle / 5);
      pulseAt = performance.now();
      updateShots(note);
    }

    function stopSweep() {
      clearInterval(sweep);
      sweep = null;
      auto.textContent = "开始扫掠";
      auto.setAttribute("aria-pressed", "false");
    }

    function updateView(next) {
      view = next;
      const isFilm = view === "film";
      const isCompare = view === "compare";
      find(".ct-display").dataset.view = view;
      film.hidden = !isFilm;
      pair.hidden = isFilm;
      refCanvas.hidden = !isCompare;
      find(".ct-divider").hidden = !isCompare;
      find(".ct-compare").hidden = !isCompare;
      find(".ct-gain").hidden = isFilm;
      find(".ct-readout").textContent = isFilm ? "投影带 / 0–175°" : isCompare ? "重建 / 真值" : filtered ? "滤波反投影" : "反投影";
      for (const button of viewButtons) button.setAttribute("aria-pressed", String(button.dataset.ctView === view));
      updateImage();
    }

    function changeFromPointer(event) {
      const bounds = scanner.getBoundingClientRect();
      const x = event.clientX - bounds.left - bounds.width / 2;
      const y = event.clientY - bounds.top - bounds.height * .515;
      const degrees = Math.atan2(x, -y) * 180 / Math.PI;
      updateAngle((Math.round(degrees / 5) * 5 + 360) % 180);
    }

    scanner.addEventListener("pointerdown", event => {
      if (heldPointer !== null || event.button !== 0) return;
      stopSweep();
      heldPointer = event.pointerId;
      scanner.setPointerCapture(heldPointer);
      changeFromPointer(event);
    });
    scanner.addEventListener("pointermove", event => {
      if (heldPointer === event.pointerId) changeFromPointer(event);
    });
    for (const type of ["pointerup", "pointercancel", "lostpointercapture"]) {
      scanner.addEventListener(type, event => { if (heldPointer === event.pointerId) heldPointer = null; });
    }
    profile.addEventListener("click", event => {
      const bounds = profile.getBoundingClientRect();
      probe.value = Math.round((event.clientX - bounds.left) / bounds.width * (bins - 1));
      drawProfile();
      animateScanner();
    });
    angleInput.addEventListener("input", () => { stopSweep(); updateAngle(Number(angleInput.value)); });
    probe.addEventListener("input", () => { drawProfile(); animateScanner(); });
    contrast.addEventListener("input", updateImage);
    function syncDivider() {
      pair.style.setProperty("--ct-split", `${100 - Number(split.value)}%`);
    }
    function dragDivider(event) {
      const bounds = pair.getBoundingClientRect();
      split.value = constrain(Math.round(100 * (1 - (event.clientX - bounds.left) / bounds.width)), 0, 100);
      syncDivider();
    }
    split.addEventListener("input", syncDivider);
    pair.addEventListener("pointerdown", event => {
      if (view !== "compare" || event.button !== 0) return;
      pair.setPointerCapture(event.pointerId);
      dragDivider(event);
    });
    pair.addEventListener("pointermove", event => {
      if (view === "compare" && pair.hasPointerCapture(event.pointerId)) dragDivider(event);
    });
    for (const button of viewButtons) button.addEventListener("click", () => updateView(button.dataset.ctView));
    capture.addEventListener("click", () => { stopSweep(); takeShot(`已采集 ${angle}°。换一个方向，观察条纹怎样交汇。`); angleInput.focus(); });
    undo.addEventListener("click", () => { stopSweep(); shots.pop(); updateShots("已撤回最近一张投影。"); });
    find(".ct-reset").addEventListener("click", () => { stopSweep(); shots = []; updateShots("胶片已清空。可以从任意方向开始采集。"); });
    filterButton.addEventListener("click", () => {
      filtered = !filtered;
      filterButton.setAttribute("aria-pressed", String(filtered));
      updateView(view);
      updateShots(filtered ? "已启用去模糊滤波。试着增加投影角度。" : "已切回直接反投影。观察长条状拖影。");
    });
    sample.addEventListener("change", () => {
      stopSweep();
      shots = [];
      loadSample();
      updateShots("样本已更换。请为这个样本重新采集投影。");
    });
    auto.addEventListener("click", () => {
      if (sweep !== null) { stopSweep(); updateShots("扫掠已暂停。当前采集保留。"); return; }
      const increment = Number(find("#ct-step").value);
      let next = 0;
      auto.textContent = "暂停扫掠";
      auto.setAttribute("aria-pressed", "true");
      function sweepNext() {
        if (next >= 180) {
          stopSweep();
          updateShots("扫掠结束。缩小间隔可增加采集方向。");
          return;
        }
        updateAngle(next);
        takeShot("正在逐角采集。");
        next += increment;
      }
      sweepNext();
      sweep = setInterval(sweepNext, reduced.matches ? 45 : 115);
    });
    const observer = new ResizeObserver(() => {
      drawScanner();
      if (views) { drawProfile(); drawFilm(); }
    });
    observer.observe(scanner);
    observer.observe(film);
    api.onCleanup(() => {
      observer.disconnect();
      stopSweep();
      cancelAnimationFrame(frame);
    });
    loadSample();
    updateShots("已放入 3 张示范投影。试着补齐半圈，并打开去模糊滤波。");
  }

  window.LiveStages.register({
    id: "scan",
    title: "别切开它",
    subject: "断层成像",
    style: "复古医学仪器",
    summary: "转动扫描架，从各个方向的投影拼回密封样本的断面。",
    mount,
  });
})();
