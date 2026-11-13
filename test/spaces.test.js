import test from 'node:test';
import assert from 'node:assert/strict';
import { SPACES, spaceAt, clampToSpace, arrivalPoint } from '../src/logic/spaces.js';
import { buildLayout } from '../src/logic/layout.js';
import { buildLaundryInterior } from '../src/logic/interiors.js';
import { FURNACE, PLAYER, SEED, SPAWN, YARD, LAUNDRY_INTERIOR } from '../src/config.js';

const L = buildLayout(SEED);
const I = buildLaundryInterior();
const d = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const inside = (p, b, m = 0) => p.x >= b.minX + m && p.x <= b.maxX - m && p.z >= b.minZ + m && p.z <= b.maxZ - m;
const WALK_MARGIN = PLAYER.radius + 0.5;

test('SPACES: yard(원점)와 laundry·interview(멀리 떨어진 실내) 세 공간', () => {
  assert.deepEqual(Object.keys(SPACES).sort(), ['interview', 'laundry', 'yard']);
  assert.deepEqual(SPACES.yard.origin, { x: 0, z: 0 });
  assert.deepEqual(SPACES.laundry.origin, LAUNDRY_INTERIOR.origin);
  assert.ok(SPACES.laundry.origin.x >= 200, '마당의 안개·그림자와 겹치지 않을 만큼 멀다');
  for (const s of Object.values(SPACES)) {
    assert.ok(s.bounds.minX < s.bounds.maxX && s.bounds.minZ < s.bounds.maxZ, s.id);
  }
  // 마당 범위는 YARD 크기와 같고, 실내 범위는 방 크기와 같다.
  assert.deepEqual(SPACES.yard.bounds, { minX: -YARD.width / 2, maxX: YARD.width / 2, minZ: -YARD.depth / 2, maxZ: YARD.depth / 2 });
  assert.deepEqual(SPACES.laundry.bounds, I.bounds);
  // 두 공간의 범위는 서로 한참 떨어져 있다.
  assert.ok(SPACES.laundry.bounds.minX - SPACES.yard.bounds.maxX > 100);
});

test('spaceAt: 마당 안·실내 안·여유 안쪽 밖·아주 먼 곳', () => {
  assert.equal(spaceAt({ x: 0, z: 3 }), 'yard');
  assert.equal(spaceAt(SPAWN), 'yard');
  assert.equal(spaceAt({ x: 11.9, z: -11.9 }), 'yard');
  assert.equal(spaceAt({ x: 300, z: 0 }), 'laundry');
  assert.equal(spaceAt({ x: 295.5, z: 2, y: 0 }), 'laundry');
  assert.equal(spaceAt({ x: 306.5, z: 5.5 }), 'laundry'); // 벽 바로 밖(여유 안)
  assert.equal(spaceAt({ x: 13, z: 0 }), 'yard'); // 마당 가장자리 바로 밖
});

test('spaceAt: 어느 공간도 아닌 곳은 가장 가까운 공간(같으면 마당)', () => {
  assert.equal(spaceAt({ x: 100, z: 0 }), 'yard'); // 마당까지 88, 실내까지 194
  assert.equal(spaceAt({ x: 250, z: 0 }), 'laundry');
  assert.equal(spaceAt({ x: 300, z: 500 }), 'laundry');
  assert.equal(spaceAt({ x: -1000, z: 0 }), 'yard');
  assert.equal(spaceAt({ x: 156, z: 0 }), 'laundry'); // 마당까지 144, 실내까지 138
  assert.equal(spaceAt({ x: 153, z: 0 }), 'yard'); // 정확히 같은 거리(141)는 마당
});

