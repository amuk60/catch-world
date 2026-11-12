import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameState } from '../src/logic/gameState.js';
import { STRESS, ACTION_REDUCE } from '../src/config.js';

const make = () => createGameState({ ...STRESS });

test('초기 상태: 시작값, 클리어 아님, 행동 0회', () => {
  const g = make();
  assert.equal(g.stress.value, 100);
  assert.equal(g.stress.start, 100);
  assert.equal(g.stress.goal, 20);
  assert.equal(g.cleared, false);
  assert.equal(g.actionsDone, 0);
});

test('행동 하나의 감소량은 3 이다', () => {
  assert.equal(ACTION_REDUCE, 3);
});

test('apply 는 줄이고 { value, justCleared } 를 돌려준다', () => {
  const g = make();
  assert.deepEqual(g.apply(ACTION_REDUCE), { value: 97, justCleared: false });
  assert.equal(g.stress.value, 97);
  assert.equal(g.actionsDone, 1);
});

test('27번이면 목표(20) 이하, 33번이면 1, 34번이면 0 이고 그 뒤로도 0', () => {
  const g = make();
  const at = {};
  for (let i = 1; i <= 40; i++) at[i] = g.apply(ACTION_REDUCE).value;
  assert.equal(at[26], 22);
  assert.equal(at[27], 19);
  assert.equal(at[33], 1);
  assert.equal(at[34], 0);
  assert.equal(at[40], 0);
  assert.equal(g.actionsDone, 40);
});

test('justCleared 는 목표(20) 이하가 되는 순간 정확히 한 번(27번째)', () => {
  const g = make();
  const fired = [];
  for (let i = 1; i <= 40; i++) if (g.apply(ACTION_REDUCE).justCleared) fired.push(i);
  assert.deepEqual(fired, [27]);
  assert.equal(g.cleared, true);
});

test('목표를 정확히 맞추면(<=) 클리어', () => {
  const g = createGameState({ start: 24, goal: 20 });
  assert.deepEqual(g.apply(4), { value: 20, justCleared: true });
});

test('목표를 넘어 한 번에 크게 줄어도 한 번만', () => {
  const g = createGameState({ start: 10, goal: 4 });
  assert.equal(g.apply(7).justCleared, true);
  assert.equal(g.apply(7).justCleared, false);
  assert.equal(g.stress.value, 0);
});

test('클리어 뒤에도 계속 줄고 다시는 justCleared 가 없다', () => {
  const g = make();
  for (let i = 0; i < 27; i++) g.apply(ACTION_REDUCE);
  const after = [];
  for (let i = 0; i < 10; i++) after.push(g.apply(ACTION_REDUCE));
  assert.ok(after.every((r) => r.justCleared === false));
  assert.deepEqual(after.map((r) => r.value), [16, 13, 10, 7, 4, 1, 0, 0, 0, 0]);
});

test('0 아래로 내려가지 않는다', () => {
  const g = createGameState({ start: 3, goal: 1 });
  assert.equal(g.apply(10).value, 0);
  assert.equal(g.apply(10).value, 0);
  assert.equal(g.stress.value, 0);
});

test('reset 은 시작값·클리어 아님·행동 0회로 되돌리고 다시 클리어할 수 있다', () => {
  const g = make();
  for (let i = 0; i < 30; i++) g.apply(ACTION_REDUCE);
  g.reset();
  assert.equal(g.stress.value, 100);
  assert.equal(g.cleared, false);
  assert.equal(g.actionsDone, 0);
  let fired = 0;
  for (let i = 0; i < 30; i++) if (g.apply(ACTION_REDUCE).justCleared) fired++;
  assert.equal(fired, 1);
});

test('옛 종이 큐·파쇄기 상태는 없다', () => {
  const g = make();
  for (const k of ['queue', 'shredder', 'index', 'currentPaper', 'completeBurn', 'tapShredder', 'loadShredder']) {
    assert.equal(g[k], undefined, k);
  }
});

test('apply(amount, { counts: false }) 는 줄이되 행동 횟수에는 넣지 않는다(불멍 자동 감소)', () => {
  const g = make();
  g.apply(2, { counts: false });
  assert.equal(g.stress.value, 98);
  assert.equal(g.actionsDone, 0);
  g.apply(ACTION_REDUCE);
  assert.equal(g.actionsDone, 1);
});
