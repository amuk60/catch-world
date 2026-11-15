// 모닥불 되풀이 표본과 발소리 변형 뱅크의 "성격" 점검 (순수). 시험(test/)과 사운드 시험 페이지(sounds.html 자동 점검)가 같은 기준을 쓴다.
// 점검 항목마다 { label, text(사람이 읽는 값), ok } 를 돌려준다. 기준을 바꾸려면 아래 ACCEPT 상수를 고친다.
import { crackleStats, crestFactor, peakOf, rmsOf, seamCheck, burstCentroid, burstBandShare, maxNormCorr } from './metrics.js';

export const FIRE_ACCEPT = {
  crest: [12, 80], // 최대/RMS: 이전 촘촘한 판(약 4)보다 한참 높다(= 드문 또렷한 타닥임). 너무 높으면(홀로 튀면) 거슬린다
  peakOut: 0.35, // 최대 진폭 x 반복음 gain(마스터 앞)
  rmsOut: [0.003, 0.0325], // 출력 RMS: 이전 판(0.0325)을 넘지 않고, 너무 희미하지도 않다
  sparsityDb: 15, // 5ms 창 RMS 의 95 백분위 - 중앙값(dB) 이상
  rate: [4, 14], // 타닥임 횟수/초
  centroid: [1000, 2200], // 타닥임 부분 스펙트럼 중심(Hz)
  above6k: 0.02, // 타닥임 부분 6kHz 위 에너지 비율 상한
  periodicity: 0.3, // 사건 포락선 자기상관(0.2~3초 박자)의 봉우리 상한
  seamJump: 4, // 끝 -> 처음 표본 변화량 / 이음매 둘레(+-2ms)의 평소 표본 변화량 상한
};

export const STEP_ACCEPT = {
  corrMax: 0.7, // 변형끼리 정규화 상호상관(+-5ms 밀어 본 최댓값)의 상한(뱅크는 보통 0.6 미만으로 뽑는다)
  corrMean: 0.4, // 평균 상한
  seconds: [0.07, 0.2],
  centroid: { grass: [1200, 4200], stone: [1000, 4200], tile: [900, 3900] }, // 바닥별 의도한 대역(Hz)
  low250: { grass: 0.12, stone: 0.03, tile: 0.03 }, // 250Hz 아래 에너지 비율 상한(풀은 작은 몸통 허용)
  peakDefault: 0.18, // 기본 볼륨에서 최대 진폭 상한(소리 크기 흔들림 포함)
};

const item = (label, text, ok) => ({ label, text, ok: Boolean(ok) });
const inRange = (v, [lo, hi]) => v >= lo && v <= hi;

// data: 합성 직후 표본(모닥불 한 바퀴), gain: LOOPS.fire.gain, jitter: 소리 크기 흔들림 상한 없음(반복음).
export function checkFire(data, sampleRate, gain = 1, accept = FIRE_ACCEPT) {
  const st = crackleStats(data, sampleRate);
  const seam = seamCheck(data, sampleRate);
  const crest = crestFactor(data);
  const peakOut = peakOf(data) * gain;
  const rmsOut = rmsOf(data) * gain;
  const items = [
    item('파고율', crest.toFixed(1), inRange(crest, accept.crest)),
    item('최대 진폭(출력)', peakOut.toFixed(3), peakOut <= accept.peakOut),
    item('RMS(출력)', rmsOut.toFixed(4), inRange(rmsOut, accept.rmsOut)),
    item('희소성(95%-중앙값 dB)', st.sparsityDb.toFixed(1), st.sparsityDb >= accept.sparsityDb),
    item('타닥임 횟수(/초)', st.rate.toFixed(1), inRange(st.rate, accept.rate)),
    item('타닥임 중심(Hz)', String(Math.round(st.centroid)), inRange(st.centroid, accept.centroid)),
    item('6kHz 위(%)', (st.above6k * 100).toFixed(2), st.above6k < accept.above6k),
    item('박자 흔적(자기상관)', st.periodicity.toFixed(2), st.periodicity < accept.periodicity),
    item('이음매 점프(둘레 대비)', seam.localJump.toFixed(1), seam.localJump <= accept.seamJump),
  ];
  return { items, ok: items.every((i) => i.ok), stats: { ...st, crest, peakOut, rmsOut, seamJump: seam.localJump } };
}

// bank: Float32Array[](변형들), gain: 레시피 gain, jitterGain: 소리 크기 흔들림 상한(비율, 0.17 = +1.5dB).
export function checkStepBank(surface, bank, sampleRate, { gain = 1, jitterGain = 0.17 } = {}, accept = STEP_ACCEPT) {
  const lag = Math.round(0.005 * sampleRate);
  let corrMax = 0; let corrSum = 0; let pairs = 0;
  for (let i = 0; i < bank.length; i++) {
    for (let j = i + 1; j < bank.length; j++) {
      const c = maxNormCorr(bank[i], bank[j], lag);
      corrMax = Math.max(corrMax, c); corrSum += c; pairs++;
    }
  }
  const secs = bank.map((b) => b.length / sampleRate);
  const cens = bank.map((b) => burstCentroid(b, sampleRate));
  const lows = bank.map((b) => burstBandShare(b, sampleRate, 0, 250));
  const peak = Math.max(...bank.map(peakOf)) * gain * (1 + jitterGain);
  const rms = bank.reduce((a, b) => a + rmsOf(b), 0) / bank.length;
  const lo = (a) => Math.min(...a);
  const hi = (a) => Math.max(...a);
  const items = [
    item('변형 수', String(bank.length), bank.length >= 8 && bank.length <= 12),
    item('변형 상관(최대/평균)', `${corrMax.toFixed(2)} / ${(pairs ? corrSum / pairs : 0).toFixed(2)}`, corrMax < accept.corrMax && (pairs ? corrSum / pairs : 0) < accept.corrMean),
    item('길이(초)', `${lo(secs).toFixed(3)}~${hi(secs).toFixed(3)}`, lo(secs) >= accept.seconds[0] && hi(secs) <= accept.seconds[1]),
    item('중심(Hz)', `${Math.round(lo(cens))}~${Math.round(hi(cens))}`, lo(cens) >= accept.centroid[surface][0] && hi(cens) <= accept.centroid[surface][1]),
    item('250Hz↓(%)', `${(hi(lows) * 100).toFixed(1)}`, hi(lows) < accept.low250[surface]),
    item('최대(기본 볼륨)', peak.toFixed(3), peak <= accept.peakDefault),
  ];
  return { items, ok: items.every((i) => i.ok), stats: { corrMax, secondsRange: [lo(secs), hi(secs)], centroidRange: [lo(cens), hi(cens)], low250Max: hi(lows), peak, rms } };
}
