import test from 'node:test';
import assert from 'node:assert/strict';
import { assignInterviewers, interviewerFor, createArbiter, PENDING_MAX_AGE } from '../src/logic/assign.js';
import { seatOfRemote, occupiedSeats, SEAT_OCCUPIED_RADIUS } from '../src/logic/seats.js';
import { buildInterviewInterior } from '../src/logic/interiors.js';

const IDS = ['hr', 'leader', 'mentor'];

// ---- 의자 -> 담당 면접관 ----
test('assignInterviewers: 의자는 x 가 가장 가까운 면접관과 짝이 된다(서쪽 인사담당·가운데 팀장·동쪽 예비 사수)', () => {
  const m = assignInterviewers([{ id: 'c0', x: -1.7 }, { id: 'c1', x: 0 }, { id: 'c2', x: 1.7 }], [{ id: 'leader', x: 0 }, { id: 'hr', x: -1.4 }, { id: 'mentor', x: 1.4 }]);
  assert.deepEqual(m, { c0: 'hr', c1: 'leader', c2: 'mentor' });
  assert.equal(interviewerFor(m, 'c1'), 'leader');
  assert.equal(interviewerFor(m, 'interview-wait-0'), null, '대기 의자는 담당이 없다');
  assert.deepEqual(assignInterviewers([], []), {});
});

test('면접장 실내 데이터: 지원자 의자 3개가 모두 서로 다른 면접관 한 명씩과 짝이고 chair.interviewerId 와 같다, 대기 의자는 없다', () => {
  const it = buildInterviewInterior();
  assert.deepEqual(it.chairs.map((c) => it.assignments[c.id]), ['hr', 'leader', 'mentor']);
  assert.deepEqual(it.chairs.map((c) => c.interviewerId), ['hr', 'leader', 'mentor']);
  assert.equal(new Set(Object.values(it.assignments)).size, 3);
  for (const w of it.waitChairs) assert.equal(it.assignments[w.id], undefined);
  assert.deepEqual(Object.keys(it.assignments).sort(), it.seatIds.slice().sort());
});

// ---- 다른 방문자 -> 의자 ----
const guest = buildInterviewInterior().interactables.filter((i) => i.kind === 'seat' && i.id.startsWith('interview-chair')).map((i) => ({ id: i.id, x: i.seat.x, z: i.seat.z }));

test('seatOfRemote: 앉은 방문자는 반경 안의 가장 가까운 의자, 앉지 않았거나 멀면 null(점유 판정과 같은 규칙)', () => {
  const [c0, c1, c2] = guest;
  assert.equal(seatOfRemote(guest, { x: c0.x + 0.1, z: c0.z, seat: true }), c0.id);
  assert.equal(seatOfRemote(guest, { x: c2.x, z: c2.z + 0.5, seat: true }), c2.id);
  assert.equal(seatOfRemote(guest, { x: (c0.x + c1.x) / 2 - 0.05, z: c0.z, seat: true }), c0.id, '가운데에서 조금 치우치면 가까운 쪽');
  assert.equal(seatOfRemote(guest, { x: c1.x, z: c1.z, seat: false }), null);
  assert.equal(seatOfRemote(guest, { x: c1.x, z: c1.z + SEAT_OCCUPIED_RADIUS + 0.5, seat: true }), null);
  assert.equal(seatOfRemote(guest, null), null);
  assert.equal(seatOfRemote(guest, { x: NaN, z: 0, seat: true }), null);
  const remotes = [{ x: c0.x, z: c0.z, seat: true }, { x: c2.x, z: c2.z, seat: true }];
  assert.deepEqual([...occupiedSeats(guest, remotes)].sort(), [c0.id, c2.id].sort(), '점유 판정은 같은 함수를 쓴다');
});

// ---- 중재자 ----
test('arbiter: 한가한 면접관은 primary·secondary 모두 바로 시작', () => {
  const a = createArbiter({ ids: IDS });
  assert.deepEqual(a.request('hr', { kind: 'primary', owner: 'A', t: 0, duration: 4 }), { decision: 'start', preempted: null });
  assert.deepEqual(a.request('leader', { kind: 'secondary', owner: 'A', t: 0, duration: 1.4 }), { decision: 'start', preempted: null });
  assert.equal(a.state('hr').kind, 'primary');
  assert.equal(a.state('leader').kind, 'secondary');
  assert.equal(a.isIdle('mentor'), true);
});

test('arbiter: secondary 는 한가할 때만(primary·secondary 중이면 건너뜀)', () => {
  const a = createArbiter({ ids: IDS });
  a.request('hr', { kind: 'primary', owner: 'A', t: 0, duration: 4 });
  assert.equal(a.request('hr', { kind: 'secondary', owner: 'B', t: 1, duration: 1 }).decision, 'skip');
  a.request('leader', { kind: 'secondary', owner: 'A', t: 0, duration: 2 });
  assert.equal(a.request('leader', { kind: 'secondary', owner: 'B', t: 1, duration: 1 }).decision, 'skip');
  assert.equal(a.state('leader').owner, 'A');
});

