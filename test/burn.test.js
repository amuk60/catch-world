import test from 'node:test';
import assert from 'node:assert/strict';
import { barRatio, goalRatio, easeInOut } from '../src/logic/burn.js';

test('barRatio: value/start 를 0~1 로 제한, start 0 이면 0', () => {
  assert.equal(barRatio(95, 100), 0.95);
  assert.equal(barRatio(100, 100), 1);
  assert.equal(barRatio(150, 100), 1);
  assert.equal(barRatio(-5, 100), 0);
  assert.equal(barRatio(10, 0), 0);
});

test('goalRatio: goal/start, start 0 이면 0', () => {
  assert.equal(goalRatio(20, 100), 0.2);
  assert.equal(goalRatio(0, 100), 0);
  assert.equal(goalRatio(20, 0), 0);
});

test('easeInOut: 끝점, 중간점, 범위 밖은 제한', () => {
  assert.equal(easeInOut(0), 0);
  assert.equal(easeInOut(1), 1);
  assert.equal(easeInOut(0.5), 0.5);
  assert.equal(easeInOut(-1), 0);
  assert.equal(easeInOut(2), 1);
  assert.ok(easeInOut(0.25) < 0.25 && easeInOut(0.75) > 0.75);
});

test('쓰지 않게 된 계산(isInFireZone, shakeOffset)은 없다', async () => {
  const mod = await import('../src/logic/burn.js');
  assert.equal(mod.isInFireZone, undefined);
  assert.equal(mod.shakeOffset, undefined);
});
