import { test } from 'node:test';
import assert from 'node:assert/strict';
import { occlusionTarget } from '../src/logic/occlusion.js';
import { OCCLUSION } from '../src/config.js';

const P = { radius: 2.0, minT: 0.08, maxT: 0.97, minScale: 0.2 };
const cam = { x: 10, y: 8, z: 0 };
const tgt = { x: 0, y: 1, z: 0 };

test('기본값이 config 에 있다', () => {
  assert.deepEqual(OCCLUSION, P);
});

test('선분 위의 나무는 minScale', () => {
  assert.equal(occlusionTarget(cam, tgt, { x: 5, z: 0 }, P), 0.2);
});

test('선분에서 radius*0.5 이내면 minScale', () => {
  assert.equal(occlusionTarget(cam, tgt, { x: 5, z: 1.0 }, P), 0.2);
});

test('옆으로 멀리 있는 나무는 1', () => {
  assert.equal(occlusionTarget(cam, tgt, { x: 5, z: 4 }, P), 1);
  assert.equal(occlusionTarget(cam, tgt, { x: 5, z: 2 }, P), 1);
});

test('플레이어 뒤(t > maxT)의 나무는 1', () => {
  assert.equal(occlusionTarget(cam, tgt, { x: -3, z: 0 }, P), 1);
  assert.equal(occlusionTarget(cam, tgt, { x: 0.1, z: 0 }, P), 1); // t = 0.99
});

test('카메라 뒤(t < minT)의 나무는 1', () => {
  assert.equal(occlusionTarget(cam, tgt, { x: 12, z: 0 }, P), 1);
  assert.equal(occlusionTarget(cam, tgt, { x: 9.5, z: 0 }, P), 1); // t = 0.05
});

test('가장자리 보간: 거리 0.75*radius 에서 중간값', () => {
  const v = occlusionTarget(cam, tgt, { x: 5, z: 1.5 }, P);
  assert.ok(Math.abs(v - 0.6) < 1e-9, `v ${v}`);
});

test('가장자리 보간은 거리에 따라 단조 증가하고 [minScale,1] 범위', () => {
  let prev = 0.2;
  for (let z = 1.0; z <= 2.0; z += 0.1) {
    const v = occlusionTarget(cam, tgt, { x: 5, z }, P);
    assert.ok(v >= prev - 1e-12 && v >= 0.2 && v <= 1, `z ${z} v ${v}`);
    prev = v;
  }
});

test('y 는 무시하고 수평 투영만 쓴다', () => {
  assert.equal(occlusionTarget({ x: 10, y: 100, z: 0 }, tgt, { x: 5, z: 0 }, P), 0.2);
});

test('퇴화(카메라가 수평으로 타깃 바로 위): 멀리 있는 나무는 1', () => {
  assert.equal(occlusionTarget({ x: 0, y: 9, z: 0 }, tgt, { x: 5, z: 5 }, P), 1);
});
