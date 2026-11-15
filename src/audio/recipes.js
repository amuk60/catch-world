// 효과음 합성 레시피(Web Audio 로 코드에서 직접 만든다: 소리 파일·외부 에셋 없음). 레시피 하나 = 소리 하나.
// 레시피는 (env, o) 를 받아 예약만 하고 소리 길이(초)를 돌려준다. env: { ctx, out(연결할 곳), t(시작 시각), noise(잡음 버퍼 묶음), rng, rate(음높이 배율) }, o: 부른 쪽의 옵션({ voice, syllables ... }).
// 실제 컨텍스트·OfflineAudioContext·시험용 가짜 컨텍스트 어디서든 같은 코드가 돈다(오프라인 렌더로 소리가 무음이거나 터지지 않는지 시험한다).
// 소리를 고치려면 아래 이름 붙은 상수와 각 레시피 안의 숫자(주파수 Hz·길이 초·세기)를 바꾼다. 세기는 레시피 안에서는 대략 0.1~0.5(최대 1 아래)로 두고, 소리 전체 크기는 RECIPES 의 gain 으로 조절한다.

// ---- 자주 쓰는 값 ----
const FLOOR = 0.0001; // 지수 곡선이 닿는 바닥(0 은 지수 곡선에 쓸 수 없다)
const NOTE = { // 음 높이(Hz)
  G4: 392, A4: 440, C5: 523.25, E5: 659.25, G5: 783.99, B5: 987.77, C6: 1046.5, D6: 1174.66, E6: 1318.5, Fs6: 1479.98, G6: 1567.98, A6: 1760, C7: 2093, D7: 2349.3,
};
// 말소리(웅얼거림) 목소리: base 음높이, wave 파형, lowpass 거르는 높이, gain 세기, 음절 길이.
const VOICE = {
  leader: { base: 112, wave: 'sawtooth', lowpass: 800, gain: 0.2, syl: 0.1 }, // 팀장: 낮고 묵직
  hr: { base: 330, wave: 'triangle', lowpass: 2600, gain: 0.26, syl: 0.085 }, // 인사담당: 높고 상냥
  mentor: { base: 205, wave: 'triangle', lowpass: 1500, gain: 0.26, syl: 0.095 }, // 예비 사수: 따뜻한 중간음
  player: { base: 262, wave: 'square', lowpass: 1900, gain: 0.13, syl: 0.085 }, // 나: 밝고 또렷
  remote: { base: 235, wave: 'triangle', lowpass: 1800, gain: 0.2, syl: 0.09 }, // 다른 방문자(높이는 방문자마다 rate 로)
};
const SYLLABLE_STEPS = [-3, -1, 0, 2, 4, 7]; // 음절마다 무작위로 고르는 반음 차이

// ---- 도구 ----
// 소리 크기 곡선: 바닥 -> peak(attack 초 동안 직선) -> 바닥(dur 에 닿도록 지수로 줄어듦).
function shape(param, t, peak, attack, dur) {
  const rise = Math.max(0.001, attack);
  param.setValueAtTime(FLOOR, t);
  param.linearRampToValueAtTime(Math.max(FLOOR, peak), t + rise);
  param.exponentialRampToValueAtTime(FLOOR, t + Math.max(dur, rise + 0.01));
}

// 거르개 하나 이상을 지나 out 으로 가는 연결 입구. 레시피가 같은 거르개를 여러 소리에 공유할 때 쓴다.
function lowpass(env, freq, dest = env.out) {
  const f = env.ctx.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = freq;
  f.Q.value = 0.7;
  f.connect(dest);
  return f;
}

// 진동음 하나(음높이 f 에서 to 로 지수 이동). 부드러운 시작·감쇠. { o, g } 를 돌려준다.
function tone(env, { type = 'sine', f, to, at = 0, dur = 0.2, gain = 0.2, attack = 0.005, dest }) {
  const { ctx, rate } = env;
  const t = env.t + at;
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(f * rate, t);
  if (to) o.frequency.exponentialRampToValueAtTime(to * rate, t + dur);
  const g = ctx.createGain();
  shape(g.gain, t, gain, attack, dur);
  o.connect(g);
  g.connect(dest ?? env.out);
  o.start(t);
  o.stop(t + dur + 0.05);
  return { o, g };
}

// 거른 잡음 한 번. kind: white | pink | brown. filters: [{ type, f, to, q }] 를 차례로 지난다(음높이 배율 적용).
function hiss(env, { kind = 'white', at = 0, dur = 0.2, gain = 0.2, attack = 0.005, filters = [], dest }) {
  const { ctx, rate, noise } = env;
  const t = env.t + at;
  const src = ctx.createBufferSource();
  src.buffer = noise[kind];
  src.loop = true;
  let node = src;
  for (const spec of filters) {
    const b = ctx.createBiquadFilter();
    b.type = spec.type;
    b.frequency.setValueAtTime(spec.f * rate, t);
    if (spec.to) b.frequency.exponentialRampToValueAtTime(spec.to * rate, t + dur);
    b.Q.value = spec.q ?? 0.7;
    node.connect(b);
    node = b;
  }
  const g = ctx.createGain();
  shape(g.gain, t, gain, attack, dur);
  node.connect(g);
  g.connect(dest ?? env.out);
  src.start(t, env.rng() * noise[kind].duration);
  src.stop(t + dur + 0.05);
  return g;
}

