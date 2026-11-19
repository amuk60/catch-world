import test from 'node:test';
import assert from 'node:assert/strict';
import { buildLayout, buildingFacade } from '../src/logic/layout.js';
import { FURNACE, PLAYER, SEED, SPAWN } from '../src/config.js';
import { BUILDING_NAMES } from '../src/logic/signText.js';
import { PATH_STYLE, buildPathPlan, catmullRom, destinations, fireEntry, minClearance, polylineLength, resample, routePath, routingObstacles } from '../src/logic/paths.js';

const layout = buildLayout(SEED);
const plan = buildPathPlan(layout);
const byId = (id) => plan.paths.find((p) => p.id === id);
const hypot = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

test('catmullRom: 경유점을 모두 지나고 양 끝이 그대로다', () => {
  const w = [{ x: 0, z: 0 }, { x: 2, z: 1 }, { x: 4, z: -1 }, { x: 6, z: 0 }];
  const pts = catmullRom(w, 8);
  assert.deepEqual(pts[0], w[0]);
  assert.deepEqual(pts[pts.length - 1], w[3]);
  for (const p of w) assert.ok(pts.some((q) => hypot(p, q) < 1e-9), JSON.stringify(p));
});

test('resample: 간격이 일정하고 진행 방향이 단위벡터다', () => {
  const r = resample([{ x: 0, z: 0 }, { x: 10, z: 0 }], 0.5, 1);
  assert.equal(r[0].s, 1);
  assert.ok(Math.abs(r[1].x - r[0].x - 0.5) < 1e-9);
  assert.ok(Math.abs(Math.hypot(r[0].tx, r[0].tz) - 1) < 1e-9);
  assert.equal(Math.round(polylineLength([{ x: 0, z: 0 }, { x: 3, z: 4 }])), 5);
});

test('routePath: 길을 막은 장애물을 돌아가고, 걸리지 않으면 거의 곧게 간다', () => {
  const a = { x: 0, z: 0 };
  const b = { x: 10, z: 0 };
  const free = routePath(a, b, []);
  assert.ok(free.ok);
  assert.ok(Math.abs(polylineLength(free.points) - 10) < 0.5);
  const blocked = routePath(a, b, [{ x: 5, z: 0, radius: 1.2 }, { x: 8, z: 0.4, radius: 0.5 }]);
  assert.ok(blocked.ok, `여유 ${blocked.clearance}`);
  assert.ok(minClearance(blocked.points, [{ x: 5, z: 0, radius: 1.2 }]) >= PATH_STYLE.clearance - 1e-6);
  assert.deepEqual(blocked.points[0], a);
  assert.deepEqual(blocked.points[blocked.points.length - 1], b);
});

test('가는 길 5개: 허브(스폰)에서 시작해 캠프파이어·면접장·세탁소·포춘쿠키 상점·파쇄기로 간다', () => {
  assert.deepEqual(plan.paths.map((p) => p.id), ['fire', 'interview', 'laundry', 'fortune', 'shredder']);
  assert.deepEqual(plan.paths.map((p) => p.label), ['캠프파이어', BUILDING_NAMES.interview, BUILDING_NAMES.laundry, BUILDING_NAMES.fortune, '파쇄기']);
  assert.deepEqual(plan.hub, { x: SPAWN.x, z: SPAWN.z });
  for (const p of plan.paths) {
    assert.ok(p.ok, `${p.id} 장애물을 못 피함(${p.clearance})`);
    assert.ok(hypot(p.points[0], SPAWN) < 1e-9, `${p.id} 시작`);
    assert.ok(hypot(p.points[p.points.length - 1], p.end) < 1e-9, `${p.id} 끝`);
    assert.ok(p.length > 3 && p.length < 14, `${p.id} 길이 ${p.length}`);
  }
});

