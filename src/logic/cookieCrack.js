// 포춘쿠키 연타 깨기 (순수). 키를 누를 때마다 진행도가 오르고, 멈추면 천천히 줄어든다(리듬 있게 눌러야 깨진다).
// 진행도 0~1: 0.2 부터 실금(1), 0.5 큰 금(2), 0.8 흔들림(3), 1 이 되면 깨진다(4). 길게 눌러 생기는 키 반복(repeat)은 세지 않는다.
export const CRACK = { perPress: 0.12, decayPerSec: 0.25, stageAt: [0.2, 0.5, 0.8] };

export const CRACK_STAGES = ['whole', 'hairline', 'cracked', 'wobble', 'broken'];

export function crackStage(progress, stageAt = CRACK.stageAt) {
  if (progress >= 1) return 4;
  let s = 0;
  for (const at of stageAt) if (progress >= at) s++;
  return s;
}

// now: 초 단위 시계(시험에서 바꿔 끼운다).
export function createCookieCrack({ now = () => performance.now() / 1000, perPress = CRACK.perPress, decayPerSec = CRACK.decayPerSec } = {}) {
  let progress = 0;
  let last = now();
  let presses = 0;
  let broken = false;
  const tick = () => {
    const t = now();
    if (!broken && t > last) progress = Math.max(0, progress - decayPerSec * (t - last));
    last = t;
  };
  const snap = (counted) => ({ counted, progress, stage: crackStage(progress), broken, presses });
  return {
    // 눌렀다. repeat(키 반복)이거나 이미 깨졌으면 세지 않는다.
    press({ repeat = false } = {}) {
      if (repeat || broken) return snap(false);
      tick();
      progress = Math.min(1, progress + perPress);
      presses++;
      if (progress >= 1) broken = true;
      return snap(true);
    },
    // 시간만 흐르게 한다(화면 갱신용). 현재 상태를 돌려준다.
    update() { tick(); return snap(false); },
    reset() { progress = 0; presses = 0; broken = false; last = now(); },
    get progress() { tick(); return progress; },
    get broken() { return broken; },
    get presses() { return presses; },
  };
}
