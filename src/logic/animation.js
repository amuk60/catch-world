// 캐릭터 애니메이션 선택 (순수 로직).
export const FADE_SECONDS = 0.2;

export function clipNameFor(isMoving) {
  return isMoving ? 'walk' : 'idle';
}

// 상태 'walk' | 'idle' | 'sit' -> 클립 이름.
export function clipNameForState(state) {
  if (state !== 'walk' && state !== 'idle' && state !== 'sit') throw new Error(`알 수 없는 상태: ${state}`);
  return state;
}

// clips: [{ name }]. 이름이 같은 클립을 돌려주고 없으면 null.
export function findClip(clips, name) {
  return clips.find((c) => c.name === name) ?? null;
}
