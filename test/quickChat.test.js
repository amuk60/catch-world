import test from 'node:test';
import assert from 'node:assert/strict';
import { buildChat, validateChat } from '../src/logic/net.js';
import { quickChatText, cleanQuickChat, createChatLimiter, quickChatKey } from '../src/logic/quickChat.js';
import { QUICK_CHAT, MULTIPLAYER } from '../src/config.js';
import { createSession } from '../src/net/session.js';

const limits = { count: 8 };
const ok = { k: 'chat', id: 'peer00001', space: 'yard', i: 3 };

test('QUICK_CHAT 설정: 8개, 모두 16자 이하', () => {
  assert.equal(QUICK_CHAT.length, 8);
  assert.deepEqual(cleanQuickChat(QUICK_CHAT), QUICK_CHAT.map((t) => t.trim()));
  for (const t of QUICK_CHAT) assert.ok([...t].length <= 16, t);
});

test('quickChatText: 정수 범위만', () => {
  assert.equal(quickChatText(QUICK_CHAT, 0), QUICK_CHAT[0]);
  for (const i of [-1, 8, 1.5, '1', NaN, null, undefined, {}, Infinity]) assert.equal(quickChatText(QUICK_CHAT, i), null, String(i));
  assert.equal(quickChatText(['', ' '], 0), null);
  assert.equal(quickChatText(null, 0), null);
  assert.deepEqual(cleanQuickChat(['ok', '', 'x'.repeat(17), 3]), ['ok', null, null, null]);
});

test('buildChat: 번호만 담는다', () => {
  assert.deepEqual(buildChat({ id: 'me0000001', nick: 'n' }, 'yard', 2), { k: 'chat', id: 'me0000001', space: 'yard', i: 2 });
});

test('validateChat: 정상은 필요한 필드만 복사, 나머지는 null', () => {
  assert.deepEqual(validateChat({ ...ok, text: '<b>x</b>', nick: 'y' }, limits), { id: 'peer00001', space: 'yard', i: 3 });
  const bad = [null, 1, 'x', [], {}, { ...ok, k: 'say' }, { ...ok, id: 'a' }, { ...ok, id: 3 }, { ...ok, space: 'moon' }, { ...ok, i: -1 }, { ...ok, i: 8 }, { ...ok, i: 1.2 }, { ...ok, i: '2' }, { ...ok, i: NaN }, { ...ok, i: null }, { ...ok, i: undefined }, { ...ok, i: 1e9 }];
  for (const raw of bad) assert.equal(validateChat(raw, limits), null, JSON.stringify(raw));
  assert.equal(validateChat(ok, null), null);
});

test('createChatLimiter: 보낸 사람마다 2초, 전체 상한', () => {
  const lim = createChatLimiter({ perSenderMs: 2000, globalMax: 3, windowMs: 3000 });
  assert.equal(lim.allow('a', 0), true);
  assert.equal(lim.allow('a', 1999), false);
  assert.equal(lim.allow('b', 100), true);
  assert.equal(lim.allow('c', 200), true);
  assert.equal(lim.allow('d', 300), false, '전체 상한');
  assert.equal(lim.allow('a', 2000), false, '창 안에서는 여전히 상한');
  assert.equal(lim.allow('a', 3500), true, '창이 지나면 다시');
});

test('quickChatKey: 닫힘 -> T 로 열기, 입력 중·막힘이면 무시', () => {
  const k = (o) => quickChatKey({ count: 8, ...o });
  assert.deepEqual(k({ code: 'KeyT', open: false }), { type: 'open' });
  assert.equal(k({ code: 'KeyT', open: false, typing: true }), null);
  assert.equal(k({ code: 'KeyT', open: false, blocked: true }), null);
  assert.equal(k({ code: 'KeyT', open: false, repeat: true }), null);
  assert.equal(k({ code: 'Digit1', open: false }), null, '닫혀 있으면 숫자 키는 게임이 쓴다');
  assert.equal(k({ code: 'Escape', open: false }), null);
});

