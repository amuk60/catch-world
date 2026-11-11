import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clampToYard, stepToward, pushOutOfCircle, headingY } from '../src/logic/movement.js';

const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} !~ ${b}`);
const Y = { width: 24, depth: 20 };

test('clampToYard', () => {
  assert.deepEqual(clampToYard({ x: 50, z: -50 }, Y, 1), { x: 11, z: -9 });
  assert.deepEqual(clampToYard({ x: 3, z: 2 }, Y, 1), { x: 3, z: 2 });
  assert.deepEqual(clampToYard({ x: -50, z: 50 }, Y, 0), { x: -12, z: 10 });
});

test('stepToward: 부분 이동', () => {
  const r = stepToward({ x: 0, z: 0 }, { x: 10, z: 0 }, 4, 0.5);
  near(r.x, 2); near(r.z, 0); assert.equal(r.arrived, false);
});
test('stepToward: 정확히 도착', () => {
  const r = stepToward({ x: 0, z: 0 }, { x: 0, z: 2 }, 4, 0.5);
  assert.deepEqual(r, { x: 0, z: 2, arrived: true });
});
test('stepToward: 초과하면 목표에 스냅', () => {
  const r = stepToward({ x: 0, z: 0 }, { x: 1, z: 0 }, 4, 1);
  assert.deepEqual(r, { x: 1, z: 0, arrived: true });
});
test('stepToward: 거리 0', () => {
  const r = stepToward({ x: 2, z: 3 }, { x: 2, z: 3 }, 4, 1);
  assert.deepEqual(r, { x: 2, z: 3, arrived: true });
});
test('stepToward: dt 0이면 제자리, 도착 아님', () => {
  const r = stepToward({ x: 0, z: 0 }, { x: 5, z: 0 }, 4, 0);
  assert.deepEqual(r, { x: 0, z: 0, arrived: false });
});

test('pushOutOfCircle: 안쪽이면 밀어낸다', () => {
  const r = pushOutOfCircle({ x: 1, z: 0 }, 0.5, { x: 0, z: 0, radius: 2 });
  near(r.x, 2.5); near(r.z, 0);
});
test('pushOutOfCircle: 바깥이면 그대로', () => {
  assert.deepEqual(pushOutOfCircle({ x: 5, z: 0 }, 0.5, { x: 0, z: 0, radius: 2 }), { x: 5, z: 0 });
});
test('pushOutOfCircle: 경계는 그대로', () => {
  assert.deepEqual(pushOutOfCircle({ x: 2.5, z: 0 }, 0.5, { x: 0, z: 0, radius: 2 }), { x: 2.5, z: 0 });
});
test('pushOutOfCircle: 중심이면 +z로', () => {
  const r = pushOutOfCircle({ x: 1, z: 1 }, 0.5, { x: 1, z: 1, radius: 2 });
  near(r.x, 1); near(r.z, 3.5);
});

test('headingY: 네 축', () => {
  const o = { x: 0, z: 0 };
  near(headingY(o, { x: 0, z: 1 }), 0);
  near(headingY(o, { x: 1, z: 0 }), Math.PI / 2);
  near(headingY(o, { x: -1, z: 0 }), -Math.PI / 2);
  near(Math.abs(headingY(o, { x: 0, z: -1 })), Math.PI);
});
