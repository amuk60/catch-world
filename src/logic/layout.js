// 마당 장식 배치 계산 (순수 데이터). 좌표는 지면(x,z) 월드 단위, y=0.
import { YARD, FURNACE, PLAYER } from '../config.js';
import { mulberry32, rand, pick } from './rng.js';

const DEFAULT_PARAMS = {
  innerTrees: 40, outerTrees: 50,
  rocks: 10, bushes: 14, flowers: 40, grass: 50, plants: 8,
};

const FALL_TREES = [
  'tree_oak_fall', 'tree_default_fall', 'tree_detailed_fall', 'tree_fat_fall', 'tree_tall_fall',
  'tree_plateau_fall', 'tree_small_fall', 'tree_simple_fall', 'tree_thin_fall', 'tree_blocks_fall',
  'tree_cone_fall',
];
const PINES = ['tree_pineTallA', 'tree_pineTallB', 'tree_pineRoundA', 'tree_pineSmallA'];
const letters = (prefix, ls) => [...ls].map((l) => prefix + l);
const BIG_ROCKS = [...letters('rock_large', 'ABCDEF'), ...letters('stone_large', 'ABCDEF')];
const POND_ROCKS = [...letters('rock_small', 'ABCDEF'), ...letters('rock_large', 'ABCDEF')];
const BUSHES = ['plant_bush', 'plant_bushLarge', 'plant_bushDetailed', 'plant_bushSmall'];
const FLOWERS = ['A', 'B', 'C'].flatMap((l) => ['red', 'yellow', 'purple'].map((c) => `flower_${c}${l}`));
const GRASS = ['grass', 'grass_large', 'grass_leafs'];
const PLANTS = ['mushroom_red', 'mushroom_tan', 'stump_old', 'stump_round', 'log', 'log_large'];

const SPAWN = { x: 0, z: 4 };
const nature = (name, x, z, scale, rotY) => ({ pack: 'nature', name, x, z, scale, rotY });

// 한 변이 2r인 정사각 둘레 위의 거리 d에 해당하는 점.
function squarePoint(d, r) {
  const s = 2 * r;
  if (d < s) return { x: -r + d, z: -r };
  if (d < 2 * s) return { x: r, z: -r + (d - s) };
  if (d < 3 * s) return { x: r - (d - 2 * s), z: r };
  return { x: -r, z: r - (d - 3 * s) };
}

