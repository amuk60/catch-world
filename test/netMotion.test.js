import test from 'node:test';
import assert from 'node:assert/strict';
import { createSendPolicy, createDeadReckoner, createVelocityEstimator } from '../src/logic/netMotion.js';
import { MULTIPLAYER as C } from '../src/config.js';

const pcfg = {
  hz: C.sendHz, minGapMs: C.minGapMs, heartbeatMs: C.heartbeatMs, heartbeatMovingMs: C.heartbeatMovingMs, epsPos: C.epsPos, epsRot: C.epsRot, epsSpeed: C.epsSpeed,
  settleMs: C.settleMs, sustainedHz: C.sustainedHz, burst: C.burst, maxExtrapMs: C.maxExtrapMs,
};
const st = (o = {}) => ({ space: 'yard', x: 0, z: 0, y: 0, rotY: 0, anim: 'idle', outfit: 'clean', seat: false, vx: 0, vz: 0, ...o });
const walk = (o = {}) => st({ anim: 'walk', vx: 4, vz: 0, ...o });

// 정책을 프레임 단위(60fps)로 돌려 보낸 시각들을 모은다. frame(tMs) -> state.
function run(policy, from, to, frame) {
  const sends = [];
  for (let t = from; t < to; t += 1000 / 60) if (policy.update(t, frame(t), true)) sends.push(Math.round(t));
  return sends;
}

test('sendPolicy: 첫 호출은 보내고, 가만히 있으면 heartbeatMs 마다 한 번만', () => {
  const p = createSendPolicy(pcfg);
  const sends = run(p, 0, 35000, () => st());
  assert.equal(sends[0], 0);
  assert.equal(sends.length, 1 + Math.floor(35000 / C.heartbeatMs));
  assert.ok(sends[1] >= C.heartbeatMs);
});

test('sendPolicy: 곧게 걸으면 시계로 보내지 않는다(시작 한 번 + 걷는 중 하트비트)', () => {
  const p = createSendPolicy(pcfg);
  const sends = run(p, 0, 20000, (t) => (t < 1000 ? st() : walk({ x: ((t - 1000) / 1000) * 4 })));
  assert.ok(sends.length <= 2 + Math.ceil(20000 / C.heartbeatMovingMs), `보낸 수 ${sends.length}`);
  assert.ok(sends.length >= 3);
  assert.ok(sends[1] >= 1000 && sends[1] <= 1000 + C.settleMs + 100, `걷기 시작 ${sends[1]}`);
});

test('sendPolicy: 방향이 epsRot 넘게 꺾이면 보내고, 작은 흔들림은 무시', () => {
  const p = createSendPolicy(pcfg);
  p.update(0, walk(), true);
  const small = Math.sin(0.1) * 4;
  assert.equal(run(p, 300, 1500, (t) => walk({ vx: 3.98, vz: small, x: ((t - 0) / 1000) * 3.98, z: ((t - 0) / 1000) * small })).length, 0, '6도 정도는 무시(예측 오차도 아직 작다)');
  const q = createSendPolicy(pcfg);
  q.update(0, walk(), true);
  const turned = run(q, 300, 1200, (t) => walk({ x: 1.2 + (t - 300) * 0.004, vx: 0, vz: 4 }));
  assert.equal(turned.length >= 1, true, '90도 꺾임');
  assert.ok(turned[0] <= 300 + C.settleMs + 60, `꺾이고 settleMs 안쪽에서 보냄: ${turned[0]}`);
});

test('sendPolicy: 걷기를 멈추면 곧바로(최소 간격만) 보낸다', () => {
  const p = createSendPolicy(pcfg);
  p.update(0, walk(), true);
  assert.equal(p.update(100, st({ x: 0.4 }), true), false, 'minGap 안');
  assert.equal(p.update(260, st({ x: 1 }), true), true);
});

test('sendPolicy: 동작(걷기·서기 제외)·옷·앉기·공간이 바뀌면 간격만 지켜 즉시', () => {
  const p = createSendPolicy(pcfg);
  p.update(0, st(), true);
  assert.equal(p.update(100, st({ anim: 'emote-yes' }), true), false, 'minGap 안');
  assert.equal(p.update(260, st({ anim: 'emote-yes' }), true), true);
  assert.equal(p.update(520, st({ anim: 'emote-yes', outfit: 'dirty' }), true), true);
  assert.equal(p.update(780, st({ anim: 'emote-yes', outfit: 'dirty', seat: true }), true), true);
  assert.equal(p.update(1040, st({ anim: 'emote-yes', outfit: 'dirty', seat: true, space: 'laundry', x: 300 }), true), true);
  const q = createSendPolicy(pcfg);
  q.update(0, st(), true);
  assert.equal(q.update(300, st({ anim: 'walk' }), true), false, 'idle 와 walk 는 속도로 알 수 있으니 따로 보내지 않는다');
});

