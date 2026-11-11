// 궤도 카메라 계산. polar는 수직 위(0)부터, azimuth는 수직축 회전(도 단위).
const DEG = Math.PI / 180;
const RAD_TO_DEG = 57.29578;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export function clampOrbit(state, limits) {
  return {
    azimuthDeg: ((state.azimuthDeg % 360) + 360) % 360,
    polarDeg: clamp(state.polarDeg, limits.minPolarDeg, limits.maxPolarDeg),
    distance: clamp(state.distance, limits.minDistance, limits.maxDistance),
  };
}

export function orbitPosition([tx, ty, tz], { azimuthDeg, polarDeg, distance }) {
  const az = azimuthDeg * DEG;
  const po = polarDeg * DEG;
  return [
    tx + distance * Math.sin(po) * Math.sin(az),
    ty + distance * Math.cos(po),
    tz + distance * Math.sin(po) * Math.cos(az),
  ];
}

// 마우스 오른쪽 이동(dx>0) -> azimuth 감소, 마우스 아래 이동(dy>0) -> polar 감소(카메라가 올라감).
export function applyDrag(state, dxPx, dyPx, rotateSpeed, limits) {
  return clampOrbit(
    {
      ...state,
      azimuthDeg: state.azimuthDeg - dxPx * rotateSpeed * RAD_TO_DEG,
      polarDeg: state.polarDeg - dyPx * rotateSpeed * RAD_TO_DEG,
    },
    limits,
  );
}

// deltaY>0 -> 멀어짐(distance / zoomStep), deltaY<0 -> 가까워짐(distance * zoomStep).
export function applyZoom(state, wheelDeltaY, zoomStep, limits) {
  let distance = state.distance;
  if (wheelDeltaY > 0) distance = distance / zoomStep;
  else if (wheelDeltaY < 0) distance = distance * zoomStep;
  return clampOrbit({ ...state, distance }, limits);
}
