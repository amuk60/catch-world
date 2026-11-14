import test from 'node:test';
import assert from 'node:assert/strict';
import { createLocalTransport, pickTransport } from '../src/net/transport.js';
import { createSupabaseTransport } from '../src/net/supabaseTransport.js';
import { MULTIPLAYER } from '../src/config.js';

const tick = () => new Promise((r) => setImmediate(r));

// ---- 가짜 BroadcastChannel: 같은 이름의 다른 인스턴스에게 비동기로 전달 ----
function makeBC() {
  const reg = new Map();
  return class FakeBC {
    constructor(name) { this.name = name; this.closed = false; (reg.get(name) ?? reg.set(name, new Set()).get(name)).add(this); }
    postMessage(m) {
      if (this.closed) throw new Error('closed');
      const copy = JSON.parse(JSON.stringify(m));
      for (const o of reg.get(this.name)) if (o !== this && !o.closed) queueMicrotask(() => o.onmessage?.({ data: copy }));
    }
    close() { this.closed = true; reg.get(this.name).delete(this); }
  };
}

test('local transport: 들어오면 서로 알고, 메시지가 가고, 나가면 leave', async () => {
  const BC = makeBC();
  const a = createLocalTransport({ BC });
  const b = createLocalTransport({ BC });
  const aPresence = []; const bPresence = []; const aMsgs = []; const bMsgs = []; const aStatus = [];
  a.onPresence((e) => aPresence.push(e)); b.onPresence((e) => bPresence.push(e));
  a.onMessage((m) => aMsgs.push(m)); b.onMessage((m) => bMsgs.push(m));
  a.onStatus((s) => aStatus.push(s));
  assert.equal(a.isReady, false);
  a.send({ ignored: true }); // 준비 전 전송은 조용히 버린다
  assert.equal(await a.connect('yard', { id: 'aaaa1111' }), true);
  assert.equal(a.isReady, true);
  assert.deepEqual(aStatus, ['ready']);
  await b.connect('yard', { id: 'bbbb2222' });
  await tick();
  assert.deepEqual(aPresence, [{ type: 'join', id: 'bbbb2222' }]);
  assert.deepEqual(bPresence, [{ type: 'join', id: 'aaaa1111' }]);
  a.send({ hello: 1 });
  b.send({ hello: 2 });
  await tick();
  assert.deepEqual(bMsgs, [{ hello: 1 }]);
  assert.deepEqual(aMsgs, [{ hello: 2 }]);
  b.disconnect();
  await tick();
  assert.deepEqual(aPresence.at(-1), { type: 'leave', id: 'bbbb2222' });
  assert.equal(b.isReady, false);
  b.send({ x: 1 }); // 나온 뒤 전송은 버린다
  await tick();
  assert.equal(aMsgs.length, 1);
});

test('local transport: 방이 다르면 서로 모르고, 방을 옮기면 옛 방과 끊긴다', async () => {
  const BC = makeBC();
  const a = createLocalTransport({ BC });
  const b = createLocalTransport({ BC });
  const bMsgs = []; const bPresence = [];
  b.onMessage((m) => bMsgs.push(m)); b.onPresence((e) => bPresence.push(e));
  await a.connect('yard', { id: 'aaaa1111' });
  await b.connect('laundry', { id: 'bbbb2222' });
  a.send({ n: 1 });
  await tick();
  assert.equal(bMsgs.length, 0);
  assert.equal(bPresence.length, 0);
  await a.connect('laundry', { id: 'aaaa1111' }); // 방 옮기기
  await tick();
  assert.deepEqual(bPresence, [{ type: 'join', id: 'aaaa1111' }]);
  a.send({ n: 2 });
  await tick();
  assert.deepEqual(bMsgs, [{ n: 2 }]);
});

