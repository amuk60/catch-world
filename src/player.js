// 브라우저 전용: 캐릭터 모델 + idle/walk/sit 기본 애니메이션 + 소각장 행동용 한 번짜리 클립 재생.
import * as THREE from 'three';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { PLAYER_MODEL } from './config.js';
import { clipNameForState, findClip, FADE_SECONDS } from './logic/animation.js';
import { createOutfitLook } from './outfitLook.js';
import { createFx } from './actor.js';

const ACTION_CLIPS = ['emote-no', 'pick-up', 'attack-melee-right', 'interact-right', 'emote-yes', 'interact-left', 'jump', 'holding-right', 'holding-both']; // 구역 행동(소각장·세탁소·면접장)에 쓰는 클립
const ACTION_FADE = 0.15; // 행동 클립으로 넘어갈 때 크로스페이드(초)
const HAND_BONE = /arm[-_ ]?right|right[-_ ]?(hand|arm)|hand[-_ ]?r/i;

// gltf: loadGltf 결과. group 이 이동/회전되는 대상이고, 모델은 그 자식이다.
export function createPlayer(gltf) {
  const group = new THREE.Group();
  const model = clone(gltf.scene);
  model.scale.setScalar(PLAYER_MODEL.scale);
  model.rotation.y = THREE.MathUtils.degToRad(PLAYER_MODEL.facingOffsetDeg);
  model.traverse((o) => {
    if (o.isMesh) { o.castShadow = true; o.receiveShadow = false; }
  });
  group.add(model);
  const look = createOutfitLook(model);
  const fx = createFx(group); // 면접장 장면의 튀기·돌기·책상 위 이동(begin/end 사이에만 group 위치를 맡는다)

  const mixer = new THREE.AnimationMixer(model);
  const actions = {};
  for (const name of ['idle', 'walk', 'sit']) {
    const clip = findClip(gltf.animations, name);
    if (clip) actions[name] = mixer.clipAction(clip);
  }
  const animNames = new Map(); // 액션 -> 클립 이름(멀티플레이로 내 동작을 알릴 때 쓴다)
  for (const [name, action] of Object.entries(actions)) animNames.set(action, name);
  const oneShots = {}; // 행동 클립 이름 -> { action, raw(원래 길이, 초) }
  for (const name of ACTION_CLIPS) {
    const clip = findClip(gltf.animations, name);
    if (!clip) continue;
    const action = mixer.clipAction(clip);
    action.setLoop(THREE.LoopOnce, 1);
    action.clampWhenFinished = true;
    oneShots[name] = { action, raw: clip.duration };
    animNames.set(action, name);
  }
  let current = 'idle'; // 기본 상태 이름(행동 중에는 마지막으로 재생하던 기본 상태)
  let playing = actions.idle ?? null; // 지금 가장 비중이 큰 액션
  actions.idle?.play();

  // 행동 중에는 기본 idle/walk/sit 전환을 멈춘다. 행동의 단계(회전·클립)는 러너가 정하고 main 이 아래 메서드를 부른다.
  let acting = false;
  let turn = null; // { from, delta, t, dur }

  function crossTo(to, fade) {
    const from = playing;
    playing = to;
    to.reset().play();
    if (from && from !== to) from.crossFadeTo(to, fade, false);
  }

  // state: 'idle' | 'walk' | 'sit'. 바뀔 때만 크로스페이드한다. 클립이 없으면(sit 등) idle 로 대신한다. 행동 중에는 무시한다.
  function setState(state) {
    if (acting) return;
    const name = clipNameForState(state);
    const next = actions[name] ? name : 'idle';
    if (next === current && playing === actions[next]) return;
    current = next;
    const to = actions[next];
    if (!to) { playing?.fadeOut(FADE_SECONDS); playing = null; return; }
    const from = playing;
    playing = to;
    to.reset().play();
    if (from) from.crossFadeTo(to, FADE_SECONDS, false);
  }

  // 절차적 몸짓(클립 위에 얹는 작은 기울임): 머리 끄덕임(nod, x축)·갸웃(tilt, z축)·상체 숙임(lean, x축). 라디안, 목표값으로 부드럽게 따라간다.
  // 클립이 매 프레임 덮어쓰는 뼈는 덮이고, 안 쓰는 뼈는 직전에 얹은 만큼을 먼저 되돌린 뒤 다시 얹어 누적되지 않는다. 내 캐릭터만 쓴다(다른 방문자에게는 클립만 보인다).
  const poseBones = { head: null, torso: null };
  model.traverse((o) => { if (o.isBone && o.name === 'head') poseBones.head = o; else if (o.isBone && o.name === 'torso') poseBones.torso = o; });
  const poseGoal = { nod: 0, tilt: 0, lean: 0 };
  const poseNow = { nod: 0, tilt: 0, lean: 0 };
  const poseApplied = { head: new THREE.Quaternion(), torso: new THREE.Quaternion() };
  const poseQ = new THREE.Quaternion();
  const poseE = new THREE.Euler();
  function undoPose() {
    for (const key of ['head', 'torso']) {
      const bone = poseBones[key];
      if (bone) bone.quaternion.multiply(poseQ.copy(poseApplied[key]).invert());
      poseApplied[key].identity();
    }
  }
  function applyPose() {
    if (poseBones.head) { poseApplied.head.setFromEuler(poseE.set(poseNow.nod, 0, poseNow.tilt)); poseBones.head.quaternion.multiply(poseApplied.head); }
    if (poseBones.torso) { poseApplied.torso.setFromEuler(poseE.set(poseNow.lean, 0, 0)); poseBones.torso.quaternion.multiply(poseApplied.torso); }
  }

  // 오른손(팔 끝)에 소품을 붙일 자리. 뼈의 스케일(모델 스케일)을 상쇄해 자식의 단위가 월드 단위와 같다.
  // 오른손 뼈를 못 찾으면 group 에 고정 위치로 붙인다.
  let handBone = null;
  model.traverse((o) => { if (!handBone && o.isBone && HAND_BONE.test(o.name)) handBone = o; });
  const handHolder = new THREE.Group();
  handHolder.name = 'hand-holder';
  if (handBone) {
    handBone.add(handHolder);
    const s = new THREE.Vector3();
    handBone.updateWorldMatrix(true, false);
    handBone.getWorldScale(s);
    handHolder.scale.set(1 / s.x, 1 / s.y, 1 / s.z);
  } else {
    handHolder.position.set(-0.35, 0.8, 0.3);
    group.add(handHolder);
  }

  return {
    group,
    fx,
    setState,
    handBoneName: handBone?.name ?? null,
    // 옷 상태('clean' | 'dirty' | 'tank' | 'drying' | 'dry')에 맞춰 겉모습을 바꾼다(정장 / 그을음 / 흰 나시).
    applyOutfit: (state) => look.apply(state),
    getAppearance: () => look.appearance,
    // 행동에 쓰는 클립의 원래 길이(초). 늘려 재생할 길이는 logic/actions.js 의 fitDurations 가 계산한다.
    getRawClipDurations() {
      const out = {};
      for (const [name, shot] of Object.entries(oneShots)) out[name] = shot.raw;
      return out;
    },
    getHandAttach: () => handHolder,
    beginAction() { acting = true; },
    // 월드 점 (x, z) 쪽으로 seconds 초 동안 제자리에서 몸을 돌린다(이동할 때와 같은 방향 규칙: +z 를 보는 모델의 yaw).
    // 이미 그쪽을 보고 있어도 seconds 동안 기다린 뒤 끝난다(러너의 단계 길이와 맞춘다).
    turnToward(x, z, seconds) {
      const to = Math.atan2(x - group.position.x, z - group.position.z);
      const delta = Math.atan2(Math.sin(to - group.rotation.y), Math.cos(to - group.rotation.y));
      if (seconds <= 0) { group.rotation.y += delta; turn = null; return; }
      turn = { from: group.rotation.y, delta, t: 0, dur: seconds };
    },
    // 행동 중 제자리 대기 자세로 크로스페이드한다(회전 단계).
    idleInPlace() {
      const to = actions.idle;
      if (to && playing !== to) crossTo(to, FADE_SECONDS);
    },
    // 행동 클립 하나를 한 번 재생한다. speed 는 재생 배속(늘려 재생하면 1 보다 작다).
    playClip(name, speed = 1) {
      const shot = oneShots[name];
      if (!shot) return;
      shot.action.timeScale = speed;
      crossTo(shot.action, ACTION_FADE);
    },
    // 행동이 끝났거나 취소됐다: 회전을 멈추고 idle 로 크로스페이드하고 기본 상태 전환을 되살린다.
    // state 가 'sit' 이면 끝난 뒤에도 앉은 채다(면접장 의자에서 답한 뒤): 이미 앉은 클립이면 다시 시작하지 않는다.
    endAction(state = 'idle') {
      if (!acting) return;
      acting = false;
      turn = null;
      poseGoal.nod = 0; poseGoal.tilt = 0; poseGoal.lean = 0;
      const to = actions[state] ?? actions.idle;
      current = actions[state] ? state : 'idle';
      if (to && playing !== to) crossTo(to, FADE_SECONDS);
    },
    // 행동 중 제자리에서 앉은 자세로 크로스페이드한다(의자로 돌아와 앉을 때).
    sitInPlace() {
      const to = actions.sit;
      if (to && playing !== to) crossTo(to, FADE_SECONDS);
    },
    // 절차적 몸짓 목표(생략한 값은 0). 행동이 끝나면 endAction 이 모두 0 으로 되돌린다.
    setPose({ nod = 0, tilt = 0, lean = 0 } = {}) { poseGoal.nod = nod; poseGoal.tilt = tilt; poseGoal.lean = lean; },
    isActing: () => acting,
    // 지금 재생 중(크로스페이드 중이면 가는 쪽)인 클립 이름. 'idle' | 'walk' | 'sit' | 행동 클립 이름.
    getAnim: () => animNames.get(playing) ?? 'idle',
    update(dt) {
      if (turn) {
        turn.t += dt;
        const k = Math.min(1, turn.t / turn.dur);
        group.rotation.y = turn.from + turn.delta * (k * k * (3 - 2 * k)); // smoothstep
        if (k >= 1) turn = null;
      }
      undoPose();
      mixer.update(dt);
      const k = 1 - Math.exp(-14 * dt);
      for (const key of ['nod', 'tilt', 'lean']) poseNow[key] += (poseGoal[key] - poseNow[key]) * k;
      applyPose();
      fx.update(dt);
    },
  };
}
