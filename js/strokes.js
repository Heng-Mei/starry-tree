import { PW, TREE, radiusAt, rng } from './layout.js';
import { glyphDabs, placeDabs } from './glyph.js';

// assets/starry-map.png, baked by tools/bake-map.py: four GW x GH sections stacked vertically.
const GW = 128, GH = 101;
const TAU = Math.PI * 2;

const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
const pick = (rand, a) => a[Math.floor(rand() * a.length)];
const clamp01 = (v) => Math.min(1, Math.max(0, v));
const norm = (v) => { const l = Math.hypot(...v); return v.map((x) => x / l); };
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const jitter = (rand, c, k = 0.08) => { const m = 1 + (rand() - 0.5) * k; return c.map((v) => clamp01(v * m + (rand() - 0.5) * 0.03)); };
const pal = (...h) => h.map(hex);
const lum = (c) => 0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2];

const h2 = (i, j) => { const s = Math.sin(i * 127.1 + j * 311.7) * 43758.5453; return s - Math.floor(s); };
function vnoise(x, y) {
  const i = Math.floor(x), j = Math.floor(y), fx = x - i, fy = y - j;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  const a = h2(i, j) + (h2(i + 1, j) - h2(i, j)) * u, b = h2(i, j + 1) + (h2(i + 1, j + 1) - h2(i, j + 1)) * u;
  return a + (b - a) * v;
}
const fbm = (x, y) => 0.6 * vnoise(x, y) + 0.4 * vnoise(2.1 * x + 5.2, 2.1 * y + 1.3);

// Procedural composition in painting coordinates; only the brush language and colours come from the painting.
const band = (x) => 0.64 + 0.055 * Math.sin(x * 4.6 + 0.9) + 0.025 * Math.sin(x * 9.7 + 2.4);
const bandSlope = (x) => 0.253 * Math.cos(x * 4.6 + 0.9) + 0.2425 * Math.cos(x * 9.7 + 2.4);
const BAND_W = 0.09;
const hill = (x) => 0.225 + 0.04 * Math.sin(x * 4.3 + 0.7) + 0.022 * Math.sin(x * 10.9 + 2.1) + 0.01 * Math.sin(x * 23 + 1);
const hillSlope = (x) => 0.172 * Math.cos(x * 4.3 + 0.7) + 0.24 * Math.cos(x * 10.9 + 2.1) + 0.23 * Math.cos(x * 23 + 1);
const village = (x) => 0.115 + 0.015 * Math.sin(x * 7 + 1.3);
const TOP = TREE.base + TREE.height;
const treeHalf = (y) => (y < TOP ? radiusAt(y) * 1.15 : 0) + 0.02;

const crand = rng(2026);
const MOON = { c: [0.2, 0.845], r: 0.062, holeR: 0.052, halo: 0.115, t: 2.2, span: 1.1 };
MOON.hole = [MOON.c[0] - 0.024, MOON.c[1] + 0.023];
const STARS = [{ c: [TREE.x + 0.21, 0.5], r: 0.06, t: 1.4, span: 1.0 }];
for (let k = 0; k < 800 && STARS.length < 15; k++) {
  const r = 0.02 + 0.026 * crand();
  const x = -0.35 + crand() * (PW + 0.7), y = 0.42 + crand() * 0.53;
  if (Math.abs(x - TREE.x) < treeHalf(y) + r) continue;
  if (Math.hypot(x - TREE.x, y - TOP) < 0.07 + r) continue;
  if (Math.hypot(x - MOON.c[0], y - MOON.c[1]) < MOON.halo + r + 0.03) continue;
  if (STARS.some((s) => Math.hypot(x - s.c[0], y - s.c[1]) < s.r + r + 0.09)) continue;
  STARS.push({ c: [x, y], r, t: 1.0 + 2.6 * crand(), span: 1.0 });
}
const VORTICES = [];
for (let x = -0.55, s = 1; x < PW + 0.55; x += 0.24 + 0.14 * crand(), s = -s) {
  VORTICES.push({ c: [x, band(x) + (crand() - 0.5) * 0.06], r: 0.07 + 0.08 * crand(), s });
}
for (const s of STARS) VORTICES.push({ c: s.c, r: s.r * 1.2, s: 1 });
VORTICES.push({ c: MOON.c, r: MOON.halo, s: 1 });
const WINDOWS = [];
while (WINDOWS.length < 16) {
  const x = -0.3 + crand() * (PW + 0.6);
  if (Math.abs(x - TREE.x) > 0.2) WINDOWS.push([x, 0.025 + crand() * (village(x) - 0.05)]);
}

