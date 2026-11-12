(function () {
  'use strict';

  const species = [
    { name: '苍鹭', type: '顶级捕食者', x: 51, y: 13, art: 'M8 35 Q13 32 16 24 Q19 18 27 18 L31 18 Q35 15 32 12 L26 8 Q25 5 29 4 Q35 3 38 7 L51 9 L39 11 Q38 16 41 20 Q45 30 35 34 Q23 38 8 35 M22 36 L17 49 L22 50 M32 35 L30 50 L35 50 M13 33 Q23 25 34 24 M20 34 L35 26' },
    { name: '青蛙', type: '次级消费者', x: 23, y: 38, art: 'M12 33 Q10 24 20 21 Q20 15 26 15 Q30 14 33 19 Q38 15 42 20 Q44 23 43 27 Q46 34 36 38 L20 39 Q14 37 12 33 M17 32 Q8 29 6 35 L12 43 L24 42 M34 34 Q47 31 50 38 L43 43 L34 42 M25 22 L26 23 M37 22 L38 23 M26 30 Q33 33 39 30' },
    { name: '小鱼', type: '次级消费者', x: 76, y: 38, art: 'M7 27 Q21 10 38 23 L51 16 L48 27 L51 38 L38 32 Q20 44 7 27 M17 24 L18 24 M22 19 Q25 27 22 35 M23 18 L29 12 L35 20 M27 31 L32 28 L33 33' },
    { name: '蜗牛', type: '初级消费者', x: 16, y: 62, art: 'M9 37 Q8 22 21 17 Q34 12 39 24 Q42 35 32 39 M31 37 Q37 28 29 24 Q20 20 17 28 Q15 34 22 36 Q27 37 29 32 Q30 27 25 27 M6 38 Q13 35 24 40 L34 40 Q41 39 44 29 L48 29 Q52 31 52 38 Q47 44 35 44 L11 44 Q5 43 6 38 M46 29 L44 22 M49 29 L52 21' },
    { name: '水生昆虫', type: '初级消费者', x: 51, y: 61, art: 'M28 11 L28 45 M22 26 Q22 19 28 19 Q34 19 34 26 L32 37 L28 45 L24 37 Z M25 21 Q20 13 9 13 Q5 13 7 19 Q11 24 23 24 M31 21 Q37 12 48 13 Q52 14 49 20 Q44 24 33 24 M23 26 Q11 24 8 29 Q10 35 24 29 M33 26 Q46 24 49 29 Q46 35 33 29 M26 18 Q22 12 26 10 L29 10 Q33 11 31 17' },
    { name: '浮游动物', type: '初级消费者', x: 85, y: 63, art: 'M22 16 Q34 13 37 28 Q37 41 25 43 Q16 44 17 35 Q16 30 12 29 Q9 26 14 23 L22 16 M23 15 Q21 7 13 6 M24 15 Q29 9 36 9 M17 24 L18 24 M22 28 Q24 33 27 36 M24 27 Q29 31 31 34 M29 24 Q33 27 34 30 M38 27 Q44 26 47 21 M38 34 Q46 36 47 40' },
    { name: '水草', type: '生产者', x: 29, y: 86, art: 'M26 49 Q22 39 23 24 Q22 13 30 6 Q26 16 29 25 Q31 36 27 48 M25 44 Q18 33 12 29 Q8 25 7 17 Q15 19 19 25 Q25 31 25 44 M29 45 Q30 29 36 23 Q42 18 47 16 Q44 25 38 31 Q33 38 29 45 M23 47 Q17 43 11 43 M31 47 L42 40 M14 50 L43 50' },
    { name: '藻类', type: '生产者', x: 73, y: 86, art: 'M27 49 Q29 41 27 31 Q25 22 29 9 M28 30 Q33 19 37 17 Q41 15 43 9 M28 34 Q24 25 19 23 Q13 20 13 14 M27 41 Q18 38 16 30 Q13 26 8 26 M30 44 Q34 37 40 35 Q45 32 47 26 M26 46 Q31 39 36 39 M17 25 L17 16 M39 36 L40 28 M24 50 L37 50' },
  ];
  const foodLinks = [
    [6, 3, .50], [6, 4, .35], [7, 5, .64], [7, 4, .26],
    [3, 1, .32], [4, 1, .47], [4, 2, .36], [5, 2, .55],
    [1, 0, .42], [2, 0, .59],
  ];

  Atlas.register({
    id: 'web',
    title: '一池相连',
    subject: '生态学',
    style: '蓝晒标本册',
    summary: '移除一条鱼，顺着食物网追踪池塘里的连锁变化。',
    action: '拨动种群',
    mount(root, api) {
      root.innerHTML = `
        <header class="pond-head">
          <div><p>野外图鉴 / 浅水池塘</p><h2>一池相连</h2></div>
          <p class="pond-translation" lang="en">Pond<br>food web</p>
        </header>
        <div class="pond-layout">
          <figure class="pond-figure">
            <div class="pond-plot">
              <canvas class="pond-threads" aria-hidden="true"></canvas>
              ${species.map((item, i) => `
                <button type="button" class="pond-node" data-species="${i}" style="--x:${item.x}%;--y:${item.y}%" aria-pressed="false">
                  <canvas width="56" height="54" aria-hidden="true"></canvas>
                  <span>${item.name}</span><small>100</small>
                </button>`).join('')}
            </div>
            <figcaption>箭头从食物指向取食者<span>基准数量指数 100</span></figcaption>
          </figure>
          <section class="pond-notes" aria-label="食物网实验">
            <p class="pond-task">移除小鱼之前，先预测浮游动物的变化。</p>
            <div>
              <p class="pond-predict-label" id="pond-prediction">我的预测</p>
              <div class="pond-predict" role="group" aria-labelledby="pond-prediction">
                <button type="button" data-prediction="up" aria-pressed="false">增加</button>
                <button type="button" data-prediction="same" aria-pressed="false">不变</button>
                <button type="button" data-prediction="down" aria-pressed="false">减少</button>
              </div>
            </div>
            <div class="pond-selected">
              <span class="pond-trophic"></span><h3 class="pond-name"></h3>
              <p class="pond-reading">数量指数 <strong></strong></p>
            </div>
            <div class="pond-actions" aria-label="调整所选种群">
              <button type="button" data-strength=".5">减半</button>
              <button type="button" data-strength="1">移除</button>
              <button type="button" data-strength="0">复位</button>
            </div>
            <p class="pond-feedback" aria-live="polite">先点选任一种群，查看它与谁相连。</p>
            <p class="pond-foot">每次调整一个种群，数量指数从基准重新计算。模拟采用简化的关系权重。</p>
          </section>
        </div>`;

      const plot = root.querySelector('.pond-plot');
      const canvas = root.querySelector('.pond-threads');
      const context = canvas.getContext('2d');
      const nodes = [...root.querySelectorAll('.pond-node')];
      let selected = 6;
      let disturbance = -1;
      let prediction = null;
      let values = species.map(() => 100);

      for (const [i, item] of species.entries()) {
        const drawing = nodes[i].querySelector('canvas').getContext('2d');
        drawing.lineWidth = 1.3;
        drawing.lineJoin = 'round';
        drawing.lineCap = 'round';
        drawing.strokeStyle = '#dfecf6';
        drawing.stroke(new Path2D(item.art));
      }

      function drawLinks() {
        const width = plot.clientWidth;
        const height = plot.clientHeight;
        const ratio = Math.min(devicePixelRatio || 1, 2);
        canvas.width = Math.max(1, width * ratio);
        canvas.height = Math.max(1, height * ratio);
        context.scale(ratio, ratio);
        context.clearRect(0, 0, width, height);

        for (const [food, eater] of foodLinks) {
          const from = species[food];
          const to = species[eater];
          const x1 = width * from.x / 100;
          const y1 = height * from.y / 100;
          const x2 = width * to.x / 100;
          const y2 = height * to.y / 100;
          const angle = Math.atan2(y2 - y1, x2 - x1);
          const endX = x2 - Math.cos(angle) * 35;
          const endY = y2 - Math.sin(angle) * 35;
          const related = [food, eater].includes(selected);
          const changed = values[food] !== 100 && values[eater] !== 100;
          context.strokeStyle = changed ? '#f9d390' : related ? '#e2edf7' : '#82a8c3';
          context.lineWidth = changed || related ? 1.6 : 1;
          context.setLineDash(changed || related ? [] : [3, 5]);
          context.beginPath();
          context.moveTo(x1, y1);
          context.lineTo(endX, endY);
          context.stroke();
          context.setLineDash([]);
          context.beginPath();
          context.moveTo(endX - Math.cos(angle - .48) * 8, endY - Math.sin(angle - .48) * 8);
          context.lineTo(endX, endY);
          context.lineTo(endX - Math.cos(angle + .48) * 8, endY - Math.sin(angle + .48) * 8);
          context.stroke();
        }
      }

      function update() {
        const item = species[selected];
        root.querySelector('.pond-trophic').textContent = item.type;
        root.querySelector('.pond-name').textContent = item.name;
        root.querySelector('.pond-reading strong').textContent = values[selected];
        nodes.forEach((node, i) => {
          node.setAttribute('aria-pressed', i === selected);
          node.dataset.trend = values[i] > 100 ? 'up' : values[i] < 100 ? 'down' : 'flat';
          const sign = values[i] > 100 ? '↑' : values[i] < 100 ? '↓' : '';
          node.querySelector('small').textContent = sign + values[i];
          node.setAttribute('aria-label', `${species[i].name}，${species[i].type}，数量指数 ${values[i]}`);
        });
        drawLinks();
      }

      function disturb(strength) {
        const result = species.map(() => 0);
        const source = selected;
        const origin = -100 * strength;
        disturbance = strength ? source : -1;
        result[source] = origin;

        function propagate(current, change, path, depth) {
          if (depth >= 3) return;
          for (const [food, eater, influence] of foodLinks) {
            if (food !== current && eater !== current) continue;
            const next = current === food ? eater : food;
            if (path.has(next)) continue;
            const impact = current === food ? change * influence : -change * influence * .58;
            result[next] += impact;
            propagate(next, impact, new Set([...path, next]), depth + 1);
          }
        }

        if (strength) propagate(source, origin, new Set([source]), 0);
        values = result.map(change => Math.max(0, Math.round(100 + change)));
        const feedback = root.querySelector('.pond-feedback');
        if (source === 2 && strength === 1) {
          const verdict = prediction === 'up' ? '预测正确。' : prediction ? '观察结果与预测不同。' : '';
          feedback.textContent = `${verdict}浮游动物升到 ${values[5]}。小鱼减少后，捕食浮游动物的压力减轻。苍鹭也少了一个食物来源。`;
          api.complete(prediction === 'up' ? 'prediction-matched' : prediction ? 'prediction-revised' : 'observed');
        } else if (strength) {
          api.resetResult();
          const affected = species
            .map((_, i) => i)
            .filter(i => i !== source && values[i] !== 100)
            .sort((a, b) => Math.abs(values[b] - 100) - Math.abs(values[a] - 100))[0];
          const relation = foodLinks.find(([food, eater]) =>
            (food === source && eater === affected) || (food === affected && eater === source));
          const reason = relation
            ? relation[0] === source ? '可用食物减少' : '捕食压力减轻'
            : '影响沿食物网传播';
          feedback.textContent = `${species[affected].name}的数量指数变为 ${values[affected]}，${reason}。`;
        } else {
          api.resetResult();
          feedback.textContent = '所有种群已恢复到基准值 100。可以选一个新种群再试。';
        }
        update();
      }

      nodes.forEach((node, i) => node.addEventListener('click', () => {
        selected = i;
        if (disturbance === -1) {
          const food = foodLinks.filter(([, eater]) => eater === i).map(([index]) => species[index].name);
          const consumers = foodLinks.filter(([index]) => index === i).map(([, eater]) => species[eater].name);
          const connections = [];
          if (food.length) connections.push(`以${food.join('、')}为食`);
          if (consumers.length) connections.push(`被${consumers.join('、')}取食`);
          root.querySelector('.pond-feedback').textContent = `${species[i].name}${connections.join('，')}。`;
        }
        update();
      }));
      for (const button of root.querySelectorAll('[data-strength]')) {
        button.addEventListener('click', () => disturb(Number(button.dataset.strength)));
      }
      const predictions = [...root.querySelectorAll('[data-prediction]')];
      for (const button of predictions) {
        button.addEventListener('click', () => {
          api.resetResult();
          prediction = button.dataset.prediction;
          predictions.forEach(option => option.setAttribute('aria-pressed', option === button));
          root.querySelector('.pond-feedback').textContent = `预测已记录。选择小鱼，再点「移除」验证。`;
        });
      }
      const observer = new ResizeObserver(drawLinks);
      observer.observe(plot);
      api.onCleanup(() => observer.disconnect());
      update();
    },
  });

  const lightingCues = [
    { id: 'amber', name: '琥珀', channels: [100, 65, 15] },
    { id: 'ice-blue', name: '冰蓝', channels: [20, 75, 100] },
    { id: 'lilac', name: '淡紫', channels: [75, 35, 100] },
  ];
  const getRgb = channels => channels.map(value => Math.round(value * 255 / 100));
  const hexColor = channels => '#' + getRgb(channels).map(value => value.toString(16).padStart(2, '0')).join('').toUpperCase();

  Atlas.register({
    id: 'light',
    title: '灯光合成场',
    subject: '色彩与光学',
    style: '复古霓虹剧场',
    summary: '推亮三束灯，在叠光区调出属于下一幕的颜色。',
    action: '调配灯光',
    mount(root, api) {
      const channelNames = ['红光', '绿光', '蓝光'];
      const channelLetters = ['R', 'G', 'B'];
      root.innerHTML = `
        <header class="cue-head">
          <p lang="en">The lighting booth</p>
          <h2>灯光合成场</h2>
          <p>推亮三束灯，让叠光区匹配这一幕的目标色。</p>
        </header>
        <div class="cue-layout">
          <figure class="cue-stage">
            <div class="cue-screen">
              <canvas aria-hidden="true"></canvas>
              <span class="cue-focus" aria-hidden="true"></span>
            </div>
            <figcaption><span>现场叠光</span><strong class="cue-code"></strong><span class="cue-current" aria-hidden="true"></span></figcaption>
          </figure>
          <div class="cue-desk">
            <div class="cue-target">
              <div class="cue-target-sample" aria-hidden="true"></div>
              <div><span>目标色</span><h3 class="cue-name"></h3><span class="cue-target-code"></span></div>
            </div>
            <div class="cue-picks" aria-label="选择目标色">
              ${lightingCues.map((cue, i) => `<button type="button" data-cue="${i}" aria-pressed="false"><i style="--cue-paint:${hexColor(cue.channels)}"></i>${cue.name}</button>`).join('')}
            </div>
            <div class="cue-faders">
              ${channelNames.map((name, i) => `
                <label class="cue-fader" data-channel="${i}">
                  <span><b>${channelLetters[i]}</b> ${name}</span><input type="range" min="0" max="100" step="5" value="20"><output>20%</output>
                </label>`).join('')}
            </div>
            <div class="cue-presets" aria-label="快速预览灯光组合">
              <button type="button" data-levels="0,0,0">暗场</button>
              <button type="button" data-levels="100,100,0">红 ＋ 绿</button>
              <button type="button" data-levels="100,100,100">白光</button>
            </div>
            <div class="cue-actions"><button type="button" class="cue-check">核对配色</button><button type="button" class="cue-reset">重置灯光</button></div>
            <p class="cue-feedback" aria-live="polite">红、绿、蓝三束光在中央相加。移动推杆查看变化。</p>
          </div>
        </div>`;

      let activeCue = 0;
      const inputs = [...root.querySelectorAll('input')];
      const picks = [...root.querySelectorAll('.cue-picks button')];
      const screen = root.querySelector('.cue-screen');
      const canvas = screen.querySelector('canvas');
      const context = canvas.getContext('2d');
      const feedback = root.querySelector('.cue-feedback');
      const channels = () => inputs.map(input => Number(input.value));
      const initialHint = '红、绿、蓝三束光在中央相加。移动推杆查看变化。';

      function draw() {
        const width = screen.clientWidth;
        const height = screen.clientHeight;
        const ratio = Math.min(devicePixelRatio || 1, 2);
        canvas.width = Math.max(1, width * ratio);
        canvas.height = Math.max(1, height * ratio);
        context.scale(ratio, ratio);
        context.clearRect(0, 0, width, height);

        const area = Math.min(width, height);
        const radius = area * .255;
        const offset = area * .123;
        const centerX = width * .5;
        const centerY = height * .52;
        const positions = [
          [centerX, centerY - offset],
          [centerX - offset * .92, centerY + offset * .55],
          [centerX + offset * .92, centerY + offset * .55],
        ];
        const mix = getRgb(channels());
        context.globalCompositeOperation = 'lighter';
        for (let i = 0; i < positions.length; i++) {
          const [x, y] = positions[i];
          const rgb = [0, 0, 0];
          rgb[i] = mix[i];
          const fill = context.createRadialGradient(x, y, radius * .72, x, y, radius * 1.09);
          fill.addColorStop(0, `rgba(${rgb.join(',')}, 1)`);
          fill.addColorStop(.68, `rgba(${rgb.join(',')}, .91)`);
          fill.addColorStop(1, `rgba(${rgb.join(',')}, 0)`);
          context.fillStyle = fill;
          context.beginPath();
          context.arc(x, y, radius * 1.09, 0, Math.PI * 2);
          context.fill();
        }
        context.globalCompositeOperation = 'source-over';
        context.strokeStyle = 'rgba(239,210,190,.32)';
        context.lineWidth = 1;
        context.setLineDash([2, 7]);
        for (const [x, y] of positions) {
          context.beginPath();
          context.arc(x, y, radius, 0, Math.PI * 2);
          context.stroke();
        }
      }

      function update() {
        const values = channels();
        const hex = hexColor(values);
        root.querySelector('.cue-code').textContent = hex;
        root.querySelector('.cue-current').style.backgroundColor = hex;
        inputs.forEach((input, i) => {
          input.nextElementSibling.textContent = `${values[i]}%`;
          input.style.setProperty('--level', `${values[i]}%`);
        });
        draw();
      }

      function selectCue(i) {
        api.resetResult();
        activeCue = i;
        const cue = lightingCues[i];
        const targetHex = hexColor(cue.channels);
        picks.forEach((button, index) => button.setAttribute('aria-pressed', i === index));
        root.querySelector('.cue-name').textContent = cue.name;
        root.querySelector('.cue-target-code').textContent = targetHex;
        root.querySelector('.cue-target-sample').style.backgroundColor = targetHex;
        feedback.textContent = initialHint;
        feedback.dataset.correct = 'false';
      }

      picks.forEach((button, i) => button.addEventListener('click', () => selectCue(i)));
      for (const button of root.querySelectorAll('[data-levels]')) {
        button.addEventListener('click', () => {
          api.resetResult();
          const values = button.dataset.levels.split(',');
          inputs.forEach((input, i) => { input.value = values[i]; });
          feedback.dataset.correct = 'false';
          feedback.textContent = {
            '0,0,0': '三束光都关闭时，叠光区为黑色。',
            '100,100,0': '等强的红光和绿光叠成黄色。',
            '100,100,100': '红、绿、蓝三束光等强时，叠加区呈白色。',
          }[button.dataset.levels];
          update();
        });
      }
      inputs.forEach(input => input.addEventListener('input', () => {
        api.resetResult();
        if (feedback.dataset.correct === 'true') {
          feedback.textContent = '光色已变化。核对配色可查看新的结果。';
          feedback.dataset.correct = 'false';
        }
        update();
      }));
      root.querySelector('.cue-check').addEventListener('click', () => {
        const cue = lightingCues[activeCue];
        const values = channels();
        const differences = values.map((value, i) => cue.channels[i] - value);
        if (differences.every(delta => delta === 0)) {
          feedback.textContent = `调色成功。红光 ${values[0]}%、绿光 ${values[1]}%、蓝光 ${values[2]}% 叠成${cue.name}。`;
          feedback.dataset.correct = 'true';
          api.complete(cue.id);
          return;
        }
        const mostDistant = differences.indexOf(differences.reduce((largest, next) =>
          Math.abs(next) > Math.abs(largest) ? next : largest, 0));
        feedback.textContent = `${channelNames[mostDistant]}还需要${differences[mostDistant] > 0 ? '调亮' : '调暗'}。可对照两组色号，每两位分别表示红、绿、蓝。`;
        feedback.dataset.correct = 'false';
      });
      root.querySelector('.cue-reset').addEventListener('click', () => {
        inputs.forEach(input => { input.value = 20; });
        selectCue(activeCue);
        update();
      });

      const observer = new ResizeObserver(draw);
      observer.observe(screen);
      api.onCleanup(() => observer.disconnect());
      selectCue(0);
      update();
    },
  });

  const walls = new Set(['4,3', '3,0', '3,1', '3,3', '3,4', '2,0', '2,1', '1,2', '1,3']);
  const batteries = ['4,2', '2,2'];
  const exit = '2,4';
  const commands = {
    forward: { symbol: '↑', label: '前进', color: 'green' },
    left: { symbol: '↶', label: '左转', color: 'orange' },
    right: { symbol: '↷', label: '右转', color: 'orange' },
    repeat: { symbol: '×2', label: '重复前进', color: 'purple' },
  };
  const directions = [[-1, 0], [0, 1], [1, 0], [0, -1]];

  Atlas.register({
    id: 'logic',
    title: '回路小机器人',
    subject: '计算思维',
    style: '彩色像素掌机',
    summary: '给机器人排好指令，让它带着两节电池抵达终点。',
    action: '编排指令',
    mount(root, api) {
      root.innerHTML = `
        <div class="bot-chassis">
          <header class="bot-head"><div><p lang="en">Pocket program</p><h2>回路小机器人</h2></div><span class="bot-speaker" aria-hidden="true"></span></header>
          <div class="bot-layout">
            <section class="bot-console" aria-label="机器人地图">
              <div class="bot-screen-head">
                <span>收集电池 <strong class="bot-count">0 / 2</strong></span>
                <button type="button" class="bot-trace" aria-pressed="true">显示轨迹</button>
              </div>
              <div class="bot-grid" aria-hidden="true"></div>
              <p class="bot-position"></p>
              <details class="bot-legend">
                <summary>读地图</summary>
                <p>条纹块是障碍。电池在第 5 行第 3 列和第 3 行第 3 列。打勾的出口在第 3 行第 5 列。</p>
              </details>
            </section>
            <section class="bot-program" aria-label="程序编辑器">
              <p class="bot-mission">收集两节电池并抵达出口。试试用「重复前进」节省指令。</p>
              <div class="bot-palette" aria-label="可添加的指令">
                ${Object.entries(commands).map(([id, item]) => `
                  <button type="button" data-add="${id}" data-paint="${item.color}"${id === 'repeat' ? ' aria-label="添加重复前进两格"' : ''}><strong aria-hidden="true">${item.symbol}</strong>${item.label}</button>`).join('')}
              </div>
              <div class="bot-memory">
                <div><h3>指令列</h3><span class="bot-slots"></span></div>
                <div class="bot-queue" aria-label="当前指令"></div>
              </div>
              <div class="bot-run">
                <button type="button" data-run="step">单步执行</button>
                <button type="button" data-run="play">运行</button>
                <button type="button" data-run="restart">回到起点</button>
                <button type="button" data-run="clear">清空</button>
              </div>
              <p class="bot-feedback" aria-live="polite">机器人从左下角出发，初始朝右。点指令把它放进指令列。</p>
            </section>
          </div>
        </div>`;

      const program = [];
      const status = root.querySelector('.bot-feedback');
      const queue = root.querySelector('.bot-queue');
      const palette = [...root.querySelectorAll('[data-add]')];
      const stepButton = root.querySelector('[data-run="step"]');
      const playButton = root.querySelector('[data-run="play"]');
      const maxCommands = 8;
      let row = 4;
      let column = 0;
      let heading = 1;
      let cursor = 0;
      let repetitionsLeft = 0;
      let collected = new Set();
      let visited = new Set(['4,0']);
      let steps = 0;
      let showTrace = true;
      let running = false;
      let finished = false;
      let timer = null;

      root.querySelector('.bot-grid').innerHTML = Array.from({ length: 25 }, (_, i) =>
        `<div class="bot-cell" data-coordinate="${Math.floor(i / 5)},${i % 5}"></div>`).join('');

      function drawMap() {
        const position = `${row},${column}`;
        for (const cell of root.querySelectorAll('.bot-cell')) {
          const coordinate = cell.dataset.coordinate;
          cell.dataset.cell = walls.has(coordinate) ? 'wall' : coordinate === exit ? 'exit' :
            batteries.includes(coordinate) && !collected.has(coordinate) ? 'battery' : 'floor';
          cell.classList.toggle('bot-here', coordinate === position);
          cell.classList.toggle('bot-visited', showTrace && visited.has(coordinate) && coordinate !== position);
          cell.innerHTML = coordinate === position ? `<i class="bot-robot" style="--turn:${heading * 90}deg"></i>` : '';
        }
        root.querySelector('.bot-count').textContent = `${collected.size} / 2`;
        root.querySelector('.bot-position').textContent = `第 ${row + 1} 行、第 ${column + 1} 列 · 朝${['上', '右', '下', '左'][heading]} · 已走 ${steps} 格`;
      }

      function drawProgram(focusIndex = null) {
        root.querySelector('.bot-slots').textContent = `${program.length} / ${maxCommands} 格`;
        queue.innerHTML = program.length ? program.map((command, i) => {
          const item = commands[command];
          const current = i === cursor && (cursor > 0 || repetitionsLeft > 0);
          return `<button type="button" data-remove="${i}" data-paint="${item.color}" ${current ? 'aria-current="step"' : ''} ${running ? 'disabled' : ''} aria-label="移除第 ${i + 1} 条指令 ${item.label}"><span aria-hidden="true">${item.symbol}</span><small>${i + 1}</small></button>`;
        }).join('') : '<p>等待写入指令</p>';
        palette.forEach(button => { button.disabled = running || program.length >= maxCommands; });
        stepButton.disabled = running || !program.length;
        playButton.textContent = running ? '暂停' : '运行';
        playButton.disabled = !program.length;
        if (focusIndex !== null) {
          const next = queue.querySelector(`[data-remove="${Math.min(focusIndex, program.length - 1)}"]`);
          (next || palette[0]).focus();
        }
      }

      function stop() {
        running = false;
        clearTimeout(timer);
        timer = null;
      }

      function resetPosition() {
        api.resetResult();
        stop();
        row = 4;
        column = 0;
        heading = 1;
        cursor = 0;
        repetitionsLeft = 0;
        finished = false;
        collected = new Set();
        visited = new Set(['4,0']);
        steps = 0;
        drawMap();
      }

      function endRun(message) {
        stop();
        finished = true;
        status.textContent = message;
      }

      function advance() {
        if (finished) resetPosition();
        const command = program[cursor];
        let message = `已执行第 ${cursor + 1} 条「${commands[command].label}」。`;
        if (command === 'left' || command === 'right') {
          heading = (heading + (command === 'left' ? 3 : 1)) % 4;
        } else {
          if (command === 'repeat' && !repetitionsLeft) repetitionsLeft = 2;
          const [dy, dx] = directions[heading];
          const nextRow = row + dy;
          const nextColumn = column + dx;
          const nextPosition = `${nextRow},${nextColumn}`;
          if ([nextRow, nextColumn].some(value => value < 0 || value > 4) || walls.has(nextPosition)) {
            endRun(`第 ${cursor + 1} 条指令撞上障碍。调整转向或前进次数，再从起点试一次。`);
            drawProgram();
            return;
          }
          row = nextRow;
          column = nextColumn;
          visited.add(nextPosition);
          steps++;
          if (batteries.includes(nextPosition)) collected.add(nextPosition);
          if (repetitionsLeft) {
            repetitionsLeft--;
            message = repetitionsLeft ? '重复前进：已走第一格，下一步再走一格。' : '重复前进：同一动作已执行两次。';
          }
        }
        if (!repetitionsLeft) cursor++;
        drawMap();
        status.textContent = message;
        if (`${row},${column}` === exit && collected.size === 2) {
          const repeatUsed = program.slice(0, cursor + Number(repetitionsLeft > 0)).includes('repeat');
          endRun(repeatUsed ? '抵达出口！重复前进用一个指令格执行了两次前进。' :
            '抵达出口！用一条「重复前进」替换相邻两条前进，可以缩短程序。');
          api.complete(repeatUsed ? 'repeat' : 'basic');
        } else if (cursor === program.length) {
          endRun(`程序已执行完，收集了 ${collected.size} 节电池。继续补充或调整指令后，从起点重跑。`);
        }
        drawProgram();
      }

      function run() {
        advance();
        if (running) timer = setTimeout(run, 360);
      }

      palette.forEach(button => button.addEventListener('click', () => {
        program.push(button.dataset.add);
        resetPosition();
        drawProgram();
        if (button.disabled) stepButton.focus();
        status.textContent = `已加入「${commands[button.dataset.add].label}」。点指令列中的按钮可以移除该条指令。`;
      }));
      queue.addEventListener('click', event => {
        const button = event.target.closest('[data-remove]');
        if (!button) return;
        const index = Number(button.dataset.remove);
        program.splice(index, 1);
        resetPosition();
        drawProgram(index);
        status.textContent = `已移除第 ${index + 1} 条指令，机器人回到起点。`;
      });
      stepButton.addEventListener('click', advance);
      playButton.addEventListener('click', () => {
        if (running) {
          stop();
          drawProgram();
          status.textContent = '已暂停。可以继续运行，或者单步检查。';
        } else {
          if (finished) resetPosition();
          running = true;
          run();
        }
      });
      root.querySelector('[data-run="clear"]').addEventListener('click', () => {
        program.length = 0;
        resetPosition();
        drawProgram();
        status.textContent = '程序已清空。选择新指令开始。';
      });
      root.querySelector('[data-run="restart"]').addEventListener('click', () => {
        resetPosition();
        drawProgram();
        status.textContent = '机器人已回到起点，指令保留。';
      });
      root.querySelector('.bot-trace').addEventListener('click', event => {
        showTrace = !showTrace;
        event.currentTarget.setAttribute('aria-pressed', showTrace);
        drawMap();
      });
      api.onCleanup(stop);
      drawMap();
      drawProgram();
    },
  });
}());
