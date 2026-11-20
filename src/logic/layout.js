// 마당 장식 배치 계산 (순수 데이터). 좌표는 지면(x,z) 월드 단위, y=0.
// 구역(+x = 동쪽): 서쪽 숲 (x <= ZONES.forestMaxX), 가운데 완충 잔디밭(소각로·스폰), 동쪽 도시 광장 (x >= ZONES.cityMinX).
// 랜드마크 배치(사용자 요청): 소각로(캠프파이어)가 가운데이고, 동쪽으로 포춘쿠키 상점(면접장 북서쪽 옆) · 조용한 조각상(면접장과 세탁소 사이) · 파쇄기(세탁소 남서쪽 옆)가 소각로를 중심으로 반원을 그리며 둘러선다.
import { YARD, FURNACE, PLAYER, SPAWN, ZONES } from '../config.js';
import { mulberry32, rand, pick } from './rng.js';
import { BUILDING_NAMES } from './signText.js';
import { headingY } from './movement.js';

const DEFAULT_PARAMS = { ringTrees: 40, bandTrees: 30, interiorTrees: 8, bushes: 6, rocks: 3 };

// 도시 구역 데이터. 건물 모델은 이후 단계에서 슬롯 위에 올린다.
export const PLAZA = { x1: 2.5, x2: 12, z1: -12, z2: 12 };
const BUILDING_SLOTS = [
  { id: 'interview', x: 8.5, z: -5.5, width: 6, depth: 6 },
  { id: 'laundry', x: 8.5, z: 5.5, width: 6, depth: 6 },
];

// 세탁소(작은 상가 외관. 세탁소 터 안, 중심에서 offsetX 만큼 동쪽으로 붙인다: 기본 카메라(남동쪽)에서 서쪽 앞마당의 플레이어를 건물이 덜 가리게). 정면(문 쪽)은 서쪽(-x) = 건물 로컬 +z 이고 rotY 가 그 방향이다(three.js rotation.y: 로컬 +z -> (sin, cos), 로컬 +x -> (cos, -sin)).
// width 는 정면 벽을 따른 길이(월드 z), depth 는 앞뒤 길이(월드 x). tile 은 옛 판벽 조각 배율(외관을 모델 없이 만드는 지금은 쓰지 않지만 데이터로 남긴다)이고 문은 정면 벽의 북쪽 끝 칸이다.
// 장애물 원은 벽 바깥선에서 OBSTACLE_INSET 안쪽을 따라 촘촘히 놓아 지나갈 수 없게 한다.
const LAUNDRY = { id: 'laundry', label: BUILDING_NAMES.laundry, tile: 1.8, width: 5.4, depth: 3.6, rotY: -Math.PI / 2, offsetX: 0.4, doorLocalX: -1.8, obstacleRadius: 0.65, inset: 0.3, spacing: 1.1, pickHeight: 3.5, height: 3.45 };
// 면접장(6층 회사 빌딩 외관): 세탁소와 같은 발자국·방향. 정면(문 쪽)도 서쪽이고 문은 정면 벽의 남쪽 끝 칸이라(doorLocalX 양수) 두 문이 광장 가운데를 사이에 두고 마주 보지 않고 멀리 떨어진다.
// height: 건물 전체 높이(옥상 난간 포함, 카메라 가림 판정용: 세탁소 = 상가 3.1 + 난간 0.35, 면접장 = 본체 8.7 + 간판 난간 0.95. buildingExterior.js 의 값과 맞춘다).
// 건물 외곽 원 반경은 세탁소(0.65)와 구별되는 값(0.66)이라 테스트와 장애물 집계가 두 건물을 따로 센다.
const INTERVIEW = { id: 'interview', label: BUILDING_NAMES.interview, tile: 1.8, width: 5.4, depth: 3.6, rotY: -Math.PI / 2, offsetX: 0.4, doorLocalX: 1.8, obstacleRadius: 0.66, inset: 0.3, spacing: 1.1, pickHeight: 9, height: 9.65 };
const BUILDING_DEFS = [LAUNDRY, INTERVIEW]; // 장애물·상호작용 순서(세탁소가 먼저: 기존 배치와 테스트의 순서를 지킨다)
// 건물 문(입구) 상호작용: 문 앞 DOOR_ITEM_DISTANCE 지점에 작은 원을 둔다. 세탁기·빨랫줄은 실내(logic/interiors.js)로 옮겼다.
// 마당으로 나왔을 때의 도착 지점은 문 앞 ARRIVAL_DISTANCE(상호작용 범위 밖이라 나오자마자 E 안내가 뜨지 않는다).
const DOOR_ITEM = { distance: 0.8, radius: 0.4, walkDistance: 1.5, arrivalDistance: 2.6 };

