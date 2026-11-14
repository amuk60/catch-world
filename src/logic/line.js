// 세탁소 빨랫줄 공유 (순수). 줄은 칸 N 개: 앞쪽 shared 칸은 파스텔 셔츠(누구나 돌려 쓴다), 뒤쪽 personal 칸은 방 정원만큼의 흰 "내 셔츠" 칸(사람마다 하나).
// 칸 값 c: 0..5 파스텔 색 번호, 6(WHITE) 흰 내 셔츠. 한 칸의 상태는 { c, t(시각 ms) }.
//
// 소유자 기준(owner-authoritative) 공유: 각자는 "내가 널은 것"만 책임지고(own), 다른 방문자의 것은 그 사람이 보낸 목록 그대로 둔다(others).
//  - 내가 널거나 걷으면 칸 하나짜리 이벤트를 보내고, 가끔 내 목록 전체(snapshot)를 보낸다. 받는 쪽은 그 방문자의 목록을 통째로 갈아 끼운다(그래서 걷은 빨래가 남지 않는다).
//  - 방문자가 나가거나(prune) 오래 소식이 없으면 그 사람의 빨래도 걷힌다(유령 빨래 없음). 돌아와 다시 목록을 보내면 다시 걸린다.
//  - 한 칸을 둘이 차지하면 t 가 더 새로운 쪽이 이기고(같으면 id 가 작은 쪽), 진 쪽은 파스텔이면 포기하고 흰 셔츠면 빈 개인 칸으로 옮긴다(resolve).
// 화면은 view() 가 칸마다 이긴 항목을 돌려준다.
export const WHITE = 6;
export const REMOVED = -1; // 이벤트에서 "걷었다"
const MAX_OWNERS = 16; // 기억하는 다른 방문자 수 상한

