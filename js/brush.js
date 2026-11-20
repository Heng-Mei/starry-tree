import * as THREE from 'three';
import { TREE } from './layout.js';

export const uniforms = {
  uTime: { value: 0 },
  uYaw: { value: 0 },
  uAlign: { value: 0 },
  uDrift: { value: 0 },
  uScatter: { value: 0 },
  uBurst: { value: 9.5 },
  uTree: { value: new THREE.Vector3(TREE.x, 0, TREE.z) },
};

const vertexShader = /* glsl */ `
uniform float uTime, uYaw, uAlign, uDrift, uScatter, uBurst;
uniform vec3 uTree;
attribute vec3 iPos, iDir, iWax, iCol, iDrift;
attribute vec2 iSize;
attribute vec4 iMisc; // birth, seed, kind (lights: 0 decoy, 1 glyph, 2 garland, 3 treetop star, 4 burst ring), radius at height
attribute vec4 iFrom; // nebula radius, angle, height, landing time; landing time < -5 means no nebula
varying vec2 vUv, vL;
varying vec3 vCol;
varying float vA, vSeed, vWet, vGlow;

// Must match rotY() in layout.js.
vec3 rotY(vec3 p, float a) {
  float c = cos(a), s = sin(a);
  return vec3(c * p.x + s * p.z, p.y, -s * p.x + c * p.z);
}

void main() {
  float age = uTime - iMisc.x;
  if (age < 0.0) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
  float g = clamp(age / 0.45, 0.0, 1.0);
  g = g * g * (3.0 - 2.0 * g);
  vec3 p = iPos, d = iDir, w = iWax, col = iCol;
  vec2 size = iSize;
  float a = 1.0, glow = 0.0;
#ifdef DRIFT
  if (iDrift.z > 0.0) {
    float ph = fract(uTime * iDrift.z + iMisc.y);
    p.xy += iDrift.xy * (ph - 0.5) * uDrift;
    a = mix(1.0, smoothstep(0.0, 0.18, ph) * smoothstep(1.0, 0.82, ph), uDrift);
  }
#endif
#ifdef SNOW
  float fall = fract(uTime * iDrift.x + iMisc.y);
  float k = (cameraPosition.z - p.z) / cameraPosition.z;
  vec2 sp = vec2(p.x + iDrift.y * sin(uTime * iDrift.z + iMisc.y * 40.0), 1.1 - 1.2 * fall);
  p.xy = cameraPosition.xy + (sp - cameraPosition.xy) * k;
  a = 0.7 * smoothstep(0.0, 0.04, fall) * smoothstep(1.0, 0.96, fall);
#endif
#ifdef SPIN
  float kind = iMisc.z, m = 1.0;
  if (kind < 2.5) {
    if (iFrom.w > -5.0) {
      // spiral in from the nebula: radius and height blend, the angle unwinds one to two turns
      m = smoothstep(iFrom.w - 1.8, iFrom.w, uTime);
      float phiT = atan(p.z, p.x);
      float dphi = (1.0 - m) * (mod(iFrom.y + 0.35 * uTime - phiT, 6.2831853) + 6.2831853);
      float r = mix(iFrom.x, length(p.xz), m), ph = phiT + dphi;
      p = vec3(r * cos(ph), mix(iFrom.z, p.y, m), r * sin(ph));
      d = rotY(d, -dphi); w = rotY(w, -dphi);
      size *= mix(0.6, 1.0, m);
    }
    vec3 radial = normalize(vec3(p.x, 0.0, p.z) + vec3(1e-5, 0.0, 0.0));
    float sc = uScatter * m;
    p += radial * sc * (0.03 + 0.1 * fract(iMisc.y * 7.31)) + vec3(0.0, sc * 0.03 * (fract(iMisc.y * 13.7) - 0.5), 0.0);
    p = rotY(p, uYaw); d = rotY(d, uYaw); w = rotY(w, uYaw); radial = rotY(radial, uYaw);
  #ifdef LIGHTS
    a *= mix(1.0, smoothstep(-0.7, 0.05, p.z / max(iMisc.w, 1e-3)), m);
  #else
    col *= 0.5 + 0.65 * max(dot(radial, normalize(vec3(-0.55, 0.35, 0.75))), 0.0);
    col *= 1.0 - 0.2 * uAlign;
  #endif
    p += uTree;
  }
#endif
#ifdef LIGHTS
  if (kind > 3.5) {
    float e = (uTime - uBurst - 0.22 * iMisc.w) / 1.8;
    p += w * (0.03 + 0.3 * clamp(e, 0.0, 1.0));
    a *= step(0.0, e) * step(e, 1.0) * pow(1.0 - clamp(e, 0.0, 1.0), 1.5) * smoothstep(0.0, 0.06, e);
    glow = 0.6;
    col *= 1.3;
  } else if (kind > 2.5) glow = 0.9 + 0.1 * sin(uTime * 1.7);
  else if (kind > 1.5) {
    float pd = (fract(uTime / 7.0) * 1.3 - 0.15 - iDrift.x) / 0.05;
    float pulse = exp(-pd * pd);
    col *= (0.55 + 1.0 * pulse) * (1.0 - 0.65 * uAlign);
    glow = 0.1 + 0.5 * pulse;
  }
  else if (kind > 0.5) { glow = 0.15 + 0.35 * uAlign; col *= 0.7 + 0.6 * uAlign; }
  else { glow = 0.15; col *= 0.7; a *= 1.0 - 0.6 * uAlign; }
  size *= vec2(LT_LEN, LT_WID);
#endif
  float along = (-1.0 + (position.x + 1.0) * g) * 0.5 * size.x;
  vec3 wp = p + d * along + w * position.y * 0.5 * size.y;
  mat4 pv = projectionMatrix * viewMatrix;
  vec4 c0 = pv * vec4(p, 1.0), cd = pv * vec4(p + d * 0.01, 1.0), cw = pv * vec4(p + w * 0.01, 1.0);
  vec2 s0 = c0.xy / c0.w;
  vec2 sd = normalize(cd.xy / cd.w - s0 + 1e-6), sw = normalize(cw.xy / cw.w - s0 + 1e-6);
  vec2 L = vec2(-0.6, 0.8);
  vL = vec2(dot(L, sd), dot(L, sw));
  vUv = position.xy;
  vCol = col;
  vA = a;
  vSeed = iMisc.y;
  vWet = exp(-age / 1.2);
  vGlow = glow;
  gl_Position = pv * vec4(wp, 1.0);
}
`;