const HALO = [pal('#d9a63a', '#e6b84a', '#c98a2a'), pal('#f2efd6', '#efe6a6'), pal('#cde0b0', '#b9d7bf'), pal('#a9c8e8', '#93b6dc')];
const MOON_HALO = [pal('#e8e49a', '#dfe5a5'), pal('#cfe3ad', '#c3dcae'), pal('#b8d8d2', '#a8cfd0')];
const CRESCENT = pal('#f0b232', '#f4c443', '#e89b25', '#f7d35a');
const WINDOW = pal('#f2c94c', '#f0b43c');
const BARK = pal('#1b2a20', '#22362a', '#2e3e2e', '#3c2d22', '#4c3726', '#2c2030', '#38283c', '#1d2633');
const RIM = pal('#41604f', '#507061', '#58747e');
const GOLD = pal('#f2c94c', '#e8b03a', '#f5d97a', '#dd9a2e');
const GARLAND = pal('#f6efc8', '#f3e4a0', '#fff6d8', '#efe0b0');
const SNOW = pal("#dfe6ee", "#d2dce8", "#e6e2d6", "#c8d6e4");

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

const texel = (d, sec, ix, iy, ch) => d[((sec * GH + iy) * GW + ix) * 4 + ch] / 255;

// Per region (0 sky, 1 swirl, 4 hills, 5 village) the painting's cells sorted by brightness, each with its light and dark half.
export function palettes(d) {
  const out = [[], [], [], [], [], []];
  for (let iy = 0; iy < GH; iy++) {
    for (let ix = 0; ix < GW; ix++) {
      const reg = Math.round((texel(d, 3, ix, iy, 0) * 255) / 16) & 7;
      const L = [0, 1, 2].map((c) => texel(d, 0, ix, iy, c)), D = [0, 1, 2].map((c) => texel(d, 1, ix, iy, c));
      // star and moon yellows are painted as rings, keep them out of the sky
      if (reg <= 1 && L[2] < 0.75 * L[0]) continue;
      out[reg].push({ l: lum(L) + lum(D), L, D });
    }
  }
  for (const a of out) a.sort((p, q) => p.l - q.l);
  return out;
}

function cellAt(list, t) {
  return list[Math.min(list.length - 1, Math.max(0, Math.round(clamp01(t) * (list.length - 1))))];
}

function paint(list, t, rand) {
  const { L, D } = cellAt(list, t + (rand() - 0.5) * 0.1);
  const k = rand() < 0.5 ? 0.15 * rand() : 1 - 0.15 * rand();
  return jitter(rand, L.map((l, i) => l * (1 - k) + D[i] * k), 0.12);
}

function regionAt(x, y) {
  if (y < village(x)) return 5;
  if (y < hill(x)) return 4;
  return Math.abs(y - band(x)) < BAND_W * (0.8 + 0.4 * vnoise(x * 6, 1.7)) ? 1 : 0;
}

// Target brightness in [0, 1], used to pick from the region's sorted cells.
function tone(reg, x, y) {
  const n = fbm(x * 5, y * 5);
  if (reg === 1) return 0.3 + 0.5 * (1 - Math.abs(y - band(x)) / BAND_W) + 0.3 * (n - 0.5);
  if (reg === 0) {
    const glow = Math.exp(-(((y - hill(x) - 0.06) / 0.06) ** 2)), edge = Math.exp(-(((y - band(x)) / (BAND_W * 1.8)) ** 2));
    return 0.18 + 0.3 * n + 0.45 * glow + 0.2 * edge;
  }
  if (reg === 4) return 0.15 + 0.45 * n + (0.2 * (y - village(x))) / (hill(x) - village(x));
  return 0.1 + 0.5 * n;
}

