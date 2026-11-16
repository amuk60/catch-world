import test from 'node:test';
import assert from 'node:assert/strict';
import { createCookieCrack, crackStage, CRACK } from '../src/logic/cookieCrack.js';

function clock() { let t = 0; return { now: () => t, advance: (s) => { t += s; } }; }

test('crackStage: 진행도에 따라 0~4 단계(실금 -> 큰 금 -> 흔들림 -> 깨짐)', () => {
  assert.deepEqual([0, 0.19, 0.2, 0.49, 0.5, 0.79, 0.8, 0.99, 1].map((p) => crackStage(p)), [0, 0, 1, 1, 2, 2, 3, 3, 4]);
});

test('한 번 누르면 perPress 만큼 오른다', () => {
  const c = clock();
  const k = createCookieCrack({ now: c.now });
  const r = k.press();
  assert.equal(r.counted, true);
  assert.ok(Math.abs(r.progress - CRACK.perPress) < 1e-9);
  assert.equal(r.presses, 1);
});

test('키 반복(repeat)은 세지 않는다: 꾹 눌러서는 진행되지 않는다', () => {
  const c = clock();
  const k = createCookieCrack({ now: c.now });
  for (let i = 0; i < 50; i++) { c.advance(0.03); assert.equal(k.press({ repeat: true }).counted, false); }
  assert.equal(k.presses, 0);
  assert.equal(k.progress, 0);
  assert.equal(k.broken, false);
});

test('초당 5번 연타하면 약 3초·14번 안팎에 깨진다(12~18번, 3~5초)', () => {
  for (const rate of [5, 4.5]) {
    const c = clock();
    const k = createCookieCrack({ now: c.now });
    let t = 0;
    while (!k.broken && t < 20) { c.advance(1 / rate); t += 1 / rate; k.press(); }
    assert.ok(k.broken, `rate ${rate}`);
    assert.ok(k.presses >= 12 && k.presses <= 18, `presses ${k.presses}`);
    assert.ok(t >= 2.5 && t <= 5.2, `time ${t}`);
  }
});

test('느리게(초당 2번) 누르면 줄어드는 속도를 못 이겨 깨지지 않는다', () => {
  const c = clock();
  const k = createCookieCrack({ now: c.now });
  for (let i = 0; i < 60; i++) { c.advance(0.5); k.press(); }
  assert.equal(k.broken, false);
});

test('멈추면 초당 25% 씩 줄고 0 아래로는 내려가지 않는다', () => {
  const c = clock();
  const k = createCookieCrack({ now: c.now });
  for (let i = 0; i < 4; i++) k.press(); // 0.48
  const before = k.progress;
  c.advance(1);
  assert.ok(Math.abs(before - k.progress - 0.25) < 1e-9);
  c.advance(10);
  assert.equal(k.progress, 0);
});

test('가득 차면 깨지고, 이후에는 더 세지도 줄지도 않는다', () => {
  const c = clock();
  const k = createCookieCrack({ now: c.now, perPress: 0.5 });
  k.press();
  const r = k.press();
  assert.equal(r.broken, true);
  assert.equal(r.stage, 4);
  c.advance(5);
  assert.equal(k.press().counted, false);
  assert.equal(k.progress, 1);
  assert.equal(k.presses, 2);
});

test('reset 하면 처음으로 돌아간다', () => {
  const c = clock();
  const k = createCookieCrack({ now: c.now, perPress: 1 });
  k.press();
  k.reset();
  assert.equal(k.broken, false);
  assert.equal(k.presses, 0);
  assert.equal(k.progress, 0);
  assert.equal(k.press().broken, true);
});
