import test from 'node:test';
import assert from 'node:assert/strict';
import { ACTIONS, createRunner } from '../src/logic/actions.js';

// 가짜 클립 길이(초): 합계 burn 2.0, shred 1.5.
const durations = { 'pick-up': 1.0, 'attack-melee-right': 1.0, 'attack-melee-left': 0.5 };
const make = (extra = {}) => createRunner({ durations, effectAt: 0.5, autoGap: 1, ...extra });
const types = (events) => events.map((e) => `${e.type}:${e.action}`);

// 자동 반복을 dt 단위로 돌리며 이벤트를 [시각, 종류:행동] 로 모은다.
function simulate(r, seconds, step = 0.01) {
  const log = [];
  let t = 0;
  for (let i = 0; i < Math.round(seconds / step); i++) {
    t += step;
    for (const e of r.update(step)) log.push([Math.round(t * 100) / 100, `${e.type}:${e.action}`]);
  }
  return log;
}

test('ACTIONS: 두 행동(태우기, 파쇄)만 있다', () => {
  assert.deepEqual(ACTIONS, {
    burn: { id: 'burn', label: '태우기', key: '1', clips: ['pick-up', 'attack-melee-right'], target: 'fire' },
    shred: { id: 'shred', label: '파쇄', key: '2', clips: ['pick-up', 'attack-melee-left'], target: 'shredder' },
  });
  assert.equal(ACTIONS.poke, undefined);
});

test('start: 처음에는 true 이고 바쁨 상태가 된다', () => {
  const r = make();
  assert.equal(r.isBusy(), false);
  assert.equal(r.start('burn'), true);
  assert.equal(r.isBusy(), true);
});

test('start: 알 수 없는 id(불쏘시개 포함)는 false 이고 lastActionId 를 바꾸지 않는다', () => {
  const r = make();
  assert.equal(r.start('dance'), false);
  assert.equal(r.start('poke'), false);
  assert.equal(r.isBusy(), false);
  assert.equal(r.lastActionId, null);
});

test('start: 바쁜 동안은 false 이고 lastActionId 를 바꾸지 않는다', () => {
  const r = make();
  assert.equal(r.start('burn'), true);
  assert.equal(r.start('shred'), false);
  assert.equal(r.lastActionId, 'burn');
});

test('lastActionId: 처음엔 null, 시작할 때마다 갱신', () => {
  const r = make();
  assert.equal(r.lastActionId, null);
  r.start('shred');
  assert.equal(r.lastActionId, 'shred');
});

test('효과 시점: 전체 길이 × effectAt 에서 정확히 한 번, done 보다 먼저', () => {
  const r = make(); // burn 합계 2.0, effect 1.0
  r.start('burn');
  assert.deepEqual(r.update(0.9), []);
  assert.deepEqual(types(r.update(0.2)), ['effect:burn']); // 경과 1.1
  assert.deepEqual(r.update(0.5), []); // 경과 1.6
  assert.deepEqual(types(r.update(0.5)), ['done:burn']); // 경과 2.1 >= 2.0
  assert.equal(r.isBusy(), false);
  assert.deepEqual(r.update(1), []);
});

test('효과 시점 경계(경과 == effectAt × 합계)에서 발생', () => {
  const r = make();
  r.start('shred'); // 합계 1.5, effect 0.75
  assert.deepEqual(types(r.update(0.75)), ['effect:shred']);
  assert.deepEqual(types(r.update(0.75)), ['done:shred']);
});

test('한 번의 update 로 효과와 끝이 모두 지나가면 순서대로 둘 다', () => {
  const r = make();
  r.start('shred');
  assert.deepEqual(types(r.update(1.7)), ['effect:shred', 'done:shred']);
});

test('아주 큰 dt 도 effect 와 done 이 정확히 한 번씩', () => {
  const r = make();
  r.start('burn');
  assert.deepEqual(types(r.update(1000)), ['effect:burn', 'done:burn']);
  assert.deepEqual(r.update(1000), []);
  assert.equal(r.isBusy(), false);
});

test('늘어난 길이에서 효과 비율과 끝 시각', () => {
  const r = createRunner({ durations: { 'pick-up': 1.667, 'attack-melee-right': 2.083 }, effectAt: 0.55, autoGap: 1 });
  r.start('burn'); // 합계 3.75, 효과 2.0625
  assert.deepEqual(r.update(2.0), []);
  assert.deepEqual(types(r.update(0.1)), ['effect:burn']);
  assert.deepEqual(r.update(1.5), []);
  assert.deepEqual(types(r.update(0.2)), ['done:burn']);
});

test('progress: 0~1, 쉬는 중에는 0', () => {
  const r = make();
  assert.equal(r.progress(), 0);
  r.start('burn'); // 2.0
  r.update(0.5);
  assert.ok(Math.abs(r.progress() - 0.25) < 1e-9);
  r.update(5);
  assert.equal(r.progress(), 0);
});

test('알 수 없는 클립 길이는 0 으로 취급(합계에서 빠진다)', () => {
  const r = createRunner({ durations: {}, effectAt: 0.5, autoGap: 1 });
  r.start('burn');
  assert.deepEqual(types(r.update(0)), ['effect:burn', 'done:burn']);
});

test('nextAutoAction: 기록이 없으면 태우기, 그 뒤로는 마지막의 반대', () => {
  const r = make();
  assert.equal(r.nextAutoAction(), 'burn');
  r.start('burn');
  assert.equal(r.nextAutoAction(), 'shred');
  r.update(5);
  r.start('shred');
  assert.equal(r.nextAutoAction(), 'burn');
});

