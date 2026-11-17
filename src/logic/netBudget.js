// 멀티플레이 전송량 모델과 시뮬레이터(순수, 시험용): 무료 요금제 한도(초당 약 100 메시지)를 지키는지 계산으로 확인한다.
// 어림 공식: 초당 전달 ≈ 인원 × (방 정원 - 1) × 쌍당 초당 전송. 쌍당 초당 전송 = 한 사람이 1초에 보내는 메시지 수(방의 모든 사람에게 한 번에 전달된다).
import { mulberry32 } from './rng.js';
import { buildState, validateState, createSendPolicy, createDeadReckoner, createVelocityEstimator } from './net.js';

// 인원을 정원 단위로 채운 방 크기들(마지막 방만 덜 찬다). 예: 10명, 정원 4 -> [4, 4, 2].
export function roomSizes(players, roomCap) {
  const out = [];
  let left = Math.max(0, Math.floor(players));
  const cap = Math.max(1, Math.floor(roomCap));
  while (left > 0) { out.push(Math.min(cap, left)); left -= cap; }
  return out;
}

// 방이 모두 꽉 찰 때까지 필요한 방 수(공간 하나 기준).
export function roomsNeeded(players, roomCap) {
  return roomSizes(players, roomCap).length;
}

// 프로젝트 전체에서 초당 전달되는 메시지 수. perPairRate: 한 사람이 초당 보내는 메시지 수(방 안의 나머지 m-1 명에게 각각 전달된다). 방 인원이 m 이면 m*(m-1)*rate.
export function deliveredPerSec(players, roomCap, perPairRate) {
  return roomSizes(players, roomCap).reduce((sum, m) => sum + m * (m - 1) * perPairRate, 0);
}

// 한도 limitPerSec 안에서 받을 수 있는 최대 인원(모두 같은 전송률일 때).
export function maxPlayers(limitPerSec, roomCap, perPairRate) {
  let n = 0;
  while (deliveredPerSec(n + 1, roomCap, perPairRate) <= limitPerSec && n < 100000) n++;
  return n;
}

// 월간 메시지 수 어림: 초당 전달 수 × 하루 활동 시간 × 일수.
export function monthlyMessages(perSec, hoursPerDay = 1, days = 30) {
  return Math.round(perSec * 3600 * hoursPerDay * days);
}

// ---- 이동 궤적(결정적) ----
// 반환: step(dtSec) -> { x, z, rotY, anim } (월드 좌표, 걷는 속도 speed). 종류: 'wander'(쉬지 않고 0.5~2초마다 방향을 30~150도 바꾸며 걷기: 최악), 'stroll'(쉬지 않고 2~5초마다 방향을 바꾸며 걷기: 보통 걷는 모습), 'idle'(대부분 서 있고 30~70초마다 3~6초 곧게 걷기), 'mixed'(걷다가 쉬다가).
export function makeTrace(kind, seed, { speed = 4, half = 11 } = {}) {
  const rng = mulberry32(seed);
  const U = (a, b) => a + rng() * (b - a);
  let x = U(-10, 10); let z = U(-10, 10);
  let heading = U(-Math.PI, Math.PI);
  let moving = kind !== 'idle';
  const turnGap = () => (kind === 'wander' ? U(0.5, 2) : kind === 'stroll' ? U(2, 5) : U(1, 3));
  let untilTurn = turnGap();
  let untilToggle = kind === 'idle' ? U(30, 70) : U(3, 8);
  return {
    step(dt) {
      untilTurn -= dt;
      untilToggle -= dt;
      if (kind !== 'wander' && kind !== 'stroll' && untilToggle <= 0) {
        moving = !moving;
        untilToggle = kind === 'idle' ? (moving ? U(3, 6) : U(30, 70)) : (moving ? U(3, 8) : U(2, 8));
        if (moving) heading = U(-Math.PI, Math.PI);
      }
      if (untilTurn <= 0) {
        if (kind === 'wander' || kind === 'stroll' || (kind === 'mixed' && moving)) heading += (rng() < 0.5 ? -1 : 1) * U(0.5, 2.6);
        untilTurn = turnGap();
      }
      if (moving) {
        x += Math.sin(heading) * speed * dt;
        z += Math.cos(heading) * speed * dt;
        if (Math.abs(x) > half) { x = Math.sign(x) * half; heading = -heading; }
        if (Math.abs(z) > half) { z = Math.sign(z) * half; heading = Math.PI - heading; }
      }
      return { x, z, rotY: heading, anim: moving ? 'walk' : 'idle' };
    },
  };
}

