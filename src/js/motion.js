// Motion layer: damped spring solver, scroll reveal, parallax, progress, spotlight, count-up.
// Every effect checks reduced motion first and falls back to the final state instantly.
const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
export const reduced = () => mq.matches;

// Damped harmonic oscillator, fixed 1/120 s steps. Animates a scalar from -> to.
export function spring({ from = 0, to = 1, stiffness = 170, damping = 24, mass = 1, onUpdate, onDone }) {
  if (reduced()) { onUpdate(to); onDone?.(); return { cancel() {} }; }
  let x = from, v = 0, last = performance.now(), raf = 0, acc = 0, dead = false;
  const dt = 1 / 120;
  const frame = (now) => {
    if (dead) return;
    acc += Math.min(0.05, (now - last) / 1000);
    last = now;
    while (acc >= dt) {
      const a = (-stiffness * (x - to) - damping * v) / mass;
      v += a * dt;
      x += v * dt;
      acc -= dt;
    }
    if (Math.abs(x - to) < 0.0005 && Math.abs(v) < 0.0005) { onUpdate(to); onDone?.(); return; }
    onUpdate(x);
    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);
  return { cancel() { dead = true; cancelAnimationFrame(raf); } };
}

// Scroll reveal with stagger: [data-reveal] enters with a spring when it crosses into view.
export function initReveal(root = document) {
  const els = [...root.querySelectorAll('[data-reveal]')];
  if (reduced() || !('IntersectionObserver' in window)) { els.forEach((e) => e.classList.add('in')); return; }
  const show = (el, delay) => {
    el.classList.add('in');
    setTimeout(() => {
      spring({ stiffness: 190, damping: 22, onUpdate: (p) => {
        el.style.opacity = String(Math.max(0, Math.min(1, p)));
        el.style.transform = `translate3d(0, ${(1 - p) * 28}px, 0) scale(${0.985 + 0.015 * p})`;
      }, onDone: () => { el.style.opacity = ''; el.style.transform = ''; } });
    }, delay);
  };
  const io = new IntersectionObserver((entries) => {
    const fresh = entries.filter((e) => e.isIntersecting);
    fresh.forEach((e, i) => { io.unobserve(e.target); show(e.target, i * 70); });
  }, { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });
  els.forEach((e) => { e.style.opacity = '0'; io.observe(e); });
}

export function initProgress(bar) {
  if (!bar) return;
  let queued = false;
  const paint = () => {
    queued = false;
    const h = document.documentElement.scrollHeight - innerHeight;
    bar.style.transform = `scaleX(${h > 0 ? Math.min(1, scrollY / h) : 0})`;
  };
  const queue = () => { if (!queued) { queued = true; requestAnimationFrame(paint); } };
  addEventListener('scroll', queue, { passive: true });
  addEventListener('resize', queue);
  paint();
}

// Parallax: layers with data-depth follow pointer and scroll through a smoothed target.
export function initParallax(scope) {
  if (!scope || reduced()) return;
  const layers = [...scope.querySelectorAll('[data-depth]')];
  if (!layers.length) return;
  const tgt = { x: 0, y: 0, s: 0 }, cur = { x: 0, y: 0, s: 0 };
  scope.addEventListener('pointermove', (e) => {
    const r = scope.getBoundingClientRect();
    tgt.x = (e.clientX - r.left) / r.width - 0.5;
    tgt.y = (e.clientY - r.top) / r.height - 0.5;
  });
  scope.addEventListener('pointerleave', () => { tgt.x = 0; tgt.y = 0; });
  let raf = 0, running = false;
  const loop = () => {
    const r = scope.getBoundingClientRect();
    tgt.s = Math.max(-1, Math.min(1, -r.top / Math.max(1, r.height)));
    // critically damped follow
    for (const k of ['x', 'y', 's']) cur[k] += (tgt[k] - cur[k]) * 0.08;
    for (const el of layers) {
      const d = parseFloat(el.dataset.depth) || 0;
      el.style.transform = `translate3d(${(cur.x * d * -40).toFixed(2)}px, ${(cur.y * d * -40 + cur.s * d * 60).toFixed(2)}px, 0)`;
    }
    raf = requestAnimationFrame(loop);
  };
  const io = new IntersectionObserver(([e]) => {
    if (e.isIntersecting && !running) { running = true; raf = requestAnimationFrame(loop); }
    else if (!e.isIntersecting && running) { running = false; cancelAnimationFrame(raf); }
  });
  io.observe(scope);
}

// Spotlight: radial highlight follows the pointer over any [data-spot]
export function initSpotlight(root = document) {
  root.addEventListener('pointermove', (e) => {
    const el = e.target.closest?.('[data-spot]');
    if (!el) return;
    const r = el.getBoundingClientRect();
    el.style.setProperty('--mx', (e.clientX - r.left).toFixed(0) + 'px');
    el.style.setProperty('--my', (e.clientY - r.top).toFixed(0) + 'px');
  }, { passive: true });
}

// Count-up with a flash when the value changes. fmt turns a number into display text.
const state = new WeakMap();
export function setNumber(el, value, fmt) {
  const prev = state.get(el);
  state.set(el, { value, fmt });
  if (value == null || !isFinite(value)) { el.textContent = fmt(null); el.dataset.dir = ''; return; }
  if (prev && prev.value === value) return;
  const from = prev && prev.value != null ? prev.value : 0;
  const dir = prev && prev.value != null ? (value > prev.value ? 'up' : 'down') : '';
  if (reduced()) { el.textContent = fmt(value); return; }
  if (dir) { el.dataset.flash = dir; el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash'); }
  if (el._spring) el._spring.cancel();
  el._spring = spring({ from, to: value, stiffness: 120, damping: 20, onUpdate: (v) => { el.textContent = fmt(v); }, onDone: () => { el.textContent = fmt(value); } });
}
