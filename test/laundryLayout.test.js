import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { buildLayout } from '../src/logic/layout.js';
import { FURNACE, PLAYER, SEED, SPAWN, YARD } from '../src/config.js';
import { stepToward, pushOutOfCircle, clampToYard } from '../src/logic/movement.js';
import { interactTarget, nearestInRange, actionOf } from '../src/logic/interaction.js';
import { arrivalPoint } from '../src/logic/spaces.js';

const L = buildLayout(SEED);
const d = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const [laundry] = L.buildings;
const slot = L.buildingSlots.find((s) => s.id === 'laundry');
const WALK = YARD.width / 2 - (PLAYER.radius + 0.5);
const allObstacles = [FURNACE, ...L.obstacles];
// 플레이어(반경 PLAYER.radius)가 서 있을 수 있는 점: 모든 장애물 원 밖, 걸을 수 있는 영역 안.
const free = (p) => allObstacles.every((o) => d(p, o) >= o.radius + PLAYER.radius) && Math.abs(p.x) <= WALK && Math.abs(p.z) <= WALK;
// 앞(정면) 방향: three.js rotation.y 로 돌린 로컬 +z.
const front = (rotY) => ({ x: Math.sin(rotY), z: Math.cos(rotY) });
// 건물 로컬 점 (lx: 정면 벽을 따라, lz: 앞쪽) -> 월드.
const world = (b, lx, lz) => ({
  x: b.x + lx * Math.cos(b.rotY) + lz * Math.sin(b.rotY),
  z: b.z - lx * Math.sin(b.rotY) + lz * Math.cos(b.rotY),
});
const circlesOf = (r) => L.obstacles.filter((o) => o.radius === r);
const buildingCircles = circlesOf(laundry.obstacleRadius);

// ---- 기존 배치는 그대로 ----
test('세탁소를 추가해도 기존 배치(나무·덤불·바위·랜턴·통나무·간판·파쇄기·상호작용·장애물 24개)는 기본 시드에서 그대로다(세탁기·빨랫줄은 실내로 옮겼다)', () => {
  const before = {
    trees: L.trees, bushes: L.bushes, rocks: L.rocks, lanterns: L.lanterns, furnaceItems: L.furnaceItems, sign: L.sign, shredder: L.shredder,
    interactables: L.interactables.slice(0, 6), obstacles: L.obstacles.slice(0, 24), buildingSlots: L.buildingSlots, plaza: L.plaza,
  };
  assert.equal(createHash('sha1').update(JSON.stringify(before)).digest('hex'), '4ec4555b2e6ee20dad37c176ec6b47e8c9bdf7b9');
  assert.equal(L.interactables.length, 10); // 세탁소 문·면접장 건물·면접장 문이 추가됐다(앞의 6개는 그대로)
});

test('여러 시드에서도 두 건물은 같은 자리이고(시드 무관), 세탁소가 먼저 면접장이 다음이다', () => {
  for (const seed of [1, 2, 42, 777]) {
    const l = buildLayout(seed);
    assert.deepEqual(l.buildings, L.buildings);
  }
  assert.deepEqual(L.buildings.map((b) => b.id), ['laundry', 'interview']); // 면접장 외관이 추가됐다(8b)
});

test('세탁소 배치는 결정적이다', () => {
  assert.deepEqual(buildLayout(SEED).buildings, L.buildings);
  assert.deepEqual(buildLayout(SEED), L);
});

// ---- 건물 ----
test('건물: 세탁소 터(6x6) 안에 완전히 들어간다', () => {
  assert.equal(laundry.id, 'laundry');
  assert.equal(laundry.z, slot.z); // 터의 가운데 줄(남북)에 놓고, 동쪽 쪽으로 붙인다(앞마당을 넓게)
  assert.ok(laundry.x >= slot.x && laundry.x <= slot.x + 1.0, `x ${laundry.x}`);
  for (const [lx, lz] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) {
    const p = world(laundry, lx * laundry.width / 2, lz * laundry.depth / 2);
    assert.ok(p.x >= slot.x - slot.width / 2 - 1e-9 && p.x <= slot.x + slot.width / 2 + 1e-9, `x ${p.x}`);
    assert.ok(p.z >= slot.z - slot.depth / 2 - 1e-9 && p.z <= slot.z + slot.depth / 2 + 1e-9, `z ${p.z}`);
  }
  assert.ok(laundry.width >= 4.5 && laundry.width <= 6 && laundry.depth >= 3.5 && laundry.depth <= 4.5, `${laundry.width}x${laundry.depth}`);
});

