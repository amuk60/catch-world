import test from 'node:test';
import assert from 'node:assert/strict';
import { activeZone, zoneActions, buildZones } from '../src/logic/zones.js';
import { buildLayout } from '../src/logic/layout.js';
import { FURNACE, FIRE_ZONE_RADIUS, SEED, SPAWN } from '../src/config.js';
import { ACTIONS } from '../src/logic/actions.js';

const A = { id: 'a', center: { x: 0, z: 0 }, radius: 5, actions: ['x1', 'x2'] };
const B = { id: 'b', center: { x: 8, z: 0 }, radius: 5, actions: ['y1', 'y2'] };

test('activeZone: 안에 있으면 그 구역, 밖이면 null', () => {
  assert.equal(activeZone({ x: 1, z: 1 }, [A, B]), A);
  assert.equal(activeZone({ x: 9, z: 1 }, [A, B]), B);
  assert.equal(activeZone({ x: 0, z: 20 }, [A, B]), null);
  assert.equal(activeZone({ x: 0, z: 0 }, []), null);
});

test('activeZone: 경계(=반경)는 안, 조금 넘으면 밖(y 는 무시)', () => {
  assert.equal(activeZone({ x: 3, z: 4 }, [A]), A); // 3-4-5 삼각형
  assert.equal(activeZone({ x: 3, z: 4.01 }, [A]), null);
  assert.equal(activeZone({ x: 3, y: 99, z: 4 }, [A]), A);
});

test('activeZone: 겹치면 중심이 더 가까운 구역', () => {
  assert.equal(activeZone({ x: 3, z: 0 }, [A, B]), A); // 둘 다 안(겹침): A 까지 3, B 까지 5
  assert.equal(activeZone({ x: 3, z: 0 }, [B, A]), A); // 목록 순서와 무관
  assert.equal(activeZone({ x: 5, z: 0 }, [A, B]), B); // A 까지 5(경계), B 까지 3
  assert.equal(activeZone({ x: 6, z: 0 }, [B, A]), B);
  assert.equal(activeZone({ x: 2, z: 0 }, [A, B]), A);
});

test('activeZone: 거리가 같으면 먼저 나온 구역', () => {
  assert.equal(activeZone({ x: 4, z: 0 }, [A, B]), A);
  assert.equal(activeZone({ x: 4, z: 0 }, [B, A]), B);
});

test('zoneActions: 구역의 행동 id 두 개(복사본), 구역이 없으면 빈 목록', () => {
  assert.deepEqual(zoneActions(A), ['x1', 'x2']);
  assert.notEqual(zoneActions(A), A.actions);
  assert.deepEqual(zoneActions(null), []);
});

test('buildZones: 소각장(소각로 중심, FIRE_ZONE_RADIUS, 태우기·파쇄)과 세탁소(세탁·널기)', () => {
  const L = buildLayout(SEED);
  const zones = buildZones(L);
  assert.deepEqual(zones.map((z) => z.id), ['incinerator', 'laundry']);
  const [inc, laundry] = zones;
  assert.deepEqual(inc, { id: 'incinerator', center: { x: FURNACE.x, z: FURNACE.z }, radius: FIRE_ZONE_RADIUS, actions: ['burn', 'shred'] });
  assert.deepEqual(laundry.actions, ['wash', 'hang']);
  assert.equal(laundry.radius, 4.5);
  // 세탁소 구역 중심은 세탁기 줄과 빨랫줄 사이.
  const cx = L.washers.reduce((s, w) => s + w.x, 0) / L.washers.length;
  const cz = L.washers.reduce((s, w) => s + w.z, 0) / L.washers.length;
  assert.ok(Math.abs(laundry.center.x - (cx + L.clothesline.centre.x) / 2) < 1e-9);
  assert.ok(Math.abs(laundry.center.z - (cz + L.clothesline.centre.z) / 2) < 1e-9);
});

test('구역의 행동은 모두 ACTIONS 에 있고 그 구역 소속이며, 키 1/2 순서로 정의된다', () => {
  for (const zone of buildZones(buildLayout(SEED))) {
    const [first, second] = zoneActions(zone);
    assert.equal(zone.actions.length, 2);
    assert.equal(ACTIONS[first].zone, zone.id);
    assert.equal(ACTIONS[second].zone, zone.id);
    assert.equal(ACTIONS[first].key, '1');
    assert.equal(ACTIONS[second].key, '2');
  }
});

test('스폰 지점은 어느 구역에도 속하지 않는다', () => {
  assert.equal(activeZone(SPAWN, buildZones(buildLayout(SEED))), null);
});

test('소각로 가까이는 소각장, 세탁기 가까이는 세탁소 구역', () => {
  const L = buildLayout(SEED);
  const zones = buildZones(L);
  assert.equal(activeZone({ x: FURNACE.x + 2, z: FURNACE.z }, zones).id, 'incinerator');
  assert.equal(activeZone({ x: L.washers[0].x - 1.5, z: L.washers[0].z }, zones).id, 'laundry');
});
