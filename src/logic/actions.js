import { INCINERATOR } from '../config.js';
// 구역 행동(소각장: 태우기·파쇄 / 세탁소: 세탁·널기 / 면접장: 면접 보기·돌발행동) 정의와 실행기 (순수). 행동은 여러 단계(클립 재생, 제자리 회전)를 순서대로 하는 한 번짜리 동작이고,
// 실행기는 시간만 보고 단계 시작·단계 안의 표식 순간·효과 순간·끝을 알려 준다(렌더링·상태 변경은 main.js 가 한다).
// 소각장 행동(태우기·파쇄)은 단계를 잘게 쪼갠 긴 동작이다(아래 BURN_PAPER 등). 세탁소 행동은 아래 옛 단계를 그대로 쓴다.
// 단계: 한숨(emote-no, 소각장 행동만. 세탁소 행동은 한숨 없이 바로 주머니부터) -> 재킷 주머니에서 소품(종이·셔츠)을 꺼낸다(pick-up, 60% 에 paperOut) -> 대상 쪽으로 돈다(유일한 회전)
//       -> 던진다/친다/팔을 든다(effect 표식: 효과 순간) -> 후련(emote-yes). 캐릭터는 걷지 않고 제자리에서 돈다.
// 행동의 zone 은 그 행동이 속한 행동 구역(logic/zones.js)의 id 이고, 같은 구역 안에서 key 1 과 2 가 첫째·둘째 행동이다.
// 단계 표식: event/eventAt = 그 단계의 eventAt(0~1) 지점에서 { type: event } 이벤트, effect = 이 단계의 effectAt 지점이 효과 순간.
const SIGH = { kind: 'clip', name: 'emote-no' };
const POCKET_PULL = { kind: 'clip', name: 'pick-up', event: 'paperOut', eventAt: 0.6 };
const RELIEF = { kind: 'clip', name: 'emote-yes' };
const turnTo = (target) => ({ kind: 'turn', target });
const hit = (name) => ({ kind: 'clip', name, effect: true });
// sigh: 맨 앞에 한숨(고개 젓기)을 넣을지. 세탁소(세탁·널기)는 뺀다.
const sequence = (target, effect, sigh = true) => [...(sigh ? [SIGH] : []), POCKET_PULL, turnTo(target), effect, RELIEF].map((step) => ({ ...step }));

// ---- 소각장 단계(태우기·파쇄): 모든 단계에 길이(seconds, 아래 scaleTo 가 목표 시간에 맞춘다)와 phase(main.js 가 단계마다 보여 줄 장면 이름)가 있다 ----
// 클립은 캐릭터 모델의 것(holding-right/both 는 팔을 내민 정지 자세). 표식(marks: [{ at(0~1), name }])은 그 단계 안의 순간 이벤트이고, effect + effectAt 이 스트레스 감소 순간이다.
const POSE = (phase, name, seconds, extra = {}) => ({ kind: 'clip', phase, name, seconds, ...extra });
const TURN = (target) => ({ kind: 'turn', phase: 'turn', target, seconds: 0.4 });
// 공통 도입부: 대상을 돌아본다 -> 재킷 주머니에 손을 넣는다 -> 꺼내 든다 -> 들여다본다 -> 한마디(say 표식에서 말풍선).
const intro = (target) => [
  TURN(target),
  POSE('pocket', 'interact-left', 0.6),
  POSE('pull', 'pick-up', 0.6, { event: 'paperOut', eventAt: 0.9 }),
  POSE('look', 'holding-right', 0.45),
  POSE('mutter', 'holding-right', 1.0, { marks: [{ at: 0, name: 'say' }] }),
];
const BURN_PAPER = [
  ...intro('fire'),
  POSE('crumple', 'holding-both', 0.7), // 두 손으로 구긴다
  POSE('throw', 'attack-melee-right', 0.9, { marks: [{ at: 0.5, name: 'release' }] }), // 팔을 뒤로 뺐다가(준비) 던진다: release 에서 종이가 손을 떠난다
  POSE('fly', 'idle', 0.4, { effect: true, effectAt: 0.98 }), // 포물선으로 날아가 불에 닿는 순간 = 감소·불길
  POSE('watch', 'idle', 0.9), // 타는 걸 지켜본다(만족 끄덕임)
  POSE('relief', 'emote-yes', 0.9),
];
const BURN_AURORA = [
  ...intro('fire'),
  POSE('open', 'holding-both', 0.6), // 가루 주머니 입구를 연다
  POSE('throw', 'attack-melee-right', 0.9, { marks: [{ at: 0.5, name: 'release' }] }),
  POSE('fly', 'idle', 0.45, { effect: true, effectAt: 0.98 }), // 뿌린 가루가 불에 닿는 순간 = 감소·오로라 불꽃
  POSE('watch', 'idle', 1.0),
  POSE('relief', 'emote-yes', 0.9),
];
const SHRED_PAPER = [
  ...intro('shredder'),
  POSE('lift', 'interact-right', 0.5), // 투입구 쪽으로 팔을 든다(걷지 않는다)
  POSE('glide', 'holding-right', 0.6), // 종이가 포물선으로 투입구까지 미끄러져 간다
  POSE('slide', 'holding-right', 0.35), // 투입구로 빨려 들어가며 작아진다
  POSE('grind', 'idle', 1.3, { effect: true, effectAt: 0.2 }), // 파쇄기가 덜덜 떨고 조각이 아래로 쏟아진다 = 감소
  POSE('relief', 'emote-yes', 0.9),
];

