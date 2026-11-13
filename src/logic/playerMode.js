// 플레이어 모드 전이 (순수). 모드: 'free' | 'seated' | 'fortune' | 'result'(종료 화면) | 'transition'(공간 전환 연출 중: 이동·클릭·E·행동 모두 잠김) | 'wearing'(새 셔츠를 입는 동작 중: 똑같이 잠김)
// | 'interview-choice'(면접장: 답변 선택 창이 열려 있음. 이동·행동·E 잠김, Esc/다음에 할게요 로 닫는다) | 'interview-play'(면접 연출 중: 답변·돌발행동 장면이 끝날 때까지 똑같이 잠김).
// 면접은 지원자 의자에 앉은('seated') 채로만 시작하고, 끝나면 언제나 'seated' 로 돌아온다(돌발행동은 연출 안에서 일어났다가 다시 앉는다). 두 면접 모드에서도 의자에 앉은 것으로 본다(holdsSeat).
// 이벤트: 'interact:seat' | 'interact:fortune' (E 로 해당 대상 사용), 'interact' (앉은/포춘 상태에서 E),
//        'move' (바닥 클릭), 'close' (Esc, 닫기), 'open:result' (클리어 팝업이 열림; 포춘 중에는 무시),
//        'transition:start' (문에서 E: free 에서만 시작), 'transition:end' (전환이 끝남), 'wear:start' (마른 새 셔츠 입기: free 에서만), 'wear:end' (입기가 끝남),
//        'interview:open' (면접 보기: seated 에서 선택 창 열기), 'interview:cancel' (선택 창을 감소 없이 닫음), 'interview:pick' (선택지를 골라 답변 연출 시작),
//        'interview:play' (돌발행동: seated 에서 바로 연출 시작), 'interview:end' (연출이 끝남). 표에 없는 조합은 모드가 그대로다.
// 포춘 상태의 E(쿠키 깨기 vs 닫기)는 모달이 스스로 판단하므로 여기서는 모드를 바꾸지 않는다.
const TABLE = {
  free: { 'interact:seat': 'seated', 'interact:fortune': 'fortune', 'open:result': 'result', 'transition:start': 'transition', 'wear:start': 'wearing' },
  seated: { interact: 'free', move: 'free', 'open:result': 'result', 'interview:open': 'interview-choice', 'interview:play': 'interview-play' },
  fortune: { close: 'free' },
  result: { close: 'free' },
  transition: { 'transition:end': 'free' },
  wearing: { 'wear:end': 'free' },
  'interview-choice': { 'interview:cancel': 'seated', 'interview:pick': 'interview-play' },
  'interview-play': { 'interview:end': 'seated' },
};

export function nextMode(mode, event) {
  return TABLE[mode]?.[event] ?? mode;
}

// 자유 상태에서만 걷는다. (앉은 채 바닥을 클릭하면 'move' 이벤트로 먼저 일어난 뒤 걷는다.)
export const canWalk = (mode) => mode === 'free';

export const showPrompt = (mode) => mode === 'free' || mode === 'seated';

// 의자에 앉아 있는 모드인가(앉은 상태와 그 위에서 진행되는 면접 모드). 이 모드들 사이를 오갈 때는 일어나지 않는다.
export const holdsSeat = (mode) => mode === 'seated' || mode === 'interview-choice' || mode === 'interview-play';
