import * as THREE from 'three';
import { isMobileUA } from './env.js';
import { createStage } from './stage.js';
import { applyAtmosphere } from './atmosphere.js';
import { loadModels, loadGltf } from './assets.js';
import { buildDecor } from './decor.js';
import { buildLayout } from './logic/layout.js';
import {
  buildGround, buildCity, buildBoundary, buildFurnace, buildPlayer, buildSign, buildMarker, buildPickables,
  buildShredder, buildPaperStack, buildPaper, MARKER_Y,
} from './world.js';
import { createPlayer } from './player.js';
import { createFire } from './fire.js';
import { createHud } from './hud.js';
import { interactTarget, hoverLabel, nearestInRange, actionOf } from './logic/interaction.js';
import { nextMode, showPrompt as promptAllowed } from './logic/playerMode.js';
import { pickFortune } from './logic/fortune.js';
import { createControls } from './controls.js';
import { createGameState } from './logic/gameState.js';
import { ACTIONS, createRunner } from './logic/actions.js';
import { createPassive } from './logic/passive.js';
import { easeInOut } from './logic/burn.js';
import {
  ORBIT, YARD, PLAYER, PLAYER_MODEL, FURNACE, STRESS, SPAWN, SEED, COMFORT_MESSAGES, FORTUNES,
  ACTION_REDUCE, ACTION_EFFECT_AT, ACTION_EXTRA_SECONDS, AUTO_GAP, PASSIVE, FIRE_ZONE_RADIUS, FIRE_RANGE, SHREDDER_RANGE,
} from './config.js';
import { applyDrag, applyZoom, orbitPosition } from './logic/orbit.js';
import { clampToYard, stepToward, pushOutOfCircle, headingY } from './logic/movement.js';

