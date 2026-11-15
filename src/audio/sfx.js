// 게임이 쓰는 효과음 공개 API(얇은 층). 이름으로 소리를 낸다: sfx.play('ding'), sfx.play('stepGrass', { rate: 0.95 }), 위치가 있는 소리는 { at: { x, z } }(듣는 사람과의 거리로 줄고 좌우로 쏠린다).
// - 첫 사용자 입력 전에는 모든 호출이 아무 일도 하지 않는다(브라우저가 자동재생을 막는다). 음소거이거나 Web Audio 가 없어도 마찬가지다.
// - 어떤 호출도 던지지 않는다(소리 오류가 게임 루프를 멈추면 안 된다).
// - sfx.update(dt, 듣는 사람, 공간 id) 를 매 프레임 부르면 모닥불 소리가 소각로와의 거리에 따라 커졌다 작아진다(배경음·앰비언스는 없다: 반복음은 모닥불 하나뿐).
import { createEngine } from './engine.js';
import { RECIPES, LOOPS } from './recipes.js';
import { fireSamples } from './fireSynth.js';
import { fireFile } from './fireFile.js';
import { stepBank, STEP_SURFACES } from './stepSynth.js';
import {
  distanceGain, panFromOffset, createThrottle, createRateLimiter, stepFade, sameSpace, varied, speakerVoice, speechPlan, remotePitch,
} from '../logic/audioPolicy.js';

const SPATIAL = { ref: 2.5, max: 20, power: 2 }; // 다른 방문자 소리의 거리 감쇠(단위: 월드 거리)
const PAN_RANGE = 12; // 이만큼 옆에 있으면 소리가 끝까지 그쪽으로 쏠린다
const MIN_AUDIBLE = 0.02; // 이보다 작아지면 만들지 않는다(노드를 아낀다)
const REMOTE_GAIN = 0.45; // 다른 방문자 소리의 기본 배율(내 소리보다 한참 작게)
const REMOTE_LIMIT = { perSecond: 4, burst: 3 }; // 다른 방문자 소리 전체의 초당 상한(6명이 몰려도 시끄럽지 않게)
const FIRE_FALLOFF = { ref: 2.5, max: 15, power: 2 }; // 모닥불 소리: 가까우면 또렷, 멀면 거의 안 들린다
const FIRE_FADE_SECONDS = 0.5;
const LOOP_ON = 0.003; // 이 이상이면 반복음을 켠다(미만에서 목표 0 이면 끈다)
const LEVEL_EPSILON = 0.004; // 반복음 크기를 이만큼 이상 바뀔 때만 다시 지정한다

const engine = createEngine();
if (typeof window !== 'undefined') engine.install();

const throttle = createThrottle();
const remoteLimiter = createRateLimiter(REMOTE_LIMIT);
const listener = { x: 0, z: 0, rx: 1, rz: 0 };
let space = 'yard';
let firePos = null;
let remoteGate = () => true;
let traceFn = null;
let warned = false;
let warmed = false;
const loopState = Object.fromEntries([...Object.keys(LOOPS)].map((name) => [name, { handle: null, level: 0, applied: -1, failed: false }]));

// 모닥불 소리 파일이 뒤늦게 불러와지면, 이미 합성 소리로 돌고 있는 반복음을 끄고 다음 프레임에 파일 소리로 다시 시작한다.
fireFile.onLoaded(() => {
  const st = loopState.fire;
  if (st && st.handle) { try { st.handle.stop(); } catch { /* 이미 멈췄다 */ } st.handle = null; st.applied = -1; }
});

const warnOnce = (err) => {
  if (warned) return;
  warned = true;
  console.warn('효과음 오류(소리만 꺼집니다)', err);
};

// 소리 하나. 성공적으로 시작했으면 true. o: { gain, rate, pan, at: { x, z }, space, remote, voice, syllables ... }(나머지는 레시피에 넘어간다)
function play(name, o = {}) {
  let reason = 'ok';
  try {
    const def = RECIPES[name];
    if (!def) reason = 'unknown';
    else if (!engine.canPlay) reason = engine.muted ? 'muted' : 'locked';
    else {
      const remote = Boolean(o.remote);
      let gain = (o.gain ?? 1) * def.gain * varied(1, def.jitter.gain, Math.random);
      let pan = o.pan ?? 0;
      if (remote && !remoteGate()) reason = 'remote-off';
      else if (!sameSpace(o.space, space)) reason = 'other-space';
      else if (o.at) {
        const dx = o.at.x - listener.x;
        const dz = o.at.z - listener.z;
        const g = distanceGain(Math.hypot(dx, dz), SPATIAL);
        if (g < MIN_AUDIBLE) reason = 'far';
        else {
          gain *= g;
          pan = panFromOffset(dx, dz, listener.rx, listener.rz, { range: PAN_RANGE });
        }
      }
      if (reason === 'ok' && remote) gain *= REMOTE_GAIN;
      if (reason === 'ok') {
        const now = engine.now;
        if (remote && !remoteLimiter.take(now)) reason = 'remote-cap';
        else if (!throttle.allow(remote ? `${name}~` : name, now, def.minInterval)) reason = 'throttled';
        else {
          const rate = (o.rate ?? 1) * varied(1, def.jitter.pitch, Math.random);
          const voice = engine.startVoice({ name, priority: def.priority, run: def.run, opts: { ...def.demo, ...o }, gain, pan, rate });
          if (!voice) reason = 'dropped';
        }
      }
    }
  } catch (err) {
    warnOnce(err);
    reason = 'error';
  }
  if (traceFn) { try { traceFn({ name, ok: reason === 'ok', reason, remote: Boolean(o.remote), at: o.at ?? null }); } catch { /* 추적기의 오류는 무시 */ } }
  return reason === 'ok';
}

