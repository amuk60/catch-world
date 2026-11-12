import test from 'node:test';
import assert from 'node:assert/strict';
import { createTransition } from '../src/logic/transition.js';

const make = () => createTransition({ outSeconds: 0.45, inSeconds: 0.45 });

test('처음에는 멈춰 있다: active false, 업데이트해도 이벤트 없음, 구멍은 활짝(1)', () => {
  const t = make();
  assert.equal(t.active, false);
  assert.deepEqual(t.update(1), []);
  assert.equal(t.progress(), 0);
  assert.equal(t.radius(), 1);
  assert.equal(t.phase, 'idle');
});

test('start: true 를 돌려주고 active, 이미 진행 중이면 false(진행에 영향 없음)', () => {
  const t = make();
  assert.equal(t.start(), true);
  assert.equal(t.active, true);
  t.update(0.2);
  const p = t.progress();
  assert.equal(t.start(), false);
  assert.equal(t.progress(), p);
});

test("'mid' 는 닫는 구간이 끝날 때 정확히 한 번, 'done' 은 전체가 끝날 때 한 번", () => {
  const t = make();
  t.start();
  assert.deepEqual(t.update(0.4), []);
  assert.equal(t.phase, 'out');
  assert.deepEqual(t.update(0.1), ['mid']); // 0.5 >= 0.45
  assert.equal(t.phase, 'in');
  assert.deepEqual(t.update(0.3), []);
  assert.deepEqual(t.update(0.2), ['done']); // 0.45+0.3+0.2 >= 0.9
  assert.equal(t.active, false);
  assert.deepEqual(t.update(5), []);
});

test('아주 큰 dt 도 mid, done 을 순서대로 한 번씩만 낸다', () => {
  const t = make();
  t.start();
  assert.deepEqual(t.update(1000), ['mid', 'done']);
  assert.equal(t.active, false);
  assert.deepEqual(t.update(1000), []);
});

test('끝나면 다시 시작할 수 있다', () => {
  const t = make();
  t.start();
  t.update(10);
  assert.equal(t.start(), true);
  assert.deepEqual(t.update(0.46), ['mid']);
  assert.deepEqual(t.update(0.45), ['done']);
});

test('progress: 0 -> 0.5(중간) -> 1, 단조 증가, 끝나면 0', () => {
  const t = make();
  t.start();
  let prev = 0;
  for (let i = 0; i < 17; i++) {
    t.update(0.05);
    const p = t.progress();
    assert.ok(p >= prev - 1e-9 && p <= 1, `${p}`);
    prev = p;
  }
  assert.ok(prev > 0.9);
  t.update(0.2);
  assert.equal(t.progress(), 0); // 끝난 뒤
  const u = make();
  u.start();
  u.update(0.45 - 1e-9);
  assert.ok(Math.abs(u.progress() - 0.5) < 1e-6);
});

test('radius: 닫히며 1 -> 0(mid 에서 0, 화면 전체가 덮인다), 다시 열리며 0 -> 1, 구간 안에서 단조', () => {
  const t = make();
  t.start();
  assert.equal(t.radius(), 1);
  let prev = 1;
  for (let i = 0; i < 8; i++) {
    t.update(0.05);
    assert.ok(t.radius() <= prev + 1e-9);
    prev = t.radius();
  }
  assert.ok(prev < 0.3, `${prev}`); // 0.4초: 거의 닫힘
  t.update(0.05); // mid
  assert.ok(t.radius() < 1e-9);
  prev = 0;
  for (let i = 0; i < 8; i++) {
    t.update(0.05);
    assert.ok(t.radius() >= prev - 1e-9);
    prev = t.radius();
  }
  assert.ok(prev > 0.9);
  t.update(0.1);
  assert.equal(t.radius(), 1);
});

test('mid 와 done 이 한 번에 오는 경우 mid 시점의 radius 는 의미 없다: done 뒤 radius 1, phase idle', () => {
  const t = make();
  t.start();
  t.update(10);
  assert.equal(t.radius(), 1);
  assert.equal(t.phase, 'idle');
});

test('기본값은 0.45 / 0.45 초(총 약 0.9초)', () => {
  const t = createTransition();
  t.start();
  assert.deepEqual(t.update(0.44), []);
  assert.deepEqual(t.update(0.02), ['mid']);
  assert.deepEqual(t.update(0.43), []);
  assert.deepEqual(t.update(0.02), ['done']);
});
