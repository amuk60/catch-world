// 오디오 엔진(저수준): AudioContext 를 첫 사용자 입력 때 한 번만 만들고, 마스터 체인(효과음 버스 -> 리미터 -> 마스터 볼륨 -> 소프트 클립 -> 스피커),
// 동시 소리 수 제한(우선순위로 끊기), 공용 잡음 버퍼, 음소거·볼륨 저장, 탭이 숨겨지면 멈춤을 맡는다. 무엇이 실패해도 게임 루프로 던지지 않고 조용히 꺼진다.
// 이름 붙은 소리(재생·위치·모닥불)는 audio/sfx.js 가 이 위에서 한다.
import { voiceDecision, volumeToGain, DEFAULT_VOLUME } from '../logic/audioPolicy.js';
import { loadFireFile } from './fireFile.js';

export const STORAGE_KEYS = { muted: 'catch-world-sfx-muted', volume: 'catch-world-sfx-volume' };
export const MAX_VOICES = 24; // 동시에 울리는 효과음 상한(넘으면 덜 중요하고 오래된 것부터 끊는다)
const NOISE_SECONDS = 3; // 잡음 버퍼 길이(반복해서 쓴다)
const NOISE_SEAM = 2048; // 반복 이음매를 부드럽게 맞출 표본 수
const START_DELAY = 0.01; // 소리 시작 여유(초): 지금 시각에 정확히 예약하면 앞부분이 잘릴 수 있다
const MUTE_RAMP = 0.04; // 음소거·볼륨 바꿀 때 딸깍 소리가 나지 않게 천천히 옮기는 시간 상수(초)
const LIMITER = { threshold: -6, knee: 6, ratio: 20, attack: 0.002, release: 0.2 }; // 마스터 압축기(터지는 소리를 눌러 준다)
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// ---- 잡음 버퍼(공용, 한 번만 만든다) ----
// white/pink/brown 각 NOISE_SECONDS 초. 끝에서 처음으로 돌아가는 이음매가 튀지 않게 끝부분을 처음에 섞어 맞춘다. 최대 진폭 0.95 로 맞춘다.
export function createNoiseBuffers(ctx, rng = Math.random) {
  const length = Math.floor(ctx.sampleRate * NOISE_SECONDS);
  const total = length + NOISE_SEAM;
  const white = new Float32Array(total);
  const pink = new Float32Array(total);
  const brown = new Float32Array(total);
  let b0 = 0; let b1 = 0; let b2 = 0; let b3 = 0; let b4 = 0; let b5 = 0; let b6 = 0; let last = 0;
  for (let i = 0; i < total; i++) {
    const w = rng() * 2 - 1;
    white[i] = w;
    b0 = 0.99886 * b0 + w * 0.0555179; // Paul Kellet 의 분홍 잡음 근사
    b1 = 0.99332 * b1 + w * 0.0750759;
    b2 = 0.969 * b2 + w * 0.153852;
    b3 = 0.8665 * b3 + w * 0.3104856;
    b4 = 0.55 * b4 + w * 0.5329522;
    b5 = -0.7616 * b5 - w * 0.016898;
    pink[i] = b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362;
    b6 = w * 0.115926;
    last = (last + 0.02 * w) / 1.02; // 갈색 잡음: 새는 적분
    brown[i] = last;
  }
  const make = (raw) => {
    const out = new Float32Array(length);
    for (let i = 0; i < length; i++) out[i] = i < NOISE_SEAM ? raw[i] * (i / NOISE_SEAM) + raw[length + i] * (1 - i / NOISE_SEAM) : raw[i];
    let peak = 0;
    for (let i = 0; i < length; i++) peak = Math.max(peak, Math.abs(out[i]));
    const k = peak > 0 ? 0.95 / peak : 1;
    for (let i = 0; i < length; i++) out[i] *= k;
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    buffer.getChannelData(0).set(out);
    return buffer;
  };
  return { white: make(white), pink: make(pink), brown: make(brown) };
}

// ---- 마스터 체인 ----
// sfxBus -> 압축기(리미터 구실) -> 마스터 게인 -> 소프트 클립(어떤 경우에도 1 을 넘지 않게) -> 출력.
export function createGraph(ctx, { masterGain = volumeToGain(DEFAULT_VOLUME) } = {}) {
  const sfxBus = ctx.createGain();
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = LIMITER.threshold;
  comp.knee.value = LIMITER.knee;
  comp.ratio.value = LIMITER.ratio;
  comp.attack.value = LIMITER.attack;
  comp.release.value = LIMITER.release;
  const master = ctx.createGain();
  master.gain.value = masterGain;
  const clip = ctx.createWaveShaper();
  const curve = new Float32Array(1024);
  for (let i = 0; i < curve.length; i++) curve[i] = Math.tanh((i / (curve.length - 1)) * 2 - 1);
  clip.curve = curve;
  sfxBus.connect(comp);
  comp.connect(master);
  master.connect(clip);
  clip.connect(ctx.destination);
  return { sfxBus, comp, master, clip };
}

