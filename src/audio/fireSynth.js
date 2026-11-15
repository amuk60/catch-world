// 모닥불(소각로) 소리 합성 (순수). 편안한 ASMR 모닥불: 한 번 길게 미리 만들어 두고 이어 붙여 되풀이한다(톡톡을 하나씩 예약하지 않는다).
//
// 왜 바꿨나: 알갱이를 초당 2500 개씩 뿌리던 이전 판은 알갱이들이 서로 녹아 붙어 끊김 없는 넓은 대역 잡음("지지직" 치익거림)이 되었다.
// 그 반대로 드문 톡을 일정하게 놓았던 첫 판은 "틱톡틱톡" 이질감이었다. 그래서 이번에는 "하나하나 또렷이 들리되 간격이 제각각인" 타닥임으로 만든다.
//
// 구성
//  (1) 불꽃 숨결: 70~240Hz 갈색 잡음, 느리게 부푼다. 아주 작게만 깐다 -> 타닥임 사이의 정적이 "불의 정적"으로 들린다(잡음 바닥이 아니다).
//  (2) 타닥임 사건: 길이 0.3~2ms 의 둥근 충격이 감쇠하는 공진기(중심 900~3200Hz, Q 5~12)를 울린다. 소리가 사건마다 다르다(중심·Q·충격 길이·세기·잡음 정도).
//      센 사건은 낮은 "나무 몸통" 공진(250~600Hz)과 높은 공진이 같이 울린다. 세기는 로그정규(작은 것이 많고 큰 것은 드물다).
//      시각은 "무리 + 정적" 과정: 무리(2~8 개가 20~150ms 안에 잇따라) -> 0.2~2.5초 정적 -> 다음 무리. 정적의 길이는 느리게 오르내리는 활기에 따라 늘고 준다.
//      3~8초마다 한 번은 또렷하게 큰 "타닥"(뒤따르는 잔 타닥임 몇 개와 함께), 가끔 낮고 둥근 "톡", 아주 드물고 작은 불씨 "틱".
//  (3) 전체를 150~200Hz 아래(숨결이 낮은 쪽을 맡는다)와 5kHz 위(따뜻하게)로 거른다.
// 모든 구성이 길이 안에서 원형으로(끝 -> 처음이 이어지게) 만들어져 이음매가 없다(사건의 꼬리는 처음으로 돌아가고 거르개는 원형이다).
//
// 측정 기준(metrics.js crackleStats, soundChecks.js checkFire, 시험·sounds.html 자동 점검이 같은 숫자를 쓴다)
//  - 파고율(최대/RMS) 12~80(이전 촘촘한 판은 3.9, 이 판은 씨앗마다 35~60). 최대 진폭 x LOOPS.fire.gain <= 0.35(실제 0.2). 출력 RMS 0.003~0.0325(이전 판 0.0325, 이 판 약 0.0045). 실제 마스터 체인(브라우저 압축기)을 거치면 최대 진폭이 약 1.25 배(0.25)가 된다.
//  - 희소성: 5ms 창 RMS 의 중앙값이 95 백분위보다 15dB 이상 낮다(사건 사이는 정말 조용하다. 실제 약 17~21dB).
//  - 타닥임 횟수(500Hz 이상 포락선이 99 백분위 -24dB 문턱을 갑자기 넘는 곳): 초당 4~14 번(실제 약 8). 사건 부분의 스펙트럼 중심 1.0~2.2kHz(실제 약 1.3), 6kHz 위 에너지 < 2%.
//  - 박자 없음: 사건 포락선 자기상관의 0.2~3초 박자 봉우리 < 0.3. 이음매 점프·크기 이상 없음.
// 바꾸려면 FIRE 의 숫자를 고친다(Hz·초·상대 세기: 1 = 가장 큰 타닥).

import { TAU, mulberry32, gauss, range, logRange, rmsOfArray, peakOfArray, filterCircular, ringBurst, addInto } from './microSynth.js';