const FALL_TREES = [
  'tree_oak_fall', 'tree_default_fall', 'tree_detailed_fall', 'tree_fat_fall', 'tree_tall_fall',
  'tree_plateau_fall', 'tree_small_fall', 'tree_simple_fall', 'tree_thin_fall', 'tree_blocks_fall',
  'tree_cone_fall',
];
const PINES = ['tree_pineTallA', 'tree_pineTallB', 'tree_pineRoundA', 'tree_pineSmallA'];
const BUSHES = ['plant_bush', 'plant_bushLarge', 'plant_bushDetailed', 'plant_bushSmall'];
const SMALL_ROCKS = ['rock_smallA', 'rock_smallB', 'rock_smallC'];

const CITY_RING_KEEP = 0.35; // 도시 쪽(x > 2.5) 안쪽 고리 나무 유지 비율
const CITY_BAND_KEEP = 0.3; // 도시 쪽(x > 4) 바깥 띠 나무 유지 비율
const MAX_ATTEMPTS = 200;
const FOREST_INNER_MAX_X = ZONES.forestMaxX - 1; // 숲 내부 장식 x 상한(-4.5): 완충 구역(소각로 잔디밭)과 여유를 둔다.
// 소각로 둘레 빈 풀밭: 숲 내부 나무는 소각로 중심에서 FIRE_CLEAR.tree, 덤불·바위는 FIRE_CLEAR.other 이상 떨어진다(통나무 고리 반지름 3.4 + 여유).
const FIRE_CLEAR = { tree: 5.6, other: 4.6 };

// 간판: 소각로 북쪽(-z). 기본 카메라(+x,+z 쪽)를 비스듬히 향한다(소각로를 따라 움직인다).
const SIGN_KEEP_OUT = 2.8; // 숲 내부 장식과의 최소 거리
const SIGN_OBSTACLE_RADIUS = 0.7; // 간판 충돌 원 반경(가운데 + 양 끝 3개)

// 위로 문구 오브젝트(구역마다 1개). 위치는 고정이다. messageIndex 는 COMFORT_MESSAGES 의 순서이고,
// kind 가 'fortune' 인 행운의 쿠키 노점(모델 대신 src/fortuneStall.js 가 만든다)은 문구 대신 포춘쿠키를 연다.
// 노점은 로컬 x축을 따라 가로 2.0, 앞(+z)이 기본 카메라 쪽이다. 충돌은 계산대 가운데(위로 오브젝트 원)와 양 끝 원 2개.
const COMFORT_RADIUS = 0.5;
const COMFORT_KEEP_OUT = 2.0; // 숲 내부 장식과의 최소 거리
// 상점·조각상 자리: 소각로에서 약 11 떨어진 반원 위(상점은 면접장 북서쪽 앞마당, 조각상은 면접장과 세탁소 사이 골목 가운데). 상점 정면(로컬 +z)은 남쪽(스폰·기본 카메라 쪽)이다.
const STALL = { width: 2.0, depth: 0.9, endOffset: 0.8, endRadius: 0.55, interactRange: 2.3 }; // 쿠키 노점 크기·양 끝 충돌 원
const INTERACT_MARGIN = 0.8; // 반경 + 플레이어 반경 위에 더하는 상호작용 여유
const COMFORT_OBJECTS = [
  { name: 'stump_roundDetailed', label: '쉬어가는 그루터기', kind: 'comfort', messageIndex: 0, x: -9.0, z: 5.0, scale: 3.5, rotY: 0.6 },
  { stall: true, label: BUILDING_NAMES.fortune, kind: 'fortune', x: 4.6, z: -9.2, rotY: 0 },
  { name: 'statue_head', label: '조용한 조각상', kind: 'comfort', messageIndex: 2, x: 8.8, z: 0, scale: 1.3, rotY: -Math.PI / 2 }, // 얼굴이 서쪽(소각로·광장 쪽)
];