export function buildLayout(seed, params = DEFAULT_PARAMS) {
  const rng = mulberry32(seed);
  const walk = YARD.width / 2 - (PLAYER.radius + 0.5);
  const walkZ = YARD.depth / 2 - (PLAYER.radius + 0.5);
  const obstacles = [];
  const pond = { x: 7.5, z: -1.5, radius: 3.2 };

  const treeName = () => (rng() < 0.8 ? pick(rng, FALL_TREES) : pick(rng, PINES));

  // 나무: 안쪽 고리(둘레에 고르게) + 바깥 띠(무작위 거리).
  const trees = [];
  for (let i = 0; i < params.innerTrees; i++) {
    const r = rand(rng, 11.8, 13.5);
    const p = squarePoint(((i + rand(rng, -0.35, 0.35) + params.innerTrees) % params.innerTrees) / params.innerTrees * 8 * r, r);
    trees.push(nature(treeName(), p.x, p.z, rand(rng, 2.4, 3.4), rand(rng, 0, Math.PI * 2)));
  }
  for (let i = 0; i < params.outerTrees; i++) {
    const r = rand(rng, 14, 22);
    const p = squarePoint(rng() * 8 * r, r);
    trees.push(nature(treeName(), p.x, p.z, rand(rng, 3.0, 4.2), rand(rng, 0, Math.PI * 2)));
  }

  // 길 타일.
  const pathTiles = [];
  for (let z = 11.4, i = 0; z >= -1.9 - 1e-9; i++, z = 11.4 - i * 1.3) {
    pathTiles.push(nature('path_stone', rand(rng, -0.12, 0.12), z, 2.5, rand(rng, -0.12, 0.12)));
  }

  // 랜턴과 오벨리스크.
  const lanterns = [];
  for (const x of [-2.1, 2.1]) {
    for (const z of [9, 5.5, 2]) {
      lanterns.push({ pack: 'fantasy', name: 'lantern', x, z, scale: 1.0, rotY: 0 });
      obstacles.push({ x, z, radius: 0.3 });
    }
  }
  const obelisks = [];
  for (const x of [-3.4, 3.4]) {
    obelisks.push(nature('statue_obelisk', x, 10, 3, 0));
    obstacles.push({ x, z: 10, radius: 0.5 });
  }
  const fixed = [...lanterns, ...obelisks];

  // 연못.
  obstacles.push({ ...pond });
  const pondLilies = [];
  for (let i = 0; i < 8; i++) {
    const a = rand(rng, 0, Math.PI * 2);
    const r = Math.sqrt(rng()) * pond.radius * 0.8;
    pondLilies.push(nature(pick(rng, ['lily_large', 'lily_small']),
      pond.x + Math.cos(a) * r, pond.z + Math.sin(a) * r, 3, rand(rng, 0, Math.PI * 2)));
  }
  const pondRocks = [];
  for (let i = 0; i < 10; i++) {
    const a = ((i + rand(rng, -0.3, 0.3)) / 10) * Math.PI * 2;
    const r = rand(rng, 3.4, 3.9);
    const x = pond.x + Math.cos(a) * r;
    const z = pond.z + Math.sin(a) * r;
    pondRocks.push(nature(pick(rng, POND_ROCKS), x, z, rand(rng, 2, 2.8), rand(rng, 0, Math.PI * 2)));
    obstacles.push({ x, z, radius: 0.4 });
  }

  // 소각로 주변 (소각로 자체 장애물은 이동 코드에서 FURNACE로 처리).
  const furnaceItems = [nature('campfire_stones', FURNACE.x, FURNACE.z, 3.2, 0)];
  for (const [name, scale] of [['log', 2.5], ['log', 2.5], ['log_stack', 2.5]]) {
    const a = rand(rng, 0, Math.PI * 2);
    const r = rand(rng, 1.6, 2.0);
    furnaceItems.push(nature(name, FURNACE.x + Math.cos(a) * r, FURNACE.z + Math.sin(a) * r, scale, rand(rng, 0, Math.PI * 2)));
  }

  // 내부 장식: 금지 구역을 피해 거절 표집(항목당 최대 200회).
  const blocked = (x, z) =>
    Math.hypot(x - FURNACE.x, z - FURNACE.z) < 3.2 ||
    Math.hypot(x - pond.x, z - pond.z) < pond.radius + 0.8 ||
    (Math.abs(x) < 1.8 && z >= -2.5 && z <= 11.6) ||
    Math.hypot(x - SPAWN.x, z - SPAWN.z) < 2.6 ||
    fixed.some((f) => Math.hypot(x - f.x, z - f.z) < 1.5);

  function scatter(count, names, smin, smax, obstacleRadius) {
    const items = [];
    for (let i = 0; i < count; i++) {
      for (let attempt = 0; attempt < 200; attempt++) {
        const x = rand(rng, -walk, walk);
        const z = rand(rng, -walkZ, walkZ);
        if (blocked(x, z)) continue;
        items.push(nature(pick(rng, names), x, z, rand(rng, smin, smax), rand(rng, 0, Math.PI * 2)));
        if (obstacleRadius) obstacles.push({ x, z, radius: obstacleRadius });
        break;
      }
    }
    return items;
  }
  const rocks = scatter(params.rocks, BIG_ROCKS, 2, 3, 0.5);
  const bushes = scatter(params.bushes, BUSHES, 2.5, 3.2);
  const flowers = scatter(params.flowers, FLOWERS, 2.2, 3);
  const grass = scatter(params.grass, GRASS, 2.2, 3);
  const plants = scatter(params.plants, PLANTS, 2.2, 3);

  return {
    trees, rocks, bushes, flowers, grass, plants, pathTiles, lanterns, obelisks,
    pondLilies, pondRocks, furnaceItems, pond, obstacles,
  };
}
