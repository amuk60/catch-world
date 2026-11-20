import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WISH, MULTIPLAYER } from '../src/config.js';
import { parseTowerCount, mergeTowerCount, towerLine, WS_LIMIT } from '../src/logic/wishTower.js';
import { nextStoneCount } from '../src/logic/wish.js';
import { buildState, validateState, buildWishMsg, validateWishMsg } from '../src/logic/net.js';
import { createSession } from '../src/net/session.js';
import { MAX_LINE_LENGTH } from '../src/logic/incinerator.js';

const LIMITS = { max: WS_LIMIT, gapMs: WISH.recvGapMs };

test('탑 개수 읽기: 0..상한 정수만, 그 밖(소수·음수·문자열·큰 값)은 무시', () => {
  for (const v of [0, 1, 30, WS_LIMIT]) assert.equal(parseTowerCount(v), v);
  for (const v of [-1, 1.5, '3', null, undefined, NaN, Infinity, WS_LIMIT + 1, {}, [3]]) assert.equal(parseTowerCount(v), null, String(v));
});

test('탑 합치기: 받은 개수가 지금보다 클 때만(내 최대로 자른 값), 아니면 그대로(null)', () => {
  assert.equal(mergeTowerCount(3, 5), 5);
  assert.equal(mergeTowerCount(5, 5), null, '같으면 그대로');
  assert.equal(mergeTowerCount(7, 5), null, '작으면 그대로(큰 쪽 유지)');
  assert.equal(mergeTowerCount(0, 999), WISH.maxStones, '내 최대에서 자른다');
  assert.equal(mergeTowerCount(WISH.maxStones, 999), null, '이미 가득');
  for (const bad of ['9', -2, 2.5, null, WS_LIMIT + 1]) assert.equal(mergeTowerCount(0, bad), null, String(bad));
  assert.equal(nextStoneCount(WISH.maxStones - 1), WISH.maxStones);
  assert.equal(nextStoneCount(WISH.maxStones), WISH.maxStones, '최대에서 멈춘다');
});

test('말풍선 줄: "이 탑에 지금 N개의 소원이 쌓였어요", 줄마다 말풍선 길이 이하, 0 이면 생략', () => {
  assert.equal(towerLine(7), '이 탑에 지금 7개의\n소원이 쌓였어요');
  assert.equal(towerLine(0), '');
  assert.equal(towerLine(null), '');
  for (const l of towerLine(WISH.maxStones).split('\n')) assert.ok([...l].length <= MAX_LINE_LENGTH, l);
});

test('"돌 얹음" 알림: 개수 n 만 싣고(소원 글 없음), 검사는 정수 범위·형식만 통과', () => {
  const m = buildWishMsg({ id: 'me0000001' }, 'yard', 4);
  assert.deepEqual(m, { k: 'wish', id: 'me0000001', space: 'yard', n: 4 });
  assert.deepEqual(validateWishMsg({ ...m, wish: '합격', extra: 1 }, LIMITS), { id: 'me0000001', space: 'yard', n: 4 }, '모르는 필드는 버린다');
  for (const bad of [{ ...m, n: 0 }, { ...m, n: 1.5 }, { ...m, n: '4' }, { ...m, n: WS_LIMIT + 1 }, { ...m, id: 'x' }, { ...m, space: 'moon' }, { ...m, k: 'chat' }, null, [m]]) {
    assert.equal(validateWishMsg(bad, LIMITS), null, JSON.stringify(bad));
  }
});

test('상태 메시지의 탑 개수 ws: 1 이상이면 숫자 하나로 싣고, 받는 쪽은 이상한 값이면 그 필드만 버린다', () => {
  const me = { id: 'me0000001', nick: '' };
  const local = { space: 'yard', x: 0, z: 0, y: 0, rotY: 0, anim: 'idle', outfit: 'clean', seat: false };
  assert.equal('ws' in buildState(me, local, 1), false, '없으면 싣지 않는다');
  assert.equal('ws' in buildState(me, { ...local, ws: 0 }, 1), false, '0 이면 싣지 않는다');
  const s = buildState(me, { ...local, ws: 12 }, 1);
  assert.equal(s.ws, 12);
  assert.equal(validateState(s).ws, 12);
  for (const bad of [-1, 2.5, '12', WS_LIMIT + 1]) {
    const v = validateState({ ...s, ws: bad });
    assert.ok(v, '메시지는 받는다');
    assert.equal('ws' in v, false, String(bad));
  }
});

