// 캐치 링크를 여는 유일한 관문(순수, 의존성 주입). 모든 CTA(포춘 버튼·측면/가운데/면접 준비 팝업·칩)가 이것을 거친다.
// 한 번 열 때마다: 새 탭 열기 -> 통합 이벤트 catch_link_click(정확히 1번) -> 기존 상세 이벤트(cta_click·banner_click·fortune_cta_click, 예전 보고서용으로 그대로).
import { linkCatchUrl, mediumForSource } from './catchUrl.js';

// source -> 기존 상세 이벤트 목록.
const LEGACY = {
  fortune: ({ link, category }) => [['fortune_cta_click', { category, link }], ['cta_click', { source: 'fortune', category, link }]],
  popup_goal: ({ link }) => [['banner_click', { place: 'side', link }]],
  popup_clear: ({ link }) => [['banner_click', { place: 'modal', link }]],
  popup_ready: ({ link }) => [['cta_click', { source: 'outfit_ready', link }]],
  chip: ({ link }) => [['banner_click', { place: 'chip', link }]],
};

// open(url) 새 탭 열기, track(name, params) 상세 이벤트, trackCatch(params) 통합 이벤트.
export function createCatchOpener({ links, open, track, trackCatch }) {
  return function openCatch(link, { source, category } = {}) {
    const url = linkCatchUrl(links, link, mediumForSource(source));
    if (!url) return false;
    open(url);
    trackCatch({ link, source, category });
    for (const [name, params] of (LEGACY[source]?.({ link, category }) ?? [])) track(name, params);
    return true;
  };
}
