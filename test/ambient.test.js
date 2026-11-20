import test from 'node:test';
import assert from 'node:assert/strict';
import { phaseWeight, ambientLevel, nextInterval, pickVariant, createAmbientScheduler } from '../src/logic/ambient.js';
import { AMBIENT, FIRE_ZONE_RADIUS } from '../src/config.js';
import { RECIPES } from '../src/audio/recipes.js';

function seeded(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

test('자연 소리 설정: 쓰는 레시피가 모두 있고, 간격은 새 8~20초·벌레는 그보다 촘촘하지 않게 천천히', () => {
  for (const c of ['birds', 'insects']) for (const name of AMBIENT[c].sounds) assert.ok(RECIPES[name], `${name} 레시피 없음`);
  assert.deepEqual(AMBIENT.birds.interval, [8, 20]);
  assert.ok(AMBIENT.insects.interval[0] >= 4);
  assert.ok(AMBIENT.volume > 0 && AMBIENT.volume <= 0.5);
  assert.equal(RECIPES.birdChirp.group, '마당 자연');
});

test('phaseWeight: 단계 비중을 넘어가는 정도만큼 섞는다', () => {
  const w = { morning: 1, sunset: 0.6, evening: 0, dawn: 0.25 };
  assert.equal(phaseWeight(w, { name: 'morning', next: 'sunset', blend: 0 }), 1);
  assert.ok(Math.abs(phaseWeight(w, { name: 'morning', next: 'sunset', blend: 0.5 }) - 0.8) < 1e-9);
  assert.equal(phaseWeight(w, { name: 'evening', next: 'dawn', blend: 0 }), 0);
  assert.equal(phaseWeight(w, { name: 'nope', next: 'nope', blend: 0 }), 0);
});

test('ambientLevel: 마당에서만, 소리 끔·불멍·실내·꺼짐이면 0', () => {
  const base = { space: 'yard', muted: false, meditating: false, fireDistance: 100 };
  assert.equal(ambientLevel(base), AMBIENT.volume);
  assert.equal(ambientLevel({ ...base, space: 'laundry' }), 0);
  assert.equal(ambientLevel({ ...base, space: 'interview' }), 0);
  assert.equal(ambientLevel({ ...base, muted: true }), 0);
  assert.equal(ambientLevel({ ...base, meditating: true }), 0);
  assert.equal(ambientLevel(base, { ...AMBIENT, enabled: false }), 0);
});

test('ambientLevel: 소각장 반경 안에서는 줄이고, 반경 밖으로 나가며 서서히 돌아온다', () => {
  const at = (d) => ambientLevel({ space: 'yard', muted: false, meditating: false, fireDistance: d });
  assert.ok(Math.abs(at(1) - AMBIENT.volume * AMBIENT.fireDuck) < 1e-9);
  assert.ok(Math.abs(at(FIRE_ZONE_RADIUS) - AMBIENT.volume * AMBIENT.fireDuck) < 1e-9);
  const mid = at(FIRE_ZONE_RADIUS + AMBIENT.fireDuckFade / 2);
  assert.ok(mid > at(1) && mid < AMBIENT.volume);
  assert.equal(at(FIRE_ZONE_RADIUS + AMBIENT.fireDuckFade + 1), AMBIENT.volume);
});

test('nextInterval·pickVariant: 범위 안, 직전과 같은 소리는 연달아 나오지 않는다', () => {
  const rng = seeded(3);
  for (let i = 0; i < 200; i++) {
    const v = nextInterval([8, 20], rng);
    assert.ok(v >= 8 && v <= 20);
  }
  let last = null;
  for (let i = 0; i < 100; i++) {
    const n = pickVariant(['a', 'b', 'c'], last, rng);
    assert.notEqual(n, last);
    last = n;
  }
  assert.equal(pickVariant(['a'], 'a', rng), 'a');
  assert.equal(pickVariant([], null, rng), null);
});

// 10분을 0.1초씩 흘려 본다.
function simulate(sky, seconds = 600, active = true, seed = 7) {
  const sch = createAmbientScheduler(AMBIENT, seeded(seed));
  const out = [];
  for (let t = 0; t < seconds; t += 0.1) for (const e of sch.step(0.1, sky, active)) out.push({ ...e, t });
  return out;
}

test('일정표: 아침엔 새소리만, 드문드문(8~20초 간격), 2~3종이 섞여 나온다', () => {
  const ev = simulate({ name: 'morning', next: 'sunset', blend: 0 });
  assert.ok(ev.length > 0 && ev.every((e) => e.category === 'birds'));
  assert.ok(ev.length >= 600 / 20 - 3 && ev.length <= 600 / 8 + 2, `새소리 ${ev.length}번`);
  for (let i = 1; i < ev.length; i++) assert.ok(ev[i].t - ev[i - 1].t >= 7.9, '너무 촘촘함');
  assert.ok(new Set(ev.map((e) => e.name)).size >= 2);
});

test('일정표: 저녁엔 풀벌레만, 새벽엔 둘 다 조금', () => {
  const evening = simulate({ name: 'evening', next: 'dawn', blend: 0 });
  assert.ok(evening.length > 0 && evening.every((e) => e.category === 'insects'));
  const dawn = simulate({ name: 'dawn', next: 'morning', blend: 0 }, 1200);
  assert.ok(dawn.some((e) => e.category === 'insects') && dawn.some((e) => e.category === 'birds'));
});

test('일정표: active 가 false 면(실내·소리 끔) 아무 소리도 안 나고 시간도 쌓이지 않는다', () => {
  const sch = createAmbientScheduler(AMBIENT, seeded(1));
  const before = sch.waits;
  for (let i = 0; i < 6000; i++) assert.equal(sch.step(0.1, { name: 'morning', next: 'sunset', blend: 0 }, false).length, 0);
  assert.deepEqual(sch.waits, before);
});
