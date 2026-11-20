import test from 'node:test';
import assert from 'node:assert/strict';
import {
  makeRound, toastLevel, effectiveTime, flareAmount, cueAt, stageAt, classify, inGoodBand, shouldAutoPull, gaugeMap, rewardFor, colorAt, shapeAt, resultLine, stageLine, canRoast, createRoast,
  sideWeights, sideStep, averageLevel, spreadOf, classifyRoast, roastInputAction, roastHint, rollSpeedStep, rollMaxSpeed,
} from '../src/logic/marshmallow.js';
import { mulberry32 } from '../src/logic/rng.js';
import { MARSHMALLOW as M, ACTION_REDUCE, FIRE_ZONE_RADIUS, FURNACE, SEED, PASSIVE } from '../src/config.js';
import { createPassive, isMeditating } from '../src/logic/passive.js';
import { buildZones, currentZoneFor, autoActionsOf, zoneActions } from '../src/logic/zones.js';
import { buildLayout } from '../src/logic/layout.js';
import { ACTION_DEFS } from '../src/logic/actions.js';
import { nextMode, holdsSeat, canWalk } from '../src/logic/playerMode.js';

const R = M.round;
const rounds = (n, seed = 1) => Array.from({ length: n }, (_, i) => makeRound(mulberry32(seed + i * 7919)));
const timeAtLevel = (round, level) => { // 실제 시간으로 level 에 처음 닿는 때(이분 탐색)
  let lo = 0; let hi = 60;
  for (let i = 0; i < 60; i++) { const mid = (lo + hi) / 2; if (toastLevel(effectiveTime(mid, round), round) < level) lo = mid; else hi = mid; }
  return hi;
};

test('makeRound: 범위 안에서 뽑고, 완벽 구간은 좁고 좋음 띠가 양옆을 감싼다', () => {
  for (const round of rounds(300)) {
    const w = round.perfect[1] - round.perfect[0];
    assert.ok(w >= R.perfectWidth[0] - 1e-9 && w <= R.perfectWidth[1] + 1e-9, `폭 ${w}`);
    const c = (round.perfect[0] + round.perfect[1]) / 2;
    assert.ok(c >= R.perfectCenter[0] - 1e-9 && c <= R.perfectCenter[1] + 1e-9);
    assert.ok(Math.abs(round.good[0] - (round.perfect[0] - R.goodMargin)) < 1e-9);
    assert.ok(Math.abs(round.good[1] - (round.perfect[1] + R.goodMargin)) < 1e-9);
    assert.ok(round.good[0] > 0.3 && round.good[1] < M.burntAt, '구간은 날것과 탄 단계 사이');
    assert.ok(round.perfectSeconds >= R.perfectSeconds[0] - 1e-9 && round.perfectSeconds <= R.perfectSeconds[1] + 1e-9);
  }
});

test('makeRound: 마디는 오름차순(시간·level 모두)이고 burntAt 에서 끝난다', () => {
  for (const round of rounds(200)) {
    for (let i = 1; i < round.knots.length; i++) {
      assert.ok(round.knots[i].tau > round.knots[i - 1].tau);
      assert.ok(round.knots[i].level > round.knots[i - 1].level);
    }
    assert.equal(round.knots.at(-1).level, M.burntAt);
    assert.equal(round.burntTau, round.knots.at(-1).tau);
  }
});

test('makeRound: 같은 시드는 같은 판, 다른 시드는 (거의 항상) 다른 판', () => {
  assert.deepEqual(makeRound(mulberry32(42)), makeRound(mulberry32(42)));
  const keys = new Set(rounds(50, 100).map((r) => JSON.stringify(r)));
  assert.equal(keys.size, 50);
  const centres = new Set(rounds(50, 100).map((r) => r.perfect[0].toFixed(9)));
  assert.equal(centres.size, 50);
});

test('makeRound: 완벽 구간은 실제로 0.5~0.9초이고 좋음 띠는 그보다 넓다(불 튐이 완벽 구간 안에 들지 않는다)', () => {
  for (const round of rounds(300)) {
    const a = timeAtLevel(round, round.perfect[0]);
    const b = timeAtLevel(round, round.perfect[1]);
    assert.ok(b - a >= 0.5 && b - a <= 0.9, `완벽 ${(b - a).toFixed(3)}s`);
    const ga = timeAtLevel(round, round.good[0]);
    const gb = timeAtLevel(round, round.good[1]);
    assert.ok(gb - ga > b - a + 0.3, '좋음 띠가 더 넓다');
    for (const f of round.flares) assert.ok(f.at + f.duration < a, '불 튐은 완벽 구간이 열리기 전에 끝난다');
  }
});

test('makeRound: 불 튐은 일부 판에만, 판 안에서, 전체의 처음 15% 이후에 나온다', () => {
  const list = rounds(400);
  const withFlare = list.filter((r) => r.flares.length);
  assert.ok(withFlare.length > 400 * 0.55 && withFlare.length < 400 * 0.9, `불 튐 판 ${withFlare.length}`);
  for (const round of withFlare) {
    assert.equal(round.flares.length, 1);
    const f = round.flares[0];
    assert.ok(f.at >= R.flareEarliest * round.burntTau - 1e-9);
    assert.ok(f.at + f.duration < round.burntTau);
    assert.ok(f.duration >= R.flareSeconds[0] && f.duration <= R.flareSeconds[1]);
    assert.equal(f.boost, R.flareBoost);
  }
  assert.ok(list.some((r) => !r.flares.length), '불 튐 없는 판도 있다');
});

