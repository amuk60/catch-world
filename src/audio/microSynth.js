// 아주 짧은 소리 조각(딱·톡·사박)을 코드로 만드는 작은 도구 모음 (순수: 오디오 장치를 건드리지 않는다). 모닥불 타닥임(fireSynth.js)과 발소리 변형 뱅크(stepSynth.js)가 같이 쓴다.
// 조각 하나 = "아주 짧은 부드러운 충격"(한(Hann) 창으로 둥글린 펄스나 잡음 조각)이 "감쇠하는 공진기"(밴드패스 이극 거르개)를 울리는 소리.
// 공진기의 중심 주파수·Q·충격 길이·세기를 조각마다 다르게 주면 같은 소리가 두 번 나지 않는다.

export const TAU = Math.PI * 2;

// 씨앗 난수(mulberry32): 같은 씨앗이면 같은 소리. 표본 뱅크의 변형마다 다른 씨앗을 쓴다.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const gauss = (rng) => Math.sqrt(-2 * Math.log(1 - rng())) * Math.cos(TAU * rng());
export const range = (rng, [lo, hi]) => lo + (hi - lo) * rng();
export const logRange = (rng, [lo, hi]) => lo * (hi / lo) ** rng(); // 로그 균등: 낮은 쪽과 높은 쪽이 같은 비중
export const peakOfArray = (data) => { let p = 0; for (let i = 0; i < data.length; i++) p = Math.max(p, Math.abs(data[i])); return p; };
export const rmsOfArray = (data) => { let s = 0; for (let i = 0; i < data.length; i++) s += data[i] * data[i]; return data.length ? Math.sqrt(s / data.length) : 0; };

// ---- 거르개 ----
// 이차(Butterworth 풍) 거르개 계수.
export function biquadCoefs(type, freq, sampleRate, q = Math.SQRT1_2) {
  const w = (TAU * Math.min(freq, sampleRate * 0.45)) / sampleRate;
  const cos = Math.cos(w);
  const alpha = Math.sin(w) / (2 * q);
  let b0; let b1; let b2;
  if (type === 'lowpass') { b0 = (1 - cos) / 2; b1 = 1 - cos; b2 = b0; } else { b0 = (1 + cos) / 2; b1 = -(1 + cos); b2 = b0; }
  const a0 = 1 + alpha;
  return { b0: b0 / a0, b1: b1 / a0, b2: b2 / a0, a1: (-2 * cos) / a0, a2: (1 - alpha) / a0 };
}
// 배열을 한 바퀴 돌려 상태를 맞춘 뒤 다시 한 번 돌린 결과를 쓰므로 끝 -> 처음이 이어진다(되풀이 표본용). 한 번만 쓰는 소리에도 같이 쓴다.
export function filterCircular(data, type, freq, sampleRate) {
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

// ---- 조각 ----
// 공진 조각 하나: 길이 exciteMs 의 부드러운 충격(한 창 x (1 - noisy) 규칙적 + noisy 잡음)이 중심 f(Hz)·Q 의 밴드패스 공진기를 울린다.
// 울림이 지수로 줄어드는 시간 상수는 Q/(pi f)(Q 가 높을수록 오래 울린다). 가장 큰 진폭이 amp 가 되도록 맞춰 돌려준다.
export function ringBurst(sampleRate, rng, { f, q, exciteMs = 1, noisy = 0.5, amp = 1 }) {
  const freq = Math.min(f, sampleRate * 0.45);
  const w = (TAU * freq) / sampleRate;
  const alpha = Math.sin(w) / (2 * q);
  const a0 = 1 + alpha;
  const b0 = alpha / a0;
  const a1 = (-2 * Math.cos(w)) / a0;
  const a2 = (1 - alpha) / a0;
  const exLen = Math.max(2, Math.round((exciteMs / 1000) * sampleRate));
  const tau = q / (Math.PI * freq); // 초
  const len = exLen + Math.max(Math.ceil(0.004 * sampleRate), Math.ceil(6 * tau * sampleRate));
  const out = new Float32Array(len);
  let x1 = 0; let x2 = 0; let y1 = 0; let y2 = 0;
  for (let i = 0; i < len; i++) {
    const x = i < exLen ? (0.5 - 0.5 * Math.cos((TAU * (i + 0.5)) / exLen)) * (1 - noisy + noisy * 1.7 * (rng() * 2 - 1)) : 0;
    const y = b0 * (x - x2) - a1 * y1 - a2 * y2; // 영점이 직류·나이퀴스트에 있는 밴드패스
    x2 = x1; x1 = x; y2 = y1; y1 = y;
    out[i] = y;
  }
  const p = peakOfArray(out);
  const k = p > 0 ? amp / p : 0;
  for (let i = 0; i < len; i++) out[i] *= k;
  return out;
}

// piece 를 track 의 start 표본 위치에 더한다. wrap 이면 끝을 넘는 부분이 처음으로 돌아간다(원형), 아니면 넘는 부분은 버린다.
export function addInto(track, piece, start, wrap = false) {
  const n = track.length;
  for (let i = 0; i < piece.length; i++) {
    const j = start + i;
    if (wrap) track[((j % n) + n) % n] += piece[i];
    else if (j >= 0 && j < n) track[j] += piece[i];
  }
}
