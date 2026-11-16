import test from 'node:test';
import assert from 'node:assert/strict';
import { createRunner, fitDurations, canPerform } from '../src/logic/actions.js';

// 세탁소 행동(세탁·널기)과 구역별 자동 반복. 가짜 클립 길이 1초, 회전 0.5초. 세탁소 행동은 한숨(emote-no)이 없어 클립 3개 + 회전 = 총 3.5초.
const durations = { 'emote-no': 1.0, 'pick-up': 1.0, 'attack-melee-right': 1.0, 'interact-right': 1.0, 'emote-yes': 1.0 };
const make = (extra = {}) => createRunner({ durations, turnSeconds: 0.5, effectAt: 0.5, autoGap: 1, ...extra });
const types = (events) => events.map((e) => `${e.type}:${e.action}`);
const noSteps = (events) => events.filter((e) => e.type === 'effect' || e.type === 'done');
const close = (a, b, eps = 0.02) => Math.abs(a - b) < eps;

function simulate(r, seconds, step = 0.01) {
  const log = [];
  let t = 0;
  for (let i = 0; i < Math.round(seconds / step); i++) {
    t += step;
    for (const e of r.update(step)) log.push([Math.round(t * 1000) / 1000, e.type === 'step' ? `step:${e.action}:${e.index}` : `${e.type}:${e.action}`]);
  }
  return log;
}

test('stepsOf: 세탁은 washer 쪽으로, 널기는 clothesline 쪽으로 돌고 효과 표식은 던지기/팔 들기 단계에 있다', () => {
  const r = make();
  assert.deepEqual(r.stepsOf('wash'), [
    { kind: 'clip', name: 'pick-up', event: 'paperOut', eventAt: 0.6, seconds: 1 },
    { kind: 'turn', target: 'washer', seconds: 0.5 },
    { kind: 'clip', name: 'attack-melee-right', effect: true, seconds: 1 },
    { kind: 'clip', name: 'emote-yes', seconds: 1 },
  ]);
  assert.deepEqual(r.stepsOf('hang').map((s) => [s.kind, s.name ?? s.target, Boolean(s.effect)]), [
    ['clip', 'pick-up', false], ['turn', 'clothesline', false], ['clip', 'interact-right', true], ['clip', 'emote-yes', false],
  ]);
});

test('세탁·널기는 한숨 없이 바로 주머니부터: step0@0 paperOut@0.6 step1@1 step2@1.5 effect@2.0 step3@2.5 done@3.5', () => {
  for (const id of ['wash', 'hang']) {
    const r = make();
    r.start(id);
    const log = simulate(r, 3.7, 0.001);
    assert.deepEqual(log.map((l) => l[1]), [
      `step:${id}:0`, `paperOut:${id}`, `step:${id}:1`, `step:${id}:2`, `effect:${id}`, `step:${id}:3`, `done:${id}`,
    ]);
    [0.001, 0.6, 1.0, 1.5, 2.0, 2.5, 3.5].forEach((t, i) => assert.ok(close(log[i][0], t, 0.003), `${id} ${i}: ${log[i][0]} vs ${t}`));
  }
});

test('효과는 세탁·널기 모두 effect 표식 단계(마지막 후련 단계 전)의 effectAt 에서 한 번만 난다', () => {
  for (const id of ['wash', 'hang']) {
    const r = make({ effectAt: 0.25 });
    r.start(id);
    const log = simulate(r, 3.7, 0.001);
    const effects = log.filter((l) => l[1] === `effect:${id}`);
    assert.equal(effects.length, 1, id);
    assert.ok(close(effects[0][0], 1.75, 0.003), `${id} ${effects[0][0]}`);
    assert.ok(effects[0][0] < log.filter((l) => l[1].startsWith(`step:${id}`)).pop()[0], id);
  }
});

