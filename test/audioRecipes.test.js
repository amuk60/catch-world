import test from 'node:test';
import assert from 'node:assert/strict';
import { RECIPES, LOOPS, SOUND_NAMES, LOOP_NAMES } from '../src/audio/recipes.js';
import { createNoiseBuffers, createGraph, buildVoice, createEngine, STORAGE_KEYS, MAX_VOICES } from '../src/audio/engine.js';
import { speakerVoice } from '../src/logic/audioPolicy.js';
import { synthFire, FIRE } from '../src/audio/fireSynth.js';
import { stepBank, synthStep, STEP, STEP_SURFACES } from '../src/audio/stepSynth.js';
import { checkFire, checkStepBank } from '../src/audio/soundChecks.js';
import { crestFactor, rmsOf, peakOf, bandShare, seamCheck, crackleStats } from '../src/audio/metrics.js';

// ---- 가짜 AudioContext: 노드 연결·예약 값을 기록하고 Web Audio 가 던지는 잘못(NaN, 0 으로의 지수 곡선, 음수 시각)을 똑같이 던진다 ----
function fakeContext() {
  const nodes = [];
  const log = { stops: [], starts: [] };
  const checkTime = (t) => { assert.ok(Number.isFinite(t) && t >= 0, `시각이 이상함: ${t}`); };
  function param(owner, value = 0) {
    const p = {
      _owner: owner, value,
      setValueAtTime(v, t) { assert.ok(Number.isFinite(v), `값이 이상함: ${v}`); checkTime(t); p.value = v; return p; },
      linearRampToValueAtTime(v, t) { assert.ok(Number.isFinite(v), `값이 이상함: ${v}`); checkTime(t); return p; },
      exponentialRampToValueAtTime(v, t) { assert.ok(Number.isFinite(v) && v > 0, `지수 곡선의 목표는 0 보다 커야 함: ${v}`); checkTime(t); return p; },
      setTargetAtTime(v, t) { assert.ok(Number.isFinite(v)); checkTime(t); return p; },
      cancelScheduledValues() { return p; },
    };
    return p;
  }
  function node(kind, extra = {}) {
    const n = { kind, _out: [], connect(target) { n._out.push(target._owner ?? target); return target; }, disconnect() { n._out.length = 0; }, ...extra };
    nodes.push(n);
    return n;
  }
  const source = (kind) => {
    const n = node(kind, {
      start(t) { checkTime(t); n._started = t; log.starts.push(t); },
      stop(t) { checkTime(t); assert.ok(n._started !== undefined && t >= n._started, '시작 전에 멈춤'); n._stopped = t; log.stops.push(t); },
    });
    return n;
  };
  const ctx = {
    sampleRate: 8000, currentTime: 0, state: 'running',
    destination: node('destination'),
    createGain() { const n = node('gain'); n.gain = param(n, 1); return n; },
    createOscillator() { const n = source('osc'); n.type = 'sine'; n.frequency = param(n, 440); n.detune = param(n, 0); return n; },
    createBufferSource() { const n = source('buffer'); n.buffer = null; n.loop = false; n.playbackRate = param(n, 1); return n; },
    createBiquadFilter() { const n = node('filter'); n.type = 'lowpass'; n.frequency = param(n, 350); n.Q = param(n, 1); return n; },
    createStereoPanner() { const n = node('panner'); n.pan = param(n, 0); return n; },
    createDynamicsCompressor() { const n = node('comp'); for (const k of ['threshold', 'knee', 'ratio', 'attack', 'release']) n[k] = param(n, 0); return n; },
    createWaveShaper() { return node('shaper'); },
    createBuffer(ch, length, rate) { const data = new Float32Array(length); return { length, sampleRate: rate, duration: length / rate, getChannelData: () => data }; },
  };
  return { ctx, nodes, log };
}

// 모든 노드가 (직접 또는 파라미터 변조를 거쳐) 연결 끝(out)에 닿는지.
function assertAllReachOut(nodes, out) {
  const reaches = (n, seen = new Set()) => {
    if (n === out) return true;
    if (seen.has(n)) return false;
    seen.add(n);
    return n._out.some((m) => reaches(m, seen));
  };
  for (const n of nodes) {
    if (n === out || n.kind === 'destination') continue;
    assert.ok(reaches(n), `${n.kind} 노드가 출력에 연결되지 않음(소리가 새어 나가지 않는다)`);
  }
}

