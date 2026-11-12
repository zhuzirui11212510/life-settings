(() => {
  'use strict';

  const strataLayers = [
    { name: '表土', finding: '近代根系', note: '根系和腐殖质覆盖着下面的沉积层。' },
    { name: '火山灰', finding: '约 760 年前', note: '火山灰覆盖了陶片所在的地层。' },
    { name: '生活堆积', finding: '未定年的陶片', note: '陶片是在这一层沉积时被埋下的。' },
    { name: '灰烬层', finding: '约 1,240 年前', note: '测过年代的木炭位于陶片下方。' },
    { name: '原生砂砾', finding: '剖面底部', note: '这一层由自然沉积形成。' }
  ];

  window.Atlas.register({
    id: 'strata',
    title: '土下年表',
    subject: '考古',
    style: '野外考察手记',
    summary: '揭开未受扰动的剖面，用上下两层的证据给陶片定年。',
    action: '逐层发掘',
    mount(root, api) {
      root.innerHTML = `
        <div class="field-plate">
          <header class="field-heading">
            <div><p class="field-caption">遗址剖面记录</p><h2>土下年表</h2></div>
            <p class="field-intro">按发掘顺序揭开土层，看看能否根据沉积位置推断陶片被埋下的时间。</p>
          </header>
          <div class="field-layout">
            <figure class="field-figure">
              <div class="field-drawing">
                <div class="field-scale" aria-hidden="true"><span>地表</span><span>40 cm</span><span>80 cm</span><span>120 cm</span></div>
                <div class="field-section">
                  ${strataLayers.map((layer, i) => `
                    <button class="field-bed field-bed-${i}" type="button">
                      <span class="field-texture" aria-hidden="true"></span>
                      <span class="field-find field-find-${i}" aria-hidden="true"></span>
                      <span class="field-bed-label" aria-hidden="true"></span>
                    </button>
                  `).join('')}
                </div>
              </div>
              <figcaption><span>探方剖面</span><span>地层未经扰动</span></figcaption>
            </figure>
            <div class="field-notes">
              <div class="field-tools">
                <button class="field-dig" type="button">揭开表土</button>
                <button class="field-reset" type="button">重新发掘</button>
              </div>
              <p class="field-status" aria-live="polite">从地表开始，逐层记录发现。</p>
              <ol class="field-logs" aria-label="地层记录">
                ${strataLayers.map((layer, i) => `
                  <li class="field-log">
                    <button class="field-log-button" type="button" disabled aria-pressed="false">
                      <span class="field-log-number">${i + 1}</span>
                      <span class="field-log-name">尚未揭开</span>
                      <strong class="field-log-finding"></strong>
                    </button>
                  </li>
                `).join('')}
              </ol>
              <div class="field-question" hidden>
                <fieldset>
                  <legend>陶片大约何时被埋下？</legend>
                  <div class="field-options">
                    <button type="button" data-choice="recent">距今不到 760 年</button>
                    <button type="button" data-choice="middle">距今 760 至 1,240 年</button>
                    <button type="button" data-choice="old">距今超过 1,240 年</button>
                  </div>
                </fieldset>
                <p class="field-answer" aria-live="polite"></p>
              </div>
            </div>
          </div>
        </div>`;

      const digButton = root.querySelector('.field-dig');
      const status = root.querySelector('.field-status');
      const logs = [...root.querySelectorAll('.field-log-button')];
      const beds = [...root.querySelectorAll('.field-bed')];
      const question = root.querySelector('.field-question');
      const answer = root.querySelector('.field-answer');
      const choices = [...root.querySelectorAll('[data-choice]')];
      let depth = 0;
      let selected = -1;

      function inspectLayer(i) {
        selected = i;
        status.textContent = strataLayers[i].note;
        updateLayers();
      }

      function updateLayers() {
        for (const [i, layer] of strataLayers.entries()) {
          const revealed = i < depth;
          const next = i === depth;
          logs[i].disabled = !revealed;
          logs[i].setAttribute('aria-pressed', String(i === selected));
          beds[i].disabled = !revealed && !next;
          beds[i].setAttribute('aria-label', revealed ? `查看${layer.name}记录` : next ? `揭开${layer.name}` : `第 ${i + 1} 层尚未揭开`);
          beds[i].classList.toggle('is-revealed', revealed);
          beds[i].classList.toggle('is-next', next);
          beds[i].classList.toggle('is-selected', i === selected);
          beds[i].querySelector('.field-bed-label').textContent = revealed ? layer.name : next ? '揭开 ↓' : '';
          logs[i].querySelector('.field-log-name').textContent = revealed ? layer.name : '尚未揭开';
          logs[i].querySelector('.field-log-finding').textContent = revealed ? layer.finding : '';
        }
        digButton.disabled = depth === strataLayers.length;
        digButton.textContent = digButton.disabled ? '剖面发掘完毕' : `揭开${strataLayers[depth].name}`;
        question.hidden = depth < 4;
      }

      function dig() {
        depth += 1;
        inspectLayer(depth - 1);
      }

      digButton.addEventListener('click', () => {
        dig();
        if (digButton.disabled) choices[0].focus();
      });

      logs.forEach((button, i) => button.addEventListener('click', () => inspectLayer(i)));
      beds.forEach((button, i) => button.addEventListener('click', () => {
        if (i === depth) dig();
        else inspectLayer(i);
      }));

      root.querySelector('.field-reset').addEventListener('click', () => {
        api.resetResult();
        depth = 0;
        selected = -1;
        status.textContent = '从地表开始，逐层记录发现。';
        answer.textContent = '';
        choices.forEach(button => button.removeAttribute('aria-pressed'));
        updateLayers();
        digButton.focus();
      });

      const feedback = {
        recent: '陶片已经被上方的火山灰盖住，所以它被埋下的时间早于这次落灰。',
        middle: '陶片位于两层已定年的沉积之间，埋藏晚于下方灰烬，早于上方落灰。',
        old: '陶片所在的堆积压在灰烬层上，因此它埋得比下方灰烬晚。'
      };
      choices.forEach(button => button.addEventListener('click', () => {
        const choice = button.dataset.choice;
        choices.forEach(option => option.setAttribute('aria-pressed', String(option === button)));
        answer.textContent = feedback[choice];
        if (choice === 'middle') api.complete('dated');
        else api.resetResult();
      }));
      updateLayers();
    }
  });

  window.Atlas.register({
    id: 'rhythm',
    title: '反拍机',
    subject: '音乐',
    style: '千禧透明硬件',
    summary: '把拍手移到两次鼓点之间，听出重音如何改变节奏。',
    action: '编排反拍',
    mount(root, api) {
      const counts = ['1', '&', '2', '&', '3', '&', '4', '&'];
      const basePattern = [true, false, true, false, true, false, true, false];
      let pattern = [...basePattern];
      let step = -1;
      let tempo = 104;
      let playing = false;
      let muted = false;
      let solo = false;
      let timer;
      let audio;
      let clapSample;
      let disposed = false;

      root.innerHTML = `
        <div class="beat-shell">
          <div class="beat-screw beat-screw-l" aria-hidden="true"></div>
          <div class="beat-screw beat-screw-r" aria-hidden="true"></div>
          <header class="beat-heading">
            <div><p class="beat-brand">Offbeat</p><h2>反拍机</h2></div>
            <p class="beat-intro">鼓点固定在正拍。把四次拍手从数字移到 &amp;，听听反拍的感觉。</p>
          </header>
          <div class="beat-interface">
            <div class="beat-display">
              <div class="beat-display-readout">
                <div class="beat-screen-count"><span class="beat-beat-number">1</span><span class="beat-beat-unit">/ 4</span></div>
                <p class="beat-screen-label">当前拍</p>
              </div>
              <div class="beat-display-timing">
                <div class="beat-meter" aria-hidden="true">
                  ${counts.map((count, i) => `<i data-step="${i}"></i>`).join('')}
                </div>
                <p class="beat-screen-label">反拍在两次正拍之间</p>
              </div>
            </div>
            <div class="beat-grid">
              <span class="beat-track-name">数拍</span>
              ${counts.map((count, i) => `<span class="beat-count" data-step="${i}">${count}</span>`).join('')}
              <span class="beat-track-name">鼓点</span>
              ${counts.map((count, i) => `<span class="beat-drum ${i % 2 === 0 ? 'is-hit' : ''}" data-step="${i}" aria-hidden="true"></span>`).join('')}
              <span class="beat-track-name">拍手</span>
              ${counts.map((count, i) => `
                <button type="button" class="beat-pad" data-pad="${i}" data-step="${i}"
                  aria-label="第 ${Math.floor(i / 2) + 1} 拍${i % 2 ? '后半拍' : '正拍'}拍手"></button>
              `).join('')}
            </div>
            <div class="beat-controls">
              <button type="button" class="beat-play">播放</button>
              <button type="button" class="beat-mute" aria-pressed="false">静音</button>
              <button type="button" class="beat-solo" aria-pressed="false">只听拍手</button>
              <button type="button" class="beat-reset">复位</button>
              <label class="beat-tempo">速度 <output>104</output> <span>BPM</span>
                <input type="range" min="65" max="150" value="104" aria-label="速度（每分钟拍数）">
              </label>
            </div>
            <p class="beat-status" aria-live="polite">目前四次拍手都与鼓点重合。</p>
          </div>
        </div>`;

      const playButton = root.querySelector('.beat-play');
      const muteButton = root.querySelector('.beat-mute');
      const soloButton = root.querySelector('.beat-solo');
      const interfacePanel = root.querySelector('.beat-interface');
      const tempoSlider = root.querySelector('input');
      const tempoOutput = root.querySelector('output');
      const beatNumber = root.querySelector('.beat-beat-number');
      const status = root.querySelector('.beat-status');
      const pads = [...root.querySelectorAll('[data-pad]')];
      const stepCells = counts.map((count, i) => root.querySelectorAll(`[data-step="${i}"]`));

      function renderPads() {
        pads.forEach((pad, i) => pad.setAttribute('aria-pressed', String(pattern[i])));
      }

      function renderFeedback() {
        const offbeats = pattern.filter((hit, i) => hit && i % 2 === 1).length;
        const downbeats = pattern.filter((hit, i) => hit && i % 2 === 0).length;
        if (offbeats === 4 && downbeats === 0) {
          status.textContent = '排好了。四次拍手都落在鼓点之间，重音移到了反拍。';
          api.complete('four-offbeats');
          return;
        }
        api.resetResult();
        status.textContent = `反拍上有 ${offbeats} 次拍手，正拍上还有 ${downbeats} 次。`;
      }

      function sound(kind) {
        if (muted || !audio || audio.state !== 'running') return;
        const envelope = audio.createGain();
        const now = audio.currentTime;
        let hit;
        if (kind === 'clap') {
          hit = audio.createBufferSource();
          hit.buffer = clapSample;
        } else {
          hit = audio.createOscillator();
          hit.frequency.setValueAtTime(130, now);
          hit.frequency.exponentialRampToValueAtTime(53, now + 0.09);
        }
        envelope.gain.setValueAtTime(kind === 'clap' ? 0.24 : 0.2, now);
        envelope.gain.exponentialRampToValueAtTime(0.001, now + 0.11);
        hit.connect(envelope);
        envelope.connect(audio.destination);
        hit.start(now);
        hit.stop(now + 0.12);
      }

      function markStep(next) {
        stepCells[step]?.forEach(cell => cell.classList.remove('is-playing'));
        step = next;
        stepCells[step]?.forEach(cell => cell.classList.add('is-playing'));
        beatNumber.textContent = step < 0 ? '1' : counts[step];
      }

      function tick() {
        if (!playing || disposed) return;
        markStep((step + 1) % counts.length);
        if (step % 2 === 0 && !solo) sound('drum');
        if (pattern[step]) sound('clap');
        timer = setTimeout(tick, 30000 / tempo);
      }

      function prepareAudio() {
        if (muted) return;
        try {
          const Audio = window.AudioContext || window.webkitAudioContext;
          if (!audio && Audio) {
            audio = new Audio();
            clapSample = audio.createBuffer(1, Math.ceil(audio.sampleRate * 0.12), audio.sampleRate);
            const samples = clapSample.getChannelData(0);
            for (let i = 0; i < samples.length; i += 1) {
              const time = i / audio.sampleRate;
              const envelope = time < 0.036 ? (time % 0.012 < 0.008 ? 1 : 0.24) : 0.65;
              samples[i] = (Math.random() * 2 - 1) * envelope;
            }
          }
          audio?.resume().catch(() => {});
        } catch {
          // The playhead and grid work without an audio device.
        }
      }

      function stop() {
        playing = false;
        clearTimeout(timer);
        markStep(-1);
        playButton.textContent = '播放';
      }

      pads.forEach((pad, i) => pad.addEventListener('click', () => {
        pattern[i] = !pattern[i];
        renderPads();
        renderFeedback();
      }));
      playButton.addEventListener('click', () => {
        if (playing) {
          stop();
          return;
        }
        prepareAudio();
        playing = true;
        playButton.textContent = '停止';
        tick();
      });
      muteButton.addEventListener('click', () => {
        muted = !muted;
        muteButton.setAttribute('aria-pressed', String(muted));
        if (!muted && playing) prepareAudio();
      });
      soloButton.addEventListener('click', () => {
        solo = !solo;
        soloButton.setAttribute('aria-pressed', String(solo));
        interfacePanel.classList.toggle('is-solo', solo);
      });
      tempoSlider.addEventListener('input', () => {
        tempo = tempoSlider.valueAsNumber;
        tempoOutput.value = String(tempo);
      });
      root.querySelector('.beat-reset').addEventListener('click', () => {
        api.resetResult();
        stop();
        pattern = [...basePattern];
        tempo = 104;
        muted = false;
        solo = false;
        muteButton.setAttribute('aria-pressed', 'false');
        soloButton.setAttribute('aria-pressed', 'false');
        interfacePanel.classList.remove('is-solo');
        tempoSlider.value = '104';
        tempoOutput.value = '104';
        status.textContent = '目前四次拍手都与鼓点重合。';
        renderPads();
      });
      api.onCleanup(() => {
        disposed = true;
        clearTimeout(timer);
        if (audio && audio.state !== 'closed') audio.close().catch(() => {});
      });
      renderPads();
    }
  });

  const sampleSizes = [10, 1000];
  const sampleLabels = ['小样本', '大样本'];
  const percent = value => value.toFixed(1).replace(/\.0$/, '');

  function coinTrial(size) {
    let heads = 0;
    for (let n = 0; n < size; n += 1) {
      if (Math.random() < 0.5) heads += 1;
    }
    const share = 100 * heads / size;
    return { heads, share, gap: Math.abs(share - 50) };
  }

  function compareTrials(small, large) {
    if (Math.abs(small.gap - large.gap) < 0.0001) return 'tie';
    return small.gap < large.gap ? 'small' : 'large';
  }

  window.Atlas.register({
    id: 'chance',
    title: '硬币客场',
    subject: '概率',
    style: '体育转播记分牌',
    summary: '让同一枚公平硬币赛两场，比较实际频率与理论概率。',
    action: '开两场硬币赛',
    mount(root, api) {
      const results = [null, null];
      root.innerHTML = `
        <div class="coin-arena">
          <header class="coin-heading">
            <div><p class="coin-eyebrow">公平硬币对抗赛</p><h2>硬币客场</h2></div>
            <p class="coin-intro">分别投掷 10 次与 1,000 次。哪场的正面比例更靠近 50%？可以多开几场。</p>
          </header>
          <div class="coin-scoreboard">
            ${sampleSizes.map((size, i) => `
              <section class="coin-round" data-round="${i}" aria-label="${sampleLabels[i]}">
                <div class="coin-round-header"><span>${sampleLabels[i]}</span><b>${size.toLocaleString('en-US')} 次</b></div>
                <div class="coin-score" aria-live="polite">
                  <span><small>正面</small><b data-heads>—</b></span>
                  <i aria-hidden="true">:</i>
                  <span><small>反面</small><b data-tails>—</b></span>
                </div>
                <div class="coin-chart">
                  <div class="coin-bar" aria-hidden="true"><div class="coin-fill"></div><i></i></div>
                  <div class="coin-ruler" aria-hidden="true"><span>0%</span><span>50%</span><span>100%</span></div>
                </div>
                <p class="coin-gap">等待开赛</p>
                <button type="button" class="coin-run" data-run="${i}">投掷 ${size.toLocaleString('en-US')} 次</button>
              </section>
            `).join('')}
          </div>
          <div class="coin-extra">
            <div class="coin-extra-actions">
              <button type="button" class="coin-pair">同时开两场</button>
              <button type="button" class="coin-batch">模拟 12 轮对阵</button>
            </div>
            <p class="coin-batch-summary" aria-live="polite" hidden></p>
            <div class="coin-batch-marks" aria-label="查看各轮结果"></div>
            <p class="coin-batch-detail" aria-live="polite" hidden></p>
          </div>
          <div class="coin-review">
            <fieldset class="coin-question" disabled>
              <legend>哪句话适用于公平硬币？</legend>
              <div class="coin-choices">
                <button type="button" data-answer="exact">十次必有五次正面</button>
                <button type="button" data-answer="typical">大样本通常更接近 50%</button>
                <button type="button" data-answer="balance">正面太多后反面更容易出现</button>
              </div>
            </fieldset>
            <p class="coin-feedback" aria-live="polite">两场开赛后可以作答。</p>
          </div>
        </div>`;

      const rounds = [...root.querySelectorAll('[data-round]')];
      const question = root.querySelector('.coin-question');
      const feedback = root.querySelector('.coin-feedback');
      const answerButtons = [...root.querySelectorAll('[data-answer]')];
      const batchMarks = root.querySelector('.coin-batch-marks');
      const batchSummary = root.querySelector('.coin-batch-summary');
      const batchDetail = root.querySelector('.coin-batch-detail');

      function showTrial(i, trial) {
        const size = sampleSizes[i];
        const { heads, share, gap } = trial;
        const round = rounds[i];
        results[i] = trial;
        round.querySelector('[data-heads]').textContent = heads;
        round.querySelector('[data-tails]').textContent = size - heads;
        round.querySelector('.coin-fill').style.width = `${share}%`;
        round.querySelector('.coin-gap').textContent = `正面 ${percent(share)}%　相差 ${percent(gap)} 个百分点`;
      }

      function compareScores() {
        if (results.includes(null)) return;
        api.resetResult();
        question.disabled = false;
        answerButtons.forEach(button => button.removeAttribute('aria-pressed'));
        const winner = compareTrials(...results);
        if (winner === 'tie') {
          feedback.textContent = '这两场离 50% 一样远。再投一轮可以得到不同的结果。';
        } else {
          const closer = winner === 'small' ? '10 次' : '1,000 次';
          feedback.textContent = `这轮 ${closer} 的结果更接近 50%。再试一轮，比较两场的波动。`;
        }
      }

      function showPair(trials) {
        trials.forEach((trial, i) => showTrial(i, trial));
        compareScores();
      }

      function clearSelection() {
        batchMarks.querySelector('[aria-pressed="true"]')?.setAttribute('aria-pressed', 'false');
        batchDetail.hidden = true;
      }

      const explanations = {
        exact: '每次正面的概率都是 50%，十次投掷可以得到 0 到 10 次正面。',
        typical: '投掷次数越多，正面比例偏离 50% 的幅度通常越小。单独一轮仍可能波动。',
        balance: '每次投掷彼此独立，下一次正面和反面的概率仍各为 50%。'
      };
      root.querySelectorAll('[data-run]').forEach(button => {
        button.addEventListener('click', () => {
          const i = Number(button.dataset.run);
          clearSelection();
          showTrial(i, coinTrial(sampleSizes[i]));
          compareScores();
        });
      });
      root.querySelector('.coin-pair').addEventListener('click', () => {
        clearSelection();
        showPair(sampleSizes.map(coinTrial));
      });
      root.querySelector('.coin-batch').addEventListener('click', () => {
        const match = Array.from({ length: 12 }, () => sampleSizes.map(coinTrial));
        const totals = { small: 0, large: 0, tie: 0 };
        const marks = match.map((trials, i) => {
          const winner = compareTrials(...trials);
          totals[winner] += 1;
          const button = document.createElement('button');
          button.type = 'button';
          button.dataset.winner = winner;
          button.textContent = String(i + 1);
          button.setAttribute('aria-pressed', 'false');
          button.setAttribute('aria-label', `第 ${i + 1} 轮，${{ small: '小样本更接近 50%', large: '大样本更接近 50%', tie: '平局' }[winner]}`);
          button.addEventListener('click', () => {
            clearSelection();
            button.setAttribute('aria-pressed', 'true');
            showPair(trials);
            batchDetail.hidden = false;
            batchDetail.textContent = `第 ${i + 1} 轮　10 次：${percent(trials[0].share)}%　1,000 次：${percent(trials[1].share)}%`;
          });
          return button;
        });
        batchDetail.hidden = true;
        batchSummary.hidden = false;
        batchSummary.textContent = `更接近 50% 的轮数　小样本 ${totals.small} · 大样本 ${totals.large} · 平局 ${totals.tie}。点轮次回看比分。`;
        batchMarks.replaceChildren(...marks);
      });
      answerButtons.forEach(button => button.addEventListener('click', () => {
        const answer = button.dataset.answer;
        answerButtons.forEach(option => option.setAttribute('aria-pressed', String(option === button)));
        feedback.textContent = explanations[answer];
        if (answer === 'typical') api.complete(compareTrials(...results));
        else api.resetResult();
      }));
    }
  });
})();
