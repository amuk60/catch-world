import test from 'node:test';
import assert from 'node:assert/strict';
import { buildInterviewInterior, buildLaundryInterior } from '../src/logic/interiors.js';
import { PLAYER, INTERVIEW_INTERIOR, INTERVIEW_ZONE_RADIUS, INTERVIEW, LAUNDRY_INTERIOR } from '../src/config.js';
import { stepToward, pushOutOfCircle } from '../src/logic/movement.js';
import { clampToSpace } from '../src/logic/spaces.js';
import { interactTarget, nearestInRange, actionOf, standPoint } from '../src/logic/interaction.js';
import { buildZones, activeZone, seatZone, currentZoneFor } from '../src/logic/zones.js';
import { buildLayout } from '../src/logic/layout.js';
import { SEED } from '../src/config.js';

const I = buildInterviewInterior();
const B = I.bounds;
const d = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const WALK = PLAYER.radius + 0.5;
const free = (p) => I.obstacles.every((o) => d(p, o) >= o.radius + PLAYER.radius)
  && p.x >= B.minX + WALK && p.x <= B.maxX - WALK && p.z >= B.minZ + WALK && p.z <= B.maxZ - WALK;
const inBounds = (p, m = 0) => p.x >= B.minX + m - 1e-9 && p.x <= B.maxX - m + 1e-9 && p.z >= B.minZ + m - 1e-9 && p.z <= B.maxZ - m + 1e-9;

test('방: 설정(INTERVIEW_INTERIOR)과 같은 원점·크기·벽 높이, 마당·세탁소 실내와 멀리 떨어져 있다', () => {
  assert.equal(B.maxX - B.minX, INTERVIEW_INTERIOR.width);
  assert.equal(B.maxZ - B.minZ, INTERVIEW_INTERIOR.depth);
  assert.deepEqual({ x: (B.minX + B.maxX) / 2, z: (B.minZ + B.maxZ) / 2 }, INTERVIEW_INTERIOR.origin);
  assert.equal(I.id, 'interview');
  assert.equal(I.wallHeight, INTERVIEW_INTERIOR.wallHeight);
  const L = buildLaundryInterior().bounds;
  assert.ok(B.minX - L.maxX > 100, '세탁소 실내와 멀다');
  assert.ok(B.minX > 200, '마당과 멀다');
  assert.equal(LAUNDRY_INTERIOR.origin.x, 300);
});

test('벽: 네 면이 빈틈없이 방 경계를 덮고, 출입문 조각은 서쪽에 하나, 창은 1~2개', () => {
  assert.deepEqual(I.walls.map((w) => w.side).sort(), ['east', 'north', 'south', 'west']);
  for (const w of I.walls) {
    const alongX = w.side === 'north' || w.side === 'south';
    const length = alongX ? B.maxX - B.minX : B.maxZ - B.minZ;
    assert.equal(w.pieces.length * I.tile, length, w.id);
  }
  const pieces = I.walls.flatMap((w) => w.pieces.map((p) => ({ ...p, side: w.side })));
  const doors = pieces.filter((p) => p.name === 'wallDoorwayWide');
  assert.equal(doors.length, 1);
  assert.equal(doors[0].side, 'west');
  assert.ok(Math.abs(doors[0].z - I.exit.z) < 1e-9);
  const windows = pieces.filter((p) => p.name === 'wallWindow');
  assert.ok(windows.length >= 1 && windows.length <= 2);
});

test('출구: kind door, to yard, 문 가까이에서만 E 안내, 도착 지점은 장애물 밖이며 안내가 뜨지 않는다', () => {
  const door = I.interactables.find((i) => i.id === 'interview-exit');
  assert.ok(door);
  assert.equal(door.kind, 'door');
  assert.equal(door.to, 'yard');
  assert.deepEqual(actionOf(door), { type: 'exit', prompt: '나가기' });
  assert.ok(free(interactTarget(door)));
  assert.ok(free(I.arrival), JSON.stringify(I.arrival));
  assert.ok(Math.abs(Math.sin(I.arrival.rotY) - 1) < 1e-9, '방 안쪽(+x)을 본다');
  assert.equal(nearestInRange(I.arrival, I.interactables), null);
  assert.equal(nearestInRange({ x: I.exit.x + 1.0, z: I.exit.z }, I.interactables), door);
  assert.equal(I.interactables.length, 7, '출구 + 지원자 의자 3 + 대기 의자 3');
});

