import test from 'node:test';
import assert from 'node:assert/strict';
import {
  makeId, nickFor, cleanNick, buildState, validateState, createSendPolicy, createInterpBuffer, isStale, nearestN, lerpAngle, wrapAngle, ANIMS, OUTFITS,
} from '../src/logic/net.js';
import { MULTIPLAYER } from '../src/config.js';

const good = { id: 'abc123def456', nick: '야근 마스터 #123', space: 'yard', x: 1.5, z: -2, y: 0, rotY: 1, anim: 'walk', outfit: 'clean', seat: false, t: 1000 };
const opts = { adjectives: MULTIPLAYER.nickAdjectives, nouns: MULTIPLAYER.nickNouns, nickMax: 24 };

test('makeId: 가짜 crypto 를 쓰고 12자리 16진수, 서로 다르다', () => {
  let n = 0;
  const fake = { getRandomValues: (a) => { for (let i = 0; i < a.length; i++) a[i] = (n++ * 37) % 256; return a; } };
  const a = makeId(fake);
  const b = makeId(fake);
  assert.match(a, /^[0-9a-f]{12}$/);
  assert.notEqual(a, b);
  assert.match(makeId(), /^[0-9a-f]{12}$/);
});

test('nickFor: 같은 id 는 같은 닉네임, 형식은 "형용사 명사 #숫자"', () => {
  const n1 = nickFor('abc123def456', MULTIPLAYER.nickAdjectives, MULTIPLAYER.nickNouns);
  assert.equal(n1, nickFor('abc123def456', MULTIPLAYER.nickAdjectives, MULTIPLAYER.nickNouns));
  assert.match(n1, / #[1-9]\d\d$/);
  const set = new Set(Array.from({ length: 200 }, (_, i) => nickFor(`id${i}xyz`, MULTIPLAYER.nickAdjectives, MULTIPLAYER.nickNouns)));
  assert.ok(set.size > 100, '다양한 닉네임이 나온다');
  assert.equal(nickFor('abcd', [], []).startsWith('방문자'), true);
});

test('cleanNick: 제어문자·꺾쇠 제거, 길이 제한, 문자열이 아니면 null', () => {
  assert.equal(cleanNick('<b>hi</b>'), 'bhi/b');
  assert.equal(cleanNick('  a\u0000b\n c  '), 'ab c');
  assert.equal(cleanNick('가'.repeat(100), 10), '가'.repeat(10));
  assert.equal(cleanNick(123), null);
  assert.equal(cleanNick('   '), null);
  assert.equal(cleanNick({ toString() { return 'x'; } }), null);
});

test('validateState: 정상 메시지를 통과시키고 모르는 필드는 버린다', () => {
  const s = validateState({ ...good, evil: 'x' }, opts);
  assert.deepEqual(s, { id: good.id, nick: good.nick, space: 'yard', x: 1.5, z: -2, y: 0, rotY: 1, anim: 'walk', outfit: 'clean', seat: false, t: 1000 });
  assert.equal('evil' in s, false);
});

test('validateState: 형식이 틀리면 null', () => {
  for (const bad of [null, undefined, 5, 'str', [], { ...good, id: 'a' }, { ...good, id: 'bad id!' }, { ...good, id: 7 }, { ...good, space: 'moon' }, { ...good, space: 3 },
    { ...good, x: NaN }, { ...good, x: '1' }, { ...good, z: Infinity }, { ...good, rotY: null }, { ...good, t: undefined }, { ...good, y: 'a' }]) {
    assert.equal(validateState(bad, opts), null, JSON.stringify(bad));
  }
});

test('validateState: 숫자는 범위로 자르고 동작·옷은 목록 밖이면 기본값', () => {
  const s = validateState({ ...good, x: 1e12, z: -1e12, y: 99, rotY: 7, anim: 'moonwalk', outfit: 'gold', seat: 'yes' }, opts);
  assert.equal(s.x, 5000);
  assert.equal(s.z, -5000);
  assert.equal(s.y, 6);
  assert.ok(Math.abs(s.rotY) <= Math.PI + 1e-9);
  assert.equal(s.anim, 'idle');
  assert.equal(s.outfit, 'clean');
  assert.equal(s.seat, false);
  assert.equal(validateState({ ...good, y: -3 }, opts).y, 0);
  for (const a of ANIMS) assert.equal(validateState({ ...good, anim: a }, opts).anim, a);
  for (const o of OUTFITS) assert.equal(validateState({ ...good, outfit: o }, opts).outfit, o);
});

test('validateState: 닉네임은 다듬고, 길면 자르고, 비면 id 로 만든 이름', () => {
  assert.equal(validateState({ ...good, nick: 'a'.repeat(500) }, opts).nick.length, 24);
  assert.equal(validateState({ ...good, nick: '<script>' }, opts).nick, 'script');
  assert.equal(validateState({ ...good, nick: 5 }, opts).nick, nickFor(good.id, opts.adjectives, opts.nouns));
  assert.equal(validateState({ ...good, nick: '' }, opts).nick, nickFor(good.id, opts.adjectives, opts.nouns));
});

test('buildState: 소수 둘째 자리로 줄이고 검증을 통과한다', () => {
  const s = buildState({ id: good.id, nick: good.nick }, { space: 'laundry', x: 300.123456, z: 1.999, y: 0, rotY: 7, anim: 'idle', outfit: 'tank', seat: true }, 42);
  assert.equal(s.x, 300.12);
  assert.equal(s.z, 2);
  assert.ok(Math.abs(s.rotY) <= Math.PI);
  assert.equal(s.t, 42);
  assert.ok(validateState(s, opts));
});

test('각도: wrapAngle / lerpAngle 은 짧은 쪽으로', () => {
  assert.ok(Math.abs(Math.abs(wrapAngle(3 * Math.PI)) - Math.PI) < 1e-9);
  const m = lerpAngle(3, -3, 0.5); // 3 -> -3 은 2PI 를 가로지르는 짧은 길(약 0.28rad)
  assert.ok(Math.abs(Math.abs(m) - Math.PI) < 0.2, `mid=${m}`);
  assert.equal(lerpAngle(1, 2, 0), 1);
  assert.ok(Math.abs(lerpAngle(1, 2, 1) - 2) < 1e-9);
});

// ---- 전송 정책 ----
const cfg = { hz: 5, heartbeatMs: 1000, epsPos: 0.05, epsRot: 0.05, minGapMs: 40 };
const st = (o = {}) => ({ space: 'yard', x: 0, z: 0, y: 0, rotY: 0, anim: 'idle', outfit: 'clean', seat: false, ...o });

test('sendPolicy: 첫 호출은 보내고, 같은 상태는 하트비트 전까지 안 보낸다', () => {
  const p = createSendPolicy(cfg);
  assert.equal(p.update(0, st(), true), true);
  assert.equal(p.update(300, st(), true), false);
  assert.equal(p.update(900, st(), true), false);
  assert.equal(p.update(1000, st(), true), true, '하트비트');
  assert.equal(p.update(1500, st(), true), false);
});

test('sendPolicy: 움직임은 최대 hz, 작은 떨림은 무시', () => {
  const p = createSendPolicy(cfg);
  p.update(0, st(), true);
  assert.equal(p.update(100, st({ x: 1 }), true), false, '200ms 전에는 안 보낸다');
  assert.equal(p.update(200, st({ x: 1 }), true), true);
  assert.equal(p.update(400, st({ x: 1.01 }), true), false, 'eps 이하');
  assert.equal(p.update(400, st({ x: 1.2 }), true), true);
  assert.equal(p.update(600, st({ x: 1.2, rotY: 0.5 }), true), true, '방향 변화');
  let sends = 0;
  for (let t = 1000; t < 2000; t += 16) if (p.update(t, st({ x: 2 + t / 100 }), true)) sends++;
  assert.ok(sends <= 5, `1초에 ${sends}번`);
});

test('sendPolicy: 동작·옷·앉기·공간이 바뀌면 즉시(최소 간격만)', () => {
  const p = createSendPolicy(cfg);
  p.update(0, st(), true);
  assert.equal(p.update(10, st({ anim: 'walk' }), true), false, 'minGap 안');
  assert.equal(p.update(50, st({ anim: 'walk' }), true), true);
  assert.equal(p.update(100, st({ anim: 'walk', outfit: 'dirty' }), true), true);
  assert.equal(p.update(150, st({ anim: 'walk', outfit: 'dirty', seat: true }), true), true);
  assert.equal(p.update(200, st({ anim: 'walk', outfit: 'dirty', seat: true, space: 'laundry' }), true), true);
});

test('sendPolicy: 상대가 없으면 안 보내고, force 하면 곧 보낸다', () => {
  const p = createSendPolicy(cfg);
  assert.equal(p.update(0, st(), false), false);
  assert.equal(p.update(5000, st({ x: 9 }), false), false);
  assert.equal(p.update(5100, st({ x: 9 }), true), true);
  assert.equal(p.update(5200, st({ x: 9 }), true), false);
  p.force();
  assert.equal(p.update(5300, st({ x: 9 }), true), true);
  p.reset();
  assert.equal(p.update(5310, st({ x: 9 }), true), true);
});

// ---- 보간 ----
const smp = (x, z, o = {}) => ({ x, y: 0, z, rotY: 0, anim: 'walk', outfit: 'clean', seat: false, space: 'yard', ...o });

test('interp: 표본 사이를 선형 보간(과거 delay 만큼)', () => {
  const b = createInterpBuffer({ delayMs: 200 });
  b.push(smp(0, 0), 1000);
  b.push(smp(2, 0), 1200);
  b.push(smp(4, 0), 1400);
  const s = b.sample(1500); // rt=1300 -> 2 와 4 의 중간
  assert.ok(Math.abs(s.x - 3) < 1e-9);
  assert.ok(Math.abs(s.speed - 10) < 1e-9);
  assert.equal(b.sample(1100).x, 0, '첫 표본보다 과거면 첫 표본');
  assert.equal(createInterpBuffer().sample(1), null);
});

test('interp: 각도는 짧은 쪽으로, 이산 값(동작·옷)은 구간 앞 표본', () => {
  const b = createInterpBuffer({ delayMs: 0 });
  b.push(smp(0, 0, { rotY: 3, outfit: 'clean' }), 0);
  b.push(smp(0, 0, { rotY: -3, outfit: 'dirty', anim: 'idle' }), 200);
  const mid = b.sample(100);
  assert.ok(Math.abs(Math.abs(mid.rotY) - Math.PI) < 0.2);
  assert.equal(mid.outfit, 'clean');
  assert.equal(mid.anim, 'walk');
  assert.equal(b.sample(200).outfit, 'dirty');
});

test('interp: 마지막 표본 뒤에서 걷는 중이면 짧게 내다보고, 멈춘 상태면 멈춘다', () => {
  const b = createInterpBuffer({ delayMs: 0, extrapolateMs: 100 });
  b.push(smp(0, 0), 0);
  b.push(smp(1, 0), 200); // 5 u/s
  assert.ok(Math.abs(b.sample(250).x - 1.25) < 1e-9);
  assert.ok(Math.abs(b.sample(5000).x - 1.5) < 1e-9, '최대 100ms 만큼만');
  b.push(smp(1.2, 0, { anim: 'idle' }), 400);
  const s = b.sample(2000);
  assert.equal(s.x, 1.2);
  assert.equal(s.speed, 0);
});

test('interp: 공간이 바뀌거나 먼 점프면 보간 없이 곧장 옮긴다', () => {
  const b = createInterpBuffer({ delayMs: 100, teleportDist: 8 });
  b.push(smp(0, 0), 0);
  b.push(smp(1, 0), 200);
  b.push(smp(300, 0, { space: 'laundry' }), 400);
  assert.equal(b.size, 1);
  const s = b.sample(450);
  assert.equal(s.x, 300);
  assert.equal(s.space, 'laundry');
  b.push(smp(310, 0, { space: 'laundry' }), 500);
  assert.equal(b.size, 1, '같은 공간이어도 teleportDist 초과면 점프');
  b.push(smp(311, 0, { space: 'laundry' }), 600);
  assert.equal(b.size, 2);
});

test('interp: 시각이 같거나 뒤로 간 표본도 순서를 지키고 최대 개수를 넘지 않는다', () => {
  const b = createInterpBuffer({ delayMs: 0, maxSamples: 4 });
  for (let i = 0; i < 10; i++) b.push(smp(i * 0.1, 0), 100);
  assert.equal(b.size, 4);
  assert.ok(b.latest.at > 100);
});

test('isStale / nearestN', () => {
  assert.equal(isStale(0, 6000, 6000), false);
  assert.equal(isStale(0, 6001, 6000), true);
  const items = [{ id: 'a', x: 10, z: 0 }, { id: 'b', x: 1, z: 0 }, { id: 'c', x: 5, z: 0 }, { id: 'd', x: 2, z: 0 }];
  assert.deepEqual(nearestN(items, { x: 0, z: 0 }, 2).map((i) => i.id), ['b', 'd']);
  assert.equal(nearestN(items, { x: 0, z: 0 }, 10).length, 4);
  assert.equal(nearestN(items, { x: 0, z: 0 }, 0).length, 0);
});
