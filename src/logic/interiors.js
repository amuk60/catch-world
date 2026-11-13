// 실내 공간 데이터 (순수). 좌표는 월드 좌표(마당과 멀리 떨어진 같은 씬 안)이고 y=0 이 바닥이다.
// 세탁소 실내: 안쪽 면 기준 12(x) x 10(z)의 코인세탁소. 북쪽(뒷) 벽에 세탁기·건조기 한 줄, 서쪽 벽에 출입문, 동쪽에 빨랫줄.
// 오브젝트 방향: rotY 는 three.js rotation.y 이며 모델의 앞(+z)이 (sin, cos) 방향을 본다.
import { LAUNDRY_INTERIOR, INTERVIEW_INTERIOR } from '../config.js';

const TILE = 2; // 벽·바닥 조각 한 칸(월드 단위). Furniture Kit 벽(폭 1, 높이 1.29)을 2배로 쓴다.
const WALL_OFFSET = 0.07; // 벽 조각 중심이 방 경계에서 바깥쪽으로 떨어진 거리(안쪽 면이 경계에 닿도록 두께의 반)
const WASHER_RADIUS = 0.6;
const EXIT = { z: 2 }; // 출입문 위치(서쪽 벽 위, 방 중심 기준 z)
const INTERACT = { radius: 0.4, range: 1.6, inset: 0.9 }; // 출구 상호작용 판정(출입문에서 안쪽으로 inset 떨어진 점)
const SHIRT_SPOT = { inset: 1.0, range: 2.0 }; // 빨랫줄에서 방 안쪽으로 떨어진 E 자리와 그 범위
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


// 벽: 조각은 칸 중심에 놓고(안쪽을 +로 보는 방향 rotY), 면마다 한 그룹으로 묶어 카메라 쪽 벽을 통째로 숨긴다. pieceNames: 면 -> 조각 이름(좌표가 커지는 쪽으로).
function makeWalls(bounds, pieceNames) {
  const sides = {
    north: { rotY: 0, alongX: true, across: bounds.minZ - WALL_OFFSET },
    south: { rotY: Math.PI, alongX: true, across: bounds.maxZ + WALL_OFFSET },
    west: { rotY: Math.PI / 2, alongX: false, across: bounds.minX - WALL_OFFSET },
    east: { rotY: -Math.PI / 2, alongX: false, across: bounds.maxX + WALL_OFFSET },
  };
  return Object.entries(sides).map(([side, s]) => {
    const start = s.alongX ? bounds.minX : bounds.minZ;
    const pieces = pieceNames[side].map((name, i) => {
      const c = start + TILE / 2 + i * TILE;
      return { name, x: s.alongX ? c : s.across, z: s.alongX ? s.across : c, rotY: s.rotY };
    });
    const a = s.alongX ? { x: bounds.minX, z: s.across } : { x: s.across, z: bounds.minZ };
    const b = s.alongX ? { x: bounds.maxX, z: s.across } : { x: s.across, z: bounds.maxZ };
    return { id: side, side, a, b, pieces };
  });
}

