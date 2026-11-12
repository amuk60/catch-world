// 구역 행동(소각장: 태우기·파쇄 / 세탁소: 세탁·널기) 정의와 실행기 (순수). 행동은 여러 단계(클립 재생, 제자리 회전)를 순서대로 하는 한 번짜리 동작이고,
// 실행기는 시간만 보고 단계 시작·단계 안의 표식 순간·효과 순간·끝을 알려 준다(렌더링·상태 변경은 main.js 가 한다).
// 단계: 한숨(emote-no) -> 재킷 주머니에서 소품(종이·셔츠)을 꺼낸다(pick-up, 60% 에 paperOut) -> 대상 쪽으로 돈다(유일한 회전)
//       -> 던진다/친다/팔을 든다(effect 표식: 효과 순간) -> 후련(emote-yes). 캐릭터는 걷지 않고 제자리에서 돈다.
// 행동의 zone 은 그 행동이 속한 행동 구역(logic/zones.js)의 id 이고, 같은 구역 안에서 key 1 과 2 가 첫째·둘째 행동이다.
// 단계 표식: event/eventAt = 그 단계의 eventAt(0~1) 지점에서 { type: event } 이벤트, effect = 이 단계의 effectAt 지점이 효과 순간.
const SIGH = { kind: 'clip', name: 'emote-no' };
const POCKET_PULL = { kind: 'clip', name: 'pick-up', event: 'paperOut', eventAt: 0.6 };
const RELIEF = { kind: 'clip', name: 'emote-yes' };
const turnTo = (target) => ({ kind: 'turn', target });
const hit = (name) => ({ kind: 'clip', name, effect: true });
const sequence = (target, effect) => [SIGH, POCKET_PULL, turnTo(target), effect, RELIEF].map((step) => ({ ...step }));
export const ACTIONS = {
  burn: { id: 'burn', label: '태우기', key: '1', zone: 'incinerator', target: 'fire', steps: sequence('fire', hit('attack-melee-right')) },
  shred: { id: 'shred', label: '파쇄', key: '2', zone: 'incinerator', target: 'shredder', steps: sequence('shredder', hit('attack-melee-right')) },
  wash: { id: 'wash', label: '세탁', key: '1', zone: 'laundry', target: 'washer', steps: sequence('washer', hit('attack-melee-right')) },
  hang: { id: 'hang', label: '널기', key: '2', zone: 'laundry', target: 'clothesline', steps: sequence('clothesline', hit('interact-right')) },
};

const EPS = 1e-9;
const MAX_STEPS = 400; // 아주 큰 dt 에서도 무한 반복하지 않게 하는 안전장치
const ORDER = { step: 0, mark: 1, effect: 2, done: 3 }; // 같은 시각일 때 이벤트 순서(mark = 단계 표식 이벤트)

// 클립 길이 맞추기. raw: 클립 이름 -> 원래 길이(초). 행동의 자연 길이(클립 합 + 회전 시간)가 targetSeconds 보다 짧으면
// 그 행동의 던지기/치기(effect) 클립만 늘려 총 길이를 정확히 targetSeconds 로 맞춘다. 더 길면 늘리지 않는다(배속은 항상 1 이하).
// 돌려주는 값: durations(재생 길이, 클립 이름 -> 초), speeds(재생 배속 timeScale, 클립 이름 -> 값).
export function fitDurations(raw, turnSeconds, targetSeconds) {
  const durations = { ...raw };
  const speeds = {};
  for (const name of Object.keys(raw)) speeds[name] = 1;
  for (const action of Object.values(ACTIONS)) {
    const natural = action.steps.reduce((sum, s) => sum + (s.kind === 'turn' ? turnSeconds : (raw[s.name] ?? 0)), 0);
    const effectStep = action.steps.find((s) => s.effect);
    if (natural >= targetSeconds || !effectStep || !(raw[effectStep.name] > 0)) continue;
    durations[effectStep.name] = raw[effectStep.name] + (targetSeconds - natural);
    speeds[effectStep.name] = raw[effectStep.name] / durations[effectStep.name];
  }
  return { durations, speeds };
}

// 행동을 할 수 있는가: 대상(소각로/파쇄기/세탁기/빨랫줄)이 사정거리(경계 포함) 안.
// dist: { fire, shredder, washer, clothesline } 플레이어까지의 거리, ranges: 같은 키의 사정거리.
export function canPerform(actionId, dist, ranges) {
  const action = ACTIONS[actionId];
  if (!action) return false;
  return dist[action.target] <= ranges[action.target];
}

// durations: 클립 이름 -> 초(늘려서 재생하는 경우 늘어난 길이). turnSeconds: 회전 단계 하나의 길이(고정).
// effectAt: effect 표식이 붙은 단계(던지기/치기) 길이 중 효과 순간의 비율.
// autoGap: 자동 반복에서 행동이 끝난 뒤 다음 행동을 시작하기까지 쉬는 시간(초).
// canStart(actionId): 자동이 다음 행동을 시작해도 되는지(사정거리 등). false 면 자동이 꺼진다. 수동 start 에는 쓰지 않는다.
// autoActions(): 지금 자동이 번갈아 할 구역의 행동 id [첫째, 둘째](호출할 때마다 현재 구역을 돌려준다). 구역이 없으면 [] 이고 자동은 꺼진다.
export function createRunner({
  durations, turnSeconds = 0, effectAt, autoGap, canStart = () => true, autoActions = () => ['burn', 'shred'],
}) {
  // 행동의 단계(초 포함)와 이벤트 시간표를 만든다. 시간표: [{ t, type, index? }] 를 시각 -> 종류 순으로 정렬.
  function plan(id) {
    const steps = ACTIONS[id].steps.map((s) => ({ ...s, seconds: s.kind === 'turn' ? turnSeconds : (durations[s.name] ?? 0) }));
    const timeline = [];
    let t = 0;
    steps.forEach((s, index) => {
      timeline.push({ t, type: 'step', index });
      if (s.event) timeline.push({ t: t + s.seconds * (s.eventAt ?? 1), type: 'mark', name: s.event });
      if (s.effect) timeline.push({ t: t + s.seconds * effectAt, type: 'effect' });
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

    // 자동이 다음에 할 행동: 구역의 첫째 행동, 마지막 행동이 첫째였으면 둘째(구역 안에서 번갈아). 구역이 없으면 null.
    nextAutoAction() {
      const [first, second] = autoActions();
      if (first === undefined) return null;
      return runner.lastActionId === first && second !== undefined ? second : first;
    },

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
            events.push(e.type === 'step' ? { type: 'step', action: id, index: e.index, step: steps[e.index] } : { type: e.type === 'mark' ? e.name : e.type, action: id });
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
        if (next === null || !canStart(next)) { runner.autoOn = false; sinceDone += left; break; }
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
