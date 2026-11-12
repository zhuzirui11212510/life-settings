(() => {
  "use strict";

  const registered = new Map();
  window.LiveStages = { register(scene) { registered.set(scene.id, scene); } };
  const program = [
    ["wave", "波纹", "把波源、波面和测量探针留在同一片水槽。手的位置能改变路径差，播放控制则让时间单独停下来。"],
    ["cut", "蒙太奇", "把同一张脸放回两种片段，保留镜头顺序和时间。两版都能重放，便于对照是什么改变了你对角色的推断。"],
    ["metro", "路网", "直接在路网上指定站点和封锁区段。不同策略沿原图展开，让快、少换乘等目标可以在相同网络上比较。"],
    ["fold", "折痕", "把对称轴当成能移动和旋转的折痕。图案在纸的另一面实时投影，套印时的偏差直接留在纸面。"],
    ["orbit", "轨道", "在同一张天文图上拉动发射矢量、预看轨迹并发射。预览和试飞共用运动模型，可以逐次核对判断。"],
    ["poll", "统计", "让汇总结果与各组结果同时留在屏幕上。拖动样本的组别构成时，比例发生的反转可沿着构成变化追踪。"],
    ["tempo", "节奏", "两个同周期的刻度环各自分拍。沿着同一圈看对齐点，也能把一个声部静音，单独听另一个声部。"],
    ["tide", "地形", "在地图上直接改变地势或防护，再让水走一遍。颜色、路径和对照视图揭示水流被导向了哪里。"],
    ["lexicon", "句读", "标点落进字缝，也改变阅读的停顿。把不同断法并排留存，比较同一行文字怎样生成不同意思。"],
    ["scan", "断层", "射线、投影条带与重建图共享角度和密度。自己补采半圈，便能看见单次投影的模糊如何被多个方向削弱。"],
  ];
  const byId = id => document.getElementById(id);
  const number = index => String(index + 1).padStart(2, "0");
  const wrap = (index, count) => (index % count + count) % count;
  const foyer = byId("foyer");
  const track = byId("foyer-track");
  const theater = byId("theater");
  const root = byId("scene");
  const dial = byId("dial-touch");
  const index = byId("scene-index");
  const mode = byId("focus-scene");
  const classroom = new URLSearchParams(location.search).get("classroom") === "1";
  const assignedHash = location.hash;
  if (classroom) document.body.classList.add("is-classroom");
  else byId("foyer-cover").src = "assets/rig.webp";
  const packs = new Map([
    ["scenes-a", ["wave", "fold", "orbit"]],
    ["scenes-b", ["metro", "poll", "tide"]],
    ["scenes-c", ["cut", "tempo", "lexicon"]],
    ["scan", ["scan"]],
  ]);
  const shows = [];
  let playing = null;
  let selected = 0;
  let handAngle = -144;
  let cleanup = [];
  let pointer = null;

  function loadAsset(element) {
    return new Promise((resolve, reject) => {
      element.addEventListener("load", resolve, { once: true });
      element.addEventListener("error", reject, { once: true });
      document.head.append(element);
    });
  }

  function loadPacks() {
    const selectedPacks = [...packs].filter(([, sceneIds]) => !classroom || sceneIds.includes(assignedHash.slice(1)));
    return Promise.all(selectedPacks.flatMap(([name]) => {
      const styles = document.createElement("link");
      styles.rel = "stylesheet";
      styles.href = name + ".css";
      const script = document.createElement("script");
      script.src = name + ".js";
      return [loadAsset(styles), loadAsset(script)];
    }));
  }

  function buildProgram() {
    for (const [id, short, notes] of program) {
      const scene = registered.get(id);
      if (!scene) continue;
      const position = shows.length;
      const button = document.createElement("button");
      const mark = document.createElement("span");
      button.type = "button";
      button.setAttribute("aria-label", `选择${scene.title}`);
      button.setAttribute("aria-pressed", "false");
      mark.textContent = number(position);
      button.append(mark, document.createTextNode(short));
      track.append(button);
      button.addEventListener("click", () => select(position, true));

      const fiducial = document.createElement("i");
      const radians = (-144 + position * 36) * Math.PI / 180;
      fiducial.textContent = number(position);
      fiducial.style.setProperty("--x", `${50 + 43 * Math.sin(radians)}%`);
      fiducial.style.setProperty("--y", `${50 - 43 * Math.cos(radians)}%`);
      byId("dial-fiducials").append(fiducial);

      const entry = document.createElement("a");
      entry.href = `#${id}`;
      entry.innerHTML = `<span>${number(position)}</span><img src="assets/${id}.webp" loading="lazy" decoding="async" alt=""><span><strong></strong><small></small></span><span aria-hidden="true">↗</span>`;
      entry.querySelector("strong").textContent = scene.title;
      entry.querySelector("small").textContent = `${scene.subject} / ${scene.style}`;
      byId("index-scenes").append(entry);
      shows.push({ scene, notes, button, fiducial, entry });
    }
    dial.setAttribute("aria-valuemax", String(shows.length));
    select(0, false);
  }

  function select(position, followTrack) {
    if (!shows.length) return;
    const next = wrap(position, shows.length);
    const direction = wrap(next - selected + 5, 10) - 5;
    handAngle += direction * 36;
    selected = next;
    const { scene, button } = shows[selected];
    byId("foyer-index").textContent = number(selected);
    byId("dial-number").textContent = number(selected);
    byId("foyer-project-title").textContent = scene.title;
    byId("foyer-project-desc").textContent = scene.summary;
    byId("enter-stage").href = `#${scene.id}`;
    byId("enter-stage").setAttribute("aria-label", `进场试做${scene.title}`);
    dial.setAttribute("aria-valuenow", String(selected + 1));
    dial.setAttribute("aria-valuetext", scene.title);
    foyer.style.setProperty("--dial-angle", `${handAngle}deg`);
    foyer.style.setProperty("--art-shift", `${Math.cos(handAngle * Math.PI / 180) * 9}px`);
    shows.forEach((show, i) => {
      show.button.setAttribute("aria-pressed", String(i === selected));
      show.fiducial.dataset.active = String(i === selected);
    });
    if (followTrack && track.scrollWidth > track.clientWidth) {
      const left = button.offsetLeft - (track.clientWidth - button.offsetWidth) / 2;
      track.scrollTo({ left, behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
    }
  }

  function enterFocused(next) {
    document.body.classList.toggle("is-focused", next);
    mode.setAttribute("aria-pressed", String(next));
    byId("focus-label").textContent = next ? "退出专注" : "专注";
    mode.title = next ? "退出专注模式" : "专注模式";
    window.scrollTo(0, 0);
  }

  function clearScene() {
    for (const dispose of cleanup.splice(0)) {
      try { dispose(); } catch (error) { console.error(error); }
    }
    root.replaceChildren();
    byId("scene-completion").textContent = "";
    playing = null;
  }

  function mountScene(current) {
    const { scene } = current;
    const completion = byId("scene-completion");
    let outcome = null;
    playing = current;
    root.dataset.scene = scene.id;
    document.title = `${scene.title} / 改写现场`;
    byId("scene-name").textContent = scene.title;
    scene.mount(root, {
      complete(message, value = "completed") {
        if (playing !== current) return;
        completion.textContent = typeof message === "string" && message.trim() ? message : "已达成舞台任务";
        if (classroom && value !== outcome) {
          outcome = value;
          window.Unit4Demo?.publish(value);
        }
      },
      reset() {
        if (!classroom || playing !== current || outcome === null) return;
        outcome = null;
        completion.textContent = "";
        window.Unit4Demo?.reset();
      },
      onRootEvent(type, handler) {
        root.addEventListener(type, handler);
        cleanup.push(() => root.removeEventListener(type, handler));
      },
      onCleanup(dispose) { cleanup.push(dispose); },
    });
  }

  function openClassroom() {
    foyer.hidden = true;
    theater.hidden = false;
    byId("scene-completion").textContent = "";
    const scene = registered.get(assignedHash.slice(1));
    if (scene) mountScene({ scene });
    else byId("scene-completion").textContent = "没有找到本轮指定的舞台。";
    window.addEventListener("hashchange", () => {
      if (location.hash !== assignedHash) history.replaceState(null, "", assignedHash || location.pathname + location.search);
    });
  }

  function openScene(position) {
    clearScene();
    select(position, false);
    const current = shows[position];
    const { scene, notes } = current;
    const previous = shows[wrap(position - 1, shows.length)].scene;
    const next = shows[wrap(position + 1, shows.length)].scene;
    foyer.hidden = true;
    theater.hidden = false;
    byId("scene-subject").textContent = scene.subject;
    byId("scene-position").textContent = `${number(position)} / ${number(shows.length - 1)}`;
    byId("scene-style").textContent = scene.style;
    byId("scene-note").textContent = notes;
    byId("previous-scene").href = `#${previous.id}`;
    byId("next-scene").href = `#${next.id}`;
    const nextNote = byId("next-note");
    nextNote.href = `#${next.id}`;
    nextNote.querySelector("strong").textContent = next.title;
    for (const show of shows) {
      if (show === current) show.entry.setAttribute("aria-current", "page");
      else show.entry.removeAttribute("aria-current");
    }
    mountScene(current);
    root.classList.remove("scene-entering");
    void root.offsetWidth;
    root.classList.add("scene-entering");
    window.scrollTo(0, 0);
    byId("scene-name").focus({ preventScroll: true });
  }

  function route() {
    const hash = location.hash.slice(1);
    if (hash === "main") return;
    const position = shows.findIndex(show => show.scene.id === hash);
    if (position >= 0) {
      if (playing !== shows[position]) openScene(position);
      return;
    }
    if (playing) {
      playing.entry.removeAttribute("aria-current");
      clearScene();
      theater.hidden = true;
      foyer.hidden = false;
      enterFocused(false);
      select(selected, true);
      document.title = "改写现场 / Change One Thing";
      byId("enter-stage").focus({ preventScroll: true });
    }
    window.scrollTo(0, 0);
  }

  function relativePointer(event) {
    const rect = dial.getBoundingClientRect();
    const x = event.clientX - rect.left - rect.width / 2;
    const y = event.clientY - rect.top - rect.height / 2;
    return { x, y, angle: Math.atan2(x, -y) * 180 / Math.PI, radius: Math.hypot(x, y) / rect.width };
  }

  function stopPointer(event, selectTap = false) {
    if (pointer?.id !== event.pointerId) return;
    if (selectTap && !pointer.moved && pointer.start.radius > .29) {
      select(Math.round((relativePointer(event).angle + 144) / 36), true);
    }
    pointer = null;
  }

  document.addEventListener("DOMContentLoaded", async () => {
    if (classroom) {
      foyer.hidden = true;
      theater.hidden = false;
      byId("scene-completion").textContent = "正在加载舞台…";
    }
    try {
      await loadPacks();
    } catch {
      foyer.hidden = true;
      theater.hidden = false;
      byId("scene-completion").textContent = "舞台加载失败，请重新载入页面。";
      return;
    }
    if (classroom) {
      openClassroom();
      return;
    }
    buildProgram();
    route();
    window.addEventListener("hashchange", route);
    byId("dial-previous").addEventListener("click", () => select(selected - 1, true));
    byId("dial-next").addEventListener("click", () => select(selected + 1, true));
    dial.addEventListener("keydown", event => {
      const key = event.key;
      if (!["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Home", "End", "Enter"].includes(key)) return;
      event.preventDefault();
      if (key === "Enter") {
        byId("enter-stage").click();
        return;
      }
      const next = key === "Home" ? 0 : key === "End" ? shows.length - 1 : selected + (key === "ArrowDown" || key === "ArrowLeft" ? -1 : 1);
      select(next, true);
    });
    dial.addEventListener("pointerdown", event => {
      if (pointer || event.button !== 0) return;
      const start = relativePointer(event);
      pointer = { id: event.pointerId, start, last: start.angle, degrees: 0, selected, moved: false };
      dial.setPointerCapture(event.pointerId);
    });
    dial.addEventListener("pointermove", event => {
      if (pointer?.id !== event.pointerId) return;
      const sample = relativePointer(event);
      pointer.moved ||= Math.hypot(sample.x - pointer.start.x, sample.y - pointer.start.y) > 7;
      pointer.degrees += wrap(sample.angle - pointer.last + 180, 360) - 180;
      pointer.last = sample.angle;
      const steps = pointer.start.radius < .16 ? (sample.x - pointer.start.x) / 23 : pointer.degrees / 36;
      const next = wrap(pointer.selected + Math.round(steps), shows.length);
      if (pointer.moved && selected !== next) select(next, true);
    });
    dial.addEventListener("pointerup", event => stopPointer(event, true));
    dial.addEventListener("pointercancel", stopPointer);
    dial.addEventListener("lostpointercapture", stopPointer);
    byId("open-index").addEventListener("click", () => index.showModal());
    index.addEventListener("click", event => {
      if (event.target === index || event.target.closest("#index-scenes a")) index.close();
    });
    mode.addEventListener("click", () => enterFocused(!document.body.classList.contains("is-focused")));
    document.addEventListener("keydown", event => {
      if (event.key === "Escape" && document.body.classList.contains("is-focused")) {
        enterFocused(false);
        mode.focus();
      }
    });
  });
})();
