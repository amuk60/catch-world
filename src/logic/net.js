// 멀티플레이 순수 로직: 메시지 검증, 전송 정책, 보간 버퍼, 닉네임, id, 가까운 순 선택. 다른 방문자가 보낸 데이터는 전부 믿을 수 없는 입력으로 본다.
import { SPACES } from './spaces.js';

export const SPACE_IDS = Object.keys(SPACES);
// 다른 방문자가 보낼 수 있는 동작 이름(플레이어 모델의 기본 상태 + 행동 클립). 이 밖의 값은 idle 로 본다.
export const ANIMS = ['idle', 'walk', 'sit', 'emote-no', 'pick-up', 'attack-melee-right', 'interact-right', 'emote-yes', 'interact-left', 'jump'];
export const OUTFITS = ['clean', 'dirty', 'tank', 'drying', 'dry'];

const ID_RE = /^[A-Za-z0-9_-]{4,24}$/;
const LIMIT_XZ = 5000; // 공간 좌표의 한계(가장 먼 공간이 600 부근)
const LIMIT_Y = 6;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const round = (v, digits = 2) => { const k = 10 ** digits; return Math.round(v * k) / k; };

// 각도를 (-PI, PI] 로.
export function wrapAngle(a) {
  const t = Math.atan2(Math.sin(a), Math.cos(a));
  return t;
}
// from -> to 로 가는 가장 짧은 각도 보간.
export function lerpAngle(from, to, k) {
  return from + Math.atan2(Math.sin(to - from), Math.cos(to - from)) * k;
}

