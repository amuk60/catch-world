// 게임 전체의 하나뿐인 상태 (순수): 스트레스 지수와 클리어 여부. 모든 행동이 같은 지수를 줄이고 reset() 으로만 초기화한다.
import { StressMeter } from './stress.js';

export function createGameState({ start, goal }) {
  const stress = new StressMeter({ start, goal });
  const state = {
    stress,
    cleared: false,
    actionsDone: 0,

    // 지수를 amount 만큼 줄인다(0 아래로는 내려가지 않는다). 값이 처음으로 목표 이하가 되는 그 한 번만 justCleared 가 true.
    apply(amount) {
      const value = stress.reduce(amount);
      state.actionsDone += 1;
      const justCleared = !state.cleared && stress.cleared;
      if (justCleared) state.cleared = true;
      return { value, justCleared };
    },

    reset() {
      stress.reset();
      state.cleared = false;
      state.actionsDone = 0;
    },
  };
  return state;
}