// 문자열 해시(개인 칸 선호 위치).
function hash(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

export function createLine({ shared = 6, personal = 6, selfId = 'self' } = {}) {
  const N = shared + personal;
  const own = new Map(); // slot -> { c, t }
  const others = new Map(); // ownerId -> { seen, entries: Map(slot -> { c, t }) }
  const isPersonal = (slot) => slot >= shared;
  const valid = (slot, c) => Number.isInteger(slot) && slot >= 0 && slot < N && Number.isInteger(c) && c >= 0 && c <= WHITE && (c === WHITE) === isPersonal(slot);
  const beats = (a, b) => a.t > b.t || (a.t === b.t && a.owner < b.owner); // a 가 b 를 이기는가

  function winner(slot) {
    let best = null;
    const consider = (owner, e) => { if (e && (!best || beats({ t: e.t, owner }, best))) best = { c: e.c, t: e.t, owner }; };
    consider(selfId, own.get(slot));
    for (const [id, o] of others) consider(id, o.entries.get(slot));
    return best;
  }

  const line = {
    slots: N, shared, personal,
    // 칸마다 이긴 항목 { c, t, owner, mine } 또는 null.
    view() {
      return Array.from({ length: N }, (_, slot) => {
        const w = winner(slot);
        return w && { ...w, mine: w.owner === selfId };
      });
    },
    ownWhiteSlot() {
      for (const [slot, e] of own) if (e.c === WHITE) return slot;
      return -1;
    },
    // 파스텔 셔츠 한 벌(색 번호 color 0..5)을 공용 칸에 건다: 빈 칸이 있으면 첫 빈 칸, 가득이면 가장 오래된 칸을 바꾼다. 이벤트 { slot, c, t }.
    hangPastel(color, nowMs) {
      let slot = -1;
      let oldest = Infinity;
      for (let i = 0; i < shared; i++) {
        const w = winner(i);
        if (!w) { slot = i; oldest = -Infinity; break; }
        if (w.t < oldest) { oldest = w.t; slot = i; }
      }
      const w = winner(slot);
      const t = Math.max(nowMs, w ? w.t + 1 : 0);
      own.set(slot, { c: ((color % 6) + 6) % 6, t });
      return { slot, c: own.get(slot).c, t };
    },
    // 내 흰 셔츠를 내 개인 칸에 건다(이미 걸려 있으면 그대로). 선호 칸은 id 로 정하고 차 있으면 다음 빈 칸으로 양보한다. 이벤트 { slot, c, t }.
    hangWhite(nowMs) {
      const have = line.ownWhiteSlot();
      if (have >= 0) return { slot: have, ...own.get(have) };
      const pref = hash(selfId) % personal;
      let slot = shared + pref;
      for (let k = 0; k < personal; k++) {
        const s = shared + ((pref + k) % personal);
        if (!winner(s)) { slot = s; break; }
      }
      const w = winner(slot);
      const t = Math.max(nowMs, w ? w.t + 1 : 0);
      own.set(slot, { c: WHITE, t });
      return { slot, c: WHITE, t };
    },
    // 흰 셔츠를 걷는다(입었을 때). 걷은 칸의 이벤트 { slot, c: REMOVED, t } 또는 걸려 있지 않으면 null.
    removeWhite(nowMs) {
      const slot = line.ownWhiteSlot();
      if (slot < 0) return null;
      const t = Math.max(nowMs, own.get(slot).t + 1);
      own.delete(slot);
      return { slot, c: REMOVED, t };
    },
    // 내가 널어 둔 것 전체: [[slot, c, t], ...].
    snapshot() { return [...own].map(([slot, e]) => [slot, e.c, e.t]); },
    get ownCount() { return own.size; },

    // 다른 방문자(owner)의 목록 전체를 받았다. entries: [[slot, c, t]]. 형식이 틀린 항목은 무시한다. 반환: 내가 옮겨야 하는 이벤트들(resolve).
    ingestSnapshot(owner, entries, nowMs) {
      if (owner === selfId || !Array.isArray(entries)) return [];
      let o = others.get(owner);
      if (!o) {
        if (others.size >= MAX_OWNERS) return [];
        o = { seen: nowMs, entries: new Map() };
        others.set(owner, o);
      }
      o.seen = nowMs;
      o.entries.clear();
      for (const e of entries) {
        if (!Array.isArray(e) || !valid(e[0], e[1]) || !Number.isFinite(e[2])) continue;
        o.entries.set(e[0], { c: e[1], t: e[2] });
      }
      return line.resolve(nowMs);
    },
    // 다른 방문자의 칸 하나가 바뀌었다(c 가 REMOVED 면 걷음). 그 방문자의 같은 칸 기록보다 오래된 t 는 무시한다(순서가 뒤바뀐 옛 이벤트).
    ingestEvent(owner, slot, c, t, nowMs) {
      if (owner === selfId || !Number.isFinite(t)) return [];
      if (c !== REMOVED && !valid(slot, c)) return [];
      if (c === REMOVED && !(Number.isInteger(slot) && slot >= 0 && slot < N)) return [];
      let o = others.get(owner);
      if (!o) {
        if (c === REMOVED || others.size >= MAX_OWNERS) return [];
        o = { seen: nowMs, entries: new Map() };
        others.set(owner, o);
      }
      o.seen = nowMs;
      const prev = o.entries.get(slot);
      if (prev && t < prev.t) return [];
      if (c === REMOVED) o.entries.delete(slot);
      else o.entries.set(slot, { c, t });
      return line.resolve(nowMs);
    },
    drop(owner) { return others.delete(owner); },
    // alive: 아직 방에 있는 방문자 id 들의 Set. 없어졌거나 staleMs 넘게 소식이 없으면 그 사람의 빨래를 걷는다. 걷은 사람 수.
    prune(alive, nowMs, staleMs = 15000) {
      let n = 0;
      for (const [id, o] of others) {
        if (!alive.has(id) || nowMs - o.seen > staleMs) { others.delete(id); n++; }
      }
      return n;
    },
    // 모든 다른 방문자의 빨래를 걷는다(방을 나갈 때): 내 것만 남는다.
    dropOthers() { others.clear(); },
    // 내 것이 다른 사람에게 졌는지 살펴 정리한다: 파스텔이면 포기, 흰 셔츠면 빈 개인 칸으로 이사. 보낼 이벤트 목록.
    resolve(nowMs) {
      const events = [];
      for (const [slot, e] of [...own]) {
        const w = winner(slot);
        if (!w || w.owner === selfId) continue;
        own.delete(slot);
        if (e.c !== WHITE) continue;
        events.push({ slot, c: REMOVED, t: Math.max(nowMs, w.t + 1) });
        const moved = line.hangWhite(nowMs);
        events.push(moved);
      }
      return events;
    },
    reset() { own.clear(); others.clear(); },
  };
  return line;
}
