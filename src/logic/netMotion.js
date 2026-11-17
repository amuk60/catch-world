// 멀티플레이 이동 동기화(순수): 속도 추정, "바뀔 때만 보내는" 전송 정책, 속도 기반 보간(dead reckoning).
// 위치를 시계로(초당 몇 번) 보내지 않고, 받는 쪽이 마지막 위치+속도로 이어서 그리게 해서 전송량을 줄인다. logic/net.js 가 다시 내보낸다.
import { SPACES } from './spaces.js';

export const MOVE_MIN = 0.25; // 이 속도(단위/초) 미만은 "서 있음"
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const base = (a) => (a === 'walk' ? 'idle' : a); // 걷기·서기는 속도로 알 수 있으니 동작 바뀜으로 치지 않는다(걷기 시작·멈춤이 따로 정한다)
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

// ---- 내 속도 추정 ----
// 프레임마다 위치 차이로 속도(단위/초)를 구해 짧게 평활한다(tauMs). update(nowMs, x, z, space) -> { vx, vz }. 공간이 바뀌거나 오래 끊기면 0 으로 다시 시작.
export function createVelocityEstimator({ tauMs = 40 } = {}) {
  let px = NaN; let pz = NaN; let pt = 0; let ps = null;
  let vx = 0; let vz = 0;
  return {
    update(nowMs, x, z, space) {
      const dt = nowMs - pt;
      if (ps !== space || !Number.isFinite(px) || dt <= 0 || dt > 500) { vx = 0; vz = 0; }
      else {
        const k = 1 - Math.exp(-dt / tauMs);
        vx += ((x - px) / (dt / 1000) - vx) * k;
        vz += ((z - pz) / (dt / 1000) - vz) * k;
      }
      px = x; pz = z; pt = nowMs; ps = space;
      return { vx, vz };
    },
  };
}

// ---- 전송 정책(바뀔 때만 보내는 방식) ----
// 즉시: 공간·동작·옷·앉기가 바뀜, 걷기 멈춤, force(). 걷기 시작·방향 꺾임(epsRot 라디안)·속도 변화(epsSpeed 비율)는 settleMs 동안 계속될 때(속도 추정이 안정된 뒤).
// 오차: 받는 쪽이 그릴 예측 위치와 내 실제 위치가 epsPos 넘게 벌어지면. 느린 보정: 서 있으면 heartbeatMs, 걷는 중이면 heartbeatMovingMs 마다 한 번.
// 속도 제한: 어떤 경우에도 minGapMs(와 1000/hz) 간격을 둔다. "토큰 통": 평균 sustainedHz(회/초)를 넘지 못한다(순간 burst 개까지 모았다 쓴다).
//   방향 꺾임·오차는 토큰이 1 이상이어야 보내고, 걷기 시작·멈춤은 토큰이 -1 이상이면(멈춤이 늦어 미끄러지지 않게), 공간·동작·옷·앉기는 간격만 지킨다.
// hasPeers 가 false 면 아무것도 보내지 않는다. update(nowMs, state, hasPeers) -> true 면 보낸다. state: { space, x, z, y, rotY, anim, outfit, seat, vx?, vz? }.
export function createSendPolicy({
  hz = 4, minGapMs = 250, heartbeatMs = 10000, heartbeatMovingMs = 4000, epsPos = 0.8, epsRot = 0.35, epsSpeed = 0.3,
  settleMs = 120, sustainedHz = 0.3, burst = 3, maxExtrapMs = 6500,
} = {}) {
  const gap = Math.max(minGapMs, 1000 / hz);
  let last = null;
  let lastAt = -Infinity;
  let forced = false;
  let tokens = burst;
  let tokensAt = null;
  let dirtySince = null; // 걷기 시작·방향·속도 변화가 계속되기 시작한 시각
  const speedOf = (s) => { const v = Math.hypot(s.vx ?? 0, s.vz ?? 0); return v < MOVE_MIN ? 0 : v; };
  return {
    force() { forced = true; },
    reset() { last = null; lastAt = -Infinity; forced = false; tokens = burst; tokensAt = null; dirtySince = null; },
    get tokens() { return tokens; },
    update(nowMs, s, hasPeers) {
      if (!hasPeers) return false;
      if (tokensAt === null) tokensAt = nowMs;
      tokens = Math.min(burst, tokens + ((nowMs - tokensAt) / 1000) * sustainedHz);
      tokensAt = nowMs;
      const since = nowMs - lastAt;
      if (since < gap) return false;
      const sp = speedOf(s);
      let send = false;
      let cost = 1;
      if (!last || forced) { send = true; cost = 0; }
      else if (s.space !== last.space || base(s.anim) !== base(last.anim) || s.outfit !== last.outfit || s.seat !== last.seat) { send = true; cost = 0; }
      else {
        const lastMoving = last.sp > 0;
        let settling = false;
        if ((sp > 0) !== lastMoving) {
          if (sp === 0) send = tokens >= -1; // 멈춤: 바로(토큰이 -1 아래로 내려가 있으면 조금 기다린다)
          else settling = true; // 걷기 시작: 속도가 안정되면
        } else if (sp > 0) {
          const ang = Math.abs(wrap(Math.atan2(s.vx, s.vz) - Math.atan2(last.vx, last.vz)));
          if (ang > epsRot || Math.abs(sp - last.sp) > epsSpeed * last.sp) settling = true;
        }
        if (!send) {
          if (settling) {
            dirtySince ??= nowMs;
            if (nowMs - dirtySince >= settleMs && tokens >= (lastMoving ? 1 : -1)) send = true;
          } else dirtySince = null;
        }
        if (!send) {
          const ext = Math.min(since, maxExtrapMs) / 1000;
          const err = Math.hypot(s.x - (last.x + last.vx * ext), s.z - (last.z + last.vz * ext));
          if (err > epsPos && tokens >= 1) send = true;
        }
        if (!send && since >= (lastMoving ? heartbeatMovingMs : heartbeatMs)) send = true;
      }
      if (!send) return false;
      last = { space: s.space, anim: s.anim, outfit: s.outfit, seat: s.seat, x: s.x, z: s.z, vx: sp ? s.vx : 0, vz: sp ? s.vz : 0, sp };
      lastAt = nowMs;
      forced = false;
      dirtySince = null;
      tokens = Math.max(-2, tokens - cost);
      return true;
    },
  };
}

