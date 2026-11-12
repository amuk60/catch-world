// 플레이어 모드 전이 (순수). 모드: 'free' | 'seated' | 'fortune' | 'burn'.
// 이벤트: 'interact:seat' | 'interact:fortune' | 'interact:burn' (E 로 해당 대상 사용), 'interact' (앉은/포춘 상태에서 E),
//        'move' (바닥 클릭), 'close' (Esc, 나가기). 표에 없는 조합은 모드가 그대로다.
// 포춘 상태의 E(쿠키 깨기 vs 닫기)는 모달이 스스로 판단하므로 여기서는 모드를 바꾸지 않는다.
const TABLE = {
  free: { 'interact:seat': 'seated', 'interact:fortune': 'fortune', 'interact:burn': 'burn' },
  seated: { interact: 'free', move: 'free' },
  fortune: { close: 'free' },
  burn: { close: 'free' }, // 소각 미니게임: 이동 등 다른 이벤트는 무시한다.
};

export function nextMode(mode, event) {
  return TABLE[mode]?.[event] ?? mode;
}

// 자유 상태에서만 걷는다. (앉은 채 바닥을 클릭하면 'move' 이벤트로 먼저 일어난 뒤 걷는다.)
export const canWalk = (mode) => mode === 'free';

export const showPrompt = (mode) => mode === 'free' || mode === 'seated';
