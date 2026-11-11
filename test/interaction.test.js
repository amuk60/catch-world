import test from 'node:test';
import assert from 'node:assert/strict';
import { interactTarget, inRange, resolveArrival, hoverLabel } from '../src/logic/interaction.js';

const stump = { id: 'comfort-0', label: '쉬어가는 그루터기', kind: 'comfort', x: 2, z: 3, radius: 0.5, interactRange: 1.7 };
const furnace = { id: 'furnace', label: '소각로', kind: 'furnace', x: -6, z: 0, radius: 1.6, interactRange: 2.8 };
const items = [furnace, stump];

test('interactTarget 은 오브젝트 중심의 x/z 를 돌려준다', () => {
  assert.deepEqual(interactTarget(stump), { x: 2, z: 3 });
});

test('inRange: 범위 안은 true, 밖은 false, 경계(=)는 true', () => {
  assert.equal(inRange({ x: 2, z: 4 }, stump), true);
  const edge = { ...stump, interactRange: 5 }; // 3-4-5 삼각형으로 부동소수 오차 없이 경계를 만든다.
  assert.equal(inRange({ x: 2 + 3, z: 3 + 4 }, edge), true);
  assert.equal(inRange({ x: 2 + 3, z: 3 + 4.01 }, edge), false);
});

test('inRange 는 x-z 평면 거리만 본다(y 무시)', () => {
  assert.equal(inRange({ x: 2, y: 50, z: 4 }, stump), true);
});

test('resolveArrival: 도착 + 범위 안이면 해당 아이템', () => {
  assert.equal(resolveArrival({ pendingId: 'comfort-0', arrived: true, playerPos: { x: 2, z: 4.2 }, items }), stump);
  assert.equal(resolveArrival({ pendingId: 'furnace', arrived: true, playerPos: { x: -6, z: 2.8 }, items }), furnace);
});

test('resolveArrival: 범위 밖이면 null', () => {
  assert.equal(resolveArrival({ pendingId: 'comfort-0', arrived: true, playerPos: { x: 2, z: 6 }, items }), null);
});

test('resolveArrival: 도착하지 않았으면 null', () => {
  assert.equal(resolveArrival({ pendingId: 'comfort-0', arrived: false, playerPos: { x: 2, z: 4 }, items }), null);
});

test('resolveArrival: 모르는 pendingId 는 null', () => {
  assert.equal(resolveArrival({ pendingId: 'nope', arrived: true, playerPos: { x: 2, z: 4 }, items }), null);
});

test('resolveArrival: pendingId 가 없으면 null', () => {
  assert.equal(resolveArrival({ pendingId: null, arrived: true, playerPos: { x: 2, z: 4 }, items }), null);
  assert.equal(resolveArrival({ arrived: true, playerPos: { x: 2, z: 4 }, items }), null);
});

test('hoverLabel 은 label 을 돌려준다', () => {
  assert.equal(hoverLabel(stump), '쉬어가는 그루터기');
});
