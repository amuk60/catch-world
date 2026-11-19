// 행동 1회의 스트레스 감소량을 범위 안에서 무작위로 뽑는다 (순수). rng 는 [0, 1) 난수 함수(테스트에서는 고정값을 넣는다).
// 반환값은 min..max(양끝 포함) 사이의 정수이고 각 값이 같은 확률이다. rng 가 1 을 돌려줘도 max 를 넘지 않는다.
import { REDUCE_RANGE } from '../config.js';

export function rollReduction(rng = Math.random, range = REDUCE_RANGE) {
  const min = Math.ceil(range.min);
  const max = Math.floor(range.max);
  if (max < min) return min;
  const n = Math.floor(rng() * (max - min + 1));
  return min + Math.min(Math.max(n, 0), max - min);
}