test('arbiter: primary 는 secondary 를 끊고 시작한다(preempted 로 알려 준다)', () => {
  const a = createArbiter({ ids: IDS });
  a.request('mentor', { kind: 'secondary', owner: 'me', t: 0, duration: 1.4 });
  const r = a.request('mentor', { kind: 'primary', owner: 'chair-2', t: 0.5, duration: 4 });
  assert.deepEqual(r, { decision: 'start', preempted: { kind: 'secondary', owner: 'me' } });
  assert.deepEqual(a.state('mentor'), { kind: 'primary', owner: 'chair-2', pending: null });
  // 끊긴 secondary 의 남은 시간이 지나도 primary 는 그대로.
  assert.deepEqual(a.tick(1.6), []);
  assert.equal(a.state('mentor').kind, 'primary');
});

test('arbiter: 진행 중인 primary 는 어떤 것에도 끊기지 않고, 같은 의자의 두 번째 이벤트는 한 건만 기다린다(최신이 이긴다)', () => {
  const a = createArbiter({ ids: IDS });
  a.request('hr', { kind: 'primary', owner: 'R', t: 0, duration: 4, payload: 'first' });
  const second = a.request('hr', { kind: 'primary', owner: 'R', t: 1, duration: 4, payload: 'second' });
  assert.deepEqual(second, { decision: 'queue', dropped: null });
  const third = a.request('hr', { kind: 'primary', owner: 'R', t: 2, duration: 4, payload: 'third' });
  assert.equal(third.decision, 'queue');
  assert.equal(third.dropped.payload, 'second', '먼저 기다리던 것이 밀려난다');
  assert.equal(a.state('hr').owner, 'R');
  assert.equal(a.state('hr').pending.payload, 'third');
  assert.equal(a.request('hr', { kind: 'primary', owner: 'me', t: 2.5, queue: false }).decision, 'skip', '기다리지 않겠다는 primary 는 건너뜀');
  // 끝나면 기다리던 것이 바로 시작한다.
  const out = a.tick(4);
  assert.deepEqual(out.map((e) => e.type), ['ended', 'started']);
  assert.equal(out[1].entry.payload, 'third');
  assert.deepEqual(a.state('hr'), { kind: 'primary', owner: 'R', pending: null });
  assert.equal(a.tick(7.9).length, 0);
  assert.deepEqual(a.tick(8).map((e) => e.type), ['ended']);
  assert.equal(a.isIdle('hr'), true);
});

test('arbiter: 기다리던 일이 PENDING_MAX_AGE 보다 오래되면 버린다(tick 에서도, 끝나는 순간에도)', () => {
  assert.equal(PENDING_MAX_AGE, 4);
  const a = createArbiter({ ids: IDS });
  a.request('leader', { kind: 'primary', owner: 'me', t: 0 }); // 끝날 때까지(release)
  a.request('leader', { kind: 'primary', owner: 'R', t: 1, duration: 4, payload: 'old' });
  assert.deepEqual(a.tick(4.9), []);
  const stale = a.tick(5.1);
  assert.deepEqual(stale.map((e) => e.type), ['dropped']);
  assert.equal(stale[0].reason, 'stale');
  assert.equal(a.state('leader').pending, null);
  // 5초 만에 끝난 경우: 4초 안이면 시작, 넘으면 버림.
  a.request('leader', { kind: 'primary', owner: 'R', t: 5.2, duration: 4, payload: 'fresh' });
  assert.deepEqual(a.release('leader', 'me', 9).map((e) => e.type), ['ended', 'started']);
  a.release('leader', 'R', 9.0);
  a.request('leader', { kind: 'primary', owner: 'me', t: 20 });
  a.request('leader', { kind: 'primary', owner: 'R', t: 20.1, payload: 'late' });
  const rel = a.release('leader', 'me', 25);
  assert.deepEqual(rel.map((e) => e.type), ['ended', 'dropped']);
  assert.equal(a.isIdle('leader'), true);
});

test('arbiter: release 는 소유자가 다르면 무시한다', () => {
  const a = createArbiter({ ids: IDS });
  a.request('hr', { kind: 'primary', owner: 'me', t: 0 });
  assert.deepEqual(a.release('hr', 'other', 1), []);
  assert.equal(a.state('hr').kind, 'primary');
  assert.deepEqual(a.release('hr', 'me', 1).map((e) => e.type), ['ended']);
});

test('시나리오: 세 의자가 동시에 활동 — 면접관마다 독립적으로 primary 가 돌고 서로 끊지 않는다', () => {
  const a = createArbiter({ ids: IDS });
  const asm = { c0: 'hr', c1: 'leader', c2: 'mentor' };
  // 나는 c1(팀장), 원격 둘이 c0·c2 에서 동시에 답한다.
  assert.equal(a.request(asm.c1, { kind: 'primary', owner: 'me', t: 0 }).decision, 'start');
  assert.equal(a.request(asm.c0, { kind: 'primary', owner: 'rA', t: 0.1, duration: 4 }).decision, 'start');
  assert.equal(a.request(asm.c2, { kind: 'primary', owner: 'rB', t: 0.2, duration: 4 }).decision, 'start');
  // 아무도 남의 면접관에게 가벼운 반응을 할 수 없다(모두 primary).
  for (const id of IDS) assert.equal(a.request(id, { kind: 'secondary', owner: 'x', t: 1, duration: 1 }).decision, 'skip', id);
  assert.equal(a.state('leader').owner, 'me');
  assert.equal(a.state('hr').owner, 'rA');
  assert.equal(a.state('mentor').owner, 'rB');
});

