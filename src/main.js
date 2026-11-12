import * as THREE from 'three';
import { isMobileUA } from './env.js';
import { createStage } from './stage.js';
import { applyAtmosphere } from './atmosphere.js';
import { loadModels, loadGltf } from './assets.js';
import { buildDecor } from './decor.js';
import { buildLayout } from './logic/layout.js';
import {
  buildGround, buildCity, buildBoundary, buildFurnace, buildPlayer, buildSign, buildMarker, buildPickables,
  buildShredder, buildPaper, MARKER_Y,
} from './world.js';
import { createPlayer } from './player.js';
import { createFire } from './fire.js';
import { createHud } from './hud.js';
import { interactTarget, hoverLabel, nearestInRange, actionOf } from './logic/interaction.js';
import { nextMode, showPrompt as promptAllowed } from './logic/playerMode.js';
import { pickFortune } from './logic/fortune.js';
import { createControls } from './controls.js';
import { createGameState } from './logic/gameState.js';
import { ACTIONS, createRunner, fitDurations, canPerform } from './logic/actions.js';
import { createPassive } from './logic/passive.js';
import { createOnce } from './logic/once.js';
import { shareLines, shareFilename, shareUrl } from './logic/cta.js';
import { initAnalytics, track } from './analytics.js';
import { renderShareCard, saveShareCard, copyText } from './share.js';
import { easeInOut } from './logic/burn.js';
import {
  ORBIT, YARD, PLAYER, PLAYER_MODEL, FURNACE, STRESS, SPAWN, SEED, COMFORT_MESSAGES, FORTUNES,
  ACTION_REDUCE, ACTION_EFFECT_AT, ACTION_TARGET_SECONDS, ACTION_TURN_SECONDS, AUTO_GAP, PASSIVE,
  FIRE_ZONE_RADIUS, FIRE_RANGE, SHREDDER_RANGE, CATCH_URL, GA_MEASUREMENT_ID,
} from './config.js';
import { applyDrag, applyZoom, orbitPosition } from './logic/orbit.js';
import { clampToYard, stepToward, pushOutOfCircle, headingY } from './logic/movement.js';

const MAX_DT = 0.1; // 한 프레임에 진행하는 최대 시간(초). 탭이 멈췄다 돌아와도 행동·애니메이션이 한꺼번에 튀지 않게 한다.
const FALLBACK_RAW_DURATIONS = { 'emote-no': 0.667, 'pick-up': 0.333, 'attack-melee-right': 0.417, 'emote-yes': 0.667 }; // 캐릭터 모델이 없을 때(모델의 실제 클립 길이)
const PAPER_FLIGHT_SEC = 0.35; // 던진 종이가 불까지 날아가는 시간
const PAPER_SLIDE_SEC = 0.2; // 파쇄기 투입구로 들어가는 시간
const PAPER_ARC = 0.6; // 던질 때 포물선이 올라가는 높이
const PAPER_FIRE_Y = 0.9; // 종이가 도착하는 불 위 높이
const POP_HEIGHT = 1.6; // -3 팝업이 뜨는 머리 위 높이
// 재킷 가슴 주머니(캐릭터 기준 로컬: 왼쪽 가슴 = +x, 키의 55% 높이, 살짝 앞). 종이는 여기서 작게 시작해 손으로 올라온다.
const POCKET = { pos: [0.13, 0.6, 0.2] };
const POCKET_SCALE = 0.3;
const CLEAR_POPUP_DELAY = 0.3; // 클리어한 행동이 끝난 뒤 팝업이 뜨기까지(초)
const SHARE_FOOTER = 'Catch World · 학사 과제용 비공식 프로젝트';
const CRUMPLE_FRACTION = 0.35; // 태우기: 던지기 단계 앞쪽 이만큼 동안 종이를 구긴다
const CRUMPLE_SCALE = 0.5; // 구긴 종이의 크기
const CRUMPLE_SPIN = 18; // 구길 때 도는 속도(라디안/초)
// 손에 든 종이의 위치·방향(손 뼈 기준, 단위는 월드 단위). 화면으로 보며 맞춘 값이다.
const PAPER_HAND = { pos: [-0.38, 0, 0.05], rot: [Math.PI / 2, 0, 0] };

