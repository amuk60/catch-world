import test from 'node:test';
import assert from 'node:assert/strict';
import { activeZone, zoneActions, buildZones } from '../src/logic/zones.js';
import { buildLayout } from '../src/logic/layout.js';
import { buildLaundryInterior } from '../src/logic/interiors.js';
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

test('buildZones: 마당의 소각장(소각로 중심, FIRE_ZONE_RADIUS, 태우기·파쇄)과 실내 세탁소(세탁·널기)', () => {
  const L = buildLayout(SEED);
  const I = buildLaundryInterior();
  const zones = buildZones(L);
  assert.deepEqual(zones.map((z) => z.id), ['incinerator', 'laundry']);
  const [inc, laundry] = zones;
  assert.deepEqual(inc, { id: 'incinerator', space: 'yard', center: { x: FURNACE.x, z: FURNACE.z }, radius: FIRE_ZONE_RADIUS, actions: ['burn', 'shred'] });
  assert.equal(laundry.space, 'laundry');
  assert.deepEqual(laundry.actions, ['wash', 'hang']);
  assert.equal(laundry.radius, 4.5);
  // 세탁소 구역 중심은 실내 세탁기 줄과 빨랫줄 사이.
  const cx = I.washers.reduce((s, w) => s + w.x, 0) / I.washers.length;
  const cz = I.washers.reduce((s, w) => s + w.z, 0) / I.washers.length;
  assert.ok(Math.abs(laundry.center.x - (cx + I.clothesline.centre.x) / 2) < 1e-9);
  assert.ok(Math.abs(laundry.center.z - (cz + I.clothesline.centre.z) / 2) < 1e-9);
  assert.ok(laundry.center.x > 200, '실내 좌표');
  assert.deepEqual(buildZones(L, I), zones); // 실내 데이터를 직접 넘겨도 같다
});

test('activeZone: 공간을 주면 그 공간의 구역만 본다(같은 좌표에 다른 공간 구역이 있어도 무시)', () => {
  const Y = { id: 'y', space: 'yard', center: { x: 0, z: 0 }, radius: 5, actions: ['a', 'b'] };
  const R = { id: 'r', space: 'room', center: { x: 0, z: 0 }, radius: 5, actions: ['c', 'd'] };
  assert.equal(activeZone({ x: 1, z: 1 }, [Y, R], 'yard'), Y);
  assert.equal(activeZone({ x: 1, z: 1 }, [Y, R], 'room'), R);
  assert.equal(activeZone({ x: 1, z: 1 }, [R, Y], 'yard'), Y);
  assert.equal(activeZone({ x: 1, z: 1 }, [Y], 'room'), null);
  assert.equal(activeZone({ x: 1, z: 1 }, [Y, R], 'nowhere'), null);
  assert.equal(activeZone({ x: 1, z: 1 }, [Y, R]), Y); // 공간을 주지 않으면 모든 구역(가까운 쪽, 같으면 먼저)
});

test('마당 한가운데 어디서도 실내 세탁소 구역은 활성화되지 않고, 실내에서 소각장은 활성화되지 않는다', () => {
  const L = buildLayout(SEED);
  const zones = buildZones(L);
  const I = buildLaundryInterior();
  assert.equal(activeZone(I.standingSpot, zones, 'laundry').id, 'laundry');
  assert.equal(activeZone(I.standingSpot, zones, 'yard'), null);
  assert.equal(activeZone({ x: FURNACE.x + 2, z: FURNACE.z }, zones, 'yard').id, 'incinerator');
  assert.equal(activeZone({ x: FURNACE.x + 2, z: FURNACE.z }, zones, 'laundry'), null);
  assert.equal(activeZone(I.arrival, zones, 'laundry'), null); // 들어오자마자는 구역 밖(걸어 들어가야 행동 막대가 뜬다)
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

test('소각로 가까이는 소각장, 실내 세탁기 가까이는 세탁소 구역', () => {
  const L = buildLayout(SEED);
  const I = buildLaundryInterior();
  const zones = buildZones(L);
  assert.equal(activeZone({ x: FURNACE.x + 2, z: FURNACE.z }, zones).id, 'incinerator');
  assert.equal(activeZone({ x: I.washers[2].x, z: I.washers[2].z + 1.5 }, zones, 'laundry').id, 'laundry');
});
