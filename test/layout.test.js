import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildLayout } from '../src/logic/layout.js';
import { YARD, FURNACE, PLAYER, SEED, SPAWN, ZONES } from '../src/config.js';

const L = buildLayout(SEED);
const WALK = YARD.width / 2 - (PLAYER.radius + 0.5);
const d = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const ring = (t) => Math.max(Math.abs(t.x), Math.abs(t.z));
const inWalk = (t) => Math.abs(t.x) <= WALK && Math.abs(t.z) <= WALK;
const interiorTrees = L.trees.filter(inWalk);
const ringTrees = L.trees.filter((t) => ring(t) >= 11.8 && ring(t) <= 13.5);
const forestOnly = [...L.bushes, ...L.rocks];
const insidePlaza = (o) => o.x > L.plaza.x1 && o.x < L.plaza.x2 && o.z > L.plaza.z1 && o.z < L.plaza.z2;

test('같은 시드는 같은 배치, 다른 시드는 다른 배치', () => {
  assert.deepEqual(buildLayout(1), buildLayout(1));
  assert.notDeepEqual(buildLayout(1), buildLayout(2));
});

test('없앤 항목은 결과에 없다', () => {
  for (const k of ['pathTiles', 'obelisks', 'pond', 'pondLilies', 'pondRocks', 'flowers', 'grass', 'plants']) {
    assert.equal(L[k], undefined, k);
  }
  assert.deepEqual(
    Object.keys(L).sort(),
    ['buildingSlots', 'bushes', 'furnaceItems', 'lanterns', 'obstacles', 'plaza', 'rocks', 'trees'],
  );
});

test('걸을 수 있는 영역 안의 나무는 숲 내부 나무뿐: x∈[-11,-2.5], 소각로 4.5 이상, 스폰 2.5 이상', () => {
  assert.ok(interiorTrees.length >= 10, `interior ${interiorTrees.length}`);
  for (const t of interiorTrees) {
    assert.ok(t.x >= -11 && t.x <= -2.5, `x ${t.x}`);
    assert.ok(d(t, FURNACE) >= 4.5, 'furnace');
    assert.ok(d(t, SPAWN) >= 2.5, 'spawn');
  }
});

test('경계 나무와 바깥 띠 범위', () => {
  const outside = L.trees.filter((t) => !inWalk(t));
  assert.ok(outside.length >= 20);
  for (const t of outside) assert.ok(ring(t) >= 11.8 && ring(t) <= 22, JSON.stringify(t));
  for (const t of outside) assert.ok(ring(t) > WALK);
});

test('경계 고리 나무는 서쪽이 도시(동쪽)보다 확실히 많다', () => {
  const ringOnly = ringTrees.filter((t) => !inWalk(t));
  const west = ringOnly.filter((t) => t.x < 0).length;
  const east = ringOnly.filter((t) => t.x > ZONES.cityMinX).length;
  assert.ok(west > east, `west ${west} east ${east}`);
  assert.ok(west >= 2 * east, `west ${west} east ${east}`);
});

test('바깥 띠도 도시 쪽(x>4)이 더 성기다', () => {
  const band = L.trees.filter((t) => ring(t) > 13.5);
  const west = band.filter((t) => t.x < -4).length;
  const east = band.filter((t) => t.x > 4).length;
  assert.ok(west > east, `west ${west} east ${east}`);
});

test('나무·덤불·바위는 광장과 완충 구역 안에 없다', () => {
  for (const o of [...L.trees, ...forestOnly]) assert.ok(!insidePlaza(o), `plaza ${JSON.stringify(o)}`);
  for (const o of [...interiorTrees, ...forestOnly]) {
    assert.ok(o.x <= ZONES.forestMaxX - 1 + 1e-9, `buffer ${JSON.stringify(o)}`);
    assert.ok(Math.abs(o.x) <= WALK && Math.abs(o.z) <= WALK);
  }
});

test('덤불과 작은 바위: 숲 구역, 소각로 3.2 이상', () => {
  assert.ok(L.bushes.length >= 4 && L.bushes.length <= 6, `bushes ${L.bushes.length}`);
  assert.ok(L.rocks.length >= 2 && L.rocks.length <= 3, `rocks ${L.rocks.length}`);
  for (const o of forestOnly) assert.ok(d(o, FURNACE) >= 3.2, 'furnace');
  for (const r of L.rocks) assert.match(r.name, /^rock_small[ABC]$/);
});

