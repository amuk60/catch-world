import test from 'node:test';
import assert from 'node:assert/strict';
import { createFpBlend, ease, blendPose, lookFromPointer, followLook, lookDirection, sway, shouldHideBody } from '../src/logic/fpCamera.js';
import { FIRST_PERSON as FP } from '../src/config.js';

test('설정: 전환은 약 0.5초, 1인칭 시야각은 62~70도, 둘러보기는 ±12도', () => {
  assert.equal(FP.enterSeconds, 0.5);
  assert.equal(FP.exitSeconds, 0.5);
  assert.ok(FP.fov >= 62 && FP.fov <= 70);
  assert.equal(FP.lookDeg, 12);
});

test('ease: 0 -> 1 로 부드럽게(양 끝 기울기 0) 오르고 범위를 벗어나지 않는다', () => {
  assert.equal(ease(0), 0);
  assert.equal(ease(1), 1);
  assert.equal(ease(0.5), 0.5);
  assert.equal(ease(-1), 0);
  assert.equal(ease(2), 1);
  assert.ok(ease(0.1) < 0.1 && ease(0.9) > 0.9);
});

test('createFpBlend: 켜면 0.5초에 걸쳐 올라가고 끄면 0.5초에 걸쳐 내려와 정확히 0 이 된다', () => {
  const b = createFpBlend(FP);
  assert.equal(b.value, 0);
  assert.equal(b.active, false);
  let k = 0;
  for (let i = 0; i < 10; i++) { k = b.update(0.05, true); assert.ok(k >= 0 && k <= 1); }
  assert.equal(k, 1);
  assert.equal(b.active, true);
  const mid = b.update(0.25, false);
  assert.ok(mid > 0 && mid < 1);
  assert.equal(b.update(0.25, false), 0);
  assert.equal(b.active, false);
  assert.equal(b.update(5, false), 0);
});

test('createFpBlend: 도중에 방향이 바뀌어도 끊기지 않고 단조롭게 이어진다(취소해도 스냅 없음)', () => {
  const b = createFpBlend(FP);
  let prev = 0;
  for (let i = 0; i < 6; i++) { const k = b.update(0.05, true); assert.ok(k >= prev); prev = k; }
  const peak = prev;
  for (let i = 0; i < 20; i++) { const k = b.update(0.05, false); assert.ok(k <= prev + 1e-12); assert.ok(prev - k < 0.5); prev = k; }
  assert.ok(peak > 0 && prev === 0);
  assert.equal(b.update(NaN, true), 0);
  assert.equal(b.update(-1, true), 0);
});

test('blendPose: k=0 은 궤도 자세와 정확히 같고(복원 스냅 없음), k=1 은 1인칭, 중간은 섞는다', () => {
  const orbit = { position: [3.1, 8.7, -2.2], target: [0.5, 1, 0.25], fov: 45 };
  const fp = { position: [0.4, 1.3, 0.2], target: [-6.5, 1, -1.5], fov: 66 };
  assert.deepEqual(blendPose(orbit, fp, 0), orbit);
  assert.deepEqual(blendPose(orbit, fp, 1), fp);
  assert.deepEqual(blendPose(orbit, fp, -0.5), orbit);
  const half = blendPose(orbit, fp, 0.5);
  assert.ok(Math.abs(half.fov - 55.5) < 1e-9);
  assert.ok(Math.abs(half.position[1] - (8.7 + 1.3) / 2) < 1e-9);
  assert.notEqual(blendPose(orbit, fp, 0.5).position, orbit.position);
});

test('lookFromPointer: 가장자리에서 최대 ±12도, 중앙은 0, 범위 밖·NaN 은 잘라낸다', () => {
  assert.deepEqual(lookFromPointer(0, 0, 12), { yawDeg: -0, pitchDeg: -0 });
  assert.deepEqual(lookFromPointer(1, 1, 12), { yawDeg: -12, pitchDeg: -12 });
  assert.deepEqual(lookFromPointer(-1, -1, 12), { yawDeg: 12, pitchDeg: 12 });
  assert.equal(lookFromPointer(9, -9, 12).yawDeg, -12);
  assert.equal(lookFromPointer(NaN, NaN, 12).yawDeg, -0);
});

test('followLook: 목표로 수렴하고 넘치지 않는다', () => {
  let cur = { yawDeg: 0, pitchDeg: 0 };
  for (let i = 0; i < 120; i++) cur = followLook(cur, { yawDeg: 12, pitchDeg: -12 }, 1 / 60, 6);
  assert.ok(Math.abs(cur.yawDeg - 12) < 0.05 && Math.abs(cur.pitchDeg + 12) < 0.05);
  assert.ok(cur.yawDeg <= 12);
  assert.deepEqual(followLook({ yawDeg: 3, pitchDeg: 4 }, { yawDeg: 9, pitchDeg: 9 }, 0, 6), { yawDeg: 3, pitchDeg: 4 });
});

test('lookDirection: 길이 1, 방위 0 은 +z, 둘러보기가 더해진다', () => {
  const d = lookDirection(0, 0, { yawDeg: 0, pitchDeg: 0 });
  assert.ok(Math.abs(d[2] - 1) < 1e-9 && Math.abs(d[0]) < 1e-9 && Math.abs(d[1]) < 1e-9);
  const e = lookDirection(0.3, -0.1, { yawDeg: 12, pitchDeg: -12 });
  assert.ok(Math.abs(Math.hypot(...e) - 1) < 1e-9);
  assert.ok(e[1] < d[1]);
});

test('sway: 흔들림은 작고(설정 크기 안쪽) 시간에 따라 변한다', () => {
  let max = 0;
  const seen = new Set();
  for (let t = 0; t < 60; t += 0.05) {
    const s = sway(t, FP.sway);
    max = Math.max(max, Math.abs(s.eye), Math.abs(s.handX), Math.abs(s.handY));
    seen.add(s.handX.toFixed(4));
  }
  assert.ok(max <= FP.sway * 1.5 && max > 0);
  assert.ok(seen.size > 100);
});

test('shouldHideBody: 전환이 hideAt 에 닿은 뒤에만 몸을 숨긴다', () => {
  assert.equal(shouldHideBody(0.5, FP.hideAt), false);
  assert.equal(shouldHideBody(FP.hideAt, FP.hideAt), true);
  assert.equal(shouldHideBody(1, FP.hideAt), true);
  assert.equal(shouldHideBody(0, FP.hideAt), false);
});
