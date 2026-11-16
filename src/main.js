import * as THREE from 'three';
import { isMobileUA, multiplayerMode } from './env.js';
import { createStage } from './stage.js';
import { applyAtmosphere } from './atmosphere.js';
import { loadModels, loadGltf } from './assets.js';
import { buildDecor } from './decor.js';
import { buildLayout } from './logic/layout.js';
import {
  buildGround, buildCity, buildBoundary, buildFurnace, buildPlayer, buildSign, buildMarker, buildPickables,
  buildShredder, MARKER_Y,
} from './world.js';
import { createPlayer } from './player.js';
import { createFire } from './fire.js';
import { buildItemProp, buildItemIcon, createGlitter } from './incineratorProps.js';
import { itemsFor, pickIndexFromCode, variantOf, isFlameItem, lineFor, pickRandomItem, poseFor } from './logic/incinerator.js';
import { createHud } from './hud.js';
import { interactTarget, hoverLabel, nearestInRange, actionOf, standPoint } from './logic/interaction.js';
import { nextMode, holdsSeat, showPrompt as promptAllowed } from './logic/playerMode.js';
import { occupiedSeats, seatOfRemote, seatPromptFor, SEAT_OCCUPIED_RADIUS } from './logic/seats.js';
import { pickFortune } from './logic/fortune.js';
import { createControls } from './controls.js';
import { createGameState } from './logic/gameState.js';
import { ACTION_DEFS, createRunner, fitDurations, canPerform } from './logic/actions.js';
import { buildZones, currentZoneFor, zoneActions, autoActionsOf } from './logic/zones.js';
import { nearestIndex } from './logic/laundry.js';
import { buildBuildings, buildCleanShirt, buildCrumpledShirt, LAUNDRY_MODEL_ITEMS } from './laundry.js';
import { buildInteriorLaundry, INTERIOR_MODEL_ITEMS } from './interiorLaundry.js';
import { buildInteriorInterview, INTERVIEW_MODEL_ITEMS } from './interiorInterview.js';
import { createInterviewers } from './interviewers.js';
import { createCrew } from './interviewCrew.js';
import { createInterviewScene } from './interviewScene.js';
import { createFx } from './actor.js';
import { createSpaces } from './spaces.js';
import { buildLaundryInterior, buildInterviewInterior } from './logic/interiors.js';
import { arrivalPoint, clampToSpace } from './logic/spaces.js';
import { createTransition } from './logic/transition.js';
import { createRoast, canRoast, gaugeMap, colorAt, classify, stageLine, resultLine } from './logic/marshmallow.js';
import { createRoastStick } from './marshmallowProps.js';
import { createOnce } from './logic/once.js';
import { shareLines, shareFilename, shareUrl, resultPlan } from './logic/cta.js';
import { createOutfit, outfitPrompt, laundryGuide } from './logic/outfit.js';
import { createLine } from './logic/line.js';
import { makeId } from './logic/net.js';
import { initAnalytics, track } from './analytics.js';
import { renderShareCard, saveShareCard, copyText } from './share.js';
import { easeInOut } from './logic/burn.js';
import {
  ORBIT, CAMERA_CLEAR, TRANSITION, PLAYER, PLAYER_MODEL, FURNACE, STRESS, SPAWN, SEED, COMFORT_MESSAGES, FORTUNES,
  INCINERATOR, ACTION_REDUCE, ACTION_EFFECT_AT, ACTION_TARGET_SECONDS, ACTION_TURN_SECONDS, AUTO_GAP, MARSHMALLOW,
  FIRE_RANGE, SHREDDER_RANGE, WASHER_RANGE, CLOTHESLINE_RANGE, FIRE_ZONE_RADIUS, CATCH_URL, GA_MEASUREMENT_ID, WEAR_SECONDS, WEAR_SWAP_AT,
  INTERVIEW, INTERVIEW_ROUND, INTERVIEW_BONUS, INTERVIEW_ZONE_RADIUS, INTERVIEW_ANSWER_SECONDS, INTERVIEW_IMPROV_SECONDS, INTERVIEW_FINALE_SECONDS, SPEECH_SECONDS,
  MULTIPLAYER, SUPABASE_URL, SUPABASE_ANON_KEY, CLOTHESLINE_SLOTS, QUICK_CHAT,
} from './config.js';
import { isTypingTarget } from './logic/typing.js';
import { createQuickChat } from './quickChat.js';
import { applyDrag, applyZoom, orbitPosition, frontAzimuthDeg } from './logic/orbit.js';
import { createCameraClear, buildingBoxes } from './logic/cameraClear.js';
import { stepToward, pushOutOfCircle, headingY } from './logic/movement.js';
import { createFootstepper, surfaceAt, STEP_SOUND, FOOTSTEP_STRIDE, FOOTSTEP_JITTER } from './logic/audioPolicy.js';
import { sfx } from './audio/sfx.js';
import { createSoundButton } from './audio/soundButton.js';
import { createKeyState, isMoveKey, isArrowKey, shouldIgnoreKey } from './logic/keyMove.js';
import { createGuideHud } from './guideHud.js';

const MAX_DT = 0.1; // 한 프레임에 진행하는 최대 시간(초). 탭이 멈췄다 돌아와도 행동·애니메이션이 한꺼번에 튀지 않게 한다.
const FALLBACK_RAW_DURATIONS = { 'emote-no': 0.667, 'pick-up': 0.333, 'attack-melee-right': 0.417, 'interact-right': 0.667, 'interact-left': 0.667, 'emote-yes': 0.667, 'holding-right': 0.167, 'holding-both': 0.167 }; // 캐릭터 모델이 없을 때(모델의 실제 클립 길이)
const SHRED_SCALE = 1.1; // 투입구 위에 세운 종이의 크기 배율
const SHRED_PALETTE = ['#fffefa', '#f2f1ec', '#e8e6dc']; // 조각 색의 바탕(종이 흰색). 물건의 표식 색이 여기에 섞인다
const STAND_HOLD = 0.35; // 걸어가는 단계의 끝부분(비율): 이때 파쇄기 쪽으로 몸을 돌려 선다
const SPEECH_KEY = 'line-self'; // 소각장 멘트 말풍선 id
const LINE_SECONDS = 2.2; // 멘트가 떠 있는 시간(초)
const SHOW_SCALE = 1.5; // 물건을 들여다볼 때 종이를 키우는 배율(멀리서도 읽히게)
const SHOW_LIFT = 0.65; // 들여다볼 때 종이를 올리는 높이(월드 단위)
const SHOW_FORWARD = 0.8; // 들여다볼 때 종이를 카메라 쪽으로 내미는 거리(캐릭터 뒤에서 봐도 몸 앞으로 나오게)
const SHOW_SIDE = 0.5; // 들여다볼 때 종이를 화면 오른쪽으로 비키는 거리(몸·머리와 겹치지 않게)
const EMBER_AT = [0.0, 0.45]; // 지켜보는 단계에서 불씨를 띄우는 시각(초)
const PAPER_ARC = 0.6; // 던질 때 포물선이 올라가는 높이
const PAPER_FIRE_Y = 0.9; // 종이가 도착하는 불 위 높이
const WASH_GUIDE_TAIL = 1.6; // 셔츠가 세탁기에 들어간 뒤 "세탁 중" 안내를 더 보이는 시간(초: 덜컹거림이 끝날 때까지)
const SHIRT_FLIGHT_SEC = 0.45; // 구겨진 셔츠가 세탁기까지 날아가는 시간
const SHIRT_ARC = 0.8; // 셔츠가 날아갈 때 포물선 높이
const POP_HEIGHT = 1.6; // -3 팝업이 뜨는 머리 위 높이
// 재킷 가슴 주머니(캐릭터 기준 로컬: 왼쪽 가슴 = +x, 키의 55% 높이, 살짝 앞). 종이는 여기서 작게 시작해 손으로 올라온다.
const POCKET = { pos: [0.13, 0.6, 0.2] };
const POCKET_SCALE = 0.3;
const CLEAR_POPUP_DELAY = 0.3; // 클리어한 행동이 끝난 뒤 팝업이 뜨기까지(초)
const SHARE_FOOTER = 'Catch World · 학사 과제용 비공식 프로젝트';
const CRUMPLE_SCALE = 0.8; // 구긴 종이의 크기
const CRUMPLE_SPIN = 18; // 구길 때 도는 속도(라디안/초)
// 손에 든 소품(종이·셔츠)의 위치(손 뼈 기준, 단위는 월드 단위). 화면으로 보며 맞춘 값이다. 방향은 소품마다 userData.rot(주머니에서도 같은 방향).
const PAPER_HAND = { pos: [-0.38, 0, 0.05] };

