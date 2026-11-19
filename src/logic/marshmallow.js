// 마시멜로 굽기 (순수). 판마다 다른 굽기 일정(makeRound)과 굽는 정도(level 0..1)의 진행·구간·결과 분류·색·모양·멘트, 그리고 한 번의 굽기를 시간순으로 진행하는 상태 기계.
// 렌더링·카메라·지수 감소는 main.js 가 한다(여기는 이벤트만 알려 준다). 난수는 주입한다(rng: () => 0..1) — 같은 시드면 같은 판이다.
import { MARSHMALLOW } from '../config.js';

const clamp01 = (v) => Math.min(1, Math.max(0, v));
const between = (rng, [lo, hi]) => lo + rng() * (hi - lo);

// ---- 판(round) ----
// 한 판의 일정. 시간(t)은 불에 댄 뒤 지난 실제 초이고, tau 는 "익는 시간"이다(불이 튀는 동안 boost 배로 빨리 흐른다). level = f(tau).
//   perfect/good: [lo, hi] level 구간(good 은 perfect 양옆으로 goodMargin 만큼 넓다). perfectSeconds: 완벽 구간이 실제로 이어지는 시간.
//   knots: [{ tau, level }] 오름차순(앞부분은 속도가 들쭉날쭉하고, 완벽 구간은 한 마디 안에서 일정한 속도, 그 뒤는 postSpeed 배로 탄다). burntTau: level 이 burntAt 에 닿는 tau.
//   flares: [{ at, duration, boost }] 불이 튀는 사건(실제 시간). falseCues: [{ at, duration, kind }] 완벽 구간 전의 가짜 신호('blush' 잠깐 노릇해 보임 | 'steam' 김이 오름).
export function makeRound(rng = Math.random, cfg = MARSHMALLOW) {
  const r = cfg.round;
  const width = between(rng, r.perfectWidth);
  const center = between(rng, r.perfectCenter);
  const perfect = [center - width / 2, center + width / 2];
  const good = [perfect[0] - r.goodMargin, perfect[1] + r.goodMargin];
  const perfectSeconds = between(rng, r.perfectSeconds);
  const pre = between(rng, r.preSeconds);
  const speedPerfect = width / perfectSeconds;

  // 앞부분: 날것(0)에서 완벽 구간 시작까지, 시간 간격을 들쭉날쭉하게(level 은 균등하게) 이어 속도가 마디마다 다르다.
  const knots = [{ tau: 0, level: 0 }];
  for (let i = 1; i < r.knots; i++) knots.push({ tau: pre * (i + (rng() * 2 - 1) * r.jitter) / r.knots, level: perfect[0] * i / r.knots });
  knots.push({ tau: pre, level: perfect[0] });
  knots.push({ tau: pre + perfectSeconds, level: perfect[1] });
  const post = (cfg.burntAt - perfect[1]) / (speedPerfect * r.postSpeed);
  knots.push({ tau: pre + perfectSeconds + post, level: cfg.burntAt });
  const burntTau = knots[knots.length - 1].tau;

  // 불이 튀는 사건: 완벽 구간이 열리기 전에만(구간의 실제 폭이 흔들리지 않게), 전체 길이의 flareEarliest 비율 이후에.
  const flares = [];
  if (rng() < r.flareChance) {
    const duration = between(rng, r.flareSeconds);
    const windowStart = pre - (r.flareBoost - 1) * duration; // 불이 튀면 그만큼 완벽 구간이 일찍 열린다(실제 시간)
    const lo = r.flareEarliest * burntTau;
    const hi = windowStart - 0.3 - duration;
    if (hi > lo) flares.push({ at: lo + rng() * (hi - lo), duration, boost: r.flareBoost });
  }
  // 가짜 신호: 불이 튀는 시간과 겹치지 않게, 완벽 구간이 열리기 1초 전까지.
  const falseCues = [];
  const cueCount = Math.round(between(rng, r.falseCues));
  const cueEnd = (flares.length ? pre - (r.flareBoost - 1) * flares[0].duration : pre) - 1;
  for (let i = 0; i < cueCount * 40 && falseCues.length < cueCount; i++) {
    const duration = between(rng, r.cueSeconds);
    const at = 1 + rng() * Math.max(0, cueEnd - duration - 1);
    const kind = rng() < 0.5 ? 'blush' : 'steam';
    const clash = [...flares, ...falseCues].some((x) => at < x.at + x.duration + 0.4 && x.at < at + duration + 0.4);
    if (!clash && at + duration <= cueEnd) falseCues.push({ at, duration, kind });
  }
  falseCues.sort((a, b) => a.at - b.at);

  return { perfect, good, perfectSeconds, knots, burntTau, flares, falseCues };
}

