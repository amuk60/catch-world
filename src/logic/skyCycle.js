// 마당 하늘 시간대 (순수). 실제 현지 시각을 따라 새벽 -> 아침 -> 노을 -> 저녁/밤 -> 다시 새벽. 단계 값(시작 시각·색·세기·해 방향)은 config.js 의 SKY_CYCLE.
// skyAt(minutes) 는 하루 중 시각(분, 0~1440: 00:00 부터)의 시간대 이름과, 키프레임 사이를 부드럽게 섞은 하늘 값을 돌려준다(그리는 쪽: atmosphere.js).
// 각 단계는 끝 blendMinutes 동안 다음 단계로 넘어간다(smoothstep). 마지막 단계(밤)는 자정을 넘어 첫 단계(새벽) 시작까지 이어진다.
// 색은 sRGB [r, g, b](0~1)로 섞는다. out 을 넘기면 그 객체를 채워 돌려준다(매 프레임 새 객체를 만들지 않게).
import { SKY_CYCLE } from '../config.js';

const DAY = 1440;
const COLOR_KEYS = ['skyTop', 'skyHorizon', 'glow', 'fog', 'sunColor', 'hemiSky', 'hemiGround'];
const NUMBER_KEYS = ['fogNear', 'fogFar', 'sun', 'hemi', 'fire'];
export const SKY_PHASE_NAMES = ['dawn', 'morning', 'sunset', 'evening'];

const clamp01 = (v) => Math.min(1, Math.max(0, v));
const smooth = (k) => k * k * (3 - 2 * k);
const hexRgb = (hex) => [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255];
const wrap = (m) => ((m % DAY) + DAY) % DAY;

// 'HH:MM' -> 분(0~1439). 형식이 틀리면 null.
export function parseClock(text) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(text ?? '').trim());
  if (!m) return null;
  const h = Number(m[1]);
  const mi = Number(m[2]);
  if (h > 23 || mi > 59) return null;
  return h * 60 + mi;
}

// Date -> 하루 중 분(초까지 소수로).
export function minutesOfDay(date) {
  return date.getHours() * 60 + date.getMinutes() + date.getSeconds() / 60 + date.getMilliseconds() / 60000;
}

// 해 높이·방위(도) -> 단위 방향 [x, y, z](해가 있는 쪽).
export function sunDirection(elevDeg, azimDeg) {
  const e = (elevDeg * Math.PI) / 180;
  const a = (azimDeg * Math.PI) / 180;
  return [Math.cos(e) * Math.cos(a), Math.sin(e), Math.cos(e) * Math.sin(a)];
}

// 단계마다 시작(분)과 길이(분, 자정을 넘는 단계도 바르게).
export function phaseSpans(cfg = SKY_CYCLE) {
  const starts = cfg.phases.map((p) => parseClock(p.start));
  return cfg.phases.map((p, i) => {
    const start = starts[i];
    const next = starts[(i + 1) % starts.length];
    return { phase: p, start, length: wrap(next - start) || DAY };
  });
}

// 빈 하늘 값(skyAt 의 out 으로 쓴다).
export function createSkyState() {
  const s = { name: 'morning', next: 'sunset', blend: 0, sunDir: [0, 1, 0] };
  for (const k of COLOR_KEYS) s[k] = [0, 0, 0];
  for (const k of NUMBER_KEYS) s[k] = 0;
  return s;
}

// minutes(하루 중 분, 범위 밖·음수도 하루로 접는다): 지금 단계(name)·다음 단계(next)·넘어가는 정도(blend 0~1)와 섞인 값.
export function skyAt(minutes, cfg = SKY_CYCLE, out = createSkyState()) {
  const spans = phaseSpans(cfg);
  const m = Number.isFinite(minutes) ? wrap(minutes) : 0;
  let i = 0;
  let u = 0;
  for (let j = 0; j < spans.length; j++) {
    const off = wrap(m - spans[j].start);
    if (off < spans[j].length) { i = j; u = off; break; }
  }
  const a = spans[i].phase;
  const b = spans[(i + 1) % spans.length].phase;
  const len = spans[i].length;
  const blendLen = Math.min(a.blendMinutes ?? 0, len);
  const k = blendLen > 0 ? smooth(clamp01((u - (len - blendLen)) / blendLen)) : 0;
  out.name = a.name;
  out.next = b.name;
  out.blend = k;
  for (const key of COLOR_KEYS) {
    const ca = hexRgb(a[key]);
    const cb = hexRgb(b[key]);
    for (let j = 0; j < 3; j++) out[key][j] = ca[j] + (cb[j] - ca[j]) * k;
  }
  for (const key of NUMBER_KEYS) out[key] = a[key] + (b[key] - a[key]) * k;
  // 해 방향은 두 방향을 섞어 다시 단위 길이로(정반대에 가까워도 높이 성분이 있어 0 이 되지 않는다).
  const da = sunDirection(a.sunElev, a.sunAzim);
  const db = sunDirection(b.sunElev, b.sunAzim);
  let l = 0;
  for (let j = 0; j < 3; j++) { out.sunDir[j] = da[j] + (db[j] - da[j]) * k; l += out.sunDir[j] ** 2; }
  l = Math.sqrt(l);
  if (l < 1e-6) { out.sunDir[0] = 0; out.sunDir[1] = 1; out.sunDir[2] = 0; } else for (let j = 0; j < 3; j++) out.sunDir[j] /= l;
  // 최소 밝기 보장(어두운 시간대에도 주변이 읽히게).
  out.hemi = Math.max(out.hemi, cfg.minHemi ?? 0);
  out.sun = Math.max(out.sun, cfg.minSun ?? 0);
  return out;
}

// 단계 이름 -> 그 단계 안정 구간(넘어가기 전)의 가운데 시각(분). 모르는 이름이면 null.
export function phaseMiddle(name, cfg = SKY_CYCLE) {
  const s = phaseSpans(cfg).find((x) => x.phase.name === name);
  if (!s) return null;
  return wrap(s.start + Math.max(0, s.length - (s.phase.blendMinutes ?? 0)) / 2);
}

// 확인용 주소 옵션: ?sky=HH:MM(또는 단계 이름) -> 고정 시각(분, 없으면 null), ?skyspeed=N -> 시간 배율(없으면 고정이면 0, 아니면 1).
export function skyClockParams(search, cfg = SKY_CYCLE) {
  let q = null;
  try { q = new URLSearchParams(search || ''); } catch { /* 무시 */ }
  const raw = q?.get('sky') ?? null;
  const fixed = raw ? (parseClock(raw) ?? phaseMiddle(raw, cfg)) : null;
  const sp = Number(q?.get('skyspeed'));
  const speed = q?.get('skyspeed') && Number.isFinite(sp) && sp >= 0 && sp <= 100000 ? sp : (fixed === null ? 1 : 0);
  return { fixed, speed };
}

// 지금 보여 줄 하루 중 분: 고정이 있으면 고정 + 흐른 초 x 배율, 없으면 현지 시각 + 흐른 초 x (배율 - 1)(배율 1 이면 실제 시각 그대로).
export function skyMinutes({ fixed, speed }, nowMinutes, elapsedSeconds) {
  const extra = (elapsedSeconds / 60) * (fixed === null ? speed - 1 : speed);
  return wrap((fixed ?? nowMinutes) + extra);
}
