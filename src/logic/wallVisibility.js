// 실내 벽 가림 (순수). 카메라가 방 바깥쪽에서 어떤 벽 평면을 넘어와 있으면 그 벽이 시야를 가리므로 숨긴다.
// walls: [{ id, side: 'north'|'south'|'west'|'east' }], roomBounds: { minX, maxX, minZ, maxZ }. 북 = -z, 남 = +z, 서 = -x, 동 = +x.
// 벽 평면 위(경계)는 숨기지 않는다. 카메라가 방 안(위)에 있으면 아무것도 숨기지 않는다. y 는 보지 않는다.
const OUTSIDE = {
  north: (c, b) => c.z < b.minZ,
  south: (c, b) => c.z > b.maxZ,
  west: (c, b) => c.x < b.minX,
  east: (c, b) => c.x > b.maxX,
};

export function hiddenWalls(cameraPos, roomBounds, walls) {
  return walls.filter((w) => OUTSIDE[w.side]?.(cameraPos, roomBounds)).map((w) => w.id);
}
