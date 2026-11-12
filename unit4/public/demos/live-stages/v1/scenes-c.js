(() => {
  "use strict";

  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const reduced = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const readout = value => value.toFixed(1) + " s";
  const pressed = (buttons, predicate) => {
    for (const button of buttons) button.setAttribute("aria-pressed", String(predicate(button)));
  };
  const motion = (element, frames, duration) => {
    if (element && !reduced()) element.animate(frames, { duration, easing: "cubic-bezier(.2,.8,.3,1)" });
  };

  const shots = { face: "同一张脸", soup: "热汤", swing: "空秋千", flowers: "鲜花", blank: "空镜" };
  const contextShots = ["soup", "swing", "flowers", "blank"];
  const reactions = ["期待", "失落", "喜悦", "读不出"];
  const sideTime = 1.5;

  function mountCut(root, api) {
    root.innerHTML = `
      <div class="cut-title"><div><p>蒙太奇 / 35 毫米剪辑台</p><h2>第二个镜头</h2></div>
      <p>给同一张脸换掉前后的镜头，再判断你看到了什么情绪。</p></div>
      <div class="cut-deck">
        <div class="cut-projectors" data-comparison="false">
          ${["live", "reference"].map((view, i) => `
            <figure class="cut-screen" data-screen="${view}" ${i ? "hidden" : ""}>
              <div class="cut-aperture" role="img"><div class="cut-still"></div><span class="cut-corner cut-corner-top"></span><span class="cut-corner cut-corner-bottom"></span></div>
              <figcaption><span>${i ? "存档 A" : "当前放映"}</span><strong></strong></figcaption>
            </figure>`).join("")}
        </div>
        <div class="cut-tape">
          <div class="cut-tape-heading"><span>三镜头剪接</span><span class="cut-live-label" aria-live="polite"></span></div>
          <div class="cut-track" aria-label="选中要替换的镜头">
            ${["前景", "固定", "后景"].map((label, index) => `
              <button type="button" class="cut-cell" data-frame="${index}" draggable="${index !== 1}" aria-pressed="false">
                <span class="cut-mini cut-still"></span><span class="cut-cell-label"><b>${label}</b><span></span></span>
              </button>`).join("")}
          </div>
          <label class="cut-timeline"><span>播放头</span><input type="range" min="0" step=".01" value="0"><output></output></label>
          <div class="cut-transport" aria-label="放映控制">
            <button type="button" data-cut-step="-1" aria-label="上一镜">◀</button><button type="button" class="cut-play">▶ 放映</button>
            <button type="button" data-cut-step="1" aria-label="下一镜">▶</button>
            <button type="button" class="cut-loop" aria-pressed="false">循环</button><button type="button" class="cut-flip">交换前后</button>
          </div>
        </div>
      </div>
      <div class="cut-workbench">
        <section class="cut-materials" aria-label="候片盒">
          <div class="cut-bench-head"><h3>候片盒</h3><span>拖入槽位或点选替换</span></div>
          <div class="cut-material-list">
            ${contextShots.map(key => `<button type="button" data-material="${key}" draggable="true" aria-pressed="false"><span class="cut-still" data-shot="${key}"></span><strong>${shots[key]}</strong></button>`).join("")}
          </div>
          <label class="cut-duration"><span>脸部镜头时长</span><input type="range" min=".7" max="3" step=".1" value="1.5"><output>1.5 s</output></label>
        </section>
        <section class="cut-annotations" aria-label="观众笔记">
          <div class="cut-bench-head"><h3>你读到的情绪</h3><button type="button" class="cut-reset">重置</button></div>
          <div class="cut-reactions" aria-label="记录你的判断">${reactions.map(label => `<button type="button" data-reaction="${label}" aria-pressed="false">${label}</button>`).join("")}</div>
          <div class="cut-reference-controls"><button type="button" class="cut-save" disabled>存为 A</button><button type="button" class="cut-compare" aria-pressed="false" disabled>双放映</button></div>
          <p class="cut-feedback" role="status"></p>
        </section>
      </div>`;

    const get = selector => root.querySelector(selector);
    const all = selector => [...root.querySelectorAll(selector)];
    const frames = all("[data-frame]");
    const materials = all("[data-material]");
    const emotions = all("[data-reaction]");
    const timeline = get(".cut-timeline input");
    const duration = get(".cut-duration input");
    const projectors = get(".cut-projectors");
    const mainScreen = get('[data-screen="live"]');
    const refScreen = get('[data-screen="reference"]');
    const play = get(".cut-play");
    const status = get(".cut-feedback");
    const save = get(".cut-save");
    const compare = get(".cut-compare");
    const defaultFilm = () => ({ order: ["soup", "face", "blank"], duration: 1.5, reaction: null });
    let film = defaultFilm();
    let reference = null;
    let split = false;
    let looping = false;
    let playing = false;
    let selected = 0;
    let time = sideTime;
    let animation = 0;
    let lastTick = 0;

    const length = version => sideTime * 2 + version.duration;
    const indexAt = (seconds, version) => seconds < sideTime ? 0 : seconds < sideTime + version.duration ? 1 : 2;
    const startAt = (index, version) => [0, sideTime, sideTime + version.duration][index];

    function drawScreen(screen, version, seconds, highlight) {
      const index = indexAt(seconds, version);
      const key = version.order[index];
      const still = screen.querySelector(".cut-still");
      if (still.dataset.shot !== key) {
        still.dataset.shot = key;
        screen.querySelector("strong").textContent = shots[key];
        screen.querySelector(".cut-aperture").setAttribute("aria-label", shots[key]);
        if (highlight) motion(still, [{ opacity: .6 }, { opacity: 1 }], 145);
      }
      const activeLength = index === 1 ? version.duration : sideTime;
      still.style.setProperty("--zoom", reduced() ? 1 : 1.015 + .07 * clamp((seconds - startAt(index, version)) / activeLength, 0, 1));
    }

    function paint(highlight = false) {
      const index = indexAt(time, film);
      drawScreen(mainScreen, film, time, highlight);
      if (split) drawScreen(refScreen, reference, time / length(film) * length(reference), highlight);
      for (const frame of frames) frame.dataset.head = String(Number(frame.dataset.frame) === index);
      timeline.value = String(time);
      timeline.setAttribute("aria-valuetext", readout(time));
      get(".cut-timeline output").value = readout(time);
      get(".cut-timeline").style.setProperty("--head", (time / length(film) * 100) + "%");
      const live = get(".cut-live-label");
      const info = "当前镜头 " + (index + 1) + " / 3";
      if (live.textContent !== info) live.textContent = info;
    }

    function refresh() {
      frames.forEach((frame, i) => {
        frame.querySelector(".cut-still").dataset.shot = film.order[i];
        frame.querySelector(".cut-cell-label span").textContent = shots[film.order[i]];
        frame.setAttribute("aria-pressed", String(selected === i));
      });
      pressed(materials, button => selected !== 1 && button.dataset.material === film.order[selected]);
      pressed(emotions, button => button.dataset.reaction === film.reaction);
      timeline.max = String(length(film));
      duration.value = String(film.duration);
      get(".cut-duration output").value = readout(film.duration);
      projectors.dataset.comparison = String(split);
      refScreen.hidden = !split;
      save.disabled = !film.reaction;
      save.textContent = reference ? "更新存档 A" : "存为 A";
      compare.disabled = !reference;
      compare.setAttribute("aria-pressed", String(split));
      compare.textContent = split ? "返回单放映" : "双放映";
      paint();
    }

    function stop() {
      playing = false;
      cancelAnimationFrame(animation);
      play.textContent = "▶ 放映";
      root.dataset.cutPlaying = "false";
    }

    function tick(now) {
      if (!playing) return;
      const previousIndex = indexAt(time, film);
      time += (now - lastTick) / 1000;
      lastTick = now;
      if (time >= length(film)) {
        if (looping) time %= length(film);
        else {
          time = length(film);
          stop();
        }
      }
      paint(previousIndex !== indexAt(time, film));
      if (playing) animation = requestAnimationFrame(tick);
    }

    function setFrame(index) {
      stop();
      selected = index;
      time = startAt(index, film);
      refresh();
    }

    function afterEdit(index) {
      api.reset();
      film.reaction = null;
      setFrame(index);
      motion(frames[index], [{ translate: "0 -7px", opacity: .6 }, { translate: "0 0", opacity: 1 }], 240);
      status.textContent = reference ? "剪接已更新。再记一次你对这张脸的判断。" : "剪接已更新。放映一遍，再记下你对这张脸的判断。";
    }

    let dragged = null;
    function dragStart(event, clip) {
      dragged = clip;
      event.dataTransfer.setData("text/plain", clip);
      event.dataTransfer.effectAllowed = "move";
    }
    function dragEnd() {
      dragged = null;
      for (const frame of frames) frame.dataset.drop = "false";
    }
    function insertShot(key, index) {
      if (film.order[index] === key) {
        setFrame(index);
        return;
      }
      film.order[index] = key;
      afterEdit(index);
    }
    for (const frame of frames) {
      const index = Number(frame.dataset.frame);
      frame.addEventListener("click", () => setFrame(index));
      if (index === 1) continue;
      frame.addEventListener("dragstart", event => dragStart(event, String(index)));
      frame.addEventListener("dragend", dragEnd);
      frame.addEventListener("dragover", event => {
        if (!dragged) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
        frame.dataset.drop = "true";
      });
      frame.addEventListener("dragleave", event => {
        if (!frame.contains(event.relatedTarget)) frame.dataset.drop = "false";
      });
      frame.addEventListener("drop", event => {
        if (!dragged) return;
        event.preventDefault();
        const key = dragged;
        dragEnd();
        if (contextShots.includes(key)) insertShot(key, index);
        else if (Number(key) !== index) {
          [film.order[0], film.order[2]] = [film.order[2], film.order[0]];
          afterEdit(index);
        }
      });
    }
    for (const button of materials) {
      const key = button.dataset.material;
      button.addEventListener("click", () => insertShot(key, selected === 1 ? 2 : selected));
      button.addEventListener("dragstart", event => dragStart(event, key));
      button.addEventListener("dragend", dragEnd);
    }
    for (const button of all("[data-cut-step]")) {
      button.addEventListener("click", () => setFrame(clamp(indexAt(time, film) + Number(button.dataset.cutStep), 0, 2)));
    }
    get(".cut-flip").addEventListener("click", () => {
      [film.order[0], film.order[2]] = [film.order[2], film.order[0]];
      afterEdit(selected);
    });
    timeline.addEventListener("input", () => {
      stop();
      time = timeline.valueAsNumber;
      paint(true);
    });
    duration.addEventListener("input", () => {
      stop();
      const index = indexAt(time, film);
      film.duration = duration.valueAsNumber;
      time = startAt(index, film);
      refresh();
    });
    play.addEventListener("click", () => {
      if (playing) {
        stop();
        return;
      }
      if (time >= length(film)) time = 0;
      playing = true;
      root.dataset.cutPlaying = "true";
      play.textContent = "Ⅱ 暂停";
      lastTick = performance.now();
      animation = requestAnimationFrame(tick);
    });
    get(".cut-loop").addEventListener("click", event => {
      looping = !looping;
      event.currentTarget.setAttribute("aria-pressed", String(looping));
    });
    for (const button of emotions) {
      button.addEventListener("click", () => {
        film.reaction = button.dataset.reaction;
        refresh();
        if (!reference) {
          status.textContent = "已记下“" + film.reaction + "”。将这版存为 A，再换一条相邻镜头。";
          return;
        }
        if (film.order.join() === reference.order.join()) {
          status.textContent = "先更换前景或后景，再记录第二次判断。";
          return;
        }
        split = true;
        refresh();
        status.textContent = reference.reaction === film.reaction
          ? "你两次都读成“" + film.reaction + "”。可以换一个反差更大的镜头再试。"
          : "你在 A 版读到“" + reference.reaction + "”，在当前版读到“" + film.reaction + "”。相邻镜头改变了你对同一张脸的解释。";
        api.complete("你已完成同一面孔在两种镜头语境中的对照。",
          reference.reaction === film.reaction ? "same-reading" : "changed-reading");
      });
    }
    save.addEventListener("click", () => {
      api.reset();
      reference = { ...film, order: [...film.order] };
      status.textContent = "A 已存下。换一个相邻镜头，双放映可同步对照两版。";
      refresh();
    });
    compare.addEventListener("click", () => {
      split = !split;
      refresh();
    });
    function reset() {
      api.reset();
      stop();
      film = defaultFilm();
      reference = null;
      split = false;
      selected = 0;
      time = sideTime;
      looping = false;
      get(".cut-loop").setAttribute("aria-pressed", "false");
      status.textContent = "记下第一版的判断并存为 A。再替换镜头，看看第二版会让你怎么读这张脸。";
      refresh();
    }
    get(".cut-reset").addEventListener("click", reset);
    api.onCleanup(stop);
    reset();
  }

  window.LiveStages.register({
    id: "cut",
    title: "第二个镜头",
    subject: "电影语言",
    style: "35 毫米暗房",
    summary: "同一张脸，剪出两种解释。替换前后镜头，放映并留存你对情绪的判断。",
    mount: mountCut,
  });
  const gcd = (a, b) => b ? gcd(b, a % b) : a;
  const makeRing = (count, sound) => ({ count, sound, beats: Array(count).fill(true) });

  function mountTempo(root, api) {
    root.innerHTML = `
      <header class="tm-header"><div><p>复节奏 / 一轮里的两套脉冲</p><h2>不同拍的两只钟</h2></div>
      <div class="tm-presets" aria-label="预置拍比">
        <button type="button" data-tm-preset="3,4">3 对 4</button><button type="button" data-tm-preset="2,3">2 对 3</button><button type="button" data-tm-preset="4,6">4 对 6</button>
      </div></header>
      <div class="tm-table">
        <div class="tm-surface">
          <div class="tm-surface-top"><div class="tm-coordinates"><span>外圈</span><span>内圈</span></div>
            <div class="tm-views" aria-label="节奏视图"><button type="button" data-tm-view="orbit" aria-pressed="true">圆盘</button><button type="button" data-tm-view="grid" aria-pressed="false">展开</button></div>
          </div>
          <div class="tm-orbit"><div class="tm-dial">
            <div class="tm-ticks" aria-hidden="true"></div><div class="tm-ring tm-ring-a"></div><div class="tm-ring tm-ring-b"></div>
            <div class="tm-hand" aria-hidden="true"><i></i></div><div class="tm-beads"></div>
            <div class="tm-center"><strong></strong><span>两圈每轮同时归位</span></div>
          </div><p>按拍点可静音。拖动圆盘空白处查看这一轮。</p></div>
          <div class="tm-grid-view" hidden><p>同一竖列里的拍点会同时响。</p><div class="tm-grid" aria-label="细分格"></div></div>
          <div class="tm-readout"><span></span><strong></strong></div>
          <div class="tm-control-bar">
            <button type="button" class="tm-play">▶ 播放</button><button type="button" class="tm-sound" aria-pressed="false">开启声音</button>
            <button type="button" class="tm-solo" aria-pressed="false">独听外圈</button><button type="button" class="tm-reset">复位</button>
          </div>
          <label class="tm-scrub"><span>播放头</span><input type="range" min="0" max="11" step="1" value="0"><output></output></label>
        </div>
        <div class="tm-tuning">
          <div class="tm-numeral" aria-hidden="true"><span class="tm-n-a">3</span><i>:</i><span class="tm-n-b">4</span></div>
          <div class="tm-steppers">
            ${["外圈拍数", "内圈拍数"].map((label, index) => `<div>
              <span>${label}</span><button type="button" data-tm-ring="${index}" data-change="-1" aria-label="${label}减一">−</button>
              <button type="button" data-tm-ring="${index}" data-change="1" aria-label="${label}加一">＋</button>
            </div>`).join("")}
          </div>
          <label class="tm-field"><span>每分钟四分音符</span><output class="tm-bpm-value">92</output><input class="tm-bpm" type="range" min="40" max="170" step="1" value="92"></label>
          <label class="tm-field"><span>内圈相位</span><output class="tm-offset-value"></output><input class="tm-offset" type="range" min="0" max="11" step="1" value="0"></label>
          <div class="tm-phase-buttons" aria-label="内圈相位微调"><button type="button" data-phase="-1">← 一格</button><button type="button" data-phase="0">相位归零</button><button type="button" data-phase="1">一格 →</button></div>
          <div class="tm-task"><h3>让重拍搬家</h3><p>设为 3 对 4，保留全部拍点，把唯一的同响移到第 9 格。</p><button type="button" class="tm-check">核对同响位置</button><p class="tm-feedback" role="status"></p></div>
        </div>
      </div>`;

    const get = selector => root.querySelector(selector);
    const all = selector => [...root.querySelectorAll(selector)];
    const orbit = get(".tm-orbit");
    const dial = get(".tm-dial");
    const gridView = get(".tm-grid-view");
    const scrub = get(".tm-scrub input");
    const offset = get(".tm-offset");
    const speed = get(".tm-bpm");
    const viewButtons = all("[data-tm-view]");
    const play = get(".tm-play");
    const sound = get(".tm-sound");
    const soloButton = get(".tm-solo");
    const beads = get(".tm-beads");
    const grid = get(".tm-grid");
    const hand = get(".tm-hand");
    const stepText = get(".tm-readout span");
    const hitText = get(".tm-readout strong");
    const checkText = get(".tm-feedback");
    let rings = [makeRing(3, 300), makeRing(4, 560)];
    let phase = 0;
    let bpm = 92;
    let position = 0;
    let solo = false;
    let audible = false;
    let audio = null;
    let running = false;
    let previousTime = 0;
    let animation = 0;
    let lastStep = -1;
    let dragPointer = null;

    const count = () => rings[0].count * rings[1].count / gcd(rings[0].count, rings[1].count);
    const normalizedPhase = () => ((phase % count()) + count()) % count();
    const stepOf = (index, ring) => (index * count() / rings[ring].count + (ring === 1 ? normalizedPhase() : 0)) % count();
    const ringsAt = step => rings.map((ring, index) => ring.beats.findIndex((active, beat) => active && stepOf(beat, index) === step));
    const shared = () => Array.from({ length: count() }, (_, i) => i).filter(i => ringsAt(i).every(hit => hit >= 0));

    function beep(ring, accent) {
      if (!audible || (solo && ring === 1) || audio?.state !== "running") return;
      const now = audio.currentTime;
      const oscillator = audio.createOscillator();
      const gain = audio.createGain();
      oscillator.type = ring === 0 ? "sine" : "triangle";
      oscillator.frequency.setValueAtTime(rings[ring].sound * (accent ? 1.3 : 1), now);
      gain.gain.setValueAtTime(.0001, now);
      gain.gain.exponentialRampToValueAtTime(.12, now + .009);
      gain.gain.exponentialRampToValueAtTime(.0001, now + .16);
      oscillator.connect(gain);
      gain.connect(audio.destination);
      oscillator.start(now);
      oscillator.stop(now + .17);
    }

    function paint(playSound = false) {
      const step = Math.floor(position) % count();
      const angle = reduced() ? step * 360 / count() : position * 360 / count();
      hand.style.transform = "rotate(" + angle + "deg)";
      if (lastStep === step) return;
      lastStep = step;
      const hits = ringsAt(step);
      const together = hits.every(hit => hit >= 0);
      if (playSound) hits.forEach((hit, ring) => {
        if (hit >= 0) beep(ring, together);
      });
      scrub.value = String(step);
      dial.dataset.align = String(together);
      get(".tm-scrub output").value = (step + 1) + " / " + count();
      scrub.setAttribute("aria-valuetext", "第 " + (step + 1) + " 格，共 " + count() + " 格");
      stepText.textContent = "第 " + (step + 1) + " 格 / 共 " + count() + " 格";
      hitText.textContent = together ? "两圈同时击中" : hits[0] >= 0 ? "外圈响" : hits[1] >= 0 ? "内圈响" : "静拍";
      for (const item of all("[data-tm-step]")) item.dataset.now = String(Number(item.dataset.tmStep) === step);
    }

    function renderBeads() {
      const pattern = rings.map(ring => ring.count).join(",");
      if (beads.dataset.pattern !== pattern) {
        beads.dataset.pattern = pattern;
        beads.innerHTML = rings.map((ring, i) => ring.beats.map((_, beat) =>
          `<button type="button" data-tm-beat="${i},${beat}" data-tm-lane="${i}"
            aria-label="${i === 0 ? "外" : "内"}圈第 ${beat + 1} 拍">${beat + 1}</button>`).join("")).join("");
      }
      for (const bead of beads.children) {
        const [ring, beat] = bead.dataset.tmBeat.split(",").map(Number);
        const angle = 360 * (beat / rings[ring].count + (ring === 1 ? phase / count() : 0));
        bead.style.setProperty("--rotation", angle + "deg");
        bead.dataset.tmStep = stepOf(beat, ring);
        bead.setAttribute("aria-pressed", String(rings[ring].beats[beat]));
      }
    }

    function refresh(focusBeat) {
      const total = count();
      const phaseReadout = normalizedPhase();
      position %= total;
      lastStep = -1;
      get(".tm-n-a").textContent = rings[0].count;
      get(".tm-n-b").textContent = rings[1].count;
      get(".tm-center strong").textContent = rings[0].count + ":" + rings[1].count;
      get(".tm-bpm-value").value = String(bpm);
      speed.value = String(bpm);
      scrub.max = String(total - 1);
      offset.max = String(total - 1);
      offset.value = String(phaseReadout);
      offset.setAttribute("aria-valuetext", "延后 " + phaseReadout + " 格");
      get(".tm-offset-value").value = "+" + phaseReadout + " 格";
      get(".tm-ticks").style.setProperty("--tick-size", (360 / total) + "deg");
      renderBeads();
      grid.innerHTML = Array.from({ length: total }, (_, i) => {
        const hits = ringsAt(i);
        return `<button type="button" data-tm-probe="${i}" data-tm-step="${i}" aria-label="第 ${i + 1} 格${hits[0] >= 0 ? "，外圈响" : ""}${hits[1] >= 0 ? "，内圈响" : ""}">
          <span>${i + 1}</span><i data-tm-on="${hits[0] >= 0}"></i><i data-tm-on="${hits[1] >= 0}"></i></button>`;
      }).join("");
      const preset = rings.map(ring => ring.count).join(",");
      pressed(all("[data-tm-preset]"), button => button.dataset.tmPreset === preset);
      for (const button of all("[data-tm-ring]")) {
        const next = rings[Number(button.dataset.tmRing)].count + Number(button.dataset.change);
        button.disabled = next < 2 || next > 6;
      }
      if (focusBeat) beads.querySelector(`[data-tm-beat="${focusBeat}"]`)?.focus({ preventScroll: true });
      paint();
    }

    function setPosition(next) {
      position = clamp(next, 0, count() - .001);
      paint();
    }

    function stop() {
      running = false;
      cancelAnimationFrame(animation);
      play.textContent = "▶ 播放";
    }

    function tick(now) {
      if (!running) return;
      const travel = Math.min(100, now - previousTime) * bpm / 240000 * count();
      previousTime = now;
      position = (position + travel) % count();
      paint(true);
      animation = requestAnimationFrame(tick);
    }

    function tune(newPhase) {
      api.reset();
      phase = newPhase;
      checkText.textContent = "";
      refresh();
    }

    function applyPreset(a, b) {
      api.reset();
      rings = [makeRing(a, 300), makeRing(b, 560)];
      phase = 0;
      position = 0;
      checkText.textContent = "";
      refresh();
    }

    for (const button of all("[data-tm-preset]")) {
      button.addEventListener("click", () => applyPreset(...button.dataset.tmPreset.split(",").map(Number)));
    }
    for (const button of all("[data-tm-ring]")) {
      button.addEventListener("click", () => {
        const index = Number(button.dataset.tmRing);
        const ring = rings[index];
        rings[index] = makeRing(ring.count + Number(button.dataset.change), ring.sound);
        tune(0);
      });
    }
    for (const button of all("[data-phase]")) {
      button.addEventListener("click", () => tune(Number(button.dataset.phase) ? phase + Number(button.dataset.phase) : 0));
    }
    for (const button of viewButtons) {
      button.addEventListener("click", () => {
        const showOrbit = button.dataset.tmView === "orbit";
        pressed(viewButtons, option => option === button);
        orbit.hidden = !showOrbit;
        gridView.hidden = showOrbit;
        motion(showOrbit ? orbit : gridView, [{ opacity: .5, translate: "0 5px" }, { opacity: 1, translate: "0 0" }], 230);
      });
    }
    beads.addEventListener("click", event => {
      const button = event.target.closest("[data-tm-beat]");
      if (!button) return;
      api.reset();
      const [ring, beat] = button.dataset.tmBeat.split(",").map(Number);
      rings[ring].beats[beat] = !rings[ring].beats[beat];
      checkText.textContent = "";
      refresh(button.dataset.tmBeat);
      if (!running && rings[ring].beats[beat]) beep(ring, false);
    });
    grid.addEventListener("click", event => {
      const button = event.target.closest("[data-tm-probe]");
      if (button) {
        stop();
        setPosition(Number(button.dataset.tmProbe));
      }
    });
    const dialSeek = event => {
      const bounds = dial.getBoundingClientRect();
      const x = event.clientX - bounds.left - bounds.width / 2;
      const y = event.clientY - bounds.top - bounds.height / 2;
      const angle = (Math.atan2(x, -y) + Math.PI * 2) % (Math.PI * 2);
      setPosition(Math.floor(angle / (Math.PI * 2) * count()));
    };
    dial.addEventListener("pointerdown", event => {
      if (!event.isPrimary || event.target.closest("button")) return;
      stop();
      dragPointer = event.pointerId;
      dial.setPointerCapture(dragPointer);
      dialSeek(event);
    });
    dial.addEventListener("pointermove", event => {
      if (event.pointerId === dragPointer) dialSeek(event);
    });
    dial.addEventListener("lostpointercapture", () => { dragPointer = null; });
    scrub.addEventListener("input", () => {
      stop();
      setPosition(scrub.valueAsNumber);
    });
    offset.addEventListener("input", () => tune(offset.valueAsNumber));
    speed.addEventListener("input", () => {
      bpm = speed.valueAsNumber;
      get(".tm-bpm-value").value = String(bpm);
    });
    sound.addEventListener("click", async () => {
      audible = !audible;
      if (audible) {
        try {
          audio ??= new AudioContext();
          await audio.resume();
        } catch {
          audible = false;
        }
      }
      sound.setAttribute("aria-pressed", String(audible));
      sound.textContent = audible ? "静音" : "开启声音";
    });
    soloButton.addEventListener("click", () => {
      solo = !solo;
      soloButton.setAttribute("aria-pressed", String(solo));
      soloButton.textContent = solo ? "退出独听" : "独听外圈";
    });
    play.addEventListener("click", () => {
      if (running) {
        stop();
        return;
      }
      running = true;
      lastStep = -1;
      play.textContent = "Ⅱ 暂停";
      previousTime = performance.now();
      paint(true);
      animation = requestAnimationFrame(tick);
    });
    get(".tm-check").addEventListener("click", () => {
      const together = shared();
      const complete = rings[0].count === 3 && rings[1].count === 4 &&
        rings.every(ring => ring.beats.every(Boolean)) && together.length === 1 && together[0] === 8;
      if (complete) {
        checkText.textContent = "同响落在第 9 格。两个节奏的拍数没变，相对起点改变了。";
        api.complete("你把唯一同响移到了第 9 格。");
        stop();
        setPosition(8);
        return;
      }
      checkText.textContent = together.length
        ? "现在第 " + together.map(step => step + 1).join("、") + " 格同响。试着把内圈再移一格。"
        : "这一轮没有同响。先恢复所有拍点，再调整内圈相位。";
    });
    get(".tm-reset").addEventListener("click", () => {
      stop();
      bpm = 92;
      audible = false;
      solo = false;
      sound.setAttribute("aria-pressed", "false");
      sound.textContent = "开启声音";
      soloButton.setAttribute("aria-pressed", "false");
      soloButton.textContent = "独听外圈";
      applyPreset(3, 4);
    });
    api.onCleanup(() => {
      stop();
      if (audio) audio.close().catch(() => {});
    });
    refresh();
  }

  window.LiveStages.register({
    id: "tempo",
    title: "不同拍的两只钟",
    subject: "复节奏",
    style: "钴蓝同心版画",
    summary: "两圈各自等分一轮时间。打开、静音或移动其中的拍点，寻找重合的瞬间。",
    mount: mountTempo,
  });
  const glyphs = [..."下雨天留客天留我不留"];
  const punctuation = ["，", "。", "？", "！", "、", ""];
  const markNames = ["逗号", "句号", "问号", "叹号", "顿号", "擦除"];
  const readingA = { 2: "，", 5: "。", 8: "？", 9: "！" };
  const readingC = { 2: "，", 5: "。", 9: "？" };
  const readings = {
    A: { stamp: "留", text: "问的是留不留我，末尾单独的「留」是肯定回答。" },
    B: { stamp: "不留", text: "问的是留我吗，「不」被划进后一段，和「留」组成否定回答。" },
    C: { stamp: "待答", text: "末尾四个字组成一个问题。整句到此结束，回答仍未给出。" },
  };
  const compose = marks => glyphs.map((glyph, index) => glyph + (marks[index] || "")).join("");

  function interpret(marks) {
    const line = compose(marks);
    const introduction = /^下雨天[，、]留客天[，。！？]/;
    if (!introduction.test(line)) return null;
    const tail = line.replace(introduction, "");
    if (/^留我不？留[。！]?$/.test(tail)) return "A";
    if (/^留我？不留[。！]?$/.test(tail)) return "B";
    if (tail === "留我不留？") return "C";
    return null;
  }

  function mountLexicon(root, api) {
    root.innerHTML = `
      <header class="lx-title"><div><p>句读 / 活字版台</p><h2>朱批之间</h2></div>
        <p>挪动问号，让同一句话给出相反的答复。</p></header>
      <div class="lx-press">
        <aside class="lx-side" aria-hidden="true"><span>朱墨</span><strong>句<br>读</strong><span>版样</span></aside>
        <div class="lx-form">
          <div class="lx-sheet-top"><span>原文</span><strong>下雨天留客天留我不留</strong></div>
          <div class="lx-typeset" aria-label="标点位置">
            ${glyphs.map((glyph, index) => `<button type="button" data-lx-gap="${index}" aria-label="第 ${index + 1} 字「${glyph}」后">
              <span class="lx-glyph">${glyph}</span><span class="lx-mark"></span></button>`).join("")}
          </div>
          <div class="lx-reading">
            <div><span class="lx-preview-label">当前读法</span><p class="lx-line"></p></div><span class="lx-stamp" aria-hidden="true"></span>
          </div>
        </div>
      </div>
      <div class="lx-bench">
        <section class="lx-tools" aria-label="排版工具">
          <h3>取一枚标点</h3>
          <div class="lx-marks" aria-label="选择标点">
            ${punctuation.map((mark, index) => `<button type="button" data-lx-mark="${index}" aria-pressed="${index === 0}" aria-label="${markNames[index]}">
              <strong>${mark || "×"}</strong><span>${markNames[index]}</span></button>`).join("")}
          </div>
          <div class="lx-edit"><button type="button" class="lx-undo" disabled>撤销</button><button type="button" class="lx-redo" disabled>重做</button><button type="button" class="lx-clear">擦净</button></div>
          <div class="lx-play-tools">
            <button type="button" class="lx-play">▶ 逐字读</button>
            <label>语速 <input type="range" class="lx-speed" min="1" max="3" step="1" value="2"><output>适中</output></label>
          </div>
        </section>
        <section class="lx-notes" aria-label="核对读法">
          <h3>留下两张印样</h3>
          <div class="lx-check-tools"><button type="button" class="lx-check">试印读法</button><button type="button" class="lx-shift">挪动问号</button><button type="button" class="lx-sample">示例排版</button></div>
          <p class="lx-feedback" role="status">选一种标点，再点它前面的字。先在两个「天」后停顿。</p>
          <div class="lx-impressions">
            <button type="button" data-lx-print="A" disabled><strong>留</strong><span>印样待完成</span></button>
            <button type="button" data-lx-print="B" disabled><strong>不留</strong><span>印样待完成</span></button>
          </div>
        </section>
      </div>`;

    const get = selector => root.querySelector(selector);
    const all = selector => [...root.querySelectorAll(selector)];
    const slots = all("[data-lx-gap]");
    const palette = all("[data-lx-mark]");
    const speed = get(".lx-speed");
    const play = get(".lx-play");
    const line = get(".lx-line");
    const stamp = get(".lx-stamp");
    const feedback = get(".lx-feedback");
    const undo = get(".lx-undo");
    const redo = get(".lx-redo");
    const impressions = {};
    let markIndex = 0;
    let state = {};
    let past = [];
    let future = [];
    let timer = 0;
    let running = false;
    let head = -1;

    function stop() {
      clearTimeout(timer);
      running = false;
      head = -1;
      play.textContent = "▶ 逐字读";
      for (const slot of slots) slot.dataset.reading = "false";
    }

    function render() {
      slots.forEach((slot, index) => {
        const mark = state[index] || "";
        slot.querySelector(".lx-mark").textContent = mark || "·";
        slot.dataset.mark = mark || "none";
        slot.setAttribute("aria-label", "第 " + (index + 1) + " 字「" + glyphs[index] + "」后，" +
          (mark ? "当前为" + markNames[punctuation.indexOf(mark)] : "尚无标点"));
      });
      line.textContent = compose(state);
      const result = interpret(state);
      stamp.textContent = result ? readings[result].stamp : "";
      stamp.dataset.visible = String(Boolean(result));
      root.dataset.lxReading = result || "pending";
      undo.disabled = !past.length;
      redo.disabled = !future.length;
      for (const button of all("[data-lx-print]")) {
        const impression = impressions[button.dataset.lxPrint];
        button.disabled = !impression;
        if (impression) button.querySelector("span").textContent = compose(impression);
      }
    }

    function update(next, detail = "标点已更新。点「逐字读」看看停顿落在哪里。") {
      stop();
      past.push(state);
      state = next;
      future = [];
      feedback.textContent = detail;
      render();
    }

    function tick() {
      if (!running) return;
      if (head >= 0) slots[head].dataset.reading = "false";
      head += 1;
      if (head >= glyphs.length) {
        stop();
        return;
      }
      slots[head].dataset.reading = "true";
      const base = [0, 590, 400, 260][speed.valueAsNumber];
      const mark = state[head];
      const pause = mark ? ("。？！".includes(mark) ? 2.05 : 1.45) : 1;
      timer = setTimeout(tick, base * pause);
    }

    palette.forEach((button, i) => {
      button.addEventListener("click", () => {
        markIndex = i;
        pressed(palette, option => option === button);
      });
    });
    slots.forEach((slot, i) => {
      slot.addEventListener("click", () => {
        const next = { ...state };
        const mark = punctuation[markIndex];
        if (next[i] === mark || !mark) delete next[i];
        else next[i] = mark;
        if ((state[i] || "") === (next[i] || "")) return;
        update(next);
        motion(slot.querySelector(".lx-mark"), [{ scale: 1.6, opacity: .15 }, { scale: 1, opacity: 1 }], 250);
      });
    });
    undo.addEventListener("click", () => {
      stop();
      future.push(state);
      state = past.pop();
      feedback.textContent = "已撤销上一次排版。";
      render();
    });
    redo.addEventListener("click", () => {
      stop();
      past.push(state);
      state = future.pop();
      feedback.textContent = "已重做上一次排版。";
      render();
    });
    get(".lx-clear").addEventListener("click", () => {
      if (Object.keys(state).length) update({}, "活字已还原。已印的读法仍可在印样里取回。");
    });
    get(".lx-shift").addEventListener("click", () => {
      if (state[8] === "？") {
        const next = { ...state, 7: "？" };
        delete next[8];
        update(next, "问号向左移一字。现在「不」落在问号的哪一侧？");
      } else if (state[7] === "？") {
        const next = { ...state, 8: "？" };
        delete next[7];
        update(next, "问号向右移一字。对比这次和上次的回答。");
      } else {
        feedback.textContent = "先在「我」或它后面的「不」后放一个问号。";
      }
    });
    get(".lx-sample").addEventListener("click", () => {
      if (interpret(state) === "C") update({ ...readingA }, "示例给出了肯定回答。现在只移动问号，看回答会怎样变。");
      else update({ ...readingC }, "示例只提出问题。试着在后半句另找一处停顿，让答案出现。");
    });
    get(".lx-check").addEventListener("click", () => {
      const key = interpret(state);
      if (!key) {
        feedback.textContent = "读法还没形成。前两个「天」后先加停顿，再看哪个字应留在问号之后。";
        return;
      }
      if (key === "A" || key === "B") impressions[key] = { ...state };
      feedback.textContent = readings[key].text;
      render();
      motion(stamp, [{ scale: 1.32, opacity: .25 }, { scale: 1, opacity: 1 }], 380);
      if (impressions.A && impressions.B) api.complete("两张印样齐了。一个停顿位置改变了答复。");
    });
    for (const button of all("[data-lx-print]")) {
      button.addEventListener("click", () => update({ ...impressions[button.dataset.lxPrint] }, "已取回「" + readings[button.dataset.lxPrint].stamp + "」印样。"));
    }
    play.addEventListener("click", () => {
      if (running) {
        stop();
        return;
      }
      running = true;
      play.textContent = "Ⅱ 停读";
      tick();
    });
    speed.addEventListener("input", () => {
      get(".lx-play-tools output").value = ["", "舒缓", "适中", "紧凑"][speed.valueAsNumber];
    });
    api.onCleanup(stop);
    render();
  }

  window.LiveStages.register({
    id: "lexicon",
    title: "朱批之间",
    subject: "语文句读",
    style: "朱砂活字印样",
    summary: "十个字，两种答复。挪动一个问号，印出相反的读法。",
    mount: mountLexicon,
  });
})();
