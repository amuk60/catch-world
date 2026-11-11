import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeFov } from '../src/logic/camera.js';

test('aspect가 minAspect 이상이면 기본 fov를 그대로 반환한다', () => {
  assert.equal(computeFov(35, 2, 1.5), 35);
  assert.equal(computeFov(35, 3, 1.5), 35);
});

test('aspect가 정확히 minAspect면 기본 fov를 반환한다', () => {
  assert.equal(computeFov(35, 1.5, 1.5), 35);
});

test('aspect가 minAspect보다 작으면 더 큰 fov를 반환한다', () => {
  const base = 35;
  const aspect = 1;
  const minAspect = 1.5;
  const rad = (d) => (d * Math.PI) / 180;
  const expected = (2 * Math.atan(Math.tan(rad(base) / 2) * (minAspect / aspect)) * 180) / Math.PI;
  const result = computeFov(base, aspect, minAspect);
  assert.ok(result > base);
  assert.ok(Math.abs(result - expected) < 1e-9);
});

test('유효하지 않은 aspect(0, NaN, 음수, Infinity)는 기본 fov를 반환한다', () => {
  for (const a of [0, NaN, -1, Infinity]) {
    assert.equal(computeFov(35, a, 1.5), 35);
  }
});
