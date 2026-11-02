// Gates. Exit 0 only if every gate passes. Mutation anchors read the current register at runtime; nothing hardcodes a state.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { PNG } from 'pngjs';
import { ROOT, loadRegister, renderIndex, readTokens } from './lib/site.mjs';
import { readImage, pixelHex } from './lib/image.mjs';
import { STATES, INERT_KEYS, isStated, validCa, scanAddresses, handleFromUrl } from '../src/js/register.js';
import { X_PATH, GITHUB_PATH } from '../src/js/icons.js';

const FORBID = ['CLAU' + 'DE.md', '.cla' + 'ude'];
const dist = path.join(ROOT, 'dist');
const rd = (p) => fs.readFileSync(p, 'utf8');
const results = [];
const gate = async (name, fn) => {
  try { await fn(); results.push([name, true]); console.log('PASS ' + name); }
  catch (e) { results.push([name, false, e.message]); console.log('FAIL ' + name + '\n     ' + e.message); }
};
const ok = (c, m) => { if (!c) throw new Error(m); };

const register = loadRegister();
const rec = register.records;
const html = rd(path.join(dist, 'index.html'));
const css = rd(path.join(dist, 'css/app.css'));
const tokensCss = rd(path.join(dist, 'css/tokens.css'));
const jsFiles = fs.readdirSync(path.join(dist, 'js')).filter((f) => f.endsWith('.js'));
const js = Object.fromEntries(jsFiles.map((f) => [f, rd(path.join(dist, 'js', f))]));
const tokens = readTokens();

const SAMPLE = { x: 'https://x.com/peer_sample', github: 'https://github.com/peer-sample', ca: '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU' };
function flip(reg, key) {
  const c = structuredClone(reg);
  const r = c.records[key];
  if (r.state === 'stated') { delete r.value; delete r.url; r.state = 'absent'; }
  else { r.state = 'stated'; if (key === 'ca') r.value = SAMPLE.ca; else r.url = SAMPLE[key]; }
  return c;
}

const strip = (h) => h.replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<style[\s\S]*?<\/style>/g, ' ').replace(/<svg[\s\S]*?<\/svg>/g, ' ');
const segments = (h) => strip(h).replace(/<\/?(?:div|p|h1|h2|h3|section|article|li|ul|dl|dt|dd|header|footer|main|aside|nav|a|button|span|br|title)\b[^>]*>/g, '\n').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&#39;/g, "'").split('\n').map((s) => s.trim()).filter(Boolean);
const attrs = (h) => [...strip(h).matchAll(/\b(?:aria-label|title|alt|content|placeholder)="([^"]*)"/g)].map((m) => m[1]);
const element = (h, key) => (h.match(new RegExp(`<(a|span)\\b[^>]*data-social="${key}"[^>]*>`)) || [])[0];
const words = (s) => s.toLowerCase().match(/[a-z0-9$]+/g) || [];
const bigrams = (s) => { const w = words(s); const out = []; for (let i = 0; i < w.length - 1; i++) out.push(w[i] + ' ' + w[i + 1]); return out; };

/* ---------- register ---------- */
await gate('register: every record has a valid state and required fields', () => {
  for (const [k, r] of Object.entries(rec)) {
    ok(STATES.includes(r.state), `${k}: bad state ${r.state}`);
    ok(r.label && r.source && r.scope, `${k}: missing label/source/scope`);
  }
  ok(rec.chain.value === 'Solana' && rec.chain.source === 'client statement' && rec.chain.scope === 'batch-level', 'chain record mismatch');
});
await gate('register: inert records carry no value and no url', () => {
  for (const [k, r] of Object.entries(rec)) {
    if (r.state === 'stated') continue;
    const extra = Object.keys(r).filter((x) => !INERT_KEYS.includes(x));
    ok(!extra.length, `${k} is ${r.state} but carries ${extra.join(',')}`);
  }
});
await gate('register: stated records carry a value or a url', () => {
  for (const [k, r] of Object.entries(rec)) if (r.state === 'stated') ok(r.value || r.url, `${k} stated without value/url`);
});
await gate('register: stated contract address is a valid Solana address', () => {
  if (isStated(rec.ca)) ok(validCa(rec.ca.value), 'ca invalid'); else ok(!('value' in rec.ca), 'absent ca has value');
});
await gate('register: embedded copy in dist matches source minus data-only dates', () => {
  const m = html.match(/<script type="application\/json" id="register">([\s\S]*?)<\/script>/);
  const emb = JSON.parse(m[1].replace(/\\u003c/g, '<'));
  for (const [k, r] of Object.entries(rec)) {
    ok(!('stamp' in emb.records[k]), `${k} leaks its data-only stamp`);
    for (const f of Object.keys(r)) if (f !== 'stamp') ok(JSON.stringify(emb.records[k][f]) === JSON.stringify(r[f]), `${k}.${f} differs`);
  }
});

