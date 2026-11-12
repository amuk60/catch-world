// 마당 장식 배치 계산 (순수 데이터). 좌표는 지면(x,z) 월드 단위, y=0.
// 구역(+x = 동쪽): 서쪽 숲+소각로 (x <= ZONES.forestMaxX), 가운데 완충 잔디밭, 동쪽 도시 광장 (x >= ZONES.cityMinX).
import { YARD, FURNACE, PLAYER, SPAWN, ZONES } from '../config.js';
import { mulberry32, rand, pick } from './rng.js';
import { headingY } from './movement.js';

const DEFAULT_PARAMS = { ringTrees: 40, bandTrees: 30, interiorTrees: 8, bushes: 6, rocks: 3 };

// 도시 구역 데이터. 건물 모델은 이후 단계에서 슬롯 위에 올린다.
const PLAZA = { x1: 2.5, x2: 12, z1: -12, z2: 12 };
const BUILDING_SLOTS = [
  { id: 'interview', x: 8.5, z: -5.5, width: 6, depth: 6 },
  { id: 'laundry', x: 8.5, z: 5.5, width: 6, depth: 6 },
];

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
const FOREST_INNER_MAX_X = ZONES.forestMaxX - 1; // 숲 내부 장식 x 상한(-2.5): 완충 구역과 여유를 둔다.

// 간판: 소각로 북쪽(-z). 기본 카메라(+x,+z 쪽)를 비스듬히 향한다.
const SIGN_KEEP_OUT = 2.8; // 숲 내부 장식과의 최소 거리
const SIGN_OBSTACLE_RADIUS = 0.7; // 간판 충돌 원 반경(가운데 + 양 끝 3개)

// 위로 문구 오브젝트(구역마다 1개). 위치는 고정이다. messageIndex 는 COMFORT_MESSAGES 의 순서이고,
// kind 가 'fortune' 인 작은 푯말은 문구 대신 포춘쿠키를 연다.
const COMFORT_RADIUS = 0.5;
const COMFORT_KEEP_OUT = 2.0; // 숲 내부 장식과의 최소 거리
const INTERACT_MARGIN = 0.8; // 반경 + 플레이어 반경 위에 더하는 상호작용 여유
const COMFORT_OBJECTS = [
  { name: 'stump_roundDetailed', label: '쉬어가는 그루터기', kind: 'comfort', messageIndex: 0, x: -9.0, z: 5.0, scale: 3.5, rotY: 0.6 },
  { name: 'sign', label: '작은 푯말', kind: 'fortune', x: 0.8, z: -6.5, scale: 3.4, rotY: Math.PI / 4 },
  { name: 'statue_head', label: '조용한 조각상', kind: 'comfort', messageIndex: 2, x: 6.0, z: 9.0, scale: 1.3, rotY: Math.PI / 4 },
];

// 소각로 곁 벤치 2개(소각로를 사이에 두고 마주 본다). Kenney furniture 'bench' 원본은 폭 0.4 x 깊이 0.2 x 높이 0.47 이고
// 원점이 모서리라서 중심이 로컬 (0.2, -0.1) 이다. 앉는 면 높이는 0.24, 등받이는 로컬 -z 쪽이라 +z 가 앞이다.
const BENCH = { scale: 3.6, radius: 0.7, distance: 3.2, seatTop: 0.24, center: { x: 0.2, z: -0.1 } };
const BENCH_KEEP_OUT = 2.0; // 숲 내부 장식과의 최소 거리
const BENCH_CLEARANCE = 1.7; // 통나무·간판과의 선호 최소 거리(규칙은 1.5)
// 카메라(+x,+z 쪽)에서 볼 때 소각로 양옆이 되는 방향(각도: atan2(z, x)).
const BENCH_PREFERRED_ANGLE = -Math.PI / 4;

