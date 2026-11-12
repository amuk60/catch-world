import test from 'node:test';
import assert from 'node:assert/strict';
import { hiddenWalls } from '../src/logic/wallVisibility.js';

const room = { minX: -6, maxX: 6, minZ: -5, maxZ: 5 };
const walls = [
  { id: 'north', side: 'north' }, { id: 'south', side: 'south' }, { id: 'west', side: 'west' }, { id: 'east', side: 'east' },
];
const hide = (x, z) => hiddenWalls({ x, y: 6, z }, room, walls);

test('카메라가 방 안(위)에 있으면 아무 벽도 숨기지 않는다', () => {
  assert.deepEqual(hide(0, 0), []);
  assert.deepEqual(hide(5.9, -4.9), []);
});

test('네 면: 카메라가 벽 평면 바깥에 있으면 그 벽만 숨긴다(북 = -z, 남 = +z, 서 = -x, 동 = +x)', () => {
  assert.deepEqual(hide(0, -7), ['north']);
  assert.deepEqual(hide(0, 7), ['south']);
  assert.deepEqual(hide(-8, 0), ['west']);
  assert.deepEqual(hide(8, 0), ['east']);
});

test('모서리 바깥: 맞닿은 두 벽을 함께 숨긴다(기본 카메라는 남동쪽)', () => {
  assert.deepEqual(hide(8, 7).sort(), ['east', 'south']);
  assert.deepEqual(hide(-8, -7).sort(), ['north', 'west']);
  assert.deepEqual(hide(-8, 7).sort(), ['south', 'west']);
  assert.deepEqual(hide(8, -7).sort(), ['east', 'north']);
});

test('경계(평면 위)는 숨기지 않고, 조금만 넘어도 숨긴다', () => {
  assert.deepEqual(hide(6, 0), []);
  assert.deepEqual(hide(6.01, 0), ['east']);
  assert.deepEqual(hide(0, -5), []);
  assert.deepEqual(hide(0, -5.01), ['north']);
});

test('walls 목록 순서대로 id 를 돌려주고, y 는 무시한다', () => {
  assert.deepEqual(hiddenWalls({ x: 9, y: -50, z: -9 }, room, walls), ['north', 'east']);
  assert.deepEqual(hiddenWalls({ x: 0, y: 99, z: 0 }, room, walls), []);
});

test('빈 목록·모르는 면은 숨기지 않는다', () => {
  assert.deepEqual(hiddenWalls({ x: 99, z: 99 }, room, []), []);
  assert.deepEqual(hiddenWalls({ x: 99, z: 99 }, room, [{ id: 'x', side: 'up' }]), []);
});
