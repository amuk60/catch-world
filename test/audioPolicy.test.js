import test from 'node:test';
import assert from 'node:assert/strict';
import {
  distanceGain, panFromOffset, panFromScreenX, volumeToGain, DEFAULT_VOLUME, footstepInterval, createFootstepper, createThrottle,
  voiceDecision, createRateLimiter, stepFade, sameSpace, varied, semitoneRatio, surfaceAt, speechPlan, speakerVoice, remotePitch,
  crewCue, lightCue, remoteAnimCue, STEP_SOUND, FOOTSTEP_STRIDE, FOOTSTEP_JITTER, createVariantPicker,
} from '../src/logic/audioPolicy.js';

// ---- 거리 -> 소리 크기 ----
test('distanceGain: 가까우면 1, 멀면 0, 사이는 부드럽게 줄어든다', () => {
  assert.equal(distanceGain(0, { ref: 2, max: 10 }), 1);
  assert.equal(distanceGain(2, { ref: 2, max: 10 }), 1);
  assert.equal(distanceGain(10, { ref: 2, max: 10 }), 0);
  assert.equal(distanceGain(50, { ref: 2, max: 10 }), 0);
  const mid = distanceGain(6, { ref: 2, max: 10, power: 2 });
  assert.ok(mid > 0 && mid < 1);
  assert.equal(mid, 0.25);
});

test('distanceGain: 멀어질수록 줄기만 한다(단조 감소)', () => {
  let last = 2;
  for (let d = 0; d <= 20; d += 0.5) {
    const g = distanceGain(d, { ref: 1.5, max: 14 });
    assert.ok(g <= last + 1e-12, `d=${d}`);
    assert.ok(g >= 0 && g <= 1);
    last = g;
  }
});

test('distanceGain: 이상한 입력은 안전하게(NaN·무한대·음수·max<=ref)', () => {
  assert.equal(distanceGain(NaN), 0);
  assert.equal(distanceGain(undefined), 0);
  assert.equal(distanceGain(Infinity), 0);
  assert.equal(distanceGain(-5, { ref: 2, max: 10 }), 1);
  assert.equal(distanceGain(1, { ref: 5, max: 5 }), 1);
  assert.equal(distanceGain(6, { ref: 5, max: 5 }), 0);
  assert.equal(distanceGain(3, { ref: 5, max: 2 }), 1);
});

// ---- 좌우 위치(pan) ----
test('panFromOffset: 카메라 오른쪽에 있으면 +, 왼쪽이면 -, 앞뒤는 0', () => {
  assert.ok(panFromOffset(5, 0, 1, 0, { range: 10 }) > 0);
  assert.ok(panFromOffset(-5, 0, 1, 0, { range: 10 }) < 0);
  assert.equal(panFromOffset(0, 7, 1, 0, { range: 10 }), 0);
  assert.equal(panFromOffset(5, 0, 1, 0, { range: 10, maxPan: 0.8 }), 0.4);
});

test('panFromOffset: 범위를 넘으면 maxPan 에서 멈추고, 오른쪽 벡터가 비뚤어도 정규화한다', () => {
  assert.equal(panFromOffset(100, 0, 1, 0, { range: 10, maxPan: 0.7 }), 0.7);
  assert.equal(panFromOffset(-100, 0, 1, 0, { range: 10, maxPan: 0.7 }), -0.7);
  assert.ok(Math.abs(panFromOffset(5, 0, 3, 0, { range: 10 }) - panFromOffset(5, 0, 1, 0, { range: 10 })) < 1e-12);
  assert.equal(panFromOffset(5, 5, 0, 0), 0, '오른쪽 벡터가 0 이면 가운데');
  assert.equal(panFromOffset(NaN, 1, 1, 0), 0);
});

test('panFromScreenX: -1..1 화면 좌표를 maxPan 안으로', () => {
  assert.equal(panFromScreenX(0), 0);
  assert.equal(panFromScreenX(1, 0.6), 0.6);
  assert.equal(panFromScreenX(-3, 0.6), -0.6);
  assert.equal(panFromScreenX(NaN), 0);
});

