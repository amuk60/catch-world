// 멀티플레이 전송 계층의 인터페이스와 구현 선택.
//
// transport 인터페이스(게임은 이 모양만 안다):
//   connect(room, { id }) -> Promise<boolean>   room(= 공간 id 가 붙은 방 이름)에 들어간다. 이미 어떤 방에 있으면 먼저 나온다. 절대 reject 하지 않는다(실패는 onStatus('lost')).
//   send(msg)                                   방의 다른 사람에게 상태 메시지(JSON 으로 보낼 수 있는 객체)를 보낸다. 준비되지 않았으면 조용히 버린다. 절대 던지지 않는다.
//   onMessage(cb)                               cb(payload) — 방의 다른 사람이 보낸 메시지(검사되지 않은 원본).
//   onPresence(cb)                              cb({ type: 'join' | 'leave', id }) — 방에 들어오고 나간 다른 사람.
//   onStatus(cb)                                cb('ready' | 'lost') — 방에 들어갔다 / 연결이 끊겼다(전송이 스스로 다시 연결을 시도한다).
//   disconnect()                                방을 나온다(콜백은 그대로 두고, 다시 connect 할 수 있다).
//   isReady                                     지금 보낼 수 있는가.
import { MULTIPLAYER, SUPABASE_URL, SUPABASE_ANON_KEY } from '../config.js';
import { multiplayerMode } from '../env.js';

// 같은 브라우저(같은 출처)의 탭끼리 BroadcastChannel 로 통신하는 전송. 개발·시험용(?mp=local).
// 방마다 채널이 하나. 들어오면 hello 를 보내고, 이미 있던 사람이 here 로 답해서 서로를 안다. 나갈 때(pagehide)는 bye.
export function createLocalTransport({ BC = globalThis.BroadcastChannel, prefix = 'catch-world-mp:' } = {}) {
  let channel = null;
  let myId = null;
  let ready = false;
  const peers = new Set();
  const messageCbs = [];
  const presenceCbs = [];
  const statusCbs = [];
  const emit = (cbs, v) => { for (const cb of cbs) { try { cb(v); } catch { /* 콜백 오류는 전송에 영향을 주지 않는다 */ } } };
  const post = (m) => { try { channel?.postMessage(m); } catch { /* 닫힌 채널 */ } };

  function addPeer(id) {
    if (!peers.has(id)) { peers.add(id); emit(presenceCbs, { type: 'join', id }); }
  }

  function handle(m) {
    if (!m || typeof m !== 'object' || typeof m.id !== 'string' || m.id === myId) return;
    if (m.k === 'hello') { addPeer(m.id); post({ k: 'here', id: myId }); } else if (m.k === 'here') addPeer(m.id);
    else if (m.k === 'bye') { if (peers.delete(m.id)) emit(presenceCbs, { type: 'leave', id: m.id }); } else if (m.k === 'msg') { addPeer(m.id); emit(messageCbs, m.d); }
  }

  const api = {
    get isReady() { return ready; },
    async connect(room, { id } = {}) {
      api.disconnect();
      if (typeof BC !== 'function') { emit(statusCbs, 'lost'); return false; }
      try {
        myId = id;
        channel = new BC(prefix + room);
        const mine = channel;
        mine.onmessage = (e) => { if (channel === mine) handle(e.data); };
        ready = true;
        post({ k: 'hello', id: myId });
        emit(statusCbs, 'ready');
        return true;
      } catch {
        ready = false;
        emit(statusCbs, 'lost');
        return false;
      }
    },
    send(msg) {
      if (ready) post({ k: 'msg', id: myId, d: msg });
    },
    onMessage(cb) { messageCbs.push(cb); },
    onPresence(cb) { presenceCbs.push(cb); },
    onStatus(cb) { statusCbs.push(cb); },
    disconnect() {
      if (channel) {
        post({ k: 'bye', id: myId });
        try { channel.close(); } catch { /* 이미 닫힘 */ }
      }
      channel = null;
      ready = false;
      peers.clear();
    },
  };
  return api;
}

// 설정과 시작 주소(?mp=...)로 지금 쓸 전송을 정한다(판단은 env.js 의 multiplayerMode). 쓰지 않으면 null(요청도 없다).
// 반환: { kind: 'local' | 'supabase', create: () => Promise<transport> } | null. supabase 어댑터(와 SDK)는 create 를 부를 때에야 불러온다.
export function pickTransport(search = globalThis.location?.search ?? '', cfg = MULTIPLAYER, keys = { url: SUPABASE_URL, anonKey: SUPABASE_ANON_KEY }) {
  const kind = multiplayerMode(search, cfg, keys);
  if (kind === 'local') return { kind, create: async () => createLocalTransport() };
  if (kind === 'supabase') {
    return {
      kind,
      create: async () => {
        const { createSupabaseTransport } = await import('./supabaseTransport.js');
        return createSupabaseTransport({ url: keys.url, anonKey: keys.anonKey, cfg });
      },
    };
  }
  return null;
}
