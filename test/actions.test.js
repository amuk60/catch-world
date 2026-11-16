import test from 'node:test';
import assert from 'node:assert/strict';
import { ACTIONS, createRunner, fitDurations, canPerform, scaleTo } from '../src/logic/actions.js';
import { INCINERATOR } from '../src/config.js';

// 러너의 일반 동작(이벤트 순서·진행·자동 반복)은 길이가 클립에서 오는 세탁 행동으로 확인하고, 소각장 행동(태우기·파쇄)은 길이가 정해진 단계로 따로 확인한다.
// 가짜 클립 길이 1초, 회전 0.5초. 세탁: 주머니 1 + 회전 .5 + 치기 1 + 후련 1 = 3.5초.
const durations = { 'emote-no': 1.0, 'pick-up': 1.0, 'attack-melee-right': 1.0, 'interact-right': 1.0, 'emote-yes': 1.0 };
const make = (extra = {}) => createRunner({ durations, turnSeconds: 0.5, effectAt: 0.5, autoGap: 1, ...extra });
const types = (events) => events.map((e) => `${e.type}:${e.action}`);
const noSteps = (events) => events.filter((e) => e.type === 'effect' || e.type === 'done');
const close = (a, b, eps = 0.02) => Math.abs(a - b) < eps;
const total = (steps) => steps.reduce((sum, s) => sum + s.seconds, 0);

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

const KNOWN_CLIPS = ['idle', 'walk', 'pick-up', 'emote-yes', 'interact-left', 'interact-right', 'attack-melee-right', 'holding-right', 'holding-both']; // 캐릭터 모델에 있는 클립(멀티플레이 net ANIMS 에도 있다)
const PHASES = {
  burn: ['turn', 'pocket', 'pull', 'look', 'mutter', 'crumple', 'throw', 'fly', 'watch', 'relief'],
  solid: ['turn', 'pocket', 'pull', 'look', 'mutter', 'heft', 'throw', 'fly', 'watch', 'relief'],
  shred: ['approach', 'pocket', 'pull', 'look', 'mutter', 'place', 'feed', 'settle', 'relief'],
};
const sequencesOf = () => [['burn', ACTIONS.burn.steps, PHASES.burn], ['solid', ACTIONS.burn.variants.solid, PHASES.solid], ['shred', ACTIONS.shred.steps, PHASES.shred]];

test('ACTIONS: 네 행동(태우기·파쇄·세탁·널기), 구역·키·대상', () => {
  const brief = Object.values(ACTIONS).map((a) => [a.id, a.label, a.key, a.zone, a.target]);
  assert.deepEqual(brief, [
    ['burn', '태우기', '1', 'incinerator', 'fire'],
    ['shred', '파쇄', '1', 'shredder', 'shredder'],
    ['wash', '세탁', '1', 'laundry', 'washer'],
    ['hang', '널기', '2', 'laundry', 'clothesline'],
  ]);
  assert.equal(ACTIONS.poke, undefined);
});

test('구역마다 행동: 소각장은 태우기만, 파쇄기 구역은 파쇄만(둘 다 키 1), 세탁소는 세탁·널기(키 1·2)', () => {
  const byZone = {};
  for (const a of Object.values(ACTIONS)) (byZone[a.zone] ??= []).push(`${a.key}:${a.id}`);
  assert.deepEqual(byZone, { incinerator: ['1:burn'], shredder: ['1:shred'], laundry: ['1:wash', '2:hang'] });
});

test('세탁소 단계는 그대로: 한숨 없이 주머니 -> 회전 -> 치기/팔 들기(효과) -> 후련, 클립 길이는 모델에서 온다(seconds 없음)', () => {
  const PULL = { kind: 'clip', name: 'pick-up', event: 'paperOut', eventAt: 0.6 };
  const RELIEF = { kind: 'clip', name: 'emote-yes' };
  assert.deepEqual(ACTIONS.wash.steps, [PULL, { kind: 'turn', target: 'washer' }, { kind: 'clip', name: 'attack-melee-right', effect: true }, RELIEF]);
  assert.deepEqual(ACTIONS.hang.steps, [PULL, { kind: 'turn', target: 'clothesline' }, { kind: 'clip', name: 'interact-right', effect: true }, RELIEF]);
});

