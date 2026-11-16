import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
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
    ['buildingSlots', 'buildings', 'bushes', 'furnaceItems', 'interactables', 'lanterns', 'obstacles', 'plaza', 'rocks', 'shredder', 'sign', 'trees'],
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
  assert.equal(L.furnaceItems.length, 1); // 장식 나무토막은 통나무 자리 6개가 대신한다
  const [fire] = L.furnaceItems;
  assert.equal(fire.name, 'campfire_stones');
  assert.deepEqual([fire.x, fire.z, fire.scale], [FURNACE.x, FURNACE.z, 4.4]);
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
  assert.equal(L.obstacles.filter((o) => o.radius === 0.7).length, 3 + 1); // 간판 + 파쇄기
  assert.equal(L.obstacles.filter((o) => o.radius === 0.5).length, 3 + 12); // 위로 오브젝트 + 통나무 자리 6개(양 끝 원 2개씩)
  // 세탁소 건물 외곽 원의 장애물은 따로 센다(laundryLayout.test.js). 세탁기·빨랫줄은 실내(interiors.test.js)로 옮겼다.
  const laundryR = L.buildings.map((b) => b.obstacleRadius); // 세탁소 + 면접장 외곽 원
  const laundryCount = L.obstacles.filter((o) => laundryR.includes(o.radius)).length;
  assert.ok(laundryCount >= 8);
  assert.equal(L.obstacles.length - laundryCount, interiorTrees.length + L.rocks.length + 4 + 3 + 3 + 12 + 1);
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

test('상호작용 대상 14개: 소각로 + 위로 오브젝트 3개 + 통나무 자리 6개 + 세탁소 건물·문 + 면접장 건물·문', () => {
  assert.equal(L.interactables.length, 14);
  assert.deepEqual(L.interactables.map((i) => i.id), ['furnace', 'comfort-0', 'comfort-1', 'comfort-2', 'seat-0', 'seat-1', 'seat-2', 'seat-3', 'seat-4', 'seat-5', 'laundry', 'laundry-door', 'interview', 'interview-door']);
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
    for (const c of l.interactables.filter((i) => i.kind !== 'furnace' && i.kind !== 'seat')) { // 통나무 자리는 따로(아래)
      for (const o of [...l.trees.filter(inWalk), ...l.bushes, ...l.rocks]) assert.ok(d(o, c) >= 2.0, `seed ${seed} ${c.id}`);
    }
  }
});

test('상호작용 대상은 시드와 무관하게 같은 위치', () => {
  const fixedOnly = (l) => l.interactables.filter((i) => i.kind !== 'seat'); // 통나무 자리는 시드로 조금씩 흔들린다
  assert.deepEqual(fixedOnly(buildLayout(1)), fixedOnly(buildLayout(2)));
});

// ---- 통나무 자리 6개(앉을 자리) ----
const SEEDS = [1, 2, 3, 42, 777, 20261111];
const itemAxis = (s) => ({ x: Math.cos(s.item.rotY), z: -Math.sin(s.item.rotY) }); // 통나무 길이 방향(모델 로컬 x)