// FM 소리(종 같은 울림). 변조기 진폭 index 가 endIndex 로 줄어 울림이 맑아진다.
function fm(env, { f, ratio = 3.5, index = 1.5, endIndex = 0.05, at = 0, dur = 0.8, gain = 0.2, attack = 0.004, dest }) {
  const { ctx, rate } = env;
  const t = env.t + at;
  const car = ctx.createOscillator();
  const mod = ctx.createOscillator();
  const modAmt = ctx.createGain();
  car.frequency.setValueAtTime(f * rate, t);
  mod.frequency.setValueAtTime(f * rate * ratio, t);
  modAmt.gain.setValueAtTime(index * f * rate * ratio, t);
  modAmt.gain.exponentialRampToValueAtTime(Math.max(FLOOR, endIndex * f * rate * ratio), t + dur * 0.7);
  mod.connect(modAmt);
  modAmt.connect(car.frequency);
  const g = ctx.createGain();
  shape(g.gain, t, gain, attack, dur);
  car.connect(g);
  g.connect(dest ?? env.out);
  for (const o of [car, mod]) { o.start(t); o.stop(t + dur + 0.05); }
  return g;
}

// 소리를 freq Hz 로 빠르게 끊었다 켜는 입구(떨림·덜컹거림). depth 0.5 면 완전히 끊긴다. 돌려주는 노드에 소리를 연결한다.
function chop(env, { freq, depth = 0.4, at = 0, dur = 1, dest }) {
  const { ctx } = env;
  const t = env.t + at;
  const am = ctx.createGain();
  am.gain.value = 1 - depth;
  const lfo = ctx.createOscillator();
  const amt = ctx.createGain();
  lfo.frequency.value = freq;
  amt.gain.value = depth;
  lfo.connect(amt);
  amt.connect(am.gain);
  am.connect(dest ?? env.out);
  lfo.start(t);
  lfo.stop(t + dur + 0.05);
  return am;
}

// 하나의 목소리 음절 소리 순서. n 개의 짧은 음을 이어 "웅얼웅얼"을 만든다.
function mumble(env, voice, n) {
  const v = VOICE[voice] ?? VOICE.player;
  const lp = lowpass(env, v.lowpass);
  let t = 0;
  for (let i = 0; i < n; i++) {
    const step = SYLLABLE_STEPS[Math.floor(env.rng() * SYLLABLE_STEPS.length)];
    const f = v.base * 2 ** (step / 12);
    const len = v.syl * (0.85 + 0.4 * env.rng());
    tone(env, { type: v.wave, f, to: f * (0.93 + 0.14 * env.rng()), at: t, dur: len, gain: v.gain, attack: 0.012, dest: lp });
    t += len + 0.012 + 0.02 * env.rng();
  }
  return t + 0.06;
}

const rnd = (env, lo, hi) => lo + (hi - lo) * env.rng();

// ---- 이동·세계 ----
// 풀밭 발소리: 부드러운 풀 스치는 소리(낮은 거른 잡음)에 풀잎 바스락(고음 잡음)을 살짝.
function stepGrass(env) {
  hiss(env, { kind: 'pink', dur: 0.11, gain: 0.5, attack: 0.004, filters: [{ type: 'lowpass', f: 1500, to: 600, q: 0.5 }] });
  hiss(env, { kind: 'white', dur: 0.05, gain: 0.06, attack: 0.003, filters: [{ type: 'highpass', f: 3500 }] });
  return 0.14;
}
// 광장 돌바닥 발소리: 또각(딱딱한 점) + 낮은 쿵.
function stepStone(env) {
  hiss(env, { kind: 'white', dur: 0.05, gain: 0.4, attack: 0.002, filters: [{ type: 'bandpass', f: 2200, q: 1.2 }] });
  tone(env, { f: 180, to: 90, dur: 0.07, gain: 0.35, attack: 0.002 });
  return 0.1;
}
// 실내 타일 발소리: 맑은 똑 소리.
function stepTile(env) {
  tone(env, { type: 'triangle', f: 1100, to: 700, dur: 0.035, gain: 0.18, attack: 0.001 });
  hiss(env, { kind: 'white', dur: 0.04, gain: 0.3, attack: 0.002, filters: [{ type: 'bandpass', f: 3000, q: 2 }] });
  tone(env, { f: 140, to: 80, dur: 0.06, gain: 0.25, attack: 0.002 });
  return 0.1;
}
// 클릭 이동 표식: 둥글고 짧은 올라가는 방울 소리.
function marker(env) {
  tone(env, { f: 520, to: 780, dur: 0.12, gain: 0.3, attack: 0.008 });
  tone(env, { f: 1040, to: 1560, dur: 0.1, gain: 0.08, attack: 0.008 });
  return 0.17;
}
// 앉기: 옷 스치는 소리가 내려가며 부드러운 쿵.
function sit(env) {
  hiss(env, { kind: 'pink', dur: 0.3, gain: 0.35, attack: 0.06, filters: [{ type: 'bandpass', f: 900, to: 450, q: 0.8 }] });
  tone(env, { f: 110, to: 70, at: 0.04, dur: 0.18, gain: 0.3, attack: 0.01 });
  return 0.36;
}
// 일어서기: 스치는 소리가 올라간다.
function stand(env) {
  hiss(env, { kind: 'pink', dur: 0.28, gain: 0.3, attack: 0.08, filters: [{ type: 'bandpass', f: 400, to: 1100, q: 0.8 }] });
  tone(env, { f: 70, to: 100, dur: 0.12, gain: 0.15, attack: 0.02 });
  return 0.33;
}
// 공간 전환(차원문): 부풀어 오르는 바람 + 올라가는 소리, 화면이 덮이는 순간의 낮은 울림, 반짝이는 잔향.
function portal(env) {
  hiss(env, { kind: 'pink', dur: 1.0, gain: 0.38, attack: 0.5, filters: [{ type: 'bandpass', f: 250, to: 2800, q: 1.5 }] });
  tone(env, { f: 180, to: 700, dur: 0.95, gain: 0.22, attack: 0.45 });
  tone(env, { f: 90, at: 0.4, dur: 0.4, gain: 0.2, attack: 0.03 });
  [1760, 2217, 2637, 3322].forEach((f, i) => tone(env, { f, at: 0.35 + i * 0.06, dur: 0.5, gain: 0.06, attack: 0.05 }));
  return 1.05;
}

