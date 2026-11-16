import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildLayout, buildingFacade, laundryFacade } from '../src/logic/layout.js';
import { FURNACE, PLAYER, SEED, SPAWN, YARD } from '../src/config.js';
import { stepToward, pushOutOfCircle, clampToYard } from '../src/logic/movement.js';
import { interactTarget, nearestInRange, actionOf } from '../src/logic/interaction.js';
import { arrivalPoint, SPACES, spaceAt } from '../src/logic/spaces.js';
import { buildInterviewInterior } from '../src/logic/interiors.js';

const L = buildLayout(SEED);
const d = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const [laundry, interview] = L.buildings;
const slot = L.buildingSlots.find((s) => s.id === 'interview');
const WALK = YARD.width / 2 - (PLAYER.radius + 0.5);
const allObstacles = [FURNACE, ...L.obstacles];
const free = (p) => allObstacles.every((o) => d(p, o) >= o.radius + PLAYER.radius) && Math.abs(p.x) <= WALK && Math.abs(p.z) <= WALK;
const front = (rotY) => ({ x: Math.sin(rotY), z: Math.cos(rotY) });
const world = (b, lx, lz) => ({ x: b.x + lx * Math.cos(b.rotY) + lz * Math.sin(b.rotY), z: b.z - lx * Math.sin(b.rotY) + lz * Math.cos(b.rotY) });
const circles = L.obstacles.filter((o) => o.radius === interview.obstacleRadius);
const laundryCircles = L.obstacles.filter((o) => o.radius === laundry.obstacleRadius);

test('면접장 건물: 면접장 터(6x6) 안에 완전히 들어가고 세탁소와 같은 크기·방향(정면 서쪽)이다', () => {
  assert.equal(interview.id, 'interview');
  assert.equal(interview.label, '면접장');
  assert.equal(laundry.label, '세탁소');
  assert.equal(interview.z, slot.z);
  assert.ok(interview.x >= slot.x && interview.x <= slot.x + 1.0);
  assert.deepEqual([interview.width, interview.depth, interview.tile, interview.rotY], [laundry.width, laundry.depth, laundry.tile, laundry.rotY]);
  for (const [lx, lz] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) {
    const p = world(interview, (lx * interview.width) / 2, (lz * interview.depth) / 2);
    assert.ok(Math.abs(p.x - slot.x) <= slot.width / 2 + 1e-9 && Math.abs(p.z - slot.z) <= slot.depth / 2 + 1e-9);
  }
  for (const o of circles) assert.ok(Math.abs(o.x - slot.x) <= slot.width / 2 && Math.abs(o.z - slot.z) <= slot.depth / 2, JSON.stringify(o));
  assert.ok(circles.length >= 8);
  assert.ok(Math.abs(front(interview.rotY).x + 1) < 1e-9, '문은 서쪽(-x)을 향한다');
});

test('두 건물의 외곽 원은 서로 겹치지 않고, 문은 건물 정면의 서로 반대쪽 끝(세탁소 북쪽, 면접장 남쪽)에 있다', () => {
  for (const a of circles) for (const b of laundryCircles) assert.ok(d(a, b) >= a.radius + b.radius, 'overlap');
  assert.ok(laundry.door.z < laundry.z && interview.door.z > interview.z, '반대쪽 끝');
  assert.ok(Math.abs(interview.door.z - laundry.door.z) > 5, '두 문은 멀다');
});

test('면접장 건물 상호작용: kind building, 라벨 면접장, E 동작 없음, 반경·범위 규칙', () => {
  const b = L.interactables.find((i) => i.id === 'interview');
  assert.equal(b.kind, 'building');
  assert.equal(b.label, '면접장');
  assert.ok(b.radius > 0 && b.interactRange >= b.radius + PLAYER.radius + 0.8 - 1e-9);
  assert.ok(Math.hypot(b.x - interview.x, b.z - interview.z) < 1.5);
  assert.equal(actionOf(b), null);
});

const door = L.interactables.find((i) => i.id === 'interview-door');

test('면접장 문: kind door, to interview, 문 앞(건물 밖)에 있고 E 동작은 들어가기', () => {
  assert.ok(door);
  assert.equal(door.kind, 'door');
  assert.equal(door.to, 'interview');
  assert.equal(door.label, '면접장 문');
  const n = front(interview.rotY);
  const along = (door.x - interview.door.x) * n.x + (door.z - interview.door.z) * n.z;
  assert.ok(along > 0.3 && along < 1.5);
  assert.ok(door.interactRange >= door.radius + PLAYER.radius + 0.8 - 1e-9);
  assert.deepEqual(actionOf(door), { type: 'enter', prompt: '들어가기' });
});