test('면접관 책상: 북쪽 절반에 긴 책상(폭 4 이상), 방 가운데를 가로지르고 장애물로 막혀 있다', () => {
  const desks = I.furniture.filter((f) => f.name === 'desk');
  assert.equal(desks.length, 3);
  assert.ok(desks.every((f) => f.z < I.origin.z), '북쪽 절반');
  const xs = desks.map((f) => f.x);
  assert.ok(Math.max(...xs) - Math.min(...xs) >= 2.5, "긴 책상");
  const circles = I.obstacles.filter((o) => o.id === 'desk');
  assert.ok(circles.length >= 4);
  assert.ok(Math.min(...circles.map((o) => o.x - o.radius)) <= Math.min(...xs) - 0.5);
  assert.ok(Math.max(...circles.map((o) => o.x + o.radius)) >= Math.max(...xs) + 0.5);
  assert.equal(I.deskTop.y > 0.5 && I.deskTop.y < 1.2, true);
  assert.ok(Math.abs(I.deskTop.z - desks[0].z) < 0.8 && inBounds(I.deskTop, 0.5));
});

test('면접관 3명: 팀장·인사담당·예비 사수가 책상 뒤(북쪽)에 앉아 남쪽(플레이어 쪽)을 본다, 의자 데이터 포함', () => {
  assert.deepEqual(I.seats.map((s) => s.id), INTERVIEW.interviewers.map((i) => i.id));
  const deskZ = I.furniture.find((f) => f.name === 'desk').z;
  for (const s of I.seats) {
    assert.ok(s.z < deskZ - 0.5, `${s.id} 책상 뒤`);
    assert.ok(Math.abs(Math.cos(s.rotY) - 1) < 1e-9, `${s.id} 남쪽(+z)을 본다`);
    assert.ok(s.y > 0 && s.y < 1.5, `${s.id} 앉은 높이`);
    assert.ok(s.chair && s.chair.name && s.chair.scale > 0 && inBounds(s.chair, 0.3));
    assert.ok(inBounds(s, 0.3));
  }
  assert.equal(new Set(I.seats.map((s) => s.x)).size, 3, '나란히');
  assert.equal(I.seats.find((s) => s.id === 'leader').x, I.origin.x, '팀장은 가운데');
});

test('면접관 자리는 걸어 들어갈 수 없다: 책상 양끝이 낮은 책장으로 막혀 있다(뒤쪽 공간에 못 들어간다)', () => {
  // 책상 뒤 면접관 자리(어느 쪽에서도)로 걸어가 본다.
  for (const from of [I.arrival, I.standingSpot, { x: I.origin.x + 5, z: I.origin.z + 4 }, { x: I.origin.x - 5, z: I.origin.z - 2.2 }]) {
    for (const s of I.seats) {
      const path = walk(from, s);
      const end = path[path.length - 1];
      assert.ok(d(end, s) > 1.0, `${s.id} 에 ${JSON.stringify(from)} 에서 닿았다`);
    }
  }
});

