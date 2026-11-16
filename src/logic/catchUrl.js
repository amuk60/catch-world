// 캐치 사이트로 가는 주소 만들기 (순수). 기존 쿼리·해시는 그대로 두고 params 를 덧붙인다(같은 이름은 덮어쓴다). 값은 안전하게 인코딩되며 비어 있는(null/undefined/'') 값은 건너뛴다.
// 주소가 올바르지 않으면 base 를 그대로 돌려준다.
export function buildCatchUrl(base, params = {}) {
  let url;
  try { url = new URL(base); } catch { return base; }
  for (const [key, value] of Object.entries(params)) {
    if (value === null || value === undefined || value === '') continue;
    url.searchParams.set(key, String(value));
  }
  return url.toString();
}

// 포춘쿠키 → 캐치 이동 주소: utm_source / utm_medium / utm_campaign(운세 분류 id).
export function fortuneCatchUrl(base, utm, category) {
  return buildCatchUrl(base, { utm_source: utm.source, utm_medium: utm.medium, utm_campaign: category });
}