const fragmentShader = /* glsl */ `
varying vec2 vUv, vL;
varying vec3 vCol;
varying float vA, vSeed, vWet, vGlow;

float hash(float n) { return fract(sin(n) * 43758.5453); }
float vnoise(float x) { float i = floor(x), f = fract(x); return mix(hash(i), hash(i + 1.0), f * f * (3.0 - 2.0 * f)); }
float paintH(vec2 q) {
  float bristle = sin((q.y * 6.0 + vnoise(q.x * 2.5 + vSeed * 17.0) * 1.6) * 3.14159);
  return (1.0 - q.y * q.y) * 0.8 + bristle * 0.14;
}

void main() {
  vec2 q = vUv;
#ifdef LIGHTS
  q *= vec2(LT_LEN, LT_WID);
#endif
  // round loaded head at q.x = -1, tapering lift-off towards q.x = 1
  float halfW = mix(0.45, 1.0, smoothstep(-1.0, -0.55, q.x)) * (1.0 - 0.7 * smoothstep(0.1, 1.0, q.x));
  float m = halfW * (1.0 - 0.18 * vnoise(q.x * 6.0 + vSeed * 31.0)) - abs(q.y);
#ifdef LIGHTS
  float alpha = smoothstep(-0.05, 0.35, m) * smoothstep(-1.0, -0.75, q.x) * smoothstep(1.0, 0.7, q.x);
#else
  float alpha = smoothstep(0.0, 0.07, m) * smoothstep(-1.0, -0.9, q.x) * smoothstep(1.0, 0.88, q.x);
#endif
  float lane = floor((q.y + 1.0) * 5.0);
  alpha *= 1.0 - 0.9 * smoothstep(0.3, 1.0, q.x) * step(0.5, hash(lane * 7.13 + vSeed * 3.1));
  float e = 0.04;
  float hu = (paintH(q + vec2(e, 0.0)) - paintH(q - vec2(e, 0.0))) / (2.0 * e);
  float hv = (paintH(q + vec2(0.0, e)) - paintH(q - vec2(0.0, e))) / (2.0 * e);
  vec3 n = normalize(vec3(-hu * 0.25, -hv * 0.25, 1.0));
  vec3 l = normalize(vec3(vL * 0.75, 0.66));
  float spec = pow(max(reflect(-l, n).z, 0.0), 14.0) * (0.1 + 0.35 * vWet);
  vec3 col = vCol * (0.8 + 0.3 * dot(n, l)) + spec;
#ifdef OPAQUE
  if (alpha * vA < 0.5) discard;
  gl_FragColor = vec4(col, 1.0);
#elif defined(LIGHTS)
  float ga = vGlow * 0.4 * exp(-3.0 * dot(vUv, vUv)) * (1.0 - smoothstep(0.6, 1.0, max(abs(vUv.x), abs(vUv.y))));
  float ca = alpha * vA;
  gl_FragColor = vec4(col * ca + vec3(1.0, 0.78, 0.38) * ga * vA, ca);
#else
  gl_FragColor = vec4(col, alpha * vA);
#endif
}
`;