test('도착점은 배치 데이터에서 계산된다: 건물 문 앞 걸어가는 자리, 노점·파쇄기 정면, 통나무 고리 틈', () => {
  for (const id of ['interview', 'laundry']) {
    const f = buildingFacade(id);
    const door = layout.interactables.find((i) => i.id === `${id}-door`);
    assert.ok(hypot(byId(id).end, door.walkTo) < 1e-9, `${id} 문 앞`);
    assert.ok(hypot(byId(id).end, { x: f.door.x + f.front.x * 1.5, z: f.door.z + f.front.z * 1.5 }) < 1e-9);
  }
  const stall = byId('fortune').end;
  assert.ok(hypot(stall, layout.stall) > 1.5 && hypot(stall, layout.stall) < 2.0, '노점 정면');
  assert.ok(hypot(byId('shredder').end, layout.shredder.stand) < 1.3, '파쇄기 작업 자리 가까이');
  assert.ok(hypot(byId('shredder').end, SPAWN) < hypot(layout.shredder, SPAWN), '파쇄기 정면(스폰 쪽)');
  const fire = fireEntry(layout);
  assert.ok(Math.abs(hypot(fire, FURNACE) - PATH_STYLE.fireRadius) < 1e-9);
  assert.ok(hypot(fire, byId('fire').end) < 1e-9);
  for (const s of layout.interactables.filter((i) => i.kind === 'seat')) {
    const da = Math.abs(Math.atan2(Math.sin(Math.atan2(s.z - FURNACE.z, s.x - FURNACE.x) - fire.angle), Math.cos(Math.atan2(s.z - FURNACE.z, s.x - FURNACE.x) - fire.angle)));
    assert.ok(da > (20 * Math.PI) / 180, `통나무 ${s.id} 와 입구 사이 각 ${da}`);
  }
  assert.equal(destinations(layout).length, 5);
});

test('모든 길은 모든 장애물에서 플레이어 반경 이상 떨어져 있다(다른 목적지의 건물·노점·통나무·나무·바위·가로등·소각로 원도 가로지르지 않는다)', () => {
  const circles = [FURNACE, ...layout.obstacles];
  for (const p of plan.paths) {
    const c = minClearance(p.points, circles);
    assert.ok(c >= PLAYER.radius, `${p.id} 장애물 여유 ${c}`);
  }
  // 덤불·나무도 피한다(충돌은 없지만 길 위에 서지 않는다)
  assert.ok(plan.obstacles.length > circles.length);
  for (const p of plan.paths) assert.ok(minClearance(p.points, routingObstacles(layout)) >= PLAYER.radius - 1e-9, p.id);
});

test('길은 완만히 휘어 있다: 곧은 자가 아니고 지나치게 구불거리지도 않는다', () => {
  for (const p of plan.paths) {
    const a = p.points[0];
    const b = p.points[p.points.length - 1];
    const chord = hypot(a, b);
    let dev = 0;
    for (const q of p.points) dev = Math.max(dev, Math.abs(((b.x - a.x) * (a.z - q.z) - (a.x - q.x) * (b.z - a.z)) / chord));
    assert.ok(dev > 0.12, `${p.id} 너무 곧다(${dev})`);
    assert.ok(p.length / chord < 1.4, `${p.id} 너무 구불(${p.length / chord})`);
  }
});

test('길들은 허브에서 갈라져 나가 서로 멀어진다(허브에서 4 이상 가면 다른 길과 0.6 이상 떨어진다)', () => {
  for (const p of plan.paths) for (const q of plan.paths) {
    if (p === q) continue;
    for (const pt of resample(p.points, 0.5, 4)) assert.ok(Math.min(...q.points.map((r) => hypot(pt, r))) > 0.6, `${p.id} / ${q.id} @${pt.s}`);
  }
});

test('이정표: 허브 곁, 길 위나 장애물 위가 아니며 화살 방향은 각 길의 첫 구간 방향이다', () => {
  const sp = plan.signpost;
  assert.ok(Math.abs(hypot(sp, SPAWN) - 2) < 1e-9);
  for (const p of plan.paths) assert.ok(Math.min(...p.points.map((q) => hypot(sp, q))) > 0.9, `${p.id} 와 이정표`);
  for (const o of routingObstacles(layout)) assert.ok(hypot(sp, o) > o.radius + 0.3);
  assert.equal(sp.boards.length, 5);
  for (const b of sp.boards) {
    const p = byId(b.id);
    const lead = resample(p.points, 0.5, 2, 2)[0];
    assert.ok(Math.abs(Math.atan2(lead.z - SPAWN.z, lead.x - SPAWN.x) - b.heading) < 1e-9, b.id);
    assert.equal(b.label, p.label);
  }
  for (const label of ['캠프파이어', '캐치 면접장', '마음 세탁소', '포춘쿠키 상점']) assert.ok(sp.boards.some((b) => b.label === label), label);
});

test('계획은 결정적이고 배치(나무·덤불·바위·통나무)를 바꾸지 않는다', () => {
  assert.deepEqual(buildPathPlan(layout).paths.map((p) => p.points), plan.paths.map((p) => p.points));
  const again = buildLayout(SEED);
  assert.deepEqual(again.trees, layout.trees);
  assert.equal(again.obstacles.length, layout.obstacles.length);
});
