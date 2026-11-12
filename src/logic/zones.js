// 행동 구역 (순수). 구역은 { id, center: {x, z}, radius, actions: [첫째, 둘째] } 이고, 플레이어가 반경 안(경계 포함)에 있으면
// 그 구역의 행동 막대가 뜬다. 구역이 겹치면 중심이 더 가까운 쪽(같으면 목록에서 먼저 나온 쪽)이다.
import { FURNACE, FIRE_ZONE_RADIUS, LAUNDRY_ZONE_RADIUS } from '../config.js';

// 플레이어가 안에 있는 가장 가까운 구역. 없으면 null. y 는 무시한다.
export function activeZone(pos, zones) {
  let best = null;
  let bestDist = Infinity;
  for (const zone of zones) {
    const dist = Math.hypot(pos.x - zone.center.x, pos.z - zone.center.z);
    if (dist <= zone.radius && dist < bestDist) {
      best = zone;
      bestDist = dist;
    }
  }
  return best;
}

// 구역의 행동 id 목록(복사본). 구역이 없으면 [].
export function zoneActions(zone) {
  return zone ? [...zone.actions] : [];
}

// 이 게임의 행동 구역: 소각장(소각로 중심)과 세탁소(세탁기 줄과 빨랫줄 사이).
export function buildZones(layout) {
  const { washers, clothesline } = layout;
  const wx = washers.reduce((sum, w) => sum + w.x, 0) / washers.length;
  const wz = washers.reduce((sum, w) => sum + w.z, 0) / washers.length;
  return [
    { id: 'incinerator', center: { x: FURNACE.x, z: FURNACE.z }, radius: FIRE_ZONE_RADIUS, actions: ['burn', 'shred'] },
    { id: 'laundry', center: { x: (wx + clothesline.centre.x) / 2, z: (wz + clothesline.centre.z) / 2 }, radius: LAUNDRY_ZONE_RADIUS, actions: ['wash', 'hang'] },
  ];
}