function flow(x, y) {
  const along = 0.6 * Math.exp(-(((y - band(x)) / 0.12) ** 2));
  let vx = 0.35 + along, vy = along * bandSlope(x);
  for (const V of VORTICES) {
    const dx = x - V.c[0], dy = y - V.c[1];
    const g = (Math.exp(-(dx * dx + dy * dy) / (V.r * V.r)) * 2) / V.r;
    vx -= V.s * dy * g;
    vy += V.s * dx * g;
  }
  return [vx, vy];
}

function flat(x, y, ang, len, wid, c, birth, seed, drift = [0, 0, 0]) {
  const d = [Math.cos(ang), Math.sin(ang), 0];
  return { p: [x, y, 0], d, w: [-d[1], d[0], 0], c, len, wid, birth, seed, drift };
}

function groundStroke(pals, x, y, f, rand) {
  const reg = regionAt(x, y);
  // patches emerge everywhere at once, in an order set by low-frequency noise
  let birth = 0.3 + 4.2 * clamp01((fbm(x * 2.3 + 7, y * 2.3 + 3) - 0.2) / 0.6) + 0.5 * rand();
  let len = 0.03, wid = 0.0085, amp = 0, rate = 0, ang;
  if (reg <= 1) {
    const v = flow(x, y);
    ang = Math.atan2(v[1], v[0]) + (rand() - 0.5) * 0.35;
    amp = reg ? 1.3 : 0.8;
    rate = reg ? 1 / 5.5 : 1 / 8;
    if (reg) len = 0.036;
    for (const s of [...STARS, { ...MOON, r: MOON.halo }]) {
      const dist = Math.hypot(x - s.c[0], y - s.c[1]);
      if (dist < s.r * 1.15) {
        ang = Math.atan2(y - s.c[1], x - s.c[0]) + Math.PI / 2;
        len = 0.022;
        birth = s.t + (s.span * dist) / (s.r * 1.15) + 0.15 * rand();
        break;
      }
    }
  } else if (reg === 4) {
    ang = Math.atan(hillSlope(x)) + (rand() < 0.6 ? 0.45 : -0.15) + (rand() - 0.5) * 0.3;
    len = 0.034;
  } else {
    len = 0.018;
    wid = 0.0068;
    ang = pick(rand, [0, 0, Math.PI / 2, Math.PI / 4, -Math.PI / 4]) + (rand() - 0.5) * 0.1;
  }
  len *= f;
  wid *= f;
  const d = [Math.cos(ang), Math.sin(ang)];
  return flat(x, y, ang, len, wid, paint(pals[reg], tone(reg, x, y), rand), birth, rand(), [d[0] * len * amp, d[1] * len * amp, rate * (0.8 + 0.4 * rand())]);
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
  rings(out, rand, { ...MOON, t: MOON.t + 0.4 }, [0.079, 0.097, 0.115], MOON_HALO, 0.007);
  for (const [x, y] of WINDOWS) {
    const birth = 3.2 + 1.4 * rand();
    for (let k = 0; k < 3; k++) {
      out.push(flat(x + (rand() - 0.5) * 0.006, y + (k - 1) * 0.003, (rand() - 0.5) * 0.15, 0.012, 0.0055, jitter(rand, pick(rand, WINDOW)), birth, rand()));
    }
  }
}

function pack(list) {
  const n = list.length;
  const b = {
    n, pos: new Float32Array(n * 3), dir: new Float32Array(n * 3), wax: new Float32Array(n * 3), col: new Float32Array(n * 3),
    drift: new Float32Array(n * 3), size: new Float32Array(n * 2), misc: new Float32Array(n * 4), from: new Float32Array(n * 4),
  };
  list.forEach((s, i) => {
    b.pos.set(s.p, i * 3); b.dir.set(s.d, i * 3); b.wax.set(s.w, i * 3); b.col.set(s.c, i * 3);
    if (s.drift) b.drift.set(s.drift, i * 3);
    b.size[i * 2] = s.len; b.size[i * 2 + 1] = s.wid;
    b.misc.set([s.birth, s.seed, s.kind ?? 0, s.rad ?? 0], i * 4);
    b.from.set(s.from ?? [0, 0, 0, -10], i * 4);
  });
  return b;
}

