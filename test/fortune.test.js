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

// ---- 분류가 있는 운세 ----
import { FORTUNES, FORTUNE_CTA, COOKIE_KINDS } from '../src/config.js';
import { pickFortuneFor } from '../src/logic/fortune.js';

test('FORTUNES: 18개 이상, 6개 분류 모두 있고, 항목마다 문구·분류·캐치 버튼 이름이 있다', () => {
  assert.ok(FORTUNES.length >= 18);
  assert.equal(Object.keys(FORTUNE_CTA).length, 6);
  for (const cat of Object.keys(FORTUNE_CTA)) assert.ok(FORTUNES.filter((f) => f.category === cat).length >= 3, cat);
  for (const f of FORTUNES) {
    assert.ok(typeof f.text === 'string' && f.text.length > 5);
    assert.ok(f.category in FORTUNE_CTA, f.category);
    assert.ok(f.cta && typeof f.cta.label === 'string');
  }
  assert.equal(new Set(FORTUNES.map((f) => f.text)).size, FORTUNES.length, '문구 중복');
});

test('FORTUNE_CTA: 모든 분류에 이름과 20자 이내 버튼 이름이 있고, 운세의 버튼 이름은 분류의 것과 같다', () => {
  for (const [id, v] of Object.entries(FORTUNE_CTA)) {
    assert.ok(v.name && v.label, id);
    assert.ok(v.label.length <= 20, `${id} ${v.label.length}자`);
  }
  for (const f of FORTUNES) assert.equal(f.cta.label, FORTUNE_CTA[f.category].label);
});

test('COOKIE_KINDS: 3종, favors 는 실제 분류', () => {
  assert.equal(COOKIE_KINDS.length, 3);
  for (const k of COOKIE_KINDS) for (const c of k.favors) assert.ok(c in FORTUNE_CTA);
});

test('pickFortuneFor: 직전 인덱스는 연달아 나오지 않는다', () => {
  const rng = mulberry32(5);
  for (let last = 0; last < FORTUNES.length; last++) for (let i = 0; i < 20; i++) assert.notEqual(pickFortuneFor(FORTUNES, rng, last, ['luck']).index, last);
});

test('pickFortuneFor: favors 분류가 더 자주 나오지만 다른 분류도 나온다', () => {
  const rng = mulberry32(11);
  const counts = {};
  let last = -1;
  for (let i = 0; i < 6000; i++) {
    const r = pickFortuneFor(FORTUNES, rng, last, ['interview']);
    last = r.index;
    counts[r.fortune.category] = (counts[r.fortune.category] ?? 0) + 1;
  }
  const others = Object.entries(counts).filter(([c]) => c !== 'interview').map(([, n]) => n);
  assert.equal(Object.keys(counts).length, 6);
  assert.ok(counts.interview > Math.max(...others) * 1.8, JSON.stringify(counts));
});

test('pickFortuneFor: favors 가 없으면 고르게, 결정적이고, 한 항목만 있어도 동작하며 빈 목록은 오류', () => {
  const a = Array.from({ length: 8 }, (_, i) => pickFortuneFor(FORTUNES, mulberry32(i), 3).index);
  const b = Array.from({ length: 8 }, (_, i) => pickFortuneFor(FORTUNES, mulberry32(i), 3).index);
  assert.deepEqual(a, b);
  assert.equal(pickFortuneFor([FORTUNES[0]], mulberry32(1), 0).index, 0);
  assert.throws(() => pickFortuneFor([], mulberry32(1), -1));
  const r = pickFortuneFor(FORTUNES, () => 0.999999, -1);
  assert.equal(r.fortune, FORTUNES[r.index]);
});
