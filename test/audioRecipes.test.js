import test from 'node:test';
import assert from 'node:assert/strict';
import { RECIPES, LOOPS, SOUND_NAMES, LOOP_NAMES } from '../src/audio/recipes.js';
import { createNoiseBuffers, createGraph, buildVoice, createEngine, STORAGE_KEYS, MAX_VOICES } from '../src/audio/engine.js';
import { speakerVoice } from '../src/logic/audioPolicy.js';

// ---- 가짜 AudioContext: 노드 연결·예약 값을 기록하고 Web Audio 가 던지는 잘못(NaN, 0 으로의 지수 곡선, 음수 시각)을 똑같이 던진다 ----
function fakeContext() {
  const nodes = [];
  const log = { stops: [], starts: [] };
  const checkTime = (t) => { assert.ok(Number.isFinite(t) && t >= 0, `시각이 이상함: ${t}`); };
  function param(owner, value = 0) {
    const p = {
      _owner: owner, value,
      setValueAtTime(v, t) { assert.ok(Number.isFinite(v), `값이 이상함: ${v}`); checkTime(t); return p; },
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

test('말소리: 목소리마다 음절 수만큼 길어지고 최대 8 음절', () => {
  const lens = [2, 5, 8].map((n) => runRecipe('speech', RECIPES.speech, seeded(9), { voice: 'leader', syllables: n }).built.duration);
  assert.ok(lens[0] < lens[1] && lens[1] < lens[2]);
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

test('마스터 체인: 버스 -> 압축기 -> 마스터 -> 소프트 클립 -> 출력', () => {
  const { ctx } = fakeContext();
  const g = createGraph(ctx, { masterGain: 0.4 });
  assert.equal(g.master.gain.value, 0.4);
  assert.ok(g.sfxBus._out.includes(g.comp) && g.ambBus._out.includes(g.comp));
  assert.ok(g.comp._out.includes(g.master));
  assert.ok(g.master._out.includes(g.clip));
  assert.ok(g.clip._out.includes(ctx.destination));
});