// ---- 소각장 ----
// 종이 구기기: 바스락 소리가 빠르게 여러 번.
function crumple(env) {
  for (let i = 0; i < 6; i++) {
    hiss(env, { kind: 'white', at: i * 0.07 + rnd(env, 0, 0.03), dur: rnd(env, 0.03, 0.06), gain: 0.35 * rnd(env, 0.6, 1), attack: 0.001, filters: [{ type: 'highpass', f: rnd(env, 2500, 5500) }] });
  }
  hiss(env, { kind: 'pink', dur: 0.4, gain: 0.1, attack: 0.05, filters: [{ type: 'lowpass', f: 1500 }] });
  return 0.52;
}
// 주머니에서 종이 꺼내기: 부드러운 종이 쓸림.
function paperOut(env) {
  hiss(env, { kind: 'white', dur: 0.28, gain: 0.22, attack: 0.08, filters: [{ type: 'bandpass', f: 2500, to: 4500, q: 0.8 }] });
  hiss(env, { kind: 'pink', at: 0.05, dur: 0.2, gain: 0.1, attack: 0.04, filters: [{ type: 'highpass', f: 1500 }] });
  return 0.33;
}
// 종이/소품 던지기: 가벼운 휙.
function toss(env) {
  hiss(env, { kind: 'pink', dur: 0.33, gain: 0.3, attack: 0.12, filters: [{ type: 'bandpass', f: 600, to: 2400, q: 1 }] });
  hiss(env, { kind: 'white', dur: 0.2, gain: 0.08, attack: 0.06, filters: [{ type: 'highpass', f: 4000 }] });
  return 0.38;
}
// 종이가 불에 닿는 순간: 부풀며 "후웁" 하고 타오르는 소리 + 낮은 울림.
function whoof(env) {
  hiss(env, { kind: 'brown', dur: 0.5, gain: 0.6, attack: 0.06, filters: [{ type: 'lowpass', f: 250, to: 1800 }] });
  hiss(env, { kind: 'pink', dur: 0.75, gain: 0.25, attack: 0.1, filters: [{ type: 'bandpass', f: 900, to: 300, q: 0.8 }] });
  tone(env, { f: 100, to: 45, dur: 0.35, gain: 0.35, attack: 0.01 });
  return 0.82;
}
// 파쇄: 덜컥 물리는 소리 뒤에 윙윙 갈리는 소리(톱니 소리가 빠르게 끊김).
function shredder(env) {
  tone(env, { type: 'triangle', f: 140, to: 55, dur: 0.12, gain: 0.3, attack: 0.002 });
  const grind = chop(env, { freq: 26, depth: 0.45, at: 0.05, dur: 0.85, dest: lowpass(env, 500) });
  tone(env, { type: 'sawtooth', f: 78, at: 0.05, dur: 0.8, gain: 0.25, attack: 0.06, dest: grind });
  const scrape = chop(env, { freq: 26, depth: 0.45, at: 0.05, dur: 0.85 });
  hiss(env, { kind: 'white', at: 0.05, dur: 0.8, gain: 0.12, attack: 0.06, filters: [{ type: 'bandpass', f: 1800, q: 3 }], dest: scrape });
  return 0.95;
}
// 한숨: 숨이 천천히 나가는 소리.
function sigh(env) {
  hiss(env, { kind: 'pink', dur: 1.0, gain: 0.35, attack: 0.3, filters: [{ type: 'bandpass', f: 700, to: 420, q: 0.9 }] });
  hiss(env, { kind: 'white', dur: 0.9, gain: 0.06, attack: 0.3, filters: [{ type: 'highpass', f: 1500 }] });
  return 1.05;
}
// 후련함: 부드러운 "아~" (살짝 떨리는 두 소리가 어울린다).
function relief(env) {
  const lp = lowpass(env, 1500);
  const a = tone(env, { type: 'triangle', f: 330, to: 349, dur: 0.95, gain: 0.18, attack: 0.14, dest: lp });
  tone(env, { type: 'triangle', f: 495, to: 523, dur: 0.9, gain: 0.09, attack: 0.16, dest: lp });
  tone(env, { f: 660, dur: 0.8, gain: 0.04, attack: 0.18, dest: lp });
  const vib = env.ctx.createOscillator();
  const amt = env.ctx.createGain();
  vib.frequency.value = 5;
  amt.gain.value = 9; // 음높이를 센트 단위로 살짝 흔든다
  vib.connect(amt);
  amt.connect(a.o.detune);
  vib.start(env.t);
  vib.stop(env.t + 1);
  return 1.0;
}
// 스트레스 -N 팝업: 통통 튀는 작은 방울.
function tick(env) {
  tone(env, { f: 1500, to: 900, dur: 0.07, gain: 0.22, attack: 0.002 });
  tone(env, { f: 3000, dur: 0.03, gain: 0.05, attack: 0.001 });
  return 0.14;
}
// 모닥불 톡: 불꽃 튀는 소리(높이가 매번 다르다).
function firePop(env) {
  hiss(env, { kind: 'white', dur: 0.025, gain: 0.3, attack: 0.001, filters: [{ type: 'highpass', f: 3500 }] });
  tone(env, { f: rnd(env, 800, 1700), dur: 0.035, gain: 0.07, attack: 0.001 });
  return 0.09;
}

