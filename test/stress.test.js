import test from 'node:test';
import assert from 'node:assert/strict';
import { StressMeter } from '../src/logic/stress.js';

const make = () => new StressMeter({ start: 100, goal: 20 });

test('시작값으로 시작한다', () => {
  assert.equal(make().value, 100);
});

test('reduce는 지수를 낮추고 새 값을 돌려준다', () => {
  const m = make();
  assert.equal(m.reduce(5), 95);
  assert.equal(m.value, 95);
});

test('0 아래로 내려가지 않는다', () => {
  const m = make();
  m.reduce(500);
  assert.equal(m.value, 0);
});

test('목표치 이하가 되면 cleared', () => {
  const m = make();
  m.reduce(79);
  assert.equal(m.cleared, false); // 21
  m.reduce(1);
  assert.equal(m.cleared, true);  // 20
});

test('음수·NaN 감소는 무시한다', () => {
  const m = make();
  m.reduce(-10);
  m.reduce(NaN);
  assert.equal(m.value, 100);
});

test('reset은 시작값으로 되돌린다', () => {
  const m = make();
  m.reduce(50);
  m.reset();
  assert.equal(m.value, 100);
});
