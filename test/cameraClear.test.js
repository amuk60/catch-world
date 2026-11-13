import test from 'node:test';
import assert from 'node:assert/strict';
import { buildLayout, buildingFacade } from '../src/logic/layout.js';
import { ORBIT, SEED, CAMERA_CLEAR } from '../src/config.js';
import { orbitPosition, frontAzimuthDeg } from '../src/logic/orbit.js';
import { buildingBoxes, segmentHitsBox, isViewBlocked, clearAzimuth, shortestTurnDeg, createCameraClear } from '../src/logic/cameraClear.js';

const L = buildLayout(SEED);
const boxes = buildingBoxes(L.buildings, 0);
const boxesM = buildingBoxes(L.buildings, CAMERA_CLEAR.margin);
const base = { azimuthDeg: ORBIT.azimuthDeg, polarDeg: ORBIT.polarDeg, distance: ORBIT.distance };
const targetAt = (p) => [p.x, ORBIT.targetHeight, p.z];
const camAt = (target, o) => orbitPosition(target, o);
const blockedAt = (target, o, bx = boxesM) => isViewBlocked(camAt(target, o), target, bx);
const laundryArrival = buildingFacade('laundry').arrival;
const interviewArrival = buildingFacade('interview').arrival;
const interviewBlockedSpot = { x: 5, z: -7 }; // 면접장 북서쪽 앞마당: 기본 카메라(남동쪽)에서 보면 면접장 건물 뒤
const FAR = targetAt({ x: -6, z: 0 }); // 건물에서 먼 마당

test('CAMERA_CLEAR 설정: 켜져 있고 값이 알맞다(끄려면 enabled: false)', () => {
  assert.equal(CAMERA_CLEAR.enabled, true);
  for (const k of ['delaySeconds', 'idleSeconds', 'maxDegPerSecond', 'margin']) assert.ok(CAMERA_CLEAR[k] > 0 && Number.isFinite(CAMERA_CLEAR[k]), k);
  assert.ok(CAMERA_CLEAR.maxDegPerSecond <= 45);
  assert.ok(CAMERA_CLEAR.delaySeconds >= 0.3 && CAMERA_CLEAR.idleSeconds >= 1.5);
});

test('buildingBoxes: 두 건물의 발자국(회전 반영)과 높이, 마진만큼 부푼 상자', () => {
  assert.equal(boxes.length, 2);
  const [laundry, interview] = boxes;
  // 정면이 서쪽: 폭 5.4 는 z 방향, 깊이 3.6 은 x 방향.
  assert.ok(Math.abs(laundry.minX - 7.1) < 1e-9 && Math.abs(laundry.maxX - 10.7) < 1e-9);
  assert.ok(Math.abs(laundry.minZ - 2.8) < 1e-9 && Math.abs(laundry.maxZ - 8.2) < 1e-9);
  assert.equal(laundry.minY, 0);
  assert.ok(laundry.maxY > 3 && laundry.maxY < 4);
  assert.ok(interview.maxY > 8.7 && interview.maxY < 11, '면접장은 6층 빌딩이라 훨씬 높다');
  const m = buildingBoxes(L.buildings, 0.5)[0];
  assert.ok(Math.abs(m.minX - 6.6) < 1e-9 && Math.abs(m.maxZ - 8.7) < 1e-9 && Math.abs(m.maxY - (laundry.maxY + 0.5)) < 1e-9);
});

test('segmentHitsBox: 관통·위로 지나감·옆으로 지나감·선분이 닿기 전에 끝남·평행한 선분', () => {
  const box = { minX: 0, maxX: 2, minY: 0, maxY: 2, minZ: 0, maxZ: 2 };
  assert.equal(segmentHitsBox([-1, 1, 1], [3, 1, 1], box), true, '관통');
  assert.equal(segmentHitsBox([-1, 3, 1], [3, 3, 1], box), false, '위로');
  assert.equal(segmentHitsBox([-1, 1, 3], [3, 1, 3], box), false, '옆으로(평행)');
  assert.equal(segmentHitsBox([-3, 1, 1], [-1, 1, 1], box), false, '닿기 전에 끝남');
  assert.equal(segmentHitsBox([1, 1, 1], [1, 5, 1], box), true, '선분이 상자 안에서 시작');
  assert.equal(segmentHitsBox([-1, 4, 1], [3, -1, 1], box), true, '비스듬히 위에서 아래로 관통');
  assert.equal(segmentHitsBox([-1, 5, 1], [3, 3, 1], box), false, '비스듬히 위로 지나감');
});