test('local transport: BroadcastChannel 이 없거나 이상한 메시지가 와도 던지지 않는다', async () => {
  const none = createLocalTransport({ BC: null });
  const st = [];
  none.onStatus((s) => st.push(s));
  assert.equal(await none.connect('yard', { id: 'aaaa1111' }), false);
  assert.deepEqual(st, ['lost']);
  none.send({});
  none.disconnect();
  const BC = makeBC();
  const t = createLocalTransport({ BC });
  const msgs = [];
  t.onMessage((m) => msgs.push(m));
  t.onMessage(() => { throw new Error('콜백 오류'); });
  await t.connect('yard', { id: 'aaaa1111' });
  const other = new BC('catch-world-mp:yard');
  for (const junk of [null, 5, 'x', {}, { k: 'msg' }, { k: 'msg', id: 7 }, { k: 'hello' }]) other.postMessage(junk);
  other.postMessage({ k: 'msg', id: 'zzzz9999', d: { ok: 1 } });
  await tick();
  assert.deepEqual(msgs, [{ ok: 1 }]);
});

// ---- pickTransport ----
const keys = { url: 'https://x.supabase.co', anonKey: 'k' };
test('pickTransport: 설정·주소·키에 따라 고른다', () => {
  assert.equal(pickTransport('', { ...MULTIPLAYER, enabled: false }, keys), null);
  assert.equal(pickTransport('?mp=off', { ...MULTIPLAYER, transport: 'local' }, keys), null);
  assert.equal(pickTransport('', { ...MULTIPLAYER, transport: 'supabase' }, { url: '', anonKey: '' }), null, '키가 비면 꺼진다');
  assert.equal(pickTransport('', { ...MULTIPLAYER, transport: 'supabase' }, { url: 'u', anonKey: '' }), null);
  assert.equal(pickTransport('?mp=local', { ...MULTIPLAYER, transport: 'supabase' }, { url: '', anonKey: '' }).kind, 'local');
  assert.equal(pickTransport('', { ...MULTIPLAYER, transport: 'supabase' }, keys).kind, 'supabase');
  assert.equal(pickTransport('', { ...MULTIPLAYER, transport: 'weird' }, keys), null);
  assert.equal(pickTransport('?foo=1&mp=local', { ...MULTIPLAYER, enabled: true }, keys).kind, 'local');
});

test('커밋된 기본 설정: 켜짐 + supabase 이고 키가 들어 있다(JWT 가 아닌 publishable 키, 비밀 키 아님)', async () => {
  const cfg = await import('../src/config.js');
  assert.equal(cfg.MULTIPLAYER.enabled, true);
  assert.equal(cfg.MULTIPLAYER.transport, 'supabase');
  assert.match(cfg.SUPABASE_URL, /^https:\/\/[a-z0-9]+\.supabase\.co$/);
  assert.match(cfg.SUPABASE_ANON_KEY, /^sb_publishable_/);
  assert.equal(pickTransport('', cfg.MULTIPLAYER, { url: cfg.SUPABASE_URL, anonKey: cfg.SUPABASE_ANON_KEY }).kind, 'supabase');
  assert.match(cfg.MULTIPLAYER.supabaseSdkUrl, /supabase-js@\d+\.\d+\.\d+\/\+esm$/);
});