function runRecipe(name, def, rng, opts = {}) {
  const { ctx, nodes, log } = fakeContext();
  const noise = createNoiseBuffers(ctx, rng);
  const sink = ctx.createGain();
  const before = nodes.length;
  const built = buildVoice({ ctx, bus: sink, noise, rng, run: def.run, opts: { ...def.demo, ...opts }, gain: 1, pan: 0.3, rate: 1.1, t: 0.5 });
  return { ctx, nodes: nodes.slice(before), log, built, sink };
}

const seeded = (seed) => () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;

test('잡음 버퍼: 세 종류, 유한하고 최대 0.95, 이음매가 부드럽다', () => {
  const { ctx } = fakeContext();
  const noise = createNoiseBuffers(ctx, seeded(1));
  for (const kind of ['white', 'pink', 'brown']) {
    const data = noise[kind].getChannelData(0);
    let peak = 0;
    for (const v of data) { assert.ok(Number.isFinite(v)); peak = Math.max(peak, Math.abs(v)); }
    assert.ok(peak > 0.9 && peak <= 0.951, `${kind} peak ${peak}`);
    if (kind !== 'white') { // 끝 -> 처음 이음매의 점프가 평균 이웃 차이의 몇 배를 넘지 않는다
      const jump = Math.abs(data[0] - data[data.length - 1]);
      let avg = 0;
      for (let i = 1; i < 2000; i++) avg += Math.abs(data[i] - data[i - 1]);
      assert.ok(jump < (avg / 2000) * 8 + 0.02, `${kind} seam jump ${jump}`);
    }
  }
});

for (const name of SOUND_NAMES) {
  test(`레시피 ${name}: 던지지 않고, 값이 유한하며, 길이가 선언과 맞고, 모든 노드가 출력에 연결된다`, () => {
    const def = RECIPES[name];
    for (const seed of [1, 2, 3]) {
      const { nodes, log, built, sink } = runRecipe(name, def, seeded(seed));
      const [lo, hi] = def.duration;
      assert.ok(built.duration >= lo && built.duration <= hi, `길이 ${built.duration} 가 ${lo}~${hi} 밖`);
      assert.ok(log.starts.length > 0, '소리를 내는 소스가 없음');
      const lastStop = Math.max(...log.stops);
      assert.ok(lastStop - 0.5 <= built.duration + 0.15, `소스가 선언 길이 ${built.duration} 보다 오래 남음(끝 ${lastStop - 0.5})`);
      assert.ok(built.duration - (lastStop - 0.5) <= 0.5, `선언 길이 ${built.duration} 가 실제 끝(${lastStop - 0.5})보다 너무 길다`);
      assertAllReachOut(nodes, sink);
    }
    assert.ok(def.priority >= 1 && def.priority <= 4);
    assert.ok(def.gain > 0 && def.gain <= 6);
    assert.ok(def.minInterval >= 0);
    assert.ok(def.group && def.label);
  });
}

for (const name of LOOP_NAMES) {
  test(`반복음 ${name}: 던지지 않고 멈출 수 있으며 모든 소스가 출력에 연결된다`, () => {
    const { ctx, nodes } = fakeContext();
    const noise = createNoiseBuffers(ctx, seeded(4));
    const out = ctx.createGain();
    const before = nodes.length;
    const handle = LOOPS[name].run({ ctx, out, t: 0, noise, rng: seeded(5), rate: 1 });
    assert.equal(typeof handle.stop, 'function');
    handle.stop(10);
    assertAllReachOut(nodes.slice(before), out);
    assert.ok(nodes.slice(before).some((n) => n._started === 0));
  });
}

// ---- 소리 정리: 배경음 없음, 필요한 소리만 ----
test('반복음은 소각로 모닥불 하나뿐이고(배경음·앰비언스 없음), 효과음에도 앰비언스 버스·분류가 없다', () => {
  assert.deepEqual(LOOP_NAMES, ['fire']);
  for (const [name, def] of Object.entries({ ...RECIPES, ...LOOPS })) {
    assert.equal(def.bus, undefined, `${name} 에 bus 가 남음`);
    assert.notEqual(def.group, '앰비언스', name);
  }
});

