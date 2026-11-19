import test from 'node:test';
import assert from 'node:assert/strict';
import { auroraEnvelope, createAuroraTint } from '../src/logic/aurora.js';
import { INCINERATOR } from '../src/config.js';

const FADE = INCINERATOR.auroraFade;
const aurora = INCINERATOR.items.find((i) => i.id === 'aurora');
const run = (tint, seconds, dt = 0.05) => { let a = 0; for (let t = 0; t < seconds - 1e-9; t += dt) a = tint.update(dt); return a; };

test('오로라 가루: 불꽃 색이 15초 유지된다(번짐 0.6초, 사그라듦 2초)', () => {
  assert.equal(aurora.flame.tint, 'aurora');
  assert.equal(aurora.flame.seconds, 15);
  assert.equal(FADE.in, 0.6);
  assert.equal(FADE.out, 2);
});

test('auroraEnvelope: 0에서 번져 1을 유지하다 끝나기 2초 전부터 사그라들고 끝나면 0', () => {
  const d = aurora.flame.seconds;
  assert.equal(auroraEnvelope(0, d), 0);
  assert.ok(Math.abs(auroraEnvelope(0.3, d) - 0.5) < 1e-9);
  assert.equal(auroraEnvelope(0.6, d), 1);
  assert.equal(auroraEnvelope(7, d), 1);
  assert.equal(auroraEnvelope(d - 2, d), 1);
  assert.ok(Math.abs(auroraEnvelope(d - 1, d) - 0.5) < 1e-9);
  assert.equal(auroraEnvelope(d, d), 0);
  assert.equal(auroraEnvelope(d + 3, d), 0);
  assert.equal(auroraEnvelope(NaN, d), 0);
  let visible = 0; // 15초 중 눈에 띄게(0.5 이상) 보이는 시간은 13.5초 이상
  for (let t = 0; t < d; t += 0.01) if (auroraEnvelope(t, d) >= 0.5) visible += 0.01;
  assert.ok(visible >= 13.5, `visible ${visible}`);
});

test('createAuroraTint: 시작하면 15초 동안 켜지고 끝나면 꺼진다', () => {
  const tint = createAuroraTint();
  assert.equal(tint.active, false);
  tint.start(15);
  assert.equal(tint.active, true);
  assert.equal(run(tint, 0.6), 1);
  assert.equal(run(tint, 5), 1);
  assert.equal(tint.active, true);
  run(tint, 9.5);
  assert.equal(tint.active, false);
  assert.equal(tint.amount, 0);
});

test('createAuroraTint: 켜져 있을 때 또 던지면 지금 세기에서 이어서 다시 15초(번쩍임·끊김 없음)', () => {
  const tint = createAuroraTint();
  tint.start(15);
  run(tint, 10);
  const before = tint.amount;
  tint.start(15);
  const after = tint.update(0.001);
  assert.ok(Math.abs(after - before) < 0.01);
  assert.equal(run(tint, 12), 1); // 던진 뒤 번짐 시간을 빼고 14.4초가 남아 12초 뒤에도 최대다
  const t2 = createAuroraTint(); // 사그라드는 중(끝나기 1초 전)에 던져도 갑자기 튀지 않는다
  t2.start(15);
  run(t2, 14);
  const low = t2.amount;
  assert.ok(low > 0 && low < 1);
  t2.start(15);
  let prev = low;
  for (let i = 0; i < 40; i++) { const a = t2.update(0.05); assert.ok(Math.abs(a - prev) < 0.1); prev = a; }
});

test('createAuroraTint: 클릭하면 1초에 걸쳐 원래 색으로 돌아온다(켜져 있을 때만, 한 번만)', () => {
  const tint = createAuroraTint();
  assert.equal(tint.clear(), false); // 꺼져 있으면 아무 일 없다
  tint.start(15);
  run(tint, 5);
  assert.equal(tint.clear(), true);
  assert.equal(tint.returning, true);
  assert.equal(tint.clear(), false);
  const a = run(tint, 0.5);
  assert.ok(a > 0.4 && a < 0.6, `절반 ${a}`);
  assert.equal(run(tint, 0.6), 0);
  assert.equal(tint.active, false);
  assert.equal(tint.returning, false);
});

test('createAuroraTint: 되돌리는 중이나 되돌린 뒤 다시 던지면 새로 켜진다', () => {
  const tint = createAuroraTint();
  tint.start(15); run(tint, 3); tint.clear(); run(tint, 0.3);
  tint.start(15);
  assert.equal(tint.returning, false);
  assert.equal(run(tint, 1), 1);
  tint.clear(); run(tint, 1.2);
  assert.equal(tint.active, false);
  tint.start(15);
  assert.ok(run(tint, 1) > 0.99);
});

test('createAuroraTint: stop 은 바로 끄고, 0초 이하로는 켜지지 않는다', () => {
  const tint = createAuroraTint();
  tint.start(15); run(tint, 2); tint.stop();
  assert.equal(tint.amount, 0);
  assert.equal(tint.active, false);
  tint.start(0);
  assert.equal(tint.active, false);
});
