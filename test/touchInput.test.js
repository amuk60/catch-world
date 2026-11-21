import test from 'node:test';
import assert from 'node:assert/strict';
import { clampKnob, stickVector, stickDirection, isTap, passedDragSlop, pinchDistance, gapOf, touchTutorial } from '../src/logic/touchInput.js';
import { keyDirection } from '../src/logic/keyMove.js';
import { TUTORIAL, MOBILE, ORBIT } from '../src/config.js';

const near = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;
const STICK = { radius: 50, deadZone: 0.2 };

test('clampKnob: 반지름 안은 그대로, 밖은 원 둘레로', () => {
  assert.deepEqual(clampKnob(10, -20, 50), { x: 10, y: -20 });
  const k = clampKnob(300, 400, 50);
  assert.ok(near(k.x, 30) && near(k.y, 40));
  assert.deepEqual(clampKnob(0, 0, 50), { x: 0, y: 0 });
});

test('stickVector: 데드존 안은 0, 밖은 0~1 로 펼치고 반지름 밖은 1', () => {
  assert.deepEqual(stickVector(5, 5, STICK), { x: 0, y: 0, mag: 0 });
  assert.deepEqual(stickVector(0, 10, STICK), { x: 0, y: 0, mag: 0 }); // 데드존 경계(10px)는 멈춤
  const half = stickVector(30, 0, STICK); // (30-10)/(50-10) = 0.5
  assert.ok(near(half.mag, 0.5) && near(half.x, 1) && near(half.y, 0));
  const far = stickVector(0, -500, STICK);
  assert.equal(far.mag, 1);
  assert.ok(near(far.y, -1));
  assert.equal(stickVector(10, 10, { radius: 0 }).mag, 0);
});

test('stickDirection: 끝까지 민 방향은 같은 키보드 방향과 같다(카메라 방위각 기준)', () => {
  for (const az of [0, 45, 90, 200, 315]) {
    const cases = [[{ x: 0, y: -1, mag: 1 }, ['KeyW']], [{ x: 0, y: 1, mag: 1 }, ['KeyS']], [{ x: 1, y: 0, mag: 1 }, ['KeyD']], [{ x: -1, y: 0, mag: 1 }, ['KeyA']],
      [{ x: Math.SQRT1_2, y: -Math.SQRT1_2, mag: 1 }, ['KeyW', 'KeyD']]];
    for (const [vec, keys] of cases) {
      const a = stickDirection(vec, az, 0.4);
      const b = keyDirection(new Set(keys), az);
      assert.ok(near(a.x, b.x, 1e-6) && near(a.z, b.z, 1e-6), `az ${az} ${keys}`);
    }
  }
});

test('stickDirection: 세기가 작으면 느리게(minSpeed), 0 이면 멈춤', () => {
  const slow = stickDirection({ x: 1, y: 0, mag: 0.0001 }, 0, 0.4);
  assert.ok(near(Math.hypot(slow.x, slow.z), 0.4, 1e-3));
  const mid = stickDirection({ x: 0, y: -1, mag: 0.5 }, 0, 0.4);
  assert.ok(near(Math.hypot(mid.x, mid.z), 0.7));
  assert.equal(stickDirection({ x: 0, y: 0, mag: 0 }, 0), null);
  assert.equal(stickDirection(null, 0), null);
});

test('isTap: 손가락 한도(12px·400ms) 안이면 탭, 넘으면 드래그', () => {
  assert.equal(isTap({ dx: 8, dy: 8, dtMs: 200 }, MOBILE.tap), true); // 마우스 한도(6px)는 넘지만 손가락으로는 탭
  assert.equal(isTap({ dx: 12, dy: 0, dtMs: 400 }, MOBILE.tap), true);
  assert.equal(isTap({ dx: 13, dy: 0, dtMs: 100 }, MOBILE.tap), false);
  assert.equal(isTap({ dx: 0, dy: 0, dtMs: 401 }, MOBILE.tap), false);
  assert.ok(MOBILE.tap.maxMovePx > 6);
});

test('passedDragSlop: 한도를 넘어야 드래그 시작', () => {
  assert.equal(passedDragSlop(6, 6, 12), false);
  assert.equal(passedDragSlop(10, 10, 12), true);
});

test('pinchDistance: 벌리면 가까이, 오므리면 멀리, ORBIT 한도 안에서', () => {
  assert.ok(near(pinchDistance(9, 100, 150, ORBIT), 6));
  assert.ok(near(pinchDistance(9, 100, 90, ORBIT), 10));
  assert.equal(pinchDistance(9, 100, 1000, ORBIT), ORBIT.minDistance);
  assert.equal(pinchDistance(9, 100, 10, ORBIT), ORBIT.maxDistance);
  assert.equal(pinchDistance(9, 0, 100, ORBIT), 9);
  assert.equal(pinchDistance(20, 0, 100, ORBIT), ORBIT.maxDistance);
  assert.equal(gapOf({ x: 0, y: 0 }, { x: 3, y: 4 }), 5);
});

test('touchTutorial: 터치 문구로 바꾼 사본(원본은 그대로, 없는 값은 원래 문구)', () => {
  const t = touchTutorial(TUTORIAL, MOBILE.text.tutorial);
  assert.equal(t.steps.move, MOBILE.text.tutorial.steps.move);
  assert.equal(t.steps.fire, TUTORIAL.steps.fire);
  assert.equal(t.intro.lines[0], TUTORIAL.intro.lines[0]);
  assert.match(t.intro.lines[2], /E 버튼/);
  assert.equal(t.intro.lines.length, TUTORIAL.intro.lines.length);
  assert.match(t.course.items.find((i) => i.id === 'burn').hint, /버튼/);
  assert.equal(t.course.items.find((i) => i.id === 'laundry').hint, TUTORIAL.course.items.find((i) => i.id === 'laundry').hint);
  assert.notEqual(TUTORIAL.steps.move, t.steps.move);
  assert.doesNotMatch(t.steps.move + t.steps.burn, /\{key/); // 키 그림 자리표시자가 없다
  assert.deepEqual(touchTutorial(TUTORIAL), { ...TUTORIAL, intro: { ...TUTORIAL.intro }, steps: { ...TUTORIAL.steps }, course: { ...TUTORIAL.course, items: TUTORIAL.course.items } });
});
