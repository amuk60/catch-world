import test from 'node:test';
import assert from 'node:assert/strict';
import { createLine, WHITE, REMOVED } from '../src/logic/line.js';

const mk = (selfId = 'aaaa0001') => createLine({ shared: 6, personal: 6, selfId });
const filled = (line) => line.view().map((v, i) => (v ? [i, v.c, v.mine] : null)).filter(Boolean);

test('칸 수는 공용(파스텔) + 개인(흰 내 셔츠)이고 처음엔 모두 비어 있다', () => {
  const line = mk();
  assert.equal(line.slots, 12);
  assert.equal(line.view().length, 12);
  assert.ok(line.view().every((v) => v === null));
  assert.deepEqual(line.snapshot(), []);
});

test('hangPastel: 공용 칸을 첫 빈 칸부터 채우고, 가득 차면 가장 오래된 칸을 바꾼다(개인 칸은 쓰지 않는다)', () => {
  const line = mk();
  const slots = [];
  for (let i = 0; i < 6; i++) slots.push(line.hangPastel(i, 1000 + i * 10).slot);
  assert.deepEqual(slots, [0, 1, 2, 3, 4, 5]);
  assert.equal(line.hangPastel(2, 2000).slot, 0, '가장 오래된 칸(0)을 바꾼다');
  assert.equal(line.hangPastel(3, 2010).slot, 1);
  assert.ok(line.view().slice(6).every((v) => v === null));
  assert.equal(line.view()[0].c, 2);
  assert.equal(line.snapshot().length, 6);
});

test('hangWhite: 개인 칸에 흰 셔츠 하나만(두 번 널어도 중복 없음), removeWhite 로 걷으면 이벤트가 나오고 칸이 빈다', () => {
  const line = mk();
  const a = line.hangWhite(5000);
  assert.ok(a.slot >= 6 && a.slot < 12 && a.c === WHITE);
  assert.deepEqual(line.hangWhite(6000), a, '이미 걸려 있으면 그대로');
  assert.equal(filled(line).length, 1);
  const rm = line.removeWhite(7000);
  assert.deepEqual([rm.slot, rm.c], [a.slot, REMOVED]);
  assert.ok(rm.t >= 7000);
  assert.equal(filled(line).length, 0);
  assert.equal(line.removeWhite(8000), null);
});

test('개인 칸은 id 로 정한 선호 칸에 걸리고, 같은 id 는 항상 같은 칸, 차 있으면 다음 빈 칸으로 양보한다', () => {
  assert.equal(mk('zzzz9999').hangWhite(1).slot, mk('zzzz9999').hangWhite(99).slot);
  const ids = ['peer0001', 'peer0002', 'peer0003', 'peer0004', 'peer0005', 'peer0006'];
  // 6명이 모두 같은 줄에 흰 셔츠: 서로 다른 칸에 걸린다(스냅샷을 주고받아 알린다).
  const lines = ids.map((id) => mk(id));
  const t = 1000;
  for (const l of lines) {
    const ev = l.hangWhite(t);
    for (const o of lines) if (o !== l) o.ingestEvent(l === lines[0] ? ids[0] : ids[lines.indexOf(l)], ev.slot, ev.c, ev.t, t);
  }
  // 동시에 건 경우의 충돌을 정리할 때까지 스냅샷을 몇 번 돌린다.
  for (let round = 0; round < 3; round++) {
    lines.forEach((l, i) => lines.forEach((o, j) => { if (i !== j) for (const ev of o.ingestSnapshot(ids[i], l.snapshot(), t + round) ?? []) void ev; }));
  }
  const own = lines.map((l) => l.ownWhiteSlot());
  assert.ok(own.every((s) => s >= 6 && s < 12));
  assert.equal(new Set(own).size, 6, JSON.stringify(own));
});

test('같은 칸을 둘이 동시에 차지하면 t 가 새로운 쪽이 이기고, 진 흰 셔츠는 빈 개인 칸으로 옮기며 진 파스텔은 포기한다', () => {
  const a = mk('aaaa0001');
  const slot = a.hangWhite(1000).slot;
  const ev = a.ingestEvent('bbbb0002', slot, WHITE, 1500, 1500); // 더 새로운 흰 셔츠가 같은 칸에
  assert.equal(ev.length, 2, '걷기 + 새 칸에 걸기');
  assert.equal(ev[0].c, REMOVED);
  assert.equal(ev[0].slot, slot);
  assert.ok(ev[1].slot !== slot && ev[1].slot >= 6);
  assert.equal(a.view()[slot].owner, 'bbbb0002');
  assert.equal(a.view()[ev[1].slot].mine, true);
  assert.equal(a.snapshot().length, 1, '내 흰 셔츠는 하나뿐');
  // 같은 t 면 id 가 작은 쪽이 이긴다.
  const c = mk('mmmm0001');
  const s2 = c.hangWhite(2000).slot;
  c.ingestEvent('zzzz0009', s2, WHITE, 2000, 2000);
  assert.equal(c.view()[s2].owner, 'mmmm0001');
  // 파스텔: 더 새로운 남의 파스텔이 내 칸을 가져가면 내 것은 사라진다.
  const p = mk('aaaa0001');
  p.hangPastel(1, 1000);
  assert.equal(p.ingestEvent('bbbb0002', 0, 4, 1001, 1001).length, 0);
  assert.equal(p.view()[0].c, 4);
  assert.deepEqual(p.snapshot(), []);
  // 오래된 t 는 내 것을 이기지 못한다.
  const q = mk('aaaa0001');
  q.hangPastel(1, 5000);
  q.ingestEvent('bbbb0002', 0, 4, 100, 5000);
  assert.equal(q.view()[0].c, 1);
});