// 한 사람의 전송 정책을 궤적에 돌린다(60fps 기본). 받는 쪽도 흉내 내 화면 오차(받는 사람이 그리는 위치와 진짜 위치의 거리)를 잰다.
// 반환: { messages, perSec, avgErr, maxErr, p95Err }. cfg: config 의 MULTIPLAYER(전송 관련 값). 상대가 있다고 가정한다.
export function simulatePlayer(kind, seed, cfg, { seconds = 600, fps = 60, latencyMs = 0 } = {}) {
  const trace = makeTrace(kind, seed);
  const policy = createSendPolicy({
    hz: cfg.sendHz, minGapMs: cfg.minGapMs, heartbeatMs: cfg.heartbeatMs, heartbeatMovingMs: cfg.heartbeatMovingMs, epsPos: cfg.epsPos, epsRot: cfg.epsRot, epsSpeed: cfg.epsSpeed,
    settleMs: cfg.settleMs, sustainedHz: cfg.sustainedHz, burst: cfg.burst, maxExtrapMs: cfg.maxExtrapMs,
  });
  const est = createVelocityEstimator();
  const dr = createDeadReckoner({ omega: cfg.smoothOmega, teleportDist: cfg.teleportDist, maxExtrapMs: cfg.maxExtrapMs });
  const self = { id: 'simulated1', nick: '시험' };
  const dt = 1 / fps;
  const errs = [];
  const inflight = [];
  let messages = 0;
  const frames = Math.round(seconds * fps);
  for (let i = 0; i < frames; i++) {
    const nowMs = i * dt * 1000;
    const p = trace.step(dt);
    const v = est.update(nowMs, p.x, p.z, 'yard');
    const local = { space: 'yard', x: p.x, z: p.z, y: 0, rotY: p.rotY, anim: p.anim, outfit: 'clean', seat: false, vx: v.vx, vz: v.vz };
    if (policy.update(nowMs, local, true)) {
      messages++;
      const wire = JSON.parse(JSON.stringify(buildState(self, local, nowMs)));
      inflight.push({ at: nowMs + latencyMs, wire });
    }
    while (inflight.length && inflight[0].at <= nowMs) {
      const m = validateState(inflight.shift().wire);
      if (m) dr.push(m, nowMs);
    }
    const s = dr.sample(nowMs);
    if (s && i > fps) errs.push(Math.hypot(s.x - p.x, s.z - p.z));
  }
  errs.sort((a, b) => a - b);
  const avgErr = errs.length ? errs.reduce((a, b) => a + b, 0) / errs.length : 0;
  return { messages, perSec: messages / seconds, avgErr, maxErr: errs.at(-1) ?? 0, p95Err: errs[Math.floor(errs.length * 0.95)] ?? 0 };
}

// 여러 사람(seed 를 다르게)의 평균 전송률(초당, 사람당)과 오차.
export function simulateCrowd(kind, cfg, { players = 12, seconds = 600, seed = 1, ...rest } = {}) {
  const runs = Array.from({ length: players }, (_, i) => simulatePlayer(kind, seed + i * 7919, cfg, { seconds, ...rest }));
  const avg = (key) => runs.reduce((a, r) => a + r[key], 0) / runs.length;
  return { perSec: avg('perSec'), avgErr: avg('avgErr'), p95Err: avg('p95Err'), maxErr: Math.max(...runs.map((r) => r.maxErr)) };
}
