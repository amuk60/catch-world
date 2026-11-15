// 옷 상태 (순수). 입은 옷은 꾸미기일 뿐 스트레스 계산에는 쓰이지 않는다(세탁·널기·소각은 옷과 상관없이 늘 지수를 줄인다).
// clean(원래 정장) -[소각]-> dirty(그을음), 세탁은 clean 이든 dirty 든 셔츠를 벗어 세탁기에 넣어 tank(흰 나시만 입음)가 된다.
// clean|dirty -[세탁]-> tank(흰 나시만 입음) -[널기]-> drying(새 흰 셔츠가 줄에서 마르는 중)
//   -[DRY_SECONDS 경과]-> dry(마름) -[입기(E)]-> clean.
// 파쇄는 옷을 바꾸지 않고, 상태에 맞지 않는 행동은 옷에 아무 영향이 없다. 타이머는 update(dt) 로 실시간만큼 센다.
import { DRY_SECONDS, LAUNDRY_GUIDE } from '../config.js';

const NEXT = { burn: [['clean'], 'dirty'], wash: [['clean', 'dirty'], 'tank'], hang: [['tank'], 'drying'] }; // 행동 -> [필요한 상태들, 다음 상태]

export function createOutfit({ drySeconds = DRY_SECONDS } = {}) {
  let state = 'clean';
  let left = 0; // drying 동안 남은 시간(초)
  return {
    get state() { return state; },
    get secondsLeft() { return left; },
    // 행동 효과 순간에 부른다. 옷이 바뀌면 새 상태를, 아니면 null.
    onAction(id) {
      const rule = NEXT[id];
      if (!rule || !rule[0].includes(state)) return null;
      state = rule[1];
      if (state === 'drying') left = drySeconds;
      return state;
    },
    // 매 프레임. drying 이 끝나 dry 가 된 호출에서만 'dry', 아니면 null.
    update(dt) {
      if (state !== 'drying') return null;
      left -= dt;
      if (left > 0) return null;
      left = 0;
      state = 'dry';
      return 'dry';
    },
    canWear: () => state === 'dry',
    // dry 에서 새 셔츠를 입는다: clean 으로 돌아가고 true. 다른 상태에서는 false.
    wear() {
      if (state !== 'dry') return false;
      state = 'clean';
      return true;
    },
    reset() {
      state = 'clean';
      left = 0;
    },
  };
}

// 상태별 캐릭터 겉모습: 'suit'(원래 정장) | 'soot'(그을음) | 'tank'(흰 나시).
export const appearanceOf = (state) => (state === 'dirty' ? 'soot' : state === 'clean' ? 'suit' : 'tank');

// 빨랫줄에 내 새 셔츠가 걸려 있는가.
export const hasMyShirt = (state) => state === 'drying' || state === 'dry';

// 빨랫줄 곁의 E 안내. dry 에서만 누를 수 있고, drying 은 남은 시간을 알리는 누를 수 없는 힌트다. 그 밖에는 null.
export function outfitPrompt(state, secondsLeft) {
  if (state === 'dry') return { text: '새 셔츠 입기', actionable: true };
  if (state === 'drying') return { text: `셔츠가 마르는 중… (${Math.max(1, Math.ceil(secondsLeft))}초)`, actionable: false };
  return null;
}

// 세탁소 순서 안내(1 세탁 -> 2 널기 -> 마를 때까지 기다리기 -> E 새 셔츠 입기)의 앞 두 단계 문구. 세탁소 안에서만 나오고, 눌러도 아무 일 없는 힌트라서 문자열이나 null 만 돌려준다.
// washing: 세탁 동작이 진행 중인가(옷 상태가 바뀐 뒤에도 셔츠가 세탁기에 들어가 덜컹거리는 동안은 true). 마르는 중·입기는 빨랫줄 곁의 outfitPrompt 가 맡는다.
export function laundryGuide(state, { washing = false, spaceId = 'laundry' } = {}) {
  if (spaceId !== 'laundry') return null;
  if (washing) return LAUNDRY_GUIDE.washing;
  if (state === 'tank') return LAUNDRY_GUIDE.tank;
  return null;
}