test('자동: 켜자마자(기록 없음) 태우기를 시작하고, 끝나면 1초 쉰 뒤 파쇄, 다시 태우기 ... 번갈아 한다', () => {
  const r = make(); // burn 2.0, shred 1.5, gap 1
  r.setAuto(true);
  assert.equal(r.autoOn, true);
  const log = simulate(r, 12);
  // 0 시작 -> 효과 1.0, 끝 2.0 -> 3.0 시작(파쇄) -> 효과 3.75, 끝 4.5 -> 5.5 시작(태우기) -> 효과 6.5, 끝 7.5 -> 8.5 시작(파쇄) ...
  assert.deepEqual(log.map((l) => l[1]).slice(0, 8), [
    'effect:burn', 'done:burn', 'effect:shred', 'done:shred', 'effect:burn', 'done:burn', 'effect:shred', 'done:shred',
  ]);
  const close = (a, b) => Math.abs(a - b) < 0.02;
  assert.ok(close(log[0][0], 1.0), JSON.stringify(log));
  assert.ok(close(log[1][0], 2.0));
  assert.ok(close(log[2][0], 3.75)); // 끝 2.0 + 쉬는 1.0 + 파쇄 효과 0.75
  assert.ok(close(log[3][0], 4.5));
  assert.ok(close(log[4][0], 6.5));
});

test('자동: 이미 한 행동이 있으면 그 반대로 시작한다', () => {
  const r = make();
  r.start('burn');
  r.update(2.5); // 끝남(끝난 뒤 0.5초가 쉬는 시간으로 센다)
  r.setAuto(true);
  const log = simulate(r, 3);
  assert.equal(log[0][1], 'effect:shred');
  // 끝난 지 1초가 되는 시각(0.5초 더 기다림)에 시작 -> 효과는 +0.75
  assert.ok(Math.abs(log[0][0] - (0.5 + 0.75)) < 0.02, JSON.stringify(log));
});

test('자동은 겹치지 않는다: 항상 effect, done 이 번갈아 나온다', () => {
  const r = createRunner({ durations: { 'pick-up': 3, 'attack-melee-right': 3, 'attack-melee-left': 4 }, effectAt: 0.5, autoGap: 1 });
  r.setAuto(true);
  const seq = simulate(r, 60).map((l) => l[1].split(':')[0]);
  seq.forEach((type, i) => assert.equal(type, i % 2 === 0 ? 'effect' : 'done', seq.join()));
  assert.ok(seq.filter((t) => t === 'done').length >= 6);
});

test('자동 쉬는 시간은 끝난 시점부터 잰다(시작 간격이 아니다)', () => {
  const r = make({ autoGap: 3 });
  r.setAuto(true);
  const log = simulate(r, 12);
  const done = log.find((l) => l[1] === 'done:burn')[0]; // 2.0
  const nextEffect = log.find((l) => l[1] === 'effect:shred')[0];
  assert.ok(Math.abs(nextEffect - (done + 3 + 0.75)) < 0.02, JSON.stringify(log));
});

test('setAuto(false)/cancelAuto 는 자동 반복을 멈춘다', () => {
  const r = make();
  r.setAuto(true);
  r.setAuto(false);
  assert.equal(r.autoOn, false);
  assert.deepEqual(simulate(r, 10), []);
  r.setAuto(true);
  r.cancelAuto();
  assert.equal(r.autoOn, false);
  assert.deepEqual(simulate(r, 10), []);
});

test('자동을 껐을 때 진행 중인 행동은 끝까지 가고 다음은 시작하지 않는다', () => {
  const r = make();
  r.setAuto(true);
  r.update(0.5); // 태우기 진행 중
  r.cancelAuto();
  assert.deepEqual(types(r.update(0.6)), ['effect:burn']);
  assert.deepEqual(types(r.update(1.0)), ['done:burn']);
  assert.deepEqual(simulate(r, 10), []);
});

test('canStart: 다음 행동을 시작할 수 없으면(사정거리 밖 등) 자동이 꺼진다', () => {
  let allowShred = true;
  const asked = [];
  const r = make({ canStart: (id) => { asked.push(id); return id !== 'shred' || allowShred; } });
  r.setAuto(true);
  r.update(0.1); // 태우기 시작
  allowShred = false;
  const log = simulate(r, 10);
  assert.deepEqual(log.map((l) => l[1]), ['effect:burn', 'done:burn']); // 파쇄는 시작되지 않는다
  assert.equal(r.autoOn, false);
  assert.deepEqual(asked, ['burn', 'shred']);
  assert.equal(r.isBusy(), false);
});

test('canStart 는 수동 start 에는 쓰이지 않는다', () => {
  const r = make({ canStart: () => false });
  assert.equal(r.start('burn'), true);
});

test('startedCount: 시작할 때마다(수동·자동) 1 늘고, 거절된 시작은 늘지 않는다', () => {
  const r = make();
  assert.equal(r.startedCount, 0);
  r.start('burn');
  assert.equal(r.startedCount, 1);
  r.start('shred'); // 바쁨 -> 거절
  r.start('nope');
  assert.equal(r.startedCount, 1);
  r.update(2.1); // 끝
  r.setAuto(true);
  r.update(1); // 자동 시작(파쇄)
  assert.equal(r.startedCount, 2);
  assert.equal(r.lastActionId, 'shred');
});

test('아주 큰 dt 에서도 자동이 무한 반복하지 않고 이벤트 순서가 유지된다', () => {
  const r = make({ autoGap: 0 });
  r.setAuto(true);
  const ev = r.update(1000);
  assert.ok(ev.length > 0 && ev.length <= 400);
  ev.forEach((e, i) => assert.equal(e.type, i % 2 === 0 ? 'effect' : 'done'));
});