test('빼기로 한 소리는 레시피에 없고, 남기기로 한 소리만 있다', () => {
  const removed = ['crumple', 'paperOut', 'sigh', 'tick', 'swish', 'wearRustle', 'sit', 'stand', 'marker', 'relief', 'toss', 'firePop', 'bird', 'hover', 'scrape', 'hop', 'stomp', 'ambYard', 'ambLaundry', 'ambInterview'];
  for (const name of removed) assert.equal(SOUND_NAMES.includes(name) || LOOP_NAMES.includes(name), false, `${name} 가 남아 있음`);
  const kept = ['stepGrass', 'stepTile', 'portal', 'whoof', 'shredder', 'washSplash', 'washerRattle', 'flap', 'tada', 'ding', 'confirm', 'speech', 'applause', 'ohno', 'laugh', 'fanfare', 'click', 'popupSide', 'popupModal', 'jingle', 'crack', 'fortune'];
  assert.deepEqual([...SOUND_NAMES].sort(), [...kept].sort());
});

test('발소리: 미리 만든 변형 뱅크 중 하나를 버퍼 소스로 재생한다(진동음·실시간 거르개 없음, 60~200ms)', () => {
  for (const name of ['stepGrass', 'stepTile']) {
    for (const seed of [1, 2, 3]) {
      const { nodes, log, built } = runRecipe(name, RECIPES[name], seeded(seed));
      assert.ok(built.duration >= 0.06 && built.duration <= 0.2, `${name} 길이 ${built.duration}`);
      assert.equal(nodes.filter((n) => n.kind === 'osc').length, 0, `${name}: 진동음이 있다`);
      assert.equal(nodes.filter((n) => n.kind === 'filter').length, 0, `${name}: 실시간 거르개가 없다(파형은 미리 만들어 두었다)`);
      const sources = nodes.filter((n) => n.kind === 'buffer');
      assert.equal(sources.length, 1);
      assert.equal(sources[0].loop, false);
      assert.ok(peakOf(sources[0].buffer.getChannelData(0)) > 0.05, '무음 변형');
      assert.ok(Math.max(...log.stops) - 0.5 <= 0.22, `${name} 소스가 오래 남음`);
    }
  }
});

test('발소리: 같은 바닥을 연달아 걸으면 변형이 골고루 쓰이고, 직전과 같은 변형이나 최근 3 걸음 안의 변형이 다시 나오지 않는다', () => {
  for (const name of ['stepGrass', 'stepTile']) {
    const { ctx, nodes } = fakeContext();
    const sink = ctx.createGain();
    const rng = seeded(77);
    const bank = new Map();
    const picks = [];
    for (let i = 0; i < 60; i++) {
      buildVoice({ ctx, bus: sink, noise: {}, rng, run: RECIPES[name].run, opts: {}, gain: 1, rate: 1, t: 0.5 + i * 0.4 });
      const src = nodes.filter((n) => n.kind === 'buffer').at(-1);
      if (!bank.has(src.buffer)) bank.set(src.buffer, bank.size);
      picks.push(bank.get(src.buffer));
    }
    assert.ok(bank.size >= 8 && bank.size <= 12, `${name}: 변형 ${bank.size} 개`);
    for (let i = 1; i < picks.length; i++) {
      for (let k = 1; k <= 3 && i - k >= 0; k++) assert.notEqual(picks[i], picks[i - k], `${name}: ${i} 번째 걸음이 ${k} 걸음 전과 같은 변형 ${picks[i]}`);
    }
  }
});

test('발소리: 재생 속도에 따라 길이가 달라지고, 흔들림은 음높이 +-6%·크기 +-1.5dB 이며 소리 크기는 뱅크에 이미 들어 있다', () => {
  const { ctx } = fakeContext();
  const sink = ctx.createGain();
  const nodes = [];
  const origCreate = ctx.createBufferSource;
  ctx.createBufferSource = () => { const n = origCreate(); nodes.push(n); return n; };
  for (const rate of [0.94, 1, 1.06]) {
    const duration = buildVoice({ ctx, bus: sink, noise: {}, rng: seeded(5), run: RECIPES.stepTile.run, opts: {}, gain: 1, rate, t: 0.5 }).duration;
    const src = nodes.at(-1);
    assert.equal(src.playbackRate.value, rate);
    assert.ok(Math.abs(duration * rate - src.buffer.duration) < 1e-9, '길이 = 변형 길이 / 재생 속도');
  }
  for (const name of ['stepGrass', 'stepTile']) {
    const j = RECIPES[name].jitter;
    assert.ok(Math.abs(j.pitch - 0.06) < 1e-9, `${name} 음높이 흔들림 ${j.pitch}`);
    assert.ok(j.gain >= 0.15 && j.gain <= 0.2, `${name} 크기 흔들림 +-1.5dB(${j.gain})`);
    assert.equal(RECIPES[name].gain, 1);
  }
});