// ---- Supabase 어댑터(가짜 클라이언트) ----
function makeFakeClient() {
  const created = [];
  const removed = [];
  const makeChannel = (name, config) => {
    const handlers = [];
    const ch = {
      name, config, handlers, sent: [], tracked: [], subscribeCb: null, presence: {},
      on(type, filter, cb) { handlers.push({ type, filter, cb }); return ch; },
      subscribe(cb) { ch.subscribeCb = cb; return ch; },
      track(p) { ch.tracked.push(p); return Promise.resolve('ok'); },
      send(m) { ch.sent.push(m); return Promise.resolve('ok'); },
      presenceState() { return ch.presence; },
      unsubscribe() { return Promise.resolve(); },
      status(s) { ch.subscribeCb?.(s); },
      fire(type, event, arg) { for (const h of handlers) if (h.type === type && h.filter.event === event) h.cb(arg); },
    };
    created.push(ch);
    return ch;
  };
  const client = { channel: makeChannel, removeChannel(ch) { removed.push(ch); ch.subscribeCb?.('CLOSED'); return Promise.resolve('ok'); } };
  return { created, removed, createClient: (url, key, opts) => { created.opts = { url, key, opts }; return client; } };
}
function makeTimers() {
  let now = 0; let seq = 0; const q = [];
  return {
    setTimeout: (fn, ms) => { const id = ++seq; q.push({ id, at: now + ms, fn }); return id; },
    clearTimeout: (id) => { const i = q.findIndex((t) => t.id === id); if (i >= 0) q.splice(i, 1); },
    advance(ms) { now += ms; q.sort((a, b) => a.at - b.at); while (q.length && q[0].at <= now) q.shift().fn(); },
    get pending() { return q.length; },
  };
}
const cfgS = { ...MULTIPLAYER, retryBaseMs: 1000, retryMaxMs: 8000, supabaseSdkUrl: 'x' };
function setup(extra = {}) {
  const fake = makeFakeClient();
  const timers = makeTimers();
  let loads = 0;
  const t = createSupabaseTransport({
    url: 'https://p.supabase.co', anonKey: 'anon', cfg: cfgS, timers, random: () => 0,
    loadClient: async () => { loads++; return fake; }, ...extra,
  });
  const log = { msgs: [], presence: [], status: [] };
  t.onMessage((m) => log.msgs.push(m)); t.onPresence((e) => log.presence.push(e)); t.onStatus((s) => log.status.push(s));
  return { fake, timers, t, log, loads: () => loads };
}

test('supabase: 클라이언트는 connect 때에야 불러오고(지연 로딩), 옵션과 채널 설정이 문서대로', async () => {
  const { fake, t, loads } = setup();
  assert.equal(loads(), 0, '만들기만 해서는 불러오지 않는다');
  assert.equal(await t.connect('catch-world:yard', { id: 'aaaa1111' }), true);
  assert.equal(loads(), 1);
  assert.equal(fake.created.opts.url, 'https://p.supabase.co');
  assert.equal(fake.created.opts.key, 'anon');
  assert.equal(fake.created.opts.opts.realtime.params.eventsPerSecond, 10);
  const ch = fake.created[0];
  assert.equal(ch.name, 'catch-world:yard');
  assert.deepEqual(ch.config, { config: { broadcast: { self: false }, presence: { key: 'aaaa1111' } } });
  assert.deepEqual(ch.handlers.map((h) => `${h.type}:${h.filter.event}`), ['broadcast:s', 'presence:sync', 'presence:join', 'presence:leave']);
  assert.equal(t.isReady, false, 'SUBSCRIBED 전에는 준비 안 됨');
  t.send({ early: 1 });
  assert.equal(ch.sent.length, 0);
});