// 소각로 곁 통나무 자리 6개: 소각로를 둘러싼 고리(반지름 3.0~3.4)에 눕힌 통나무(Nature Kit log_large: 길이 1.0 x 높이 0.417 x 너비 ~0.55, 길이 방향이 로컬 x, 원점은 중심 아래)를 접선 방향으로 놓는다.
// 기준 각도(소각로에서 atan2(z, x), 도)는 걸어 들어갈 틈 두 곳을 비워 둔다: 스폰(약 64도)·파쇄기(약 54도) 쪽 틈(358~112도)과 간판(-90도) 쪽 틈(226~322도). 각도·반지름·크기·접선 기울기는 시드로 조금씩 흔들되 시드 흐름은 따로 쓴다(마당의 나무·덤불·바위 배치는 그대로).
// 앉는 높이는 통나무 위(높이 x seatTopRatio), 일어서는 자리는 고리 바깥쪽이다.
const LOG_SEAT = {
  model: 'log_large', length: 1.0, height: 0.4167, label: '통나무 의자',
  anglesDeg: [322, 358, 112, 150, 188, 226], angleJitterDeg: 4, radius: [3.0, 3.4], scale: [1.5, 1.8], tiltJitter: 0.12,
  seatTopRatio: 0.92, pickRadius: 0.8, obstacleRadius: 0.5, standDistance: 1.1,
};
const LOG_SEAT_KEEP = { tree: 1.6, other: 1.4 }; // 통나무 중심과 나무·덤불·바위 사이 최소 거리(안 되면 각도를 비켜 보고, 그래도 덤불·바위는 치운다)
// 예전(벤치 시절) 자리: 마당 나무·덤불·바위 배치의 난수 흐름이 바뀌지 않도록, 그 배치를 고를 때는 예전 벤치 자리를 그대로 피한다.
const BENCH = { distance: 3.2 };
const BENCH_KEEP_OUT = 2.0; // 숲 내부 장식과의 최소 거리
const BENCH_CLEARANCE = 1.7; // 통나무·간판과의 선호 최소 거리(규칙은 1.5)
// 카메라(+x,+z 쪽)에서 볼 때 소각로 양옆이 되는 방향(각도: atan2(z, x)).
const BENCH_PREFERRED_ANGLE = -Math.PI / 4;

// 파쇄기: 소각로와 따로, 소각로에서 약 11 떨어진 세탁소 남서쪽 옆 자리(상점·조각상과 함께 소각로를 둘러싼 반원의 남쪽 끝). 모든 배치(벤치·통나무·나무·덤불·바위·간판·위로 오브젝트)가 끝난 뒤에,
// 선호 방향(소각로에서 atan2(z, x), 남쪽이 +z)과 선호 거리 순서로 훑어, 파쇄기 자리와 그 앞 작업 자리(stand)가 모두 다른 배치물(가로등 포함)에서 PROP_CLEARANCE 이상, 건물 벽에서 PROP_BUILDING_GAP 이상 떨어진 첫 자리를 쓴다(없으면 가장 여유 있는 자리).
// 기존 배치의 난수 흐름을 건드리지 않아 벤치·통나무·나무는 그대로다. 정면(+z)은 스폰 쪽이고, 작업 자리는 정면으로 standDistance 만큼 나온 곳(투입구 바로 앞)이다. 조각 통은 정면 기준 왼쪽(-x)에 붙는다.
const SHREDDER = { radius: 0.7, angle: (54 * Math.PI) / 180, distances: [11.3, 10.9, 11.7, 10.5, 12.1], standDistance: 1.1 };
const PROP_BUILDING_GAP = 1.6; // 파쇄기·작업 자리 중심과 건물 벽 사이 최소 거리(건물에 붙지 않게)
const PROP_CLEARANCE = 1.5; // 다른 배치물과의 최소 거리(중심 사이)
const PROP_ANGLE_STEP = Math.PI / 36; // 5도

const LANTERNS = [[3.2, -6], [6.4, -1.9], [6.4, 1.9], [3.2, 6]]; // 랜턴 자리(x, z)

const nature = (name, x, z, scale, rotY) => ({ pack: 'nature', name, x, z, scale, rotY });

