import test from 'node:test';
import assert from 'node:assert/strict';
import { rollReduction } from '../src/logic/stressRoll.js';
import { REDUCE_RANGE, INTERVIEW_BONUS_RANGE } from '../src/config.js';

test('REDUCE_RANGE 는 7~12, 면접 완주 보너스 범위는 10~12', () => {
  assert.deepEqual(REDUCE_RANGE, { min: 7, max: 12 });
  assert.deepEqual(INTERVIEW_BONUS_RANGE, { min: 10, max: 12 });
});

test('rollReduction: 난수 0 은 최솟값, 1 에 가까우면 최댓값, 1 이어도 최댓값을 넘지 않는다', () => {
  assert.equal(rollReduction(() => 0), 7);
  assert.equal(rollReduction(() => 0.999999), 12);
  assert.equal(rollReduction(() => 1), 12);
  assert.equal(rollReduction(() => 0, { min: 10, max: 12 }), 10);
  assert.equal(rollReduction(() => 0.9999, { min: 10, max: 12 }), 12);
});

test('rollReduction: 6개 값이 같은 구간으로 나뉜다(균등)', () => {
  const got = [0, 1, 2, 3, 4, 5].map((k) => rollReduction(() => (k + 0.5) / 6));
  assert.deepEqual(got, [7, 8, 9, 10, 11, 12]);
});

test('rollReduction: 항상 범위 안의 정수이고 모든 값이 고르게 나온다(시드 난수 5000번)', () => {
  let s = 12345;
  const rng = () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296; };
  const seen = new Map();
  for (let i = 0; i < 5000; i++) {
    const v = rollReduction(rng);
    assert.ok(Number.isInteger(v) && v >= 7 && v <= 12, String(v));
    seen.set(v, (seen.get(v) ?? 0) + 1);
  }
  assert.equal(seen.size, 6);
  for (const n of seen.values()) assert.ok(n > 700, `치우침 ${n}`);
});

test('rollReduction: 한 번 부를 때 rng 를 한 번만 쓴다', () => {
  let calls = 0;
  rollReduction(() => { calls++; return 0.5; });
  assert.equal(calls, 1);
});
