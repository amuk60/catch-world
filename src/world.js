import * as THREE from 'three';
import { ROOM, COLORS } from './config.js';

// 2x2 체커 텍스처를 1x1 월드 단위 칸으로 반복한 바닥.
export function buildFloor(scene) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 2;
  const ctx = canvas.getContext('2d');
  const hex = (c) => '#' + c.toString(16).padStart(6, '0');
  ctx.fillStyle = hex(COLORS.floorA);
  ctx.fillRect(0, 0, 2, 2);
  ctx.fillStyle = hex(COLORS.floorB);
  ctx.fillRect(1, 0, 1, 1);
  ctx.fillRect(0, 1, 1, 1);

  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  // 텍스처 한 장 = 2x2칸 = 2x2 단위
  tex.repeat.set(ROOM.width / 2, ROOM.depth / 2);

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(ROOM.width, ROOM.depth),
    new THREE.MeshStandardMaterial({ map: tex }),
  );
  floor.rotation.x = -Math.PI / 2;
  scene.add(floor);
  return floor;
}

// 상자 플레이어. 눈은 +z 면(앞면)에 붙는다.
export function buildPlayer(scene) {
  const group = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(0.8, 1.0, 0.8),
    new THREE.MeshStandardMaterial({ color: COLORS.player }),
  );
  body.position.y = 0.5;
  group.add(body);

  const eyeMat = new THREE.MeshStandardMaterial({ color: 0x1b1b2f });
  for (const x of [-0.18, 0.18]) {
    const eye = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.16, 0.04), eyeMat);
    eye.position.set(x, 0.65, 0.41);
    group.add(eye);
  }
  group.position.set(0, 0, 2);
  scene.add(group);
  return group;
}