// ---- 볼륨 곡선 ----
test('volumeToGain: 제곱 곡선이고 0..1 밖은 잘라낸다', () => {
  assert.equal(volumeToGain(0), 0);
  assert.equal(volumeToGain(1), 1);
  assert.equal(volumeToGain(0.5), 0.25);
  assert.equal(volumeToGain(-1), 0);
  assert.equal(volumeToGain(9), 1);
  assert.equal(volumeToGain(NaN), volumeToGain(DEFAULT_VOLUME));
  assert.equal(volumeToGain(0.5, 0.8), 0.2);
});

test('기본 볼륨: 마스터 게인이 1 이하이고 충분히 크다', () => {
  assert.ok(volumeToGain(DEFAULT_VOLUME) <= 1);
  assert.ok(volumeToGain(DEFAULT_VOLUME) > 0.3);
});

// ---- 발걸음 ----
test('footstepInterval: 속도가 빠를수록 간격이 짧고, 멈추면 Infinity', () => {
  assert.ok(footstepInterval(4, 1.8) < footstepInterval(2, 1.8));
  assert.equal(footstepInterval(4, 2), 0.5);
  assert.equal(footstepInterval(0, 2), Infinity);
  assert.equal(footstepInterval(NaN, 2), Infinity);
  assert.equal(footstepInterval(-3, 2), Infinity);
});

test('footstepInterval: 너무 빠르거나 느려도 범위 안', () => {
  assert.equal(footstepInterval(1000, 1, { min: 0.2, max: 1 }), 0.2);
  assert.equal(footstepInterval(0.5, 1, { min: 0.2, max: 1 }), 1);
});

test('createFootstepper: 걸은 거리가 보폭만큼 쌓일 때마다 한 걸음, 발은 번갈아', () => {
  const s = createFootstepper(1.8);
  let steps = 0;
  const feet = [];
  for (let i = 0; i < 100; i++) { // 4 단위/초 x 0.016 초 x 100 = 6.4 단위
    if (s.advance(4 * 0.016)) { steps++; feet.push(s.foot); }
  }
  assert.ok(steps >= 3 && steps <= 4, `steps=${steps}`);
  assert.deepEqual(feet.slice(0, 2).sort(), [0, 1]);
});

test('createFootstepper: 첫 걸음은 보폭의 절반쯤 가서, 멈추면 리셋', () => {
  const s = createFootstepper(2);
  assert.equal(s.advance(0.5), false);
  assert.equal(s.advance(0.6), true);
  s.reset();
  assert.equal(s.advance(0.5), false);
});

test('createFootstepper: 한 번에 크게 움직여도 한 걸음만(소리 몰림 방지), 음수·NaN 은 무시', () => {
  const s = createFootstepper(1);
  assert.equal(s.advance(50), true);
  assert.equal(s.advance(0.1), false);
  assert.equal(s.advance(-4), false);
  assert.equal(s.advance(NaN), false);
});

// ---- 같은 소리 연타 막기 ----
test('createThrottle: 최소 간격 안에서는 막고 지나면 허용', () => {
  const t = createThrottle();
  assert.equal(t.allow('a', 1.0, 0.2), true);
  assert.equal(t.allow('a', 1.1, 0.2), false);
  assert.equal(t.allow('a', 1.21, 0.2), true);
  assert.equal(t.allow('b', 1.22, 0.2), true, '다른 이름은 따로 센다');
});

test('createThrottle: 막힌 시도는 시간을 늘리지 않고, 간격 0 이면 항상 허용, 시간이 거꾸로 가도 안전', () => {
  const t = createThrottle();
  t.allow('a', 1, 0.5);
  t.allow('a', 1.3, 0.5);
  assert.equal(t.allow('a', 1.51, 0.5), true);
  assert.equal(t.allow('z', 5, 0), true);
  assert.equal(t.allow('z', 5, 0), true);
  assert.equal(t.allow('a', 0.2, 0.5), true, '시계가 되감기면 새로 시작');
  assert.equal(t.allow('a', NaN, 0.5), false);
});

