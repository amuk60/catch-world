import test from 'node:test';
import assert from 'node:assert/strict';
import { buildInterviewInterior } from '../src/logic/interiors.js';

// 8e: 면접관 책상 방향(서랍이 면접관 쪽)과 사무용품 데이터.
const I = buildInterviewInterior();
const B = I.bounds;
const d = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const inBounds = (p, m = 0) => p.x >= B.minX + m - 1e-9 && p.x <= B.maxX - m + 1e-9 && p.z >= B.minZ + m - 1e-9 && p.z <= B.maxZ - m + 1e-9;
const frontOf = (rotY) => ({ x: Math.sin(rotY), z: Math.cos(rotY) }); // 모델의 앞(+z)이 보는 방향(rotY 적용 뒤)
const dot = (a, b) => a.x * b.x + a.z * b.z;
const nearestSeat = (p) => I.seats.reduce((a, b) => (Math.abs(a.x - p.x) < Math.abs(b.x - p.x) ? a : b));

test('책상 방향: 모델 앞(서랍이 열리는 쪽)이 면접관(북쪽)을 향하고 지원자 쪽에는 매끈한 뒷면이 간다', () => {
  const desks = I.furniture.filter((f) => f.name === 'desk');
  assert.equal(desks.length, 3);
  for (const desk of desks) {
    const front = frontOf(desk.rotY);
    assert.ok(Math.abs(front.x) < 1e-9 && front.z < -0.99, '북쪽(-z)을 본다');
    const seat = nearestSeat(desk);
    assert.ok(dot(front, { x: seat.x - desk.x, z: seat.z - desk.z }) > 0.5, '서랍 쪽에 면접관이 앉는다');
    assert.ok(dot(front, { x: I.chair.x - desk.x, z: I.chair.z - desk.z }) < -1, '지원자는 뒷면 쪽');
  }
});

test('노트북: 책상 폭 안 책상 위에 놓이고 앞(사용자 쪽)이 면접관을 향해 화면이 면접관을 보며, 지원자는 노트북 등을 본다', () => {
  const laptop = I.furniture.find((f) => f.name === 'laptop');
  const desk = I.furniture.find((f) => f.name === 'desk');
  assert.ok(laptop.y > 0.5 && Math.abs(laptop.z - desk.z) < 0.36, '책상 폭 안');
  const front = frontOf(laptop.rotY);
  assert.ok(front.z < -0.99, '앞(키보드·사용자 쪽)이 북쪽');
  const seat = nearestSeat(laptop);
  assert.ok(dot(front, { x: seat.x - laptop.x, z: seat.z - laptop.z }) > 0.5);
  assert.ok(dot(front, { x: I.chair.x - laptop.x, z: I.chair.z - laptop.z }) < 0);
  assert.equal(laptop.rotY, desk.rotY, '책상과 같은 쪽을 본다');
});

test('사무용품: 서류함·정수기는 벽에 붙어 방 안쪽을 보고, 장애물 원이 있고, 지원자 의자·도착 지점과 떨어져 있다', () => {
  assert.deepEqual(I.props.map((p) => p.kind).sort(), ['filingCabinet', 'waterDispenser']);
  for (const p of I.props) {
    assert.ok(p.width > 0.3 && p.depth > 0.3 && p.height > 1 && p.height < I.wallHeight);
    assert.ok(dot(frontOf(p.rotY), { x: I.origin.x - p.x, z: I.origin.z - p.z }) > 0, `${p.kind} 은 방 안쪽을 본다`);
    assert.ok(Math.min(p.x - B.minX, B.maxX - p.x) < 0.8 && inBounds(p, 0.2), `${p.kind} 은 동·서 벽에 붙어 있다`);
    const circle = I.obstacles.find((o) => o.id === p.id);
    assert.ok(circle && d(circle, p) < 1e-9, '충돌 원');
    assert.ok(d(p, I.chair) > 3 && d(p, I.arrival) > 2.5);
  }
});

test('안내판 "면접 안내": 서쪽 벽, 화이트보드와 출입문 사이에 겹치지 않게, 동쪽을 본다. 쓰레기통은 방 안', () => {
  const n = I.notice;
  assert.ok(Math.abs(n.x - B.minX) < 0.3 && Math.abs(Math.sin(n.rotY) - 1) < 1e-9);
  assert.ok(n.y - n.height / 2 > 0.8 && n.y + n.height / 2 < I.wallHeight);
  assert.ok(n.z - n.width / 2 > I.board.z + I.board.width / 2, '화이트보드 남쪽');
  assert.ok(n.z + n.width / 2 < I.exit.z - 0.8, '출입문 북쪽');
  const trash = I.furniture.find((f) => f.name === 'trashcan');
  assert.ok(trash && inBounds(trash, 0.2));
});

test('지원자 의자·대기 의자는 사무용 의자 모델(chairModernCushion), 나무 의자·벤치·플로어 램프가 아니다', () => {
  assert.equal(I.chair.name, 'chairModernCushion');
  assert.equal(I.furniture.filter((f) => f.name === 'chairModernCushion').length, 3, '지원자 1 + 대기 2');
  assert.ok(!I.furniture.some((f) => ['chairCushion', 'benchCushion', 'lampRoundFloor'].includes(f.name)));
});
