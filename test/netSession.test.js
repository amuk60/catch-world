import test from 'node:test';
import assert from 'node:assert/strict';
import { createSession } from '../src/net/session.js';
import { MULTIPLAYER } from '../src/config.js';

// 가짜 전송: 테스트가 직접 콜백을 부른다.
function fakeTransport() {
  const t = {
    ready: false, sent: [], rooms: [], disconnects: 0, cbs: { msg: [], pres: [], stat: [] },
    get isReady() { return t.ready; },
    connect(room, opts) { t.rooms.push({ room, ...opts }); return Promise.resolve(true); },
    send(m) { t.sent.push(m); },
    disconnect() { t.disconnects++; t.ready = false; },
    onMessage(cb) { t.cbs.msg.push(cb); },
    onPresence(cb) { t.cbs.pres.push(cb); },
    onStatus(cb) { t.cbs.stat.push(cb); },
    emitStatus(s) { t.ready = s === 'ready'; t.cbs.stat.forEach((c) => c(s)); },
    emitMsg(m) { t.cbs.msg.forEach((c) => c(m)); },
    emitPresence(e) { t.cbs.pres.forEach((c) => c(e)); },
  };
  return t;
}

const cfg = { ...MULTIPLAYER, minRecvGapMs: 0 };
const me = { id: 'me0000001', nick: '나' };
const local = (o = {}) => ({ space: 'yard', x: 0, z: 0, y: 0, rotY: 0, anim: 'idle', outfit: 'clean', seat: false, ...o });
const msg = (id, o = {}) => ({ id, nick: `닉-${id}`, space: 'yard', x: 1, z: 1, y: 0, rotY: 0, anim: 'idle', outfit: 'clean', seat: false, t: 1, ...o });
function setup(c = cfg) {
  const tr = fakeTransport();
  let nowMs = 0;
  const s = createSession({ transport: tr, self: me, cfg: c, now: () => nowMs, clock: () => 777 });
  return { tr, s, at: (v) => { nowMs = v; return v; } };
}
async function joined(x) {
  x.s.update(local());
  x.tr.emitStatus('ready');
  await Promise.resolve();
}

test('session: 첫 update 에서 공간 방에 들어가고, 공간이 바뀌면 나왔다가 다시 들어간다', async () => {
  const x = setup();
  x.s.update(local());
  assert.deepEqual(x.tr.rooms, [{ room: 'catch-world:yard', id: me.id }]);
  assert.equal(x.s.status, 'connecting');
  x.tr.emitStatus('ready');
  assert.equal(x.s.status, 'ready');
  x.s.update(local());
  assert.equal(x.tr.rooms.length, 1, '같은 공간이면 다시 들어가지 않는다');
  x.s.update(local({ space: 'laundry', x: 300 }));
  assert.equal(x.tr.rooms.at(-1).room, 'catch-world:laundry');
  assert.equal(x.s.status, 'connecting');
  assert.ok(x.tr.disconnects >= 2);
});

test('session: 방에 아무도 없으면 보내지 않고, 누가 들어오면 곧바로 한 번 보낸다', async () => {
  const x = setup();
  await joined(x);
  for (let t = 0; t < 3000; t += 100) x.s.update(local({ x: t / 100 }), t);
  assert.equal(x.tr.sent.length, 0);
  x.tr.emitPresence({ type: 'join', id: 'peer00001' });
  x.s.update(local({ x: 40 }), 3100);
  assert.equal(x.tr.sent.length, 1);
  const m = x.tr.sent[0];
  assert.equal(m.id, me.id);
  assert.equal(m.nick, '나');
  assert.equal(m.space, 'yard');
  assert.equal(m.x, 40);
  assert.equal(m.t, 777);
  assert.equal(x.s.count, 2);
});

test('session: 받은 메시지는 검사해서 보간 버퍼에 쌓고 sample 로 돌려준다', async () => {
  const x = setup();
  await joined(x);
  x.at(1000); x.tr.emitMsg(msg('peer00001', { x: 0, z: 0, anim: 'walk', t: 1 }));
  x.at(1200); x.tr.emitMsg(msg('peer00001', { x: 2, z: 0, anim: 'walk', t: 2 }));
  x.at(1400); x.tr.emitMsg(msg('peer00001', { x: 4, z: 0, anim: 'walk', t: 3 }));
  const out = x.s.sample(1500);
  assert.equal(out.length, 1);
  assert.equal(out[0].id, 'peer00001');
  assert.equal(out[0].nick, '닉-peer00001');
  assert.ok(Math.abs(out[0].x - 3) < 1e-9);
  assert.equal(x.s.count, 2);
});

test('session: 내 메시지, 다른 공간 메시지, 형식이 틀린 메시지는 버린다', async () => {
  const x = setup();
  await joined(x);
  x.tr.emitMsg(msg(me.id));
  x.tr.emitMsg(msg('peer00002', { space: 'laundry' }));
  for (const bad of [null, 'x', 5, [], { id: 'peer00003' }, msg('peer00004', { x: NaN }), msg('bad id', {}), msg('peer00005', { space: 'moon' })]) x.tr.emitMsg(bad);
  assert.equal(x.s.sample(5000).length, 0);
  assert.equal(x.s.stats.rejected >= 6, true);
  x.tr.emitMsg(msg('peer00006', { nick: '<img onerror=1>', anim: 'hack', outfit: 'x' }));
  const [p] = x.s.sample(5000);
  assert.equal(p.nick, 'img onerror=1');
  assert.equal(p.anim, 'idle');
  assert.equal(p.outfit, 'clean');
});