// ---- 속도 기반 보간(방문자 한 명) ----
// push(state, atMs): 받은 상태(위치+속도)를 받은 시각으로 기록. sample(nowMs): 마지막 위치에서 속도만큼 이어 간 위치 { x, y, z, rotY, speed, anim, outfit, seat, space }.
// 새 메시지가 오면 지금 보이는 위치와 새 예측 위치의 차이를 "오차"로 잡고 임계 감쇠(critically damped) 스프링으로 부드럽게 없앤다(omega: 클수록 빠름).
// 공간이 바뀌었거나 오차가 teleportDist 이상이면 곧장 옮긴다. 마지막 메시지 뒤 maxExtrapMs 가 지나면 예측을 멈추고(속도 0), 공간 경계(margin 안쪽: 게임이 플레이어를 벽에서 띄우는 거리 radius+0.5 와 같다) 밖으로는 나가지 않는다.
export function createDeadReckoner({ omega = 9, teleportDist = 8, maxExtrapMs = 6500, margin = 0.9 } = {}) {
  let cur = null;
  const zero = () => ({ x: 0, z: 0, vx: 0, vz: 0, rot: 0 });
  let off = zero(); // cur.at 시점의 위치·속도·방향 오차
  const evalAt = (nowMs) => {
    const dt = Math.max(0, nowMs - cur.at) / 1000;
    const live = nowMs - cur.at <= maxExtrapMs;
    const ext = live ? dt : maxExtrapMs / 1000;
    let bx = cur.x + cur.vx * ext;
    let bz = cur.z + cur.vz * ext;
    const b = SPACES[cur.space]?.bounds;
    if (b) { bx = clamp(bx, b.minX + margin, b.maxX - margin); bz = clamp(bz, b.minZ + margin, b.maxZ - margin); }
    const e = Math.exp(-omega * dt);
    const pos = (o, v) => (o + (v + omega * o) * dt) * e;
    const vel = (o, v) => ((v + omega * o) - omega * (o + (v + omega * o) * dt)) * e;
    return {
      x: bx + pos(off.x, off.vx), z: bz + pos(off.z, off.vz),
      vx: (live ? cur.vx : 0) + vel(off.x, off.vx), vz: (live ? cur.vz : 0) + vel(off.z, off.vz),
      rot: off.rot * Math.exp(-omega * 1.3 * dt), live,
    };
  };
  return {
    get size() { return cur ? 1 : 0; },
    get latest() { return cur; },
    push(state, atMs) {
      const at = cur && atMs <= cur.at ? cur.at + 1 : atMs;
      const next = { at, x: state.x, y: state.y, z: state.z, rotY: state.rotY, vx: state.vx ?? 0, vz: state.vz ?? 0, anim: state.anim, outfit: state.outfit, seat: state.seat, space: state.space };
      if (cur && cur.space === state.space) {
        const d = evalAt(at);
        const ex = d.x - next.x;
        const ez = d.z - next.z;
        off = Math.hypot(ex, ez) > teleportDist ? zero() : { x: ex, z: ez, vx: d.vx - next.vx, vz: d.vz - next.vz, rot: wrap(cur.rotY + d.rot - next.rotY) };
      } else off = zero();
      cur = next;
    },
    sample(nowMs) {
      if (!cur) return null;
      const d = evalAt(nowMs);
      return {
        x: d.x, y: cur.y, z: d.z, rotY: wrap(cur.rotY + d.rot),
        speed: d.live ? Math.hypot(cur.vx, cur.vz) : 0,
        anim: cur.anim, outfit: cur.outfit, seat: cur.seat, space: cur.space,
      };
    },
  };
}