test('quickChatKey: 열림 -> 숫자 1~8 고르기, Esc·T 닫기, 입력 중이면 무시, 막히면 닫기', () => {
  const k = (o) => quickChatKey({ count: 8, open: true, ...o });
  assert.deepEqual(k({ code: 'Digit1' }), { type: 'pick', index: 0 });
  assert.deepEqual(k({ code: 'Numpad8' }), { type: 'pick', index: 7 });
  assert.deepEqual(k({ code: 'Digit9' }), { type: 'consume' });
  assert.deepEqual(k({ code: 'Escape' }), { type: 'close' });
  assert.deepEqual(k({ code: 'KeyT' }), { type: 'close' });
  assert.deepEqual(k({ code: 'Digit2', repeat: true }), { type: 'consume' });
  assert.equal(k({ code: 'KeyW' }), null, '이동 키는 막지 않는다');
  assert.equal(k({ code: 'Digit1', typing: true }), null);
  assert.deepEqual(k({ code: 'KeyW', blocked: true }), { type: 'close' });
});

// ---- 세션 ----
function fakeTransport() {
  const t = { sent: [], isReady: true, cbs: { m: [], p: [], s: [] }, onMessage(c) { t.cbs.m.push(c); }, onPresence(c) { t.cbs.p.push(c); }, onStatus(c) { t.cbs.s.push(c); }, send(m) { t.sent.push(m); }, disconnect() {}, async connect() { for (const c of t.cbs.s) c('ready'); return true; } };
  return t;
}
const state = (id, space = 'yard', extra = {}) => ({ id, nick: '친구 곰', space, x: 0, z: 0, y: 0, rotY: 0, anim: 'idle', outfit: 'clean', seat: false, t: 1, ...extra });
async function makeSession() {
  const transport = fakeTransport();
  const cfg = { ...MULTIPLAYER, shardProbeMs: 0, channelPrefix: 'x:' };
  const s = createSession({ transport, self: { id: 'me0000001', nick: '나' }, cfg, now: () => 0, chatLimits: { count: 8 } });
  s.update({ space: 'yard', x: 0, z: 0, y: 0, rotY: 0, anim: 'idle', outfit: 'clean', seat: false }, 0);
  await Promise.resolve();
  await Promise.resolve();
  return { s, transport };
}

test('세션: 같은 방에서 상태를 보낸 방문자의 채팅만 받고 보낸 사람마다 속도 제한', async () => {
  const { s } = await makeSession();
  const got = [];
  s.onChat((ev) => got.push(ev));
  assert.equal(s.ingest({ k: 'chat', id: 'peer00001', space: 'yard', i: 1 }, 100), false, '아직 상태를 보낸 적 없는 방문자');
  s.ingest(state('peer00001'), 100);
  assert.equal(s.ingest({ k: 'chat', id: 'peer00001', space: 'yard', i: 1 }, 200), true);
  assert.deepEqual(got[0], { id: 'peer00001', nick: '친구 곰', i: 1 });
  assert.equal(s.ingest({ k: 'chat', id: 'peer00001', space: 'yard', i: 2 }, 1000), false, '2초 안');
  assert.equal(s.ingest({ k: 'chat', id: 'peer00001', space: 'yard', i: 2 }, 2300), true);
  assert.equal(s.ingest({ k: 'chat', id: 'peer00001', space: 'laundry', i: 2 }, 5000), false, '다른 공간');
  assert.equal(s.ingest({ k: 'chat', id: 'peer00001', space: 'yard', i: 99 }, 6000), false, '범위 밖');
  assert.equal(s.ingest({ k: 'chat', id: 'me0000001', space: 'yard', i: 1 }, 7000), false, '내 것');
  assert.equal(got.length, 2);
});

test('세션: 악성 닉네임은 무난한 이름으로 바뀌고 chat 보내기도 속도 제한', async () => {
  const { s, transport } = await makeSession();
  s.ingest(state('peer00002', 'yard', { nick: '<img src=x onerror=1>' }), 100);
  s.ingest(state('peer00003', 'yard', { nick: '시 발' }), 100);
  s.ingest(state('peer00004', 'yard', { nick: '가'.repeat(300) }), 100);
  const names = s.sample(400).map((r) => r.nick);
  assert.equal(names.length, 3);
  for (const n of names) assert.match(n, / #\d{3}$/);
  assert.equal(s.chat(2, 1000), true);
  assert.deepEqual(transport.sent.at(-1), { k: 'chat', id: 'me0000001', space: 'yard', i: 2 });
  assert.equal(s.chat(3, 1500), false, '2초 안');
  assert.equal(s.chat(99, 9000), false, '범위 밖');
  assert.equal(s.chat(3, 3100), true);
});