// ---- id 와 닉네임 ----
// cryptoLike: getRandomValues 를 가진 객체(브라우저는 crypto, 시험은 가짜). 12자리 16진수.
export function makeId(cryptoLike = globalThis.crypto) {
  const bytes = new Uint8Array(6);
  cryptoLike.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// 문자열을 숫자로(FNV-1a). 닉네임을 id 로부터 정하는 데 쓴다.
function hash(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

// 같은 id 는 항상 같은 닉네임: "<형용사> <명사> #<100~999>". 개인정보는 쓰지 않는다.
export function nickFor(id, adjectives, nouns) {
  const h = hash(String(id));
  const adj = adjectives.length ? adjectives[h % adjectives.length] : '방문자';
  const noun = nouns.length ? nouns[Math.floor(h / 7) % nouns.length] : '';
  const num = 100 + (Math.floor(h / 131) % 900);
  return `${adj} ${noun} #${num}`.replace(/\s+/g, ' ').trim();
}

// 받은 닉네임을 다듬는다: 문자열이 아니면 null. 제어문자·꺾쇠 제거, 공백 정리, 최대 글자 수로 자른다. 비면 null.
export function cleanNick(raw, max = 24) {
  if (typeof raw !== 'string') return null;
  // eslint-disable-next-line no-control-regex
  const s = raw.replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202f\u2060-\u206f<>&"'`]/g, '').replace(/\s+/g, ' ').trim();
  const cut = [...s].slice(0, max).join('').trim();
  return cut || null;
}

// ---- 상태 메시지 ----
// 보낼 때: 필드를 모아 소수 둘째 자리로 줄인다. local: { space, x, z, y, rotY, anim, outfit, seat }.
export function buildState(self, local, t) {
  return {
    id: self.id, nick: self.nick, space: local.space,
    x: round(local.x), z: round(local.z), y: round(local.y ?? 0), rotY: round(wrapAngle(local.rotY ?? 0)),
    anim: local.anim, outfit: local.outfit, seat: Boolean(local.seat), t,
  };
}

// 받은 값을 검사해 깨끗한 상태 객체로 바꾼다. 형식이 틀리면 null(버린다). 모르는 필드는 복사하지 않는다.
// 숫자는 유한해야 하고 범위로 자른다. 동작·옷은 목록에 없으면 기본값. 닉네임은 다듬고 비면 id 로 만든 이름.
export function validateState(raw, { adjectives = [], nouns = [], nickMax = 24 } = {}) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const { id, nick, space, x, z, y, rotY, anim, outfit, seat, t } = raw;
  if (typeof id !== 'string' || !ID_RE.test(id)) return null;
  if (typeof space !== 'string' || !SPACE_IDS.includes(space)) return null;
  if (!isNum(x) || !isNum(z) || !isNum(rotY) || !isNum(t)) return null;
  if (y !== undefined && !isNum(y)) return null;
  return {
    id,
    nick: cleanNick(nick, nickMax) ?? nickFor(id, adjectives, nouns),
    space,
    x: clamp(x, -LIMIT_XZ, LIMIT_XZ), z: clamp(z, -LIMIT_XZ, LIMIT_XZ), y: clamp(y ?? 0, 0, LIMIT_Y),
    rotY: wrapAngle(clamp(rotY, -1000, 1000)),
    anim: ANIMS.includes(anim) ? anim : 'idle',
    outfit: OUTFITS.includes(outfit) ? outfit : 'clean',
    seat: seat === true,
    t: clamp(t, 0, 1e15),
  };
}

// ---- 전송 정책 ----
// 바뀐 것이 있을 때만 최대 hz 로, 가만히 있어도 heartbeatMs 마다 한 번. 공간·동작·옷·앉기가 바뀌면 (minGapMs 만 지켜) 즉시. hasPeers 가 false 면 보내지 않는다.
// update(nowMs, state, hasPeers) -> true 면 보낸다(이 호출이 마지막으로 보낸 시각을 갱신한다). force() 는 다음 update 가 (간격만 지켜) 보내게 한다(새 방문자가 들어왔을 때).
export function createSendPolicy({ hz = 5, heartbeatMs = 1000, epsPos = 0.05, epsRot = 0.05, minGapMs = 40 } = {}) {
  const interval = 1000 / hz;
  let last = null; // 마지막으로 보낸 상태
  let lastAt = -Infinity;
  let forced = false;
  return {
    force() { forced = true; },
    reset() { last = null; lastAt = -Infinity; forced = false; },
    update(nowMs, s, hasPeers) {
      if (!hasPeers) return false;
      const since = nowMs - lastAt;
      if (since < minGapMs) return false;
      let send = false;
      if (!last || forced) send = true;
      else if (s.space !== last.space || s.anim !== last.anim || s.outfit !== last.outfit || s.seat !== last.seat) send = true;
      else if (since >= heartbeatMs) send = true;
      else if (since >= interval) {
        const moved = Math.hypot(s.x - last.x, s.z - last.z, (s.y ?? 0) - (last.y ?? 0)) > epsPos;
        const turned = Math.abs(wrapAngle(s.rotY - last.rotY)) > epsRot;
        send = moved || turned;
      }
      if (!send) return false;
      last = { space: s.space, anim: s.anim, outfit: s.outfit, seat: s.seat, x: s.x, z: s.z, y: s.y ?? 0, rotY: s.rotY };
      lastAt = nowMs;
      forced = false;
      return true;
    },
  };
}

// ---- 보간 버퍼(방문자 한 명) ----
// push(state, atMs): 받은 시각으로 표본을 쌓는다. 공간이 바뀌었거나 teleportDist 이상 떨어진 점프면 이전 표본을 버려 곧장 옮긴다.
// sample(nowMs): nowMs - delayMs 시점의 위치·방향을 두 표본 사이를 선형(각도는 짧은 쪽)으로 보간해 { x, y, z, rotY, speed, anim, outfit, seat, space }. 표본이 없으면 null.
// 마지막 표본보다 뒤면 그 표본의 anim 이 walk 일 때만 마지막 속도로 최대 extrapolateMs 까지 더 내다보고, 아니면 멈춘다.
export function createInterpBuffer({ delayMs = 200, maxSamples = 16, teleportDist = 8, extrapolateMs = 120 } = {}) {
  const samples = [];
  const pick = (s) => ({ anim: s.anim, outfit: s.outfit, seat: s.seat, space: s.space });
  return {
    get size() { return samples.length; },
    get latest() { return samples[samples.length - 1] ?? null; },
    push(state, atMs) {
      const last = samples[samples.length - 1];
      if (last && (last.space !== state.space || Math.hypot(state.x - last.x, state.z - last.z) > teleportDist)) samples.length = 0;
      const prev = samples[samples.length - 1];
      const at = prev && atMs <= prev.at ? prev.at + 1 : atMs;
      samples.push({ at, x: state.x, y: state.y, z: state.z, rotY: state.rotY, anim: state.anim, outfit: state.outfit, seat: state.seat, space: state.space });
      if (samples.length > maxSamples) samples.shift();
    },
    sample(nowMs) {
      if (!samples.length) return null;
      const rt = nowMs - delayMs;
      const first = samples[0];
      if (rt <= first.at) return { x: first.x, y: first.y, z: first.z, rotY: first.rotY, speed: 0, ...pick(first) };
      const n = samples.length;
      const end = samples[n - 1];
      if (rt >= end.at) {
        const prev = samples[n - 2];
        if (!prev || end.anim !== 'walk') return { x: end.x, y: end.y, z: end.z, rotY: end.rotY, speed: 0, ...pick(end) };
        const sec = (end.at - prev.at) / 1000;
        const vx = (end.x - prev.x) / sec;
        const vz = (end.z - prev.z) / sec;
        const ahead = Math.min(rt - end.at, extrapolateMs) / 1000;
        return { x: end.x + vx * ahead, y: end.y, z: end.z + vz * ahead, rotY: end.rotY, speed: Math.hypot(vx, vz), ...pick(end) };
      }
      let i = n - 2;
      while (i > 0 && samples[i].at > rt) i--;
      const a = samples[i];
      const b = samples[i + 1];
      const span = b.at - a.at;
      const k = span > 0 ? (rt - a.at) / span : 1;
      return {
        x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, z: a.z + (b.z - a.z) * k, rotY: lerpAngle(a.rotY, b.rotY, k),
        speed: span > 0 ? Math.hypot(b.x - a.x, b.z - a.z) / (span / 1000) : 0, ...pick(a),
      };
    },
  };
}

// 마지막으로 받은 뒤 staleMs 가 지났는가.
export function isStale(lastSeenMs, nowMs, staleMs) {
  return nowMs - lastSeenMs > staleMs;
}

// items: [{ id, x, z }] 중 from 에 가까운 max 개(가까운 순). max 이하면 그대로.
export function nearestN(items, from, max) {
  if (items.length <= max) return items.slice();
  return items
    .map((it) => ({ it, d: Math.hypot(it.x - from.x, it.z - from.z) }))
    .sort((p, q) => p.d - q.d)
    .slice(0, Math.max(0, max))
    .map((p) => p.it);
}

// ---- 말 한마디(면접 답변·돌발행동) 메시지 ----
// 글은 절대 보내지 않는다: 질문 번호와 답변 번호(또는 돌발행동 id)만 보내고, 받는 쪽이 자기 config 에서 글을 찾는다. 받은 값은 전부 믿을 수 없는 입력이다.
// 보낼 때: ans 는 { q, a }, imp 는 { imp }. space 는 보내는 사람이 있는 공간.
export function buildSay(self, space, say) {
  if (say?.ty === 'imp') return { k: 'say', id: self.id, space, ty: 'imp', imp: say.imp };
  return { k: 'say', id: self.id, space, ty: 'ans', q: say?.q, a: say?.a };
}

// 받은 값을 검사해 깨끗한 { id, space, ty:'ans', q, a } | { id, space, ty:'imp', imp } 로. 틀리면 null.
// limits: { questions(질문 개수), answers(질문당 답변 개수), improvs(허용하는 돌발행동 id 목록) }. 정수 범위·목록에 없으면 버린다. 모르는 필드는 복사하지 않는다.
export function validateSay(raw, limits) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || raw.k !== 'say' || !limits) return null;
  const { id, space, ty } = raw;
  if (typeof id !== 'string' || !ID_RE.test(id)) return null;
  if (typeof space !== 'string' || !SPACE_IDS.includes(space)) return null;
  if (ty === 'ans') {
    const { q, a } = raw;
    if (!Number.isInteger(q) || !Number.isInteger(a)) return null;
    if (q < 0 || q >= limits.questions || a < 0 || a >= limits.answers) return null;
    return { id, space, ty, q, a };
  }
  if (ty === 'imp') {
    const { imp } = raw;
    if (typeof imp !== 'string' || !Array.isArray(limits.improvs) || !limits.improvs.includes(imp)) return null;
    return { id, space, ty, imp };
  }
  return null;
}