// 소각로 곁 상시 소품. 파쇄기와 종이 더미는 모든 배치(벤치·통나무·나무·덤불·바위·간판·위로 오브젝트)가 끝난 뒤에,
// 선호 방향(소각로에서 atan2(z, x))과 선호 거리 순서로 훑어 PROP_CLEARANCE 이상 떨어진 첫 자리를 쓴다(없으면 가장 여유 있는 자리).
// 기존 배치의 난수 흐름을 건드리지 않아 벤치·통나무·나무는 그대로다. 선호 방향은 기본 카메라(+x,+z 쪽)에서 볼 때 캐릭터가 서는 대각선 양옆이다.
const SHREDDER = { radius: 0.7, angle: (5 * Math.PI) / 180, distances: [3.1, 3.2, 3.0, 2.9, 2.8, 2.7, 2.6] };
const PAPER_STACK = { radius: 0.5, angle: (85 * Math.PI) / 180, distances: [2.3, 2.4, 2.2, 2.1] };
const PROP_CLEARANCE = 1.5; // 다른 배치물과의 최소 거리(중심 사이)
const PROP_ANGLE_STEP = Math.PI / 36; // 5도

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
  for (let i = 0; i < 2; i++) {
    const a = rand(rng, 0, Math.PI * 2);
    const r = rand(rng, 2.0, 2.4);
    furnaceItems.push(nature('log', FURNACE.x + Math.cos(a) * r, FURNACE.z + Math.sin(a) * r, 2.5, rand(rng, 0, Math.PI * 2)));
  }

  // 랜턴: 광장 서쪽 가장자리.
  const lanterns = [];
  for (const z of [-6, -2, 2, 6]) {
    lanterns.push({ pack: 'fantasy', name: 'lantern', x: 3.2, z, scale: 1.0, rotY: 0 });
    obstacles.push({ x: 3.2, z, radius: 0.3 });
  }

  // 간판 (SIGN_KEEP_OUT 만큼 숲 내부 장식을 비운다). 충돌 원은 판의 로컬 x축을 따라 가운데와 양 끝에 둔다.
  const sign = {
    x: FURNACE.x, z: FURNACE.z - 4.3, rotY: Math.PI / 4, width: 3.2, height: 1.2, text: 'Catch World', obstacleRadius: SIGN_OBSTACLE_RADIUS,
  };
  for (const a of [0, -(sign.width / 2 - 0.4), sign.width / 2 - 0.4]) {
    obstacles.push({ x: sign.x + a * Math.cos(sign.rotY), z: sign.z - a * Math.sin(sign.rotY), radius: sign.obstacleRadius });
  }
  // 벤치 위치: 선호 방향에서 가까운 순서로 훑어 통나무·간판에서 충분히 떨어진 첫 각도를 쓴다(없으면 가장 여유 있는 각도).
  const benchSpots = (angle) => [angle, angle + Math.PI].map((a) => ({ x: FURNACE.x + Math.cos(a) * BENCH.distance, z: FURNACE.z + Math.sin(a) * BENCH.distance }));
  const signCircles = obstacles.filter((o) => o.radius === sign.obstacleRadius);
  const benchClearance = (angle) => Math.min(...benchSpots(angle).flatMap((s) => [
    ...furnaceItems.slice(1).map((it) => Math.hypot(s.x - it.x, s.z - it.z)),
    ...signCircles.map((o) => Math.hypot(s.x - o.x, s.z - o.z) - o.radius),
  ]));
  let benchAngle = BENCH_PREFERRED_ANGLE;
  for (let k = 0, best = -Infinity; k <= 36; k++) {
    const angle = BENCH_PREFERRED_ANGLE + Math.ceil(k / 2) * (Math.PI / 36) * (k % 2 ? 1 : -1); // 5도 간격, 0, +5, -5, +10, ...
    const clearance = benchClearance(angle);
    if (clearance >= BENCH_CLEARANCE) { benchAngle = angle; break; }
    if (clearance > best) { best = clearance; benchAngle = angle; }
  }

  // 상호작용 대상: 소각로(이미 만들어진 모델) + 위로 오브젝트 3개 + 벤치 2개. 위로 오브젝트와 벤치는 충돌 원도 둔다.
  const interactables = [{
    id: 'furnace', label: '소각로', kind: 'furnace', x: FURNACE.x, z: FURNACE.z, radius: FURNACE.radius,
    interactRange: FURNACE.radius + PLAYER.radius + INTERACT_MARGIN,
  }];
  COMFORT_OBJECTS.forEach((c, index) => {
    interactables.push({
      id: `comfort-${index}`, label: c.label, kind: c.kind, ...(c.messageIndex === undefined ? {} : { messageIndex: c.messageIndex }),
      x: c.x, z: c.z, radius: COMFORT_RADIUS,
      interactRange: COMFORT_RADIUS + PLAYER.radius + INTERACT_MARGIN,
      item: nature(c.name, c.x, c.z, c.scale, c.rotY),
    });
    obstacles.push({ x: c.x, z: c.z, radius: COMFORT_RADIUS });
  });
  benchSpots(benchAngle).forEach((s, index) => {
    const rotY = headingY(s, FURNACE); // 소각로를 바라본다(+z 가 앞).
    const lx = BENCH.center.x * BENCH.scale;
    const lz = BENCH.center.z * BENCH.scale;
    interactables.push({
      id: `seat-${index}`, label: '벤치', kind: 'seat', x: s.x, z: s.z, radius: BENCH.radius,
      interactRange: BENCH.radius + PLAYER.radius + INTERACT_MARGIN,
      seat: { x: s.x, z: s.z, rotY, y: BENCH.seatTop * BENCH.scale },
      // 모델 원점은 모서리이므로 중심이 (s.x, s.z) 에 오도록 원점을 옮긴다.
      item: { pack: 'furniture', name: 'bench', x: s.x - (lx * Math.cos(rotY) + lz * Math.sin(rotY)), z: s.z - (-lx * Math.sin(rotY) + lz * Math.cos(rotY)), scale: BENCH.scale, rotY },
    });
    obstacles.push({ x: s.x, z: s.z, radius: BENCH.radius });
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
        if (interactables.some((o) => o.kind !== 'furnace' && Math.hypot(x - o.x, z - o.z) < (o.kind === 'seat' ? BENCH_KEEP_OUT : COMFORT_KEEP_OUT))) continue;
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
    smin: 1.9, smax: 2.5, xmin: -11, obstacleRadius: 0.4, minFurnace: 4.5, minSpawn: 2.5, gap: 2.2, into: trees,
  });
  const bushes = [];
  scatterForest({ count: params.bushes, names: BUSHES, smin: 2.6, smax: 3.2, xmin: -walk, minFurnace: 3.2, gap: 1.2, into: bushes });
  const rocks = [];
  scatterForest({ count: params.rocks, names: SMALL_ROCKS, smin: 2.5, smax: 3, xmin: -walk, obstacleRadius: 0.4, minFurnace: 3.2, gap: 1.2, into: rocks });

  // 파쇄기와 종이 더미. 앞서 놓은 것이 뒤의 것의 장애물이 된다.
  const fixed = [
    ...interactables.filter((i) => i.kind !== 'furnace'), ...furnaceItems.slice(1), ...trees, ...bushes, ...rocks, ...signCircles,
  ];
  function placeProp(spec, others) {
    let best = null;
    let bestClearance = -Infinity;
    for (let k = 0; k <= 72 && bestClearance < 0; k++) {
      const angle = spec.angle + Math.ceil(k / 2) * PROP_ANGLE_STEP * (k % 2 ? 1 : -1); // 0, +5, -5, +10, ... 도
      for (const dist of spec.distances) {
        const p = { x: FURNACE.x + Math.cos(angle) * dist, z: FURNACE.z + Math.sin(angle) * dist };
        const clearance = Math.min(
          ...[...fixed, ...others].map((o) => Math.hypot(p.x - o.x, p.z - o.z) - PROP_CLEARANCE),
          Math.hypot(p.x - SPAWN.x, p.z - SPAWN.z) - (spec.radius + PLAYER.radius),
          walk - Math.abs(p.x), walkZ - Math.abs(p.z), ZONES.forestMaxX - p.x,
        );
        if (clearance > bestClearance) { bestClearance = clearance; best = p; }
        if (clearance >= 0) break;
      }
    }
    return { x: best.x, z: best.z, rotY: headingY(best, FURNACE), radius: spec.radius };
  }
  const shredder = placeProp(SHREDDER, []);
  const paperStack = placeProp(PAPER_STACK, [shredder]);
  obstacles.push({ x: shredder.x, z: shredder.z, radius: shredder.radius }, { x: paperStack.x, z: paperStack.z, radius: paperStack.radius });

  return {
    trees, bushes, rocks, lanterns, furnaceItems, sign, interactables, shredder, paperStack,
    buildingSlots: BUILDING_SLOTS.map((s) => ({ ...s })), plaza: { ...PLAZA }, obstacles,
  };
}
