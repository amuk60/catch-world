import test from 'node:test';
import assert from 'node:assert/strict';
import { ACTIONS, createRunner, fitDurations, canPerform } from '../src/logic/actions.js';

// 가짜 클립 길이(초). 회전 0.5초 한 번.
// 두 행동 모두 종이를 든 오른손으로 휘두른다(attack-melee-right): emote-no 1 + pick-up 1 + 회전 .5 + attack 1 + emote-yes 1 = 4.5.
const durations = { 'emote-no': 1.0, 'pick-up': 1.0, 'attack-melee-right': 1.0, 'emote-yes': 1.0 };
const make = (extra = {}) => createRunner({ durations, turnSeconds: 0.5, effectAt: 0.5, autoGap: 1, ...extra });
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

const BURN_STEPS = [
  { kind: 'clip', name: 'emote-no' },
  { kind: 'clip', name: 'pick-up', event: 'paperOut', eventAt: 0.6 },
  { kind: 'turn', target: 'fire' },
  { kind: 'clip', name: 'attack-melee-right', effect: true },
  { kind: 'clip', name: 'emote-yes' },
];

test('ACTIONS: 두 행동(태우기, 파쇄). 한숨 -> 주머니에서 꺼내기 -> 대상 쪽으로 돌기 -> 던지기/치기(효과) -> 후련', () => {
  assert.deepEqual(ACTIONS, {
    burn: { id: 'burn', label: '태우기', key: '1', target: 'fire', steps: BURN_STEPS },
    shred: {
      id: 'shred', label: '파쇄', key: '2', target: 'shredder',
      steps: [
        { kind: 'clip', name: 'emote-no' },
        { kind: 'clip', name: 'pick-up', event: 'paperOut', eventAt: 0.6 },
        { kind: 'turn', target: 'shredder' },
        { kind: 'clip', name: 'attack-melee-right', effect: true },
        { kind: 'clip', name: 'emote-yes' },
      ],
    },
  });
  assert.equal(ACTIONS.poke, undefined);
});

test('종이를 든 손(오른손)으로 휘두른다: 두 행동 모두 attack-melee-right, 왼손 클립은 쓰지 않는다', () => {
  for (const a of Object.values(ACTIONS)) {
    const hit = a.steps.find((s) => s.effect);
    assert.equal(hit.name, 'attack-melee-right', a.id);
    assert.ok(!a.steps.some((s) => s.name === 'attack-melee-left'), a.id);
  }
});

test('종이 더미는 없다: 어떤 단계도 stack 을 향하지 않는다', () => {
  for (const a of Object.values(ACTIONS)) {
    for (const s of a.steps) assert.notEqual(s.target, 'stack');
    assert.equal(a.steps.filter((s) => s.kind === 'turn').length, 1); // 회전은 대상 쪽으로 한 번뿐
  }
});

