/** A deliberate invitation after ten uninterrupted minutes without diary activity. */
export function createIdleInvitation({ play, enabled = true, interval = 10 * 60 * 1000, schedule = setTimeout, cancel = clearTimeout } = {}) {
  let timer = null, paused = true, destroyed = false;
  function clear() { if (timer !== null) cancel(timer); timer = null; }
  function arm() {
    clear();
    if (!enabled || paused || destroyed) return;
    timer = schedule(() => {
      timer = null;
      if (!enabled || paused || destroyed) return;
      try { Promise.resolve(play()).catch(() => {}); } catch { /* The diary stays usable if audio is unavailable. */ }
      arm();
    }, interval);
  }
  return {
    activity: arm,
    resume() { if (paused && !destroyed) { paused = false; arm(); } },
    pause() { paused = true; clear(); },
    setEnabled(value) { enabled = Boolean(value); arm(); },
    destroy() { destroyed = true; clear(); },
    get enabled() { return enabled; },
  };
}