// ---- 소리 한 번(목소리) 만들기: 레시피 -> 소리별 게인 -> (좌우 위치) -> 버스. 엔진과 오프라인 시험이 같은 코드를 쓴다. ----
// 돌려주는 값: { out, panner, duration }. 레시피가 던지면 연결을 끊고 던진다.
export function buildVoice({ ctx, bus, noise, rng, run, opts = {}, gain = 1, pan = 0, rate = 1, t = ctx.currentTime + START_DELAY }) {
  const out = ctx.createGain();
  out.gain.value = gain;
  let panner = null;
  if (pan && ctx.createStereoPanner) {
    panner = ctx.createStereoPanner();
    panner.pan.value = clamp(pan, -1, 1);
    out.connect(panner);
    panner.connect(bus);
  } else {
    out.connect(bus);
  }
  let duration;
  try {
    duration = run({ ctx, out, t, noise, rng, rate }, opts);
  } catch (err) {
    out.disconnect();
    panner?.disconnect();
    throw err;
  }
  return { out, panner, duration: Number.isFinite(duration) && duration > 0 ? duration : 0.5, t };
}

// ---- 엔진 ----
function safeStorage(win) {
  try { return win?.localStorage ?? null; } catch { return null; }
}
function readSaved(storage, key) {
  try { return storage?.getItem(key) ?? null; } catch { return null; }
}
function writeSaved(storage, key, value) {
  try { storage?.setItem(key, value); } catch { /* 저장소를 못 써도 이번 방문에는 동작한다 */ }
}