export function buildLaundryInterior() {
  const { origin, width, depth, wallHeight } = LAUNDRY_INTERIOR;
  const bounds = { minX: origin.x - width / 2, maxX: origin.x + width / 2, minZ: origin.z - depth / 2, maxZ: origin.z + depth / 2 };
  const at = (rx, rz) => ({ x: origin.x + rx, z: origin.z + rz });

  const walls = makeWalls(bounds, WALL_PIECES);

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
  // 빨랫줄 곁(방 안쪽): 마른 새 셔츠를 입는 자리. 호버 안내는 '빨랫줄', E 안내는 logic/outfit.js 가 상태에 맞게 정한다.
  interactables.push({
    id: 'laundry-clothesline', label: '빨랫줄', kind: 'clothesline', x: clothesline.x1 - SHIRT_SPOT.inset, z: clothesline.centre.z,
    radius: 0.4, interactRange: SHIRT_SPOT.range,
  });
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

// ---- 면접장 실내 ----
// 안쪽 면 기준 12(x) x 10(z). 북쪽(뒷) 벽 앞에 긴 면접관 책상 + 책상 뒤 면접관 3명(팀장 가운데, 인사담당 서쪽, 막내 동쪽), 책상 앞에 지원자 의자.
// 서쪽 벽에 출입문과 칠판, 북쪽 벽에 간판 "면접장"·벽시계·창. 책상 양끝은 낮은 책장으로 막아 면접관 자리에는 들어갈 수 없다.
const INTERVIEW_EXIT = { z: 2 };
const INTERVIEW_WALL_PIECES = {
  north: ['wallWindow', 'wall', 'wall', 'wall', 'wall', 'wallWindow'],
  south: ['wall', 'wall', 'wall', 'wall', 'wall', 'wall'],
  west: ['wall', 'wall', 'wall', 'wallDoorwayWide', 'wall'],
  east: ['wall', 'wall', 'wall', 'wall', 'wall'],
};
const DESK = { z: -2.0, scale: 1.9, xs: [-1.4, 0, 1.4], top: 0.72, radius: 0.6, circleXs: [-1.8, -0.9, 0, 0.9, 1.8] }; // 책상 3개를 이어 4.2 길이의 긴 책상으로(면접관이 서면 상체가 보이게 낮게)
const SEAT = { z: -3.0, y: 0.22, chair: { name: 'chairDesk', scale: 1.9 } }; // 면접관 의자(책상 뒤). y 는 앉은 캐릭터 모델 원점 높이(앉는 동작이 몸을 낮춘다)
const SEAT_ORDER = [['hr', -1.4], ['leader', 0], ['junior', 1.4]];
const GUEST_CHAIR = { x: 0, z: 0.3, scale: 2.6, radius: 0.4 }; // 지원자 의자(북쪽을 본다)
const GUEST_SPOT = { x: 0, z: 1.9 }; // 지원자가 서는 자리(의자 남쪽)

export function buildInterviewInterior() {
  const { origin, width, depth, wallHeight } = INTERVIEW_INTERIOR;
  const bounds = { minX: origin.x - width / 2, maxX: origin.x + width / 2, minZ: origin.z - depth / 2, maxZ: origin.z + depth / 2 };
  const at = (rx, rz) => ({ x: origin.x + rx, z: origin.z + rz });
  const walls = makeWalls(bounds, INTERVIEW_WALL_PIECES);

  const obstacles = [];
  const circle = (id, x, z, radius) => obstacles.push({ id, x, z, radius });
  const furniture = [];
  const piece = (id, name, rx, rz, scale, rotY, { y = 0, circles = [] } = {}) => {
    const p = at(rx, rz);
    furniture.push({ pack: 'furniture', name, x: p.x, z: p.z, y, scale, rotY });
    for (const [dx, dz, r] of circles) circle(id, p.x + dx, p.z + dz, r);
  };

  // 긴 책상(앞면이 남쪽) + 책상 위 소품.
  for (const rx of DESK.xs) piece('desk-piece', 'desk', rx, DESK.z, DESK.scale, 0);
  for (const rx of DESK.circleXs) circle('desk', origin.x + rx, origin.z + DESK.z, DESK.radius);
  piece('laptop', 'laptop', -1.4, DESK.z + 0.1, 1.4, Math.PI, { y: DESK.top });
  piece('books', 'books', 1.75, DESK.z - 0.1, 2.2, 0.4, { y: DESK.top });
  piece('plantSmall1', 'plantSmall1', 0.7, DESK.z + 0.15, 2.4, 0, { y: DESK.top });
  // 책상 양끝의 낮은 책장(면접관 자리 막기).
  for (const [rx, rotY] of [[-3.0, Math.PI / 2], [3.0, -Math.PI / 2]]) {
    for (const rz of [-3.1, -4.25]) piece('shelf', 'bookcaseOpenLow', rx, rz, 2.8, rotY, { circles: [[0, 0, 0.55]] });
  }
  // 면접관 자리: 의자는 건물 안에서 움직일 수 있게(일어설 때 뒤로 밀린다) furniture 가 아니라 seats 에 둔다.
  const seats = SEAT_ORDER.map(([id, rx]) => {
    const p = at(rx, SEAT.z);
    return { id, x: p.x, z: p.z, y: SEAT.y, rotY: 0, chair: { ...SEAT.chair, x: p.x, z: p.z, rotY: 0 } };
  }).sort((a, b) => ['leader', 'hr', 'junior'].indexOf(a.id) - ['leader', 'hr', 'junior'].indexOf(b.id));

  // 지원자 의자와 서 있을 자리, 러그, 그 밖의 장식.
  const guest = at(GUEST_CHAIR.x, GUEST_CHAIR.z);
  const chair = { name: 'chairCushion', x: guest.x, z: guest.z, scale: GUEST_CHAIR.scale, rotY: Math.PI };
  piece('interviewChair', 'chairCushion', GUEST_CHAIR.x, GUEST_CHAIR.z, GUEST_CHAIR.scale, Math.PI, { circles: [[0, 0, GUEST_CHAIR.radius]] });
  piece('rugRectangle', 'rugRectangle', 0, 1.1, 2.6, 0); // 바닥 장식(장애물 아님)
  piece('pottedPlant-ne', 'pottedPlant', 5.2, -4.2, 3.2, 0, { circles: [[0, 0, 0.4]] });
  piece('pottedPlant-sw', 'pottedPlant', -5.2, 3.9, 3.2, 0, { circles: [[0, 0, 0.4]] });
  piece('benchCushion', 'benchCushion', 3.8, 4.4, 2.6, Math.PI, { circles: [[0, 0, 0.5]] }); // 남쪽 벽 앞 대기 의자
  piece('lampRoundFloor', 'lampRoundFloor', -5.3, -4.0, 2.4, 0, { circles: [[0, 0, 0.3]] });
  piece('coatRackStanding', 'coatRackStanding', 5.3, 0.6, 3.0, 0, { circles: [[0, 0, 0.3]] });

  // 출입문(서쪽 벽).
  const exitPos = at(-width / 2, INTERVIEW_EXIT.z);
  const exit = { x: exitPos.x, z: exitPos.z, rotY: Math.PI / 2 };
  const exitSpot = { x: exit.x + INTERACT.inset, z: exit.z };
  const interactables = [{
    id: 'interview-exit', label: '출구', kind: 'door', to: 'yard', x: exitSpot.x, z: exitSpot.z, radius: INTERACT.radius,
    interactRange: INTERACT.range, walkTo: { x: exit.x + 1.4, z: exit.z },
  }];
  const arrival = { x: exit.x + ARRIVAL_DISTANCE, z: exit.z, rotY: Math.PI / 2 };

  const lamps = [at(-3, -0.5), at(2.8, -0.8), at(0, 2.4)].map((p) => ({ x: p.x, y: wallHeight - 0.2, z: p.z }));
  const sign = { x: origin.x, y: 2.05, z: bounds.minZ + 0.06, rotY: 0, width: 2.4, height: 0.6, text: '면접장' };
  const board = { x: bounds.minX + 0.07, y: 1.5, z: origin.z - 1.9, rotY: Math.PI / 2, width: 2.2, height: 1.2 }; // 서쪽 벽 칠판(동쪽을 본다)
  const clock = { x: origin.x - 3.4, y: 1.95, z: bounds.minZ + 0.07, rotY: 0, radius: 0.3 }; // 북쪽 벽 벽시계
  const deskTop = { ...at(0, DESK.z), y: DESK.top }; // 돌발행동 "책상 위 만세"에서 올라서는 자리

  return {
    id: 'interview', origin: { ...origin }, bounds, wallHeight, tile: TILE, walls, exit, arrival, interactables,
    furniture, seats, chair, obstacles, lamps, sign, board, clock, deskTop,
    standingSpot: at(GUEST_SPOT.x, GUEST_SPOT.z),
    zoneCenter: at(0, 0.1),
  };
}