// ---- 동시에 내는 소리 수 ----
const voice = (id, priority, start) => ({ id, priority, start });
test('voiceDecision: 자리가 남으면 그냥 재생', () => {
  assert.deepEqual(voiceDecision([voice(1, 1, 0)], 1, 3), { action: 'play' });
  assert.deepEqual(voiceDecision([], 1, 3), { action: 'play' });
});

test('voiceDecision: 가득 차면 가장 낮은 우선순위 중 가장 오래된 소리를 끊는다', () => {
  const list = [voice(1, 2, 0), voice(2, 1, 5), voice(3, 1, 3)];
  assert.deepEqual(voiceDecision(list, 2, 3), { action: 'steal', id: 3 });
});

test('voiceDecision: 새 소리가 모두보다 덜 중요하면 새 소리를 버린다(같으면 오래된 쪽을 끊는다)', () => {
  const list = [voice(1, 3, 0), voice(2, 3, 1)];
  assert.deepEqual(voiceDecision(list, 1, 2), { action: 'drop' });
  assert.deepEqual(voiceDecision(list, 3, 2), { action: 'steal', id: 1 });
});

test('voiceDecision: 상한이 0 이하이거나 이상한 목록이어도 던지지 않는다', () => {
  assert.deepEqual(voiceDecision([], 1, 0), { action: 'drop' });
  assert.deepEqual(voiceDecision(null, 1, 4), { action: 'play' });
});

// ---- 남의 소리 초당 상한 ----
test('createRateLimiter: 한 번에 burst 개까지, 이후 초당 perSecond 개씩 채워진다', () => {
  const r = createRateLimiter({ perSecond: 4, burst: 2 });
  assert.equal(r.take(0), true);
  assert.equal(r.take(0), true);
  assert.equal(r.take(0), false);
  assert.equal(r.take(0.1), false); // 0.4 개 찼다
  assert.equal(r.take(0.26), true); // 1 개 찼다
  assert.equal(r.take(0.27), false);
});

test('createRateLimiter: 1초에 perSecond+burst 개를 넘지 않는다(몰아서 불러도)', () => {
  const r = createRateLimiter({ perSecond: 5, burst: 3 });
  let ok = 0;
  for (let i = 0; i < 1000; i++) if (r.take(i * 0.001)) ok++; // 1초 동안 1000번
  assert.ok(ok <= 5 + 3 + 1, `ok=${ok}`);
  assert.ok(ok >= 5);
});

test('createRateLimiter: 이상한 시간 값은 허용하지 않는다', () => {
  const r = createRateLimiter({ perSecond: 5, burst: 1 });
  assert.equal(r.take(NaN), false);
});

// ---- 소리 크기 페이드(모닥불) ----
test('stepFade: 목표 쪽으로 fadeSeconds 에 걸쳐 직선으로 가고 넘치지 않는다', () => {
  assert.equal(stepFade(0, 1, 0.5, 1), 0.5);
  assert.equal(stepFade(0.9, 1, 0.5, 1), 1);
  assert.equal(stepFade(1, 0, 0.25, 1), 0.75);
  assert.equal(stepFade(0.1, 0, 5, 1), 0);
  assert.equal(stepFade(0.3, 0.3, 1, 1), 0.3);
});

test('stepFade: dt·fadeSeconds 가 이상해도 목표로 간다/제자리', () => {
  assert.equal(stepFade(0.2, 1, 0.1, 0), 1);
  assert.equal(stepFade(0.2, 1, NaN, 1), 0.2);
  assert.equal(stepFade(0.2, 1, -1, 1), 0.2);
});

test('sameSpace: 둘 다 있고 같을 때만', () => {
  assert.equal(sameSpace('yard', 'yard'), true);
  assert.equal(sameSpace('yard', 'laundry'), false);
  assert.equal(sameSpace(undefined, 'yard'), true, '공간을 말하지 않으면 지금 공간으로 본다');
  assert.equal(sameSpace('yard', undefined), true);
});

