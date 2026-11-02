// Register pattern: every external fact is one record, state stated | absent | unconfirmed.
// Only a stated record may carry a value or a url. Everything else renders inert.
import { X_SVG, GITHUB_SVG } from './icons.js';

export const STATES = ['stated', 'absent', 'unconfirmed'];
export const INERT_KEYS = ['label', 'state', 'source', 'scope', 'stamp'];

export const isStated = (r) => !!r && r.state === 'stated';

export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const SOL_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
export const validCa = (v) => typeof v === 'string' && SOL_RE.test(v);

// Link rule: store the url, derive the handle.
export function handleFromUrl(url) {
  try {
    const u = new URL(url);
    const seg = u.pathname.split('/').filter(Boolean)[0];
    return seg ? '@' + seg : u.hostname;
  } catch {
    return null;
  }
}

// Gate warning: match address-shaped strings against the stated registry; never blanket-reject 0x hex.
const ADDR_RES = [/\b0x[a-fA-F0-9]{40}\b/g, /\b[1-9A-HJ-NP-Za-km-z]{32,44}\b/g];
export function scanAddresses(text, records) {
  const stated = new Set(Object.values(records).filter(isStated).flatMap((r) => [r.value].filter(Boolean)));
  const found = [];
  for (const re of ADDR_RES) for (const m of text.matchAll(re)) found.push(m[0]);
  return { found, unknown: found.filter((a) => !stated.has(a)) };
}

// Static renderers, shared by the build (server render) and the page (runtime hydrate)
export function socialHtml(records) {
  const defs = [['x', X_SVG], ['github', GITHUB_SVG]];
  return defs.map(([key, svg]) => {
    const r = records[key];
    if (isStated(r)) {
      const handle = handleFromUrl(r.url);
      return `<a class="icon-btn social" data-social="${key}" data-state="stated" href="${esc(r.url)}" target="_blank" rel="noopener noreferrer" aria-label="${esc(r.label)}, ${esc(handle)}">${svg}</a>`;
    }
    return `<span class="icon-btn social is-inert" data-social="${key}" data-state="${esc(r.state)}" role="img" aria-disabled="true" aria-label="${esc(r.label)}, pending">${svg}</span>`;
  }).join('');
}

export function caHtml(records) {
  const r = records.ca;
  if (isStated(r) && validCa(r.value)) {
    return `<button class="ca" type="button" data-ca-state="stated" data-copy="${esc(r.value)}" aria-label="Copy contract address"><span class="ca-label">${esc(r.label)}</span><span class="ca-value">${esc(r.value)}</span><span class="ca-action" data-copy-hint>Copy</span></button>`;
  }
  return `<div class="ca is-inert" data-ca-state="${esc(r.state)}" aria-disabled="true"><span class="ca-label">${esc(r.label)}</span><span class="ca-value">pending</span></div>`;
}

export function recordsHtml(records) {
  const rows = ['chain', 'ca', 'x', 'github'].map((key) => {
    const r = records[key];
    let val;
    if (!isStated(r)) val = '<span class="chip is-inert">pending</span>';
    else if (key === 'x' || key === 'github') val = `<a class="chip" href="${esc(r.url)}" target="_blank" rel="noopener noreferrer">${esc(handleFromUrl(r.url))}</a>`;
    else if (key === 'ca') val = `<span class="chip mono wrap-any">${esc(r.value)}</span>`;
    else val = `<span class="chip">${esc(r.value)}</span>`;
    return `<div class="rec" role="row" data-record="${key}" data-state="${esc(r.state)}"><span class="rec-k" role="rowheader">${esc(r.label)}</span>${val}</div>`;
  });
  return rows.join('');
}

// Build-time: strip data-only fields so nothing dated reaches the page.
export function publicRecords(records) {
  const out = {};
  for (const [k, r] of Object.entries(records)) {
    const { stamp, ...rest } = r;
    out[k] = rest;
  }
  return out;
}
