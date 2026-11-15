// 모닥불(소각로) 소리 합성 (순수). 편안한 ASMR 모닥불: 한 번 길게 미리 만들어 두고 이어 붙여 되풀이한다(톡톡을 하나씩 예약하지 않는다).
// 구성: (1) 불꽃 숨결 = 아주 낮고 느리게 부푸는 갈색 잡음, (2) 잔 타닥임 = 촘촘하고 불규칙한 아주 작은 알갱이들(군데군데 몰려서 터진다, 부드럽게 거른 따뜻한 대역),
// (3) 가끔 낮고 둥근 "톡"(드물고 조용하며 간격이 제각각). 모든 구성이 길이 안에서 원형(끝 -> 처음이 이어지는)으로 만들어져 이음매가 없다.
// 바꾸려면 FIRE 의 숫자를 고친다(Hz·초·상대 세기).

export const FIRE = {
  seconds: 12, // 되풀이 길이
  rms: 0.1, // 합성 결과의 RMS(전체 크기는 LOOPS.fire.gain 으로)
  softPeak: 4.2, // 마루를 이 배수(RMS 의 몇 배) 근처에서 부드럽게 누른다(파고율 상한을 정한다)
  rumble: { hp: 70, lp: 240, level: 1, share: 0.35, // share: 숨결의 RMS 가 타닥임 RMS 의 몇 배인가
    swayCycles: [[1, 0.3], [3, 0.18]] }, // 숨결: 갈색 잡음을 70~240Hz 로 거르고, 길이 안에서 [정수 번, 깊이] 만큼 부푼다
  crackle: { rate: 2500, clusterRate: 6, clusterSize: [4, 14], clusterGap: 0.014, level: 0.015, tauMs: [1.5, 6], attackMs: 1.4, cutoff: [800, 3000] }, // 잔 타닥임(초당 알갱이 수·무리 수·무리당 개수·알갱이 간격 평균(초)·세기·감쇠(ms)·거른 높이(Hz))
  pop: { rate: 0.17, minGap: 1.4, freq: [110, 210], peak: 1.6, lp: 700, tauMs: [45, 85], attackMs: 4 }, // 가끔 톡(초당 평균 횟수·최소 간격(초)·음높이(Hz)·가장 큰 톡의 최대 진폭(타닥임 RMS 의 몇 배)·거른 높이(Hz)·감쇠(ms)·시작 부드러움(ms))
  filter: { hp: 300, lp: 3400 }, // 타닥임·톡 전체를 거르는 대역(따뜻하게, 높은 쪽은 눌러서 날카롭지 않게)
};

const TAU = Math.PI * 2;
const gauss = (rng) => Math.sqrt(-2 * Math.log(1 - rng())) * Math.cos(TAU * rng());
const range = (rng, [lo, hi]) => lo + (hi - lo) * rng();

// 이중 이차(Butterworth 풍) 거르개. 배열을 한 바퀴 돌려 상태를 맞춘 뒤 다시 한 번 돌린 결과를 쓰므로 끝 -> 처음이 이어진다.
function biquadCoefs(type, freq, sampleRate, q = Math.SQRT1_2) {
  const w = (TAU * freq) / sampleRate;
  const cos = Math.cos(w);
  const alpha = Math.sin(w) / (2 * q);
  let b0; let b1; let b2;
  if (type === 'lowpass') { b0 = (1 - cos) / 2; b1 = 1 - cos; b2 = b0; } else { b0 = (1 + cos) / 2; b1 = -(1 + cos); b2 = b0; }
  const a0 = 1 + alpha;
  return { b0: b0 / a0, b1: b1 / a0, b2: b2 / a0, a1: (-2 * cos) / a0, a2: (1 - alpha) / a0 };
}
function filterCircular(data, type, freq, sampleRate) {
  const c = biquadCoefs(type, freq, sampleRate);
  const out = new Float32Array(data.length);
  let x1 = 0; let x2 = 0; let y1 = 0; let y2 = 0;
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < data.length; i++) {
      const x = data[i];
      const y = c.b0 * x + c.b1 * x1 + c.b2 * x2 - c.a1 * y1 - c.a2 * y2;
      x2 = x1; x1 = x; y2 = y1; y1 = y;
      if (pass === 1) out[i] = y;
    }
  }
  return out;
}
const peakOfArray = (data) => { let p = 0; for (let i = 0; i < data.length; i++) p = Math.max(p, Math.abs(data[i])); return p; };
const rmsOfArray = (data) => { let s = 0; for (let i = 0; i < data.length; i++) s += data[i] * data[i]; return Math.sqrt(s / data.length); };

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

// 알갱이 하나를 track 에 원형으로 더한다: 거른 잡음 x (부드럽게 올라갔다가 지수로 줄어드는 곡선).
function addGrain(track, startIndex, amp, tauSamples, attackSamples, lpCoef, rng) {
  const n = track.length;
  const len = Math.ceil(tauSamples * 6 + attackSamples);
  let lp1 = 0;
  let lp2 = 0;
  for (let i = 0; i < len; i++) {
    const rise = i < attackSamples ? 0.5 - 0.5 * Math.cos((Math.PI * i) / attackSamples) : 1;
    const env = rise * Math.exp(-Math.max(0, i - attackSamples) / tauSamples);
    lp1 += lpCoef * ((rng() * 2 - 1) - lp1); // 한 극 저역 거르개를 두 번: 부드러운 알갱이
    lp2 += lpCoef * (lp1 - lp2);
    track[(startIndex + i) % n] += amp * env * lp2;
  }
}
// 낮고 둥근 톡: 아래로 살짝 미끄러지는 사인 + 어두운 잡음 한 조각.
function addPop(track, startIndex, amp, freq, tauSamples, attackSamples, sampleRate, rng) {
  const n = track.length;
  const len = Math.ceil(tauSamples * 5 + attackSamples);
  let phase = 0;
  let lp = 0;
  for (let i = 0; i < len; i++) {
    const rise = i < attackSamples ? 0.5 - 0.5 * Math.cos((Math.PI * i) / attackSamples) : 1;
    const env = rise * Math.exp(-Math.max(0, i - attackSamples) / tauSamples);
    const f = freq * (1 - 0.25 * (1 - Math.exp(-i / (tauSamples * 0.8))));
    phase += (TAU * f) / sampleRate;
    lp += 0.12 * ((rng() * 2 - 1) - lp);
    track[(startIndex + i) % n] += amp * env * (Math.sin(phase) * 0.8 + lp * 0.9);
  }
}

