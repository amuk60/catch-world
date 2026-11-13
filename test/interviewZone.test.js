import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildLayout } from '../src/logic/layout.js';
import { buildZones, autoActionsOf, zoneActions } from '../src/logic/zones.js';
import { ACTIONS, SCENE_ACTIONS, ACTION_DEFS, createRunner, canPerform } from '../src/logic/actions.js';
import { SEED } from '../src/config.js';

const zones = buildZones(buildLayout(SEED));
const by = (id) => zones.find((z) => z.id === id);

test('autoActionsOf: 자동(R)이 번갈아 할 행동 — 소각장·세탁소는 구역의 두 행동, 면접장(auto false)과 구역 없음은 비어 있다', () => {
  assert.deepEqual(autoActionsOf(by('incinerator')), ['burn', 'shred']);
  assert.deepEqual(autoActionsOf(by('laundry')), ['wash', 'hang']);
  assert.deepEqual(autoActionsOf(by('interview')), []);
  assert.deepEqual(autoActionsOf(null), []);
  assert.deepEqual(autoActionsOf({ id: 'x', actions: ['a', 'b'], auto: true }), ['a', 'b']);
});

test('면접 구역의 행동 막대 버튼은 [1 면접 보기] [2 돌발행동]이다(자동 없음은 zone.auto === false 로 표시)', () => {
  const zone = by('interview');
  assert.deepEqual(zoneActions(zone).map((id) => `${ACTION_DEFS[id].key} ${ACTION_DEFS[id].label}`), ['1 면접 보기', '2 돌발행동']);
  assert.equal(zone.auto, false);
  assert.equal(by('incinerator').auto, undefined, '다른 구역은 자동이 있다(auto 표시 없음)');
  assert.equal(by('laundry').auto, undefined);
});

test('SCENE_ACTIONS: 면접 보기(1)·돌발행동(2)은 면접 구역 소속이고 실행기로는 시작할 수 없다', () => {
  assert.deepEqual(Object.values(SCENE_ACTIONS).map((a) => `${a.key}:${a.id}:${a.zone}:${a.label}`), ['1:interview:interview:면접 보기', '2:improv:interview:돌발행동']);
  assert.deepEqual(Object.keys(ACTION_DEFS).sort(), ['burn', 'hang', 'improv', 'interview', 'shred', 'wash']);
  assert.deepEqual(Object.keys(ACTIONS).sort(), ['burn', 'hang', 'shred', 'wash'], '실행기 행동은 그대로 넷');
  const runner = createRunner({ durations: {}, turnSeconds: 0.5, effectAt: 0.5, autoGap: 1 });
  assert.equal(runner.start('interview'), false);
  assert.equal(runner.start('improv'), false);
});

test('canPerform: 면접 행동은 책상(desk) 사정거리 안에서만', () => {
  const ranges = { desk: 3.3 };
  assert.equal(canPerform('interview', { desk: 3.3 }, ranges), true);
  assert.equal(canPerform('improv', { desk: 3.31 }, ranges), false);
  assert.equal(canPerform('nothing', { desk: 0 }, ranges), false);
});
