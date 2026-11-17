import test from 'node:test';
import assert from 'node:assert/strict';
import {
  makeId, nickFor, cleanNick, buildState, validateState, createInterpBuffer, isStale, nearestN, lerpAngle, wrapAngle, ANIMS, OUTFITS,
} from '../src/logic/net.js';
import { MULTIPLAYER } from '../src/config.js';

const good = { id: 'abc123def456', nick: '야근 너구리', space: 'yard', x: 1.5, z: -2, y: 0, rotY: 1, anim: 'walk', outfit: 'clean', seat: false, t: 1000 };
const opts = { adjectives: MULTIPLAYER.nickAdjectives, nouns: MULTIPLAYER.nickNouns };

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

test('validateState: 닉네임은 validateNick 로 다시 검사하고, 통과하지 못하면 id 로 만든 이름', () => {
  const fb = nickFor(good.id, opts.adjectives, opts.nouns);
  assert.equal(validateState({ ...good, nick: '  너구리   왕 ' }, opts).nick, '너구리 왕');
  for (const bad of ['a'.repeat(500), '가'.repeat(11), '<script>', '<b>x</b>', '시 발', 'f.u.c.k', '010-1234-5678', 'abc.com', 'a​b', 5, '', '가', null]) {
    assert.equal(validateState({ ...good, nick: bad }, opts).nick, fb, String(bad));
  }
});


test('buildState: 소수 둘째 자리로 줄이고 검증을 통과한다', () => {
  const s = buildState({ id: good.id, nick: good.nick }, { space: 'laundry', x: 300.123456, z: 1.999, y: 0, rotY: 7, anim: 'idle', outfit: 'tank', seat: true }, 42);
  assert.equal(s.x, 300.12);
  assert.equal(s.z, 2);
  assert.ok(Math.abs(s.rotY) <= Math.PI);
  assert.equal(s.t, 42);
  assert.ok(validateState(s, opts));
});

test('validateState: 속도(vx, vz)는 새 필드: 없으면 옛 메시지로 통과, 있으면 숫자만, 한쪽만 있거나 NaN 이면 거부, 범위로 자른다', () => {
  const old = validateState(good, opts);
  assert.equal('vx' in old, false, '옛 형식은 속도 없음');
  const ok = validateState({ ...good, vx: 3.5, vz: -1 }, opts);
  assert.equal(ok.vx, 3.5);
  assert.equal(ok.vz, -1);
  for (const bad of [{ vx: 1 }, { vz: 1 }, { vx: NaN, vz: 0 }, { vx: 0, vz: Infinity }, { vx: '1', vz: 0 }, { vx: null, vz: 0 }]) assert.equal(validateState({ ...good, ...bad }, opts), null, JSON.stringify(bad));
  const big = validateState({ ...good, vx: 1e9, vz: -1e9 }, opts);
  assert.equal(big.vx, 30);
  assert.equal(big.vz, -30);
});

test('buildState: 속도를 싣고(서 있으면 0), 검증을 통과한다', () => {
  const me = { id: good.id, nick: good.nick };
  const walk = buildState(me, { space: 'yard', x: 1, z: 2, y: 0, rotY: 0, anim: 'walk', outfit: 'clean', seat: false, vx: 3.14159, vz: -2 }, 1);
  assert.equal(walk.vx, 3.14);
  assert.equal(walk.vz, -2);
  assert.ok(validateState(walk, opts));
  const still = buildState(me, { space: 'yard', x: 1, z: 2, y: 0, rotY: 0, anim: 'idle', outfit: 'clean', seat: false, vx: 0.1, vz: 0.1 }, 1);
  assert.equal(still.vx, 0);
  assert.equal(buildState(me, { space: 'yard', x: 1, z: 2, anim: 'idle', outfit: 'clean' }, 1).vx, 0, '속도를 안 주면 0');
});

test('각도: wrapAngle / lerpAngle 은 짧은 쪽으로', () => {
  assert.ok(Math.abs(Math.abs(wrapAngle(3 * Math.PI)) - Math.PI) < 1e-9);
  const m = lerpAngle(3, -3, 0.5); // 3 -> -3 은 2PI 를 가로지르는 짧은 길(약 0.28rad)
  assert.ok(Math.abs(Math.abs(m) - Math.PI) < 0.2, `mid=${m}`);
  assert.equal(lerpAngle(1, 2, 0), 1);
  assert.ok(Math.abs(lerpAngle(1, 2, 1) - 2) < 1e-9);
});

// 전송 정책·속도 기반 보간은 netMotion.test.js

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