test('가림 판정: 기본 카메라(남동쪽 위)에서 세탁소 문 앞과 면접장 북서쪽 앞마당의 플레이어는 건물에 가려진다', () => {
  assert.equal(blockedAt(targetAt(laundryArrival), base, boxes), true, '세탁소 문 앞');
  assert.equal(blockedAt(targetAt(interviewBlockedSpot), base, boxes), true, '면접장 북서쪽');
  assert.equal(blockedAt(targetAt(interviewArrival), base, boxes), false, '면접장 문 앞은 카메라가 건물 남쪽 옆이라 안 가려진다');
});

test('가림 판정: 건물에서 먼 마당(소각로 곁·스폰)은 가려지지 않는다', () => {
  for (const p of [{ x: -6, z: 0 }, { x: 0, z: 3 }, { x: -3, z: -8 }]) assert.equal(blockedAt(targetAt(p), base), false, JSON.stringify(p));
});

test('가림 판정: 건물 정면 쪽(서쪽)에서 건물을 바라보는 카메라는 가려지지 않는다', () => {
  for (const arr of [laundryArrival, interviewArrival]) {
    assert.equal(blockedAt(targetAt(arr), { ...base, azimuthDeg: 270 }), false);
  }
});

test('가림 판정: 건물 뒤(동쪽)에서 보면 가려지고, 건물 위로 한참 높은 카메라가 건물 옆 목표를 보면 가려지지 않는다', () => {
  const t = targetAt(laundryArrival);
  assert.equal(blockedAt(t, { ...base, azimuthDeg: 90, polarDeg: 75, distance: 12 }, boxes), true);
  assert.equal(isViewBlocked([4, 30, 3.7], [4.5, 1, 3.7], boxes), false);
});

test('clearAzimuth: 가려져 있으면 가장 가까운(최단 회전) 안 가려진 방위각을 돌려주고, 그 방위각은 실제로 안 가려진다', () => {
  for (const arr of [laundryArrival, interviewBlockedSpot]) {
    const t = targetAt(arr);
    const az = clearAzimuth(t, base, boxesM, 5);
    assert.ok(az !== null && typeof az === 'number');
    assert.equal(blockedAt(t, { ...base, azimuthDeg: az }), false, `az ${az}`);
    // 더 가까운 5도 간격 후보는 모두 가려져 있다
    const dist = Math.abs(shortestTurnDeg(base.azimuthDeg, az));
    for (let d = 5; d < dist - 1e-9; d += 5) {
      for (const s of [1, -1]) assert.equal(blockedAt(t, { ...base, azimuthDeg: base.azimuthDeg + s * d }), true, `${s * d}`);
    }
  }
});

test('clearAzimuth: 모든 방위각 중 가장 가까운 것을 고른다(여러 시작 방위각에서 반환값이 안 가려진다)', () => {
  for (const arr of [laundryArrival, interviewArrival, { x: 6, z: 0 }, { x: 5, z: 7 }]) {
    for (let a = 0; a < 360; a += 15) {
      const t = targetAt(arr);
      const o = { ...base, azimuthDeg: a };
      const az = clearAzimuth(t, o, boxesM, 5);
      if (blockedAt(t, o)) {
        if (az !== null) assert.equal(blockedAt(t, { ...o, azimuthDeg: az }), false, `${JSON.stringify(arr)} ${a}`);
      } else assert.equal(az, null);
    }
  }
});

