import test from 'node:test';
import assert from 'node:assert/strict';
import { roomSizes, roomsNeeded, deliveredPerSec, maxPlayers, monthlyMessages, makeTrace, simulatePlayer, simulateCrowd } from '../src/logic/netBudget.js';
import { MULTIPLAYER as C } from '../src/config.js';

test('모델: 방 크기와 초당 전달 수(= 인원 × (정원-1) × 쌍당 초당 전송)', () => {
  assert.deepEqual(roomSizes(10, 4), [4, 4, 2]);
  assert.equal(roomsNeeded(60, 4), 15);
  assert.equal(roomsNeeded(0, 4), 0);
  assert.ok(Math.abs(deliveredPerSec(60, 4, 1) - 180) < 1e-9, '꽉 찬 방: 60 × 3');
  assert.ok(Math.abs(deliveredPerSec(5, 6, 1.15) - 5 * 4 * 1.15) < 1e-9, '실측(5명, 1.15): 23건/초');
  assert.ok(Math.abs(deliveredPerSec(60, 6, 1.15) - 60 * 5 * 1.15) < 1e-9, '옛 설정: 345건/초');
  assert.ok(deliveredPerSec(60, 6, 1.15) > 100, '옛 설정은 한도(100/초) 초과');
  assert.equal(maxPlayers(100, 4, 0.5), 67);
  assert.equal(monthlyMessages(10, 1, 30), 1080000);
});

test('설정: 방 정원 4, 60명이 공간 하나에 몰려도 방 수가 maxShards 안', () => {
  assert.equal(C.roomCap, 4);
  assert.ok(C.maxShards >= roomsNeeded(60, C.roomCap), '한 공간에 60명');
  assert.ok(C.maxShards >= 16);
});

test('궤적: 같은 시드는 같은 궤적, 걷는 속도는 4 이하', () => {
  const a = makeTrace('wander', 5);
  const b = makeTrace('wander', 5);
  let prev = null;
  for (let i = 0; i < 600; i++) {
    const p = a.step(1 / 60);
    assert.deepEqual(p, b.step(1 / 60));
    if (prev) assert.ok(Math.hypot(p.x - prev.x, p.z - prev.z) <= 4 / 60 + 1e-9);
    prev = p;
  }
});

// 시뮬레이터: 실제 전송 정책(속도 추정 + 정책 + 메시지 만들기·검사 + 받는 쪽 보간)을 합성 궤적에 돌려 사람당 평균 전송률을 잰다.
const SEC = 300;
const PLAYERS = 8;
const worst = simulateCrowd('wander', C, { players: PLAYERS, seconds: SEC });
const stroll = simulateCrowd('stroll', C, { players: PLAYERS, seconds: SEC });
const idle = simulateCrowd('idle', C, { players: PLAYERS, seconds: SEC });
const total = (rate) => deliveredPerSec(60, C.roomCap, rate);

test('시뮬레이션: 60명 모두 쉬지 않고 지그재그(최악)로 움직여도 초당 전달 80건 이하', () => {
  console.log(`  [최악 wander] 사람당 ${worst.perSec.toFixed(3)}건/초 -> 60명 정원 ${C.roomCap}: ${total(worst.perSec).toFixed(1)}건/초 (옛 방식 345); 화면 오차 평균 ${worst.avgErr.toFixed(2)} p95 ${worst.p95Err.toFixed(2)}`);
  assert.ok(total(worst.perSec) <= 80, `${total(worst.perSec)}`);
  assert.ok(total(stroll.perSec) <= 80);
});

test('시뮬레이션: 절반은 최악으로 움직이고 절반은 거의 서 있는 섞인 경우 초당 40건 이하', () => {
  const mixed = deliveredPerSec(30, C.roomCap, worst.perSec) + deliveredPerSec(30, C.roomCap, idle.perSec);
  console.log(`  [섞임 50% wander + 50% idle] ${mixed.toFixed(1)}건/초 (idle 사람당 ${idle.perSec.toFixed(3)}건/초)`);
  assert.ok(mixed <= 40, `${mixed}`);
});

test('시뮬레이션: 전부 서 있으면 하트비트만(사람당 초당 약 1/heartbeatSec)', () => {
  const r = simulatePlayer('idle', 99, { ...C, heartbeatMovingMs: C.heartbeatMs }, { seconds: 20 });
  assert.ok(r.messages <= 1 + Math.ceil(20000 / C.heartbeatMs) + 2);
  const still = simulatePlayer('idle', 3, C, { seconds: 8 }); // 8초 안에는 첫 전송 + 걷기가 없으면 하트비트 0~1
  assert.ok(still.messages <= 8);
});

test('시뮬레이션: 혼자 있으면 아무것도 보내지 않는다(전송 정책 hasPeers=false)', async () => {
  const { createSendPolicy } = await import('../src/logic/net.js');
  const p = createSendPolicy({ hz: C.sendHz, minGapMs: C.minGapMs, heartbeatMs: C.heartbeatMs, heartbeatMovingMs: C.heartbeatMovingMs });
  let n = 0;
  const trace = makeTrace('wander', 4);
  for (let i = 0; i < 60 * 120; i++) {
    const q = trace.step(1 / 60);
    if (p.update((i * 1000) / 60, { space: 'yard', x: q.x, z: q.z, rotY: q.rotY, anim: q.anim, outfit: 'clean', seat: false, vx: 4, vz: 0 }, false)) n++;
  }
  assert.equal(n, 0);
});
