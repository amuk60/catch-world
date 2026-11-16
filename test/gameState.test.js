import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameState } from '../src/logic/gameState.js';
import { STRESS, ACTION_REDUCE } from '../src/config.js';

const make = () => createGameState({ ...STRESS });
// 감소량(ACTION_REDUCE)에서 유도하는 값: 목표(<= goal)가 되는 번째, 0 이 되는 번째.
const GOAL_AT = Math.ceil((STRESS.start - STRESS.goal) / ACTION_REDUCE);
const EMPTY_AT = Math.ceil(STRESS.start / ACTION_REDUCE);
const valueAt = (n) => Math.max(0, STRESS.start - n * ACTION_REDUCE);

test('초기 상태: 시작값, 클리어 아님, 행동 0회', () => {
  const g = make();
  assert.equal(g.stress.value, 100);
  assert.equal(g.stress.start, 100);
  assert.equal(g.stress.goal, 20);
  assert.equal(g.cleared, false);
  assert.equal(g.actionsDone, 0);
});

test('행동 하나의 감소량은 5 이다(사용자가 정함)', () => {
  assert.equal(ACTION_REDUCE, 5);
});

test('apply 는 줄이고 { value, justGoal, justEmpty } 를 돌려준다', () => {
  const g = make();
  assert.deepEqual(g.apply(ACTION_REDUCE), { value: valueAt(1), justGoal: false, justEmpty: false });
  assert.equal(g.stress.value, STRESS.start - ACTION_REDUCE);
  assert.equal(g.actionsDone, 1);
});

test('목표 번째에 목표 이하, 바로 앞은 목표 위, 0 번째부터 0 이고 그 뒤로도 0', () => {
  const g = make();
  const at = {};
  for (let i = 1; i <= EMPTY_AT + 6; i++) at[i] = g.apply(ACTION_REDUCE).value;
  assert.ok(at[GOAL_AT - 1] > STRESS.goal);
  assert.ok(at[GOAL_AT] <= STRESS.goal);
  assert.equal(at[GOAL_AT], valueAt(GOAL_AT));
  assert.ok(at[EMPTY_AT - 1] > 0);
  assert.equal(at[EMPTY_AT], 0);
  assert.equal(at[EMPTY_AT + 6], 0);
  assert.equal(g.actionsDone, EMPTY_AT + 6);
});

test('justGoal 는 목표(20) 이하가 되는 순간 정확히 한 번', () => {
  const g = make();
  const fired = [];
  for (let i = 1; i <= EMPTY_AT + 6; i++) if (g.apply(ACTION_REDUCE).justGoal) fired.push(i);
  assert.deepEqual(fired, [GOAL_AT]);
  assert.equal(g.cleared, true);
});

test('목표를 정확히 맞추면(<=) 클리어', () => {
  const g = createGameState({ start: 24, goal: 20 });
  assert.deepEqual(g.apply(4), { value: 20, justGoal: true, justEmpty: false });
});

test('목표를 넘어 한 번에 크게 줄어도 한 번만', () => {
  const g = createGameState({ start: 10, goal: 4 });
  assert.equal(g.apply(7).justGoal, true);
  assert.equal(g.apply(7).justGoal, false);
  assert.equal(g.stress.value, 0);
});

test('클리어 뒤에도 계속 줄고 다시는 justGoal 가 없다', () => {
  const g = make();
  for (let i = 0; i < GOAL_AT; i++) g.apply(ACTION_REDUCE);
  const after = [];
  for (let i = 1; i <= EMPTY_AT - GOAL_AT + 4; i++) after.push(g.apply(ACTION_REDUCE));
  assert.ok(after.every((r) => r.justGoal === false));
  assert.deepEqual(after.map((r) => r.value), after.map((_, i) => valueAt(GOAL_AT + i + 1)));
  assert.equal(after.at(-1).value, 0);
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
  for (let i = 0; i < 30; i++) if (g.apply(ACTION_REDUCE).justGoal) fired++;
  assert.equal(fired, 1);
});

test('옛 종이 큐·파쇄기 상태는 없다', () => {
  const g = make();
  for (const k of ['queue', 'shredder', 'index', 'currentPaper', 'completeBurn', 'tapShredder', 'loadShredder']) {
    assert.equal(g[k], undefined, k);
  }
});

test('apply(amount, { counts: false }) 는 줄이되 행동 횟수에는 넣지 않는다(자동 감소 같은 가벼운 보너스)', () => {
  const g = make();
  g.apply(2, { counts: false });
  assert.equal(g.stress.value, 98);
  assert.equal(g.actionsDone, 0);
  g.apply(ACTION_REDUCE);
  assert.equal(g.actionsDone, 1);
});

test('justEmpty 는 값이 처음 0 이 되는 호출에서 정확히 한 번, justGoal 은 목표 번째', () => {
  const g = make();
  const goal = [];
  const empty = [];
  for (let i = 1; i <= EMPTY_AT + 6; i++) {
    const r = g.apply(ACTION_REDUCE);
    if (r.justGoal) goal.push(i);
    if (r.justEmpty) empty.push(i);
  }
  assert.deepEqual(goal, [GOAL_AT]);
  assert.deepEqual(empty, [EMPTY_AT]);
  assert.equal(g.emptied, true);
});

test('한 번에 목표 위에서 0 으로 떨어지면 justGoal 과 justEmpty 가 같은 호출에서 둘 다 true', () => {
  const g = createGameState({ start: 100, goal: 20 });
  assert.deepEqual(g.apply(100), { value: 0, justGoal: true, justEmpty: true });
  assert.deepEqual(g.apply(5), { value: 0, justGoal: false, justEmpty: false });
});

test('이미 0 인 상태에서 더 줄여도 justEmpty 가 다시 나오지 않는다', () => {
  const g = createGameState({ start: 5, goal: 2 });
  assert.equal(g.apply(5).justEmpty, true);
  assert.equal(g.apply(5).justEmpty, false);
});

test('reset 은 emptied 도 지우고 두 신호가 다음 판에 다시 나온다', () => {
  const g = make();
  for (let i = 0; i < 40; i++) g.apply(ACTION_REDUCE);
  g.reset();
  assert.equal(g.emptied, false);
  assert.equal(g.cleared, false);
  let goal = 0;
  let empty = 0;
  for (let i = 0; i < 40; i++) {
    const r = g.apply(ACTION_REDUCE);
    if (r.justGoal) goal++;
    if (r.justEmpty) empty++;
  }
  assert.deepEqual([goal, empty], [1, 1]);
});