test('소각장 단계: 모든 단계에 클립(또는 회전·걷기)·길이·phase 가 있고 알려진 클립만 쓴다(걷기는 파쇄의 approach 뿐)', () => {
  for (const [name, steps, phases] of sequencesOf()) {
    assert.deepEqual(steps.map((s) => s.phase), phases, name);
    for (const s of steps) {
      assert.ok(s.seconds > 0, `${name}:${s.phase} 길이`);
      if (s.kind === 'turn') assert.ok(s.target, `${name} 회전 대상`);
      else if (s.kind === 'move') { assert.equal(s.phase, 'approach'); assert.equal(s.name, 'walk'); }
      else { assert.equal(s.kind, 'clip'); assert.ok(KNOWN_CLIPS.includes(s.name), `${name}:${s.phase} 클립 ${s.name}`); }
      if (s.kind !== 'move') assert.ok(!/walk|sprint/.test(s.name ?? ''), `${name}: 걷지 않는다`);
    }
    if (name === 'shred') {
      assert.equal(steps.filter((s) => s.kind === 'turn').length, 0, '파쇄: 걸어가서 서므로 따로 돌지 않는다');
      assert.equal(steps.filter((s) => s.kind === 'move').length, 1);
    } else assert.equal(steps.filter((s) => s.kind === 'turn').length, 1, `${name}: 회전은 대상 쪽으로 한 번뿐`);
  }
});

test('소각장 단계: 옛 한숨(emote-no)은 없고 주머니에 손을 넣는 동작으로 시작한다(회전 다음)', () => {
  for (const [name, steps] of sequencesOf()) {
    assert.equal(steps[0].kind, name === 'shred' ? 'move' : 'turn', name);
    assert.equal(steps[1].phase, 'pocket', name);
    assert.ok(!steps.some((s) => s.name === 'emote-no'), name);
    assert.equal(steps.at(-1).name, 'emote-yes', `${name}: 후련으로 끝난다`);
  }
});

test('소각장 단계: 총 길이는 config 의 INCINERATOR.targetSeconds(6~7초대)에 맞는다', () => {
  assert.ok(INCINERATOR.targetSeconds >= 6 && INCINERATOR.targetSeconds <= 8);
  for (const [name, steps] of sequencesOf()) assert.ok(Math.abs(total(steps) - INCINERATOR.targetSeconds) < 0.02, `${name}: ${total(steps)}`);
});

test('scaleTo: 회전·걷기 단계는 그대로 두고 나머지를 비율로 늘이고 줄여 총 길이를 맞춘다', () => {
  const steps = [{ kind: 'turn', seconds: 0.4 }, { kind: 'move', seconds: 1.3 }, { kind: 'clip', seconds: 1 }, { kind: 'clip', seconds: 3 }];
  const out = scaleTo(steps, 9.7);
  assert.equal(out[0].seconds, 0.4);
  assert.equal(out[1].seconds, 1.3);
  assert.ok(close(total(out), 9.7, 0.002));
  assert.ok(close(out[3].seconds / out[2].seconds, 3, 0.01));
});

test('물건 종류: 태우기에만 두툼한 물건(solid) 변형이 있고(파쇄에는 없다), 모두 효과 표식이 정확히 하나', () => {
  assert.equal(ACTIONS.shred.variants, undefined);
  assert.deepEqual(Object.keys(ACTIONS.burn.variants), ['solid']);
  for (const [name, steps] of sequencesOf()) assert.equal(steps.filter((s) => s.effect).length, 1, name);
});

