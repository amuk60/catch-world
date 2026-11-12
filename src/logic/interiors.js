// 실내 공간 데이터 (순수). 좌표는 월드 좌표(마당과 멀리 떨어진 같은 씬 안)이고 y=0 이 바닥이다.
// 세탁소 실내: 안쪽 면 기준 12(x) x 10(z)의 코인세탁소. 북쪽(뒷) 벽에 세탁기·건조기 한 줄, 서쪽 벽에 출입문, 동쪽에 빨랫줄.
// 오브젝트 방향: rotY 는 three.js rotation.y 이며 모델의 앞(+z)이 (sin, cos) 방향을 본다.
import { LAUNDRY_INTERIOR } from '../config.js';

const TILE = 2; // 벽·바닥 조각 한 칸(월드 단위). Furniture Kit 벽(폭 1, 높이 1.29)을 2배로 쓴다.
const WALL_OFFSET = 0.07; // 벽 조각 중심이 방 경계에서 바깥쪽으로 떨어진 거리(안쪽 면이 경계에 닿도록 두께의 반)
const WASHER_RADIUS = 0.6;
const EXIT = { z: 2 }; // 출입문 위치(서쪽 벽 위, 방 중심 기준 z)
const INTERACT = { radius: 0.4, range: 1.6, inset: 0.9 }; // 출구 상호작용 판정(출입문에서 안쪽으로 inset 떨어진 점)
const ARRIVAL_DISTANCE = 2.6; // 출입문에서 안쪽으로 도착 지점까지(상호작용 범위 밖이라 도착 직후 E 안내가 뜨지 않는다)

// 세탁기 줄: 중심 기준 x 오프셋과 종류. 건조기는 양 끝.
const WASHER_ROW = {
  z: -4.2, scales: { washer: 2.6, dryer: 2.2 },
  slots: [['dryer', -3.75], ['washer', -2.25], ['washer', -0.75], ['washer', 0.75], ['washer', 2.25], ['dryer', 3.75]],
};
const CLOTHESLINE = { x: 4.6, z1: -1.7, z2: 1.7, y: 1.8, postHeight: 2.0, postRadius: 0.25, slots: 6 };

// 벽 한 면의 조각 이름(좌표가 커지는 쪽으로: 북·남 벽은 x, 서·동 벽은 z 순서).
const WALL_PIECES = {
  north: ['wallWindow', 'wall', 'wall', 'wall', 'wall', 'wall'],
  south: ['wall', 'wall', 'wall', 'wall', 'wall', 'wall'],
  west: ['wall', 'wallWindow', 'wall', 'wallDoorwayWide', 'wall'],
  east: ['wall', 'wall', 'wall', 'wall', 'wall'],
};