test('지원자 의자 3개: 책상 앞(남쪽)에 나란히, 북쪽(책상)을 보고, 서 있을 자리는 가운데 의자 남쪽 근처의 빈 자리', () => {
  const deskZ = I.furniture.find((f) => f.name === 'desk').z;
  assert.equal(I.chairs.length, 3);
  assert.deepEqual(I.chairs.map((c) => c.id), ['interview-chair-0', 'interview-chair-1', 'interview-chair-2']);
  assert.deepEqual(I.seatIds, I.chairs.map((c) => c.id));
  for (const c of I.chairs) {
    assert.ok(c.z > deskZ + 1);
    assert.ok(Math.abs(Math.cos(c.rotY) + 1) < 1e-9, '북쪽(-z)을 본다');
    assert.equal(c.name, 'chairModernCushion');
  }
  assert.equal(new Set(I.chairs.map((c) => c.z)).size, 1, '한 줄');
  I.chairs.forEach((c, i) => assert.ok(Math.abs(c.x - I.origin.x - [-1.7, 0, 1.7][i]) < 1e-9));
  assert.equal(I.obstacles.filter((o) => o.id === 'interviewChair').length, 3);
  const mid = I.chairs[1];
  assert.ok(free(I.standingSpot));
  assert.ok(d(I.standingSpot, mid) <= 2.2 && I.standingSpot.z > mid.z, '가운데 의자 앞(남쪽)에 선다');
});

test('러그: 의자 줄 밑에 깔려 3개 의자를 모두 덮는다(장애물이 아니다)', () => {
  const rug = I.furniture.find((f) => f.name === 'rugRectangle');
  assert.ok(rug);
  const half = (1.57 * rug.scale) / 2; // rugRectangle 모델 가로 1.57 (glb 범위)
  for (const c of I.chairs) assert.ok(Math.abs(c.x - rug.x) + 0.3 <= half, c.id);
  assert.ok(!I.obstacles.some((o) => o.id === 'rugRectangle'));
});

const seatItem = (id) => I.interactables.find((i) => i.id === id);
const chairSeat = (i = 1) => seatItem(I.seatIds[i]);

test('지원자 의자마다: 마당 벤치와 같은 seat 종류(E 앉기), 책상(북쪽)을 보고 앉고, 의자 위에 놓인 앉는 자리, 가까이에서만 안내', () => {
  I.chairs.forEach((c, i) => {
    const item = chairSeat(i);
    assert.ok(item, c.id);
    assert.equal(item.kind, 'seat');
    assert.deepEqual(actionOf(item), { type: 'seat', prompt: '앉기' });
    assert.equal(item.label, '면접 의자');
    assert.equal(item.x, c.x);
    assert.equal(item.z, c.z);
    assert.ok(Math.abs(Math.cos(item.seat.rotY) + 1) < 1e-9, '북쪽(-z, 책상 쪽)을 본다');
    assert.equal(item.seat.rotY, c.rotY);
    assert.equal(item.seat.x, c.x);
    assert.ok(item.seat.z < c.z && c.z - item.seat.z < 0.2, '방석 위, 등받이에서 살짝 책상 쪽으로');
    assert.ok(item.seat.y > 0.2 && item.seat.y < 1, '의자 방석 높이 근처');
    const desk = I.furniture.find((f) => f.name === 'desk');
    assert.ok(item.seat.z - desk.z > 1.5, '책상 앞에 앉아 책상과 겹치지 않는다');
    assert.ok(nearestInRange(interactTarget(item), I.interactables) === item);
    // 일어서면 책상 쪽 한 칸 앞이고 그 자리는 장애물 밖(책상 원·의자 원과 겹치지 않는다).
    const up = standPoint(item.seat);
    assert.ok(Math.abs(up.x - item.x) < 1e-9 && Math.abs(up.z - (item.seat.z - 1)) < 1e-9);
    assert.ok(free(up), JSON.stringify(up));
  });
  assert.ok(nearestInRange(I.standingSpot, I.interactables) === chairSeat(1), '서 있을 자리(가운데 의자 남쪽)에서 안내가 뜬다');
  assert.equal(nearestInRange(I.arrival, I.interactables), null, '들어오자마자는 안내 없음');
  assert.equal(nearestInRange({ x: I.exit.x + 1.0, z: I.exit.z }, I.interactables).id, 'interview-exit', '출구 앞에서는 출구');
});