// 소각장 단계의 길이를 비율로 늘이고 줄여 총 길이를 target 초로 맞춘다(회전 단계는 그대로).
export function scaleTo(steps, target) {
  const fixed = steps.filter((s) => s.kind === 'turn').reduce((sum, s) => sum + s.seconds, 0);
  const flex = steps.filter((s) => s.kind !== 'turn').reduce((sum, s) => sum + s.seconds, 0);
  const k = flex > 0 ? Math.max(0.1, (target - fixed) / flex) : 1;
  return steps.map((s) => (s.kind === 'turn' ? { ...s } : { ...s, seconds: Math.round(s.seconds * k * 1000) / 1000 }));
}
const T = INCINERATOR.targetSeconds;
export const ACTIONS = {
  burn: { id: 'burn', label: '태우기', key: '1', zone: 'incinerator', target: 'fire', steps: scaleTo(BURN_PAPER, T), variants: { aurora: scaleTo(BURN_AURORA, T) } },
  shred: { id: 'shred', label: '파쇄', key: '2', zone: 'incinerator', target: 'shredder', steps: scaleTo(SHRED_PAPER, T) },
  wash: { id: 'wash', label: '세탁', key: '1', zone: 'laundry', target: 'washer', steps: sequence('washer', hit('attack-melee-right'), false) },
  hang: { id: 'hang', label: '널기', key: '2', zone: 'laundry', target: 'clothesline', steps: sequence('clothesline', hit('interact-right'), false) },
};

// 면접장 행동: 실행기(ACTIONS 의 단계 진행)가 아니라 logic/interview.js 의 대본(시간표)이 장면을 진행한다. 여기서는 행동 막대의 버튼(키·이름·구역)과 사정거리 대상만 정한다.
export const SCENE_ACTIONS = {
  interview: { id: 'interview', label: '면접 보기', key: '1', zone: 'interview', target: 'desk' },
  improv: { id: 'improv', label: '돌발행동', key: '2', zone: 'interview', target: 'desk' },
};
// 행동 막대에 올라가는 모든 행동(실행기 행동 + 장면 행동).
export const ACTION_DEFS = { ...ACTIONS, ...SCENE_ACTIONS };

const EPS = 1e-9;
const MAX_STEPS = 400; // 아주 큰 dt 에서도 무한 반복하지 않게 하는 안전장치
const ORDER = { step: 0, mark: 1, effect: 2, done: 3 }; // 같은 시각일 때 이벤트 순서(mark = 단계 표식 이벤트)

// 클립 길이 맞추기. raw: 클립 이름 -> 원래 길이(초). 행동의 자연 길이(클립 합 + 회전 시간)가 targetSeconds 보다 짧으면
// 그 행동의 던지기/치기(effect) 클립만 늘려 총 길이를 정확히 targetSeconds 로 맞춘다. 더 길면 늘리지 않는다(배속은 항상 1 이하).
// 같은 클립(attack-melee-right)을 쓰는 행동이라도 단계 구성이 다르면(세탁소 행동은 한숨이 없다) 늘려야 할 길이가 달라, 행동별 표를 따로 만든다.
// 돌려주는 값: byAction(행동 id -> { durations: 재생 길이(클립 이름 -> 초), speeds: 재생 배속 timeScale(클립 이름 -> 값) }), 그리고 행동별 표가 없을 때 쓰는 기본(원래 길이, 배속 1) durations/speeds.
export function fitDurations(raw, turnSeconds, targetSeconds) {
  const unit = () => Object.fromEntries(Object.keys(raw).map((name) => [name, 1]));
  const byAction = {};
  for (const action of Object.values(ACTIONS)) {
    const durations = { ...raw };
    const speeds = unit();
    const natural = action.steps.reduce((sum, s) => sum + (s.seconds ?? (s.kind === 'turn' ? turnSeconds : (raw[s.name] ?? 0))), 0);
    const effectStep = action.steps.find((s) => s.effect);
    if (natural < targetSeconds && effectStep && effectStep.seconds === undefined && raw[effectStep.name] > 0) { // 길이가 정해진 단계(소각장)는 늘이지 않는다
      durations[effectStep.name] = raw[effectStep.name] + (targetSeconds - natural);
      speeds[effectStep.name] = raw[effectStep.name] / durations[effectStep.name];
    }
    byAction[action.id] = { durations, speeds };
  }
  return { durations: { ...raw }, speeds: unit(), byAction };
}

