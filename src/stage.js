import * as THREE from 'three';
import { CAMERA, COLORS } from './config.js';
import { computeFov } from './logic/camera.js';

export function createStage(container) {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(COLORS.background);
  scene.add(new THREE.AmbientLight(0xffffff, 0.6));
  const sun = new THREE.DirectionalLight(0xffffff, 1.2);
  sun.position.set(6, 12, 4);
  scene.add(sun);

  const camera = new THREE.PerspectiveCamera(CAMERA.baseFov, 1, 0.1, 100);
  camera.position.set(...CAMERA.position);
  camera.lookAt(...CAMERA.lookAt);

  function resize() {
    const w = Math.max(container.clientWidth, 1);
    const h = Math.max(container.clientHeight, 1);
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.fov = computeFov(CAMERA.baseFov, camera.aspect, CAMERA.minAspect);
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
