// 건물 가림 자동 보완 카메라 (순수). 마당에서 건물이 카메라와 플레이어 사이를 가로막으면, 카메라 방위각을 최단 회전으로 천천히 돌려 가림이 없는 방위각으로 옮긴다.
// 가림 판정은 3D 선분(카메라 -> 목표) 대 건물 상자(발자국 + 높이)의 교차이고, 카메라 위치는 logic/orbit.js 의 orbitPosition 과 같다. 나무는 보지 않는다(나무는 따로 줄어든다).
// 방위각은 도(deg). orbit: { azimuthDeg, polarDeg, distance }, target: [x, y, z], boxes: buildingBoxes() 결과.
import { orbitPosition } from './orbit.js';

const easeInOut = (t) => t * t * (3 - 2 * t);
const norm = (deg) => ((deg % 360) + 360) % 360;

// 부호 있는 최단 회전(도, -180 ~ 180): from 에서 to 로 가려면 얼마나(+ 는 방위각 증가) 돌아야 하는가.
export function shortestTurnDeg(from, to) {
  const d = norm(to - from);
  return d > 180 ? d - 360 : d;
}

// 건물(layout.buildings 항목: x, z, rotY, width, depth, height) -> 축 정렬 상자 { minX, maxX, minY, maxY, minZ, maxZ }.
// 회전한 직사각형의 바깥 사각형이고, margin 만큼 옆과 위로 부풀린다(경계에서 떨리지 않게).
export function buildingBoxes(buildings, margin = 0) {
  return buildings.map((b) => {
    const c = Math.abs(Math.cos(b.rotY));
    const s = Math.abs(Math.sin(b.rotY));
    const hx = (c * b.width + s * b.depth) / 2 + margin;
    const hz = (s * b.width + c * b.depth) / 2 + margin;
    return { id: b.id, minX: b.x - hx, maxX: b.x + hx, minY: 0, maxY: b.height + margin, minZ: b.z - hz, maxZ: b.z + hz };
  });
}

// 선분 a -> b 가 상자와 만나는가(slab 방식). 상자 안에서 시작하거나 끝나도 만난 것이다.
export function segmentHitsBox(a, b, box) {
  const lo = [box.minX, box.minY, box.minZ];
  const hi = [box.maxX, box.maxY, box.maxZ];
  let t0 = 0;
  let t1 = 1;
  for (let i = 0; i < 3; i++) {
    const d = b[i] - a[i];
    if (Math.abs(d) < 1e-12) {
      if (a[i] < lo[i] || a[i] > hi[i]) return false; // 이 축에 평행하고 판 밖
      continue;
    }
    let ta = (lo[i] - a[i]) / d;
    let tb = (hi[i] - a[i]) / d;
    if (ta > tb) [ta, tb] = [tb, ta];
    t0 = Math.max(t0, ta);
    t1 = Math.min(t1, tb);
    if (t0 > t1) return false;
  }
  return true;
}

// 카메라에서 목표까지의 시선이 어떤 건물 상자에 막히는가.
export function isViewBlocked(cameraPos, target, boxes) {
  return boxes.some((box) => segmentHitsBox(cameraPos, target, box));
}

// 지금 방위각에서 가려져 있을 때, 최단 회전으로 닿는 안 가려진 방위각(0~360). stepDeg 간격으로 좌우 번갈아 훑는다(같은 거리면 + 쪽 먼저).
// 이미 안 가려져 있거나 어느 방위각도 못 비우면 null. 돌려주는 방위각은 항상 boxes 기준으로 안 가려진다.
export function clearAzimuth(target, orbit, boxes, stepDeg = 5) {
  const blockedAt = (azimuthDeg) => isViewBlocked(orbitPosition(target, { ...orbit, azimuthDeg }), target, boxes);
  if (!blockedAt(orbit.azimuthDeg)) return null;
  for (let k = 1; k * stepDeg <= 180; k++) {
    for (const sign of [1, -1]) {
      const az = norm(orbit.azimuthDeg + sign * k * stepDeg);
      if (!blockedAt(az)) return az;
    }
  }
  return null;
}

// 가림 자동 보완 컨트롤러. 시간 상태(가려진 시간, 마지막 입력 뒤 경과, 도는 속도 붙기)만 들고 있고 렌더링과 무관하다.
// cfg: CAMERA_CLEAR(enabled, delaySeconds, idleSeconds, maxDegPerSecond) + 선택값 rampSeconds(출발 가속 시간), easeDeg(남은 각이 이보다 작으면 감속), scanStepDeg.
// update(dt, { allowed, target, orbit, boxes }) -> { azimuthDeg, rotating }: 새 방위각(안 돌면 그대로). allowed=false(실내·전환·앉기·드래그 중)면 가림 시간도 쌓지 않는다.
export function createCameraClear(cfg) {
  const { rampSeconds = 0.5, easeDeg = 20, scanStepDeg = 5 } = cfg;
  let blockedFor = 0; // 가림이 이어진 시간(초)
  let sinceInput = Infinity; // 사용자가 카메라를 마지막으로 만진 뒤 경과(초)
  let ramp = 0; // 0~1: 돌기 시작한 뒤 속도가 붙는 정도

  const stop = () => { blockedFor = 0; ramp = 0; };
  return {
    // 사용자가 카메라를 만졌다(드래그·휠): 일정 시간 동안은 돌지 않는다.
    touch() { sinceInput = 0; ramp = 0; },
    // 공간이 바뀌는 등 새 상황: 입력 직후처럼 기다린다.
    reset() { sinceInput = 0; stop(); },
    update(dt, { allowed, target, orbit, boxes }) {
      sinceInput += dt;
      const same = { azimuthDeg: orbit.azimuthDeg, rotating: false };
      if (!cfg.enabled || !allowed) { stop(); return same; }
      if (!isViewBlocked(orbitPosition(target, orbit), target, boxes)) { stop(); return same; }
      blockedFor += dt;
      if (blockedFor < cfg.delaySeconds || sinceInput < cfg.idleSeconds) { ramp = 0; return same; }
      const goal = clearAzimuth(target, orbit, boxes, scanStepDeg);
      if (goal === null) { ramp = 0; return same; }
      const turn = shortestTurnDeg(orbit.azimuthDeg, goal);
      const remaining = Math.abs(turn);
      ramp = Math.min(1, ramp + dt / rampSeconds);
      const speed = cfg.maxDegPerSecond * easeInOut(ramp) * Math.min(1, Math.max(0.15, remaining / easeDeg));
      const step = Math.min(remaining, speed * dt);
      return { azimuthDeg: norm(orbit.azimuthDeg + Math.sign(turn) * step), rotating: step > 0 };
    },
  };
}
