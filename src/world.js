import * as THREE from 'three';
import { YARD, FURNACE, SPAWN, COLORS } from './config.js';

const GROUND_SIZE = 140;
// 납작한 면은 높이를 달리하고 polygonOffset 을 더해 지면(y=0)과 깊이가 겹쳐 깜빡이지 않게 한다.
const PLAZA_Y = 0.02;
const PAD_Y = 0.04;
export const MARKER_Y = 0.06; // 광장(0.02)·터(0.04)보다 위

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
  group.position.set(SPAWN.x, 0, SPAWN.z);
  scene.add(group);
  return group;
}

// 나무 팻말 글씨 텍스처. 글씨가 85% 폭에 들어가도록 글꼴을 줄인다.
function signTexture(text) {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 384;
  const g = canvas.getContext('2d');
  g.fillStyle = '#d9b27c';
  g.fillRect(0, 0, canvas.width, canvas.height);
  g.strokeStyle = '#8a5f3a';
  g.lineWidth = 14;
  g.strokeRect(7, 7, canvas.width - 14, canvas.height - 14);
  let size = 150;
  const font = (px) => `bold ${px}px "Georgia", "Times New Roman", serif`;
  g.font = font(size);
  while (size > 20 && g.measureText(text).width > canvas.width * 0.85) {
    size -= 4;
    g.font = font(size);
  }
  g.fillStyle = '#4a2f1a';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, canvas.width / 2, canvas.height / 2);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

// 나무 팻말: 기둥 2개 + 밝은 나무 판자 + 글씨 면. 글씨는 판자의 +z 면(로컬)에 붙는다.
export function buildSign(scene, sign) {
  const { width, height } = sign;
  const BOARD_Y = 1.9;
  const BOARD_D = 0.15;
  const group = new THREE.Group();
  const postMat = new THREE.MeshStandardMaterial({ color: 0x6b4a2f });
  const postH = height + 0.6;
  for (const sx of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, postH, 12), postMat);
    post.position.set(sx * (width / 2 - 0.2), postH / 2, 0);
    post.castShadow = true;
    post.receiveShadow = true;
    group.add(post);
  }
  const board = new THREE.Mesh(
    new THREE.BoxGeometry(width, height, BOARD_D),
    new THREE.MeshStandardMaterial({ color: 0xb98a56 }),
  );
  board.position.y = BOARD_Y;
  board.castShadow = true;
  board.receiveShadow = true;
  group.add(board);

  const face = new THREE.Mesh(
    new THREE.PlaneGeometry(width * 0.94, height * 0.9),
    new THREE.MeshBasicMaterial({
      map: signTexture(sign.text), toneMapped: false,
      polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
    }),
  );
  face.position.set(0, BOARD_Y, BOARD_D / 2 + 0.09);
  group.add(face);

  group.position.set(sign.x, 0, sign.z);
  group.rotation.y = sign.rotY;
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
  marker.position.y = MARKER_Y;
  marker.visible = false;
  scene.add(marker);
  return marker;
}

// 도시 구역: 포장 광장 + 건물 터 2곳(건물 모델은 이후 단계). 납작한 면이라 지면과 깊이가 겹치지 않게 처리한다.
function flatPlane(width, depth, x, z, y, color, offset) {
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(width, depth),
    new THREE.MeshStandardMaterial({
      color, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: offset, polygonOffsetUnits: offset,
    }),
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(x, y, z);
  mesh.receiveShadow = true;
  return mesh;
}

export function buildCity(scene, layout) {
  const { plaza, buildingSlots } = layout;
  const group = new THREE.Group();
  group.add(flatPlane(plaza.x2 - plaza.x1, plaza.z2 - plaza.z1, (plaza.x1 + plaza.x2) / 2, (plaza.z1 + plaza.z2) / 2, PLAZA_Y, COLORS.plaza, -1));
  for (const s of buildingSlots) group.add(flatPlane(s.width, s.depth, s.x, s.z, PAD_Y, COLORS.pad, -2));
  scene.add(group);
  return group;
}

// 상호작용 대상마다 보이지 않는 클릭/호버 판정 부피(원기둥)를 만든다. 레이캐스트는 재질이 안 보여도 동작한다.
export function buildPickables(scene, interactables) {
  return interactables.map((it) => {
    const r = it.radius * 1.4;
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 2.2), new THREE.MeshBasicMaterial());
    mesh.material.visible = false;
    mesh.position.set(it.x, 1.1, it.z);
    mesh.userData.interactId = it.id;
    scene.add(mesh);
    return mesh;
  });
}

// ---- 소각장 상시 소품: 파쇄기와 손에 드는 종이 ----

const STRIP_MAX = 8; // 동시에 살아 있는 파쇄 조각 최대 수
const STRIP_LIFE = 0.6; // 조각이 사라지기까지(초)
const STRIP_COUNT = 6; // 파쇄 한 번에 떨어지는 조각 수(<= STRIP_MAX)
const WIGGLE_SEC = 0.08; // 파쇄기 흔들림 시간
const SHREDDER_BODY = { w: 1.4, h: 1.0, d: 0.8 };

