import test from 'node:test';
import assert from 'node:assert/strict';
import { buildLaundryInterior } from '../src/logic/interiors.js';
import { PLAYER, LAUNDRY_INTERIOR, WASHER_RANGE, CLOTHESLINE_RANGE } from '../src/config.js';
import { stepToward, pushOutOfCircle } from '../src/logic/movement.js';
import { clampToSpace } from '../src/logic/spaces.js';
import { interactTarget, nearestInRange, actionOf } from '../src/logic/interaction.js';

const I = buildLaundryInterior();
const B = I.bounds;
const d = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const WALK = PLAYER.radius + 0.5; // 이동 코드가 쓰는 벽 여유
// 플레이어(반경 PLAYER.radius)가 서 있을 수 있는 점: 모든 장애물 원 밖, 걸을 수 있는 영역 안.
const free = (p) => I.obstacles.every((o) => d(p, o) >= o.radius + PLAYER.radius)
  && p.x >= B.minX + WALK && p.x <= B.maxX - WALK && p.z >= B.minZ + WALK && p.z <= B.maxZ - WALK;
const inBounds = (p, m = 0) => p.x >= B.minX + m - 1e-9 && p.x <= B.maxX - m + 1e-9 && p.z >= B.minZ + m - 1e-9 && p.z <= B.maxZ - m + 1e-9;

test('방: 원점 중심 12(x) x 10(z)이고 벽 높이·원점이 설정과 같다', () => {
  assert.equal(B.maxX - B.minX, LAUNDRY_INTERIOR.width);
  assert.equal(B.maxZ - B.minZ, LAUNDRY_INTERIOR.depth);
  assert.deepEqual({ x: (B.minX + B.maxX) / 2, z: (B.minZ + B.maxZ) / 2 }, LAUNDRY_INTERIOR.origin);
  assert.equal(I.id, 'laundry');
  assert.equal(I.wallHeight, LAUNDRY_INTERIOR.wallHeight);
});

test('벽: 네 면(북·남·서·동), 각 벽 조각이 벽 길이를 빈틈없이 덮고 방 경계에 놓인다', () => {
  assert.deepEqual(I.walls.map((w) => w.side).sort(), ['east', 'north', 'south', 'west']);
  assert.equal(new Set(I.walls.map((w) => w.id)).size, 4);
  for (const w of I.walls) {
    const alongX = w.side === 'north' || w.side === 'south';
    const length = alongX ? B.maxX - B.minX : B.maxZ - B.minZ;
    assert.ok(w.pieces.length * I.tile === length, `${w.id} ${w.pieces.length} x ${I.tile} != ${length}`);
    const coords = w.pieces.map((p) => (alongX ? p.x : p.z)).sort((a, b) => a - b);
    const start = alongX ? B.minX : B.minZ;
    coords.forEach((c, i) => assert.ok(Math.abs(c - (start + I.tile / 2 + i * I.tile)) < 1e-9, `${w.id} tile ${i}`));
    for (const p of w.pieces) {
      const across = alongX ? p.z : p.x;
      const plane = { north: B.minZ, south: B.maxZ, west: B.minX, east: B.maxX }[w.side];
      assert.ok(Math.abs(across - plane) <= 0.2, `${w.id} plane ${across}`); // 안쪽 면이 방 경계에 닿는다(두께만큼 바깥)
      assert.ok(['wall', 'wallWindow', 'wallDoorwayWide'].includes(p.name), p.name);
    }
  }
});

test('창은 1~2개, 출입문 조각은 서쪽 벽에 하나', () => {
  const pieces = I.walls.flatMap((w) => w.pieces.map((p) => ({ ...p, side: w.side })));
  const windows = pieces.filter((p) => p.name === 'wallWindow');
  assert.ok(windows.length >= 1 && windows.length <= 2, `${windows.length}`);
  const doors = pieces.filter((p) => p.name === 'wallDoorwayWide');
  assert.equal(doors.length, 1);
  assert.equal(doors[0].side, 'west');
  assert.ok(Math.abs(doors[0].z - I.exit.z) < 1e-9);
});