test('효과 순간: 태우기는 날아가기 단계 끝(불에 닿는 순간), 파쇄는 밀어 넣는 단계 끝(종이가 다 갈린 순간)이고 후련 단계 전이다', () => {
  for (const [name, steps] of sequencesOf()) {
    const i = steps.findIndex((s) => s.effect);
    assert.equal(steps[i].phase, name === 'shred' ? 'feed' : 'fly', name);
    assert.ok(i < steps.length - 1, `${name}: 마지막(후련) 단계가 아니다`);
  }
  assert.ok(ACTIONS.burn.steps.find((s) => s.effect).effectAt >= 0.95); // 닿는 순간
  assert.ok(ACTIONS.shred.steps.find((s) => s.effect).effectAt >= 0.9); // 다 갈린 순간
});

test('소각장 표식: say(멘트) 는 한마디 단계 시작, release(놓기) 는 던지기 단계에 있고 날아가기보다 앞선다', () => {
  for (const [name, steps, phases] of sequencesOf()) {
    const mutter = steps.find((s) => s.phase === 'mutter');
    assert.deepEqual(mutter.marks, [{ at: 0, name: 'say' }], name);
    if (name === 'shred') { assert.deepEqual(steps.find((s) => s.phase === 'feed').marks, [{ at: 0, name: 'grind' }]); continue; }
    const throwStep = steps.find((s) => s.phase === 'throw');
    assert.ok(throwStep.marks.some((m) => m.name === 'release'), name);
    assert.ok(phases.indexOf('throw') < phases.indexOf('fly'), name);
  }
  assert.equal(ACTIONS.burn.steps[2].event, 'paperOut'); // 꺼내는 단계에서 손에 쥔다
});

test('소각장 러너: 사건 순서(태우기) = 단계 시작들 + paperOut + say + release + effect(한 번) + done, 단계는 길이대로 이어진다', () => {
  const r = make();
  r.start('burn');
  const log = simulate(r, INCINERATOR.targetSeconds + 0.3, 0.005);
  const names = log.map((l) => l[1]);
  assert.equal(names.filter((n) => n === 'effect:burn').length, 1);
  assert.equal(names.filter((n) => n === 'done:burn').length, 1);
  assert.equal(names.filter((n) => n.startsWith('step:burn')).length, ACTIONS.burn.steps.length);
  const at = (n) => log.find((l) => l[1] === n)[0];
  assert.ok(at('step:burn:2') < at('paperOut:burn'));
  assert.ok(at('paperOut:burn') <= at('step:burn:3') + 0.01);
  assert.ok(at('say:burn') >= at('step:burn:4') - 0.01 && at('say:burn') < at('step:burn:5'));
  assert.ok(at('release:burn') < at('effect:burn'));
  assert.ok(at('effect:burn') < at('step:burn:9')); // 후련 전에 효과
  assert.ok(close(at('done:burn'), INCINERATOR.targetSeconds, 0.02));
  assert.deepEqual(r.update(10), []);
});

test('소각장 러너: 두툼한 물건 변형(start 의 두 번째 인자)은 구기지 않고 들어 올리는 단계로, 모르는 변형은 기본 단계로 간다', () => {
  const r = make();
  r.start('burn', 'solid');
  const phases = r.update(INCINERATOR.targetSeconds + 1).filter((e) => e.type === 'step').map((e) => e.step.phase);
  assert.ok(phases.includes('heft') && !phases.includes('crumple'));
  const r2 = make();
  r2.start('burn', 'nope');
  const p2 = r2.update(20).filter((e) => e.type === 'step').map((e) => e.step.phase);
  assert.ok(p2.includes('crumple'));
});

test('소각장 러너: 스트레스는 효과 순간에 한 번 — 어떤 dt 로 돌려도 effect 는 정확히 한 번', () => {
  for (const [id, variant] of [['burn'], ['burn', 'solid'], ['shred']]) {
    for (const dt of [0.001, 0.016, 0.1, 1, 1000]) {
      const r = make();
      r.start(id, variant);
      let effects = 0;
      let dones = 0;
      for (let i = 0; i < 20000 && dones === 0; i++) for (const e of r.update(dt)) { if (e.type === 'effect') effects++; if (e.type === 'done') dones++; }
      assert.deepEqual([effects, dones], [1, 1], `${id} ${variant} dt ${dt}`);
    }
  }
});

