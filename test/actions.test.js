import test from 'node:test';
import assert from 'node:assert/strict';
import { ACTIONS, createRunner, stretchDurations, canPerform } from '../src/logic/actions.js';

// 가짜 클립 길이(초). 회전 0.5초 두 번. burn: 회전 .5 + pick-up 1.0 + 회전 .5 + attack 1.0 = 3.0, shred: .5 + 1.0 + .5 + 0.5 = 2.5.
const durations = { 'pick-up': 1.0, 'attack-melee-right': 1.0, 'attack-melee-left': 0.5 };
const make = (extra = {}) => createRunner({ durations, turnSeconds: 0.5, effectAt: 0.5, pickupAt: 0.6, autoGap: 1, ...extra });
const types = (events) => events.map((e) => `${e.type}:${e.action}`);
const noSteps = (events) => events.filter((e) => e.type === 'effect' || e.type === 'done');
const close = (a, b, eps = 0.02) => Math.abs(a - b) < eps;

// dt 단위로 돌리며 이벤트를 [시각, 종류:행동(:단계번호)] 로 모은다.
function simulate(r, seconds, step = 0.01) {
  const log = [];
  let t = 0;
  for (let i = 0; i < Math.round(seconds / step); i++) {
    t += step;
    for (const e of r.update(step)) log.push([Math.round(t * 1000) / 1000, e.type === 'step' ? `step:${e.action}:${e.index}` : `${e.type}:${e.action}`]);
  }
  return log;
}

test('ACTIONS: 두 행동(태우기, 파쇄)만 있고 단계는 종이 더미 보기 -> 줍기 -> 대상 보기 -> 던지기/치기', () => {
  assert.deepEqual(ACTIONS, {
    burn: {
      id: 'burn', label: '태우기', key: '1', clips: ['pick-up', 'attack-melee-right'], target: 'fire',
      steps: [
        { kind: 'turn', target: 'stack' }, { kind: 'clip', name: 'pick-up' },
        { kind: 'turn', target: 'fire' }, { kind: 'clip', name: 'attack-melee-right' },
      ],
    },
    shred: {
      id: 'shred', label: '파쇄', key: '2', clips: ['pick-up', 'attack-melee-left'], target: 'shredder',
      steps: [
        { kind: 'turn', target: 'stack' }, { kind: 'clip', name: 'pick-up' },
        { kind: 'turn', target: 'shredder' }, { kind: 'clip', name: 'attack-melee-left' },
      ],
    },
  });
  assert.equal(ACTIONS.poke, undefined);
});

