// 불멍(앉아서 불 보기)의 자동 감소 (순수). active 인 동안만 시간이 쌓이고, interval 마다 amount 를 낸다.
export function createPassive({ interval, amount }) {
  let acc = 0;
  return {
    // 이번 호출에서 만들어진 감소량의 합. 한 번에 여러 interval 이 지났으면 그만큼 곱해서 낸다.
    update(dt, active) {
      if (!active) { acc = 0; return 0; }
      if (!Number.isFinite(dt) || dt <= 0) return 0;
      acc += dt;
      const count = Math.floor(acc / interval + 1e-9);
      acc -= count * interval;
      if (acc < 0) acc = 0;
      return count * amount;
    },
    reset() { acc = 0; },
  };
}

// 불멍을 하는 중인가: 마당에서 앉은 채(마시멜로를 굽는 중에도) 소각로 중심에서 radius 안의 벤치에 있다. seatDistance 는 앉은 자리와 소각로의 거리(앉지 않았으면 null).
export const isMeditating = ({ mode, spaceId, seatDistance }, radius) => (mode === 'seated' || mode === 'roasting') && spaceId === 'yard' && Number.isFinite(seatDistance) && seatDistance <= radius;
