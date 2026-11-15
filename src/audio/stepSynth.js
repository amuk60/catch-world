// 발소리 합성 (순수). 바닥 종류(풀·돌·타일)마다 "변형 뱅크"를 미리 만들어 두고, 걸을 때마다 골라 쓴다.
//
// 왜 바꿨나: 이전 발소리는 고정된 대역의 잡음 알갱이 2~4 개였다. 매번 같은 구조라 기계음처럼 들렸다.
// 이번에는 한 걸음을 "뒤꿈치 닿음 -> 발끝 닿음(조금 더 약하고 늦게)"의 여러 미세 사건(70~160ms 에 걸쳐)으로 만든다.
// 미세 사건 하나 = 아주 짧은 둥근 충격이 감쇠하는 공진기를 울리는 소리(microSynth.ringBurst). 공진 주파수·세기·시각·울림 길이가 걸음마다 무작위다.
//  - 풀: 마른 풀잎·흙이 스치는 사박(1.2~5kHz 잡음 조각들 + 아주 작은 낮은 몸통 200~450Hz: 가볍되 얇은 전자음처럼 들리지 않게. "퍽" 소리는 아니다).
//  - 광장 돌: 조금 더 또렷하다: 짧고 부드러운 탭 + 잔 자갈이 눌리는 작은 딱(2~6kHz).
//  - 실내 타일: 가벼운 "톡" 탭 하나(900~2500Hz 가 잠깐 울린다) + 따라오는 희미한 스침.
// 바닥마다 STEP.variants(10) 개를 서로 다른 씨앗으로 만든다(첫 걸음에 한 번, 합쳐 몇 ms). 재생은 audioPolicy.createVariantPicker 가 직전 3 걸음과 겹치지 않게 고른다.
//
// 측정 기준(soundChecks.js checkStepBank, 시험·sounds.html 자동 점검이 같은 숫자를 쓴다)
//  - 변형끼리 파형이 서로 다르다(시간을 +-5ms 밀어 본 정규화 상호상관 최댓값 < 0.5).   - 길이 0.07~0.2초.
//  - 스펙트럼 중심이 바닥별 의도한 대역: 풀 1.2~4.2kHz, 돌 1.0~4.2kHz, 타일 0.9~3.9kHz(씨앗을 400 번 바꿔 본 범위: 풀 2.1~3.8, 돌 1.2~3.2, 타일 1.0~3.7).   - 250Hz 아래 에너지: 돌·타일 < 3%, 풀(작은 몸통) < 12%.
//  - 최대 진폭: 기본 볼륨에서 <= 0.18(변형 뱅크는 STEP.rms 로 맞추고 마루는 STEP.peakMax 로 눌러, 소리 크기 흔들림 +-1.5dB 를 더해도 그 아래).
// 바꾸려면 아래 STEP 과 각 바닥의 숫자(Hz·ms·상대 세기)를 고친다.

import { maxNormCorr } from './metrics.js';
import { mulberry32, gauss, range, logRange, peakOfArray, rmsOfArray, filterCircular, ringBurst, addInto } from './microSynth.js';

export const STEP = {
  variants: 10, // 바닥마다 변형 개수(8~12)
  rms: { grass: 0.015, tile: 0.0105 }, // 변형의 RMS(소리 크기 1 에서): 변형마다 같은 크기로 들리도록 RMS 를 맞춘다(마스터 압축기가 짧은 소리의 마루를 변형마다 다르게 눌러서 마루로 맞추면 들쭉날쭉하다). 마스터 체인을 거치면 약 0.5~0.8 배(짧은 소리일수록 더 눌린다)라 이전 판(체인 통과 후 RMS 0.0115/0.0097/0.0068)보다 풀·타일은 3~6dB, 돌은 2dB 작다
  peakMax: 0.15, // RMS 를 맞춘 뒤 마루가 이만큼을 넘는 변형만 눌러 내린다(+-1.5dB 흔들림을 더해도 0.18 이하)
  maxSeconds: 0.26, // 만드는 길이 상한(뒤는 잘라낸다)
  hp: { grass: 160, tile: 280 }, // 아래를 자르는 높이(Hz)
  lp: 6500,
  maxCorr: 0.6, // 뱅크에 넣을 변형은 이미 있는 변형들과 정규화 상호상관(+-5ms)이 이만큼 미만이어야 한다(넘으면 다시 만든다)
  tries: 12,
};

const ms = (v) => v / 1000;
// 세기 흔들림: 로그정규(작은 것이 조금 더 많다).
const wobble = (rng, mid, sigma = 0.3) => mid * Math.exp(sigma * gauss(rng));

