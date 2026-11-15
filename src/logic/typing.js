// 글자를 입력하는 중인가: 입력칸·텍스트 영역·선택 상자·편집 가능한 요소에 포커스가 있으면 게임 단축키(이동·E·1·2·R·M·Esc·T)가 반응하면 안 된다.
// target: 키 이벤트의 target(또는 document.activeElement). DOM 이 없어도(시험) 이름·속성만 보고 판단한다.
const TEXT_INPUT_TYPES = new Set(['text', 'search', 'email', 'url', 'tel', 'password', 'number', '']);

export function isTypingTarget(target) {
  if (!target || typeof target !== 'object') return false;
  if (target.isContentEditable === true) return true;
  const tag = typeof target.tagName === 'string' ? target.tagName.toUpperCase() : '';
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (tag === 'INPUT') {
    const type = String(target.type ?? '').toLowerCase();
    return TEXT_INPUT_TYPES.has(type);
  }
  return false;
}
