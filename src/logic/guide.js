// 조작 안내 카드의 표시 시간 (순수). 열린 뒤 maxMs 가 지나거나, 움직인 시간이 moveMs 에 닿으면 접는다.
export const GUIDE_TIMING = { maxMs: 14000, moveMs: 4000 };

export function createGuideTimer(timing = GUIDE_TIMING) {
  let open = 0;
  let moved = 0;
  return {
    reset() { open = 0; moved = 0; },
    // dt 초, moving: 이번 프레임에 걸었는가. 접어야 하면 true.
    update(dt, moving) {
      open += dt * 1000;
      if (moving) moved += dt * 1000;
      return open >= timing.maxMs || moved >= timing.moveMs;
    },
  };
}

// 처음 방문인가: 저장소(localStorage 처럼 getItem/setItem 이 있는 것)가 없거나 막혀 있어도 던지지 않는다. 저장이 안 되면 매번 처음으로 본다.
export const GUIDE_STORAGE_KEY = 'catchworld.guideSeen';
export function isFirstVisit(storage) {
  try { return !storage?.getItem(GUIDE_STORAGE_KEY); } catch { return true; }
}
export function markSeen(storage) {
  try { storage?.setItem(GUIDE_STORAGE_KEY, '1'); } catch { /* 저장 불가: 무시 */ }
}