test('출입문: 서쪽 벽에 있고, 안쪽 1.5 지점이 비어 있다(플레이어가 설 수 있다)', () => {
  assert.equal(I.exit.x, B.minX);
  assert.ok(I.exit.z > B.minZ + 1 && I.exit.z < B.maxZ - 1);
  assert.ok(Math.abs(Math.sin(I.exit.rotY) - 1) < 1e-9, '방 안쪽(+x)을 향한다');
  for (const dist of [1.0, 1.5, 2.0, 3.0]) assert.ok(free({ x: I.exit.x + dist, z: I.exit.z }), `exit front ${dist}`);
});

test('출구 상호작용: kind door, 마당으로(to yard), 출입문 가까이, 도착 지점에서는 안내가 뜨지 않는다', () => {
  assert.equal(I.interactables.length, 2); // 출구 + 빨랫줄(새 셔츠 입기, 아래 테스트). 출구가 첫째.
  const door = I.interactables[0];
  assert.equal(door.id, 'laundry-exit');
  assert.equal(door.kind, 'door');
  assert.equal(door.to, 'yard');
  assert.ok(door.label && door.radius > 0);
  assert.ok(Math.abs(door.x - I.exit.x) <= 1.2 && Math.abs(door.z - I.exit.z) < 1e-9);
  assert.ok(door.interactRange > door.radius, 'range');
  assert.ok(free(interactTarget(door)), '클릭하면 걸어갈 지점이 서 있을 수 있는 곳');
  assert.ok(inBounds(door, 0.5));
  assert.equal(nearestInRange(I.arrival, I.interactables), null, '도착 직후에는 E 안내가 뜨지 않는다');
  assert.equal(nearestInRange({ x: I.exit.x + 1.0, z: I.exit.z }, I.interactables), door, '문 앞에서는 뜬다');
  assert.equal(nearestInRange({ x: I.exit.x + 1.0, z: I.exit.z + 4 }, I.interactables), null, '문에서 먼 곳에서는 안 뜬다');
});

test('도착 지점(마당에서 들어왔을 때)은 방 안, 모든 장애물 밖, 걸을 수 있는 영역 안', () => {
  assert.ok(free(I.arrival), JSON.stringify(I.arrival));
  assert.ok(I.arrival.x > I.exit.x && Math.abs(I.arrival.z - I.exit.z) < 1e-9);
  assert.ok(Math.abs(Math.sin(I.arrival.rotY) - 1) < 1e-9);
});

test('세탁기 4대 + 건조기 2대: 북쪽(뒷)벽을 따라 한 줄, 방 안쪽(남쪽)을 보고, 반경 약 0.6', () => {
  assert.equal(I.washers.length, 6);
  assert.deepEqual(I.washers.map((w) => w.name).sort(), ['dryer', 'dryer', 'washer', 'washer', 'washer', 'washer']);
  for (const w of I.washers) {
    assert.equal(w.pack, 'furniture');
    assert.ok(w.scale > 0 && Number.isFinite(w.rotY));
    assert.ok(w.radius >= 0.55 && w.radius <= 0.65, `${w.radius}`);
    assert.ok(w.z - B.minZ <= 1.5 && w.z - B.minZ >= w.radius, `북쪽 벽에 붙어 있다 ${w.z}`);
    assert.ok(Math.abs(Math.cos(w.rotY) - 1) < 1e-9, '남쪽(+z)을 본다');
    assert.ok(inBounds(w, w.radius));
  }
  assert.equal(new Set(I.washers.map((w) => w.z)).size, 1);
});

test('그 밖의 가구: 접이식 테이블·벤치·화분과 러그, 모두 실내 안', () => {
  const names = I.furniture.map((f) => f.name);
  for (const n of ['table', 'benchCushion', 'pottedPlant', 'rugRectangle']) assert.ok(names.includes(n), n);
  for (const f of I.furniture) {
    assert.equal(f.pack, 'furniture');
    assert.ok(f.scale > 0 && Number.isFinite(f.rotY));
    assert.ok(inBounds(f, 0.3), `${f.name} ${f.x},${f.z}`);
  }
  assert.ok(!I.obstacles.some((o) => o.id === 'rugRectangle'), '러그는 밟고 지나가는 바닥 장식이라 장애물이 아니다');
  for (const n of ['table', 'benchCushion', 'pottedPlant']) assert.ok(I.obstacles.some((o) => o.id === n), `${n} 은 장애물`);
});