// ---- 무작위 변주 ----
test('varied: 기준값 둘레 ±amount 안에서 변하고 rng 0.5 면 그대로', () => {
  assert.equal(varied(10, 0.2, () => 0.5), 10);
  assert.equal(varied(10, 0.2, () => 0), 8);
  assert.equal(varied(10, 0.2, () => 1), 12);
  assert.equal(varied(10, 0, () => 0.1), 10);
});

test('semitoneRatio: 12 반음 = 2배', () => {
  assert.equal(semitoneRatio(0), 1);
  assert.equal(semitoneRatio(12), 2);
  assert.equal(semitoneRatio(-12), 0.5);
});

// ---- 바닥 종류 ----
test('surfaceAt: 광장 안과 실내는 타일 소리, 마당의 나머지는 풀', () => {
  const plaza = { x1: 2.5, x2: 12, z1: -12, z2: 12 };
  assert.equal(surfaceAt('yard', 5, 0, plaza), 'tile');
  assert.equal(surfaceAt('yard', 2.5, 12, plaza), 'tile');
  assert.equal(surfaceAt('yard', -4, 0, plaza), 'grass');
  assert.equal(surfaceAt('yard', 5, 13, plaza), 'grass');
  assert.equal(surfaceAt('laundry', 600, 0, plaza), 'tile');
  assert.equal(surfaceAt('interview', 600, 0, plaza), 'tile');
  assert.equal(surfaceAt('yard', 5, 0, null), 'grass');
  assert.equal(surfaceAt('yard', NaN, 0, plaza), 'grass');
});

// ---- 말소리(웅얼거림) ----
test('speechPlan: 말풍선 웅얼거림은 길이와 상관없이 아주 짧다(2~3 음절)', () => {
  assert.equal(speechPlan(0), 2);
  assert.equal(speechPlan(3), 2);
  assert.equal(speechPlan(22), 2);
  assert.ok(speechPlan(60) >= speechPlan(22));
  assert.equal(speechPlan(500), 3);
  assert.equal(speechPlan(NaN), 2);
});

test('speakerVoice: 면접관·플레이어·다른 방문자를 구분한다', () => {
  assert.equal(speakerVoice('player'), 'player');
  assert.equal(speakerVoice('leader'), 'leader');
  assert.equal(speakerVoice('hr'), 'hr');
  assert.equal(speakerVoice('mentor'), 'mentor');
  assert.equal(speakerVoice('r-abc123'), 'remote');
  assert.equal(speakerVoice('?'), 'player');
});

test('remotePitch: 같은 방문자는 늘 같은 높이, 0.85~1.35 사이', () => {
  assert.equal(remotePitch('r-abc'), remotePitch('r-abc'));
  for (const id of ['r-a', 'r-bb', 'r-ccc', 'r-ZZZ999', 'x', '']) {
    const p = remotePitch(id);
    assert.ok(p >= 0.85 && p <= 1.35, `${id} -> ${p}`);
  }
  assert.notEqual(remotePitch('r-aaa'), remotePitch('r-aab'));
});

// ---- 장면 이벤트 -> 효과음 ----
test('crewCue: 박수 자세는 박수 소리, 고개 젓기는 아이고, 크게 튀는 반응은 웃음, 일어나기·앉기 같은 나머지는 소리 없음', () => {
  assert.equal(crewCue({ type: 'pose', who: 'hr', name: 'clap' }), 'applause');
  assert.equal(crewCue({ type: 'pose', who: 'hr', name: null }), null);
  assert.equal(crewCue({ type: 'clip', who: 'leader', name: 'emote-no' }), 'ohno');
  assert.equal(crewCue({ type: 'clip', who: 'leader', name: 'emote-yes' }), null);
  assert.equal(crewCue({ type: 'fx', who: 'mentor', fx: { bounce: { amp: 0.07, freq: 5 } } }), 'laugh');
  assert.equal(crewCue({ type: 'fx', who: 'mentor', fx: { bounce: { amp: 0.07, freq: 4 } } }), null, '돌발행동의 작은 튀기는 웃음이 아니다');
  assert.equal(crewCue({ type: 'fx', who: 'mentor', fx: { bounce: null } }), null);
  assert.equal(crewCue({ type: 'fx', who: 'mentor', fx: { spin: { turns: 1 } } }), null);
  assert.equal(crewCue({ type: 'stand', who: 'hr' }), null);
  assert.equal(crewCue({ type: 'sit', who: 'hr' }), null);
  assert.equal(crewCue({ type: 'say', who: 'hr', text: 'x' }), null);
  assert.equal(crewCue(null), null);
});

