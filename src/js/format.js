const SUB = ['₀', '₁', '₂', '₃', '₄', '₅', '₆', '₇', '₈', '₉'];
const subscript = (n) => String(n).split('').map((d) => SUB[+d]).join('');
export const DASH = '—';
// Thousands separators without locale or date APIs
const group = (s) => { const [i, f] = s.split('.'); return i.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (f ? '.' + f : ''); };

export function fmtPrice(v) {
  const n = Number(v);
  if (!isFinite(n) || n <= 0) return DASH;
  if (n >= 1) return '$' + group(n.toFixed(2));
  if (n >= 0.01) return '$' + n.toFixed(4);
  const zeros = Math.floor(-Math.log10(n)) - 1;
  const digits = n.toFixed(zeros + 1 + 4).replace('0.', '').replace(/^0+/, '').slice(0, 4);
  return zeros >= 2 ? `$0.0${subscript(zeros)}${digits}` : '$' + n.toFixed(6);
}

export function fmtCompact(v) {
  const n = Number(v);
  if (!isFinite(n) || n < 0) return DASH;
  const units = [[1e12, 'T'], [1e9, 'B'], [1e6, 'M'], [1e3, 'K']];
  for (const [u, s] of units) {
    if (n >= u) {
      const d = n / u;
      return '$' + (d >= 100 ? d.toFixed(0) : d.toFixed(2).replace(/\.00$/, '')) + s;
    }
  }
  return '$' + n.toFixed(0);
}

export function fmtPct(v) {
  const n = Number(v);
  if (!isFinite(n)) return DASH;
  const a = Math.abs(n);
  const body = a >= 1000 ? group(String(Math.round(a))) : a.toFixed(2);
  return (n > 0 ? '+' : n < 0 ? '−' : '') + body + '%';
}

// Letter tile: two characters when the symbol has at least two, else one. Never used for the own-token placeholder.
export const TILE_MIN = 2;
export const tileText = (sym) => String(sym || '').replace(/[^\p{L}\p{N}]/gu, '').slice(0, TILE_MIN).toUpperCase() || '?';

export const sign =(v) => (Number(v) > 0 ? 'up' : Number(v) < 0 ? 'down' : 'flat');
