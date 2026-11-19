import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameState } from '../src/logic/gameState.js';
import { STRESS, REDUCE_RANGE } from '../src/config.js';
import { rollReduction } from '../src/logic/stressRoll.js';

const make = () => createGameState({ ...STRESS });
// 감소량은 행동마다 REDUCE_RANGE 안에서 무작위로 뽑는다. 테스트는 난수를 고정해 양끝 값(최소 7, 최대 12)으로 확인한다.
const MIN_ROLL = () => rollReduction(() => 0, REDUCE_RANGE);
const MAX_ROLL = () => rollReduction(() => 0.999999, REDUCE_RANGE);
// 같은 양 a 로 계속 줄일 때: 목표(<= goal)가 되는 번째, 0 이 되는 번째, n 번째 뒤의 값.
const goalAt = (a) => Math.ceil((STRESS.start - STRESS.goal) / a);
const emptyAt = (a) => Math.ceil(STRESS.start / a);
const valueAt = (n, a) => Math.max(0, STRESS.start - n * a);
const EXTREMES = [['최소', MIN_ROLL], ['최대', MAX_ROLL]];

test('초기 상태: 시작값, 클리어 아님, 행동 0회', () => {
  const g = make();
  assert.equal(g.stress.value, 100);
  assert.equal(g.stress.start, 100);
  assert.equal(g.stress.goal, 20);
  assert.equal(g.cleared, false);
  assert.equal(g.actionsDone, 0);
});

test('감소량 범위는 7~12 이고 양끝 값에서 목표까지 12번(7)·7번(12), 0 까지 15번·9번이다', () => {
  assert.deepEqual(REDUCE_RANGE, { min: 7, max: 12 });
  assert.equal(MIN_ROLL(), 7);
  assert.equal(MAX_ROLL(), 12);
  assert.deepEqual([goalAt(7), goalAt(12)], [12, 7]);
  assert.deepEqual([emptyAt(7), emptyAt(12)], [15, 9]);
});

test('apply 는 줄이고 { value, justGoal, justEmpty } 를 돌려준다', () => {
  for (const [label, roll] of EXTREMES) {
    const a = roll();
    const g = make();
    assert.deepEqual(g.apply(a), { value: valueAt(1, a), justGoal: false, justEmpty: false }, label);
    assert.equal(g.stress.value, STRESS.start - a);
    assert.equal(g.actionsDone, 1);
  }
});

test('목표 번째에 목표 이하, 바로 앞은 목표 위, 0 번째부터 0 이고 그 뒤로도 0 (양끝 감소량)', () => {
  for (const [label, roll] of EXTREMES) {
    const a = roll();
    const g = make();
    const at = {};
    for (let i = 1; i <= emptyAt(a) + 6; i++) at[i] = g.apply(a).value;
    assert.ok(at[goalAt(a) - 1] > STRESS.goal, label);
    assert.ok(at[goalAt(a)] <= STRESS.goal, label);
    assert.equal(at[goalAt(a)], valueAt(goalAt(a), a), label);
    assert.ok(at[emptyAt(a) - 1] > 0, label);
    assert.equal(at[emptyAt(a)], 0, label);
    assert.equal(at[emptyAt(a) + 6], 0, label);
    assert.equal(g.actionsDone, emptyAt(a) + 6);
  }
});

test('justGoal 는 목표(20) 이하가 되는 순간 정확히 한 번 (양끝 감소량)', () => {
  for (const [label, roll] of EXTREMES) {
    const a = roll();
    const g = make();
    const fired = [];
    for (let i = 1; i <= emptyAt(a) + 6; i++) if (g.apply(a).justGoal) fired.push(i);
    assert.deepEqual(fired, [goalAt(a)], label);
    assert.equal(g.cleared, true);
  }
});

test('매번 다른 감소량(7~12 아무 값)이어도 justGoal·justEmpty 는 각각 정확히 한 번', () => {
  const seq = [7, 12, 8, 11, 9, 10]; // 고정 순서로 돌려 가며 소진한다.
  const g = make();
  let goal = 0;
  let empty = 0;
  for (let i = 0; i < 40; i++) {
    const r = g.apply(rollReduction(() => (seq[i % seq.length] - 7 + 0.5) / 6, REDUCE_RANGE));
    if (r.justGoal) goal++;
    if (r.justEmpty) empty++;
  }
  assert.deepEqual([goal, empty], [1, 1]);
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
  for (const [label, roll] of EXTREMES) {
    const a = roll();
    const g = make();
    for (let i = 0; i < goalAt(a); i++) g.apply(a);
    const after = [];
    for (let i = 1; i <= emptyAt(a) - goalAt(a) + 4; i++) after.push(g.apply(a));
    assert.ok(after.every((r) => r.justGoal === false), label);
    assert.deepEqual(after.map((r) => r.value), after.map((_, i) => valueAt(goalAt(a) + i + 1, a)), label);
    assert.equal(after.at(-1).value, 0);
  }
});

test('0 아래로 내려가지 않는다', () => {
  const g = createGameState({ start: 3, goal: 1 });
  assert.equal(g.apply(10).value, 0);
  assert.equal(g.apply(10).value, 0);
  assert.equal(g.stress.value, 0);
});

test('reset 은 시작값·클리어 아님·행동 0회로 되돌리고 다시 클리어할 수 있다', () => {
  const g = make();
  for (let i = 0; i < 30; i++) g.apply(MIN_ROLL());
  g.reset();
  assert.equal(g.stress.value, 100);
  assert.equal(g.cleared, false);
  assert.equal(g.actionsDone, 0);
  let fired = 0;
  for (let i = 0; i < 30; i++) if (g.apply(MIN_ROLL()).justGoal) fired++;
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
  g.apply(MIN_ROLL());
  assert.equal(g.actionsDone, 1);
});

test('justEmpty 는 값이 처음 0 이 되는 호출에서 정확히 한 번, justGoal 은 목표 번째 (양끝 감소량)', () => {
  for (const [label, roll] of EXTREMES) {
    const a = roll();
    const g = make();
    const goal = [];
    const empty = [];
    for (let i = 1; i <= emptyAt(a) + 6; i++) {
      const r = g.apply(a);
      if (r.justGoal) goal.push(i);
      if (r.justEmpty) empty.push(i);
    }
    assert.deepEqual(goal, [goalAt(a)], label);
    assert.deepEqual(empty, [emptyAt(a)], label);
    assert.equal(g.emptied, true);
  }
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
  for (let i = 0; i < 40; i++) g.apply(MIN_ROLL());
  g.reset();
  assert.equal(g.emptied, false);
  assert.equal(g.cleared, false);
  let goal = 0;
  let empty = 0;
  for (let i = 0; i < 40; i++) {
    const r = g.apply(MIN_ROLL());
    if (r.justGoal) goal++;
    if (r.justEmpty) empty++;
  }
  assert.deepEqual([goal, empty], [1, 1]);
});
