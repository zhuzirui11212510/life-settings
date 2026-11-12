(() => {
  "use strict";

  const guide = document.getElementById("guide");
  const stage = document.getElementById("ribbon-stage");
  const canvas = document.getElementById("join-canvas");
  const replay = document.getElementById("join-replay");
  const caption = document.getElementById("join-caption");
  const dot = document.createElement("canvas");
  dot.width = dot.height = 9;
  const dotContext = dot.getContext("2d");
  dotContext.fillStyle = "#31555d13";
  dotContext.fillRect(4, 4, 1, 1);
  const dotPattern = canvas.getContext("2d").createPattern(dot, "repeat");
  const focusButtons = [...document.querySelectorAll("[data-focus]")];
  const joinButtons = [...document.querySelectorAll("[data-join]")];
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  let join = "odd";
  let joinProgress = 0;
  let frame = 0;
  let start = 0;

  function drawJoin() {
    if (!guide.open) return;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (!width || !height) return;
    const ratio = Math.min(devicePixelRatio || 1, 2);
    if (canvas.width !== Math.round(width * ratio) || canvas.height !== Math.round(height * ratio)) {
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
    }
    const ctx = canvas.getContext("2d");
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, width, height);
    const left = Math.max(34, width * .12);
    const right = width - left;
    const top = height * .22;
    const bottom = height * .78;
    const topLine = top + (bottom - top) * .17;
    const bottomLine = bottom - (bottom - top) * .17;
    const paths = join === "odd" ? 2 : 1;
    const completed = joinProgress >= paths;

    ctx.fillStyle = dotPattern;
    ctx.fillRect(0, 0, width, height);
    ctx.shadowColor = "#27454234";
    ctx.shadowBlur = 13;
    ctx.shadowOffsetY = 4;
    ctx.fillStyle = "#f9f3df";
    ctx.fillRect(left, top, right - left, bottom - top);
    ctx.shadowColor = "transparent";
    ctx.strokeStyle = "#7d8f7f";
    ctx.strokeRect(left + .5, top + .5, right - left - 1, bottom - top - 1);

    ctx.strokeStyle = "#a3a796";
    ctx.setLineDash([5, 5]);
    for (const x of [left, right]) {
      ctx.beginPath(); ctx.moveTo(x, top - 9); ctx.lineTo(x, bottom + 9); ctx.stroke();
    }
    ctx.setLineDash([2, 4]);
    ctx.beginPath(); ctx.moveTo(left + 8, height * .5); ctx.lineTo(right - 8, height * .5); ctx.stroke();
    ctx.setLineDash([]);

    function segment(x, y, end, color) {
      ctx.lineCap = "round";
      ctx.lineWidth = 3;
      ctx.strokeStyle = color;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(end, y); ctx.stroke();
    }

    const usable = right - left - 20;
    const xStart = left + 10;
    const xEnd = right - 10;
    segment(xStart, topLine, xEnd, "#d7aa99");
    segment(xStart, bottomLine, xEnd, "#a7b5c2");
    const first = Math.min(1, joinProgress);
    const second = Math.max(0, joinProgress - 1);
    if (first > 0) segment(xStart, topLine, xStart + usable * first, "#b83b28");
    if (second > 0) segment(xStart, bottomLine, xStart + usable * second, "#b83b28");

    function tag(x, y, label) {
      ctx.fillStyle = label === "A" ? "#9e3829" : "#254b71";
      ctx.beginPath(); ctx.roundRect(x - 10, y - 10, 20, 20, 2); ctx.fill();
      ctx.fillStyle = "#fffaf0";
      ctx.font = "800 11px Inter, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(label, x, y + .5);
    }

    tag(left - 14, topLine, "A");
    tag(left - 14, bottomLine, "B");
    tag(right + 14, topLine, join === "odd" ? "B" : "A");
    tag(right + 14, bottomLine, join === "odd" ? "A" : "B");
    const movingOnBottom = joinProgress >= 1 && paths === 2 && !completed;
    const markerY = movingOnBottom ? bottomLine : topLine;
    const markerFraction = completed ? 0 : movingOnBottom ? second : first;
    const markerX = xStart + usable * markerFraction;
    ctx.fillStyle = "#ad3725";
    ctx.strokeStyle = "#fff4db";
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(markerX, markerY, 6, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.font = "750 11px Inter, Microsoft YaHei, sans-serif";
    ctx.textAlign = "center";
    ctx.fillStyle = "#46605c";
    ctx.fillText("接缝左端", left, top - 16);
    ctx.fillText("接缝右端", right, top - 16);
    ctx.fillStyle = "#903625";
    const label = completed ? "回到起点" : frame ? (movingOnBottom ? "正在走第二条长边" : "正在走第一条长边") : "从 A 出发";
    ctx.fillText(label, width / 2, bottom + 22);
  }

  function stopJoin() {
    cancelAnimationFrame(frame);
    frame = 0;
  }

  function setJoin(next) {
    stopJoin();
    join = next;
    joinProgress = 0;
    for (const button of joinButtons) button.setAttribute("aria-pressed", String(button.dataset.join === join));
    caption.textContent = join === "odd"
      ? "对齐相同字母。右上的 B 接到左下，再从第二条长边回到 A。"
      : "对齐相同字母。右上的 A 接回左上，另一条长边各自闭合。";
    replay.textContent = join === "odd" ? "追踪两圈" : "追踪一圈";
    drawJoin();
  }

  function stepJoin(now) {
    if (!start) start = now;
    const limit = join === "odd" ? 2 : 1;
    joinProgress = Math.min(limit, (now - start) / 1070);
    if (joinProgress >= limit) {
      frame = 0;
      replay.textContent = "重走接缝";
    } else frame = requestAnimationFrame(stepJoin);
    drawJoin();
  }

  for (const button of joinButtons) button.addEventListener("click", () => setJoin(button.dataset.join));
  replay.addEventListener("click", () => {
    stopJoin();
    if (reduced.matches) {
      joinProgress = join === "odd" ? 2 : 1;
      replay.textContent = "重走接缝";
      drawJoin();
      return;
    }
    joinProgress = 0;
    start = 0;
    frame = requestAnimationFrame(stepJoin);
  });
  for (const button of document.querySelectorAll("[data-guide]")) {
    button.addEventListener("click", () => {
      if (!guide.open) guide.showModal();
      setJoin(Number(stage.dataset.twists) % 2 ? "odd" : "even");
    });
  }
  guide.addEventListener("click", event => { if (event.target === guide) guide.close(); });
  guide.addEventListener("close", stopJoin);
  const observer = new ResizeObserver(drawJoin);
  observer.observe(canvas);

  function focusMode(next) {
    document.body.classList.toggle("exhibit-focus", next);
    for (const button of focusButtons) {
      button.setAttribute("aria-pressed", String(next));
      button.querySelector("[data-focus-label]").textContent = next ? "退出展映" : "展映";
    }
    window.scrollTo(0, 0);
    const active = focusButtons.find(button => button.getClientRects().length > 0);
    active?.focus({ preventScroll: true });
  }

  for (const button of focusButtons) button.addEventListener("click", () => focusMode(!document.body.classList.contains("exhibit-focus")));
  document.addEventListener("keydown", event => {
    if (event.key === "Escape" && !guide.open && document.body.classList.contains("exhibit-focus")) focusMode(false);
  });

  const soundButton = document.getElementById("sound-button");
  const soundLabel = soundButton.querySelector("span:last-child");
  let soundEnabled = false;
  let audio;
  let snip;

  function cue(type) {
    if (!soundEnabled || !audio || audio.state !== "running") return;
    const now = audio.currentTime;
    const gain = audio.createGain();
    gain.connect(audio.destination);
    if (type === "cut") {
      const source = audio.createBufferSource();
      source.buffer = snip;
      const filter = audio.createBiquadFilter();
      filter.type = "bandpass";
      filter.frequency.value = 2800;
      filter.Q.value = .9;
      source.connect(filter);
      filter.connect(gain);
      gain.gain.setValueAtTime(.135, now);
      gain.gain.exponentialRampToValueAtTime(.001, now + .16);
      source.start(now);
      source.stop(now + .16);
    } else {
      const oscillator = audio.createOscillator();
      oscillator.type = "triangle";
      oscillator.frequency.setValueAtTime(760, now);
      oscillator.frequency.exponentialRampToValueAtTime(440, now + .09);
      oscillator.connect(gain);
      gain.gain.setValueAtTime(.074, now);
      gain.gain.exponentialRampToValueAtTime(.001, now + .115);
      oscillator.start(now);
      oscillator.stop(now + .12);
    }
  }

  soundButton.addEventListener("click", async () => {
    if (!soundEnabled) {
      const Context = window.AudioContext || window.webkitAudioContext;
      if (!Context) {
        soundLabel.textContent = "声音不可用";
        soundButton.disabled = true;
        return;
      }
      soundButton.disabled = true;
      try {
        if (!audio) {
          audio = new Context();
          snip = audio.createBuffer(1, Math.ceil(audio.sampleRate * .17), audio.sampleRate);
          const waveform = snip.getChannelData(0);
          for (let i = 0; i < waveform.length; i++) waveform[i] = Math.random() * 2 - 1;
        }
        await audio.resume();
        soundEnabled = true;
        cue("seam");
        soundButton.disabled = false;
      } catch {
        soundLabel.textContent = "声音不可用";
        soundButton.disabled = true;
        return;
      }
    } else {
      soundEnabled = false;
    }
    soundButton.setAttribute("aria-pressed", String(soundEnabled));
    soundLabel.textContent = soundEnabled ? "声音开" : "声音关";
  });
  document.addEventListener("ribbon:cue", event => cue(event.detail?.type));
})();