test('문은 서쪽(-x)을 향하고, 문이 건물 앞면 벽 위(건물 안쪽 폭 안)에 있다', () => {
  const n = front(laundry.rotY);
  assert.ok(Math.abs(n.x + 1) < 1e-9 && Math.abs(n.z) < 1e-9, JSON.stringify(n));
  const wall = world(laundry, 0, laundry.depth / 2); // 앞면 벽 가운데
  assert.ok(Math.abs(laundry.door.x - wall.x) < 1e-9, 'door on front wall plane');
  assert.ok(Math.abs(laundry.door.z - laundry.z) <= laundry.width / 2 - 0.5, 'door within front wall');
  assert.ok(laundry.door.x < laundry.x, 'west of centre');
});

test('문 앞 1.5 지점은 어떤 장애물과도 겹치지 않는다(플레이어가 설 수 있다)', () => {
  const n = front(laundry.rotY);
  const p = { x: laundry.door.x + n.x * 1.5, z: laundry.door.z + n.z * 1.5 };
  assert.ok(free(p), JSON.stringify(p));
  for (const dist of [0.8, 1.0, 1.2, 1.5, 2.0]) {
    assert.ok(free({ x: laundry.door.x + n.x * dist, z: laundry.door.z + n.z * dist }), `door front ${dist}`);
  }
});

test('건물 장애물: 외곽(벽)을 빈틈없이 덮어 지나갈 수 없고, 벽 안쪽에서 시작해 광장 쪽으로 튀어나오지 않는다', () => {
  assert.ok(buildingCircles.length >= 8, `${buildingCircles.length}`);
  const hw = laundry.width / 2;
  const hd = laundry.depth / 2;
  // 외곽선 위의 모든 점이 어느 원 안에 든다.
  const edge = [];
  for (let t = -hw; t <= hw + 1e-9; t += 0.1) edge.push(world(laundry, t, hd), world(laundry, t, -hd));
  for (let t = -hd; t <= hd + 1e-9; t += 0.1) edge.push(world(laundry, hw, t), world(laundry, -hw, t));
  for (const p of edge) assert.ok(buildingCircles.some((o) => d(o, p) <= o.radius), `gap at ${JSON.stringify(p)}`);
  // 이웃한 원은 플레이어(지름 0.8)가 지나갈 틈이 없게 겹친다: 각 원은 다른 원과 2*반경 이하로 이어져 있다.
  for (const o of buildingCircles) {
    assert.ok(buildingCircles.some((q) => q !== o && d(o, q) <= 2 * o.radius - 0.1), `isolated ${JSON.stringify(o)}`);
  }
  // 원은 터 안에 있다.
  for (const o of buildingCircles) {
    assert.ok(Math.abs(o.x - slot.x) <= slot.width / 2 && Math.abs(o.z - slot.z) <= slot.depth / 2, JSON.stringify(o));
  }
  // 원은 광장 안(x ≥ 2.5)이고 면접장 터와 겹치지 않는다.
  const interview = L.buildingSlots.find((s) => s.id === 'interview');
  for (const o of buildingCircles) assert.ok(Math.abs(o.z - interview.z) >= interview.depth / 2 + o.radius);
});