test('makeRound: 가짜 신호는 1~3개, 완벽 구간 전에, 서로·불 튐과 겹치지 않는다', () => {
  for (const round of rounds(300)) {
    const a = timeAtLevel(round, round.perfect[0]);
    assert.ok(round.falseCues.length >= 1 && round.falseCues.length <= R.falseCues[1]);
    for (const [i, c] of round.falseCues.entries()) {
      assert.ok(c.at >= 1 - 1e-9 && c.at + c.duration < a);
      assert.ok(c.kind === 'blush' || c.kind === 'steam');
      if (i) assert.ok(c.at > round.falseCues[i - 1].at + round.falseCues[i - 1].duration);
      for (const f of round.flares) assert.ok(c.at + c.duration < f.at || f.at + f.duration < c.at);
    }
  }
});

test('makeRound: 굽는 시간은 10~18초 안팎(불에 댄 뒤 탄 단계까지)', () => {
  for (const round of rounds(300)) {
    const total = timeAtLevel(round, M.burntAt - 1e-9);
    assert.ok(total >= 10 && total <= 19, `굽기 ${total.toFixed(2)}s`);
  }
  const avg = rounds(300).reduce((s, r) => s + timeAtLevel(r, M.burntAt - 1e-9), 0) / 300;
  assert.ok(avg > 10 && avg < 17, `평균 ${avg}`);
});

test('toastLevel: 시간에 따라 단조 증가하고 0..burntAt 사이(마디 사이 직선)', () => {
  const round = makeRound(mulberry32(3));
  assert.equal(toastLevel(0, round), 0);
  assert.equal(toastLevel(NaN, round), 0);
  assert.equal(toastLevel(-3, round), 0);
  assert.equal(toastLevel(999, round), M.burntAt);
  let prev = -1;
  for (let t = 0; t <= round.burntTau + 1; t += 0.05) { const l = toastLevel(t, round); assert.ok(l >= prev); prev = l; }
  for (const k of round.knots) assert.ok(Math.abs(toastLevel(k.tau, round) - k.level) < 1e-9);
});

test('effectiveTime: 불 튐이 없으면 실제 시간 그대로, 튀는 동안은 boost 배로 흐른다', () => {
  const plain = { flares: [] };
  assert.equal(effectiveTime(5, plain), 5);
  const round = { flares: [{ at: 3, duration: 1, boost: 2.4 }] };
  assert.equal(effectiveTime(2, round), 2);
  assert.ok(Math.abs(effectiveTime(3.5, round) - (3.5 + 1.4 * 0.5)) < 1e-9);
  assert.ok(Math.abs(effectiveTime(10, round) - (10 + 1.4)) < 1e-9);
  assert.equal(effectiveTime(-1, round), 0);
});

test('flareAmount / cueAt: 구간 밖은 0, 안에서는 오르내린다', () => {
  const round = { flares: [{ at: 3, duration: 1, boost: 2 }], falseCues: [{ at: 1, duration: 0.8, kind: 'blush' }, { at: 2, duration: 0.5, kind: 'steam' }] };
  assert.equal(flareAmount(2.9, round), 0);
  assert.equal(flareAmount(3.5, round), 1);
  assert.ok(flareAmount(3.05, round) > 0 && flareAmount(3.05, round) < 1);
  assert.equal(flareAmount(4.1, round), 0);
  assert.deepEqual(cueAt(0.5, round), { blush: 0, steam: 0 });
  assert.ok(cueAt(1.4, round).blush > 0.99 && cueAt(1.4, round).steam === 0);
  assert.ok(cueAt(2.25, round).steam > 0.99);
});

test('classify: under / good / perfect / good / over / burnt (경계 포함 규칙)', () => {
  const round = makeRound(mulberry32(9));
  const [pl, ph] = round.perfect;
  const [gl, gh] = round.good;
  assert.equal(classify(0, round), 'under');
  assert.equal(classify(gl - 0.001, round), 'under');
  assert.equal(classify(gl, round), 'good');
  assert.equal(classify(pl - 0.001, round), 'good');
  assert.equal(classify(pl, round), 'perfect');
  assert.equal(classify(ph - 0.001, round), 'perfect');
  assert.equal(classify(ph, round), 'good');
  assert.equal(classify(gh - 0.001, round), 'good');
  assert.equal(classify(gh, round), 'over');
  assert.equal(classify(M.burntAt - 0.001, round), 'over');
  assert.equal(classify(M.burntAt, round), 'burnt');
  assert.equal(classify(1, round), 'burnt');
  assert.equal(inGoodBand(gl, round), true);
  assert.equal(inGoodBand(gh, round), false);
});

test('shouldAutoPull: 탄 단계에 닿으면 자동으로 빼낸다', () => {
  assert.equal(shouldAutoPull(M.burntAt - 0.001), false);
  assert.equal(shouldAutoPull(M.burntAt), true);
});

test('gaugeMap: 황금 구간 표시 없이 고정 길이에 대한 시간 비율만', () => {
  assert.deepEqual(gaugeMap(0), { fill: 0 });
  assert.deepEqual(gaugeMap(M.gaugeSeconds / 2), { fill: 0.5 });
  assert.equal(gaugeMap(999).fill, 1);
  assert.equal(gaugeMap(NaN).fill, 0);
  assert.deepEqual(Object.keys(gaugeMap(3)), ['fill']);
});

test('rewardFor: 완벽 12 · 좋음 10 · 덜 익음/너무 익음/한쪽 탐 8 · 숯덩이 7 (config 표)', () => {
  assert.deepEqual(M.rewards, { perfect: 12, good: 10, under: 8, over: 8, uneven: 8, burnt: 7 });
  for (const [k, v] of Object.entries(M.rewards)) assert.equal(rewardFor(k), v);
  assert.equal(rewardFor('nope'), 0);
});

