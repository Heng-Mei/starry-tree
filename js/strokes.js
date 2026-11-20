import { PW, TREE, radiusAt, rng } from './layout.js';
import { glyphDabs, placeDabs } from './glyph.js';

// assets/starry-map.png, baked by tools/bake-map.py: four GW x GH sections stacked vertically.
const GW = 128, GH = 101;
const P = (x, y) => [x / 1013, 1 - y / 1013]; // painting px (1280 x 1013 scan) -> painting coords

const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
const pick = (rand, a) => a[Math.floor(rand() * a.length)];
const clamp01 = (v) => Math.min(1, Math.max(0, v));
const norm = (v) => { const l = Math.hypot(...v); return v.map((x) => x / l); };
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const jitter = (rand, c, k = 0.08) => { const m = 1 + (rand() - 0.5) * k; return c.map((v) => clamp01(v * m + (rand() - 0.5) * 0.03)); };
const pal = (...h) => h.map(hex);

const STARS = [
  [135, 45, 52], [295, 35, 28], [440, 40, 36], [525, 65, 30], [780, 85, 55], [305, 175, 46],
  [905, 235, 48], [415, 330, 34], [60, 455, 26], [165, 480, 40], [455, 535, 72],
].map(([x, y, r], i) => ({ c: P(x, y), r: r / 1013, t: 4.4 + 0.09 * i, span: 1.0 }));
const MOON = { c: P(1163, 180), r: 66 / 1013, hole: P(1138, 156), holeR: 54 / 1013, halo: 118 / 1013, t: 5.6, span: 1.1 };
const WINDOWS = [[936, 836], [620, 866], [880, 867], [1012, 880], [982, 887], [1046, 923], [1139, 929], [776, 937], [751, 938]].map(([x, y]) => P(x, y));
const VORTICES = [
  { c: P(650, 330), r: 170 / 1013, s: -1 },
  { c: P(870, 480), r: 110 / 1013, s: 1 },
  ...STARS.map((s) => ({ c: s.c, r: s.r * 1.2, s: 1 })),
  { c: MOON.c, r: MOON.halo, s: 1 },
];

const HALO = [pal('#d9a63a', '#e6b84a', '#c98a2a'), pal('#f2efd6', '#efe6a6'), pal('#cde0b0', '#b9d7bf'), pal('#a9c8e8', '#93b6dc')];
const MOON_HALO = [pal('#e8e49a', '#dfe5a5'), pal('#cfe3ad', '#c3dcae'), pal('#b8d8d2', '#a8cfd0')];
const CRESCENT = pal('#f0b232', '#f4c443', '#e89b25', '#f7d35a');
const WINDOW = pal('#f2c94c', '#f0b43c');
const BARK = pal('#1b2a20', '#22362a', '#2e3e2e', '#3c2d22', '#4c3726', '#2c2030', '#38283c', '#1d2633');
const RIM = pal('#41604f', '#507061', '#58747e');
const GOLD = pal('#f2c94c', '#e8b03a', '#f5d97a', '#dd9a2e');

export async function loadMap(url) {
  const img = new Image();
  img.src = url;
  await img.decode();
  const c = document.createElement('canvas');
  c.width = img.width;
  c.height = img.height;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0);
  return ctx.getImageData(0, 0, c.width, c.height).data;
}

const mirror = (i, n) => { i = ((i % (2 * n)) + 2 * n) % (2 * n); return i < n ? i : 2 * n - 1 - i; };
const texel = (d, sec, ix, iy, ch) => d[((sec * GH + iy) * GW + ix) * 4 + ch] / 255;

function sample(d, sec, x, y) {
  const fx = (x / PW) * GW - 0.5, fy = (1 - y) * GH - 0.5;
  const x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0;
  const out = [0, 0, 0];
  for (const [dx, dy, w] of [[0, 0, (1 - tx) * (1 - ty)], [1, 0, tx * (1 - ty)], [0, 1, (1 - tx) * ty], [1, 1, tx * ty]]) {
    const ix = mirror(x0 + dx, GW), iy = Math.min(GH - 1, Math.max(0, y0 + dy));
    for (let c = 0; c < 3; c++) out[c] += w * texel(d, sec, ix, iy, c);
  }
  return out;
}

function region(d, x, y) {
  const ix = mirror(Math.floor((x / PW) * GW), GW), iy = Math.min(GH - 1, Math.max(0, Math.floor((1 - y) * GH)));
  return Math.round((texel(d, 3, ix, iy, 0) * 255) / 16) & 7;
}

