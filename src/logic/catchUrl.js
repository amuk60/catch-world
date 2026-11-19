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

// 캐치 서비스 id(CATCH_LINKS 의 항목) → 이동 주소: utm_source=catchworld, utm_medium(fortune|popup|chip|banner), utm_campaign(기본은 link id). 경로의 대소문자·쿼리·해시는 그대로 둔다.
// 표에 없는 id 는 undefined 를 돌려준다.
export function linkCatchUrl(links, id, medium, campaign = id, source = 'catchworld') {
  const link = links.find((l) => l.id === id);
  if (!link) return undefined;
  return buildCatchUrl(link.url, { utm_source: source, utm_medium: medium, utm_campaign: campaign });
}

// 포춘쿠키 → 캐치 이동 주소: utm_source / utm_medium / utm_campaign(운세 분류 id).
export function fortuneCatchUrl(base, utm, category) {
  return buildCatchUrl(base, { utm_source: utm.source, utm_medium: utm.medium, utm_campaign: category });
}