// 익는 시간 tau 에서의 굽기 정도(0..1, 마디 사이는 직선으로 잇고 burntAt 을 넘지 않는다).
export function toastLevel(tau, round, cfg = MARSHMALLOW) {
  if (!Number.isFinite(tau) || tau <= 0) return 0;
  const { knots } = round;
  for (let i = 1; i < knots.length; i++) {
    if (tau <= knots[i].tau) {
      const a = knots[i - 1];
      const b = knots[i];
      return a.level + (b.level - a.level) * ((tau - a.tau) / (b.tau - a.tau));
    }
  }
  return cfg.burntAt;
}

// 불에 댄 지 t 초(실제) 뒤의 익는 시간. 불이 튀는 동안은 boost 배로 빨리 흐른다.
export function effectiveTime(t, round) {
  if (!Number.isFinite(t) || t <= 0) return 0;
  let tau = t;
  for (const f of round.flares) {
    const overlap = Math.max(0, Math.min(t, f.at + f.duration) - f.at);
    tau += (f.boost - 1) * overlap;
  }
  return tau;
}

// 불이 튀는 정도(0..1): 시작과 끝 0.12초는 부드럽게 오르내린다. 튀는 중이 아니면 0.
export function flareAmount(t, round) {
  let best = 0;
  for (const f of round.flares) {
    if (t < f.at || t > f.at + f.duration) continue;
    best = Math.max(best, Math.min(1, (t - f.at) / 0.12, (f.at + f.duration - t) / 0.12));
  }
  return best;
}

// 가짜 신호의 세기: { blush(노릇해 보이는 정도 0..1), steam(김 0..1) }. 한 번의 신호 동안 종 모양으로 오르내린다.
export function cueAt(t, round) {
  const out = { blush: 0, steam: 0 };
  for (const c of round.falseCues) {
    if (t < c.at || t > c.at + c.duration) continue;
    out[c.kind] = Math.max(out[c.kind], Math.sin(Math.PI * (t - c.at) / c.duration));
  }
  return out;
}

// 한 level 로 결과를 가른다(면별 평균은 classifyRoast): 'under'(덜 익음) | 'good'(완벽 바로 옆) | 'perfect'(좁은 완벽 구간) | 'over'(살짝 탐) | 'burnt'(숯덩이).
export function classify(level, round, cfg = MARSHMALLOW) {
  if (level >= cfg.burntAt) return 'burnt';
  if (level < round.good[0]) return 'under';
  if (level < round.perfect[0]) return 'good';
  if (level < round.perfect[1]) return 'perfect';
  if (level < round.good[1]) return 'good';
  return 'over';
}
export const inGoodBand = (level, round) => level >= round.good[0] && level < round.good[1];

// level 이 속한 구간(stages 중 from 이 level 이하인 마지막 것).
export function stageAt(level, cfg = MARSHMALLOW) {
  let found = cfg.stages[0];
  for (const stage of cfg.stages) if (level >= stage.from) found = stage;
  return found;
}

// 꺼내지 않아도 자동으로 빼내야 하는가(탄 단계에 닿았다).
export const shouldAutoPull = (level, cfg = MARSHMALLOW) => level >= cfg.burntAt;

// 게이지: 가는 시간 줄 하나. 판과 상관없는 고정 길이(gaugeSeconds)에 대한 불 위에 있던 시간의 비율이라 황금 구간을 알려 주지 않는다.
export const gaugeMap = (elapsed, cfg = MARSHMALLOW) => ({ fill: Number.isFinite(elapsed) ? clamp01(elapsed / cfg.gaugeSeconds) : 0 });

// 결과별 지수 감소량.
export const rewardFor = (result, cfg = MARSHMALLOW) => cfg.rewards[result] ?? 0;

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

