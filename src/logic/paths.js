// 마당 가는 길(바닥 유도선) 계획 (순수 계산: 렌더링 없음). 스폰 허브에서 캠프파이어·캐치 면접장·마음 세탁소·포춘쿠키 상점·파쇄기 작업 자리까지 완만하게 휘어진 길을 만든다.
// 길은 바닥 장식일 뿐 장애물이 아니다(이동에는 영향이 없다). 나무·덤불·바위·통나무·건물·노점·가로등 장애물은 피해서 돌아가고, 도착점은 모두 배치 데이터(건물 문·통나무 틈·노점·파쇄기 작업 자리)에서 계산한다.
import { FURNACE, PLAYER, SPAWN, YARD } from '../config.js';
import { buildingFacade } from './layout.js';
import { BUILDING_NAMES } from './signText.js';

export const PATH_STYLE = {
  clearance: PLAYER.radius + 0.12, // 길 중심선이 장애물 가장자리에서 떨어져야 하는 거리(플레이어 반경 + 여유)
  bow: 0.07, // 처음 곡선을 주는 정도(길이 대비 옆으로 휘는 비율)
  perSegment: 10, // Catmull-Rom 구간당 표본 수
  hubClear: 1.0, // 허브 중심에서 돌이 시작하는 거리
  fireRadius: 2.55, // 캠프파이어 길이 닿는 곳: 소각로 중심에서 이만큼(통나무 고리 안쪽)
  standExtra: 0.7, // 노점·파쇄기: 작업 자리에서 정면 쪽으로 이만큼 더 물러선 곳에서 길이 끝난다(충돌 원과 겹치지 않게)
  stallFront: 1.7, // 노점 정면으로 이만큼 나온 곳
  shredderFront: 1.85, // 파쇄기 정면으로 이만큼 나온 곳
  bushRadius: 0.6, // 충돌은 없지만 길이 덤불 위로 지나지 않게 피하는 덤불 반지름
  treeRadius: 0.4,
};

const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

// 점 목록을 지나는 Catmull-Rom 곡선(양 끝은 복제). 돌려주는 값: 점 배열.
export function catmullRom(waypoints, perSegment = PATH_STYLE.perSegment) {
  if (waypoints.length < 3) {
    return waypoints.length === 2
      ? Array.from({ length: perSegment + 1 }, (_, i) => ({ x: waypoints[0].x + ((waypoints[1].x - waypoints[0].x) * i) / perSegment, z: waypoints[0].z + ((waypoints[1].z - waypoints[0].z) * i) / perSegment }))
      : waypoints.map((p) => ({ ...p }));
  }
  const out = [];
  const n = waypoints.length;
  for (let s = 0; s < n - 1; s++) {
    const p0 = waypoints[Math.max(0, s - 1)];
    const p1 = waypoints[s];
    const p2 = waypoints[s + 1];
    const p3 = waypoints[Math.min(n - 1, s + 2)];
    for (let i = 0; i < perSegment; i++) {
      const t = i / perSegment;
      const t2 = t * t;
      const t3 = t2 * t;
      const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push({ x: f(p0.x, p1.x, p2.x, p3.x), z: f(p0.z, p1.z, p2.z, p3.z) });
    }
  }
  out.push({ ...waypoints[n - 1] });
  return out;
}

export function polylineLength(points) {
  let len = 0;
  for (let i = 1; i < points.length; i++) len += dist(points[i - 1], points[i]);
  return len;
}

// 중심선을 일정 간격(spacing)으로 다시 뽑는다. 각 점: { x, z, tx, tz(진행 방향 단위벡터), s(시작에서 잰 거리) }. from~to(거리) 구간만.
export function resample(points, spacing, from = 0, to = Infinity) {
  const total = polylineLength(points);
  const end = Math.min(to, total);
  const out = [];
  let seg = 0;
  let segStart = 0;
  for (let s = from; s <= end + 1e-9; s += spacing) {
    while (seg < points.length - 2 && segStart + dist(points[seg], points[seg + 1]) < s) { segStart += dist(points[seg], points[seg + 1]); seg++; }
    const a = points[seg];
    const b = points[seg + 1];
    const len = dist(a, b) || 1;
    const k = Math.min(1, Math.max(0, (s - segStart) / len));
    out.push({ x: a.x + (b.x - a.x) * k, z: a.z + (b.z - a.z) * k, tx: (b.x - a.x) / len, tz: (b.z - a.z) / len, s });
  }
  return out;
}

