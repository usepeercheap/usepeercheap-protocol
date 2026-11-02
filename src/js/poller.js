// Poll on an interval, pause while the tab is hidden, fetch at once when it returns, back off exponentially on failure.
export const POLL_MS = 60000;
export const BACKOFF_START_MS = 2000;
export const BACKOFF_MAX_MS = 60000;

export function createPoller({ task, onOk, onFail, interval = POLL_MS }) {
  let timer = null;
  let ctrl = null;
  let backoff = 0;
  let active = false;

  const clear = () => { clearTimeout(timer); timer = null; };
  const schedule = (ms) => { clear(); timer = setTimeout(tick, ms); };

  async function tick() {
    if (!active || document.hidden) return;
    ctrl?.abort();
    ctrl = new AbortController();
    const mine = ctrl;
    try {
      const data = await task(mine.signal);
      if (mine.signal.aborted) return;
      backoff = 0;
      onOk(data);
      schedule(interval);
    } catch (err) {
      if (mine.signal.aborted) return;
      backoff = backoff ? Math.min(backoff * 2, BACKOFF_MAX_MS) : BACKOFF_START_MS;
      onFail(err, backoff);
      schedule(backoff);
    }
  }

  const onVis = () => {
    if (document.hidden) { clear(); ctrl?.abort(); } else if (active) { tick(); }
  };

  return {
    start() { if (active) return; active = true; document.addEventListener('visibilitychange', onVis); tick(); },
    stop() { active = false; clear(); ctrl?.abort(); document.removeEventListener('visibilitychange', onVis); },
  };
}

export async function fetchJson(url, signal, timeoutMs = 12000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  const relay = () => ctrl.abort();
  signal?.addEventListener('abort', relay);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { accept: 'application/json' } });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return await res.json();
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', relay);
  }
}
