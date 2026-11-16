import test from 'node:test';
import assert from 'node:assert/strict';
import {
  toastLevel, stageAt, classify, shouldAutoPull, gaugeMap, colorAt, shapeAt, resultLine, stageLine, canRoast, createRoast,
} from '../src/logic/marshmallow.js';
import { MARSHMALLOW as M, ACTION_REDUCE, FIRE_ZONE_RADIUS, FURNACE, SEED } from '../src/config.js';
import { buildZones, currentZoneFor, autoActionsOf, zoneActions } from '../src/logic/zones.js';
import { buildLayout } from '../src/logic/layout.js';
import { ACTION_DEFS } from '../src/logic/actions.js';
import { nextMode, holdsSeat, canWalk } from '../src/logic/playerMode.js';
import * as config from '../src/config.js';

test('toastLevel: 시간에 비례해 0..1 로 오르고 범위를 넘지 않는다', () => {
  assert.equal(toastLevel(0), 0);
  assert.equal(toastLevel(M.toastSeconds / 2), 0.5);
  assert.equal(toastLevel(M.toastSeconds), 1);
  assert.equal(toastLevel(999), 1);
  assert.equal(toastLevel(-3), 0);
  assert.equal(toastLevel(NaN), 0);
});

test('설정: 구간은 오름차순이고 황금 구간은 단계 경계와 맞는다', () => {
  const froms = M.stages.map((s) => s.from);
  assert.deepEqual([...froms].sort((a, b) => a - b), froms);
  assert.equal(froms[0], 0);
  assert.ok(froms.includes(M.golden[0]) && froms.includes(M.golden[1]) && froms.includes(M.burntAt));
  assert.ok(M.golden[0] < M.golden[1] && M.golden[1] < M.burntAt && M.burntAt <= 1);
  assert.ok(M.toastSeconds >= 5 && M.toastSeconds <= 6.5);
  for (const s of M.stages) assert.ok(s.line.length > 0);
});

test('stageAt: level 에 맞는 구간(흰색 -> 연한 노랑 -> 황금 -> 진갈색 -> 탄 것)', () => {
  assert.deepEqual([0, 0.1, 0.2, 0.3, 0.45, 0.6, 0.7, 0.85, 0.92, 1].map((l) => stageAt(l).id),
    ['white', 'white', 'pale', 'pale', 'golden', 'golden', 'dark', 'dark', 'burnt', 'burnt']);
  assert.equal(stageLine('golden'), '지금이다!');
  assert.equal(stageLine('nope'), '');
});

test('classify: under / perfect / over / burnt (경계 포함 규칙)', () => {
  assert.equal(classify(0), 'under');
  assert.equal(classify(M.golden[0] - 0.01), 'under');
  assert.equal(classify(M.golden[0]), 'perfect');
  assert.equal(classify(M.golden[1] - 0.01), 'perfect');
  assert.equal(classify(M.golden[1]), 'over');
  assert.equal(classify(M.burntAt - 0.01), 'over');
  assert.equal(classify(M.burntAt), 'burnt');
  assert.equal(classify(1), 'burnt');
});

test('shouldAutoPull: 탄 단계에 닿으면 자동으로 빼낸다', () => {
  assert.equal(shouldAutoPull(M.burntAt - 0.001), false);
  assert.equal(shouldAutoPull(M.burntAt), true);
  assert.equal(shouldAutoPull(1), true);
});

test('gaugeMap: 칸은 0..burntAt, 황금 구간 위치는 비율', () => {
  assert.deepEqual(gaugeMap(0), { fill: 0, goldenFrom: M.golden[0] / M.burntAt, goldenTo: M.golden[1] / M.burntAt });
  assert.equal(gaugeMap(M.burntAt).fill, 1);
  assert.equal(gaugeMap(1).fill, 1);
  assert.ok(Math.abs(gaugeMap(M.burntAt / 2).fill - 0.5) < 1e-9);
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
  const gold = colorAt(M.golden[0]);
  assert.ok(gold[0] > gold[2] + 0.3, '황금색은 붉은빛이 푸른빛보다 훨씬 강하다');
});

test('shapeAt: 부풀었다 쪼그라들고, 익은 뒤부터 처진다', () => {
  assert.equal(shapeAt(0).puff, 1);
  assert.equal(shapeAt(0).sag, 0);
  assert.ok(shapeAt(M.golden[1]).puff > shapeAt(0.2).puff);
  assert.ok(shapeAt(1).puff < shapeAt(M.golden[1]).puff);
  assert.ok(shapeAt(1).sag > shapeAt(0.6).sag);
  assert.equal(shapeAt(M.golden[0]).sag, 0);
});

