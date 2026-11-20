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
// 캐치 링크가 골고루 나오도록: 같은 링크로 가는 문구가 많아도 링크마다 뽑힐 몫이 같게 맞추고(문구 수의 역수), 최근에 나온 링크(recentLinks)는 recentWeight 배로 낮춘다.
export function pickFortuneFor(list, rng, lastIndex, favors = [], boost = 3, { recentLinks = [], recentWeight = 0.1 } = {}) {
  if (list.length === 0) throw new Error('포춘 문구 목록이 비어 있습니다.');
  const hasLast = Number.isInteger(lastIndex) && lastIndex >= 0 && lastIndex < list.length;
  const perLink = {};
  for (const f of list) { const l = f.cta?.link; if (l) perLink[l] = (perLink[l] ?? 0) + 1; }
  const weights = list.map((f, i) => {
    if (hasLast && list.length > 1 && i === lastIndex) return 0;
    const l = f.cta?.link;
    const share = l ? 1 / perLink[l] : 1; // 링크 하나당 몫을 같게
    const recent = l && recentLinks.includes(l) ? recentWeight : 1;
    return (favors.includes(f.category) ? boost : 1) * share * recent;
  });
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

// 운세 카드 글을 읽기 좋게 줄바꿈한다: 문장이 끝나는 곳(. ! ?)에서 한 줄씩 나누고, 한 문장이 길면(maxLine 초과) 가운데에 가장 가까운 쉼표 뒤에서 한 번 더 나눈다. 결과는 \n 으로 이어 붙인 글.
export function breakFortuneLines(text, maxLine = 22) {
  const sentences = String(text).split(/(?<=[.!?]['"’”]?)\s+/).filter(Boolean);
  const lines = [];
  for (const s of sentences) {
    if (s.length <= maxLine) { lines.push(s); continue; }
    const mid = s.length / 2;
    let cut = -1;
    for (let i = 0; i < s.length - 1; i++) {
      if (s[i] === ',' && (cut < 0 || Math.abs(i - mid) < Math.abs(cut - mid))) cut = i;
    }
    if (cut < 0) { lines.push(s); continue; }
    lines.push(s.slice(0, cut + 1).trim(), s.slice(cut + 1).trim());
  }
  return lines.join('\n');
}