/* ---------- output layout and repo hygiene ---------- */
await gate('dist: required files present, repo docs absent', () => {
  for (const f of ['index.html', 'favicon.svg', 'assets/logo-192.png', 'assets/logo-180.png', 'assets/logo-512.png', 'assets/og.jpg', 'brand/peer-logo.png', 'css/app.css', 'css/tokens.css', 'js/app.js', 'fonts/Geist-Variable.woff2']) ok(fs.existsSync(path.join(dist, f)), 'missing ' + f);
  for (const f of ['README.md', 'LICENSE', 'docs', ...FORBID, 'package.json']) ok(!fs.existsSync(path.join(dist, f)), 'must not ship ' + f);
});
await gate('repo: README, whitepaper, MIT licence in root', () => {
  const readme = rd(path.join(ROOT, 'README.md')), wp = rd(path.join(ROOT, 'docs/whitepaper.md')), lic = rd(path.join(ROOT, 'LICENSE'));
  ok(/PEER/.test(readme) && /Solana/.test(readme) && /peer\.cheap/.test(readme) && /img\.shields\.io/.test(readme), 'readme content');
  for (const h of ['Overview', 'Features', 'Links']) ok(new RegExp('^## ' + h, 'm').test(readme), 'readme section ' + h);
  ok(/Vision and mission/i.test(wp) && /Tokenomics/i.test(wp) && /Roadmap/i.test(wp) && /Team/i.test(wp), 'whitepaper sections');
  ok((wp.match(/\*\*Phase \d/g) || []).length >= 3, 'roadmap phases');
  ok(/^MIT License/.test(lic) && /Copyright \(c\) 2026 PEER/.test(lic), 'licence');
});
await gate('hygiene: no assistant config files or dirs, no attribution text anywhere in the repo', () => {
  ok(FORBID.every((f) => !fs.existsSync(path.join(ROOT, f))), 'forbidden file or dir');
  const bad = new RegExp(['cla' + 'ude', 'anthro' + 'pic', '\\bA' + 'I\\b', 'gener' + 'ated (?:by|with)', 'co-' + 'authored'].join('|'), 'i');
  const hits = [];
  (function walk(p) {
    for (const e of fs.readdirSync(p, { withFileTypes: true })) {
      if (['node_modules', '.git', 'out'].includes(e.name)) continue;
      const f = path.join(p, e.name);
      if (e.isDirectory()) walk(f);
      else if (/\.(md|json|mjs|js|css|html|svg|txt|yml|yaml)$/.test(e.name) && !/woff2/.test(e.name) && e.name !== 'package-lock.json') {
        const t = rd(f); if (bad.test(t)) hits.push(path.relative(ROOT, f));
      }
    }
  })(ROOT);
  ok(!hits.length, 'attribution text in ' + hits.join(', '));
});

