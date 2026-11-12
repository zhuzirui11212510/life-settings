export function randomHex(bytes) {
  return Array.from(crypto.getRandomValues(new Uint8Array(bytes)),
    (value) => value.toString(16).padStart(2, '0')).join('');
}

export const cache = {
  get(key) {
    try {
      return JSON.parse(localStorage.getItem('unit4.live.' + key));
    } catch {
      return null;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem('unit4.live.' + key, JSON.stringify(value));
      return true;
    } catch {
      return false;
    }
  },
  remove(key) {
    try {
      localStorage.removeItem('unit4.live.' + key);
    } catch {
      // The current tab can continue with its in-memory state.
    }
  }
};

export async function request(path, { token, data } = {}) {
  const headers = { Accept: 'application/json' };
  if (token) headers.Authorization = 'Bearer ' + token;
  if (data !== undefined) headers['Content-Type'] = 'application/json';
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6500);
  try {
    const response = await fetch('/api/' + path, {
      method: data === undefined ? 'GET' : 'POST',
      headers,
      body: data === undefined ? undefined : JSON.stringify(data),
      signal: controller.signal,
      cache: 'no-store'
    });
    const payload = await response.json();
    if (!response.ok) {
      throw Object.assign(new Error(payload.message || '课堂暂时无法完成操作。'), {
        status: response.status,
        code: payload.code
      });
    }
    return payload;
  } catch (error) {
    if (error.status) throw error;
    throw new Error('暂时连不上课堂。请检查网络后重试。');
  } finally {
    clearTimeout(timeout);
  }
}

export function roomFeed({ code, token, onState, onStatus }) {
  const path = 'rooms/' + encodeURIComponent(code);
  let closed = false;
  let events;
  let interval;
  let debounce;
  let streaming = false;
  let inFlight;
  let queued = false;
  let revision = -1;

  async function refresh() {
    if (closed) return;
    queued = true;
    if (inFlight) return inFlight;
    inFlight = (async () => {
      while (queued && !closed) {
        queued = false;
        try {
          const state = await request(path + '/state', { token });
          if (closed) return;
          revision = state.revision;
          onState(state);
          onStatus(streaming ? '实时连接' : '轮询同步');
        } catch (error) {
          if (!closed) onStatus('连接中断', error);
        }
      }
    })();
    try {
      await inFlight;
    } finally {
      inFlight = null;
    }
  }

  function schedule() {
    clearTimeout(debounce);
    debounce = setTimeout(refresh, 90);
  }

  function resumed() {
    if (!document.hidden) refresh();
  }

  function openStream() {
    if (typeof EventSource === 'undefined') return;
    events = new EventSource('/api/' + path + '/events');
    events.onopen = () => {
      streaming = true;
      refresh();
    };
    events.onerror = () => {
      streaming = false;
      refresh();
    };
    events.addEventListener('revision', (event) => {
      if (Number(event.data) !== revision) schedule();
    });
  }

  openStream();
  let ticks = 0;
  interval = setInterval(() => {
    ticks++;
    if (ticks % 5 === 0 && events && events.readyState === EventSource.CLOSED) openStream();
    if (!streaming || ticks % 6 === 0) refresh();
  }, 2500);
  window.addEventListener('online', refresh);
  window.addEventListener('pageshow', refresh);
  document.addEventListener('visibilitychange', resumed);
  refresh();
  return {
    refresh,
    close() {
      closed = true;
      clearInterval(interval);
      clearTimeout(debounce);
      events?.close();
      window.removeEventListener('online', refresh);
      window.removeEventListener('pageshow', refresh);
      document.removeEventListener('visibilitychange', resumed);
    }
  };
}
