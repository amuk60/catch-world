// 창이 좁아져도 가로 시야가 유지되도록 세로 fov(도)를 계산한다.
export function computeFov(baseFovDeg, aspect, minAspect) {
  if (!Number.isFinite(aspect) || aspect <= 0 || aspect >= minAspect) return baseFovDeg;
  const half = (baseFovDeg * Math.PI) / 360;
  return (2 * Math.atan(Math.tan(half) * (minAspect / aspect)) * 180) / Math.PI;
}
