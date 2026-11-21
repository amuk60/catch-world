// 창이 좁아져도 가로 시야가 유지되도록 세로 fov(도)를 계산한다.
export function computeFov(baseFovDeg, aspect, minAspect) {
  if (!Number.isFinite(aspect) || aspect <= 0 || aspect >= minAspect) return baseFovDeg;
  const half = (baseFovDeg * Math.PI) / 360;
  return (2 * Math.atan(Math.tan(half) * (minAspect / aspect)) * 180) / Math.PI;
}

const clamp01 = (v) => Math.min(1, Math.max(0, v));

// 화면 비율에 맞춘 3인칭 카메라 보정. 터치 기기의 세로 화면(aspect < 1)에서만 portrait(config 의 MOBILE.portrait)를 쓴다. PC·가로 화면은 computeFov 그대로(보정 없음).
// computeFov 는 좁은 창에서 가로 시야를 지키려고 fov 를 키우는데, 폰 세로(약 0.46)에서는 100도가 넘어 캐릭터가 아주 작고 가장자리가 늘어난다.
// 그래서 세로에서는 fov 를 maxFov 로 묶고 카메라를 distanceScale 배 멀리 두어 가로 폭을 되찾고, 화면을 아래로 밀어(offsetFrac: 화면 높이 대비) 캐릭터가 아래쪽 가운데에, 앞쪽 월드가 위에 오게 한다.
// fullAt: 이 비율 이하에서 보정을 다 쓰고, 1 에 가까울수록(정사각형) 서서히 줄인다(태블릿 세로·회전 중에 갑자기 튀지 않게).
// where: { indoor(실내: 방이 화면 가운데에 오게 indoorOffsetFrac·indoorDistanceScale), sheet(화면 아래쪽 절반을 덮는 선택 창이 떠 있다: sheetOffsetFrac, 음수면 캐릭터를 위로 올려 창 위에 보이게) }
// 돌려주는 값: { fov(세로 화각, 도), distanceScale(궤도 거리 배율), offsetFrac(타깃을 화면 가운데에서 아래로 내리는 비율, -0.5~0.5, 음수는 위로), fpFov(1인칭 화각, 도) }
export function viewFit(aspect, { baseFov, minAspect, fpFov = baseFov }, portrait = null, { indoor = false, sheet = false } = {}) {
  const fov = computeFov(baseFov, aspect, minAspect);
  const plain = { fov, distanceScale: 1, offsetFrac: 0, fpFov };
  if (!portrait || !Number.isFinite(aspect) || aspect <= 0 || aspect >= 1) return plain;
  const fullAt = Math.min(0.95, Math.max(0.1, portrait.fullAt ?? 0.6));
  const t = clamp01((1 - aspect) / (1 - fullAt));
  const maxFov = portrait.maxFov ?? fov;
  const scale = indoor ? (portrait.indoorDistanceScale ?? portrait.distanceScale ?? 1) : (portrait.distanceScale ?? 1);
  const offset = sheet ? (portrait.sheetOffsetFrac ?? 0) : indoor ? (portrait.indoorOffsetFrac ?? portrait.offsetFrac ?? 0) : (portrait.offsetFrac ?? 0);
  return {
    fov: Math.min(fov, maxFov),
    distanceScale: 1 + (scale - 1) * t,
    offsetFrac: Math.min(0.5, Math.max(-0.5, offset * t)),
    fpFov: Math.max(fpFov, fpFov + ((portrait.fpFov ?? fpFov) - fpFov) * t),
  };
}