// ---- 발소리 변형 뱅크: 서로 다른 파형, 의도한 대역, 작고 부드러운 소리 ----
test('발소리 변형 뱅크: 바닥마다 8~12 개이고 서로 다르며, 길이·중심 주파수·낮은 쪽·최대 진폭이 기준 안이다', () => {
  for (const sr of [22050, 44100]) {
    for (const surface of STEP_SURFACES) {
      const bank = stepBank(surface, sr, seeded(sr + surface.length));
      assert.equal(bank.length, STEP.variants);
      const res = checkStepBank(surface, bank, sr);
      const fails = res.items.filter((i) => !i.ok).map((i) => `${i.label}=${i.text}`);
      assert.ok(res.ok, `${surface}@${sr}: ${fails.join(', ')}`);
      for (const data of bank) for (let i = 0; i < data.length; i += 7) assert.ok(Number.isFinite(data[i]));
    }
  }
});

test('발소리: 한 걸음은 뒤꿈치 -> 발끝의 여러 미세 사건이다(앞쪽이 가장 세고, 뒤쪽에도 더 약한 소리가 있다)', () => {
  const sr = 44100;
  for (const surface of STEP_SURFACES) {
    let lateSum = 0;
    const bank = stepBank(surface, sr, seeded(3));
    for (const data of bank) {
      const win = (a, b) => { let p = 0; for (let i = Math.round((a * sr) / 1000); i < Math.min(data.length, Math.round((b * sr) / 1000)); i++) p = Math.max(p, Math.abs(data[i])); return p; };
      const total = peakOf(data);
      assert.ok(win(0, 60) > total * 0.5, `${surface}: 앞쪽(뒤꿈치)에 센 소리가 있다`);
      assert.ok(win(60, 200) > total * 0.04, `${surface}: 뒤쪽(발끝)에도 소리가 있다`);
      lateSum += win(60, 200) / total;
    }
    assert.ok(lateSum / bank.length < 0.85, `${surface}: 뒤쪽이 평균적으로 더 약하다(${(lateSum / bank.length).toFixed(2)})`);
  }
});

test('발소리 합성: 씨앗이 다르면 다르고, 같은 씨앗이면 같다', () => {
  const a = synthStep('grass', 22050, seeded(1));
  const b = synthStep('grass', 22050, seeded(2));
  assert.notDeepEqual(a.slice(0, 500), b.slice(0, 500));
  assert.deepEqual(synthStep('tile', 22050, seeded(9)), synthStep('tile', 22050, seeded(9)));
});

test('세탁기 덜컹: 짧고 낮은 두드림 몇 번뿐이고, 이어지는 웅웅거림(긴 진동음·톱니파)이 없다', () => {
  const { nodes, built } = runRecipe('washerRattle', RECIPES.washerRattle, seeded(3));
  assert.ok(built.duration >= 1.0 && built.duration <= 1.5, `길이 ${built.duration}`);
  const oscs = nodes.filter((n) => n.kind === 'osc');
  assert.ok(oscs.length >= 4, '덜컹 몇 번');
  for (const o of oscs) {
    assert.ok(o._stopped - o._started <= 0.3, `진동음이 ${o._stopped - o._started}초 이어짐`);
    assert.notEqual(o.type, 'sawtooth', '톱니파 웅웅 없음');
    assert.ok(o.frequency.value <= 280, `낮은 두드림 ${o.frequency.value}Hz`);
  }
});

test('말소리 웅얼거림은 최대 3 음절로 짧다', () => {
  for (const voice of ['leader', 'hr', 'mentor', 'player', 'remote']) {
    const { nodes, built } = runRecipe('speech', RECIPES.speech, seeded(5), { voice, syllables: 99 });
    assert.ok(built.duration <= 0.6, `${voice} 길이 ${built.duration}`);
    assert.ok(nodes.filter((n) => n.kind === 'osc').length <= 3);
  }
});

