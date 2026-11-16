// 1인칭 카메라 전환 (순수). 궤도 카메라 <-> 캐릭터 눈높이 시점의 섞임(blend 0..1)과, 두 카메라 자세의 보간, 마우스로 둘러보는 작은 각도.
// 원칙: 궤도 상태(orbit·targetPos)는 1인칭 동안 건드리지 않고, 카메라 자세만 섞는다. blend 가 0 이면 결과가 궤도 자세와 정확히 같아서(보간 계수 0) 돌아올 때 어긋남(스냅)이 없다.
const clamp01 = (v) => Math.min(1, Math.max(0, v));

// 부드러운 가감속(smoothstep).
export const ease = (t) => { const k = clamp01(t); return k * k * (3 - 2 * k); };

// 섞임 상태기: 켜면 enterSeconds 에 걸쳐 0 -> 1, 끄면 exitSeconds 에 걸쳐 1 -> 0. update(dt, on) 가 보간된 계수(ease 적용)를 돌려준다.
export function createFpBlend({ enterSeconds, exitSeconds }) {
  let p = 0; // 선형 진행 0..1
  return {
    update(dt, on) {
      if (Number.isFinite(dt) && dt > 0) {
        const dur = on ? enterSeconds : exitSeconds;
        p = clamp01(p + (on ? 1 : -1) * (dur > 0 ? dt / dur : 1));
      }
      return ease(p);
    },
    get value() { return ease(p); },
    get active() { return p > 0; }, // 조금이라도 섞여 있다(궤도 입력을 잠가야 한다)
    reset() { p = 0; },
  };
}

const lerp = (a, b, k) => a + (b - a) * k;
const lerp3 = (a, b, k) => [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)];

// 두 카메라 자세({ position:[x,y,z], target:[x,y,z], fov })를 k(0..1)로 섞는다. k=0 은 a, k=1 은 b 와 정확히 같다.
export function blendPose(a, b, k) {
  if (k <= 0) return { position: [...a.position], target: [...a.target], fov: a.fov };
  if (k >= 1) return { position: [...b.position], target: [...b.target], fov: b.fov };
  return { position: lerp3(a.position, b.position, k), target: lerp3(a.target, b.target, k), fov: lerp(a.fov, b.fov, k) };
}

// 마우스 위치(화면 중앙이 0, 가장자리가 ±1)에서 둘러보기 각도(도): 오른쪽으로 가면 yaw 가 음(오른쪽), 아래로 가면 pitch 가 음(아래). maxDeg 를 넘지 않는다.
export function lookFromPointer(nx, ny, maxDeg) {
  const cx = Math.min(1, Math.max(-1, Number.isFinite(nx) ? nx : 0));
  const cy = Math.min(1, Math.max(-1, Number.isFinite(ny) ? ny : 0));
  return { yawDeg: -cx * maxDeg, pitchDeg: -cy * maxDeg };
}

// 둘러보기를 목표 쪽으로 부드럽게 따라가게 한다(프레임 시간에 상관없는 지수 보간).
export function followLook(cur, goal, dt, rate) {
  const k = 1 - Math.exp(-rate * Math.max(0, dt));
  return { yawDeg: cur.yawDeg + (goal.yawDeg - cur.yawDeg) * k, pitchDeg: cur.pitchDeg + (goal.pitchDeg - cur.pitchDeg) * k };
}

// 시선 방향(수평 방위 yaw 와 높낮이 pitch, 라디안)에 둘러보기(도)를 더한 단위 벡터. 방위 0 은 +z.
export function lookDirection(baseYaw, basePitch, look) {
  const yaw = baseYaw + (look.yawDeg * Math.PI) / 180;
  const pitch = basePitch + (look.pitchDeg * Math.PI) / 180;
  const c = Math.cos(pitch);
  return [Math.sin(yaw) * c, Math.sin(pitch), Math.cos(yaw) * c];
}

// 숨쉬기·손 흔들림: 시간 time(초)에 대한 작은 흔들림(단위). eye: 눈높이 상하, handX/handY: 막대 쥔 손의 좌우·상하.
export function sway(time, amount) {
  return {
    eye: amount * 0.5 * Math.sin(time * 1.7),
    handX: amount * (Math.sin(time * 1.3) + 0.4 * Math.sin(time * 3.1 + 1)),
    handY: amount * (Math.sin(time * 1.9 + 2) + 0.4 * Math.sin(time * 4.3)),
  };
}

// 몸을 숨겨야 하는가(카메라가 머리 안으로 들어가는 구간): 섞임이 hideAt 이상일 때만.
export const shouldHideBody = (blend, hideAt) => blend >= hideAt;