// 한 변이 2r인 정사각 둘레 위의 거리 d에 해당하는 점.
function squarePoint(d, r) {
  const s = 2 * r;
  if (d < s) return { x: -r + d, z: -r };
  if (d < 2 * s) return { x: r, z: -r + (d - s) };
  if (d < 3 * s) return { x: r - (d - 2 * s), z: r };
  return { x: -r, z: r - (d - 3 * s) };
}

const insidePlaza = (x, z) => x > PLAZA.x1 && x < PLAZA.x2 && z > PLAZA.z1 && z < PLAZA.z2;

// 건물 정면 계산(시드와 무관한 고정 자리). 건물 데이터, 문 위치, 정면(바깥) 방향, 문 앞 도착 지점(마당으로 나왔을 때). id: 'laundry' | 'interview'.
export function buildingFacade(id) {
  const def = BUILDING_DEFS.find((b) => b.id === id);
  if (!def) throw new Error(`알 수 없는 건물: ${id}`);
  const slot = BUILDING_SLOTS.find((b) => b.id === id);
  const centre = { x: slot.x + def.offsetX, z: slot.z };
  const toWorld = (lx, lz) => ({ // 건물 로컬 (lx: 정면 벽을 따라, lz: 앞쪽) -> 월드
    x: centre.x + lx * Math.cos(def.rotY) + lz * Math.sin(def.rotY),
    z: centre.z - lx * Math.sin(def.rotY) + lz * Math.cos(def.rotY),
  });
  const door = toWorld(def.doorLocalX, def.depth / 2);
  const front = { x: Math.sin(def.rotY), z: Math.cos(def.rotY) };
  const building = {
    id: def.id, label: def.label, x: centre.x, z: centre.z, rotY: def.rotY, width: def.width, depth: def.depth, tile: def.tile,
    door: { x: door.x, z: door.z }, doorLocalX: def.doorLocalX, obstacleRadius: def.obstacleRadius, height: def.height,
  };
  const arrival = { x: door.x + front.x * DOOR_ITEM.arrivalDistance, z: door.z + front.z * DOOR_ITEM.arrivalDistance, rotY: def.rotY }; // 건물을 등지고 선다
  return { centre, toWorld, door, front, building, arrival };
}

// 세탁소 정면(건물 문 위치·도착 지점 등).
export const laundryFacade = () => buildingFacade('laundry');

