// 공간 전환(차원문) 상태 기계 (순수). 닫는 구간(out) -> 'mid'(화면이 완전히 덮인 순간, 여기서 공간을 바꾼다) -> 여는 구간(in) -> 'done'.
// update(dt) 는 이번 호출에서 일어난 이벤트를 순서대로 돌려준다(아주 큰 dt 에서도 mid, done 이 한 번씩).
// radius(): 화면을 덮는 원의 열린 정도(1 = 활짝, 0 = 완전히 덮임). 닫을 때는 점점 빨라지고, 열 때는 빠르게 열려 천천히 멈춘다.
const easeIn = (k) => k * k;
const easeOut = (k) => 1 - (1 - k) * (1 - k);

export function createTransition({ outSeconds = 0.45, inSeconds = 0.45 } = {}) {
  let phase = 'idle'; // 'idle' | 'out' | 'in'
  let t = 0; // 현재 구간에서 지난 시간

  const self = {
    get active() { return phase !== 'idle'; },
    get phase() { return phase; },
    start() {
      if (phase !== 'idle') return false;
      phase = 'out';
      t = 0;
      return true;
    },
    update(dt) {
      const events = [];
      if (phase === 'idle') return events;
      t += Math.max(0, dt);
      if (phase === 'out' && t >= outSeconds) {
        events.push('mid');
        phase = 'in';
        t -= outSeconds;
      }
      if (phase === 'in' && t >= inSeconds) {
        events.push('done');
        phase = 'idle';
        t = 0;
      }
      return events;
    },
    // 전체 진행(0~1). 멈춰 있으면 0.
    progress() {
      if (phase === 'idle') return 0;
      return phase === 'out' ? (t / outSeconds) * (outSeconds / (outSeconds + inSeconds)) : (outSeconds + t) / (outSeconds + inSeconds);
    },
    radius() {
      if (phase === 'idle') return 1;
      return phase === 'out' ? 1 - easeIn(Math.min(1, t / outSeconds)) : easeOut(Math.min(1, t / inSeconds));
    },
  };
  return self;
}