// 점들이 장애물 원(x, z, radius)에서 떨어진 최소 거리(가장자리 기준. 음수면 원 안).
export function minClearance(points, obstacles) {
  let min = Infinity;
  for (const p of points) for (const o of obstacles) min = Math.min(min, Math.hypot(p.x - o.x, p.z - o.z) - o.radius);
  return min;
}

// start 에서 end 까지 장애물을 피해 완만히 휘어 가는 길. 처음에 살짝 휜 곡선으로 시작해, 장애물에 걸리는 가장 심한 표본을 바깥으로 비켜 세우는 경유점을 더해 가며 다듬는다.
// 돌려주는 값: { waypoints, points(곡선 표본), clearance(가장자리 기준 최소 여유: margin 이상이면 성공), ok }.
export function routePath(start, end, obstacles, { margin = PATH_STYLE.clearance, bow = PATH_STYLE.bow, bowSign = 1, perSegment = PATH_STYLE.perSegment, maxIter = 60 } = {}) {
  const len = dist(start, end) || 1;
  const nx = -(end.z - start.z) / len;
  const nz = (end.x - start.x) / len;
  const mid = { x: (start.x + end.x) / 2 + nx * len * bow * bowSign, z: (start.z + end.z) / 2 + nz * len * bow * bowSign };
  const waypoints = [{ ...start }, mid, { ...end }];
  let points = catmullRom(waypoints, perSegment);
  const worst = (pts) => {
    let best = null;
    pts.forEach((p, i) => {
      for (const o of obstacles) {
        const c = Math.hypot(p.x - o.x, p.z - o.z) - o.radius - margin;
        if (c < 0 && (!best || c < best.c)) best = { c, i, o, p };
      }
    });
    return best;
  };
  for (let iter = 0; iter < maxIter; iter++) {
    const w = worst(points);
    if (!w) break;
    // 걸린 표본이 속한 구간(경유점 s -> s+1)에 경유점을 더한다. 장애물 중심에서 표본 쪽으로 (반지름 + 여유 + 조금) 만큼 떨어진 자리.
    const seg = Math.min(waypoints.length - 2, Math.floor(w.i / perSegment));
    let vx = w.p.x - w.o.x;
    let vz = w.p.z - w.o.z;
    const vl = Math.hypot(vx, vz);
    if (vl < 1e-6) { vx = nx; vz = nz; } else { vx /= vl; vz /= vl; }
    const push = { x: w.o.x + vx * (w.o.radius + margin + 0.3), z: w.o.z + vz * (w.o.radius + margin + 0.3) };
    // 이미 가까운 경유점(양 끝 제외)이 있으면 그 점을 옮기고, 아니면 새 점을 끼운다.
    const nearIdx = waypoints.findIndex((q, k) => k > 0 && k < waypoints.length - 1 && dist(q, w.p) < 0.9);
    if (nearIdx > 0) waypoints[nearIdx] = push;
    else waypoints.splice(seg + 1, 0, push);
    points = catmullRom(waypoints, perSegment);
  }
  const clearance = minClearance(points, obstacles) - margin;
  return { waypoints, points, clearance, ok: clearance >= 0 };
}

// 길을 막는 것들(장애물 원): 마당 장애물 + 소각로 + 충돌은 없지만 길 위에 서지 않게 피하는 덤불·나무.
export function routingObstacles(layout) {
  return [
    { x: FURNACE.x, z: FURNACE.z, radius: FURNACE.radius },
    ...layout.obstacles,
    ...(layout.bushes ?? []).map((b) => ({ x: b.x, z: b.z, radius: PATH_STYLE.bushRadius })),
    ...layout.trees.filter((t) => Math.abs(t.x) < YARD.width / 2 && Math.abs(t.z) < YARD.depth / 2).map((t) => ({ x: t.x, z: t.z, radius: PATH_STYLE.treeRadius })),
  ];
}