// 시간 t(초)에서의 "활기"(0.57~0.99): 길이 안에서 정수 번 오르내려 원형이다. 타닥임이 어느 때는 잦고 어느 때는 뜸하다.
function activity(t, seconds, phases) {
  return 0.78 + 0.12 * Math.sin((TAU * 2 * t) / seconds + phases[0]) + 0.09 * Math.sin((TAU * 5 * t) / seconds + phases[1]);
}

// 잔 타닥임 층.
function crackleTrack(n, sampleRate, rng, cfg) {
  const track = new Float32Array(n);
  const seconds = n / sampleRate;
  const phases = [rng() * TAU, rng() * TAU];
  const lpCoef = (hz) => 1 - Math.exp((-TAU * hz) / sampleRate);
  const grain = (t, ampScale = 1) => {
    const amp = cfg.level * ampScale * Math.min(1.8, Math.exp(0.5 * gauss(rng))); // 세기는 제각각이되 한도가 있다(홀로 튀지 않게)
    const tau = (range(rng, cfg.tauMs) / 1000) * sampleRate;
    addGrain(track, Math.floor(t * sampleRate), amp, tau, (cfg.attackMs / 1000) * sampleRate, lpCoef(range(rng, cfg.cutoff)), rng);
  };
  // 흩어진 알갱이: 시간당 rate 개를 활기에 따라 솎아서(thinning) 무작위 시각에 둔다.
  const peakRate = cfg.rate * 1.1;
  for (let t = -Math.log(1 - rng()) / peakRate; t < seconds; t += -Math.log(1 - rng()) / peakRate) {
    if (rng() < (cfg.rate * activity(t, seconds, phases)) / peakRate) grain(t);
  }
  // 무리: 한 번 터지면 잇따라 몇 개가 짧은 간격으로(간격도 들쭉날쭉) 터지고 점점 잦아든다.
  const clusterPeak = cfg.clusterRate * 1.1;
  for (let t = -Math.log(1 - rng()) / clusterPeak; t < seconds; t += -Math.log(1 - rng()) / clusterPeak) {
    if (rng() >= (cfg.clusterRate * activity(t, seconds, phases)) / clusterPeak) continue;
    const count = Math.round(range(rng, cfg.clusterSize));
    let at = t;
    for (let k = 0; k < count; k++) {
      grain(at, 1.1 * (1 - k / (count + 2)));
      at += -Math.log(1 - rng()) * cfg.clusterGap;
    }
  }
  return track;
}

// 가끔 나는 톡 층(간격이 제각각: 최소 간격 + 지수 분포). 톡의 낮은 몸통이 타닥임용 높은 거르개에 깎이지 않도록 따로 만든다.
function popTrack(n, sampleRate, rng, popCfg) {
  const track = new Float32Array(n);
  const seconds = n / sampleRate;
  for (let t = rng() * 2; t < seconds; t += popCfg.minGap + -Math.log(1 - rng()) / popCfg.rate) {
    const amp = 0.6 + 0.8 * rng();
    addPop(track, Math.floor(t * sampleRate), amp, range(rng, popCfg.freq), (range(rng, popCfg.tauMs) / 1000) * sampleRate, (popCfg.attackMs / 1000) * sampleRate, sampleRate, rng);
  }
  return filterCircular(filterCircular(track, 'highpass', 80, sampleRate), 'lowpass', popCfg.lp, sampleRate);
}

// 되풀이용 모닥불 표본 한 벌. 길이 seconds 초, 끝 -> 처음이 이어진다. 반환: Float32Array(RMS 가 cfg.rms).
export function synthFire(sampleRate, rng = Math.random, cfg = FIRE) {
  const n = Math.max(1024, Math.floor(sampleRate * cfg.seconds));
  const rumble = breath(n, sampleRate, rng, cfg.rumble);
  let crackle = crackleTrack(n, sampleRate, rng, cfg.crackle);
  crackle = filterCircular(filterCircular(crackle, 'highpass', cfg.filter.hp, sampleRate), 'lowpass', cfg.filter.lp, sampleRate);
  const out = new Float32Array(n);
  const cr = rmsOfArray(crackle) || 1;
  const pops = popTrack(n, sampleRate, rng, cfg.pop);
  const pp = peakOfArray(pops) || 1;
  for (let i = 0; i < n; i++) out[i] = rumble[i] * cfg.rumble.share + crackle[i] / cr + (pops[i] / pp) * cfg.pop.peak;
  // 드물게 겹쳐 솟는 마루는 부드럽게 눌러(tanh) 홀로 튀지 않게 한다. 그런 다음 RMS 를 맞춘다.
  const r0 = rmsOfArray(out) || 1;
  const knee = cfg.softPeak * r0;
  for (let i = 0; i < n; i++) out[i] = knee * Math.tanh(out[i] / knee);
  const r = rmsOfArray(out);
  const k = r > 0 ? cfg.rms / r : 1;
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
