import test from 'node:test';
import assert from 'node:assert/strict';
import { RECIPES, LOOPS, SOUND_NAMES, LOOP_NAMES } from '../src/audio/recipes.js';
import { createNoiseBuffers, createGraph, buildVoice, createEngine, STORAGE_KEYS, MAX_VOICES } from '../src/audio/engine.js';
import { speakerVoice } from '../src/logic/audioPolicy.js';
import { synthFire, FIRE } from '../src/audio/fireSynth.js';
import { crestFactor, rmsOf, peakOf, spectralCentroid, bandShare, spikeRatio, seamCheck } from '../src/audio/metrics.js';

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
    createBufferSource() { const n = source('buffer'); n.buffer = null; n.loop = false; return n; },
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
  const kept = ['stepGrass', 'stepStone', 'stepTile', 'portal', 'whoof', 'shredder', 'washSplash', 'washerRattle', 'flap', 'tada', 'ding', 'confirm', 'speech', 'applause', 'ohno', 'laugh', 'fanfare', 'click', 'popupSide', 'popupModal', 'jingle', 'crack', 'fortune'];
  assert.deepEqual([...SOUND_NAMES].sort(), [...kept].sort());
});

test('발소리: 낮은 몸통(진동음) 없이 높은 대역의 아주 짧은 거른 잡음 알갱이뿐이다(사박사박)', () => {
  for (const name of ['stepGrass', 'stepStone', 'stepTile']) {
    for (const seed of [1, 2, 3]) {
      const { nodes, log, built } = runRecipe(name, RECIPES[name], seeded(seed));
      assert.ok(built.duration <= 0.13, `${name} 길이 ${built.duration}`);
      assert.equal(nodes.filter((n) => n.kind === 'osc').length, 0, `${name}: 낮은 쿵 소리를 내는 진동음이 있다`);
      const filters = nodes.filter((n) => n.kind === 'filter');
      const highpasses = filters.filter((f) => f.type === 'highpass');
      const bands = filters.filter((f) => f.type === 'bandpass');
      assert.ok(highpasses.length >= 2 && highpasses.length === bands.length, `${name}: 알갱이마다 하이패스 + 밴드패스`);
      for (const f of highpasses) assert.ok(f.frequency.value >= 770, `${name}: 하이패스 ${f.frequency.value}Hz`); // rate 1.1 이 곱해져 있다(레시피는 700 이상)
      for (const f of bands) assert.ok(f.frequency.value >= 1500 && f.frequency.value <= 6500, `${name}: 밴드 ${f.frequency.value}Hz`);
      const grainLen = Math.max(...log.stops) - 0.5;
      assert.ok(grainLen <= 0.2, `${name} 소스가 오래 남음 ${grainLen}`);
    }
  }
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

// ---- 모닥불(편안한 ASMR): 미리 만든 되풀이 표본 ----
test('모닥불 표본: 유한하고 RMS 가 맞고 파고율이 낮고 따뜻하며 홀로 튀는 소리가 없다', () => {
  const sr = 22050;
  for (const seed of [1, 2, 3, 4, 5, 6]) {
    const data = synthFire(sr, seeded(seed));
    assert.equal(data.length, Math.floor(sr * FIRE.seconds));
    for (let i = 0; i < data.length; i += 97) assert.ok(Number.isFinite(data[i]));
    assert.ok(Math.abs(rmsOf(data) - FIRE.rms) < 1e-3, `rms ${rmsOf(data)}`);
    const crest = crestFactor(data);
    assert.ok(crest <= 5.5, `파고율 ${crest.toFixed(2)} (톡톡 튀는 소리)`);
    const centroid = spectralCentroid(data, sr);
    assert.ok(centroid >= 500 && centroid <= 1800, `스펙트럼 중심 ${Math.round(centroid)}Hz (따뜻한 대역)`);
    assert.ok(bandShare(data, sr, 5000, sr / 2) < 0.01, '5kHz 위가 거의 없다(날카롭지 않다)');
    const spike = spikeRatio(data, sr, { loop: true });
    assert.ok(spike <= 3.5, `홀로 튀는 정도 ${spike.toFixed(2)}`);
  }
});

test('모닥불 표본: 끝 -> 처음 이음매가 이어지고, 같은 씨앗이면 같고 씨앗이 다르면 다르다', () => {
  const sr = 22050;
  for (const seed of [1, 2, 3, 4]) {
    const data = synthFire(sr, seeded(seed));
    const seam = seamCheck(data, sr);
    assert.ok(seam.jumpRatio <= 6, `이음매 점프 ${seam.jumpRatio.toFixed(2)}`);
    assert.ok(seam.rmsRatio > 0.4 && seam.rmsRatio < 1.7, `이음매 둘레 크기 ${seam.rmsRatio.toFixed(2)}`);
  }
  assert.deepEqual(synthFire(sr, seeded(7)).slice(0, 2000), synthFire(sr, seeded(7)).slice(0, 2000));
  assert.notDeepEqual(synthFire(sr, seeded(7)).slice(0, 2000), synthFire(sr, seeded(8)).slice(0, 2000));
});

test('모닥불 표본: 규칙적인 박자가 없다(크기 변화의 자기상관이 낮다)', () => {
  const sr = 22050;
  const data = synthFire(sr, seeded(11));
  const win = Math.round(sr * 0.01);
  const env = [];
  for (let i = 0; i + win <= data.length; i += win) { let p = 0; for (let k = i; k < i + win; k++) p = Math.max(p, Math.abs(data[k])); env.push(p); }
  const mean = env.reduce((a, b) => a + b, 0) / env.length;
  const dev = env.map((v) => v - mean);
  const var0 = dev.reduce((a, b) => a + b * b, 0);
  let best = 0;
  for (let lag = 10; lag <= 150; lag++) { // 0.1~1.5초 박자
    let c = 0;
    for (let i = 0; i + lag < dev.length; i++) c += dev[i] * dev[i + lag];
    best = Math.max(best, c / var0);
  }
  assert.ok(best < 0.35, `일정한 박자의 흔적 ${best.toFixed(2)}`);
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