test('빨랫줄: 동쪽에 두 기둥 + 줄(길이 ~3.4, 높이 ~1.8, 6칸), 중심은 두 기둥의 가운데, 기둥은 장애물(반경 0.25)', () => {
  const c = I.clothesline;
  assert.ok(Math.abs(c.centre.x - (c.x1 + c.x2) / 2) < 1e-9 && Math.abs(c.centre.z - (c.z1 + c.z2) / 2) < 1e-9);
  assert.ok(Math.abs(Math.hypot(c.x2 - c.x1, c.z2 - c.z1) - 3.4) < 0.05);
  assert.ok(c.y >= 1.6 && c.y <= 2.0 && c.postHeight >= 1.9 && c.postHeight <= 2.1 && c.postRadius === 0.25 && c.slots === 6);
  assert.ok(c.centre.x > LAUNDRY_INTERIOR.origin.x + 3, '동쪽');
  for (const [x, z] of [[c.x1, c.z1], [c.x2, c.z2]]) {
    assert.ok(I.obstacles.some((o) => o.x === x && o.z === z && o.radius === c.postRadius), `post ${x},${z}`);
    assert.ok(inBounds({ x, z }, c.postRadius));
  }
  assert.ok(c.postHeight < I.wallHeight);
});

test('모든 장애물·가구·간판·조명이 방 안에 완전히 들어간다', () => {
  assert.ok(I.obstacles.length >= 6 + 2 + 2 + 2);
  for (const o of I.obstacles) {
    assert.ok(Number.isFinite(o.x) && Number.isFinite(o.z) && o.radius > 0);
    assert.ok(inBounds(o, o.radius - 1e-9), JSON.stringify(o));
  }
  for (const l of I.lamps) assert.ok(inBounds(l, 0.5) && l.y > 1.5 && l.y < I.wallHeight, JSON.stringify(l));
  assert.ok(I.lamps.length >= 2 && I.lamps.length <= 4);
  assert.equal(I.sign.text, '세탁소');
  assert.ok(inBounds(I.sign, 0) && I.sign.y + I.sign.height / 2 <= I.wallHeight && I.sign.y - I.sign.height / 2 >= 1.4, '세탁기보다 위, 벽 안');
  assert.ok(inBounds(I.standingSpot) && inBounds(I.arrival) && inBounds(I.exit));
});

test('장애물끼리 겹치지 않는다(같은 가구의 원 제외)', () => {
  I.obstacles.forEach((a, i) => {
    I.obstacles.slice(i + 1).forEach((b) => {
      if (a.id !== undefined && a.id === b.id) return;
      assert.ok(d(a, b) >= a.radius + b.radius + 0.05, `${a.id} vs ${b.id}`);
    });
  });
});

test('서 있을 자리: 가장 가까운 세탁기와 빨랫줄 중심이 모두 사정거리(4.0) 안이고 비어 있다', () => {
  const s = I.standingSpot;
  assert.ok(free(s));
  assert.ok(I.washers.some((w) => d(s, w) <= WASHER_RANGE));
  assert.ok(d(s, I.clothesline.centre) <= CLOTHESLINE_RANGE);
});

test('서 있을 수 있는 자리 중 세탁·널기를 둘 다 할 수 있는 곳이 넉넉하다', () => {
  let both = 0;
  for (let x = B.minX; x <= B.maxX; x += 0.1) {
    for (let z = B.minZ; z <= B.maxZ; z += 0.1) {
      const p = { x, z };
      if (free(p) && I.washers.some((w) => d(p, w) <= WASHER_RANGE) && d(p, I.clothesline.centre) <= CLOTHESLINE_RANGE) both++;
    }
  }
  assert.ok(both > 150, `both ${both}`);
});

