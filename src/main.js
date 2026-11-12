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
import { buildZones, activeZone, zoneActions } from './logic/zones.js';
import { nearestIndex } from './logic/laundry.js';
import { buildLaundryBuilding, buildCleanShirt, buildCrumpledShirt, LAUNDRY_MODEL_ITEMS } from './laundry.js';
import { buildInteriorLaundry, INTERIOR_MODEL_ITEMS } from './interiorLaundry.js';
import { createSpaces } from './spaces.js';
import { buildLaundryInterior } from './logic/interiors.js';
import { arrivalPoint, clampToSpace } from './logic/spaces.js';
import { createTransition } from './logic/transition.js';
import { createPassive } from './logic/passive.js';
import { createOnce } from './logic/once.js';
import { shareLines, shareFilename, shareUrl, resultPlan } from './logic/cta.js';
import { createOutfit, hasMyShirt, outfitPrompt, MY_SHIRT_SLOT } from './logic/outfit.js';
import { initAnalytics, track } from './analytics.js';
import { renderShareCard, saveShareCard, copyText } from './share.js';
import { easeInOut } from './logic/burn.js';
import {
  ORBIT, TRANSITION, PLAYER, PLAYER_MODEL, FURNACE, STRESS, SPAWN, SEED, COMFORT_MESSAGES, FORTUNES,
  ACTION_REDUCE, ACTION_EFFECT_AT, ACTION_TARGET_SECONDS, ACTION_TURN_SECONDS, AUTO_GAP, PASSIVE,
  FIRE_RANGE, SHREDDER_RANGE, WASHER_RANGE, CLOTHESLINE_RANGE, FIRE_ZONE_RADIUS, CATCH_URL, GA_MEASUREMENT_ID, WEAR_SECONDS, WEAR_SWAP_AT,
} from './config.js';
import { applyDrag, applyZoom, orbitPosition } from './logic/orbit.js';
import { stepToward, pushOutOfCircle, headingY } from './logic/movement.js';

const MAX_DT = 0.1; // 한 프레임에 진행하는 최대 시간(초). 탭이 멈췄다 돌아와도 행동·애니메이션이 한꺼번에 튀지 않게 한다.
const FALLBACK_RAW_DURATIONS = { 'emote-no': 0.667, 'pick-up': 0.333, 'attack-melee-right': 0.417, 'interact-right': 0.667, 'emote-yes': 0.667 }; // 캐릭터 모델이 없을 때(모델의 실제 클립 길이)
const PAPER_FLIGHT_SEC = 0.35; // 던진 종이가 불까지 날아가는 시간
const PAPER_SLIDE_SEC = 0.2; // 파쇄기 투입구로 들어가는 시간
const PAPER_ARC = 0.6; // 던질 때 포물선이 올라가는 높이
const PAPER_FIRE_Y = 0.9; // 종이가 도착하는 불 위 높이
const SHIRT_FLIGHT_SEC = 0.45; // 구겨진 셔츠가 세탁기까지 날아가는 시간
const SHIRT_ARC = 0.8; // 셔츠가 날아갈 때 포물선 높이
const POP_HEIGHT = 1.6; // -3 팝업이 뜨는 머리 위 높이
// 재킷 가슴 주머니(캐릭터 기준 로컬: 왼쪽 가슴 = +x, 키의 55% 높이, 살짝 앞). 종이는 여기서 작게 시작해 손으로 올라온다.
const POCKET = { pos: [0.13, 0.6, 0.2] };
const POCKET_SCALE = 0.3;
const CLEAR_POPUP_DELAY = 0.3; // 클리어한 행동이 끝난 뒤 팝업이 뜨기까지(초)
const SHARE_FOOTER = 'Catch World · 학사 과제용 비공식 프로젝트';
const CRUMPLE_FRACTION = 0.35; // 태우기: 던지기 단계 앞쪽 이만큼 동안 종이를 구긴다
const CRUMPLE_SCALE = 0.5; // 구긴 종이의 크기
const CRUMPLE_SPIN = 18; // 구길 때 도는 속도(라디안/초)
// 손에 든 소품(종이·셔츠)의 위치(손 뼈 기준, 단위는 월드 단위). 화면으로 보며 맞춘 값이다. 방향은 소품마다 userData.rot(주머니에서도 같은 방향).
const PAPER_HAND = { pos: [-0.38, 0, 0.05] };

