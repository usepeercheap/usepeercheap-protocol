// Build: brand assets, favicon, static site into dist/. Nothing outside the project is touched.
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, loadRegister, renderIndex, readTokens } from './lib/site.mjs';
import { readImage, alphaBBox, squareAround, resizePremultiplied, writePng, coverage, traceLoops, simplifyLoop } from './lib/image.mjs';

const dist = path.join(ROOT, 'dist');
fs.rmSync(dist, { recursive: true, force: true });
for (const d of ['assets', 'brand', 'css', 'js', 'fonts']) fs.mkdirSync(path.join(dist, d), { recursive: true });

const tokens = readTokens();

// Brand mark. The transparent PNG has pure-black transparent pixels, so resize in premultiplied space.
const logo = readImage(path.join(ROOT, 'brand', 'LOGO PEER PNG...png'));
const bbox = alphaBBox(logo, 128);
const crop = squareAround(bbox, 0.14);
for (const [file, size] of [['assets/logo-180.png', 180], ['assets/logo-192.png', 192], ['assets/logo-512.png', 512], ['brand/peer-logo.png', 512]]) {
  writePng(path.join(dist, file), resizePremultiplied(logo, crop, size), size);
}

// Favicon traced from the real pixel grid of the same asset.
const N = 128;
const tight = squareAround(bbox, 0);
const mask = coverage(logo, tight, N);
const loops = traceLoops(mask, N, 0.5).filter((l) => l.length > 8).map((l) => simplifyLoop(l, 0.7));
const scale = 24 / N, off = 4;
const r2 = (v) => +v.toFixed(2);
const d = loops.map((l) => 'M' + l.map(([x, y]) => `${r2(off + x * scale)} ${r2(off + y * scale)}`).join('L') + 'Z').join('');
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32"><rect width="32" height="32" rx="6" fill="${tokens.bg.hex}"/><path fill="${tokens.ink.hex}" fill-rule="evenodd" d="${d}"/></svg>\n`;
fs.writeFileSync(path.join(dist, 'favicon.svg'), svg);

// Share image: the client banner as supplied.
fs.copyFileSync(path.join(ROOT, 'reference', 'SAMPUL PEER JPG.jpg.jpeg'), path.join(dist, 'assets', 'og.jpg'));

// Static files
const copyDir = (from, to) => { for (const f of fs.readdirSync(from)) fs.copyFileSync(path.join(from, f), path.join(to, f)); };
copyDir(path.join(ROOT, 'src/css'), path.join(dist, 'css'));
copyDir(path.join(ROOT, 'src/js'), path.join(dist, 'js'));
copyDir(path.join(ROOT, 'src/fonts'), path.join(dist, 'fonts'));
fs.writeFileSync(path.join(dist, 'index.html'), renderIndex(loadRegister()));
fs.writeFileSync(path.join(dist, '_headers'), '/*\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: strict-origin-when-cross-origin\n/fonts/*\n  Cache-Control: public, max-age=31536000, immutable\n');

const files = [];
(function walk(p) { for (const f of fs.readdirSync(p, { withFileTypes: true })) f.isDirectory() ? walk(path.join(p, f.name)) : files.push(path.relative(dist, path.join(p, f.name))); })(dist);
console.log(`build ok: ${files.length} files in dist/`);
console.log(`logo bbox ${bbox.w}x${bbox.h} at ${bbox.x0},${bbox.y0}; favicon loops ${loops.length}, path ${d.length} chars`);
