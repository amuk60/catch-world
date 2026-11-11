// 상호작용 대상 계산 (순수). 대상은 layout.interactables 의 항목이다.

// 플레이어가 걸어갈 지점: 오브젝트 중심. 이동 코드가 장애물 가장자리로 밀어내므로 바로 앞에서 멈춘다.
export function interactTarget(item) {
  return { x: item.x, z: item.z };
}

// x-z 평면 거리가 상호작용 범위 이내인가(경계 포함).
export function inRange(playerPos, item) {
  return Math.hypot(playerPos.x - item.x, playerPos.z - item.z) <= item.interactRange;
}

// 도착 순간에 실행할 대상. 대기 중인 대상이 있고, 도착했고, 범위 안일 때만 돌려준다.
export function resolveArrival({ pendingId, arrived, playerPos, items }) {
  if (!pendingId || !arrived) return null;
  const item = items.find((it) => it.id === pendingId);
  return item && inRange(playerPos, item) ? item : null;
}

export function hoverLabel(item) {
  return item.label;
}