const MAX_DT = 0.1; // 한 프레임에 진행하는 최대 시간(초). 탭이 멈췄다 돌아와도 행동·애니메이션이 한꺼번에 튀지 않게 한다.
const FALLBACK_DURATIONS = { 'pick-up': 1.7, 'attack-melee-right': 2.1, 'attack-melee-left': 2.1 }; // 캐릭터 모델이 없을 때(늘려 재생한 길이와 비슷한 값)
const PAPER_FLIGHT_SEC = 0.35; // 던진 종이가 불까지 날아가는 시간
const PAPER_SLIDE_SEC = 0.2; // 파쇄기 투입구로 들어가는 시간
const PAPER_ARC = 0.6; // 던질 때 포물선이 올라가는 높이
const PAPER_FIRE_Y = 0.9; // 종이가 도착하는 불 위 높이
const PAPER_PICK_AT = 0.5; // pick-up 클립이 이만큼(비율) 진행했을 때 손에 종이가 나타난다.
const POP_HEIGHT = 1.6; // -4 팝업이 뜨는 머리 위 높이
// 손에 든 종이의 위치·방향(손 뼈 기준, 단위는 월드 단위). 화면으로 보며 맞춘 값이다.
const PAPER_HAND = { pos: [-0.38, 0, 0.05], rot: [0, 0, 0] };

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
  // 소각로 곁의 상시 소품: 불, 파쇄기, 종이 더미.
  const fire = createFire(scene, FURNACE);
  const shredder = buildShredder(scene, layout.shredder);
  buildPaperStack(scene, layout.paperStack);
  loading.classList.add('hidden');
  setTimeout(() => { loading.style.display = 'none'; }, 500); // 페이드가 끝난 뒤 완전히 제거
  // 캐릭터 모델이 없으면 상자 플레이어. 이동/회전은 항상 group 이 맡는다.
  let character = null;
  let player;
  if (characterGltf) {
    character = createPlayer(characterGltf, { extraSeconds: ACTION_EXTRA_SECONDS });
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
  let mode = 'free'; // 'free' | 'seated' | 'fortune' (전이는 logic/playerMode.js)
  let seatItem = null; // 앉아 있는 벤치(layout.interactables 의 항목)
  let lastFortune = -1;
  let promptText = null;
  const raycaster = new THREE.Raycaster();
  const bubblePoint = new THREE.Vector3();
  const popPoint = new THREE.Vector3();

  // 게임 전체에서 하나뿐인 상태: 스트레스 지수. 모든 행동이 같은 지수를 줄이고 reset() 으로만 초기화된다.
  const gameState = createGameState({ ...STRESS });
  // 전역 목표 표시이므로 처음부터 보인다.
  hud.showStressBar(gameState.stress.value, gameState.stress.start, gameState.stress.goal);

  // 지수가 처음 목표치 이하가 되는 순간 한 번 불린다. 아무것도 끝내지 않고 플레이는 그대로 계속된다.
  function onClear() {
    // 단계 7에서 종료 화면(CTA)을 연결
  }

  // 플레이어 머리 위 월드 점을 화면(컨테이너 기준 px)으로 투영해 팝업을 띄운다.
  function popDelta(text) {
    camera.updateMatrixWorld();
    popPoint.set(player.position.x, POP_HEIGHT, player.position.z).project(camera);
    hud.popDelta(text, (popPoint.x * 0.5 + 0.5) * renderer.domElement.clientWidth, (-popPoint.y * 0.5 + 0.5) * renderer.domElement.clientHeight);
  }

  // 지수를 줄이고(0 아래로는 내려가지 않는다) 막대·팝업을 갱신한다. 행동 효과 순간과 불멍이 함께 쓴다.
  function applyReduction(amount) {
    const before = gameState.stress.value;
    const { value, justCleared } = gameState.apply(amount);
    hud.updateStressBar(value);
    if (before - value > 0) popDelta(`-${before - value}`);
    if (justCleared) onClear();
  }

  // ---- 소각장 행동: 러너가 시간을 재고, 여기서 캐릭터 동작·손 소품·효과를 맡는다. ----
  // 행동 클립은 합이 (원래 합 + ACTION_EXTRA_SECONDS) 가 되도록 천천히 재생되고, 러너도 같은 늘어난 길이를 받는다.
  const durations = character ? character.getClipDurations(Object.values(ACTIONS).map((a) => a.clips)) : FALLBACK_DURATIONS;
  const runner = createRunner({
    durations, effectAt: ACTION_EFFECT_AT, autoGap: AUTO_GAP, canStart: (id) => inRangeFor(id),
  });
  const passive = createPassive(PASSIVE);

  // 손에 붙일 자리. 캐릭터 모델이 없으면 상자 플레이어 옆에 고정 위치.
  let handAttach;
  if (character) {
    handAttach = character.getHandAttach();
  } else {
    handAttach = new THREE.Group();
    handAttach.position.set(0.5, 0.7, 0.3);
    player.add(handAttach);
  }
  const paper = buildPaper(0.4, 0.53); // 손 -> 불/파쇄기로 날아갈 때도 같은 메쉬를 쓴다(소속만 손과 씬 사이에서 바꾼다).
  paper.visible = false;
  handAttach.add(paper);

  function placePaperInHand() {
    handAttach.add(paper);
    paper.position.set(...PAPER_HAND.pos);
    paper.rotation.set(...PAPER_HAND.rot);
    paper.scale.setScalar(1);
  }
  placePaperInHand();

  let flight = null; // 날아가는 종이 { kind: 'burn' | 'shred', from, to, t, dur }
  let actionTime = 0; // 지금 행동이 시작된 뒤 경과(초). 손 소품 타이밍용
  let actionId = null;
  let thrown = false; // 이번 행동에서 종이를 이미 손에서 떠나보냈는가
  const tmpFrom = new THREE.Vector3();

  const targetOf = (id) => (ACTIONS[id].target === 'fire' ? FURNACE : layout.shredder);
  const distTo = (t) => Math.hypot(player.position.x - t.x, player.position.z - t.z);
  const inRangeFor = (id) => distTo(targetOf(id)) <= (ACTIONS[id].target === 'fire' ? FIRE_RANGE : SHREDDER_RANGE);

  // 러너가 행동을 시작했을 때(수동·자동 공통): 대상을 바라보고 클립을 재생한다.
  function beginAnimation(id) {
    const action = ACTIONS[id];
    const t = targetOf(id);
    actionId = id;
    actionTime = 0;
    thrown = false;
    if (character) {
      character.faceToward(t.x, t.z);
      character.playClips(action.clips);
    } else {
      player.rotation.y = headingY(player.position, t);
    }
  }

  // 효과 순간: 지수 -4, 그리고 행동별 연출.
  function onEffect(id) {
    applyReduction(ACTION_REDUCE);
    // 종이를 손에서 떼어 씬으로 옮기고 목표로 날린다.
    thrown = true;
    paper.visible = true;
    paper.getWorldPosition(tmpFrom);
    scene.attach(paper);
    flight = { kind: id, from: tmpFrom.clone(), to: new THREE.Vector3(), t: 0, dur: id === 'burn' ? PAPER_FLIGHT_SEC : PAPER_SLIDE_SEC };
    if (id === 'burn') {
      flight.to.set(FURNACE.x, PAPER_FIRE_Y, FURNACE.z);
    } else {
      shredder.slotWorld(flight.to);
      shredder.wiggle();
      shredder.spawnStrips();
    }
  }

  function onDone() {
    character?.endAction();
    if (!flight) paper.visible = false;
    actionId = null;
  }

  // 행동 요청(막대 클릭·숫자 키). 막대가 보이는 자유 상태에서 쉬는 중이고 사정거리 안일 때만 시작한다.
  function requestAction(id) {
    if (mode !== 'free' || runner.isBusy() || !ACTIONS[id] || !inRangeFor(id)) return false;
    stopWalking();
    if (!runner.start(id)) return false;
    beginAnimation(id);
    return true;
  }

  function toggleAuto() {
    if (runner.autoOn) {
      runner.cancelAuto();
      return;
    }
    // 다음에 할 행동(기록이 없으면 태우기)을 할 수 없는 자리면 켜지지 않는다.
    if (mode === 'free' && inRangeFor(runner.nextAutoAction())) runner.setAuto(true);
  }

  function updateFlight(dt) {
    if (!flight) return;
    flight.t += dt;
    const k = Math.min(1, flight.t / flight.dur);
    paper.position.lerpVectors(flight.from, flight.to, k);
    if (flight.kind === 'burn') {
      paper.position.y += PAPER_ARC * Math.sin(Math.PI * k);
      paper.rotation.x += 14 * dt;
      paper.rotation.z += 9 * dt;
      paper.scale.setScalar(1 - 0.5 * easeInOut(k));
    } else {
      paper.scale.setScalar(1 - 0.9 * easeInOut(k));
    }
    if (k >= 1) {
      if (flight.kind === 'burn') fire.flare(); // 종이가 불에 닿는 순간
      flight = null;
      paper.visible = false;
      placePaperInHand();
    }
  }

  // 손 소품 타이밍: 태우기/파쇄는 pick-up 이 절반쯤 진행되면 종이가 손에 나타난다(효과 순간 전까지 들고 있다).
  function updateHandProps(dt) {
    if (actionId === null) return;
    actionTime += dt;
    if (thrown) return;
    paper.visible = actionTime >= (durations['pick-up'] ?? 0) * PAPER_PICK_AT;
  }

  // 매 프레임: AUTO 유효성 확인 -> 러너 진행(효과/끝 처리) -> 손 소품·날아가는 종이 -> 행동 막대·불멍 안내·불멍 감소.
  function updateActions(dt) {
    // AUTO 해제 조건: 걷기 시작·앉기·포춘(진행 중인 행동은 끝까지 한다). 다음 행동의 사정거리 밖이면 러너가 canStart 로 끈다.
    if (runner.autoOn && (mode !== 'free' || moveTarget)) runner.cancelAuto();
    const startedBefore = runner.startedCount;
    for (const e of runner.update(dt)) {
      if (e.type === 'effect') onEffect(e.action);
      else onDone();
    }
    if (runner.startedCount !== startedBefore && runner.isBusy()) beginAnimation(runner.lastActionId); // 자동으로 시작된 행동
    updateHandProps(dt);
    updateFlight(dt);

    const inZone = mode === 'free' && distTo(FURNACE) <= FIRE_ZONE_RADIUS;
    const meditating = mode === 'seated' && Boolean(seatItem) && Math.hypot(seatItem.x - FURNACE.x, seatItem.z - FURNACE.z) <= FIRE_ZONE_RADIUS;
    const relief = passive.update(dt, meditating);
    if (relief > 0) applyReduction(relief);
    if (inZone) {
      if (!hud.isActionBarVisible()) hud.showActionBar({ onAction: requestAction, onToggleAuto: toggleAuto });
      hud.updateActionBar({
        burn: inRangeFor('burn'), shred: inRangeFor('shred'), auto: runner.autoOn, busy: runner.isBusy(),
      });
    } else if (hud.isActionBarVisible()) {
      hud.hideActionBar();
    }
    if (meditating) hud.showMeditate();
    else hud.hideMeditate();
  }

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
    mode = next;
    if (mode !== 'free') runner.cancelAuto(); // 앉기·포춘 모달을 열면 자동은 꺼진다.
    return true;
  }

  // E 키: 포춘 모달이면 깨기/닫기, 앉은 상태면 일어나기, 아니면 가장 가까운 대상의 동작(소각로는 E 동작이 없다).
  function onInteractKey() {
    if (mode === 'fortune') {
      const stage = hud.fortuneStage();
      if (stage === 'cookie') hud.crackFortune();
      else if (stage === 'card') dispatch('close');
      return;
    }
    if (runner.isBusy()) return; // 행동 중에는 E 동작을 하지 않는다.
    if (mode === 'seated') { dispatch('interact'); return; }
    const item = nearestInRange(player.position, layout.interactables);
    if (!item) return;
    const { type } = actionOf(item);
    if (type === 'comfort') hud.showBubble(COMFORT_MESSAGES[item.messageIndex]);
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

  const ACTION_KEYS = { Digit1: 'burn', Digit2: 'shred', Numpad1: 'burn', Numpad2: 'shred' };
  window.addEventListener('keydown', (e) => {
    if (e.code === 'KeyE') {
      if (!e.repeat) onInteractKey();
    } else if (e.code === 'Escape') {
      dispatch('close');
    } else if (ACTION_KEYS[e.code]) {
      if (!e.repeat) requestAction(ACTION_KEYS[e.code]);
    } else if (e.code === 'KeyR') {
      if (!e.repeat) toggleAuto();
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
    // 행동 중에는 이동 클릭을 무시하고, 쉬는 중의 이동 클릭은 자동을 끈다.
    onClick: (ndc) => {
      if (mode === 'fortune' || runner.isBusy()) return;
      const item = pickInteractable(ndc);
      let target = item && interactTarget(item);
      if (!target) {
        raycaster.setFromCamera(new THREE.Vector2(ndc.x, ndc.y), camera);
        const hit = raycaster.intersectObject(ground)[0];
        if (!hit) return;
        target = { x: hit.point.x, z: hit.point.z };
      }
      runner.cancelAuto();
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

  let time = 0;
  onFrame((rawDt) => {
    const dt = Math.min(rawDt, MAX_DT);
    time += dt;
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
    updateActions(dt);
    fire.update(dt, time);
    shredder.update(dt);
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
    camera.position.set(...orbitPosition(targetPos.toArray(), orbit));
    camera.lookAt(targetPos);
    updateTreeOcclusion(camera.position, targetPos, dt);
  });
}
