import * as THREE from 'three';
import { ORBIT, COLORS, YARD } from './config.js';
import { computeFov } from './logic/camera.js';

export function createStage(container) {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(COLORS.sky);
  scene.fog = new THREE.Fog(COLORS.sky, 25, 60);
  scene.add(new THREE.AmbientLight(0xffffff, 0.6));
  const sun = new THREE.DirectionalLight(0xffffff, 1.2);
  sun.position.set(6, 12, 4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const half = Math.max(YARD.width, YARD.depth) / 2 + 2;
  Object.assign(sun.shadow.camera, { left: -half, right: half, top: half, bottom: -half, near: 1, far: 40 });
  sun.shadow.camera.updateProjectionMatrix();
  scene.add(sun);

  // 위치는 컨트롤러가 매 프레임 지정한다.
  const camera = new THREE.PerspectiveCamera(ORBIT.baseFov, 1, 0.1, 100);

  function resize() {
    const w = Math.max(container.clientWidth, 1);
    const h = Math.max(container.clientHeight, 1);
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.fov = computeFov(ORBIT.baseFov, camera.aspect, ORBIT.minAspect);
    camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(container);
  resize();

  const callbacks = [];
  const clock = new THREE.Clock();
  function loop() {
    requestAnimationFrame(loop);
    const dt = clock.getDelta();
    for (const fn of callbacks) fn(dt);
    renderer.render(scene, camera);
  }
  loop();

  return { renderer, scene, camera, onFrame: (fn) => callbacks.push(fn) };
}
