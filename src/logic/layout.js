// 마당 장식 배치 계산 (순수 데이터). 좌표는 지면(x,z) 월드 단위, y=0.
// 구역(+x = 동쪽): 서쪽 숲+소각로 (x <= ZONES.forestMaxX), 가운데 완충 잔디밭, 동쪽 도시 광장 (x >= ZONES.cityMinX).
import { YARD, FURNACE, PLAYER, SPAWN, ZONES } from '../config.js';
import { mulberry32, rand, pick } from './rng.js';

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

// 위로 문구 오브젝트(구역마다 1개). 위치는 고정이고 messageIndex 는 COMFORT_MESSAGES 의 순서다.
const COMFORT_RADIUS = 0.5;
const COMFORT_KEEP_OUT = 2.0; // 숲 내부 장식과의 최소 거리
const INTERACT_MARGIN = 0.8; // 반경 + 플레이어 반경 위에 더하는 상호작용 여유
const COMFORT_OBJECTS = [
  { name: 'stump_roundDetailed', label: '쉬어가는 그루터기', x: -9.0, z: 5.0, scale: 3.5, rotY: 0.6 },
  { name: 'sign', label: '작은 푯말', x: 0.8, z: -6.5, scale: 3.4, rotY: Math.PI / 4 },
  { name: 'statue_head', label: '조용한 조각상', x: 6.0, z: 9.0, scale: 1.3, rotY: Math.PI / 4 },
];

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
  // 상호작용 대상: 소각로(이미 만들어진 모델) + 위로 오브젝트 3개. 위로 오브젝트는 충돌 원도 둔다.
  const interactables = [{
    id: 'furnace', label: '소각로', kind: 'furnace', x: FURNACE.x, z: FURNACE.z, radius: FURNACE.radius,
    interactRange: FURNACE.radius + PLAYER.radius + INTERACT_MARGIN,
  }];
  COMFORT_OBJECTS.forEach((c, messageIndex) => {
    interactables.push({
      id: `comfort-${messageIndex}`, label: c.label, kind: 'comfort', messageIndex, x: c.x, z: c.z, radius: COMFORT_RADIUS,
      interactRange: COMFORT_RADIUS + PLAYER.radius + INTERACT_MARGIN,
      item: nature(c.name, c.x, c.z, c.scale, c.rotY),
    });
    obstacles.push({ x: c.x, z: c.z, radius: COMFORT_RADIUS });
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
        if (interactables.some((o) => o.kind === 'comfort' && Math.hypot(x - o.x, z - o.z) < COMFORT_KEEP_OUT)) continue;
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

  return {
    trees, bushes, rocks, lanterns, furnaceItems, sign, interactables,
    buildingSlots: BUILDING_SLOTS.map((s) => ({ ...s })), plaza: { ...PLAZA }, obstacles,
  };
}
