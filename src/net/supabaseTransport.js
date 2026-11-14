// Supabase Realtime(Broadcast + Presence) 전송. 공식 클라이언트(@supabase/supabase-js)를 이 파일이 쓰일 때에야 CDN 에서 불러온다(동적 import).
// 방(room) 하나 = 채널 하나. 상태 메시지는 Broadcast(event 's'), 같은 방에 누가 있는지는 Presence 로 안다.
// 연결이 끊기면(CHANNEL_ERROR / TIMED_OUT / CLOSED) onStatus('lost') 를 알리고 1초부터 두 배씩 늘려 가며 채널을 새로 만들어 다시 들어간다. 어떤 오류도 밖으로 던지지 않는다.
// 시험에서는 loadClient 로 가짜 클라이언트({ createClient })와 timers 를 넣는다.
import { MULTIPLAYER } from '../config.js';

const EVENT = 's'; // 상태 메시지 이벤트 이름

export function createSupabaseTransport({
  url, anonKey, cfg = MULTIPLAYER,
  loadClient = () => import(cfg.supabaseSdkUrl),
  timers = { setTimeout: (...a) => globalThis.setTimeout(...a), clearTimeout: (...a) => globalThis.clearTimeout(...a) },
  random = Math.random,
}) {
  const messageCbs = [];
  const presenceCbs = [];
  const statusCbs = [];
  const emit = (cbs, v) => { for (const cb of cbs) { try { cb(v); } catch { /* 콜백 오류는 전송에 영향을 주지 않는다 */ } } };
  let client = null;
  let clientPromise = null;
  let channel = null;
  let room = null;
  let myId = null;
  let ready = false;
  let gen = 0; // connect/disconnect 마다 올라가는 세대: 옛 세대의 콜백은 모두 무시한다
  let chanSeq = 0; // 채널을 새로 만들거나 버릴 때마다 올라간다: 버린 채널의 콜백(removeChannel 이 부르는 CLOSED 등)은 무시한다
  let announcedLost = false; // 'lost' 를 이미 알렸는가(다시 연결되기 전에는 한 번만)
  let attempts = 0;
  let retryTimer = null;
  const peers = new Set();

  async function getClient() {
    if (client) return client;
    if (!clientPromise) {
      clientPromise = (async () => {
        const mod = await loadClient();
        const createClient = mod.createClient ?? mod.default?.createClient;
        if (typeof createClient !== 'function') throw new Error('supabase createClient 를 찾지 못했습니다');
        // 로그인·세션은 쓰지 않는다(익명 접속만). eventsPerSecond: 클라이언트가 보낼 수 있는 이벤트 상한.
        client = createClient(url, anonKey, {
          auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
          realtime: { params: { eventsPerSecond: 10 } },
        });
        return client;
      })().catch((err) => { clientPromise = null; throw err; });
    }
    return clientPromise;
  }

  function addPeer(id) {
    if (typeof id !== 'string' || id === myId || peers.has(id)) return;
    peers.add(id);
    emit(presenceCbs, { type: 'join', id });
  }
  function removePeer(id) {
    if (peers.delete(id)) emit(presenceCbs, { type: 'leave', id });
  }
  // presenceState() 는 { [key]: [meta...] }. 우리가 정한 key(= 방문자 id)로 목록을 맞춘다.
  function syncPeers(ch) {
    let state = {};
    try { state = ch.presenceState?.() ?? {}; } catch { return; }
    const now = new Set(Object.keys(state).filter((k) => k !== myId));
    for (const id of now) addPeer(id);
    for (const id of [...peers]) if (!now.has(id)) removePeer(id);
  }

  function clearRetry() {
    if (retryTimer !== null) { timers.clearTimeout(retryTimer); retryTimer = null; }
  }
  function dropChannel(ch) {
    if (!ch || !client) return;
    try {
      const p = client.removeChannel ? client.removeChannel(ch) : ch.unsubscribe?.();
      if (p && typeof p.catch === 'function') p.catch(() => {});
    } catch { /* 이미 정리된 채널 */ }
  }

  function lost(myGen) {
    if (myGen !== gen) return;
    ready = false;
    if (!announcedLost) {
      announcedLost = true;
      peers.clear();
      emit(statusCbs, 'lost');
    }
    scheduleRetry(myGen);
  }

  function scheduleRetry(myGen) {
    if (myGen !== gen || retryTimer !== null) return;
    const base = Math.min(cfg.retryBaseMs * 2 ** attempts, cfg.retryMaxMs);
    const delay = Math.round(base * (1 + random() * 0.2));
    attempts++;
    retryTimer = timers.setTimeout(() => {
      retryTimer = null;
      if (myGen !== gen || ready) return;
      chanSeq++;
      dropChannel(channel);
      channel = null;
      open(myGen);
    }, delay);
  }

  async function open(myGen) {
    try {
      const c = await getClient();
      if (myGen !== gen) return false;
      const mySeq = ++chanSeq;
      const live = () => myGen === gen && mySeq === chanSeq;
      const ch = c.channel(room, { config: { broadcast: { self: false }, presence: { key: myId } } });
      channel = ch;
      ch.on('broadcast', { event: EVENT }, (m) => { if (live()) emit(messageCbs, m?.payload); });
      ch.on('presence', { event: 'sync' }, () => { if (live()) syncPeers(ch); });
      ch.on('presence', { event: 'join' }, (p) => {
        if (!live()) return;
        addPeer(p?.key);
      });
      ch.on('presence', { event: 'leave' }, (p) => {
        if (!live()) return;
        if (typeof p?.key === 'string') removePeer(p.key);
      });
      ch.subscribe((status) => {
        if (!live()) return;
        if (status === 'SUBSCRIBED') {
          const was = ready;
          ready = true;
          announcedLost = false;
          attempts = 0;
          clearRetry();
          try {
            const p = ch.track({ id: myId, t: Date.now() });
            if (p && typeof p.catch === 'function') p.catch(() => {});
          } catch { /* 존재 알림 실패는 치명적이지 않다 */ }
          syncPeers(ch);
          if (!was) emit(statusCbs, 'ready');
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          lost(myGen);
        }
      });
      return true;
    } catch {
      lost(myGen);
      return false;
    }
  }

  const api = {
    get isReady() { return ready; },
    connect(nextRoom, { id } = {}) {
      api.disconnect();
      announcedLost = false;
      room = nextRoom;
      myId = id;
      return open(gen);
    },
    send(msg) {
      if (!ready || !channel) return;
      try {
        const p = channel.send({ type: 'broadcast', event: EVENT, payload: msg });
        if (p && typeof p.catch === 'function') p.catch(() => {});
      } catch { /* 보내기 실패는 다음 메시지가 대신한다 */ }
    },
    onMessage(cb) { messageCbs.push(cb); },
    onPresence(cb) { presenceCbs.push(cb); },
    onStatus(cb) { statusCbs.push(cb); },
    disconnect() {
      gen++;
      chanSeq++;
      clearRetry();
      attempts = 0;
      ready = false;
      peers.clear();
      const ch = channel;
      channel = null;
      dropChannel(ch);
    },
  };
  return api;
}