// ---- 길이 맞추기 ----
const RAW = {
  'emote-no': 0.667, 'pick-up': 0.333, 'attack-melee-right': 0.417, 'interact-right': 0.667, 'emote-yes': 0.667,
};
const naturalWash = 0.333 + 0.417 + 0.667 + 0.5; // 한숨 없음(세탁소)
const naturalHang = 0.333 + 0.667 + 0.667 + 0.5;

test('fitDurations: 세탁소 행동은 팔 올리기/치기 클립만 늘어나 총 5초(행동별 표). 소각장 단계는 길이가 정해져 있어 클립을 늘리지 않는다', () => {
  const { byAction } = fitDurations(RAW, 0.5, 5);
  const hang = byAction.hang;
  const wash = byAction.wash;
  assert.ok(Math.abs(hang.durations['interact-right'] - (0.667 + 5 - naturalHang)) < 1e-9);
  assert.ok(Math.abs(wash.durations['attack-melee-right'] - (0.417 + 5 - naturalWash)) < 1e-9);
  assert.ok(hang.speeds['interact-right'] < 1 && hang.speeds['interact-right'] > 0);
  for (const a of [hang, wash]) assert.deepEqual([a.durations['pick-up'], a.durations['emote-yes']], [0.333, 0.667]);
  assert.deepEqual(byAction.burn.durations, RAW, '소각장: 클립 길이 표는 그대로(단계마다 seconds 가 있다)');
  assert.deepEqual(byAction.shred.durations, RAW);
  const { durations: d } = fitDurations(RAW, 0.5, 5);
  assert.deepEqual(d, RAW, '기본(행동별 표가 없을 때)은 원래 길이');
  const r = createRunner({ durations: d, byAction, turnSeconds: 0.5, effectAt: 0.45, autoGap: 1 });
  for (const id of ['wash', 'hang']) {
    r.start(id);
    assert.deepEqual(types(noSteps(r.update(4.99))), [`effect:${id}`], id);
    assert.deepEqual(types(noSteps(r.update(0.02))), [`done:${id}`], id);
  }
});

test('fitDurations: 어떤 목표에서도 배속은 1 이하(널기 클립 포함)', () => {
  for (const target of [0, 2, 2.834, 5, 10]) {
    const { speeds, byAction } = fitDurations(RAW, 0.5, target);
    for (const v of [...Object.values(speeds), ...Object.values(byAction).flatMap((a) => Object.values(a.speeds))]) assert.ok(v <= 1 && v > 0, `target ${target}`);
  }
});

test('canPerform: 세탁은 세탁기, 널기는 빨랫줄이 사정거리(경계 포함) 안일 때만', () => {
  const ranges = { washer: 4, clothesline: 4, fire: 4, shredder: 4 };
  const near = { washer: 2, clothesline: 2, fire: 99, shredder: 99 };
  assert.equal(canPerform('wash', near, ranges), true);
  assert.equal(canPerform('hang', near, ranges), true);
  assert.equal(canPerform('wash', { ...near, washer: 4 }, ranges), true);
  assert.equal(canPerform('wash', { ...near, washer: 4.01 }, ranges), false);
  assert.equal(canPerform('hang', { ...near, clothesline: 4.01 }, ranges), false);
  assert.equal(canPerform('wash', { ...near, clothesline: 99 }, ranges), true); // 서로 독립
  assert.equal(canPerform('hang', { ...near, washer: 99 }, ranges), true);
  assert.equal(canPerform('burn', near, ranges), false); // 소각장 대상은 멀다
  assert.equal(canPerform('iron', near, ranges), false);
});

// ---- 구역별 자동 ----
test('nextAutoAction: 구역의 두 행동 사이를 번갈아 간다(기록이 구역 밖이면 구역의 첫 행동)', () => {
  const r = make({ autoActions: () => ['wash', 'hang'] });
  assert.equal(r.nextAutoAction(), 'wash');
  r.start('wash');
  assert.equal(r.nextAutoAction(), 'hang');
  r.update(9);
  r.start('hang');
  assert.equal(r.nextAutoAction(), 'wash');
  r.update(9);
  r.start('burn'); // 다른 구역에서 한 기록
  assert.equal(r.nextAutoAction(), 'wash');
});