test('건물에서 나오면 카메라가 캐릭터 정면에 온다: 도착 방향의 정면 방위각으로 두면 두 건물 모두 시선이 안 가려지고 건물은 캐릭터 뒤(동쪽)에 있다', () => {
  for (const [id, arr] of [['laundry', laundryArrival], ['interview', interviewArrival]]) {
    const az = frontAzimuthDeg(arr.rotY);
    const t = targetAt(arr);
    const cam = camAt(t, { ...base, azimuthDeg: az });
    assert.ok(cam[0] < arr.x - 1, `${id}: 카메라는 캐릭터 서쪽(광장 쪽)`);
    const b = L.buildings.find((x) => x.id === id);
    assert.ok(b.x > arr.x, `${id}: 건물은 캐릭터 뒤(동쪽)`);
    assert.equal(isViewBlocked(cam, t, boxesM), false, id);
    // 카메라에서 캐릭터를 보는 방향(수평)은 캐릭터가 바라보는 방향의 반대, 즉 캐릭터의 얼굴이 카메라를 향한다
    const look = [t[0] - cam[0], t[2] - cam[2]];
    assert.ok(look[0] * Math.sin(arr.rotY) + look[1] * Math.cos(arr.rotY) < 0, id);
  }
});

test('clearAzimuth: 이미 안 가려져 있으면 null', () => {
  assert.equal(clearAzimuth(FAR, base, boxesM, 5), null);
  assert.equal(clearAzimuth(targetAt(laundryArrival), { ...base, azimuthDeg: 270 }, boxesM, 5), null);
});

test('clearAzimuth: 어느 방위각도 못 비우면 null(건물 안에 갇힌 목표)', () => {
  assert.equal(clearAzimuth([8.9, 1, 5.5], { ...base, distance: 5 }, boxesM, 5), null);
});

test('shortestTurnDeg: 부호 있는 최단 회전(-180~180)', () => {
  assert.equal(shortestTurnDeg(350, 10), 20);
  assert.equal(shortestTurnDeg(10, 350), -20);
  assert.equal(shortestTurnDeg(45, 45), 0);
  assert.ok(Math.abs(Math.abs(shortestTurnDeg(0, 180)) - 180) < 1e-9);
});

// ---- 컨트롤러 ----
const cfg = { enabled: true, delaySeconds: 0.4, idleSeconds: 2, maxDegPerSecond: 45, margin: 0.3, rampSeconds: 0.5, easeDeg: 20, scanStepDeg: 5 };
function ctx(o, over = {}) {
  return { allowed: true, target: targetAt(laundryArrival), orbit: o, boxes: boxesM, ...over };
}
const run = (c, o, seconds, over, dt = 1 / 60) => {
  let orbit = o;
  let rotated = 0;
  for (let t = 0; t < seconds - 1e-9; t += dt) {
    const r = c.update(dt, ctx(orbit, over));
    rotated += Math.abs(shortestTurnDeg(orbit.azimuthDeg, r.azimuthDeg));
    orbit = { ...orbit, azimuthDeg: r.azimuthDeg };
  }
  return { orbit, rotated };
};
const idleFor = (c) => c.update(2.5, ctx(base, { allowed: false })); // 입력 없이 2.5초 흐른 상태

test('컨트롤러: 가려진 뒤 0.4초가 지나기 전엔 돌지 않는다(사용자 입력 없이 2초 지난 상태)', () => {
  const c = createCameraClear(cfg);
  idleFor(c);
  assert.equal(run(c, base, 0.3).orbit.azimuthDeg, base.azimuthDeg);
});

test('컨트롤러: 0.4초 넘게 가려지면 도는데, 초당 최대 속도를 넘지 않고, 가림이 풀리면 멈춘다', () => {
  const c = createCameraClear(cfg);
  idleFor(c);
  let o = base;
  let prev = o.azimuthDeg;
  let maxStep = 0;
  let started = -1;
  for (let i = 0; i < 60 * 10; i++) {
    const r = c.update(1 / 60, ctx(o));
    const step = Math.abs(shortestTurnDeg(prev, r.azimuthDeg));
    maxStep = Math.max(maxStep, step);
    if (started < 0 && step > 0) started = i / 60;
    prev = r.azimuthDeg;
    o = { ...o, azimuthDeg: r.azimuthDeg };
  }
  assert.ok(started >= 0.4 - 1e-6 && started < 0.5, `시작 ${started}`);
  assert.ok(maxStep <= 45 / 60 + 1e-9, `프레임당 최대 ${maxStep}`);
  assert.equal(blockedAt(targetAt(laundryArrival), o), false, '결국 안 가려진다');
  assert.equal(run(c, o, 1).rotated, 0, '풀리면 더는 돌지 않는다');
  assert.ok(Math.abs(shortestTurnDeg(base.azimuthDeg, o.azimuthDeg)) > 0);
});