// ---- 모닥불(편안한 ASMR): 미리 만든 되풀이 표본, 하나하나 또렷한 타닥임 ----
test('모닥불 표본: 유한하고 RMS 가 맞고, 타닥임이 드물고 또렷하며(희소·파고율·횟수·대역) 홀로 튀지 않는다', () => {
  for (const sr of [22050, 44100]) {
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const data = synthFire(sr, seeded(seed));
      assert.equal(data.length, Math.floor(sr * FIRE.seconds));
      for (let i = 0; i < data.length; i += 97) assert.ok(Number.isFinite(data[i]));
      const rms = rmsOf(data);
      assert.ok(Math.abs(peakOf(data) - FIRE.peak) < 1e-3, `최대 진폭 ${peakOf(data)}`);
      assert.ok(rms > 0.01 && rms < 0.03, `rms ${rms}`);
      const res = checkFire(data, sr, LOOPS.fire.gain);
      assert.ok(res.ok, `seed ${seed}@${sr}: ${res.items.filter((i) => !i.ok).map((i) => `${i.label}=${i.text}`).join(', ')}`);
    }
  }
});

test('모닥불 표본: 이전 촘촘한 판(파고율 약 4)보다 훨씬 뾰족하고 사건 사이가 조용하다(치익거림이 아니다)', () => {
  const sr = 22050;
  const data = synthFire(sr, seeded(21));
  assert.ok(crestFactor(data) > 12, `파고율 ${crestFactor(data).toFixed(1)}`);
  const st = crackleStats(data, sr);
  assert.ok(st.sparsityDb >= 15, `희소성 ${st.sparsityDb.toFixed(1)}dB`);
  // 5ms 창 중 큰 창(95 백분위)의 약 1/5.6(-15dB) 아래로 조용한 창이 절반 넘게 있다
  const win = Math.round(sr * 0.005);
  const levels = [];
  for (let w = 0; w + win <= data.length; w += win) levels.push(rmsOf(data.subarray(w, w + win)));
  levels.sort((a, b) => a - b);
  const quiet = levels.filter((v) => v < levels[Math.floor(levels.length * 0.95)] / 5.6).length / levels.length;
  assert.ok(quiet > 0.5, `조용한 창 ${quiet.toFixed(2)}`);
});

test('모닥불 표본: 낮은 불꽃 숨결(70~240Hz)이 아주 작게 깔린다(타닥임 사이 정적은 불의 정적)', () => {
  const sr = 22050;
  const data = synthFire(sr, seeded(31));
  assert.ok(bandShare(data, sr, 40, 260) > 0.005, '숨결 대역 에너지가 없다');
  const win = Math.round(sr * 0.005);
  const levels = [];
  for (let w = 0; w + win <= data.length; w += win) levels.push(rmsOf(data.subarray(w, w + win)));
  levels.sort((a, b) => a - b);
  assert.ok(levels[Math.floor(levels.length / 2)] > 0, '완전한 무음이 아니다');
  assert.ok(levels[Math.floor(levels.length / 2)] < rmsOf(data) / 2, '바닥이 높다(계속 이어지는 잡음)');
});

test('모닥불 표본: 끝 -> 처음 이음매가 이어지고, 같은 씨앗이면 같고 씨앗이 다르면 다르다', () => {
  const sr = 22050;
  for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
    const data = synthFire(sr, seeded(seed));
    const seam = seamCheck(data, sr);
    assert.ok(seam.localJump <= 4, `이음매 점프(둘레 대비) ${seam.localJump.toFixed(2)}`);
    assert.ok(Math.abs(data[0] - data[data.length - 1]) < peakOf(data) * 0.1, '이음매에서 값이 크게 튄다');
  }
  assert.deepEqual(synthFire(sr, seeded(7)).slice(0, 2000), synthFire(sr, seeded(7)).slice(0, 2000));
  assert.notDeepEqual(synthFire(sr, seeded(7)).slice(0, 2000), synthFire(sr, seeded(8)).slice(0, 2000));
});

