// 브라우저 전용: 세탁소 실내 공간(코인세탁소). 마당과 멀리 떨어진 같은 씬 안의 별도 그룹(root)이고, 데이터는 logic/interiors.js 에서 온다.
// 벽·창·출입문은 서리 유리 판 + 은색 철제 틀(interiorGlass.js: 불투명해서 밖이 안 보인다), 가구는 Furniture Kit 조각(세탁기·건조기·테이블·벤치·화분·쓰레기통·상자·스탠드·러그)을 밝고 시원한 색으로 덮어 쓴다.
// 바닥은 밝은 타일, 간판 "세탁소"는 솔질한 금속 판 + 청록 글씨를 북쪽 벽에 건다. 모양(색·재질·유리)은 config 의 INTERIOR_LOOK 가 정한다.
// 조명: 시원한 흰 반구광 + 천장 램프 점광 3개(그림자 없음) + 그림자용 방향광 1개. 카메라 쪽 벽은 면 단위로 숨긴다(updateWalls). 공용 조각은 interiorKit.js.
import * as THREE from 'three';
import { INTERIOR_LOOK } from './config.js';
import { hiddenWalls } from './logic/wallVisibility.js';
import { buildWashers, buildClothesline } from './laundry.js';
import { buildPickables } from './world.js';
import { placed, buildFloor, buildWallGroups, addSign, addLights } from './interiorKit.js';

export const INTERIOR_MODEL_ITEMS = [
  'wall', 'wallWindow', 'wallDoorwayWide', 'washer', 'dryer', 'table', 'benchCushion', 'pottedPlant', 'trashcan', 'cardboardBoxOpen',
  'lampRoundFloor', 'rugRectangle',
].map((name) => ({ pack: 'furniture', name }));

export function buildInteriorLaundry(scene, interior, models) {
  const root = new THREE.Group();
  root.name = 'interior-laundry';
  root.visible = false;
  const { bounds } = interior;

  const ground = buildFloor(bounds);
  root.add(ground);

  const wallGroups = buildWallGroups(root, interior, models);

  // 가구와 러그, 천장 램프.
  for (const f of interior.furniture) root.add(placed(models, f.name, f, f.name !== 'rugRectangle'));
  // 천장은 그리지 않으므로 램프는 눈에 보이는 물체 없이 빛(아래 점광)만 낸다(허공에 떠 있는 전구가 어색해 뺐다).

  // 세탁기 줄과 빨랫줄(널린 빨래·세탁기 흔들림·거품은 기존 코드 그대로: 월드 좌표 데이터라 위치만 다르다).
  const washers = buildWashers(root, interior.washers, models);
  const clothesline = buildClothesline(root, interior.clothesline, INTERIOR_LOOK.clothesline);

  // 간판 "세탁소": 북쪽 벽 안쪽 면, 세탁기 줄 위.
  addSign(wallGroups, interior.sign);

  addLights(root, interior);

  const pickables = buildPickables(root, interior.interactables);
  scene.add(root);

  return {
    root, ground, pickables, washers, clothesline, wallGroups,
    background: new THREE.Color(INTERIOR_LOOK.background),
    fog: new THREE.Fog(INTERIOR_LOOK.background, 250, 500), // 사실상 없는 안개(마당 안개와 같은 셰이더 변형을 쓰려고 null 대신 먼 안개)
    // 카메라가 방 바깥쪽에서 가리는 벽을 숨긴다(매 프레임).
    updateWalls(cameraPos) {
      const hidden = new Set(hiddenWalls(cameraPos, bounds, interior.walls));
      for (const [id, group] of Object.entries(wallGroups)) group.visible = !hidden.has(id);
    },
    update(dt) {
      washers.update(dt);
      clothesline.update(dt);
    },
  };
}
