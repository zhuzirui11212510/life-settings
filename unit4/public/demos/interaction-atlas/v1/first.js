(() => {
  const angleInRadians = (degrees) => degrees * Math.PI / 180;
  const angleInDegrees = (radians) => radians * 180 / Math.PI;

  const opticsPresets = [
    { outcome: 'glass-air', label: '玻璃 → 空气', from: '玻璃', to: '空气', nFrom: 1.52, nTo: 1 },
    { outcome: 'water-air', label: '水 → 空气', from: '水', to: '空气', nFrom: 1.33, nTo: 1 },
    { label: '空气 → 玻璃', from: '空气', to: '玻璃', nFrom: 1, nTo: 1.52 },
  ];

  function drawRayDiagram(canvas, medium, degrees, refracted, showAngles) {
    const context = canvas.getContext('2d');
    const width = 610;
    const height = 360;
    const centerX = 288;
    const centerY = 179;
    const incident = angleInRadians(degrees);
    const hasRefraction = refracted !== null;
    const reflectance = (() => {
      if (!hasRefraction) return 1;
      const first = medium.nFrom * Math.cos(incident);
      const second = medium.nTo * Math.cos(refracted);
      const third = medium.nTo * Math.cos(incident);
      const fourth = medium.nFrom * Math.cos(refracted);
      return (((first - second) / (first + second)) ** 2 + ((third - fourth) / (third + fourth)) ** 2) / 2;
    })();

    context.setTransform(canvas.width / width, 0, 0, canvas.height / height, 0, 0);
    context.clearRect(0, 0, width, height);
    context.fillStyle = '#0b282e';
    context.fillRect(0, 0, width, centerY);
    context.fillStyle = '#071c24';
    context.fillRect(0, centerY, width, height - centerY);
    context.strokeStyle = '#193a40';
    context.lineWidth = 1;
    context.beginPath();
    for (let x = 8; x < width; x += 28) {
      context.moveTo(x, 0);
      context.lineTo(x, height);
    }
    for (let y = 11; y < height; y += 28) {
      context.moveTo(0, y);
      context.lineTo(width, y);
    }
    context.stroke();

    function line(x1, y1, x2, y2, color, weight = 1) {
      context.strokeStyle = color;
      context.lineWidth = weight;
      context.beginPath();
      context.moveTo(x1, y1);
      context.lineTo(x2, y2);
      context.stroke();
    }

    function ray(dx, dy, color, incoming, opacity, arrowPosition = .69, weight = 3) {
      const availableX = dx > 0 ? width - centerX - 30 : centerX - 30;
      const availableY = dy > 0 ? height - centerY - 32 : centerY - 31;
      const length = Math.min(availableX / Math.abs(dx), availableY / Math.abs(dy));
      const arrowX = centerX + dx * length * arrowPosition;
      const arrowY = centerY + dy * length * arrowPosition;
      const direction = Math.atan2(dy, dx) + (incoming ? Math.PI : 0);
      context.save();
      context.globalAlpha = opacity;
      context.shadowBlur = 15;
      context.shadowColor = color;
      line(centerX, centerY, centerX + dx * length, centerY + dy * length, color, weight);
      context.fillStyle = color;
      context.beginPath();
      context.moveTo(arrowX + 10 * Math.cos(direction), arrowY + 10 * Math.sin(direction));
      context.lineTo(arrowX + 9 * Math.cos(direction + 2.35), arrowY + 9 * Math.sin(direction + 2.35));
      context.lineTo(arrowX + 9 * Math.cos(direction - 2.35), arrowY + 9 * Math.sin(direction - 2.35));
      context.closePath();
      context.fill();
      context.restore();
    }

    line(0, centerY, width, centerY, '#4e7b7e', 1.5);
    context.setLineDash([4, 6]);
    line(centerX, 29, centerX, height - 31, '#97bcbc');
    context.setLineDash([]);
    if (degrees > 0) {
      ray(Math.sin(incident), -Math.cos(incident), '#f5ba73', false, .28 + .72 * Math.sqrt(reflectance));
    }
    ray(-Math.sin(incident), -Math.cos(incident), '#62ffdc', true, 1);
    if (degrees === 0) ray(0, -1, '#f5ba73', false, .6, .7, 1);
    if (hasRefraction) {
      ray(Math.sin(refracted), Math.cos(refracted), '#a7cfff', false, .28 + .72 * Math.sqrt(1 - reflectance));
    }

    if (showAngles && degrees > 0) {
      const arcs = [[-Math.PI / 2 - incident, -Math.PI / 2, '#62ffdc', 'θ₁']];
      if (hasRefraction) arcs.push([Math.PI / 2 - refracted, Math.PI / 2, '#a7cfff', 'θ₂']);
      arcs.forEach(([start, end, color, label]) => {
        context.strokeStyle = color;
        context.lineWidth = 1.2;
        context.beginPath();
        context.arc(centerX, centerY, 42, start, end);
        context.stroke();
        const midpoint = (start + end) / 2;
        context.font = 'italic 15px Georgia, serif';
        context.textAlign = 'center';
        context.fillStyle = color;
        context.fillText(label, centerX + 57 * Math.cos(midpoint), centerY + 56 * Math.sin(midpoint) + 4);
      });
    }

    context.fillStyle = '#e9fff8';
    context.beginPath();
    context.arc(centerX, centerY, 4, 0, 2 * Math.PI);
    context.fill();
    context.font = '600 20px "Microsoft YaHei", sans-serif';
    context.textAlign = 'left';
    context.fillStyle = '#c3dedd';
    context.fillText(`${medium.from}  n = ${medium.nFrom.toFixed(2)}`, 22, 32);
    context.fillText(`${medium.to}  n = ${medium.nTo.toFixed(2)}`, 22, height - 18);
    context.textAlign = 'right';
    context.font = '600 17px "Microsoft YaHei", sans-serif';
    context.fillText('法线', centerX - 9, 31);
    context.fillText('界面', width - 20, centerY - 9);
  }

  window.Atlas.register({
    id: 'refraction',
    title: '全反射实验室',
    subject: '物理',
    style: '示波器界面',
    summary: '改变光的入射角，观察折射光何时消失。',
    action: '让光发生一次全反射',
    mount(root, api) {
      root.innerHTML = `
        <div class="ray-heading">
          <div><h2>全反射实验室</h2><p>让一束光从介质界面折返回去。</p></div>
          <span class="ray-equation" aria-label="斯涅尔定律">n₁ sin θ₁ = n₂ sin θ₂</span>
        </div>
        <div class="ray-workbench">
          <figure class="ray-scope">
            <div class="ray-screen"><canvas class="ray-drag" width="1220" height="720" role="img" aria-describedby="ray-drag-tip" aria-label="入射光、反射光和折射光的路径图"></canvas></div>
            <figcaption><span><i></i>入射光</span><span><i></i>反射光</span><span><i></i>折射光</span></figcaption>
            <p id="ray-drag-tip">在图的上半区拖动光束，也可调节入射角。</p>
          </figure>
          <div class="ray-controls">
            <fieldset><legend>介质切换</legend>
              ${opticsPresets.map((preset, index) => `<button type="button" data-medium="${index}" aria-pressed="${index === 0}">${preset.label}</button>`).join('')}
            </fieldset>
            <div class="ray-angle"><label for="ray-angle">入射角</label><output for="ray-angle" data-angle></output></div>
            <input type="range" id="ray-angle" min="0" max="80" value="28">
            <div class="ray-ticks" aria-hidden="true"><span>0°</span><span>40°</span><span>80°</span></div>
            <dl><div><dt>临界角</dt><dd data-critical></dd></div><div><dt>折射角</dt><dd data-refracted></dd></div></dl>
            <div class="ray-extra"><button type="button" data-edge="before">略低于临界角</button><button type="button" data-edge="after">略高于临界角</button><button type="button" data-arcs aria-pressed="true">角度标记</button><button type="button" data-ray-reset>复位</button></div>
          </div>
        </div>
        <div class="ray-status" role="status" aria-live="polite"><strong></strong><p></p></div>`;

      const angle = root.querySelector('input');
      const canvas = root.querySelector('canvas');
      const status = root.querySelector('.ray-status');
      const edges = root.querySelectorAll('[data-edge]');
      const arcs = root.querySelector('[data-arcs]');
      const media = root.querySelectorAll('[data-medium]');
      let mediumIndex = 0;
      let critical = null;
      let dragPointer = null;

      function update() {
        const degrees = Number(angle.value);
        const medium = opticsPresets[mediumIndex];
        const hasCritical = medium.nFrom > medium.nTo;
        critical = hasCritical ? angleInDegrees(Math.asin(medium.nTo / medium.nFrom)) : null;
        const ratio = medium.nFrom / medium.nTo * Math.sin(angleInRadians(degrees));
        const refracted = ratio > 1 ? null : Math.asin(ratio);
        const isTotal = refracted === null;
        const refractionText = isTotal ? '无' : `${angleInDegrees(refracted).toFixed(1)}°`;
        root.querySelector('[data-angle]').textContent = `${degrees}°`;
        root.querySelector('[data-critical]').textContent = hasCritical ? `${critical.toFixed(1)}°` : '无';
        root.querySelector('[data-refracted]').textContent = refractionText;
        angle.setAttribute('aria-valuetext', `${degrees} 度`);
        canvas.setAttribute('aria-label', `${medium.label}，入射角 ${degrees}°，折射角${refractionText}`);
        drawRayDiagram(canvas, medium, degrees, refracted, arcs.getAttribute('aria-pressed') === 'true');
        edges.forEach((button) => button.disabled = !hasCritical);
        const title = isTotal ? '全反射' : '有折射光';
        const detail = isTotal
          ? '入射角已经超过临界角，折射光消失。'
          : hasCritical
            ? '继续增大入射角，观察折射光如何贴近介质界面。'
            : '光进入折射率更大的介质时，折射光朝法线偏折。';
        if (status.querySelector('p').textContent !== detail) {
          status.dataset.total = String(isTotal);
          status.querySelector('strong').textContent = title;
          status.querySelector('p').textContent = detail;
        }
        if (isTotal) api.complete(medium.outcome);
        else api.resetResult();
      }

      function setAngle(degrees) {
        angle.value = Math.round(degrees);
        update();
      }

      function setMedium(index) {
        mediumIndex = index;
        media.forEach((button, current) => button.setAttribute('aria-pressed', String(current === index)));
      }

      function dragRay(event) {
        const bounds = canvas.getBoundingClientRect();
        const x = (event.clientX - bounds.left) * 610 / bounds.width - 288;
        const y = 179 - (event.clientY - bounds.top) * 360 / bounds.height;
        setAngle(angleInDegrees(Math.atan2(Math.abs(x), Math.max(y, 1))));
      }

      angle.addEventListener('input', update);
      media.forEach((button) => {
        button.addEventListener('click', () => {
          setMedium(Number(button.dataset.medium));
          update();
        });
      });
      edges.forEach((button) => button.addEventListener('click', () => {
        setAngle(button.dataset.edge === 'before' ? Math.ceil(critical) - 1 : Math.floor(critical) + 1);
      }));
      arcs.addEventListener('click', () => {
        arcs.setAttribute('aria-pressed', String(arcs.getAttribute('aria-pressed') !== 'true'));
        update();
      });
      root.querySelector('[data-ray-reset]').addEventListener('click', () => {
        setMedium(0);
        arcs.setAttribute('aria-pressed', 'true');
        setAngle(28);
      });
      canvas.addEventListener('pointerdown', (event) => {
        const bounds = canvas.getBoundingClientRect();
        if (event.button !== 0 || event.clientY >= bounds.top + bounds.height / 2 || dragPointer !== null) return;
        dragPointer = event.pointerId;
        canvas.setPointerCapture(event.pointerId);
        dragRay(event);
      });
      canvas.addEventListener('pointermove', (event) => {
        if (event.pointerId === dragPointer) dragRay(event);
      });
      ['pointerup', 'pointercancel', 'lostpointercapture'].forEach((type) => {
        canvas.addEventListener(type, (event) => {
          if (event.pointerId === dragPointer) dragPointer = null;
        });
      });
      update();
    },
  });

  const argumentSlots = ['主张', '证据', '推理'];
  const argumentClips = [
    { role: 1, text: '试行班的连续专注时间增加 3 分钟，对照班几乎不变。' },
    { role: -1, text: '隔壁班的班长说，很多人都喜欢看书。' },
    { role: 2, text: '差异值得继续观察，延长试行可以看效果是否持续。' },
    { role: -1, text: '既然效果这么明显，全校都应该立刻照做。' },
    { role: 0, text: '建议本年级再试行两周课前安静阅读。' },
    { role: -1, text: '连续专注时间增加，说明期末成绩肯定会提高。' },
  ];

  window.Atlas.register({
    id: 'argument',
    title: '论证剪贴台',
    subject: '语文',
    style: '瑞士主义拼贴',
    summary: '从六张纸条里挑出主张、证据和推理，拼成一段论证。',
    action: '组出一段经得起核对的论证',
    mount(root, api) {
      root.innerHTML = `
        <header class="clip-heading">
          <div><h2>论证剪贴台</h2><p>选纸槽，再点击纸条。<span class="clip-drag-tip">也可直接拖放。</span></p></div>
          <p class="clip-brief">同年级两个班试行一周。试行班上课前安静阅读 10 分钟，对照班照常。教研会要决定是否延长试行。</p>
        </header>
        <div class="clip-board">
          <section class="clip-source" aria-label="备选纸条">
            <h3>备选纸条</h3>
            <div class="clip-grid">
              ${argumentClips.map((clip, index) => `<button type="button" data-clip="${index}" draggable="true"><span>${String.fromCharCode(65 + index)}</span>${clip.text}</button>`).join('')}
            </div>
          </section>
          <section class="clip-layout" aria-label="论证段落">
            <h3>段落工作台</h3>
            <div class="clip-slots">
              ${argumentSlots.map((role, index) => `<button type="button" data-slot="${index}" aria-pressed="${index === 0}"><b>${role}</b><span>放入纸条</span></button>`).join('')}
            </div>
            <div class="clip-actions"><button type="button" data-check>核对段落</button><button type="button" data-remove>取出选中纸条</button><button type="button" data-clear>清空</button></div>
          </section>
        </div>
        <p class="clip-feedback" role="status">先为「主张」选一张纸条。</p>`;

      const selection = [null, null, null];
      let active = 0;
      let revised = false;
      const feedback = root.querySelector('.clip-feedback');
      const remove = root.querySelector('[data-remove]');
      const slots = [...root.querySelectorAll('[data-slot]')];
      const clips = [...root.querySelectorAll('[data-clip]')];

      function update() {
        slots.forEach((button, index) => {
          const selected = selection[index];
          button.setAttribute('aria-pressed', String(active === index));
          button.querySelector('span').textContent = selected === null ? '放入纸条' : argumentClips[selected].text;
          button.dataset.filled = String(selected !== null);
        });
        clips.forEach((button, index) => button.dataset.used = String(selection.includes(index)));
        remove.disabled = selection[active] === null;
      }

      function clearMarks() {
        slots.forEach((button) => delete button.dataset.mark);
        delete feedback.dataset.result;
        api.resetResult();
      }

      function insertClip(index, filled) {
        clearMarks();
        const previous = selection.indexOf(index);
        if (previous !== -1) selection[previous] = null;
        selection[filled] = index;
        const next = selection.indexOf(null);
        active = next >= 0 ? next : filled;
        const instruction = next < 0 ? '可以核对段落。' : `接下来为「${argumentSlots[active]}」选纸条。`;
        feedback.textContent = `纸条 ${String.fromCharCode(65 + index)} 已放入「${argumentSlots[filled]}」。${instruction}`;
        update();
      }

      const clipType = 'application/x-atlas-clip';
      slots.forEach((slot, index) => {
        slot.addEventListener('click', () => {
          active = index;
          delete feedback.dataset.result;
          feedback.textContent = `为「${argumentSlots[active]}」选一张纸条。`;
          update();
        });
        slot.addEventListener('dragover', (event) => {
          if (!event.dataTransfer.types.includes(clipType)) return;
          event.preventDefault();
          event.dataTransfer.dropEffect = 'copy';
          slot.dataset.over = 'true';
        });
        slot.addEventListener('dragleave', (event) => {
          if (!slot.contains(event.relatedTarget)) delete slot.dataset.over;
        });
        slot.addEventListener('drop', (event) => {
          event.preventDefault();
          delete slot.dataset.over;
          const data = event.dataTransfer.getData(clipType);
          if (/^[0-5]$/.test(data)) insertClip(Number(data), index);
        });
      });
      clips.forEach((clip, index) => {
        clip.addEventListener('click', () => insertClip(index, active));
        clip.addEventListener('dragstart', (event) => {
          event.dataTransfer.effectAllowed = 'copy';
          event.dataTransfer.setData(clipType, String(index));
        });
        clip.addEventListener('dragend', () => slots.forEach((slot) => delete slot.dataset.over));
      });
      remove.addEventListener('click', () => {
        selection[active] = null;
        clearMarks();
        feedback.textContent = `「${argumentSlots[active]}」的纸条已取出。`;
        update();
      });
      root.querySelector('[data-clear]').addEventListener('click', () => {
        selection.fill(null);
        active = 0;
        clearMarks();
        feedback.textContent = '先为「主张」选一张纸条。';
        update();
      });
      root.querySelector('[data-check]').addEventListener('click', () => {
        const empty = selection.indexOf(null);
        if (empty !== -1) {
          active = empty;
          feedback.textContent = `「${argumentSlots[empty]}」还空着，选一张纸条补上。`;
          update();
          return;
        }
        const correct = selection.map((item, index) => argumentClips[item].role === index);
        slots.forEach((button, index) => button.dataset.mark = correct[index] ? 'yes' : 'revise');
        const issue = correct.indexOf(false);
        if (issue === -1) {
          feedback.dataset.result = 'success';
          feedback.textContent = '段落成立。你用试行数据支持了一个范围适当的建议，并说明了继续观察的理由。';
          api.complete(revised ? 'revised' : 'first-check');
          return;
        }
        revised = true;
        const hints = [
          '主张需要提出可执行的下一步，注意试行只有一周。',
          '证据需要呈现两个班实际观察到的差异。',
          '推理需要说明现有数据为什么支持继续试行。',
        ];
        feedback.dataset.result = 'revise';
        feedback.textContent = hints[issue];
        active = issue;
        update();
      });
      update();
    },
  });

  const portionCounts = [4, 6, 8, 9, 12];
  const equalPortions = { 6: 'four-sixths', 9: 'six-ninths', 12: 'eight-twelfths' };

  window.Atlas.register({
    id: 'fractions',
    title: '分数茶席',
    subject: '数学',
    style: '日式青白瓷',
    summary: '重新等分一只瓷盘，让蓝色占据同样大的面积。',
    action: '用不同的切分配出相同的份量',
    mount(root, api) {
      root.innerHTML = `
        <header class="tea-heading"><h2>分数茶席</h2><p>改变右盘的切分，让两只盘里的蓝色份量一样多。</p></header>
        <div class="tea-table">
          <figure class="tea-setting">
            <div class="tea-plate" style="--tea-slice:120deg;--tea-filled:240deg" role="img" aria-label="左盘三等分，其中两份涂蓝"></div>
            <figcaption><span class="tea-frac" aria-label="三分之二"><b>2</b><b>3</b></span><span>参考份量</span></figcaption>
          </figure>
          <span class="tea-sign" aria-hidden="true">&gt;</span>
          <figure class="tea-setting">
            <button type="button" class="tea-plate" aria-label="右盘，点击扇区涂色，按空格增加一份" aria-describedby="tea-help"></button>
            <figcaption><span class="tea-frac" data-portions><b></b><b></b></span><span>你的份量</span></figcaption>
          </figure>
        </div>
        <div class="tea-controls">
          <fieldset class="tea-divider"><legend>等分数</legend>${portionCounts.map((count) => `<button type="button" data-parts="${count}" aria-pressed="${count === 4}">${count}</button>`).join('')}</fieldset>
          <fieldset class="tea-measure"><legend>涂蓝的份数</legend><button type="button" data-step="-1" aria-label="少涂一份">−</button><output></output><button type="button" data-step="1" aria-label="多涂一份">+</button></fieldset>
          <div class="tea-tools"><button type="button" data-compare aria-pressed="false">叠放参照线</button><button type="button" data-reset>复位</button></div>
        </div>
        <p id="tea-help">点右盘的一格可涂到该格，重新切分会清空右盘。</p>
        <p class="tea-feedback" role="status"></p>`;

      const plate = root.querySelector('button.tea-plate');
      const fraction = root.querySelector('[data-portions]');
      const mark = root.querySelector('.tea-sign');
      const feedback = root.querySelector('.tea-feedback');
      const remove = root.querySelector('[data-step="-1"]');
      const add = root.querySelector('[data-step="1"]');
      const compare = root.querySelector('button[data-compare]');
      const portions = root.querySelectorAll('[data-parts]');
      let total = 4;
      let colored = 1;

      function update() {
        const delta = 3 * colored - 2 * total;
        plate.style.setProperty('--tea-slice', `${360 / total}deg`);
        plate.style.setProperty('--tea-filled', `${360 * colored / total}deg`);
        plate.setAttribute('aria-label', `右盘 ${total} 等分，已涂蓝 ${colored} 份，按空格增加一份`);
        fraction.setAttribute('aria-label', `${colored}／${total}`);
        fraction.children[0].textContent = colored;
        fraction.children[1].textContent = total;
        root.querySelector('output').textContent = colored;
        remove.disabled = colored === 0;
        add.disabled = colored === total;
        portions.forEach((button) => button.setAttribute('aria-pressed', String(Number(button.dataset.parts) === total)));
        mark.textContent = delta === 0 ? '=' : delta < 0 ? '>' : '<';
        feedback.dataset.equal = String(delta === 0);
        if (delta === 0) {
          feedback.textContent = `${colored}/${total} 的分子和分母同时除以 ${total / 3}，得到 2/3。两盘涂蓝的面积相等。`;
          api.complete(equalPortions[total]);
          return;
        }
        api.resetResult();
        const comparison = delta < 0 ? '少于' : '多于';
        const guidance = total % 3 === 0 ? '微调涂蓝的份数。' : '试试换成能被 3 整除的等分数。';
        feedback.textContent = `右盘蓝色${comparison}左盘。${guidance}`;
      }

      portions.forEach((button) => button.addEventListener('click', () => {
        const next = Number(button.dataset.parts);
        if (total === next) return;
        total = next;
        colored = 0;
        update();
      }));
      [remove, add].forEach((button) => button.addEventListener('click', () => {
        colored += Number(button.dataset.step);
        update();
      }));
      plate.addEventListener('click', (event) => {
        if (event.detail === 0) {
          colored = Math.min(total, colored + 1);
        } else {
          const bounds = plate.getBoundingClientRect();
          const x = event.clientX - bounds.left - bounds.width / 2;
          const y = event.clientY - bounds.top - bounds.height / 2;
          const degrees = (angleInDegrees(Math.atan2(x, -y)) + 360) % 360;
          colored = Math.floor(degrees * total / 360) + 1;
        }
        update();
      });
      compare.addEventListener('click', () => {
        const enabled = compare.getAttribute('aria-pressed') !== 'true';
        compare.setAttribute('aria-pressed', String(enabled));
        plate.dataset.compare = String(enabled);
        root.querySelector('#tea-help').textContent = enabled
          ? '橙线之间是左盘蓝色的范围。点右盘扇区调整涂色。'
          : '点右盘的一格可涂到该格，重新切分会清空右盘。';
      });
      root.querySelector('[data-reset]').addEventListener('click', () => {
        if (compare.getAttribute('aria-pressed') === 'true') compare.click();
        total = 4;
        colored = 1;
        update();
      });
      update();
    },
  });
})();
