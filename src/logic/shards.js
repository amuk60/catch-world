// 방 샤딩(순수): 공간마다 방을 `<공간>-1`, `<공간>-2`, ... 로 나눠 한 방에 몰리지 않게 한다(전달 메시지 수는 방 인원의 제곱에 비례한다).
// 들어갈 때 1번 방부터 차례로 들어가 보고(presence 로 다른 사람 수를 센다), cap 미만이면 거기 머문다. 이미 있는 사람은 쫓아내지 않는다.
export function shardRoom(prefix, space, shard) {
  return `${prefix}${space}-${shard}`;
}

// 지금 shard 번 방에서 본 다른 사람 수(others)로 다음에 할 일을 정한다.
// 다른 사람이 cap 명 이상이면 이 방은 찼다(내가 들어가면 cap+1). 같은 순간에 여럿이 들어와 cap 을 조금 넘는 것은 허용한다.
// 반환: { action: 'stay' } | { action: 'try', shard: 다음 번호 } | { action: 'full' }(maxShards 방이 모두 참: 멀티플레이만 끈다).
export function nextShard({ shard, others, cap, maxShards }) {
  if (others < cap) return { action: 'stay' };
  if (shard >= maxShards) return { action: 'full' };
  return { action: 'try', shard: shard + 1 };
}
