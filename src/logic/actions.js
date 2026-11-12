// 소각장 행동 정의와 실행기 (순수). 행동은 여러 단계(제자리 회전, 클립 재생)를 순서대로 하는 한 번짜리 동작이고,
// 실행기는 시간만 보고 단계 시작·줍는 순간·효과 순간·끝을 알려 준다(렌더링·상태 변경은 main.js 가 한다).
// 단계: 종이 더미 쪽으로 돈다 -> 집는다(pick-up) -> 대상 쪽으로 돈다 -> 던진다/친다. 캐릭터는 걷지 않고 제자리에서 돈다.
export const ACTIONS = {
  burn: {
    id: 'burn', label: '태우기', key: '1', clips: ['pick-up', 'attack-melee-right'], target: 'fire',
    steps: [
      { kind: 'turn', target: 'stack' }, { kind: 'clip', name: 'pick-up' },
      { kind: 'turn', target: 'fire' }, { kind: 'clip', name: 'attack-melee-right' },
    ],
  },
  shred: {
    id: 'shred', label: '파쇄', key: '2', clips: ['pick-up', 'attack-melee-left'], target: 'shredder',
    steps: [
      { kind: 'turn', target: 'stack' }, { kind: 'clip', name: 'pick-up' },
      { kind: 'turn', target: 'shredder' }, { kind: 'clip', name: 'attack-melee-left' },
    ],
  },
};

const EPS = 1e-9;
const MAX_STEPS = 400; // 아주 큰 dt 에서도 무한 반복하지 않게 하는 안전장치
const PICK_CLIP = 'pick-up';
const ORDER = { step: 0, pickup: 1, effect: 2, done: 3 }; // 같은 시각일 때 이벤트 순서

// 원래 클립 길이 raw(클립 이름 -> 초)를, 행동마다 클립 합이 (원래 합 + extraSeconds) 가 되도록 비례해서 늘린다.
// 돌려주는 값: durations(늘린 길이, 클립 이름 -> 초)와 speeds(행동 id -> 재생 배속 = 원래 합 / 늘린 합).
// 클립이 여러 행동에 쓰이면 합이 같아야 한다(지금은 모두 같다). 다르면 나중 행동의 값이 쓰인다.
export function stretchDurations(raw, extraSeconds) {
  const durations = {};
  const speeds = {};
  for (const action of Object.values(ACTIONS)) {
    const total = action.clips.reduce((sum, name) => sum + (raw[name] ?? 0), 0);
    const speed = total > 0 ? total / (total + extraSeconds) : 1;
    speeds[action.id] = speed;
    for (const name of action.clips) if (name in raw) durations[name] = raw[name] / speed;
  }
  return { durations, speeds };
}

// 행동을 할 수 있는가: 대상(소각로/파쇄기)과 종이 더미가 모두 사정거리(경계 포함) 안.
// dist: { fire, shredder, stack } 플레이어까지의 거리, ranges: 같은 키의 사정거리.
export function canPerform(actionId, dist, ranges) {
  const action = ACTIONS[actionId];
  if (!action) return false;
  const key = action.target;
  return dist[key] <= ranges[key] && dist.stack <= ranges.stack;
}

// durations: 클립 이름 -> 초(늘려서 재생하는 경우 늘어난 길이). turnSeconds: 회전 단계 하나의 길이(고정).
// effectAt: 마지막 단계(던지기/치기) 길이 중 효과 순간의 비율. pickupAt: pick-up 단계 길이 중 종이가 손에 나타나는 비율.
// autoGap: 자동 반복에서 행동이 끝난 뒤 다음 행동을 시작하기까지 쉬는 시간(초).
// canStart(actionId): 자동이 다음 행동을 시작해도 되는지(사정거리 등). false 면 자동이 꺼진다. 수동 start 에는 쓰지 않는다.
export function createRunner({ durations, turnSeconds = 0, effectAt, pickupAt = 0.6, autoGap, canStart = () => true }) {
  // 행동의 단계(초 포함)와 이벤트 시간표를 만든다. 시간표: [{ t, type, index? }] 를 시각 -> 종류 순으로 정렬.
  function plan(id) {
    const steps = ACTIONS[id].steps.map((s) => ({ ...s, seconds: s.kind === 'turn' ? turnSeconds : (durations[s.name] ?? 0) }));
    const timeline = [];
    let t = 0;
    steps.forEach((s, index) => {
      timeline.push({ t, type: 'step', index });
      if (s.kind === 'clip' && s.name === PICK_CLIP) timeline.push({ t: t + s.seconds * pickupAt, type: 'pickup' });
      if (index === steps.length - 1) timeline.push({ t: t + s.seconds * effectAt, type: 'effect' });
      t += s.seconds;
    });
    timeline.push({ t, type: 'done' });
    timeline.sort((a, b) => a.t - b.t || ORDER[a.type] - ORDER[b.type]);
    return { id, steps, timeline, total: t, next: 0 };
  }

  let current = null; // plan() 결과
  let elapsed = 0;
  let sinceDone = Infinity; // 직전 행동이 끝난 뒤 경과(자동 반복의 쉬는 시간 기준). 끝난 적이 없으면 바로 시작할 수 있다.

  const runner = {
    lastActionId: null,
    autoOn: false,

    // 행동의 단계 목록(초 포함).
    stepsOf: (id) => plan(id).steps,

    // 자동이 다음에 할 행동: 기록이 없으면 태우기, 그 뒤로는 마지막 행동의 반대(태우기 <-> 파쇄).
    nextAutoAction: () => (runner.lastActionId === 'burn' ? 'shred' : 'burn'),

    // 한 번에 하나만. 바쁘거나 모르는 id 면 false. 첫 단계 이벤트는 다음 update 에서 나온다.
    start(actionId) {
      if (current || !ACTIONS[actionId]) return false;
      current = plan(actionId);
      elapsed = 0;
      runner.lastActionId = actionId;
      return true;
    },

    // 진행 중인 행동을 이벤트 없이 끊는다(걷기·앉기 등으로 취소). 자동도 끈다.
    abort() {
      current = null;
      runner.autoOn = false;
      sinceDone = 0;
    },

    // dt 초를 진행하고 그 사이에 일어난 사건을 순서대로 돌려준다.
    update(dt) {
      const events = [];
      let left = Math.max(0, Number.isFinite(dt) ? dt : 0);
      for (let guard = 0; guard < MAX_STEPS; guard++) {
        if (current) {
          const advance = Math.min(left, current.total - elapsed);
          elapsed += advance;
          left -= advance;
          const { id, steps, timeline } = current;
          while (current.next < timeline.length && timeline[current.next].t <= elapsed + EPS) {
            const e = timeline[current.next++];
            events.push(e.type === 'step' ? { type: 'step', action: id, index: e.index, step: steps[e.index] } : { type: e.type, action: id });
          }
          if (current.next >= timeline.length) {
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
