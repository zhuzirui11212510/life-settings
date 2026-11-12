(() => {
  "use strict";

  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const choose = (root, selector, attribute, value) => {
    root.querySelectorAll(selector).forEach(button => {
      button.setAttribute("aria-pressed", String(button.dataset[attribute] === String(value)));
    });
  };

  // Metro graph. Time includes two minutes on each change of line.
  const stops = {
    dock: ["西码头", 11, 57], lane: ["巷口", 27, 57], plaza: ["广场", 43, 40],
    museum: ["博物馆", 62, 40], east: ["东站", 87, 40],
    westbank: ["河西", 26, 18], eastbank: ["河东", 58, 18],
    hall: ["剧场", 69, 65], air: ["机场", 87, 81], yard: ["南仓", 48, 81],
  };
  const tracks = [
    ["dock", "lane", "red", 3], ["lane", "plaza", "red", 4],
    ["plaza", "museum", "red", 3], ["museum", "east", "red", 4],
    ["dock", "westbank", "blue", 6], ["westbank", "eastbank", "blue", 8],
    ["eastbank", "east", "blue", 8], ["eastbank", "plaza", "blue", 5],
    ["lane", "yard", "ochre", 4], ["yard", "hall", "ochre", 4],
    ["hall", "air", "ochre", 4], ["air", "east", "ochre", 4],
    ["plaza", "hall", "green", 4], ["hall", "east", "green", 5],
  ];
  const lineColors = { red: "#d44739", blue: "#466eb4", ochre: "#b47b12", green: "#18836b" };
  const lineNames = { red: "红线", blue: "蓝线", ochre: "金线", green: "绿线" };
  const routeModes = { fast: "最省时", changes: "少换乘", stops: "少停站" };

  function route(from, to, closures, mode) {
    const key = node => node.stop + "/" + node.line;
    function score(node) {
      if (mode === "changes") return [node.changes, node.minutes, node.legs.length];
      if (mode === "stops") return [node.legs.length, node.minutes, node.changes];
      return [node.minutes, node.changes, node.legs.length];
    }
    function compare(first, second) {
      const a = score(first);
      const b = score(second);
      return a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
    }
    const start = { stop: from, line: "", minutes: 0, changes: 0, legs: [] };
    const queue = [start];
    const visited = new Set();
    while (queue.length) {
      queue.sort(compare);
      const next = queue.shift();
      if (visited.has(key(next))) continue;
      if (next.stop === to) return next;
      visited.add(key(next));
      tracks.forEach(([a, b, line, cost], id) => {
        if (closures.has(id) || ![a, b].includes(next.stop)) return;
        const change = Number(Boolean(next.line) && next.line !== line);
        const dest = next.stop === a ? b : a;
        const minutes = cost + 2 * change;
        queue.push({
          stop: dest, line,
          minutes: next.minutes + minutes,
          changes: next.changes + change,
          legs: [...next.legs, { id, from: next.stop, to: dest, line, minutes, ride: cost }],
        });
      });
    }
    return null;
  }

  window.LiveStages.register({
    id: "metro",
    title: "末班车调度局",
    subject: "图论 / 路径优化",
    style: "珐琅线网牌",
    summary: "封闭一段铁轨，临时改写末班车的调度图。",
    mount(root, api) {
      root.innerHTML = `
        <header class="metro-head"><span class="metro-sign" aria-hidden="true">M</span><div><p>城市线路调度处</p><h2>末班车调度局</h2></div><p class="metro-decree">广场到博物馆临时施工。给西码头的乘客找一条到东站的新路线，再发车验证。</p></header>
        <div class="metro-yard">
          <div class="metro-strip">
            <div class="metro-tools" role="group" aria-label="地图工具"><button data-mtool="from">设起点</button><button data-mtool="to">设终点</button><button data-mtool="close">封闭区间</button></div>
            <div class="metro-tools metro-rules" role="group" aria-label="计算规则">${Object.entries(routeModes).map(([key, name]) => `<button data-mrule="${key}">${name}</button>`).join("")}</div>
          </div>
          <div class="metro-map" aria-label="线路图">
            <div class="metro-line-key" aria-hidden="true">${Object.keys(lineNames).map(line => `<span style="--mkey:${lineColors[line]}">${lineNames[line]}</span>`).join("")}</div>
            <canvas aria-hidden="true"></canvas>
            <div class="metro-station-layer">${Object.entries(stops).map(([id, [label, x, y]]) => `<button data-mstop="${id}" style="--mx:${x}%;--my:${y}%"><i aria-hidden="true"></i><span>${label}</span></button>`).join("")}</div>
            <div class="metro-switches" hidden>${tracks.map(([a, b, line, cost], id) => `<button data-mtrack="${id}" style="--mx:${(stops[a][1] + stops[b][1])/2}%;--my:${(stops[a][2] + stops[b][2])/2}%" aria-label="${stops[a][0]}到${stops[b][0]}，${lineNames[line]}，${cost}分钟"><span aria-hidden="true">×</span></button>`).join("")}</div>
          </div>
          <div class="metro-mapnote"><span class="metro-hint"></span><div><button data-mcost aria-pressed="false">标出区间时间</button><button data-mreference aria-pressed="false">叠加常态路线</button><button data-mworks>施工预设</button><button data-mreset>恢复全线</button></div></div>
        </div>
        <section class="metro-ticket" aria-label="行车票">
          <div class="metro-ticket-title"><span>临时行车票</span><strong></strong><small></small></div>
          <div class="metro-ticket-body"><div class="metro-metrics"></div><div class="metro-itinerary"></div><div class="metro-playback"><button data-mplay>发车</button><button data-mstep>走一站</button><label><span class="metro-clock"></span><input type="range" min="0" max="14" value="0" step=".1" aria-label="行车进度"></label></div></div>
        </section>
        <p class="metro-status" aria-live="polite"></p>
        <details class="metro-notes"><summary>路线怎样算出来？</summary><p>车站与区间组成一张图，每段区间有行车时间。换线加 2 分钟，封闭区间从图上移除。不同规则优先比较总时间、换乘次数或停站数，遇到相同结果时再比较其他指标。</p></details>
      `;
      const find = selector => root.querySelector(selector);
      const canvas = find("canvas");
      const context = canvas.getContext("2d");
      const slider = find('input[type="range"]');
      const play = find("[data-mplay]");
      const step = find("[data-mstep]");
      const status = find(".metro-status");
      const switches = find(".metro-switches");
      const closures = new Set();
      let from = "dock";
      let to = "east";
      let mode = "fast";
      let tool = "to";
      let result = null;
      let baseline = null;
      let elapsed = 0;
      let frame = 0;
      let routeFrame = 0;
      let routeBlend = 1;
      let running = false;
      let showCosts = false;
      let showReference = false;
      let previousTime = 0;
      let width = 0;
      let height = 0;

      function screen(id) {
        return [stops[id][1] * width / 100, stops[id][2] * height / 100];
      }

      function stroke(a, b, color, thickness, dash = []) {
        context.beginPath();
        context.strokeStyle = color;
        context.lineWidth = thickness;
        context.setLineDash(dash);
        context.lineCap = "round";
        context.moveTo(...a);
        context.lineTo(...b);
        context.stroke();
        context.setLineDash([]);
      }

      function draw() {
        if (!width || !height) return;
        context.clearRect(0, 0, width, height);
        const chosen = new Set(result?.legs.map(leg => leg.id));
        const thin = width < 440;
        tracks.forEach(([a, b, line], id) => {
          if (closures.has(id)) {
            stroke(screen(a), screen(b), "#746e5d", thin ? 2 : 3, [4, 7]);
          } else {
            stroke(screen(a), screen(b), lineColors[line] + "72", thin ? 4 : 7);
            if (chosen.has(id)) {
              context.globalAlpha = routeBlend;
              stroke(screen(a), screen(b), lineColors[line], thin ? 4 : 7);
              context.globalAlpha = 1;
            }
          }
        });
        if (showReference) {
          for (const leg of baseline.legs) {
            if (!chosen.has(leg.id)) stroke(screen(leg.from), screen(leg.to), "#493e75", thin ? 2 : 3, [2,4]);
          }
        }
        if (showCosts && tool !== "close") {
          context.font = `700 ${thin ? 10 : 12}px Arial, sans-serif`;
          context.textAlign = "center";
          context.textBaseline = "middle";
          tracks.forEach(([a,b,line,cost],id) => {
            if (closures.has(id)) return;
            const start = screen(a);
            const end = screen(b);
            const x = (start[0] + end[0]) * .5;
            const y = (start[1] + end[1]) * .5;
            context.fillStyle = "#f9f0d7";
            context.fillRect(x - 11,y - 7,22,14);
            context.fillStyle = lineColors[line];
            context.fillText(String(cost),x,y);
          });
        }
        let remaining = elapsed;
        let marker = screen(from);
        if (result) {
          for (const leg of result.legs) {
            if (remaining <= 0) break;
            const a = screen(leg.from);
            const b = screen(leg.to);
            const fraction = clamp((remaining - (leg.minutes - leg.ride)) / leg.ride, 0, 1);
            marker = a.map((coord, index) => coord + (b[index] - coord) * fraction);
            stroke(a, marker, "#253e32", thin ? 2 : 3, [1, 6]);
            remaining -= leg.minutes;
          }
        }
        if (elapsed > 0) {
          context.fillStyle = "#263f33";
          context.beginPath();
          context.arc(marker[0], marker[1], thin ? 7 : 9, 0, Math.PI * 2);
          context.fill();
          context.lineWidth = 2;
          context.strokeStyle = "#fff0bd";
          context.stroke();
        }
      }

      function resize() {
        width = canvas.clientWidth;
        height = canvas.clientHeight;
        const dpr = Math.min(devicePixelRatio || 1, 2);
        canvas.width = Math.max(1, Math.round(width * dpr));
        canvas.height = Math.max(1, Math.round(height * dpr));
        context.setTransform(dpr, 0, 0, dpr, 0, 0);
        draw();
      }

      function setTime(time) {
        elapsed = clamp(time, 0, result?.minutes || 0);
        slider.value = String(elapsed);
        find(".metro-clock").textContent = result ? `${elapsed.toFixed(1)} / ${result.minutes} 分钟` : "暂无班次";
        let arrival = 0;
        find(".metro-itinerary").querySelectorAll("button").forEach(button => {
          arrival = Number(button.dataset.marrival);
          button.classList.toggle("metro-visited", arrival <= elapsed);
        });
        draw();
      }

      function stopPlayback() {
        cancelAnimationFrame(frame);
        running = false;
        play.textContent = elapsed > 0 && elapsed < (result?.minutes || 0) ? "继续" : "发车";
      }

      function finish() {
        stopPlayback();
        status.textContent = `列车抵达${stops[to][0]}，用时 ${result.minutes} 分钟。`;
        if (closures.has(2) && from === "dock" && to === "east" && mode === "fast") {
          api.complete("施工期间的最快路线已经验证");
        }
      }

      function tick(now) {
        if (!running) return;
        const delta = Math.min((now - previousTime) / 1000, .08);
        previousTime = now;
        setTime(elapsed + delta * 5);
        if (elapsed >= result.minutes) finish();
        else frame = requestAnimationFrame(tick);
      }

      function renderTools() {
        choose(root, "[data-mtool]", "mtool", tool);
        switches.hidden = tool !== "close";
        find(".metro-hint").textContent = { from: "在地图上点一座车站作为起点。", to: "在地图上点一座车站作为终点。", close: "点区间上的 × 封闭，再点一次恢复通车。" }[tool];
        draw();
      }

      function revealRoute() {
        cancelAnimationFrame(routeFrame);
        if (reduceMotion.matches || !width) {
          routeBlend = 1;
          return;
        }
        routeBlend = 0;
        const start = performance.now();
        function reveal(now) {
          routeBlend = 1 - (1 - clamp((now - start) / 360, 0, 1)) ** 3;
          draw();
          if (routeBlend < 1) routeFrame = requestAnimationFrame(reveal);
        }
        routeFrame = requestAnimationFrame(reveal);
      }

      function render() {
        api.reset();
        stopPlayback();
        elapsed = 0;
        play.textContent = "发车";
        result = route(from, to, closures, mode);
        choose(root, "[data-mrule]", "mrule", mode);
        root.querySelectorAll("[data-mstop]").forEach(button => {
          const state = button.dataset.mstop === from ? "start" : button.dataset.mstop === to ? "end" : "";
          button.dataset.mmark = state;
          button.setAttribute("aria-label", stops[button.dataset.mstop][0] + (state === "start" ? "，起点" : state === "end" ? "，终点" : ""));
        });
        root.querySelectorAll("[data-mtrack]").forEach((button, i) => {
          button.setAttribute("aria-pressed", String(closures.has(i)));
          button.firstElementChild.textContent = closures.has(i) ? "+" : "×";
        });
        find(".metro-ticket-title strong").textContent = `${stops[from][0]} → ${stops[to][0]}`;
        find(".metro-ticket-title small").textContent = `${routeModes[mode]} / 封闭 ${closures.size} 段`;
        const metrics = find(".metro-metrics");
        const itinerary = find(".metro-itinerary");
        baseline = route(from, to, new Set(), mode);
        if (result) {
          metrics.innerHTML = `<span><strong>${result.minutes}</strong> 分钟</span><span><strong>${result.legs.length}</strong> 站</span><span><strong>${result.changes}</strong> 次换乘</span>`;
          let arrival = 0;
          itinerary.innerHTML = `<button data-marrival="0">${stops[from][0]}</button>` + result.legs.map(leg => {
            arrival += leg.minutes;
            return `<button data-marrival="${arrival}" style="--mroute:${lineColors[leg.line]}" title="${lineNames[leg.line]}，${arrival} 分钟">${stops[leg.to][0]}</button>`;
          }).join("");
          const added = result.minutes - baseline.minutes;
          status.textContent = closures.size ? (added === 0 ? "当前方案与全线开放时用时相同。" : `临时改线比全线开放时${added < 0 ? "少" : "多"}用 ${Math.abs(added)} 分钟。`) : "试试切换路线规则，比较停站数与到达时间。";
        } else {
          metrics.textContent = "当前两站之间无可用路线";
          itinerary.replaceChildren();
          status.textContent = "恢复一段线路，或换一个起终点。";
        }
        play.disabled = step.disabled = slider.disabled = !result?.minutes;
        slider.max = String(result?.minutes || 1);
        revealRoute();
        setTime(0);
      }

      api.onRootEvent("click", event => {
        const button = event.target.closest("button");
        if (!button) return;
        const data = button.dataset;
        if (data.mtool) {
          tool = data.mtool;
          if (tool === "close" && showCosts) {
            showCosts = false;
            find("[data-mcost]").setAttribute("aria-pressed", "false");
          }
          renderTools();
        } else if (data.mrule) {
          mode = data.mrule;
          render();
        } else if (data.mstop) {
          if (tool === "close") {
            status.textContent = "封闭区间请点车站之间的开关。";
            return;
          }
          const other = tool === "from" ? to : from;
          if (data.mstop === other) {
            status.textContent = "起点和终点要选不同的车站。";
            return;
          }
          if (tool === "from") from = data.mstop;
          else to = data.mstop;
          render();
        } else if (data.mtrack !== undefined) {
          const id = Number(data.mtrack);
          if (closures.has(id)) closures.delete(id);
          else closures.add(id);
          render();
        } else if (data.mworks !== undefined) {
          closures.add(2);
          tool = "close";
          renderTools();
          render();
        } else if (data.mreset !== undefined) {
          closures.clear();
          render();
        } else if (data.mcost !== undefined) {
          showCosts = !showCosts;
          if (showCosts && tool === "close") { tool = "to"; renderTools(); }
          button.setAttribute("aria-pressed", String(showCosts));
          draw();
        } else if (data.mreference !== undefined) {
          showReference = !showReference;
          button.setAttribute("aria-pressed", String(showReference));
          status.textContent = showReference ? `全线开放时需 ${baseline.minutes} 分钟，紫色点线标出常态路线的不同区段。` : `当前方案${result ? "需 " + result.minutes + " 分钟" : "无可用路线"}。`;
          draw();
        } else if (data.marrival !== undefined) {
          stopPlayback();
          setTime(Number(data.marrival));
        }
      });
      play.addEventListener("click", () => {
        if (running) { stopPlayback(); return; }
        if (elapsed >= result.minutes) setTime(0);
        if (reduceMotion.matches) {
          setTime(result.minutes);
          finish();
          return;
        }
        running = true;
        play.textContent = "暂停";
        previousTime = performance.now();
        frame = requestAnimationFrame(tick);
      });
      step.addEventListener("click", () => {
        stopPlayback();
        if (elapsed >= result.minutes) setTime(0);
        let arrival = 0;
        for (const leg of result.legs) {
          arrival += leg.minutes;
          if (arrival > elapsed + .001) break;
        }
        setTime(arrival);
        if (elapsed >= result.minutes) finish();
      });
      slider.addEventListener("input", () => {
        stopPlayback();
        setTime(Number(slider.value));
        stopPlayback();
      });
      const observer = new ResizeObserver(resize);
      observer.observe(canvas);
      api.onCleanup(() => { observer.disconnect(); stopPlayback(); cancelAnimationFrame(routeFrame); });
      renderTools();
      render();
    },
  });
  const terrain = [
    [5,5,5,4,4,4,4,4,5,5,5],
    [5,5,4,4,3,3,3,4,4,5,5],
    [5,4,4,3,2,2,2,3,4,4,5],
    [5,4,4,2,2,2,2,3,4,4,5],
    [5,4,3,2,1,1,2,3,4,4,5],
    [5,4,4,3,2,1,1,3,4,4,5],
    [5,4,4,4,4,1,1,4,4,4,5],
    [4,4,3,3,2,0,0,2,3,4,4],
    [4,3,3,2,1,0,0,1,2,3,4],
  ];
  const cols = terrain[0].length;
  const rows = terrain.length;
  const originalTerrain = terrain.flat();
  const cellAt = (x, y) => y * cols + x;
  const xyAt = index => [index % cols, Math.floor(index / cols)];
  const houses = new Set([[4,3], [5,3], [6,3], [5,2]].map(([x,y]) => cellAt(x,y)));
  const gaps = new Set([cellAt(5,6), cellAt(6,6)]);
  const earth = ["#efe2c1", "#e8d5a5", "#d5c78a", "#c3be7c", "#a5ad6b", "#829255", "#637b44"];

  function inundate(heights, water) {
    const wet = new Set();
    const queue = [];
    function add(x, y) {
      if (x < 0 || y < 0 || x >= cols || y >= rows) return;
      const id = cellAt(x, y);
      if (wet.has(id) || heights[id] >= water) return;
      wet.add(id);
      queue.push(id);
    }
    for (let x = 0; x < cols; x++) add(x, rows - 1);
    for (let head = 0; head < queue.length; head++) {
      const [x, y] = xyAt(queue[head]);
      add(x + 1, y);
      add(x - 1, y);
      add(x, y + 1);
      add(x, y - 1);
    }
    return wet;
  }

  window.LiveStages.register({
    id: "tide",
    title: "借地挡潮",
    subject: "地理 / 防洪工程",
    style: "叠纸地形模型",
    summary: "在河口直接筑堤，观察低洼地为何会进水。",
    mount(root, api) {
      root.innerHTML = `
        <div class="tide-lead"><div class="tide-index">湾口模型 <span>11×9</span></div><div><h2>借地挡潮</h2><p>守住 3 米高潮里的四间房。拖笔筑堤，再放潮验证你的方案。</p></div><div class="tide-stamp" aria-hidden="true"><i></i><i></i><i></i></div></div>
        <div class="tide-studio">
          <figure class="tide-table">
            <div class="tide-maptools">
              <div role="group" aria-label="地形图视角"><button data-tview="relief">立体</button><button data-tview="plan">平面</button></div>
              <div role="group" aria-label="地图标记"><button data-tguides aria-pressed="false">标出河口</button><button data-tcompare aria-pressed="false">叠加对照线</button></div>
            </div>
            <canvas tabindex="0" aria-label="可编辑的地形模型。按方向键移动格子，按空格使用当前工具。"></canvas>
            <figcaption><span><i></i>潮水</span><span><i></i>房屋</span><span><i></i>新堤</span><span class="tide-cursor" aria-live="polite"></span></figcaption>
          </figure>
          <div class="tide-workbench">
            <section class="tide-field">
              <h3>落笔</h3>
              <div class="tide-brushes" role="group" aria-label="地形编辑工具"><button data-tbrush="inspect">查看</button><button data-tbrush="bank">筑堤</button><button data-tbrush="lower">削低</button><button data-tbrush="erase">擦除</button></div>
              <p class="tide-instruction"></p>
              <div class="tide-edit"><button data-tundo>撤回</button><button data-tredo>重做</button><button data-treset>还原地形</button></div>
            </section>
            <section class="tide-field tide-water">
              <label for="tide-level">潮位 <output id="tide-level-output" for="tide-level">3.0 m</output></label>
              <input type="range" id="tide-level" min="0" max="5" value="3" step=".1">
              <div class="tide-presets" aria-label="潮位预设"><button data-tlevel="1">1 m</button><button data-tlevel="3">3 m</button><button data-tlevel="4.5">4.5 m</button><button data-tplay>播放涨潮</button></div>
            </section>
            <section class="tide-field tide-review">
              <h3>对照方案</h3>
              <button data-tsave>保存当前地形</button><button data-toriginal>用原地形</button>
              <p class="tide-compare-status">原地形是对照方案。</p>
            </section>
          </div>
        </div>
        <div class="tide-readout"><p class="tide-counter"></p><p class="tide-status" role="status"></p></div>
        <details class="tide-note"><summary>潮水怎样到达房屋？</summary><p>涨潮时，水从模型下方的湾口进入，沿四邻相通且低于潮位的格子传播。孤立洼地在这个模型里保持干燥。模型忽略渗漏、波浪与流速。</p></details>
      `;
      const find = selector => root.querySelector(selector);
      const canvas = find("canvas");
      const ctx = canvas.getContext("2d");
      const levelInput = find("#tide-level");
      const levelOutput = find("#tide-level-output");
      const play = find("[data-tplay]");
      const status = find(".tide-status");
      let heights = [...originalTerrain];
      let shownHeights = [...heights];
      let reference = [...originalTerrain];
      let water = 3;
      let shownWater = 3;
      let flooded = inundate(heights, water);
      let comparison = inundate(reference, water);
      let projection = "relief";
      let shownProjection = 0;
      let brush = "bank";
      let guides = false;
      let compare = false;
      let selected = cellAt(5,6);
      let drag = null;
      let animation = 0;
      let playback = null;
      let width = 0;
      let height = 0;
      let completed = false;
      let hitTargets = [];
      const history = [];
      const forward = [];
      const drawOrder = originalTerrain.map((_, id) => id).sort((a, b) => {
        const [ax, ay] = xyAt(a);
        const [bx, by] = xyAt(b);
        return ax + ay - bx - by || ax - bx;
      });

      function draw() {
        if (!width || !height) return;
        const plan = shownProjection;
        const planScale = Math.min(width / (cols + 2), height / (rows + 2));
        const reliefScale = Math.min(width / 22, height / 14.4);
        const scale = reliefScale + (planScale - reliefScale) * plan;
        const zScale = .38;
        function project(x, y, z) {
          const relief = [width * .5 + (x - y - 1) * reliefScale, height * .53 + ((x + y - 10) * .52 - z * zScale) * reliefScale];
          const overhead = [width * .5 + (x - cols / 2) * planScale, height * .5 + (y - rows / 2) * planScale];
          return relief.map((value,i) => value + (overhead[i] - value) * plan);
        }
        function polygon(points, fill, stroke = "", dash = []) {
          ctx.beginPath();
          points.forEach(([x, y], i) => { if (i) ctx.lineTo(x,y); else ctx.moveTo(x,y); });
          ctx.closePath();
          if (fill) { ctx.fillStyle = fill; ctx.fill(); }
          if (stroke) {
            ctx.lineWidth = dash.length ? 1.7 : 1;
            ctx.strokeStyle = stroke;
            ctx.setLineDash(dash);
            ctx.stroke();
            ctx.setLineDash([]);
          }
        }
        const square = (x, y, z) => [project(x, y, z), project(x + 1, y, z), project(x + 1, y + 1, z), project(x, y + 1, z)];
        ctx.clearRect(0, 0, width, height);
        hitTargets = [];
        drawOrder.forEach(id => {
          const [x, y] = xyAt(id);
          const changed = heights[id] > originalTerrain[id];
          const z = shownHeights[id];
          const wet = flooded.has(id);
          const top = wet ? Math.max(z, shownWater) : z;
          const shape = square(x, y, top);
          if (plan < .99) {
            ctx.globalAlpha = 1 - plan;
            const south = y + 1 < rows ? shownHeights[cellAt(x,y+1)] : -.9;
            const east = x + 1 < cols ? shownHeights[cellAt(x+1,y)] : -.9;
            if (top > south) polygon([shape[2], shape[3], project(x,y+1,south), project(x+1,y+1,south)], wet ? "#397e96" : "#9a865a");
            if (top > east) polygon([shape[1], shape[2], project(x+1,y+1,east), project(x+1,y,east)], wet ? "#32708a" : "#776b4f");
            ctx.globalAlpha = 1;
          }
          const color = changed ? "#cf6b46" : earth[clamp(Math.round(z),0,6)];
          polygon(shape, wet ? "#78bcce" : color, wet ? "#4f9ab4" : "#655b4648");
          if (wet) {
            ctx.strokeStyle = "#d0e7d6";
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(...project(x + .24, y + .68, top));
            ctx.lineTo(...project(x + .66, y + .68, top));
            ctx.stroke();
          }
          if (compare && comparison.has(id) && !wet) polygon(shape, "", "#386577", [3,3]);
          if (guides && gaps.has(id)) polygon(shape, "#f9df5970", "#8b411c", [4,2]);
          if (houses.has(id)) {
            const [cx,cy] = project(x + .5,y + .5,top);
            const size = Math.min(10, Math.max(5, scale * .30));
            polygon([[cx - size,cy], [cx,cy - size], [cx + size,cy], [cx + size * .76,cy], [cx + size * .76,cy + size * .72], [cx - size * .76,cy + size * .72], [cx - size * .76,cy]], wet ? "#354b56" : "#a0463d", wet ? "#163843" : "#f2dcc2");
          }
          if (id === selected) polygon(shape, "", "#59251b", [4,2]);
          hitTargets.push({ id, shape });
        });
      }

      function resize() {
        width = canvas.clientWidth;
        height = canvas.clientHeight;
        const dpr = Math.min(devicePixelRatio || 1, 2);
        canvas.width = Math.max(1, Math.round(width * dpr));
        canvas.height = Math.max(1, Math.round(height * dpr));
        ctx.setTransform(dpr,0,0,dpr,0,0);
        draw();
      }

      function animate() {
        cancelAnimationFrame(animation);
        const targetProjection = Number(projection === "plan");
        if (reduceMotion.matches) {
          shownHeights = [...heights];
          shownWater = water;
          shownProjection = targetProjection;
          draw();
          return;
        }
        let last = performance.now();
        function tick(now) {
          const factor = 1 - Math.exp(-Math.min(now - last,40) / 42);
          last = now;
          shownHeights = shownHeights.map((value,i) => value + (heights[i] - value) * factor);
          shownWater += (water - shownWater) * factor;
          shownProjection += (targetProjection - shownProjection) * factor;
          if (Math.abs(shownProjection - targetProjection) < .015) shownProjection = targetProjection;
          draw();
          const active = shownHeights.some((value,i) => Math.abs(value - heights[i]) > .015) || Math.abs(shownWater - water) > .015 || shownProjection !== targetProjection;
          if (active) animation = requestAnimationFrame(tick);
        }
        animation = requestAnimationFrame(tick);
      }

      function announceCell() {
        const [x,y] = xyAt(selected);
        find(".tide-cursor").textContent = `第 ${y + 1} 行第 ${x + 1} 列，海拔 ${heights[selected]} m`;
      }

      function render() {
        flooded = inundate(heights,water);
        comparison = inundate(reference,water);
        const wetHouses = [...houses].filter(id => flooded.has(id)).length;
        const referenceHouses = [...houses].filter(id => comparison.has(id)).length;
        levelInput.value = String(water);
        levelInput.setAttribute("aria-valuetext", water.toFixed(1) + " 米");
        levelOutput.textContent = water.toFixed(1) + " m";
        find(".tide-counter").innerHTML = `<strong>${houses.size - wetHouses} / ${houses.size}</strong> 间房保持干燥 <span>${flooded.size} 格进水</span>`;
        const note = wetHouses ? `海水已经到达 ${wetHouses} 间房。试着封住河口的低地。` : water >= 3 ? "四间房均未进水。提高潮位，还能守住吗？" : "当前潮位下房屋干燥。把潮位调到 3 米检查防线。";
        const delta = compare ? ` 对照方案进水 ${referenceHouses} 间。` : "";
        if (status.textContent !== note + delta) status.textContent = note + delta;
        const protectedAtHighTide = water >= 3 && !wetHouses && heights.some((value,i) => value !== originalTerrain[i]);
        if (protectedAtHighTide && !completed) {
          completed = true;
          api.complete("高潮试验通过");
        } else if (!protectedAtHighTide && completed) {
          completed = false;
          api.reset();
        }
        find("[data-tundo]").disabled = !history.length;
        find("[data-tredo]").disabled = !forward.length;
        choose(root, "[data-tlevel]", "tlevel", water);
        announceCell();
        animate();
      }

      function tools() {
        choose(root, "[data-tbrush]", "tbrush", brush);
        choose(root, "[data-tview]", "tview", projection);
        find("[data-tguides]").setAttribute("aria-pressed", String(guides));
        find("[data-tcompare]").setAttribute("aria-pressed", String(compare));
        find(".tide-instruction").textContent = {inspect:"点按地形查看海拔。",bank:"点按或拖动，把经过的地面筑到 4 米。",lower:"点按或拖动，所经地面降低 1 米。",erase:"点按或拖动，恢复所经地面的原始高度。"}[brush];
        canvas.dataset.tbrush = brush;
      }

      function pauseTide() {
        if (playback !== null) clearInterval(playback);
        playback = null;
        play.textContent = "播放涨潮";
      }

      function paint(id, stroke) {
        selected = id;
        if (brush === "inspect" || stroke.cells.has(id)) { announceCell(); draw(); return; }
        stroke.cells.add(id);
        const newHeight = {bank:Math.max(4,heights[id]), lower:Math.max(0,heights[id]-1), erase:originalTerrain[id]}[brush];
        if (newHeight === heights[id]) { announceCell(); draw(); return; }
        if (!stroke.saved) {
          history.push([...heights]);
          forward.length = 0;
          stroke.saved = true;
        }
        heights[id] = newHeight;
        render();
      }

      function indexAt(event) {
        const rect = canvas.getBoundingClientRect();
        const point = [event.clientX - rect.left,event.clientY - rect.top];
        for (let i = hitTargets.length - 1; i >= 0; i--) {
          const {id,shape} = hitTargets[i];
          const sides = shape.map(([x,y], index) => {
            const [nx,ny] = shape[(index + 1) % shape.length];
            return (nx - x) * (point[1] - y) - (ny - y) * (point[0] - x);
          });
          if (sides.every(side => side >= 0) || sides.every(side => side <= 0)) return id;
        }
        return null;
      }

      canvas.addEventListener("pointerdown", event => {
        if (event.button !== 0) return;
        const id = indexAt(event);
        if (id === null) return;
        canvas.setPointerCapture(event.pointerId);
        drag = { pointer:event.pointerId, cells:new Set(), saved:false };
        paint(id,drag);
      });
      canvas.addEventListener("pointermove", event => {
        if (drag?.pointer !== event.pointerId) return;
        const id = indexAt(event);
        if (id !== null) paint(id,drag);
      });
      ["pointerup","pointercancel","lostpointercapture"].forEach(name => canvas.addEventListener(name,() => { drag = null; }));
      canvas.addEventListener("keydown", event => {
        const moves = { ArrowLeft:[-1,0], ArrowRight:[1,0], ArrowUp:[0,-1], ArrowDown:[0,1] };
        if (moves[event.key]) {
          event.preventDefault();
          const [x,y] = xyAt(selected);
          const [dx,dy] = moves[event.key];
          selected = cellAt(clamp(x + dx,0,cols - 1),clamp(y + dy,0,rows - 1));
          announceCell();
          draw();
        } else if (event.key === " " || event.key === "Enter") {
          event.preventDefault();
          paint(selected,{cells:new Set(), saved:false});
        }
      });
      api.onRootEvent("click", event => {
        const button = event.target.closest("button");
        if (!button) return;
        const data = button.dataset;
        if (data.tview) projection = data.tview;
        else if (data.tbrush) brush = data.tbrush;
        else if (data.tguides !== undefined) guides = !guides;
        else if (data.tcompare !== undefined) compare = !compare;
        else if (data.tlevel !== undefined) { pauseTide(); water = Number(data.tlevel); }
        else if (data.tundo !== undefined) { forward.push([...heights]); heights = history.pop(); }
        else if (data.tredo !== undefined) { history.push([...heights]); heights = forward.pop(); }
        else if (data.treset !== undefined) { history.push([...heights]); heights = [...originalTerrain]; forward.length = 0; }
        else if (data.tsave !== undefined || data.toriginal !== undefined) {
          const saved = data.tsave !== undefined;
          reference = [...(saved ? heights : originalTerrain)];
          compare = true;
          find(".tide-compare-status").textContent = saved ? "已保存这份地形，后续编辑可与它比较。" : "原地形是对照方案。";
        } else return;
        tools();
        render();
      });
      levelInput.addEventListener("input", () => { pauseTide(); water = Number(levelInput.value); render(); });
      play.addEventListener("click", () => {
        if (playback !== null) { pauseTide(); return; }
        water = 0;
        render();
        play.textContent = "暂停涨潮";
        playback = setInterval(() => {
          water = Math.round((water + .1) * 10) / 10;
          render();
          if (water >= 5) pauseTide();
        },reduceMotion.matches ? 120 : 85);
      });
      const observer = new ResizeObserver(resize);
      observer.observe(canvas);
      api.onCleanup(() => { observer.disconnect(); cancelAnimationFrame(animation); pauseTide(); });
      tools();
      render();
    },
  });
  const cohorts = ["新手", "熟练"];
  const examMethods = [
    { name: "方案 A", rate: [40, 90] },
    { name: "方案 B", rate: [30, 80] },
  ];
  const totals = weights => weights.map((count, i) => (count * examMethods[i].rate[0] + (100 - count) * examMethods[i].rate[1]) / 100);

  window.LiveStages.register({
    id: "poll",
    title: "数据显影室",
    subject: "统计 / 辛普森悖论",
    style: "丝网印刷校样",
    summary: "移动样本的构成边界，找出一次反常的胜负翻转。",
    mount(root, api) {
      root.innerHTML = `
        <header class="proof-head"><div><p>统计校样 / Aggregation proof</p><h2>数据显影室</h2></div><p class="proof-lead">每格是一名学员。拖动分界或取样尺，再拆开合计，看看胜负为何翻转。</p></header>
        <div class="proof-rail">
          <div class="proof-switch" role="group" aria-label="统计视角"><button data-pview="all">汇总显影</button><button data-pview="split">分组显影</button></div>
          <div class="proof-filter" role="group" aria-label="聚焦样本"><button data-pfocus="all">全部</button><button data-pfocus="0">新手</button><button data-pfocus="1">熟练</button></div>
          <button data-plock aria-pressed="false">联动取样尺</button>
        </div>
        <div class="proof-sheet">
          ${examMethods.map((item,i) => `
            <section class="proof-column" data-pcolumn="${i}" aria-label="${item.name}">
              <div class="proof-result"><span>${item.name}</span><strong></strong><small>通过率</small></div>
              <div class="proof-group-rates">${item.rate.map((rate,k) => `<button data-pgroup="${k}" type="button"><span>${cohorts[k]}</span><strong>${rate}%</strong><small></small></button>`).join("")}</div>
              <div class="proof-grid"><div class="proof-dots" aria-hidden="true">${Array.from({length:100},(_,k) => `<i data-pdot="${k}"></i>`).join("")}</div><button type="button" class="proof-cut" data-pcutdrag="${i}" title="拖动样本分界"><span aria-hidden="true">↕</span></button></div>
              <label for="proof-weight-${i}"><span>新手 <output></output></span><span>熟练 <output></output></span></label>
              <input id="proof-weight-${i}" data-pweight="${i}" aria-label="${item.name}的新手比例" type="range" min="10" max="90" step="10" value="${i ? 20 : 80}">
            </section>
          `).join("")}
        </div>
        <div class="proof-under">
          <div class="proof-key"><span><i></i>新手</span><span><i></i>熟练</span><span><i></i>通过</span><span><i></i>未通过</span></div>
          <div class="proof-editions" aria-label="样本构成预设"><button data-ppreset="reverse">复现翻转</button><button data-ppreset="even">两边各半</button><button data-ppreset="swap">交换构成</button><button data-psave>留存读数</button></div>
        </div>
        <section class="proof-brief" aria-label="校样检验">
          <div><h3>等权抽样时，谁的总通过率更高？</h3><div class="proof-answer" role="group" aria-label="预测等权抽样结果"><button data-panswer="a">A 更高</button><button data-panswer="b">B 更高</button><button data-panswer="tie">一样高</button><button data-pcheck>检验预测</button></div></div>
          <p class="proof-verdict" role="status"></p>
        </section>
        <p class="proof-kept" hidden></p>
        <details class="proof-note"><summary>查看加权计算</summary><p></p></details>
      `;
      const find = selector => root.querySelector(selector);
      const stage = find(".proof-sheet");
      const columns = [...root.querySelectorAll(".proof-column")];
      const columnDots = columns.map(column => [...column.querySelectorAll("[data-pdot]")]);
      const sliders = [...root.querySelectorAll("[data-pweight]")];
      const handles = [...root.querySelectorAll("[data-pcutdrag]")];
      const verdict = find(".proof-verdict");
      let weights = [80,20];
      let view = "all";
      let focus = "all";
      let locked = false;
      let prediction = "";
      let checkpoint = null;

      function render(announce = true) {
        choose(root, "[data-pview]", "pview", view);
        choose(root, "[data-pfocus]", "pfocus", focus);
        choose(root, "[data-pgroup]", "pgroup", focus);
        choose(root, "[data-panswer]", "panswer", prediction);
        find("[data-plock]").setAttribute("aria-pressed", String(locked));
        stage.dataset.pview = view;
        stage.dataset.pfocus = focus;
        const scores = totals(weights);
        columns.forEach((column,i) => {
          const cut = weights[i];
          column.style.setProperty("--pcut", cut + "%");
          column.dataset.pwinner = String(scores[i] > scores[1-i]);
          column.querySelector(".proof-result strong").textContent = scores[i] + "%";
          const outputs = column.querySelectorAll("output");
          outputs[0].textContent = cut;
          outputs[1].textContent = 100 - cut;
          column.querySelectorAll(".proof-group-rates small").forEach((sample,index) => {
            sample.textContent = (index === 0 ? cut : 100 - cut) + " 人";
          });
          sliders[i].value = String(cut);
          sliders[i].setAttribute("aria-valuetext", `新手 ${cut} 人，熟练 ${100 - cut} 人`);
          handles[i].setAttribute("aria-label", `${examMethods[i].name}的样本分界，新手 ${cut} 人，熟练 ${100 - cut} 人。可用上下方向键调整。`);
          columnDots[i].forEach((dot,k) => {
            const group = k < cut ? 0 : 1;
            const position = group === 0 ? k : k - cut;
            const rate = examMethods[i].rate[group];
            const passed = Math.floor((position + 1) * rate / 100) > Math.floor(position * rate / 100);
            dot.dataset.pcohort = String(group);
            dot.dataset.ppass = String(passed);
          });
        });
        const trend = scores[0] === scores[1] ? "两边总通过率相同。" : `${scores[0] > scores[1] ? "A" : "B"} 的总通过率高 ${Math.abs(scores[0] - scores[1])} 个百分点。`;
        if (announce) {
          const observation = weights[0] === weights[1] ? " 两边现在用相同的组别权重。" : " 拆成两组看，A 在每组都高 10 个百分点。";
          verdict.textContent = trend + observation;
        }
        const kept = find(".proof-kept");
        kept.hidden = checkpoint === null;
        if (checkpoint) kept.textContent = `留存校样  A ${checkpoint.scores[0]}% / B ${checkpoint.scores[1]}%  ·  新手人数 ${checkpoint.weights[0]} / ${checkpoint.weights[1]}`;
        find(".proof-note p").textContent = scores.map((score,i) => {
          const [novice, advanced] = examMethods[i].rate;
          return `${examMethods[i].name}：(${weights[i]} × ${novice}% ＋ ${100 - weights[i]} × ${advanced}%) ÷ 100 = ${score}%。`;
        }).join(" ");
      }

      function setFocus(value) {
        focus = focus === value ? "all" : value;
        if (focus !== "all") view = "split";
        render(false);
      }

      function adjustWeight(index, value) {
        if (weights[index] === value) return;
        api.reset();
        weights[index] = value;
        if (locked) weights[1-index] = value;
        render();
      }

      api.onRootEvent("click", event => {
        const dot = event.target.closest("[data-pdot]");
        if (dot) { setFocus(dot.dataset.pcohort); return; }
        const button = event.target.closest("button");
        if (!button) return;
        const data = button.dataset;
        if (data.pview) {
          view = data.pview;
          if (view === "all") focus = "all";
        } else if (data.pfocus) setFocus(data.pfocus);
        else if (data.pgroup) setFocus(data.pgroup);
        else if (data.plock !== undefined) {
          locked = !locked;
          if (locked && weights[1] !== weights[0]) {
            api.reset();
            weights[1] = weights[0];
          }
        } else if (data.ppreset) {
          api.reset();
          weights = {reverse:[80,20], even:[50,50], swap:[20,80]}[data.ppreset];
          locked = locked && weights[0] === weights[1];
        } else if (data.psave !== undefined) {
          checkpoint = { weights:[...weights], scores:totals(weights) };
        } else if (data.panswer) {
          if (prediction !== data.panswer) api.reset();
          prediction = data.panswer;
          verdict.textContent = "预测已记下。调成相同权重，再检验。";
          render(false);
          return;
        } else if (data.pcheck !== undefined) {
          if (!prediction) verdict.textContent = "先选一个预测。";
          else if (weights[0] !== weights[1]) verdict.textContent = "两边的新手比例仍不同。让两把取样尺对齐。";
          else if (prediction === "a") {
            verdict.textContent = "预测正确。等权时，A 在各组的 10 点优势完整保留。";
            api.complete("已还原等权比较");
          } else verdict.textContent = "再看分组读数。同一组内 A 高 10 点，使用相同权重时优势会保留。";
          return;
        } else return;
        render();
      });
      sliders.forEach((slider,i) => {
        slider.addEventListener("input", () => adjustWeight(i,Number(slider.value)));
      });
      handles.forEach((handle,i) => {
        handle.addEventListener("pointerdown", event => {
          if (event.button === 0) handle.setPointerCapture(event.pointerId);
        });
        handle.addEventListener("pointermove", event => {
          if (!handle.hasPointerCapture(event.pointerId)) return;
          const bounds = handle.parentElement.getBoundingClientRect();
          const share = clamp(Math.round(10 * (event.clientY - bounds.top) / bounds.height) * 10,10,90);
          adjustWeight(i,share);
        });
        handle.addEventListener("keydown", event => {
          const changes = {ArrowUp:weights[i] - 10, ArrowDown:weights[i] + 10, Home:10, End:90};
          if (!(event.key in changes)) return;
          event.preventDefault();
          adjustWeight(i,clamp(changes[event.key],10,90));
        });
      });
      render();
    },
  });
})();
