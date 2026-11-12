import test from 'node:test';
import assert from 'node:assert/strict';
import { createOutfit, appearanceOf, outfitPrompt, hasMyShirt, MY_SHIRT_SLOT } from '../src/logic/outfit.js';
import { DRY_SECONDS } from '../src/config.js';

test('DRY_SECONDS 는 8초', () => {
  assert.equal(DRY_SECONDS, 8);
});

test('처음에는 clean', () => {
  const o = createOutfit();
  assert.equal(o.state, 'clean');
  assert.equal(o.secondsLeft, 0);
  assert.equal(o.canWear(), false);
});

test('onAction: 정상 전이 clean -> dirty -> tank -> drying', () => {
  const o = createOutfit();
  assert.equal(o.onAction('burn'), 'dirty');
  assert.equal(o.state, 'dirty');
  assert.equal(o.onAction('wash'), 'tank');
  assert.equal(o.state, 'tank');
  assert.equal(o.onAction('hang'), 'drying');
  assert.equal(o.state, 'drying');
  assert.equal(o.secondsLeft, DRY_SECONDS);
});

test('onAction: shred 는 옷을 바꾸지 않는다', () => {
  const o = createOutfit();
  assert.equal(o.onAction('shred'), null);
  assert.equal(o.state, 'clean');
});

test('onAction: 해당 상태가 아니면 아무 일도 없다(모든 조합)', () => {
  const ok = { clean: ['burn'], dirty: ['wash'], tank: ['hang'], drying: [], dry: [] };
  const setup = {
    clean: [], dirty: ['burn'], tank: ['burn', 'wash'], drying: ['burn', 'wash', 'hang'], dry: ['burn', 'wash', 'hang', 'tick'],
  };
  for (const state of Object.keys(ok)) {
    for (const id of ['burn', 'shred', 'wash', 'hang']) {
      if (ok[state].includes(id)) continue;
      const o = createOutfit({ drySeconds: 3 });
      for (const s of setup[state]) { if (s === 'tick') o.update(10); else o.onAction(s); }
      assert.equal(o.state, state, `준비: ${state}`);
      const left = o.secondsLeft;
      assert.equal(o.onAction(id), null, `${state} + ${id}`);
      assert.equal(o.state, state, `${state} + ${id}`);
      assert.equal(o.secondsLeft, left, `${state} + ${id}: 타이머도 그대로`);
    }
  }
});

test('onAction: 알 수 없는 행동은 무시', () => {
  const o = createOutfit();
  assert.equal(o.onAction('nope'), null);
  assert.equal(o.state, 'clean');
});

test('update: drying 이 아니면 아무것도 안 한다', () => {
  const o = createOutfit({ drySeconds: 2 });
  assert.equal(o.update(5), null);
  o.onAction('burn');
  assert.equal(o.update(5), null);
  assert.equal(o.state, 'dirty');
  o.onAction('wash');
  assert.equal(o.update(5), null);
  assert.equal(o.state, 'tank');
});

test('update: drying 타이머가 줄다가 0 이 되면 dry (한 번만 알린다)', () => {
  const o = createOutfit({ drySeconds: 8 });
  o.onAction('burn'); o.onAction('wash'); o.onAction('hang');
  assert.equal(o.update(3), null);
  assert.equal(o.state, 'drying');
  assert.ok(Math.abs(o.secondsLeft - 5) < 1e-9);
  assert.equal(o.update(4.9), null);
  assert.equal(o.state, 'drying');
  assert.equal(o.update(0.1), 'dry');
  assert.equal(o.state, 'dry');
  assert.equal(o.secondsLeft, 0);
  assert.equal(o.update(1), null, '이미 dry');
  assert.equal(o.state, 'dry');
});

test('update: 아주 큰 dt 도 dry', () => {
  const o = createOutfit();
  o.onAction('burn'); o.onAction('wash'); o.onAction('hang');
  assert.equal(o.update(1000), 'dry');
});

test('기본 건조 시간은 config 의 DRY_SECONDS', () => {
  const o = createOutfit();
  o.onAction('burn'); o.onAction('wash'); o.onAction('hang');
  assert.equal(o.update(DRY_SECONDS - 0.01), null);
  assert.equal(o.update(0.01), 'dry');
});

test('wear: dry 에서만 되고 clean 으로 돌아간다', () => {
  const o = createOutfit({ drySeconds: 1 });
  assert.equal(o.wear(), false);
  o.onAction('burn'); assert.equal(o.wear(), false);
  o.onAction('wash'); assert.equal(o.wear(), false);
  o.onAction('hang'); assert.equal(o.wear(), false);
  assert.equal(o.canWear(), false);
  o.update(1);
  assert.equal(o.canWear(), true);
  assert.equal(o.wear(), true);
  assert.equal(o.state, 'clean');
  assert.equal(o.canWear(), false);
  assert.equal(o.wear(), false);
});

test('한 바퀴 돈 뒤 다시 더러워질 수 있다', () => {
  const o = createOutfit({ drySeconds: 1 });
  o.onAction('burn'); o.onAction('wash'); o.onAction('hang'); o.update(1); o.wear();
  assert.equal(o.onAction('burn'), 'dirty');
});

test('reset: 어느 상태에서든 clean, 타이머 정리', () => {
  for (const steps of [[], ['burn'], ['burn', 'wash'], ['burn', 'wash', 'hang']]) {
    const o = createOutfit({ drySeconds: 5 });
    for (const s of steps) o.onAction(s);
    o.reset();
    assert.equal(o.state, 'clean');
    assert.equal(o.secondsLeft, 0);
    assert.equal(o.update(100), null);
    assert.equal(o.state, 'clean');
  }
  const o = createOutfit({ drySeconds: 1 });
  o.onAction('burn'); o.onAction('wash'); o.onAction('hang'); o.update(1);
  o.reset();
  assert.equal(o.state, 'clean');
});

test('appearanceOf: 상태별 겉모습', () => {
  assert.equal(appearanceOf('clean'), 'suit');
  assert.equal(appearanceOf('dirty'), 'soot');
  for (const s of ['tank', 'drying', 'dry']) assert.equal(appearanceOf(s), 'tank');
});

test('hasMyShirt: 줄에 내 셔츠가 걸려 있는 상태', () => {
  assert.equal(hasMyShirt('clean'), false);
  assert.equal(hasMyShirt('dirty'), false);
  assert.equal(hasMyShirt('tank'), false);
  assert.equal(hasMyShirt('drying'), true);
  assert.equal(hasMyShirt('dry'), true);
});

test('outfitPrompt: dry 에서만 E 안내, drying 은 안 눌리는 힌트', () => {
  assert.deepEqual(outfitPrompt('dry', 0), { text: '새 셔츠 입기', actionable: true });
  assert.deepEqual(outfitPrompt('drying', 4.2), { text: '셔츠가 마르는 중… (5초)', actionable: false });
  assert.deepEqual(outfitPrompt('drying', 0.01), { text: '셔츠가 마르는 중… (1초)', actionable: false });
  for (const s of ['clean', 'dirty', 'tank']) assert.equal(outfitPrompt(s, 0), null);
});

test('MY_SHIRT_SLOT: 빨랫줄 칸 번호(0~5)', () => {
  assert.ok(Number.isInteger(MY_SHIRT_SLOT) && MY_SHIRT_SLOT >= 0 && MY_SHIRT_SLOT < 6);
});