test('supabase: SUBSCRIBED 이면 준비·track, 메시지 전달·전송, presence join/leave/sync', async () => {
  const { fake, t, log } = setup();
  await t.connect('r', { id: 'aaaa1111' });
  const ch = fake.created[0];
  ch.presence = { aaaa1111: [{}] };
  ch.status('SUBSCRIBED');
  assert.equal(t.isReady, true);
  assert.deepEqual(log.status, ['ready']);
  assert.equal(ch.tracked.length, 1);
  assert.equal(ch.tracked[0].id, 'aaaa1111');
  assert.deepEqual(log.presence, [], '나 자신은 알리지 않는다');
  t.send({ s: 1 });
  assert.deepEqual(ch.sent, [{ type: 'broadcast', event: 's', payload: { s: 1 } }]);
  ch.fire('broadcast', 's', { type: 'broadcast', event: 's', payload: { from: 'b' } });
  assert.deepEqual(log.msgs, [{ from: 'b' }]);
  ch.fire('presence', 'join', { key: 'bbbb2222', newPresences: [{}] });
  ch.fire('presence', 'join', { key: 'bbbb2222', newPresences: [{}] }); // 중복 무시
  ch.fire('presence', 'join', { key: 'aaaa1111' }); // 나
  assert.deepEqual(log.presence, [{ type: 'join', id: 'bbbb2222' }]);
  ch.fire('presence', 'leave', { key: 'bbbb2222', leftPresences: [{}] });
  assert.deepEqual(log.presence.at(-1), { type: 'leave', id: 'bbbb2222' });
  ch.presence = { aaaa1111: [{}], cccc3333: [{}], dddd4444: [{}] };
  ch.fire('presence', 'sync');
  assert.deepEqual(log.presence.slice(-2).map((e) => e.id).sort(), ['cccc3333', 'dddd4444']);
  ch.presence = { aaaa1111: [{}], dddd4444: [{}] };
  ch.fire('presence', 'sync');
  assert.deepEqual(log.presence.at(-1), { type: 'leave', id: 'cccc3333' });
  ch.fire('presence', 'join', null); // 이상한 값도 던지지 않는다
  ch.fire('broadcast', 's', undefined);
});

test('supabase: 연결이 끊기면 lost 를 한 번 알리고 1s, 2s, 4s 로 늘려 가며 새 채널로 다시 들어간다', async () => {
  const { fake, t, timers, log } = setup();
  await t.connect('r', { id: 'aaaa1111' });
  fake.created[0].status('SUBSCRIBED');
  fake.created[0].status('CHANNEL_ERROR');
  assert.equal(t.isReady, false);
  assert.deepEqual(log.status, ['ready', 'lost']);
  t.send({ x: 1 });
  assert.equal(fake.created[0].sent.length, 0, '끊긴 동안은 보내지 않는다');
  timers.advance(999);
  assert.equal(fake.created.length, 1);
  timers.advance(1);
  await tick();
  assert.equal(fake.created.length, 2, '1초 뒤 새 채널');
  assert.equal(fake.removed[0], fake.created[0], '옛 채널은 정리');
  fake.created[1].status('TIMED_OUT');
  assert.deepEqual(log.status, ['ready', 'lost'], 'lost 는 다시 알리지 않는다');
  timers.advance(1999);
  assert.equal(fake.created.length, 2);
  timers.advance(1);
  await tick();
  assert.equal(fake.created.length, 3, '2초 뒤');
  fake.created[2].status('CLOSED');
  timers.advance(4000);
  await tick();
  assert.equal(fake.created.length, 4, '4초 뒤');
  fake.created[3].status('SUBSCRIBED');
  assert.equal(t.isReady, true);
  assert.deepEqual(log.status, ['ready', 'lost', 'ready']);
  assert.equal(fake.created[3].tracked.length, 1, '다시 들어가면 track 도 다시');
  assert.equal(timers.pending, 0);
  // 성공하면 대기 시간이 처음으로 돌아간다
  fake.created[3].status('CHANNEL_ERROR');
  timers.advance(1000);
  await tick();
  assert.equal(fake.created.length, 5);
});

test('supabase: 대기 시간은 retryMaxMs 를 넘지 않는다', async () => {
  const { fake, t, timers } = setup();
  await t.connect('r', { id: 'aaaa1111' });
  let n = 1;
  for (const wait of [1000, 2000, 4000, 8000, 8000, 8000]) {
    fake.created.at(-1).status('CHANNEL_ERROR');
    timers.advance(wait - 1);
    assert.equal(fake.created.length, n);
    timers.advance(1);
    await tick();
    n++;
    assert.equal(fake.created.length, n);
  }
});

