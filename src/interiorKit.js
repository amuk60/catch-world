// 브라우저 전용: 실내 공간(세탁소·면접장) 공용 조각. Furniture Kit 모델 배치(placed), 체크 타일 바닥, 벽 그룹(카메라 쪽 벽 숨김용), 간판, 조명.
import * as THREE from 'three';
import { INTERIOR_LOOK } from './config.js';
import { signTexture } from './laundry.js';

const FALLBACK_SIZE = { wall: [2, 2.58, 0.1], wallWindow: [2, 2.58, 0.1], wallDoorwayWide: [2, 2.58, 0.1] }; // 모델이 없을 때 도형 대체물(폭, 높이, 두께)
const WALL_COLOR = 0xe9dcc4;

// 모델을 복제해 바닥 중심이 원점에 오도록 맞춘 래퍼 그룹을 돌려준다(없으면 상자 대체물). y 는 바닥에서 띄울 높이.
export function placed(models, name, { x, z, y = 0, scale, rotY }, shadow = true) {
  const wrapper = new THREE.Group();
  const model = models.get(`furniture/${name}`);
  if (model) {
    const m = model.clone(true);
    m.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = shadow;
      o.receiveShadow = shadow;
      for (const mat of [].concat(o.material)) mat.metalness = 0; // Kenney glb 재질은 metallic=1 이라 환경맵 없이는 검다
    });
    m.scale.setScalar(scale);
    const box = new THREE.Box3().setFromObject(m);
    m.position.set(-(box.min.x + box.max.x) / 2, -box.min.y, -(box.min.z + box.max.z) / 2);
    wrapper.add(m);
  } else {
    const [w, h, d] = FALLBACK_SIZE[name] ?? [0.8, 0.9, 0.6];
    const box = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshStandardMaterial({ color: FALLBACK_SIZE[name] ? WALL_COLOR : 0xb89a78 }));
    box.position.y = h / 2;
    wrapper.add(box);
  }
  wrapper.position.set(x, y, z);
  wrapper.rotation.y = rotY;
  return wrapper;
}

// 바닥: 1x1 체크 타일(밝은 크림/베이지). 클릭 레이캐스트 대상이기도 하다.
export function buildFloor(bounds) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const g = canvas.getContext('2d');
  g.fillStyle = '#ead9b8';
  g.fillRect(0, 0, 256, 256);
  g.fillStyle = '#d7c19a';
  g.fillRect(0, 0, 128, 128);
  g.fillRect(128, 128, 128, 128);
  g.strokeStyle = 'rgba(120, 95, 60, 0.25)';
  g.lineWidth = 3;
  g.strokeRect(0, 0, 256, 256);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  const w = bounds.maxX - bounds.minX;
  const d = bounds.maxZ - bounds.minZ;
  texture.repeat.set(w / 2, d / 2); // 한 번 반복 = 2x2 (체크 한 칸 1)
  texture.anisotropy = 4;
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshStandardMaterial({ map: texture, roughness: 0.85 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.set((bounds.minX + bounds.maxX) / 2, 0, (bounds.minZ + bounds.maxZ) / 2);
  floor.receiveShadow = true;
  return floor;
}

// 벽: 면마다 그룹 하나(카메라가 바깥에서 볼 때 통째로 숨긴다). 벽 조각은 그림자를 던지지도 받지도 않는다(얇은 판의 줄무늬 방지). 걸레받이 포함.
// interior: logic/interiors.js 의 실내 데이터(bounds, walls, tile). 돌려주는 값: { 벽 id -> THREE.Group }.
export function buildWallGroups(root, interior, models) {
  const { bounds } = interior;
  const wallGroups = {};
  for (const wall of interior.walls) {
    const group = new THREE.Group();
    group.name = `wall-${wall.id}`;
    for (const p of wall.pieces) group.add(placed(models, p.name, { x: p.x, z: p.z, scale: interior.tile, rotY: p.rotY }, false));
    // 걸레받이: 벽 안쪽 면을 따라.
    const alongX = wall.side === 'north' || wall.side === 'south';
    const length = alongX ? bounds.maxX - bounds.minX : bounds.maxZ - bounds.minZ;
    const base = new THREE.Mesh(
      new THREE.BoxGeometry(alongX ? length : 0.06, 0.16, alongX ? 0.06 : length),
      new THREE.MeshStandardMaterial({ color: 0x8a6a48, roughness: 0.8 }),
    );
    const inset = 0.03;
    base.position.set(
      alongX ? (bounds.minX + bounds.maxX) / 2 : (wall.side === 'west' ? bounds.minX + inset : bounds.maxX - inset),
      0.08,
      alongX ? (wall.side === 'north' ? bounds.minZ + inset : bounds.maxZ - inset) : (bounds.minZ + bounds.maxZ) / 2,
    );
    group.add(base);
    wallGroups[wall.id] = group;
    root.add(group);
  }
  return wallGroups;
}

// 북쪽 벽 안쪽 면의 간판. 북쪽 벽 그룹에 넣어 벽과 함께 숨는다.
export function addSign(wallGroups, sign) {
  const board = new THREE.Mesh(new THREE.BoxGeometry(sign.width, sign.height, 0.08), new THREE.MeshStandardMaterial({ color: 0xb98a56 }));
  const face = new THREE.Mesh(
    new THREE.PlaneGeometry(sign.width * 0.94, sign.height * 0.9),
    new THREE.MeshBasicMaterial({ map: signTexture(sign.text), toneMapped: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }),
  );
  face.position.z = 0.045;
  const signGroup = new THREE.Group();
  signGroup.add(board, face);
  signGroup.position.set(sign.x, sign.y, sign.z + 0.04);
  signGroup.rotation.y = sign.rotY;
  wallGroups.north.add(signGroup);
}

// 조명: 따뜻한 반구광 + 천장 램프 점광(그림자 없음) + 그림자용 방향광 1개.
export function addLights(root, interior) {
  root.add(new THREE.HemisphereLight(INTERIOR_LOOK.hemiSky, INTERIOR_LOOK.hemiGround, INTERIOR_LOOK.hemi));
  for (const l of interior.lamps) {
    const light = new THREE.PointLight(INTERIOR_LOOK.lamp, INTERIOR_LOOK.lampIntensity, INTERIOR_LOOK.lampDistance, 2);
    light.position.set(l.x, l.y - 0.1, l.z);
    light.castShadow = false;
    root.add(light);
  }
  const sun = new THREE.DirectionalLight(0xfff0d8, INTERIOR_LOOK.sun);
  sun.position.set(interior.origin.x - 3, 10, interior.origin.z + 4);
  sun.target.position.set(interior.origin.x, 0, interior.origin.z);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -9, right: 9, top: 9, bottom: -9, near: 1, far: 26 });
  sun.shadow.camera.updateProjectionMatrix();
  sun.shadow.bias = -0.0006;
  root.add(sun, sun.target);
}