// 행동을 할 수 있는가: 대상(소각로/파쇄기/세탁기/빨랫줄/면접 책상)이 사정거리(경계 포함) 안.
// dist: { fire, shredder, washer, clothesline, desk } 플레이어까지의 거리, ranges: 같은 키의 사정거리.
export function canPerform(actionId, dist, ranges) {
  const action = ACTION_DEFS[actionId];
  if (!action) return false;
  return dist[action.target] <= ranges[action.target];
}

// durations: 클립 이름 -> 초. byAction: 행동 id -> { durations }(fitDurations 가 행동마다 늘린 길이, 없는 행동은 durations 를 쓴다). turnSeconds: 회전 단계 하나의 길이(고정).
// effectAt: effect 표식이 붙은 단계(던지기/치기) 길이 중 효과 순간의 비율.
// autoGap: 자동 반복에서 행동이 끝난 뒤 다음 행동을 시작하기까지 쉬는 시간(초).
// canStart(actionId): 자동이 다음 행동을 시작해도 되는지(사정거리 등). false 면 자동이 꺼진다. 수동 start 에는 쓰지 않는다.
// variantFor(actionId): start 가 변형을 못 받았을 때(자동) 쓸 단계 변형 이름(예: 태우기의 'aurora', 모르면 기본 단계). 자동이 시작할 때마다 불리므로 거기서 물건을 고른다.
// autoActions(): 지금 자동이 번갈아 할 구역의 행동 id [첫째, 둘째](호출할 때마다 현재 구역을 돌려준다). 구역이 없으면 [] 이고 자동은 꺼진다.
export function createRunner({
  durations, byAction = {}, turnSeconds = 0, effectAt, autoGap, canStart = () => true, autoActions = () => ['burn', 'shred'], variantFor = () => undefined,
}) {
  // 행동의 단계(초 포함)와 이벤트 시간표를 만든다. 시간표: [{ t, type, index? }] 를 시각 -> 종류 순으로 정렬.
  function plan(id, variant) {
    const list = ACTIONS[id].variants?.[variant] ?? ACTIONS[id].steps;
    const steps = list.map((s) => ({ ...s, seconds: s.seconds ?? (s.kind === 'turn' ? turnSeconds : (byAction[id]?.durations?.[s.name] ?? durations[s.name] ?? 0)) }));
    const timeline = [];
    let t = 0;
    steps.forEach((s, index) => {
      timeline.push({ t, type: 'step', index });
      if (s.event) timeline.push({ t: t + s.seconds * (s.eventAt ?? 1), type: 'mark', name: s.event });
      for (const m of s.marks ?? []) timeline.push({ t: t + s.seconds * m.at, type: 'mark', name: m.name });
      if (s.effect) timeline.push({ t: t + s.seconds * (s.effectAt ?? effectAt), type: 'effect' });
      t += s.seconds;
    });
    timeline.push({ t, type: 'done' });
    timeline.sort((a, b) => a.t - b.t || ORDER[a.type] - ORDER[b.type]);
    return { id, variant, steps, timeline, total: t, next: 0 };
  }

  let current = null; // plan() 결과
  let elapsed = 0;
  let sinceDone = Infinity; // 직전 행동이 끝난 뒤 경과(자동 반복의 쉬는 시간 기준). 끝난 적이 없으면 바로 시작할 수 있다.

  const runner = {
    lastActionId: null,
    autoOn: false,

    // 행동의 단계 목록(초 포함).
    stepsOf: (id, variant) => plan(id, variant).steps,

    // 자동이 다음에 할 행동: 구역의 첫째 행동, 마지막 행동이 첫째였으면 둘째(구역 안에서 번갈아). 구역이 없으면 null.
    nextAutoAction() {
      const [first, second] = autoActions();
      if (first === undefined) return null;
      return runner.lastActionId === first && second !== undefined ? second : first;
    },

    // 한 번에 하나만. 바쁘거나 모르는 id 면 false. 첫 단계 이벤트는 다음 update 에서 나온다.
    start(actionId, variant) { // variant: 단계 변형(소각장 물건 종류). 없으면 variantFor 가 정한다.
      if (current || !ACTIONS[actionId]) return false;
      current = plan(actionId, variant ?? variantFor(actionId));
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