// 보낸 사람마다 minGapMs 안에 또 온 말은 버린다(받는 쪽과 보내는 쪽이 같이 쓴다). allow(id, nowMs) -> 통과하면 true(그 시각을 기록). clear() 로 모두 잊는다.
export function createSayLimiter(minGapMs = 1500) {
  const last = new Map();
  return {
    allow(id, nowMs) {
      const prev = last.get(id);
      if (prev !== undefined && nowMs - prev < minGapMs) return false;
      last.set(id, nowMs);
      if (last.size > 200) for (const [k, t] of last) if (nowMs - t >= minGapMs) last.delete(k); // 오래된 기록 정리(상한)
      return true;
    },
    clear() { last.clear(); },
  };
}

// ---- 세탁소 빨랫줄·세탁기 효과 메시지 ----
// 같은 방(세탁소)의 방문자끼리만 의미가 있다. 숫자뿐이고 글은 없다. k: 'line'(칸 하나) | 'lines'(내가 널어 둔 전체) | 'fx'(세탁기 효과).
//   { k:'line', id, space:'laundry', slot, c(-1 걷음, 0..5 파스텔, 6 흰 셔츠), t }
//   { k:'lines', id, space:'laundry', e:[[slot, c, t], ...] }
//   { k:'fx', id, space:'laundry', ty:'wash', i(세탁기 번호) }
export const ROOM_KINDS = ['line', 'lines', 'fx'];

