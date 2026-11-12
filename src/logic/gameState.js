// 게임 전체의 하나뿐인 상태 (순수): 스트레스 지수와 목표 달성(cleared)·0 도달(emptied) 여부. 모든 행동이 같은 지수를 줄이고 reset() 으로만 초기화한다.
import { StressMeter } from './stress.js';

export function createGameState({ start, goal }) {
  const stress = new StressMeter({ start, goal });
  const state = {
    stress,
    cleared: false, // 목표(goal) 이하가 된 적 있음
    emptied: false, // 0 이 된 적 있음
    actionsDone: 0,

    // 지수를 amount 만큼 줄인다(0 아래로는 내려가지 않는다). 값이 처음 목표 이하가 되는 호출에서만 justGoal, 처음 0 이 되는 호출에서만 justEmpty 가 true(한 호출에 둘 다일 수 있다).
    // counts: false 면 행동 횟수에 넣지 않는다(불멍의 자동 감소).
    apply(amount, { counts = true } = {}) {
      const value = stress.reduce(amount);
      if (counts) state.actionsDone += 1;
      const justGoal = !state.cleared && stress.cleared;
      if (justGoal) state.cleared = true;
      const justEmpty = !state.emptied && value === 0;
      if (justEmpty) state.emptied = true;
      return { value, justGoal, justEmpty };
    },

    reset() {
      stress.reset();
      state.cleared = false;
      state.emptied = false;
      state.actionsDone = 0;
    },
  };
  return state;
}
