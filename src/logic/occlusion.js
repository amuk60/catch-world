// 카메라가 플레이어를 보는 선(수평 투영)을 가리는 나무의 목표 크기 배율.
// camera, target: {x,y,z}, tree: {x,z}, params: {radius,minT,maxT,minScale}.
// 선분 위(거리 <= radius*0.5)에서 minScale, radius 이상에서 1, 사이는 부드럽게 보간한다.
export function occlusionTarget(camera, target, tree, { radius, minT, maxT, minScale }) {
  const dx = target.x - camera.x;
  const dz = target.z - camera.z;
  const len2 = dx * dx + dz * dz;
  if (len2 < 1e-9) return 1; // 카메라가 수평으로 타깃 바로 위: 가리는 나무 없음
  const t = ((tree.x - camera.x) * dx + (tree.z - camera.z) * dz) / len2;
  if (t < minT || t > maxT) return 1;
  const dist = Math.hypot(tree.x - (camera.x + t * dx), tree.z - (camera.z + t * dz));
  if (dist >= radius) return 1;
  if (dist <= radius * 0.5) return minScale;
  const u = (dist - radius * 0.5) / (radius * 0.5);
  return minScale + (1 - minScale) * u * u * (3 - 2 * u);
}