export const FIRE = {
  seconds: 16, // 되풀이 길이(길수록 되풀이가 덜 들린다)
  peak: 0.8, // 합성 결과에서 가장 큰 타닥의 최대 진폭(전체 크기는 LOOPS.fire.gain 으로: 출력 최대 = 이 값 x gain). 타닥임은 드물고 뾰족해(파고율 30 안팎) RMS 가 아니라 최대 진폭을 맞춘다: 출력 RMS 는 약 0.0045(이전 판 0.0325)
  rumble: { hp: 70, lp: 240, level: 1, share: 0.15, // share: 숨결의 RMS 가 타닥임 RMS 의 몇 배인가
    swayCycles: [[1, 0.3], [3, 0.18]] }, // 숨결: 갈색 잡음을 70~240Hz 로 거르고, 길이 안에서 [정수 번, 깊이] 만큼 부푼다
  cluster: {
    gapMin: 0.2, gapMean: 0.12, gapMax: 2.5, // 무리 사이 정적(초): 최소 + 지수 분포(평균 gapMean), 활기가 높으면 짧아진다
    size: [2, 8], sizeBias: 1.8, // 무리당 개수(작은 무리가 더 흔하다: 값이 클수록 쏠림)
    spanMs: [20, 150], // 무리 안에서 잇따라 터지는 시간 폭
    activity: [[3, 0.3], [7, 0.15]], // 정적 길이가 길이 안에서 [정수 번, 깊이] 만큼 늘고 준다
  },
  amp: { median: 0.22, sigma: 0.65, max: 0.5 }, // 타닥임 세기: 로그정규(1 = 가장 큰 타닥)
  crackle: { freq: [900, 3200], q: [5, 12], exciteMs: [0.3, 2], noisy: [0.3, 0.8], bodyFreq: [250, 600], bodyQ: [5, 9], bodyAbove: 0.5, bodyShare: [0.12, 0.25], upperChance: 0.25 },
  loud: { gap: [3, 8], amp: [0.8, 1], followers: [1, 4], followSpanMs: [20, 120], freq: [900, 2200], q: [5, 9], exciteMs: [1, 2] }, // 또렷한 큰 타닥
  pop: { chance: 0.05, freq: [250, 600], q: [3, 6], exciteMs: [2, 4], amp: [0.1, 0.25] }, // 낮고 둥근 톡(무리의 한 알이 되어 터진다)
  tick: { rate: 0.4, freq: [2000, 3500], q: [6, 9], amp: [0.03, 0.08] }, // 아주 작은 불씨 틱(초당 평균 횟수, 완전히 불규칙)
  filter: { hp: 160, lp: 4800 }, // 타닥임 전체를 거르는 대역
};

// 불꽃 숨결: 새는 적분(갈색 잡음) -> 70~240Hz -> 길이 안에서 정수 번 부푸는 느린 흔들림.
function breath(n, sampleRate, rng, cfg) {
  const white = new Float32Array(n);
  for (let i = 0; i < n; i++) white[i] = rng() * 2 - 1;
  const brown = new Float32Array(n);
  let last = 0;
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < n; i++) {
      last = (last + 0.02 * white[i]) / 1.02;
      if (pass === 1) brown[i] = last;
    }
  }
  const band = filterCircular(filterCircular(brown, 'highpass', cfg.hp, sampleRate), 'lowpass', cfg.lp, sampleRate);
  const phases = cfg.swayCycles.map(() => rng() * TAU);
  for (let i = 0; i < n; i++) {
    let m = 1;
    cfg.swayCycles.forEach(([cycles, depth], k) => { m += depth * Math.sin((TAU * cycles * i) / n + phases[k]); });
    band[i] *= Math.max(0.2, m);
  }
  const r = rmsOfArray(band);
  if (r > 0) for (let i = 0; i < n; i++) band[i] = (band[i] / r) * cfg.level;
  return band;
}

// 타닥임 하나를 track 에 더한다(원형). amp: 가장 큰 진폭(1 = 가장 큰 타닥).
function addCrackle(track, at, amp, sampleRate, rng, cfg, { loud = false } = {}) {
  const c = cfg.crackle;
  const f = loud ? logRange(rng, cfg.loud.freq) : logRange(rng, c.freq);
  const q = loud ? range(rng, cfg.loud.q) : range(rng, c.q);
  const exciteMs = loud ? range(rng, cfg.loud.exciteMs) : range(rng, c.exciteMs);
  const start = Math.floor(at * sampleRate);
  addInto(track, ringBurst(sampleRate, rng, { f, q, exciteMs, noisy: range(rng, c.noisy), amp }), start, true);
  if (loud || amp > c.bodyAbove) { // 센 사건: 낮은 나무 몸통 울림이 같이
    addInto(track, ringBurst(sampleRate, rng, { f: logRange(rng, c.bodyFreq), q: range(rng, c.bodyQ), exciteMs: Math.max(exciteMs, 1), noisy: 0.3, amp: amp * range(rng, c.bodyShare) }), start, true);
  }
  if (rng() < c.upperChance) { // 가끔 위쪽 공진이 하나 더(소리가 사건마다 달라진다)
    addInto(track, ringBurst(sampleRate, rng, { f: Math.min(4200, f * range(rng, [1.3, 1.9])), q: range(rng, c.q), exciteMs: exciteMs * 0.7, noisy: 0.6, amp: amp * range(rng, [0.3, 0.6]) }), start, true);
  }
}
// 낮고 둥근 톡: 부드럽게 시작하는(2~4ms) 충격이 낮은 공진기를 울린다.
function addPop(track, at, sampleRate, rng, cfg) {
  const p = cfg.pop;
  addInto(track, ringBurst(sampleRate, rng, { f: logRange(rng, p.freq), q: range(rng, p.q), exciteMs: range(rng, p.exciteMs), noisy: 0.25, amp: range(rng, p.amp) }), Math.floor(at * sampleRate), true);
}

