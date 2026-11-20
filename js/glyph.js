import { TREE, EYE, THETA, radiusAt, rotY, toWorld, projectToTreePlane } from './layout.js';

// Running-script 了凡, hand-authored. Each segment: cubic Bézier x0,y0..x3,y3 in a unit box (y down),
// then brush width at t = 0, 0.5, 1 in box units.
export const CHARS = [
  {
    cy: 0.43,
    paths: [
      [
        [0.20, 0.17, 0.38, 0.11, 0.62, 0.08, 0.77, 0.12, 0.055, 0.06, 0.07],
        [0.77, 0.12, 0.83, 0.14, 0.66, 0.28, 0.50, 0.37, 0.075, 0.055, 0.03],
        [0.50, 0.37, 0.46, 0.40, 0.52, 0.42, 0.55, 0.46, 0.02, 0.012, 0.045],
        [0.55, 0.46, 0.58, 0.60, 0.58, 0.78, 0.53, 0.90, 0.07, 0.075, 0.07],
        [0.53, 0.90, 0.48, 0.95, 0.40, 0.92, 0.33, 0.84, 0.07, 0.045, 0.012],
      ],
    ],
  },
  {
    cy: 0.235,
    paths: [
      [
        [0.37, 0.10, 0.37, 0.25, 0.36, 0.42, 0.33, 0.56, 0.065, 0.06, 0.055],
        [0.33, 0.56, 0.30, 0.70, 0.22, 0.82, 0.11, 0.92, 0.055, 0.035, 0.01],
      ],
      [
        [0.38, 0.18, 0.50, 0.15, 0.62, 0.13, 0.72, 0.13, 0.035, 0.05, 0.06],
        [0.72, 0.13, 0.79, 0.15, 0.73, 0.40, 0.74, 0.62, 0.07, 0.065, 0.06],
        [0.74, 0.62, 0.76, 0.78, 0.84, 0.88, 0.93, 0.88, 0.06, 0.055, 0.05],
        [0.93, 0.88, 0.97, 0.88, 0.97, 0.76, 0.95, 0.68, 0.05, 0.03, 0.008],
      ],
      [[0.47, 0.40, 0.52, 0.42, 0.56, 0.47, 0.58, 0.53, 0.03, 0.075, 0.05]],
    ],
  },
];

const S = 0.17; // char box size on the tree-axis plane, painting units
const WSCALE = 1.35;
const STEP = 0.05;
const DAB = 0.085;

function bez(p, t) {
  const u = 1 - t, a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, d = t * t * t;
  return [a * p[0] + b * p[2] + c * p[4] + d * p[6], a * p[1] + b * p[3] + c * p[5] + d * p[7]];
}

// Dense polyline per path, box coordinates: { x, y, w }.
export function skeleton() {
  return CHARS.map((ch) =>
    ch.paths.map((path) => {
      const pts = [];
      for (const seg of path) {
        for (let i = 0; i < 24; i++) {
          const t = i / 24;
          const [x, y] = bez(seg, t);
          const w = seg[8] * (1 - t) * (1 - 2 * t) + seg[9] * 4 * t * (1 - t) + seg[10] * t * (2 * t - 1);
          pts.push({ x, y, w });
        }
      }
      const last = path.at(-1);
      pts.push({ x: last[6], y: last[7], w: last[10] });
      return pts;
    }),
  );
}

// Short oil dabs along the skeleton, as seen on the tree-axis plane (y up).
export function glyphDabs(rand) {
  const out = [];
  skeleton().forEach((paths, ci) => {
    for (const pts of paths) {
      const acc = [0];
      for (let i = 1; i < pts.length; i++) acc.push(acc[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
      const L = acc.at(-1);
      const n = Math.max(2, Math.round(L / STEP));
      let i = 0;
      for (let k = 0; k < n; k++) {
        const s = ((k + 0.5) * L) / n;
        while (acc[i + 1] < s) i++;
        const f = (s - acc[i]) / (acc[i + 1] - acc[i]);
        const a = pts[i], b = pts[i + 1];
        const x = a.x + (b.x - a.x) * f, y = a.y + (b.y - a.y) * f;
        const w = (a.w + (b.w - a.w) * f) * WSCALE;
        const ang = Math.atan2(-(b.y - a.y), b.x - a.x) + (rand() - 0.5) * 0.12;
        const t = [Math.cos(ang), Math.sin(ang)];
        const nrm = [-t[1], t[0]];
        const lanes = w > 0.07 ? 2 : 1;
        for (let l = 0; l < lanes; l++) {
          const off = lanes === 2 ? (l - 0.5) * 0.5 * w : 0;
          const jx = (rand() - 0.5) * 0.008, jy = (rand() - 0.5) * 0.008;
          out.push({
            q: [TREE.x + (x - 0.5 + nrm[0] * off + jx) * S, CHARS[ci].cy - (y - 0.5) * S + (nrm[1] * off + jy) * S],
            t,
            len: DAB * S * (0.9 + 0.2 * rand()),
            wid: (lanes === 2 ? 0.62 * w : w) * S,
          });
        }
      }
    }
  });
  return out;
}

// Anamorphosis: push each dab along its eye ray to a random depth in the front half of the tree,
// scale it so its screen size is unchanged, then store it in tree-local coordinates at yaw = THETA.
export function placeDabs(dabs, rand) {
  const D = EYE[2] - TREE.z;
  const ox = EYE[0] - TREE.x, oz = EYE[2] - TREE.z;
  return dabs.map((d) => {
    const dir = [d.q[0] - EYE[0], d.q[1] - EYE[1], TREE.z - EYE[2]];
    const r = radiusAt(d.q[1]) * 0.96;
    const a = dir[0] ** 2 + dir[2] ** 2, b = 2 * (ox * dir[0] + oz * dir[2]), c = ox * ox + oz * oz - r * r;
    const disc = b * b - 4 * a * c;
    const tFront = disc > 0 && Math.abs(d.q[0] - TREE.x) < r ? (-b - Math.sqrt(disc)) / (2 * a) : 1;
    const t = tFront + (1 - tFront) * rand();
    const w = [EYE[0] + t * dir[0], EYE[1] + t * dir[1], EYE[2] + t * dir[2]];
    const k = (EYE[2] - w[2]) / D;
    return {
      pos: rotY([w[0] - TREE.x, w[1], w[2] - TREE.z], -THETA),
      dir: rotY([d.t[0], d.t[1], 0], -THETA),
      wax: rotY([-d.t[1], d.t[0], 0], -THETA),
      len: d.len * k,
      wid: d.wid * k,
      rad: radiusAt(w[1]),
      q: d.q,
    };
  });
}

export function projectLocal(pos, yaw) {
  return projectToTreePlane(toWorld(pos, yaw));
}