export function buildLaundryInterior() {
  const { origin, width, depth, wallHeight } = LAUNDRY_INTERIOR;
  const bounds = { minX: origin.x - width / 2, maxX: origin.x + width / 2, minZ: origin.z - depth / 2, maxZ: origin.z + depth / 2 };
  const at = (rx, rz) => ({ x: origin.x + rx, z: origin.z + rz });

  // 벽: 조각은 칸 중심에 놓고(안쪽을 +로 보는 방향 rotY), 면마다 한 그룹으로 묶어 카메라 쪽 벽을 통째로 숨긴다.
  const sides = {
    north: { rotY: 0, alongX: true, across: bounds.minZ - WALL_OFFSET },
    south: { rotY: Math.PI, alongX: true, across: bounds.maxZ + WALL_OFFSET },
    west: { rotY: Math.PI / 2, alongX: false, across: bounds.minX - WALL_OFFSET },
    east: { rotY: -Math.PI / 2, alongX: false, across: bounds.maxX + WALL_OFFSET },
  };
  const walls = Object.entries(sides).map(([side, s]) => {
    const start = s.alongX ? bounds.minX : bounds.minZ;
    const pieces = WALL_PIECES[side].map((name, i) => {
      const c = start + TILE / 2 + i * TILE;
      return { name, x: s.alongX ? c : s.across, z: s.alongX ? s.across : c, rotY: s.rotY };
    });
    const a = s.alongX ? { x: bounds.minX, z: s.across } : { x: s.across, z: bounds.minZ };
    const b = s.alongX ? { x: bounds.maxX, z: s.across } : { x: s.across, z: bounds.maxZ };
    return { id: side, side, a, b, pieces };
  });

  const obstacles = [];
  const circle = (id, x, z, radius) => obstacles.push({ id, x, z, radius });

  const washers = WASHER_ROW.slots.map(([name, rx], i) => {
    const p = at(rx, WASHER_ROW.z);
    circle(`washer-${i}`, p.x, p.z, WASHER_RADIUS);
    return { pack: 'furniture', name, x: p.x, z: p.z, scale: WASHER_ROW.scales[name], rotY: 0, radius: WASHER_RADIUS }; // 남쪽(방 안쪽)을 본다
  });

  const clothesline = {
    x1: origin.x + CLOTHESLINE.x, z1: origin.z + CLOTHESLINE.z1, x2: origin.x + CLOTHESLINE.x, z2: origin.z + CLOTHESLINE.z2, y: CLOTHESLINE.y,
    postHeight: CLOTHESLINE.postHeight, postRadius: CLOTHESLINE.postRadius, slots: CLOTHESLINE.slots,
    centre: { x: origin.x + CLOTHESLINE.x, z: origin.z + (CLOTHESLINE.z1 + CLOTHESLINE.z2) / 2 },
  };
  circle('clothesline-post-a', clothesline.x1, clothesline.z1, clothesline.postRadius);
  circle('clothesline-post-b', clothesline.x2, clothesline.z2, clothesline.postRadius);

  // 가구(모델 원점은 모서리일 수 있어 그리는 쪽이 바닥 중심으로 맞춘다). obstacle: 충돌 원들(같은 id 는 한 가구).
  const furniture = [];
  const piece = (id, name, rx, rz, scale, rotY, circles = []) => {
    const p = at(rx, rz);
    furniture.push({ pack: 'furniture', name, x: p.x, z: p.z, scale, rotY });
    for (const [dx, dz, r] of circles) circle(id, p.x + dx, p.z + dz, r);
  };
  piece('table', 'table', -0.5, 2.9, 3.0, 0, [[-0.6, 0, 0.65], [0.6, 0, 0.65]]); // 접이식 테이블(가로로 긴 판)
  piece('benchCushion', 'benchCushion', 2.8, 4.45, 2.6, Math.PI, [[0, 0, 0.5]]); // 남쪽 벽 앞, 북쪽(방 안)을 본다
  piece('pottedPlant', 'pottedPlant', 5.3, -4.2, 3.2, 0, [[0, 0, 0.4]]);
  piece('trashcan', 'trashcan', -5.3, -4.3, 1.4, 0, [[0, 0, 0.35]]);
  piece('cardboardBoxOpen', 'cardboardBoxOpen', -5.2, -2.3, 2.5, 0.3, [[0, 0, 0.45]]);
  piece('lampRoundFloor', 'lampRoundFloor', -5.3, 4.3, 2.4, 0, [[0, 0, 0.3]]);
  piece('rugRectangle', 'rugRectangle', 0.3, -0.8, 2.3, 0); // 바닥 장식(장애물 아님)

  // 출입문(서쪽 벽): 문 앞 안쪽 점. 방 안쪽(+x)을 본다.
  const exitPos = at(-width / 2, EXIT.z);
  const exit = { x: exitPos.x, z: exitPos.z, rotY: Math.PI / 2 };
  const exitSpot = { x: exit.x + INTERACT.inset, z: exit.z };
  const interactables = [{
    id: 'laundry-exit', label: '출구', kind: 'door', to: 'yard', x: exitSpot.x, z: exitSpot.z, radius: INTERACT.radius,
    interactRange: INTERACT.range, walkTo: { x: exit.x + 1.4, z: exit.z },
  }];
  const arrival = { x: exit.x + ARRIVAL_DISTANCE, z: exit.z, rotY: Math.PI / 2 };

  // 천장 조명(눈에 보이는 램프의 위치. 같은 자리 근처에 점광을 둔다).
  const lamps = [at(-3, -1.2), at(2.2, -1.8), at(-0.5, 2.6)].map((p) => ({ x: p.x, y: wallHeight - 0.2, z: p.z }));

  const sign = { x: origin.x, y: 2.0, z: bounds.minZ + 0.06, rotY: 0, width: 2.4, height: 0.6, text: '세탁소' };

  return {
    id: 'laundry', origin: { ...origin }, bounds, wallHeight, tile: TILE, walls, exit, arrival, interactables,
    washers, furniture, clothesline, obstacles, lamps, sign,
    standingSpot: at(1.5, -1.2), // 세탁기와 빨랫줄 모두 사정거리 안인 자리
  };
}