test('랜턴은 정확히 4개, x=3.2, z=-6,-2,2,6', () => {
  assert.equal(L.lanterns.length, 4);
  assert.deepEqual(L.lanterns.map((l) => [l.x, l.z]), [[3.2, -6], [3.2, -2], [3.2, 2], [3.2, 6]]);
});

test('건물 터 2개: 광장 안에 완전히 들어가고 서로 겹치지 않는다', () => {
  assert.deepEqual(L.plaza, { x1: 2.5, x2: 12, z1: -12, z2: 12 });
  assert.deepEqual(L.buildingSlots.map((s) => s.id), ['interview', 'laundry']);
  for (const s of L.buildingSlots) {
    assert.ok(s.x - s.width / 2 >= L.plaza.x1 && s.x + s.width / 2 <= L.plaza.x2, s.id);
    assert.ok(s.z - s.depth / 2 >= L.plaza.z1 && s.z + s.depth / 2 <= L.plaza.z2, s.id);
  }
  const [a, b] = L.buildingSlots;
  const overlap = Math.abs(a.x - b.x) < (a.width + b.width) / 2 && Math.abs(a.z - b.z) < (a.depth + b.depth) / 2;
  assert.ok(!overlap);
});

test('소각로는 숲 구역에 있고 둘레 장식이 있다', () => {
  assert.ok(FURNACE.x <= ZONES.forestMaxX);
  assert.equal(L.furnaceItems.length, 3);
  const [fire, ...logs] = L.furnaceItems;
  assert.equal(fire.name, 'campfire_stones');
  assert.deepEqual([fire.x, fire.z, fire.scale], [FURNACE.x, FURNACE.z, 4.4]);
  for (const it of logs) {
    assert.equal(it.name, 'log');
    assert.ok(d(it, FURNACE) >= 2.0 - 1e-9 && d(it, FURNACE) <= 2.4 + 1e-9);
  }
});

test('스폰 지점은 어떤 장애물과도, 소각로와도 겹치지 않는다', () => {
  for (const o of L.obstacles) assert.ok(d(o, SPAWN) >= o.radius + PLAYER.radius, JSON.stringify(o));
  assert.ok(d(FURNACE, SPAWN) >= FURNACE.radius + PLAYER.radius);
  assert.ok(SPAWN.x > ZONES.forestMaxX && SPAWN.x < ZONES.cityMinX, 'buffer');
});

test('장애물은 마당 + 2 안에 있고 값이 유효', () => {
  for (const o of L.obstacles) {
    assert.ok(Number.isFinite(o.x) && Number.isFinite(o.z) && o.radius > 0);
    assert.ok(Math.abs(o.x) <= YARD.width / 2 + 2 && Math.abs(o.z) <= YARD.depth / 2 + 2);
  }
});

test('개수와 장애물', () => {
  assert.ok(interiorTrees.length >= 10 && interiorTrees.length <= 14);
  assert.ok(L.trees.length >= 40 && L.trees.length <= 90, `trees ${L.trees.length}`);
  assert.ok(L.obstacles.filter((o) => o.radius === 0.45).length >= 10);
  assert.equal(L.obstacles.filter((o) => o.radius === 0.45).length, interiorTrees.length);
  assert.equal(L.obstacles.filter((o) => o.radius === 0.3).length, 4);
  assert.equal(L.obstacles.filter((o) => o.radius === 0.4).length, L.rocks.length);
  assert.equal(L.obstacles.length, interiorTrees.length + L.rocks.length + 4);
  // 소각로 원은 obstacles 에 들어가지 않는다(이동 코드가 따로 처리).
  assert.ok(!L.obstacles.some((o) => o.x === FURNACE.x && o.z === FURNACE.z));
});

test('모든 아이템은 pack,name,scale,rotY 를 가진다', () => {
  for (const k of ['trees', 'bushes', 'rocks', 'lanterns', 'furnaceItems']) {
    for (const it of L[k]) {
      assert.ok(it.pack && it.name && it.scale > 0 && Number.isFinite(it.rotY) && Number.isFinite(it.x) && Number.isFinite(it.z), k);
    }
  }
});

test('여러 시드에서도 규칙이 유지된다', () => {
  for (const seed of [1, 2, 3, 42, 777, 20261111]) {
    const l = buildLayout(seed);
    for (const t of l.trees.filter(inWalk)) {
      assert.ok(t.x >= -11 && t.x <= -2.5 && d(t, FURNACE) >= 4.5 && d(t, SPAWN) >= 2.5, `seed ${seed}`);
    }
    for (const o of [...l.bushes, ...l.rocks]) assert.ok(o.x <= -2.5 && d(o, FURNACE) >= 3.2, `seed ${seed}`);
  }
});
