import test from 'node:test';
import assert from 'node:assert/strict';
import { PAPER_TYPES, buildQueue, totalReduction } from '../src/logic/paperQueue.js';
import { STRESS } from '../src/config.js';

test('큐는 15장: 이력서 5, 불합격 통지서 6, 자소서 4 순서', () => {
  const q = buildQueue();
  assert.equal(q.length, 15);
  const types = q.map((p) => p.type);
  assert.deepEqual(types, [...Array(5).fill('resume'), ...Array(6).fill('notice'), ...Array(4).fill('coverLetter')]);
});

test('종류별 동작·라벨·감소량', () => {
  const q = buildQueue();
  for (const p of q.filter((x) => x.type === 'resume')) {
    assert.deepEqual([p.action, p.label, p.reduce, p.taps, p.reducePerTap], ['burn', '이력서', 5, 0, 0]);
  }
  for (const p of q.filter((x) => x.type === 'notice')) {
    assert.deepEqual([p.action, p.label, p.reduce, p.taps, p.reducePerTap], ['burn', '불합격 통지서', 4, 0, 0]);
  }
  for (const p of q.filter((x) => x.type === 'coverLetter')) {
    assert.deepEqual([p.action, p.label, p.reduce, p.taps, p.reducePerTap], ['shred', '자소서', 0, 8, 1]);
  }
});

test('id 는 모두 다르다', () => {
  const q = buildQueue();
  assert.equal(new Set(q.map((p) => p.id)).size, 15);
});

test('totalReduction 은 81, 전부 하면 목표 이하', () => {
  const q = buildQueue();
  assert.equal(totalReduction(q), 81);
  assert.ok(STRESS.start - totalReduction(q) <= STRESS.goal);
});

test('호출할 때마다 새 배열(공유 상태 없음), 종류는 세 가지', () => {
  assert.notEqual(buildQueue(), buildQueue());
  assert.deepEqual(Object.keys(PAPER_TYPES).sort(), ['coverLetter', 'notice', 'resume']);
});
