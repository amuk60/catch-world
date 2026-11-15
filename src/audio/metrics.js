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
  return { jumpRatio: avg > 0 ? jump / avg : 0, rmsRatio: all > 0 ? rmsOf(around) / all : 0 };
}