test('stepsOf: 회전은 turnSeconds, 클립은 넘겨 준 길이', () => {
  const r = make();
  assert.deepEqual(r.stepsOf('burn'), [
    { kind: 'turn', target: 'stack', seconds: 0.5 }, { kind: 'clip', name: 'pick-up', seconds: 1.0 },
    { kind: 'turn', target: 'fire', seconds: 0.5 }, { kind: 'clip', name: 'attack-melee-right', seconds: 1.0 },
  ]);
  assert.deepEqual(r.stepsOf('shred').map((s) => s.seconds), [0.5, 1.0, 0.5, 0.5]);
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

test('총 길이 = 회전 2번 + 클립 길이의 합 (burn 3.0, shred 2.5)', () => {
  const a = make();
  a.start('burn');
  assert.deepEqual(types(noSteps(a.update(2.99))), ['effect:burn']);
  assert.deepEqual(types(noSteps(a.update(0.02))), ['done:burn']);
  const b = make();
  b.start('shred');
  assert.deepEqual(types(noSteps(b.update(2.49))), ['effect:shred']);
  assert.deepEqual(types(noSteps(b.update(0.02))), ['done:shred']);
});

test('이벤트 순서와 시각(burn): step0@0, step1@0.5, pickup@1.1, step2@1.5, step3@2.0, effect@2.5, done@3.0', () => {
  const r = make();
  r.start('burn');
  const log = simulate(r, 3.2, 0.001);
  assert.deepEqual(log.map((l) => l[1]), [
    'step:burn:0', 'step:burn:1', 'pickup:burn', 'step:burn:2', 'step:burn:3', 'effect:burn', 'done:burn',
  ]);
  [0.001, 0.5, 1.1, 1.5, 2.0, 2.5, 3.0].forEach((t, i) => assert.ok(close(log[i][0], t, 0.003), `${i}: ${log[i][0]} vs ${t}`));
});

test('step 이벤트는 단계 내용을 담고, 첫 update(0) 에서 단계 0 이 나온다', () => {
  const r = make();
  r.start('shred');
  const [e] = r.update(0);
  assert.deepEqual(e, { type: 'step', action: 'shred', index: 0, step: { kind: 'turn', target: 'stack', seconds: 0.5 } });
  const ev = r.update(0.5).filter((x) => x.type === 'step');
  assert.deepEqual(ev.map((x) => [x.index, x.step.kind, x.step.name ?? x.step.target]), [[1, 'clip', 'pick-up']]);
});

test('pickup 은 pick-up 클립 단계의 60% 에서 한 번, 효과는 마지막 단계의 effectAt 에서', () => {
  const r = make({ effectAt: 0.25 }); // shred: 마지막 단계 0.5초 시작 2.0 -> 효과 2.125
  r.start('shred');
  const log = simulate(r, 2.6, 0.001);
  assert.ok(close(log.find((l) => l[1] === 'pickup:shred')[0], 1.1, 0.003));
  assert.ok(close(log.find((l) => l[1] === 'effect:shred')[0], 2.125, 0.003));
  assert.equal(log.filter((l) => l[1] === 'pickup:shred').length, 1);
});

test('아주 큰 dt 도 모든 이벤트가 정확히 한 번씩, 순서대로', () => {
  const r = make();
  r.start('burn');
  assert.deepEqual(types(r.update(1000)), [
    'step:burn', 'step:burn', 'pickup:burn', 'step:burn', 'step:burn', 'effect:burn', 'done:burn',
  ]);
  assert.deepEqual(r.update(1000), []);
  assert.equal(r.isBusy(), false);
});

test('한 번의 update 가 여러 단계를 넘어가도 순서가 유지된다', () => {
  const r = make();
  r.start('burn');
  const ev = r.update(1.6); // 단계 0,1 완료, pickup, 단계 2 시작
  assert.deepEqual(types(ev), ['step:burn', 'step:burn', 'pickup:burn', 'step:burn']);
  assert.deepEqual(ev.filter((e) => e.type === 'step').map((e) => e.index), [0, 1, 2]);
});

test('progress: 0~1, 쉬는 중에는 0', () => {
  const r = make();
  assert.equal(r.progress(), 0);
  r.start('burn'); // 3.0
  r.update(0.75);
  assert.ok(Math.abs(r.progress() - 0.25) < 1e-9);
  r.update(5);
  assert.equal(r.progress(), 0);
});

test('알 수 없는 클립 길이와 turnSeconds 생략은 0 으로 취급', () => {
  const r = createRunner({ durations: {}, effectAt: 0.5, pickupAt: 0.6, autoGap: 1 });
  r.start('burn');
  assert.deepEqual(types(noSteps(r.update(0))), ['effect:burn', 'done:burn']);
});

test('abort: 진행 중인 행동을 이벤트 없이 끊고, 자동도 끈다', () => {
  const r = make();
  r.setAuto(true);
  r.update(1);
  assert.equal(r.isBusy(), true);
  r.abort();
  assert.equal(r.isBusy(), false);
  assert.equal(r.autoOn, false);
  assert.deepEqual(r.update(10), []);
  assert.equal(r.start('shred'), true); // 다시 시작할 수 있다
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
  const r = make(); // burn 3.0, shred 2.5, gap 1
  r.setAuto(true);
  assert.equal(r.autoOn, true);
  const log = simulate(r, 20).filter((l) => /^(effect|done)/.test(l[1]));
  // 0 시작 -> 효과 2.5, 끝 3.0 -> 4.0 시작(파쇄) -> 효과 6.25, 끝 6.5 -> 7.5 시작(태우기) -> 효과 10.0, 끝 10.5 ...
  assert.deepEqual(log.map((l) => l[1]).slice(0, 6), ['effect:burn', 'done:burn', 'effect:shred', 'done:shred', 'effect:burn', 'done:burn']);
  assert.ok(close(log[0][0], 2.5), JSON.stringify(log));
  assert.ok(close(log[1][0], 3.0));
  assert.ok(close(log[2][0], 6.25));
  assert.ok(close(log[3][0], 6.5));
  assert.ok(close(log[4][0], 10.0));
});

test('자동: 이미 한 행동이 있으면 그 반대로 시작한다', () => {
  const r = make();
  r.start('burn');
  r.update(3.5); // 끝남(끝난 뒤 0.5초가 쉬는 시간으로 센다)
  r.setAuto(true);
  const log = simulate(r, 4);
  const effect = log.find((l) => l[1] === 'effect:shred');
  assert.ok(effect, JSON.stringify(log));
  // 0.5초 더 기다린 뒤 시작 -> 효과는 2.25 뒤
  assert.ok(close(effect[0], 0.5 + 2.25), JSON.stringify(log));
});

test('자동은 겹치지 않는다: 항상 effect, done 이 번갈아 나온다', () => {
  const r = createRunner({ durations: { 'pick-up': 3, 'attack-melee-right': 3, 'attack-melee-left': 4 }, turnSeconds: 0.5, effectAt: 0.5, pickupAt: 0.6, autoGap: 1 });
  r.setAuto(true);
  const seq = simulate(r, 80).filter((l) => /^(effect|done)/.test(l[1])).map((l) => l[1].split(':')[0]);
  seq.forEach((type, i) => assert.equal(type, i % 2 === 0 ? 'effect' : 'done', seq.join()));
  assert.ok(seq.filter((t) => t === 'done').length >= 6);
});

test('자동 쉬는 시간은 끝난 시점부터 잰다(시작 간격이 아니다)', () => {
  const r = make({ autoGap: 3 });
  r.setAuto(true);
  const log = simulate(r, 14);
  const done = log.find((l) => l[1] === 'done:burn')[0]; // 3.0
  const nextStep = log.find((l) => l[1] === 'step:shred:0')[0];
  assert.ok(close(nextStep, done + 3), JSON.stringify(log));
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
  r.update(0.5);
  r.cancelAuto();
  assert.deepEqual(types(noSteps(r.update(2.1))), ['effect:burn']);
  assert.deepEqual(types(noSteps(r.update(1.0))), ['done:burn']);
  assert.deepEqual(simulate(r, 10), []);
});

test('canStart: 다음 행동을 시작할 수 없으면(사정거리 밖 등) 자동이 꺼진다', () => {
  let allowShred = true;
  const asked = [];
  const r = make({ canStart: (id) => { asked.push(id); return id !== 'shred' || allowShred; } });
  r.setAuto(true);
  r.update(0.1); // 태우기 시작
  allowShred = false;
  const log = simulate(r, 12).filter((l) => /^(effect|done)/.test(l[1]));
  assert.deepEqual(log.map((l) => l[1]), ['effect:burn', 'done:burn']); // 파쇄는 시작되지 않는다
  assert.equal(r.autoOn, false);
  assert.deepEqual(asked, ['burn', 'shred']);
  assert.equal(r.isBusy(), false);
});

test('canStart 는 수동 start 에는 쓰이지 않는다', () => {
  const r = make({ canStart: () => false });
  assert.equal(r.start('burn'), true);
});

test('아주 큰 dt 에서도 자동이 무한 반복하지 않고 이벤트 순서가 유지된다', () => {
  const r = make({ autoGap: 0 });
  r.setAuto(true);
  const ev = noSteps(r.update(1000));
  assert.ok(ev.length > 0 && ev.length <= 400);
  ev.forEach((e, i) => assert.equal(e.type, i % 2 === 0 ? 'effect' : 'done'));
});

test('stretchDurations: 행동마다 (회전 제외) 클립 합이 원래 합 + extra 가 되도록 클립 길이를 비례해서 늘린다', () => {
  const raw = { 'pick-up': 0.333, 'attack-melee-right': 0.417, 'attack-melee-left': 0.417 };
  const { durations: d, speeds } = stretchDurations(raw, 3);
  const sum = (names) => names.reduce((s, n) => s + d[n], 0);
  assert.ok(close(sum(ACTIONS.burn.clips), 0.75 + 3, 1e-9));
  assert.ok(close(sum(ACTIONS.shred.clips), 0.75 + 3, 1e-9));
  assert.ok(close(speeds.burn, 0.75 / 3.75, 1e-9));
  // 비례: 길이 비가 원래와 같다
  assert.ok(close(d['pick-up'] / d['attack-melee-right'], 0.333 / 0.417, 1e-9));
  // extra 가 0 이면 그대로
  assert.deepEqual(stretchDurations(raw, 0).durations, raw);
});

test('총 행동 시간 = 회전 2번 + 클립 합 + 3초 (실제 클립 길이)', () => {
  const raw = { 'pick-up': 1 / 3, 'attack-melee-right': 5 / 12, 'attack-melee-left': 5 / 12 };
  const { durations: d } = stretchDurations(raw, 3);
  const r = createRunner({ durations: d, turnSeconds: 0.5, effectAt: 0.45, pickupAt: 0.6, autoGap: 1 });
  r.start('burn');
  const expected = 2 * 0.5 + 0.75 + 3; // 4.75
  assert.deepEqual(types(noSteps(r.update(expected - 0.01))), ['effect:burn']);
  assert.deepEqual(types(noSteps(r.update(0.02))), ['done:burn']);
});

test('canPerform: 태우기는 소각로+종이 더미, 파쇄는 파쇄기+종이 더미가 모두 사정거리 안일 때만', () => {
  const ranges = { fire: 4, shredder: 4, stack: 4 };
  const near = { fire: 2, shredder: 2, stack: 2 };
  assert.equal(canPerform('burn', near, ranges), true);
  assert.equal(canPerform('shred', near, ranges), true);
  assert.equal(canPerform('burn', { ...near, fire: 4.01 }, ranges), false);
  assert.equal(canPerform('burn', { ...near, shredder: 99 }, ranges), true); // 파쇄기는 상관없다
  assert.equal(canPerform('shred', { ...near, shredder: 4.01 }, ranges), false);
  assert.equal(canPerform('shred', { ...near, fire: 99 }, ranges), true);
  assert.equal(canPerform('burn', { ...near, stack: 4.01 }, ranges), false);
  assert.equal(canPerform('shred', { ...near, stack: 4.01 }, ranges), false);
  assert.equal(canPerform('burn', { ...near, stack: 4 }, ranges), true); // 경계 포함
  assert.equal(canPerform('poke', near, ranges), false);
});