test('모닥불 표본: 규칙적인 박자가 없고(사건 포락선 자기상관 < 0.3) 큰 타닥은 가끔만 난다', () => {
  const sr = 22050;
  for (const seed of [11, 12, 13]) {
    const st = crackleStats(synthFire(sr, seeded(seed)), sr);
    assert.ok(st.periodicity < 0.3, `일정한 박자의 흔적 ${st.periodicity.toFixed(2)}`);
    assert.ok(st.rate >= 4 && st.rate <= 14, `타닥임 ${st.rate.toFixed(1)}/초`);
  }
  const data = synthFire(sr, seeded(14));
  const p = peakOf(data);
  let count = 0; let last = -1e9;
  for (let i = 0; i < data.length; i++) if (Math.abs(data[i]) > 0.5 * p && i - last > sr * 0.15) { count++; last = i; }
  assert.ok(count >= 2 && count <= 14, `큰 타닥 ${count} 번(16초 동안)`);
});

test('모닥불 반복음: 만든 표본이 소스에 담겨 반복 재생되고 멈출 수 있다', () => {
  const { ctx, nodes } = fakeContext();
  const out = ctx.createGain();
  const before = nodes.length;
  const handle = LOOPS.fire.run({ ctx, out, t: 0, noise: createNoiseBuffers(ctx, seeded(4)), rng: seeded(5), rate: 1 });
  const src = nodes.slice(before).find((n) => n.kind === 'buffer');
  assert.equal(src.loop, true);
  assert.ok(Math.abs(src.buffer.duration - FIRE.seconds) < 0.01);
  assert.ok(peakOf(src.buffer.getChannelData(0)) > 0);
  handle.stop(3);
  assert.equal(src._stopped, 3);
});

test('말소리: 목소리마다 음절 수만큼 길어지고 최대 3 음절(아주 짧게)', () => {
  const lens = [1, 2, 3].map((n) => runRecipe('speech', RECIPES.speech, seeded(9), { voice: 'leader', syllables: n }).built.duration);
  assert.ok(lens[0] < lens[1] && lens[1] < lens[2]);
  assert.ok(runRecipe('speech', RECIPES.speech, seeded(9), { voice: 'leader', syllables: 8 }).built.duration <= lens[2] + 0.01, '8 음절을 요구해도 3 음절 길이');
  assert.ok(runRecipe('speech', RECIPES.speech, seeded(9), { voice: 'leader', syllables: 99 }).built.duration <= RECIPES.speech.duration[1]);
  for (const id of ['player', 'leader', 'hr', 'mentor', 'r-x']) runRecipe('speech', RECIPES.speech, seeded(2), { voice: speakerVoice(id), syllables: 4 });
});

test('buildVoice: 레시피가 던지면 연결을 끊고 그대로 던진다', () => {
  const { ctx } = fakeContext();
  const sink = ctx.createGain();
  assert.throws(() => buildVoice({ ctx, bus: sink, noise: {}, rng: Math.random, run: () => { throw new Error('boom'); } }), /boom/);
  assert.equal(sink._out.length, 0);
});

// ---- 엔진 ----
function fakeWindow(extra = {}) {
  const store = new Map();
  const events = {};
  const created = [];
  class FakeAudioContext {
    constructor() {
      Object.assign(this, fakeContext().ctx);
      this.state = 'suspended';
      created.push(this);
      this.resume = () => { this.state = 'running'; this.onstatechange?.(); return Promise.resolve(); };
      this.suspend = () => { this.state = 'suspended'; return Promise.resolve(); };
    }
  }
  const win = {
    AudioContext: FakeAudioContext,
    localStorage: { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) },
    document: { hidden: false, addEventListener: (n, fn) => { (events[`doc:${n}`] ??= []).push(fn); } },
    addEventListener: (n, fn) => { (events[n] ??= []).push(fn); },
    removeEventListener: (n, fn) => { events[n] = (events[n] ?? []).filter((f) => f !== fn); },
    ...extra,
  };
  return { win, store, events, created };
}

test('엔진: 첫 입력 전에는 AudioContext 를 만들지 않고, 입력이 오면 한 번만 만든다', () => {
  const { win, events, created } = fakeWindow();
  const engine = createEngine({ win, rng: seeded(1) });
  engine.install();
  assert.equal(created.length, 0);
  assert.equal(engine.ready, false);
  assert.equal(engine.startVoice({ name: 'x', run: () => 1 }), null, '잠긴 동안은 소리를 내지 않는다');
  const [onPointer] = events.pointerdown;
  const [onKey] = events.keydown;
  onPointer();
  onKey();
  assert.equal(created.length, 1);
  assert.equal(engine.ready, true);
  assert.equal((events.pointerdown ?? []).length, 0, '돌기 시작하면 입력 감시를 거둔다');
});