/* ---------- social icons ---------- */
await gate('social: both icons live in the top bar, icon only', () => {
  const bar = html.match(/<header class="topbar">[\s\S]*?<\/header>/)[0];
  for (const k of ['x', 'github']) {
    ok(new RegExp(`data-social="${k}"`).test(bar), k + ' missing from top bar');
    const inner = bar.match(new RegExp(`<(a|span)\\b[^>]*data-social="${k}"[^>]*>([\\s\\S]*?)</\\1>`))[2];
    ok(inner.replace(/<svg[\s\S]*?<\/svg>/g, '').trim() === '', k + ' carries a text label');
  }
});
await gate('social: icons are never hidden at any breakpoint', () => {
  for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (/\.(social|socials|top-right)\b/.test(m[1]) && /display:\s*none|visibility:\s*hidden/.test(m[2])) throw new Error('hidden by: ' + m[1].trim());
  }
});
await gate('social: marks are the official X logo and GitHub Octicon paths', () => {
  ok(html.includes(`d="${X_PATH}"`) && html.includes(`d="${GITHUB_PATH}"`), 'path missing from built html');
  ok(X_PATH.startsWith('M18.901 1.153h3.68l-8.04 9.19L24 22.846') && GITHUB_PATH.startsWith('M8 0c4.42 0 8 3.58 8 8a8.013 8.013 0 0 1-5.45 7.59'), 'path signature');
});
for (const key of ['x', 'github']) {
  await gate(`social mutation: ${key} renders correctly in both states (reads current record at runtime)`, () => {
    for (const reg of [register, flip(register, key)]) {
      const out = renderIndex(reg);
      const el = element(out, key);
      ok(el, 'icon absent from render');
      const r = reg.records[key];
      if (isStated(r)) {
        ok(el.startsWith('<a') && el.includes(`href="${r.url}"`), 'stated must link its stored url');
        ok(el.includes(handleFromUrl(r.url)), 'handle is derived from the url');
      } else {
        ok(!/href=/.test(el) && el.startsWith('<span') && /is-inert/.test(el) && /pending/.test(el), 'inert must have no href');
      }
    }
  });
}

