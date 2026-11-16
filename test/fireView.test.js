import test from 'node:test';
import assert from 'node:assert/strict';
import { createFireView, canToggleFireView, isFireViewKey } from '../src/logic/fireView.js';
import { createFpBlend } from '../src/logic/fpCamera.js';
import { createPassive, isMeditating } from '../src/logic/passive.js';
import { FIRST_PERSON, PASSIVE, FIRE_ZONE_RADIUS } from '../src/config.js';

const seatedAtFire = { mode: 'seated', meditating: true, typing: false };

test('isFireViewKey: V 만(반복·수식키 조합 제외)', () => {
  assert.equal(isFireViewKey({ code: 'KeyV' }), true);
  assert.equal(isFireViewKey({ code: 'KeyV', repeat: true }), false);
  assert.equal(isFireViewKey({ code: 'KeyV', ctrlKey: true }), false);
  assert.equal(isFireViewKey({ code: 'KeyV', metaKey: true }), false);
  assert.equal(isFireViewKey({ code: 'KeyB' }), false);
  assert.equal(isFireViewKey(null), false);
});

test('canToggleFireView: 앉은 채 불멍 중일 때만. 서 있기·굽는 중·다른 모드·불에서 먼 자리·입력 중에는 무시', () => {
  assert.equal(canToggleFireView(seatedAtFire), true);
  assert.equal(canToggleFireView({ ...seatedAtFire, typing: true }), false);
  assert.equal(canToggleFireView({ ...seatedAtFire, meditating: false }), false);
  for (const mode of ['free', 'roasting', 'fortune', 'result', 'transition', 'wearing', 'interview-choice', 'interview-play', 'item-choice']) {
    assert.equal(canToggleFireView({ ...seatedAtFire, mode }), false, mode);
  }
});

test('토글: V 로 켜고 V 로 끈다. 조건이 안 맞으면 켜지지 않는다', () => {
  const v = createFireView();
  assert.equal(v.on, false);
  assert.equal(v.toggle({ ...seatedAtFire, mode: 'free', meditating: false }), false);
  assert.equal(v.on, false);
  assert.equal(v.toggle(seatedAtFire), true);
  assert.equal(v.on, true);
  assert.equal(v.toggle(seatedAtFire), true);
  assert.equal(v.on, false);
});

test('켜 둔 뒤에는 조건이 흐트러져도 V 로 끌 수 있고, Esc(off)도 끈다', () => {
  const v = createFireView();
  v.toggle(seatedAtFire);
  assert.equal(v.toggle({ mode: 'free', meditating: false, typing: false }), true);
  assert.equal(v.on, false);
  v.toggle(seatedAtFire);
  assert.equal(v.off(), true);
  assert.equal(v.off(), false);
  assert.equal(v.on, false);
});

test('sync: 앉아서 불멍 중(굽는 중 포함)에는 유지하고, 일어나거나 공간·모드가 바뀌면 끈다', () => {
  const v = createFireView();
  v.toggle(seatedAtFire);
  assert.equal(v.sync({ mode: 'seated', meditating: true }), true);
  assert.equal(v.sync({ mode: 'roasting', meditating: true }), true); // 1인칭 불멍 중 굽기를 시작해도 그대로 이어진다
  assert.equal(v.sync({ mode: 'seated', meditating: true }), true); // 굽기가 끝나면 다시 불멍 1인칭
  assert.equal(v.sync({ mode: 'free', meditating: false }), false); // 일어남(E·이동 키·클릭)
  v.toggle(seatedAtFire);
  assert.equal(v.sync({ mode: 'seated', meditating: false }), false); // 공간이 바뀌었거나 불에서 먼 자리
  v.toggle(seatedAtFire);
  assert.equal(v.sync({ mode: 'transition', meditating: false }), false);
  assert.equal(v.on, false);
});

test('끄면 카메라는 궤도 자세로 정확히 돌아온다(섞임 계수 0 이 될 때까지 0.5초)', () => {
  const blend = createFpBlend(FIRST_PERSON);
  const v = createFireView();
  v.toggle(seatedAtFire);
  for (let i = 0; i < 40; i++) blend.update(1 / 60, v.on); // 0.5초 남짓
  assert.equal(blend.value, 1);
  v.off();
  let k = 1;
  for (let i = 0; i < 40; i++) k = blend.update(1 / 60, v.on);
  assert.equal(k, 0);
  assert.equal(blend.active, false);
});

test('1인칭 불멍 중에도 불멍 감소는 계속 흐르고(5초마다), 일어나면 멈춘다', () => {
  const passive = createPassive(PASSIVE);
  const v = createFireView();
  v.toggle(seatedAtFire);
  let total = 0;
  for (let i = 0; i < PASSIVE.interval * 60 * 2; i++) {
    const meditating = isMeditating({ mode: 'seated', spaceId: 'yard', seatDistance: 3.2 }, FIRE_ZONE_RADIUS);
    v.sync({ mode: 'seated', meditating });
    total += passive.update(1 / 60, meditating);
  }
  assert.equal(v.on, true);
  assert.equal(total, PASSIVE.amount * 2);
  assert.equal(passive.update(1 / 60, false), 0);
});