// Sky, hills and village over the visible window; denser tiers get smaller strokes.
export function background(pals, win, count, seed) {
  const rand = rng(seed);
  const out = [];
  const x0 = win.x0 - 0.03, x1 = win.x1 + 0.03, y0 = -0.02, y1 = 1.02;
  const n = Math.round((count * (x1 - x0) * (y1 - y0)) / PW);
  const f = Math.pow(20000 / count, 0.35);
  const cols = Math.max(1, Math.round(Math.sqrt((n * (x1 - x0)) / (y1 - y0))));
  const rows = Math.max(1, Math.round(n / cols));
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      out.push(groundStroke(pals, x0 + ((i + rand()) / cols) * (x1 - x0), y0 + ((j + rand()) / rows) * (y1 - y0), f, rand));
    }
  }
  out.sort((a, b) => a.birth - b.birth);
  sky(out, rand);
  return pack(out);
}

// Tree strokes appear scattered in a nebula around the axis (radius, angle, height), then spiral into place
// from the root up, starting at the 4th component (seconds).
const appear = (rand) => 1.0 + 2.6 * rand();
const nebula = (rand, y) => [0.18 + 0.5 * Math.sqrt(rand()), rand() * TAU, 0.3 + 0.55 * rand(), 4.2 + (3.4 * (y - TREE.base)) / TREE.height + 0.5 * rand()];
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
      birth: appear(rand), seed: rand(), from: nebula(rand, y),
    });
  }
  for (let i = 0; i < 9; i++) {
    const y = TREE.base + (0.12 + (0.66 * (i + rand())) / 9) * TREE.height;
    const phi = rand() * Math.PI * 2;
    const r = radiusAt(y) * lobe(phi, y) * 1.02;
    const radial = [Math.cos(phi), 0, Math.sin(phi)], tan = [-Math.sin(phi), 0, Math.cos(phi)];
    const c = [r * radial[0], y, r * radial[2]];
    const land = nebula(rand, y)[3];
    for (let k = 0; k < 9; k++) {
      const core = k < 2, a = (k / 7) * Math.PI * 2, rr = core ? 0.002 : 0.011;
      const e = [tan[0] * Math.cos(a), Math.sin(a), tan[2] * Math.cos(a)];
      const d = core ? norm([tan[0], 0.3 * (k - 0.5), tan[2]]) : norm([-tan[0] * Math.sin(a), Math.cos(a), -tan[2] * Math.sin(a)]);
      const from = nebula(rand, y);
      from[3] = land;
      out.push({
        p: c.map((v, j) => v + e[j] * rr + radial[j] * 0.003), d, w: norm(cross(d, radial)),
        c: jitter(rand, core ? hex('#e9c046') : pick(rand, k % 2 ? HALO[1] : HALO[3])),
        len: core ? 0.008 : 0.009, wid: 0.0055, birth: appear(rand), seed: rand(), from,
      });
    }
  }
  return pack(out);
}

