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

// 쿠키 종류에 따라 운세 분류를 조금 더 자주 뽑는다(favors 에 든 분류의 가중치를 boost 배로). 직전 인덱스는 피한다.
// list 항목은 { text, category, cta } 이고 { index, fortune } 을 돌려준다.
export function pickFortuneFor(list, rng, lastIndex, favors = [], boost = 3) {
  if (list.length === 0) throw new Error('포춘 문구 목록이 비어 있습니다.');
  const hasLast = Number.isInteger(lastIndex) && lastIndex >= 0 && lastIndex < list.length;
  const weights = list.map((f, i) => (hasLast && list.length > 1 && i === lastIndex ? 0 : favors.includes(f.category) ? boost : 1));
  const total = weights.reduce((a, b) => a + b, 0);
  let r = rng() * total;
  let index = weights.length - 1;
  for (let i = 0; i < weights.length; i++) {
    r -= weights[i];
    if (r < 0 && weights[i] > 0) { index = i; break; }
  }
  if (weights[index] === 0) index = weights.findIndex((w) => w > 0);
  return { index, fortune: list[index] };
}
