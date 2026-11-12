import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameState } from '../src/logic/gameState.js';
import { buildQueue } from '../src/logic/paperQueue.js';
import { STRESS } from '../src/config.js';

const make = () => createGameState({ ...STRESS, queue: buildQueue() });
const burn = (id, reduce) => ({ id, type: 'resume', label: '이력서', action: 'burn', reduce, taps: 0, reducePerTap: 0 });
const shred = (id, taps = 8) => ({ id, type: 'coverLetter', label: '자소서', action: 'shred', reduce: 0, taps, reducePerTap: 1 });

test('초기 상태', () => {
  const g = make();
  assert.equal(g.stress.value, 100);
  assert.equal(g.index, 0);
  assert.equal(g.cleared, false);
  assert.equal(g.shredder.loaded, false);
  assert.equal(g.currentPaper().type, 'resume');
});

test('completeBurn 은 줄이고 다음 종이로 넘어간다', () => {
  const g = make();
  const r = g.completeBurn(g.currentPaper());
  assert.deepEqual(r, { value: 95, justCleared: false });
  assert.equal(g.index, 1);
  assert.equal(g.stress.value, 95);
});

test('여러 번 호출해도 값과 index 가 이어진다', () => {
  const g = make();
  for (let i = 0; i < 5; i++) g.completeBurn(g.currentPaper());
  assert.equal(g.stress.value, 75);
  assert.equal(g.currentPaper().type, 'notice');
  assert.equal(g.index, 5);
});

test('전체 진행: 25+24 소각 후 자소서 4장 → 19, justCleared 는 정확히 한 번', () => {
  const g = make();
  let fired = 0;
  for (let i = 0; i < 11; i++) {
    if (g.completeBurn(g.currentPaper()).justCleared) fired++;
  }
  assert.equal(g.stress.value, 51);
  for (let c = 0; c < 4; c++) {
    assert.equal(g.loadShredder(g.currentPaper()), true);
    assert.equal(g.currentPaper(), null); // 파쇄 중에는 다음 종이 없음
    for (let t = 0; t < 8; t++) {
      const r = g.tapShredder();
      assert.equal(r.reduced, 1);
      assert.equal(r.done, t === 7);
      if (r.justCleared) fired++;
    }
  }
  assert.equal(g.stress.value, 19);
  assert.equal(fired, 1);
  assert.equal(g.cleared, true);
  assert.equal(g.currentPaper(), null);
  assert.equal(g.index, 15);
});

test('목표를 넘는 순간 한 번만 true, 이후 감소에서는 다시 발생하지 않는다', () => {
  const g = createGameState({ start: 10, goal: 4, queue: [burn('a', 3), burn('b', 4), burn('c', 1), burn('d', 5)] });
  const results = [];
  for (let i = 0; i < 4; i++) results.push(g.completeBurn(g.currentPaper()));
  assert.deepEqual(results.map((r) => r.justCleared), [false, true, false, false]);
  assert.equal(g.cleared, true);
  assert.equal(g.stress.value, 0);
});

test('파쇄(탭)로 클리어해도 한 번만 발생한다', () => {
  const g = createGameState({ start: 10, goal: 8, queue: [shred('s1', 4)] });
  g.loadShredder(g.currentPaper());
  const fired = [];
  for (let i = 0; i < 4; i++) fired.push(g.tapShredder().justCleared);
  assert.deepEqual(fired, [false, true, false, false]);
});

test('절반 파쇄한 자소서는 호출 사이에 남은 횟수를 유지', () => {
  const g = createGameState({ start: 100, goal: 20, queue: [shred('s1'), burn('b', 5)] });
  g.loadShredder(g.currentPaper());
  for (let i = 0; i < 3; i++) g.tapShredder();
  assert.equal(g.shredder.remaining, 5);
  assert.equal(g.stress.value, 97);
  assert.equal(g.currentPaper(), null);
  assert.equal(g.index, 0);
  const r = g.tapShredder();
  assert.equal(g.shredder.remaining, 4);
  assert.equal(r.value, 96);
});

test('파쇄가 끝나면 index 가 넘어가고 다음 종이가 나온다', () => {
  const g = createGameState({ start: 100, goal: 20, queue: [shred('s1', 2), burn('b', 5)] });
  g.loadShredder(g.currentPaper());
  assert.equal(g.tapShredder().done, false);
  assert.equal(g.tapShredder().done, true);
  assert.equal(g.index, 1);
  assert.equal(g.currentPaper().id, 'b');
});

test('비어 있는 파쇄기를 tap 해도 값은 그대로', () => {
  const g = make();
  assert.deepEqual(g.tapShredder(), { reduced: 0, done: false, value: 100, justCleared: false });
});

test('큐가 끝나면 currentPaper 는 null', () => {
  const g = createGameState({ start: 100, goal: 20, queue: [burn('a', 5)] });
  g.completeBurn(g.currentPaper());
  assert.equal(g.currentPaper(), null);
});

test('이미 로드되어 있으면 loadShredder 는 false', () => {
  const g = createGameState({ start: 100, goal: 20, queue: [shred('s1'), shred('s2')] });
  assert.equal(g.loadShredder(g.currentPaper()), true);
  assert.equal(g.loadShredder(shred('s2')), false);
});

test('reset 은 모두 되돌린다', () => {
  const g = make();
  for (let i = 0; i < 11; i++) g.completeBurn(g.currentPaper());
  g.loadShredder(g.currentPaper());
  g.tapShredder();
  g.reset();
  assert.equal(g.stress.value, 100);
  assert.equal(g.index, 0);
  assert.equal(g.cleared, false);
  assert.equal(g.shredder.loaded, false);
  assert.equal(g.currentPaper().type, 'resume');
});

test('reset 뒤에는 다시 클리어할 수 있다', () => {
  const g = createGameState({ start: 10, goal: 4, queue: [burn('a', 7)] });
  assert.equal(g.completeBurn(g.currentPaper()).justCleared, true);
  g.reset();
  assert.equal(g.completeBurn(g.currentPaper()).justCleared, true);
});
