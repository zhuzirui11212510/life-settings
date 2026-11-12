(() => {
  if (window.parent === window || new URLSearchParams(location.search).get('classroom') !== '1') return;

  let value = null;
  let height = 0;
  const send = message => window.parent.postMessage(message, location.origin);
  const sendResult = () => send({ type: 'unit4-demo-result', value });

  window.Unit4Demo = Object.freeze({
    get result() { return value; },
    publish(result) {
      if (typeof result !== 'string' || !/^[a-z][a-z0-9-]{0,39}$/.test(result) || value === result) return;
      value = result;
      sendResult();
    },
    reset() {
      if (value === null) return;
      value = null;
      sendResult();
    },
  });

  const main = document.querySelector('main');
  const footer = document.querySelector('body > footer');
  function measure() {
    if (!main) return;
    const bounds = main.getBoundingClientRect();
    const mainBottom = bounds.top + Math.max(bounds.height, main.scrollHeight);
    const footerBottom = footer?.getBoundingClientRect().bottom ?? 0;
    const next = Math.ceil(window.scrollY + Math.max(mainBottom, footerBottom));
    if (next > 0 && Math.abs(next - height) > 1) {
      height = next;
      send({ type: 'unit4-demo-height', height });
    }
  }
  if (main && typeof ResizeObserver !== 'undefined') {
    const observer = new ResizeObserver(measure);
    observer.observe(main);
    if (footer) observer.observe(footer);
  }
  window.addEventListener('load', measure);
  window.addEventListener('message', event => {
    if (event.origin !== location.origin || event.source !== window.parent || event.data?.type !== 'unit4-demo-ready') return;
    sendResult();
    if (height) send({ type: 'unit4-demo-height', height });
    else measure();
  });
})();
