// 브라우저 전용: 면접장 연기자. (1) createFx: 그룹에 튀기(bounce)·돌기(spin)·이동(moveAnchor)을 덧입힌다(플레이어와 면접관 공용).
// (2) createActor: 캐릭터 모델 + 기본 동작(idle/sit) + 한 번짜리 동작 + 박수·허우적·손 번쩍·책상 두드림 자세(팔 뼈를 직접 움직임).
import * as THREE from 'three';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { findClip } from './logic/animation.js';

const ease = (k) => k * k * (3 - 2 * k); // smoothstep
const FADE = 0.2;

// group 의 위치·회전에 얹는 움직임. begin() 부터 end() 까지만 group 위치를 맡는다(앵커 = 기준 위치).
// bounce: |sin| 로 튀어 오름(진폭은 부드럽게 변한다. lean 이 있으면 튀어 오를 때 몸이 그만큼(라디안) 앞으로 숙는다: 앉아서 답할 때), spin: 제자리에서 turns 바퀴 돈다(회전에 변화량만 더해 다른 회전과 겹쳐도 된다), moveAnchor: 앵커를 부드럽게 옮긴다(arc 만큼 포물선).
export function createFx(group) {
  let anchor = null;
  let t = 0;
  let amp = 0;
  let ampTarget = 0;
  let freq = 3;
  let lean = 0; // 앞으로 숙이는 최대 각도(라디안)의 현재값/목표값
  let leanTarget = 0;
  let tilt = 0; // 큰절처럼 앞으로 깊이 숙이는 각도(라디안)의 현재값/목표값
  let tiltTarget = 0;
  let yaw = 0; // 천천히 몸(고개)을 돌리는 각도(라디안)의 현재값/목표값(회전에 변화량만 더한다)
  let yawTarget = 0;
  let spin = null; // { turns, seconds, t, last }
  let move = null; // { from, to, seconds, t, arc }
  const fx = {
    get active() { return anchor !== null; },
    get anchor() { return anchor; },
    begin() {
      anchor = { x: group.position.x, y: group.position.y, z: group.position.z };
      t = 0; amp = 0; ampTarget = 0; lean = 0; leanTarget = 0; tilt = 0; tiltTarget = 0; yaw = 0; yawTarget = 0; spin = null; move = null;
      group.rotation.order = 'YXZ'; // 앞으로 숙이기(x)가 몸의 방향(y)을 따라가게
    },
    // 끝: 앵커 자리로 되돌려 놓고 맡은 것을 놓는다.
    end() {
      if (!anchor) return;
      group.position.set(anchor.x, anchor.y, anchor.z);
      group.rotation.x = 0;
      group.rotation.y -= yaw;
      anchor = null; amp = 0; ampTarget = 0; lean = 0; leanTarget = 0; tilt = 0; tiltTarget = 0; yaw = 0; yawTarget = 0; spin = null; move = null;
    },
    setAnchor(patch) { if (anchor) Object.assign(anchor, patch); },
    setBounce(cfg) { ampTarget = cfg ? cfg.amp : 0; leanTarget = cfg?.lean ?? 0; if (cfg) freq = cfg.freq; },
    setTilt(rad) { tiltTarget = rad || 0; },
    setYaw(rad) { yawTarget = rad || 0; },
    startSpin({ turns, seconds }) { spin = { turns, seconds, t: 0, last: 0 }; },
    moveAnchor(to, seconds, arc = 0) {
      if (!anchor) return;
      move = { from: { ...anchor }, to: { x: to.x ?? anchor.x, y: to.y ?? anchor.y, z: to.z ?? anchor.z }, seconds: Math.max(0.01, seconds), t: 0, arc };
    },
    update(dt) {
      if (!anchor) return;
      t += dt;
      amp += (ampTarget - amp) * (1 - Math.exp(-14 * dt));
      lean += (leanTarget - lean) * (1 - Math.exp(-14 * dt));
      tilt += (tiltTarget - tilt) * (1 - Math.exp(-9 * dt));
      const yawPrev = yaw;
      yaw += (yawTarget - yaw) * (1 - Math.exp(-5 * dt));
      group.rotation.y += yaw - yawPrev;
      let arcY = 0;
      if (move) {
        move.t += dt;
        const k = Math.min(1, move.t / move.seconds);
        const e = ease(k);
        anchor.x = move.from.x + (move.to.x - move.from.x) * e;
        anchor.y = move.from.y + (move.to.y - move.from.y) * e;
        anchor.z = move.from.z + (move.to.z - move.from.z) * e;
        arcY = move.arc * Math.sin(Math.PI * k);
        if (k >= 1) move = null;
      }
      const beat = Math.abs(Math.sin(Math.PI * freq * t));
      const hop = amp > 1e-4 ? beat * amp : 0;
      group.position.set(anchor.x, anchor.y + hop + arcY, anchor.z);
      group.rotation.x = (lean > 1e-4 ? beat * lean : 0) + tilt;
      if (spin) {
        spin.t += dt;
        const k = Math.min(1, spin.t / spin.seconds);
        const angle = spin.turns * Math.PI * 2 * ease(k);
        group.rotation.y += angle - spin.last;
        spin.last = angle;
        if (k >= 1) spin = null;
      }
    },
  };
  return fx;
}

