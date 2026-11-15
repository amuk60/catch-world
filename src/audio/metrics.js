// 소리 표본(Float32Array) 측정 도구 (순수). 오프라인 렌더 점검(analyze.js)과 시험이 같이 쓴다. 오디오 장치를 건드리지 않는다.

export function peakOf(data) {
  let p = 0;
  for (let i = 0; i < data.length; i++) p = Math.max(p, Math.abs(data[i]));
  return p;
}
export function rmsOf(data) {
  if (!data.length) return 0;
  let s = 0;
  for (let i = 0; i < data.length; i++) s += data[i] * data[i];
  return Math.sqrt(s / data.length);
}
// 파고율(peak / RMS): 클수록 튀는 소리(톡·탁), 작을수록 고른 소리.
export function crestFactor(data) {
  const r = rmsOf(data);
  return r > 0 ? peakOf(data) / r : 0;
}

// 제자리 radix-2 FFT(길이는 2 의 거듭제곱).
function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang);
    const wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1;
      let ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k;
        const b = a + len / 2;
        const tr = re[b] * cr - im[b] * ci;
        const ti = re[b] * ci + im[b] * cr;
        re[b] = re[a] - tr; im[b] = im[a] - ti;
        re[a] += tr; im[a] += ti;
        const nr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = nr;
      }
    }
  }
}

// 파워 스펙트럼(Welch: 한(Hann) 창 겹침 평균). 돌려주는 값: { power: Float64Array(size/2), binHz }.
export function powerSpectrum(data, sampleRate, size = 4096) {
  const power = new Float64Array(size / 2);
  const re = new Float64Array(size);
  const im = new Float64Array(size);
  const hop = size / 2;
  let frames = 0;
  for (let start = 0; start + size <= data.length || frames === 0; start += hop) {
    for (let i = 0; i < size; i++) {
      const w = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (size - 1));
      re[i] = (data[start + i] ?? 0) * w;
      im[i] = 0;
    }
    fft(re, im);
    for (let k = 0; k < size / 2; k++) power[k] += re[k] * re[k] + im[k] * im[k];
    frames++;
    if (start + size >= data.length) break;
  }
  return { power, binHz: sampleRate / size };
}

// 스펙트럼 무게중심(Hz): 소리가 "밝은가". 낮을수록 따뜻하고 둔탁하다.
export function spectralCentroid(data, sampleRate, size = 4096) {
  const { power, binHz } = powerSpectrum(data, sampleRate, size);
  let num = 0;
  let den = 0;
  for (let k = 1; k < power.length; k++) { num += power[k] * k * binHz; den += power[k]; }
  return den > 0 ? num / den : 0;
}

// 에너지 중 loHz~hiHz 에 있는 비율(0~1).
export function bandShare(data, sampleRate, loHz, hiHz, size = 4096) {
  const { power, binHz } = powerSpectrum(data, sampleRate, size);
  let band = 0;
  let all = 0;
  for (let k = 1; k < power.length; k++) {
    all += power[k];
    const f = k * binHz;
    if (f >= loHz && f < hiHz) band += power[k];
  }
  return all > 0 ? band / all : 0;
}

// 홀로 튀는 소리 점검: windowMs 짧은 창의 최대 진폭을 구하고, 각 창을 둘레(±neighbourMs, 앞뒤 가까운 창은 뺀다) 창들의 평균 최대 진폭과 견준 비율의 최댓값.
// 클수록 "틱" 하고 홀로 튀는 순간이 있다는 뜻이다. loop=true 면 끝과 처음을 이어서(원형) 본다.
export function spikeRatio(data, sampleRate, { windowMs = 5, neighbourMs = 150, gapMs = 10, loop = false } = {}) {
  const win = Math.max(1, Math.round((windowMs / 1000) * sampleRate));
  const count = Math.floor(data.length / win);
  const peaks = new Float64Array(count);
  for (let w = 0; w < count; w++) {
    let p = 0;
    for (let i = w * win; i < (w + 1) * win; i++) p = Math.max(p, Math.abs(data[i]));
    peaks[w] = p;
  }
  const near = Math.round(neighbourMs / windowMs);
  const gap = Math.round(gapMs / windowMs);
  let worst = 0;
  for (let w = 0; w < count; w++) {
    let sum = 0;
    let n = 0;
    for (let d = gap + 1; d <= near; d++) {
      for (const idx of [w - d, w + d]) {
        const j = loop ? ((idx % count) + count) % count : idx;
        if (j < 0 || j >= count) continue;
        sum += peaks[j];
        n++;
      }
    }
    if (n && sum > 0) worst = Math.max(worst, peaks[w] / (sum / n));
  }
  return worst;
}

