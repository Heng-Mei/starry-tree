import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { PW, EYE, THETA } from './layout.js';
import { loadMap, palettes, background, tree, lights, snow, underpaint, UNDER } from './strokes.js';
import { makeLayer, makeUnderpaint, uniforms } from './brush.js';

const TIERS = [{ n: 20000, snow: 320, dpr: 2 }, { n: 9000, snow: 220, dpr: 1.5 }, { n: 5000, snow: 160, dpr: 1 }];
const FRICTION = 3; // inertia decay rate, 1/s; a free spin from yaw at vel stops at yaw + vel / FRICTION
const SNAP = 18, DETENT = 7, OMEGA = 6;
const DEG = Math.PI / 180;
// Hidden dev hooks: ?t=<seconds> skips the opening, ?yaw=<degrees> sets the start angle, ?tier=0|1|2.
const q = new URLSearchParams(location.search);
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const smoothstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const wrap = (a) => a - 2 * Math.PI * Math.round(a / (2 * Math.PI));

// The tree stands at the centre, so every aspect ratio is a window centred on it.
const viewWindow = (aspect) => ({ x0: PW / 2 - aspect / 2, x1: PW / 2 + aspect / 2 });

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

  const pals = palettes(await loadMap('assets/starry-map.png'));
  const under = makeUnderpaint(underpaint(pals), UNDER);
  const body = makeLayer(tree(6500, 11), { SPIN: '' }, { opaque: true });
  const glow = makeLayer(lights(13), { SPIN: '', LIGHTS: '', LT_LEN: '1.6', LT_WID: '2.6' }, { glow: true });
  body.renderOrder = 2;
  glow.renderOrder = 3;
  scene.add(under, body, glow);

  const composer = new EffectComposer(renderer);
  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.45, 0.4, 0.85);
  composer.addPass(new RenderPass(scene, camera));
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  let bg = null, flakes = null;
  const swap = (old, mesh) => {
    if (old) {
      scene.remove(old);
      old.geometry.dispose();
      old.material.dispose();
    }
    scene.add(mesh);
    return mesh;
  };
  function layout() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    renderer.setPixelRatio(Math.min(devicePixelRatio, TIERS[tier].dpr));
    renderer.setSize(w, h, false);
    composer.setPixelRatio(renderer.getPixelRatio());
    composer.setSize(w, h);
    const win = viewWindow(w / h);
    const k = 0.05 / EYE[2];
    camera.projectionMatrix.makePerspective((win.x0 - EYE[0]) * k, (win.x1 - EYE[0]) * k, (1 - EYE[1]) * k, -EYE[1] * k, 0.05, 10);
    camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
    under.position.set((win.x0 + win.x1) / 2, 0.5, -0.001);
    under.scale.set(win.x1 - win.x0 + 0.1, 1.1, 1);
    bg = swap(bg, makeLayer(background(pals, win, TIERS[tier].n, 7), { DRIFT: '' }));
    bg.renderOrder = 1;
    flakes = swap(flakes, makeLayer(snow(win, TIERS[tier].snow, 5), { SNOW: '' }));
    flakes.renderOrder = 4;
  }
  layout();
  let resizeTimer = 0;
  new ResizeObserver(() => { clearTimeout(resizeTimer); resizeTimer = setTimeout(layout, 150); }).observe(canvas);

  let yaw = q.has('yaw') ? +q.get('yaw') * DEG : 0, vel = 0, drag = null, target = null;
  canvas.addEventListener('pointerdown', (e) => {
    if (drag) return;
    canvas.setPointerCapture(e.pointerId);
    drag = { id: e.pointerId, x: e.clientX, t: e.timeStamp };
    vel = 0;
    target = null;
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    // a light detent: dragging gets heavier near the hidden angle
    const k = (5 / canvas.clientWidth) * (1 - 0.4 * Math.exp(-((wrap(THETA - yaw) / (DETENT * DEG)) ** 2)));
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
    // momentum projection (WWDC18 "Designing Fluid Interfaces"): snap if the throw would land near the hidden angle
    const rest = yaw + vel / FRICTION;
    if (Math.abs(wrap(THETA - rest)) < SNAP * DEG) target = rest + wrap(THETA - rest);
  };
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', release);

  const t0 = performance.now();
  const skip = q.has('t') ? +q.get('t') : reduced ? 30 : 0;
  let last = t0, fpsT = 0, fpsN = 0, scatter = 0, burstReady = true;
  function frame(now) {
    const dt = Math.min((now - last) / 1000, 0.1);
    last = now;
    const t = (now - t0) / 1000 + skip;
    if (target !== null) {
      // critically damped spring, starting from the release velocity
      vel += (OMEGA * OMEGA * (target - yaw) - 2 * OMEGA * vel) * dt;
      yaw += vel * dt;
    } else if (!drag) {
      yaw += vel * dt;
      vel *= Math.exp(-FRICTION * dt);
    }
    scatter += (Math.min(Math.abs(vel) / 6, 1) - scatter) * (1 - Math.exp(-6 * dt));
    uniforms.uTime.value = t;
    uniforms.uYaw.value = yaw;
    const align = 1 - smoothstep(3 * DEG, 15 * DEG, Math.abs(wrap(THETA - yaw)));
    uniforms.uAlign.value = align;
    uniforms.uScatter.value = scatter;
    if (align > 0.9 && burstReady && t > 12 && t - uniforms.uBurst.value > 5) {
      uniforms.uBurst.value = t;
      burstReady = false;
    }
    if (align < 0.3) burstReady = true;
    uniforms.uDrift.value = smoothstep(9, 12, t) * (reduced ? 0.3 : 1);
    under.material.uniforms.uPrime.value = smoothstep(0.3, 4, t);
    composer.render(dt);
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