// 불합격 통지서 무늬(384x512, 종이 비율 3:4): 연한 빨강 바탕, 위쪽 빨간 띠, 줄, 큰 라벨.
function noticeTexture(label) {
  const canvas = document.createElement('canvas');
  canvas.width = 384;
  canvas.height = 512;
  const g = canvas.getContext('2d');
  g.fillStyle = '#ffdcd8';
  g.fillRect(0, 0, canvas.width, canvas.height);
  g.fillStyle = '#d9463b';
  g.fillRect(0, 0, canvas.width, 64);
  g.fillStyle = '#e0aaa4';
  for (let i = 0; i < 8; i++) g.fillRect(40, 200 + i * 38, i % 2 ? 240 : 304, 12);
  g.fillStyle = '#22223a';
  g.font = 'bold 64px "Malgun Gothic", sans-serif';
  const fit = Math.min(1, (canvas.width - 40) / g.measureText(label).width); // 긴 라벨은 종이 폭에 맞춰 줄인다
  if (fit < 1) g.font = `bold ${Math.floor(64 * fit)}px "Malgun Gothic", sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(label, canvas.width / 2, 128);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

// 손에 드는 종이 한 장(불합격 통지서). width x depth 는 월드 단위 크기, 두께는 얇게.
export function buildPaper(width = 0.3, depth = 0.4) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(width, 0.015, depth),
    [0, 1, 2, 3, 4, 5].map((i) => (i === 2
      ? new THREE.MeshStandardMaterial({ map: noticeTexture('불합격 통지서'), emissive: 0x553333 }) // 윗면(+y)에 글씨
      : new THREE.MeshStandardMaterial({ color: 0xffdcd8, emissive: 0x553333 }))),
  );
  mesh.castShadow = true;
  return mesh;
}

// 파쇄기: 회색 상자 + 어두운 투입구. 바닥 y=0, 앞(+z)이 소각로를 향한다. wiggle() 로 흔들리고 spawnStrips() 로 조각이 떨어진다.
// 흔들림과 조각 애니메이션은 매 프레임 update(dt) 가 진행한다.
export function buildShredder(scene, shredder) {
  const group = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(SHREDDER_BODY.w, SHREDDER_BODY.h, SHREDDER_BODY.d),
    new THREE.MeshStandardMaterial({ color: 0x777788, emissive: 0x2a2a36 }),
  );
  body.position.y = SHREDDER_BODY.h / 2;
  body.castShadow = true;
  body.receiveShadow = true;
  const slot = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.04, 0.14), new THREE.MeshStandardMaterial({ color: 0x15151f }));
  slot.position.y = SHREDDER_BODY.h + 0.01;
  slot.receiveShadow = true;
  group.add(body, slot);
  group.position.set(shredder.x, 0, shredder.z);
  group.rotation.y = shredder.rotY;
  scene.add(group);

  const stripGeo = new THREE.BoxGeometry(0.05, 0.012, 0.3);
  const strips = []; // { mesh, vel, age }
  let wiggleT = -1;
  let wiggleSign = 1;

  function removeStrip(i) {
    const [s] = strips.splice(i, 1);
    scene.remove(s.mesh);
    s.mesh.material.dispose();
  }

  return {
    group,
    // 투입구의 월드 좌표(종이가 들어가는 곳).
    slotWorld(target = new THREE.Vector3()) {
      group.updateWorldMatrix(true, false);
      return group.localToWorld(target.set(0, SHREDDER_BODY.h + 0.05, 0));
    },
    wiggle() {
      wiggleT = 0;
      wiggleSign = -wiggleSign;
    },
    // 하얀 가는 조각 몇 개를 투입구 아래로 떨어뜨린다(동시에 최대 STRIP_MAX 개, STRIP_LIFE 초 뒤 사라진다).
    spawnStrips() {
      const yaw = group.rotation.y;
      group.updateWorldMatrix(true, false);
      for (let i = 0; i < STRIP_COUNT; i++) {
        if (strips.length >= STRIP_MAX) removeStrip(0);
        const mesh = new THREE.Mesh(stripGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true }));
        group.localToWorld(mesh.position.set((Math.random() - 0.5) * 0.8, SHREDDER_BODY.h, 0.1));
        mesh.rotation.y = yaw + (Math.random() - 0.5) * 0.6;
        scene.add(mesh);
        // 슬롯 위로 살짝 튀었다가 앞(소각로 쪽)으로 떨어진다.
        const vel = new THREE.Vector3((Math.random() - 0.5) * 0.8, 1.0 + Math.random() * 0.8, 0.5 + Math.random() * 0.8);
        vel.applyAxisAngle(THREE.Object3D.DEFAULT_UP, yaw);
        strips.push({ mesh, vel, age: 0 });
      }
    },
    update(dt) {
      if (wiggleT >= 0) {
        wiggleT += dt;
        const k = Math.min(1, wiggleT / WIGGLE_SEC);
        const pulse = Math.sin(Math.PI * k);
        group.scale.setScalar(1 + 0.1 * pulse);
        group.rotation.z = 0.07 * pulse * wiggleSign;
        if (k >= 1) wiggleT = -1;
      }
      for (let i = strips.length - 1; i >= 0; i--) {
        const s = strips[i];
        s.age += dt;
        if (s.age >= STRIP_LIFE) { removeStrip(i); continue; }
        s.vel.y -= 9 * dt;
        s.mesh.position.addScaledVector(s.vel, dt);
        s.mesh.material.opacity = 1 - (s.age / STRIP_LIFE) ** 2;
      }
    },
    stripCount: () => strips.length,
  };
}