export function makeLayer(b, defines, { opaque = false, glow = false } = {}) {
  const geo = new THREE.InstancedBufferGeometry();
  const quad = new THREE.PlaneGeometry(2, 2);
  geo.index = quad.index;
  geo.setAttribute('position', quad.getAttribute('position'));
  const add = (name, arr, k) => geo.setAttribute(name, new THREE.InstancedBufferAttribute(arr, k));
  add('iPos', b.pos, 3); add('iDir', b.dir, 3); add('iWax', b.wax, 3); add('iCol', b.col, 3);
  add('iDrift', b.drift, 3); add('iSize', b.size, 2); add('iMisc', b.misc, 4); add('iFrom', b.from, 4);
  geo.instanceCount = b.n;
  const mat = new THREE.ShaderMaterial({
    uniforms, vertexShader, fragmentShader,
    defines: { ...defines, ...(opaque ? { OPAQUE: '' } : {}) },
    // all layers go through the transparent list so renderOrder alone sets paint order
    transparent: true, depthTest: opaque, depthWrite: opaque, side: THREE.DoubleSide,
  });
  if (glow) {
    mat.blending = THREE.CustomBlending;
    mat.blendSrc = THREE.OneFactor;
    mat.blendDst = THREE.OneMinusSrcAlphaFactor;
  }
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  return mesh;
}

export function makeUnderpaint(canvas, span) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.minFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTex: { value: tex }, uPrime: { value: 0 }, uX: { value: new THREE.Vector2(span.x0, span.x1 - span.x0) } },
    vertexShader: /* glsl */ `
      varying vec2 vP;
      void main() {
        vec4 w = modelMatrix * vec4(position, 1.0);
        vP = w.xy;
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D uTex;
      uniform float uPrime;
      uniform vec2 uX;
      varying vec2 vP;
      float h(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      void main() {
        vec3 c = texture2D(uTex, vec2((vP.x - uX.x) / uX.y, clamp(vP.y, 0.0, 1.0))).rgb;
        float weave = sin(vP.x * 1400.0) * sin(vP.y * 1400.0) * 0.02 + (h(floor(vP * 900.0)) - 0.5) * 0.03;
        gl_FragColor = vec4(mix(vec3(0.80, 0.74, 0.60), c, uPrime) + weave, 1.0);
      }`,
    depthTest: false,
    depthWrite: false,
  });
  return new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
}