export function buildLayout(seed, params = DEFAULT_PARAMS) {
  const rng = mulberry32(seed);
  const walk = YARD.width / 2 - (PLAYER.radius + 0.5);
  const walkZ = YARD.depth / 2 - (PLAYER.radius + 0.5);
  const obstacles = [];
  const treeName = () => (rng() < 0.8 ? pick(rng, FALL_TREES) : pick(rng, PINES));

  // 경계 나무: 안쪽 고리(둘레에 고르게) + 바깥 띠(무작위 거리). 도시 쪽은 솎아내 열어 둔다.
  const trees = [];
  for (let i = 0; i < params.ringTrees; i++) {
    const r = rand(rng, 11.8, 13.5);
    const p = squarePoint(((i + rand(rng, -0.35, 0.35) + params.ringTrees) % params.ringTrees) / params.ringTrees * 8 * r, r);
    const tree = nature(treeName(), p.x, p.z, rand(rng, 1.8, 2.5), rand(rng, 0, Math.PI * 2));
    const keep = rng() < CITY_RING_KEEP; // 항상 뽑아 두어야 시드 흐름이 일정하다.
    if (p.x > ZONES.cityMinX && (!keep || insidePlaza(p.x, p.z))) continue;
    trees.push(tree);
  }
  for (let i = 0; i < params.bandTrees; i++) {
    const r = rand(rng, 14, 22);
    const p = squarePoint(rng() * 8 * r, r);
    const tree = nature(treeName(), p.x, p.z, rand(rng, 2.3, 3.2), rand(rng, 0, Math.PI * 2));
    const keep = rng() < CITY_BAND_KEEP;
    if (p.x > 4 && !keep) continue;
    trees.push(tree);
  }

  // 소각로 주변 (소각로 자체 장애물은 이동 코드에서 FURNACE로 처리).
  const furnaceItems = [nature('campfire_stones', FURNACE.x, FURNACE.z, 4.4, 0)];
  // 예전의 장식 나무토막 2개는 이제 통나무 자리가 대신하므로 놓지 않는다. 뒤의 배치 난수 흐름이 그대로이도록 항목당 3번 뽑는 것은 남기고, 벤치 자리 계산(아래 legacy)에만 쓴다.
  const legacyLogs = [];
  for (let i = 0; i < 2; i++) {
    const a = (i === 0 ? 185 + rand(rng, 0, 1) * 20 : 212 + rand(rng, 0, 1) * 16) * (Math.PI / 180);
    const r = rand(rng, 2.0, 2.4);
    legacyLogs.push({ x: FURNACE.x + Math.cos(a) * r, z: FURNACE.z + Math.sin(a) * r });
    rand(rng, 0, Math.PI * 2);
  }

  // 랜턴: 광장 서쪽 가장자리 2개 + 면접장과 세탁소 사이 골목 입구(조각상 앞) 양옆 2개. 스폰에서 건물 문·상점·파쇄기로 가는 길목은 비워 둔다.
  const lanterns = [];
  for (const [x, z] of LANTERNS) {
    lanterns.push({ pack: 'fantasy', name: 'lantern', x, z, scale: 1.0, rotY: 0 });
    obstacles.push({ x, z, radius: 0.3 });
  }

  // 간판 (SIGN_KEEP_OUT 만큼 숲 내부 장식을 비운다). 충돌 원은 판의 로컬 x축을 따라 가운데와 양 끝에 둔다.
  const sign = {
    x: FURNACE.x, z: FURNACE.z - 4.3, rotY: Math.PI / 4, width: 3.2, height: 1.2, text: 'Catch World', obstacleRadius: SIGN_OBSTACLE_RADIUS,
  };
  for (const a of [0, -(sign.width / 2 - 0.4), sign.width / 2 - 0.4]) {
    obstacles.push({ x: sign.x + a * Math.cos(sign.rotY), z: sign.z - a * Math.sin(sign.rotY), radius: sign.obstacleRadius });
  }
  // (예전) 벤치 위치: 선호 방향에서 가까운 순서로 훑어 통나무·간판에서 충분히 떨어진 첫 각도를 쓴다(없으면 가장 여유 있는 각도).
  const benchSpots = (angle) => [angle, angle + Math.PI].map((a) => ({ x: FURNACE.x + Math.cos(a) * BENCH.distance, z: FURNACE.z + Math.sin(a) * BENCH.distance }));
  const signCircles = obstacles.filter((o) => o.radius === sign.obstacleRadius);
  const benchClearance = (angle) => Math.min(...benchSpots(angle).flatMap((s) => [
    ...legacyLogs.map((it) => Math.hypot(s.x - it.x, s.z - it.z)),
    ...signCircles.map((o) => Math.hypot(s.x - o.x, s.z - o.z) - o.radius),
  ]));
  let benchAngle = BENCH_PREFERRED_ANGLE;
  for (let k = 0, best = -Infinity; k <= 36; k++) {
    const angle = BENCH_PREFERRED_ANGLE + Math.ceil(k / 2) * (Math.PI / 36) * (k % 2 ? 1 : -1); // 5도 간격, 0, +5, -5, +10, ...
    const clearance = benchClearance(angle);
    if (clearance >= BENCH_CLEARANCE) { benchAngle = angle; break; }
    if (clearance > best) { best = clearance; benchAngle = angle; }
  }

  // 상호작용 대상: 소각로(이미 만들어진 모델) + 위로 오브젝트 3개 + 통나무 자리 6개(아래, 마당 장식을 고른 뒤). 위로 오브젝트와 통나무는 충돌 원도 둔다.
  const interactables = [{
    id: 'furnace', label: '소각로', kind: 'furnace', x: FURNACE.x, z: FURNACE.z, radius: FURNACE.radius,
    interactRange: FURNACE.radius + PLAYER.radius + INTERACT_MARGIN,
  }];
  let stall = null;
  COMFORT_OBJECTS.forEach((c, index) => {
    interactables.push({
      id: `comfort-${index}`, label: c.label, kind: c.kind, ...(c.messageIndex === undefined ? {} : { messageIndex: c.messageIndex }),
      x: c.x, z: c.z, radius: COMFORT_RADIUS,
      interactRange: c.stall ? STALL.interactRange : COMFORT_RADIUS + PLAYER.radius + INTERACT_MARGIN,
      ...(c.stall ? { pickRadius: 1.1, pickHeight: 2.6 } : {}),
      ...(c.stall ? {} : { item: nature(c.name, c.x, c.z, c.scale, c.rotY) }),
    });
    obstacles.push({ x: c.x, z: c.z, radius: COMFORT_RADIUS });
    if (c.stall) {
      stall = { x: c.x, z: c.z, rotY: c.rotY, width: STALL.width, depth: STALL.depth };
      for (const a of [-STALL.endOffset, STALL.endOffset]) { // 계산대 양 끝(판의 로컬 x축 방향)
        obstacles.push({ x: c.x + a * Math.cos(c.rotY), z: c.z - a * Math.sin(c.rotY), radius: STALL.endRadius });
      }
    }
  });

  // 숲 구역 내부 장식: 거절 표집(항목당 최대 200회, 실패하면 건너뜀).
  const placed = []; // 이미 놓은 숲 내부 항목(간격 유지용)
  function scatterForest({ count, names, smin, smax, xmin, obstacleRadius, minFurnace, minSpawn = 0, gap, into }) {
    for (let i = 0; i < count; i++) {
      for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
        const x = rand(rng, xmin, FOREST_INNER_MAX_X);
        const z = rand(rng, -walkZ, walkZ);
        if (Math.hypot(x - FURNACE.x, z - FURNACE.z) < minFurnace) continue;
        if (Math.hypot(x - SPAWN.x, z - SPAWN.z) < minSpawn) continue;
        if (Math.hypot(x - sign.x, z - sign.z) < SIGN_KEEP_OUT) continue;
        if (interactables.some((o) => o.kind !== 'furnace' && Math.hypot(x - o.x, z - o.z) < COMFORT_KEEP_OUT) || benchSpots(benchAngle).some((o) => Math.hypot(x - o.x, z - o.z) < BENCH_KEEP_OUT)) continue;
        if (placed.some((o) => Math.hypot(x - o.x, z - o.z) < gap)) continue;
        const item = nature(pick(rng, names), x, z, rand(rng, smin, smax), rand(rng, 0, Math.PI * 2));
        into.push(item);
        placed.push(item);
        if (obstacleRadius) obstacles.push({ x, z, radius: obstacleRadius });
        break;
      }
    }
  }

  scatterForest({
    count: params.interiorTrees, names: [...FALL_TREES, ...FALL_TREES, ...FALL_TREES, ...PINES],
    smin: 1.9, smax: 2.5, xmin: -11, obstacleRadius: 0.4, minFurnace: FIRE_CLEAR.tree, minSpawn: 2.5, gap: 2.2, into: trees,
  });
  const bushes = [];
  scatterForest({ count: params.bushes, names: BUSHES, smin: 2.6, smax: 3.2, xmin: -walk, minFurnace: FIRE_CLEAR.other, gap: 1.2, into: bushes });
  const rocks = [];
  scatterForest({ count: params.rocks, names: SMALL_ROCKS, smin: 2.5, smax: 3, xmin: -walk, obstacleRadius: 0.4, minFurnace: FIRE_CLEAR.other, gap: 1.2, into: rocks });

  // 통나무 자리 6개: 자기 시드 흐름(마당 배치와 따로). 나무·덤불·바위와 겹치면 각도를 비켜 보고, 그래도 안 되면 덤불·바위를 치운다.
  const logRng = mulberry32((seed ^ 0x5eed10c5) >>> 0);
  const logSeats = [];
  LOG_SEAT.anglesDeg.forEach((baseDeg, index) => {
    let spot = null;
    for (let k = 0; k <= 12 && !spot; k++) {
      const offset = Math.ceil(k / 2) * 3 * (k % 2 ? 1 : -1); // 0, +3, -3, +6, ... 도
      const a = ((baseDeg + offset + rand(logRng, -LOG_SEAT.angleJitterDeg, LOG_SEAT.angleJitterDeg)) * Math.PI) / 180;
      const r = rand(logRng, LOG_SEAT.radius[0], LOG_SEAT.radius[1]);
      const cand = { a, r, x: FURNACE.x + Math.cos(a) * r, z: FURNACE.z + Math.sin(a) * r, scale: rand(logRng, LOG_SEAT.scale[0], LOG_SEAT.scale[1]), tilt: rand(logRng, -LOG_SEAT.tiltJitter, LOG_SEAT.tiltJitter) };
      if (trees.every((t) => Math.hypot(cand.x - t.x, cand.z - t.z) >= LOG_SEAT_KEEP.tree) || k === 12) spot = cand;
    }
    const { a, x, z, scale, tilt } = spot;
    for (const list of [bushes, rocks]) {
      for (let i = list.length - 1; i >= 0; i--) if (Math.hypot(x - list[i].x, z - list[i].z) < LOG_SEAT_KEEP.other) {
        const [gone] = list.splice(i, 1);
        const oi = obstacles.findIndex((o) => o.x === gone.x && o.z === gone.z);
        if (oi >= 0) obstacles.splice(oi, 1);
      }
    }
    const rotY = headingY({ x, z }, FURNACE); // 소각로를 바라보고 앉는다(+z 가 앞)
    const itemRot = Math.atan2(-Math.cos(a), -Math.sin(a)) + tilt; // 로컬 x(길이 방향)가 고리의 접선이 되는 회전(+ 조금 기울임)
    const axis = { x: Math.cos(itemRot), z: -Math.sin(itemRot) }; // 월드에서 본 통나무 길이 방향
    const half = Math.max(0, (LOG_SEAT.length * scale) / 2 - LOG_SEAT.obstacleRadius);
    const seatY = LOG_SEAT.height * scale * LOG_SEAT.seatTopRatio;
    logSeats.push({ x, z, scale, rotY, itemRot, axis, half, seatY, index });
  });
  logSeats.forEach((l) => {
    interactables.push({
      id: `seat-${l.index}`, label: LOG_SEAT.label, kind: 'seat', x: l.x, z: l.z, radius: LOG_SEAT.pickRadius,
      interactRange: LOG_SEAT.pickRadius + PLAYER.radius + INTERACT_MARGIN,
      // stand: 일어서는 자리(고리 바깥쪽, 소각로 반대편)
      seat: { x: l.x, z: l.z, rotY: l.rotY, y: l.seatY, stand: { x: l.x - Math.sin(l.rotY) * LOG_SEAT.standDistance, z: l.z - Math.cos(l.rotY) * LOG_SEAT.standDistance } },
      item: nature(LOG_SEAT.model, l.x, l.z, l.scale, l.itemRot),
    });
    for (const sgn of [-1, 1]) obstacles.push({ x: l.x + l.axis.x * l.half * sgn, z: l.z + l.axis.z * l.half * sgn, radius: LOG_SEAT.obstacleRadius });
  });

  // 파쇄기(소각로와 따로 떨어진 자리) + 그 앞 작업 자리.
  const fixed = [
    ...interactables.filter((i) => i.kind !== 'furnace'), ...trees, ...bushes, ...rocks, ...signCircles, ...lanterns,
  ];
  // 건물 벽(발자국 직사각형)까지의 거리. 건물은 아직 장애물에 들어가기 전이라 정면 데이터로 계산한다.
  const facades = BUILDING_DEFS.map((def) => buildingFacade(def.id));
  const buildingGap = (p) => Math.min(...facades.map(({ centre, building: b }) => {
    const dx = p.x - centre.x;
    const dz = p.z - centre.z;
    const lx = dx * Math.cos(b.rotY) - dz * Math.sin(b.rotY); // 월드 -> 건물 로컬(정면 벽을 따라)
    const lz = dx * Math.sin(b.rotY) + dz * Math.cos(b.rotY); // 앞쪽
    return Math.hypot(Math.max(0, Math.abs(lx) - b.width / 2), Math.max(0, Math.abs(lz) - b.depth / 2));
  }));
  const inBounds = (p) => Math.min(walk - Math.abs(p.x), walkZ - Math.abs(p.z));
  function placeProp(spec) {
    let best = null;
    let bestClearance = -Infinity;
    for (let k = 0; k <= 72 && bestClearance < 0; k++) {
      const angle = spec.angle + Math.ceil(k / 2) * PROP_ANGLE_STEP * (k % 2 ? 1 : -1); // 0, +5, -5, +10, ... 도
      for (const dist of spec.distances) {
        const p = { x: FURNACE.x + Math.cos(angle) * dist, z: FURNACE.z + Math.sin(angle) * dist };
        const rotY = headingY(p, SPAWN); // 정면은 스폰 쪽
        const stand = { x: p.x + Math.sin(rotY) * spec.standDistance, z: p.z + Math.cos(rotY) * spec.standDistance, rotY: rotY + Math.PI };
        const clearance = Math.min(
          ...fixed.map((o) => Math.hypot(p.x - o.x, p.z - o.z) - PROP_CLEARANCE),
          ...fixed.map((o) => Math.hypot(stand.x - o.x, stand.z - o.z) - PROP_CLEARANCE + 0.3),
          Math.hypot(p.x - SPAWN.x, p.z - SPAWN.z) - 4,
          inBounds(p), inBounds(stand), buildingGap(p) - PROP_BUILDING_GAP, buildingGap(stand) - PROP_BUILDING_GAP,
        );
        if (clearance > bestClearance) { bestClearance = clearance; best = { p, rotY, stand }; }
        if (clearance >= 0) break;
      }
    }
    return { x: best.p.x, z: best.p.z, rotY: best.rotY, radius: spec.radius, stand: best.stand };
  }
  const shredder = placeProp(SHREDDER);
  obstacles.push({ x: shredder.x, z: shredder.z, radius: shredder.radius });

  // ---- 건물 외관(기존 배치·난수 흐름 뒤에 덧붙인다: 위의 모든 배치는 그대로다). 세탁·널기는 실내에서 하고, 면접도 실내에서 한다. ----
  // 세탁소 먼저, 면접장 다음 순서로 장애물·상호작용을 덧붙인다.
  const buildings = [];
  for (const def of BUILDING_DEFS) {
    const { centre, toWorld, door, front, building } = buildingFacade(def.id);
    buildings.push(building);
    // 외곽선(벽 바깥선에서 inset 안쪽 직사각형)을 따라 spacing 이하 간격의 원을 놓는다.
    const hw = def.width / 2 - def.inset;
    const hd = def.depth / 2 - def.inset;
    const corners = [[-hw, hd], [hw, hd], [hw, -hd], [-hw, -hd]];
    corners.forEach(([ax, az], i) => {
      const [bx, bz] = corners[(i + 1) % 4];
      const parts = Math.ceil(Math.hypot(bx - ax, bz - az) / def.spacing);
      for (let k = 0; k < parts; k++) {
        const p = toWorld(ax + ((bx - ax) * k) / parts, az + ((bz - az) * k) / parts);
        obstacles.push({ x: p.x, z: p.z, radius: def.obstacleRadius });
      }
    });
    // 건물 호버/클릭 판정: 터 중심의 큰 원. 클릭하면 문 앞 1.5 지점으로 걸어간다. E 동작은 없다(들어가기는 아래 문 대상).
    const hoverRadius = Math.min(def.width, def.depth) / 2 + 0.1;
    interactables.push({
      id: def.id, label: def.label, kind: 'building', x: centre.x, z: centre.z, radius: hoverRadius,
      interactRange: hoverRadius + PLAYER.radius + INTERACT_MARGIN, pickHeight: def.pickHeight,
      walkTo: { x: door.x + front.x * DOOR_ITEM.walkDistance, z: door.z + front.z * DOOR_ITEM.walkDistance },
    });
    // 건물 문: 문 앞에서 E 로 들어간다(kind door, to: 공간 id). 클릭하면 문 앞 1.5 지점까지 걸어가고 자동으로 들어가지는 않는다.
    interactables.push({
      id: `${def.id}-door`, label: `${def.label} 문`, kind: 'door', to: def.id,
      x: door.x + front.x * DOOR_ITEM.distance, z: door.z + front.z * DOOR_ITEM.distance, radius: DOOR_ITEM.radius,
      interactRange: DOOR_ITEM.radius + PLAYER.radius + INTERACT_MARGIN,
      walkTo: { x: door.x + front.x * DOOR_ITEM.walkDistance, z: door.z + front.z * DOOR_ITEM.walkDistance },
    });
  }

  return {
    trees, bushes, rocks, lanterns, furnaceItems, sign, stall, interactables, shredder,
    buildingSlots: BUILDING_SLOTS.map((b) => ({ ...b })), plaza: { ...PLAZA }, obstacles,
    buildings,
  };
}
