(() => {
  const proofs = {
    care: {
      label: '家庭照料',
      title: 'A Daughter Reads for Her Father',
      lede: 'A tender story about caring for her father.',
    },
    crew: {
      label: '公共参与',
      title: 'A Student Makes a Case for a Ramp',
      lede: 'A story of a student rallying support to make the old hall accessible.',
    },
  };

  const choices = Array.from(document.querySelectorAll('[data-lede]'));
  const compareToggle = document.querySelector('#compare-toggle');
  const singleProof = document.querySelector('#single-proof');
  const compareProofs = document.querySelector('#compare-proofs');
  const emptyProof = document.querySelector('#empty-proof');
  const activeProof = document.querySelector('#active-proof');
  const activeLabel = document.querySelector('#active-label');
  const activeTitle = document.querySelector('#active-title');
  const activeLede = document.querySelector('#active-lede');
  const announcement = document.querySelector('#announcement');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let selected = '';
  let proofAnimation;

  for (const [id, proof] of Object.entries(proofs)) {
    const card = document.createElement('article');
    card.className = 'proof';
    card.dataset.proof = id;

    const label = document.createElement('p');
    label.className = 'proof-label';
    label.textContent = proof.label;

    const title = document.createElement('h3');
    title.lang = 'en';
    title.textContent = proof.title;

    const lede = document.createElement('p');
    lede.className = 'lede';
    lede.lang = 'en';
    lede.textContent = proof.lede;

    const useProof = document.createElement('button');
    useProof.type = 'button';
    useProof.className = 'use-proof';
    useProof.textContent = '选这版';
    useProof.setAttribute('aria-label', `选这版（${proof.label}）`);
    useProof.setAttribute('aria-pressed', 'false');
    useProof.addEventListener('click', () => selectEvidence(id));

    card.append(label, title, lede, useProof);
    compareProofs.append(card);
  }

  function selectEvidence(id) {
    if (id === selected) return;
    selected = id;
    const proof = proofs[id];

    for (const choice of choices) {
      choice.setAttribute('aria-pressed', String(choice.dataset.lede === id));
    }
    for (const card of compareProofs.children) {
      const active = card.dataset.proof === id;
      card.dataset.active = String(active);
      const button = card.querySelector('.use-proof');
      button.textContent = active ? '已选这版' : '选这版';
      button.setAttribute('aria-pressed', String(active));
    }

    emptyProof.hidden = true;
    activeProof.hidden = false;
    activeProof.dataset.active = 'true';
    activeLabel.textContent = proof.label;
    activeTitle.textContent = proof.title;
    activeLede.textContent = proof.lede;
    announcement.textContent = `已选${proof.label}。节目单标题为 ${proof.title}。`;
    window.Unit4Demo?.publish(id);

    if (compareProofs.hidden && !reducedMotion.matches && activeProof.animate) {
      proofAnimation?.cancel();
      proofAnimation = activeProof.animate(
        [{ opacity: 0.55, transform: 'translateY(5px)' }, { opacity: 1, transform: 'translateY(0)' }],
        { duration: 220, easing: 'ease-out' },
      );
    }
  }

  for (const choice of choices) {
    choice.addEventListener('click', () => selectEvidence(choice.dataset.lede));
  }

  compareToggle.addEventListener('click', () => {
    const comparing = compareProofs.hidden;
    singleProof.hidden = comparing;
    compareProofs.hidden = !comparing;
    compareToggle.textContent = comparing ? '返回单版' : '并排比较';
    compareToggle.setAttribute('aria-expanded', String(comparing));
  });
})();
