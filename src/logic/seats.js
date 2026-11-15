// 좌석 점유 (순수). 다른 방문자(원격 아바타)가 앉아 있는 의자는 "사용 중"이라 내가 앉을 수 없다.
// 원격 방문자의 상태(보간된 위치와 seat 여부)만 보고 정하며, 나는 이미 앉아 있으면 쫓겨나지 않는다(호출하는 쪽이 앉은 상태에서는 쓰지 않는다).

// 의자 한 곳으로 보는 반경(단위). 의자 간격(1.7)보다 작아 이웃 의자를 막지 않고, 일어서서 한 칸 앞(1.0)까지는 그 의자를 쓰는 중으로 본다(돌발행동 중).
export const SEAT_OCCUPIED_RADIUS = 1.3;

// seatPoints: [{ id, x, z }](의자의 앉는 자리), remotes: [{ id, x, z, seat }](보간된 상태), radius: 반경.
// 앉은(seat true) 방문자는 반경 안의 가장 가까운 의자 하나만 차지한다. 사용 중인 의자 id 의 Set.
export function occupiedSeats(seatPoints, remotes, radius = SEAT_OCCUPIED_RADIUS) {
  const out = new Set();
  if (!Array.isArray(seatPoints) || !Array.isArray(remotes)) return out;
  for (const r of remotes) {
    const id = seatOfRemote(seatPoints, r, radius);
    if (id !== null) out.add(id);
  }
  return out;
}

// 앉은(seat true) 방문자 한 명이 차지한 의자 id: 반경 안의 가장 가까운 의자. 앉지 않았거나 반경 안에 의자가 없으면 null.
// 담당 면접관제에서 다른 방문자의 말을 어느 의자(= 어느 면접관) 일로 볼지 정할 때도 쓴다.
export function seatOfRemote(seatPoints, remote, radius = SEAT_OCCUPIED_RADIUS) {
  if (!Array.isArray(seatPoints) || !remote || remote.seat !== true || !Number.isFinite(remote.x) || !Number.isFinite(remote.z)) return null;
  let best = null;
  let bestDist = Infinity;
  for (const s of seatPoints) {
    const dist = Math.hypot(remote.x - s.x, remote.z - s.z);
    if (dist <= radius + 1e-9 && dist < bestDist) { best = s; bestDist = dist; }
  }
  return best ? best.id : null;
}

// E 안내 문구: 사용 중인 의자면 "사용 중"(누를 수 없는 힌트), 아니면 원래 문구. item 이 의자(seat)가 아니면 그대로.
export function seatPromptFor(item, occupied, prompt) {
  if (item?.kind === 'seat' && occupied?.has(item.id)) return { text: '사용 중', actionable: false };
  return { text: prompt, actionable: true };
}
