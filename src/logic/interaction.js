// 상호작용 대상 계산 (순수). 대상은 layout.interactables 의 항목이다.

// 플레이어가 걸어갈 지점: walkTo 가 있으면 그 지점(건물: 문 앞), 아니면 오브젝트 중심. 이동 코드가 장애물 가장자리로 밀어내므로 바로 앞에서 멈춘다.
export function interactTarget(item) {
  const to = item.walkTo ?? item;
  return { x: to.x, z: to.z };
}

// 의자·벤치에서 일어날 때 서는 지점: 앉은 방향(rotY, 모델의 앞은 (sin, cos))으로 distance 만큼 앞. 장애물 밖으로 밀어내는 것은 부르는 쪽이 한다.
export const STAND_DISTANCE = 1.0;
// seat.stand({ x, z })가 있으면 그 자리(통나무 자리: 고리 바깥쪽)를 쓴다.
export function standPoint(seat, distance = STAND_DISTANCE) {
  if (seat.stand) return { x: seat.stand.x, z: seat.stand.z };
  return { x: seat.x + Math.sin(seat.rotY) * distance, z: seat.z + Math.cos(seat.rotY) * distance };
}

// x-z 평면 거리가 상호작용 범위 이내인가(경계 포함).
export function inRange(playerPos, item) {
  return Math.hypot(playerPos.x - item.x, playerPos.z - item.z) <= item.interactRange;
}

// 범위 안에서 E 동작이 있는 가장 가까운 대상(거리가 같으면 먼저 나온 것). 없으면 null.
export function nearestInRange(playerPos, items) {
  let best = null;
  let bestDist = Infinity;
  for (const item of items) {
    if (ACTIONS[item.kind] === null || !inRange(playerPos, item)) continue;
    const dist = Math.hypot(playerPos.x - item.x, playerPos.z - item.z);
    if (dist < bestDist) {
      best = item;
      bestDist = dist;
    }
  }
  return best;
}

// E 키 동작. null 은 E 동작이 없는 대상(소각로·건물: 호버 안내와 장애물일 뿐, 행동은 행동 막대로 한다).
const ACTIONS = {
  furnace: null,
  building: null,
  comfort: { type: 'comfort', prompt: '살펴보기' },
  fortune: { type: 'fortune', prompt: '포춘쿠키 고르기' },
  wish: { type: 'wish', prompt: '소원 빌기' }, // 소원 조각상: 소원 입력 창을 연다
  seat: { type: 'seat', prompt: '앉기' },
  clothesline: { type: 'wear', prompt: '새 셔츠 입기' }, // 실내 빨랫줄 곁. 마른 새 셔츠가 있을 때만 main 이 안내를 띄운다(logic/outfit.js).
  door: { type: 'enter', prompt: '들어가기' }, // 나가는 문(to: 'yard')은 아래 actionOf 가 exit/나가기로 바꾼다.
};

// E 키를 눌렀을 때의 동작 종류와 안내 문구. E 동작이 없는 종류는 null.
export function actionOf(item) {
  if (!(item.kind in ACTIONS)) throw new Error(`알 수 없는 상호작용 종류: ${item.kind}`);
  const action = ACTIONS[item.kind];
  if (item.kind === 'door' && item.to === 'yard') return { type: 'exit', prompt: '나가기' };
  return action && { ...action };
}

export function hoverLabel(item) {
  return item.label;
}
