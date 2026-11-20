// 함께 쌓는 소원 탑 (순수): 같은 방 방문자끼리 기존 실시간 채널로 돌 개수(정수)만 주고받는다(서버 표 없음). 소원 글은 절대 보내지 않는다.
// 받은 개수 검사, 내 탑 개수와 합치기(큰 쪽), 소원을 빌 때 새 개수, 말풍선 줄.
import { WISH } from '../config.js';

// 메시지로 받아 주는 개수 상한(설정의 maxStones 가 달라도 받을 수 있게 넉넉히. 보여 줄 때는 내 maxStones 로 자른다).
export const WS_LIMIT = 1000;

// 받은 개수를 0..WS_LIMIT 정수로 읽는다. 아니면 null(무시).
export const parseTowerCount = (v) => (Number.isInteger(v) && v >= 0 && v <= WS_LIMIT ? v : null);

// (소원을 빌 때의 새 개수 = 지금 탑 개수 + 1, 최대 max 는 logic/wish.js 의 nextStoneCount.)

// 받은 개수 n 을 내 탑(current)에 합친다: 올바른 정수이고 (내 max 로 자른 값이) 지금보다 클 때만 그 값, 아니면 null(그대로 둔다).
export function mergeTowerCount(current, n, max = WISH.maxStones) {
  const v = parseTowerCount(n);
  if (v === null) return null;
  const next = Math.min(max, v);
  return next > (Number(current) || 0) ? next : null;
}

// 말풍선 줄: "이 탑에 지금 N개의 소원이 쌓였어요"(N 이 0 이하·이상하면 '').
export function towerLine(n, template = WISH.towerLine) {
  return Number.isInteger(n) && n > 0 && template ? template.replace('{n}', String(n)) : '';
}
