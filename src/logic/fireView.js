// 불멍 1인칭 시점 토글 (순수). 불 옆 통나무 자리에 앉아 있는 동안(마시멜로를 굽는 중에도) V 키로 캐릭터 눈 시점과 궤도 시점을 오간다.
// 실제 카메라 섞임(부드러운 전환·궤도 복원)은 logic/fpCamera.js 의 createFpBlend 가 맡고, 여기서는 "1인칭을 원하는가"만 정한다.
// 원하는 상태(on)는 앉아서 불멍을 하는 동안에만 유지되고, 일어나거나 공간이 바뀌거나 다른 모드로 가면 스스로 꺼진다(카메라가 1인칭에 갇히지 않는다).

// 앉아 있는 모드(앉기·마시멜로 굽기)인가.
const SITTING = (mode) => mode === 'seated' || mode === 'roasting';

// V 키를 받아도 되는가: 앉은 채 불멍 중(굽는 중이 아닐 때)이고 글자 입력 중이 아닐 때. (굽는 중에는 굽기 조작이 키를 모두 쓴다.)
export const canToggleFireView = ({ mode, meditating, typing }) => mode === 'seated' && Boolean(meditating) && !typing;

// 키 입력 하나가 시점 토글인가(V, 반복 입력·수식키 조합 제외).
export const isFireViewKey = (e) => e?.code === 'KeyV' && !e.repeat && !e.ctrlKey && !e.metaKey && !e.altKey;

export function createFireView() {
  let on = false;
  return {
    get on() { return on; },
    // V: 켜져 있으면 끄고, 꺼져 있으면 조건(canToggleFireView)이 맞을 때만 켠다. 바뀌었으면 true.
    toggle(ctx) {
      if (on) { on = false; return true; }
      if (!canToggleFireView(ctx)) return false;
      on = true;
      return true;
    },
    // Esc 등: 켜져 있으면 끈다. 껐으면 true.
    off() { const was = on; on = false; return was; },
    // 매 프레임: 앉은 채 불멍 중이 아니면(일어남·공간 이동·전환·다른 모드) 끈다. 지금 1인칭을 원하는지 돌려준다.
    sync({ mode, meditating }) {
      if (on && !(SITTING(mode) && meditating)) on = false;
      return on;
    },
  };
}
