import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildLayout } from '../src/logic/layout.js';
import { YARD, FURNACE, PLAYER, SEED, SPAWN, ZONES, FIRE_ZONE_RADIUS, FIRE_RANGE, SHREDDER_RANGE } from '../src/config.js';
import { headingY } from '../src/logic/movement.js';

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
    ['buildingSlots', 'bushes', 'furnaceItems', 'interactables', 'lanterns', 'obstacles', 'plaza', 'rocks', 'shredder', 'sign', 'trees'],
  );
});

test('걸을 수 있는 영역 안의 나무는 숲 내부 나무뿐: x∈[-11,-2.5], 소각로 4.5 이상, 스폰 2.5 이상', () => {
  assert.ok(interiorTrees.length >= 6, `interior ${interiorTrees.length}`);
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
  assert.ok(interiorTrees.length >= 6 && interiorTrees.length <= 8);
  assert.ok(L.trees.length >= 30 && L.trees.length <= 70, `trees ${L.trees.length}`);
  assert.equal(L.obstacles.filter((o) => o.radius === 0.45).length, 0);
  assert.equal(L.obstacles.filter((o) => o.radius === 0.3).length, 4);
  assert.equal(L.obstacles.filter((o) => o.radius === 0.4).length, interiorTrees.length + L.rocks.length); // 나무·바위
  assert.equal(L.obstacles.filter((o) => o.radius === 0.7).length, 3 + 2 + 1); // 간판 + 벤치 2개 + 파쇄기
  assert.equal(L.obstacles.filter((o) => o.radius === 0.5).length, 3); // 위로 오브젝트
  assert.equal(L.obstacles.length, interiorTrees.length + L.rocks.length + 4 + 3 + 3 + 2 + 1);
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

// 간판 로컬 x축 위의 월드 좌표(three.js 의 rotation.y: 로컬 +x -> (cos, -sin)).
const signPoint = (s, a) => ({ x: s.x + a * Math.cos(s.rotY), z: s.z - a * Math.sin(s.rotY) });

test('간판: 값, 숲 구역, 걸을 수 있는 영역 안, 소각로에서 3 이상', () => {
  const s = L.sign;
  assert.deepEqual(s, {
    x: FURNACE.x, z: FURNACE.z - 4.3, rotY: Math.PI / 4, width: 3.2, height: 1.2, text: 'Catch World', obstacleRadius: 0.7,
  });
  assert.ok(inWalk(s), 'walkable');
  assert.ok(s.x <= ZONES.forestMaxX, 'forest zone');
  assert.ok(d(s, FURNACE) >= 3);
});

test('간판 장애물 3개(가운데 + 양 끝)가 obstacles 에 있고, 판 전체를 덮는다', () => {
  const s = L.sign;
  const half = s.width / 2 - 0.4;
  const expected = [0, -half, half].map((a) => signPoint(s, a));
  for (const e of expected) {
    assert.ok(L.obstacles.some((o) => Math.abs(o.x - e.x) < 1e-9 && Math.abs(o.z - e.z) < 1e-9 && o.radius === 0.7), JSON.stringify(e));
  }
  // 판 위의 모든 점이 어떤 간판 장애물 원 안에 든다(끝으로 통과할 틈이 없다).
  const mine = L.obstacles.filter((o) => o.radius === 0.7 && d(o, s) <= s.width / 2);
  for (let a = -s.width / 2; a <= s.width / 2 + 1e-9; a += 0.1) {
    const p = signPoint(s, a);
    assert.ok(mine.some((o) => d(o, p) <= o.radius), `gap at ${a}`);
  }
  for (const o of [...interiorTrees, ...forestOnly]) assert.ok(d(o, s) >= 2.8, JSON.stringify(o));
  for (const o of mine) assert.ok(d(o, SPAWN) >= o.radius + PLAYER.radius);
  for (const o of mine) assert.ok(Math.abs(o.x) <= WALK && Math.abs(o.z) <= WALK);
});

test('여러 시드에서도 간판 주변 2.8 안에 숲 내부 장식이 없다', () => {
  for (const seed of [1, 2, 3, 42, 777, 20261111]) {
    const l = buildLayout(seed);
    for (const o of [...l.trees.filter(inWalk), ...l.bushes, ...l.rocks]) assert.ok(d(o, l.sign) >= 2.8, `seed ${seed}`);
  }
});

test('나무 크기: 고리 1.8~2.5, 바깥 띠 2.3~3.2, 숲 내부 1.9~2.5', () => {
  for (const t of L.trees) {
    const r = ring(t);
    if (inWalk(t)) assert.ok(t.scale >= 1.9 && t.scale <= 2.5, `interior ${t.scale}`);
    else if (r <= 13.5) assert.ok(t.scale >= 1.8 && t.scale <= 3.2, `ring ${t.scale}`); // 고리 범위는 띠와 겹칠 수 있다
    else assert.ok(t.scale >= 2.3 && t.scale <= 3.2, `band ${t.scale}`);
  }
});

// ---- 상호작용 오브젝트 ----
const comfort = L.interactables.filter((i) => i.kind === 'comfort' || i.kind === 'fortune'); // 위로 오브젝트 3개(작은 푯말은 fortune)
const seats = L.interactables.filter((i) => i.kind === 'seat');
const furnaceI = L.interactables.find((i) => i.id === 'furnace');

test('상호작용 대상 6개: 소각로 + 위로 오브젝트 3개 + 벤치 2개', () => {
  assert.equal(L.interactables.length, 6);
  assert.deepEqual(L.interactables.map((i) => i.id), ['furnace', 'comfort-0', 'comfort-1', 'comfort-2', 'seat-0', 'seat-1']);
  assert.deepEqual(furnaceI, {
    id: 'furnace', label: '소각로', kind: 'furnace', x: FURNACE.x, z: FURNACE.z, radius: FURNACE.radius,
    interactRange: FURNACE.radius + PLAYER.radius + 0.8,
  });
  assert.deepEqual(comfort.map((c) => [c.item.name, c.label, c.x, c.z, c.item.scale]), [
    ['stump_roundDetailed', '쉬어가는 그루터기', -9.0, 5.0, 3.5],
    ['sign', '작은 푯말', 0.8, -6.5, 3.4],
    ['statue_head', '조용한 조각상', 6.0, 9.0, 1.3],
  ]);
});

test('위로 오브젝트: 구역, 걸을 수 있는 영역, 소각로·큰 간판·스폰과의 거리', () => {
  const [forest, buffer, city] = comfort;
  assert.ok(forest.x <= ZONES.forestMaxX, 'forest');
  assert.ok(buffer.x > ZONES.forestMaxX && buffer.x < ZONES.cityMinX, 'buffer');
  assert.ok(city.x >= ZONES.cityMinX, 'city');
  for (const c of comfort) {
    assert.ok(inWalk(c), c.id);
    assert.ok(d(c, FURNACE) >= 3, `${c.id} furnace`);
    assert.ok(d(c, L.sign) >= 2.8, `${c.id} sign`);
    assert.ok(d(c, SPAWN) >= 2.5, `${c.id} spawn`);
    assert.equal(c.item.pack, 'nature');
    assert.deepEqual([c.item.x, c.item.z], [c.x, c.z]);
    assert.ok(Number.isFinite(c.item.rotY));
  }
});

test('위로 오브젝트는 모두 장애물로 등록되어 있다', () => {
  for (const c of comfort) {
    assert.equal(c.radius, 0.5);
    assert.ok(L.obstacles.some((o) => o.x === c.x && o.z === c.z && o.radius === c.radius), c.id);
  }
});

test('상호작용 범위는 반경 + 플레이어 반경보다 크다, 위로 문구는 0,2 · 작은 푯말은 포춘쿠키', () => {
  for (const i of L.interactables) {
    assert.ok(i.interactRange > i.radius + PLAYER.radius, i.id);
    assert.ok(i.interactRange >= i.radius + PLAYER.radius + 0.8 - 1e-9, i.id);
  }
  assert.deepEqual(comfort.map((c) => c.kind), ['comfort', 'fortune', 'comfort']);
  assert.deepEqual(comfort.filter((c) => c.kind === 'comfort').map((c) => c.messageIndex), [0, 2]);
  assert.equal(comfort[1].id, 'comfort-1');
  assert.equal(comfort[1].label, '작은 푯말');
  assert.equal(comfort[1].messageIndex, undefined);
});

test('숲 내부 장식은 위로 오브젝트에서 2.0 이상 떨어져 있다(여러 시드)', () => {
  for (const seed of [1, 2, 3, 42, 777, 20261111]) {
    const l = buildLayout(seed);
    for (const c of l.interactables.filter((i) => i.kind !== 'furnace')) {
      for (const o of [...l.trees.filter(inWalk), ...l.bushes, ...l.rocks]) assert.ok(d(o, c) >= 2.0, `seed ${seed} ${c.id}`);
    }
  }
});

test('상호작용 대상은 시드와 무관하게 같은 위치', () => {
  assert.deepEqual(buildLayout(1).interactables, buildLayout(2).interactables);
});

// ---- 벤치(앉을 자리) ----
const SEEDS = [1, 2, 3, 42, 777, 20261111];
const logs = L.furnaceItems.filter((i) => i.name === 'log');
const toFurnaceHeading = (s) => headingY(s, FURNACE);

test('벤치 2개: furniture/bench 모델, 소각로에서 2.6~3.4, 소각로 쪽을 본다', () => {
  assert.equal(seats.length, 2);
  for (const s of seats) {
    assert.equal(s.label, '벤치');
    assert.equal(s.item.pack, 'furniture');
    assert.equal(s.item.name, 'bench');
    assert.ok(d(s, FURNACE) >= 2.6 && d(s, FURNACE) <= 3.4, `${s.id} ${d(s, FURNACE)}`);
    assert.ok(Math.abs(s.seat.rotY - toFurnaceHeading(s)) < 1e-6, `${s.id} rotY`);
    assert.equal(s.item.rotY, s.seat.rotY);
    assert.equal(s.seat.x, s.x);
    assert.equal(s.seat.z, s.z);
    assert.ok(s.seat.y > 0 && s.seat.y < 1.5, `seat.y ${s.seat.y}`);
    assert.ok(s.item.scale >= 3 && s.item.scale <= 4.5, 'scale'); // 원본 폭 0.4 -> 1.2~1.8
  }
});

test('벤치 모델의 중심(원본 원점은 모서리)이 벤치 위치에 오도록 배치한다', () => {
  for (const s of seats) {
    // 모델 로컬 중심 (0.2, -0.1) 이 rotY 와 scale 로 월드에 놓인 점.
    const lx = 0.2 * s.item.scale;
    const lz = -0.1 * s.item.scale;
    const c = { x: s.item.x + lx * Math.cos(s.item.rotY) + lz * Math.sin(s.item.rotY), z: s.item.z - lx * Math.sin(s.item.rotY) + lz * Math.cos(s.item.rotY) };
    assert.ok(Math.abs(c.x - s.x) < 1e-9 && Math.abs(c.z - s.z) < 1e-9, s.id);
  }
});

test('벤치는 서로 소각로 반대편에 있고 2.5 이상 떨어져 있다', () => {
  const [a, b] = seats;
  assert.ok(d(a, b) >= 2.5, `gap ${d(a, b)}`);
  // 소각로를 사이에 둔다: 소각로 -> 두 벤치의 방향 내적이 음수.
  const dot = (a.x - FURNACE.x) * (b.x - FURNACE.x) + (a.z - FURNACE.z) * (b.z - FURNACE.z);
  assert.ok(dot < 0, 'opposite sides');
});

test('벤치: 통나무·다른 장애물·나무·간판에서 1.5 이상, 걸을 수 있는 영역 안, 스폰과 겹치지 않음', () => {
  for (const s of seats) {
    for (const lg of logs) assert.ok(d(s, lg) >= 1.5, `${s.id} log ${d(s, lg)}`);
    for (const o of L.obstacles) {
      if (o.x === s.x && o.z === s.z) continue; // 자기 자신
      assert.ok(d(s, o) >= 1.5, `${s.id} obstacle ${JSON.stringify(o)}`);
    }
    for (const t of L.trees) assert.ok(d(s, t) >= 1.5, `${s.id} tree`);
    for (const o of [...L.bushes, ...L.rocks]) assert.ok(d(s, o) >= 1.5, `${s.id} bush/rock`);
    assert.ok(d(s, L.sign) >= 1.5 + L.sign.obstacleRadius, `${s.id} sign`);
    assert.ok(inWalk(s), `${s.id} walkable`);
    assert.ok(s.x <= ZONES.forestMaxX, `${s.id} forest zone`);
    assert.ok(d(s, SPAWN) >= s.radius + PLAYER.radius, `${s.id} spawn`);
  }
});

test('벤치는 장애물(반경 0.7)로 등록되고 상호작용 범위가 반경 + 플레이어 반경보다 크다', () => {
  for (const s of seats) {
    assert.equal(s.radius, 0.7);
    assert.ok(L.obstacles.some((o) => o.x === s.x && o.z === s.z && o.radius === 0.7), s.id);
    assert.ok(s.interactRange >= s.radius + PLAYER.radius + 0.8 - 1e-9, s.id);
    assert.equal(s.kind, 'seat');
  }
});

test('벤치 배치는 시드마다 규칙을 지킨다(통나무·나무·간판 1.5 이상, 방향, 거리)', () => {
  for (const seed of SEEDS) {
    const l = buildLayout(seed);
    const ss = l.interactables.filter((i) => i.kind === 'seat');
    const lgs = l.furnaceItems.filter((i) => i.name === 'log');
    assert.equal(ss.length, 2, `seed ${seed}`);
    for (const s of ss) {
      assert.ok(d(s, FURNACE) >= 2.6 && d(s, FURNACE) <= 3.4, `seed ${seed}`);
      assert.ok(Math.abs(s.seat.rotY - headingY(s, FURNACE)) < 1e-6, `seed ${seed}`);
      for (const lg of lgs) assert.ok(d(s, lg) >= 1.5, `seed ${seed} log`);
      for (const t of l.trees) assert.ok(d(s, t) >= 1.5, `seed ${seed} tree`);
      for (const o of [...l.bushes, ...l.rocks]) assert.ok(d(s, o) >= 1.5, `seed ${seed} bush/rock`);
      assert.ok(d(s, l.sign) >= 1.5 + l.sign.obstacleRadius, `seed ${seed} sign`);
    }
    assert.ok(d(ss[0], ss[1]) >= 2.5, `seed ${seed} gap`);
  }
});

test('벤치 위치는 결정적이다', () => {
  assert.deepEqual(buildLayout(SEED).interactables.filter((i) => i.kind === 'seat'), seats);
});

// ---- 파쇄기(소각로 곁의 상시 소품) ----
// 간판은 로컬 x축을 따라 원 3개로 막혀 있다.
const signCircles = (l) => l.obstacles.filter((o) => o.radius === l.sign.obstacleRadius && d(o, l.sign) <= l.sign.width / 2);

function assertShredderRules(l, seed) {
  const { shredder } = l;
  const tag = `seed ${seed}`;
  assert.equal(shredder.radius, 0.7, tag);
  assert.deepEqual(Object.keys(shredder).sort(), ['radius', 'rotY', 'x', 'z'], tag);
  assert.ok(d(shredder, FURNACE) >= 2.6 - 1e-9 && d(shredder, FURNACE) <= 3.2 + 1e-9, `${tag} shredder-furnace ${d(shredder, FURNACE)}`);
  assert.ok(d(shredder, FURNACE) >= FURNACE.radius + shredder.radius - 1e-9, `${tag} shredder overlaps furnace`);
  const walkable = (t) => Math.abs(t.x) <= YARD.width / 2 - (PLAYER.radius + 0.5) && Math.abs(t.z) <= YARD.depth / 2 - (PLAYER.radius + 0.5);
  assert.ok(walkable(shredder), `${tag} walkable`);
  assert.ok(shredder.x <= ZONES.forestMaxX, `${tag} forest zone`);
  assert.ok(d(shredder, SPAWN) >= shredder.radius + PLAYER.radius, `${tag} spawn`);
  for (const it of l.interactables.filter((i) => i.kind !== 'furnace')) assert.ok(d(shredder, it) >= 1.5, `${tag} interactable ${it.id}`);
  for (const lg of l.furnaceItems.filter((i) => i.name === 'log')) assert.ok(d(shredder, lg) >= 1.5, `${tag} log`);
  for (const t of l.trees) assert.ok(d(shredder, t) >= 1.5, `${tag} tree`);
  for (const o of [...l.bushes, ...l.rocks]) assert.ok(d(shredder, o) >= 1.5, `${tag} bush/rock`);
  for (const c of signCircles(l)) assert.ok(d(shredder, c) >= 1.5, `${tag} sign`);
  assert.ok(Math.abs(shredder.rotY - headingY(shredder, FURNACE)) < 1e-9, `${tag} rotY`); // 소각로를 바라본다(벤치와 같은 +z 앞 규칙)
}

test('종이 더미는 없다(layout 키 목록에도, 반경 0.5 장애물에도 위로 오브젝트 말고는 없다)', () => {
  assert.equal(L.obstacles.filter((o) => o.radius === 0.5 && !comfort.some((c) => c.x === o.x && c.z === o.z)).length, 0);
});

test('파쇄기: 기본 시드의 위치는 종이 더미를 없애기 전과 똑같다(고정값)', () => {
  assert.equal(L.shredder.x, -3.409037355874981);
  assert.equal(L.shredder.z, -0.6717790556719336);
  assert.equal(L.shredder.rotY, -1.8325957145940461);
  assert.equal(L.shredder.radius, 0.7);
});

test('파쇄기: 값, 거리, 걸을 수 있는 영역, 소각로를 향함', () => {
  assertShredderRules(L, SEED);
});

test('파쇄기는 obstacles 에 같은 좌표·반경으로 들어 있다', () => {
  assert.ok(L.obstacles.some((o) => o.x === L.shredder.x && o.z === L.shredder.z && o.radius === L.shredder.radius));
});

test('파쇄기 규칙은 여러 시드에서도 유지된다(벤치·통나무·나무는 그대로)', () => {
  for (const seed of SEEDS) assertShredderRules(buildLayout(seed), seed);
});

test('파쇄기 배치는 결정적이다', () => {
  assert.deepEqual(buildLayout(SEED).shredder, buildLayout(SEED).shredder);
  assert.deepEqual(L.shredder, buildLayout(SEED).shredder);
});

test('벤치 위치는 파쇄기를 추가하기 전과 같다(고정값)', () => {
  const near = (a, b) => Math.abs(a - b) < 1e-9;
  assert.equal(seats.length, 2);
  assert.ok(near(seats[0].x, -4.237258300203047) && near(seats[0].z, -3.762741699796952), JSON.stringify(seats[0]));
  assert.ok(near(seats[1].x, -8.762741699796951) && near(seats[1].z, 0.7627416997969525), JSON.stringify(seats[1]));
});

test('서 있을 수 있는 자리: 장애물 밖에서 소각로와 파쇄기 사정거리를 모두 만족하는 점이 있다', () => {
  const all = [FURNACE, ...L.obstacles];
  const free = (p) => all.every((o) => d(p, o) >= o.radius + PLAYER.radius) && inWalk(p);
  let both = 0;
  let shredderOnly = 0;
  for (let x = -12; x <= 0; x += 0.1) {
    for (let z = -8; z <= 6; z += 0.1) {
      const p = { x, z };
      if (!free(p) || d(p, FURNACE) > FIRE_ZONE_RADIUS || d(p, L.shredder) > SHREDDER_RANGE) continue;
      shredderOnly++;
      if (d(p, FURNACE) <= FIRE_RANGE) both++; // 태우기와 파쇄를 모두 할 수 있는 자리
    }
  }
  assert.ok(shredderOnly > 20, `shredder reachable ${shredderOnly}`);
  assert.ok(both > 5, `both ranges ${both}`);
});