// ---- 세탁소 ----
// 천이 스치는 소리.
function swish(env) {
  hiss(env, { kind: 'pink', dur: 0.32, gain: 0.28, attack: 0.1, filters: [{ type: 'bandpass', f: 500, to: 1600, q: 0.9 }] });
  hiss(env, { kind: 'white', dur: 0.3, gain: 0.05, attack: 0.1, filters: [{ type: 'highpass', f: 3000 }] });
  return 0.36;
}
// 세탁기에 퐁당: 둔한 쿵 + 첨벙 + 보글보글.
function washSplash(env) {
  tone(env, { f: 150, to: 55, dur: 0.25, gain: 0.5, attack: 0.003 });
  hiss(env, { kind: 'brown', dur: 0.25, gain: 0.3, attack: 0.005, filters: [{ type: 'lowpass', f: 500 }] });
  hiss(env, { kind: 'white', at: 0.02, dur: 0.5, gain: 0.3, attack: 0.01, filters: [{ type: 'bandpass', f: 2200, to: 1200, q: 0.8 }] });
  for (let i = 0; i < 6; i++) {
    const f = rnd(env, 350, 850);
    tone(env, { f, to: f * 1.6, at: 0.2 + i * 0.1 + rnd(env, 0, 0.05), dur: 0.09, gain: 0.08, attack: 0.008 });
  }
  return 1.1;
}
// 세탁기 덜덜: 낮은 진동이 13Hz 로 떨리며 잦아든다.
function washerRattle(env) {
  const rumble = chop(env, { freq: 13, depth: 0.45, dur: 1.2, dest: lowpass(env, 220) });
  tone(env, { type: 'sawtooth', f: 58, dur: 1.2, gain: 0.25, attack: 0.02, dest: rumble });
  const tin = chop(env, { freq: 13, depth: 0.45, dur: 1.2 });
  hiss(env, { kind: 'white', dur: 1.15, gain: 0.06, attack: 0.02, filters: [{ type: 'bandpass', f: 900, q: 4 }], dest: tin });
  return 1.25;
}
// 빨랫줄에 셔츠를 탁 널기: 천이 펄럭이며 튕기는 소리.
function flap(env) {
  hiss(env, { kind: 'white', dur: 0.12, gain: 0.5, attack: 0.003, filters: [{ type: 'bandpass', f: 1400, to: 400, q: 0.7 }] });
  hiss(env, { kind: 'pink', at: 0.02, dur: 0.25, gain: 0.25, attack: 0.02, filters: [{ type: 'lowpass', f: 3000, to: 500 }] });
  tone(env, { type: 'triangle', f: 230, to: 130, dur: 0.1, gain: 0.12, attack: 0.003 });
  return 0.31;
}
// 새 셔츠를 입는 옷 스치는 소리(여러 번 비비는 느낌).
function wearRustle(env) {
  for (let i = 0; i < 5; i++) {
    const f = rnd(env, 700, 1600);
    hiss(env, { kind: 'pink', at: i * 0.11 + rnd(env, 0, 0.04), dur: 0.12, gain: 0.22, attack: 0.02, filters: [{ type: 'bandpass', f, to: f * 1.4, q: 0.9 }] });
  }
  hiss(env, { kind: 'pink', at: 0.4, dur: 0.3, gain: 0.15, attack: 0.08, filters: [{ type: 'bandpass', f: 500, to: 1300, q: 0.9 }] });
  return 0.75;
}
// 짜잔: 반짝이는 올라가는 소리와 맑은 잔향.
function tada(env) {
  [NOTE.C6, NOTE.E6, NOTE.G6, NOTE.C7].forEach((f, i) => tone(env, { type: i % 2 ? 'sine' : 'triangle', f, at: i * 0.07, dur: 0.55, gain: 0.17, attack: 0.004 }));
  tone(env, { f: 3136, at: 0.25, dur: 0.6, gain: 0.05, attack: 0.01 });
  [NOTE.C5, NOTE.E5, NOTE.G5].forEach((f) => tone(env, { f, at: 0.2, dur: 0.8, gain: 0.06, attack: 0.05 }));
  return 1.05;
}

