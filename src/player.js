// 브라우저 전용: 캐릭터 모델 + idle/walk/sit 기본 애니메이션 + 소각장 행동용 한 번짜리 클립 재생.
import * as THREE from 'three';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { PLAYER_MODEL } from './config.js';
import { clipNameForState, findClip, FADE_SECONDS } from './logic/animation.js';

const ACTION_CLIPS = ['pick-up', 'attack-melee-right', 'attack-melee-left']; // 소각장 행동에 쓰는 클립
const ACTION_FADE = 0.08; // 행동 클립 사이/행동 시작 크로스페이드(초). 클립 길이가 짧아 기본 페이드(0.2)보다 짧게 둔다.
const TURN_SPEED = 15; // faceToward 의 지수 보간 속도(1/초): 약 0.2초에 거의 다 돌아선다.
const HAND_BONE = /arm[-_ ]?right|right[-_ ]?(hand|arm)|hand[-_ ]?r/i;

// gltf: loadGltf 결과. group 이 이동/회전되는 대상이고, 모델은 그 자식이다.
// extraSeconds: 행동(클립 묶음) 하나를 클립 길이의 합보다 이만큼 더 길게 보이도록 천천히 재생한다(배속 = 합 / (합 + extraSeconds)).
export function createPlayer(gltf, { extraSeconds = 0 } = {}) {
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
  // 클립 이름 묶음의 재생 배속: 원래 길이의 합이 (합 + extraSeconds) 가 되도록 늘린다.
  const speedFor = (names) => {
    const total = names.reduce((sum, n) => sum + (oneShots[n]?.raw ?? 0), 0);
    return total > 0 ? total / (total + extraSeconds) : 1;
  };
  let current = 'idle'; // 기본 상태 이름(행동 중에는 마지막으로 재생하던 기본 상태)
  let playing = actions.idle ?? null; // 지금 가장 비중이 큰 액션
  actions.idle?.play();

  // 행동(한 번짜리 클립 연속 재생). 진행 중에는 기본 idle/walk/sit 전환을 멈춘다.
  let sequence = null; // { names, index, elapsed, speed }
  let turnTarget = null; // faceToward 목표 yaw

  function crossTo(to, fade) {
    const from = playing;
    playing = to;
    if (from === to) { to.reset().play(); return; }
    to.reset().play();
    from?.crossFadeTo(to, fade, false);
  }

  function playStep() {
    const name = sequence.names[sequence.index];
    const shot = oneShots[name];
    if (!shot) return;
    shot.action.timeScale = sequence.speed;
    crossTo(shot.action, ACTION_FADE);
  }

  // state: 'idle' | 'walk' | 'sit'. 바뀔 때만 크로스페이드한다. 클립이 없으면(sit 등) idle 로 대신한다. 행동 중에는 무시한다.
  function setState(state) {
    if (sequence) return;
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
    // 행동(클립 이름 배열)들의 클립 길이(초, 늘려 재생하는 길이). 러너에 넘긴다. 행동마다 합이 (원래 합 + extraSeconds) 가 된다.
    getClipDurations(clipLists) {
      const out = {};
      for (const names of clipLists) {
        const speed = speedFor(names);
        for (const name of names) if (oneShots[name]) out[name] = oneShots[name].raw / speed;
      }
      return out;
    },
    getHandAttach: () => handHolder,
    // 월드 점 (x, z) 쪽으로 몸을 돌린다(이동할 때와 같은 방향 규칙: +z 를 보는 모델의 yaw).
    faceToward(x, z) {
      turnTarget = Math.atan2(x - group.position.x, z - group.position.z);
    },
    // 클립들을 순서대로 한 번씩 재생하기 시작한다. 이어 붙이는 시점은 update 가 클립 길이로 계산한다.
    playClips(names) {
      sequence = { names, index: 0, elapsed: 0, speed: speedFor(names) };
      playStep();
    },
    // 행동을 끝내고 idle 로 크로스페이드한다.
    endAction() {
      if (!sequence) return;
      sequence = null;
      turnTarget = null;
      current = 'idle';
      const to = actions.idle;
      if (!to) return;
      const from = playing;
      playing = to;
      to.reset().play();
      from?.crossFadeTo(to, FADE_SECONDS, false);
    },
    isActionPlaying: () => sequence !== null,
    update(dt) {
      if (sequence) {
        sequence.elapsed += dt;
        // 현재 클립이 끝났으면 다음 클립(없으면 마지막 자세를 유지)
        for (;;) {
          const shot = oneShots[sequence.names[sequence.index]];
          const len = shot ? shot.raw / sequence.speed : 0;
          if (sequence.elapsed < len || sequence.index >= sequence.names.length - 1) break;
          sequence.elapsed -= len;
          sequence.index += 1;
          playStep();
        }
      }
      if (turnTarget !== null) {
        const diff = Math.atan2(Math.sin(turnTarget - group.rotation.y), Math.cos(turnTarget - group.rotation.y));
        group.rotation.y += diff * (1 - Math.exp(-TURN_SPEED * dt));
      }
      mixer.update(dt);
    },
  };
}