// 통나무 자리 규칙(시드 공통): 6개, 소각로에서 3.0~3.4, 소각로를 바라보고, 서로 1.4 이상, 나무·간판·파쇄기·스폰과 겹치지 않고, 걸어 들어갈 틈이 있다.
function assertLogSeatRules(l, seed) {
  const tag = `seed ${seed}`;
  const ss = l.interactables.filter((i) => i.kind === 'seat');
  assert.equal(ss.length, 6, tag);
  assert.deepEqual(ss.map((s) => s.id), ['seat-0', 'seat-1', 'seat-2', 'seat-3', 'seat-4', 'seat-5'], tag);
  for (const s of ss) {
    assert.equal(s.label, '통나무 의자', tag);
    assert.equal(s.item.pack, 'nature', tag);
    assert.equal(s.item.name, 'log_large', tag);
    assert.ok(d(s, FURNACE) >= 3.0 - 1e-9 && d(s, FURNACE) <= 3.4 + 1e-9, `${tag} ${s.id} ${d(s, FURNACE)}`);
    assert.ok(Math.abs(s.seat.rotY - headingY(s, FURNACE)) < 1e-9, `${tag} ${s.id} rotY`);
    assert.deepEqual([s.seat.x, s.seat.z], [s.x, s.z], tag);
    assert.deepEqual([s.item.x, s.item.z], [s.x, s.z], tag); // 모델 원점은 통나무 중심
    assert.ok(s.item.scale >= 1.5 && s.item.scale <= 1.8, `${tag} scale`);
    assert.ok(s.seat.y > 0.3 * s.item.scale && s.seat.y <= 0.4167 * s.item.scale, `${tag} seat.y ${s.seat.y}`); // 통나무 위(높이 0.4167 x 배율, 약간 눌러 앉음)
    // 통나무 길이 방향은 소각로를 둘러싼 고리의 접선(기울기 0.15 라디안 이내)이다.
    const ax = itemAxis(s);
    const radial = { x: (s.x - FURNACE.x) / d(s, FURNACE), z: (s.z - FURNACE.z) / d(s, FURNACE) };
    assert.ok(Math.abs(ax.x * radial.x + ax.z * radial.z) < Math.sin(0.15) + 1e-9, `${tag} ${s.id} tangent`);
    // 일어서는 자리: 고리 바깥쪽(소각로 반대편)으로 1.1
    assert.ok(Math.abs(d(s.seat.stand, s) - 1.1) < 1e-9 && d(s.seat.stand, FURNACE) > d(s, FURNACE), `${tag} ${s.id} stand outside`);
    assert.ok(s.interactRange >= s.radius + PLAYER.radius + 0.8 - 1e-9, tag);
    assert.ok(inWalk(s), `${tag} walkable`);
    assert.ok(s.x <= ZONES.forestMaxX, `${tag} forest zone`);
    assert.ok(d(s, SPAWN) >= 3, `${tag} spawn`);
    assert.ok(d(s, l.shredder) >= 3, `${tag} shredder`);
    for (const c of signCircles(l)) assert.ok(d(s, c) >= 1.4, `${tag} ${s.id} sign`);
    for (const t of l.trees) assert.ok(d(s, t) >= 1.6 - 1e-9, `${tag} ${s.id} tree`);
    for (const o of [...l.bushes, ...l.rocks]) assert.ok(d(s, o) >= 1.4 - 1e-9, `${tag} ${s.id} bush/rock`);
  }
  // 앉은 사람끼리 겹치지 않는다: 모든 쌍이 1.4 이상 떨어져 있다.
  for (let i = 0; i < ss.length; i++) for (let j = i + 1; j < ss.length; j++) assert.ok(d(ss[i], ss[j]) >= 1.4, `${tag} seats ${i}-${j} ${d(ss[i], ss[j])}`);
  // 걸어 들어갈 틈: 스폰 방향·파쇄기 방향(남동쪽)과 간판 방향(북쪽, -90도)에는 통나무가 없다.
  const angOf = (p) => (Math.atan2(p.z - FURNACE.z, p.x - FURNACE.x) * 180) / Math.PI;
  const angDist = (a, b) => Math.abs(((a - b + 540) % 360) - 180);
  for (const s of ss) {
    assert.ok(angDist(angOf(s), angOf(SPAWN)) >= 20, `${tag} ${s.id} spawn gap`);
    if (seed === SEED) assert.ok(angDist(angOf(s), angOf(l.shredder)) >= 20, `${tag} ${s.id} shredder gap`); // 파쇄기 자리는 시드마다 다르다: 통로는 기본 시드에서만 보장한다
    assert.ok(angDist(angOf(s), -90) >= 40, `${tag} ${s.id} north gap`);
  }
}

test('통나무 자리 6개: nature/log_large, 소각로 둘레 3.0~3.4, 소각로를 보고 접선 방향으로 누워 있다', () => {
  assert.equal(seats.length, 6);
  assertLogSeatRules(L, SEED);
});

test('통나무 자리 규칙은 여러 시드에서도 유지된다(걸어 들어갈 틈 포함)', () => {
  for (const seed of SEEDS) assertLogSeatRules(buildLayout(seed), seed);
});

