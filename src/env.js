export function isMobileUA(ua) {
  return /Android|iPhone|iPad|iPod|Mobi/i.test(ua || '');
}

// 멀티플레이를 쓸지와 방식: 'local' | 'supabase' | null(안 씀). 주소의 ?mp=off 는 끄고 ?mp=local 은 같은 브라우저 탭끼리(BroadcastChannel)로 바꾼다. 시작할 때 한 번만 읽는다.
// supabase 인데 keys 가 비어 있으면 null(조용히 꺼진다). main.js 가 멀티플레이 모듈을 불러올지 정하는 데 쓴다(꺼져 있으면 아무것도 더 불러오지 않는다).
export function multiplayerMode(search, cfg, keys) {
  if (!cfg || !cfg.enabled) return null;
  let override = null;
  try { override = new URLSearchParams(search || '').get('mp'); } catch { /* 주소를 읽지 못하면 설정을 따른다 */ }
  if (override === 'off') return null;
  const kind = override === 'local' ? 'local' : cfg.transport;
  if (kind === 'local') return 'local';
  if (kind === 'supabase') return keys && keys.url && keys.anonKey ? 'supabase' : null;
  return null;
}

// 채널 이름 앞머리. 주소에 ?mpdev=<영문숫자 1~16자> 가 있으면 "catch-world-dev-<값>:" 로 바꿔 시험 방문자끼리만 만나게 한다(운영 채널과 섞이지 않는다). 시작할 때 한 번만 읽는다.
export function channelPrefix(search, cfg) {
  let dev = null;
  try { dev = new URLSearchParams(search || '').get('mpdev'); } catch { /* 무시 */ }
  if (dev && /^[A-Za-z0-9]{1,16}$/.test(dev)) return `catch-world-dev-${dev}:`;
  return cfg.channelPrefix;
}
