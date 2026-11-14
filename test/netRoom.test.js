import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRoomMsg, validateRoomMsg } from '../src/logic/net.js';
import { createSession } from '../src/net/session.js';
import { MULTIPLAYER } from '../src/config.js';

const limits = { slots: 12, shared: 6, washers: 6, maxT: 2_000_000 };
const base = { id: 'peer00001', space: 'laundry' };

test('buildRoomMsg: 번호·시각만 담는다(자유 글 필드 없음)', () => {
  const self = { id: 'me0000001' };
  assert.deepEqual(buildRoomMsg(self, 'laundry', { k: 'line', slot: 2, c: 3, t: 99, text: 'x' }), { k: 'line', id: 'me0000001', space: 'laundry', slot: 2, c: 3, t: 99 });
  assert.deepEqual(buildRoomMsg(self, 'laundry', { k: 'lines', e: [[0, 1, 5]], text: 'x' }), { k: 'lines', id: 'me0000001', space: 'laundry', e: [[0, 1, 5]] });
  assert.deepEqual(buildRoomMsg(self, 'laundry', { k: 'fx', i: 4, text: 'x' }), { k: 'fx', id: 'me0000001', space: 'laundry', ty: 'wash', i: 4 });
});

test('validateRoomMsg: 정상 메시지는 필요한 필드만 복사한다', () => {
  assert.deepEqual(validateRoomMsg({ ...base, k: 'line', slot: 0, c: 4, t: 10, extra: 1 }, limits), { ...base, k: 'line', slot: 0, c: 4, t: 10 });
  assert.deepEqual(validateRoomMsg({ ...base, k: 'line', slot: 8, c: 6, t: 10 }, limits), { ...base, k: 'line', slot: 8, c: 6, t: 10 });
  assert.deepEqual(validateRoomMsg({ ...base, k: 'line', slot: 8, c: -1, t: 10 }, limits), { ...base, k: 'line', slot: 8, c: -1, t: 10 });
  assert.deepEqual(validateRoomMsg({ ...base, k: 'lines', e: [[0, 1, 5], [7, 6, 6]], z: 1 }, limits), { ...base, k: 'lines', e: [[0, 1, 5], [7, 6, 6]] });
  assert.deepEqual(validateRoomMsg({ ...base, k: 'lines', e: [] }, limits), { ...base, k: 'lines', e: [] });
  assert.deepEqual(validateRoomMsg({ ...base, k: 'fx', ty: 'wash', i: 5 }, limits), { ...base, k: 'fx', ty: 'wash', i: 5 });
});

test('validateRoomMsg: 범위 밖·종류가 안 맞는 칸·미래 시각·중복·형식 오류는 null', () => {
  const bad = [
    null, 5, 'x', [], {}, { ...base, k: 'nope' }, { ...base, k: 'line', id: 'a', slot: 0, c: 1, t: 1 }, { ...base, k: 'line', space: 'yard', slot: 0, c: 1, t: 1 }, { ...base, k: 'line', space: 'interview', slot: 0, c: 1, t: 1 },
    { ...base, k: 'line', slot: -1, c: 1, t: 1 }, { ...base, k: 'line', slot: 12, c: 1, t: 1 }, { ...base, k: 'line', slot: 0.5, c: 1, t: 1 }, { ...base, k: 'line', slot: '0', c: 1, t: 1 },
    { ...base, k: 'line', slot: 0, c: 6, t: 1 }, { ...base, k: 'line', slot: 8, c: 3, t: 1 }, { ...base, k: 'line', slot: 0, c: 7, t: 1 }, { ...base, k: 'line', slot: 0, c: -2, t: 1 }, { ...base, k: 'line', slot: 0, c: 1.5, t: 1 },
    { ...base, k: 'line', slot: 0, c: 1, t: NaN }, { ...base, k: 'line', slot: 0, c: 1, t: -5 }, { ...base, k: 'line', slot: 0, c: 1, t: 2_000_001 }, { ...base, k: 'line', slot: 0, c: 1 },
    { ...base, k: 'line', slot: 12, c: -1, t: 1 }, { ...base, k: 'line', slot: 0, c: -1, t: Infinity },
    { ...base, k: 'lines', e: 'no' }, { ...base, k: 'lines' }, { ...base, k: 'lines', e: [[0, 1]] }, { ...base, k: 'lines', e: [[0, 1, 1], [0, 2, 2]] }, { ...base, k: 'lines', e: [[0, 6, 1]] }, { ...base, k: 'lines', e: [null] },
    { ...base, k: 'lines', e: Array.from({ length: 13 }, (_, i) => [i % 12, 0, 1]) },
    { ...base, k: 'fx', ty: 'wash', i: 6 }, { ...base, k: 'fx', ty: 'wash', i: -1 }, { ...base, k: 'fx', ty: 'wash', i: 1.2 }, { ...base, k: 'fx', ty: 'x', i: 1 }, { ...base, k: 'fx', i: 1 },
  ];
  for (const raw of bad) assert.equal(validateRoomMsg(raw, limits), null, JSON.stringify(raw));
  assert.equal(validateRoomMsg({ ...base, k: 'line', slot: 0, c: 1, t: 1 }, null), null);
});

