import { socialHtml, caHtml, recordsHtml, isStated, validCa, esc } from './register.js';
import { ICON } from './icons.js';
import { fmtPrice, fmtCompact, fmtPct, sign, tileText, DASH } from './format.js';
import { createPoller } from './poller.js';
import { fetchMarket } from './market.js';
import { fetchOwn, LOGO_BRAND, LOGO_FALLBACK } from './own.js';
import { reduced, initReveal, initProgress, initParallax, initSpotlight, setNumber } from './motion.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const reg = JSON.parse($('#register').textContent).records;

/* ---------- runtime register: re-derive every slot from the live record ---------- */
$('[data-slot="ca"]').innerHTML = caHtml(reg);
$('[data-slot="social"]').innerHTML = socialHtml(reg);
$('[data-slot="records"]').innerHTML = recordsHtml(reg);

const live = $('#live');
const say = (t) => { live.textContent = ''; setTimeout(() => { live.textContent = t; }, 30); };

/* ---------- copy ---------- */
async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch { /* fall through */ }
  const ta = document.createElement('textarea');
  ta.value = text; ta.setAttribute('readonly', ''); ta.style.cssText = 'position:fixed;opacity:0;top:0;left:0';
  document.body.appendChild(ta); ta.select();
  let ok = false;
  try { ok = document.execCommand('copy'); } catch { ok = false; }
  ta.remove();
  return ok;
}
document.addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-copy]');
  if (!btn) return;
  const ok = await copyText(btn.dataset.copy);
  if (!ok) { say('Copy failed'); return; }
  say('Address copied');
  const hint = btn.querySelector('[data-copy-hint]');
  if (hint) {
    btn.classList.add('copied'); hint.textContent = 'Copied';
    setTimeout(() => { btn.classList.remove('copied'); hint.textContent = 'Copy'; }, 1600);
  } else {
    const keep = btn.innerHTML;
    btn.classList.add('done'); btn.innerHTML = ICON.check;
    setTimeout(() => { btn.classList.remove('done'); btn.innerHTML = keep; }, 1600);
  }
});

/* ---------- logos ---------- */
function fillLogo(host, src, sym, fallbackSrc) {
  if (host.dataset.src === String(src)) return;
  host.dataset.src = String(src);
  host.textContent = '';
  const tile = () => { host.textContent = ''; const t = document.createElement('span'); t.className = 'tile-l'; t.textContent = tileText(sym); host.appendChild(t); };
  if (!src) { tile(); return; }
  const img = new Image();
  img.alt = ''; img.decoding = 'async'; img.referrerPolicy = 'no-referrer';
  img.onerror = () => { if (fallbackSrc && img.src !== new URL(fallbackSrc, location.href).href) { img.src = fallbackSrc; } else { tile(); } };
  img.src = src;
  host.appendChild(img);
}

/* ---------- state ---------- */
const S = { tokens: [], status: 'loading', own: null, ownStatus: 'idle', sort: 'volume', featured: 0 };
const ownRegistered = isStated(reg.ca) && validCa(reg.ca.value);
const CA = ownRegistered ? reg.ca.value : null;

/* ---------- status pill ---------- */
function setStatus(state, text) {
  const el = $('#status');
  el.dataset.state = state;
  $('#status-text').textContent = text;
  el.setAttribute('aria-label', text);
}

/* ---------- rows ---------- */
const rowsHost = $('#rows');
const rowMap = new Map();
let skeletonOn = false;
let errorRowsOn = false;

function skeletonRows() {
  skeletonOn = true;
  rowsHost.innerHTML = '';
  for (let i = 0; i < 9; i++) {
    const r = document.createElement('div');
    r.className = 'row sk-row'; r.setAttribute('aria-hidden', 'true');
    r.innerHTML = '<span class="sk skeleton w-c"></span><span class="c-token"><span class="sk skeleton w-c"></span><span class="sk skeleton w-l" style="flex:1"></span></span><span class="sk skeleton w-r c-price"></span><span class="sk skeleton w-r c-chg"></span><span class="sk skeleton w-r c-vol"></span><span class="sk skeleton w-r c-liq"></span><span></span>';
    rowsHost.appendChild(r);
  }
}

function newRow() {
  const el = document.createElement('div');
  el.className = 'row'; el.setAttribute('role', 'row'); el.dataset.spot = '';
  el.innerHTML = '<span class="c-rank" role="cell"></span><span class="c-token" role="cell"><span class="logo"></span><span class="tn"><b></b><i></i></span></span><span class="c-price" role="cell" data-label="Price"></span><span class="c-chg" role="cell"></span><span class="c-vol" role="cell" data-label="Vol"></span><span class="c-liq" role="cell" data-label="Liq"></span><span class="c-act" role="cell"></span>';
  return el;
}

