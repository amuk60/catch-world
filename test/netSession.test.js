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

const cfg = { ...MULTIPLAYER, minRecvGapMs: 0, shardProbeMs: 0 }; // 방 인원 세기(샤딩)는 아래 별도 시험에서
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
  assert.deepEqual(x.tr.rooms, [{ room: 'catch-world:yard-1', id: me.id }]);
  assert.equal(x.s.status, 'connecting');
  x.tr.emitStatus('ready');
  assert.equal(x.s.status, 'ready');
  x.s.update(local());
  assert.equal(x.tr.rooms.length, 1, '같은 공간이면 다시 들어가지 않는다');
  x.s.update(local({ space: 'laundry', x: 300 }));
  assert.equal(x.tr.rooms.at(-1).room, 'catch-world:laundry-1');
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
  const out = x.s.sample(1550); // 보간 지연 250ms -> 1300 시점
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
  assert.equal(x.s.sample(9500).length, 1, 'peer1 은 9.5초 소식 없음');
  x.tr.emitPresence({ type: 'leave', id: 'peer00002' });
  assert.equal(x.s.sample(9600).length, 0);
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

// ---- 샤딩 ----
const shardCfg = { ...MULTIPLAYER, minRecvGapMs: 0, shardProbeMs: 700, roomCap: 2, maxShards: 3, fullRetryMs: 60000 };
const presence = (x, ids) => ids.forEach((id) => x.tr.emitPresence({ type: 'join', id }));

test('샤딩: 1번 방에 자리가 있으면 probe 시간이 지난 뒤에 머문다', () => {
  const x = setup(shardCfg);
  x.at(0); x.s.update(local(), 0);
  assert.equal(x.tr.rooms.at(-1).room, 'catch-world:yard-1');
  x.at(10); x.tr.emitStatus('ready');
  presence(x, ['peer00001']);
  assert.equal(x.s.status, 'connecting', '인원을 세는 동안은 준비 아님');
  x.s.update(local(), 500);
  assert.equal(x.s.status, 'connecting');
  assert.equal(x.tr.sent.length, 0);
  x.s.update(local(), 800);
  assert.equal(x.s.status, 'ready');
  assert.equal(x.s.shard, 1);
  assert.equal(x.s.room, 'catch-world:yard-1');
  x.s.update(local({ x: 5 }), 900);
  assert.equal(x.tr.sent.length, 1, '머문 뒤 곧바로 한 번 보낸다');
});

test('샤딩: 1번 방이 차 있으면(cap 명) 2번 방으로, 거기도 차면 3번 방으로', () => {
  const x = setup(shardCfg);
  x.at(0); x.s.update(local(), 0);
  x.at(10); x.tr.emitStatus('ready');
  presence(x, ['peer00001', 'peer00002']);
  x.s.update(local(), 800);
  assert.equal(x.tr.rooms.at(-1).room, 'catch-world:yard-2');
  assert.equal(x.s.shard, 2);
  assert.equal(x.s.status, 'connecting');
  x.at(900); x.tr.emitStatus('ready');
  presence(x, ['peer00003', 'peer00004']);
  x.s.update(local(), 1000);
  assert.equal(x.s.shard, 2, '새 방도 probe 시간을 다시 기다린다');
  x.s.update(local(), 1700);
  assert.equal(x.tr.rooms.at(-1).room, 'catch-world:yard-3');
  x.at(1800); x.tr.emitStatus('ready');
  presence(x, ['peer00005']);
  x.s.update(local(), 2600);
  assert.equal(x.s.status, 'ready');
  assert.equal(x.s.shard, 3);
});

test('샤딩: 모든 방이 차면 full: 연결을 끊고 보내지 않으며, fullRetryMs 뒤에 다시 1번 방부터 시도', () => {
  const x = setup({ ...shardCfg, maxShards: 1 });
  x.at(0); x.s.update(local(), 0);
  x.at(10); x.tr.emitStatus('ready');
  presence(x, ['peer00001', 'peer00002']);
  const before = x.tr.disconnects;
  x.s.update(local(), 800);
  assert.equal(x.s.status, 'full');
  assert.ok(x.tr.disconnects > before);
  assert.deepEqual(x.s.sample(900), []);
  assert.equal(x.s.ingest(msg('peer00009'), 900), false);
  x.s.update(local({ x: 3 }), 30000);
  assert.equal(x.tr.sent.length, 0);
  assert.equal(x.tr.rooms.length, 1);
  x.s.update(local(), 60900);
  assert.equal(x.tr.rooms.length, 2, '재시도');
  assert.equal(x.s.status, 'connecting');
});