test('clampToSpace: 마당은 기존 clampToYard 와 같고 실내는 실내 범위 안으로', () => {
  assert.deepEqual(clampToSpace({ x: 50, z: -50 }, 'yard', WALK_MARGIN), { x: 12 - WALK_MARGIN, z: -(12 - WALK_MARGIN) });
  assert.deepEqual(clampToSpace({ x: 1, z: 2 }, 'yard', WALK_MARGIN), { x: 1, z: 2 });
  const p = clampToSpace({ x: 0, z: 0 }, 'laundry', WALK_MARGIN); // 마당 좌표는 실내로 끌려 들어온다
  assert.deepEqual(p, { x: I.bounds.minX + WALK_MARGIN, z: 0 });
  assert.deepEqual(clampToSpace({ x: 999, z: 999 }, 'laundry', 0), { x: I.bounds.maxX, z: I.bounds.maxZ });
  assert.deepEqual(clampToSpace({ x: 300, z: 0 }, 'laundry', 1), { x: 300, z: 0 });
  assert.deepEqual(clampToSpace({ x: -999, z: -999 }, 'laundry', 1), { x: I.bounds.minX + 1, z: I.bounds.minZ + 1 });
});

test('clampToSpace: 모르는 공간은 오류', () => {
  assert.throws(() => clampToSpace({ x: 0, z: 0 }, 'nowhere', 0), /nowhere/);
  assert.throws(() => arrivalPoint('nowhere'), /nowhere/);
});

test('arrivalPoint(laundry, yard): 실내 범위 안, 모든 실내 장애물 밖, 걸을 수 있는 영역 안, 동쪽(방 안쪽)을 본다', () => {
  const a = arrivalPoint('laundry', 'yard');
  assert.ok(inside(a, I.bounds, WALK_MARGIN), JSON.stringify(a));
  for (const o of I.obstacles) assert.ok(d(a, o) >= o.radius + PLAYER.radius, JSON.stringify(o));
  assert.equal(spaceAt(a), 'laundry');
  assert.ok(Math.abs(Math.sin(a.rotY) - 1) < 1e-9, '동쪽(+x)을 본다');
  assert.deepEqual({ x: a.x, z: a.z }, { x: I.arrival.x, z: I.arrival.z });
});

test('arrivalPoint(yard, laundry): 마당 안 광장, 모든 마당 장애물 밖, 건물 문 앞에서 건물을 등지고 선다', () => {
  const a = arrivalPoint('yard', 'laundry');
  const [b] = L.buildings;
  assert.ok(inside(a, SPACES.yard.bounds, WALK_MARGIN), JSON.stringify(a));
  for (const o of [FURNACE, ...L.obstacles]) assert.ok(d(a, o) >= o.radius + PLAYER.radius, JSON.stringify(o));
  assert.equal(spaceAt(a), 'yard');
  assert.ok(d(a, b.door) <= 3 && d(a, b.door) >= 1, `문에서 ${d(a, b.door)}`);
  const f = { x: Math.sin(a.rotY), z: Math.cos(a.rotY) }; // 바라보는 방향
  const away = { x: a.x - b.door.x, z: a.z - b.door.z }; // 문에서 나온 방향
  assert.ok(f.x * away.x + f.z * away.z > 0, '건물을 등지고(= 바깥쪽을 보고) 선다');
  assert.ok(a.x < b.x, '문 앞 광장(건물 서쪽)');
});

test('arrivalPoint: 출처를 모르면 각 공간의 기본 출발점(마당 = SPAWN, 실내 = 출입문 안쪽)', () => {
  assert.deepEqual({ x: arrivalPoint('yard').x, z: arrivalPoint('yard').z }, SPAWN);
  assert.deepEqual(arrivalPoint('laundry'), arrivalPoint('laundry', 'yard'));
  assert.deepEqual(arrivalPoint('yard', 'yard'), arrivalPoint('yard'));
  for (const id of Object.keys(SPACES)) assert.ok(Number.isFinite(arrivalPoint(id).rotY));
});

test('arrivalPoint 는 새 객체를 돌려준다(바꿔도 원본에 영향 없음)', () => {
  const a = arrivalPoint('laundry', 'yard');
  a.x = -1;
  assert.notEqual(arrivalPoint('laundry', 'yard').x, -1);
});