if (isMobileUA(navigator.userAgent)) {
  document.getElementById('mobile-notice').style.display = 'flex';
} else {
  initAnalytics(GA_MEASUREMENT_ID);
  const { scene, camera, renderer, onFrame } = createStage(document.getElementById('game'));
  renderer.localClippingEnabled = true; // 파쇄: 투입구로 들어간 종이의 아랫부분을 클리핑 평면으로 가린다
  const layout = buildLayout(SEED);
  const interior = buildLaundryInterior(); // 세탁소 실내 데이터(마당에서 멀리 떨어진 좌표)
  const interviewData = buildInterviewInterior(); // 면접장 실내 데이터
  const loading = document.getElementById('loading');

  let models = new Map();
  let characterGltf = null;
  const interviewerGltfs = {}; // 면접관 id -> gltf(못 불러오면 null/없음)
  try {
    const all = [...Object.values(layout).filter(Array.isArray).flat(), ...layout.interactables.map((i) => i.item), ...LAUNDRY_MODEL_ITEMS, ...INTERIOR_MODEL_ITEMS, ...INTERVIEW_MODEL_ITEMS].filter((it) => it?.pack);
    [models, characterGltf] = await Promise.all([loadModels(all), loadGltf('characters', PLAYER_MODEL.name)]);
    await Promise.all(INTERVIEW.interviewers.map(async (c) => { interviewerGltfs[c.id] = await loadGltf('characters', c.model); }));
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
  buildBuildings(yardRoot, layout);
  const inside = buildInteriorLaundry(scene, interior, models);
  const insideInterview = buildInteriorInterview(scene, interviewData, models);
  const laundry = { washers: inside.washers, clothesline: inside.clothesline, update: (dt) => inside.update(dt) };
  const zones = buildZones(layout, interior, interviewData);
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
  createSoundButton(document.getElementById('game'), sfx); // 우상단 효과음 켜기/끄기(M 키도 같다). 소리는 첫 입력 뒤에야 난다
  let guideStorage = null;
  try { guideStorage = window.localStorage; } catch { /* 저장소 접근 불가: 안내는 매번 처음처럼 */ }
  const helpGuide = createGuideHud(document.getElementById('game'), { storage: guideStorage }); // 조작 안내 카드와 "?" 버튼(H 키)
  sfx.setFire(FURNACE); // 모닥불 지글거림은 소각로에 가까울수록 커진다

  // 공간별 데이터: 클릭 레이캐스트 바닥, 클릭/호버 판정 부피, 상호작용 대상, 장애물. 이동·클릭·E 안내는 항상 지금 공간의 것을 쓴다.
  const spaceData = {
    yard: { ground, pickables: buildPickables(yardRoot, layout.interactables), interactables: layout.interactables, obstacles: [FURNACE, ...layout.obstacles] },
    laundry: { ground: inside.ground, pickables: inside.pickables, interactables: interior.interactables, obstacles: interior.obstacles },
    interview: { ground: insideInterview.ground, pickables: insideInterview.pickables, interactables: interviewData.interactables, obstacles: interviewData.obstacles },
  };
  const interiorViews = { laundry: inside, interview: insideInterview }; // 실내 공간 id -> 그리는 쪽(벽 숨기기 등)
  const spaces = createSpaces({
    scene,
    spaces: {
      yard: { root: yardRoot, fog: yardFog, background: null },
      laundry: { root: inside.root, fog: inside.fog, background: inside.background },
      interview: { root: insideInterview.root, fog: insideInterview.fog, background: insideInterview.background },
    },
  });
  let spaceId = 'yard';
  const here = () => spaceData[spaceId];
  // 첫 전환에서 셰이더가 새로 컴파일되어 멈칫하지 않도록 두 공간의 조명 상태로 미리 컴파일해 둔다.
  for (const id of ['laundry', 'interview', 'yard']) {
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
  const keys = createKeyState(); // 눌린 이동 키(WASD·방향키)
  let mode = 'free'; // 'free' | 'seated' | 'fortune' | 'result' | 'transition' | 'wearing' | 'interview-choice' | 'interview-play' | 'item-choice' | 'roasting' (전이는 logic/playerMode.js)
  const transition = createTransition(TRANSITION); // 공간 전환(차원문) 상태 기계
  const cameraClear = createCameraClear(CAMERA_CLEAR); // 마당에서 건물이 플레이어를 가리면 카메라를 천천히 돌려 피한다(config 의 CAMERA_CLEAR 로 끈다)
  const clearBoxes = buildingBoxes(layout.buildings, CAMERA_CLEAR.margin);
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

  // 지수를 줄이고(0 아래로는 내려가지 않는다) 막대·팝업을 갱신한다. 행동 효과 순간·면접·마시멜로 굽기가 함께 쓴다.
  function applyReduction(amount, counts = true) {
    const before = gameState.stress.value;
    const { value, justGoal, justEmpty } = gameState.apply(amount, { counts });
    hud.updateStressBar(value);
    if (before - value > 0) {
      popDelta(`-${before - value}`);
    }
    const plan = resultPlan({ justGoal, justEmpty });
    if (plan !== 'none') onResultPlan(plan, justGoal, value);
  }

  // ---- 면접장: 면접관 3명과 장면 진행(질문·답변·돌발행동·완주). 지수 감소는 아래 콜백으로만 한다. ----
  const interviewers = createInterviewers({ root: insideInterview.root, interior: interviewData, gltfs: interviewerGltfs, chairs: insideInterview.chairs, cfg: INTERVIEW.interviewers });
  const crew = createCrew({ hud, interviewers, names: Object.fromEntries(INTERVIEW.interviewers.map((i) => [i.id, i.name])), ids: INTERVIEW.interviewers.map((i) => i.id) }); // 담당 면접관제: 면접관 한 명이 한 번에 한 일만 한다
  const playerFx = character ? character.fx : createFx(player);
  const interviewScene = createInterviewScene({
    hud, interviewers, crew, character, player, playerFx, interior: interviewData, root: insideInterview.root, camera, renderer, config: INTERVIEW,
    params: { round: INTERVIEW_ROUND, speech: SPEECH_SECONDS, answerSeconds: INTERVIEW_ANSWER_SECONDS, improvSeconds: INTERVIEW_IMPROV_SECONDS, finaleSeconds: INTERVIEW_FINALE_SECONDS },
    callbacks: {
      dispatch: (event) => dispatch(event),
      reduce: () => applyReduction(ACTION_REDUCE), // 답변·돌발행동의 감소: 다른 행동과 같은 양, 같은 경로(gameState.apply -> 팝업)
      bonus: () => applyReduction(INTERVIEW_BONUS, false), // 완주 보너스: 한 번 더(행동 횟수에는 넣지 않는다)
      track,
      say: (msg) => net?.say(msg), // 멀티플레이: 내 답변·돌발행동을 같은 방의 다른 방문자에게 번호로 알린다(꺼져 있으면 아무 일 없다)
      outfitState: () => outfit.state,
      seat: () => (seatItem && holdsSeat(mode) ? { id: seatItem.id, ...seatItem.seat, stand: pushOut(standPoint(seatItem.seat)) } : null), // 면접장 의자에 앉아 있는가(앉은 채 답하고, 돌발행동은 일어났다 다시 앉는다)
    },
  });

  // 면접장 의자 점유(멀티플레이): 다른 방문자가 앉아 있는 의자는 "사용 중"이라 앉을 수 없다. 멀티플레이가 꺼져 있으면 항상 비어 있다. 이미 앉은 나는 쫓겨나지 않는다.
  const interviewSeatPoints = interviewData.interactables.filter((i) => i.kind === 'seat').map((i) => ({ id: i.id, x: i.seat.x, z: i.seat.z }));
  const guestSeatPoints = interviewSeatPoints.filter((p) => interviewData.assignments[p.id]); // 담당 면접관이 있는 지원자 의자만(대기 의자는 장면이 없다)
  // 다른 방문자가 앉은 지원자 의자의 담당 면접관 id(앉지 않았거나 대기 의자면 null).
  const interviewerOfRemote = (remoteId) => {
    if (!net || spaceId !== 'interview') return null;
    const remote = net.remotes.find((r) => r.id === remoteId);
    const chairId = remote ? seatOfRemote(guestSeatPoints, remote, SEAT_OCCUPIED_RADIUS) : null;
    return chairId ? interviewData.assignments[chairId] : null;
  };
  const NO_SEATS = new Set();
  const seatsTaken = () => (net && spaceId === 'interview' ? occupiedSeats(interviewSeatPoints, net.remotes, SEAT_OCCUPIED_RADIUS) : NO_SEATS);

  // ---- 소각장 행동: 러너가 시간을 재고, 여기서 캐릭터 동작·종이·효과를 맡는다. ----
  // (소각장만 한숨 ->) 주머니에서 종이 꺼내기 -> (대상 쪽으로 돌기) -> 던지기/치기 -> 후련. 던지기/치기 클립만 총 길이가 ACTION_TARGET_SECONDS 가 되도록 느려진다(행동별 표: 세탁소 행동은 한숨이 없다).
  const { durations, speeds, byAction } = fitDurations(character ? character.getRawClipDurations() : FALLBACK_RAW_DURATIONS, ACTION_TURN_SECONDS, ACTION_TARGET_SECONDS);
  let currentZone = null; // 지금 행동 막대를 보일 구역: 자유 상태면 서 있는 자리의 구역, 앉아 있으면 그 자리에 묶인 구역(면접장 의자). 막대·숫자 키·자동이 이 구역을 따른다.
  const runner = createRunner({
    durations, byAction, turnSeconds: ACTION_TURN_SECONDS, effectAt: ACTION_EFFECT_AT, autoGap: AUTO_GAP,
    canStart: (id) => inRangeFor(id), autoActions: () => autoActionsOf(currentZone),
    // 자동이 태우기·파쇄를 시작할 때마다 물건을 무작위로 고른다(태우기는 드물게 오로라 가루). 직접 고른 행동은 start 가 변형을 같이 넘긴다.
    variantFor: (id) => {
      if (!isItemAction(id)) return undefined;
      chosen = pickRandomItem(id, Math.random, { lastId: lastAuto[id] }) ?? chosen;
      lastAuto[id] = chosen.id; // 같은 행동에서 같은 물건이 연달아 나오지 않게
      return variantOf(chosen);
    },
  });
  const lastAuto = {}; // 자동이 행동별로 마지막에 고른 물건 id

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
  const shredClip = new THREE.Plane(new THREE.Vector3(0, 1, 0), 1000); // 월드 y 가 -constant 아래인 부분을 숨긴다(평소엔 아무것도 안 가린다)
  const itemProps = new Map(INCINERATOR.items.map((item) => [item.id, buildItemProp(item, 0.7, 0.93, shredClip)])); // 소각장 물건 6종(불합격 통지서 크기: 기본 카메라에서도 읽힌다)
  const glitter = createGlitter(yardRoot); // 오로라 가루 반짝이
  const dirtyShirt = buildCrumpledShirt();
  dirtyShirt.userData.rot = [0, 0, 0];
  const cleanShirt = buildCleanShirt();
  cleanShirt.userData.rot = [0, 0, 0];
  const HELD_BY_ACTION = { wash: dirtyShirt, hang: cleanShirt }; // 소각장 행동의 소품은 고른 물건(itemProps)
  const isItemAction = (id) => id === 'burn' || id === 'shred';
  let chosen = INCINERATOR.items[0]; // 이번 행동의 물건(선택 창이나 자동이 정한다)
  let chosenLine = ''; // 그 물건의 멘트(행동을 시작할 때 한 줄 고른다)
  let paperVariant = 0; // 불합격 통지서 문구 4종을 행동마다 번갈아 쓴다
  let held = itemProps.get(chosen.id);
  for (const item of [...itemProps.values(), dirtyShirt, cleanShirt]) {
    item.visible = false;
    handAttach.add(item);
  }

  function placePaperInHand() {
    handAttach.add(held);
    held.position.set(...PAPER_HAND.pos);
    held.rotation.set(...held.userData.rot);
    held.scale.setScalar(1);
    held.userData.setCrumple?.(0);
  }
  placePaperInHand();

  let flight = null; // 움직이는 소품 { kind: 'burn' | 'place' | 'feed' | 'wash', from, to, t, dur, startScale, washer } (place: 파쇄기 투입구 위에 세우기, feed: 투입구로 내려가며 갈리기)
  let stage = null; // 지금 소각장 단계 { phase, t, dur }(세탁소 행동에는 없다)
  let showBlend = 0; // 들여다보는 중 종이를 카메라 쪽으로 돌린 정도(0..1)
  let approach = null; // 파쇄기 앞 작업 자리로 걸어가는 중 { from, t, dur }
  let pull = null; // 주머니에서 꺼내는 중 { t, dur }
  let crumple = null; // 태우기에서 종이를 구기는 중 { t, dur }
  const tmpV = new THREE.Vector3();
  const tmpV2 = new THREE.Vector3();
  const tmpV3 = new THREE.Vector3();
  const tmpM = new THREE.Matrix4();
  const faceQ = new THREE.Quaternion();
  let actionId = null;
  let washTail = 0; // 세탁기에 셔츠가 들어간 뒤 덜컹거림이 끝날 때까지 "세탁 중" 안내를 이어 가는 남은 시간(초)
  const tmpFrom = new THREE.Vector3();
  const tmpHand = new THREE.Vector3();
  const pocketPos = new THREE.Vector3(...POCKET.pos);
  const pocketQuat = new THREE.Quaternion(); // 주머니에서의 방향(소품의 손 방향과 같다: 종이는 세워서 앞(+z)을 향하게)
  let washIndex = 0; // 세탁이 향하는 세탁기(돌기 단계에서 가장 가까운 것으로 정한다)
  let hangCount = 0; // 지금까지 널은 횟수(파스텔 셔츠 색을 정한다)
  // 빨랫줄 공유(logic/line.js): 줄 상태는 여기 하나이고, 내가 널거나 걷은 것은 같은 세탁소의 다른 방문자에게 알린다(멀티플레이가 꺼져 있으면 혼자 쓰는 줄이다).
  const selfId = makeId(); // 내 방문자 id(멀티플레이와 같은 값을 쓴다: 줄에서 내 것을 구분)
  const lineState = createLine({ ...CLOTHESLINE_SLOTS, selfId });
  const LINE_SNAP_SECONDS = 4; // 내가 널어 둔 목록 전체를 다시 알리는 간격(새로 들어온 방문자가 받도록)
  const LINE_DIRTY_MS = 12000; // 줄이 비어도 걷은 직후 이만큼은 목록을 보낸다(놓친 걷기 이벤트 보정)
  let lineSnapDue = 0; // 다음 목록 전송까지(초)
  let lineDirtyUntil = 0;
  let lineKnown = new Set(); // 지금 보이는 다른 방문자(새로 보이면 목록을 곧 보낸다)
  function announceLine(ev) {
    if (!ev) return;
    net?.sendRoom({ k: 'line', slot: ev.slot, c: ev.c, t: ev.t });
    lineSnapDue = Math.min(lineSnapDue, 1);
    lineDirtyUntil = performance.now() + LINE_DIRTY_MS;
  }
  // 받은 빨랫줄 메시지를 반영하고(내 빨래가 졌으면 옮기고), 세탁기 효과는 그대로 보여 준다. 글은 없고 번호뿐이다.
  function onRoomMessage(m) {
    let moved = [];
    if (m.k === 'line') moved = lineState.ingestEvent(m.id, m.slot, m.c, m.t, Date.now());
    else if (m.k === 'lines') moved = lineState.ingestSnapshot(m.id, m.e, Date.now());
    else if (m.k === 'fx' && spaceId === 'laundry') {
      laundry.washers.splash(m.i);
      sfx.play('washSplash', { at: interior.washers[m.i], space: 'laundry', remote: true }); // 다른 방문자의 세탁기 소리(멀면 작게)
    }
    if (moved.length) { lineSnapDue = 0; lineDirtyUntil = performance.now() + LINE_DIRTY_MS; }
  }
  // 매 프레임: 사라진 방문자의 빨래를 걷고, 주기적으로 내 목록을 보내고, 줄을 그린다.
  function updateLine(dt) {
    const alive = new Set(net ? net.remotes.map((r) => r.id) : []);
    lineState.prune(alive, Date.now());
    if (net && spaceId === 'laundry') {
      for (const id of alive) if (!lineKnown.has(id)) lineSnapDue = Math.min(lineSnapDue, 0.4); // 새로 보이는 방문자에게 곧 알린다
      lineSnapDue -= dt;
      if (lineSnapDue <= 0 && (lineState.ownCount > 0 || performance.now() < lineDirtyUntil)) {
        lineSnapDue = net.sendRoom({ k: 'lines', e: lineState.snapshot() }) ? LINE_SNAP_SECONDS : 0.5;
      } else if (lineSnapDue <= 0) lineSnapDue = LINE_SNAP_SECONDS;
    }
    lineKnown = alive;
    laundry.clothesline.show(lineState.view());
  }
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
  const RANGES = { fire: FIRE_RANGE, shredder: SHREDDER_RANGE, washer: WASHER_RANGE, clothesline: CLOTHESLINE_RANGE, desk: INTERVIEW_ZONE_RADIUS };
  // 각 행동은 대상(소각로·파쇄기·세탁기·빨랫줄)이 사정거리 안일 때만 할 수 있다(어느 방향에서든).
  const inRangeFor = (id) => canPerform(id, {
    fire: distTo(FURNACE), shredder: distTo(layout.shredder), washer: distTo(nearestWasher()), clothesline: distTo(interior.clothesline.centre),
    desk: distTo(interviewData.zoneCenter),
  }, RANGES);

  // 소품을 숨기고 손에 되돌려 놓는다(행동이 끝났거나 취소됐을 때).
  function clearPaper() {
    pull = null;
    crumple = null;
    flight = null;
    stage = null;
    showBlend = 0;
    placePaperInHand();
    held.visible = false;
    shredder.endGrind();
    shredClip.constant = 1000;
    approach = null;
    hud.clearSpeech(SPEECH_KEY);
    glitter.clear();
  }

  // 클립 재생 속도: 정지 자세 클립(0.17초)은 그대로, 나머지는 단계 길이에 맞춰 늘이거나 줄인다(0.3~1.5배).
  const rawOf = (name) => (character ? character.getRawClipDurations()[name] : FALLBACK_RAW_DURATIONS[name]) ?? 0.5;
  const speedFor = (step) => (rawOf(step.name) < 0.3 ? 1 : Math.min(1.5, Math.max(0.3, rawOf(step.name) / step.seconds)));

  // 종이를 카메라 쪽으로 돌려 들여다보는 자세(들여다보기·한마디 단계): 종이 앞면(+y)이 카메라를 향하고 글자 윗쪽이 하늘을 향한다. blend 0 이면 손에 쥔 원래 방향.
  function faceCamera(blend) {
    held.updateWorldMatrix(true, false);
    held.getWorldPosition(tmpV);
    tmpV2.copy(camera.position).sub(tmpV).normalize(); // 종이 앞면 방향 n
    const up = tmpV.set(0, 1, 0).addScaledVector(tmpV2, -tmpV2.y).normalize(); // n 에 수직인 하늘 방향
    const zAxis = up.clone().negate(); // 종이 윗쪽은 로컬 -z
    const xAxis = new THREE.Vector3().crossVectors(tmpV2, zAxis);
    faceQ.setFromRotationMatrix(tmpM.makeBasis(xAxis, tmpV2, zAxis));
    held.parent.getWorldQuaternion(tmpQuat);
    faceQ.premultiply(tmpQuat.invert());
    held.quaternion.setFromEuler(tmpEuler.set(...held.userData.rot)).slerp(faceQ, blend);
    held.position.set(...PAPER_HAND.pos);
    held.scale.setScalar(1 + (SHOW_SCALE - 1) * blend);
    // 몸·머리에 가리지 않게 월드 기준으로 위(하늘)와 카메라 쪽으로 띄운다.
    held.parent.updateWorldMatrix(true, false);
    held.parent.localToWorld(tmpV.copy(held.position));
    tmpV.y += SHOW_LIFT * blend;
    tmpV.x += tmpV2.x * SHOW_FORWARD * blend;
    tmpV.z += tmpV2.z * SHOW_FORWARD * blend;
    tmpV3.setFromMatrixColumn(camera.matrixWorld, 0); // 카메라 오른쪽(수평)
    tmpV3.y = 0;
    if (tmpV3.lengthSq() > 1e-6) tmpV3.normalize();
    tmpV.addScaledVector(tmpV3, SHOW_SIDE * blend);
    held.position.copy(held.parent.worldToLocal(tmpV));
  }

  // 러너의 단계 시작: 클립 재생 또는 회전(제자리에서 대상 쪽으로, 대기 자세). 소각장 단계(phase 가 있다)는 startItemStep 이 장면을 맡는다.
  function onStep({ action, index, step }) {
    if (index === 0) {
      if (once('game_start')) track('game_start');
      actionId = action;
      if (isItemAction(action)) {
        held = itemProps.get(chosen.id);
        chosenLine = lineFor(chosen, action);
        if (chosen.prop.kind === 'notice') held.userData.setVariant(paperVariant++ % held.userData.variantCount);
      } else {
        held = HELD_BY_ACTION[action];
      }
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
      stage = step.phase ? { phase: step.phase, t: 0, dur: step.seconds } : null;
      return;
    }
    if (step.phase) { startItemStep(step); return; }
    character?.playClip(step.name, byAction[action]?.speeds[step.name] ?? speeds[step.name] ?? 1);
    if (step.event === 'paperOut') {
      // 재킷 가슴 주머니에서 작은 종이가 나와 paperOut 순간까지 손으로 올라온다.
      pull = { t: 0, dur: step.seconds * step.eventAt };
      handAttach.add(held); // 손 기준으로 움직여 손에 닿을 때 튀지 않는다.
      held.scale.setScalar(POCKET_SCALE);
      held.visible = true;
      updatePaper(0);
    }
  }

  // 소각장 단계 시작(phase 별 장면). 클립은 단계 길이에 맞춰 재생하고, 물건의 움직임은 updateStage 가 매 프레임 이어 간다.
  function startItemStep(step) {
    const { phase } = step;
    stage = { phase, t: 0, dur: step.seconds };
    if (character) {
      if (step.name === 'idle') character.idleInPlace();
      else character.playClip(step.name, speedFor(step));
    }
    if (phase !== 'look' && phase !== 'mutter') { // 들여다보는 자세가 끝났다: 손에 쥔 원래 방향으로
      if (showBlend > 0) { showBlend = 0; if (!flight && !pull) placePaperInHand(); held.visible = true; }
    }
    if (phase === 'pull') {
      pull = { t: 0, dur: step.seconds * step.eventAt }; // 주머니에서 올라온다(paperOut 에서 손에 쥔다)
      handAttach.add(held);
      held.scale.setScalar(POCKET_SCALE);
      held.visible = true;
      updatePaper(0);
    } else if (phase === 'crumple') {
      crumple = { t: 0, dur: step.seconds * 0.85 };
    } else if (phase === 'approach') {
      approach = { from: { x: player.position.x, z: player.position.z }, t: 0, dur: step.seconds };
      if (character && Math.hypot(player.position.x - layout.shredder.stand.x, player.position.z - layout.shredder.stand.z) > 0.15) character.walkInPlace();
    } else if (phase === 'place') {
      startPlace(step.seconds);
    } else if (phase === 'feed') {
      startFeed(step.seconds);
    } else if (phase === 'watch') {
      if (actionId === 'burn') { for (const at of EMBER_AT) setTimeoutGame(at, () => fire.embers(3)); }
    }
  }

  // 게임 시간으로 재는 한 번짜리 예약(탭이 멈추면 같이 멈춘다). 행동이 끝나면 비운다.
  let timers = [];
  function setTimeoutGame(seconds, fn) { timers.push({ left: seconds, fn }); }

  // 소품이 완전히 나왔다(pick-up 단계의 eventAt): 손에 쥔다.
  function onPaperOut() {
    pull = null;
    placePaperInHand();
    held.visible = true;
  }

  // 효과 순간: 지수 -ACTION_REDUCE, 그리고 행동별 연출(소품이 손을 떠난다 / 빨래가 줄에 걸린다).
  // 소각장: 태우기는 물건이 불에 닿는 순간(주머니는 터지는 순간), 파쇄는 종이가 다 갈린 순간이다.
  function onItemEffect(id) {
    track('action_done', { action: id });
    track(id === 'burn' ? 'burn_item' : 'shred_item', { id: chosen.id });
    applyReduction(ACTION_REDUCE);
    changeOutfit(outfit.onAction(id));
    if (id === 'burn') {
      flight = null; // 종이는 불 속으로 들어갔다
      held.visible = false;
      fire.flare();
      sfx.play('whoof'); // 소리는 불길이 확 솟는 순간 하나
      if (chosen.flame) fire.setTint(chosen.flame.tint, chosen.flame.seconds);
      if (isFlameItem(chosen) || chosen.prop.kind === 'pouch') { // 주머니가 터진다: 반짝이 구름 + 불티
        glitter.cloud(tmpV.set(FURNACE.x, PAPER_FIRE_Y, FURNACE.z), 1.5);
        fire.embers(6);
      }
    }
    // 파쇄의 감소는 종이가 다 갈린 순간(feed 의 끝)이고, 떨림·조각은 feed 동안 이미 진행됐다.
  }

  function onEffect(id) {
    if (isItemAction(id)) { onItemEffect(id); return; }
    track('action_done', { action: id });
    applyReduction(ACTION_REDUCE);
    crumple = null;
    changeOutfit(outfit.onAction(id));
    if (id === 'hang') {
      // 깨끗한 셔츠가 줄에 걸려 흔들린다. 손의 셔츠는 사라진다. 나시만 입은 채 널면 내 새 흰 셔츠가 전용 칸에 걸리고,
      // 아니면 파스텔 셔츠(가득 차면 가장 오래된 것을 바꾼다. 내 셔츠 칸은 건너뛴다)가 걸린다.
      const now = Date.now();
      announceLine(outfit.state === 'drying' && lineState.ownWhiteSlot() < 0 ? lineState.hangWhite(now) : lineState.hangPastel(hangCount++ % 6, now));
      held.visible = false;
      sfx.play('flap'); // 셔츠를 줄에 탁
      return;
    }
    held.visible = true;
    held.getWorldPosition(tmpFrom);
    const startScale = held.scale.x;
    scene.attach(held);
    flight = {
      kind: id, from: tmpFrom.clone(), to: new THREE.Vector3(), t: 0, startScale, washer: washIndex, dur: SHIRT_FLIGHT_SEC,
    };
    laundry.washers.entryWorld(washIndex, flight.to);
    net?.sendRoom({ k: 'fx', i: washIndex }); // 같은 세탁소의 다른 방문자 화면에서도 그 세탁기가 흔들린다
  }

  // 던지기의 놓는 순간(release): 물건이 손을 떠나 불까지 날아간다(날아가기 단계 길이만큼). 주머니도 통째로 던진다.
  function onRelease() {
    const fly = runner.stepsOf(actionId, chosen && variantOf(chosen)).find((st) => st.phase === 'fly');
    const dur = (fly?.seconds ?? 0.5) * 0.98;
    held.getWorldPosition(tmpFrom);
    const startScale = held.scale.x;
    scene.attach(held);
    flight = { kind: 'burn', from: tmpFrom.clone(), to: new THREE.Vector3(FURNACE.x, PAPER_FIRE_Y, FURNACE.z), t: 0, dur, startScale };
  }

  // 파쇄: 종이를 투입구 위에 똑바로 세워 얹는다(place). 아랫변이 투입구에 닿고 앞면이 작업 자리(파쇄기 정면)를 향한다.
  const placeQuat = new THREE.Quaternion();
  const shredBase = new THREE.Vector3();
  const heldHeight = () => (held.userData.height ?? 0.93) * SHRED_SCALE;
  function startPlace(seconds) {
    held.visible = true;
    held.getWorldPosition(tmpFrom);
    const startScale = held.scale.x;
    scene.attach(held);
    placeQuat.setFromEuler(tmpEuler.set(0, layout.shredder.rotY, 0)).multiply(heldQuat.setFromEuler(tmpEuler.set(...held.userData.rot)));
    shredder.slotWorld(shredBase).y += heldHeight() / 2 + 0.004; // 아랫변이 투입구 윗면에 닿는 높이의 종이 중심
    flight = { kind: 'place', from: tmpFrom.clone(), fromQuat: held.quaternion.clone(), to: shredBase.clone(), t: 0, dur: seconds * 0.8, startScale };
  }
  // 파쇄: 종이가 일정한 속도로 곧게 내려가고, 투입구 아래로 들어간 부분은 클리핑으로 사라진다. 진행에 맞춰 조각이 쏟아지고 파쇄기가 덜덜 떤다.
  function startFeed(seconds) {
    if (!flight || flight.kind !== 'place') { startPlace(0.01); updatePaper(1); }
    flight = { kind: 'feed', base: flight.to.clone(), quat: placeQuat.clone(), scale: SHRED_SCALE, t: 0, dur: seconds * 0.97 };
    const accent = chosen.prop.accent;
    shredder.beginGrind([...SHRED_PALETTE, ...SHRED_PALETTE, ...SHRED_PALETTE, accent, chosen.prop.ball, '#d3221c'].map((c) => new THREE.Color(c).getHex()), seconds);
    shredClip.constant = -shredder.slotY;
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
      announceLine(lineState.removeWhite(Date.now()));
      character?.applyOutfit(outfit.state);
      track('outfit_ready');
      sfx.play('tada'); // 새 셔츠를 입은 순간
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
    timers = [];
  }

  // 진행 중인 행동을 깨끗하게 취소한다(걷기·앉기·포춘 등): 종이를 치우고 자세를 idle 로 되돌린다.
  function abortAction() {
    if (!runner.isBusy() && actionId === null) return;
    runner.abort();
    character?.endAction();
    clearPaper();
    actionId = null;
    timers = [];
  }

  // 행동 요청(막대 클릭·숫자 키). 막대가 보이는 구역 안의 자유 상태에서 쉬는 중이고 사정거리 안일 때만 시작한다.
  function requestAction(id) {
    if ((mode !== 'free' && mode !== 'seated') || runner.isBusy() || !ACTION_DEFS[id] || !currentZone || ACTION_DEFS[id].zone !== currentZone.id || !inRangeFor(id)) return false;
    if (id === 'roast') return startRoast(); // 소각로 옆 벤치에서 마시멜로 굽기(앉은 채)
    stopWalking();
    if (id === 'interview') return interviewScene.openQuestion(); // 면접 보기: 질문 + 답변 선택 창(지수 감소는 답한 순간)
    if (id === 'improv') return interviewScene.startImprov(); // 돌발행동: 선택 없이 바로
    if (isItemAction(id)) return openItemPicker(id); // 태우기·파쇄: 물건 고르기 창(고르면 startItemAction)
    return runner.start(id); // 첫 단계는 이 프레임의 update 에서 시작된다.
  }

  // ---- 소각장 물건 고르기 창: 행동 막대의 태우기·파쇄(또는 1·2 키)를 누르면 열린다. 숫자 키·클릭으로 고르고 Esc·바깥 클릭은 아무 일 없이 닫는다. 열려 있는 동안 모드는 'item-choice'(이동·다른 단축키 잠김). ----
  let pickerAction = null;
  let pickerItems = [];
  const iconCache = new Map();
  const iconOf = (item) => { if (!iconCache.has(item.id)) iconCache.set(item.id, buildItemIcon(item)); return iconCache.get(item.id); };
  function openItemPicker(id) {
    const list = itemsFor(id);
    if (!list.length || !dispatch('pick:open')) return false; // dispatch 가 눌려 있던 이동 키를 비우고 자동을 끈다
    stopWalking();
    renderer.domElement.style.cursor = '';
    hud.hideTooltip();
    pickerAction = id;
    pickerItems = list;
    hud.openPicker({
      title: id === 'burn' ? '무엇을 태울까요?' : '무엇을 갈아 버릴까요?',
      items: list.map((item, i) => ({ key: String(i + 1), label: item.label, icon: iconOf(item) })),
      onPick: pickItem,
      onCancel: cancelPicker,
    });
    return true;
  }
  function pickItem(index) {
    const item = pickerItems[index];
    if (!item || mode !== 'item-choice') return false;
    const id = pickerAction;
    hud.closePicker();
    pickerAction = null;
    dispatch('pick:choose'); // free 로 돌아온다
    return startItemAction(id, item);
  }
  function cancelPicker() {
    if (mode !== 'item-choice') return;
    hud.closePicker();
    pickerAction = null;
    dispatch('pick:cancel'); // 지수·행동 횟수는 그대로
  }
  // 고른 물건으로 행동을 시작한다(자리가 그대로인지 다시 확인).
  function startItemAction(id, item) {
    if (runner.isBusy() || !inRangeFor(id)) return false;
    chosen = item;
    return runner.start(id, variantOf(item));
  }

  function toggleAuto() {
    if (runner.autoOn) {
      runner.cancelAuto();
      return;
    }
    // 이 구역에서 다음에 할 행동(기록이 없으면 구역의 첫 행동)을 할 수 없는 자리면 켜지지 않는다. 자동이 없는 구역(면접장)은 next 가 null 이다.
    const next = runner.nextAutoAction();
    if (mode === 'free' && next && inRangeFor(next)) runner.setAuto(true);
  }

  // 파쇄기 앞 작업 자리로 걸어가는 단계(같은 걷기 동작·충돌 처리): 남은 시간에 맞춰 일정하게 걷고, 끝부분에 파쇄기 쪽으로 몸을 돌려 선다. 이미 가까우면 그 자리에서 몸만 돌린다.
  function updateApproach(dt, k) {
    if (!approach) return;
    const stand = layout.shredder.stand;
    const cur = { x: player.position.x, z: player.position.z };
    const dist = Math.hypot(stand.x - cur.x, stand.z - cur.z);
    if (dist > 0.02) {
      const left = Math.max(1e-3, approach.dur * (1 - k));
      const next = stepToward(cur, stand, Math.min(dist / left, PLAYER.speed * 1.4), dt);
      const pushed = pushOut(next);
      if (k >= 0.999) { player.position.x = stand.x; player.position.z = stand.z; } // 끝: 정확히 작업 자리(막혔어도)
      else { player.position.x = pushed.x; player.position.z = pushed.z; }
      if (dist > 0.15 && k < 1 - STAND_HOLD) player.rotation.y = headingY(cur, stand);
      if (stepper.advance(Math.hypot(player.position.x - cur.x, player.position.z - cur.z))) sfx.play(STEP_SOUND[surfaceAt(spaceId, player.position.x, player.position.z, layout.plaza)], { pan: stepper.foot ? 0.18 : -0.18 });
    }
    if (k >= 1 - STAND_HOLD) { // 파쇄기 쪽을 보고 선다
      const to = stand.rotY;
      const turn = Math.atan2(Math.sin(to - player.rotation.y), Math.cos(to - player.rotation.y));
      player.rotation.y += turn * Math.min(1, 0.25 + (k - (1 - STAND_HOLD)) / STAND_HOLD);
    }
    if (k >= 1) { player.rotation.y = stand.rotY; character?.idleInPlace(); approach = null; }
  }

  // 소각장 단계의 매 프레임 장면: 절차적 몸짓, 들여다보는 종이, 가루 주머니 열기·기울이기, 예약 실행, 말풍선 위치.
  function updateStage(dt) {
    for (let i = timers.length - 1; i >= 0; i--) {
      timers[i].left -= dt;
      if (timers[i].left <= 0) { const { fn } = timers[i]; timers.splice(i, 1); fn(); }
    }
    if (hud.speechSize(SPEECH_KEY)) { // 멘트 말풍선: 머리 위 1.9 지점
      camera.updateMatrixWorld();
      bubblePoint.set(player.position.x, player.position.y + 1.9, player.position.z).project(camera);
      if (bubblePoint.z >= 1) hud.clearSpeech(SPEECH_KEY);
      else hud.positionSpeech(SPEECH_KEY, (bubblePoint.x * 0.5 + 0.5) * renderer.domElement.clientWidth, (-bubblePoint.y * 0.5 + 0.5) * renderer.domElement.clientHeight);
    }
    if (!stage) return;
    stage.t += dt;
    const k = Math.min(1, stage.t / stage.dur);
    character?.setPose(poseFor(stage.phase, k, stage.t));
    const { phase } = stage;
    if (phase === 'approach') updateApproach(dt, k);
    if (!held.visible || flight) return;
    if ((phase === 'look' || phase === 'mutter') && !pull) {
      showBlend = Math.min(1, showBlend + dt * 4);
      if (held.userData.sheet) faceCamera(easeInOut(showBlend));
      else held.scale.setScalar(1 + 0.35 * easeInOut(showBlend)); // 주머니도 조금 크게 들어 보인다
    }
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
      held.userData.setCrumple?.(easeInOut(k));
    }
    if (!flight) return;
    flight.t += dt;
    const k = Math.min(1, flight.t / flight.dur);
    if (flight.from) held.position.lerpVectors(flight.from, flight.to, k);
    if (flight.kind === 'burn') {
      held.position.y += PAPER_ARC * Math.sin(Math.PI * k);
      held.rotation.x += 14 * dt;
      held.rotation.z += 9 * dt;
      held.scale.setScalar(flight.startScale * (1 - 0.5 * easeInOut(k)));
    } else if (flight.kind === 'place') {
      held.position.lerpVectors(flight.from, flight.to, easeInOut(k)); // 던지지 않고 곧게 옮긴다
      held.quaternion.slerpQuaternions(flight.fromQuat, placeQuat, easeInOut(k));
      held.scale.setScalar(flight.startScale + (SHRED_SCALE - flight.startScale) * easeInOut(k));
    } else if (flight.kind === 'feed') {
      held.position.copy(flight.base);
      held.position.y -= heldHeight() * k; // 일정한 속도(선형)로 내려간다: 다 내려가면 윗변이 투입구에 닿아 모두 사라진다
      held.position.x += (Math.random() - 0.5) * 0.012; // 기계 진동
      held.quaternion.copy(flight.quat);
      held.scale.setScalar(flight.scale);
      shredder.setFeed(k);
    } else if (flight.kind === 'wash') {
      held.position.y += SHIRT_ARC * Math.sin(Math.PI * k); // 포물선으로 세탁기 투입구에 들어간다
      held.rotation.x += 10 * dt;
      held.rotation.z += 6 * dt;
      held.scale.setScalar(flight.startScale * (1 - 0.7 * easeInOut(k)));
    } else {
      held.scale.setScalar(flight.startScale * (1 - 0.9 * easeInOut(k)));
    }
    if (k >= 1) {
      if (flight.kind === 'place') { flight.t = flight.dur; return; } // 투입구 위에 머문다(다음 단계 feed 가 이어받는다)
      if (flight.kind === 'feed') { flight = null; held.visible = false; shredder.endGrind(); shredClip.constant = 1000; return; } // 종이가 모두 갈렸다
      if (flight.kind === 'burn') { flight = null; held.visible = false; return; } // 불에 들어갔다(불길은 효과 순간에 나온다)
      if (flight.kind === 'wash') { // 셔츠가 들어간 순간 세탁기가 흔들리고 거품이 올라온다
        laundry.washers.splash(flight.washer);
        sfx.play('washSplash');
        sfx.play('washerRattle');
        washTail = WASH_GUIDE_TAIL;
      }
      clearPaper();
    }
  }

  // ---- 마시멜로 굽기: 소각로 옆 벤치에 앉은 채 1번. 상태 기계(logic/marshmallow.js)가 시간을 재고, 여기서 자세·소품·게이지·멘트·지수 감소를 맡는다. ----
  const roastProp = createRoastStick();
  yardRoot.add(roastProp.group, roastProp.wisps);
  let roast = null; // 진행 중인 굽기(createRoast)
  let roastClock = 0; // 지금 단계에서 지난 시간(초): 자세·소품 보간용
  let roastEmberAt = 0; // 다음 불씨를 띄울 시각
  const ROAST_GRIP = 0.35; // 막대가 손 뒤로 나온 길이
  const ROAST_FIRE = { edge: 0.45, y: 1.0 }; // 마시멜로를 대는 곳: 불 가장자리(소각로 중심에서 손 쪽으로 edge) 위 y
  const rHand = new THREE.Vector3();
  const rStart = new THREE.Vector3();
  const rTip = new THREE.Vector3();
  const rFire = new THREE.Vector3();
  const rTake = new THREE.Vector3();
  const rMouth = new THREE.Vector3();
  const rDir = new THREE.Vector3();
  const clipRate = (name, seconds) => (character ? (character.getRawClipDurations()[name] ?? seconds) / seconds : 1); // 클립을 seconds 에 맞춰 재생하는 배속
  const roastCss = (level) => `rgb(${colorAt(level, MARSHMALLOW).map((v) => Math.round(v * 255)).join(',')})`;

  function startRoast() {
    if (roast || !canRoast({ mode, zone: currentZone }) || runner.isBusy() || !inRangeFor('roast')) return false;
    if (!dispatch('roast:start')) return false; // seated -> roasting (이동 키를 비우고 자동·행동을 끈다)
    stopWalking();
    renderer.domElement.style.cursor = '';
    hud.hideTooltip();
    hud.clearSpeech(SPEECH_KEY);
    roast = createRoast(MARSHMALLOW);
    roastClock = 0;
    roastEmberAt = 0;
    character?.beginAction();
    hud.showRoast({ onPull: roastPull });
    if (once('game_start')) track('game_start');
    for (const e of roast.start()) onRoastEvent(e);
    return true;
  }

  // 굽기를 정리하고 앉은 상태로 돌아온다(끝났거나 취소됐을 때). 소품·게이지·자세를 모두 치운다.
  function finishRoast() {
    if (!roast) return;
    roast = null;
    roastProp.hide();
    hud.hideRoast();
    character?.endAction('sit');
    if (mode === 'roasting') dispatch('roast:end');
  }
  function cancelRoast() {
    if (!roast || !roast.cancel()) return false;
    hud.clearSpeech(SPEECH_KEY);
    finishRoast();
    return true;
  }
  // 1·E·Space·꺼내기 버튼: 굽는 중이면 꺼내고 먹기 시작한다.
  function roastPull() {
    if (!roast || !roast.canPull) return;
    for (const e of roast.pull()) onRoastEvent(e);
  }

  function onRoastEvent(e) {
    if (e.type === 'phase') {
      roastClock = 0;
      const cfg = MARSHMALLOW;
      if (e.phase === 'take') { character?.playClip('pick-up', clipRate('pick-up', cfg.takeSeconds)); character?.setPose({ lean: 0.05 }); }
      else if (e.phase === 'reach') { character?.playClip('holding-right', 1); character?.setPose({ lean: 0.14 }); }
      else if (e.phase === 'bring') { character?.playClip('interact-right', clipRate('interact-right', cfg.eat.bringSeconds)); character?.setPose({ lean: 0.03, nod: 0.05 }); }
      else if (e.phase === 'chew') { character?.playClip('holding-right', 1); character?.setPose({ lean: 0.03 }); }
      else if (e.phase === 'relief') { character?.playClip('emote-yes', clipRate('emote-yes', cfg.eat.reliefSeconds)); character?.setPose({}); }
    } else if (e.type === 'stage') {
      hud.say(SPEECH_KEY, stageLine(e.id, MARSHMALLOW), { seconds: LINE_SECONDS, silent: true });
    } else if (e.type === 'pulled') {
      hud.hideRoast(); // 이제 먹는다: 꺼내기·취소는 끝
    } else if (e.type === 'reduce') {
      applyReduction(ACTION_REDUCE); // 결과와 상관없이 한 번, 다른 행동과 같은 경로(행동 횟수에 들어간다)
      track('marshmallow', { result: e.result });
      hud.say(SPEECH_KEY, resultLine(e.result, MARSHMALLOW), { seconds: 3, silent: true });
    } else if (e.type === 'done') {
      finishRoast();
    }
  }

  // 매 프레임(상태 진행): 앉은 자리·구역이 바뀌면 깨끗이 끝내고, 시간을 흘리고, 게이지·씹는 끄덕임·불씨를 갱신한다.
  function updateRoast(dt) {
    if (!roast) return;
    if (mode !== 'roasting' || !seatItem || spaceId !== 'yard' || Math.hypot(seatItem.x - FURNACE.x, seatItem.z - FURNACE.z) > FIRE_ZONE_RADIUS) { // 자리가 바뀌었다: 감소 없이 정리
      roast.cancel();
      hud.clearSpeech(SPEECH_KEY);
      const stuck = mode === 'roasting';
      roast = null;
      roastProp.hide();
      hud.hideRoast();
      character?.endAction('idle');
      if (stuck) dispatch('roast:end');
      return;
    }
    roastClock += dt;
    for (const e of roast.update(dt)) onRoastEvent(e);
    if (!roast) return;
    const { phase } = roast;
    if (phase === 'toast') {
      character?.setPose({ lean: 0.14 + 0.01 * Math.sin(roastClock * 2.2) });
      if (roastClock >= roastEmberAt) { fire.embers(2); roastEmberAt = roastClock + 0.7; } // 불씨가 반짝반짝
    } else if (phase === 'chew') {
      character?.setPose({ lean: 0.03, nod: 0.16 * Math.sin(roastClock * 11) }); // 오물오물
    }
    if (phase === 'take' || phase === 'reach' || phase === 'toast') {
      const level = roast.level;
      hud.updateRoast({
        ...gaugeMap(level, MARSHMALLOW), color: roastCss(level), canPull: roast.canPull, inGolden: phase === 'toast' && classify(level, MARSHMALLOW) === 'perfect',
        hint: roast.canPull ? '1·E·Space 꺼내기 / Esc 취소' : 'Esc 취소',
      });
    }
  }

  // 손 뼈를 따라가는 막대는 캐릭터 애니메이션이 끝난 뒤(손 위치가 정해진 뒤) 맞춘다.
  function updateRoastProp(dt) {
    if (!roast) return;
    const { phase } = roast;
    player.updateMatrixWorld(true);
    handAttach.localToWorld(rHand.set(...PAPER_HAND.pos));
    const fwdX = Math.sin(player.rotation.y);
    const fwdZ = Math.cos(player.rotation.y);
    rDir.set(rHand.x - FURNACE.x, 0, rHand.z - FURNACE.z).normalize();
    rFire.set(FURNACE.x + rDir.x * ROAST_FIRE.edge, ROAST_FIRE.y + (phase === 'toast' ? 0.03 * Math.sin(roastClock * 3.1) : 0), FURNACE.z + rDir.z * ROAST_FIRE.edge);
    rTake.set(rHand.x + fwdX * 0.9, rHand.y - 0.1, rHand.z + fwdZ * 0.9); // 꺼낸 직후: 앞으로 비스듬히 든다
    if (!character || !character.headWorld(rMouth)) rMouth.set(player.position.x, player.position.y + 1.2, player.position.z);
    rMouth.x += fwdX * 0.2; rMouth.z += fwdZ * 0.2; rMouth.y -= 0.02; // 입: 얼굴 앞
    const cfg = MARSHMALLOW;
    let show = 1;
    if (phase === 'take') { rTip.copy(rTake); show = easeInOut(Math.min(1, roastClock / cfg.takeSeconds)); }
    else if (phase === 'reach') rTip.lerpVectors(rTake, rFire, easeInOut(Math.min(1, roastClock / cfg.reachSeconds)));
    else if (phase === 'toast') rTip.copy(rFire);
    else if (phase === 'bring') rTip.lerpVectors(rFire, rMouth, easeInOut(Math.min(1, roastClock / cfg.eat.bringSeconds)));
    else rTip.copy(rMouth);
    rDir.subVectors(rTip, rHand).normalize();
    rStart.copy(rHand).addScaledVector(rDir, -ROAST_GRIP);
    if (phase === 'take') rTip.lerpVectors(rHand, rTip, Math.max(0.2, show)); // 꺼내며 막대가 자라난다
    const eaten = phase === 'chew' ? easeInOut(Math.min(1, roastClock / cfg.eat.chewSeconds)) : phase === 'relief' ? 1 : 0;
    roastProp.setLevel(roast.level, eaten);
    roastProp.place(rStart, rTip, phase !== 'relief');
    roastProp.update(dt);
  }

  // 매 프레임: AUTO 유효성 확인 -> 러너 진행(효과/끝 처리) -> 손 소품·날아가는 종이 -> 마시멜로 굽기 -> 행동 막대.
  function updateActions(dt) {
    washTail = Math.max(0, washTail - dt);
    // 지금 있는 행동 구역(가장 가까운 구역 안, 없으면 null). 걷는 중에도 구역이 바뀌면 행동 막대가 바뀐다.
    currentZone = currentZoneFor({ mode, pos: player.position, seat: seatItem, zones, spaceId });
    // AUTO 해제 조건: 걷기 시작·앉기·포춘·구역 밖(진행 중인 행동은 끝까지 한다). 다음 행동의 사정거리 밖이면 러너가 canStart 로 끈다.
    if (runner.autoOn && (mode !== 'free' || moveTarget || !currentZone)) runner.cancelAuto();
    for (const e of runner.update(dt)) {
      if (e.type === 'step') onStep(e);
      else if (e.type === 'paperOut') onPaperOut();
      else if (e.type === 'say') { if (chosenLine) hud.say(SPEECH_KEY, chosenLine, { seconds: LINE_SECONDS, silent: true }); } // 한마디: 머리 위 말풍선(소리 없음)
      else if (e.type === 'release') onRelease();
      else if (e.type === 'grind') sfx.play('shredder'); // 갈기 시작: 파쇄기 소리 하나
      else if (e.type === 'effect') onEffect(e.action);
      else onDone();
    }
    updateStage(dt);
    updatePaper(dt);

    updateRoast(dt);
    if (pending && !runner.isBusy() && !interviewScene.busy && mode !== 'roasting' && (pending.kind === 'side' || (mode !== 'fortune' && mode !== 'transition' && mode !== 'wearing' && mode !== 'item-choice'))) {
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
          zoneId: currentZone.id, buttons: ids.map((id) => ({ id, key: ACTION_DEFS[id].key, label: ACTION_DEFS[id].label })),
          auto: currentZone.auto !== false, onAction: requestAction, onToggleAuto: toggleAuto,
        });
      }
      if (currentZone.id === 'interview') interviewScene.maybeOpening(); // 의자에 처음 앉은 순간 팀장의 첫 대사(방문마다 한 번, 옷에 따라 다르다)
      const state = { auto: runner.autoOn, busy: runner.isBusy() };
      for (const id of ids) state[id] = inRangeFor(id);
      hud.updateActionBar(state);
    } else if (hud.isActionBarVisible()) {
      hud.hideActionBar();
    }
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

  function stopWalking() {
    moveTarget = null;
    marker.visible = false;
  }

  // 일어난다: 높이를 0 으로 되돌리고 앉았던 방향 앞(벤치는 소각로 쪽, 의자는 책상 쪽)에 놓는다(장애물 밖으로 밀어냄).
  function standUp() {
    const p = pushOut(standPoint(seatItem.seat));
    player.position.set(p.x, 0, p.z);
    seatItem = null;
  }

  // 이벤트로 모드를 바꾸고, 떠나는 모드의 정리를 한다. 바뀌었으면 true.
  function dispatch(event) {
    const next = nextMode(mode, event);
    if (next === mode) return false;
    if (holdsSeat(mode) && !holdsSeat(next)) standUp(); // 앉은 모드 사이(앉기 <-> 면접 선택·연출)를 오갈 때는 일어나지 않는다
    if (mode === 'fortune') hud.closeFortune();
    mode = next;
    keys.clear(); // 모드가 바뀌면 눌려 있던 이동 키는 잊는다(걷기가 혼자 계속되지 않게)
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
    interviewScene.resetRound(); // 면접장 진행 횟수도 처음으로
    outfit.reset(); // 옷도 처음으로: 정장, 줄의 내 셔츠 제거, 마르는 시간 취소
    wearing = null;
    announceLine(lineState.removeWhite(Date.now()));
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
    sfx.play('portal'); // 차원문: 들어가고 나오는 전환 전체(약 0.9초)에 걸친 소리
    return true;
  }

  // 화면이 완전히 덮인 순간: 공간을 바꾸고 도착 지점에 세운다. 카메라 추적 대상을 새 위치로 곧장 옮긴다(긴 미끄러짐 없음).
  function swapSpace(toId) {
    const from = spaceId;
    if (from === 'interview') interviewScene.leaveHall(); // 면접장을 나가면 진행 횟수가 처음으로(이미 줄어든 지수는 그대로)
    spaceId = toId;
    spaces.apply(toId);
    if (toId === 'interview') interviewScene.enterHall();
    const arrival = arrivalPoint(toId, from);
    player.position.set(arrival.x, 0, arrival.z);
    player.rotation.y = arrival.rotY;
    stopWalking();
    runner.cancelAuto();
    targetPos.set(player.position.x, ORBIT.targetHeight, player.position.z);
    // 건물에서 나오면(마당 도착) 카메라를 캐릭터 정면에 둔다: 캐릭터는 건물을 등지고 서므로 카메라는 광장 쪽에서 캐릭터 얼굴을 보고 건물이 그 뒤에 온다. 화면이 포털로 덮인 순간이라 바로 바꾼다(polar·거리는 그대로).
    if (toId === 'yard') orbit = { ...orbit, azimuthDeg: frontAzimuthDeg(arrival.rotY) };
    cameraClear.reset(); // 공간이 바뀌면 입력 직후처럼 기다린 뒤에야 가림 자동 보완을 한다
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
    if (runner.isBusy() || mode === 'roasting' || mode === 'transition' || mode === 'wearing' || mode === 'interview-choice' || mode === 'interview-play' || mode === 'item-choice') return; // 행동·전환·옷 갈아입기·면접 중에는 E 동작을 하지 않는다.
    if (mode === 'seated') { dispatch('interact'); return; }
    const item = nearestInRange(player.position, here().interactables);
    if (!item) return;
    const { type } = actionOf(item);
    if (type === 'enter' || type === 'exit') startSpaceChange(item.to);
    else if (type === 'wear') startWear();
    else if (type === 'comfort') hud.showBubble(COMFORT_MESSAGES[item.messageIndex]);
    else if (type === 'seat') {
      if (seatsTaken().has(item.id)) return; // 다른 방문자가 앉아 있다("사용 중")
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
  const CHOICE_KEYS = { Digit1: 0, Numpad1: 0, Digit2: 1, Numpad2: 1, Digit3: 2, Numpad3: 2 }; // 답변 선택 창의 1·2·3
  window.addEventListener('keydown', (e) => {
    if (isTypingTarget(e.target)) return; // 닉네임 입력 중에는 게임 단축키가 반응하지 않는다
    if (mode === 'transition' || mode === 'wearing' || mode === 'interview-play') return; // 전환·옷 갈아입기·면접 연출 중에는 모든 키를 무시한다.
    if (mode === 'item-choice') { // 소각장 물건 고르기 창: 숫자 키로 고르고 Esc 는 아무 일 없이 닫는다. 그 밖의 키는 모두 무시.
      if (e.code === 'Escape') cancelPicker();
      else if (!e.repeat) { const i = pickIndexFromCode(e.code, pickerItems.length); if (i >= 0) pickItem(i); }
      return;
    }
    if (mode === 'interview-choice') { // 답변 선택 창: 1·2·3 으로 고르고 Esc 는 감소 없이 닫는다.
      if (e.code === 'Escape') interviewScene.cancel();
      else if (e.code in CHOICE_KEYS && !e.repeat) interviewScene.pick(CHOICE_KEYS[e.code]);
      return;
    }
    if (mode === 'roasting') { // 마시멜로 굽는 중: 1·E·Space 로 꺼내고, Esc(굽기 전에는 E 도)로 취소한다. 그 밖의 키(이동·R·2)는 무시.
      if (e.repeat) return;
      if (e.code === 'Escape') cancelRoast();
      else if (e.code === 'Digit1' || e.code === 'Numpad1' || e.code === 'KeyE' || e.code === 'Space') {
        if (roast?.canPull) roastPull();
        else if (e.code === 'KeyE') cancelRoast(); // 아직 굽기 전(꺼내 드는 중): E 는 취소
      }
      if (e.code === 'Space') e.preventDefault();
      return;
    }
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

  // 키보드 이동(WASD·방향키, 카메라 기준): 클릭 이동과 같은 충돌·경계·애니메이션을 쓰고, 이동 키를 누르면 클릭 경로를 취소한다. 앉아 있으면 클릭처럼 먼저 일어난다.
  window.addEventListener('keydown', (e) => {
    if (!isMoveKey(e.code) || shouldIgnoreKey(e, e.target)) return;
    if ((mode !== 'free' && mode !== 'seated') || transition.active || runner.isBusy()) { keys.clear(); return; } // 면접·포춘·결과·전환·옷 갈아입기·행동 중에는 무시
    if (isArrowKey(e.code)) e.preventDefault();
    if (e.repeat && !keys.any()) return; // 클릭 등으로 비워진 뒤에는 키를 다시 눌러야 걷는다
    if (mode === 'seated') {
      runner.cancelAuto();
      dispatch('move'); // 클릭으로 일어날 때와 같은 경로(일어나고 키를 비운다)
    } else if (!keys.any()) runner.cancelAuto();
    if (mode !== 'free') return;
    stopWalking(); // 클릭 경로와 표시를 지운다
    keys.down(e.code);
  });
  window.addEventListener('keyup', (e) => { keys.up(e.code); });
  window.addEventListener('blur', () => keys.clear());
  document.addEventListener('visibilitychange', () => keys.clear());

  // 화면 좌표(ndc)에 보이는 상호작용 대상(없으면 null).
  function pickInteractable(ndc) {
    raycaster.setFromCamera(new THREE.Vector2(ndc.x, ndc.y), camera);
    const hit = raycaster.intersectObjects(here().pickables, false)[0];
    return hit ? here().interactables.find((i) => i.id === hit.object.userData.interactId) : null;
  }

  const controls = createControls(renderer.domElement, {
    onDrag: (dx, dy) => {
      if (mode === 'transition') return;
      cameraClear.touch();
      orbit = applyDrag(orbit, dx, dy, ORBIT.rotateSpeed, ORBIT);
      renderer.domElement.style.cursor = '';
      hud.hideTooltip();
    },
    onWheel: (deltaY) => {
      if (mode === 'transition') return;
      cameraClear.touch();
      orbit = applyZoom(orbit, deltaY, ORBIT.zoomStep, ORBIT);
    },
    // 클릭하면 그 지점/오브젝트로 걸어간다(도착해도 아무 일도 일어나지 않는다. 동작은 E 키). 앉아 있으면 먼저 일어난다.
    // 행동 중에는 이동 클릭을 무시하고, 쉬는 중의 이동 클릭은 자동을 끈다.
    onClick: (ndc) => {
      if (mode === 'fortune' || mode === 'transition' || mode === 'wearing' || mode === 'interview-choice' || mode === 'interview-play' || mode === 'item-choice' || mode === 'roasting' || runner.isBusy()) return;
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
      keys.clear(); // 클릭한 목적지가 이긴다(키를 다시 누를 때까지)
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

  // 멀티플레이(다른 방문자 아바타 보기, config 의 MULTIPLAYER): 켜져 있을 때만 관련 모듈을 불러온다. 꺼져 있거나 Supabase 키가 비어 있으면 아무것도 불러오지 않는다.
  // 인사·응원말(T 키·우하단 💬): 면접·전환·옷 갈아입기·포춘·종료 화면 중에는 열리지 않는다. 멀티플레이가 꺼져 있어도 내 말풍선은 보인다(아무것도 보내지 않는다).
  let net = null;
  const posOfRemote = (id) => { const r = net?.remotes.find((p) => p.id === id); return r ? { x: r.x, z: r.z } : undefined; };
  const quickChat = createQuickChat({
    container: document.getElementById('game'), hud, camera, renderer, player, list: QUICK_CHAT,
    isBlocked: () => mode === 'roasting' || mode === 'interview-choice' || mode === 'interview-play' || mode === 'item-choice' || mode === 'transition' || mode === 'wearing' || mode === 'fortune' || mode === 'result',
    onSend: (i) => net?.chat(i) ?? false,
    onUse: (i) => track('quick_chat', { i }),
  });
  let remoteSpeech = null; // 다른 방문자의 답변·돌발행동 말풍선과 면접관 반응(멀티플레이가 켜져 있을 때만)
  if (multiplayerMode(location.search, MULTIPLAYER, { url: SUPABASE_URL, anonKey: SUPABASE_ANON_KEY })) {
    try {
      const { createMultiplayer } = await import('./net/multiplayer.js');
      net = createMultiplayer({ scene, camera, renderer, container: document.getElementById('game'), gltf: characterGltf, id: selfId });
      if (net) {
        const { createRemoteSpeech } = await import('./remoteSpeech.js');
        remoteSpeech = createRemoteSpeech({ hud, crew, camera, renderer, config: INTERVIEW, interviewerOf: interviewerOfRemote, posOf: (id) => net.remotes.find((r) => r.id === id) });
        // 받은 한마디는 말풍선·면접관 반응으로만 보여 준다. 내 지수·라운드·보너스는 건드리지 않는다(분석은 보았다는 횟수만).
        net.onRoom(onRoomMessage);
        net.onSay((ev) => { if (remoteSpeech.show(ev)) track('remote_say_seen', { type: ev.ty }); });
        net.onChat((ev) => { if (net.enabled) quickChat.showRemote(ev, posOfRemote(ev.id)); }); // 인사·응원말: 번호로 내 목록에서 글을 찾아 그 방문자 머리 위에 띄운다(다른 방문자 보기가 꺼져 있으면 아무것도 안 온다)
      }
    } catch (err) {
      console.warn('멀티플레이를 시작하지 못했습니다.', err);
    }
  }

  sfx.setRemoteGate(() => Boolean(net?.enabled)); // 다른 방문자 보기를 끄면 그들의 효과음도 모두 꺼진다
  const stepper = createFootstepper(FOOTSTEP_STRIDE, { jitter: FOOTSTEP_JITTER });
  const listenerPos = { x: 0, z: 0, rx: 1, rz: 0 };
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
    const keyDir = mode === 'free' && !transition.active && !runner.isBusy() ? keys.direction(orbit.azimuthDeg) : null;
    if (keyDir) {
      // 키보드 이동: 카메라 기준 방향으로 PLAYER.speed, 클릭 이동과 같은 경계·장애물 처리.
      const cur = { x: player.position.x, z: player.position.z };
      const wanted = { x: cur.x + keyDir.x * PLAYER.speed * dt, z: cur.z + keyDir.z * PLAYER.speed * dt };
      player.rotation.y = headingY(cur, wanted);
      const pushed = pushOut(clampToSpace(wanted, spaceId, PLAYER.radius + 0.5));
      player.position.x = pushed.x;
      player.position.z = pushed.z;
      if (stepper.advance(Math.hypot(pushed.x - cur.x, pushed.z - cur.z))) sfx.play(STEP_SOUND[surfaceAt(spaceId, pushed.x, pushed.z, layout.plaza)], { pan: stepper.foot ? 0.18 : -0.18 });
    } else if (moveTarget) {
      const cur = { x: player.position.x, z: player.position.z };
      const next = stepToward(cur, moveTarget, PLAYER.speed, dt);
      if (Math.hypot(moveTarget.x - cur.x, moveTarget.z - cur.z) > 1e-3) {
        player.rotation.y = headingY(cur, moveTarget);
      }
      const pushed = pushOut(next);
      player.position.x = pushed.x;
      player.position.z = pushed.z;
      // 발소리: 걸은 거리가 보폭만큼 쌓일 때마다(바닥 종류: 풀·광장 돌·실내 타일). 느리게 걸으면 드문드문, 장애물에 막혀 못 가면 나지 않는다.
      if (stepper.advance(Math.hypot(pushed.x - cur.x, pushed.z - cur.z))) sfx.play(STEP_SOUND[surfaceAt(spaceId, pushed.x, pushed.z, layout.plaza)], { pan: stepper.foot ? 0.18 : -0.18 }); // 왼발·오른발 번갈아 살짝 좌우로(음높이는 sfx 가 걸음마다 0.94~1.06 으로 흔든다)
      if (next.arrived) stopWalking();
    } else stepper.reset();
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
    helpGuide.update(dt, Boolean(moveTarget || keyDir), spaceId);
    outfit.update(dt); // 널어 둔 새 셔츠는 밖에 나가 있어도 마른다
    updateWear(dt);
    updateActions(dt);
    fire.update(dt, time);
    shredder.update(dt);
    glitter.update(dt);
    if (hud.isBubbleVisible()) {
      // 플레이어 발 위 1.9 지점을 화면 좌표로.
      const w = renderer.domElement.clientWidth;
      const h = renderer.domElement.clientHeight;
      bubblePoint.set(player.position.x, 1.9, player.position.z).project(camera);
      hud.positionBubble((bubblePoint.x * 0.5 + 0.5) * w, (-bubblePoint.y * 0.5 + 0.5) * h);
    }
    character?.setState(holdsSeat(mode) ? 'sit' : (moveTarget || keyDir) ? 'walk' : 'idle');
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
        } else if (act?.type === 'seat') {
          const sp = seatPromptFor(near, seatsTaken(), act.prompt);
          nextPrompt = sp.text;
          actionable = sp.actionable;
        } else nextPrompt = act ? act.prompt : null;
      }
      // 세탁소 순서 안내(세탁 중 / 세탁 끝: 다음은 널기): 다른 안내(문·빨랫줄 곁 문구)가 없을 때 눌러도 아무 일 없는 힌트로 띄운다. 세탁소 밖에서는 나오지 않는다.
      if (!nextPrompt && mode === 'free') {
        const guide = laundryGuide(outfit.state, { washing: actionId === 'wash' || washTail > 0, spaceId });
        if (guide) { nextPrompt = guide; actionable = false; }
      }
    }
    const promptKey = nextPrompt && (actionable ? nextPrompt : `~${nextPrompt}`);
    if (promptKey !== promptText) {
      promptText = promptKey;
      if (nextPrompt) hud.showPrompt(nextPrompt, actionable);
      else hud.hidePrompt();
    }
    character?.update(dt);
    updateRoastProp(dt);
    if (!character) playerFx.update(dt);
    net?.update(dt, { space: spaceId, x: player.position.x, z: player.position.z, y: player.position.y, rotY: player.rotation.y, anim: character ? character.getAnim() : 'idle', outfit: outfit.state, seat: holdsSeat(mode) });
    remoteSpeech?.update(dt, net.remotes, spaceId);
    quickChat.update(dt);
    updateLine(dt);
    laundry.update(dt);
    interviewers.update(dt);
    crew.update(dt);
    interviewScene.update(dt);
    // 효과음: 듣는 사람 = 플레이어 위치, 좌우는 카메라의 오른쪽 방향 기준. 모닥불 소리(소각로와의 거리)를 갱신한다.
    const camRight = camera.matrixWorld.elements;
    listenerPos.x = player.position.x;
    listenerPos.z = player.position.z;
    listenerPos.rx = camRight[0];
    listenerPos.rz = camRight[2];
    sfx.update(dt, listenerPos, spaceId);

    const k = 1 - Math.exp(-ORBIT.followSpeed * dt);
    desired.set(player.position.x, ORBIT.targetHeight, player.position.z);
    targetPos.lerp(desired, k);
    // 가림 자동 보완: 마당에서 자유 상태로 서 있거나 걸을 때만(실내·전환·앉기·드래그 중에는 안 돈다).
    orbit = { ...orbit, azimuthDeg: cameraClear.update(dt, {
      allowed: spaceId === 'yard' && mode === 'free' && !transition.active && !controls.isDown(),
      target: targetPos.toArray(), orbit, boxes: clearBoxes,
    }).azimuthDeg };
    camera.position.set(...orbitPosition(targetPos.toArray(), orbit));
    camera.lookAt(targetPos);
    if (spaceId === 'yard') updateTreeOcclusion(camera.position, targetPos, dt); // 나무 가림 축소는 마당에서만
    else interiorViews[spaceId].updateWalls(camera.position); // 실내: 카메라 쪽 벽을 숨긴다
  });
}