test('엔진: Web Audio 가 없거나 만들다 던져도 조용히 꺼진다', () => {
  const none = createEngine({ win: { localStorage: null } });
  assert.equal(none.supported, false);
  assert.equal(none.unlock(), false);
  assert.equal(none.startVoice({ name: 'x', run: () => 1 }), null);
  assert.doesNotThrow(() => { none.setMuted(true); none.setVolume(0.2); });
  const broken = createEngine({ win: { AudioContext: class { constructor() { throw new Error('no device'); } }, localStorage: null } });
  assert.equal(broken.unlock(), false);
  assert.equal(broken.supported, false);
  assert.equal(broken.unlock(), false, '다시 시도하지 않는다');
});

test('엔진: 음소거·볼륨이 저장되고, 저장소가 던져도 동작한다', () => {
  const { win, store } = fakeWindow();
  const a = createEngine({ win, rng: seeded(1) });
  a.setMuted(true);
  a.setVolume(0.3);
  assert.equal(store.get(STORAGE_KEYS.muted), '1');
  assert.equal(store.get(STORAGE_KEYS.volume), '0.3');
  const b = createEngine({ win, rng: seeded(1) });
  assert.equal(b.muted, true);
  assert.equal(b.volume, 0.3);
  const throwing = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); } };
  const c = createEngine({ win, storage: throwing });
  assert.equal(c.muted, false);
  assert.doesNotThrow(() => c.setMuted(true));
  assert.equal(c.muted, true);
});

test('엔진: 음소거 중에는 소리를 내지 않는다', () => {
  const { win } = fakeWindow();
  const engine = createEngine({ win, rng: seeded(1) });
  engine.unlock();
  engine.setMuted(true);
  assert.equal(engine.startVoice({ name: 'x', run: () => 0.2 }), null);
  engine.setMuted(false);
  assert.ok(engine.startVoice({ name: 'x', run: () => 0.2 }));
});

test('엔진: 동시 소리 상한을 지키고, 덜 중요한 오래된 소리부터 끊는다', () => {
  const { win, created } = fakeWindow();
  const engine = createEngine({ win, rng: seeded(1) });
  engine.unlock();
  const run = () => 5; // 5초짜리(시계가 멈춰 있어 끝나지 않는다)
  for (let i = 0; i < MAX_VOICES + 10; i++) engine.startVoice({ name: `low${i}`, priority: 1, run });
  assert.equal(engine.activeVoices(), MAX_VOICES);
  const rejected = engine.startVoice({ name: 'x', priority: 0, run });
  assert.equal(rejected, null, '더 덜 중요한 새 소리는 버린다');
  const stolen = engine.startVoice({ name: 'important', priority: 4, run });
  assert.ok(stolen);
  assert.equal(engine.activeVoices(), MAX_VOICES, '하나를 끊고 새로 시작하므로 상한 그대로');
  created[0].currentTime = 10; // 시간이 지나면 모두 끝난다
  assert.equal(engine.activeVoices(), 0);
});

test('엔진: 레시피가 던지면 시작하지 않고 던진다(sfx 층이 잡는다)', () => {
  const { win } = fakeWindow();
  const engine = createEngine({ win, rng: seeded(1) });
  engine.unlock();
  assert.throws(() => engine.startVoice({ name: 'x', run: () => { throw new Error('bad recipe'); } }), /bad recipe/);
  assert.equal(engine.activeVoices(), 0);
});

test('마스터 체인: 효과음 버스 -> 압축기 -> 마스터 -> 소프트 클립 -> 출력', () => {
  const { ctx } = fakeContext();
  const g = createGraph(ctx, { masterGain: 0.4 });
  assert.equal(g.master.gain.value, 0.4);
  assert.ok(g.sfxBus._out.includes(g.comp));
  assert.equal(g.ambBus, undefined, '앰비언스 버스는 없다');
  assert.ok(g.comp._out.includes(g.master));
  assert.ok(g.master._out.includes(g.clip));
  assert.ok(g.clip._out.includes(ctx.destination));
});