function flow(x, y) {
  let vx = 0.35, vy = 0;
  for (const V of VORTICES) {
    const dx = x - V.c[0], dy = y - V.c[1];
    const g = (Math.exp(-(dx * dx + dy * dy) / (V.r * V.r)) * 2) / V.r;
    vx -= V.s * dy * g;
    vy += V.s * dx * g;
  }
  return [vx, vy];
}

const cellHash = (i, j) => { const s = Math.sin(i * 127.1 + j * 311.7) * 43758.5453; return s - Math.floor(s); };

function flat(x, y, ang, len, wid, c, birth, seed, drift = [0, 0, 0]) {
  const d = [Math.cos(ang), Math.sin(ang), 0];
  return { p: [x, y, 0], d, w: [-d[1], d[0], 0], c, len, wid, birth, seed, drift };
}

function mapStroke(map, x, y, f, rand, win) {
  const reg = region(map, x, y);
  const [c2, s2, coh] = sample(map, 2, x, y);
  let ang = 0.5 * Math.atan2(s2 * 2 - 1, c2 * 2 - 1) + (rand() - 0.5) * (1.2 - coh) * 0.9;
  let len = 0.03, wid = 0.0085, birth, amp = 0, rate = 0;
  const fx = (x - win.x0) / (win.x1 - win.x0);
  if (reg === 1) { len = 0.036; birth = 0.6 + 2.4 * fx + 0.5 * rand(); amp = 1.3; rate = 1 / 5.5; }
  else if (reg === 0) { birth = 1.6 + 2.6 * cellHash(Math.floor(x / 0.13), Math.floor(y / 0.13)) + 0.5 * rand(); amp = 0.8; rate = 1 / 8; }
  else if (reg === 4) { len = 0.034; birth = 6.2 + 1.3 * fx + 0.3 * rand(); }
  else {
    len = 0.018; wid = 0.0068; birth = 7.0 + 1.3 * rand();
    ang = Math.round(ang / (Math.PI / 4)) * (Math.PI / 4) + (rand() - 0.5) * 0.1;
  }
  if (reg <= 1) {
    for (const s of [...STARS, { ...MOON, r: MOON.halo }]) {
      const dist = Math.hypot(x - s.c[0], y - s.c[1]);
      if (dist < s.r * 1.15) {
        ang = Math.atan2(y - s.c[1], x - s.c[0]) + Math.PI / 2;
        len = 0.022;
        birth = s.t + (s.span * dist) / (s.r * 1.15) + 0.15 * rand();
        break;
      }
    }
  }
  let d = [Math.cos(ang), Math.sin(ang)];
  const v = flow(x, y);
  if (d[0] * v[0] + d[1] * v[1] < 0) { d = [-d[0], -d[1]]; ang += Math.PI; }
  len *= f; wid *= f;
  const L = sample(map, 0, x, y), D = sample(map, 1, x, y);
  const t = rand() < 0.5 ? 0.15 * rand() : 1 - 0.15 * rand();
  const c = jitter(rand, L.map((l, i) => l * (1 - t) + D[i] * t), 0.12);
  return flat(x, y, ang, len, wid, c, birth, rand(), [d[0] * len * amp, d[1] * len * amp, rate * (0.8 + 0.4 * rand())]);
}

function rings(out, rand, s, radii, palettes, wid) {
  radii.forEach((rk, k) => {
    const len = Math.min(Math.max(rk * 0.9, 0.01), 0.026);
    const m = k === 0 && palettes === HALO ? 4 : Math.ceil((2 * Math.PI * rk) / (len * 0.8));
    for (let i = 0; i < m; i++) {
      const a = ((i + rand() * 0.5) / m) * 2 * Math.PI;
      const r = rk * (0.92 + 0.16 * rand());
      const ang = palettes === HALO && k === 0 ? rand() * Math.PI * 2 : a + Math.PI / 2;
      const birth = s.t + (s.span * k) / radii.length + 0.1 * rand();
      out.push(flat(s.c[0] + r * Math.cos(a), s.c[1] + r * Math.sin(a), ang, len, wid, jitter(rand, pick(rand, palettes[k])), birth, rand()));
    }
  });
}