test('설정: 단계는 오름차순, 모든 결과에 멘트·감소량이 있고 stage 멘트는 완벽 구간을 알려 주지 않는다', () => {
  const froms = M.stages.map((s) => s.from);
  assert.deepEqual([...froms].sort((a, b) => a - b), froms);
  assert.equal(froms[0], 0);
  assert.ok(froms.includes(M.burntAt));
  for (const s of M.stages) { assert.ok(s.line.length > 0); assert.ok(!s.line.includes('지금이다')); }
  for (const key of ['perfect', 'good', 'under', 'over', 'uneven', 'burnt']) { assert.ok(resultLine(key).length > 0); assert.ok(typeof M.rewards[key] === 'number'); }
  assert.ok(M.flareLine.includes('불이 튀었다'));
  assert.ok(R.perfectWidth[0] >= 0.06 && R.perfectWidth[1] <= 0.09);
});

test('stageAt: level 에 맞는 구간(흰색 -> 연한 노랑 -> 황금빛 -> 진갈색 -> 탄 것)', () => {
  assert.deepEqual([0, 0.1, 0.25, 0.3, 0.45, 0.6, 0.7, 0.85, 0.92, 1].map((l) => stageAt(l).id),
    ['white', 'white', 'pale', 'pale', 'golden', 'golden', 'dark', 'dark', 'burnt', 'burnt']);
  assert.equal(stageLine('nope'), '');
});

test('colorAt: 처음은 흰색, 끝은 거의 검정, 사이는 부드럽게 이어진다', () => {
  const [r0, g0, b0] = colorAt(0);
  assert.ok(r0 > 0.95 && g0 > 0.95 && b0 > 0.9);
  assert.ok(colorAt(1).every((v) => v < 0.15));
  let prev = colorAt(0);
  for (let l = 0.01; l <= 1.0001; l += 0.01) {
    const c = colorAt(l);
    for (let i = 0; i < 3; i++) assert.ok(Math.abs(c[i] - prev[i]) < 0.08, `끊김 ${l}`);
    prev = c;
  }
  const gold = colorAt(0.5);
  assert.ok(gold[0] > gold[2] + 0.3, '황금색은 붉은빛이 푸른빛보다 훨씬 강하다');
});

test('shapeAt: 부풀었다 쪼그라들고, 익은 뒤부터 처진다', () => {
  assert.equal(shapeAt(0).puff, 1);
  assert.equal(shapeAt(0).sag, 0);
  assert.ok(shapeAt(M.shape.puffPeak).puff > shapeAt(0.2).puff);
  assert.ok(shapeAt(1).puff < shapeAt(M.shape.puffPeak).puff);
  assert.ok(shapeAt(1).sag > shapeAt(0.6).sag);
  assert.equal(shapeAt(M.shape.sagFrom).sag, 0);
});

test('resultLine: 결과별 멘트(완벽은 축하 멘트)', () => {
  assert.equal(resultLine('perfect'), '골고루 노릇노릇, 완벽한 굽기다! 스트레스가 녹는다!');
  assert.ok(resultLine('perfect').includes('골고루'));
  assert.equal(resultLine('uneven'), '앗, 한쪽만 숯이 됐네! 돌려줄걸~');
  assert.equal(resultLine('good'), '거의 완벽! 쫀득하고 달콤하다');
  assert.equal(resultLine('under'), '조금 덜 익었지만 맛있다');
  assert.equal(resultLine('over'), '살짝 탔지만 이것도 매력!');
  assert.equal(resultLine('burnt'), '앗, 숯덩이가 됐다… 그래도 후련!');
});

// ---- 상태 기계 ----
const run = (roast, seconds, step = 0.05) => {
  const events = [];
  for (let t = 0; t < seconds - 1e-9; t += step) events.push(...roast.update(step));
  return events;
};
const toToast = (roast) => { roast.start(); run(roast, M.takeSeconds + M.reachSeconds + 0.01); };
// 판을 고정해서 시험한다(완벽 구간 [0.55, 0.63], 실제 0.7초).
const fixedRound = (flares = []) => ({
  perfect: [0.55, 0.63], good: [0.51, 0.67], perfectSeconds: 0.7, flares, falseCues: [],
  knots: [{ tau: 0, level: 0 }, { tau: 5, level: 0.3 }, { tau: 10, level: 0.55 }, { tau: 10.7, level: 0.63 }, { tau: 13, level: 0.92 }], burntTau: 13,
});
// 돌리기 없는 옛 굽기(면 1개, 속도 1)와 같은 설정: 시간 진행·불 튐·단계 이벤트를 그대로 시험한다.
const ONE = { ...M, sides: 1, sideSpeed: 1 };
const roastWith = (round, cfg = ONE) => createRoast(cfg, Math.random, round);

test('createRoast: take -> reach -> toast 로 이어지고 stage 이벤트가 구간마다 한 번씩 난다', () => {
  const r = roastWith(fixedRound());
  assert.deepEqual(r.start(), [{ type: 'phase', phase: 'take' }]);
  assert.equal(r.phase, 'take');
  const ev = run(r, M.takeSeconds + M.reachSeconds + 0.01);
  assert.deepEqual(ev.filter((e) => e.type === 'phase').map((e) => e.phase), ['reach', 'toast']);
  assert.equal(r.phase, 'toast');
  const more = run(r, 10.2);
  assert.deepEqual(ev.concat(more).filter((e) => e.type === 'stage').map((e) => e.id), ['white', 'pale', 'golden']);
});