// 반복 이음매 점검: 끝에서 처음으로 돌아가는 지점의 표본 변화량을 평소(전체 평균 변화량)와 견준 비율, 이음매 둘레 창의 RMS 를 전체 RMS 와 견준 비율.
export function seamCheck(data, sampleRate, { windowMs = 50 } = {}) {
  const n = data.length;
  let avg = 0;
  for (let i = 1; i < n; i++) avg += Math.abs(data[i] - data[i - 1]);
  avg /= n - 1;
  const jump = Math.abs(data[0] - data[n - 1]);
  const win = Math.round((windowMs / 1000) * sampleRate);
  const around = new Float32Array(2 * win);
  for (let i = 0; i < win; i++) { around[i] = data[n - win + i]; around[win + i] = data[i]; }
  const all = rmsOf(data);
  // 이음매 둘레 +-2ms 의 평소 표본 변화량과 견준 점프(드문 타닥임처럼 전체 평균이 아주 작은 소리에서는 이쪽이 정직하다): 1 안팎이면 이음매가 둘레와 같은 결로 이어진 것이다.
  const near = Math.max(4, Math.round(0.002 * sampleRate));
  let local = 0;
  for (let d = 1; d <= near; d++) {
    local += Math.abs(data[n - d] - data[n - d - 1]) + Math.abs(data[d] - data[d - 1]);
  }
  local /= 2 * near;
  return { jumpRatio: avg > 0 ? jump / avg : 0, rmsRatio: all > 0 ? rmsOf(around) / all : 0, localJump: local > 1e-12 ? jump / local : 0 };
}

// ---- 짧은 소리(발소리 한 걸음) 스펙트럼: 한 번 만에 0 으로 채워 FFT(창 없이: 줄어드는 소리라 필요 없다) ----
// 돌려주는 값: { power, size }(주파수 한 칸 = sampleRate / size).
function burstPower(data) {
  let size = 1024;
  while (size < data.length) size <<= 1;
  const re = new Float64Array(size);
  const im = new Float64Array(size);
  for (let i = 0; i < data.length; i++) re[i] = data[i];
  fft(re, im);
  const power = new Float64Array(size / 2);
  for (let k = 0; k < size / 2; k++) power[k] = re[k] * re[k] + im[k] * im[k];
  return { power, size };
}
export function burstCentroid(data, sampleRate) {
  const { power, size } = burstPower(data);
  const binHz = sampleRate / size;
  let num = 0; let den = 0;
  for (let k = 1; k < power.length; k++) { num += power[k] * k * binHz; den += power[k]; }
  return den > 0 ? num / den : 0;
}
// 에너지 중 loHz~hiHz 에 있는 비율(0~1).
export function burstBandShare(data, sampleRate, loHz, hiHz) {
  const { power, size } = burstPower(data);
  const binHz = sampleRate / size;
  let band = 0; let all = 0;
  for (let k = 1; k < power.length; k++) {
    all += power[k];
    const f = k * binHz;
    if (f >= loHz && f < hiHz) band += power[k];
  }
  return all > 0 ? band / all : 0;
}
// 두 표본의 정규화 상호상관 최댓값(시간을 +-maxLag 표본까지 밀어 본다): 1 에 가까우면 거의 같은 파형, 0 에 가까우면 전혀 다르다.
export function maxNormCorr(a, b, maxLag = 200) {
  let ea = 0; let eb = 0;
  for (let i = 0; i < a.length; i++) ea += a[i] * a[i];
  for (let i = 0; i < b.length; i++) eb += b[i] * b[i];
  const norm = Math.sqrt(ea * eb);
  if (!(norm > 0)) return 0;
  let best = 0;
  for (let lag = -maxLag; lag <= maxLag; lag++) {
    let c = 0;
    const from = Math.max(0, -lag);
    const to = Math.min(a.length, b.length - lag);
    for (let i = from; i < to; i++) c += a[i] * b[i + lag];
    best = Math.max(best, Math.abs(c) / norm);
  }
  return best;
}

// ---- 타닥임(모닥불) 점검 ----
function percentile(sorted, p) {
  return sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))] : 0;
}
// 하이패스(2차, 한 방향)로 거른 사본.
function highpassCopy(data, freq, sampleRate) {
  const w = (2 * Math.PI * freq) / sampleRate;
  const cos = Math.cos(w);
  const alpha = Math.sin(w) / (2 * Math.SQRT1_2);
  const a0 = 1 + alpha;
  const b0 = (1 + cos) / 2 / a0; const b1 = -(1 + cos) / a0; const a1 = (-2 * cos) / a0; const a2 = (1 - alpha) / a0;
  const out = new Float32Array(data.length);
  let x1 = 0; let x2 = 0; let y1 = 0; let y2 = 0;
  for (let i = 0; i < data.length; i++) {
    const x = data[i];
    const y = b0 * x + b1 * x1 + b0 * x2 - a1 * y1 - a2 * y2;
    x2 = x1; x1 = x; y2 = y1; y1 = y;
    out[i] = y;
  }
  return out;
}
function blockPeaks(data, size) {
  const count = Math.floor(data.length / size);
  const out = new Float64Array(count);
  for (let b = 0; b < count; b++) { let p = 0; for (let i = b * size; i < (b + 1) * size; i++) p = Math.max(p, Math.abs(data[i])); out[b] = p; }
  return out;
}