// 말풍선 웅얼거림. id: hud 말풍선 id('player' | 면접관 id | 'r-<방문자 id>'), textLength: 글자 수(길수록 음절이 늘어난다).
function speech(id, textLength, o = {}) {
  const voice = speakerVoice(id);
  return play('speech', { ...o, voice, syllables: speechPlan(textLength), rate: voice === 'remote' ? remotePitch(id) : 1, remote: voice === 'remote' || Boolean(o.remote) });
}

// 반복음(모닥불) 하나의 크기를 level(0~1)로 맞춘다. 켜져야 하면 켜고, 목표가 0 이고 다 잦아들었으면 끈다.
function applyLoop(name, level, target) {
  const st = loopState[name];
  if (level > LOOP_ON && !st.handle && !st.failed) {
    try {
      st.handle = engine.startLoop(LOOPS[name], level);
      st.applied = level;
    } catch (err) {
      st.failed = true;
      warnOnce(err);
    }
  }
  if (!st.handle) return;
  if (level <= LOOP_ON && target === 0) {
    st.handle.stop();
    st.handle = null;
    st.applied = -1;
  } else if (Math.abs(level - st.applied) > LEVEL_EPSILON) {
    st.handle.setLevel(level);
    st.applied = level;
  }
}

// 매 프레임. 모닥불 소리의 크기를 정한다. listenerPos: { x, z, rx, rz }(rx, rz: 카메라의 오른쪽 방향, 없으면 (1,0)), spaceId: 지금 공간.
function update(dt, listenerPos, spaceId) {
  try {
    if (listenerPos) {
      listener.x = listenerPos.x;
      listener.z = listenerPos.z;
      listener.rx = listenerPos.rx ?? 1;
      listener.rz = listenerPos.rz ?? 0;
    }
    space = spaceId;
    if (!engine.ready) return; // 아직 입력이 없었거나(잠김) 탭이 숨겨져 멈춘 동안은 아무것도 하지 않는다
    if (!warmed) { // 모닥불 표본(약 0.2초)과 발소리 변형 뱅크(바닥마다 수십 ms)를 처음 쓰는 순간에 만들면 화면이 한 번 끊기므로, 소리가 켜지자마자 시간을 나눠 미리 만들어 둔다
      warmed = true;
      const rate = engine.context.sampleRate;
      setTimeout(() => { try { fireSamples(rate); } catch (err) { warnOnce(err); } }, 800);
      STEP_SURFACES.forEach((surface, i) => setTimeout(() => { try { stepBank(surface, rate); } catch (err) { warnOnce(err); } }, 300 + i * 250));
    }
    const muted = engine.muted;
    const fireTarget = muted || spaceId !== 'yard' || !firePos ? 0 : distanceGain(Math.hypot(firePos.x - listener.x, firePos.z - listener.z), FIRE_FALLOFF);
    const fire = loopState.fire;
    fire.level = stepFade(fire.level, fireTarget, dt, FIRE_FADE_SECONDS);
    applyLoop('fire', fire.level, fireTarget);
  } catch (err) {
    warnOnce(err);
  }
}

export const sfx = {
  engine,
  play,
  speech,
  update,
  // 첫 사용자 입력에서 불러야 한다(엔진이 입력 감시를 달아 두므로 보통은 부르지 않아도 된다: 사운드 시험 페이지의 버튼 같은 곳에서 확실히 하려고 쓴다).
  unlock: () => engine.unlock(),
  setMuted: (value) => engine.setMuted(value),
  isMuted: () => engine.muted,
  toggleMuted() {
    engine.setMuted(!engine.muted);
    return engine.muted;
  },
  setVolume: (value) => engine.setVolume(value),
  getVolume: () => engine.volume,
  get supported() { return engine.supported; },
  onChange: (fn) => engine.onChange(fn),
  setFire(pos) { firePos = pos ? { x: pos.x, z: pos.z } : null; },
  // 다른 방문자 소리를 내도 되는가를 알려 주는 함수(멀티플레이가 꺼져 있으면 false 를 돌려주어 남의 소리를 모두 끈다).
  setRemoteGate(fn) { remoteGate = typeof fn === 'function' ? fn : () => true; },
  // 시험·점검용: 모든 호출({ name, ok, reason, remote, at })을 받아 본다. 해제 함수를 돌려준다.
  trace(fn) {
    traceFn = fn;
    return () => { if (traceFn === fn) traceFn = null; };
  },
  stats: () => ({ supported: engine.supported, unlocked: engine.unlocked, ready: engine.ready, muted: engine.muted, volume: engine.volume, voices: engine.activeVoices(), loops: Object.entries(loopState).filter(([, s]) => s.handle).map(([n, s]) => [n, +s.level.toFixed(3)]) }),
};
