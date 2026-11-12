// 스트레스 바 채움과 연출 보조 계산(순수).

// 스트레스 바 채움 비율 0~1. start 가 0 이하이면 0.
export function barRatio(value, start) {
  if (!(start > 0)) return 0;
  return Math.min(1, Math.max(0, value / start));
}

// smoothstep: t 를 0~1 로 제한한 뒤 3t^2 - 2t^3.
export function easeInOut(t) {
  const c = Math.min(1, Math.max(0, t));
  return c * c * (3 - 2 * c);
}