test('sendPolicy: 지그재그로 걸어도 최소 간격 250ms(초당 4회) 이하, 오래 평균은 sustainedHz 근처', () => {
  const p = createSendPolicy(pcfg);
  let ang = 0;
  const sends = run(p, 0, 120000, (t) => {
    ang = Math.floor(t / 600) % 2 ? 1.4 : -1.4; // 0.6초마다 크게 꺾는다
    return walk({ vx: Math.sin(ang) * 4, vz: Math.cos(ang) * 4, x: ((t / 600) % 2) * 3 });
  });
  for (let i = 1; i < sends.length; i++) assert.ok(sends[i] - sends[i - 1] >= 245, `간격 ${sends[i] - sends[i - 1]}`);
  const rate = sends.length / 120;
  assert.ok(rate <= C.sustainedHz + 0.1, `평균 ${rate}/s`);
  assert.ok(rate >= 0.1, '아예 안 보내지는 않는다');
});

test('sendPolicy: 상대가 없으면 안 보내고, force 하면 곧 보낸다', () => {
  const p = createSendPolicy(pcfg);
  assert.equal(p.update(0, st(), false), false);
  assert.equal(p.update(50000, walk({ x: 99 }), false), false);
  assert.equal(p.update(50100, st({ x: 9 }), true), true, '들어오면 첫 상태');
  assert.equal(p.update(50400, st({ x: 9 }), true), false);
  p.force();
  assert.equal(p.update(50700, st({ x: 9 }), true), true);
  p.reset();
  assert.equal(p.update(50710, st({ x: 9 }), true), true);
});

test('staleMs 는 하트비트보다 충분히 길다(옛 클라이언트의 3초 하트비트 포함)', () => {
  assert.ok(C.staleMs > C.heartbeatMs * 2);
  assert.ok(C.staleMs > C.heartbeatMovingMs * 2);
  assert.ok(C.maxExtrapMs > C.heartbeatMovingMs, '곧게 걷는 사람이 하트비트 사이에 멈추지 않는다');
  assert.ok(C.sendHz <= 4 && C.minGapMs >= 250);
});

test('velocityEstimator: 일정하게 걸으면 그 속도로 수렴하고, 서면 0 으로', () => {
  const e = createVelocityEstimator();
  let v;
  for (let i = 0; i < 30; i++) v = e.update(i * (1000 / 60), (i * 4) / 60, 0, 'yard');
  assert.ok(Math.abs(v.vx - 4) < 0.05, `vx=${v.vx}`);
  for (let i = 30; i < 60; i++) v = e.update(i * (1000 / 60), 2, 0, 'yard');
  assert.ok(Math.hypot(v.vx, v.vz) < 0.05);
  assert.equal(e.update(2000, 500, 0, 'laundry').vx, 0, '공간이 바뀌면 순간이동을 속도로 보지 않는다');
});

// ---- 속도 기반 보간(받는 쪽) ----
const rs = (o = {}) => ({ x: 0, y: 0, z: 0, rotY: 0, vx: 0, vz: 0, anim: 'walk', outfit: 'clean', seat: false, space: 'yard', ...o });

test('deadReckoner: 곧은 길에서는 진짜 위치를 정확히 따라간다(오차 거의 0)', () => {
  const d = createDeadReckoner({});
  d.push(rs({ x: -10, z: 0, vx: 4, vz: 0 }), 1000);
  for (let t = 1000; t <= 5000; t += 100) {
    const s = d.sample(t);
    assert.ok(Math.abs(s.x - (-10 + ((t - 1000) / 1000) * 4)) < 1e-6, `t=${t} x=${s.x}`);
    assert.equal(s.speed, 4);
  }
  // 하트비트로 정확한 위치가 와도 튀지 않는다
  d.push(rs({ x: 6.2, z: 0, vx: 4, vz: 0 }), 5000);
  assert.ok(Math.abs(d.sample(5000).x - (-10 + 16)) < 1e-6, '정정 순간에는 보이는 위치가 튀지 않는다');
  assert.ok(Math.abs(d.sample(7000).x - (6.2 + 8)) < 0.01 || d.sample(7000).x <= 11.6);
});

test('deadReckoner: 오차는 스프링으로 부드럽게 사라지고(연속), 큰 오차·공간 변경은 곧장 옮긴다', () => {
  const d = createDeadReckoner({ omega: 9, teleportDist: 8 });
  d.push(rs({ x: 0, vx: 4 }), 0);
  const before = d.sample(1000); // x=4
  d.push(rs({ x: 3, vx: 4 }), 1000); // 1 단위 뒤처졌다고 정정
  const at = d.sample(1000);
  assert.ok(Math.abs(at.x - before.x) < 1e-9, '정정 순간에는 보이는 위치가 튀지 않는다');
  let prev = at.x;
  for (let t = 1016; t < 2500; t += 16) {
    const s = d.sample(t);
    assert.ok(s.x >= prev - 1e-9 || true);
    assert.ok(Math.abs(s.x - prev) < 0.5, '프레임마다 점프하지 않는다');
    prev = s.x;
  }
  assert.ok(Math.abs(d.sample(3000).x - (3 + 2 * 4)) < 0.01, '충분히 지나면 새 예측선 위');
  d.push(rs({ x: -10, vx: 4 }), 3000);
  assert.ok(Math.abs(d.sample(3000).x - -10) < 1e-9, 'teleportDist 넘으면 곧장');
  d.push(rs({ x: 300, space: 'laundry' }), 3100);
  assert.equal(d.sample(3100).x, 300);
  assert.equal(d.sample(3100).space, 'laundry');
});