test('stepsOf: 회전은 turnSeconds, 클립은 넘겨 준 길이, 표식(event/effect)은 그대로', () => {
  const r = make();
  assert.deepEqual(r.stepsOf('burn'), [
    { kind: 'clip', name: 'emote-no', seconds: 1 },
    { kind: 'clip', name: 'pick-up', event: 'paperOut', eventAt: 0.6, seconds: 1 },
    { kind: 'turn', target: 'fire', seconds: 0.5 },
    { kind: 'clip', name: 'attack-melee-right', effect: true, seconds: 1 },
    { kind: 'clip', name: 'emote-yes', seconds: 1 },
  ]);
  assert.deepEqual(r.stepsOf('shred').map((s) => s.seconds), [1, 1, 0.5, 1, 1]);
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

test('총 길이 = 클립 합 + 회전 한 번 (burn, shred 모두 4.5)', () => {
  const a = make();
  a.start('burn');
  assert.deepEqual(types(noSteps(a.update(4.49))), ['effect:burn']);
  assert.deepEqual(types(noSteps(a.update(0.02))), ['done:burn']);
  const b = make();
  b.start('shred');
  assert.deepEqual(types(noSteps(b.update(4.49))), ['effect:shred']);
  assert.deepEqual(types(noSteps(b.update(0.02))), ['done:shred']);
});

test('이벤트 순서와 시각(burn): step0@0 step1@1 paperOut@1.6 step2@2 step3@2.5 effect@3.0 step4@3.5 done@4.5', () => {
  const r = make();
  r.start('burn');
  const log = simulate(r, 4.7, 0.001);
  assert.deepEqual(log.map((l) => l[1]), [
    'step:burn:0', 'step:burn:1', 'paperOut:burn', 'step:burn:2', 'step:burn:3', 'effect:burn', 'step:burn:4', 'done:burn',
  ]);
  [0.001, 1.0, 1.6, 2.0, 2.5, 3.0, 3.5, 4.5].forEach((t, i) => assert.ok(close(log[i][0], t, 0.003), `${i}: ${log[i][0]} vs ${t}`));
});

test('효과는 effect 표식이 붙은 단계(던지기/치기)의 effectAt 에서 난다(마지막 단계가 아니다)', () => {
  const r = make({ effectAt: 0.25 }); // shred: 던지기 단계 시작 2.5, 길이 1.0 -> 효과 2.75, 마지막(후련)은 3.5~4.5
  r.start('shred');
  const log = simulate(r, 4.2, 0.001);
  const effect = log.find((l) => l[1] === 'effect:shred')[0];
  assert.ok(close(effect, 2.75, 0.003), String(effect));
  const lastStep = log.filter((l) => l[1].startsWith('step:shred')).pop();
  assert.ok(effect < lastStep[0]); // 마지막 단계(emote-yes)가 시작되기 전에 효과
  assert.equal(log.filter((l) => l[1] === 'effect:shred').length, 1);
});

test('step 이벤트는 단계 내용을 담고, 첫 update(0) 에서 단계 0 이 나온다', () => {
  const r = make();
  r.start('shred');
  const [e] = r.update(0);
  assert.deepEqual(e, { type: 'step', action: 'shred', index: 0, step: { kind: 'clip', name: 'emote-no', seconds: 1 } });
  const ev = r.update(1).filter((x) => x.type === 'step');
  assert.deepEqual(ev.map((x) => [x.index, x.step.name]), [[1, 'pick-up']]);
});

test('아주 큰 dt 도 모든 이벤트가 정확히 한 번씩, 순서대로', () => {
  const r = make();
  r.start('burn');
  assert.deepEqual(types(r.update(1000)), [
    'step:burn', 'step:burn', 'paperOut:burn', 'step:burn', 'step:burn', 'effect:burn', 'step:burn', 'done:burn',
  ]);
  assert.deepEqual(r.update(1000), []);
  assert.equal(r.isBusy(), false);
});

test('한 번의 update 가 여러 단계를 넘어가도 순서가 유지된다', () => {
  const r = make();
  r.start('burn');
  const ev = r.update(2.1); // 단계 0,1 완료, paperOut, 단계 2 시작(2.0)
  assert.deepEqual(types(ev), ['step:burn', 'step:burn', 'paperOut:burn', 'step:burn']);
  assert.deepEqual(ev.filter((e) => e.type === 'step').map((e) => e.index), [0, 1, 2]);
});

test('progress: 0~1, 쉬는 중에는 0', () => {
  const r = make();
  assert.equal(r.progress(), 0);
  r.start('burn'); // 4.5
  r.update(1.125);
  assert.ok(Math.abs(r.progress() - 0.25) < 1e-9);
  r.update(9);
  assert.equal(r.progress(), 0);
});

test('알 수 없는 클립 길이와 turnSeconds 생략은 0 으로 취급', () => {
  const r = createRunner({ durations: {}, effectAt: 0.5, autoGap: 1 });
  r.start('burn');
  assert.deepEqual(types(noSteps(r.update(0))), ['effect:burn', 'done:burn']);
});

test('abort: 진행 중인 행동을 이벤트 없이 끊고, 자동도 끈다(남은 effect/done 은 나오지 않는다)', () => {
  const r = make();
  r.setAuto(true);
  r.update(2); // paperOut 까지 지남, 효과 전
  assert.equal(r.isBusy(), true);
  r.abort();
  assert.equal(r.isBusy(), false);
  assert.equal(r.autoOn, false);
  assert.deepEqual(r.update(10), []); // effect 도 done 도 없다
  assert.equal(r.start('shred'), true); // 다시 시작할 수 있다
});

test('nextAutoAction: 기록이 없으면 태우기, 그 뒤로는 마지막의 반대', () => {
  const r = make();
  assert.equal(r.nextAutoAction(), 'burn');
  r.start('burn');
  assert.equal(r.nextAutoAction(), 'shred');
  r.update(9);
  r.start('shred');
  assert.equal(r.nextAutoAction(), 'burn');
});

test('자동: 켜자마자(기록 없음) 태우기를 시작하고, 끝나면 1초 쉰 뒤 파쇄, 다시 태우기 ... 번갈아 한다', () => {
  const r = make(); // burn 4.5(효과 3.0), shred 4.5(효과 3.0), gap 1
  r.setAuto(true);
  assert.equal(r.autoOn, true);
  const log = simulate(r, 30).filter((l) => /^(effect|done)/.test(l[1]));
  // 0 시작 -> 효과 3.0, 끝 4.5 -> 5.5 시작(파쇄) -> 효과 8.5, 끝 10.0 -> 11.0 시작(태우기) -> 효과 14.0 ...
  assert.deepEqual(log.map((l) => l[1]).slice(0, 6), ['effect:burn', 'done:burn', 'effect:shred', 'done:shred', 'effect:burn', 'done:burn']);
  assert.ok(close(log[0][0], 3.0), JSON.stringify(log));
  assert.ok(close(log[1][0], 4.5));
  assert.ok(close(log[2][0], 5.5 + 3.0));
  assert.ok(close(log[3][0], 10.0));
  assert.ok(close(log[4][0], 11.0 + 3.0));
});

test('자동: 이미 한 행동이 있으면 그 반대로 시작한다', () => {
  const r = make();
  r.start('burn');
  r.update(5.0); // 끝남(끝난 뒤 0.5초가 쉬는 시간으로 센다)
  r.setAuto(true);
  const log = simulate(r, 5);
  const effect = log.find((l) => l[1] === 'effect:shred');
  assert.ok(effect, JSON.stringify(log));
  assert.ok(close(effect[0], 0.5 + 3.0), JSON.stringify(log)); // 0.5초 더 기다린 뒤 시작 -> 효과는 3.0 뒤
});

test('자동은 겹치지 않는다: 항상 effect, done 이 번갈아 나온다', () => {
  const r = createRunner({
    durations: { 'emote-no': 3, 'pick-up': 3, 'attack-melee-right': 3, 'emote-yes': 3 }, turnSeconds: 0.5, effectAt: 0.5, autoGap: 1,
  });
  r.setAuto(true);
  const seq = simulate(r, 150).filter((l) => /^(effect|done)/.test(l[1])).map((l) => l[1].split(':')[0]);
  seq.forEach((type, i) => assert.equal(type, i % 2 === 0 ? 'effect' : 'done', seq.join()));
  assert.ok(seq.filter((t) => t === 'done').length >= 6);
});

test('자동 쉬는 시간은 끝난 시점부터 잰다(시작 간격이 아니다)', () => {
  const r = make({ autoGap: 3 });
  r.setAuto(true);
  const log = simulate(r, 14);
  const done = log.find((l) => l[1] === 'done:burn')[0]; // 4.5
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
  assert.deepEqual(types(noSteps(r.update(2.6))), ['effect:burn']); // 3.1
  assert.deepEqual(types(noSteps(r.update(1.5))), ['done:burn']);
  assert.deepEqual(simulate(r, 10), []);
});

test('canStart: 다음 행동을 시작할 수 없으면(사정거리 밖 등) 자동이 꺼진다', () => {
  let allowShred = true;
  const asked = [];
  const r = make({ canStart: (id) => { asked.push(id); return id !== 'shred' || allowShred; } });
  r.setAuto(true);
  r.update(0.1); // 태우기 시작
  allowShred = false;
  const log = simulate(r, 15).filter((l) => /^(effect|done)/.test(l[1]));
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

// ---- 길이 맞추기: 자연 길이 합이 목표보다 짧으면 던지기/치기 클립만 늘린다 ----
const RAW = { 'emote-no': 0.667, 'pick-up': 0.333, 'attack-melee-right': 0.417, 'emote-yes': 0.667 };
const natural = 0.667 + 0.333 + 0.417 + 0.667 + 0.5; // 클립 합 + 회전 한 번 = 2.584

test('fitDurations: 목표(5초)보다 짧으면 던지기/치기 클립만 늘려서 총 길이가 정확히 목표가 된다', () => {
  const { durations: d, speeds } = fitDurations(RAW, 0.5, 5);
  assert.deepEqual([d['emote-no'], d['pick-up'], d['emote-yes']], [0.667, 0.333, 0.667]); // 나머지는 자연 속도
  assert.equal(speeds['emote-no'], 1);
  assert.equal(speeds['pick-up'], 1);
  assert.equal(speeds['emote-yes'], 1);
  assert.ok(Math.abs(d['attack-melee-right'] - (0.417 + 5 - natural)) < 1e-9);
  assert.ok(speeds['attack-melee-right'] < 1 && speeds['attack-melee-right'] > 0);
  assert.ok(Math.abs(speeds['attack-melee-right'] - 0.417 / d['attack-melee-right']) < 1e-9);
  // 파쇄도 같은 클립(오른손 휘두르기)을 같은 길이로 쓰므로 총 5초
  // 러너로 재면 총 길이가 5초
  const r = createRunner({ durations: d, turnSeconds: 0.5, effectAt: 0.45, autoGap: 1 });
  for (const id of ['burn', 'shred']) {
    r.start(id);
    assert.deepEqual(types(noSteps(r.update(4.99))), [`effect:${id}`]);
    assert.deepEqual(types(noSteps(r.update(0.02))), [`done:${id}`]);
  }
});

test('fitDurations: 자연 길이가 목표보다 길면 아무것도 늘리지 않는다(배속은 1 이하만)', () => {
  const { durations: d, speeds } = fitDurations(RAW, 0.5, 2);
  assert.deepEqual(d, RAW);
  for (const v of Object.values(speeds)) assert.equal(v, 1);
  assert.deepEqual(fitDurations(RAW, 0.5, natural).durations, RAW); // 같으면 그대로
});

test('fitDurations: 어떤 경우에도 배속은 1 을 넘지 않는다', () => {
  for (const target of [0, 1, 2.584, 3, 5, 10]) {
    for (const v of Object.values(fitDurations(RAW, 0.5, target).speeds)) assert.ok(v <= 1 && v > 0, `target ${target}`);
  }
});

test('canPerform: 태우기는 소각로, 파쇄는 파쇄기가 사정거리(경계 포함) 안일 때만', () => {
  const ranges = { fire: 4, shredder: 4 };
  const near = { fire: 2, shredder: 2 };
  assert.equal(canPerform('burn', near, ranges), true);
  assert.equal(canPerform('shred', near, ranges), true);
  assert.equal(canPerform('burn', { ...near, fire: 4.01 }, ranges), false);
  assert.equal(canPerform('burn', { ...near, shredder: 99 }, ranges), true);
  assert.equal(canPerform('shred', { ...near, shredder: 4.01 }, ranges), false);
  assert.equal(canPerform('shred', { ...near, fire: 99 }, ranges), true);
  assert.equal(canPerform('burn', { ...near, fire: 4 }, ranges), true);
  assert.equal(canPerform('poke', near, ranges), false);
});