// 캠프파이어 입구: 통나무 고리의 틈 가운데 스폰 쪽을 향한 틈을 골라 그 가운데(틈 끝에서 30도 이상 안쪽)로 들어간다.
export function fireEntry(layout, hub = SPAWN) {
  const seats = layout.interactables.filter((i) => i.kind === 'seat' && Math.hypot(i.x - FURNACE.x, i.z - FURNACE.z) < 6);
  const toHub = Math.atan2(hub.z - FURNACE.z, hub.x - FURNACE.x);
  const TAU = Math.PI * 2;
  const norm = (a) => ((a % TAU) + TAU) % TAU;
  let angle = toHub;
  if (seats.length >= 2) {
    const angles = seats.map((s) => norm(Math.atan2(s.z - FURNACE.z, s.x - FURNACE.x))).sort((a, b) => a - b);
    const want = norm(toHub);
    for (let i = 0; i < angles.length; i++) {
      const lo = angles[i];
      const hi = i + 1 < angles.length ? angles[i + 1] : angles[0] + TAU;
      const w = norm(want - lo);
      if (w <= hi - lo) { // 스폰 방향이 이 틈 안에 있다
        const pad = Math.min((30 * Math.PI) / 180, (hi - lo) / 3);
        angle = lo + Math.min(Math.max(w, pad), hi - lo - pad);
        break;
      }
    }
  }
  return { x: FURNACE.x + Math.cos(angle) * PATH_STYLE.fireRadius, z: FURNACE.z + Math.sin(angle) * PATH_STYLE.fireRadius, angle };
}

// 도착 지점(배치 데이터에서 계산): 문 앞 걸어가는 자리, 노점·파쇄기 정면 자리, 캠프파이어 입구.
export function destinations(layout) {
  const door = (id) => {
    const f = buildingFacade(id);
    return { x: f.door.x + f.front.x * 1.5, z: f.door.z + f.front.z * 1.5 };
  };
  const front = (o, d) => ({ x: o.x + Math.sin(o.rotY) * d, z: o.z + Math.cos(o.rotY) * d });
  return [
    { id: 'fire', label: '캠프파이어', end: fireEntry(layout), plaza: false },
    { id: 'interview', label: BUILDING_NAMES.interview, end: door('interview'), plaza: true },
    { id: 'laundry', label: BUILDING_NAMES.laundry, end: door('laundry'), plaza: true },
    { id: 'fortune', label: BUILDING_NAMES.fortune, end: front(layout.stall, PATH_STYLE.stallFront), plaza: false },
    { id: 'shredder', label: '파쇄기', end: front(layout.shredder, PATH_STYLE.shredderFront), plaza: false },
  ];
}

// 전체 계획: { hub, paths:[{ id, label, end, points(중심선), length, heading(허브에서 처음 구간 방향, 라디안: atan2(dz, dx)), plaza }], signpost:{ x, z, boards:[{ id, label, heading }] }, obstacles }.
export function buildPathPlan(layout, hub = SPAWN) {
  const obstacles = routingObstacles(layout);
  const paths = destinations(layout).map((d, k) => {
    // 곡선 방향이 번갈도록 하고, 걸리면 반대 방향도 시도해 더 여유 있는 쪽을 쓴다.
    const tries = [1, -1].map((sign) => routePath(hub, d.end, obstacles, { bowSign: k % 2 ? sign : -sign }));
    const best = tries.find((t) => t.ok) ?? tries.sort((a, b) => b.clearance - a.clearance)[0];
    const lead = resample(best.points, 0.5, 2.0, 2.0)[0] ?? best.points[best.points.length - 1];
    return { id: d.id, label: d.label, end: d.end, points: best.points, length: polylineLength(best.points), heading: Math.atan2(lead.z - hub.z, lead.x - hub.x), plaza: d.plaza, ok: best.ok, clearance: best.clearance };
  });
  // 이정표 자리: 길 방향 사이의 틈 가운데 중 "카메라 반대쪽(북서)"에 가장 가까운 틈(플레이어를 가리지 않게), 허브에서 2.0 떨어진 곳.
  const TAU = Math.PI * 2;
  const norm = (a) => ((a % TAU) + TAU) % TAU;
  const heads = paths.map((p) => norm(p.heading)).sort((a, b) => a - b);
  const prefer = norm(Math.atan2(-1, -1));
  let best = { angle: prefer, score: -Infinity };
  heads.forEach((h, i) => {
    const next = i + 1 < heads.length ? heads[i + 1] : heads[0] + TAU;
    const gap = next - h;
    if (gap < (50 * Math.PI) / 180) return;
    const centre = h + gap / 2;
    const off = Math.abs(((centre - prefer + Math.PI * 3) % TAU) - Math.PI);
    const score = -off + gap * 0.3;
    if (score > best.score) best = { angle: centre, score };
  });
  const signpost = {
    x: hub.x + Math.cos(best.angle) * 2.0, z: hub.z + Math.sin(best.angle) * 2.0,
    boards: paths.map((p) => ({ id: p.id, label: p.label, heading: p.heading })),
  };
  return { hub: { x: hub.x, z: hub.z }, paths, signpost, obstacles };
}