// Light kinds: 0 decoy, 1 glyph, 2 garland, 3 treetop star, 4 star burst ring.
export function lights(seed) {
  const rand = rng(seed);
  const glyph = placeDabs(glyphDabs(rand), rand);
  const out = glyph.map((g) => ({
    p: g.pos, d: g.dir, w: g.wax, c: jitter(rand, pick(rand, GOLD)), len: g.len, wid: g.wid,
    birth: appear(rand), seed: rand(), kind: 1, rad: g.rad, from: nebula(rand, g.pos[1]),
  }));
  for (let i = 0; i < glyph.length * 1.5; i++) {
    const y = i < glyph.length ? randomHeight(rand, 0.17, 0.6) : randomHeight(rand, 0.05, 0.9);
    const rad = radiusAt(y), phi = rand() * Math.PI * 2, r = rad * Math.sqrt(rand()) * 0.95;
    const radial = [Math.cos(phi), 0, Math.sin(phi)], a = rand() * Math.PI * 2;
    const d = [-Math.sin(phi) * Math.cos(a), Math.sin(a), Math.cos(phi) * Math.cos(a)];
    const g = pick(rand, glyph);
    out.push({
      p: [r * radial[0], y, r * radial[2]], d, w: norm(cross(d, radial)), c: jitter(rand, pick(rand, GOLD)),
      len: g.len, wid: g.wid, birth: appear(rand), seed: rand(), kind: 0, rad, from: nebula(rand, y),
    });
  }
  const turns = 5, N = 480;
  for (let i = 0; i < N; i++) {
    const u = (i + rand() * 0.6) / N;
    const y = TREE.base + (0.03 + 0.85 * u) * TREE.height;
    const r = radiusAt(y) * 1.06 + 0.004, phi = u * turns * TAU;
    const radial = [Math.cos(phi), 0, Math.sin(phi)];
    const d = norm([-radial[2] * r * turns * TAU, 0.85 * TREE.height, radial[0] * r * turns * TAU]);
    out.push({
      p: [r * radial[0], y, r * radial[2]], d, w: norm(cross(d, radial)), c: jitter(rand, pick(rand, GARLAND)),
      len: 0.02, wid: 0.0065, birth: 9.8 + 1.6 * u, seed: rand(), kind: 2, rad: radiusAt(y), drift: [u, 0, 0],
    });
  }
  const top = [TREE.x, TOP + 0.012, TREE.z];
  [[0.004, 6, pal('#f3d36b', '#f0c24a')], [0.015, 10, pal('#f6f3e0', '#f1ecc8')], [0.026, 14, pal('#bcd6ee', '#a9c8e8')]].forEach(([rk, m, p], k) => {
    for (let i = 0; i < m; i++) {
      const a = ((i + rand() * 0.4) / m) * Math.PI * 2;
      const ang = k === 0 ? rand() * Math.PI * 2 : a + Math.PI / 2;
      const d = [Math.cos(ang), Math.sin(ang), 0];
      out.push({
        p: [top[0] + rk * Math.cos(a), top[1] + rk * Math.sin(a), top[2]], d, w: [-d[1], d[0], 0],
        c: jitter(rand, pick(rand, p)), len: k === 0 ? 0.008 : 0.011, wid: 0.006,
        birth: 9.4 + 0.25 * k + 0.1 * rand(), seed: rand(), kind: 3, rad: 1,
      });
    }
  });
  [HALO[1], HALO[3]].forEach((p, k) => {
    for (let i = 0; i < 26; i++) {
      const a = ((i + rand() * 0.4) / 26) * TAU;
      out.push({
        p: top, d: [-Math.sin(a), Math.cos(a), 0], w: [Math.cos(a), Math.sin(a), 0], c: jitter(rand, pick(rand, p)),
        len: 0.014, wid: 0.006, birth: 9, seed: rand(), kind: 4, rad: k,
      });
    }
  });
  return pack(out);
}

// Flakes in front of the tree: x is a screen-plane coordinate, z the depth; the shader animates the fall.
export function snow(win, count, seed) {
  const rand = rng(seed);
  const out = [];
  for (let i = 0; i < count; i++) {
    const ang = rand() * TAU, d = [Math.cos(ang), Math.sin(ang), 0];
    out.push({
      p: [win.x0 - 0.05 + rand() * (win.x1 - win.x0 + 0.1), 0, 0.45 + 0.85 * rand()], d, w: [-d[1], d[0], 0],
      c: jitter(rand, pick(rand, SNOW)).map((v) => v * 0.8), len: 0.005 + 0.003 * rand(), wid: 0.0042,
      birth: 10 + 2.5 * rand(), seed: rand(), drift: [1 / (14 + 10 * rand()), 0.006 + 0.012 * rand(), 0.4 + 0.6 * rand()],
    });
  }
  return pack(out);
}

export const UNDER = { x0: -0.7, x1: PW + 0.7 };

export function underpaint(pals) {
  const W = 200, H = 80;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(W, H);
  for (let j = 0; j < H; j++) {
    for (let i = 0; i < W; i++) {
      const x = UNDER.x0 + ((i + 0.5) / W) * (UNDER.x1 - UNDER.x0), y = 1 - (j + 0.5) / H;
      const reg = regionAt(x, y), { L, D } = cellAt(pals[reg], tone(reg, x, y));
      for (let ch = 0; ch < 3; ch++) img.data[(j * W + i) * 4 + ch] = 0.46 * 255 * (L[ch] + D[ch]);
      img.data[(j * W + i) * 4 + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}