test('통나무 자리: 길이 방향 양 끝에 반경 0.5 장애물 원 2개씩(지나갈 수 없다)', () => {
  for (const s of seats) {
    const ax = itemAxis(s);
    const half = (s.item.scale * 1.0) / 2 - 0.5;
    for (const sgn of [-1, 1]) assert.ok(L.obstacles.some((o) => o.radius === 0.5 && Math.abs(o.x - (s.x + ax.x * half * sgn)) < 1e-9 && Math.abs(o.z - (s.z + ax.z * half * sgn)) < 1e-9), `${s.id} end ${sgn}`);
  }
});

test('통나무 자리는 스폰-불 직선과 불-파쇄기 직선에서 1.5 이상 떨어져 있다(corridors.test.js 가 서 있는 자리끼리 통로를 따로 본다)', () => {
  const seg = (a, b, p) => {
    const vx = b.x - a.x;
    const vz = b.z - a.z;
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * vx + (p.z - a.z) * vz) / (vx * vx + vz * vz)));
    return Math.hypot(a.x + vx * t - p.x, a.z + vz * t - p.z);
  };
  for (const s of seats) {
    assert.ok(seg(SPAWN, FURNACE, s) >= 1.5, `${s.id} spawn-fire`);
    assert.ok(seg(L.shredder, FURNACE, s) >= 1.5, `${s.id} shredder-fire`);
  }
});

test('통나무 자리 위치는 결정적이다', () => {
  assert.deepEqual(buildLayout(SEED).interactables.filter((i) => i.kind === 'seat'), seats);
});

test('마당 나무·바위·파쇄기 배치는 통나무 자리를 넣기 전과 같다(시드 흐름 유지; 통나무와 겹친 덤불·바위만 치워질 수 있다)', () => {
  const sha = createHash('sha1').update(JSON.stringify({ trees: L.trees, rocks: L.rocks, shredder: L.shredder })).digest('hex');
  assert.equal(sha, '519ed35aee17e1150fae640e9aeae6aa893117c6');
});

// ---- 파쇄기(소각로 곁의 상시 소품) ----
// 간판은 로컬 x축을 따라 원 3개로 막혀 있다.
const signCircles = (l) => l.obstacles.filter((o) => o.radius === l.sign.obstacleRadius && d(o, l.sign) <= l.sign.width / 2);

function assertShredderRules(l, seed) {
  const { shredder } = l;
  const tag = `seed ${seed}`;
  assert.equal(shredder.radius, 0.7, tag);
  assert.deepEqual(Object.keys(shredder).sort(), ['radius', 'rotY', 'stand', 'x', 'z'], tag);
  const df = d(shredder, FURNACE);
  assert.ok(df >= 6.0 - 1e-9 && df <= 8.0 + 1e-9, `${tag} shredder-furnace ${df}`); // 소각로와 따로 떨어져 있다(6~8단위)
  const walkable = (t) => Math.abs(t.x) <= YARD.width / 2 - (PLAYER.radius + 0.5) && Math.abs(t.z) <= YARD.depth / 2 - (PLAYER.radius + 0.5);
  assert.ok(walkable(shredder), `${tag} walkable`);
  assert.ok(shredder.x <= ZONES.forestMaxX, `${tag} forest zone`);
  assert.ok(d(shredder, SPAWN) >= shredder.radius + PLAYER.radius, `${tag} spawn`);
  for (const it of l.interactables.filter((i) => i.kind !== 'furnace')) assert.ok(d(shredder, it) >= 1.5, `${tag} interactable ${it.id}`);
  for (const t of l.trees) assert.ok(d(shredder, t) >= 1.5, `${tag} tree`);
  for (const o of [...l.bushes, ...l.rocks]) assert.ok(d(shredder, o) >= 1.5, `${tag} bush/rock`);
  for (const c of signCircles(l)) assert.ok(d(shredder, c) >= 1.5, `${tag} sign`);
  assert.ok(Math.abs(shredder.rotY - headingY(shredder, SPAWN)) < 1e-9, `${tag} rotY`); // 정면(+z)이 스폰 쪽(플레이어가 오는 길)
  // 작업 자리: 정면으로 1.1 나온 곳, 파쇄기를 바라보고 서며(rotY + π), 마당 안이고 파쇄기 구역 안이다.
  const { stand } = shredder;
  assert.ok(Math.abs(d(stand, shredder) - 1.1) < 1e-9, `${tag} stand distance`);
  assert.ok(Math.abs(Math.sin(stand.rotY) - (shredder.x - stand.x) / 1.1) < 1e-9 && Math.abs(Math.cos(stand.rotY) - (shredder.z - stand.z) / 1.1) < 1e-9, `${tag} stand faces shredder`);
  assert.ok(walkable(stand), `${tag} stand walkable`);
  assert.ok(d(stand, shredder) >= shredder.radius + PLAYER.radius - 1e-9, `${tag} stand outside shredder`);
}