test('샤딩: 공간을 옮기면 그 공간의 1번 방부터 다시 세고, 이미 머문 사람은 쫓겨나지 않는다', () => {
  const x = setup(shardCfg);
  x.at(0); x.s.update(local(), 0);
  x.at(10); x.tr.emitStatus('ready');
  x.s.update(local(), 800);
  assert.equal(x.s.status, 'ready');
  presence(x, ['peer00001', 'peer00002', 'peer00003']); // 나중에 인원이 cap 을 넘어도
  x.s.update(local(), 900);
  assert.equal(x.s.status, 'ready', '재판단하지 않는다');
  assert.equal(x.s.shard, 1);
  x.s.update(local({ space: 'laundry', x: 300 }), 1000);
  assert.equal(x.tr.rooms.at(-1).room, 'catch-world:laundry-1');
});

test('샤딩: probe 중 연결이 끊겼다 돌아오면 probe 시간을 다시 기다린다', () => {
  const x = setup(shardCfg);
  x.at(0); x.s.update(local(), 0);
  x.at(10); x.tr.emitStatus('ready');
  x.tr.emitStatus('lost');
  assert.equal(x.s.status, 'lost');
  x.at(2000); x.tr.emitStatus('ready');
  x.s.update(local(), 2500);
  assert.equal(x.s.status, 'connecting');
  x.s.update(local(), 2800);
  assert.equal(x.s.status, 'ready');
});

// ---- 숨김/유휴 ----
test('setActive(false) 면 보내지 않고, 다시 켜면 곧바로 한 번 보낸다(heartbeat 만 남지도 않는다)', async () => {
  const x = setup();
  await joined(x);
  x.tr.emitPresence({ type: 'join', id: 'peer00001' });
  x.s.update(local(), 100);
  const n = x.tr.sent.length;
  x.s.setActive(false);
  for (let t = 200; t < 20000; t += 200) x.s.update(local({ x: t / 100 }), t);
  assert.equal(x.tr.sent.length, n);
  assert.equal(x.s.status, 'ready', '연결과 presence 는 유지');
  x.s.setActive(true);
  x.s.update(local({ x: 1 }), 20100);
  assert.equal(x.tr.sent.length, n + 1);
});

test('전송량: 기본 설정(3Hz)에서 계속 걸어도 초당 3번 이하, 서 있으면 3초에 한 번', () => {
  const p = MULTIPLAYER;
  assert.equal(p.sendHz, 3);
  assert.equal(p.heartbeatMs, 3000);
  assert.ok(p.interpDelayMs >= 250);
  assert.ok(p.staleMs > p.heartbeatMs * 2);
  assert.equal(p.idleMs, 5 * 60 * 1000, '입력이 5분 없으면 유휴');
});

// ---- 면접 답변·돌발행동 한마디(k: 'say') ----
const sayLimits = { questions: 12, answers: 3, improvs: ['paperToss', 'reverse', 'dance', 'banzai'] };
const sayMsg = (id, o = {}) => ({ k: 'say', id, space: 'interview', ty: 'ans', q: 2, a: 1, ...o });
async function hall({ limits = sayLimits, c = cfg } = {}) {
  const tr = fakeTransport();
  let nowMs = 0;
  const s = createSession({ transport: tr, self: me, cfg: c, now: () => nowMs, clock: () => 777, sayLimits: limits });
  s.update(local({ space: 'interview', x: 600 }));
  tr.emitStatus('ready');
  await Promise.resolve();
  const seen = [];
  s.onSay((e) => seen.push(e));
  const at = (v) => { nowMs = v; return v; };
  // 방문자 한 명을 알린다(상태 메시지를 먼저 받은 사람만 한마디가 통한다).
  const meet = (id, t = at(1000)) => tr.emitMsg(msg(id, { space: 'interview', x: 600, z: 0, t }));
  return { tr, s, seen, at, meet };
}

test('session: 상태를 보낸 적 있는 방문자의 한마디는 검사 후 구독자에게 전달된다(보낸이 닉네임 포함, 글은 없다)', async () => {
  const x = await hall();
  x.meet('peer00001');
  x.at(1100); x.tr.emitMsg(sayMsg('peer00001', { q: 5, a: 2 }));
  assert.deepEqual(x.seen, [{ id: 'peer00001', nick: '닉-peer00001', ty: 'ans', q: 5, a: 2, imp: undefined }]);
  x.at(3000); x.tr.emitMsg(sayMsg('peer00001', { ty: 'imp', imp: 'dance', q: undefined, a: undefined }));
  assert.equal(x.seen.length, 2);
  assert.equal(x.seen[1].ty, 'imp');
  assert.equal(x.seen[1].imp, 'dance');
});