test('lightCue: 가벼운 반응 spec 에서 소리를 고른다(박수 > 아이고 > 웃음)', () => {
  assert.equal(lightCue({ clip: 'emote-yes', clap: true }), 'applause');
  assert.equal(lightCue({ clip: 'emote-no' }), 'ohno');
  assert.equal(lightCue({ clip: 'emote-yes', bounce: { amp: 0.035, freq: 5 } }), 'laugh');
  assert.equal(lightCue({ clip: 'emote-yes' }), null);
  assert.equal(lightCue(undefined), null);
});

test('remoteAnimCue: 다른 방문자의 동작 소리는 세탁소에서 셔츠를 너는 소리 하나뿐', () => {
  assert.equal(remoteAnimCue('interact-right', 'laundry'), 'flap');
  assert.equal(remoteAnimCue('interact-right', 'interview'), null);
  assert.equal(remoteAnimCue('pick-up', 'yard'), null);
  assert.equal(remoteAnimCue('attack-melee-right', 'yard'), null);
  assert.equal(remoteAnimCue('attack-melee-right', 'laundry'), null);
  assert.equal(remoteAnimCue('emote-no', 'yard'), null);
  assert.equal(remoteAnimCue('jump', 'interview'), null);
  assert.equal(remoteAnimCue('idle', 'yard'), null);
  assert.equal(remoteAnimCue('walk', 'yard'), null);
  assert.equal(remoteAnimCue(null, 'yard'), null);
});

test('발소리 이름표와 보폭: 바닥 종류마다 소리가 있고, 걷기 속도에서 자연스러운 걸음 간격이다', async () => {
  const { RECIPES } = await import('../src/audio/recipes.js');
  const { PLAYER } = await import('../src/config.js');
  for (const name of Object.values(STEP_SOUND)) assert.ok(RECIPES[name], name);
  assert.deepEqual(Object.keys(STEP_SOUND).sort(), ['grass', 'tile']);
  const interval = footstepInterval(PLAYER.speed, FOOTSTEP_STRIDE);
  assert.ok(interval >= 0.3 && interval <= 0.6, `interval ${interval}`);
});

// ---- 발소리 변형 고르기·박자 흔들림 ----
const seededRng = (seed) => () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;

test('createVariantPicker: 직전 변형을 되풀이하지 않고, 최근 3 걸음과도 겹치지 않으며, 모든 변형이 골고루 쓰인다', () => {
  const p = createVariantPicker(10);
  const rng = seededRng(5);
  const picks = Array.from({ length: 3000 }, () => p.next(rng));
  for (let i = 1; i < picks.length; i++) {
    for (let k = 1; k <= 3 && i - k >= 0; k++) assert.notEqual(picks[i], picks[i - k], `${i} 번째가 ${k} 걸음 전과 같다`);
  }
  const counts = new Array(10).fill(0);
  for (const v of picks) counts[v]++;
  for (const c of counts) assert.ok(c > 3000 / 10 * 0.8 && c < 3000 / 10 * 1.2, `고르지 않다 ${counts}`);
});

