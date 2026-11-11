// 마당 이동 계산 (x-z 평면).
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export function clampToYard(point, yard, margin) {
  const hx = yard.width / 2 - margin;
  const hz = yard.depth / 2 - margin;
  return { x: clamp(point.x, -hx, hx), z: clamp(point.z, -hz, hz) };
}

export function stepToward(pos, target, speed, dt) {
  const dx = target.x - pos.x;
  const dz = target.z - pos.z;
  const dist = Math.hypot(dx, dz);
  const step = speed * dt;
  if (dist === 0 || dist <= step) return { x: target.x, z: target.z, arrived: true };
  return { x: pos.x + (dx / dist) * step, z: pos.z + (dz / dist) * step, arrived: false };
}

export function pushOutOfCircle(pos, posRadius, circle) {
  const min = posRadius + circle.radius;
  const dx = pos.x - circle.x;
  const dz = pos.z - circle.z;
  const dist = Math.hypot(dx, dz);
  if (dist >= min) return { x: pos.x, z: pos.z };
  if (dist === 0) return { x: circle.x, z: circle.z + min };
  return { x: circle.x + (dx / dist) * min, z: circle.z + (dz / dist) * min };
}

// +z를 보는 모델이 to를 바라보도록 하는 Y축 회전(라디안).
export function headingY(from, to) {
  return Math.atan2(to.x - from.x, to.z - from.z);
}