test('nextAutoAction: autoActions 를 주지 않으면 이전처럼 소각장(태우기·파쇄)', () => {
  const r = make();
  assert.equal(r.nextAutoAction(), 'burn');
  r.start('wash'); // 세탁소에서 한 기록이 있어도 소각장에서는 태우기부터
  assert.equal(r.nextAutoAction(), 'burn');
});

test('nextAutoAction 은 호출 시점의 구역을 따른다(구역이 바뀌면 그 구역의 첫 행동)', () => {
  let zone = ['burn', 'shred'];
  const r = make({ autoActions: () => zone });
  r.start('shred');
  assert.equal(r.nextAutoAction(), 'burn');
  zone = ['wash', 'hang'];
  assert.equal(r.nextAutoAction(), 'wash');
  r.update(9);
  r.start('wash');
  assert.equal(r.nextAutoAction(), 'hang');
});

test('자동(세탁소): 세탁 -> 1초 쉼 -> 널기 -> 세탁 ... 번갈아, 효과마다 한 번씩', () => {
  const r = make({ autoActions: () => ['wash', 'hang'] });
  r.setAuto(true);
  const log = simulate(r, 30).filter((l) => /^(effect|done)/.test(l[1]));
  assert.deepEqual(log.map((l) => l[1]).slice(0, 8), [
    'effect:wash', 'done:wash', 'effect:hang', 'done:hang', 'effect:wash', 'done:wash', 'effect:hang', 'done:hang',
  ]);
  assert.ok(close(log[0][0], 2.0));
  assert.ok(close(log[2][0], 4.5 + 2.0)); // 3.5 끝 + 1초 쉼 + 2.0
  assert.ok(close(log[4][0], 9.0 + 2.0));
});

test('자동(소각장)은 구역을 지정해도 세탁소 행동을 섞지 않는다', () => {
  const r = make({ autoActions: () => ['burn', 'shred'] });
  r.setAuto(true);
  const names = simulate(r, 40).filter((l) => l[1].startsWith('effect')).map((l) => l[1]);
  assert.ok(names.length >= 4);
  names.forEach((n, i) => assert.equal(n, i % 2 === 0 ? 'effect:burn' : 'effect:shred'));
});

test('자동: 구역이 없으면(autoActions 가 빈 목록) 시작하지 않고 자동이 꺼진다', () => {
  const r = make({ autoActions: () => [] });
  assert.equal(r.nextAutoAction(), null);
  r.setAuto(true);
  assert.deepEqual(r.update(10), []);
  assert.equal(r.autoOn, false);
  assert.equal(r.isBusy(), false);
});

test('canStart 는 세탁소 자동에도 쓰인다: 다음 행동(널기)의 사정거리 밖이면 자동이 꺼진다', () => {
  let allowHang = true;
  const asked = [];
  const r = make({ autoActions: () => ['wash', 'hang'], canStart: (id) => { asked.push(id); return id !== 'hang' || allowHang; } });
  r.setAuto(true);
  r.update(0.1);
  allowHang = false;
  const log = simulate(r, 15).filter((l) => /^(effect|done)/.test(l[1]));
  assert.deepEqual(log.map((l) => l[1]), ['effect:wash', 'done:wash']);
  assert.equal(r.autoOn, false);
  assert.deepEqual(asked, ['wash', 'hang']);
});

test('start: 알 수 없는 id 는 구역이 있어도 false 이고 기록을 바꾸지 않는다', () => {
  const r = make({ autoActions: () => ['wash', 'hang'] });
  assert.equal(r.start('iron'), false);
  assert.equal(r.lastActionId, null);
  assert.equal(r.start('hang'), true);
  assert.equal(r.lastActionId, 'hang');
});
