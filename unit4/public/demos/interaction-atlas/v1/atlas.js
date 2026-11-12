(() => {
  "use strict";

  const exhibits = new Map();
  window.Atlas = { register(exhibit) { exhibits.set(exhibit.id, exhibit); } };
  const classroom = new URLSearchParams(window.location.search).get("classroom") === "1";
  const classroomCase = classroom ? window.location.hash.slice(1) : null;
  if (classroom) document.documentElement.dataset.classroom = "";

  const portfolio = [
    ["refraction", "science", "#12292c", "从示波器借用刻度与发光轨迹，让入射角和光线始终共用一张图。", "选择两侧介质，拖动光线或滑杆，在临界角两边各看一次。", "实时计算折射角与临界角，超过临界角时，界面只显示留在入射侧的反射光。"],
    ["argument", "arts", "#f6c82c", "硬边网格、套色和手工裁切感让每条材料都像一张可移动的字条。", "把纸条放进主张、证据和推理的槽位，核对后重新编排。", "按材料在论证中的作用给出反馈，逐步检验它如何支撑主张。"],
    ["fractions", "math", "#e2ddcf", "同尺寸的青瓷盘给两个分数一个统一的整体，釉色标出选中的份数。", "重切瓷盘，点按扇区着色，打开叠放参照线比对两份面积。", "切分改变扇区数量，叠合与面积对照揭示等值关系。"],
    ["strata", "arts", "#b1a37b", "考察手记和土层剖面共享一套墨色与纸张质感，出土器物随着地层显露。", "逐层揭开剖面，翻查发掘记录，再判断陶片的大致年代。", "通过器物与埋藏层的关系回推先后，保留可回看的现场记录。"],
    ["rhythm", "arts", "#a399d5", "透明外壳、灯格与拨杆把网页组织成一台可以直接上手的节拍机。", "把四次拍手编到鼓点之间，用变速和独听分辨各声部。", "步进灯和拍位对齐，声音与视觉共同标出正拍之间的音符。"],
    ["chance", "math", "#111e32", "赛场记分牌放大样本量和正面频率，逐轮刷新时像一场实时转播。", "分别投十次与一千次，模拟多轮对阵，点选一轮回看。", "用偏离 50% 的幅度比较每轮结果，观察大样本频率的波动。"],
    ["web", "science", "#173a5e", "蓝晒底色与标本式线描把物种放进一张可操作的关系图。", "先预测，再把一个种群减半或移除，沿箭头找受影响的物种。", "物种受扰后的变化沿着取食关系传播，显示连带影响。"],
    ["light", "science", "#371635", "酒红幕布、镶金标尺和三盏聚光灯构成一张剧场灯控台。", "选择下一幕的目标色，逐个推亮三个光源，也可以一键对比暗场和白光。", "改变三个通道的强度，叠光区即时显示混色，并与目标颜色比对。"],
    ["logic", "math", "#c8d4b3", "像素网格、指令卡和步进键借鉴掌上游戏机的关卡界面。", "把转向和前进排成程序，单步检查，再尝试用重复指令省出位置。", "每走一步便高亮当前指令，地图同步显示朝向、碰撞和电池计数。"],
    ["shadow", "science", "#dedcd0", "剖面线、平行投影和橙色体块把日照问题放进一张可读的建筑图纸。", "选择树池位置，调时间与塔高，播放日照或切换视角确认覆盖。", "俯视图便于判断覆盖，轴测图交代塔高，两个视角共用同一片阴影。"],
  ];

  const byId = id => document.getElementById(id);
  const ordinal = index => String(index + 1).padStart(2, "0");
  const grid = byId("project-grid");
  const dialog = byId("index-dialog");
  const stage = byId("demo-stage");
  const projects = [];
  let cleanup = [];
  let current = null;
  let filter = "all";

  function setFilter(next) {
    filter = next;
    const visible = projects.filter(project => filter === "all" || project.category === filter);
    for (const project of projects) project.link.hidden = !visible.includes(project);
    for (const button of document.querySelectorAll("[data-filter]")) {
      button.setAttribute("aria-pressed", String(button.dataset.filter === filter));
    }
    byId("result-count").textContent = `${visible.length} 件作品`;
  }

  function buildIndex() {
    portfolio.forEach(([id, category, color, visual, action, feedback], index) => {
      const exhibit = exhibits.get(id);
      if (!exhibit) return;
      const link = document.createElement("a");
      link.className = "project";
      link.href = `#${id}`;
      link.style.setProperty("--project-color", color);
      link.innerHTML = `
        <span class="project-cover"><img src="assets/${id}.webp" alt="" width="1024" height="594" loading="lazy" decoding="async"></span>
        <span class="project-info">
          <span class="project-no">${ordinal(index)}</span>
          <span><strong class="project-title"></strong><span class="project-meta"></span><span class="project-summary"></span></span>
          <span class="project-arrow" aria-hidden="true">↗</span>
        </span>`;
      link.querySelector(".project-title").textContent = exhibit.title;
      link.querySelector(".project-meta").textContent = `${exhibit.subject} / ${exhibit.style}`;
      link.querySelector(".project-summary").textContent = exhibit.summary;
      grid.append(link);
      const entry = document.createElement("a");
      entry.href = link.hash;
      entry.innerHTML = `<span class="project-no">${ordinal(index)}</span><strong></strong><small></small>`;
      entry.querySelector("strong").textContent = exhibit.title;
      entry.querySelector("small").textContent = exhibit.subject;
      byId("index-links").append(entry);
      projects.push({ exhibit, category, visual, action, feedback, link, entry, index });
    });
    setFilter(filter);
  }

  function leaveStage() {
    for (const dispose of cleanup) dispose();
    cleanup = [];
    stage.replaceChildren();
    byId("case-complete").textContent = "";
  }

  function mountStage(exhibit) {
    const status = byId("case-complete");
    let outcome = null;
    byId("case-heading").textContent = exhibit.title;
    stage.dataset.demo = exhibit.id;
    document.title = `${exhibit.title} / 可操作的课`;
    exhibit.mount(stage, {
      complete(value) {
        if (value === outcome) return;
        outcome = value;
        status.textContent = "已达成项目任务";
        if (classroom) window.Unit4Demo?.publish(value);
      },
      resetResult() {
        if (outcome === null) return;
        outcome = null;
        status.textContent = "";
        if (classroom) window.Unit4Demo?.reset();
      },
      onCleanup(dispose) { cleanup.push(dispose); },
    });
  }

  function openProject(project) {
    leaveStage();
    current = project;
    const { exhibit, visual, action, feedback, index } = project;
    byId("gallery").hidden = true;
    byId("case-view").hidden = false;
    byId("case-number").textContent = `${ordinal(index)} / ${portfolio.length}`;

    const position = projects.indexOf(project);
    const previous = projects[(position + projects.length - 1) % projects.length].exhibit;
    const next = projects[(position + 1) % projects.length].exhibit;
    byId("prev-case").href = `#${previous.id}`;
    byId("next-case").href = `#${next.id}`;
    byId("case-next").href = `#${next.id}`;
    byId("case-next").querySelector("strong").textContent = next.title;
    const notes = byId("case-notes-list");
    notes.replaceChildren();
    for (const [label, value] of [["视觉语言", visual], ["课堂操作", action], ["反馈设计", feedback]]) {
      const row = document.createElement("div");
      const term = document.createElement("dt");
      const description = document.createElement("dd");
      term.textContent = label;
      description.textContent = value;
      row.append(term, description);
      notes.append(row);
    }
    for (const item of projects) {
      if (item === project) item.entry.setAttribute("aria-current", "page");
      else item.entry.removeAttribute("aria-current");
    }
    mountStage(exhibit);
    window.scrollTo(0, 0);
    byId("case-heading").focus({ preventScroll: true });
  }

  function route() {
    const fragment = window.location.hash.slice(1);
    const project = projects.find(item => item.exhibit.id === fragment);
    if (project) {
      if (current !== project) openProject(project);
      else window.scrollTo(0, 0);
      return;
    }
    const old = current;
    if (old) {
      leaveStage();
      current = null;
      old.entry.removeAttribute("aria-current");
      byId("case-view").hidden = true;
      byId("gallery").hidden = false;
      document.title = "可操作的课 / Lessons in Motion";
    }
    if (fragment === "works" || fragment === "about") {
      byId(fragment).scrollIntoView();
      byId(`${fragment}-title`).focus({ preventScroll: true });
    } else if (fragment === "top" || old) {
      window.scrollTo(0, 0);
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    if (classroom) {
      byId("gallery").hidden = true;
      byId("case-view").hidden = false;
      const exhibit = exhibits.get(classroomCase);
      if (exhibit) {
        mountStage(exhibit);
      } else {
        stage.textContent = "这件作品暂时无法载入。请返回课堂后重新打开。";
      }
      return;
    }
    byId("cover-image").src = "assets/cover.webp";
    buildIndex();
    route();
    window.addEventListener("hashchange", route);
    for (const button of document.querySelectorAll("[data-filter]")) {
      button.addEventListener("click", () => setFilter(button.dataset.filter));
    }
    const views = [...document.querySelectorAll("[data-view]")];
    for (const button of views) {
      button.addEventListener("click", () => {
        grid.dataset.view = button.dataset.view;
        for (const view of views) view.setAttribute("aria-pressed", String(view === button));
      });
    }
    byId("show-index").addEventListener("click", () => dialog.showModal());
    dialog.addEventListener("click", event => {
      if (event.target === dialog || event.target.closest("#index-links a")) dialog.close();
    });
    document.addEventListener("click", event => {
      const link = event.target.closest("a[href^='#']");
      if (link?.hash && link.hash === window.location.hash && link.hash !== "#content") route();
    });
  });
})();