function sky(out, rand) {
  for (const s of STARS) rings(out, rand, s, [s.r * 0.18, s.r * 0.53, s.r * 0.76, s.r * 0.99], HALO, 0.0065);
  for (let i = 0; i < 110; i++) {
    let x, y;
    do {
      x = MOON.c[0] + (rand() * 2 - 1) * MOON.r;
      y = MOON.c[1] + (rand() * 2 - 1) * MOON.r;
    } while (Math.hypot(x - MOON.c[0], y - MOON.c[1]) > MOON.r || Math.hypot(x - MOON.hole[0], y - MOON.hole[1]) < MOON.holeR);
    const ang = Math.atan2(y - MOON.c[1], x - MOON.c[0]) + Math.PI / 2;
    out.push(flat(x, y, ang, 0.018, 0.0075, jitter(rand, pick(rand, CRESCENT)), MOON.t + MOON.span + 0.2 + 0.5 * rand(), rand()));
  }
  rings(out, rand, { ...MOON, t: MOON.t + 0.4 }, [80 / 1013, 98 / 1013, 116 / 1013], MOON_HALO, 0.007);
  WINDOWS.forEach(([x, y], i) => {
    for (let k = 0; k < 3; k++) {
      out.push(flat(x + (rand() - 0.5) * 0.006, y + (k - 1) * 0.003, (rand() - 0.5) * 0.15, 0.012, 0.0055, jitter(rand, pick(rand, WINDOW)), 8.0 + 0.12 * i, rand()));
    }
  });
}

function pack(list) {
  const n = list.length;
  const b = {
    n, pos: new Float32Array(n * 3), dir: new Float32Array(n * 3), wax: new Float32Array(n * 3), col: new Float32Array(n * 3),
    drift: new Float32Array(n * 3), size: new Float32Array(n * 2), misc: new Float32Array(n * 4),
  };
  list.forEach((s, i) => {
    b.pos.set(s.p, i * 3); b.dir.set(s.d, i * 3); b.wax.set(s.w, i * 3); b.col.set(s.c, i * 3);
    if (s.drift) b.drift.set(s.drift, i * 3);
    b.size[i * 2] = s.len; b.size[i * 2 + 1] = s.wid;
    b.misc.set([s.birth, s.seed, s.kind ?? 0, s.rad ?? 0], i * 4);
  });
  return b;
}

// Sky, hills and village over the visible window; denser tiers get smaller strokes.
export function background(map, win, count, seed) {
  const rand = rng(seed);
  const out = [];
  const x0 = win.x0 - 0.03, x1 = win.x1 + 0.03, y0 = -0.02, y1 = 1.02;
  const n = Math.round((count * (x1 - x0) * (y1 - y0)) / PW);
  const f = Math.pow(20000 / count, 0.35);
  const cols = Math.max(1, Math.round(Math.sqrt((n * (x1 - x0)) / (y1 - y0))));
  const rows = Math.max(1, Math.round(n / cols));
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      out.push(mapStroke(map, x0 + ((i + rand()) / cols) * (x1 - x0), y0 + ((j + rand()) / rows) * (y1 - y0), f, rand, win));
    }
  }
  sky(out, rand);
  out.sort((a, b) => a.birth - b.birth);
  return pack(out);
}

const treeBirth = (y, rand) => 8.6 + 2.4 * ((y - TREE.base) / TREE.height) + 0.35 * rand();
const lobe = (phi, y) => 1 + 0.2 * Math.sin(4 * phi + 9 * y) + 0.1 * Math.sin(7 * phi - 15 * y);

function randomHeight(rand, lo = 0, hi = 1) {
  for (;;) {
    const y = TREE.base + (lo + rand() * (hi - lo)) * TREE.height;
    if (rand() < radiusAt(y) / TREE.r0 + 0.05) return y;
  }
}