function setText(el, text, dir) {
  if (el.textContent === text) return;
  const had = el.textContent !== '';
  el.textContent = text;
  if (had && !reduced() && dir) { el.dataset.flash = dir; el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash'); }
}
const dashFmt = (f) => (v) => (v == null ? DASH : f(v));

function fillRow(el, t, rank) {
  $('.c-rank', el).textContent = rank;
  fillLogo($('.logo', el), t.image, t.symbol, null);
  $('.tn b', el).textContent = t.symbol || DASH;
  $('.tn i', el).textContent = t.name || '';
  const price = $('.c-price', el), chg = $('.c-chg', el);
  const prev = Number(price.dataset.v);
  setText(price, t.price == null ? DASH : fmtPrice(t.price), prev && t.price != null ? (t.price > prev ? 'up' : 'down') : '');
  price.dataset.v = t.price ?? '';
  setText(chg, t.change == null ? DASH : (t.change > 0 ? '▲ ' : t.change < 0 ? '▼ ' : '') + fmtPct(t.change));
  chg.className = 'c-chg ' + (t.change == null ? '' : sign(t.change));
  setNumber($('.c-vol', el), t.volume, dashFmt(fmtCompact));
  const liq = $('.c-liq', el);
  if (t.liquidityLabel === 'Mkt Cap') liq.title = 'Mkt Cap'; else liq.removeAttribute('title');
  setNumber(liq, t.liquidity, dashFmt(fmtCompact));
  const act = $('.c-act', el);
  if (t.address && !el.classList.contains('is-placeholder')) {
    if (!act.firstChild || act.firstChild.dataset.copy !== t.address) {
      act.innerHTML = `<button class="icon-btn copy" type="button" data-copy="${esc(t.address)}" aria-label="Copy address for ${esc(t.symbol || 'token')}">${ICON.copy}</button>`;
    }
  } else act.textContent = '';
}

/* own row, always first */
const ownEl = newRow();
ownEl.classList.add('own');
ownEl.dataset.own = CA ? 'stated' : 'absent';
function paintOwn() {
  const el = ownEl;
  if (!CA) {
    el.classList.add('is-placeholder');
    $('.c-rank', el).textContent = '1';
    fillLogo($('.logo', el), LOGO_BRAND, 'PEER', null);
    $('.tn b', el).innerHTML = 'PEER<span class="badge">Own</span>';
    $('.tn i', el).textContent = 'Contract pending';
    $('.c-price', el).textContent = '$0.00';
    for (const c of ['.c-chg', '.c-vol', '.c-liq']) $(c, el).textContent = '· · · · ·';
    $('.c-act', el).textContent = '';
    return;
  }
  el.classList.remove('is-placeholder');
  const m = S.own;
  if (!m) {
    $('.c-rank', el).textContent = '1';
    fillLogo($('.logo', el), LOGO_FALLBACK, 'PEER', null);
    $('.tn b', el).innerHTML = 'PEER<span class="badge">Own</span>';
    $('.tn i', el).textContent = S.ownStatus === 'error' ? 'Feed delayed' : 'Looking up';
    for (const c of ['.c-price', '.c-chg', '.c-vol', '.c-liq']) $(c, el).textContent = DASH;
    $('.c-act', el).innerHTML = `<button class="icon-btn copy" type="button" data-copy="${esc(CA)}" aria-label="Copy PEER address">${ICON.copy}</button>`;
    return;
  }
  const pump = m.image;
  fillLogo($('.logo', el), pump, m.symbol, LOGO_FALLBACK);
  fillRow(el, { ...m, image: pump }, '1');
  $('.tn b', el).innerHTML = `${esc(m.symbol)}<span class="badge">Own</span>`;
}
paintOwn();

function sorted(list) {
  const k = { volume: 'volume', change: 'change', liquidity: 'liquidity', price: 'price' }[S.sort];
  return [...list].sort((a, b) => (b[k] ?? -Infinity) - (a[k] ?? -Infinity));
}

function renderBoard() {
  const trend = sorted(S.tokens.filter((t) => t.address !== CA)).slice(0, 9);
  const first = skeletonOn || errorRowsOn;
  if (first) {
    rowsHost.innerHTML = '';
    skeletonOn = false; errorRowsOn = false;
    rowMap.clear();
  }
  const want = [ownEl];
  if (!rowsHost.contains(ownEl)) rowsHost.prepend(ownEl);
  trend.forEach((t, i) => {
    let el = rowMap.get(t.address);
    if (!el) {
      el = newRow(); rowMap.set(t.address, el);
      if (first) { el.classList.add('enter'); el.style.setProperty('--i', String(i + 1)); }
    }
    fillRow(el, t, String(i + 2));
    want.push(el);
  });
  for (const [addr, el] of rowMap) if (!trend.some((t) => t.address === addr)) { el.remove(); rowMap.delete(addr); }
  want.forEach((el, i) => { if (rowsHost.children[i] !== el) rowsHost.insertBefore(el, rowsHost.children[i] || null); });
  $('#board-note').hidden = true;
}

function renderErrorRows() {
  skeletonOn = false; errorRowsOn = true;
  rowsHost.innerHTML = '';
  rowMap.clear();
  rowsHost.appendChild(ownEl);
  for (let i = 0; i < 9; i++) {
    const el = newRow();
    fillRow(el, { symbol: DASH, name: '', price: null, change: null, volume: null, liquidity: null, address: null, image: null }, String(i + 2));
    rowsHost.appendChild(el);
  }
  const n = $('#board-note');
  n.hidden = false;
  n.textContent = 'The market feed could not be reached. Retrying automatically.';
}

/* ---------- hero tiles, ticker, ticket ---------- */
function renderTiles() {
  const t = S.tokens;
  setNumber($('#t-count'), t.length || null, (v) => (v == null ? DASH : String(Math.round(v))));
  setNumber($('#t-vol'), t.length ? t.reduce((a, x) => a + (x.volume || 0), 0) : null, dashFmt(fmtCompact));
  setNumber($('#t-liq'), t.length ? t.reduce((a, x) => a + (x.liquidity || 0), 0) : null, dashFmt(fmtCompact));
  const top = [...t].filter((x) => x.change != null).sort((a, b) => b.change - a.change)[0];
  $('#t-top').textContent = top ? `${top.symbol} ${fmtPct(top.change)}` : DASH;
  $('#t-own').textContent = !CA ? 'pending' : S.own?.price != null ? fmtPrice(S.own.price) : DASH;
}

let tickerSig = '';
function renderTicker() {
  const t = S.tokens;
  const track = $('#marquee-track');
  if (!t.length) return;
  const item = (x) => `<span class="tick"><span class="logo tl" data-sym="${esc(x.symbol)}" data-img="${esc(x.image || '')}"></span><b>${esc(x.symbol)}</b><span class="tnum">${fmtPrice(x.price)}</span><span class="tnum ${sign(x.change)}">${fmtPct(x.change)}</span></span>`;
  const sig = t.map((x) => x.address + x.price + x.change).join('|');
  if (sig === tickerSig) return;
  tickerSig = sig;
  const one = t.map(item).join('');
  track.innerHTML = `<span class="run">${one}</span><span class="run" aria-hidden="true">${one}</span>`;
  track.style.display = 'inline-flex';
  $$('.tl', track).forEach((h) => fillLogo(h, h.dataset.img || null, h.dataset.sym, null));
  track.setAttribute('role', 'list');
}

const ticket = $('#ticket');
const runL = $('#tk-run-l');
runL.innerHTML = '<img src="assets/logo-192.png" alt="" width="24" height="24">';
let cycleTimer = null;
function showFeatured(i, restart = true) {
  const t = S.tokens;
  if (!t.length) return;
  S.featured = ((i % Math.min(5, t.length)) + 5) % Math.min(5, t.length);
  const x = t[S.featured];
  $('#tk-title').textContent = `Handoff · ${x.symbol}`;
  $('#tk-sym').textContent = x.symbol;
  fillLogo($('#tk-logo-l'), x.image, x.symbol, null);
  const c = $('#tk-chg');
  c.textContent = fmtPct(x.change); c.className = 'tnum big ' + sign(x.change);
  $('#tk-vol').textContent = fmtCompact(x.volume);
  $$('.chip-btn').forEach((b, k) => { b.classList.toggle('is-on', k === S.featured); b.setAttribute('aria-pressed', String(k === S.featured)); });
  if (restart) { ticket.classList.add('restart'); void ticket.offsetWidth; ticket.classList.remove('restart'); }
}
function renderChips() {
  const host = $('#chips');
  const t = S.tokens.slice(0, 5);
  const sig = t.map((x) => x.address).join();
  if (host.dataset.sig === sig) return;
  host.dataset.sig = sig;
  host.innerHTML = t.map((x, k) => `<button class="chip-btn" type="button" data-k="${k}" aria-pressed="false"><span class="logo cl" data-sym="${esc(x.symbol)}" data-img="${esc(x.image || '')}"></span>${esc(x.symbol)}</button>`).join('');
  $$('.cl', host).forEach((h) => fillLogo(h, h.dataset.img || null, h.dataset.sym, null));
}
$('#chips').addEventListener('click', (e) => {
  const b = e.target.closest('.chip-btn');
  if (!b) return;
  showFeatured(Number(b.dataset.k));
  startCycle();
});
function startCycle() {
  clearInterval(cycleTimer);
  if (reduced()) return;
  cycleTimer = setInterval(() => { if (!document.hidden) showFeatured(S.featured + 1); }, 5200);
}

/* ---------- pollers ---------- */
const marketCfg = reg.market;
skeletonRows();
const market = createPoller({
  task: (signal) => fetchMarket(marketCfg, signal),
  onOk(tokens) {
    S.tokens = tokens; S.status = 'ok';
    setStatus('ok', 'Live');
    $('#board-sub').textContent = 'Busiest tokens first, straight from the public feed.';
    renderBoard(); renderTiles(); renderTicker(); renderChips();
    showFeatured(S.featured, !ticket.dataset.ready); ticket.dataset.ready = '1';
    startCycleOnce();
  },
  onFail(err, wait) {
    S.status = 'error';
    setStatus('error', 'Feed delayed');
    $('#board-sub').textContent = 'Feed delayed, showing the last good data.';
    if (!S.tokens.length) renderErrorRows();
    else { const n = $('#board-note'); n.hidden = false; n.textContent = 'The latest refresh failed. Showing the last good data and retrying.'; }
    console.warn('[peer] market feed failed', err?.message, 'retry in ms', wait);
  },
});
let cycling = false;
const startCycleOnce = () => { if (!cycling) { cycling = true; startCycle(); } };
market.start();

if (CA) {
  const own = createPoller({
    task: (signal) => fetchOwn(reg.own, CA, signal),
    onOk(model) { S.own = model || S.own; S.ownStatus = model ? 'ok' : 'empty'; paintOwn(); renderTiles(); renderBoard(); },
    onFail(err) { S.ownStatus = 'error'; paintOwn(); console.warn('[peer] own token feed failed', err?.message); },
  });
  own.start();
}

/* ---------- sort ---------- */
$$('.seg').forEach((b) => b.addEventListener('click', () => {
  S.sort = b.dataset.sort;
  $$('.seg').forEach((x) => { const on = x === b; x.classList.toggle('is-on', on); x.setAttribute('aria-pressed', String(on)); });
  if (S.tokens.length) renderBoard();
}));

/* ---------- tabs ---------- */
const tabs = $$('.tab');
function selectTab(i, focus) {
  tabs.forEach((t, k) => {
    const on = k === i;
    t.classList.toggle('is-on', on); t.setAttribute('aria-selected', String(on)); t.tabIndex = on ? 0 : -1;
    $('#' + t.getAttribute('aria-controls')).hidden = !on;
    if (on && focus) t.focus();
  });
}
tabs.forEach((t, i) => {
  t.addEventListener('click', () => selectTab(i));
  t.addEventListener('keydown', (e) => {
    const map = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: tabs.length - 1 };
    if (!(e.key in map)) return;
    e.preventDefault();
    selectTab((map[e.key] + tabs.length) % tabs.length, true);
  });
});

