// 게임 전체의 하나뿐인 상태 (순수). 스트레스 지수와 종이 큐 진행은 모든 미니게임이 공유하고,
// 나갔다 다시 들어와도 유지된다. reset() 으로만 초기화한다.
import { StressMeter } from './stress.js';
import { ShredderState } from './shredder.js';

export function createGameState({ start, goal, queue }) {
  const stress = new StressMeter({ start, goal });
  const shredder = new ShredderState();

  // 감소를 적용한다. 값이 처음으로 목표 이하가 되는 그 한 번만 justCleared 가 true.
  function reduceBy(amount) {
    const wasCleared = state.cleared;
    const value = stress.reduce(amount);
    const justCleared = !wasCleared && stress.cleared;
    if (justCleared) state.cleared = true;
    return { value, justCleared };
  }

  const state = {
    stress,
    queue,
    index: 0,
    cleared: false,
    shredder,

    // 지금 트레이에 올릴 종이. 큐가 끝났거나 자소서가 파쇄기에 들어 있으면 null.
    currentPaper() {
      if (shredder.loaded) return null;
      return queue[state.index] ?? null;
    },

    completeBurn(item) {
      const result = reduceBy(item.reduce);
      state.index += 1;
      return result;
    },

    // 종이를 파쇄기에 넣는다(종이는 가져간 것으로 본다). 이미 들어 있으면 false.
    loadShredder(item) {
      return shredder.load(item);
    },

    tapShredder() {
      if (!shredder.loaded) return { reduced: 0, done: false, value: stress.value, justCleared: false };
      const { reduced, done } = shredder.tap();
      const { value, justCleared } = reduceBy(reduced);
      if (done) state.index += 1;
      return { reduced, done, value, justCleared };
    },

    reset() {
      stress.reset();
      shredder.reset();
      state.index = 0;
      state.cleared = false;
    },
  };
  return state;
}
