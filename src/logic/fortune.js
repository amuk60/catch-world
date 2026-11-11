// 포춘쿠키 문구 뽑기 (순수). 직전에 나온 인덱스는 피한다.
export function pickFortune(list, rng, lastIndex) {
  if (list.length === 0) throw new Error('포춘 문구 목록이 비어 있습니다.');
  const hasLast = Number.isInteger(lastIndex) && lastIndex >= 0 && lastIndex < list.length;
  let index;
  if (hasLast && list.length > 1) {
    const j = Math.floor(rng() * (list.length - 1)); // 직전 항목을 뺀 나머지 중에서 고른다.
    index = j >= lastIndex ? j + 1 : j;
  } else {
    index = Math.floor(rng() * list.length);
  }
  return { index, text: list[index] };
}
