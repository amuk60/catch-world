import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGuideTimer, isFirstVisit, markSeen, GUIDE_TIMING } from '../src/logic/guide.js';

test('움직이지 않으면 maxMs 뒤에 접힌다', () => {
  const t = createGuideTimer();
  let hidden = false;
  for (let s = 0; s < 13 && !hidden; s += 1) hidden = t.update(1, false);
  assert.equal(hidden, false);
  assert.equal(t.update(1, false), true);
});

test('움직인 시간이 moveMs 에 닿으면 먼저 접힌다', () => {
  const t = createGuideTimer();
  assert.equal(t.update(3, true), false);
  assert.equal(t.update(0.5, false), false); // 멈춘 시간은 세지 않는다
  assert.equal(t.update(1, true), true);
  assert.ok(GUIDE_TIMING.moveMs < GUIDE_TIMING.maxMs);
});

test('reset 은 다시 센다', () => {
  const t = createGuideTimer();
  t.update(20, false);
  t.reset();
  assert.equal(t.update(1, false), false);
});

test('첫 방문 판정: 저장소 없음·예외에도 안전', () => {
  const mem = new Map();
  const storage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v) };
  assert.equal(isFirstVisit(storage), true);
  markSeen(storage);
  assert.equal(isFirstVisit(storage), false);
  assert.equal(isFirstVisit(undefined), true);
  const broken = { getItem() { throw new Error('x'); }, setItem() { throw new Error('x'); } };
  assert.equal(isFirstVisit(broken), true);
  assert.doesNotThrow(() => markSeen(broken));
  assert.doesNotThrow(() => markSeen(null));
});
