// 효과음 규칙 (순수). 오디오 장치를 건드리지 않고 "얼마나 크게, 어느 쪽에서, 언제, 몇 개까지"만 계산한다(그리는 쪽은 audio/ 폴더).
// 모든 함수는 이상한 입력(NaN·undefined·음수)에도 던지지 않고 조용한 쪽(0·무시)으로 답한다: 소리가 게임을 멈추게 하면 안 된다.

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// ---- 볼륨 ----
export const DEFAULT_VOLUME = 0.7; // 슬라이더 기본값(마스터 게인 0.49). 시끄럽지 않게 보수적으로.
// 슬라이더(0~1) -> 마스터 게인. 제곱 곡선이라 낮은 쪽을 세밀하게 고를 수 있다.
export function volumeToGain(v, maxGain = 1) {
  const x = Number.isFinite(v) ? clamp(v, 0, 1) : DEFAULT_VOLUME;
  return x * x * maxGain;
}

// ---- 거리·방향 ----
// 거리 -> 소리 크기(0~1). ref 안은 1, max 밖은 0, 사이는 (1 - t)^power 로 부드럽게 준다.
export function distanceGain(dist, { ref = 2, max = 16, power = 2 } = {}) {
  if (!Number.isFinite(dist)) return 0;
  if (dist <= ref) return 1;
  if (!(max > ref) || dist >= max) return 0;
  return (1 - (dist - ref) / (max - ref)) ** power;
}

// 듣는 사람 기준 위치 차이(dx, dz)를 카메라의 오른쪽 방향(rightX, rightZ)에 투영해 좌우 위치(-maxPan~maxPan)로. range 만큼 옆이면 끝까지 쏠린다.
export function panFromOffset(dx, dz, rightX, rightZ, { range = 12, maxPan = 0.7 } = {}) {
  const len = Math.hypot(rightX, rightZ);
  if (!(len > 0) || !Number.isFinite(dx) || !Number.isFinite(dz)) return 0;
  const lateral = (dx * rightX + dz * rightZ) / len;
  return clamp(lateral / range, -1, 1) * maxPan;
}

// 화면 가로 좌표(-1 왼쪽 ~ 1 오른쪽) -> 좌우 위치.
export function panFromScreenX(ndcX, maxPan = 0.7) {
  return Number.isFinite(ndcX) ? clamp(ndcX, -1, 1) * maxPan : 0;
}

// ---- 발걸음 ----
// 속도와 보폭에서 걸음 사이 시간(초). 거의 멈췄으면 Infinity.
export function footstepInterval(speed, stride, { min = 0.22, max = 1.2 } = {}) {
  if (!(speed > 0.05) || !(stride > 0)) return Infinity;
  return clamp(stride / speed, min, max);
}

// 걸은 거리로 걸음을 센다(프레임 속도와 무관하고, 느리게 걸으면 자연히 드문드문). advance(거리) 는 한 걸음이 닿았을 때 true(한 번에 한 걸음만), 그때 foot 은 0/1 로 번갈아 바뀐다.
export function createFootstepper(stride) {
  const s = { foot: 1, acc: stride / 2 };
  return {
    get foot() { return s.foot; },
    advance(dist) {
      if (!(dist > 0) || !(stride > 0)) return false;
      s.acc += dist;
      if (s.acc < stride) return false;
      s.acc %= stride;
      s.foot ^= 1;
      return true;
    },
    reset() { s.acc = stride / 2; },
  };
}

// ---- 같은 소리 연타 막기 ----
// allow(키, 지금(초), 최소 간격(초)): 마지막 허용 뒤 간격이 지났으면 true 로 기록한다. 막힌 시도는 기록하지 않는다. 시계가 되감기면 새로 시작한다.
export function createThrottle() {
  const last = new Map();
  return {
    allow(key, now, minInterval = 0) {
      if (!Number.isFinite(now)) return false;
      const prev = last.get(key);
      if (minInterval > 0 && prev !== undefined && now >= prev && now - prev < minInterval) return false;
      last.set(key, now);
      return true;
    },
    reset() { last.clear(); },
  };
}

// ---- 동시에 내는 소리 수 ----
// voices: [{ id, priority, start }], 새 소리의 priority 가 주어진다. 자리가 남으면 'play', 가득 차면 가장 덜 중요한(같으면 가장 오래된) 소리를 끊고('steal') 새 소리를 낸다.
// 새 소리가 지금 소리들 모두보다 덜 중요하면 새 소리를 버린다('drop').
export function voiceDecision(voices, incomingPriority, max) {
  if (!(max > 0)) return { action: 'drop' };
  const list = Array.isArray(voices) ? voices : [];
  if (list.length < max) return { action: 'play' };
  let victim = list[0];
  for (const v of list) if (v.priority < victim.priority || (v.priority === victim.priority && v.start < victim.start)) victim = v;
  if (victim.priority > incomingPriority) return { action: 'drop' };
  return { action: 'steal', id: victim.id };
}

