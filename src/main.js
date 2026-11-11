import * as THREE from 'three';
import { isMobileUA } from './env.js';
import { createStage } from './stage.js';
import { applyAtmosphere } from './atmosphere.js';
import { loadModels, loadGltf } from './assets.js';
import { buildDecor } from './decor.js';
import { buildLayout } from './logic/layout.js';
import { buildGround, buildCity, buildBoundary, buildFurnace, buildPlayer, buildSign, buildMarker, buildPickables, MARKER_Y } from './world.js';
import { createPlayer } from './player.js';
import { createHud } from './hud.js';
import { interactTarget, resolveArrival, hoverLabel } from './logic/interaction.js';
import { createControls } from './controls.js';
import { ORBIT, YARD, PLAYER, PLAYER_MODEL, FURNACE, SPAWN, SEED, COMFORT_MESSAGES } from './config.js';
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
  let characterGltf = null;
  try {
    const all = [...Object.values(layout).filter(Array.isArray).flat(), ...layout.interactables.map((i) => i.item)].filter((it) => it?.pack);
    [models, characterGltf] = await Promise.all([loadModels(all), loadGltf('characters', PLAYER_MODEL.name)]);
  } catch (err) {
    console.warn('모델 로딩 중 오류. 도형 대체물을 사용합니다.', err);
  }
  applyAtmosphere(scene, renderer);
  const ground = buildGround(scene);
  buildCity(scene, layout);
  const { updateTreeOcclusion } = buildDecor(scene, layout, models);
  buildSign(scene, layout.sign);
  // 모델이 없으면 도형 대체물.
  if (!models.get('nature/campfire_stones')) buildFurnace(scene);
  const treeCount = [...models.keys()].filter((k) => k.startsWith('nature/tree_') && models.get(k)).length;
  if (treeCount < 5) buildBoundary(scene);
  loading.classList.add('hidden');
  setTimeout(() => { loading.style.display = 'none'; }, 500); // 페이드가 끝난 뒤 완전히 제거
  // 캐릭터 모델이 없으면 상자 플레이어. 이동/회전은 항상 group 이 맡는다.
  let character = null;
  let player;
  if (characterGltf) {
    character = createPlayer(characterGltf);
    player = character.group;
    player.position.set(SPAWN.x, 0, SPAWN.z);
    scene.add(player);
  } else {
    player = buildPlayer(scene);
  }
  const marker = buildMarker(scene);
  const pickables = buildPickables(scene, layout.interactables);
  const hud = createHud(document.getElementById('game'));

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
  let pendingId = null; // 도착하면 실행할 상호작용 대상 id
  const raycaster = new THREE.Raycaster();
  const bubblePoint = new THREE.Vector3();

  // 장애물 밖으로 밀어낸 목표 지점으로 이동을 시작한다.
  function walkTo(point) {
    const p = pushOut(clampToYard(point, YARD, PLAYER.radius + 0.5));
    moveTarget = p;
    marker.position.set(p.x, MARKER_Y, p.z);
    marker.visible = true;
  }

  // 화면 좌표(ndc)에 보이는 상호작용 대상(없으면 null).
  function pickInteractable(ndc) {
    raycaster.setFromCamera(new THREE.Vector2(ndc.x, ndc.y), camera);
    const hit = raycaster.intersectObjects(pickables, false)[0];
    return hit ? layout.interactables.find((i) => i.id === hit.object.userData.interactId) : null;
  }

  createControls(renderer.domElement, {
    onDrag: (dx, dy) => {
      orbit = applyDrag(orbit, dx, dy, ORBIT.rotateSpeed, ORBIT);
      renderer.domElement.style.cursor = '';
      hud.hideTooltip();
    },
    onWheel: (deltaY) => { orbit = applyZoom(orbit, deltaY, ORBIT.zoomStep, ORBIT); },
    onClick: (ndc) => {
      const item = pickInteractable(ndc);
      if (item) {
        pendingId = item.id;
        walkTo(interactTarget(item));
        return;
      }
      raycaster.setFromCamera(new THREE.Vector2(ndc.x, ndc.y), camera);
      const hit = raycaster.intersectObject(ground)[0];
      if (!hit) return;
      pendingId = null;
      walkTo({ x: hit.point.x, z: hit.point.z });
    },
    onHover: (ndc, clientX, clientY) => {
      const item = ndc && pickInteractable(ndc);
      if (item) {
        renderer.domElement.style.cursor = 'pointer';
        hud.showTooltip(hoverLabel(item), clientX, clientY);
      } else {
        renderer.domElement.style.cursor = '';
        hud.hideTooltip();
      }
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
        const item = resolveArrival({ pendingId, arrived: true, playerPos: player.position, items: layout.interactables });
        pendingId = null;
        if (item?.kind === 'comfort') hud.showBubble(COMFORT_MESSAGES[item.messageIndex]);
        // 소각로: 단계 5에서 미니게임 시작을 연결
      }
    }
    if (hud.isBubbleVisible()) {
      // 플레이어 발 위 1.9 지점을 화면 좌표로.
      const w = renderer.domElement.clientWidth;
      const h = renderer.domElement.clientHeight;
      bubblePoint.set(player.position.x, 1.9, player.position.z).project(camera);
      hud.positionBubble((bubblePoint.x * 0.5 + 0.5) * w, (-bubblePoint.y * 0.5 + 0.5) * h);
    }
    character?.setMoving(moveTarget !== null);
    character?.update(dt);

    const k = 1 - Math.exp(-ORBIT.followSpeed * dt);
    desired.set(player.position.x, ORBIT.targetHeight, player.position.z);
    targetPos.lerp(desired, k);
    camera.position.set(...orbitPosition(targetPos.toArray(), orbit));
    camera.lookAt(targetPos);
    updateTreeOcclusion(camera.position, targetPos, dt);
  });
}