// ---- 면접장 ----
// 질문 딩: 부드러운 종소리(FM).
function ding(env) {
  fm(env, { f: NOTE.D6, ratio: 2.01, index: 1.2, endIndex: 0.05, dur: 1.0, gain: 0.3 });
  tone(env, { f: NOTE.D7, dur: 0.5, gain: 0.05, attack: 0.004 });
  return 1.05;
}
// 선택지 위에 올림: 아주 작은 톡.
function hover(env) {
  tone(env, { f: 1800, dur: 0.03, gain: 0.08, attack: 0.001 });
  hiss(env, { kind: 'white', dur: 0.015, gain: 0.04, attack: 0.001, filters: [{ type: 'highpass', f: 5000 }] });
  return 0.06;
}
// 답변 확정: 올라가는 두 음 "퐁-퐁".
function confirm(env) {
  tone(env, { f: 660, dur: 0.15, gain: 0.25, attack: 0.005 });
  tone(env, { f: 990, at: 0.09, dur: 0.2, gain: 0.25, attack: 0.005 });
  tone(env, { f: 1980, at: 0.09, dur: 0.15, gain: 0.06, attack: 0.005 });
  return 0.32;
}
// 말풍선 웅얼거림(동물의 숲 말투): 목소리 voice, 음절 수 syllables(글자 수로 정해진다).
function speech(env, o) {
  return mumble(env, o.voice, Math.max(1, Math.min(8, o.syllables ?? 5)));
}
// 박수: 짧은 잡음 박수 서른 번이 붙었다 사라진다.
function applause(env) {
  for (let i = 0; i < 30; i++) {
    const at = 0.05 + 1.5 * (env.rng() + env.rng()) / 2; // 가운데가 가장 빽빽하다
    hiss(env, { kind: 'white', at, dur: rnd(env, 0.025, 0.055), gain: rnd(env, 0.12, 0.3), attack: 0.001, filters: [{ type: 'bandpass', f: rnd(env, 1200, 3800), q: 0.9 }] });
  }
  hiss(env, { kind: 'pink', dur: 1.7, gain: 0.1, attack: 0.3, filters: [{ type: 'bandpass', f: 2000, q: 0.5 }] });
  return 1.85;
}
// 당황 "어... 이런": 숨을 들이쉬고 두 음이 내려간다.
function ohno(env) {
  hiss(env, { kind: 'pink', dur: 0.18, gain: 0.12, attack: 0.08, filters: [{ type: 'bandpass', f: 1500, to: 2800, q: 0.9 }] });
  const lp = lowpass(env, 1600);
  tone(env, { type: 'triangle', f: 520, to: 470, at: 0.12, dur: 0.26, gain: 0.28, attack: 0.03, dest: lp });
  tone(env, { type: 'triangle', f: 400, to: 230, at: 0.4, dur: 0.4, gain: 0.26, attack: 0.03, dest: lp });
  return 0.85;
}
// 폭소: 높낮이가 조금씩 내려가는 "하하하하하".
function laugh(env) {
  const lp = lowpass(env, 1500);
  for (let i = 0; i < 5; i++) {
    const f = 420 - i * 14 + rnd(env, 0, 20);
    tone(env, { type: 'triangle', f, to: f * 0.85, at: 0.02 + i * 0.15, dur: 0.1, gain: 0.22 * (1 - i * 0.1), attack: 0.008, dest: lp });
    hiss(env, { kind: 'pink', at: 0.02 + i * 0.15, dur: 0.08, gain: 0.05, attack: 0.005, filters: [{ type: 'bandpass', f: 1800, q: 1 }] });
  }
  return 0.95;
}
// 최종 합격 팡파르: 올라가는 으뜸화음 + 오래 남는 화음과 반짝임.
function fanfare(env) {
  [NOTE.C5, NOTE.E5, NOTE.G5, NOTE.C6].forEach((f, i) => tone(env, { type: 'triangle', f, at: i * 0.11, dur: 0.35, gain: 0.22, attack: 0.006 }));
  const lp = lowpass(env, 2200);
  [NOTE.C5, NOTE.E5, NOTE.G5, NOTE.C6].forEach((f) => tone(env, { type: 'sawtooth', f, at: 0.45, dur: 1.4, gain: 0.07, attack: 0.02, dest: lp }));
  [3136, 4186].forEach((f, i) => tone(env, { f, at: 0.5 + i * 0.12, dur: 0.8, gain: 0.05, attack: 0.01 }));
  for (let i = 0; i < 6; i++) tone(env, { f: rnd(env, 2500, 5000), at: 0.55 + i * 0.1 + rnd(env, 0, 0.05), dur: 0.2, gain: 0.025, attack: 0.003 });
  return 1.95;
}
// 쿵쿵(춤 박자): 큰북 한 번.
function stomp(env) {
  tone(env, { f: 160, to: 42, dur: 0.22, gain: 0.55, attack: 0.002 });
  hiss(env, { kind: 'white', dur: 0.02, gain: 0.2, attack: 0.001, filters: [{ type: 'lowpass', f: 2000 }] });
  hiss(env, { kind: 'brown', dur: 0.12, gain: 0.2, attack: 0.002, filters: [{ type: 'lowpass', f: 300 }] });
  return 0.3;
}
// 의자 끄는 소리: 끽끽 끌리는 낮은 마찰.
function scrape(env) {
  const grit = chop(env, { freq: 38, depth: 0.4, dur: 0.5 });
  hiss(env, { kind: 'pink', dur: 0.45, gain: 0.3, attack: 0.03, filters: [{ type: 'bandpass', f: 250, to: 350, q: 4 }], dest: grit });
  tone(env, { type: 'sawtooth', f: 90, to: 110, dur: 0.4, gain: 0.08, attack: 0.03, dest: lowpass(env, 300) });
  return 0.5;
}
// 폴짝: 올라가는 방울.
function hop(env) {
  tone(env, { f: 300, to: 720, dur: 0.14, gain: 0.25, attack: 0.005 });
  tone(env, { type: 'triangle', f: 600, to: 1400, dur: 0.1, gain: 0.06, attack: 0.005 });
  return 0.22;
}