test('session: 순서가 뒤바뀐 옛 메시지와 너무 촘촘한 메시지를 버린다', async () => {
  const x = setup({ ...cfg, minRecvGapMs: 30 });
  await joined(x);
  x.at(0); x.tr.emitMsg(msg('peer00001', { x: 1, t: 10 }));
  x.at(10); assert.equal(x.s.ingest(msg('peer00001', { x: 2, t: 11 }), 10), false, '30ms 안');
  x.at(100); assert.equal(x.s.ingest(msg('peer00001', { x: 3, t: 5 }), 100), false, '옛 메시지');
  assert.equal(x.s.ingest(msg('peer00001', { x: 4, t: 12 }), 100), true);
});

test('session: 소식이 staleMs 넘게 없으면 지우고, presence leave 는 곧바로 지운다', async () => {
  const x = setup();
  await joined(x);
  x.at(0); x.tr.emitMsg(msg('peer00001'));
  x.tr.emitMsg(msg('peer00002', { t: 1 }));
  assert.equal(x.s.sample(1000).length, 2);
  x.at(5000); x.tr.emitMsg(msg('peer00002', { t: 2 }));
  assert.equal(x.s.sample(6000).length, 2, '6초 안');
  assert.equal(x.s.sample(6500).length, 1, 'peer1 은 6.5초 소식 없음');
  x.tr.emitPresence({ type: 'leave', id: 'peer00002' });
  assert.equal(x.s.sample(6600).length, 0);
});

test('session: 한 번에 maxRemote 명만(가까운 순), maxTracked 를 넘는 새 방문자는 기억하지 않는다', async () => {
  const x = setup({ ...cfg, maxRemote: 3, maxTracked: 5 });
  await joined(x);
  for (let i = 0; i < 8; i++) x.tr.emitMsg(msg(`peer0000${i}`, { x: 10 - i, z: 0 }));
  assert.equal(x.s.stats.remotes, 5);
  const out = x.s.sample(1000, { x: 0, z: 0 });
  assert.equal(out.length, 3);
  assert.deepEqual(out.map((o) => o.id), ['peer00004', 'peer00003', 'peer00002']);
});

test('session: 연결이 끊기면 방문자가 사라지고(빈 목록), 다시 연결되면 새로 시작한다', async () => {
  const x = setup();
  await joined(x);
  x.tr.emitMsg(msg('peer00001'));
  assert.equal(x.s.sample(1000).length, 1);
  x.tr.emitStatus('lost');
  assert.equal(x.s.status, 'lost');
  assert.deepEqual(x.s.sample(1001), []);
  x.s.update(local(), 2000);
  assert.equal(x.tr.sent.length, 0, '끊기면 보내지 않는다');
  x.tr.emitStatus('ready');
  assert.equal(x.s.status, 'ready');
  assert.equal(x.s.count, 1);
});

test('session: 전송이 던져도 update 는 던지지 않고, connect 가 reject 해도 lost', async () => {
  const x = setup();
  await joined(x);
  x.tr.emitPresence({ type: 'join', id: 'peer00001' });
  x.tr.send = () => { throw new Error('boom'); };
  assert.doesNotThrow(() => x.s.update(local({ x: 9 }), 5000));
  const y = setup();
  y.tr.connect = () => Promise.reject(new Error('no'));
  y.s.update(local());
  await new Promise((r) => setImmediate(r));
  assert.equal(y.s.status, 'lost');
  const z = setup();
  z.tr.connect = () => { throw new Error('sync boom'); };
  assert.doesNotThrow(() => z.s.update(local()));
  assert.equal(z.s.status, 'lost');
});

test('session: dispose 뒤에는 아무것도 하지 않는다', async () => {
  const x = setup();
  await joined(x);
  const seen = [];
  x.s.subscribe((s) => seen.push(s.status));
  x.s.dispose();
  assert.equal(x.s.status, 'off');
  assert.deepEqual(x.s.sample(1), []);
  assert.equal(x.s.ingest(msg('peer00001')), false);
  x.s.update(local({ space: 'laundry' }));
  assert.equal(x.tr.rooms.length, 1);
  x.s.dispose();
});

test('session: 방을 옮기면 이전 공간의 방문자는 사라진다', async () => {
  const x = setup();
  await joined(x);
  x.tr.emitMsg(msg('peer00001'));
  x.s.update(local({ space: 'interview', x: 600 }));
  x.tr.emitStatus('ready');
  assert.deepEqual(x.s.sample(1000), []);
  x.tr.emitMsg(msg('peer00001')); // 옛 방에서 늦게 온 메시지: 공간이 달라 버린다
  assert.deepEqual(x.s.sample(1000), []);
  x.tr.emitMsg(msg('peer00002', { space: 'interview', x: 600 }));
  assert.equal(x.s.sample(1000).length, 1);
});