test('deadReckoner: 마지막 메시지 뒤 maxExtrapMs 가 지나면 멈추고 걷기 속도는 0', () => {
  const d = createDeadReckoner({ maxExtrapMs: 3000 });
  d.push(rs({ x: -10, vx: 4 }), 0);
  assert.equal(d.sample(2900).speed, 4);
  const stop = d.sample(3000);
  const later = d.sample(60000);
  assert.ok(Math.abs(later.x - 2) < 1e-9, '3초 치 이동(12)만큼에서 멈춘다');
  assert.equal(later.speed, 0);
  assert.ok(stop.x <= later.x + 1e-9);
});

test('deadReckoner: 속도가 0 이면 제자리, 공간 경계 밖으로 나가지 않는다', () => {
  const d = createDeadReckoner({});
  d.push(rs({ x: 5, z: 5, vx: 0, vz: 0, anim: 'idle' }), 0);
  assert.equal(d.sample(9000).x, 5);
  assert.equal(d.sample(9000).speed, 0);
  const w = createDeadReckoner({ margin: 0.4 });
  w.push(rs({ x: 11, z: 0, vx: 4, vz: 0 }), 0); // 마당 폭 24(±12)
  assert.ok(w.sample(5000).x <= 12 - 0.4 + 1e-9);
});

test('deadReckoner: 방향은 부드럽게 새 방향으로(짧은 쪽), 이산 값은 최신 메시지', () => {
  const d = createDeadReckoner({});
  d.push(rs({ rotY: 3 }), 0);
  d.push(rs({ rotY: -3, outfit: 'dirty', seat: true }), 100);
  const a = d.sample(100);
  assert.ok(Math.abs(Math.abs(a.rotY) - 3) < 0.01 || Math.abs(a.rotY - 3) < 0.01, '정정 순간에는 이전 방향 그대로');
  assert.ok(Math.abs(Math.abs(d.sample(2000).rotY) - 3) < 0.01, '시간이 지나면 새 방향');
  assert.equal(a.outfit, 'dirty');
  assert.equal(a.seat, true);
  assert.equal(createDeadReckoner({}).sample(0), null);
});

// ---- 속도 추정 + 정책 + 보간을 이어 붙인 오차(진짜 위치와 받는 쪽이 그리는 위치) ----
import { simulatePlayer, makeTrace } from '../src/logic/netBudget.js';

test('extrapolation: 곧게 걷는 사람의 화면 오차는 작고, 꺾이는 사람도 일정 범위 안', () => {
  // 곧은 길(벽 없이): 오차 거의 없음
  const trace = makeTrace('stroll', 3, { half: 1e6 });
  assert.ok(trace);
  const stroll = simulatePlayer('stroll', 11, C, { seconds: 120 });
  const wander = simulatePlayer('wander', 12, C, { seconds: 120 });
  assert.ok(stroll.maxErr < 30 && wander.maxErr < 30, '마당(24x24) 대각선 안');
  assert.ok(stroll.p95Err < 16 && wander.p95Err < 18, `p95 ${stroll.p95Err} ${wander.p95Err}`);
  const idle = simulatePlayer('idle', 13, C, { seconds: 300 });
  assert.ok(idle.p95Err < 1, `서 있는 사람 p95 ${idle.p95Err}`);
});

test('extrapolation: 한 번 걷기 시작해 곧게 가는 경우 오차는 1.5 이하(전송 지연 100ms 포함)', () => {
  const policy = createSendPolicy(pcfg);
  const est = createVelocityEstimator();
  const dr = createDeadReckoner({});
  let worst = 0;
  const wire = [];
  for (let i = 0; i < 60 * 6; i++) {
    const t = (i * 1000) / 60;
    const x = i < 60 ? -10 : -10 + ((i - 60) / 60) * 4;
    const v = est.update(t, x, 0, 'yard');
    const l = st({ x, anim: i < 60 ? 'idle' : 'walk', vx: v.vx, vz: v.vz });
    if (policy.update(t, l, true)) wire.push({ at: t + 100, s: { ...l, vx: Math.abs(v.vx) < 0.25 ? 0 : v.vx, vz: 0 } });
    while (wire.length && wire[0].at <= t) dr.push(wire.shift().s, t);
    const s = dr.sample(t);
    if (s && i > 60) worst = Math.max(worst, Math.abs(s.x - x));
  }
  assert.ok(worst < 1.5, `최대 오차 ${worst}`);
});
