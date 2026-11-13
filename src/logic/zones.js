// 행동 구역 (순수). 구역은 { id, center: {x, z}, radius, actions: [첫째, 둘째], auto? } 이고, 플레이어가 반경 안(경계 포함)에 있으면
// 그 구역의 행동 막대가 뜬다. 구역이 겹치면 중심이 더 가까운 쪽(같으면 목록에서 먼저 나온 쪽)이다.
// 구역은 space(공간 id: 'yard' | 'laundry' ...)에 속하고, spaceId 를 주면 그 공간의 구역만 본다.
import { FURNACE, FIRE_ZONE_RADIUS, LAUNDRY_ZONE_RADIUS, INTERVIEW_ZONE_RADIUS } from '../config.js';
import { buildLaundryInterior, buildInterviewInterior } from './interiors.js';

// 플레이어가 안에 있는 가장 가까운 구역. 없으면 null. y 는 무시한다. spaceId 가 주어지면 zone.space 가 같은 구역만 대상이다.
// seatId 가 있는 구역(면접장)은 그 자리에 앉아 있을 때만 켜지므로 위치만으로는 찾지 않는다(seatZone 참고).
export function activeZone(pos, zones, spaceId) {
  let best = null;
  let bestDist = Infinity;
  for (const zone of zones) {
    if (zone.seatId !== undefined) continue;
    if (spaceId !== undefined && zone.space !== spaceId) continue;
    const dist = Math.hypot(pos.x - zone.center.x, pos.z - zone.center.z);
    if (dist <= zone.radius && dist < bestDist) {
      best = zone;
      bestDist = dist;
    }
  }
  return best;
}

// 앉아 있는 자리(seat 상호작용 항목 또는 id)에 묶인 구역. 없으면 null.
export function seatZone(seat, zones) {
  const id = typeof seat === 'string' ? seat : seat?.id;
  return (id !== undefined && zones.find((zone) => zone.seatId === id)) || null;
}

// 지금 행동 막대를 보일 구역: 자유 상태면 서 있는 자리의 구역, 앉은 상태면 그 자리에 묶인 구역(벤치처럼 묶인 구역이 없으면 null), 그 밖의 모드는 null.
export function currentZoneFor({ mode, pos, seat, zones, spaceId }) {
  if (mode === 'free') return activeZone(pos, zones, spaceId);
  if (mode === 'seated') return seatZone(seat, zones);
  return null;
}

// 구역의 행동 id 목록(복사본). 구역이 없으면 [].
export function zoneActions(zone) {
  return zone ? [...zone.actions] : [];
}

// 자동(R) 버튼이 번갈아 할 행동 목록. 구역에 auto: false 가 있으면(면접장) 자동이 없어 [] 이다.
export function autoActionsOf(zone) {
  return zone && zone.auto !== false ? zoneActions(zone) : [];
}

// 이 게임의 행동 구역: 마당의 소각장(소각로 중심), 실내 세탁소(세탁기 줄과 빨랫줄 사이), 실내 면접장(지원자 의자에 앉아 있을 때만 켜지는 구역, 자동 버튼 없음). layout 은 마당 배치(지금은 쓰지 않지만 구역이 마당 배치를 따를 수 있게 받는다).
export function buildZones(layout, interior = buildLaundryInterior(), interviewInterior = buildInterviewInterior()) {
  const { washers, clothesline } = interior;
  const wx = washers.reduce((sum, w) => sum + w.x, 0) / washers.length;
  const wz = washers.reduce((sum, w) => sum + w.z, 0) / washers.length;
  return [
    { id: 'incinerator', space: 'yard', center: { x: FURNACE.x, z: FURNACE.z }, radius: FIRE_ZONE_RADIUS, actions: ['burn', 'shred'] },
    { id: 'laundry', space: 'laundry', center: { x: (wx + clothesline.centre.x) / 2, z: (wz + clothesline.centre.z) / 2 }, radius: LAUNDRY_ZONE_RADIUS, actions: ['wash', 'hang'] },
    { id: 'interview', space: 'interview', center: { ...interviewInterior.zoneCenter }, radius: INTERVIEW_ZONE_RADIUS, actions: ['interview', 'improv'], auto: false, seatId: interviewInterior.seatId },
  ];
}
