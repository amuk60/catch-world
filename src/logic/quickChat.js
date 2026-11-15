// 인사·응원말(프리셋) 순수 로직: 프리셋 조회, 보낸 사람별 받는 속도 제한, 선택 창 키 정책. 자유 글은 없다(번호만 오가고 글은 받는 쪽이 자기 목록에서 찾는다).
export const QUICK_CHAT_MAX_LENGTH = 16;
export const QUICK_CHAT_SECONDS = 3.5;

// 번호로 프리셋 글을 찾는다. 정수 범위 밖이거나 글이 비어 있으면 null.
export function quickChatText(list, i) {
  if (!Array.isArray(list) || !Number.isInteger(i) || i < 0 || i >= list.length) return null;
  const t = list[i];
  return typeof t === 'string' && t.trim() ? t : null;
}

// 설정 목록을 점검한다(너무 길거나 비어 있는 항목은 null: 번호가 밀리지 않게 자리는 유지한다).
export function cleanQuickChat(list, max = QUICK_CHAT_MAX_LENGTH) {
  if (!Array.isArray(list)) return [];
  return list.map((t) => (typeof t === 'string' && t.trim() && [...t.trim()].length <= max ? t.trim() : null));
}

// 받는 속도 제한: 보낸 사람마다 perSenderMs 에 한 번, 모든 사람을 합쳐 windowMs 안에 globalMax 번까지. allow(id, nowMs) -> 통과하면 true(기록).
export function createChatLimiter({ perSenderMs = 2000, globalMax = 6, windowMs = 3000 } = {}) {
  const last = new Map();
  let stamps = [];
  return {
    allow(id, nowMs) {
      const prev = last.get(id);
      if (prev !== undefined && nowMs - prev < perSenderMs) return false;
      stamps = stamps.filter((t) => nowMs - t < windowMs);
      if (stamps.length >= globalMax) return false;
      stamps.push(nowMs);
      last.set(id, nowMs);
      if (last.size > 200) for (const [k, t] of last) if (nowMs - t >= perSenderMs) last.delete(k);
      return true;
    },
    clear() { last.clear(); stamps = []; },
  };
}

// 선택 창 키 정책. 입력: { code, open(선택 창이 열려 있는가), typing(글자 입력 중), blocked(면접·전환·포춘·종료 화면 등 막힌 상태), repeat, count(프리셋 개수) }.
// 반환: { type: 'open' | 'close' | 'consume' } | { type: 'pick', index } | null(이 모듈이 쓰지 않는 키: 게임이 그대로 처리).
// 선택 창은 열려 있을 때만 숫자 키(1~9)를 가져간다(consume: 아무 일 없이 키를 먹는다). 이동 키 등은 막지 않는다.
const DIGITS = { Digit1: 0, Digit2: 1, Digit3: 2, Digit4: 3, Digit5: 4, Digit6: 5, Digit7: 6, Digit8: 7, Digit9: 8, Numpad1: 0, Numpad2: 1, Numpad3: 2, Numpad4: 3, Numpad5: 4, Numpad6: 5, Numpad7: 6, Numpad8: 7, Numpad9: 8 };
export function quickChatKey({ code, open, typing = false, blocked = false, repeat = false, count = 8 }) {
  if (typing) return null;
  if (blocked) return open ? { type: 'close' } : null;
  if (open) {
    if (code === 'Escape') return { type: 'close' };
    if (code === 'KeyT') return repeat ? { type: 'consume' } : { type: 'close' };
    if (code in DIGITS) return DIGITS[code] < count && !repeat ? { type: 'pick', index: DIGITS[code] } : { type: 'consume' };
    return null;
  }
  if (code === 'KeyT' && !repeat) return { type: 'open' };
  return null;
}