test('createRoast: 완벽 구간에 꺼내면 perfect, 감소(reduce)는 후련 단계에서 정확히 한 번(12)', () => {
  const r = roastWith(fixedRound());
  toToast(r);
  run(r, 10.35);
  const pulled = r.pull();
  assert.equal(pulled[0].type, 'pulled');
  assert.equal(pulled[0].result, 'perfect');
  assert.equal(pulled[0].auto, false);
  const ev = run(r, 10);
  assert.equal(ev.filter((e) => e.type === 'reduce').length, 1);
  assert.deepEqual(ev.filter((e) => e.type === 'reduce')[0], { type: 'reduce', result: 'perfect', amount: 12 });
  assert.deepEqual(ev.filter((e) => e.type === 'phase').map((e) => e.phase), ['chew', 'relief']);
  assert.deepEqual(ev.at(-1), { type: 'done', result: 'perfect' });
  assert.equal(r.active, false);
  assert.deepEqual(r.update(5), []);
  assert.equal(r.pull(), null);
});

test('createRoast: 시간대별 결과와 감소량(under 8 / good 10 / perfect 12 / good 10 / over 8)', () => {
  const round = fixedRound();
  const expect = [[3, 'under', 8], [9.9, 'good', 10], [10.35, 'perfect', 12], [10.9, 'good', 10], [11.5, 'over', 8]];
  for (const [seconds, result, amount] of expect) {
    const r = roastWith(round);
    toToast(r); run(r, seconds);
    const p = r.pull();
    assert.equal(p[0].result, result, `${seconds}s`);
    const ev = run(r, 10);
    assert.equal(ev.find((e) => e.type === 'reduce').amount, amount);
  }
});

test('createRoast: 아무것도 안 하면 burnt 에서 자동으로 빼내고 감소는 7, 한 번만', () => {
  const r = roastWith(fixedRound());
  r.start();
  const ev = run(r, 40);
  const pulled = ev.find((e) => e.type === 'pulled');
  assert.equal(pulled.result, 'burnt');
  assert.equal(pulled.auto, true);
  assert.deepEqual(ev.filter((e) => e.type === 'reduce'), [{ type: 'reduce', result: 'burnt', amount: 7 }]);
  assert.equal(ev.at(-1).type, 'done');
});

test('createRoast: 불이 튀면 이벤트가 한 번 나고 그동안 빨리 익는다(타이밍이 앞당겨진다)', () => {
  const flare = [{ at: 2, duration: 1, boost: 2.4 }];
  const r = roastWith(fixedRound(flare));
  toToast(r);
  const ev = run(r, 2.05);
  assert.equal(ev.filter((e) => e.type === 'flare').length, 1);
  assert.ok(r.flare > 0 && r.flare < 1);
  // 불 튐 1.4초분이 앞당겨져 완벽 구간 시작(10)이 8.6초에 열린다.
  const a = roastWith(fixedRound(flare)); toToast(a); run(a, 8.5);
  assert.equal(a.level < 0.55, true);
  run(a, 0.2);
  assert.equal(a.level >= 0.55, true);
  const none = roastWith(fixedRound()); toToast(none); run(none, 8.7);
  assert.equal(none.level < 0.55, true);
});

test('createRoast: 큰 dt 한 번에도 같은 결과(단계·불 튐 이벤트를 건너뛰지 않는다)', () => {
  const r = roastWith(fixedRound([{ at: 2, duration: 1, boost: 2.4 }]));
  r.start();
  const ev = r.update(100);
  assert.deepEqual(ev.filter((e) => e.type === 'phase').map((e) => e.phase), ['reach', 'toast', 'bring', 'chew', 'relief']);
  assert.deepEqual(ev.filter((e) => e.type === 'stage').map((e) => e.id), ['white', 'pale', 'golden', 'dark', 'burnt']);
  assert.equal(ev.filter((e) => e.type === 'flare').length, 1);
  assert.equal(ev.filter((e) => e.type === 'reduce').length, 1);
  assert.equal(ev.at(-1).type, 'done');
});

test('createRoast: dt 를 잘게 쪼개도 한 번에 줘도 같은 시각에 같은 굽기 정도', () => {
  const flare = [{ at: 2, duration: 1, boost: 2.4 }];
  const a = roastWith(fixedRound(flare)); a.start(); a.update(M.takeSeconds + M.reachSeconds); a.update(8.9);
  const b = roastWith(fixedRound(flare)); b.start(); run(b, M.takeSeconds + M.reachSeconds, 0.01); run(b, 8.9, 0.01);
  assert.ok(Math.abs(a.level - b.level) < 1e-6);
});

test('createRoast: 매 판이 다른 타이밍(기본 난수)이다', () => {
  const seen = new Set();
  for (let i = 0; i < 20; i++) seen.add(createRoast().round.perfect[0].toFixed(5));
  assert.ok(seen.size > 15);
});

test('createRoast: take·reach·toast 에서는 취소되고 감소 이벤트가 없다, 먹는 중에는 취소·꺼내기 불가', () => {
  for (const seconds of [0.2, M.takeSeconds + 0.2, M.takeSeconds + M.reachSeconds + 1]) {
    const r = roastWith(fixedRound()); r.start(); run(r, seconds);
    assert.equal(r.canCancel, true);
    assert.equal(r.cancel(), true);
    assert.equal(r.phase, 'cancelled');
    assert.equal(r.active, false);
    assert.deepEqual(run(r, 20), []);
  }
  const e = roastWith(fixedRound()); toToast(e); run(e, 1); e.pull();
  assert.equal(e.canCancel, false);
  assert.equal(e.cancel(), false);
  assert.equal(e.pull(), null);
  assert.equal(e.phase, 'bring');
});

test('createRoast: 굽기 전(take/reach)에는 꺼낼 수 없다', () => {
  const r = roastWith(fixedRound()); r.start();
  assert.equal(r.pull(), null);
  run(r, M.takeSeconds + 0.1);
  assert.equal(r.pull(), null);
});

