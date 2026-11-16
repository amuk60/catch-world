// 브라우저 전용: 세탁소 실내 공간(코인세탁소). 마당과 멀리 떨어진 같은 씬 안의 별도 그룹(root)이고, 데이터는 logic/interiors.js 에서 온다.
// 벽·창·출입문은 서리 유리 판 + 은색 철제 틀(interiorGlass.js: 불투명해서 밖이 안 보인다), 가구는 Furniture Kit 조각(세탁기·건조기·테이블·벤치·화분·쓰레기통·상자·스탠드·러그)을 밝고 시원한 색으로 덮어 쓴다.
// 바닥은 크림·청록 체크 타일, 간판 "세탁소"는 외관 간판과 같은 청록 판(세탁기·셔츠 그림 + 크림 글씨)을 북쪽 벽에 걸고 그 위에 외관과 같은 청록·크림 줄무늬 차양을 단다.
// 외관(buildingExterior.js)과 한 가게로 보이도록 색은 config 의 LAUNDRY_LOOK·INTERIOR_LOOK 를 함께 쓴다. 세탁·널기 이펙트는 laundryFx.js.
// 조명: 시원한 흰 반구광 + 천장 램프 점광 3개(그림자 없음) + 그림자용 방향광 1개. 카메라 쪽 벽은 면 단위로 숨긴다(updateWalls). 공용 조각은 interiorKit.js.
import * as THREE from 'three';
import { INTERIOR_LOOK } from './config.js';
import { laundrySignCanvas, stripeCanvas, valanceCanvas } from './buildingExterior.js';
import { liveSignTexture } from './signFont.js';
import { createLaundryFx } from './laundryFx.js';
import { hiddenWalls } from './logic/wallVisibility.js';
import { buildWashers, buildClothesline } from './laundry.js';
import { buildPickables } from './world.js';
import { placed, buildFloor, buildWallGroups, addLights } from './interiorKit.js';

export const INTERIOR_MODEL_ITEMS = [
  'wall', 'wallWindow', 'wallDoorwayWide', 'washer', 'dryer', 'table', 'benchCushion', 'pottedPlant', 'trashcan', 'cardboardBoxOpen',
  'lampRoundFloor', 'rugRectangle',
].map((name) => ({ pack: 'furniture', name }));

// 북쪽 벽 안쪽 면의 간판: 외관 간판과 같은 캔버스 그림(청록 판 + 크림 테두리 + 세탁기·셔츠 + "세탁소"). 벽 그룹에 넣어 벽과 함께 숨는다.
function addShopSign(wallGroups, sign) {
  const texture = liveSignTexture(() => laundrySignCanvas(1000, 200));
  const cream = new THREE.MeshStandardMaterial({ color: INTERIOR_LOOK.sign.board, roughness: 0.8 });
  const board = new THREE.Mesh(new THREE.BoxGeometry(sign.width, sign.height, 0.08), cream);
  const face = new THREE.Mesh(
    new THREE.PlaneGeometry(sign.width, sign.height),
    new THREE.MeshBasicMaterial({ map: texture, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }),
  );
  face.position.z = 0.045;
  const group = new THREE.Group();
  group.add(board, face);
  group.position.set(sign.x, sign.y, sign.z + 0.04);
  group.rotation.y = sign.rotY;
  wallGroups.north.add(group);
}

// 세탁기 줄 위의 줄무늬 차양(외관 차양과 같은 청록·크림 줄무늬 + 물결 처마). 북쪽 벽 그룹에 넣는다.
function addValance(wallGroups, bounds, interior) {
  const proj = 0.85;
  const yHi = 2.56;
  const yLo = 2.24;
  const w = 9.4;
  const cx = interior.origin.x;
  const stripes = new THREE.CanvasTexture(stripeCanvas());
  stripes.colorSpace = THREE.SRGBColorSpace;
  stripes.wrapS = THREE.RepeatWrapping;
  stripes.repeat.set(2, 1);
  const slope = Math.hypot(proj, yHi - yLo);
  const awning = new THREE.Mesh(new THREE.BoxGeometry(w, 0.04, slope), new THREE.MeshStandardMaterial({ map: stripes, roughness: 0.9, side: THREE.DoubleSide }));
  awning.position.set(cx, (yHi + yLo) / 2, bounds.minZ + proj / 2);
  awning.rotation.x = Math.atan2(yHi - yLo, proj);
  const fringe = new THREE.CanvasTexture(valanceCanvas());
  fringe.colorSpace = THREE.SRGBColorSpace;
  fringe.wrapS = THREE.RepeatWrapping;
  fringe.repeat.set(2, 1);
  const valance = new THREE.Mesh(new THREE.PlaneGeometry(w, 0.24), new THREE.MeshStandardMaterial({ map: fringe, alphaTest: 0.5, roughness: 0.9, side: THREE.DoubleSide }));
  valance.position.set(cx, yLo - 0.1, bounds.minZ + proj);
  wallGroups.north.add(awning, valance);
}

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

  // 간판 "세탁소"(외관 간판과 같은 청록 판)와 그 위 줄무늬 차양: 북쪽 벽 안쪽 면, 세탁기 줄 위.
  addShopSign(wallGroups, interior.sign);
  if (INTERIOR_LOOK.valance) addValance(wallGroups, bounds, interior);

  const fx = createLaundryFx(root, washers, interior.clothesline); // 세탁·널기 이펙트(비누방울·반짝이·LED 표시판)

  addLights(root, interior);

  const pickables = buildPickables(root, interior.interactables);
  scene.add(root);

  return {
    root, ground, pickables, washers, clothesline, wallGroups, fx,
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
