// Pixel-level helpers: decode, alpha bbox, premultiplied area resize, encode, contour trace.
import fs from 'node:fs';
import { PNG } from 'pngjs';
import jpeg from 'jpeg-js';

export function readImage(file) {
  const buf = fs.readFileSync(file);
  const isPng = buf.subarray(1, 4).toString() === 'PNG';
  const dec = isPng ? PNG.sync.read(buf) : jpeg.decode(buf, { useTArray: true });
  return { w: dec.width, h: dec.height, data: dec.data };
}

export function pixelHex(img, x, y) {
  const i = (y * img.w + x) * 4;
  return '#' + [0, 1, 2].map(o => img.data[i + o].toString(16).padStart(2, '0')).join('');
}

export function alphaBBox(img, threshold = 128) {
  let x0 = img.w, y0 = img.h, x1 = -1, y1 = -1;
  for (let y = 0; y < img.h; y++) {
    for (let x = 0; x < img.w; x++) {
      if (img.data[(y * img.w + x) * 4 + 3] >= threshold) {
        if (x < x0) x0 = x; if (x > x1) x1 = x;
        if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
    }
  }
  return { x0, y0, x1, y1, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

// Centered square crop around bbox with fractional padding; returns {x, y, size}
export function squareAround(bbox, pad) {
  const side = Math.round(Math.max(bbox.w, bbox.h) * (1 + pad * 2));
  const cx = bbox.x0 + bbox.w / 2, cy = bbox.y0 + bbox.h / 2;
  return { x: Math.round(cx - side / 2), y: Math.round(cy - side / 2), size: side };
}

// Area-average resize of a square region in premultiplied space (no dark fringes from black transparent pixels)
export function resizePremultiplied(img, crop, outSize) {
  const out = new Uint8ClampedArray(outSize * outSize * 4);
  const scale = crop.size / outSize;
  for (let oy = 0; oy < outSize; oy++) {
    const sy0 = crop.y + oy * scale, sy1 = sy0 + scale;
    for (let ox = 0; ox < outSize; ox++) {
      const sx0 = crop.x + ox * scale, sx1 = sx0 + scale;
      let r = 0, g = 0, b = 0, a = 0, wsum = 0;
      for (let sy = Math.floor(sy0); sy < Math.ceil(sy1); sy++) {
        const wy = Math.min(sy + 1, sy1) - Math.max(sy, sy0);
        for (let sx = Math.floor(sx0); sx < Math.ceil(sx1); sx++) {
          const w = wy * (Math.min(sx + 1, sx1) - Math.max(sx, sx0));
          wsum += w;
          if (sx < 0 || sy < 0 || sx >= img.w || sy >= img.h) continue;
          const i = (sy * img.w + sx) * 4;
          const al = img.data[i + 3] / 255;
          r += img.data[i] * al * w; g += img.data[i + 1] * al * w; b += img.data[i + 2] * al * w; a += al * w;
        }
      }
      const o = (oy * outSize + ox) * 4;
      if (a > 0) {
        out[o] = r / a; out[o + 1] = g / a; out[o + 2] = b / a;
      }
      out[o + 3] = Math.round((a / wsum) * 255);
    }
  }
  return out;
}

export function writePng(file, rgba, size) {
  const png = new PNG({ width: size, height: size });
  png.data = Buffer.from(rgba.buffer, rgba.byteOffset, rgba.byteLength);
  fs.writeFileSync(file, PNG.sync.write(png, { colorType: 6 }));
}

// Coverage mask (0..1) at n x n over the crop
export function coverage(img, crop, n) {
  const px = resizePremultiplied(img, crop, n);
  const m = new Float32Array(n * n);
  for (let i = 0; i < n * n; i++) m[i] = px[i * 4 + 3] / 255;
  return m;
}

// Trace boundary loops of a binary mask; returns arrays of [x,y] corner points
export function traceLoops(mask, n, thr = 0.5) {
  const inside = (x, y) => x >= 0 && y >= 0 && x < n && y < n && mask[y * n + x] >= thr;
  const next = new Map();
  const add = (ax, ay, bx, by) => {
    const k = ax + ',' + ay;
    if (!next.has(k)) next.set(k, []);
    next.get(k).push([bx, by]);
  };
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      if (!inside(x, y)) continue;
      if (!inside(x, y - 1)) add(x, y, x + 1, y);
      if (!inside(x + 1, y)) add(x + 1, y, x + 1, y + 1);
      if (!inside(x, y + 1)) add(x + 1, y + 1, x, y + 1);
      if (!inside(x - 1, y)) add(x, y + 1, x, y);
    }
  }
  const loops = [];
  for (const [k, outs] of next) {
    while (outs.length) {
      const [sx, sy] = k.split(',').map(Number);
      const loop = [[sx, sy]];
      let [cx, cy] = outs.pop();
      while (!(cx === sx && cy === sy)) {
        loop.push([cx, cy]);
        const o = next.get(cx + ',' + cy);
        if (!o || !o.length) break;
        [cx, cy] = o.pop();
      }
      loops.push(loop);
    }
  }
  return loops;
}

function rdp(pts, eps) {
  if (pts.length < 3) return pts;
  const [ax, ay] = pts[0], [bx, by] = pts[pts.length - 1];
  const dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy) || 1;
  let dmax = 0, idx = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const d = Math.abs(dy * pts[i][0] - dx * pts[i][1] + bx * ay - by * ax) / len;
    if (d > dmax) { dmax = d; idx = i; }
  }
  if (dmax <= eps) return [pts[0], pts[pts.length - 1]];
  return rdp(pts.slice(0, idx + 1), eps).slice(0, -1).concat(rdp(pts.slice(idx), eps));
}

export function simplifyLoop(loop, eps) {
  // split closed loop at two far points so RDP behaves
  let far = 0, fd = 0;
  for (let i = 1; i < loop.length; i++) {
    const d = Math.hypot(loop[i][0] - loop[0][0], loop[i][1] - loop[0][1]);
    if (d > fd) { fd = d; far = i; }
  }
  const a = rdp(loop.slice(0, far + 1), eps);
  const b = rdp(loop.slice(far).concat([loop[0]]), eps);
  return a.slice(0, -1).concat(b.slice(0, -1));
}
