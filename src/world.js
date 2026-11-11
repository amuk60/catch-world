import * as THREE from 'three';
import { YARD, FURNACE, COLORS } from './config.js';

const GROUND_SIZE = 140;

// 바닥. 시각적으로는 마당보다 훨씬 넓고, 이동 범위는 YARD 가 따로 제한한다. 클릭 레이캐스트 대상.
export function buildGround(scene) {
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(GROUND_SIZE, GROUND_SIZE),
    new THREE.MeshStandardMaterial({ color: COLORS.ground }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);
  return ground;
}

// 둘레 위의 거리 d에 해당하는 사각 경로상의 점. 경로는 마당 가장자리에서 1단위 안쪽.
function perimeterPoint(d, hx, hz) {
  if (d < 2 * hx) return { x: -hx + d, z: -hz };
  d -= 2 * hx;
  if (d < 2 * hz) return { x: hx, z: -hz + d };
  d -= 2 * hz;
  if (d < 2 * hx) return { x: hx - d, z: hz };
  d -= 2 * hx;
  return { x: -hx, z: hz - d };
}

// 마당 가장자리 안쪽 1단위를 따라 틈 없이 둘러선 도형 나무.
export function buildBoundary(scene, count = 28) {
  const trunkGeo = new THREE.CylinderGeometry(0.18, 0.24, 1.2, 8);
  const crownGeo = new THREE.ConeGeometry(0.9, 2.2, 8);
  const trunkMat = new THREE.MeshStandardMaterial({ color: COLORS.trunk });
  const leafMat = new THREE.MeshStandardMaterial({ color: COLORS.leaves });
  const hx = YARD.width / 2 - 1;
  const hz = YARD.depth / 2 - 1;
  const perimeter = 4 * (hx + hz);
  const group = new THREE.Group();

  for (let i = 0; i < count; i++) {
    const { x, z } = perimeterPoint((i / count) * perimeter, hx, hz);
    const tree = new THREE.Group();
    const trunk = new THREE.Mesh(trunkGeo, trunkMat);
    trunk.position.y = 0.6;
    const crown = new THREE.Mesh(crownGeo, leafMat);
    crown.position.y = 2.3;
    trunk.castShadow = true;
    crown.castShadow = true;
    tree.add(trunk, crown);
    tree.position.set(x, 0, z);
    group.add(tree);
  }
  scene.add(group);
  return group;
}

// 임시 소각로(석재 원통).
export function buildFurnace(scene) {
  const furnace = new THREE.Mesh(
    new THREE.CylinderGeometry(FURNACE.radius * 0.8, FURNACE.radius * 0.8, 0.9, 24),
    new THREE.MeshStandardMaterial({ color: COLORS.furnace }),
  );
  furnace.position.set(FURNACE.x, 0.45, FURNACE.z);
  furnace.castShadow = true;
  scene.add(furnace);
  return furnace;
}

// 상자 플레이어. 눈은 +z 면(앞면)에 붙는다.
export function buildPlayer(scene) {
  const group = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(0.8, 1.0, 0.8),
    new THREE.MeshStandardMaterial({ color: COLORS.player }),
  );
  body.position.y = 0.5;
  body.castShadow = true;
  group.add(body);

  const eyeMat = new THREE.MeshStandardMaterial({ color: 0x1b1b2f });
  for (const x of [-0.18, 0.18]) {
    const eye = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.16, 0.04), eyeMat);
    eye.position.set(x, 0.65, 0.41);
    group.add(eye);
  }
  group.position.set(0, 0, 4);
  scene.add(group);
  return group;
}

// 클릭 지점 표시용 납작한 링. 처음엔 숨김.
export function buildMarker(scene) {
  const marker = new THREE.Mesh(
    new THREE.RingGeometry(0.25, 0.4, 24),
    new THREE.MeshBasicMaterial({ color: COLORS.marker, side: THREE.DoubleSide }),
  );
  marker.rotation.x = -Math.PI / 2;
  marker.position.y = 0.02;
  marker.visible = false;
  scene.add(marker);
  return marker;
}
