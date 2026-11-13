// 브라우저 전용: 실내 공간(세탁소·면접장) 공용 조각. Furniture Kit 모델 배치(placed), 체크 타일 바닥, 벽 그룹(카메라 쪽 벽 숨김용), 간판, 조명.
// 공간마다 모양(색·재질·조명)은 look(config 의 INTERIOR_LOOK / INTERVIEW_LOOK)으로 받는다. 안 넘기면 세탁소 기본값.
import * as THREE from 'three';
import { INTERIOR_LOOK } from './config.js';
import { signTexture } from './laundry.js';
import { materialOverrides } from './logic/look.js';
import { createGlassKit, buildGlassPiece } from './interiorGlass.js';

const FALLBACK_SIZE = { wall: [2, 2.58, 0.1], wallWindow: [2, 2.58, 0.1], wallDoorwayWide: [2, 2.58, 0.1] }; // 모델이 없을 때 도형 대체물(폭, 높이, 두께)
const WALL_COLOR = 0xe9dcc4;

// 덮어쓸 재질은 복제해서 바꾼다(clone(true)는 재질을 공유하므로 원본을 바꾸면 세탁소·마당의 같은 모델까지 바뀐다).
function recolor(mat, over) {
  const o = over[mat.name];
  if (o === undefined) return mat;
  const spec = typeof o === 'object' ? o : { color: o };
  const copy = mat.clone();
  if (spec.color !== undefined) copy.color.setHex(spec.color);
  if (spec.roughness !== undefined) copy.roughness = spec.roughness;
  if (spec.opacity !== undefined) {
    copy.opacity = spec.opacity;
    copy.transparent = spec.opacity < 1;
  }
  return copy;
}