// gltf: loadGltf 결과. scale: 모델 배율. base: 기본 동작('idle' | 'sit').
export function createActor(gltf, { scale = 1.5, base = 'idle', oneShots = [] } = {}) {
  const group = new THREE.Group();
  const model = clone(gltf.scene);
  model.scale.setScalar(scale);
  model.traverse((o) => {
    if (o.isMesh) { o.castShadow = true; o.receiveShadow = false; }
  });
  group.add(model);
  const mixer = new THREE.AnimationMixer(model);
  const loops = {};
  for (const name of ['idle', 'sit']) {
    const clip = findClip(gltf.animations, name);
    if (clip) loops[name] = mixer.clipAction(clip);
  }
  const shots = {};
  for (const name of oneShots) {
    const clip = findClip(gltf.animations, name);
    if (!clip) continue;
    const action = mixer.clipAction(clip);
    action.setLoop(THREE.LoopOnce, 1);
    action.clampWhenFinished = false;
    shots[name] = action;
  }
  let baseName = loops[base] ? base : 'idle';
  let playing = loops[baseName] ?? null;
  playing?.play();

  function crossTo(to, fade = FADE) {
    const from = playing;
    playing = to;
    to.reset().play();
    if (from && from !== to) from.crossFadeTo(to, fade, false);
  }
  mixer.addEventListener('finished', (e) => {
    if (e.action === playing && loops[baseName]) crossTo(loops[baseName], 0.25); // 한 번짜리 동작이 끝나면 기본 동작으로
  });

  // 박수 자세: 두 팔 뼈를 앞으로 들고 박자에 맞춰 모았다 벌린다(애니메이션 위에 덮어쓴다).
  const arms = {};
  model.traverse((o) => { if (o.isBone && (o.name === 'arm-left' || o.name === 'arm-right')) arms[o.name] = o; });
  let pose = null;
  let poseT = 0;

  const bounds = new THREE.Box3().setFromObject(model);
  const fx = createFx(group);

  return {
    group, fx,
    top: bounds.max.y, // 선 자세의 머리 꼭대기 높이(그룹 기준)
    setBase(name) { // 'idle' | 'sit': 한 번짜리 동작이 없을 때의 자세
      if (!loops[name]) return;
      baseName = name;
      if (!Object.values(shots).includes(playing)) crossTo(loops[name]);
    },
    // 한 번짜리 동작을 재생하고, 끝나면 기본 동작으로 돌아온다. 모르는 클립이면 무시.
    play(name, speed = 1) {
      const action = shots[name];
      if (!action) return false;
      action.timeScale = speed;
      crossTo(action, 0.12);
      return true;
    },
    setPose(name) { pose = name; poseT = 0; },
    update(dt) {
      mixer.update(dt);
      fx.update(dt);
      const L = arms['arm-left'];
      const R = arms['arm-right'];
      if (pose && pose !== 'clap' && L && R) { // 허둥지둥(flail) / 손 번쩍(raise) / 책상 두드림(drum)
        poseT += dt;
        if (pose === 'flail') { L.rotation.set(-2.1 + 0.9 * Math.sin(poseT * 17), -0.4, 0); R.rotation.set(-2.1 + 0.9 * Math.sin(poseT * 17 + 2.2), 0.4, 0); }
        else if (pose === 'raise') { R.rotation.set(-2.2 + 0.25 * Math.sin(poseT * 9), 0.4, 0); }
        else if (pose === 'drum') { L.rotation.set(-1.0 + 0.45 * Math.max(0, Math.sin(poseT * 16)), -0.25, 0); R.rotation.set(-1.0 + 0.45 * Math.max(0, Math.sin(poseT * 16 + Math.PI)), 0.25, 0); }
      }
      if (pose === 'clap' && arms['arm-left'] && arms['arm-right']) {
        poseT += dt;
        const s = 0.5 + 0.5 * Math.sin(poseT * Math.PI * 2 * 3.2); // 0 활짝 ~ 1 모음
        const open = 0.55 + 0.75 * s; // 화면으로 맞춘 값: 두 팔을 앞으로 들고(-1.3) 안팎으로 모았다 벌린다
        arms['arm-left'].rotation.set(-1.3, -open, 0);
        arms['arm-right'].rotation.set(-1.3, open, 0);
      }
    },
  };
}
