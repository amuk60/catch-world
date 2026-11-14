// 멀티플레이 세션(THREE 없음, 시험 가능): 전송(transport)을 감싸 공간별 방에 들어가고, 내 상태를 정책에 맞춰 보내고,
// 받은 메시지를 검사·보간 버퍼에 쌓고, 오래 소식 없는 방문자를 지운다. 게임 루프로는 절대 예외를 던지지 않는다.
import {
  buildState, validateState, createSendPolicy, createInterpBuffer, isStale, nearestN,
} from '../logic/net.js';

// transport: net/transport.js 의 인터페이스. self: { id, nick }. cfg: config 의 MULTIPLAYER. now: () => ms.
export function createSession({ transport, self, cfg, now = () => performance.now(), clock = () => Date.now() }) {
  const remotes = new Map(); // id -> { id, nick, buffer, lastSeen, lastT, lastRecv }
  const peers = new Set(); // 지금 방에 있는 다른 방문자 id(전송 쪽 presence)
  const policy = createSendPolicy({ hz: cfg.sendHz, heartbeatMs: cfg.heartbeatMs, epsPos: cfg.epsPos, epsRot: cfg.epsRot, minGapMs: cfg.minGapMs });
  const validateOpts = { adjectives: cfg.nickAdjectives, nouns: cfg.nickNouns, nickMax: cfg.nickMax };
  let space = null; // 지금 들어가 있는(또는 들어가는 중인) 공간
  let status = 'connecting'; // 'connecting' | 'ready' | 'lost' | 'off'
  let disposed = false;
  let rejected = 0;
  let sent = 0;
  let received = 0;
  let joinGen = 0;
  const listeners = new Set();
  const notify = () => { for (const fn of listeners) { try { fn(api); } catch { /* 표시 쪽 오류는 무시 */ } } };

  function setStatus(next) {
    if (status === next) return;
    status = next;
    if (next !== 'ready') { remotes.clear(); peers.clear(); }
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
    if (s === 'ready') { policy.force(); setStatus('ready'); } else if (s === 'lost') setStatus('lost');
  }

  transport.onMessage(onMessage);
  transport.onPresence(onPresence);
  transport.onStatus?.(onStatus);

  function join(nextSpace) {
    space = nextSpace;
    joinGen++;
    remotes.clear();
    peers.clear();
    policy.reset();
    status = 'connecting';
    notify();
    try {
      transport.disconnect();
      const p = transport.connect(`${cfg.channelPrefix ?? ''}${nextSpace}`, { id: self.id });
      const gen = joinGen;
      Promise.resolve(p).catch(() => { if (gen === joinGen) setStatus('lost'); });
    } catch {
      setStatus('lost');
    }
  }

  // 받은 원본 메시지를 검사해 방문자 상태로 반영한다. 반환: 받아들였는가.
  function ingest(raw, at = now()) {
    if (disposed) return false;
    const s = validateState(raw, validateOpts);
    if (!s) { rejected++; return false; }
    if (s.id === self.id || s.space !== space) return false;
    let r = remotes.get(s.id);
    if (!r) {
      if (remotes.size >= cfg.maxTracked) return false;
      r = {
        id: s.id, nick: s.nick, lastSeen: at, lastT: -1, lastRecv: -Infinity,
        buffer: createInterpBuffer({ delayMs: cfg.interpDelayMs, teleportDist: cfg.teleportDist, extrapolateMs: cfg.extrapolateMs }),
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
    r.buffer.push(s, at);
    received++;
    notify();
    return true;
  }

  // 매 프레임: 내 공간이 바뀌었으면 방을 옮기고, 정책이 허락하면 내 상태를 보낸다. local: { space, x, z, y, rotY, anim, outfit, seat }.
  function update(local, nowMs = now()) {
    if (disposed) return;
    try {
      if (local.space !== space) join(local.space);
      if (status !== 'ready' || !transport.isReady) return;
      if (policy.update(nowMs, local, peers.size > 0 || remotes.size > 0)) {
        transport.send(buildState(self, local, Math.round(clock())));
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
      const p = r.buffer.sample(nowMs);
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
    update, sample, ingest, dispose,
    get status() { return status; },
    get space() { return space; },
    // 접속 중인 사람 수(이 공간, 나 포함).
    get count() { return 1 + Math.max(peers.size, remotes.size); },
    get stats() { return { sent, received, rejected, remotes: remotes.size, peers: peers.size }; },
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  };
  return api;
}
