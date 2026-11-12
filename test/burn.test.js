import test from 'node:test';
import assert from 'node:assert/strict';
import { isInFireZone, shakeOffset, barRatio, goalRatio, easeInOut } from '../src/logic/burn.js';

const fire = { x: -6.5, z: -1.5, radius: 1.3 };

test('isInFireZone: 안쪽은 true, 바깥은 false', () => {
  assert.equal(isInFireZone({ x: -6.5, z: -1.5 }, fire), true);
  assert.equal(isInFireZone({ x: -6, z: -1 }, fire), true);
  assert.equal(isInFireZone({ x: -4, z: -1.5 }, fire), false);
});

test('isInFireZone: 경계(거리 == 반경)는 포함, x-z 평면만 본다', () => {
  assert.equal(isInFireZone({ x: -5.2, z: -1.5 }, { ...fire, radius: 1.3 }), true);
  assert.equal(isInFireZone({ x: 3, z: 4, y: 99 }, { x: 0, z: 0, radius: 5 }), true);
  assert.equal(isInFireZone({ x: 3, z: 4.001 }, { x: 0, z: 0, radius: 5 }), false);
});

test('shakeOffset: 끝났거나 시작 전이면 0', () => {
  assert.deepEqual(shakeOffset(0.15, 0.15, 0.1), { x: 0, y: 0 });
  assert.deepEqual(shakeOffset(1, 0.15, 0.1), { x: 0, y: 0 });
  assert.deepEqual(shakeOffset(-0.01, 0.15, 0.1), { x: 0, y: 0 });
});

test('shakeOffset: 공식 a=amp*(1-t/d), x=a*sin(90t), y=a*cos(70t)', () => {
  const t = 0.05;
  const a = 0.1 * (1 - t / 0.15);
  const o = shakeOffset(t, 0.15, 0.1);
  assert.ok(Math.abs(o.x - a * Math.sin(t * 90)) < 1e-12);
  assert.ok(Math.abs(o.y - a * Math.cos(t * 70)) < 1e-12);
});

test('shakeOffset: 진폭 봉투가 단조 감소하고 결정적이다', () => {
  const env = (t) => Math.hypot(...Object.values(shakeOffset(t, 0.2, 0.3)));
  // t=0 에서는 y = amplitude (최대), 봉투 상한 a(t) 는 단조 감소
  assert.ok(Math.abs(shakeOffset(0, 0.2, 0.3).y - 0.3) < 1e-12);
  for (let t = 0; t < 0.2; t += 0.01) {
    assert.ok(env(t) <= 0.3 * (1 - t / 0.2) * Math.SQRT2 + 1e-12);
    assert.ok(Math.abs(shakeOffset(t, 0.2, 0.3).x) <= 0.3 * (1 - t / 0.2) + 1e-12);
  }
  assert.deepEqual(shakeOffset(0.07, 0.2, 0.3), shakeOffset(0.07, 0.2, 0.3));
});

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
