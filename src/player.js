// 브라우저 전용: 캐릭터 모델 + idle/walk/sit 기본 애니메이션 + 소각장 행동용 한 번짜리 클립 재생.
import * as THREE from 'three';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { PLAYER_MODEL } from './config.js';
import { clipNameForState, findClip, FADE_SECONDS } from './logic/animation.js';

const ACTION_CLIPS = ['pick-up', 'attack-melee-right', 'attack-melee-left']; // 소각장 행동에 쓰는 클립
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

  const mixer = new THREE.AnimationMixer(model);
  const actions = {};
  for (const name of ['idle', 'walk', 'sit']) {
    const clip = findClip(gltf.animations, name);
    if (clip) actions[name] = mixer.clipAction(clip);
  }
  const oneShots = {}; // 행동 클립 이름 -> { action, raw(원래 길이, 초) }
  for (const name of ACTION_CLIPS) {
    const clip = findClip(gltf.animations, name);
    if (!clip) continue;
    const action = mixer.clipAction(clip);
    action.setLoop(THREE.LoopOnce, 1);
    action.clampWhenFinished = true;
    oneShots[name] = { action, raw: clip.duration };
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
    setState,
    handBoneName: handBone?.name ?? null,
    // 행동에 쓰는 클립의 원래 길이(초). 늘려 재생할 길이는 logic/actions.js 의 stretchDurations 가 계산한다.
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
    endAction() {
      if (!acting) return;
      acting = false;
      turn = null;
      current = 'idle';
      if (actions.idle) crossTo(actions.idle, FADE_SECONDS);
    },
    isActing: () => acting,
    update(dt) {
      if (turn) {
        turn.t += dt;
        const k = Math.min(1, turn.t / turn.dur);
        group.rotation.y = turn.from + turn.delta * (k * k * (3 - 2 * k)); // smoothstep
        if (k >= 1) turn = null;
      }
      mixer.update(dt);
    },
  };
}