/* ---------- drawer ---------- */
const sidebar = $('#sidebar'), scrim = $('#scrim'), menu = $('#menu');
menu.innerHTML = ICON.menu;
function drawer(open) {
  sidebar.classList.toggle('open', open);
  scrim.hidden = !open;
  menu.setAttribute('aria-expanded', String(open));
  menu.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
  menu.innerHTML = open ? ICON.close : ICON.menu;
}
menu.addEventListener('click', () => drawer(!sidebar.classList.contains('open')));
scrim.addEventListener('click', () => drawer(false));
$$('.nav-link').forEach((a) => a.addEventListener('click', () => drawer(false)));
addEventListener('keydown', (e) => { if (e.key === 'Escape') drawer(false); });

/* ---------- active section ---------- */
const sections = ['top', 'board', 'token', 'flow', 'plan'].map((id) => $('#' + id));
const names = { top: 'Overview', board: 'Board', token: 'Token', flow: 'Flow', plan: 'Plan' };
function activeSection() {
  let cur = 'top';
  for (const s of sections) if (s && s.getBoundingClientRect().top < innerHeight * 0.4) cur = s.id;
  $$('.nav-link').forEach((a) => a.classList.toggle('is-active', a.dataset.nav === cur));
  $('#crumb').textContent = names[cur];
}
addEventListener('scroll', () => requestAnimationFrame(activeSection), { passive: true });
activeSection();

/* ---------- sticky offset: header plus contract bar, so anchors land below both ---------- */
const stick = () => document.documentElement.style.setProperty('--stick-h', ($('.topbar').offsetHeight + $('.ca-bar').offsetHeight) + 'px');
if ('ResizeObserver' in window) { const ro = new ResizeObserver(stick); ro.observe($('.topbar')); ro.observe($('.ca-bar')); }
addEventListener('resize', stick);
stick();

/* ---------- motion ---------- */
initProgress($('#progress'));
initReveal();
initSpotlight();
initParallax($('[data-parallax]'));