// ---- 세션 ----
function fakeTransport() {
  const t = {
    ready: false, sent: [], cbs: { msg: [], pres: [], stat: [] },
    get isReady() { return t.ready; },
    connect() { return Promise.resolve(true); },
    send(m) { t.sent.push(m); },
    disconnect() { t.ready = false; },
    onMessage(cb) { t.cbs.msg.push(cb); },
    onPresence(cb) { t.cbs.pres.push(cb); },
    onStatus(cb) { t.cbs.stat.push(cb); },
    emitStatus(s) { t.ready = s === 'ready'; t.cbs.stat.forEach((c) => c(s)); },
    emitMsg(m) { t.cbs.msg.forEach((c) => c(m)); },
  };
  return t;
}
const cfg = { ...MULTIPLAYER, minRecvGapMs: 0, shardProbeMs: 0 };
const me = { id: 'me0000001', nick: 'me' };
const lim = { slots: 12, shared: 6, washers: 6 };
const local = (space) => ({ space, x: 300, z: 0, y: 0, rotY: 0, anim: 'idle', outfit: 'clean', seat: false });
async function laundry({ roomLimits = lim, space = 'laundry' } = {}) {
  const tr = fakeTransport();
  let nowMs = 0;
  const s = createSession({ transport: tr, self: me, cfg, now: () => nowMs, clock: () => 1_000_000, roomLimits });
  s.update(local(space));
  tr.emitStatus('ready');
  await Promise.resolve();
  const seen = [];
  s.onRoom((m) => seen.push(m));
  const at = (v) => { nowMs = v; return v; };
  const meet = (id) => tr.emitMsg({ id, nick: id, space, x: 300, z: 0, y: 0, rotY: 0, anim: 'idle', outfit: 'clean', seat: false, t: 1 });
  return { tr, s, seen, at, meet };
}
const line = (id, o = {}) => ({ k: 'line', id, space: 'laundry', slot: 1, c: 2, t: 900_000, ...o });

test('session: 상태를 보낸 적 있는 방문자의 빨랫줄·세탁기 효과 메시지만 검사 후 전달된다', async () => {
  const x = await laundry();
  x.tr.emitMsg(line('stranger01')); // 모르는 방문자
  assert.equal(x.seen.length, 0);
  x.meet('peer00001');
  x.at(1000); x.tr.emitMsg(line('peer00001'));
  x.at(2000); x.tr.emitMsg({ k: 'lines', id: 'peer00001', space: 'laundry', e: [[0, 1, 5]] });
  x.at(4000); x.tr.emitMsg({ k: 'fx', id: 'peer00001', space: 'laundry', ty: 'wash', i: 2 });
  assert.deepEqual(x.seen.map((m) => m.k), ['line', 'lines', 'fx']);
  assert.equal(x.seen[0].slot, 1);
});

