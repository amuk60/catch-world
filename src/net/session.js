// 멀티플레이 세션(THREE 없음, 시험 가능): 전송(transport)을 감싸 공간별 방에 들어가고, 내 상태를 정책에 맞춰 보내고,
// 받은 메시지를 검사·보간 버퍼에 쌓고, 오래 소식 없는 방문자를 지운다. 게임 루프로는 절대 예외를 던지지 않는다.
import {
  buildState, validateState, createSendPolicy, createInterpBuffer, createDeadReckoner, createVelocityEstimator, isStale, nearestN, buildSay, validateSay, createSayLimiter, buildRoomMsg, validateRoomMsg, buildChat, validateChat,
} from '../logic/net.js';
import { createChatLimiter } from '../logic/quickChat.js';
import { shardRoom, nextShard } from '../logic/shards.js';

// transport: net/transport.js 의 인터페이스. self: { id, nick }. cfg: config 의 MULTIPLAYER. now: () => ms.
// roomLimits: 세탁소 빨랫줄·세탁기 효과 메시지(k: 'line' | 'lines' | 'fx')를 받을 때의 허용 범위 { slots, shared, washers }. 없으면 보내지도 받지도 않는다.
// chatLimits: 인사·응원말 프리셋(k: 'chat')을 받을 때의 허용 범위 { count }. 없으면 보내지도 받지도 않는다.
// sayLimits: 면접 답변·돌발행동 한마디(k: 'say')를 받을 때의 허용 범위 { questions, answers, improvs }. 없으면 한마디는 보내지도 받지도 않는다.
export function createSession({ transport, self, cfg, now = () => performance.now(), clock = () => Date.now(), sayLimits = null, roomLimits = null, chatLimits = null }) {
  const remotes = new Map(); // id -> { id, nick, buffer, lastSeen, lastT, lastRecv }
  const peers = new Set(); // 지금 방에 있는 다른 방문자 id(전송 쪽 presence)
  const policy = createSendPolicy({
    hz: cfg.sendHz, minGapMs: cfg.minGapMs, heartbeatMs: cfg.heartbeatMs, heartbeatMovingMs: cfg.heartbeatMovingMs, epsPos: cfg.epsPos, epsRot: cfg.epsRot, epsSpeed: cfg.epsSpeed,
    settleMs: cfg.settleMs, sustainedHz: cfg.sustainedHz, burst: cfg.burst, maxExtrapMs: cfg.maxExtrapMs,
  });
  const velocity = createVelocityEstimator(); // local 에 속도(vx, vz)가 없으면 프레임 간 위치 차이로 구한다
  const validateOpts = { adjectives: cfg.nickAdjectives, nouns: cfg.nickNouns };
  let space = null; // 지금 들어가 있는(또는 들어가는 중인) 공간
  let shard = 1; // 지금 들어가 있는(또는 살펴보는 중인) 방 번호
  let tState = 'connecting'; // 전송 상태: 'connecting' | 'ready' | 'lost'
  let phase = 'probing'; // 'probing'(방 인원을 세는 중) | 'joined' | 'full'(모든 방이 참: 멀티플레이만 끈다)
  let probeUntil = 0;
  let fullAt = 0;
  let active = true; // 숨김·유휴가 아닐 때만 내 상태를 보낸다
  const cap = cfg.roomCap ?? 8;
  const maxShards = cfg.maxShards ?? 6;
  const probeMs = cfg.shardProbeMs ?? 0;
  let status = 'connecting'; // 'connecting' | 'ready' | 'lost' | 'full' | 'off'
  let disposed = false;
  let rejected = 0;
  let sent = 0;
  let received = 0;
  let joinGen = 0;
  const listeners = new Set();
  const sayListeners = new Set();
  const sayIn = createSayLimiter(cfg.sayGapMs ?? 1500); // 보낸 사람마다 받는 간격
  const sayOut = createSayLimiter(cfg.sayGapMs ?? 1500); // 내가 보내는 간격
  const chatListeners = new Set();
  const chatIn = createChatLimiter({ perSenderMs: cfg.chatGapMs ?? 2000, globalMax: cfg.chatGlobalMax ?? 6, windowMs: cfg.chatGlobalWindowMs ?? 3000 });
  const chatOut = createSayLimiter(cfg.chatGapMs ?? 2000);
  const roomListeners = new Set();
  const ROOM_GAP = { line: cfg.lineGapMs ?? 150, lines: cfg.linesGapMs ?? 1500, fx: cfg.fxGapMs ?? 700 }; // 종류별 최소 간격(ms): 보낸 사람마다 받고, 나도 이 간격으로만 보낸다
  const roomIn = Object.fromEntries(Object.entries(ROOM_GAP).map(([k, gap]) => [k, createSayLimiter(gap)]));
  const roomOut = Object.fromEntries(Object.entries(ROOM_GAP).map(([k, gap]) => [k, createSayLimiter(gap)]));
  const roomLimitsAt = () => (roomLimits ? { ...roomLimits, maxT: clock() + 60000 } : null); // 시각 t 는 지금보다 1분 넘게 앞서면 버린다
  const notify = () => { for (const fn of listeners) { try { fn(api); } catch { /* 표시 쪽 오류는 무시 */ } } };

  // 전송 상태와 단계에서 겉으로 보이는 상태를 정한다. 준비(ready)가 아니면 방문자는 모두 지운다.
  function refreshStatus() {
    if (disposed) return;
    const next = phase === 'full' ? 'full' : tState === 'lost' ? 'lost' : tState === 'ready' && phase === 'joined' ? 'ready' : 'connecting';
    if (status === next) return;
    status = next;
    if (next !== 'ready') remotes.clear();
    notify();
  }

  function onMessage(raw) {
    try { ingest(raw, now()); } catch { rejected++; }
  }

  function onPresence(ev) {
    if (disposed || !ev || typeof ev.id !== 'string' || ev.id === self.id) return;
    if (ev.type === 'join') {
      if (!peers.has(ev.id)) { peers.add(ev.id); policy.force(); notify(); }
    } else if (ev.type === 'leave') {
      peers.delete(ev.id);
      remotes.delete(ev.id);
      notify();
    }
  }

  function onStatus(s) {
    if (disposed) return;
    if (s === 'ready') {
      tState = 'ready';
      policy.force();
      if (phase === 'probing') {
        if (probeMs <= 0) phase = 'joined'; else probeUntil = now() + probeMs;
      }
    } else if (s === 'lost') {
      tState = 'lost';
      peers.clear();
    }
    refreshStatus();
  }

  transport.onMessage(onMessage);
  transport.onPresence(onPresence);
  transport.onStatus?.(onStatus);

  // space 의 shard 번 방에 들어간다(이전 방은 나온다). 들어간 뒤 probeMs 동안 다른 사람 수를 세어 머물지 정한다(update 가 판단).
  function join(nextSpace, nextShardNo = 1) {
    space = nextSpace;
    shard = nextShardNo;
    joinGen++;
    remotes.clear();
    peers.clear();
    sayIn.clear();
    for (const l of Object.values(roomIn)) l.clear();
    policy.reset();
    tState = 'connecting';
    phase = 'probing';
    refreshStatus();
    notify();
    try {
      transport.disconnect();
      const p = transport.connect(shardRoom(cfg.channelPrefix ?? '', nextSpace, nextShardNo), { id: self.id });
      const gen = joinGen;
      Promise.resolve(p).catch(() => { if (gen === joinGen) { tState = 'lost'; refreshStatus(); } });
    } catch {
      tState = 'lost';
      refreshStatus();
    }
  }

  // 방 인원을 센 결과로 머물거나 다음 방으로 가거나 멀티플레이를 끈다.
  function decide(nowMs) {
    const r = nextShard({ shard, others: peers.size, cap, maxShards });
    if (r.action === 'stay') {
      phase = 'joined';
      policy.force();
      refreshStatus();
    } else if (r.action === 'try') {
      join(space, r.shard);
    } else {
      phase = 'full';
      fullAt = nowMs;
      peers.clear();
      remotes.clear();
      try { transport.disconnect(); } catch { /* 무시 */ }
      refreshStatus();
    }
  }

  // 받은 원본 메시지를 검사해 방문자 상태로 반영한다. 반환: 받아들였는가.
  function ingest(raw, at = now()) {
    if (disposed || phase !== 'joined') return false;
    if (raw && typeof raw === 'object' && raw.k === 'say') return ingestSay(raw, at);
    if (raw && typeof raw === 'object' && raw.k === 'chat') return ingestChat(raw, at);
    if (raw && typeof raw === 'object' && (raw.k === 'line' || raw.k === 'lines' || raw.k === 'fx')) return ingestRoom(raw, at);
    const s = validateState(raw, validateOpts);
    if (!s) { rejected++; return false; }
    if (s.id === self.id || s.space !== space) return false;
    let r = remotes.get(s.id);
    if (!r) {
      if (remotes.size >= cfg.maxTracked) return false;
      r = {
        id: s.id, nick: s.nick, lastSeen: at, lastT: -1, lastRecv: -Infinity, legacy: false,
        buffer: createInterpBuffer({ delayMs: cfg.interpDelayMs, teleportDist: cfg.teleportDist, extrapolateMs: cfg.extrapolateMs }), // 옛 방식(속도 없음) 메시지용
        dr: createDeadReckoner({ omega: cfg.smoothOmega, teleportDist: cfg.teleportDist, maxExtrapMs: cfg.maxExtrapMs }), // 새 방식(속도 있음)
      };
      remotes.set(s.id, r);
      peers.add(s.id);
    }
    if (s.t < r.lastT) return false; // 순서가 뒤바뀐 옛 메시지
    if (at - r.lastRecv < cfg.minRecvGapMs) return false; // 너무 촘촘한 메시지
    r.lastT = s.t;
    r.lastRecv = at;
    r.lastSeen = at;
    r.nick = s.nick;
    r.legacy = s.vx === undefined; // 속도가 없으면 옛 클라이언트(주기 전송): 보간 버퍼로 그린다
    if (r.legacy) r.buffer.push(s, at); else r.dr.push(s, at);
    received++;
    notify();
    return true;
  }

  // 받은 한마디(면접 답변·돌발행동 번호)를 검사해 구독자에게 알린다. 글은 받지 않고(번호만) 받는 쪽이 자기 설정에서 찾는다.
  // 내 공간에서 상태를 보낸 적이 있는 방문자의 것만 받고, 보낸 사람마다 간격(cfg.sayGapMs)을 둔다. 반환: 받아들였는가.
  function ingestSay(raw, at) {
    if (!sayLimits || sayListeners.size === 0) return false;
    const m = validateSay(raw, sayLimits);
    if (!m) { rejected++; return false; }
    if (m.id === self.id || m.space !== space) return false;
    const r = remotes.get(m.id);
    if (!r) return false;
    if (!sayIn.allow(m.id, at)) return false;
    const ev = { id: m.id, nick: r.nick, ty: m.ty, q: m.q, a: m.a, imp: m.imp };
    for (const fn of sayListeners) { try { fn(ev); } catch { /* 표시 쪽 오류는 무시 */ } }
    return true;
  }

  // 받은 인사·응원말(프리셋 번호)을 검사해 구독자에게 알린다. 글은 받지 않는다(받는 쪽이 자기 목록에서 번호로 찾는다). 내 공간에서 상태를 보낸 적이 있는 방문자의 것만, 보낸 사람마다 간격·전체 상한을 두고 받는다.
  function ingestChat(raw, at) {
    if (!chatLimits || chatListeners.size === 0) return false;
    const m = validateChat(raw, chatLimits);
    if (!m) { rejected++; return false; }
    if (m.id === self.id || m.space !== space) return false;
    const r = remotes.get(m.id);
    if (!r) return false;
    if (!chatIn.allow(m.id, at)) return false;
    const ev = { id: m.id, nick: r.nick, i: m.i };
    for (const fn of chatListeners) { try { fn(ev); } catch { /* 표시 쪽 오류는 무시 */ } }
    return true;
  }

  // 내 인사·응원말(프리셋 번호)을 보낸다. 연결·방 상태가 안 되었거나 듣는 사람이 없거나 간격 안이면 보내지 않는다. 반환: 보냈는가.
  function chat(i, nowMs = now()) {
    try {
      if (disposed || !chatLimits || !space || status !== 'ready' || !transport.isReady || !active) return false;
      if (peers.size === 0 && remotes.size === 0) return false;
      const out = buildChat(self, space, i);
      if (!validateChat(out, chatLimits)) return false;
      if (!chatOut.allow(self.id, nowMs)) return false;
      transport.send(out);
      sent++;
      return true;
    } catch {
      return false;
    }
  }

  // 받은 세탁소 메시지(빨랫줄 칸·전체 목록·세탁기 효과)를 검사해 구독자에게 알린다. 내 공간(세탁소)에서 상태를 보낸 적이 있는 방문자의 것만, 종류별 간격을 두고 받는다.
  function ingestRoom(raw, at) {
    if (!roomLimits || roomListeners.size === 0) return false;
    const m = validateRoomMsg(raw, roomLimitsAt());
    if (!m) { rejected++; return false; }
    if (m.id === self.id || m.space !== space || !remotes.has(m.id)) return false;
    if (!roomIn[m.k].allow(m.id, at)) return false;
    for (const fn of roomListeners) { try { fn(m); } catch { /* 표시 쪽 오류는 무시 */ } }
    return true;
  }

  // 세탁소 메시지를 보낸다: { k:'line', slot, c, t } | { k:'lines', e } | { k:'fx', i }. 연결되지 않았거나 듣는 사람이 없거나 간격 안이면 보내지 않는다. 반환: 보냈는가.
  function sendRoom(msg, nowMs = now()) {
    try {
      if (disposed || !roomLimits || space !== 'laundry' || status !== 'ready' || !transport.isReady || !active) return false;
      if (peers.size === 0 && remotes.size === 0) return false;
      const out = buildRoomMsg(self, space, msg);
      if (!validateRoomMsg(out, roomLimitsAt())) return false;
      if (!roomOut[out.k].allow(self.id, nowMs)) return false;
      transport.send(out);
      sent++;
      return true;
    } catch {
      return false;
    }
  }

  // 내 한마디를 보낸다: { ty:'ans', q, a } | { ty:'imp', imp }. 연결·방 상태가 안 되었거나 듣는 사람이 없거나 간격(cfg.sayGapMs) 안이면 보내지 않는다. 반환: 보냈는가.
  function say(msg, nowMs = now()) {
    try {
      if (disposed || !sayLimits || !space || status !== 'ready' || !transport.isReady || !active) return false;
      if (peers.size === 0 && remotes.size === 0) return false;
      const out = buildSay(self, space, msg);
      if (!validateSay(out, sayLimits)) return false;
      if (!sayOut.allow(self.id, nowMs)) return false;
      transport.send(out);
      sent++;
      return true;
    } catch {
      return false;
    }
  }

  // 매 프레임: 내 공간이 바뀌었으면 방을 옮기고, 정책이 허락하면 내 상태를 보낸다. local: { space, x, z, y, rotY, anim, outfit, seat }.
  function update(local, nowMs = now()) {
    if (disposed) return;
    try {
      if (local.space !== space) join(local.space);
      else if (phase === 'full' && nowMs - fullAt >= (cfg.fullRetryMs ?? 60000)) join(space);
      if (phase === 'probing' && tState === 'ready' && probeMs > 0 && nowMs >= probeUntil) decide(nowMs);
      const v = local.vx === undefined ? velocity.update(nowMs, local.x, local.z, local.space) : { vx: local.vx, vz: local.vz };
      if (status !== 'ready' || !transport.isReady || !active) return;
      const mine = { ...local, vx: v.vx, vz: v.vz };
      if (policy.update(nowMs, mine, peers.size > 0 || remotes.size > 0)) {
        transport.send(buildState(self, mine, Math.round(clock())));
        sent++;
      }
    } catch {
      /* 전송 오류는 게임에 영향을 주지 않는다 */
    }
  }

  // 지금 그릴 방문자들: 오래된 사람을 지우고, 보간한 위치를 돌려준다. 연결이 안 되어 있으면 빈 목록(아바타가 사라진다).
  // from: 거리 기준(내 위치 { x, z }).
  function sample(nowMs = now(), from = { x: 0, z: 0 }) {
    if (disposed || status !== 'ready') return [];
    for (const [id, r] of remotes) if (isStale(r.lastSeen, nowMs, cfg.staleMs)) remotes.delete(id);
    const out = [];
    for (const r of remotes.values()) {
      const p = r.legacy ? r.buffer.sample(nowMs) : r.dr.sample(nowMs);
      if (p && p.space === space) out.push({ id: r.id, nick: r.nick, ...p });
    }
    return nearestN(out, from, cfg.maxRemote);
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    joinGen++;
    remotes.clear();
    peers.clear();
    status = 'off';
    try { transport.disconnect(); } catch { /* 무시 */ }
    notify();
  }

  const api = {
    update, sample, ingest, dispose, say, sendRoom, chat,
    // 닉네임을 바꿨을 때 곧바로 알린다(self.nick 은 바꾼 뒤에 부른다: 다음 update 가 상태를 보낸다).
    announce() { policy.force(); },
    onChat(fn) { chatListeners.add(fn); return () => chatListeners.delete(fn); },
    onRoom(fn) { roomListeners.add(fn); return () => roomListeners.delete(fn); },
    onSay(fn) { sayListeners.add(fn); return () => sayListeners.delete(fn); },
    get status() { return status; },
    get space() { return space; },
    get shard() { return shard; },
    get room() { return space ? shardRoom(cfg.channelPrefix ?? '', space, shard) : null; },
    get phase() { return phase; },
    // 숨김·유휴일 때 false: 상태 전송을 멈춘다(연결·presence 는 유지). 다시 true 가 되면 곧바로 한 번 보낸다.
    setActive(on) { if (on && !active) policy.force(); active = Boolean(on); },
    get active() { return active; },
    // 접속 중인 사람 수(이 공간, 나 포함).
    get count() { return 1 + Math.max(peers.size, remotes.size); },
    get stats() { return { sent, received, rejected, remotes: remotes.size, peers: peers.size }; },
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  };
  return api;
}