test('건물 상호작용: kind building, 라벨 세탁소, 반경·범위 규칙, E 동작 없음(별도 테스트)', () => {
  const b = L.interactables.find((i) => i.id === 'laundry');
  assert.ok(b);
  assert.equal(b.kind, 'building');
  assert.equal(b.label, '세탁소');
  assert.ok(b.radius > 0 && b.interactRange >= b.radius + PLAYER.radius + 0.8 - 1e-9);
  assert.equal(b.item, undefined); // 모델 배치는 건물 조립 코드가 한다(상호작용 모델 목록에 넣지 않는다)
  assert.ok(Math.hypot(b.x - laundry.x, b.z - laundry.z) < 1.5, 'near building centre');
  assert.equal(b.radius >= Math.min(laundry.width, laundry.depth) / 2, true); // 호버 판정이 건물 크기를 덮는다
});

// ---- 입구(문) ----
const doorItem = L.interactables.find((i) => i.id === 'laundry-door');

test('세탁기·빨랫줄은 마당(외부)에 없다: 레이아웃에 washers/clothesline 이 없고, 건물 외곽 원 말고는 문 주변에 장애물이 없다', () => {
  assert.equal(L.washers, undefined);
  assert.equal(L.clothesline, undefined);
  assert.equal(L.obstacles.filter((o) => o.radius === 0.6).length, 0); // 세탁기 원
  assert.equal(L.obstacles.filter((o) => o.radius === 0.25).length, 0); // 빨랫줄 기둥
  const n = front(laundry.rotY);
  for (const dist of [1.0, 1.5, 2.0, 2.6, 3.5]) {
    const p = { x: laundry.door.x + n.x * dist, z: laundry.door.z + n.z * dist };
    assert.ok(free(p), `문 앞 ${dist}`);
    if (dist >= 1.5) assert.ok(L.obstacles.every((o) => d(o, p) >= o.radius + PLAYER.radius + 0.3), `문 앞 ${dist} 에 여유`);
  }
});

test('세탁소 문 상호작용: kind door, to laundry, 문 앞(건물 밖)에 있고 범위 규칙을 지키며 E 동작은 들어가기', () => {
  assert.ok(doorItem);
  assert.equal(doorItem.kind, 'door');
  assert.equal(doorItem.to, 'laundry');
  assert.ok(doorItem.label.includes('문'));
  const n = front(laundry.rotY);
  const along = (doorItem.x - laundry.door.x) * n.x + (doorItem.z - laundry.door.z) * n.z;
  assert.ok(along > 0.3 && along < 1.5, `문에서 바깥으로 ${along}`);
  assert.ok(Math.abs((doorItem.x - laundry.door.x) * n.z - (doorItem.z - laundry.door.z) * n.x) < 1e-9, '문과 같은 줄');
  assert.ok(doorItem.interactRange >= doorItem.radius + PLAYER.radius + 0.8 - 1e-9);
  assert.equal(doorItem.item, undefined);
  assert.deepEqual(actionOf(doorItem), { type: 'enter', prompt: '들어가기' });
});

test('문 앞에 서면(클릭해서 도착하는 문 앞 1.5 지점) E 안내가 뜨고, 도착 지점(마당으로 나왔을 때)과 먼 곳에서는 뜨지 않는다', () => {
  const click = interactTarget(L.interactables.find((i) => i.id === 'laundry'));
  assert.equal(nearestInRange(click, L.interactables), doorItem);
  assert.deepEqual(interactTarget(doorItem), click); // 문을 클릭해도 같은 곳으로 걸어간다(자동 진입 없음)
  const a = arrivalPoint('yard', 'laundry');
  assert.equal(nearestInRange(a, L.interactables), null);
  assert.equal(nearestInRange(SPAWN, L.interactables), null);
});

// ---- 실제 이동 규칙(main.js 와 같은 방식)으로 걸어 보기 ----
function walk(from, to, frames = 1500) {
  const pushOut = (p) => {
    for (let pass = 0; pass < 3; pass++) for (const o of allObstacles) p = pushOutOfCircle(p, PLAYER.radius, o);
    return p;
  };
  let pos = { ...from };
  const target = pushOut(clampToYard(to, YARD, PLAYER.radius + 0.5));
  const path = [pos];
  for (let i = 0; i < frames; i++) {
    const step = stepToward(pos, target, PLAYER.speed, 1 / 60);
    pos = pushOut({ x: step.x, z: step.z });
    path.push(pos);
    if (step.arrived) break;
  }
  return path;
}
const insideFootprint = (p) => {
  // 건물 로컬 좌표(정면 벽을 따라 / 앞쪽)로 바꿔 직사각형 안인지 본다.
  const dx = p.x - laundry.x;
  const dz = p.z - laundry.z;
  const lx = dx * Math.cos(laundry.rotY) - dz * Math.sin(laundry.rotY);
  const lz = dx * Math.sin(laundry.rotY) + dz * Math.cos(laundry.rotY);
  return Math.abs(lx) < laundry.width / 2 && Math.abs(lz) < laundry.depth / 2;
};