// 되풀이 모닥불 표본의 "타닥임" 성격 점검. 돌려주는 값:
//  rate        타닥임 횟수/초: 500Hz 하이패스한 소리의 2ms 최대 포락선이 (99 백분위 - 24dB) 문턱을 넘으며 갑자기(직전 창의 1.6 배) 솟는 곳, 6ms 안의 중복은 한 번.
//  sparsityDb  5ms 창 RMS 의 95 백분위와 중앙값의 차(dB): 클수록 타닥임 사이가 조용하다(치익거림은 작다).
//  centroid    타닥임 부분(솟는 곳에서 16ms, 한 창을 씌워)만 모은 스펙트럼 중심(Hz).   above6k  그 부분의 6kHz 위 에너지 비율(0~1).
//  periodicity 사건 포락선(10ms 최대)의 원형 자기상관을 0.2~3초 박자에서 본 최댓값(0~1): 일정한 박자가 있으면 커진다.
export function crackleStats(data, sampleRate, { hp = 500, thresholdDb = -24, refractoryMs = 6 } = {}) {
  const hpData = highpassCopy(data, hp, sampleRate);
  const blk = Math.max(1, Math.round(0.002 * sampleRate));
  const env = blockPeaks(hpData, blk);
  const thr = percentile([...env].sort((a, b) => a - b), 0.99) * 10 ** (thresholdDb / 20);
  const refr = Math.max(1, Math.round(refractoryMs / 2));
  const onsets = [];
  let last = -1e9;
  for (let i = 1; i < env.length; i++) {
    if (env[i] >= thr && env[i] > 1.6 * env[i - 1] && i - last >= refr) { onsets.push(i); last = i; }
  }
  const seconds = data.length / sampleRate;
  // 희소성
  const win = Math.max(1, Math.round(0.005 * sampleRate));
  const levels = [];
  for (let w = 0; w + win <= data.length; w += win) { let s = 0; for (let i = w; i < w + win; i++) s += data[i] * data[i]; levels.push(Math.sqrt(s / win)); }
  levels.sort((a, b) => a - b);
  const p50 = percentile(levels, 0.5);
  const p95 = percentile(levels, 0.95);
  // 타닥임 부분 스펙트럼
  const segLen = Math.round(0.016 * sampleRate);
  let size = 1024;
  while (size < segLen) size <<= 1;
  const acc = new Float64Array(size / 2);
  const re = new Float64Array(size);
  const im = new Float64Array(size);
  for (const b of onsets) {
    const s0 = Math.max(0, b * blk - Math.round(0.001 * sampleRate));
    re.fill(0); im.fill(0);
    for (let i = 0; i < segLen; i++) re[i] = (data[(s0 + i) % data.length] ?? 0) * (0.5 - 0.5 * Math.cos((2 * Math.PI * (i + 0.5)) / segLen));
    fft(re, im);
    for (let k = 0; k < size / 2; k++) acc[k] += re[k] * re[k] + im[k] * im[k];
  }
  const binHz = sampleRate / size;
  let num = 0; let den = 0; let hi = 0;
  for (let k = 1; k < acc.length; k++) { num += acc[k] * k * binHz; den += acc[k]; if (k * binHz >= 6000) hi += acc[k]; }
  // 박자(원형 자기상관)
  const e10 = blockPeaks(data, Math.max(1, Math.round(0.01 * sampleRate)));
  const mean = e10.reduce((a, b) => a + b, 0) / (e10.length || 1);
  const dev = Array.from(e10, (v) => v - mean);
  const var0 = dev.reduce((a, b) => a + b * b, 0) || 1;
  let periodicity = 0;
  for (let lag = 20; lag <= 300 && lag < dev.length; lag++) {
    let c = 0;
    for (let i = 0; i < dev.length; i++) c += dev[i] * dev[(i + lag) % dev.length];
    periodicity = Math.max(periodicity, c / var0);
  }
  return {
    rate: onsets.length / seconds, events: onsets.length, sparsityDb: p50 > 0 ? 20 * Math.log10(p95 / p50) : 99,
    centroid: den > 0 ? num / den : 0, above6k: den > 0 ? hi / den : 0, periodicity,
  };
}