test('자동의 변형 선택: variantFor 는 자동이 시작할 때마다 불리고, 직접 start 에 변형을 주면 불리지 않는다', () => {
  const asked = [];
  const r = make({ variantFor: (id) => { asked.push(id); return id === 'burn' ? 'solid' : undefined; } });
  r.setAuto(true);
  const first = r.update(0.1);
  assert.deepEqual(asked, ['burn']);
  assert.ok(first.some((e) => e.type === 'step'));
  const r2 = make({ variantFor: () => { throw new Error('불리면 안 된다'); } });
  assert.equal(r2.start('shred', 'paper'), true);
});

test('stepsOf: 길이가 정해진 단계는 그대로, 세탁 단계의 회전은 turnSeconds, 클립은 넘겨 준 길이', () => {
  const r = make();
  assert.deepEqual(r.stepsOf('wash'), [
    { kind: 'clip', name: 'pick-up', event: 'paperOut', eventAt: 0.6, seconds: 1 },
    { kind: 'turn', target: 'washer', seconds: 0.5 },
    { kind: 'clip', name: 'attack-melee-right', effect: true, seconds: 1 },
    { kind: 'clip', name: 'emote-yes', seconds: 1 },
  ]);
  assert.deepEqual(r.stepsOf('burn').map((s) => s.seconds), ACTIONS.burn.steps.map((s) => s.seconds));
  assert.deepEqual(r.stepsOf('burn', 'solid').map((s) => s.phase), PHASES.solid);
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

test('총 길이 = 클립 합 + 회전 한 번 (세탁 3.5초)', () => {
  const a = make();
  a.start('wash');
  assert.deepEqual(types(noSteps(a.update(2.49))), ['effect:wash']);
  assert.deepEqual(types(noSteps(a.update(1.02))), ['done:wash']);
});

test('이벤트 순서와 시각(세탁): step0@0 paperOut@.6 step1@1 step2@1.5 effect@2.0 step3@2.5 done@3.5', () => {
  const r = make();
  r.start('wash');
  const log = simulate(r, 3.7, 0.001);
  assert.deepEqual(log.map((l) => l[1]), ['step:wash:0', 'paperOut:wash', 'step:wash:1', 'step:wash:2', 'effect:wash', 'step:wash:3', 'done:wash']);
  [0.001, 0.6, 1.0, 1.5, 2.0, 2.5, 3.5].forEach((t, i) => assert.ok(close(log[i][0], t, 0.003), `${i}: ${log[i][0]} vs ${t}`));
});

test('step 이벤트는 단계 내용을 담고, 첫 update(0) 에서 단계 0 이 나온다', () => {
  const r = make();
  r.start('wash');
  const [e] = r.update(0);
  assert.deepEqual(e, { type: 'step', action: 'wash', index: 0, step: { kind: 'clip', name: 'pick-up', event: 'paperOut', eventAt: 0.6, seconds: 1 } });
});

test('아주 큰 dt 도 모든 이벤트가 정확히 한 번씩, 순서대로', () => {
  const r = make();
  r.start('wash');
  assert.deepEqual(types(r.update(1000)), ['step:wash', 'paperOut:wash', 'step:wash', 'step:wash', 'effect:wash', 'step:wash', 'done:wash']);
  assert.deepEqual(r.update(1000), []);
  assert.equal(r.isBusy(), false);
});

test('한 번의 update 가 여러 단계를 넘어가도 순서가 유지된다', () => {
  const r = make();
  r.start('wash');
  const ev = r.update(1.1); // 단계 0 완료(paperOut), 단계 1 시작(1.0)
  assert.deepEqual(types(ev), ['step:wash', 'paperOut:wash', 'step:wash']);
  assert.deepEqual(ev.filter((e) => e.type === 'step').map((e) => e.index), [0, 1]);
});

test('progress: 0~1, 쉬는 중에는 0', () => {
  const r = make();
  assert.equal(r.progress(), 0);
  r.start('wash'); // 3.5
  r.update(0.875);
  assert.ok(Math.abs(r.progress() - 0.25) < 1e-9);
  r.update(9);
  assert.equal(r.progress(), 0);
});

test('알 수 없는 클립 길이와 turnSeconds 생략은 0 으로 취급', () => {
  const r = createRunner({ durations: {}, effectAt: 0.5, autoGap: 1 });
  r.start('wash');
  assert.deepEqual(types(noSteps(r.update(0))), ['effect:wash', 'done:wash']);
});

test('abort: 진행 중인 행동을 이벤트 없이 끊고, 자동도 끈다(남은 effect/done 은 나오지 않는다)', () => {
  const r = make();
  r.setAuto(true);
  r.update(2); // 소각장 단계 중간, 효과 전
  assert.equal(r.isBusy(), true);
  r.abort();
  assert.equal(r.isBusy(), false);
  assert.equal(r.autoOn, false);
  assert.deepEqual(r.update(10), []); // effect 도 done 도 없다
  assert.equal(r.start('shred'), true); // 다시 시작할 수 있다
});

test('nextAutoAction: 지금 구역의 행동을 되풀이한다(소각장은 태우기, 파쇄기 구역은 파쇄, 두 행동 구역은 번갈아)', () => {
  const r = make();
  assert.equal(r.nextAutoAction(), 'burn');
  r.start('burn');
  assert.equal(r.nextAutoAction(), 'burn');
  const s = make({ autoActions: () => ['shred'] });
  s.start('shred');
  assert.equal(s.nextAutoAction(), 'shred');
  const w = make({ autoActions: () => ['wash', 'hang'] });
  assert.equal(w.nextAutoAction(), 'wash');
  w.start('wash');
  assert.equal(w.nextAutoAction(), 'hang');
  assert.equal(make({ autoActions: () => [] }).nextAutoAction(), null);
});

const T = INCINERATOR.targetSeconds;
test('자동: 켜자마자 구역의 행동(소각장은 태우기)을 시작하고, 끝나면 1초 쉰 뒤 같은 행동을 되풀이한다', () => {
  const r = make();
  r.setAuto(true);
  assert.equal(r.autoOn, true);
  const log = simulate(r, T * 3 + 4).filter((l) => /^(effect|done)/.test(l[1]));
  assert.deepEqual(log.map((l) => l[1]).slice(0, 6), ['effect:burn', 'done:burn', 'effect:burn', 'done:burn', 'effect:burn', 'done:burn']);
  assert.ok(close(log[1][0], T));
  assert.ok(close(log[3][0], T + 1 + T)); // 쉬는 시간 1초
  assert.ok(close(log[5][0], 2 * (T + 1) + T));
});

test('자동(파쇄기 구역): 파쇄만 되풀이한다(태우기로 넘어가지 않는다)', () => {
  const r = make({ autoActions: () => ['shred'] });
  r.setAuto(true);
  const log = simulate(r, T * 2 + 3).filter((l) => /^(effect|done)/.test(l[1])).map((l) => l[1]);
  assert.deepEqual(log.slice(0, 4), ['effect:shred', 'done:shred', 'effect:shred', 'done:shred']);
});

test('자동: 이미 한 행동이 있어도 구역의 행동을 이어서 하고, 끝난 뒤 쉬는 시간을 채운 다음 시작한다', () => {
  const r = make();
  r.start('burn');
  r.update(T + 0.5); // 끝남(끝난 뒤 0.5초가 쉬는 시간으로 센다)
  r.setAuto(true);
  const log = simulate(r, T + 2);
  const step0 = log.find((l) => l[1] === 'step:burn:0');
  assert.ok(step0, JSON.stringify(log));
  assert.ok(close(step0[0], 0.5, 0.03), JSON.stringify(step0)); // 0.5초 더 기다린 뒤 시작
});

test('자동은 겹치지 않는다: 항상 effect, done 이 번갈아 나온다', () => {
  const r = make();
  r.setAuto(true);
  const seq = simulate(r, T * 8).filter((l) => /^(effect|done)/.test(l[1])).map((l) => l[1].split(':')[0]);
  seq.forEach((type, i) => assert.equal(type, i % 2 === 0 ? 'effect' : 'done', seq.join()));
  assert.ok(seq.filter((t) => t === 'done').length >= 6);
});

test('자동 쉬는 시간은 끝난 시점부터 잰다(시작 간격이 아니다)', () => {
  const r = make({ autoGap: 3 });
  r.setAuto(true);
  const log = simulate(r, T * 2 + 4);
  const done = log.find((l) => l[1] === 'done:burn')[0];
  const nextStep = log.find((l) => l[1] === 'step:burn:0' && l[0] > done)[0];
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
  assert.deepEqual(types(noSteps(r.update(T))), ['effect:burn', 'done:burn']);
  assert.deepEqual(simulate(r, 10), []);
});

test('canStart: 다음 행동을 시작할 수 없으면(사정거리 밖 등) 자동이 꺼진다', () => {
  let allowNext = true;
  const asked = [];
  const r = make({ canStart: (id) => { asked.push(id); return allowNext; } });
  r.setAuto(true);
  r.update(0.1); // 태우기 시작
  allowNext = false;
  const log = simulate(r, T * 2 + 3).filter((l) => /^(effect|done)/.test(l[1]));
  assert.deepEqual(log.map((l) => l[1]), ['effect:burn', 'done:burn']); // 다음 태우기는 시작되지 않는다
  assert.equal(r.autoOn, false);
  assert.deepEqual(asked, ['burn', 'burn']);
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

// ---- 길이 맞추기(세탁소): 자연 길이 합이 목표보다 짧으면 치기/팔 올리기 클립만 늘린다 ----
const RAW = { 'emote-no': 0.667, 'pick-up': 0.333, 'attack-melee-right': 0.417, 'emote-yes': 0.667 };
const naturalWash = 0.333 + 0.417 + 0.667 + 0.5;

test('fitDurations: 목표보다 짧으면 치기 클립만 늘려서 세탁 총 길이가 정확히 목표가 된다', () => {
  const { durations: raw0, byAction } = fitDurations(RAW, 0.5, 5);
  assert.deepEqual(raw0, RAW, '기본 표는 원래 길이');
  const { durations: d, speeds } = byAction.wash;
  assert.deepEqual([d['pick-up'], d['emote-yes']], [0.333, 0.667]); // 나머지는 자연 속도
  assert.ok(Math.abs(d['attack-melee-right'] - (0.417 + 5 - naturalWash)) < 1e-9);
  assert.ok(speeds['attack-melee-right'] < 1 && speeds['attack-melee-right'] > 0);
  assert.ok(Math.abs(speeds['attack-melee-right'] - 0.417 / d['attack-melee-right']) < 1e-9);
  const r = createRunner({ durations: RAW, byAction, turnSeconds: 0.5, effectAt: 0.45, autoGap: 1 });
  r.start('wash');
  assert.deepEqual(types(noSteps(r.update(4.99))), ['effect:wash']);
  assert.deepEqual(types(noSteps(r.update(0.02))), ['done:wash']);
});

test('fitDurations: 자연 길이가 목표보다 길면 아무것도 늘리지 않는다(배속은 1 이하만)', () => {
  const { durations: d, speeds } = fitDurations(RAW, 0.5, 2);
  assert.deepEqual(d, RAW);
  for (const v of Object.values(speeds)) assert.equal(v, 1);
  assert.deepEqual(fitDurations(RAW, 0.5, naturalWash).byAction.wash.durations, RAW); // 같으면 그대로
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
