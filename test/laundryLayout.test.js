import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { buildLayout } from '../src/logic/layout.js';
import { FURNACE, PLAYER, SEED, SPAWN, YARD, WASHER_RANGE, CLOTHESLINE_RANGE } from '../src/config.js';
import { stepToward, pushOutOfCircle, clampToYard } from '../src/logic/movement.js';
import { interactTarget } from '../src/logic/interaction.js';

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
const washerCircles = L.washers.map((w) => ({ x: w.x, z: w.z, radius: w.radius }));

// ---- 기존 배치는 그대로 ----
test('세탁소를 추가해도 기존 배치(나무·덤불·바위·랜턴·통나무·간판·파쇄기·상호작용·장애물 24개)는 기본 시드에서 그대로다', () => {
  const before = {
    trees: L.trees, bushes: L.bushes, rocks: L.rocks, lanterns: L.lanterns, furnaceItems: L.furnaceItems, sign: L.sign, shredder: L.shredder,
    interactables: L.interactables.slice(0, 6), obstacles: L.obstacles.slice(0, 24), buildingSlots: L.buildingSlots, plaza: L.plaza,
  };
  assert.equal(createHash('sha1').update(JSON.stringify(before)).digest('hex'), '73346e91207bcfc8d2af940b6d98fb3f57dcbc1f');
  assert.equal(L.interactables.length, 7);
});

test('여러 시드에서도 세탁소는 같은 자리이고(시드 무관), 면접장 터는 비어 있다', () => {
  for (const seed of [1, 2, 42, 777]) {
    const l = buildLayout(seed);
    assert.deepEqual(l.buildings, L.buildings);
    assert.deepEqual(l.washers, L.washers);
    assert.deepEqual(l.clothesline, L.clothesline);
  }
  assert.deepEqual(L.buildings.map((b) => b.id), ['laundry']); // 면접장은 세우지 않는다
  assert.ok(!L.buildings.some((b) => b.id === 'interview'));
});