test('supabase: 라이브러리가 스스로 다시 SUBSCRIBED 가 되면 예약된 재시도는 건너뛴다', async () => {
  const { fake, t, timers, log } = setup();
  await t.connect('r', { id: 'aaaa1111' });
  fake.created[0].status('SUBSCRIBED');
  fake.created[0].status('CHANNEL_ERROR');
  fake.created[0].status('SUBSCRIBED'); // 내장 재연결
  assert.deepEqual(log.status, ['ready', 'lost', 'ready']);
  assert.equal(timers.pending, 0);
});

test('supabase: SDK 를 못 불러오면 던지지 않고 lost + 재시도, 성공하면 ready', async () => {
  const fake = makeFakeClient();
  const timers = makeTimers();
  let attempt = 0;
  const t = createSupabaseTransport({
    url: 'u', anonKey: 'k', cfg: cfgS, timers, random: () => 0,
    loadClient: async () => { attempt++; if (attempt < 3) throw new Error('network'); return fake; },
  });
  const status = [];
  t.onStatus((s) => status.push(s));
  assert.equal(await t.connect('r', { id: 'aaaa1111' }), false);
  assert.deepEqual(status, ['lost']);
  timers.advance(1000);
  await tick();
  timers.advance(2000);
  await tick();
  assert.equal(attempt, 3);
  assert.equal(fake.created.length, 1);
  fake.created[0].status('SUBSCRIBED');
  assert.deepEqual(status, ['lost', 'ready']);
});

test('supabase: disconnect 는 채널을 정리하고 늦게 오는 콜백과 재시도를 모두 무시한다', async () => {
  const { fake, t, timers, log } = setup();
  await t.connect('r1', { id: 'aaaa1111' });
  const ch = fake.created[0];
  ch.status('SUBSCRIBED');
  ch.status('CHANNEL_ERROR');
  assert.equal(timers.pending, 1);
  t.disconnect();
  assert.equal(timers.pending, 0);
  assert.equal(fake.removed.length, 1);
  ch.fire('broadcast', 's', { payload: { late: 1 } });
  ch.fire('presence', 'join', { key: 'bbbb2222' });
  ch.status('SUBSCRIBED');
  assert.equal(t.isReady, false);
  assert.deepEqual(log.msgs, []);
  assert.deepEqual(log.status, ['ready', 'lost'], '일부러 나온 것은 lost 로 알리지 않는다');
  // 방 옮기기: 새 채널, 옛 채널 콜백은 무시
  await t.connect('r2', { id: 'aaaa1111' });
  assert.equal(fake.created[1].name, 'r2');
  fake.created[1].status('SUBSCRIBED');
  assert.equal(t.isReady, true);
  t.disconnect();
  t.disconnect();
});

test('supabase: send/track 이 던지거나 reject 해도 게임으로 새지 않는다', async () => {
  const { fake, t } = setup();
  await t.connect('r', { id: 'aaaa1111' });
  const ch = fake.created[0];
  ch.send = () => { throw new Error('boom'); };
  ch.track = () => Promise.reject(new Error('reject'));
  ch.status('SUBSCRIBED');
  t.send({ a: 1 });
  ch.send = () => Promise.reject(new Error('rej'));
  t.send({ a: 2 });
  await tick();
  assert.equal(t.isReady, true);
});

test('supabase: removeChannel 이 없는 클라이언트도 unsubscribe 로 정리', async () => {
  const fake = makeFakeClient();
  const base = fake.createClient;
  fake.createClient = (...a) => { const c = base(...a); delete c.removeChannel; return c; };
  let unsub = 0;
  const timers = makeTimers();
  const t = createSupabaseTransport({ url: 'u', anonKey: 'k', cfg: cfgS, timers, loadClient: async () => fake });
  await t.connect('r', { id: 'aaaa1111' });
  fake.created[0].unsubscribe = () => { unsub++; return Promise.resolve(); };
  t.disconnect();
  assert.equal(unsub, 1);
});