test('시나리오: 완주(finale) vs 원격 — 다른 둘이 남의 primary 중이면 담당 혼자, 한가하면 셋 모두', () => {
  const a = createArbiter({ ids: IDS });
  a.request('leader', { kind: 'primary', owner: 'me', t: 0 });
  assert.deepEqual(a.finaleIds('leader'), ['leader', 'hr', 'mentor'], '둘 다 한가');
  a.request('hr', { kind: 'secondary', owner: 'me', t: 1, duration: 1.4 });
  assert.deepEqual(a.finaleIds('leader'), ['leader', 'hr', 'mentor'], 'secondary 중이면 한가한 것으로 본다(primary 가 끊는다)');
  a.request('mentor', { kind: 'primary', owner: 'rB', t: 1, duration: 4 });
  assert.deepEqual(a.finaleIds('leader'), ['leader'], '예비 사수가 원격 장면 중이면 팀장 혼자');
  a.release('mentor', 'rB', 2);
  a.request('hr', { kind: 'primary', owner: 'rA', t: 2.1, duration: 4 });
  assert.deepEqual(a.finaleIds('leader'), ['leader'], '인사담당이 원격 장면 중이어도 팀장 혼자');
  // 완주가 한가한 둘을 잡은 뒤 들어온 원격 이벤트는 기다렸다 이어서 한다.
  const b = createArbiter({ ids: IDS });
  b.request('leader', { kind: 'primary', owner: 'me', t: 0 });
  for (const id of b.finaleIds('leader').slice(1)) assert.equal(b.request(id, { kind: 'primary', owner: 'me', t: 3, queue: false }).decision, 'start');
  assert.equal(b.request('hr', { kind: 'primary', owner: 'rA', t: 4, duration: 4, payload: 'late' }).decision, 'queue');
  const end = b.release('hr', 'me', 6.7);
  assert.deepEqual(end.map((e) => e.type), ['ended', 'started'], '완주가 끝나면 바로 이어서(2.7초 기다림 < 4초)');
});

test('시나리오: 같은 의자 연속 이벤트 — 하나 진행 + 하나 대기, 셋째가 오면 둘째는 밀려나고 오래된 것은 버려진다', () => {
  const a = createArbiter({ ids: IDS });
  a.request('hr', { kind: 'primary', owner: 'R', t: 0, duration: 4.3, payload: 'p1' });
  a.request('hr', { kind: 'primary', owner: 'R', t: 1.5, duration: 4.3, payload: 'p2' });
  const r3 = a.request('hr', { kind: 'primary', owner: 'R', t: 3, duration: 4.3, payload: 'p3' });
  assert.equal(r3.dropped.payload, 'p2');
  const out = a.tick(4.4);
  assert.deepEqual(out.map((e) => [e.type, e.entry?.payload]), [['ended', undefined], ['started', 'p3']]);
});

test('시나리오: secondary 선점 — 가벼운 반응 도중 담당 일이 오면 끊고, 끊긴 가벼운 반응은 다시 살아나지 않는다', () => {
  const a = createArbiter({ ids: IDS });
  a.request('mentor', { kind: 'secondary', owner: 'me', t: 0, duration: 1.4 });
  const pre = a.request('mentor', { kind: 'primary', owner: 'rB', t: 0.3, duration: 3 });
  assert.equal(pre.preempted.kind, 'secondary');
  assert.equal(a.tick(1.4).length, 0, '원래 secondary 가 끝날 시각에 아무 일도 없다');
  assert.equal(a.state('mentor').owner, 'rB');
  assert.equal(a.tick(3.3).length, 1);
  assert.equal(a.request('mentor', { kind: 'secondary', owner: 'me', t: 3.4, duration: 1 }).decision, 'start', '끝난 뒤에는 다시 가벼운 반응 가능');
});

test('arbiter: 모르는 면접관·일 종류는 오류, reset 은 모든 일과 기다림을 지운다', () => {
  const a = createArbiter({ ids: IDS });
  assert.throws(() => a.request('nobody', { kind: 'primary', owner: 'x', t: 0 }), /nobody/);
  assert.throws(() => a.request('hr', { kind: 'weird', owner: 'x', t: 0 }), /weird/);
  a.request('hr', { kind: 'primary', owner: 'x', t: 0 });
  a.request('hr', { kind: 'primary', owner: 'y', t: 1, payload: 'z' });
  const dropped = a.reset();
  assert.deepEqual(dropped.map((e) => e.type), ['dropped']);
  assert.ok(IDS.every((id) => a.isIdle(id)));
});
