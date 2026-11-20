import * as THREE from 'three';
import { PW, EYE, TREE, THETA } from './layout.js';
import { loadMap, background, tree, lights, underpaint } from './strokes.js';
import { makeLayer, makeUnderpaint, uniforms } from './brush.js';

const TIERS = [{ n: 20000, dpr: 2 }, { n: 9000, dpr: 1.5 }, { n: 5000, dpr: 1 }];
const DEG = Math.PI / 180;
// Hidden dev hooks: ?t=<seconds> skips the opening, ?yaw=<degrees> sets the start angle, ?tier=0|1|2.
const q = new URLSearchParams(location.search);
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const smoothstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const wrap = (a) => a - 2 * Math.PI * Math.round(a / (2 * Math.PI));

function viewWindow(aspect) {
  if (aspect >= PW) return { x0: PW / 2 - aspect / 2, x1: PW / 2 + aspect / 2 };
  const treeX = EYE[0] + ((TREE.x - EYE[0]) * EYE[2]) / (EYE[2] - TREE.z);
  const x0 = Math.min(Math.max(treeX - 0.4 * aspect, 0), PW - aspect);
  return { x0, x1: x0 + aspect };
}

async function main() {
  if (!document.createElement('canvas').getContext('webgl2')) {
    document.body.innerHTML = '<p style="color:#cbd5e1;font:16px/1.6 system-ui;padding:2em">这个页面需要支持 WebGL2 的浏览器。</p>';
    return;
  }
  const canvas = document.querySelector('canvas');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
  renderer.setClearColor(0x0d1426);
  let tier = q.has('tier') ? +q.get('tier') : matchMedia('(pointer: coarse)').matches ? 1 : 0;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera();
  camera.position.set(...EYE);

  const map = await loadMap('assets/starry-map.png');
  const under = makeUnderpaint(underpaint(map));
  const body = makeLayer(tree(6500, 11), { SPIN: '' }, { opaque: true });
  const glow = makeLayer(lights(13), { SPIN: '', LIGHTS: '', LT_LEN: '1.6', LT_WID: '2.6' }, { glow: true });
  body.renderOrder = 2;
  glow.renderOrder = 3;
  scene.add(under, body, glow);

  let bg = null;
  function layout() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    renderer.setPixelRatio(Math.min(devicePixelRatio, TIERS[tier].dpr));
    renderer.setSize(w, h, false);
    const win = viewWindow(w / h);
    const k = 0.05 / EYE[2];
    camera.projectionMatrix.makePerspective((win.x0 - EYE[0]) * k, (win.x1 - EYE[0]) * k, (1 - EYE[1]) * k, -EYE[1] * k, 0.05, 10);
    camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
    under.position.set((win.x0 + win.x1) / 2, 0.5, -0.001);
    under.scale.set(win.x1 - win.x0 + 0.1, 1.1, 1);
    if (bg) {
      scene.remove(bg);
      bg.geometry.dispose();
      bg.material.dispose();
    }
    bg = makeLayer(background(map, win, TIERS[tier].n, 7), { DRIFT: '' });
    bg.renderOrder = 1;
    scene.add(bg);
  }
  layout();
  let resizeTimer = 0;
  new ResizeObserver(() => { clearTimeout(resizeTimer); resizeTimer = setTimeout(layout, 150); }).observe(canvas);

  let yaw = q.has('yaw') ? +q.get('yaw') * DEG : 0, vel = 0, drag = null;
  canvas.addEventListener('pointerdown', (e) => {
    if (drag) return;
    canvas.setPointerCapture(e.pointerId);
    drag = { id: e.pointerId, x: e.clientX, t: e.timeStamp };
    vel = 0;
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const k = 5 / canvas.clientWidth;
    const dx = e.clientX - drag.x, dt = Math.max((e.timeStamp - drag.t) / 1000, 1 / 240);
    yaw += dx * k;
    vel = 0.6 * vel + 0.4 * ((dx * k) / dt);
    drag.x = e.clientX;
    drag.t = e.timeStamp;
  });
  const release = (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    if (e.timeStamp - drag.t > 80) vel = 0;
    drag = null;
  };
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', release);

  const t0 = performance.now();
  const skip = q.has('t') ? +q.get('t') : reduced ? 30 : 0;
  let last = t0, fpsT = 0, fpsN = 0;
  function frame(now) {
    const dt = Math.min((now - last) / 1000, 0.1);
    last = now;
    const t = (now - t0) / 1000 + skip;
    if (!drag) {
      yaw += vel * dt;
      vel *= Math.exp(-3 * dt);
      const diff = wrap(THETA - yaw);
      if (Math.abs(vel) < 0.3 && Math.abs(diff) < 8 * DEG) {
        vel = 0;
        yaw += diff * (1 - Math.exp(-7 * dt));
      }
    }
    uniforms.uTime.value = t;
    uniforms.uYaw.value = yaw;
    uniforms.uAlign.value = 1 - smoothstep(3 * DEG, 15 * DEG, Math.abs(wrap(THETA - yaw)));
    uniforms.uDrift.value = smoothstep(9, 12, t) * (reduced ? 0.3 : 1);
    under.material.uniforms.uPrime.value = smoothstep(0.3, 4, t);
    renderer.render(scene, camera);
    if (now - t0 > 2000) {
      fpsT += dt;
      fpsN++;
      if (fpsT >= 2) {
        if (fpsN / fpsT < 40 && tier < TIERS.length - 1) {
          tier++;
          layout();
        }
        fpsT = fpsN = 0;
      }
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  window.__starry = { uniforms, get yaw() { return yaw; }, set yaw(v) { yaw = v; vel = 0; }, get tier() { return tier; } };
}

main();