test('종이 더미는 없다(layout 키 목록에도, 반경 0.5 장애물에도 위로 오브젝트 말고는 없다)', () => {
  assert.equal(L.obstacles.filter((o) => o.radius === 0.5 && !comfort.some((c) => c.x === o.x && c.z === o.z) && !seats.some((l) => d(l, o) <= 1.0)).length, 0); // 통나무 자리의 양 끝 원은 제외
});

test('파쇄기: 기본 시드의 위치는 소각로에서 6~8단위 떨어진 남쪽 숲 자리의 고정값(정면은 스폰 쪽)', () => {
  assert.equal(L.shredder.x, -4.8574976425397);
  assert.equal(L.shredder.z, 6.227366045797065);
  assert.equal(L.shredder.rotY, 2.1572344290438976);
  assert.equal(L.shredder.radius, 0.7);
  assert.deepEqual(L.shredder.stand, { x: -3.941288827181128, z: 5.618628494253509, rotY: 5.298827082633691 });
});

test('파쇄기: 값, 소각로와의 거리, 걸을 수 있는 영역, 스폰 쪽 정면과 작업 자리', () => {
  assertShredderRules(L, SEED);
});

test('파쇄기는 obstacles 에 같은 좌표·반경으로 들어 있다', () => {
  assert.ok(L.obstacles.some((o) => o.x === L.shredder.x && o.z === L.shredder.z && o.radius === L.shredder.radius));
});

test('파쇄기 규칙은 여러 시드에서도 유지된다', () => {
  for (const seed of SEEDS) assertShredderRules(buildLayout(seed), seed);
});

test('파쇄기 배치는 결정적이다', () => {
  assert.deepEqual(buildLayout(SEED).shredder, buildLayout(SEED).shredder);
  assert.deepEqual(L.shredder, buildLayout(SEED).shredder);
});

test('서 있을 수 있는 자리: 파쇄기 구역 안에서 장애물 밖에 설 수 있는 점이 충분하고 작업 자리는 소각로(태우기) 범위 밖이다', () => {
  const all = [FURNACE, ...L.obstacles];
  const free = (p) => all.every((o) => d(p, o) >= o.radius + PLAYER.radius) && inWalk(p);
  let shredderZone = 0;
  let overlap = 0;
  for (let x = -12; x <= 2; x += 0.1) {
    for (let z = -8; z <= 10; z += 0.1) {
      const p = { x, z };
      if (!free(p) || d(p, L.shredder) > SHREDDER_RANGE) continue;
      shredderZone++;
      if (d(p, FURNACE) <= FIRE_RANGE) overlap++; // 태우기 범위와 겹치는 자리
    }
  }
  assert.ok(shredderZone > 20, `shredder reachable ${shredderZone}`);
  assert.equal(overlap, 0, '소각로와 파쇄기는 서로 범위가 겹치지 않을 만큼 떨어져 있다');
  assert.ok(d(L.shredder.stand, L.shredder) <= SHREDDER_RANGE && d(L.shredder.stand, FURNACE) > FIRE_ZONE_RADIUS);
  assert.ok(free(L.shredder.stand), '작업 자리에 설 수 있다');
});