test('createVariantPicker: 변형이 적어도 직전과는 달라야 하고, 하나뿐이면 0, 이상한 입력에도 던지지 않는다', () => {
  const p2 = createVariantPicker(2);
  const rng = seededRng(9);
  let prev = p2.next(rng);
  for (let i = 0; i < 100; i++) { const v = p2.next(rng); assert.notEqual(v, prev); prev = v; }
  const p4 = createVariantPicker(4); // 3 걸음을 피하면 후보가 하나뿐: 4 걸음마다 같은 순서로 돈다
  const seq = Array.from({ length: 16 }, () => p4.next(rng));
  for (let i = 4; i < seq.length; i++) assert.equal(seq[i], seq[i - 4]);
  assert.equal(createVariantPicker(1).next(), 0);
  assert.equal(createVariantPicker(0).next(), 0);
  assert.equal(createVariantPicker(NaN).next(), 0);
  const p = createVariantPicker(5);
  for (const bad of [NaN, undefined, -1, 7, Infinity]) assert.ok(p.next(() => bad) >= 0);
  assert.ok(p.next(() => 0.999999) < 5);
  assert.deepEqual(Array.from({ length: 6 }, () => createVariantPicker(6, { avoid: 0 }).next(() => 0)), [0, 0, 0, 0, 0, 0], 'avoid 0 은 피하지 않는다');
});

test('createVariantPicker: reset 하면 기록이 지워진다', () => {
  const p = createVariantPicker(3, { avoid: 1 });
  const a = p.next(() => 0);
  assert.equal(a, 0);
  assert.notEqual(p.next(() => 0), 0);
  p.reset();
  assert.equal(p.next(() => 0), 0);
});

test('createFootstepper: jitter 가 없으면 이전과 똑같이 일정하다(rng 를 쓰지 않는다)', () => {
  const rng = () => { throw new Error('jitter 0 인데 rng 를 불렀다'); };
  const s = createFootstepper(2, { rng });
  const steps = [];
  for (let i = 0; i < 40; i++) if (s.advance(0.1)) steps.push(i);
  assert.deepEqual(steps, [9, 29]); // 처음에는 보폭의 절반(1.0)을 가서 울린다
});

test('createFootstepper: jitter 0.2 면 걸음 간격이 보폭의 +-20% 안에서 들쭉날쭉하고, 평균은 보폭이며, 격자에서 멀어지지 않는다', () => {
  const stride = 1.33;
  const s = createFootstepper(stride, { jitter: 0.2, rng: seededRng(3) });
  const times = [];
  const dist = 0.005;
  for (let i = 0; i < 400000 && times.length < 400; i++) if (s.advance(dist)) times.push((i + 1) * dist);
  assert.equal(times.length, 400);
  const gaps = times.slice(1).map((t, i) => t - times[i]);
  for (const g of gaps) assert.ok(g >= stride * 0.8 - 0.011 && g <= stride * 1.2 + 0.011, `간격 ${g}`);
  const mean = gaps.reduce((a, b) => a + b, 0) / gaps.length;
  assert.ok(Math.abs(mean - stride) < stride * 0.02, `평균 ${mean}`);
  const spread = Math.max(...gaps) - Math.min(...gaps);
  assert.ok(spread > stride * 0.2, `거의 일정하다(${spread})`);
  // 걸음 k 의 위치는 격자(k x 보폭 + 처음 오프셋)에서 +-0.1 보폭 안: 오차가 쌓이지 않는다
  const base = times[0];
  times.forEach((t, k) => assert.ok(Math.abs(t - (base + k * stride)) <= stride * 0.2 + 0.02, `${k} 번째가 격자에서 ${t - (base + k * stride)} 벗어남`));
});

test('createFootstepper: jitter 가 있어도 한 번에 한 걸음, 발은 번갈아, reset 하면 처음처럼', () => {
  const s = createFootstepper(1, { jitter: 0.2, rng: seededRng(8) });
  assert.equal(s.advance(50), true);
  assert.equal(s.foot, 0);
  assert.equal(s.advance(0.0001), false, '한 번에 크게 가도 한 걸음');
  s.reset();
  assert.equal(s.advance(0.3), false);
  assert.equal(s.advance(0.4), true);
  assert.equal(createFootstepper(0, { jitter: 0.2 }).advance(1), false);
  assert.equal(createFootstepper(1, { jitter: NaN }).advance(0.6), true);
});

test('발걸음 박자 흔들림 상수는 +-20%', () => {
  assert.equal(FOOTSTEP_JITTER, 0.2);
});