test('전체 행동 길이는 대략 14~24초(굽기 10~18초 + 꺼내고 먹기)', () => {
  const eat = M.takeSeconds + M.reachSeconds + M.eat.bringSeconds + M.eat.chewSeconds + M.eat.reliefSeconds;
  for (const round of rounds(200)) {
    const toast = timeAtLevel(round, M.burntAt - 1e-9);
    assert.ok(eat + toast >= 15 && eat + toast <= 25, `전체 ${(eat + toast).toFixed(1)}s`);
  }
});

// ---- 모드·구역 ----
const L = buildLayout(SEED);
const zones = buildZones(L);
const benches = L.interactables.filter((i) => i.kind === 'seat');
const dist = (b) => Math.hypot(b.x - FURNACE.x, b.z - FURNACE.z);

test('마시멜로 구역: 소각로 옆(FIRE_ZONE_RADIUS 안) 벤치에만 묶이고, 행동은 굽기 하나(자동 없음)', () => {
  const zone = zones.find((z) => z.id === 'marshmallow');
  assert.ok(zone);
  assert.equal(zone.space, 'yard');
  assert.deepEqual(zone.actions, ['roast']);
  assert.equal(zone.auto, false);
  assert.deepEqual(autoActionsOf(zone), []);
  const near = benches.filter((b) => dist(b) <= FIRE_ZONE_RADIUS).map((b) => b.id).sort();
  assert.equal(near.length, 6); // 불 둘레 통나무 자리 6개가 모두 마시멜로·불멍 구역이다
  assert.deepEqual([...zone.seatIds].sort(), near);
  const def = ACTION_DEFS.roast;
  assert.deepEqual({ zone: def.zone, key: def.key, label: def.label }, { zone: 'marshmallow', key: '1', label: '마시멜로 굽기' });
});

test('currentZoneFor: 불 옆 벤치에 앉으면 굽기 구역, 불에서 먼 벤치·서 있을 때는 아니다', () => {
  const near = benches.find((b) => dist(b) <= FIRE_ZONE_RADIUS);
  const seatedNear = currentZoneFor({ mode: 'seated', pos: near, seat: near, zones, spaceId: 'yard' });
  assert.equal(seatedNear.id, 'marshmallow');
  assert.deepEqual(zoneActions(seatedNear), ['roast']);
  const far = { id: 'bench-far', x: 30, z: 30 };
  assert.equal(currentZoneFor({ mode: 'seated', pos: far, seat: far, zones, spaceId: 'yard' }), null);
  const standing = currentZoneFor({ mode: 'free', pos: { x: FURNACE.x + 1, z: FURNACE.z }, zones, spaceId: 'yard' });
  assert.equal(standing.id, 'incinerator'); // 서 있을 때는 태우기 구역이다
});

test('canRoast: 앉은 채 굽기 구역일 때만(서 있거나 다른 모드, 구역 없음은 불가)', () => {
  const zone = zones.find((z) => z.id === 'marshmallow');
  assert.equal(canRoast({ mode: 'seated', zone }), true);
  for (const mode of ['free', 'roasting', 'interview-play', 'item-choice', 'fortune', 'result']) assert.equal(canRoast({ mode, zone }), false);
  assert.equal(canRoast({ mode: 'seated', zone: null }), false);
  assert.equal(canRoast({ mode: 'seated', zone: zones.find((z) => z.id === 'incinerator') }), false);
});

test('모드: seated -> roasting -> seated, 굽는 동안은 앉은 것으로 보고 걷지 못하며 일어나기·팝업은 무시', () => {
  assert.equal(nextMode('seated', 'roast:start'), 'roasting');
  assert.equal(nextMode('free', 'roast:start'), 'free');
  assert.equal(nextMode('roasting', 'roast:end'), 'seated');
  for (const ev of ['interact', 'move', 'open:result', 'close', 'transition:start', 'pick:open']) assert.equal(nextMode('roasting', ev), 'roasting');
  assert.equal(holdsSeat('roasting'), true);
  assert.equal(canWalk('roasting'), false);
});

// ---- 불멍(자동 감소): 굽는 동안에도 같이 줄어든다 ----
test('불멍: PASSIVE 설정(5초에 -5)과 소각로 옆 벤치 판정(앉은 채·굽는 중 모두, 마당만, 반경 안만)', () => {
  assert.deepEqual(PASSIVE, { interval: 5, amount: 5 });
  const near = benches.find((b) => dist(b) <= FIRE_ZONE_RADIUS);
  const base = { spaceId: 'yard', seatDistance: dist(near) };
  assert.equal(isMeditating({ ...base, mode: 'seated' }, FIRE_ZONE_RADIUS), true);
  assert.equal(isMeditating({ ...base, mode: 'roasting' }, FIRE_ZONE_RADIUS), true);
  assert.equal(isMeditating({ ...base, mode: 'free' }, FIRE_ZONE_RADIUS), false);
  assert.equal(isMeditating({ ...base, mode: 'interview-play' }, FIRE_ZONE_RADIUS), false);
  assert.equal(isMeditating({ ...base, mode: 'seated', spaceId: 'laundry' }, FIRE_ZONE_RADIUS), false);
  assert.equal(isMeditating({ ...base, mode: 'seated', seatDistance: FIRE_ZONE_RADIUS + 0.1 }, FIRE_ZONE_RADIUS), false);
  assert.equal(isMeditating({ ...base, mode: 'seated', seatDistance: null }, FIRE_ZONE_RADIUS), false);
});

