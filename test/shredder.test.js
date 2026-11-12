import test from 'node:test';
import assert from 'node:assert/strict';
import { ShredderState } from '../src/logic/shredder.js';

const cover = { id: 'c1', taps: 8, reducePerTap: 1 };

test('처음에는 비어 있다', () => {
  const s = new ShredderState();
  assert.equal(s.loaded, false);
  assert.equal(s.remaining, 0);
});

test('비어 있을 때 tap 은 아무 일도 없다', () => {
  assert.deepEqual(new ShredderState().tap(), { reduced: 0, done: false });
});

test('load 후 8번 tap: 7번은 진행, 마지막에 done 과 비움', () => {
  const s = new ShredderState();
  assert.equal(s.load(cover), true);
  assert.equal(s.loaded, true);
  assert.equal(s.remaining, 8);
  for (let i = 1; i <= 7; i++) {
    assert.deepEqual(s.tap(), { reduced: 1, done: false });
    assert.equal(s.remaining, 8 - i);
  }
  assert.deepEqual(s.tap(), { reduced: 1, done: true });
  assert.equal(s.loaded, false);
  assert.equal(s.remaining, 0);
  assert.deepEqual(s.tap(), { reduced: 0, done: false });
});

test('이미 들어 있으면 load 는 거부', () => {
  const s = new ShredderState();
  s.load(cover);
  s.tap();
  assert.equal(s.load({ id: 'c2', taps: 8, reducePerTap: 1 }), false);
  assert.equal(s.remaining, 7);
});

test('끝난 뒤에는 다시 load 할 수 있다', () => {
  const s = new ShredderState();
  s.load(cover);
  for (let i = 0; i < 8; i++) s.tap();
  assert.equal(s.load({ id: 'c2', taps: 8, reducePerTap: 1 }), true);
  assert.equal(s.remaining, 8);
});

test('reset 은 비운다', () => {
  const s = new ShredderState();
  s.load(cover);
  s.reset();
  assert.equal(s.loaded, false);
});