// 모델을 복제해 바닥 중심이 원점에 오도록 맞춘 래퍼 그룹을 돌려준다(없으면 상자 대체물). y 는 바닥에서 띄울 높이. look: 이 공간의 모양(재질 덮어쓰기).
export function placed(models, name, { x, z, y = 0, scale, rotY }, shadow = true, look = INTERIOR_LOOK) {
  const wrapper = new THREE.Group();
  const model = models.get(`furniture/${name}`);
  if (model) {
    const m = model.clone(true);
    const over = materialOverrides(look, name);
    m.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = shadow;
      o.receiveShadow = shadow;
      for (const mat of [].concat(o.material)) mat.metalness = 0; // Kenney glb 재질은 metallic=1 이라 환경맵 없이는 검다
      o.material = Array.isArray(o.material) ? o.material.map((mat) => recolor(mat, over)) : recolor(o.material, over);
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

// 바닥: 1x1 체크 타일(look.floor 의 두 색). speckle 이면 카펫 타일처럼 잔 얼룩을 얹는다. 클릭 레이캐스트 대상이기도 하다.
export function buildFloor(bounds, look = INTERIOR_LOOK) {
  const { a, b, line, speckle } = look.floor;
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const g = canvas.getContext('2d');
  g.fillStyle = a;
  g.fillRect(0, 0, 256, 256);
  g.fillStyle = b;
  g.fillRect(0, 0, 128, 128);
  g.fillRect(128, 128, 128, 128);
  if (speckle) {
    let seed = 7; // 고정 시드(매번 같은 무늬)
    const rand = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
    for (let i = 0; i < 1600; i++) {
      g.fillStyle = rand() < 0.5 ? 'rgba(255, 255, 255, 0.08)' : 'rgba(20, 30, 45, 0.08)';
      g.fillRect(rand() * 256, rand() * 256, 2, 2);
    }
  }
  g.strokeStyle = line;
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
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshStandardMaterial({
    map: texture, roughness: look.floor.roughness ?? 0.85,
    ...(look.floor.glow ? { emissive: 0xffffff, emissiveMap: texture, emissiveIntensity: look.floor.glow } : {}), // glow: 타일 무늬 그대로 스스로 살짝 빛나 밝은 바닥이 흐려 보이지 않게
  }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.set((bounds.minX + bounds.maxX) / 2, 0, (bounds.minZ + bounds.maxZ) / 2);
  floor.receiveShadow = true;
  return floor;
}

// 벽: 면마다 그룹 하나(카메라가 바깥에서 볼 때 통째로 숨긴다). 벽 조각은 그림자를 던지지도 받지도 않는다(얇은 판의 줄무늬 방지). 걸레받이 포함.
// look.glass 가 있으면 모델 대신 유리 벽 조각(interiorGlass.js: 서리 유리 판 + 철제 틀)으로 만들고, 걸레받이는 틀의 아랫단이 대신한다.
// interior: logic/interiors.js 의 실내 데이터(bounds, walls, tile). 돌려주는 값: { 벽 id -> THREE.Group }.
export function buildWallGroups(root, interior, models, look = INTERIOR_LOOK) {
  const { bounds } = interior;
  const wallGroups = {};
  const glassKit = look.glass ? createGlassKit(look.glass) : null;
  for (const wall of interior.walls) {
    const group = new THREE.Group();
    group.name = `wall-${wall.id}`;
    for (const p of wall.pieces) {
      group.add(glassKit
        ? buildGlassPiece(glassKit, p, { tile: interior.tile, wallHeight: interior.wallHeight })
        : placed(models, p.name, { x: p.x, z: p.z, scale: interior.tile, rotY: p.rotY }, false, look));
    }
    if (glassKit) { wallGroups[wall.id] = group; root.add(group); continue; }
    // 걸레받이: 벽 안쪽 면을 따라.
    const alongX = wall.side === 'north' || wall.side === 'south';
    const length = alongX ? bounds.maxX - bounds.minX : bounds.maxZ - bounds.minZ;
    const base = new THREE.Mesh(
      new THREE.BoxGeometry(alongX ? length : 0.06, 0.16, alongX ? 0.06 : length),
      new THREE.MeshStandardMaterial({ color: look.baseboard, roughness: 0.8 }),
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
export function addSign(wallGroups, sign, look = INTERIOR_LOOK) {
  const board = new THREE.Mesh(new THREE.BoxGeometry(sign.width, sign.height, 0.08), new THREE.MeshStandardMaterial({ color: look.sign.board }));
  const face = new THREE.Mesh(
    new THREE.PlaneGeometry(sign.width * 0.94, sign.height * 0.9),
    new THREE.MeshBasicMaterial({ map: signTexture(sign.text, look.sign), toneMapped: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }),
  );
  face.position.z = 0.045;
  const signGroup = new THREE.Group();
  signGroup.add(board, face);
  signGroup.position.set(sign.x, sign.y, sign.z + 0.04);
  signGroup.rotation.y = sign.rotY;
  wallGroups.north.add(signGroup);
}

// 조명: 반구광 + 천장 램프 점광(그림자 없음) + 그림자용 방향광 1개. 색과 세기는 look 에서.
export function addLights(root, interior, look = INTERIOR_LOOK) {
  root.add(new THREE.HemisphereLight(look.hemiSky, look.hemiGround, look.hemi));
  for (const l of interior.lamps) {
    const light = new THREE.PointLight(look.lamp, look.lampIntensity, look.lampDistance, 2);
    light.position.set(l.x, l.y - 0.1, l.z);
    light.castShadow = false;
    root.add(light);
  }
  const sun = new THREE.DirectionalLight(look.sunColor, look.sun);
  sun.position.set(interior.origin.x - 3, 10, interior.origin.z + 4);
  sun.target.position.set(interior.origin.x, 0, interior.origin.z);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -9, right: 9, top: 9, bottom: -9, near: 1, far: 26 });
  sun.shadow.camera.updateProjectionMatrix();
  sun.shadow.bias = -0.0006;
  root.add(sun, sun.target);
}