test('session: 종류별 속도 제한(line 150ms, lines 1.5초, fx 0.7초)과 잘못된 값 거부, 다른 공간·나 자신 무시', async () => {
  const x = await laundry();
  x.meet('peer00001');
  const r0 = x.s.stats.rejected;
  x.at(1000); x.tr.emitMsg(line('peer00001'));
  x.at(1100); x.tr.emitMsg(line('peer00001')); // 150ms 안
  x.at(1200); x.tr.emitMsg(line('peer00001', { slot: 2 }));
  assert.equal(x.seen.length, 2);
  x.at(5000); x.tr.emitMsg({ k: 'lines', id: 'peer00001', space: 'laundry', e: [] });
  x.at(5500); x.tr.emitMsg({ k: 'lines', id: 'peer00001', space: 'laundry', e: [] }); // 1.5초 안
  assert.equal(x.seen.length, 3);
  x.at(9000); x.tr.emitMsg(line('peer00001', { slot: 99 }));
  x.at(9100); x.tr.emitMsg(line('peer00001', { c: 6 })); // 공용 칸에 흰 셔츠
  x.at(9200); x.tr.emitMsg(line('peer00001', { t: 5_000_000 })); // 먼 미래
  x.at(9300); x.tr.emitMsg({ k: 'fx', id: 'peer00001', space: 'laundry', ty: 'wash', i: 9 });
  assert.equal(x.seen.length, 3);
  assert.equal(x.s.stats.rejected, r0 + 4);
  x.at(9400); x.tr.emitMsg(line(me.id, { slot: 3 }));
  x.at(9500); x.tr.emitMsg(line('peer00001', { space: 'yard' }));
  assert.equal(x.seen.length, 3);
});

test('session: roomLimits 가 없으면 받지도 보내지도 않고, 세탁소가 아니면 보내지 않는다', async () => {
  const x = await laundry({ roomLimits: null });
  x.meet('peer00001');
  x.at(1000); x.tr.emitMsg(line('peer00001'));
  assert.equal(x.seen.length, 0);
  assert.equal(x.s.sendRoom({ k: 'fx', i: 1 }, 2000), false);
  const y = await laundry({ space: 'yard' });
  y.meet('peer00001');
  assert.equal(y.s.sendRoom({ k: 'fx', i: 1 }, 2000), false, '세탁소가 아닌 공간에서는 보내지 않는다');
});

test('session.sendRoom: 듣는 사람이 있을 때 번호만 담아 보내고, 종류별 간격을 지키며, 잘못된 값은 보내지 않는다', async () => {
  const x = await laundry();
  assert.equal(x.s.sendRoom({ k: 'fx', i: 1 }, 1000), false, '듣는 사람이 없다');
  x.meet('peer00001');
  assert.equal(x.s.sendRoom({ k: 'line', slot: 7, c: 6, t: 123, text: 'x' }, 2000), true);
  assert.deepEqual(x.tr.sent.at(-1), { k: 'line', id: me.id, space: 'laundry', slot: 7, c: 6, t: 123 });
  assert.equal(x.s.sendRoom({ k: 'line', slot: 8, c: 6, t: 124 }, 2050), false, '150ms 안');
  assert.equal(x.s.sendRoom({ k: 'fx', i: 3 }, 2060), true, '종류가 다르면 따로 센다');
  assert.equal(x.s.sendRoom({ k: 'lines', e: [[0, 1, 5]] }, 2070), true);
  assert.equal(x.s.sendRoom({ k: 'lines', e: [[0, 1, 5]] }, 3000), false, '목록은 1.5초 간격');
  assert.equal(x.s.sendRoom({ k: 'lines', e: [[0, 1, 5]] }, 3600), true);
  assert.equal(x.s.sendRoom({ k: 'line', slot: 99, c: 1, t: 1 }, 9000), false);
  assert.equal(x.s.sendRoom({ k: 'fx', i: 77 }, 9000), false);
  assert.equal(x.s.sendRoom(null, 9000), false);
});
