// Reads every brand/ and reference/ file byte-level: IHDR, alpha histogram, dominant pixels, k-means palette snapped to real pixels.
import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';
import jpeg from 'jpeg-js';

const dirs = ['brand', 'reference'];
const report = {};

function kmeans(px, k, iters = 12) {
  const n = px.length / 3;
  const cents = [];
  for (let i = 0; i < k; i++) {
    const j = Math.floor((i + 0.5) * n / k);
    cents.push([px[j * 3], px[j * 3 + 1], px[j * 3 + 2]]);
  }
  const cnt = new Array(k).fill(0);
  for (let it = 0; it < iters; it++) {
    const sum = cents.map(() => [0, 0, 0]);
    cnt.fill(0);
    for (let i = 0; i < n; i++) {
      let best = 0, bd = Infinity;
      for (let c = 0; c < k; c++) {
        const d = (px[i * 3] - cents[c][0]) ** 2 + (px[i * 3 + 1] - cents[c][1]) ** 2 + (px[i * 3 + 2] - cents[c][2]) ** 2;
        if (d < bd) { bd = d; best = c; }
      }
      sum[best][0] += px[i * 3]; sum[best][1] += px[i * 3 + 1]; sum[best][2] += px[i * 3 + 2]; cnt[best]++;
    }
    for (let c = 0; c < k; c++) if (cnt[c]) cents[c] = sum[c].map(v => v / cnt[c]);
  }
  return cents.map((c, i) => ({ centroid: c.map(Math.round), count: cnt[i] }));
}

function snap(px, w, centroid) {
  const n = px.length / 3;
  let best = 0, bd = Infinity;
  for (let i = 0; i < n; i++) {
    const d = (px[i * 3] - centroid[0]) ** 2 + (px[i * 3 + 1] - centroid[1]) ** 2 + (px[i * 3 + 2] - centroid[2]) ** 2;
    if (d < bd) { bd = d; best = i; }
  }
  const hex = '#' + [0, 1, 2].map(o => px[best * 3 + o].toString(16).padStart(2, '0')).join('');
  return { x: best % w, y: Math.floor(best / w), hex };
}

for (const d of dirs) {
  for (const f of fs.readdirSync(d)) {
    const p = path.join(d, f);
    const buf = fs.readFileSync(p);
    const info = { bytes: buf.length, magic: buf.subarray(0, 4).toString('hex') };
    if (buf.subarray(1, 4).toString() === 'PNG') {
      info.ihdr = { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20), bitDepth: buf[24], colorType: buf[25], interlace: buf[28] };
    }
    const isPng = buf.subarray(1, 4).toString() === 'PNG';
    const dec = isPng ? PNG.sync.read(buf) : jpeg.decode(buf, { useTArray: true });
    const data = dec.data;
    const si = { width: dec.width, height: dec.height, channels: 4 };
    info.decoded = { w: si.width, h: si.height, channels: 4 };
    const ch = 4, npx = si.width * si.height;
    if (ch === 4) {
      const hist = new Array(8).fill(0);
      let blackTransparent = 0;
      for (let i = 0; i < npx; i++) {
        const a = data[i * 4 + 3];
        hist[a >> 5]++;
        if (a < 255 && data[i * 4] === 0 && data[i * 4 + 1] === 0 && data[i * 4 + 2] === 0) blackTransparent++;
      }
      info.alphaHistogram8bins = hist;
      info.pureBlackTransparentPx = blackTransparent;
    }
    // sample every 7th pixel, opaque only
    const step = 7, rgb = [];
    for (let i = 0; i < npx; i += step) {
      if (ch === 4 && data[i * 4 + 3] < 128) continue;
      rgb.push(data[i * ch], data[i * ch + 1], data[i * ch + 2]);
    }
    const px = Uint8Array.from(rgb);
    const w = si.width;
    const km = kmeans(px, 5).sort((a, b) => b.count - a.count);
    // snap against subsampled grid; coordinates recomputed on full image
    info.palette = km.map(k => {
      const full = new Uint8Array(npx * 3);
      for (let i = 0; i < npx; i++) { full[i * 3] = data[i * ch]; full[i * 3 + 1] = data[i * ch + 1]; full[i * 3 + 2] = data[i * ch + 2]; }
      return { ...k, pixels: undefined, snapped: snap(full, w, k.centroid), share: +(k.count / (px.length / 3)).toFixed(4) };
    });
    report[p] = info;
  }
}
fs.mkdirSync('scripts/out', { recursive: true });
fs.writeFileSync('scripts/out/assets.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 1));
