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
import { interactTarget, hoverLabel, nearestInRange, actionOf } from './logic/interaction.js';
import { nextMode, showPrompt as promptAllowed } from './logic/playerMode.js';
import { pickFortune } from './logic/fortune.js';
import { createControls } from './controls.js';
import { createBurnGame } from './burnGame.js';
import { ORBIT, YARD, PLAYER, PLAYER_MODEL, FURNACE, SPAWN, SEED, COMFORT_MESSAGES, FORTUNES } from './config.js';
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
  const hud = createHud(document.getElementById('game'), {
    onCrack: () => hud.crackFortune(),
    onClose: () => dispatch('close'),
  });

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
  let mode = 'free'; // 'free' | 'seated' | 'fortune' | 'burn' (전이는 logic/playerMode.js)
  let seatItem = null; // 앉아 있는 벤치(layout.interactables 의 항목)
  let lastFortune = -1;
  let promptText = null;
  const raycaster = new THREE.Raycaster();
  const bubblePoint = new THREE.Vector3();

  // 소각 미니게임. 나갈 때 돌아갈 곳은 지금의 월드 궤도 카메라 자세다.
  const returnPose = { position: new THREE.Vector3(), target: targetPos };
  const burn = createBurnGame({
    scene, camera, renderer, hud, furnace: FURNACE,
    getReturnPose: () => {
      returnPose.position.set(...orbitPosition(targetPos.toArray(), orbit));
      return returnPose;
    },
    onExit: () => dispatch('close'),
  });

  // 장애물 밖으로 밀어낸 목표 지점으로 이동을 시작한다.
  function walkTo(point) {
    const p = pushOut(clampToYard(point, YARD, PLAYER.radius + 0.5));
    moveTarget = p;
    marker.position.set(p.x, MARKER_Y, p.z);
    marker.visible = true;
  }

  const SEAT_GLIDE_SPEED = 10; // 앉는 자리로 미끄러지는 지수 보간 속도(1/초, 약 0.5초)
  const STAND_DISTANCE = 1.0; // 일어날 때 벤치 앞(소각로 쪽)으로 놓는 거리

  function stopWalking() {
    moveTarget = null;
    marker.visible = false;
  }

  // 일어난다: 높이를 0 으로 되돌리고 벤치 앞에 놓는다(장애물 밖으로 밀어냄).
  function standUp() {
    const { x, z, rotY } = seatItem.seat;
    const p = pushOut({ x: x + Math.sin(rotY) * STAND_DISTANCE, z: z + Math.cos(rotY) * STAND_DISTANCE });
    player.position.set(p.x, 0, p.z);
    seatItem = null;
  }

  // 이벤트로 모드를 바꾸고, 떠나는 모드의 정리를 한다. 바뀌었으면 true.
  function dispatch(event) {
    const next = nextMode(mode, event);
    if (next === mode) return false;
    if (mode === 'seated') standUp();
    if (mode === 'fortune') hud.closeFortune();
    if (mode === 'burn') { burn.exit(); player.visible = true; }
    mode = next;
    return true;
  }

  // 소각 미니게임 시작: 월드 입력을 끄고 플레이어를 숨긴 뒤 같은 씬에서 고정 카메라로 넘어간다.
  function onStartBurning() {
    if (!dispatch('interact:burn')) return;
    stopWalking();
    hud.hideTooltip();
    hud.hideBubble();
    renderer.domElement.style.cursor = '';
    controls.setEnabled(false);
    player.visible = false;
    burn.enter();
  }

  // E 키: 포춘 모달이면 깨기/닫기, 앉은 상태면 일어나기, 아니면 가장 가까운 대상의 동작.
  function onInteractKey() {
    if (mode === 'fortune') {
      const stage = hud.fortuneStage();
      if (stage === 'cookie') hud.crackFortune();
      else if (stage === 'card') dispatch('close');
      return;
    }
    if (mode === 'burn') return;
    if (mode === 'seated') { dispatch('interact'); return; }
    const item = nearestInRange(player.position, layout.interactables);
    if (!item) return;
    const { type } = actionOf(item);
    if (type === 'burn') onStartBurning();
    else if (type === 'comfort') hud.showBubble(COMFORT_MESSAGES[item.messageIndex]);
    else if (type === 'seat') {
      if (!dispatch('interact:seat')) return;
      stopWalking();
      seatItem = item;
    } else if (type === 'fortune') {
      if (!dispatch('interact:fortune')) return;
      stopWalking();
      const pick = pickFortune(FORTUNES, Math.random, lastFortune);
      lastFortune = pick.index;
      hud.openFortune(pick.text);
    }
  }

  window.addEventListener('keydown', (e) => {
    if (e.code === 'KeyE') {
      if (!e.repeat) onInteractKey();
    } else if (e.code === 'Escape') {
      dispatch('close');
    }
  });

  // 화면 좌표(ndc)에 보이는 상호작용 대상(없으면 null).
  function pickInteractable(ndc) {
    raycaster.setFromCamera(new THREE.Vector2(ndc.x, ndc.y), camera);
    const hit = raycaster.intersectObjects(pickables, false)[0];
    return hit ? layout.interactables.find((i) => i.id === hit.object.userData.interactId) : null;
  }

  const controls = createControls(renderer.domElement, {
    onDrag: (dx, dy) => {
      orbit = applyDrag(orbit, dx, dy, ORBIT.rotateSpeed, ORBIT);
      renderer.domElement.style.cursor = '';
      hud.hideTooltip();
    },
    onWheel: (deltaY) => { orbit = applyZoom(orbit, deltaY, ORBIT.zoomStep, ORBIT); },
    // 클릭하면 그 지점/오브젝트로 걸어간다(도착해도 아무 일도 일어나지 않는다. 동작은 E 키). 앉아 있으면 먼저 일어난다.
    onClick: (ndc) => {
      if (mode === 'fortune') return;
      const item = pickInteractable(ndc);
      let target = item && interactTarget(item);
      if (!target) {
        raycaster.setFromCamera(new THREE.Vector2(ndc.x, ndc.y), camera);
        const hit = raycaster.intersectObject(ground)[0];
        if (!hit) return;
        target = { x: hit.point.x, z: hit.point.z };
      }
      dispatch('move');
      walkTo(target);
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
      if (next.arrived) stopWalking();
    }
    if (mode === 'seated') {
      // 앉는 자리로 부드럽게 이동·회전·상승(장애물 밀어내기 없음).
      const { x, z, y, rotY } = seatItem.seat;
      const k = 1 - Math.exp(-SEAT_GLIDE_SPEED * dt);
      const turn = Math.atan2(Math.sin(rotY - player.rotation.y), Math.cos(rotY - player.rotation.y));
      player.position.x += (x - player.position.x) * k;
      player.position.z += (z - player.position.z) * k;
      player.position.y += (y - player.position.y) * k;
      player.rotation.y += turn * k;
    }
    if (hud.isBubbleVisible()) {
      // 플레이어 발 위 1.9 지점을 화면 좌표로.
      const w = renderer.domElement.clientWidth;
      const h = renderer.domElement.clientHeight;
      bubblePoint.set(player.position.x, 1.9, player.position.z).project(camera);
      hud.positionBubble((bubblePoint.x * 0.5 + 0.5) * w, (-bubblePoint.y * 0.5 + 0.5) * h);
    }
    character?.setState(mode === 'seated' ? 'sit' : moveTarget ? 'walk' : 'idle');
    // E 키 안내: 포춘 모달 중에는 숨기고, 앉아 있으면 "일어나기", 아니면 가장 가까운 대상의 문구.
    let nextPrompt = null;
    if (promptAllowed(mode)) {
      if (mode === 'seated') nextPrompt = '일어나기';
      else {
        const near = nearestInRange(player.position, layout.interactables);
        nextPrompt = near ? actionOf(near).prompt : null;
      }
    }
    if (nextPrompt !== promptText) {
      promptText = nextPrompt;
      if (nextPrompt) hud.showPrompt(nextPrompt);
      else hud.hidePrompt();
    }
    character?.update(dt);

    const k = 1 - Math.exp(-ORBIT.followSpeed * dt);
    desired.set(player.position.x, ORBIT.targetHeight, player.position.z);
    targetPos.lerp(desired, k);
    // 소각 미니게임이 카메라를 맡는 동안(진입·플레이·복귀 이동)에는 궤도 카메라를 건드리지 않는다. orbit 상태는 그대로다.
    const burnOwnsCamera = burn.update(dt);
    controls.setEnabled(!burnOwnsCamera);
    if (!burnOwnsCamera) {
      camera.position.set(...orbitPosition(targetPos.toArray(), orbit));
      camera.lookAt(targetPos);
    }
    updateTreeOcclusion(camera.position, burnOwnsCamera ? burn.cameraPose().target : targetPos, dt);
  });
}
