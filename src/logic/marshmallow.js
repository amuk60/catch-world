// 마시멜로 굽기 (순수). 굽는 정도(level 0..1)의 진행·구간·결과 분류·게이지·색·멘트와, 한 번의 굽기를 시간순으로 진행하는 상태 기계.
// 렌더링·지수 감소는 main.js 가 한다(여기는 이벤트만 알려 준다).
import { MARSHMALLOW } from '../config.js';

const clamp01 = (v) => Math.min(1, Math.max(0, v));

// 불 위에 든 지 elapsed 초 뒤의 굽기 정도(0..1).
export function toastLevel(elapsed, cfg = MARSHMALLOW) {
  if (!Number.isFinite(elapsed)) return 0;
  return clamp01(elapsed / cfg.toastSeconds);
}

// level 이 속한 구간(stages 중 from 이 level 이하인 마지막 것).
export function stageAt(level, cfg = MARSHMALLOW) {
  let found = cfg.stages[0];
  for (const stage of cfg.stages) if (level >= stage.from) found = stage;
  return found;
}

// 꺼낼 때의 level 로 결과를 가른다: 'under'(덜 익음) | 'perfect'(golden 구간) | 'over'(살짝 탐) | 'burnt'(숯덩이).
export function classify(level, cfg = MARSHMALLOW) {
  if (level >= cfg.burntAt) return 'burnt';
  if (level < cfg.golden[0]) return 'under';
  if (level < cfg.golden[1]) return 'perfect';
  return 'over';
}

// 꺼내지 않아도 자동으로 빼내야 하는가(탄 단계에 닿았다).
export const shouldAutoPull = (level, cfg = MARSHMALLOW) => level >= cfg.burntAt;

// 게이지: 칸은 0(날것)에서 burntAt(탔다)까지다. fill = 채움 비율, goldenFrom/goldenTo = 황금 구간의 비율 위치(모두 0..1).
export function gaugeMap(level, cfg = MARSHMALLOW) {
  return {
    fill: clamp01(level / cfg.burntAt),
    goldenFrom: clamp01(cfg.golden[0] / cfg.burntAt),
    goldenTo: clamp01(cfg.golden[1] / cfg.burntAt),
  };
}

const hexToRgb = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255];
};
// 굽는 정도에 따른 마시멜로 색([r, g, b] 0..1): colors 의 이웃한 두 색을 부드럽게 섞는다.
export function colorAt(level, cfg = MARSHMALLOW) {
  const list = cfg.colors;
  if (level <= list[0][0]) return hexToRgb(list[0][1]);
  for (let i = 1; i < list.length; i++) {
    if (level <= list[i][0]) {
      const [l0, c0] = list[i - 1];
      const [l1, c1] = list[i];
      const k = (level - l0) / (l1 - l0);
      const a = hexToRgb(c0);
      const b = hexToRgb(c1);
      return a.map((v, j) => v + (b[j] - v) * k);
    }
  }
  return hexToRgb(list[list.length - 1][1]);
}

// 모양: puff 는 부푼 정도(1 이 처음, golden 구간 끝 무렵 가장 부푼 뒤 쪼그라든다), sag 는 아래로 처진 정도(0..1, 익은 뒤부터).
export function shapeAt(level, cfg = MARSHMALLOW) {
  const peak = cfg.golden[1];
  const puff = level <= peak ? 1 + 0.22 * (level / peak) : 1.22 - 0.22 * clamp01((level - peak) / (1 - peak));
  const sag = clamp01((level - cfg.golden[0]) / (1 - cfg.golden[0]));
  return { puff, sag };
}

export const resultLine = (result, cfg = MARSHMALLOW) => cfg.results[result] ?? '';
export const stageLine = (stageId, cfg = MARSHMALLOW) => cfg.stages.find((s) => s.id === stageId)?.line ?? '';