if (isMobileUA(navigator.userAgent)) {
  document.getElementById('mobile-notice').style.display = 'flex';
} else {
  initAnalytics(GA_MEASUREMENT_ID);
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
  // 소각로 곁의 상시 소품: 불, 파쇄기.
  const fire = createFire(scene, FURNACE);
  const shredder = buildShredder(scene, layout.shredder);
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
  let mode = 'free'; // 'free' | 'seated' | 'fortune' | 'result' (전이는 logic/playerMode.js)
  let seatItem = null; // 앉아 있는 벤치(layout.interactables 의 항목)
  let lastFortune = -1;
  let promptText = null;
  const raycaster = new THREE.Raycaster();
  const bubblePoint = new THREE.Vector3();
  const popPoint = new THREE.Vector3();

  // 게임 전체에서 하나뿐인 상태: 스트레스 지수. 모든 행동이 같은 지수를 줄이고 reset() 으로만 초기화된다.
  const gameState = createGameState({ ...STRESS });
  // 전역 목표 표시이므로 처음부터 보인다.
  hud.showStressBar(gameState.stress.value, gameState.stress.start);

  const once = createOnce(); // 페이지를 연 뒤 한 번만 보내는 분석 이벤트(game_start)
  let clearInfo = null; // 클리어한 순간의 { stress, actions }
  let clearWait = null; // 팝업이 뜨기까지 남은 초. 행동이 끝난 뒤부터 센다. null 이면 대기 중이 아님.

  // 지수가 처음 목표치 이하가 되는 순간 한 번 불린다(다시 하기 뒤 새 판에서는 또 한 번). 진행 중인 행동이 끝나면 종료 화면을 띄운다.
  function onClear() {
    runner.cancelAuto();
    clearInfo = { stress: gameState.stress.value, actions: gameState.actionsDone };
    clearWait = CLEAR_POPUP_DELAY;
    track('game_clear', { ...clearInfo });
  }

  // 플레이어 머리 위 월드 점을 화면(컨테이너 기준 px)으로 투영해 팝업을 띄운다.
  function popDelta(text) {
    camera.updateMatrixWorld();
    popPoint.set(player.position.x, POP_HEIGHT, player.position.z).project(camera);
    hud.popDelta(text, (popPoint.x * 0.5 + 0.5) * renderer.domElement.clientWidth, (-popPoint.y * 0.5 + 0.5) * renderer.domElement.clientHeight);
  }

  // 지수를 줄이고(0 아래로는 내려가지 않는다) 막대·팝업을 갱신한다. 행동 효과 순간과 불멍이 함께 쓴다.
  function applyReduction(amount, counts = true) {
    const before = gameState.stress.value;
    const { value, justCleared } = gameState.apply(amount, { counts });
    hud.updateStressBar(value);
    if (before - value > 0) popDelta(`-${before - value}`);
    if (justCleared) onClear();
  }

  // ---- 소각장 행동: 러너가 시간을 재고, 여기서 캐릭터 동작·종이·효과를 맡는다. ----
  // 한숨 -> 주머니에서 종이 꺼내기 -> (대상 쪽으로 돌기) -> 던지기/치기 -> 후련. 던지기/치기 클립만 총 길이가 ACTION_TARGET_SECONDS 가 되도록 느려진다.
  const { durations, speeds } = fitDurations(character ? character.getRawClipDurations() : FALLBACK_RAW_DURATIONS, ACTION_TURN_SECONDS, ACTION_TARGET_SECONDS);
  const runner = createRunner({
    durations, turnSeconds: ACTION_TURN_SECONDS, effectAt: ACTION_EFFECT_AT, autoGap: AUTO_GAP, canStart: (id) => inRangeFor(id),
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
  // 종이 한 장을 모든 단계에서 재사용한다: 주머니(player 기준) -> 손(handAttach) -> 날아가기(scene). 행동이 끝나면 항상 숨긴다.
  const paper = buildPaper(0.4, 0.53);
  paper.visible = false;
  handAttach.add(paper);

  function placePaperInHand() {
    handAttach.add(paper);
    paper.position.set(...PAPER_HAND.pos);
    paper.rotation.set(...PAPER_HAND.rot);
    paper.scale.setScalar(1);
  }
  placePaperInHand();

  let flight = null; // 날아가는 종이 { kind: 'burn' | 'shred', from, to, t, dur, startScale }
  let pull = null; // 주머니에서 꺼내는 중 { t, dur }
  let crumple = null; // 태우기에서 종이를 구기는 중 { t, dur }
  let actionId = null;
  const tmpFrom = new THREE.Vector3();
  const tmpHand = new THREE.Vector3();
  const pocketPos = new THREE.Vector3(...POCKET.pos);
  const pocketQuat = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0)); // 세워서 앞(+z)을 향하게
  const tmpHeld = new THREE.Vector3();
  const tmpQuat = new THREE.Quaternion();
  const tmpQuat2 = new THREE.Quaternion();
  const heldQuat = new THREE.Quaternion();
  const tmpEuler = new THREE.Euler();

  // 회전 단계의 대상 지점과 사정거리 계산.
  const pointOf = (name) => (name === 'fire' ? FURNACE : layout.shredder);
  const distTo = (t) => Math.hypot(player.position.x - t.x, player.position.z - t.z);
  const RANGES = { fire: FIRE_RANGE, shredder: SHREDDER_RANGE };
  // 태우기는 소각로, 파쇄는 파쇄기가 사정거리 안일 때만 할 수 있다(어느 방향에서든).
  const inRangeFor = (id) => canPerform(id, { fire: distTo(FURNACE), shredder: distTo(layout.shredder) }, RANGES);

  // 종이를 숨기고 손에 되돌려 놓는다(행동이 끝났거나 취소됐을 때).
  function clearPaper() {
    pull = null;
    crumple = null;
    flight = null;
    placePaperInHand();
    paper.visible = false;
  }

  // 러너의 단계 시작: 클립 재생 또는 회전(제자리에서 대상 쪽으로, 대기 자세).
  function onStep({ action, index, step }) {
    if (index === 0) {
      if (once('game_start')) track('game_start');
      actionId = action;
      character?.beginAction();
    }
    if (step.kind === 'turn') {
      const t = pointOf(step.target);
      if (character) {
        character.idleInPlace();
        character.turnToward(t.x, t.z, step.seconds);
      } else {
        player.rotation.y = headingY(player.position, t);
      }
      return;
    }
    character?.playClip(step.name, speeds[step.name] ?? 1);
    if (step.event === 'paperOut') {
      // 재킷 가슴 주머니에서 작은 종이가 나와 paperOut 순간까지 손으로 올라온다.
      pull = { t: 0, dur: step.seconds * step.eventAt };
      handAttach.add(paper); // 손 기준으로 움직여 손에 닿을 때 튀지 않는다.
      paper.scale.setScalar(POCKET_SCALE);
      paper.visible = true;
      updatePaper(0);
    } else if (step.effect && action === 'burn') {
      crumple = { t: 0, dur: step.seconds * CRUMPLE_FRACTION }; // 던지기 앞부분에서 종이를 구긴다
    }
  }

  // 종이가 완전히 나왔다(pick-up 단계의 eventAt): 손에 쥔다.
  function onPaperOut() {
    pull = null;
    placePaperInHand();
    paper.visible = true;
  }

  // 효과 순간: 지수 -ACTION_REDUCE, 그리고 행동별 연출(종이가 손을 떠난다).
  function onEffect(id) {
    track('action_done', { action: id });
    applyReduction(ACTION_REDUCE);
    crumple = null;
    paper.visible = true;
    paper.getWorldPosition(tmpFrom);
    const startScale = paper.scale.x;
    scene.attach(paper);
    flight = { kind: id, from: tmpFrom.clone(), to: new THREE.Vector3(), t: 0, dur: id === 'burn' ? PAPER_FLIGHT_SEC : PAPER_SLIDE_SEC, startScale };
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
    clearPaper();
    actionId = null;
  }

  // 진행 중인 행동을 깨끗하게 취소한다(걷기·앉기·포춘 등): 종이를 치우고 자세를 idle 로 되돌린다.
  function abortAction() {
    if (!runner.isBusy() && actionId === null) return;
    runner.abort();
    character?.endAction();
    clearPaper();
    actionId = null;
  }

  // 행동 요청(막대 클릭·숫자 키). 막대가 보이는 자유 상태에서 쉬는 중이고 사정거리 안일 때만 시작한다.
  function requestAction(id) {
    if (mode !== 'free' || runner.isBusy() || !ACTIONS[id] || !inRangeFor(id)) return false;
    stopWalking();
    return runner.start(id); // 첫 단계(한숨)는 이 프레임의 update 에서 시작된다.
  }

  function toggleAuto() {
    if (runner.autoOn) {
      runner.cancelAuto();
      return;
    }
    // 다음에 할 행동(기록이 없으면 태우기)을 할 수 없는 자리면 켜지지 않는다.
    if (mode === 'free' && inRangeFor(runner.nextAutoAction())) runner.setAuto(true);
  }

  // 종이 상태 갱신: 주머니에서 손으로 올라오기, 태우기의 구기기, 날아가기.
  function updatePaper(dt) {
    if (pull) {
      pull.t += dt;
      const e = easeInOut(pull.t / pull.dur);
      // 주머니(캐릭터 기준 고정 지점)를 손 좌표로 바꿔서, 손에 든 위치까지 보간한다.
      player.updateWorldMatrix(true, false);
      handAttach.updateWorldMatrix(true, false);
      tmpHand.copy(pocketPos);
      player.localToWorld(tmpHand);
      handAttach.worldToLocal(tmpHand);
      paper.position.lerpVectors(tmpHand, tmpHeld.set(...PAPER_HAND.pos), e);
      handAttach.getWorldQuaternion(tmpQuat);
      player.getWorldQuaternion(tmpQuat2);
      tmpQuat.invert().multiply(tmpQuat2).multiply(pocketQuat); // 주머니에서의 방향(세워서 앞을 향함)을 손 기준으로
      paper.quaternion.copy(tmpQuat).slerp(heldQuat.setFromEuler(tmpEuler.set(...PAPER_HAND.rot)), e);
      paper.scale.setScalar(POCKET_SCALE + (1 - POCKET_SCALE) * e);
    }
    if (crumple) {
      crumple.t += dt;
      const k = Math.min(1, crumple.t / crumple.dur);
      paper.scale.setScalar(1 - (1 - CRUMPLE_SCALE) * easeInOut(k));
      paper.rotation.y += CRUMPLE_SPIN * dt;
    }
    if (!flight) return;
    flight.t += dt;
    const k = Math.min(1, flight.t / flight.dur);
    paper.position.lerpVectors(flight.from, flight.to, k);
    if (flight.kind === 'burn') {
      paper.position.y += PAPER_ARC * Math.sin(Math.PI * k);
      paper.rotation.x += 14 * dt;
      paper.rotation.z += 9 * dt;
      paper.scale.setScalar(flight.startScale * (1 - 0.5 * easeInOut(k)));
    } else {
      paper.scale.setScalar(flight.startScale * (1 - 0.9 * easeInOut(k)));
    }
    if (k >= 1) {
      if (flight.kind === 'burn') fire.flare(); // 종이가 불에 닿는 순간
      clearPaper();
    }
  }

  // 매 프레임: AUTO 유효성 확인 -> 러너 진행(효과/끝 처리) -> 손 소품·날아가는 종이 -> 행동 막대·불멍 안내·불멍 감소.
  function updateActions(dt) {
    // AUTO 해제 조건: 걷기 시작·앉기·포춘(진행 중인 행동은 끝까지 한다). 다음 행동의 사정거리 밖이면 러너가 canStart 로 끈다.
    if (runner.autoOn && (mode !== 'free' || moveTarget)) runner.cancelAuto();
    for (const e of runner.update(dt)) {
      if (e.type === 'step') onStep(e);
      else if (e.type === 'paperOut') onPaperOut();
      else if (e.type === 'effect') onEffect(e.action);
      else onDone();
    }
    updatePaper(dt);

    const inZone = mode === 'free' && distTo(FURNACE) <= FIRE_ZONE_RADIUS;
    const meditating = mode === 'seated' && Boolean(seatItem) && Math.hypot(seatItem.x - FURNACE.x, seatItem.z - FURNACE.z) <= FIRE_ZONE_RADIUS;
    const relief = passive.update(dt, meditating);
    if (meditating && once('game_start')) track('game_start');
    if (relief > 0) applyReduction(relief, false); // 불멍은 소각 횟수에 넣지 않는다
    if (clearWait !== null && !runner.isBusy() && mode !== 'fortune') {
      clearWait -= dt;
      if (clearWait <= 0) {
        clearWait = null;
        showResult();
      }
    }
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
    abortAction();
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
    if (mode !== 'free') { runner.cancelAuto(); abortAction(); } // 앉기·포춘 모달을 열면 자동이 꺼지고 진행 중인 행동도 취소된다.
    return true;
  }

  // ---- 종료 화면(클리어 팝업)과 캐치 칩 ----
  function openCatch(place) {
    window.open(CATCH_URL, '_blank', 'noopener');
    track('banner_click', { place });
  }

  async function saveResultImage() {
    try { renderer.render(scene, camera); } catch (err) { console.warn('저장용 화면을 그리지 못했습니다.', err); } // 같은 틱에서 바로 복사해야 캔버스가 비지 않는다.
    const { stress, actions } = clearInfo;
    const card = renderShareCard(renderer.domElement, {
      ...shareLines(stress, actions, gameState.stress.start), footer: SHARE_FOOTER, url: shareUrl(location),
    });
    const ok = await saveShareCard(card, shareFilename(new Date()));
    if (ok) track('share_image');
    hud.setResultFeedback(ok ? '저장했어요!' : '저장하지 못했어요. 다시 시도해 주세요.');
  }

  async function copyAddress() {
    const ok = await copyText(shareUrl(location));
    if (ok) track('share_link');
    hud.setResultFeedback(ok ? '주소를 복사했어요!' : '복사에 실패했어요. 주소창의 주소를 직접 복사해 주세요.');
  }

  function closeResult() {
    hud.closeResult();
    dispatch('close'); // result -> free
    controls.setEnabled(true);
  }

  function restart() {
    closeResult();
    gameState.reset();
    hud.updateStressBar(gameState.stress.value);
    hud.hideCtaChip();
    clearInfo = null;
    track('game_restart');
  }

  function showResult() {
    if (!dispatch('open:result')) return; // 앉아 있었으면 일어나고, 자동·진행 중인 행동은 이미 멈춰 있다.
    stopWalking();
    controls.setEnabled(false);
    renderer.domElement.style.cursor = '';
    hud.hideTooltip();
    hud.hideBubble();
    hud.showCtaChip(() => openCatch('chip'));
    hud.openResult({
      stress: clearInfo.stress, onCta: () => openCatch('modal'), onSave: saveResultImage, onCopy: copyAddress, onContinue: closeResult, onRestart: restart,
    });
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
    if (mode === 'result') { // 종료 화면 중에는 Esc(계속 둘러보기)만 받는다.
      if (e.code === 'Escape') closeResult();
      return;
    }
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