test('건물 상호작용(호버/클릭)은 그대로 E 동작이 없다', () => {
  assert.equal(actionOf(L.interactables.find((i) => i.id === 'laundry')), null);
});

test('세탁소 외관 물체들은 랜턴(과 그 장애물)·위로 오브젝트·스폰과 겹치지 않는다', () => {
  const mine = buildingCircles;
  const others = L.obstacles.filter((o) => !mine.includes(o) && o.radius !== L.buildings[1].obstacleRadius); // 면접장 외곽 원은 interviewLayout.test.js 에서 본다
  assert.equal(others.length, 24);
  for (const m of mine) {
    for (const o of others) assert.ok(d(m, o) >= m.radius + o.radius + 0.2, `${JSON.stringify(m)} vs ${JSON.stringify(o)}`);
    assert.ok(d(m, SPAWN) >= m.radius + PLAYER.radius);
  }
  for (const lt of L.lanterns) {
    for (const m of mine) assert.ok(d(m, lt) >= m.radius + 0.3 + 0.2, `lantern ${lt.x},${lt.z} vs ${JSON.stringify(m)}`);
  }
});

test('스폰 지점은 여전히 비어 있다', () => {
  assert.ok(free(SPAWN));
  for (const o of L.obstacles) assert.ok(d(o, SPAWN) >= o.radius + PLAYER.radius, JSON.stringify(o));
});

test('모든 장애물 값이 유효하고 마당 + 2 안에 있다', () => {
  for (const o of L.obstacles) {
    assert.ok(Number.isFinite(o.x) && Number.isFinite(o.z) && o.radius > 0);
    assert.ok(Math.abs(o.x) <= YARD.width / 2 + 2 && Math.abs(o.z) <= YARD.depth / 2 + 2);
  }
});

// ---- 서 있을 자리 ----
test('걸어서 건물을 통과할 수 없다: 정면·북쪽·남쪽·동쪽에서 건물 안쪽으로 걸어도 벽에서 멈춘다', () => {
  const c = { x: laundry.x, z: laundry.z };
  const starts = [
    { x: 3.0, z: c.z - 0.2 }, // 서쪽(정면) 쪽
    { x: c.x, z: 0.2 }, // 북쪽
    { x: c.x, z: 11.2 }, // 남쪽
    { x: 11.0, z: c.z }, // 동쪽
  ];
  for (const from of starts) {
    const path = walk(from, c);
    for (const p of path) assert.ok(!insideFootprint(p), `inside from ${JSON.stringify(from)} at ${JSON.stringify(p)}`);
    const end = path[path.length - 1];
    assert.ok(d(end, c) > 1.5, `end ${JSON.stringify(end)}`); // 목표(건물 가운데)에 닿지 못하고 벽에서 멈춘다
  }
});

test('건물을 클릭하면(문 앞 1.5 지점) 스폰에서 걸어서 그 지점에 도착한다', () => {
  const item = L.interactables.find((i) => i.id === 'laundry');
  const target = interactTarget(item);
  const n = front(laundry.rotY);
  assert.ok(Math.abs(target.x - (laundry.door.x + n.x * 1.5)) < 1e-9 && Math.abs(target.z - (laundry.door.z + n.z * 1.5)) < 1e-9);
  const path = walk(SPAWN, target, 3000);
  assert.ok(d(path[path.length - 1], target) < 0.05, JSON.stringify(path[path.length - 1]));
});