test('세탁기 앞(남쪽)과 빨랫줄 옆에 설 수 있다', () => {
  for (const w of I.washers) assert.ok(free({ x: w.x, z: w.z + 1.4 }), `front of ${w.x}`);
  const c = I.clothesline.centre;
  assert.ok(free({ x: c.x - 1.2, z: c.z }));
});

// ---- 실제 이동 규칙(main.js 와 같은 방식)으로 걸어 보기 ----
function walk(from, to, frames = 2000) {
  const pushOut = (p) => {
    for (let pass = 0; pass < 3; pass++) for (const o of I.obstacles) p = pushOutOfCircle(p, PLAYER.radius, o);
    return p;
  };
  let pos = { ...from };
  const target = pushOut(clampToSpace(to, 'laundry', WALK));
  const path = [pos];
  for (let i = 0; i < frames; i++) {
    const step = stepToward(pos, target, PLAYER.speed, 1 / 60);
    pos = pushOut({ x: step.x, z: step.z });
    path.push(pos);
    if (step.arrived) break;
  }
  return path;
}

test('도착 지점에서 서 있을 자리까지, 서 있을 자리에서 출입문 앞까지 걸어서 갈 수 있다', () => {
  const there = walk(I.arrival, I.standingSpot);
  assert.ok(d(there[there.length - 1], I.standingSpot) < 0.3, JSON.stringify(there[there.length - 1]));
  const back = walk(I.standingSpot, interactTarget(I.interactables[0]));
  const end = back[back.length - 1];
  assert.ok(nearestInRange(end, I.interactables), JSON.stringify(end));
});

test('걸어서 세탁기·테이블 등 장애물을 통과할 수 없다', () => {
  for (const o of I.obstacles) {
    const south = o.z + o.radius + 2;
    const path = walk({ x: o.x, z: south > B.maxZ - WALK ? o.z - o.radius - 2 : south }, o, 600);
    for (const p of path) assert.ok(d(p, o) >= o.radius + PLAYER.radius - 1e-6, `${o.id} ${JSON.stringify(p)}`);
  }
});

test('실내 밖(마당 좌표 등)을 목표로 해도 방 안으로 끌려 들어온다', () => {
  const path = walk(I.arrival, { x: 0, z: 0 });
  for (const p of path) assert.ok(inBounds(p, 0.3), JSON.stringify(p));
});

test('천장 조명: 세탁기 줄 쪽(북)과 방 서쪽을 비추는 위치가 있다', () => {
  assert.ok(I.lamps.some((l) => l.z < 0) && I.lamps.some((l) => l.x < LAUNDRY_INTERIOR.origin.x + 1));
});

test('결정적이다: 두 번 만들어도 같고, 새 객체를 돌려준다', () => {
  assert.deepEqual(buildLaundryInterior(), I);
  assert.notEqual(buildLaundryInterior(), I);
  assert.equal(JSON.stringify(buildLaundryInterior()), JSON.stringify(I));
});

test('빨랫줄 상호작용: 줄 곁 방 안쪽, 새 셔츠 입기(E), 출구와 안 겹치고 걸어갈 수 있는 자리', () => {
  const line = I.interactables.find((i) => i.id === 'laundry-clothesline');
  assert.equal(line.kind, 'clothesline');
  assert.equal(actionOf(line).type, 'wear');
  assert.equal(actionOf(line).prompt, '새 셔츠 입기');
  assert.ok(line.label && line.radius > 0 && line.interactRange > line.radius);
  assert.ok(line.x < I.clothesline.x1 && inBounds(line, 0.5), '줄에서 방 안쪽');
  assert.ok(free(interactTarget(line)), '클릭하면 걸어갈 지점이 서 있을 수 있는 곳');
  assert.equal(nearestInRange(I.arrival, I.interactables)?.id ?? null, null, '도착 직후에는 뜨지 않는다');
  assert.equal(nearestInRange(interactTarget(line), I.interactables), line, '줄 앞에서는 뜬다');
  assert.equal(nearestInRange({ x: I.exit.x + 1.0, z: I.exit.z }, I.interactables).id, 'laundry-exit', '출구 앞에서는 출구가 뜬다');
});
