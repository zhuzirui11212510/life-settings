(() => {
  "use strict";

  const radians = degrees => degrees * Math.PI / 180;
  const latitude = radians(30);
  const footprint = [[-1.45, -1.15], [1.45, -1.15], [1.45, 1.15], [-1.45, 1.15]];
  const site = [[-10, -9], [10, -9], [10, 9], [-10, 9]];
  const targets = [
    { id: "west", label: "西侧", position: [-4, 5] },
    { id: "center", label: "中庭", position: [0, 5] },
    { id: "east", label: "东侧", position: [4, 5] },
  ];
  const targetRadius = .68;
  const cross = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  const formatTime = minute => `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;

  function convexHull(points) {
    const sorted = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    function chain(ordered) {
      const edge = [];
      for (const point of ordered) {
        while (edge.length >= 2 && cross(edge.at(-2), edge.at(-1), point) <= 0) edge.pop();
        edge.push(point);
      }
      return edge.slice(0, -1);
    }
    return [...chain(sorted), ...chain(sorted.reverse())];
  }

  function solarModel(minute, height) {
    const hourAngle = radians((minute - 720) / 4);
    const east = -Math.sin(hourAngle);
    const north = -Math.sin(latitude) * Math.cos(hourAngle);
    const up = Math.cos(latitude) * Math.cos(hourAngle);
    const dx = -height * east / up;
    const dy = -height * north / up;
    return {
      dx, dy,
      elevation: Math.asin(up) * 180 / Math.PI,
      length: Math.hypot(dx, dy),
      silhouette: convexHull([...footprint, ...footprint.map(([x, y]) => [x + dx, y + dy])]),
    };
  }

  function clearsTarget(silhouette, target) {
    return silhouette.every((start, index) => {
      const end = silhouette[(index + 1) % silhouette.length];
      const edgeLength = Math.hypot(end[0] - start[0], end[1] - start[1]);
      return cross(start, end, target) / edgeLength >= targetRadius;
    });
  }

  function mount(root, api) {
    root.innerHTML = `
      <header class="sun-header">
        <div>
          <p class="sun-series">建筑日照研究 / Solar study</p>
          <h2>借一片影子</h2>
        </div>
        <p>选中一座树池，再调节当地太阳时和塔楼高度，直到阴影盖住整座树池。</p>
      </header>
      <div class="sun-layout">
        <figure class="sun-figure">
          <div class="sun-figure-bar">
            <span class="sun-plate">图 A / 春分日</span>
            <div class="sun-views" role="group" aria-label="视角">
              <button type="button" data-sun-view="axon" aria-pressed="true">轴测</button>
              <button type="button" data-sun-view="plan" aria-pressed="false">俯视</button>
            </div>
          </div>
          <canvas class="sun-canvas" role="img" aria-label="随太阳时与塔高变化的广场阴影图"></canvas>
          <figcaption><span><i></i>塔楼</span><span><i></i>阴影</span><span><i></i>树池</span><span class="sun-location">北纬 30°</span></figcaption>
        </figure>
        <div class="sun-controls">
          <div class="sun-controls-head"><h3>场地参数</h3><button type="button" class="sun-reset">重置 ↺</button></div>
          <div class="sun-input">
            <label for="sun-time">当地太阳时</label><output id="sun-time-value" for="sun-time"></output>
            <input id="sun-time" type="range" min="450" max="990" value="570" step="5">
            <div class="sun-moments" role="group" aria-label="时间预设">
              <button type="button" data-sun-time="540">09:00</button>
              <button type="button" data-sun-time="720">12:00</button>
              <button type="button" data-sun-time="900">15:00</button>
              <button type="button" class="sun-play" aria-pressed="false">播放日照</button>
            </div>
          </div>
          <div class="sun-input">
            <label for="sun-height">塔楼高度</label><output id="sun-height-value" for="sun-height"></output>
            <input id="sun-height" type="range" min="3" max="14" value="7" step=".5">
            <div class="sun-scale" aria-hidden="true"><span>3 m</span><span>14 m</span></div>
          </div>
          <div class="sun-target">
            <span>树池位置</span>
            <div role="group" aria-label="树池位置">
              ${targets.map((target, index) => `<button type="button" data-sun-target="${index}" aria-pressed="${index === 0}">${target.label}</button>`).join("")}
            </div>
          </div>
          <dl class="sun-metrics">
            <div><dt>太阳高度角</dt><dd id="sun-elevation"></dd></div>
            <div><dt>塔顶影距</dt><dd id="sun-distance"></dd></div>
          </dl>
          <p class="sun-feedback" role="status"></p>
          <details class="sun-theory">
            <summary>影长是怎么算的？</summary>
            <p>塔顶影距 = 塔高 ÷ tan(太阳高度角)。中午太阳最高，影子朝北且最短。图中以春分日、水平地面和平行光线近似。</p>
          </details>
        </div>
      </div>`;

    const find = selector => root.querySelector(selector);
    const clock = find("#sun-time");
    const tower = find("#sun-height");
    const canvas = find("canvas");
    const ctx = canvas.getContext("2d");
    const feedback = find(".sun-feedback");
    const play = find(".sun-play");
    const viewButtons = [...root.querySelectorAll("[data-sun-view]")];
    const targetButtons = [...root.querySelectorAll("[data-sun-target]")];
    const timeButtons = [...root.querySelectorAll("[data-sun-time]")];
    let view = "axon";
    let targetIndex = 0;
    let timer = null;
    let mapMarkers = [];

    function draw(model, height, covered) {
      const width = canvas.clientWidth;
      const canvasHeight = canvas.clientHeight;
      if (width === 0 || canvasHeight === 0) return;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(canvasHeight * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const axon = view === "axon";
      const scale = Math.min(width / (axon ? 29 : 24), canvasHeight / (axon ? 20 : 21.2));
      const project = ([x, y, z = 0]) => axon
        ? [width * .5 + (.88 * x - .74 * y) * scale, canvasHeight * .63 + (.38 * x + .34 * y - .84 * z) * scale]
        : [width * .5 + x * scale, canvasHeight * .5 - y * scale];
      mapMarkers = targets.map(({ position }) => project(position));

      function path(points, { fill, stroke, lineWidth = 1, close = true } = {}) {
        ctx.beginPath();
        points.forEach((point, index) => {
          const [x, y] = project(point);
          if (index === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        });
        if (close) ctx.closePath();
        if (fill) { ctx.fillStyle = fill; ctx.fill(); }
        if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lineWidth; ctx.stroke(); }
      }

      path(site, { fill: "#eeebe0", stroke: "#898a7d" });
      for (let x = -9; x <= 9; x++) path([[x, -9], [x, 9]], { stroke: "#cccbbe", lineWidth: .6, close: false });
      for (let y = -8; y <= 8; y++) path([[-10, y], [10, y]], { stroke: "#cccbbe", lineWidth: .6, close: false });
      ctx.save();
      path(site);
      ctx.clip();
      path(model.silhouette, { fill: "#293b4668", stroke: "#455965" });
      ctx.setLineDash([4, 3]);
      path([[0, 0], [model.dx, model.dy]], { stroke: "#324653", close: false });
      ctx.restore();

      targets.forEach(({ position: [x, y], label }, index) => {
        const chosen = index === targetIndex;
        const ring = Array.from({ length: 36 }, (_, i) => {
          const angle = i * Math.PI / 18;
          return [x + targetRadius * Math.cos(angle), y + targetRadius * Math.sin(angle)];
        });
        path(ring, {
          fill: chosen ? (covered ? "#315942" : "#faf9ed") : "#efecdfa3",
          stroke: chosen ? "#315942" : "#96998a",
          lineWidth: chosen ? 1.7 : .8,
        });
        const [px, py] = project([x, y]);
        ctx.fillStyle = chosen && covered ? "#ffffff" : "#314537";
        ctx.font = `700 ${width < 390 ? 9 : 11}px 'Microsoft YaHei', sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(label.slice(0, 1), px, py + .5);
      });

      if (axon) {
        const upper = footprint.map(([x, y]) => [x, y, height]);
        path([footprint[1], footprint[2], upper[2], upper[1]], { fill: "#a3361d", stroke: "#6e2d1f" });
        path([footprint[2], footprint[3], upper[3], upper[2]], { fill: "#cd4d26", stroke: "#6e2d1f" });
        path(upper, { fill: "#fa9d6c", stroke: "#6e2d1f" });
        for (let z = 1.5; z < height; z += 1.5) {
          path([[1.45, 1.15, z], [-1.45, 1.15, z]], { stroke: "#ffbf8e9e", close: false });
          path([[1.45, -1.15, z], [1.45, 1.15, z]], { stroke: "#ffbf8e66", close: false });
        }
      } else {
        path(footprint, { fill: "#df633a", stroke: "#712d1c" });
        for (let x = -1.1; x <= 1.35; x += .33) {
          path([[x, -1.15], [x, 1.15]], { stroke: "#ffcf9e", lineWidth: .7, close: false });
        }
      }

      ctx.save();
      ctx.translate(31, 42);
      if (axon) ctx.rotate(-2.0);
      ctx.strokeStyle = "#2d3938";
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.moveTo(0, 13); ctx.lineTo(0, -13);
      ctx.moveTo(-4, -7); ctx.lineTo(0, -13); ctx.lineTo(4, -7);
      ctx.stroke();
      ctx.restore();
      ctx.fillStyle = "#2d3938";
      ctx.font = "700 10px Arial, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("N", axon ? 12 : 31, axon ? 48 : 22);
      const barWidth = scale * 3 * (axon ? Math.hypot(.88, .38) : 1);
      ctx.beginPath();
      ctx.moveTo(width - 20 - barWidth, canvasHeight - 21);
      ctx.lineTo(width - 20, canvasHeight - 21);
      ctx.strokeStyle = "#2d3938";
      ctx.stroke();
      ctx.fillText("3 m", width - 20 - barWidth / 2, canvasHeight - 12);
    }

    function render() {
      const minute = Number(clock.value);
      const height = Number(tower.value);
      const model = solarModel(minute, height);
      const target = targets[targetIndex];
      const covered = clearsTarget(model.silhouette, target.position);
      find("#sun-time-value").textContent = formatTime(minute);
      clock.setAttribute("aria-valuetext", formatTime(minute));
      find("#sun-height-value").textContent = `${height} m`;
      tower.setAttribute("aria-valuetext", `${height} 米`);
      find("#sun-elevation").textContent = `${model.elevation.toFixed(1)}°`;
      find("#sun-distance").textContent = `${model.length.toFixed(1)} m`;
      for (const button of viewButtons) button.setAttribute("aria-pressed", String(button.dataset.sunView === view));
      for (const button of targetButtons) button.setAttribute("aria-pressed", String(Number(button.dataset.sunTarget) === targetIndex));
      for (const button of timeButtons) button.setAttribute("aria-pressed", String(Number(button.dataset.sunTime) === minute));
      const message = covered ? `${target.label}树池已完全进入阴影。` : `${target.label}树池还有一部分露在阴影外。试着调整太阳时或塔高。`;
      if (feedback.textContent !== message) feedback.textContent = message;
      feedback.dataset.covered = String(covered);
      draw(model, height, covered);
      if (covered) api.complete(target.id);
      else api.resetResult();
    }

    function stopPlayback() {
      clearInterval(timer);
      timer = null;
      play.textContent = "播放日照";
      play.setAttribute("aria-pressed", "false");
    }

    function markerAt(event) {
      const bounds = canvas.getBoundingClientRect();
      const x = event.clientX - bounds.left;
      const y = event.clientY - bounds.top;
      return mapMarkers.findIndex(([px, py]) => Math.hypot(px - x, py - y) < 17);
    }

    function selectTarget(index) {
      targetIndex = index;
      render();
    }

    for (const button of viewButtons) button.addEventListener("click", () => { view = button.dataset.sunView; render(); });
    for (const button of targetButtons) button.addEventListener("click", () => selectTarget(Number(button.dataset.sunTarget)));
    for (const button of timeButtons) button.addEventListener("click", () => {
      stopPlayback();
      clock.value = button.dataset.sunTime;
      render();
    });
    play.addEventListener("click", () => {
      if (timer !== null) {
        stopPlayback();
        return;
      }
      if (clock.value === clock.max) clock.value = clock.min;
      render();
      play.textContent = "暂停";
      play.setAttribute("aria-pressed", "true");
      timer = setInterval(() => {
        clock.value = Number(clock.value) + 5;
        render();
        if (clock.value === clock.max) stopPlayback();
      }, 80);
    });
    canvas.addEventListener("pointermove", event => { canvas.style.cursor = markerAt(event) < 0 ? "" : "pointer"; });
    canvas.addEventListener("click", event => {
      const marker = markerAt(event);
      if (marker >= 0) selectTarget(marker);
    });
    clock.addEventListener("input", () => { stopPlayback(); render(); });
    tower.addEventListener("input", render);
    find(".sun-reset").addEventListener("click", () => {
      stopPlayback();
      clock.value = clock.defaultValue;
      tower.value = tower.defaultValue;
      view = "axon";
      targetIndex = 0;
      render();
    });
    const observer = new ResizeObserver(render);
    observer.observe(canvas);
    api.onCleanup(() => {
      observer.disconnect();
      stopPlayback();
    });
    render();
  }

  window.Atlas.register({
    id: "shadow",
    title: "借一片影子",
    subject: "建筑日照",
    style: "建筑事务所图纸",
    summary: "用塔楼为广场树池提供一片阴影。",
    action: "选择树池位置，拖动太阳时和塔高，切换俯视和轴测来确认覆盖范围。",
    mount,
  });
})();
