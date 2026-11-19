import { mediumForSource } from './logic/catchUrl.js';
// GA4. 측정 ID 가 비어 있으면 아무것도 하지 않는다(no-op).
export function initAnalytics(id, doc = globalThis.document) {
  if (!id || !doc) return false;
  const script = doc.createElement('script');
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`;
  doc.head.appendChild(script);
  globalThis.dataLayer = globalThis.dataLayer || [];
  globalThis.gtag = function gtag() { globalThis.dataLayer.push(arguments); }; // gtag.js 는 arguments 객체를 기대한다.
  globalThis.gtag('js', new Date());
  globalThis.gtag('config', id);
  return true;
}

export function track(name, params = {}) {
  if (typeof globalThis.gtag !== 'function') return false;
  globalThis.gtag('event', name, params);
  return true;
}

// 캐치로 나가는 모든 링크 클릭을 한 이벤트로 모은다(GA4 에서 UTM 이 달라도 합산해 보기 위함). 클릭 한 번당 정확히 한 번만 부른다(logic/catchOpen.js 가 유일한 호출처).
// params: link(CATCH_LINKS id), source(fortune|popup_goal|popup_clear|popup_ready|chip|share), category(운세 분류, 선택), medium(utm_medium), campaign(utm_campaign = link id).
export function trackCatchClick({ link, source, category } = {}) {
  const params = { link, source, medium: mediumForSource(source), campaign: link };
  if (category) params.category = category;
  return track('catch_link_click', params);
}