test('ingestSnapshot: 그 방문자의 목록을 통째로 갈아 끼운다(걷은 빨래가 남지 않는다), 잘못된 항목은 무시한다', () => {
  const line = mk();
  line.ingestSnapshot('bbbb0002', [[0, 2, 10], [1, 3, 11], [6, WHITE, 12]], 100);
  assert.deepEqual(filled(line), [[0, 2, false], [1, 3, false], [6, WHITE, false]]);
  line.ingestSnapshot('bbbb0002', [[1, 3, 11]], 200);
  assert.deepEqual(filled(line), [[1, 3, false]]);
  line.ingestSnapshot('cccc0003', [[0, WHITE, 5], [7, 2, 5], [99, 1, 5], [2, 9, 5], ['x', 1, 1], null, [3, 1]], 300);
  assert.deepEqual(filled(line), [[1, 3, false]], '칸 종류가 안 맞거나 범위 밖이거나 t 가 없는 항목은 무시');
  assert.deepEqual(line.ingestSnapshot('bbbb0002', 'no', 400), []);
});

test('ingestEvent: 걷기 이벤트는 그 칸을 비우고, 그 방문자의 같은 칸 옛 이벤트(뒤바뀐 순서)는 무시한다', () => {
  const line = mk();
  line.ingestEvent('bbbb0002', 6, WHITE, 100, 100);
  assert.equal(filled(line).length, 1);
  line.ingestEvent('bbbb0002', 6, REMOVED, 90, 110); // 옛 걷기는 무시
  assert.equal(filled(line).length, 1);
  line.ingestEvent('bbbb0002', 6, REMOVED, 120, 120);
  assert.equal(filled(line).length, 0);
  line.ingestEvent('bbbb0002', 3, 99, 200, 200); // 틀린 값
  line.ingestEvent('bbbb0002', 99, REMOVED, 200, 200);
  line.ingestEvent('bbbb0002', 3, 2, NaN, 200);
  assert.equal(filled(line).length, 0);
  line.ingestEvent('aaaa0001', 3, 2, 300, 300); // 나 자신의 이벤트는 무시
  assert.equal(filled(line).length, 0);
});

test('prune: 방을 나갔거나 오래 소식이 없는 방문자의 빨래는 걷히고, 내 것은 그대로다(유령 빨래 없음)', () => {
  const line = mk();
  line.hangPastel(0, 1000);
  line.ingestSnapshot('bbbb0002', [[1, 2, 10], [6, WHITE, 11]], 1000);
  line.ingestSnapshot('cccc0003', [[2, 3, 10]], 1000);
  assert.equal(filled(line).length, 4);
  assert.equal(line.prune(new Set(['bbbb0002', 'cccc0003']), 2000, 15000), 0);
  assert.equal(line.prune(new Set(['cccc0003']), 2000, 15000), 1, 'b 가 나갔다');
  assert.deepEqual(filled(line).map((f) => f[0]), [0, 2]);
  assert.equal(line.prune(new Set(['cccc0003']), 20000, 15000), 1, 'c 는 소식이 없다');
  assert.deepEqual(filled(line).map((f) => f[0]), [0], '내 빨래만');
  line.ingestSnapshot('dddd0004', [[1, 1, 5]], 21000);
  line.dropOthers();
  assert.deepEqual(filled(line).map((f) => f[0]), [0]);
});

test('방을 나갔다 돌아와도 중복이 없다: 내 스냅샷을 다시 보내면 받는 쪽은 통째로 갈아 끼우고, 내 상태는 그대로 보존된다', () => {
  const me = mk('aaaa0001');
  const you = mk('bbbb0002');
  const w = me.hangWhite(1000);
  const p = me.hangPastel(2, 1100);
  you.ingestSnapshot('aaaa0001', me.snapshot(), 1200);
  assert.equal(filled(you).length, 2);
  // 내가 나갔다(상대가 나를 걷음) -> 내가 돌아와 같은 스냅샷을 다시 보냄
  you.prune(new Set(), 5000);
  assert.equal(filled(you).length, 0);
  me.dropOthers();
  you.ingestSnapshot('aaaa0001', me.snapshot(), 9000);
  you.ingestSnapshot('aaaa0001', me.snapshot(), 9500); // 여러 번 받아도 같다
  assert.deepEqual(filled(you).map((f) => f[0]).sort((x, y) => x - y), [p.slot, w.slot].sort((x, y) => x - y));
  assert.equal(me.ownCount, 2);
});

test('reset: 모두 비운다', () => {
  const line = mk();
  line.hangPastel(1, 1);
  line.ingestSnapshot('bbbb0002', [[0, 1, 1]], 1);
  line.reset();
  assert.equal(filled(line).length, 0);
});
