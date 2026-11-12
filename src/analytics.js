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