// 모양: puff 는 부푼 정도(1 이 처음, puffPeak 에서 가장 부푼 뒤 쪼그라든다), sag 는 아래로 처진 정도(0..1, sagFrom 부터).
export function shapeAt(level, cfg = MARSHMALLOW) {
  const peak = cfg.shape.puffPeak;
  const puff = level <= peak ? 1 + 0.22 * (level / peak) : 1.22 - 0.22 * clamp01((level - peak) / (1 - peak));
  const sag = clamp01((level - cfg.shape.sagFrom) / (1 - cfg.shape.sagFrom));
  return { puff, sag };
}

export const resultLine = (result, cfg = MARSHMALLOW) => cfg.results[result] ?? '';
export const stageLine = (stageId, cfg = MARSHMALLOW) => cfg.stages.find((s) => s.id === stageId)?.line ?? '';

// 굽기를 시작할 수 있는가: 소각로 곁 벤치에 앉아 있어야 한다(모드가 앉은 상태이고, 앉은 자리에 묶인 행동 구역이 마시멜로 구역).
export const canRoast = ({ mode, zone }) => mode === 'seated' && zone?.id === 'marshmallow';

// ---- 돌리기·고르게 굽기 ----
// 마시멜로는 cfg.sides 개의 면을 가진다. angle(라디안)은 지금까지 돈 각도이고 side i 는 angle = i * (2π / sides) 일 때 불을 마주 본다.
export const sideStep = (cfg = MARSHMALLOW) => (Math.PI * 2) / cfg.sides;
// 각 면이 받는 열의 비율: 불을 마주 볼수록(cos) 크고, 마주 보지 않아도 ambientRate 만큼은 천천히 익는다. 돌아가는 중에는 두 면이 나눠 받는다.
export function sideWeights(angle, cfg = MARSHMALLOW) {
  const step = sideStep(cfg);
  return Array.from({ length: cfg.sides }, (_, i) => cfg.ambientRate + (1 - cfg.ambientRate) * Math.max(0, Math.cos(angle - i * step)));
}
export const averageLevel = (levels) => levels.reduce((s, v) => s + v, 0) / (levels.length || 1);
// 고르기: 가장 많이 익은 면과 가장 덜 익은 면의 차이(작을수록 고르다).
export const spreadOf = (levels) => (levels.length ? Math.max(...levels) - Math.min(...levels) : 0);
// 꺼낼 때 면별 굽기로 결과를 가른다. 평균 굽기로 classify 하고(숯덩이는 어느 면이든 탄 단계에 닿았을 때), 면 차이가 evenSpread 를 넘으면 "고르게"가 아니다:
//   완벽이 좋음으로 내려가고, 한 면이 unevenAt 이상으로 익었으면 'uneven'(한쪽 탐). 평균이 이미 너무 익었으면('over') 그대로 둔다.
export function classifyRoast(levels, round, cfg = MARSHMALLOW) {
  const level = averageLevel(levels);
  const spread = spreadOf(levels);
  const even = spread <= cfg.evenSpread;
  const max = Math.max(...levels);
  if (max >= cfg.burntAt) return { result: 'burnt', level, spread, even: false };
  const base = classify(level, round, cfg);
  let result = base;
  if (!even && base !== 'over') {
    if (max >= cfg.unevenAt) result = 'uneven';
    else if (base === 'perfect') result = 'good';
  }
  return { result, level, spread, even };
}

// 굽는 중 입력 하나가 무엇을 하는가: input = { type: 'key', code } | { type: 'click' }, phase = 굽기 단계. 'rotate' | 'pull' | 'cancel' | null.
//   굽는 중(toast): 클릭·Space 돌리기, 1·E 꺼내기, Esc 취소. 꺼내 들고 뻗는 중(take·reach): Esc·E 취소. 그 밖에는 아무 일 없다.
export function roastInputAction(input, phase) {
  if (phase === 'toast') {
    if (input.type === 'click') return 'rotate';
    if (input.code === 'Space') return 'rotate';
    if (input.code === 'Digit1' || input.code === 'Numpad1' || input.code === 'KeyE') return 'pull';
    if (input.code === 'Escape') return 'cancel';
    return null;
  }
  if (phase === 'take' || phase === 'reach') return input.type === 'key' && (input.code === 'Escape' || input.code === 'KeyE') ? 'cancel' : null;
  return null;
}
// 굽는 패널의 안내 글.
export const roastHint = (canPull) => (canPull ? '클릭/Space: 돌리기 · 1/E: 꺼내기 · Esc: 취소' : 'Esc: 취소');