test('대기 의자 3개: 지원자 의자 줄 뒤(남쪽)에서 책상을 보는 seat(E 앉기), 면접 구역과 묶이지 않는다', () => {
  assert.equal(I.waitChairs.length, 3);
  assert.deepEqual(I.waitSeatIds, ['interview-wait-0', 'interview-wait-1', 'interview-wait-2']);
  const rowZ = I.chairs[0].z;
  const zones = buildZones(buildLayout(SEED));
  for (const c of I.waitChairs) {
    const item = seatItem(c.id);
    assert.ok(item && item.kind === 'seat' && item.label === '대기 의자', c.id);
    assert.deepEqual(actionOf(item), { type: 'seat', prompt: '앉기' });
    assert.ok(c.z > rowZ + 2.5, '지원자 줄 뒤(남쪽)');
    assert.ok(Math.abs(Math.cos(item.seat.rotY) + 1) < 1e-9, '책상 쪽을 본다');
    assert.ok(free(standPoint(item.seat)), '일어서는 자리가 비어 있다');
    assert.equal(seatZone(item, zones), null, '면접 구역 없음');
    assert.equal(currentZoneFor({ mode: 'seated', pos: item.seat, seat: item, zones, spaceId: 'interview' }), null);
    assert.ok(nearestInRange(interactTarget(item), I.interactables) === item, `${c.id} 를 클릭해 도착하면 그 의자 안내`);
  }
  // 모든 의자(지원자 3 + 대기 3)는 서로 1.5 이상 떨어져 있어 이웃 의자와 헷갈리지 않는다.
  const all = [...I.chairs, ...I.waitChairs];
  all.forEach((x, i) => all.slice(i + 1).forEach((y) => assert.ok(d(x, y) >= 1.5, `${x.id} ${y.id}`)));
});

test('면접 구역: 지원자 의자 3개 중 어디에 앉아도 켜진다(서 있을 때는 어디서도 안 켜진다), 사정거리는 앉은 자리 기준', () => {
  const zones = buildZones(buildLayout(SEED));
  const zone = zones.find((z) => z.id === 'interview');
  assert.ok(zone);
  assert.equal(zone.space, 'interview');
  assert.equal(zone.radius, INTERVIEW_ZONE_RADIUS);
  assert.deepEqual(zone.actions, ['interview', 'improv']);
  assert.equal(zone.auto, false);
  assert.deepEqual(zone.seatIds, I.seatIds);
  // 서 있는 동안: 의자 곁·서 있을 자리·방 안 어디서도 구역이 없다.
  for (const pos of [I.standingSpot, { x: I.chairs[1].x, z: I.chairs[1].z + 1.2 }, standPoint(chairSeat().seat), I.zoneCenter, I.arrival, ...I.waitChairs]) {
    assert.equal(activeZone(pos, zones, 'interview'), null, JSON.stringify(pos));
    assert.equal(currentZoneFor({ mode: 'free', pos, seat: null, zones, spaceId: 'interview' }), null);
  }
  // 앉으면 켜진다. 선택 창·연출 중에는 막대를 숨긴다(모드가 seated 가 아니면 null).
  for (const id of I.seatIds) {
    const seat = seatItem(id);
    assert.equal(seatZone(seat, zones), zone, id);
    assert.equal(seatZone(seat.id, zones), zone, id);
    assert.equal(currentZoneFor({ mode: 'seated', pos: seat.seat, seat, zones, spaceId: 'interview' }), zone, id);
    for (const mode of ['interview-choice', 'interview-play', 'fortune', 'result', 'transition', 'wearing']) {
      assert.equal(currentZoneFor({ mode, pos: seat.seat, seat, zones, spaceId: 'interview' }), null, mode);
    }
    assert.ok(d(seat.seat, I.zoneCenter) <= INTERVIEW_ZONE_RADIUS, `${id} 앉은 자리는 책상 사정거리 안`);
  }
  const seat = chairSeat();
  assert.equal(seatZone(null, zones), null);
  assert.equal(seatZone({ id: 'seat-0' }, zones), null, '마당 벤치에는 묶인 구역이 없다');
  assert.equal(currentZoneFor({ mode: 'seated', pos: seat.seat, seat: { id: 'seat-0' }, zones, spaceId: 'yard' }), null);
});