test('불멍: 굽는 동안에도 끊기지 않고 interval 마다 줄고, 굽기 감소(보상)와 따로 센다', () => {
  const passive = createPassive(PASSIVE);
  const roast = roastWith(fixedRound());
  roast.start();
  let passiveTotal = 0;
  let rewardEvents = 0;
  for (let t = 0; t < 30; t += 0.1) {
    const meditating = isMeditating({ mode: roast.active ? 'roasting' : 'seated', spaceId: 'yard', seatDistance: 1 }, FIRE_ZONE_RADIUS);
    passiveTotal += passive.update(0.1, meditating);
    rewardEvents += roast.update(0.1).filter((e) => e.type === 'reduce').length;
  }
  assert.equal(rewardEvents, 1);
  assert.equal(passiveTotal, PASSIVE.amount * 6); // 30초 / 5초 = 6번, 굽기가 끝나도 앉아 있는 동안 계속
  assert.equal(ACTION_REDUCE, 5); // 다른 행동의 감소량은 그대로
});

// ---- 돌리기·고르게 굽기 ----
const toastWith = (round = fixedRound()) => { const r = createRoast(M, Math.random, round); toToast(r); return r; };

test('설정: 면 3개, 굴리기 300도/초(램프 0.12초), 불을 안 보는 면은 천천히 익는다', () => {
  assert.equal(M.sides, 3);
  assert.equal(M.rollDegPerSec, 300);
  assert.equal(M.rollRampSeconds, 0.12);
  assert.equal(M.rotateSeconds, undefined);
  assert.ok(M.ambientRate > 0 && M.ambientRate < 0.5);
  assert.ok(Math.abs(sideStep() - Math.PI * 2 / 3) < 1e-12);
});

test('sideWeights: 불을 마주 보는 면이 가장 크고 나머지는 ambientRate, 돌아가는 중에는 두 면이 나눈다', () => {
  const [a, b, c] = sideWeights(0);
  assert.ok(Math.abs(a - 1) < 1e-9);
  assert.ok(Math.abs(b - M.ambientRate) < 1e-9 && Math.abs(c - M.ambientRate) < 1e-9);
  const w = sideWeights(sideStep());
  assert.ok(w[1] > 0.99 && w[0] < 0.4);
  const mid = sideWeights(sideStep() / 2);
  assert.ok(mid[0] > M.ambientRate + 0.2 && Math.abs(mid[0] - mid[1]) < 1e-9);
});

test('averageLevel / spreadOf: 평균과 (최대-최소)', () => {
  assert.ok(Math.abs(averageLevel([0.2, 0.5, 0.8]) - 0.5) < 1e-12);
  assert.ok(Math.abs(spreadOf([0.2, 0.5, 0.8]) - 0.6) < 1e-12);
  assert.equal(spreadOf([0.4, 0.4, 0.4]), 0);
});

test('classifyRoast: 평균이 완벽이고 고르면 perfect, 평균은 완벽인데 한 면만 탔으면 uneven(한쪽 탐)', () => {
  const round = fixedRound(); // 완벽 [0.55, 0.63], 좋음 [0.51, 0.67]
  const even = classifyRoast([0.58, 0.59, 0.6], round);
  assert.equal(even.result, 'perfect');
  assert.equal(even.even, true);
  const a = classifyRoast([0.3, 0.6, 0.85], round); // 평균 0.583 = 완벽 구간, 차이 0.55
  assert.equal(a.result, 'uneven');
  assert.equal(a.even, false);
  assert.equal(classifyRoast([0.4, 0.58, 0.77], round).result, 'uneven'); // 평균 0.583
  assert.equal(classifyRoast([0.4, 0.62, 0.65], round).result, 'good'); // 평균 0.557 완벽인데 차이 0.25 > 0.2, 탄 면은 없다 -> 좋음으로 내려간다
});

test('classifyRoast: 평균 기준 분류(덜 익음·좋음·너무 익음)와 숯덩이(어느 면이든 탄 단계)', () => {
  const round = fixedRound();
  assert.equal(classifyRoast([0.2, 0.25, 0.3], round).result, 'under');
  assert.equal(classifyRoast([0.52, 0.53, 0.52], round).result, 'good');
  assert.equal(classifyRoast([0.7, 0.72, 0.7], round).result, 'over');
  assert.equal(classifyRoast([0.3, 0.3, M.burntAt], round).result, 'burnt');
  assert.equal(classifyRoast([0.8, 0.2, 0.2], round).result, 'uneven'); // 한쪽만 거의 탔다: 평균은 덜 익음
  assert.equal(classifyRoast([0.6, 0.6, 0.6], round).even, true);
});

test('createRoast: 돌리지 않으면 불을 마주 본 0번 면만 빨리 익고 나머지는 천천히 익는다', () => {
  const r = toastWith();
  run(r, 4);
  const [s0, s1, s2] = r.sideLevels;
  assert.ok(s0 > s1 * 2 && s0 > s2 * 2, `${s0} ${s1} ${s2}`);
  assert.ok(s1 > 0, '불을 안 봐도 조금은 익는다');
  assert.ok(Math.abs(s1 - s2) < 1e-9);
  assert.equal(r.facing, 0);
  assert.ok(Math.abs(r.level - averageLevel(r.sideLevels)) < 1e-12);
});

const rollFor = (r, seconds, step = 0.01) => { r.setRolling(true); return run(r, seconds, step); };