// ---- 화면 UI ----
// 버튼 클릭: 짧은 똑.
function click(env) {
  tone(env, { f: 800, to: 560, dur: 0.045, gain: 0.22, attack: 0.001 });
  hiss(env, { kind: 'white', dur: 0.02, gain: 0.1, attack: 0.001, filters: [{ type: 'bandpass', f: 3500, q: 1 }] });
  return 0.08;
}
// 측면 팝업: 두 음의 부드러운 차임.
function popupSide(env) {
  tone(env, { f: NOTE.E5, dur: 0.7, gain: 0.2, attack: 0.01 });
  tone(env, { f: NOTE.B5, at: 0.12, dur: 0.75, gain: 0.17, attack: 0.01 });
  tone(env, { f: 1975.5, at: 0.12, dur: 0.5, gain: 0.04, attack: 0.01 });
  return 0.9;
}
// 가운데 팝업(스트레스 0): 한결 밝은 올라가는 음과 종소리.
function popupModal(env) {
  [NOTE.C5, NOTE.E5, NOTE.G5, NOTE.C6, NOTE.E6].forEach((f, i) => tone(env, { type: i % 2 ? 'sine' : 'triangle', f, at: i * 0.09, dur: 0.9, gain: 0.2, attack: 0.006 }));
  fm(env, { f: NOTE.G6, ratio: 2.01, index: 0.8, at: 0.3, dur: 1.0, gain: 0.12 });
  [3136, 4186, 5274].forEach((f, i) => tone(env, { f, at: 0.4 + i * 0.1, dur: 0.6, gain: 0.04, attack: 0.01 }));
  return 1.5;
}
// "면접 갈 준비 완료!" 성공 징글: 올라가는 짧은 멜로디와 화음.
function jingle(env) {
  [[NOTE.G4, 0, 0.25], [NOTE.C5, 0.13, 0.25], [NOTE.E5, 0.26, 0.25], [NOTE.G5, 0.4, 0.6]].forEach(([f, at, dur]) => tone(env, { type: 'triangle', f, at, dur, gain: 0.22, attack: 0.006 }));
  [NOTE.C5, NOTE.E5, NOTE.G5].forEach((f) => tone(env, { f, at: 0.4, dur: 0.8, gain: 0.07, attack: 0.02 }));
  tone(env, { f: 3136, at: 0.5, dur: 0.5, gain: 0.04, attack: 0.01 });
  return 1.25;
}
// 포춘쿠키 깨기: 딱 갈라지는 소리 + 바삭한 조각.
function crack(env) {
  hiss(env, { kind: 'white', dur: 0.03, gain: 0.6, attack: 0.001, filters: [{ type: 'highpass', f: 2000 }] });
  tone(env, { f: 200, to: 90, dur: 0.06, gain: 0.3, attack: 0.002 });
  [0.03, 0.07, 0.11].forEach((at) => hiss(env, { kind: 'white', at, dur: rnd(env, 0.04, 0.08), gain: 0.22, attack: 0.002, filters: [{ type: 'bandpass', f: rnd(env, 2500, 4000), q: 0.8 }] }));
  hiss(env, { kind: 'white', at: 0.22, dur: 0.03, gain: 0.35, attack: 0.001, filters: [{ type: 'highpass', f: 2500 }] });
  return 0.4;
}
// 운세 공개: 맑은 종소리 네 음.
function fortune(env) {
  [NOTE.D6, NOTE.Fs6, NOTE.A6, NOTE.D7].forEach((f, i) => fm(env, { f, ratio: 3.01, index: 0.9, at: i * 0.12, dur: 1.0, gain: 0.16 }));
  tone(env, { f: 4186, at: 0.4, dur: 0.6, gain: 0.03, attack: 0.01 });
  return 1.45;
}

// ---- 앰비언스 곁들임 ----
// 멀리서 지저귀는 새: 짧은 올림 음 세 번.
function bird(env) {
  const f0 = rnd(env, 2600, 3400);
  [[0, 1.3], [0.1, 1.45], [0.22, 1.2]].forEach(([at, up]) => {
    tone(env, { f: f0, to: f0 * up, at, dur: 0.065, gain: 0.22, attack: 0.006 });
    tone(env, { f: f0 * 2, to: f0 * up * 2, at, dur: 0.05, gain: 0.04, attack: 0.006 });
  });
  return 0.4;
}

// ---- 끊기지 않는 소리(앰비언스·불 소리) ----
// 반복 재생하는 잡음 + 느린 변화. create(env) 는 env.t 에 시작해서 { stop(시각) } 을 돌려준다.
function loopNoise(env, kind, filters, level, dest) {
  const { ctx, noise } = env;
  const src = ctx.createBufferSource();
  src.buffer = noise[kind];
  src.loop = true;
  let node = src;
  const made = [];
  for (const spec of filters) {
    const b = ctx.createBiquadFilter();
    b.type = spec.type;
    b.frequency.value = spec.f;
    b.Q.value = spec.q ?? 0.7;
    node.connect(b);
    node = b;
    made.push(b);
  }
  const g = ctx.createGain();
  g.gain.value = level;
  node.connect(g);
  g.connect(dest);
  src.start(env.t, env.rng() * noise[kind].duration);
  return { src, filters: made, gain: g };
}
// 느린 흔들림(LFO)을 AudioParam 에 더한다.
function sway(env, param, freq, amount, list) {
  const lfo = env.ctx.createOscillator();
  const amt = env.ctx.createGain();
  lfo.frequency.value = freq;
  amt.gain.value = amount;
  lfo.connect(amt);
  amt.connect(param);
  lfo.start(env.t);
  list.push(lfo);
}
const stopper = (env, sources) => ({ stop(at) { for (const s of sources) { try { s.stop(at); } catch { /* 이미 멈췄다 */ } } } });

// 모닥불 지글거림(바탕): 낮은 웅웅 + 깜빡이는 바스락. (톡톡 튀는 소리는 firePop 을 가끔 따로 낸다)
function fireLoop(env) {
  const sources = [];
  const rumble = loopNoise(env, 'brown', [{ type: 'lowpass', f: 380 }], 0.55, env.out);
  const crackle = loopNoise(env, 'pink', [{ type: 'bandpass', f: 1600, q: 0.6 }], 0.22, env.out);
  sway(env, crackle.gain.gain, 6.3, 0.1, sources);
  sway(env, crackle.gain.gain, 9.7, 0.07, sources);
  sources.push(rumble.src, crackle.src);
  return stopper(env, sources);
}
// 마당: 부드러운 바람(느리게 세졌다 약해진다).
function ambYardLoop(env) {
  const sources = [];
  const wind = loopNoise(env, 'pink', [{ type: 'lowpass', f: 520 }], 0.35, env.out);
  sway(env, wind.filters[0].frequency, 0.11, 220, sources);
  sway(env, wind.gain.gain, 0.07, 0.12, sources);
  const air = loopNoise(env, 'pink', [{ type: 'bandpass', f: 2800, q: 0.8 }], 0.03, env.out);
  sway(env, air.gain.gain, 0.09, 0.02, sources);
  sources.push(wind.src, air.src);
  return stopper(env, sources);
}
// 세탁소: 기계 웅웅(50Hz 계열) + 은은한 방 소리.
function ambLaundryLoop(env) {
  const sources = [];
  for (const [f, level, cut] of [[50, 0.12, 160], [100.5, 0.05, 220]]) {
    const o = env.ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = f;
    const lp = lowpass(env, cut);
    const g = env.ctx.createGain();
    g.gain.value = level;
    o.connect(g);
    g.connect(lp);
    o.start(env.t);
    sources.push(o);
  }
  const room = loopNoise(env, 'pink', [{ type: 'bandpass', f: 700, q: 0.5 }], 0.06, env.out);
  sway(env, room.gain.gain, 0.08, 0.02, sources);
  sources.push(room.src);
  return stopper(env, sources);
}
// 면접장: 에어컨 바람 소리와 아주 낮은 전기 웅웅.
function ambInterviewLoop(env) {
  const sources = [];
  const air = loopNoise(env, 'pink', [{ type: 'lowpass', f: 900 }, { type: 'highpass', f: 80 }], 0.22, env.out);
  sway(env, air.filters[0].frequency, 0.05, 100, sources);
  const rumble = loopNoise(env, 'brown', [{ type: 'lowpass', f: 300 }], 0.1, env.out);
  const hum = env.ctx.createOscillator();
  const humGain = env.ctx.createGain();
  hum.frequency.value = 120;
  humGain.gain.value = 0.015;
  hum.connect(humGain);
  humGain.connect(env.out);
  hum.start(env.t);
  sources.push(air.src, rumble.src, hum);
  return stopper(env, sources);
}