export function buildRoomMsg(self, space, msg) {
  if (msg?.k === 'line') return { k: 'line', id: self.id, space, slot: msg.slot, c: msg.c, t: msg.t };
  if (msg?.k === 'lines') return { k: 'lines', id: self.id, space, e: msg.e };
  return { k: 'fx', id: self.id, space, ty: 'wash', i: msg?.i };
}

// limits: { slots(전체 칸 수), shared(공용 파스텔 칸 수), washers(세탁기 수), maxT(t 의 상한: 지금 + 여유) }. 틀리면 null.
// 칸 종류 규칙: 흰 셔츠(6)는 개인 칸(slot >= shared)에만, 파스텔(0..5)은 공용 칸(slot < shared)에만.
export function validateRoomMsg(raw, limits) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || !limits || !ROOM_KINDS.includes(raw.k)) return null;
  const { id, space } = raw;
  if (typeof id !== 'string' || !ID_RE.test(id)) return null;
  if (space !== 'laundry') return null;
  const slotOk = (s) => Number.isInteger(s) && s >= 0 && s < limits.slots;
  const entryOk = (slot, c, t) => slotOk(slot) && Number.isInteger(c) && c >= 0 && c <= 6 && (c === 6) === (slot >= limits.shared) && isNum(t) && t >= 0 && t <= limits.maxT;
  if (raw.k === 'line') {
    const { slot, c, t } = raw;
    if (c === -1) return slotOk(slot) && isNum(t) && t >= 0 && t <= limits.maxT ? { k: 'line', id, space, slot, c, t } : null;
    return entryOk(slot, c, t) ? { k: 'line', id, space, slot, c, t } : null;
  }
  if (raw.k === 'lines') {
    const { e } = raw;
    if (!Array.isArray(e) || e.length > limits.slots) return null;
    const seen = new Set();
    const out = [];
    for (const row of e) {
      if (!Array.isArray(row) || row.length !== 3 || !entryOk(row[0], row[1], row[2]) || seen.has(row[0])) return null;
      seen.add(row[0]);
      out.push([row[0], row[1], row[2]]);
    }
    return { k: 'lines', id, space, e: out };
  }
  const { ty, i } = raw;
  if (ty !== 'wash' || !Number.isInteger(i) || i < 0 || i >= limits.washers) return null;
  return { k: 'fx', id, space, ty, i };
}
