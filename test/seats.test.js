import test from 'node:test';
import assert from 'node:assert/strict';
import { occupiedSeats, seatPromptFor, SEAT_OCCUPIED_RADIUS } from '../src/logic/seats.js';
import { buildInterviewInterior } from '../src/logic/interiors.js';

const seats = [{ id: 'a', x: 0, z: 0 }, { id: 'b', x: 1.7, z: 0 }, { id: 'c', x: 3.4, z: 0 }];
const remote = (id, x, z, seat = true) => ({ id, x, z, seat });

test('occupiedSeats: 앉은(seat true) 방문자가 반경 안이면 그 자리는 사용 중이다', () => {
  const out = occupiedSeats(seats, [remote('r1', 0.1, -0.1), remote('r2', 3.3, 0.2)], 0.6);
  assert.deepEqual([...out].sort(), ['a', 'c']);
  assert.ok(out instanceof Set);
});

test('occupiedSeats: 서 있는 방문자(seat false)와 반경 밖 방문자는 자리를 차지하지 않는다', () => {
  assert.equal(occupiedSeats(seats, [remote('r1', 0, 0, false)], 0.6).size, 0);
  assert.equal(occupiedSeats(seats, [remote('r1', 0.7, 0)], 0.6).size, 0, '경계 밖');
  assert.equal(occupiedSeats(seats, [remote('r1', 0.6, 0)], 0.6).size, 1, '경계 포함');
});

test('occupiedSeats: 한 방문자는 가장 가까운 자리 하나만 차지한다(이웃 의자가 함께 막히지 않는다)', () => {
  const out = occupiedSeats(seats, [remote('r1', 0.9, 0)], 1.3); // a 와 b 둘 다 반경 안: 더 가까운 b
  assert.deepEqual([...out], ['b']);
  assert.deepEqual([...occupiedSeats(seats, [remote('r1', 0.85, 0)], 1.3)].sort(), ['a'], '가운데보다 a 쪽이 가까우면 a');
});

test('occupiedSeats: 빈 입력·이상한 입력에도 던지지 않는다', () => {
  assert.equal(occupiedSeats([], [remote('r', 0, 0)], 0.6).size, 0);
  assert.equal(occupiedSeats(seats, [], 0.6).size, 0);
  assert.equal(occupiedSeats(seats, null, 0.6).size, 0);
  assert.equal(occupiedSeats(seats, [{ id: 'x', x: NaN, z: 0, seat: true }, null, undefined], 0.6).size, 0);
});

test('seatPromptFor: 비어 있으면 일반 안내(E 가능), 사용 중이면 "사용 중"(누를 수 없음)', () => {
  assert.deepEqual(seatPromptFor({ id: 'a', kind: 'seat' }, new Set(), '앉기'), { text: '앉기', actionable: true });
  assert.deepEqual(seatPromptFor({ id: 'a', kind: 'seat' }, new Set(['a']), '앉기'), { text: '사용 중', actionable: false });
  assert.deepEqual(seatPromptFor({ id: 'a', kind: 'seat' }, new Set(['b']), '앉기'), { text: '앉기', actionable: true });
  assert.deepEqual(seatPromptFor({ id: 'door', kind: 'door' }, new Set(['door']), '들어가기'), { text: '들어가기', actionable: true }, '의자가 아니면 영향 없음');
});

test('면접장 모든 의자(지원자 3 + 대기 3)가 점유 판정 대상이고, 의자 간격보다 반경이 작아 이웃 의자를 막지 않는다', () => {
  const I = buildInterviewInterior();
  const items = I.interactables.filter((i) => i.kind === 'seat');
  assert.equal(items.length, 6);
  const points = items.map((i) => ({ id: i.id, x: i.seat.x, z: i.seat.z }));
  for (const p of points) {
    const out = occupiedSeats(points, [remote('r', p.x, p.z)], SEAT_OCCUPIED_RADIUS);
    assert.deepEqual([...out], [p.id]);
  }
  const gap = Math.min(...points.flatMap((a) => points.filter((b) => b !== a).map((b) => Math.hypot(a.x - b.x, a.z - b.z))));
  assert.ok(SEAT_OCCUPIED_RADIUS < gap, `${SEAT_OCCUPIED_RADIUS} < ${gap}`);
  // 의자에서 일어나 한 칸 앞(돌발행동 중 서 있는 자리)까지는 그 의자를 차지한 것으로 본다.
  const g = items[0];
  assert.deepEqual([...occupiedSeats(points, [remote('r', g.seat.x, g.seat.z - 1.0)], SEAT_OCCUPIED_RADIUS)], [g.id]);
});
