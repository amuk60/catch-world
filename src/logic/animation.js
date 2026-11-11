// 캐릭터 애니메이션 선택 (순수 로직).
export const FADE_SECONDS = 0.2;

export function clipNameFor(isMoving) {
  return isMoving ? 'walk' : 'idle';
}

// clips: [{ name }]. 이름이 같은 클립을 돌려주고 없으면 null.
export function findClip(clips, name) {
  return clips.find((c) => c.name === name) ?? null;
}