test('세탁소 배치는 결정적이다', () => {
  assert.deepEqual(buildLayout(SEED).buildings, L.buildings);
  assert.deepEqual(buildLayout(SEED).washers, L.washers);
  assert.deepEqual(buildLayout(SEED).clothesline, L.clothesline);
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

// ---- 세탁기 ----
test('세탁기 3대(washer 2 + dryer 1): 문 앞 1.2~2.4, 서로 0.2 이상, 서쪽(문 쪽)을 향함(앞면 +z 기준 rotY)', () => {
  assert.equal(L.washers.length, 3);
  assert.deepEqual(L.washers.map((w) => w.name).sort(), ['dryer', 'washer', 'washer']);
  const n = front(laundry.rotY);
  for (const w of L.washers) {
    assert.equal(w.pack, 'furniture');
    assert.ok(w.scale > 0 && Number.isFinite(w.rotY) && w.radius > 0);
    assert.ok(w.radius >= 0.55 && w.radius <= 0.65);
    // 문 앞(문에서 건물 밖으로)으로 1.2~2.4 떨어진 줄.
    const along = (w.x - laundry.door.x) * n.x + (w.z - laundry.door.z) * n.z;
    assert.ok(along >= 1.2 && along <= 2.4, `in front ${along}`);
    // 건물 앞면(폭) 앞에 있다.
    assert.ok(Math.abs(w.z - laundry.z) <= laundry.width / 2, `lateral ${w.z}`);
    // 서쪽을 향한다.
    const f = front(w.rotY);
    assert.ok(Math.abs(f.x + 1) < 1e-9 && Math.abs(f.z) < 1e-9, JSON.stringify(f));
  }
  // 줄은 건물 앞면과 평행하다(같은 x).
  const xs = L.washers.map((w) => w.x);
  assert.ok(Math.max(...xs) - Math.min(...xs) < 1e-9);
  for (let i = 0; i < L.washers.length; i++) {
    for (let j = i + 1; j < L.washers.length; j++) {
      const a = L.washers[i];
      const b = L.washers[j];
      assert.ok(d(a, b) - (a.radius + b.radius) >= 0.2 - 1e-9, `gap ${i}-${j}`);
    }
  }
});

test('세탁기는 장애물(원)로 등록되어 있다', () => {
  for (const w of L.washers) {
    assert.ok(L.obstacles.some((o) => o.x === w.x && o.z === w.z && o.radius === w.radius), JSON.stringify(w));
  }
  assert.equal(washerCircles.length, 3);
});

// ---- 빨랫줄 ----
test('빨랫줄: 기둥 두 개 ~3.4 떨어져 높이 ~1.8 줄, 중심은 두 기둥 가운데, 기둥은 장애물(반경 0.25)', () => {
  const c = L.clothesline;
  assert.ok(Math.abs(c.centre.x - (c.x1 + c.x2) / 2) < 1e-9 && Math.abs(c.centre.z - (c.z1 + c.z2) / 2) < 1e-9);
  const len = Math.hypot(c.x2 - c.x1, c.z2 - c.z1);
  assert.ok(Math.abs(len - 3.4) < 0.05, `${len}`);
  assert.ok(c.y >= 1.6 && c.y <= 2.0, `${c.y}`);
  assert.ok(c.postHeight >= 1.9 && c.postHeight <= 2.1 && c.postRadius > 0 && c.slots === 6);
  const posts = circlesOf(0.25);
  assert.equal(posts.length, 2);
  for (const [x, z] of [[c.x1, c.z1], [c.x2, c.z2]]) assert.ok(posts.some((o) => o.x === x && o.z === z), `${x},${z}`);
  // 광장 안, 면접장 터 밖.
  for (const [x, z] of [[c.x1, c.z1], [c.x2, c.z2]]) {
    assert.ok(x > L.plaza.x1 && x < L.plaza.x2 && z > L.plaza.z1 && z < L.plaza.z2);
    const iv = L.buildingSlots.find((s) => s.id === 'interview');
    assert.ok(!(Math.abs(x - iv.x) < iv.width / 2 && Math.abs(z - iv.z) < iv.depth / 2));
  }
});

// ---- 겹침 규칙 ----
test('세탁소 물체들은 랜턴(과 그 장애물)·위로 오브젝트·스폰·서로와 겹치지 않는다', () => {
  const mine = [...buildingCircles, ...washerCircles, ...circlesOf(0.25)];
  const others = L.obstacles.filter((o) => !mine.includes(o) && !washerCircles.some((w) => w.x === o.x && w.z === o.z));
  assert.equal(others.length, 24);
  for (const m of mine) {
    for (const o of others) assert.ok(d(m, o) >= m.radius + o.radius + 0.2, `${JSON.stringify(m)} vs ${JSON.stringify(o)}`);
    assert.ok(d(m, SPAWN) >= m.radius + PLAYER.radius);
  }
  for (const lt of L.lanterns) {
    for (const m of mine) assert.ok(d(m, lt) >= m.radius + 0.3 + 0.2, `lantern ${lt.x},${lt.z} vs ${JSON.stringify(m)}`);
  }
  const lantern6 = L.lanterns.find((l) => l.x === 3.2 && l.z === 6);
  assert.ok(lantern6);
  for (const w of L.washers) assert.ok(d(w, lantern6) >= w.radius + 0.3 + 0.2);
  // 세탁기끼리·기둥과 세탁기는 겹치지 않는다(건물 원과도).
  for (const w of washerCircles) {
    for (const o of [...buildingCircles, ...circlesOf(0.25)]) assert.ok(d(w, o) >= w.radius + o.radius + 0.1);
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
test('서 있을 수 있는 자리: 장애물 밖에서 세탁기(4.0)와 빨랫줄 중심(4.0) 사정거리를 모두 만족하는 점이 넉넉히 있다', () => {
  let both = 0;
  let washOnly = 0;
  let hangOnly = 0;
  for (let x = 0; x <= 12; x += 0.1) {
    for (let z = -4; z <= 11; z += 0.1) {
      const p = { x, z };
      if (!free(p)) continue;
      const wash = L.washers.some((w) => d(p, w) <= WASHER_RANGE);
      const hang = d(p, L.clothesline.centre) <= CLOTHESLINE_RANGE;
      if (wash && hang) both++;
      else if (wash) washOnly++;
      else if (hang) hangOnly++;
    }
  }
  assert.ok(both > 100, `both ${both}`); // 약 1 단위^2 이상(0.1 격자 100칸)
  assert.ok(washOnly > 20 && hangOnly >= 0, `${washOnly}/${hangOnly}`);
});

test('세탁기 앞(서쪽)에서 걸어서 갈 수 있다: 세탁기 서쪽 0.9 떨어진 점과 빨랫줄 옆 점이 장애물 밖', () => {
  for (const w of L.washers) assert.ok(free({ x: w.x - 1.2, z: w.z }), `west of ${w.z}`);
  const c = L.clothesline;
  assert.ok(free({ x: c.centre.x - 1.2, z: c.centre.z }));
  assert.ok(free({ x: c.centre.x + 1.2, z: c.centre.z }));
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

test('걸어서 세탁기를 통과할 수 없다(서쪽에서 세탁기 중심으로)', () => {
  for (const w of L.washers) {
    const path = walk({ x: 3.4, z: w.z }, w);
    const end = path[path.length - 1];
    for (const p of path) assert.ok(d(p, w) >= w.radius + PLAYER.radius - 1e-6, `${w.name} ${JSON.stringify(p)}`);
    assert.ok(d(end, w) >= w.radius + PLAYER.radius - 1e-6);
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