// 타닥임 층 전체(아직 거르기 전).
function crackleTrack(n, sampleRate, rng, cfg) {
  const track = new Float32Array(n);
  const seconds = n / sampleRate;
  const cl = cfg.cluster;
  const phases = cl.activity.map(() => rng() * TAU);
  const activity = (t) => cl.activity.reduce((m, [cycles, depth], k) => m + depth * Math.sin((TAU * cycles * t) / seconds + phases[k]), 1);
  const amp = () => Math.min(cfg.amp.max, cfg.amp.median * Math.exp(cfg.amp.sigma * gauss(rng)));

  // 무리 -> 정적 -> 무리 ...
  for (let t = rng() * 0.4; t < seconds;) {
    const size = cl.size[0] + Math.floor((cl.size[1] - cl.size[0] + 1) * rng() ** cl.sizeBias);
    const span = (logRange(rng, cl.spanMs)) / 1000;
    const offsets = Array.from({ length: size }, (_, k) => (k === 0 ? 0 : rng() * span)).sort((a, b) => a - b);
    offsets.forEach((off, k) => {
      if (rng() < cfg.pop.chance) addPop(track, t + off, sampleRate, rng, cfg);
      else addCrackle(track, t + off, amp() * (1 - 0.4 * (k / size)), sampleRate, rng, cfg);
    });
    const gap = cl.gapMin + (-Math.log(1 - rng()) * cl.gapMean) / Math.max(0.4, activity(t));
    t += span + Math.min(cl.gapMax, gap);
  }
  // 3~8 초마다 또렷한 큰 타닥(+ 뒤따르는 잔 타닥임)
  for (let t = 0.5 + rng() * 3; t < seconds; t += range(rng, cfg.loud.gap)) {
    addCrackle(track, t, range(rng, cfg.loud.amp), sampleRate, rng, cfg, { loud: true });
    const followers = Math.round(range(rng, cfg.loud.followers));
    for (let k = 0; k < followers; k++) addCrackle(track, t + (range(rng, cfg.loud.followSpanMs) * (k + 1)) / (followers * 1000), amp() * 0.7, sampleRate, rng, cfg);
  }
  // 아주 작은 불씨 틱: 완전히 불규칙(푸아송)
  for (let t = -Math.log(1 - rng()) / cfg.tick.rate; t < seconds; t += -Math.log(1 - rng()) / cfg.tick.rate) {
    addInto(track, ringBurst(sampleRate, rng, { f: logRange(rng, cfg.tick.freq), q: range(rng, cfg.tick.q), exciteMs: 0.4, noisy: 0.5, amp: range(rng, cfg.tick.amp) }), Math.floor(t * sampleRate), true);
  }
  return track;
}

// 되풀이용 모닥불 표본 한 벌. 길이 seconds 초, 끝 -> 처음이 이어진다. 반환: Float32Array(최대 진폭이 cfg.peak).
export function synthFire(sampleRate, rng = Math.random, cfg = FIRE) {
  const n = Math.max(1024, Math.floor(sampleRate * cfg.seconds));
  const rumble = breath(n, sampleRate, rng, cfg.rumble);
  let events = crackleTrack(n, sampleRate, rng, cfg);
  events = filterCircular(filterCircular(events, 'highpass', cfg.filter.hp, sampleRate), 'highpass', cfg.filter.hp, sampleRate);
  events = filterCircular(filterCircular(events, 'lowpass', cfg.filter.lp, sampleRate), 'lowpass', cfg.filter.lp, sampleRate);
  const er = rmsOfArray(events) || 1;
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = rumble[i] * cfg.rumble.share * er + events[i];
  const p = peakOfArray(out);
  const k = p > 0 ? cfg.peak / p : 1;
  for (let i = 0; i < n; i++) out[i] *= k;
  return out;
}

// 샘플레이트별로 한 번만 만들어 쓴다(게임 안에서 모닥불 소리를 처음 켤 때).
const cache = new Map();
export function fireSamples(sampleRate, rng = Math.random) {
  let data = cache.get(sampleRate);
  if (!data) {
    data = synthFire(sampleRate, rng);
    cache.set(sampleRate, data);
  }
  return data;
}

// 점검용: 씨앗으로 만든 표본(같은 씨앗이면 같다).
export const synthFireSeeded = (sampleRate, seed, cfg = FIRE) => synthFire(sampleRate, mulberry32(seed), cfg);