test('rollSpeedStep: 0 에서 rollRampSeconds 만에 최고 속도, 최고 속도를 넘지 않고, 떼면 같은 기울기로 0 까지 줄어든다', () => {
  const max = rollMaxSpeed();
  assert.ok(Math.abs(max - (300 * Math.PI) / 180) < 1e-12);
  let v = 0;
  for (let i = 0; i < 6; i++) v = rollSpeedStep(v, true, 0.01); // 0.06초
  assert.ok(Math.abs(v - max / 2) < 1e-9);
  for (let i = 0; i < 100; i++) v = rollSpeedStep(v, true, 0.01);
  assert.equal(v, max);
  for (let i = 0; i < 6; i++) v = rollSpeedStep(v, false, 0.01);
  assert.ok(Math.abs(v - max / 2) < 1e-9);
  for (let i = 0; i < 100; i++) v = rollSpeedStep(v, false, 0.01);
  assert.equal(v, 0);
});

test('createRoast: 누르고 있는 동안 각도가 한 방향으로 일정한 속도로 늘고(램프 뒤 기울기 300도/초), 떼면 램프 만에 멈춘다', () => {
  const r = toastWith();
  assert.equal(r.angle, 0);
  assert.equal(r.rolling, false);
  assert.equal(r.setRolling(true), true);
  const samples = [];
  for (let i = 0; i < 300; i++) { r.update(0.01); samples.push(r.angle); }
  for (let i = 1; i < samples.length; i++) assert.ok(samples[i] >= samples[i - 1], '뒤로 돌지 않는다');
  const slope = (samples[299] - samples[199]) / 1.0; // 2초~3초: 램프 이후
  assert.ok(Math.abs(slope - rollMaxSpeed()) < 1e-6, `기울기 ${slope}`);
  const slope2 = (samples[199] - samples[99]) / 1.0;
  assert.ok(Math.abs(slope2 - slope) < 1e-6, '속도가 일정하다');
  assert.ok(r.rollSpeed === rollMaxSpeed());
  r.setRolling(false);
  const before = r.angle;
  run(r, M.rollRampSeconds + 0.01, 0.01);
  assert.equal(r.rollSpeed, 0);
  const stopAt = r.angle;
  assert.ok(stopAt - before < rollMaxSpeed() * M.rollRampSeconds, '램프 안에 조금만 더 간다');
  run(r, 1, 0.01);
  assert.equal(r.angle, stopAt, '뗀 뒤에는 각도가 그대로');
});

test('createRoast: 굴림 각도는 dt 를 어떻게 쪼개도 같다(큰 dt 도 같음)', () => {
  const a = toastWith(); a.setRolling(true); a.update(3);
  const b = toastWith(); b.setRolling(true); run(b, 3, 0.01);
  assert.ok(Math.abs(a.angle - b.angle) < 0.02, `${a.angle} ${b.angle}`);
  for (let i = 0; i < 3; i++) assert.ok(Math.abs(a.sideLevels[i] - b.sideLevels[i]) < 0.01);
});

test('createRoast: 굴리기는 굽는 중에만(굽기 전·꺼낸 뒤에는 false 가 되고 각도가 늘지 않는다)', () => {
  const r = createRoast(M, Math.random, fixedRound());
  r.start();
  assert.equal(r.setRolling(true), false);
  assert.equal(r.canRoll, false);
  run(r, M.takeSeconds + M.reachSeconds + 0.01);
  assert.equal(r.canRoll, true);
  assert.equal(r.setRolling(true), true);
  run(r, 2);
  r.pull();
  assert.equal(r.rolling, false);
  assert.equal(r.setRolling(true), false);
  assert.equal(r.canRoll, false);
  const angle = r.angle;
  run(r, 2);
  assert.ok(Math.abs(r.angle - angle) < 1e-9);
});

test('createRoast: 계속 굴리면 면이 고르게 익고(차이 작음), 가만히 두면 불을 보는 한 면만 많이 익는다', () => {
  const rolled = toastWith(); rollFor(rolled, 6);
  const still = toastWith(); run(still, 6);
  assert.ok(spreadOf(rolled.sideLevels) < 0.05, `굴림 ${spreadOf(rolled.sideLevels)}`);
  assert.ok(spreadOf(still.sideLevels) > 0.25, `정지 ${spreadOf(still.sideLevels)}`);
  assert.ok(rolled.sideLevels.every((x) => x > 0.2), '굴리면 모든 면이 익는다');
});

test('createRoast: 굴리다 멈추면 그때 불을 마주 본 면(facing)이 그 뒤로 더 빨리 익는다', () => {
  const r = toastWith();
  rollFor(r, 2);
  r.setRolling(false);
  run(r, 0.3, 0.01); // 멈춤
  const face = r.facing;
  const base = r.sideLevels.slice();
  run(r, 3);
  const gain = r.sideLevels.map((v, i) => v - base[i]);
  const others = gain.filter((_, i) => i !== face);
  assert.ok(gain[face] > others[0] * 1.5 && gain[face] > others[1] * 1.5, `${gain}`);
});

test('createRoast: 한 바퀴(1.2초)당 각 면의 열은 모두 같다(적분이 면에 공평)', () => {
  const r = toastWith();
  rollFor(r, 0.12, 0.01); // 램프가 지난 뒤부터 센다
  const base = r.sideLevels.slice();
  const a0 = r.angle;
  rollFor(r, 1.2 * 3, 0.01);
  assert.ok(Math.abs((r.angle - a0) - 3 * Math.PI * 2) < 0.01, '3바퀴');
  const gain = r.sideLevels.map((v, i) => v - base[i]);
  assert.ok(Math.max(...gain) - Math.min(...gain) < 0.01, `${gain}`);
});

test('createRoast: 굴리는 동안 평균이 오르는 속도는 가만히 굽는 한 면과 비슷하다(rollHeat 보정)', () => {
  const rolled = toastWith(); rollFor(rolled, 4);
  const still = toastWith(); run(still, 4);
  const ratio = rolled.level / Math.max(...still.sideLevels);
  assert.ok(ratio > 0.8 && ratio < 1.25, `비율 ${ratio}`);
});

