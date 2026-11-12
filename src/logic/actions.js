// 소각장 행동 정의와 실행기 (순수). 행동은 클립 몇 개를 이어서 재생하는 한 번짜리 동작이고,
// 실행기는 시간만 보고 "효과 순간"과 "끝"을 알려 준다(렌더링·상태 변경은 main.js 가 한다).
export const ACTIONS = {
  burn: { id: 'burn', label: '태우기', key: '1', clips: ['pick-up', 'attack-melee-right'], target: 'fire' },
  shred: { id: 'shred', label: '파쇄', key: '2', clips: ['pick-up', 'attack-melee-left'], target: 'shredder' },
};

const EPS = 1e-9;
const MAX_STEPS = 200; // 아주 큰 dt 에서도 무한 반복하지 않게 하는 안전장치

// durations: 클립 이름 -> 초(늘려서 재생하는 경우 늘어난 길이). effectAt: 전체 길이 중 효과 순간의 비율.
// autoGap: 자동 반복에서 행동이 끝난 뒤 다음 행동을 시작하기까지 쉬는 시간(초).
// canStart(actionId): 자동이 다음 행동을 시작해도 되는지(사정거리 등). false 면 자동이 꺼진다. 수동 start 에는 쓰지 않는다.
export function createRunner({ durations, effectAt, autoGap, canStart = () => true }) {
  const totalOf = (id) => ACTIONS[id].clips.reduce((sum, name) => sum + (durations[name] ?? 0), 0);
  let current = null; // { id, total, effectTime, effected }
  let elapsed = 0;
  let sinceDone = Infinity; // 직전 행동이 끝난 뒤 경과(자동 반복의 쉬는 시간 기준). 끝난 적이 없으면 바로 시작할 수 있다.

  const runner = {
    lastActionId: null,
    autoOn: false,
    startedCount: 0, // 지금까지 시작한 횟수(자동 시작은 update 안에서 일어나므로 호출한 쪽이 바뀜을 알아챌 수 있게 한다)

    // 자동이 다음에 할 행동: 기록이 없으면 태우기, 그 뒤로는 마지막 행동의 반대(태우기 <-> 파쇄).
    nextAutoAction: () => (runner.lastActionId === 'burn' ? 'shred' : 'burn'),

    // 한 번에 하나만. 바쁘거나 모르는 id 면 false.
    start(actionId) {
      if (current || !ACTIONS[actionId]) return false;
      const total = totalOf(actionId);
      current = { id: actionId, total, effectTime: total * effectAt, effected: false };
      elapsed = 0;
      runner.startedCount += 1;
      runner.lastActionId = actionId;
      return true;
    },

    // dt 초를 진행하고 그 사이에 일어난 사건을 순서대로 돌려준다.
    update(dt) {
      const events = [];
      let left = Math.max(0, Number.isFinite(dt) ? dt : 0);
      for (let step = 0; step < MAX_STEPS; step++) {
        if (current) {
          const advance = Math.min(left, current.total - elapsed);
          elapsed += advance;
          left -= advance;
          if (!current.effected && elapsed >= current.effectTime - EPS) {
            current.effected = true;
            events.push({ type: 'effect', action: current.id });
          }
          if (elapsed >= current.total - EPS) {
            events.push({ type: 'done', action: current.id });
            current = null;
            sinceDone = 0;
          } else {
            break; // dt 를 다 썼다.
          }
          continue;
        }
        if (!runner.autoOn) { sinceDone += left; break; }
        const wait = Math.max(0, autoGap - sinceDone);
        if (wait > left) { sinceDone += left; break; }
        const next = runner.nextAutoAction();
        if (!canStart(next)) { runner.autoOn = false; sinceDone += left; break; }
        left -= wait;
        sinceDone += wait;
        runner.start(next);
      }
      return events;
    },

    isBusy: () => current !== null,
    progress: () => (current && current.total > 0 ? Math.min(1, elapsed / current.total) : 0),
    setAuto(on) { runner.autoOn = Boolean(on); },
    cancelAuto() { runner.autoOn = false; },
  };
  return runner;
}
