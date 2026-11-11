import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isClick } from '../src/logic/click.js';

const O = { maxMovePx: 6, maxMs: 350 };

test('경계값은 클릭이다', () => {
  assert.equal(isClick({ dx: 6, dy: 0, dtMs: 350 }, O), true);
  assert.equal(isClick({ dx: 0, dy: 0, dtMs: 0 }, O), true);
});
test('경계를 넘으면 클릭이 아니다', () => {
  assert.equal(isClick({ dx: 6.1, dy: 0, dtMs: 100 }, O), false);
  assert.equal(isClick({ dx: 0, dy: 0, dtMs: 351 }, O), false);
});
test('드래그는 클릭이 아니다', () => {
  assert.equal(isClick({ dx: 30, dy: 40, dtMs: 100 }, O), false);
});
test('대각선 이동은 hypot으로 잰다', () => {
  assert.equal(isClick({ dx: 4, dy: 4, dtMs: 100 }, O), true);
  assert.equal(isClick({ dx: 5, dy: 5, dtMs: 100 }, O), false);
});
test('오래 누르면 클릭이 아니다', () => {
  assert.equal(isClick({ dx: 0, dy: 0, dtMs: 1000 }, O), false);
});
