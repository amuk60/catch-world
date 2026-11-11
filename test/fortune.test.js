import test from 'node:test';
import assert from 'node:assert/strict';
import { pickFortune } from '../src/logic/fortune.js';
import { mulberry32 } from '../src/logic/rng.js';

const list = ['a', 'b', 'c', 'd'];

test('pickFortune: index 와 text 가 짝이 맞는다', () => {
  const r = pickFortune(list, mulberry32(1), -1);
  assert.ok(Number.isInteger(r.index) && r.index >= 0 && r.index < list.length);
  assert.equal(r.text, list[r.index]);
});

test('pickFortune: 직전 인덱스는 다시 나오지 않는다(여러 시드, 모든 lastIndex)', () => {
  for (let seed = 1; seed <= 50; seed++) {
    const rng = mulberry32(seed);
    for (let last = 0; last < list.length; last++) {
      for (let i = 0; i < 20; i++) assert.notEqual(pickFortune(list, rng, last).index, last);
    }
  }
});

test('pickFortune: 모든 다른 인덱스가 나올 수 있다', () => {
  const rng = mulberry32(7);
  const seen = new Set();
  for (let i = 0; i < 200; i++) seen.add(pickFortune(list, rng, 2).index);
  assert.deepEqual([...seen].sort(), [0, 1, 3]);
});

test('pickFortune: lastIndex 가 -1/null/undefined/범위 밖이어도 동작', () => {
  for (const last of [-1, null, undefined, 99]) {
    const r = pickFortune(list, mulberry32(3), last);
    assert.equal(r.text, list[r.index]);
  }
});

test('pickFortune: 같은 시드는 같은 결과(결정적)', () => {
  const a = Array.from({ length: 10 }, (_, i) => pickFortune(list, mulberry32(i), i % 4));
  const b = Array.from({ length: 10 }, (_, i) => pickFortune(list, mulberry32(i), i % 4));
  assert.deepEqual(a, b);
});

test('pickFortune: 항목이 하나면 lastIndex 와 같아도 그 항목', () => {
  assert.deepEqual(pickFortune(['x'], mulberry32(1), 0), { index: 0, text: 'x' });
});

test('pickFortune: 빈 목록은 오류', () => {
  assert.throws(() => pickFortune([], mulberry32(1), -1));
});
