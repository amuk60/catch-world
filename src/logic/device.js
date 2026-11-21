// 기기 판정 (순수). 터치 기기(폰·태블릿)면 터치 조작 화면(조이스틱·버튼)과 저사양 설정을 켠다. PC(마우스·키보드)는 아무것도 바뀌지 않는다.
// 주소의 ?mobile=1 은 강제로 켜고 ?mobile=0 은 강제로 끈다(개발·데스크톱 시험용). 시작할 때 한 번만 읽는다.

const MOBILE_UA = /Android|iPhone|iPad|iPod|Mobi/i;

// env: { ua(userAgent), maxTouchPoints, platform(navigator.platform), coarse(matchMedia('(pointer: coarse)').matches) }
// - 아이폰·안드로이드·아이패드는 UA 로 안다.
// - iPadOS 13+ 는 데스크톱 Mac 으로 위장한다: Mac 인데 손가락 접점이 2개 넘으면 아이패드로 본다(실제 Mac 은 0).
// - 그 밖에 주 입력 장치가 굵은 포인터(손가락)인 기기. 터치스크린 노트북은 주 포인터가 마우스(fine)라 PC 로 남는다.
export function isTouchDevice({ ua = '', maxTouchPoints = 0, platform = '', coarse = false } = {}) {
  const u = String(ua || '');
  if (MOBILE_UA.test(u)) return true;
  if (Number(maxTouchPoints) > 1 && (/Mac/.test(String(platform || '')) || /Macintosh/.test(u))) return true;
  return coarse === true;
}

// ?mobile=1 | true | on -> true, ?mobile=0 | false | off -> false, 없거나 다른 값 -> null(자동 판정).
export function mobileOverride(search) {
  let v = null;
  try { v = new URLSearchParams(search || '').get('mobile'); } catch { /* 주소를 못 읽으면 자동 판정 */ }
  if (v === null) return null;
  v = v.toLowerCase();
  if (v === '1' || v === 'true' || v === 'on') return true;
  if (v === '0' || v === 'false' || v === 'off') return false;
  return null;
}

// 최종 판정: 주소 강제값이 있으면 그것, 없으면 기기 판정.
export function decideTouch(search, env) {
  const o = mobileOverride(search);
  return o === null ? isTouchDevice(env) : o;
}

// 브라우저 값 읽기(없거나 막혀 있어도 던지지 않는다). win 이 없으면 빈 값.
export function readDeviceEnv(win) {
  const nav = win?.navigator ?? {};
  let coarse = false;
  try { coarse = Boolean(win?.matchMedia?.('(pointer: coarse)')?.matches); } catch { /* 지원하지 않으면 false */ }
  return { ua: nav.userAgent ?? '', maxTouchPoints: Number(nav.maxTouchPoints) || 0, platform: nav.platform ?? '', coarse };
}

// 세로 화면 안내("가로로 돌려 주세요")를 보일까: 터치 기기이고 화면이 가로보다 세로가 길 때만.
// 크기를 모르면(0) 보이지 않는다(잘못 막지 않게).
export function shouldShowRotate({ touch, width, height }) {
  if (!touch) return false;
  const w = Number(width) || 0;
  const h = Number(height) || 0;
  if (w <= 0 || h <= 0) return false;
  return h > w;
}
