// 상호작용 대상 계산 (순수). 대상은 layout.interactables 의 항목이다.

// 플레이어가 걸어갈 지점: 오브젝트 중심. 이동 코드가 장애물 가장자리로 밀어내므로 바로 앞에서 멈춘다.
export function interactTarget(item) {
  return { x: item.x, z: item.z };
}

// x-z 평면 거리가 상호작용 범위 이내인가(경계 포함).
export function inRange(playerPos, item) {
  return Math.hypot(playerPos.x - item.x, playerPos.z - item.z) <= item.interactRange;
}

// 범위 안에서 가장 가까운 대상(거리가 같으면 먼저 나온 것). 없으면 null.
export function nearestInRange(playerPos, items) {
  let best = null;
  let bestDist = Infinity;
  for (const item of items) {
    if (!inRange(playerPos, item)) continue;
    const dist = Math.hypot(playerPos.x - item.x, playerPos.z - item.z);
    if (dist < bestDist) {
      best = item;
      bestDist = dist;
    }
  }
  return best;
}

const ACTIONS = {
  furnace: { type: 'burn', prompt: '소각 시작' },
  comfort: { type: 'comfort', prompt: '살펴보기' },
  fortune: { type: 'fortune', prompt: '포춘쿠키 열기' },
  seat: { type: 'seat', prompt: '앉기' },
};

// E 키를 눌렀을 때의 동작 종류와 안내 문구.
export function actionOf(item) {
  const action = ACTIONS[item.kind];
  if (!action) throw new Error(`알 수 없는 상호작용 종류: ${item.kind}`);
  return { ...action };
}

export function hoverLabel(item) {
  return item.label;
}
