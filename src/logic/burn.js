// 소각 미니게임 순수 계산.

// 종이를 놓은 위치(x-z)가 불 구역 안인가. 수평 거리 <= 반경(경계 포함).
export function isInFireZone(pos, fire) {
  return Math.hypot(pos.x - fire.x, pos.z - fire.z) <= fire.radius;
}

// 카메라 흔들림(감쇠 진동). elapsed 는 시작 후 경과 초.
// a = amplitude * (1 - elapsed/duration)  (선형으로 줄어드는 봉투)
// x = a * sin(elapsed * 90),  y = a * cos(elapsed * 70)
// elapsed < 0 이거나 elapsed >= duration 이면 { x: 0, y: 0 }.
export function shakeOffset(elapsed, duration, amplitude) {
  if (elapsed < 0 || elapsed >= duration) return { x: 0, y: 0 };
  const a = amplitude * (1 - elapsed / duration);
  return { x: a * Math.sin(elapsed * 90), y: a * Math.cos(elapsed * 70) };
}

// 스트레스 바 채움 비율 0~1. start 가 0 이하이면 0.
export function barRatio(value, start) {
  if (!(start > 0)) return 0;
  return Math.min(1, Math.max(0, value / start));
}

// 목표 눈금 위치 비율(goal/start). start 가 0 이하이면 0.
export function goalRatio(goal, start) {
  return start > 0 ? goal / start : 0;
}

// smoothstep: t 를 0~1 로 제한한 뒤 3t^2 - 2t^3.
export function easeInOut(t) {
  const c = Math.min(1, Math.max(0, t));
  return c * c * (3 - 2 * c);
}