/* ---------- contract address ---------- */
await gate('ca slot: first thing under the top bar, large, sticky, full-width', () => {
  ok(html.indexOf('data-slot="ca"') < html.indexOf('<main'), 'ca after main');
  ok(/\.ca-bar\s*\{[^}]*position:\s*sticky/.test(css), 'not sticky');
  const m = css.match(/\.ca-value\s*\{[^}]*font-size:\s*clamp\((\d+)px/);
  ok(m && +m[1] >= 16, 'font too small');
});
await gate('ca slot: copy handler gives feedback, clipboard with fallback', () => {
  ok(/navigator\.clipboard\.writeText/.test(js['app.js']) && /execCommand\('copy'\)/.test(js['app.js']) && /Copied/.test(js['app.js']), 'copy wiring');
});
await gate('ca mutation: both branches render per current record (stated copies full address, absent is inert)', () => {
  for (const reg of [register, flip(register, 'ca')]) {
    const out = renderIndex(reg);
    const slot = out.match(/data-slot="ca">([\s\S]*?)<\/div>\s*<span class="sr-only"/) || out.match(/data-slot="ca">([\s\S]*?<\/(?:button|div)>)/);
    const r = reg.records.ca;
    if (isStated(r)) {
      ok(slot[1].includes(`data-copy="${r.value}"`) && slot[1].includes(`>${r.value}</span>`), 'full address + copy attr');
      ok(/<button/.test(slot[1]), 'must be a button');
    } else {
      ok(!/data-copy|<button/.test(slot[1]) && /pending/.test(slot[1]) && /is-inert/.test(slot[1]), 'inert');
      ok(!scanAddresses(slot[1], reg.records).found.length, 'no address in inert slot');
    }
  }
});
await gate('address scanner: matches against stated registry, never blanket-rejects 0x, ca exempt', () => {
  const evm = '0x' + 'ab12'.repeat(10);
  const stated = { ca: { state: 'stated', value: evm }, other: { state: 'absent' } };
  ok(scanAddresses(`see ${evm}`, stated).unknown.length === 0, 'stated 0x must pass');
  ok(scanAddresses(`see ${evm}`, { ca: { state: 'absent' } }).unknown.length === 1, 'unstated 0x must be flagged');
  const sol = flip(register, 'ca').records;
  ok(scanAddresses(`x ${SAMPLE.ca} y`, sol).unknown.length === 0, 'stated ca exempt');
  const all = [html, css, ...Object.values(js)].join('\n');
  ok(scanAddresses(all, rec).unknown.length === 0, 'unregistered address-shaped string in dist: ' + scanAddresses(all, rec).unknown.join(','));
});

/* ---------- no dates ---------- */
const DATE_RES = [/\b(?:19|20)\d{2}\b/, /\b\d{1,2}:\d{2}\b/, /\b\d{4}-\d{2}-\d{2}\b/, /\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b/, /\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d/i, /\b(?:as of|checked|last updated|updated|ago)\b/i];
await gate('no dates: page text, attributes, tooltips, aria, script strings and every mutated render', () => {
  const variants = [html, renderIndex(flip(register, 'ca')), renderIndex(flip(register, 'x')), renderIndex(flip(register, 'github'))];
  for (const h of variants) {
    for (const t of [...segments(h), ...attrs(h)]) for (const re of DATE_RES) ok(!re.test(t), `date-like text "${t}"`);
    const body = h.replace(/<script type="application\/json"[\s\S]*?<\/script>/, '');
    ok(!/stamp|2026/.test(h.match(/<script type="application\/json"[\s\S]*?<\/script>/)[0]), 'register embed carries dates');
    ok(!/20\d\d/.test(strip(body).replace(/<[^>]+>/g, ' ')), 'year in body');
  }
  for (const [f, src] of Object.entries(js)) {
    ok(!/\bDate\b|toLocale(?:Date|Time)?String|DateTimeFormat|getHours|getFullYear|getMinutes/.test(src), f + ' touches date or clock APIs');
    for (const m of src.matchAll(/(['"`])((?:(?!\1)[^\\\n]|\\.)*)\1/g)) for (const re of DATE_RES) ok(!re.test(m[2]), `${f}: date-like string "${m[2]}"`);
  }
});

/* ---------- palette and assets ---------- */
await gate('palette: no colour literal anywhere but tokens.css (source tree)', () => {
  const files = ['src/index.html', 'src/css/app.css', ...fs.readdirSync(path.join(ROOT, 'src/js')).map((f) => 'src/js/' + f)];
  for (const f of files) {
    const t = rd(path.join(ROOT, f));
    ok(!/#[0-9a-fA-F]{3,8}\b(?![\w-])/.test(t.replace(/&#\d+;/g, '')), f + ' has a hex literal');
    ok(!/\brgba?\(|\bhsla?\(|\boklch\(/.test(t), f + ' has a functional colour literal');
    ok(!/:\s*(?:white|black|red|blue|green|gray|grey)\b/.test(t), f + ' has a named colour');
  }
  const lits = [...rd(path.join(ROOT, 'src/css/tokens.css')).matchAll(/#[0-9a-fA-F]{6}\b/g)].length;
  ok(lits === Object.keys(tokens).length, 'every literal in tokens.css needs a provenance note');
});
await gate('palette: dist literals are only token values (derived), never new hex', () => {
  const allowed = new Set(Object.values(tokens).map((t) => t.hex));
  for (const f of ['index.html', 'css/app.css', ...jsFiles.map((x) => 'js/' + x), 'favicon.svg']) {
    for (const m of rd(path.join(dist, f)).matchAll(/#[0-9a-fA-F]{6}\b/g)) ok(allowed.has(m[0].toLowerCase()), `${f}: ${m[0]} is not a token`);
  }
});
await gate('palette: every token is a real pixel at the cited coordinate', () => {
  const cache = {};
  for (const [name, t] of Object.entries(tokens)) {
    const f = path.join(ROOT, t.file);
    ok(fs.existsSync(f), `${name}: source ${t.file} missing`);
    cache[f] ??= readImage(f);
    const px = pixelHex(cache[f], t.x, t.y);
    ok(px === t.hex, `${name}: ${t.hex} but pixel ${t.x},${t.y} in ${t.file} is ${px}`);
  }
  ok(['bg', 'panel', 'wash', 'line', 'line-soft', 'line-strong', 'faint', 'mute', 'ink-70', 'ink'].every((n) => tokens[n]), 'token set incomplete');
  ok(/--color-mint:\s*var\(--color-ink\)/.test(tokensCss), 'mint must alias a sampled token');
});
await gate('favicon: 32x32 SVG traced from the logo, no comments, no double hyphens, token colours only', () => {
  const s = rd(path.join(dist, 'favicon.svg'));
  ok(/viewBox="0 0 32 32"/.test(s) && /width="32"/.test(s) && /height="32"/.test(s), 'size');
  ok(!s.includes('<!--') && !s.includes('--'), 'comment or double hyphen');
  ok(/<path[^>]* d="M[\d. ]+L/.test(s) && (s.match(/M/g) || []).length >= 2, 'traced path with two chevrons');
  const allowed = new Set(Object.values(tokens).map((t) => t.hex));
  for (const m of s.matchAll(/#[0-9a-fA-F]{6}/g)) ok(allowed.has(m[0]), 'colour not a token');
  ok(/^<svg[\s\S]*<\/svg>\s*$/.test(s), 'well formed');
  ok(html.includes('href="favicon.svg"'), 'linked');
});
await gate('logo outputs: RGBA PNG, premultiplied resize leaves no dark fringe', () => {
  const file = path.join(dist, 'assets/logo-192.png');
  const buf = fs.readFileSync(file);
  ok(buf[25] === 6 && buf.readUInt32BE(16) === 192, 'IHDR colour type 6 at 192');
  const png = PNG.sync.read(buf);
  let edge = 0, dark = 0;
  for (let i = 0; i < png.data.length; i += 4) {
    const a = png.data[i + 3];
    if (a > 8 && a < 247) { edge++; if (png.data[i] < 200 || png.data[i + 1] < 200) dark++; }
  }
  ok(edge > 50, 'no antialiased edge found');
  ok(dark === 0, dark + ' dark fringe pixels');
  const src = fs.readFileSync(path.join(ROOT, 'brand/LOGO PEER PNG...png'));
  ok(src[25] === 6, 'source is colour type 6');
});

/* ---------- motion ---------- */
await gate('motion: reduced-motion neutralises every animation in css and js', () => {
  const block = css.match(/@media \(prefers-reduced-motion: reduce\)\s*\{([\s\S]*)\}\s*$/);
  ok(block, 'no reduced-motion block');
  for (const sel of ['.skeleton', '.marquee-track', '.live-dot::after', '.mesh', '.row.own', '.flash', '.row.enter']) ok(block[1].includes(sel), sel + ' not covered');
  ok(/\.ticket,\s*\.pill-a,\s*\.pill-b,\s*\.runner\s*\{[^}]*animation-duration:\s*10ms/.test(block[1]), 'cycle animations not collapsed');
  ok(/matchMedia\('\(prefers-reduced-motion: reduce\)'\)/.test(js['motion.js']), 'js ignores preference');
  for (const fn of ['spring', 'initReveal', 'initParallax', 'setNumber']) ok(new RegExp(`function ${fn}[\\s\\S]{0,900}reduced\\(\\)`).test(js['motion.js']), fn + ' does not check reduced');
  ok(/\.js \[data-reveal\]/.test(css) && /failsafe/.test(css), 'reveal failsafe');
});
await gate('motion: reference easing and timing tokens in use', () => {
  for (const v of ['cubic-bezier(0.2, 0.8, 0.2, 1)', '--dur-marquee: 70s', '--dur-shimmer: 1400ms', '--dur-ping: 1600ms', '--dur-cycle: 5200ms', '--dur-enter: 500ms']) ok(tokensCss.includes(v), v);
});
await gate('motion: scroll progress, parallax, spotlight, spring solver present and wired', () => {
  ok(/id="progress"/.test(html) && /initProgress/.test(js['app.js']) && /initParallax/.test(js['app.js']) && /initSpotlight/.test(js['app.js']), 'wiring');
  ok(/stiffness/.test(js['motion.js']) && /damping/.test(js['motion.js']), 'spring solver');
  ok((html.match(/data-depth/g) || []).length >= 4 && /mesh/.test(css), 'hero depth layers and mesh');
});

/* ---------- mobile ---------- */
await gate('mobile: no ch units, tap target token is 44px and applied to every control', () => {
  ok(!/\d\s*ch\b/.test(css + tokensCss + Object.values(js).join('')), 'ch unit used');
  ok(/--tap:\s*44px/.test(tokensCss), 'tap token');
  for (const sel of ['.icon-btn', '.btn', '.btn-text', '.seg', '.tab', '.nav-link', '.chip-btn', '.crumbs a', 'a.chip']) {
    const re = new RegExp('(?:^|[}\\s])' + sel.replace('.', '\\.') + '\\s*\\{[^}]*(?:width|height):\\s*var\\(--tap\\)', 'm');
    ok(re.test(css), sel + ' lacks a 44px target');
  }
});

/* ---------- content ---------- */
await gate('copy: zero shared 2-grams with the reference site text', () => {
  const corpus = new Set(rd(path.join(ROOT, 'scripts/reference-corpus.txt')).split('\n').flatMap(bigrams));
  const jsStrings = Object.values(js).flatMap((s) => [...s.matchAll(/(['`])((?:(?!\1)[^\\\n$]|\\.)*)\1/g)].map((m) => m[2]).filter((t) => /\s/.test(t) && /[A-Za-z]{3}/.test(t)));
  const mine = [...segments(html), ...attrs(html), ...jsStrings];
  // 'mkt cap' is the label the client's own-row spec dictates for the liquidity fallback tooltip, so it is the one allowed overlap.
  const shared = [...new Set(mine.flatMap(bigrams).filter((b) => corpus.has(b) && b !== 'mkt cap'))];
  ok(!shared.length, 'shared 2-grams: ' + shared.join(' | '));
});
await gate('copy: no numbers hardcoded in page text, none of the reference demo figures', () => {
  for (const t of segments(html)) ok(!/\d/.test(t.replace(/\b24h\b/gi, '')), `static number in "${t}"`);
  for (const bad of ['100K', '1,045', '87.25', '60.9', '33.98', '95.66']) ok(!html.includes(bad), 'reference figure ' + bad);
});

/* ---------- market (never gated by CA) ---------- */
await gate('market: independent of CA state, started unconditionally, reads only the market record', () => {
  ok(!/\bca\b|CA\b|own/i.test(js['market.js'].replace(/\bdown\b/g, '')), 'market.js mentions ca/own');
  ok(/from '\.\/poller\.js'/.test(js['market.js']) && !/register|own\.js/.test(js['market.js']), 'market imports');
  ok(/const marketCfg = reg\.market;/.test(js['app.js']), 'market config source');
  const startAt = js['app.js'].indexOf('market.start()'), ifAt = js['app.js'].indexOf('if (CA) {');
  ok(startAt > 0 && startAt < ifAt, 'market.start must precede and sit outside the CA branch');
});
const poller = await import(pathToFileURL(path.join(dist, 'js/poller.js')).href + '?g');
const market = await import(pathToFileURL(path.join(dist, 'js/market.js')).href + '?g');
await gate('market: solana only, pairs fetched in 30s, best pair per token, top ten by 24h volume', async () => {
  const calls = [];
  const sol = Array.from({ length: 35 }, (_, i) => 'So' + String(i).padStart(2, 'x') + 'A'.repeat(30));
  const boosts = [...sol.map((a) => ({ chainId: 'solana', tokenAddress: a })), ...sol.slice(0, 3).map((a) => ({ chainId: 'solana', tokenAddress: a })), { chainId: 'ethereum', tokenAddress: '0xdeadbeef' }];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    calls.push(url);
    if (url.includes('token-boosts')) return { ok: true, json: async () => boosts };
    const addrs = url.split('/').pop().split(',');
    const pairs = addrs.flatMap((a, i) => [
      { baseToken: { address: a, symbol: 'T' + i }, priceUsd: '1', volume: { h24: 100 + i }, priceChange: { h24: 1 }, liquidity: { usd: 5 }, info: { imageUrl: 'u' } },
      { baseToken: { address: a, symbol: 'T' + i }, priceUsd: '2', volume: { h24: 1000 + i * 10 }, priceChange: { h24: 2 }, liquidity: { usd: 6 } },
      { baseToken: { address: 'notwanted' }, quoteToken: { address: a }, volume: { h24: 9e9 } },
    ]);
    return { ok: true, json: async () => pairs };
  };
  try {
    const out = await market.fetchMarket({ url: 'https://x/token-boosts', pairsUrl: 'https://x/pairs/{addresses}' }, undefined);
    const pairCalls = calls.filter((c) => !c.includes('token-boosts'));
    ok(pairCalls.length === 2 && pairCalls[0].split('/').pop().split(',').length === 30, 'chunking');
    ok(!calls.some((c) => c.includes('0xdeadbeef')), 'non-solana requested');
    ok(out.length === 10, 'top ten');
    ok(out.every((t, i) => i === 0 || out[i - 1].volume >= t.volume), 'sorted by volume desc');
    ok(out.every((t) => t.price === 2), 'best pair per token');
    ok(!out.some((t) => t.address === 'notwanted'), 'quote-side pair leaked');
  } finally { globalThis.fetch = realFetch; }
});
await gate('market: 60s poll, exponential backoff to a cap, pause when hidden, immediate fetch on visible, keeps last good', async () => {
  ok(poller.POLL_MS === 60000 && poller.BACKOFF_START_MS === 2000 && poller.BACKOFF_MAX_MS === 60000, 'constants');
  const realST = globalThis.setTimeout, realCT = globalThis.clearTimeout, realDoc = globalThis.document;
  const timers = [];
  globalThis.setTimeout = (fn, ms) => { const t = { fn, ms, dead: false }; timers.push(t); return t; };
  globalThis.clearTimeout = (t) => { if (t) t.dead = true; };
  const listeners = {};
  globalThis.document = { hidden: false, addEventListener: (e, f) => { listeners[e] = f; }, removeEventListener: (e) => { delete listeners[e]; } };
  const flush = () => new Promise((r) => setImmediate(r));
  let calls = 0, fail = true;
  const oks = [], fails = [];
  const p = poller.createPoller({ task: async () => { calls++; if (fail) throw new Error('down'); return { n: calls }; }, onOk: (d) => oks.push(d), onFail: (e, w) => fails.push(w) });
  try {
    p.start(); await flush();
    for (let i = 0; i < 7; i++) { const t = timers.filter((x) => !x.dead).pop(); t.dead = true; t.fn(); await flush(); }
    ok(JSON.stringify(fails.slice(0, 7)) === JSON.stringify([2000, 4000, 8000, 16000, 32000, 60000, 60000]), 'backoff ' + fails.join(','));
    fail = false;
    let t = timers.filter((x) => !x.dead).pop(); t.dead = true; t.fn(); await flush();
    ok(oks.length === 1 && timers.filter((x) => !x.dead).pop().ms === 60000, 'poll interval after success');
    document.hidden = true; listeners.visibilitychange();
    ok(timers.every((x) => x.dead), 'timer alive while hidden');
    const before = calls;
    document.hidden = false; listeners.visibilitychange(); await flush();
    ok(calls === before + 1, 'no immediate fetch on visible');
    fail = true; t = timers.filter((x) => !x.dead).pop(); t.dead = true; t.fn(); await flush();
    ok(fails[fails.length - 1] === 2000, 'backoff resets after success');
  } finally { p.stop(); globalThis.setTimeout = realST; globalThis.clearTimeout = realCT; globalThis.document = realDoc; }
  ok(/S\.tokens = tokens/.test(js['app.js']) && /if \(!S\.tokens\.length\) renderErrorRows/.test(js['app.js']), 'last good data kept, dash rows only when nothing yet');
});

/* ---------- own token row ---------- */
const own = await import(pathToFileURL(path.join(dist, 'js/own.js')).href + '?g');
const fmt = await import(pathToFileURL(path.join(dist, 'js/format.js')).href + '?g');
await gate('own row: pair selection by baseToken.address, highest 24h volume first', () => {
  const ca = SAMPLE.ca;
  const pairs = [{ baseToken: { address: 'other' }, volume: { h24: 9e9 } }, { baseToken: { address: ca }, volume: { h24: 10 }, id: 'a' }, { baseToken: { address: ca }, volume: { h24: 500 }, id: 'b' }];
  ok(own.selectPair(pairs, ca).id === 'b', 'did not pick the top own pair');
  ok(own.selectPair([{ baseToken: { address: 'other' } }], ca) === null, 'must not fall back to foreign pairs');
});
await gate('own row: logo from pump image_uri, fallback to assets/logo-192.png, never the dexscreener cdn', () => {
  const ca = SAMPLE.ca, dex = { pairs: [{ baseToken: { address: ca, symbol: 'PEER', name: 'Peer' }, priceUsd: '0.5', priceChange: { h24: 3 }, volume: { h24: 9 }, liquidity: { usd: 7 } }] };
  const quiet = console.log; console.log = () => {};
  try {
    ok(own.buildOwnModel(dex, { image_uri: 'https://img/p.png' }, ca).image === 'https://img/p.png', 'pump logo');
    ok(own.buildOwnModel(dex, null, ca).image === 'assets/logo-192.png' && own.LOGO_FALLBACK === 'assets/logo-192.png', 'fallback');
  } finally { console.log = quiet; }
  ok(![html, css, ...Object.values(js)].some((t) => t.includes('dd.dexscreener.com')), 'dexscreener cdn referenced');
});
await gate('own row: liquidity uses liquidity.usd when positive, else market cap labelled Mkt Cap; console diagnostics emitted', () => {
  const ca = SAMPLE.ca, base = { baseToken: { address: ca, symbol: 'P' }, priceUsd: '1', volume: { h24: 1 }, priceChange: { h24: 1 } };
  const logs = []; const quiet = console.log; console.log = (...a) => logs.push(a[0]);
  try {
    const a = own.buildOwnModel({ pairs: [{ ...base, liquidity: { usd: 123 }, marketCap: 999 }] }, null, ca);
    ok(a.liquidity === 123 && a.liquidityLabel === 'Liquidity', 'usd liquidity');
    const b = own.buildOwnModel({ pairs: [{ ...base, liquidity: { usd: 0 }, marketCap: 999 }] }, null, ca);
    ok(b.liquidity === 999 && b.liquidityLabel === 'Mkt Cap', 'market cap fallback');
    const c = own.buildOwnModel({ pairs: [{ ...base, marketCap: 777 }] }, null, ca);
    ok(c.liquidity === 777, 'missing liquidity object');
  } finally { console.log = quiet; }
  ok(logs.includes('[peer] own token raw response') && logs.includes('[peer] own liquidity candidates'), 'console tags');
  ok(/title = 'Mkt Cap'/.test(js['app.js']), 'Mkt Cap title attribute');
});
await gate('own row: both lookups run in parallel (Promise.all), a failing logo lookup does not fail the row', async () => {
  const ca = SAMPLE.ca, started = [];
  const get = (u) => { started.push(u); return new Promise((res, rej) => setImmediate(() => (u.includes('pump') ? rej(new Error('x')) : res({ pairs: [{ baseToken: { address: ca, symbol: 'P' }, volume: { h24: 1 } }] })))); };
  const quiet = console.log; console.log = () => {};
  let p;
  try { p = own.fetchOwn({ url: 'https://d/{ca}', imageUrl: 'https://pump/{ca}' }, ca, undefined, get); ok(started.length === 2, 'second request not started synchronously'); const m = await p; ok(m && m.image === 'assets/logo-192.png', 'fallback logo'); }
  finally { console.log = quiet; }
  ok(/Promise\.all/.test(js['own.js']), 'Promise.all');
});
await gate('own row: CSS pulse, mint left border, reduced-motion off; pinned first; trending duplicate removed', () => {
  ok(/\.row\.own\s*\{[^}]*border-left:\s*2px solid var\(--color-mint\)[^}]*animation:\s*ownPulse 2s ease-in-out infinite/.test(css), 'own style');
  ok(/@keyframes ownPulse/.test(css) && /\.row\.own[^{]*\{[^}]*animation:\s*none/.test(css.slice(css.indexOf('prefers-reduced-motion'))) || /\.row\.own, [^{]*\{\s*animation: none/.test(css.slice(css.indexOf('prefers-reduced-motion'))), 'reduced motion for own row');
  ok(/S\.tokens\.filter\(\(t\) => t\.address !== CA\)/.test(js['app.js']), 'dedup');
  ok(/const want = \[ownEl\]/.test(js['app.js']), 'pinned first');
});
await gate('own row: CA absent shows the brand logo placeholder (not a letter tile), pulse still runs, not clickable', () => {
  const a = js['app.js'];
  const branch = a.slice(a.indexOf('if (!CA) {'), a.indexOf('el.classList.remove(\'is-placeholder\')'));
  ok(/LOGO_BRAND/.test(branch) && !/tile\(/.test(branch) && /\$0\.00/.test(branch) && /· · · · ·/.test(branch), 'placeholder content');
  ok(!/copy/.test(branch.replace(/\$\('\.c-act', el\)\.textContent = ''/, '')), 'placeholder must not be clickable');
  ok(own.LOGO_BRAND === 'brand/peer-logo.png', 'brand logo path');
  ok(!/\.is-placeholder[^{]*\{[^}]*animation:\s*none/.test(css), 'pulse must keep running');
});
await gate('letter tile: fallback tile text is two characters when the symbol has two or more', () => {
  ok(fmt.TILE_MIN === 2 && fmt.tileText('abc') === 'AB' && fmt.tileText('$x') === 'X' && fmt.tileText('') === '?' && fmt.tileText('Zé') === 'ZÉ', 'tile text');
  ok(/img\.onerror/.test(js['app.js']) && /className = 'tile-l'/.test(js['app.js']), 'tile on missing or failed image');
});

/* ---------- output ---------- */
const failed = results.filter((r) => !r[1]);
console.log(`\n${results.length} gates, ${results.length - failed.length} passed, ${failed.length} failed`);
process.exit(failed.length ? 1 : 0);