// 한 번의 굽기 진행. 단계: take(막대를 꺼냄) -> reach(팔을 뻗어 불 위에 댐) -> toast(굽는 중: 돌리고 꺼낼 수 있다) -> bring(입으로) -> chew(씹기) -> relief(후련) -> done.
// 취소(cancel)는 take·reach·toast 에서만 되고 phase 가 'cancelled' 가 된다(감소 없음). 꺼내기(pull)·돌리기(rotate)는 toast 에서만 된다.
// 굽기는 면마다 따로 익는다(sideTau): 불을 마주 보는 면이 가장 빨리 익고 나머지는 천천히 익는다. 면 하나가 탄 단계에 닿으면 꺼내지 않아도 자동으로 빼낸다.
// update(dt) 는 이벤트 배열을 돌려준다: { type: 'phase', phase } | { type: 'stage', id } | { type: 'flare' } (불이 튀기 시작) | { type: 'pulled', result, level, even, auto }
//   | { type: 'reduce', result, amount } (relief 시작, 한 번만) | { type: 'done', result }. rotate() 는 [{ type: 'rotate', side }] 를 돌려준다.
// 판은 만들 때 rng 로 뽑는다(round 를 직접 줄 수도 있다).
const SUBSTEP = 0.05; // 굽는 열을 쌓는 가장 긴 한 걸음(초): 돌아가는 각도에 따라 열이 달라지므로 잘게 적분한다
const smooth = (x) => x * x * (3 - 2 * x);
export function createRoast(cfg = MARSHMALLOW, rng = Math.random, round = makeRound(rng, cfg)) {
  const order = ['take', 'reach', 'toast', 'bring', 'chew', 'relief'];
  const length = { take: cfg.takeSeconds, reach: cfg.reachSeconds, bring: cfg.eat.bringSeconds, chew: cfg.eat.chewSeconds, relief: cfg.eat.reliefSeconds };
  const step = sideStep(cfg);
  let phase = 'take';
  let t = 0; // 지금 단계에서 지난 시간(toast 에서는 불에 댄 실제 시간)
  const taus = Array(cfg.sides).fill(0); // 면별 익는 시간
  let rotFrom = 0; // 돌기 시작한 각도
  let rotTo = 0; // 목표 각도(돌리기를 누를 때마다 step 씩 늘어난다)
  let rotT = cfg.rotateSeconds; // 돌기 시작한 뒤 지난 시간(rotateSeconds 이상이면 멈춤)
  let stageIndex = -1;
  let flareIndex = 0; // 알린 불 튐 수
  let result = null;
  let pulledSides = null;
  let pulledLevel = null;
  const first = [{ type: 'phase', phase: 'take' }];

  const angleAt = (time) => rotFrom + (rotTo - rotFrom) * smooth(Math.min(1, Math.max(0, time / cfg.rotateSeconds)));
  const levelsNow = () => taus.map((x) => toastLevel(x, round, cfg));

  function pull(auto, events) {
    const levels = levelsNow();
    const c = auto ? { result: 'burnt', level: averageLevel(levels), even: false } : classifyRoast(levels, round, cfg);
    pulledSides = levels;
    pulledLevel = c.level;
    result = c.result;
    events.push({ type: 'pulled', result, level: pulledLevel, even: c.even, auto });
    go('bring', events);
  }
  function go(next, events) {
    phase = next;
    t = 0;
    events.push({ type: 'phase', phase });
    if (phase === 'relief') events.push({ type: 'reduce', result, amount: rewardFor(result, cfg) });
  }
  // 굽는 동안 dt 만큼 진행한다(불이 튀는 경계마다, 그리고 SUBSTEP 마다 끊어 적분). 남은 시간과 탄 단계 도달 여부를 돌려준다.
  function advanceToast(dt, events) {
    let left = dt;
    let burnt = false;
    while (left > 1e-12) {
      let boundary = Infinity;
      for (const f of round.flares) for (const edge of [f.at, f.at + f.duration]) if (edge > t + 1e-12 && edge < boundary) boundary = edge;
      const dtStep = Math.min(left, boundary - t, SUBSTEP);
      const mult = round.flares.reduce((m, f) => (t + dtStep / 2 >= f.at && t + dtStep / 2 <= f.at + f.duration ? f.boost : m), 1);
      const weights = sideWeights(angleAt(rotT + dtStep / 2), cfg);
      const gain = weights.map((w) => dtStep * mult * cfg.sideSpeed * w);
      let frac = 1;
      for (let i = 0; i < taus.length; i++) if (taus[i] + gain[i] >= round.burntTau - 1e-12) frac = Math.min(frac, Math.max(0, (round.burntTau - taus[i]) / gain[i]));
      if (frac < 1) {
        for (let i = 0; i < taus.length; i++) taus[i] = Math.min(round.burntTau, taus[i] + gain[i] * frac);
        for (let i = 0; i < taus.length; i++) if (taus[i] >= round.burntTau - 1e-9) taus[i] = round.burntTau;
        t += dtStep * frac; rotT += dtStep * frac; left -= dtStep * frac; burnt = true;
        break;
      }
      for (let i = 0; i < taus.length; i++) taus[i] += gain[i];
      t += dtStep; rotT += dtStep; left -= dtStep;
    }
    while (flareIndex < round.flares.length && t >= round.flares[flareIndex].at) { events.push({ type: 'flare' }); flareIndex++; }
    const level = Math.max(...levelsNow());
    for (let i = stageIndex + 1; i < cfg.stages.length; i++) {
      if (level + 1e-9 >= cfg.stages[i].from) { stageIndex = i; events.push({ type: 'stage', id: cfg.stages[i].id }); } else break;
    }
    return { left, burnt };
  }

  return {
    round,
    get phase() { return phase; },
    get result() { return result; },
    // 평균 굽기(결과를 가르는 값). 꺼낸 뒤에는 꺼낼 때의 값.
    get level() { return phase === 'toast' ? averageLevel(levelsNow()) : (pulledLevel ?? 0); },
    // 면별 굽기(꺼낸 뒤에는 꺼낼 때의 값).
    get sideLevels() { return phase === 'toast' ? levelsNow() : (pulledSides ?? Array(cfg.sides).fill(0)); },
    get angle() { return angleAt(rotT); }, // 지금까지 돈 각도(라디안, 돌아가는 중에는 중간값)
    get facing() { return ((Math.round(rotTo / step) % cfg.sides) + cfg.sides) % cfg.sides; }, // 불을 마주 볼(보는) 면
    get turning() { return rotT < cfg.rotateSeconds; },
    get turnProgress() { return Math.min(1, rotT / cfg.rotateSeconds); },
    get toastSeconds() { return phase === 'toast' ? t : 0; }, // 불에 댄 실제 시간
    get flare() { return phase === 'toast' ? flareAmount(t, round) : 0; },
    get cue() { return phase === 'toast' ? cueAt(t, round) : { blush: 0, steam: 0 }; },
    get active() { return phase !== 'done' && phase !== 'cancelled'; },
    get canCancel() { return phase === 'take' || phase === 'reach' || phase === 'toast'; },
    get canPull() { return phase === 'toast'; },
    get canRotate() { return phase === 'toast'; },
    // 시작 이벤트(take 단계 진입). 한 번만 부르면 된다.
    start() { return first.map((e) => ({ ...e })); },
    pull() {
      if (phase !== 'toast') return null;
      const events = [];
      pull(false, events);
      return events;
    },
    // 한 면(360/sides 도) 돌린다. 돌아가는 중에 또 누르면 그만큼 더 간다.
    rotate() {
      if (phase !== 'toast') return null;
      rotFrom = angleAt(rotT);
      rotTo += step;
      rotT = 0;
      return [{ type: 'rotate', side: this.facing }];
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
          const res = advanceToast(left, events);
          left = res.left;
          if (res.burnt) { pull(true, events); continue; }
          break;
        }
        const room = length[phase] - t;
        if (left < room) { t += left; left = 0; break; }
        left -= room;
        const next = order[order.indexOf(phase) + 1];
        if (phase === 'relief') { phase = 'done'; t = 0; events.push({ type: 'done', result }); break; }
        go(next, events);
      }
      return events;
    },
  };
}