function grass(put, rng) {
  const heel = range(rng, [0, 4]);
  put(heel, { f: range(rng, [220, 450]), q: range(rng, [2.5, 4]), exciteMs: range(rng, [3, 5]), noisy: 0.5, amp: range(rng, [0.08, 0.14]) }); // 아주 작은 낮은 몸통
  put(heel + range(rng, [2, 10]), { f: logRange(rng, [1800, 3800]), q: range(rng, [1.2, 2]), exciteMs: range(rng, [14, 24]), noisy: 1, amp: range(rng, [0.45, 0.6]) }); // 스치는 사박
  const blades = 3 + Math.floor(rng() * 3);
  for (let k = 0; k < blades; k++) put(heel + range(rng, [0, 45]), { f: logRange(rng, [1200, 5000]), q: range(rng, [2, 5]), exciteMs: range(rng, [1, 4]), noisy: 0.8, amp: Math.min(0.6, wobble(rng, 0.32)) }); // 풀잎 하나하나
  const toe = range(rng, [55, 95]);
  put(toe, { f: range(rng, [220, 420]), q: range(rng, [2.5, 4]), exciteMs: range(rng, [3, 5]), noisy: 0.5, amp: range(rng, [0.04, 0.08]) });
  put(toe + range(rng, [0, 8]), { f: logRange(rng, [2000, 4200]), q: range(rng, [1.2, 2]), exciteMs: range(rng, [12, 20]), noisy: 1, amp: range(rng, [0.28, 0.42]) });
  const blades2 = 2 + Math.floor(rng() * 3);
  for (let k = 0; k < blades2; k++) put(toe + range(rng, [0, 40]), { f: logRange(rng, [1200, 5000]), q: range(rng, [2, 5]), exciteMs: range(rng, [1, 4]), noisy: 0.8, amp: Math.min(0.4, wobble(rng, 0.2)) });
}

function tile(put, rng) {
  const heel = range(rng, [0, 3]);
  const f = logRange(rng, [800, 2700]);
  put(heel, { f, q: range(rng, [4, 9]), exciteMs: range(rng, [0.6, 1.4]), noisy: 0.85, amp: range(rng, [0.8, 1]) }); // 가벼운 톡
  put(heel + range(rng, [10, 28]), { f: logRange(rng, [2000, 4000]), q: 1.2, exciteMs: range(rng, [25, 45]), noisy: 1, amp: range(rng, [0.12, 0.18]) }); // 따라오는 희미한 스침
  put(heel + range(rng, [0, 2]), { f: Math.min(4500, f * range(rng, [1.4, 2.2])), q: range(rng, [4, 8]), exciteMs: range(rng, [0.5, 1]), noisy: 0.9, amp: range(rng, [0.25, 0.5]) }); // 위쪽 공진
  const toe = range(rng, [55, 95]);
  put(toe, { f: f * range(rng, [0.8, 1.25]), q: range(rng, [4, 9]), exciteMs: range(rng, [0.8, 1.6]), noisy: 0.85, amp: range(rng, [0.3, 0.5]) });
  put(toe + range(rng, [6, 20]), { f: logRange(rng, [2000, 4000]), q: 1.2, exciteMs: range(rng, [20, 35]), noisy: 1, amp: range(rng, [0.06, 0.1]) });
}

const BUILDERS = { grass, tile };

// 걸음 한 번. 반환: Float32Array(RMS 가 STEP.rms[surface](마루가 STEP.peakMax 를 넘으면 그 아래로), 길이 0.07~0.2 초).
export function synthStep(surface, sampleRate, rng = Math.random) {
  const build = BUILDERS[surface] ?? BUILDERS.grass;
  const n = Math.floor(sampleRate * STEP.maxSeconds);
  let track = new Float32Array(n);
  build((atMs, spec) => addInto(track, ringBurst(sampleRate, rng, spec), Math.round(ms(atMs) * sampleRate)), rng);
  const hp = STEP.hp[surface] ?? STEP.hp.grass;
  track = filterCircular(filterCircular(track, 'highpass', hp, sampleRate), 'lowpass', STEP.lp, sampleRate);
  const peak = peakOfArray(track) || 1;
  let end = n - 1;
  while (end > 0 && Math.abs(track[end]) < peak * 0.02) end--;
  const fade = Math.round(ms(4) * sampleRate);
  const len = Math.min(n, Math.max(Math.round(0.07 * sampleRate), end + 1 + fade));
  const out = new Float32Array(len);
  const r = rmsOfArray(track.subarray(0, end + 1)) || 1; // 소리가 있는 구간의 RMS
  const k = Math.min((STEP.rms[surface] ?? STEP.rms.grass) / r, STEP.peakMax / peak);
  for (let i = 0; i < len; i++) out[i] = track[i] * k * (i > len - fade ? (len - i) / fade : 1);
  return out;
}

// 바닥별 변형 뱅크: 서로 다른 씨앗으로 만든 STEP.variants 개. (surface, sampleRate)마다 한 번만 만든다.
const banks = new Map();
export function stepBank(surface, sampleRate, rng = Math.random) {
  const key = `${surface}:${sampleRate}`;
  let bank = banks.get(key);
  if (!bank) {
    bank = [];
    const lag = Math.round(0.005 * sampleRate);
    while (bank.length < STEP.variants) {
      let best = null;
      let bestScore = Infinity;
      for (let t = 0; t < STEP.tries; t++) { // 이미 있는 변형과 너무 닮았으면 다시 만든다
        const cand = synthStep(surface, sampleRate, mulberry32(Math.floor(rng() * 4294967296)));
        const score = bank.reduce((m, b) => Math.max(m, maxNormCorr(cand, b, lag)), 0);
        if (score < bestScore) { best = cand; bestScore = score; }
        if (score < STEP.maxCorr) break;
      }
      bank.push(best);
    }
    banks.set(key, bank);
  }
  return bank;
}
export const STEP_SURFACES = ['grass', 'tile'];