test('컨트롤러: 시작은 부드럽다(속도가 서서히 붙는다)', () => {
  const c = createCameraClear(cfg);
  idleFor(c);
  run(c, base, 0.4 + 1 / 60);
  const first = run(c, base, 1 / 60).rotated;
  assert.ok(first < (45 / 60) * 0.5, `첫 프레임 ${first}`);
});

test('컨트롤러: 사용자가 만진 뒤 2초 동안은 돌지 않고, 2초가 지나면 돈다', () => {
  const c = createCameraClear(cfg);
  c.touch();
  assert.equal(run(c, base, 1.9).rotated, 0);
  assert.ok(run(c, base, 1.0).rotated > 0);
});

test('컨트롤러: 입력이 계속 들어오면(touch 반복) 영원히 안 돈다', () => {
  const c = createCameraClear(cfg);
  let o = base;
  for (let i = 0; i < 60 * 5; i++) {
    c.touch();
    o = { ...o, azimuthDeg: c.update(1 / 60, ctx(o)).azimuthDeg };
  }
  assert.equal(o.azimuthDeg, base.azimuthDeg);
});

test('컨트롤러: allowed=false(실내·전환·앉기·드래그 중)면 안 돌고 가림 시간도 쌓이지 않는다', () => {
  const c = createCameraClear(cfg);
  idleFor(c);
  assert.equal(run(c, base, 3, { allowed: false }).rotated, 0);
  assert.equal(run(c, base, 0.3).rotated, 0, '허용으로 바뀌면 그때부터 0.4초를 센다');
  assert.ok(run(c, base, 1).rotated > 0);
});

test('컨트롤러: enabled=false 면 아무것도 하지 않는다', () => {
  const c = createCameraClear({ ...cfg, enabled: false });
  c.update(2.5, ctx(base));
  assert.equal(run(c, base, 5).rotated, 0);
});

test('컨트롤러: 안 가려져 있으면 안 돌고, 가림이 잠깐 풀리면 시간이 처음부터', () => {
  const c = createCameraClear(cfg);
  idleFor(c);
  assert.equal(run(c, base, 3, { target: FAR }).rotated, 0);
  run(c, base, 0.3);
  run(c, base, 0.1, { target: FAR }); // 풀렸다
  assert.equal(run(c, base, 0.3).rotated, 0, '다시 0.4초를 센다');
});

test('컨트롤러: reset() 하면 입력 직후처럼 2초 기다린다(공간을 바꿨을 때)', () => {
  const c = createCameraClear(cfg);
  c.update(5, ctx(base, { allowed: false }));
  c.reset();
  assert.equal(run(c, base, 1.9).rotated, 0);
  assert.ok(run(c, base, 1).rotated > 0);
});

test('컨트롤러: 도는 방향은 최단 회전이다(방위각 0/360 경계를 넘어도)', () => {
  const t = targetAt(laundryArrival);
  for (const start of [350, 359, 2, 10]) {
    const c = createCameraClear(cfg);
    idleFor(c);
    const o = { ...base, azimuthDeg: start };
    if (!isViewBlocked(camAt(t, o), t, boxesM)) continue;
    const goal = clearAzimuth(t, o, boxesM, 5);
    run(c, o, 0.45); // 지연
    const r = c.update(1 / 60, ctx(o));
    assert.ok(r.azimuthDeg >= 0 && r.azimuthDeg < 360, `${r.azimuthDeg}`);
    assert.equal(Math.sign(shortestTurnDeg(start, r.azimuthDeg)), Math.sign(shortestTurnDeg(start, goal)), `start ${start}`);
  }
});
