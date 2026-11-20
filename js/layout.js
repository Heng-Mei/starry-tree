// Painting coordinates: x right, y up, the canvas is [0, PW] x [0, 1] on the plane z = 0.
export const PW = 1280 / 1013;
export const EYE = [PW / 2, 0.5, 2.4];
export const TREE = { x: 0.34, z: 0.25, base: -0.03, height: 0.93, r0: 0.15 };
export const THETA = (140 * Math.PI) / 180;

export function radiusAt(y) {
  const h = (y - TREE.base) / TREE.height;
  return h <= 0 ? TREE.r0 : h >= 1 ? 0 : TREE.r0 * (1 - h) ** 0.8;
}

// Must match rotY() in brush.js.
export function rotY([x, y, z], a) {
  const c = Math.cos(a), s = Math.sin(a);
  return [c * x + s * z, y, -s * x + c * z];
}

export function toWorld(p, yaw) {
  const r = rotY(p, yaw);
  return [r[0] + TREE.x, r[1], r[2] + TREE.z];
}

// Central projection from EYE onto the plane through the tree axis, z = TREE.z.
export function projectToTreePlane([x, y, z]) {
  const k = (EYE[2] - TREE.z) / (EYE[2] - z);
  return [EYE[0] + (x - EYE[0]) * k, EYE[1] + (y - EYE[1]) * k];
}

export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
