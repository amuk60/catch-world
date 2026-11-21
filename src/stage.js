import * as THREE from 'three';
import { ORBIT } from './config.js';
import { computeFov } from './logic/camera.js';

// opts(모바일 저사양 모드만 넘긴다, PC 는 기본값): { maxPixelRatio(기본 2), antialias(기본 true), shadows(기본 true) }
export function createStage(container, { maxPixelRatio = 2, antialias = true, shadows = true } = {}) {
  const renderer = new THREE.WebGLRenderer({ antialias });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, maxPixelRatio));
  renderer.shadowMap.enabled = shadows;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  // 배경·안개·조명은 atmosphere.js 가 설정한다.

  // 위치는 컨트롤러가 매 프레임 지정한다.
  const camera = new THREE.PerspectiveCamera(ORBIT.baseFov, 1, 0.1, 300);

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

  return { renderer, scene, camera, onFrame: (fn) => callbacks.push(fn), resize };
}