// opts: { win, storage, rng } (시험에서 가짜를 넘길 수 있다)
export function createEngine({ win = globalThis.window, storage, rng = Math.random } = {}) {
  const Ctor = win?.AudioContext ?? win?.webkitAudioContext ?? null;
  const store = storage === undefined ? safeStorage(win) : storage;
  let ctx = null;
  let graph = null;
  let noise = null;
  let failed = false;
  let muted = readSaved(store, STORAGE_KEYS.muted) === '1';
  const savedVolume = Number(readSaved(store, STORAGE_KEYS.volume));
  let volume = readSaved(store, STORAGE_KEYS.volume) !== null && Number.isFinite(savedVolume) ? clamp(savedVolume, 0, 1) : DEFAULT_VOLUME;
  const listeners = new Set();
  const voices = []; // { id, name, priority, start, end, out, panner }
  let nextId = 1;
  let detach = null;

  const notify = () => { for (const fn of listeners) { try { fn(); } catch { /* 구독자의 오류는 소리와 무관하다 */ } } };
  const masterTarget = () => (muted ? 0 : volumeToGain(volume));

  function dropVoice(v) {
    const i = voices.indexOf(v);
    if (i >= 0) voices.splice(i, 1);
    try { v.out.disconnect(); v.panner?.disconnect(); } catch { /* 이미 끊겼다 */ }
  }
  function prune(now) {
    for (let i = voices.length - 1; i >= 0; i--) if (voices[i].end <= now) dropVoice(voices[i]);
  }

  const api = {
    get supported() { return Boolean(Ctor) && !failed; },
    get unlocked() { return ctx !== null; },
    get ready() { return ctx !== null && ctx.state === 'running'; },
    // 지금 소리를 내도 되는가(만들어졌고, 돌고 있고, 음소거가 아니다).
    get canPlay() { return this.ready && !muted; },
    get muted() { return muted; },
    get volume() { return volume; },
    get context() { return ctx; },
    get graph() { return graph; },
    get noise() { return noise; },
    get rng() { return rng; },
    get now() { return ctx ? ctx.currentTime : 0; },
    activeVoices() {
      if (ctx) prune(ctx.currentTime);
      return voices.length;
    },
    onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },

    // 첫 사용자 입력에서 불러야 한다. 처음 부르면 AudioContext 를 만들고, 멈춰 있으면 재개한다. 성공 여부를 돌려준다.
    unlock() {
      if (!Ctor || failed) return false;
      try {
        if (!ctx) {
          ctx = new Ctor({ latencyHint: 'interactive' });
          graph = createGraph(ctx, { masterGain: masterTarget() });
          noise = createNoiseBuffers(ctx, rng);
          ctx.onstatechange = () => { if (ctx.state === 'running') detach?.(); notify(); };
          loadFireFile(ctx); // 모닥불 소리 파일(없으면 합성 소리를 그대로 쓴다)
        }
        if (ctx.state === 'suspended' && !win?.document?.hidden) {
          const p = ctx.resume();
          if (p && p.catch) p.catch(() => {});
        }
        return true;
      } catch (err) {
        failed = true;
        ctx = null;
        graph = null;
        noise = null;
        return false;
      }
    },

    // 사용자 입력(눌림·키)과 탭 가시성 감시를 건다. 컨텍스트는 첫 입력에서 만든다(그 전에는 아무것도 만들거나 켜지 않는다).
    install() {
      if (!win || detach) return;
      const onGesture = () => { api.unlock(); };
      const opts = { capture: true, passive: true };
      const events = ['pointerdown', 'keydown', 'touchstart'];
      for (const name of events) win.addEventListener(name, onGesture, opts);
      const onVisibility = () => {
        if (!ctx) return;
        try {
          if (win.document.hidden) ctx.suspend();
          else ctx.resume();
        } catch { /* 무시 */ }
      };
      win.document?.addEventListener('visibilitychange', onVisibility);
      detach = () => { for (const name of events) win.removeEventListener(name, onGesture, opts); detach = null; }; // 돌기 시작하면 입력 감시는 그만(가시성 감시는 남긴다)
    },

    setMuted(value) {
      muted = Boolean(value);
      writeSaved(store, STORAGE_KEYS.muted, muted ? '1' : '0');
      if (graph) graph.master.gain.setTargetAtTime(masterTarget(), ctx.currentTime, MUTE_RAMP);
      notify();
    },
    setVolume(value) {
      volume = Number.isFinite(value) ? clamp(value, 0, 1) : DEFAULT_VOLUME;
      writeSaved(store, STORAGE_KEYS.volume, String(volume));
      if (graph) graph.master.gain.setTargetAtTime(masterTarget(), ctx.currentTime, MUTE_RAMP);
      notify();
    },

    // 소리 하나를 시작한다. { name, priority, run, opts, gain, pan, rate }. 시작했으면 목소리({ id, ... }), 아니면 null.
    startVoice({ name, priority = 2, run, opts, gain = 1, pan = 0, rate = 1 }) {
      if (!api.canPlay) return null;
      const now = ctx.currentTime;
      prune(now);
      const decision = voiceDecision(voices, priority, MAX_VOICES);
      if (decision.action === 'drop') return null;
      if (decision.action === 'steal') {
        const victim = voices.find((v) => v.id === decision.id);
        if (victim) {
          victim.out.gain.cancelScheduledValues(now);
          victim.out.gain.setTargetAtTime(0, now, 0.01);
          setTimeout(() => dropVoice(victim), 120);
          voices.splice(voices.indexOf(victim), 1); // 목록에서는 바로 뺀다(자리를 비운다)
        }
      }
      const built = buildVoice({ ctx, bus: graph.sfxBus, noise, rng, run, opts, gain, pan, rate });
      const voice = { id: nextId++, name, priority, start: built.t, end: built.t + built.duration + 0.15, out: built.out, panner: built.panner };
      voices.push(voice);
      return voice;
    },

    // 끊기지 않는 소리를 시작한다(모닥불). def: { run, gain }. 돌려주는 핸들: { setLevel(0~1), stop() }.
    startLoop(def, level = 0) {
      if (!api.canPlay) return null;
      const g = ctx.createGain();
      g.gain.value = level * def.gain;
      g.connect(graph.sfxBus);
      let handle;
      try {
        handle = def.run({ ctx, out: g, t: ctx.currentTime, noise, rng, rate: 1 });
      } catch (err) {
        g.disconnect();
        throw err;
      }
      return {
        setLevel(value, timeConstant = 0.1) { g.gain.setTargetAtTime(value * def.gain, ctx.currentTime, timeConstant); },
        stop() {
          const now = ctx.currentTime;
          g.gain.cancelScheduledValues(now);
          g.gain.setTargetAtTime(0, now, 0.05);
          try { handle.stop(now + 0.4); } catch { /* 이미 멈췄다 */ }
          setTimeout(() => { try { g.disconnect(); } catch { /* 이미 끊겼다 */ } }, 500);
        },
      };
    },
  };
  return api;
}