// 굽기를 시작할 수 있는가: 소각로 곁 벤치에 앉아 있어야 한다(모드가 앉은 상태이고, 앉은 자리에 묶인 행동 구역이 마시멜로 구역).
export const canRoast = ({ mode, zone }) => mode === 'seated' && zone?.id === 'marshmallow';

// 한 번의 굽기 진행. 단계: take(막대를 꺼냄) -> reach(팔을 뻗어 불 위에 댐) -> toast(굽는 중: 꺼낼 수 있다) -> bring(입으로) -> chew(씹기) -> relief(후련) -> done.
// 취소(cancel)는 take·reach·toast 에서만 되고 phase 가 'cancelled' 가 된다(감소 없음). 꺼내기(pull)는 toast 에서만 된다.
// update(dt) 는 이벤트 배열을 돌려준다: { type: 'phase', phase } | { type: 'stage', id } | { type: 'pulled', result, level, auto } | { type: 'reduce', result } (relief 시작, 한 번만) | { type: 'done', result }.
export function createRoast(cfg = MARSHMALLOW) {
  const order = ['take', 'reach', 'toast', 'bring', 'chew', 'relief'];
  const length = { take: cfg.takeSeconds, reach: cfg.reachSeconds, bring: cfg.eat.bringSeconds, chew: cfg.eat.chewSeconds, relief: cfg.eat.reliefSeconds };
  let phase = 'take';
  let t = 0; // 지금 단계에서 지난 시간
  let stageId = null;
  let result = null;
  let pulledLevel = null;
  const first = [{ type: 'phase', phase: 'take' }];

  function pull(auto, events) {
    pulledLevel = toastLevel(t, cfg);
    result = classify(pulledLevel, cfg);
    events.push({ type: 'pulled', result, level: pulledLevel, auto });
    go('bring', events);
  }
  function go(next, events) {
    phase = next;
    t = 0;
    events.push({ type: 'phase', phase });
    if (phase === 'relief') events.push({ type: 'reduce', result });
  }

  return {
    get phase() { return phase; },
    get result() { return result; },
    get level() { return phase === 'toast' ? toastLevel(t, cfg) : (pulledLevel ?? 0); },
    get active() { return phase !== 'done' && phase !== 'cancelled'; },
    get canCancel() { return phase === 'take' || phase === 'reach' || phase === 'toast'; },
    get canPull() { return phase === 'toast'; },
    // 시작 이벤트(take 단계 진입). 한 번만 부르면 된다.
    start() { return first.map((e) => ({ ...e })); },
    pull() {
      if (phase !== 'toast') return null;
      const events = [];
      pull(false, events);
      return events;
    },
    cancel() {
      if (!this.canCancel) return false;
      phase = 'cancelled';
      return true;
    },
    update(dt) {
      const events = [];
      if (!Number.isFinite(dt) || dt <= 0) return events;
      let left = dt;
      for (let guard = 0; guard < 20 && left > 0 && this.active; guard++) {
        if (phase === 'toast') {
          const toastLeft = cfg.toastSeconds * cfg.burntAt - t; // burntAt 에 닿을 때까지 남은 시간
          const step = Math.min(left, Math.max(0, toastLeft));
          t += step;
          left -= step;
          const stage = stageAt(toastLevel(t, cfg), cfg);
          if (stage.id !== stageId) { stageId = stage.id; events.push({ type: 'stage', id: stage.id }); }
          if (shouldAutoPull(toastLevel(t, cfg) + 1e-9, cfg)) pull(true, events);
          else break;
          continue;
        }
        const room = length[phase] - t;
        if (left < room) { t += left; left = 0; break; }
        left -= room;
        const next = order[order.indexOf(phase) + 1];
        if (phase === 'relief') { phase = 'done'; t = 0; events.push({ type: 'done', result }); break; }
        go(next, events);
        if (next === 'toast') { stageId = stageAt(0, cfg).id; events.push({ type: 'stage', id: stageId }); }
      }
      return events;
    },
  };
}
