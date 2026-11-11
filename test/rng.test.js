import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mulberry32, rand, pick } from '../src/logic/rng.js';

test('같은 시드는 같은 수열', () => {
  const a = mulberry32(42), b = mulberry32(42);
  for (let i = 0; i < 20; i++) assert.equal(a(), b());
});
test('다른 시드는 다른 수열', () => {
  const a = mulberry32(1), b = mulberry32(2);
  const sa = Array.from({ length: 5 }, a), sb = Array.from({ length: 5 }, b);
  assert.notDeepEqual(sa, sb);
});
test('값은 [0,1) 범위', () => {
  const r = mulberry32(7);
  for (let i = 0; i < 1000; i++) { const v = r(); assert.ok(v >= 0 && v < 1); }
});
test('rand는 [min,max) 범위', () => {
  const r = mulberry32(3);
  for (let i = 0; i < 500; i++) { const v = rand(r, 2, 5); assert.ok(v >= 2 && v < 5); }
});
test('pick은 배열의 원소를 돌려준다', () => {
  const r = mulberry32(5);
  const arr = ['a', 'b', 'c'];
  const seen = new Set();
  for (let i = 0; i < 100; i++) { const v = pick(r, arr); assert.ok(arr.includes(v)); seen.add(v); }
  assert.equal(seen.size, 3);
});