test('resultLine: 결과별 멘트(요청 문구)', () => {
  assert.equal(resultLine('perfect'), '겉바속촉~ 스트레스가 녹는다!');
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

test('createRoast: take -> reach -> toast 로 이어지고 stage 이벤트가 구간마다 한 번씩 난다', () => {
  const r = createRoast();
  assert.deepEqual(r.start(), [{ type: 'phase', phase: 'take' }]);
  assert.equal(r.phase, 'take');
  const ev = run(r, M.takeSeconds + M.reachSeconds + 0.01);
  assert.deepEqual(ev.filter((e) => e.type === 'phase').map((e) => e.phase), ['reach', 'toast']);
  assert.equal(r.phase, 'toast');
  const more = run(r, 2.9);
  assert.deepEqual(more.filter((e) => e.type === 'stage').map((e) => e.id), ['pale', 'golden']);
});

test('createRoast: 완벽하게 꺼내면 perfect, 감소(reduce)는 후련 단계에서 정확히 한 번', () => {
  const r = createRoast();
  toToast(r);
  run(r, M.toastSeconds * 0.55);
  const pulled = r.pull();
  assert.equal(pulled[0].type, 'pulled');
  assert.equal(pulled[0].result, 'perfect');
  assert.equal(pulled[0].auto, false);
  const ev = run(r, 10);
  assert.equal(ev.filter((e) => e.type === 'reduce').length, 1);
  assert.deepEqual(ev.filter((e) => e.type === 'reduce')[0], { type: 'reduce', result: 'perfect' });
  assert.deepEqual(ev.filter((e) => e.type === 'phase').map((e) => e.phase), ['chew', 'relief']);
  assert.deepEqual(ev.at(-1), { type: 'done', result: 'perfect' });
  assert.equal(r.active, false);
  assert.deepEqual(r.update(5), []); // 끝난 뒤에는 아무 일도 없다
  assert.equal(r.pull(), null);
});

test('createRoast: 일찍 꺼내면 under, 늦게 꺼내면 over', () => {
  const a = createRoast(); toToast(a); run(a, M.toastSeconds * 0.15);
  assert.equal(a.pull()[0].result, 'under');
  const b = createRoast(); toToast(b); run(b, M.toastSeconds * 0.8);
  assert.equal(b.pull()[0].result, 'over');
});

test('createRoast: 아무것도 안 하면 burntAt 에서 자동으로 빼내고 burnt, 전체 8~12초', () => {
  const r = createRoast();
  r.start();
  const ev = run(r, 30);
  const pulled = ev.find((e) => e.type === 'pulled');
  assert.equal(pulled.result, 'burnt');
  assert.equal(pulled.auto, true);
  assert.equal(ev.filter((e) => e.type === 'reduce').length, 1);
  assert.equal(ev.at(-1).type, 'done');
  const total = M.takeSeconds + M.reachSeconds + M.toastSeconds * M.burntAt + M.eat.bringSeconds + M.eat.chewSeconds + M.eat.reliefSeconds;
  assert.ok(total >= 8 && total <= 12, `전체 ${total}s`);
});

test('createRoast: 큰 dt 한 번에도 같은 결과(단계 이벤트를 건너뛰지 않는다)', () => {
  const r = createRoast();
  r.start();
  const ev = r.update(100);
  assert.deepEqual(ev.filter((e) => e.type === 'phase').map((e) => e.phase), ['reach', 'toast', 'bring', 'chew', 'relief']);
  assert.equal(ev.filter((e) => e.type === 'reduce').length, 1);
  assert.equal(ev.at(-1).type, 'done');
});

test('createRoast: take·reach·toast 에서는 취소되고 감소 이벤트가 없다, 먹는 중에는 취소·꺼내기 불가', () => {
  for (const seconds of [0.2, M.takeSeconds + 0.2, M.takeSeconds + M.reachSeconds + 1]) {
    const r = createRoast(); r.start(); run(r, seconds);
    assert.equal(r.canCancel, true);
    assert.equal(r.cancel(), true);
    assert.equal(r.phase, 'cancelled');
    assert.equal(r.active, false);
    assert.deepEqual(run(r, 20), []);
  }
  const e = createRoast(); toToast(e); run(e, 1); e.pull();
  assert.equal(e.canCancel, false);
  assert.equal(e.cancel(), false);
  assert.equal(e.pull(), null);
  assert.equal(e.phase, 'bring');
});

test('createRoast: 굽기 전(take/reach)에는 꺼낼 수 없다', () => {
  const r = createRoast(); r.start();
  assert.equal(r.pull(), null);
  run(r, M.takeSeconds + 0.1);
  assert.equal(r.pull(), null);
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
  assert.ok(near.length >= 1);
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

test('불멍(자동 감소) 제거: PASSIVE 설정과 passive 모듈이 없고, 굽기 감소는 ACTION_REDUCE 그대로', async () => {
  assert.equal('PASSIVE' in config, false);
  await assert.rejects(import('../src/logic/passive.js'));
  assert.equal(ACTION_REDUCE, 5);
});