// 두 방문자: 서로의 전송을 이어 붙인 가짜 전송(같은 방).
function fakeTransport() {
  const t = {
    ready: false, sent: [], peer: null, cbs: { msg: [], pres: [], stat: [] },
    get isReady() { return t.ready; },
    connect() { return Promise.resolve(true); },
    send(m) { t.sent.push(m); t.peer?.cbs.msg.forEach((c) => c(JSON.parse(JSON.stringify(m)))); },
    disconnect() { t.ready = false; },
    onMessage(cb) { t.cbs.msg.push(cb); },
    onPresence(cb) { t.cbs.pres.push(cb); },
    onStatus(cb) { t.cbs.stat.push(cb); },
    emitStatus(s) { t.ready = s === 'ready'; t.cbs.stat.forEach((c) => c(s)); },
  };
  return t;
}
async function pair() {
  const cfg = { ...MULTIPLAYER, minRecvGapMs: 0, shardProbeMs: 0 };
  let nowMs = 0;
  const ta = fakeTransport();
  const tb = fakeTransport();
  ta.peer = tb; tb.peer = ta;
  const a = createSession({ transport: ta, self: { id: 'aaaa00001', nick: '' }, cfg, now: () => nowMs, clock: () => 1000 + nowMs, wishLimits: LIMITS });
  const b = createSession({ transport: tb, self: { id: 'bbbb00001', nick: '' }, cfg, now: () => nowMs, clock: () => 1000 + nowMs, wishLimits: LIMITS });
  const local = (ws) => ({ space: 'yard', x: 0, z: 0, y: 0, rotY: 0, anim: 'idle', outfit: 'clean', seat: false, ws });
  a.update(local(0)); b.update(local(0));
  ta.emitStatus('ready'); tb.emitStatus('ready');
  await Promise.resolve();
  ta.cbs.pres.forEach((c) => c({ type: 'join', id: 'bbbb00001' }));
  tb.cbs.pres.forEach((c) => c({ type: 'join', id: 'aaaa00001' }));
  return { a, b, ta, tb, local, at: (v) => { nowMs = v; } };
}

test('두 방문자: 나중에 들어온 사람도 상태 메시지의 ws 로 탑을 맞추고, 소원을 빌면 알림 하나로 상대 탑에 돌이 얹힌다', async () => {
  const x = await pair();
  const towers = { a: 0, b: 0 };
  const anim = [];
  // main.js 의 onRemoteWish 와 같은 규칙: mergeTowerCount 로 큰 쪽만
  const hook = (who) => (ev) => { const n = mergeTowerCount(towers[who], ev.n); if (n !== null) { towers[who] = n; anim.push({ who, n, quiet: ev.quiet }); } };
  x.a.onWish(hook('a'));
  x.b.onWish(hook('b'));
  // a 는 예전에 본 탑 7개를 기억하고 있다. b 는 처음. 서로 상태를 보낸다(새 메시지는 없다: 평소 상태 메시지에 실린다).
  towers.a = 7;
  x.at(100); x.a.update(x.local(towers.a)); x.b.update(x.local(towers.b));
  assert.equal(towers.b, 7, 'b 는 a 의 탑에 맞춘다');
  assert.deepEqual(anim.at(-1), { who: 'b', n: 7, quiet: true }, '연출 없이');
  // b 가 소원을 빈다: 8 개가 되고 알림 하나.
  towers.b = nextStoneCount(towers.b);
  const before = x.tb.sent.length;
  assert.equal(x.b.wish(towers.b), true);
  assert.equal(x.tb.sent.length - before, 1, '알림은 한 번');
  assert.deepEqual(x.tb.sent.at(-1), { k: 'wish', id: 'bbbb00001', space: 'yard', n: 8 }, '개수만(소원 글 없음)');
  assert.equal(towers.a, 8);
  assert.deepEqual(anim.at(-1), { who: 'a', n: 8, quiet: false }, '상대 탑에 돌이 내려앉는다');
  // 작은 값·같은 값은 무시(큰 쪽 유지)
  x.at(5000);
  x.ta.cbs.msg.forEach((c) => c({ k: 'wish', id: 'bbbb00001', space: 'yard', n: 3 }));
  assert.equal(towers.a, 8);
});

test('두 방문자: 받는 쪽 속도 제한(보낸 사람마다 recvGapMs), 보내는 쪽 1초에 한 번, 모르는 사람·다른 공간 알림은 버린다', async () => {
  const x = await pair();
  const got = [];
  x.a.onWish((ev) => { if (!ev.quiet) got.push(ev.n); });
  x.at(100); x.a.update(x.local(0)); x.b.update(x.local(0)); // 서로 상태를 한 번 보내 "아는 방문자"가 된다
  const send = (n, o = {}) => x.ta.cbs.msg.forEach((c) => c({ k: 'wish', id: 'bbbb00001', space: 'yard', n, ...o }));
  x.at(1000); send(1);
  x.at(1500); send(2);
  assert.deepEqual(got, [1], '간격 안의 두 번째는 버린다');
  x.at(1000 + WISH.recvGapMs); send(3);
  assert.deepEqual(got, [1, 3]);
  x.at(20000); send(4, { id: 'zzzz00001' }); send(5, { space: 'laundry' });
  assert.deepEqual(got, [1, 3], '모르는 방문자·다른 공간');
  x.at(30000);
  assert.equal(x.b.wish(5), true);
  x.at(30500);
  assert.equal(x.b.wish(6), false, '보내는 쪽도 1초 간격');
});

test('전송량: ws 를 실어도 상태 메시지 수는 그대로(같은 입력이면 보낸 수가 같다)', async () => {
  const count = async (ws) => {
    const x = await pair();
    for (let t = 100; t <= 60000; t += 100) { x.at(t); x.a.update(x.local(ws)); }
    return x.ta.sent.length;
  };
  assert.equal(await count(25), await count(0));
});