// ---- 목록 ----
// run: 레시피, duration: 돌려주는 길이의 허용 범위[최소, 최대](초), priority: 동시 소리가 가득 찼을 때 남는 순서(클수록 중요), gain: 소리 크기,
// jitter: 부를 때마다 흔드는 비율({ pitch: 음높이 ±, gain: 크기 ± }), minInterval: 같은 소리 연타 최소 간격(초), bus: 'sfx'(효과음) | 'amb'(앰비언스), group/label: 사운드 시험 페이지의 분류·이름.
const J = { pitch: 0.06, gain: 0.15 };
const NOJ = { pitch: 0, gain: 0 };
export const RECIPES = {
  stepGrass: { run: stepGrass, duration: [0.05, 0.25], priority: 1, gain: 2.42, jitter: { pitch: 0.12, gain: 0.25 }, minInterval: 0.12, group: '이동', label: '풀밭 발소리' },
  stepStone: { run: stepStone, duration: [0.05, 0.25], priority: 1, gain: 1.35, jitter: { pitch: 0.1, gain: 0.25 }, minInterval: 0.12, group: '이동', label: '광장 돌바닥 발소리' },
  stepTile: { run: stepTile, duration: [0.05, 0.25], priority: 1, gain: 1.6, jitter: { pitch: 0.08, gain: 0.25 }, minInterval: 0.12, group: '이동', label: '실내 타일 발소리' },
  marker: { run: marker, duration: [0.08, 0.4], priority: 2, gain: 2.14, jitter: { pitch: 0.04, gain: 0.1 }, minInterval: 0.06, group: '이동', label: '클릭 이동 표식' },
  sit: { run: sit, duration: [0.2, 0.6], priority: 2, gain: 1.08, jitter: J, minInterval: 0.3, group: '이동', label: '앉기' },
  stand: { run: stand, duration: [0.2, 0.6], priority: 2, gain: 2.41, jitter: J, minInterval: 0.3, group: '이동', label: '일어서기' },
  portal: { run: portal, duration: [0.7, 1.4], priority: 4, gain: 1.13, jitter: { pitch: 0.03, gain: 0 }, minInterval: 1.0, group: '이동', label: '공간 전환(차원문)' },

  crumple: { run: crumple, duration: [0.3, 0.8], priority: 2, gain: 1.03, jitter: J, minInterval: 0.3, group: '소각장', label: '종이 구기기' },
  paperOut: { run: paperOut, duration: [0.15, 0.6], priority: 2, gain: 1.56, jitter: J, minInterval: 0.2, group: '소각장', label: '종이 꺼내기' },
  toss: { run: toss, duration: [0.15, 0.6], priority: 2, gain: 2.33, jitter: { pitch: 0.1, gain: 0.15 }, minInterval: 0.2, group: '소각장', label: '던지기 휙' },
  whoof: { run: whoof, duration: [0.5, 1.2], priority: 4, gain: 2.2, jitter: { pitch: 0.08, gain: 0.1 }, minInterval: 0.3, group: '소각장', label: '불 타오름 후웁' },
  shredder: { run: shredder, duration: [0.6, 1.3], priority: 3, gain: 1.57, jitter: { pitch: 0.06, gain: 0.1 }, minInterval: 0.5, group: '소각장', label: '파쇄기' },
  sigh: { run: sigh, duration: [0.6, 1.4], priority: 2, gain: 1.07, jitter: J, minInterval: 0.8, group: '소각장', label: '한숨' },
  relief: { run: relief, duration: [0.6, 1.4], priority: 3, gain: 1.1, jitter: { pitch: 0.05, gain: 0.1 }, minInterval: 0.8, group: '소각장', label: '후련한 "아~"' },
  tick: { run: tick, duration: [0.05, 0.3], priority: 3, gain: 3.6, jitter: { pitch: 0.05, gain: 0.1 }, minInterval: 0.2, group: '소각장', label: '스트레스 감소 톡' },
  firePop: { run: firePop, duration: [0.03, 0.2], priority: 1, gain: 1.47, jitter: { pitch: 0.2, gain: 0.5 }, minInterval: 0.08, bus: 'amb', group: '소각장', label: '모닥불 톡' },

  swish: { run: swish, duration: [0.15, 0.6], priority: 2, gain: 2.0, jitter: { pitch: 0.1, gain: 0.15 }, minInterval: 0.2, group: '세탁소', label: '천 스치는 소리' },
  washSplash: { run: washSplash, duration: [0.7, 1.5], priority: 4, gain: 2.19, jitter: { pitch: 0.06, gain: 0.1 }, minInterval: 0.4, group: '세탁소', label: '세탁기 퐁당·첨벙' },
  washerRattle: { run: washerRattle, duration: [0.8, 1.6], priority: 2, gain: 1.58, jitter: { pitch: 0.05, gain: 0.1 }, minInterval: 0.5, group: '세탁소', label: '세탁기 덜덜' },
  flap: { run: flap, duration: [0.15, 0.6], priority: 3, gain: 3.87, jitter: J, minInterval: 0.2, group: '세탁소', label: '셔츠 펄럭' },
  wearRustle: { run: wearRustle, duration: [0.4, 1.1], priority: 2, gain: 2.26, jitter: J, minInterval: 0.5, group: '세탁소', label: '옷 입는 소리' },
  tada: { run: tada, duration: [0.6, 1.5], priority: 4, gain: 1.86, jitter: { pitch: 0.02, gain: 0 }, minInterval: 0.6, group: '세탁소', label: '짜잔(새 셔츠)' },

  ding: { run: ding, duration: [0.6, 1.5], priority: 4, gain: 3.16, jitter: { pitch: 0.02, gain: 0.05 }, minInterval: 0.4, group: '면접장', label: '질문 딩' },
  hover: { run: hover, duration: [0.02, 0.2], priority: 1, gain: 5.0, jitter: { pitch: 0.05, gain: 0.1 }, minInterval: 0.04, group: '면접장', label: '선택지 올림' },
  confirm: { run: confirm, duration: [0.15, 0.6], priority: 3, gain: 1.26, jitter: { pitch: 0.03, gain: 0.05 }, minInterval: 0.2, group: '면접장', label: '답변 확정' },
  speech: { run: speech, duration: [0.12, 1.2], priority: 2, gain: 1.0, jitter: NOJ, minInterval: 0.25, group: '면접장', label: '말풍선 웅얼거림', demo: { voice: 'hr', syllables: 6 } },
  applause: { run: applause, duration: [1.0, 2.4], priority: 3, gain: 1.77, jitter: { pitch: 0.05, gain: 0.1 }, minInterval: 1.0, group: '면접장', label: '박수' },
  ohno: { run: ohno, duration: [0.5, 1.2], priority: 3, gain: 1.21, jitter: { pitch: 0.06, gain: 0.1 }, minInterval: 0.6, group: '면접장', label: '당황 "어… 이런"' },
  laugh: { run: laugh, duration: [0.6, 1.3], priority: 3, gain: 1.48, jitter: { pitch: 0.08, gain: 0.1 }, minInterval: 0.8, group: '면접장', label: '폭소' },
  fanfare: { run: fanfare, duration: [1.2, 2.5], priority: 4, gain: 2.31, jitter: { pitch: 0.01, gain: 0 }, minInterval: 1.5, group: '면접장', label: '최종 합격 팡파르' },
  stomp: { run: stomp, duration: [0.1, 0.5], priority: 2, gain: 2.41, jitter: { pitch: 0.06, gain: 0.1 }, minInterval: 0.2, group: '면접장', label: '쿵(춤 박자)' },
  scrape: { run: scrape, duration: [0.3, 0.8], priority: 2, gain: 3.75, jitter: { pitch: 0.1, gain: 0.15 }, minInterval: 0.1, group: '면접장', label: '의자 끄는 소리' },
  hop: { run: hop, duration: [0.1, 0.4], priority: 2, gain: 2.88, jitter: { pitch: 0.06, gain: 0.1 }, minInterval: 0.15, group: '면접장', label: '폴짝' },

  click: { run: click, duration: [0.03, 0.2], priority: 3, gain: 4.24, jitter: { pitch: 0.03, gain: 0.05 }, minInterval: 0.05, group: '화면', label: '버튼 클릭' },
  popupSide: { run: popupSide, duration: [0.5, 1.3], priority: 4, gain: 1.43, jitter: NOJ, minInterval: 0.5, group: '화면', label: '측면 팝업(은은한 차임)' },
  popupModal: { run: popupModal, duration: [1.0, 2.0], priority: 4, gain: 1.42, jitter: NOJ, minInterval: 0.8, group: '화면', label: '가운데 팝업(스트레스 0 축하)' },
  jingle: { run: jingle, duration: [0.8, 1.8], priority: 4, gain: 1.37, jitter: NOJ, minInterval: 0.8, group: '화면', label: '면접 갈 준비 완료 징글' },
  crack: { run: crack, duration: [0.2, 0.7], priority: 3, gain: 0.95, jitter: J, minInterval: 0.3, group: '화면', label: '포춘쿠키 깨기' },
  fortune: { run: fortune, duration: [0.9, 2.0], priority: 4, gain: 1.69, jitter: NOJ, minInterval: 0.6, group: '화면', label: '운세 공개 차임' },

  bird: { run: bird, duration: [0.2, 0.8], priority: 1, gain: 0.51, jitter: { pitch: 0.1, gain: 0.3 }, minInterval: 2, bus: 'amb', group: '앰비언스', label: '새 지저귐(마당)' },
};

// 끊기지 않는 소리. gain: 소리 크기(sfx.update 가 공간·거리에 따라 0~1 을 곱한다). bus: 'amb'(앰비언스 버스).
export const LOOPS = {
  fire: { run: fireLoop, gain: 0.38, bus: 'amb', group: '앰비언스', label: '모닥불 지글거림(가까울수록)' },
  ambYard: { run: ambYardLoop, gain: 0.3, bus: 'amb', group: '앰비언스', label: '마당 바람' },
  ambLaundry: { run: ambLaundryLoop, gain: 0.38, bus: 'amb', group: '앰비언스', label: '세탁소 기계 웅웅' },
  ambInterview: { run: ambInterviewLoop, gain: 0.45, bus: 'amb', group: '앰비언스', label: '면접장 에어컨 소리' },
};

export const SOUND_NAMES = Object.keys(RECIPES);
export const LOOP_NAMES = Object.keys(LOOPS);