// Cypress-flame tree in tree-local coordinates (axis at x = z = 0).
export function tree(count, seed) {
  const rand = rng(seed);
  const out = [];
  while (out.length < count) {
    const y = randomHeight(rand);
    const phi = rand() * Math.PI * 2;
    const r = radiusAt(y) * lobe(phi, y) * (0.7 + 0.32 * Math.sqrt(rand()));
    const radial = [Math.cos(phi), 0, Math.sin(phi)];
    const sway = 0.6 * Math.sin(y * 10 + phi * 3) + (rand() - 0.5) * 0.5;
    const d = norm([-Math.sin(phi) * sway, 1, Math.cos(phi) * sway]);
    const h = (y - TREE.base) / TREE.height;
    out.push({
      p: [r * radial[0], y, r * radial[2]], d, w: norm(cross(d, radial)),
      c: jitter(rand, pick(rand, rand() < 0.12 ? RIM : BARK)),
      len: (0.04 + 0.03 * rand()) * (1 - 0.4 * h), wid: 0.0095 + 0.004 * rand(),
      birth: treeBirth(y, rand), seed: rand(),
    });
  }
  for (let i = 0; i < 9; i++) {
    const y = TREE.base + (0.12 + (0.66 * (i + rand())) / 9) * TREE.height;
    const phi = rand() * Math.PI * 2;
    const r = radiusAt(y) * lobe(phi, y) * 1.02;
    const radial = [Math.cos(phi), 0, Math.sin(phi)], tan = [-Math.sin(phi), 0, Math.cos(phi)];
    const c = [r * radial[0], y, r * radial[2]];
    const birth = treeBirth(y, rand) + 0.4;
    for (let k = 0; k < 9; k++) {
      const core = k < 2, a = (k / 7) * Math.PI * 2, rr = core ? 0.002 : 0.011;
      const e = [tan[0] * Math.cos(a), Math.sin(a), tan[2] * Math.cos(a)];
      const d = core ? norm([tan[0], 0.3 * (k - 0.5), tan[2]]) : norm([-tan[0] * Math.sin(a), Math.cos(a), -tan[2] * Math.sin(a)]);
      out.push({
        p: c.map((v, j) => v + e[j] * rr + radial[j] * 0.003), d, w: norm(cross(d, radial)),
        c: jitter(rand, core ? hex('#e9c046') : pick(rand, k % 2 ? HALO[1] : HALO[3])),
        len: core ? 0.008 : 0.009, wid: 0.0055, birth, seed: rand(),
      });
    }
  }
  return pack(out);
}

// Glyph dabs, as many decoy dabs again, and Venus on the treetop.
export function lights(seed) {
  const rand = rng(seed);
  const glyph = placeDabs(glyphDabs(rand), rand);
  const out = glyph.map((g) => ({
    p: g.pos, d: g.dir, w: g.wax, c: jitter(rand, pick(rand, GOLD)), len: g.len, wid: g.wid,
    birth: treeBirth(g.pos[1], rand), seed: rand(), kind: 1, rad: g.rad,
  }));
  for (let i = 0; i < glyph.length * 1.5; i++) {
    const y = i < glyph.length ? randomHeight(rand, 0.17, 0.6) : randomHeight(rand, 0.05, 0.9);
    const rad = radiusAt(y), phi = rand() * Math.PI * 2, r = rad * Math.sqrt(rand()) * 0.95;
    const radial = [Math.cos(phi), 0, Math.sin(phi)], a = rand() * Math.PI * 2;
    const d = [-Math.sin(phi) * Math.cos(a), Math.sin(a), Math.cos(phi) * Math.cos(a)];
    const g = pick(rand, glyph);
    out.push({
      p: [r * radial[0], y, r * radial[2]], d, w: norm(cross(d, radial)), c: jitter(rand, pick(rand, GOLD)),
      len: g.len, wid: g.wid, birth: treeBirth(y, rand), seed: rand(), kind: 0, rad,
    });
  }
  const top = [TREE.x, TREE.base + TREE.height + 0.012, TREE.z];
  [[0.004, 6, pal('#f3d36b', '#f0c24a')], [0.015, 10, pal('#f6f3e0', '#f1ecc8')], [0.026, 14, pal('#bcd6ee', '#a9c8e8')]].forEach(([rk, m, p], k) => {
    for (let i = 0; i < m; i++) {
      const a = ((i + rand() * 0.4) / m) * Math.PI * 2;
      const ang = k === 0 ? rand() * Math.PI * 2 : a + Math.PI / 2;
      const d = [Math.cos(ang), Math.sin(ang), 0];
      out.push({
        p: [top[0] + rk * Math.cos(a), top[1] + rk * Math.sin(a), top[2]], d, w: [-d[1], d[0], 0],
        c: jitter(rand, pick(rand, p)), len: k === 0 ? 0.008 : 0.011, wid: 0.006,
        birth: 11.3 + 0.25 * k + 0.1 * rand(), seed: rand(), kind: 2, rad: 1,
      });
    }
  });
  return pack(out);
}

export function underpaint(map) {
  const c = document.createElement('canvas');
  c.width = GW;
  c.height = GH;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(GW, GH);
  for (let i = 0; i < GW * GH; i++) {
    for (let ch = 0; ch < 3; ch++) img.data[i * 4 + ch] = 0.46 * (map[i * 4 + ch] + map[(GW * GH + i) * 4 + ch]);
    img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}
