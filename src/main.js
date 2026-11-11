import * as THREE from 'three';
import { isMobileUA } from './env.js';
import { createStage } from './stage.js';
import { applyAtmosphere } from './atmosphere.js';
import { loadModels } from './assets.js';
import { buildDecor } from './decor.js';
import { buildLayout } from './logic/layout.js';
import { buildGround, buildCity, buildBoundary, buildFurnace, buildPlayer, buildMarker, MARKER_Y } from './world.js';
import { createControls } from './controls.js';
import { ORBIT, YARD, PLAYER, FURNACE, SEED } from './config.js';
import { applyDrag, applyZoom, orbitPosition } from './logic/orbit.js';
import { clampToYard, stepToward, pushOutOfCircle, headingY } from './logic/movement.js';

if (isMobileUA(navigator.userAgent)) {
  document.getElementById('mobile-notice').style.display = 'flex';
} else {
  const { scene, camera, renderer, onFrame } = createStage(document.getElementById('game'));
  const layout = buildLayout(SEED);
  const obstacles = [FURNACE, ...layout.obstacles];
  const loading = document.getElementById('loading');

  let models = new Map();
  try {
    const all = Object.values(layout).filter(Array.isArray).flat().filter((it) => it.pack);
    models = await loadModels(all);
  } catch (err) {
    console.warn('모델 로딩 중 오류. 도형 대체물을 사용합니다.', err);
  }
  applyAtmosphere(scene, renderer);
  const ground = buildGround(scene);
  buildCity(scene, layout);
  buildDecor(scene, layout, models);
  // 모델이 없으면 도형 대체물.
  if (!models.get('nature/campfire_stones')) buildFurnace(scene);
  const treeCount = [...models.keys()].filter((k) => k.startsWith('nature/tree_') && models.get(k)).length;
  if (treeCount < 5) buildBoundary(scene);
  loading.classList.add('hidden');
  setTimeout(() => { loading.style.display = 'none'; }, 500); // 페이드가 끝난 뒤 완전히 제거
  const player = buildPlayer(scene);
  const marker = buildMarker(scene);

  // 여러 장애물이 가까울 때도 자리 잡도록 몇 번 반복해서 밀어낸다.
  function pushOut(p) {
    for (let pass = 0; pass < 3; pass++) {
      for (const o of obstacles) p = pushOutOfCircle(p, PLAYER.radius, o);
    }
    return p;
  }

  let orbit = { azimuthDeg: ORBIT.azimuthDeg, polarDeg: ORBIT.polarDeg, distance: ORBIT.distance };
  const targetPos = new THREE.Vector3(player.position.x, ORBIT.targetHeight, player.position.z);
  const desired = new THREE.Vector3();
  let moveTarget = null;
  const raycaster = new THREE.Raycaster();

  createControls(renderer.domElement, {
    onDrag: (dx, dy) => { orbit = applyDrag(orbit, dx, dy, ORBIT.rotateSpeed, ORBIT); },
    onWheel: (deltaY) => { orbit = applyZoom(orbit, deltaY, ORBIT.zoomStep, ORBIT); },
    onClick: (ndc) => {
      raycaster.setFromCamera(new THREE.Vector2(ndc.x, ndc.y), camera);
      const hit = raycaster.intersectObject(ground)[0];
      if (!hit) return;
      let p = clampToYard({ x: hit.point.x, z: hit.point.z }, YARD, PLAYER.radius + 0.5);
      p = pushOut(p);
      moveTarget = p;
      marker.position.set(p.x, MARKER_Y, p.z);
      marker.visible = true;
    },
  });

  onFrame((dt) => {
    if (moveTarget) {
      const cur = { x: player.position.x, z: player.position.z };
      const next = stepToward(cur, moveTarget, PLAYER.speed, dt);
      if (Math.hypot(moveTarget.x - cur.x, moveTarget.z - cur.z) > 1e-3) {
        player.rotation.y = headingY(cur, moveTarget);
      }
      const pushed = pushOut(next);
      player.position.x = pushed.x;
      player.position.z = pushed.z;
      if (next.arrived) {
        moveTarget = null;
        marker.visible = false;
      }
    }

    const k = 1 - Math.exp(-ORBIT.followSpeed * dt);
    desired.set(player.position.x, ORBIT.targetHeight, player.position.z);
    targetPos.lerp(desired, k);
    camera.position.set(...orbitPosition(targetPos.toArray(), orbit));
    camera.lookAt(targetPos);
  });
}