if (isMobileUA(navigator.userAgent)) {
  document.getElementById('mobile-notice').style.display = 'flex';
} else {
  initAnalytics(GA_MEASUREMENT_ID);
  const { scene, camera, renderer, onFrame } = createStage(document.getElementById('game'));
  const layout = buildLayout(SEED);
  const interior = buildLaundryInterior(); // 세탁소 실내 데이터(마당에서 멀리 떨어진 좌표)
  const loading = document.getElementById('loading');

  let models = new Map();
  let characterGltf = null;
  try {
    const all = [...Object.values(layout).filter(Array.isArray).flat(), ...layout.interactables.map((i) => i.item), ...LAUNDRY_MODEL_ITEMS, ...INTERIOR_MODEL_ITEMS].filter((it) => it?.pack);
    [models, characterGltf] = await Promise.all([loadModels(all), loadGltf('characters', PLAYER_MODEL.name)]);
  } catch (err) {
    console.warn('모델 로딩 중 오류. 도형 대체물을 사용합니다.', err);
  }
  // 공간: 마당은 yardRoot 한 그룹(하늘·해·불 포함)에 모아 실내로 들어가면 통째로 숨긴다. 실내는 멀리 떨어진 별도 그룹이다.
  const yardRoot = new THREE.Group();
  yardRoot.name = 'yard';
  scene.add(yardRoot);
  const { fog: yardFog } = applyAtmosphere(scene, renderer, yardRoot);
  const ground = buildGround(yardRoot);
  buildCity(yardRoot, layout);
  buildLaundryBuilding(yardRoot, layout, models);
  const inside = buildInteriorLaundry(scene, interior, models);
  const laundry = { washers: inside.washers, clothesline: inside.clothesline, update: (dt) => inside.update(dt) };
  const zones = buildZones(layout, interior);
  const { updateTreeOcclusion } = buildDecor(yardRoot, layout, models);
  buildSign(yardRoot, layout.sign);
  // 모델이 없으면 도형 대체물.
  if (!models.get('nature/campfire_stones')) buildFurnace(yardRoot);
  const treeCount = [...models.keys()].filter((k) => k.startsWith('nature/tree_') && models.get(k)).length;
  if (treeCount < 5) buildBoundary(yardRoot);
  // 소각로 곁의 상시 소품: 불, 파쇄기.
  const fire = createFire(yardRoot, FURNACE);
  const shredder = buildShredder(yardRoot, layout.shredder);
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
  const hud = createHud(document.getElementById('game'), {
    onCrack: () => hud.crackFortune(),
    onClose: () => dispatch('close'),
  });

  // 공간별 데이터: 클릭 레이캐스트 바닥, 클릭/호버 판정 부피, 상호작용 대상, 장애물. 이동·클릭·E 안내는 항상 지금 공간의 것을 쓴다.
  const spaceData = {
    yard: { ground, pickables: buildPickables(yardRoot, layout.interactables), interactables: layout.interactables, obstacles: [FURNACE, ...layout.obstacles] },
    laundry: { ground: inside.ground, pickables: inside.pickables, interactables: interior.interactables, obstacles: interior.obstacles },
  };
  const spaces = createSpaces({
    scene,
    spaces: { yard: { root: yardRoot, fog: yardFog, background: null }, laundry: { root: inside.root, fog: inside.fog, background: inside.background } },
  });
  let spaceId = 'yard';
  const here = () => spaceData[spaceId];
  // 첫 전환에서 셰이더가 새로 컴파일되어 멈칫하지 않도록 두 공간의 조명 상태로 미리 컴파일해 둔다.
  for (const id of ['laundry', 'yard']) {
    spaces.apply(id);
    try { renderer.compile(scene, camera); } catch (err) { console.warn('셰이더 미리 컴파일 실패', err); }
  }
  loading.classList.add('hidden');
  setTimeout(() => { loading.style.display = 'none'; }, 500); // 페이드가 끝난 뒤 완전히 제거

  // 여러 장애물이 가까울 때도 자리 잡도록 몇 번 반복해서 밀어낸다(지금 공간의 장애물).
  function pushOut(p) {
    for (let pass = 0; pass < 3; pass++) {
      for (const o of here().obstacles) p = pushOutOfCircle(p, PLAYER.radius, o);
    }
    return p;
  }

  let orbit = { azimuthDeg: ORBIT.azimuthDeg, polarDeg: ORBIT.polarDeg, distance: ORBIT.distance };
  const targetPos = new THREE.Vector3(player.position.x, ORBIT.targetHeight, player.position.z);
  const desired = new THREE.Vector3();
  let moveTarget = null;
  let mode = 'free'; // 'free' | 'seated' | 'fortune' | 'result' | 'transition' | 'wearing' (전이는 logic/playerMode.js)
  const transition = createTransition(TRANSITION); // 공간 전환(차원문) 상태 기계
  let transitionTarget = null; // 전환이 끝나면 가 있을 공간 id
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

  // 입은 옷 상태(정장 -> 그을음 -> 나시 -> 새 셔츠 말리는 중 -> 마름). 꾸미기일 뿐 지수 계산과는 무관하다(logic/outfit.js).
  const outfit = createOutfit();
  let wearing = null; // 새 셔츠를 입는 중 { t, swapped }

  const once = createOnce(); // 페이지를 연 뒤 한 번만 보내는 분석 이벤트(game_start)
  let emptyInfo = null; // 지수 0 에 닿은 순간의 { stress, actions } (결과 이미지에 쓴다)
  let pending = null; // 띄우기를 기다리는 팝업 { kind: 'side' | 'modal', info, wait }. wait 는 행동이 끝난 뒤부터 센다.

  // 지수가 처음 목표치 이하(측면 팝업)·처음 0(가운데 팝업)이 되는 호출에서 한 번씩 불린다(다시 하기 뒤 새 판에서는 또). 둘이 한꺼번에 오면 가운데 팝업만.
  // 팝업은 진행 중인 행동이 끝난 뒤에 띄운다. 가운데 팝업은 자동을 끄고, 측면 팝업은 플레이에 아무 영향도 주지 않는다.
  function onResultPlan(plan, justGoal, value) {
    const info = { stress: value, actions: gameState.actionsDone };
    if (justGoal) track('goal_reached', { ...info });
    if (plan === 'modal') {
      runner.cancelAuto();
      emptyInfo = info;
      track('game_clear', { ...info });
    }
    pending = { kind: plan, info, wait: CLEAR_POPUP_DELAY };
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
    const { value, justGoal, justEmpty } = gameState.apply(amount, { counts });
    hud.updateStressBar(value);
    if (before - value > 0) popDelta(`-${before - value}`);
    const plan = resultPlan({ justGoal, justEmpty });
    if (plan !== 'none') onResultPlan(plan, justGoal, value);
  }

  // ---- 소각장 행동: 러너가 시간을 재고, 여기서 캐릭터 동작·종이·효과를 맡는다. ----
  // 한숨 -> 주머니에서 종이 꺼내기 -> (대상 쪽으로 돌기) -> 던지기/치기 -> 후련. 던지기/치기 클립만 총 길이가 ACTION_TARGET_SECONDS 가 되도록 느려진다.
  const { durations, speeds } = fitDurations(character ? character.getRawClipDurations() : FALLBACK_RAW_DURATIONS, ACTION_TURN_SECONDS, ACTION_TARGET_SECONDS);
  let currentZone = null; // 플레이어가 안에 있는 행동 구역(자유 상태일 때만). 행동 막대·숫자 키·자동이 이 구역을 따른다.
  const runner = createRunner({
    durations, turnSeconds: ACTION_TURN_SECONDS, effectAt: ACTION_EFFECT_AT, autoGap: AUTO_GAP,
    canStart: (id) => inRangeFor(id), autoActions: () => zoneActions(currentZone),
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
  // 손에 드는 소품은 행동마다 하나를 모든 단계에서 재사용한다: 주머니(player 기준) -> 손(handAttach) -> 날아가기(scene). 행동이 끝나면 항상 숨긴다.
  // 태우기·파쇄는 종이, 세탁은 구겨진 셔츠, 널기는 깨끗한 흰 셔츠. 모두 같은 오른손 자리(handAttach)에 붙는다.
  const paper = buildPaper(0.4, 0.53);
  paper.userData.rot = [Math.PI / 2, 0, 0];
  const dirtyShirt = buildCrumpledShirt();
  dirtyShirt.userData.rot = [0, 0, 0];
  const cleanShirt = buildCleanShirt();
  cleanShirt.userData.rot = [0, 0, 0];
  const HELD_BY_ACTION = { burn: paper, shred: paper, wash: dirtyShirt, hang: cleanShirt };
  let held = paper;
  for (const item of [paper, dirtyShirt, cleanShirt]) {
    item.visible = false;
    handAttach.add(item);
  }

  function placePaperInHand() {
    handAttach.add(held);
    held.position.set(...PAPER_HAND.pos);
    held.rotation.set(...held.userData.rot);
    held.scale.setScalar(1);
  }
  placePaperInHand();

  let flight = null; // 날아가는 소품 { kind: 'burn' | 'shred' | 'wash', from, to, t, dur, startScale, washer }
  let pull = null; // 주머니에서 꺼내는 중 { t, dur }
  let crumple = null; // 태우기에서 종이를 구기는 중 { t, dur }
  let actionId = null;
  const tmpFrom = new THREE.Vector3();
  const tmpHand = new THREE.Vector3();
  const pocketPos = new THREE.Vector3(...POCKET.pos);
  const pocketQuat = new THREE.Quaternion(); // 주머니에서의 방향(소품의 손 방향과 같다: 종이는 세워서 앞(+z)을 향하게)
  let washIndex = 0; // 세탁이 향하는 세탁기(돌기 단계에서 가장 가까운 것으로 정한다)
  let hangCount = 0; // 지금까지 널은 횟수(널린 셔츠 칸과 색을 정한다)
  const tmpHeld = new THREE.Vector3();
  const tmpQuat = new THREE.Quaternion();
  const tmpQuat2 = new THREE.Quaternion();
  const heldQuat = new THREE.Quaternion();
  const tmpEuler = new THREE.Euler();

  // 회전 단계의 대상 지점과 사정거리 계산. 세탁은 가장 가까운 세탁기, 널기는 빨랫줄 가운데가 대상이다.
  const distTo = (t) => Math.hypot(player.position.x - t.x, player.position.z - t.z);
  const nearestWasher = () => interior.washers[Math.max(0, nearestIndex(player.position, interior.washers))];
  const pointOf = (name) => ({
    fire: FURNACE, shredder: layout.shredder, washer: nearestWasher(), clothesline: interior.clothesline.centre,
  })[name];
  const RANGES = { fire: FIRE_RANGE, shredder: SHREDDER_RANGE, washer: WASHER_RANGE, clothesline: CLOTHESLINE_RANGE };
  // 각 행동은 대상(소각로·파쇄기·세탁기·빨랫줄)이 사정거리 안일 때만 할 수 있다(어느 방향에서든).
  const inRangeFor = (id) => canPerform(id, {
    fire: distTo(FURNACE), shredder: distTo(layout.shredder), washer: distTo(nearestWasher()), clothesline: distTo(interior.clothesline.centre),
  }, RANGES);

  // 소품을 숨기고 손에 되돌려 놓는다(행동이 끝났거나 취소됐을 때).
  function clearPaper() {
    pull = null;
    crumple = null;
    flight = null;
    placePaperInHand();
    held.visible = false;
  }

  // 러너의 단계 시작: 클립 재생 또는 회전(제자리에서 대상 쪽으로, 대기 자세).
  function onStep({ action, index, step }) {
    if (index === 0) {
      if (once('game_start')) track('game_start');
      actionId = action;
      held = HELD_BY_ACTION[action];
      if (action === 'wash') dirtyShirt.userData.setSoiled(outfit.state === 'dirty'); // 그을음 옷을 빨 때는 어둡고 더러운 셔츠
      pocketQuat.setFromEuler(tmpEuler.set(...held.userData.rot));
      character?.beginAction();
    }
    if (step.kind === 'turn') {
      const t = pointOf(step.target);
      if (step.target === 'washer') washIndex = interior.washers.indexOf(t);
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
      handAttach.add(held); // 손 기준으로 움직여 손에 닿을 때 튀지 않는다.
      held.scale.setScalar(POCKET_SCALE);
      held.visible = true;
      updatePaper(0);
    } else if (step.effect && action === 'burn') {
      crumple = { t: 0, dur: step.seconds * CRUMPLE_FRACTION }; // 던지기 앞부분에서 종이를 구긴다
    }
  }

  // 소품이 완전히 나왔다(pick-up 단계의 eventAt): 손에 쥔다.
  function onPaperOut() {
    pull = null;
    placePaperInHand();
    held.visible = true;
  }

  // 효과 순간: 지수 -ACTION_REDUCE, 그리고 행동별 연출(소품이 손을 떠난다 / 빨래가 줄에 걸린다).
  function onEffect(id) {
    track('action_done', { action: id });
    applyReduction(ACTION_REDUCE);
    crumple = null;
    changeOutfit(outfit.onAction(id));
    if (id === 'hang') {
      // 깨끗한 셔츠가 줄에 걸려 흔들린다. 손의 셔츠는 사라진다. 나시만 입은 채 널면 내 새 흰 셔츠가 전용 칸에 걸리고,
      // 아니면 파스텔 셔츠(가득 차면 가장 오래된 것을 바꾼다. 내 셔츠 칸은 건너뛴다)가 걸린다.
      if (outfit.state === 'drying' && laundry.clothesline.mineSlot() < 0) laundry.clothesline.hangMine(MY_SHIRT_SLOT);
      else laundry.clothesline.hang(hangCount++, hasMyShirt(outfit.state) ? MY_SHIRT_SLOT : -1);
      held.visible = false;
      return;
    }
    held.visible = true;
    held.getWorldPosition(tmpFrom);
    const startScale = held.scale.x;
    scene.attach(held);
    flight = {
      kind: id, from: tmpFrom.clone(), to: new THREE.Vector3(), t: 0, startScale, washer: washIndex,
      dur: id === 'burn' ? PAPER_FLIGHT_SEC : id === 'wash' ? SHIRT_FLIGHT_SEC : PAPER_SLIDE_SEC,
    };
    if (id === 'burn') {
      flight.to.set(FURNACE.x, PAPER_FIRE_Y, FURNACE.z);
    } else if (id === 'wash') {
      laundry.washers.entryWorld(washIndex, flight.to);
    } else {
      shredder.slotWorld(flight.to);
      shredder.wiggle();
      shredder.spawnStrips();
    }
  }

  // 옷 상태가 바뀌었으면(newState) 캐릭터 겉모습을 맞추고 분석 이벤트를 보낸다.
  function changeOutfit(newState) {
    if (!newState) return;
    character?.applyOutfit(outfit.state);
    if (newState === 'dirty') track('outfit_dirty');
  }

  // 마른 새 셔츠 입기(E): 모드를 'wearing' 으로 잠그고(이동·클릭·E 무시, 자동 해제) 줄 쪽으로 돌아 팔을 올리는 동작을 한다.
  // 동작 중간(WEAR_SWAP_AT)에 셔츠가 줄에서 사라지고 정장으로 바뀌며, 끝나면 "면접 갈 준비 완료" 팝업을 띄운다.
  function startWear() {
    if (!outfit.canWear() || !dispatch('wear:start')) return;
    stopWalking();
    runner.cancelAuto();
    renderer.domElement.style.cursor = '';
    hud.hideTooltip();
    hud.hideBubble();
    wearing = { t: 0, swapped: false };
    if (character) {
      const c = interior.clothesline.centre;
      character.beginAction();
      character.turnToward(c.x, c.z, WEAR_SECONDS * 0.3);
      character.playClip('interact-right', (FALLBACK_RAW_DURATIONS['interact-right'] ?? 0.667) / WEAR_SECONDS);
    }
  }

  function updateWear(dt) {
    if (!wearing) return;
    wearing.t += dt;
    if (!wearing.swapped && wearing.t >= WEAR_SECONDS * WEAR_SWAP_AT) {
      wearing.swapped = true;
      outfit.wear();
      laundry.clothesline.removeMine();
      character?.applyOutfit(outfit.state);
      track('outfit_ready');
    }
    if (wearing.t >= WEAR_SECONDS) {
      wearing = null;
      character?.endAction();
      dispatch('wear:end');
      showReadyPopup();
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

  // 행동 요청(막대 클릭·숫자 키). 막대가 보이는 구역 안의 자유 상태에서 쉬는 중이고 사정거리 안일 때만 시작한다.
  function requestAction(id) {
    if (mode !== 'free' || runner.isBusy() || !ACTIONS[id] || !currentZone || ACTIONS[id].zone !== currentZone.id || !inRangeFor(id)) return false;
    stopWalking();
    return runner.start(id); // 첫 단계(한숨)는 이 프레임의 update 에서 시작된다.
  }

  function toggleAuto() {
    if (runner.autoOn) {
      runner.cancelAuto();
      return;
    }
    // 이 구역에서 다음에 할 행동(기록이 없으면 구역의 첫 행동)을 할 수 없는 자리면 켜지지 않는다.
    const next = runner.nextAutoAction();
    if (mode === 'free' && next && inRangeFor(next)) runner.setAuto(true);
  }

  // 소품 상태 갱신: 주머니에서 손으로 올라오기, 태우기의 구기기, 날아가기(태우기·파쇄·세탁).
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
      held.position.lerpVectors(tmpHand, tmpHeld.set(...PAPER_HAND.pos), e);
      handAttach.getWorldQuaternion(tmpQuat);
      player.getWorldQuaternion(tmpQuat2);
      tmpQuat.invert().multiply(tmpQuat2).multiply(pocketQuat); // 주머니에서의 방향을 손 기준으로
      held.quaternion.copy(tmpQuat).slerp(heldQuat.setFromEuler(tmpEuler.set(...held.userData.rot)), e);
      held.scale.setScalar(POCKET_SCALE + (1 - POCKET_SCALE) * e);
    }
    if (crumple) {
      crumple.t += dt;
      const k = Math.min(1, crumple.t / crumple.dur);
      held.scale.setScalar(1 - (1 - CRUMPLE_SCALE) * easeInOut(k));
      held.rotation.y += CRUMPLE_SPIN * dt;
    }
    if (!flight) return;
    flight.t += dt;
    const k = Math.min(1, flight.t / flight.dur);
    held.position.lerpVectors(flight.from, flight.to, k);
    if (flight.kind === 'burn') {
      held.position.y += PAPER_ARC * Math.sin(Math.PI * k);
      held.rotation.x += 14 * dt;
      held.rotation.z += 9 * dt;
      held.scale.setScalar(flight.startScale * (1 - 0.5 * easeInOut(k)));
    } else if (flight.kind === 'wash') {
      held.position.y += SHIRT_ARC * Math.sin(Math.PI * k); // 포물선으로 세탁기 투입구에 들어간다
      held.rotation.x += 10 * dt;
      held.rotation.z += 6 * dt;
      held.scale.setScalar(flight.startScale * (1 - 0.7 * easeInOut(k)));
    } else {
      held.scale.setScalar(flight.startScale * (1 - 0.9 * easeInOut(k)));
    }
    if (k >= 1) {
      if (flight.kind === 'burn') fire.flare(); // 종이가 불에 닿는 순간
      if (flight.kind === 'wash') laundry.washers.splash(flight.washer); // 셔츠가 들어간 순간 세탁기가 흔들리고 거품이 올라온다
      clearPaper();
    }
  }

  // 매 프레임: AUTO 유효성 확인 -> 러너 진행(효과/끝 처리) -> 손 소품·날아가는 종이 -> 행동 막대·불멍 안내·불멍 감소.
  function updateActions(dt) {
    // 지금 있는 행동 구역(가장 가까운 구역 안, 없으면 null). 걷는 중에도 구역이 바뀌면 행동 막대가 바뀐다.
    currentZone = mode === 'free' ? activeZone(player.position, zones, spaceId) : null;
    // AUTO 해제 조건: 걷기 시작·앉기·포춘·구역 밖(진행 중인 행동은 끝까지 한다). 다음 행동의 사정거리 밖이면 러너가 canStart 로 끈다.
    if (runner.autoOn && (mode !== 'free' || moveTarget || !currentZone)) runner.cancelAuto();
    for (const e of runner.update(dt)) {
      if (e.type === 'step') onStep(e);
      else if (e.type === 'paperOut') onPaperOut();
      else if (e.type === 'effect') onEffect(e.action);
      else onDone();
    }
    updatePaper(dt);

    const meditating = mode === 'seated' && Boolean(seatItem) && Math.hypot(seatItem.x - FURNACE.x, seatItem.z - FURNACE.z) <= FIRE_ZONE_RADIUS;
    const relief = passive.update(dt, meditating);
    if (meditating && once('game_start')) track('game_start');
    if (relief > 0) applyReduction(relief, false); // 불멍은 소각 횟수에 넣지 않는다
    if (pending && !runner.isBusy() && (pending.kind === 'side' || (mode !== 'fortune' && mode !== 'transition' && mode !== 'wearing'))) {
      pending.wait -= dt;
      if (pending.wait <= 0) {
        const { kind, info } = pending;
        pending = null;
        if (kind === 'side') showSidePopup(info);
        else showResult();
      }
    }
    if (currentZone) {
      const ids = zoneActions(currentZone);
      if (!hud.isActionBarVisible() || hud.actionBarZone() !== currentZone.id) {
        hud.showActionBar({
          zoneId: currentZone.id, buttons: ids.map((id) => ({ id, key: ACTIONS[id].key, label: ACTIONS[id].label })),
          onAction: requestAction, onToggleAuto: toggleAuto,
        });
      }
      const state = { auto: runner.autoOn, busy: runner.isBusy() };
      for (const id of ids) state[id] = inRangeFor(id);
      hud.updateActionBar(state);
    } else if (hud.isActionBarVisible()) {
      hud.hideActionBar();
    }
    if (meditating) hud.showMeditate();
    else hud.hideMeditate();
  }

  // 장애물 밖으로 밀어낸 목표 지점으로 이동을 시작한다.
  function walkTo(point) {
    abortAction();
    const p = pushOut(clampToSpace(point, spaceId, PLAYER.radius + 0.5));
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

  // ---- 측면 팝업(목표 달성)·가운데 팝업(지수 0)과 캐치 칩 ----
  function openCatch(place) {
    window.open(CATCH_URL, '_blank', 'noopener');
    track('banner_click', { place });
  }

  async function saveResultImage() {
    try { renderer.render(scene, camera); } catch (err) { console.warn('저장용 화면을 그리지 못했습니다.', err); } // 같은 틱에서 바로 복사해야 캔버스가 비지 않는다.
    const { stress, actions } = emptyInfo;
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
    hud.closeSidePopup();
    pending = null;
    emptyInfo = null;
    outfit.reset(); // 옷도 처음으로: 정장, 줄의 내 셔츠 제거, 마르는 시간 취소
    wearing = null;
    laundry.clothesline.removeMine();
    character?.applyOutfit(outfit.state);
    track('game_restart');
  }

  const showChip = () => hud.showCtaChip(() => openCatch('chip'));

  // 측면 팝업: 모드·자동·입력은 그대로 두고 카드만 띄운다. 닫으면(✕) 우상단 칩이 남는다.
  // 측면 자리는 하나뿐이라 열려 있는 다른 측면 팝업(면접 준비 완료)이 있으면 그것을 대체한다(겹쳐 뜨지 않는다).
  function showSidePopup({ stress }) {
    hud.openSidePopup({
      stress,
      onCta: () => openCatch('side'),
      onClose: () => { hud.closeSidePopup(); showChip(); },
    });
  }

  // 면접 갈 준비 완료 팝업(새 셔츠를 입을 때마다). 주 버튼은 캐치를 새 탭으로 열고, 보조 버튼과 ✕ 는 닫는다.
  // 열려 있는 목표 달성 팝업이 있으면 그것을 대체한다(칩은 남긴다). 가운데 팝업이 떠 있으면 겹치지 않게 건너뛴다.
  function showReadyPopup() {
    if (hud.isResultOpen()) return;
    if (hud.sidePopupKind() === 'goal') showChip();
    hud.closeSidePopup();
    hud.openReadyPopup({
      onCta: () => { window.open(CATCH_URL, '_blank', 'noopener'); track('cta_click', { source: 'outfit_ready' }); },
      onLater: () => hud.closeSidePopup(),
      onClose: () => hud.closeSidePopup(),
    });
  }

  function showResult() {
    if (!dispatch('open:result')) return; // 앉아 있었으면 일어나고, 자동·진행 중인 행동은 이미 멈춰 있다.
    hud.closeSidePopup(); // 측면 팝업이 아직 열려 있으면 먼저 숨긴다.
    stopWalking();
    controls.setEnabled(false);
    renderer.domElement.style.cursor = '';
    hud.hideTooltip();
    hud.hideBubble();
    showChip();
    hud.openResult({
      onCta: () => openCatch('modal'), onSave: saveResultImage, onCopy: copyAddress, onContinue: closeResult, onRestart: restart,
    });
  }

  // ---- 공간 전환(차원문) ----
  // 문에서 E: 모드를 'transition' 으로 잠그고(이동·클릭·E·행동 모두 무시, 자동 해제) 닫는 구간을 시작한다. 중간(화면이 덮인 순간)에 swapSpace 가 공간을 바꾼다.
  function startSpaceChange(toId) {
    if (toId === spaceId || !spaceData[toId] || transition.active) return false;
    if (!dispatch('transition:start')) return false; // free 에서만(앉아 있으면 먼저 일어나야 한다)
    stopWalking();
    runner.cancelAuto();
    renderer.domElement.style.cursor = '';
    hud.hideTooltip();
    hud.hideBubble();
    transitionTarget = toId;
    transition.start();
    return true;
  }

  // 화면이 완전히 덮인 순간: 공간을 바꾸고 도착 지점에 세운다. 카메라 추적 대상을 새 위치로 곧장 옮긴다(긴 미끄러짐 없음).
  function swapSpace(toId) {
    const from = spaceId;
    spaceId = toId;
    spaces.apply(toId);
    const arrival = arrivalPoint(toId, from);
    player.position.set(arrival.x, 0, arrival.z);
    player.rotation.y = arrival.rotY;
    stopWalking();
    runner.cancelAuto();
    targetPos.set(player.position.x, ORBIT.targetHeight, player.position.z);
    if (toId === 'yard') track('exit_space', { space: from });
    else track('enter_space', { space: toId });
  }

  // E 키: 포춘 모달이면 깨기/닫기, 앉은 상태면 일어나기, 아니면 가장 가까운 대상의 동작(소각로는 E 동작이 없다).
  function onInteractKey() {
    if (mode === 'fortune') {
      const stage = hud.fortuneStage();
      if (stage === 'cookie') hud.crackFortune();
      else if (stage === 'card') dispatch('close');
      return;
    }
    if (runner.isBusy() || mode === 'transition' || mode === 'wearing') return; // 행동·전환·옷 갈아입기 중에는 E 동작을 하지 않는다.
    if (mode === 'seated') { dispatch('interact'); return; }
    const item = nearestInRange(player.position, here().interactables);
    if (!item) return;
    const { type } = actionOf(item);
    if (type === 'enter' || type === 'exit') startSpaceChange(item.to);
    else if (type === 'wear') startWear();
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

  // 숫자 키 1·2 는 지금 구역의 첫째·둘째 행동(구역 밖이면 아무 일도 없다).
  const ACTION_KEYS = { Digit1: 0, Numpad1: 0, Digit2: 1, Numpad2: 1 };
  window.addEventListener('keydown', (e) => {
    if (mode === 'transition' || mode === 'wearing') return; // 전환·옷 갈아입기 중에는 모든 키를 무시한다.
    if (mode === 'result') { // 종료 화면 중에는 Esc(계속 둘러보기)만 받는다.
      if (e.code === 'Escape') closeResult();
      return;
    }
    if (e.code === 'KeyE') {
      if (!e.repeat) onInteractKey();
    } else if (e.code === 'Escape') {
      dispatch('close');
    } else if (e.code in ACTION_KEYS) {
      if (!e.repeat) requestAction(zoneActions(currentZone)[ACTION_KEYS[e.code]]);
    } else if (e.code === 'KeyR') {
      if (!e.repeat) toggleAuto();
    }
  });

  // 화면 좌표(ndc)에 보이는 상호작용 대상(없으면 null).
  function pickInteractable(ndc) {
    raycaster.setFromCamera(new THREE.Vector2(ndc.x, ndc.y), camera);
    const hit = raycaster.intersectObjects(here().pickables, false)[0];
    return hit ? here().interactables.find((i) => i.id === hit.object.userData.interactId) : null;
  }

  const controls = createControls(renderer.domElement, {
    onDrag: (dx, dy) => {
      if (mode === 'transition') return;
      orbit = applyDrag(orbit, dx, dy, ORBIT.rotateSpeed, ORBIT);
      renderer.domElement.style.cursor = '';
      hud.hideTooltip();
    },
    onWheel: (deltaY) => { if (mode !== 'transition') orbit = applyZoom(orbit, deltaY, ORBIT.zoomStep, ORBIT); },
    // 클릭하면 그 지점/오브젝트로 걸어간다(도착해도 아무 일도 일어나지 않는다. 동작은 E 키). 앉아 있으면 먼저 일어난다.
    // 행동 중에는 이동 클릭을 무시하고, 쉬는 중의 이동 클릭은 자동을 끈다.
    onClick: (ndc) => {
      if (mode === 'fortune' || mode === 'transition' || mode === 'wearing' || runner.isBusy()) return;
      const item = pickInteractable(ndc);
      let target = item && interactTarget(item);
      if (!target) {
        raycaster.setFromCamera(new THREE.Vector2(ndc.x, ndc.y), camera);
        const hit = raycaster.intersectObject(here().ground)[0];
        if (!hit) return;
        target = { x: hit.point.x, z: hit.point.z };
      }
      runner.cancelAuto();
      dispatch('move');
      walkTo(target);
    },
    onHover: (ndc, clientX, clientY) => {
      const item = ndc && mode !== 'transition' && pickInteractable(ndc);
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
    if (transition.active) {
      for (const ev of transition.update(dt)) {
        if (ev === 'mid') swapSpace(transitionTarget);
        else dispatch('transition:end');
      }
      hud.setPortal(transition.radius());
    }
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
    outfit.update(dt); // 널어 둔 새 셔츠는 밖에 나가 있어도 마른다
    updateWear(dt);
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
    // 빨랫줄 곁은 옷 상태가 정한다: 마른 새 셔츠가 있을 때만 E, 마르는 중이면 누를 수 없는 힌트, 그 밖에는 안내 없음.
    let nextPrompt = null;
    let actionable = true;
    if (promptAllowed(mode)) {
      if (mode === 'seated') nextPrompt = '일어나기';
      else {
        const near = nearestInRange(player.position, here().interactables);
        const act = near && actionOf(near);
        if (act?.type === 'wear') {
          const p = outfitPrompt(outfit.state, outfit.secondsLeft);
          nextPrompt = p ? p.text : null;
          actionable = p?.actionable ?? true;
        } else nextPrompt = act ? act.prompt : null;
      }
    }
    const promptKey = nextPrompt && (actionable ? nextPrompt : `~${nextPrompt}`);
    if (promptKey !== promptText) {
      promptText = promptKey;
      if (nextPrompt) hud.showPrompt(nextPrompt, actionable);
      else hud.hidePrompt();
    }
    character?.update(dt);
    laundry.update(dt);

    const k = 1 - Math.exp(-ORBIT.followSpeed * dt);
    desired.set(player.position.x, ORBIT.targetHeight, player.position.z);
    targetPos.lerp(desired, k);
    camera.position.set(...orbitPosition(targetPos.toArray(), orbit));
    camera.lookAt(targetPos);
    if (spaceId === 'yard') updateTreeOcclusion(camera.position, targetPos, dt); // 나무 가림 축소는 마당에서만
    else inside.updateWalls(camera.position); // 실내: 카메라 쪽 벽을 숨긴다
  });
}
