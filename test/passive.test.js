import test from 'node:test';
import assert from 'node:assert/strict';
import { createPassive } from '../src/logic/passive.js';
import { PASSIVE } from '../src/config.js';

const make = () => createPassive({ interval: 5, amount: 4 });

test('정확히 interval 이 차면 amount 를 낸다', () => {
  const p = make();
  assert.equal(p.update(5, true), 4);
});

test('부분 시간은 쌓이다가 interval 이 차는 순간 낸다', () => {
  const p = make();
  assert.equal(p.update(2, true), 0);
  assert.equal(p.update(2.9, true), 0);
  assert.equal(p.update(0.1, true), 4);
  assert.equal(p.update(4.9, true), 0);
});

test('큰 dt: 2.5 interval 이면 2×amount 를 내고 나머지를 유지', () => {
  const p = make();
  assert.equal(p.update(12.5, true), 8);
  assert.equal(p.update(2.4, true), 0);
  assert.equal(p.update(0.1, true), 4);
});

test('비활성이면 0 을 내고 누적이 초기화된다', () => {
  const p = make();
  assert.equal(p.update(4, true), 0);
  assert.equal(p.update(1, false), 0);
  assert.equal(p.update(4, true), 0); // 초기화됐으므로 5초가 아직 안 찼다.
  assert.equal(p.update(1, true), 4);
});

test('비활성 중 큰 dt 도 아무것도 내지 않는다', () => {
  const p = make();
  assert.equal(p.update(100, false), 0);
  assert.equal(p.update(4.9, true), 0);
});

test('음수·NaN dt 는 무시하고 결과는 음수가 아니다', () => {
  const p = make();
  assert.equal(p.update(-3, true), 0);
  assert.equal(p.update(Number.NaN, true), 0);
  assert.equal(p.update(0, true), 0);
  assert.equal(p.update(5, true), 4);
});

test('amount 와 interval 은 설정을 따른다', () => {
  const p = createPassive({ interval: 2, amount: 1.5 });
  assert.equal(p.update(4, true), 3);
});

test('reset() 은 누적을 비운다', () => {
  const p = make();
  p.update(4.5, true);
  p.reset();
  assert.equal(p.update(0.6, true), 0);
});

test('설정값: 5초마다 2 (행동 하나(3)보다 약하다)', () => {
  assert.deepEqual(PASSIVE, { interval: 5, amount: 2 });
  assert.equal(createPassive(PASSIVE).update(10, true), 4);
});