test('createRoast: 한 면이 탄 단계에 닿으면 자동으로 빼내고 burnt(고르지 않음)', () => {
  const r = toastWith();
  const ev = run(r, 40);
  const pulled = ev.find((e) => e.type === 'pulled');
  assert.equal(pulled.result, 'burnt');
  assert.equal(pulled.auto, true);
  assert.equal(pulled.even, false);
  assert.equal(Math.max(...r.sideLevels), M.burntAt);
});

test('createRoast: 한쪽만 오래 구우면 꺼냈을 때 uneven(한쪽 탐)이고 감소는 8', () => {
  let seen = 0;
  for (let n = 0; n < 40; n++) {
    const r = createRoast(M, Math.random, makeRound(mulberry32(n * 17 + 3)));
    toToast(r);
    // 불 쪽 면이 unevenAt 에 닿기 직전까지만 굽고 꺼낸다(돌리지 않음).
    while (r.phase === 'toast' && Math.max(...r.sideLevels) < M.unevenAt + 0.01) run(r, 0.02, 0.02);
    if (r.phase !== 'toast') continue;
    const p = r.pull()[0];
    assert.ok(['uneven', 'burnt'].includes(p.result), p.result);
    if (p.result === 'uneven') {
      seen++;
      assert.equal(p.even, false);
      assert.equal(run(r, 10).find((e) => e.type === 'reduce').amount, 8);
    }
  }
  assert.ok(seen >= 30, `uneven ${seen}`);
});

test('createRoast: 굴리며 구우면 평균이 완벽 구간일 때 꺼내 perfect(고름)가 대부분이고, 굴리지 않으면 거의 안 나온다', () => {
  let perfect = 0; let uneven = 0; let stillPerfect = 0;
  for (let n = 0; n < 60; n++) {
    const r = createRoast(M, Math.random, makeRound(mulberry32(n * 31 + 5)));
    toToast(r);
    r.setRolling(true);
    const mid = (r.round.perfect[0] + r.round.perfect[1]) / 2;
    for (let i = 0; r.phase === 'toast' && i < 4000; i++) {
      if (r.level >= mid) { const p = r.pull()[0]; if (p.result === 'perfect') perfect++; if (p.result === 'uneven') uneven++; break; }
      run(r, 0.02, 0.02);
    }
    const q = createRoast(M, Math.random, makeRound(mulberry32(n * 31 + 5)));
    toToast(q);
    for (let i = 0; q.phase === 'toast' && i < 4000; i++) {
      if (q.level >= mid) { if (q.pull()[0].result === 'perfect') stillPerfect++; break; }
      run(q, 0.02, 0.02);
    }
  }
  assert.ok(perfect >= 40, `perfect ${perfect}/60`);
  assert.ok(uneven <= 5);
  assert.ok(stillPerfect < perfect / 3, `가만히 ${stillPerfect}`);
});

test('roastInputAction: 굽는 중 누르고 있는 동안 굴림(마우스·Space), 떼면 멈춤, 1·E 는 꺼내기, Esc 는 취소', () => {
  const key = (code) => ({ type: 'key', code });
  assert.equal(roastInputAction({ type: 'pointerdown' }, 'toast'), 'rollStart');
  assert.equal(roastInputAction(key('Space'), 'toast'), 'rollStart');
  assert.equal(roastInputAction({ type: 'pointerup' }, 'toast'), 'rollStop');
  assert.equal(roastInputAction({ type: 'keyup', code: 'Space' }, 'toast'), 'rollStop');
  assert.equal(roastInputAction({ type: 'keyup', code: 'KeyW' }, 'toast'), null);
  for (const code of ['Digit1', 'Numpad1', 'KeyE']) assert.equal(roastInputAction(key(code), 'toast'), 'pull');
  assert.equal(roastInputAction(key('Escape'), 'toast'), 'cancel');
  for (const code of ['KeyW', 'KeyR', 'Digit2', 'KeyV', 'Enter']) assert.equal(roastInputAction(key(code), 'toast'), null);
});

test('roastInputAction: 꺼내 드는 중(take·reach)에는 Esc·E 가 취소, 누름·Space·1 은 아무 일 없고, 먹는 중에는 모두 무시(떼기는 언제나 멈춤)', () => {
  for (const phase of ['take', 'reach']) {
    assert.equal(roastInputAction({ type: 'key', code: 'Escape' }, phase), 'cancel');
    assert.equal(roastInputAction({ type: 'key', code: 'KeyE' }, phase), 'cancel');
    assert.equal(roastInputAction({ type: 'pointerdown' }, phase), null);
    assert.equal(roastInputAction({ type: 'key', code: 'Space' }, phase), null);
    assert.equal(roastInputAction({ type: 'key', code: 'Digit1' }, phase), null);
  }
  for (const phase of ['bring', 'chew', 'relief', 'done', undefined]) {
    assert.equal(roastInputAction({ type: 'pointerdown' }, phase), null);
    assert.equal(roastInputAction({ type: 'key', code: 'Escape' }, phase), null);
    assert.equal(roastInputAction({ type: 'key', code: 'KeyE' }, phase), null);
    assert.equal(roastInputAction({ type: 'pointerup' }, phase), 'rollStop');
  }
});

test('roastHint: 누르고 있으면 돌아간다는 안내와 꺼내기·취소', () => {
  assert.equal(roastHint(true), '누르고 있으면 돌아가요 (클릭/Space) · 1/E: 꺼내기 · Esc: 취소');
  assert.equal(roastHint(false), 'Esc: 취소');
});