test('장식: 칠판(서쪽 벽)·벽시계(북쪽 벽)·간판 "면접장"(북쪽 벽, 창 아래가 아니라 가운데)·화분이 방 안에 있다', () => {
  assert.equal(I.sign.text, '면접장');
  assert.ok(inBounds(I.sign, 0) && I.sign.y + I.sign.height / 2 <= I.wallHeight && I.sign.y - I.sign.height / 2 >= 1.4);
  assert.ok(Math.abs(I.board.x - B.minX) < 0.3 && I.board.y > 1 && I.board.width > 1.5 && I.board.height > 0.8);
  assert.ok(Math.abs(Math.sin(I.board.rotY) - 1) < 1e-9, '동쪽(방 안쪽)을 본다');
  assert.ok(Math.abs(I.clock.z - B.minZ) < 0.3 && I.clock.y + I.clock.radius <= I.wallHeight);
  assert.ok(I.furniture.some((f) => f.name === 'pottedPlant'));
  for (const f of I.furniture) {
    assert.equal(f.pack, 'furniture');
    assert.ok(f.scale > 0 && Number.isFinite(f.rotY));
    assert.ok(inBounds(f, 0.2), `${f.name} ${f.x},${f.z}`);
  }
});

test('모든 장애물·조명이 방 안에 있고 장애물끼리 겹치지 않는다(같은 가구의 원 제외)', () => {
  for (const o of I.obstacles) {
    assert.ok(Number.isFinite(o.x) && Number.isFinite(o.z) && o.radius > 0);
    assert.ok(inBounds(o, o.radius - 1e-9), JSON.stringify(o));
  }
  I.obstacles.forEach((a, i) => I.obstacles.slice(i + 1).forEach((b) => {
    if (a.id !== undefined && a.id === b.id) return;
    assert.ok(d(a, b) >= a.radius + b.radius + 0.05, `${a.id} vs ${b.id}`);
  }));
  for (const l of I.lamps) assert.ok(inBounds(l, 0.5) && l.y > 1.5 && l.y < I.wallHeight);
  assert.ok(I.lamps.length >= 2 && I.lamps.length <= 4);
});

function walk(from, to, frames = 2500) {
  const pushOut = (p) => {
    for (let pass = 0; pass < 3; pass++) for (const o of I.obstacles) p = pushOutOfCircle(p, PLAYER.radius, o);
    return p;
  };
  let pos = { ...from };
  const target = pushOut(clampToSpace(to, 'interview', WALK));
  const path = [pos];
  for (let i = 0; i < frames; i++) {
    const step = stepToward(pos, target, PLAYER.speed, 1 / 60);
    pos = pushOut({ x: step.x, z: step.z });
    path.push(pos);
    if (step.arrived) break;
  }
  return path;
}

test('도착 지점에서 서 있을 자리까지, 서 있을 자리에서 출구 앞까지 걸어서 갈 수 있다', () => {
  const there = walk(I.arrival, I.standingSpot);
  assert.ok(d(there[there.length - 1], I.standingSpot) < 0.3, JSON.stringify(there[there.length - 1]));
  const back = walk(I.standingSpot, interactTarget(I.interactables[0]));
  assert.ok(nearestInRange(back[back.length - 1], I.interactables));
});

test('걸어서 책상·의자 등 장애물을 통과할 수 없다', () => {
  for (const o of I.obstacles) {
    const south = o.z + o.radius + 2;
    const path = walk({ x: o.x, z: south > B.maxZ - WALK ? o.z - o.radius - 2 : south }, o, 600);
    for (const p of path) assert.ok(d(p, o) >= o.radius + PLAYER.radius - 1e-6, `${o.id} ${JSON.stringify(p)}`);
  }
});

test('결정적이다: 두 번 만들어도 같고 새 객체를 돌려준다', () => {
  assert.deepEqual(buildInterviewInterior(), I);
  assert.notEqual(buildInterviewInterior(), I);
});