// ---- 남의 소리 초당 상한(토큰 통) ----
// take(지금(초)): 처음에 burst 개, 이후 초당 perSecond 개씩 채워지며 하나 쓰면 true.
export function createRateLimiter({ perSecond, burst }) {
  let tokens = burst;
  let last = null;
  return {
    take(now) {
      if (!Number.isFinite(now)) return false;
      if (last !== null && now > last) tokens = Math.min(burst, tokens + (now - last) * perSecond);
      last = now;
      if (tokens < 1) return false;
      tokens -= 1;
      return true;
    },
  };
}

// ---- 공간별 앰비언스 ----
export const AMBIENCE_SPACES = ['yard', 'laundry', 'interview'];
export function ambienceTargets(spaceId) {
  return Object.fromEntries(AMBIENCE_SPACES.map((id) => [id, id === spaceId ? 1 : 0]));
}
// 현재 값을 목표 쪽으로 fadeSeconds 에 걸쳐 직선으로 옮긴다(넘치지 않는다).
export function stepFade(current, target, dt, fadeSeconds) {
  if (!(dt > 0)) return current;
  if (!(fadeSeconds > 0)) return target;
  const step = dt / fadeSeconds;
  return current < target ? Math.min(target, current + step) : Math.max(target, current - step);
}
// 소리가 난 공간과 내가 있는 공간이 같은가(공간을 말하지 않으면 지금 공간의 소리로 본다).
export function sameSpace(a, b) {
  return a == null || b == null || a === b;
}

// ---- 무작위 변주 ----
// 기준값 둘레 ±amount(비율) 안에서 흔든다.
export const varied = (base, amount, rng = Math.random) => base * (1 + amount * (2 * rng() - 1));
export const semitoneRatio = (semitones) => 2 ** (semitones / 12);

// ---- 바닥 ----
// 발소리 종류: 마당의 광장(돌)은 'stone', 나머지 마당은 'grass', 실내는 'tile'.
export function surfaceAt(spaceId, x, z, plaza) {
  if (spaceId !== 'yard') return 'tile';
  if (plaza && x >= plaza.x1 && x <= plaza.x2 && z >= plaza.z1 && z <= plaza.z2) return 'stone';
  return 'grass';
}

export const STEP_SOUND = { grass: 'stepGrass', stone: 'stepStone', tile: 'stepTile' }; // 바닥 종류 -> 발소리 이름
export const FOOTSTEP_STRIDE = 1.33; // 한 걸음의 거리(월드 단위): 걷기 클립 한 바퀴(0.667초)에 두 걸음이고 이동 속도가 4 이므로 4 x 0.333. 발이 땅에 닿는 박자와 맞는다

// ---- 말소리(웅얼거림) ----
const SYLLABLE_CHARS = 3.5; // 글자 몇 개에 음절 한 번
export function speechPlan(textLength) {
  return clamp(Math.round((Number.isFinite(textLength) ? textLength : 0) / SYLLABLE_CHARS), 2, 8);
}
// hud 말풍선 id -> 목소리 이름(플레이어·면접관 3명·다른 방문자).
const VOICES = new Set(['player', 'leader', 'hr', 'mentor']);
export function speakerVoice(id) {
  if (VOICES.has(id)) return id;
  return typeof id === 'string' && id.startsWith('r-') ? 'remote' : 'player';
}
// 다른 방문자 id 로 정한 목소리 높이 배율(같은 사람은 늘 같다).
export function remotePitch(id) {
  let h = 2166136261;
  for (const ch of String(id)) h = Math.imul(h ^ ch.codePointAt(0), 16777619) >>> 0;
  return 0.85 + 0.5 * ((h % 1000) / 999);
}

// ---- 장면 이벤트 -> 효과음 ----
const LAUGH_BOUNCE_FREQ = 5; // 면접관의 "폭소" 반응이 쓰는 튀기 빈도(돌발행동의 작은 튀기와 구별)
const hasBounce = (b) => Boolean(b) && Number.isFinite(b.freq) && b.freq >= LAUGH_BOUNCE_FREQ;
// 면접관 연기 이벤트(interviewCrew.apply 가 받는 { type, who, ... }) -> 효과음 이름(없으면 null).
export function crewCue(e) {
  if (!e) return null;
  switch (e.type) {
    case 'pose': return e.name === 'clap' ? 'applause' : null;
    case 'clip': return e.name === 'emote-no' ? 'ohno' : null;
    case 'fx': return hasBounce(e.fx?.bounce) ? 'laugh' : null;
    case 'stand':
    case 'sit': return 'scrape';
    default: return null;
  }
}
// 가벼운 반응 spec({ clip, clap?, bounce? }) -> 효과음 이름. 박수가 가장 먼저.
export function lightCue(spec) {
  if (!spec) return null;
  if (spec.clap) return 'applause';
  if (spec.clip === 'emote-no') return 'ohno';
  return hasBounce(spec.bounce) ? 'laugh' : null;
}
// 다른 방문자가 새로 시작한 동작 클립 -> 작은 효과음(공간에 따라 같은 클립도 다른 소리).
export function remoteAnimCue(anim, spaceId) {
  switch (anim) {
    case 'pick-up': return 'paperOut';
    case 'attack-melee-right': return spaceId === 'yard' ? 'toss' : 'swish';
    case 'interact-right': return spaceId === 'laundry' ? 'flap' : null;
    case 'emote-no': return 'sigh';
    case 'jump': return 'hop';
    default: return null;
  }
}