test('session: 한마디는 1.5초에 한 번만 통과하고(보낸 사람마다), 한마디가 상태 보간·검사 통계에 섞이지 않는다', async () => {
  const x = await hall();
  x.meet('peer00001');
  x.meet('peer00002');
  const rejectedBefore = x.s.stats.rejected;
  x.at(2000); x.tr.emitMsg(sayMsg('peer00001'));
  x.at(2500); x.tr.emitMsg(sayMsg('peer00001'));
  x.at(2600); x.tr.emitMsg(sayMsg('peer00002'));
  x.at(3499); x.tr.emitMsg(sayMsg('peer00001'));
  assert.deepEqual(x.seen.map((e) => e.id), ['peer00001', 'peer00002']);
  x.at(3500); x.tr.emitMsg(sayMsg('peer00001'));
  assert.equal(x.seen.length, 3);
  assert.equal(x.s.stats.rejected, rejectedBefore, '정상 한마디는 거부 통계가 아니다');
  assert.equal(x.s.sample(4000).length, 2);
});

test('session: 모르는 방문자·다른 공간·내 메시지·범위 밖 번호·목록 밖 돌발행동의 한마디는 무시한다', async () => {
  const x = await hall();
  x.meet('peer00001');
  x.at(2000);
  x.tr.emitMsg(sayMsg('stranger01')); // 상태를 보낸 적이 없다
  x.tr.emitMsg(sayMsg('peer00001', { space: 'laundry' })); // 다른 공간 표시
  x.tr.emitMsg(sayMsg(me.id)); // 나 자신
  assert.equal(x.seen.length, 0);
  const r0 = x.s.stats.rejected;
  x.at(4000); x.tr.emitMsg(sayMsg('peer00001', { q: 12 }));
  x.at(6000); x.tr.emitMsg(sayMsg('peer00001', { a: 3 }));
  x.at(8000); x.tr.emitMsg(sayMsg('peer00001', { ty: 'imp', imp: 'rm -rf' }));
  x.at(10000); x.tr.emitMsg(sayMsg('peer00001', { text: '<b>hi</b>', q: 'x' }));
  assert.equal(x.seen.length, 0);
  assert.equal(x.s.stats.rejected, r0 + 4);
  x.at(12000); x.tr.emitMsg(sayMsg('peer00001'));
  assert.equal(x.seen.length, 1, '앞의 거부가 정상 한마디를 막지 않는다');
});

test('session: 내가 다른 공간으로 가면(방을 옮기면) 그 방문자를 잊어 한마디도 받지 않는다. 구독을 풀면 더 오지 않는다', async () => {
  const x = await hall();
  x.meet('peer00001');
  x.s.update(local({ space: 'yard' }), 1500);
  x.tr.emitStatus('ready');
  x.at(3000); x.tr.emitMsg(sayMsg('peer00001'));
  assert.equal(x.seen.length, 0);
  const y = await hall();
  const extra = [];
  const off = y.s.onSay((e) => extra.push(e));
  y.meet('peer00001');
  y.at(2000); y.tr.emitMsg(sayMsg('peer00001'));
  off();
  y.at(4000); y.tr.emitMsg(sayMsg('peer00001'));
  assert.equal(extra.length, 1);
  assert.equal(y.seen.length, 2);
});

test('session: sayLimits 가 없으면 한마디를 받지도 보내지도 않는다(기존 동작 그대로)', async () => {
  const x = await hall({ limits: null });
  x.meet('peer00001');
  x.at(2000); x.tr.emitMsg(sayMsg('peer00001'));
  assert.equal(x.seen.length, 0);
  assert.equal(x.s.say({ ty: 'ans', q: 0, a: 0 }), false);
  assert.equal(x.tr.sent.filter((m) => m.k === 'say').length, 0);
});

test('session.say: 연결되고 듣는 사람이 있을 때 번호만 담아 보내고, 1.5초 안의 연속 전송·잘못된 값·듣는 사람 없음은 보내지 않는다', async () => {
  const x = await hall();
  assert.equal(x.s.say({ ty: 'ans', q: 1, a: 1 }, 1000), false, '듣는 사람이 없다');
  x.meet('peer00001');
  assert.equal(x.s.say({ ty: 'ans', q: 4, a: 0, text: '자유 글' }, 2000), true);
  assert.deepEqual(x.tr.sent.at(-1), { k: 'say', id: me.id, space: 'interview', ty: 'ans', q: 4, a: 0 });
  assert.equal(x.s.say({ ty: 'imp', imp: 'banzai' }, 3000), false, '간격 안');
  assert.equal(x.s.say({ ty: 'imp', imp: 'banzai' }, 3500), true);
  assert.deepEqual(x.tr.sent.at(-1), { k: 'say', id: me.id, space: 'interview', ty: 'imp', imp: 'banzai' });
  assert.equal(x.s.say({ ty: 'ans', q: 99, a: 0 }, 9000), false);
  assert.equal(x.s.say({ ty: 'imp', imp: 'nope' }, 9000), false);
  assert.equal(x.s.say(null, 9000), false);
  x.s.dispose();
  assert.equal(x.s.say({ ty: 'ans', q: 1, a: 1 }, 20000), false);
});