test('건물을 클릭해 도착한 문 앞 1.5 지점에서 면접장 문 E 안내가 뜨고, 세탁소 문과 헷갈리지 않으며, 문 앞은 비어 있다', () => {
  const click = interactTarget(L.interactables.find((i) => i.id === 'interview'));
  assert.equal(nearestInRange(click, L.interactables), door);
  assert.deepEqual(interactTarget(door), click);
  const laundryClick = interactTarget(L.interactables.find((i) => i.id === 'laundry'));
  assert.equal(nearestInRange(laundryClick, L.interactables).id, 'laundry-door');
  const n = front(interview.rotY);
  for (const dist of [1.0, 1.5, 2.0, 2.6, 3.5]) assert.ok(free({ x: interview.door.x + n.x * dist, z: interview.door.z + n.z * dist }), `문 앞 ${dist}`);
});

test('마당으로 나왔을 때 도착 지점: 문 앞, 건물을 등지고 서며 안내가 뜨지 않는다. 마당 도착은 건물마다 다르다', () => {
  const a = arrivalPoint('yard', 'interview');
  assert.ok(free(a), JSON.stringify(a));
  assert.ok(d(a, interview.door) >= 1 && d(a, interview.door) <= 3);
  assert.equal(nearestInRange(a, L.interactables), null);
  assert.equal(spaceAt(a), 'yard');
  assert.notDeepEqual(a, arrivalPoint('yard', 'laundry'));
  assert.deepEqual(a, buildingFacade('interview').arrival);
  assert.deepEqual(laundryFacade().building, buildingFacade('laundry').building);
  assert.throws(() => buildingFacade('nowhere'), /nowhere/);
});

test('면접장 외곽 원은 랜턴·위로 오브젝트·스폰·소각장과 겹치지 않고 마당 안에 있다', () => {
  const others = L.obstacles.filter((o) => !circles.includes(o) && o.radius !== laundry.obstacleRadius);
  assert.equal(others.length, 26); // 쿠키 노점 양 끝 원 2개 포함
  for (const m of circles) {
    for (const o of others) assert.ok(d(m, o) >= m.radius + o.radius + 0.2, `${JSON.stringify(m)} vs ${JSON.stringify(o)}`);
    assert.ok(d(m, SPAWN) >= m.radius + PLAYER.radius);
    assert.ok(Math.abs(m.x) <= YARD.width / 2 && Math.abs(m.z) <= YARD.depth / 2);
  }
  for (const lt of L.lanterns) for (const m of circles) assert.ok(d(m, lt) >= m.radius + 0.5, `lantern ${lt.x},${lt.z}`);
});

test('마당에서 걸어서 면접장 문 앞까지 갈 수 있고 건물 안으로는 못 들어간다', () => {
  const walk = (from, to, frames = 2500) => {
    const pushOut = (p) => { for (let pass = 0; pass < 3; pass++) for (const o of allObstacles) p = pushOutOfCircle(p, PLAYER.radius, o); return p; };
    let pos = { ...from };
    const target = pushOut(clampToYard(to, YARD, PLAYER.radius + 0.5));
    const path = [pos];
    for (let i = 0; i < frames; i++) {
      const step = stepToward(pos, target, PLAYER.speed, 1 / 60);
      pos = pushOut({ x: step.x, z: step.z });
      path.push(pos);
      if (step.arrived) break;
    }
    return path;
  };
  const toDoor = walk(SPAWN, interactTarget(L.interactables.find((i) => i.id === 'interview')));
  assert.equal(nearestInRange(toDoor[toDoor.length - 1], L.interactables), door);
  const inside = walk(toDoor[toDoor.length - 1], { x: interview.x, z: interview.z });
  const toLocal = (p) => {
    const dx = p.x - interview.x;
    const dz = p.z - interview.z;
    return { lx: dx * Math.cos(interview.rotY) - dz * Math.sin(interview.rotY), lz: dx * Math.sin(interview.rotY) + dz * Math.cos(interview.rotY) };
  };
  for (const p of inside) {
    const l = toLocal(p);
    assert.ok(!(Math.abs(l.lx) < interview.width / 2 - 0.2 && Math.abs(l.lz) < interview.depth / 2 - 0.2), JSON.stringify(p));
  }
});

test('공간 레지스트리: interview 공간의 도착 지점(마당에서 들어올 때)은 실내 데이터의 도착 지점이다', () => {
  const I = buildInterviewInterior();
  assert.deepEqual(SPACES.interview.bounds, I.bounds);
  assert.deepEqual(arrivalPoint('interview', 'yard'), I.arrival);
  assert.deepEqual(arrivalPoint('interview'), I.arrival);
  assert.equal(spaceAt(I.arrival), 'interview');
  assert.equal(spaceAt(I.standingSpot), 'interview');
  assert.equal(spaceAt({ x: 300, z: 0 }), 'laundry');
});
