// 브라우저 전용: 세탁소 건물 외관(Fantasy Town 판벽·지붕 조립 + 간판), 세탁기 줄, 빨랫줄과 널린 빨래, 손에 드는 셔츠.
// 건물은 layout(logic/layout.js)의 buildings 에서, 세탁기·빨랫줄은 실내 데이터(logic/interiors.js)에서 온다(실내는 interiorLaundry.js 가 이 모듈의 buildWashers/buildClothesline 을 쓴다).
import * as THREE from 'three';
import {
  hangSlot, shirtColor, slotPoint, wobbleAmount, WOBBLE_SECONDS, foamBubble, FOAM_COUNT, FOAM_SECONDS, swingAngle, SWING_SECONDS,
} from './logic/laundry.js';

const MY_SHIRT_COLOR = 0xffffff; // 내 새 셔츠(흰색. 파스텔 셔츠와 구별된다)
const MY_SHIRT_GLOW = 0xb0b0b0;

// 건물 조립에 쓰는 Fantasy Town 조각(main 이 미리 불러온다).
export const LAUNDRY_MODEL_ITEMS = ['wall', 'wall-door', 'wall-window-glass', 'wall-window-shutters', 'wall-window-small', 'roof-gable', 'roof-gable-end']
  .map((name) => ({ pack: 'fantasy', name }));

const PLASTER = 0xadb5d9; // 판벽 조각의 회반죽 색(박공 채움에 맞춘다)
const WALL_HEIGHT_TILES = 1; // 판벽 조각 하나의 높이(원본 단위)
// 지붕: 원본(높이 0.57)에 곱하는 높이 배율, 벽 위에 띄우는 높이(그 띠는 회반죽으로 채워 간판 자리가 된다), 앞뒤 처마 내밀기, 폭 방향 처마(양쪽 합) 여유
const ROOF = { scaleY: 1.5, lift: 0.45, overhang: 0.15, crossExtra: 0.5 };
const SIGN_TEXT = '세탁소';

// 로컬(정면 +z) 기준 벽 조각 배치. side: 어느 벽인지, 바깥을 향하는 방향각 yaw(원본 +x 면이 바깥).
const SIDES = {
  front: { yaw: -Math.PI / 2 },
  back: { yaw: Math.PI / 2 },
  right: { yaw: 0 },
  left: { yaw: Math.PI },
};
const FRONT_WALL = ['wall-door', 'wall-window-glass', 'wall-window-glass']; // 로컬 x 작은 쪽(북)부터: 문은 북쪽 끝
const BACK_WALL = ['wall', 'wall-window-small', 'wall'];
const RIGHT_WALL = ['wall-window-shutters', 'wall']; // 앞쪽(+z)부터
const LEFT_WALL = ['wall', 'wall-window-shutters'];

// receive 를 끄면 얇은 판벽 조각의 그림자 줄무늬(shadow acne)가 사라진다. 지붕·소품은 받는다.
function shadowAll(root, receive = true) {
  root.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = true;
    o.receiveShadow = receive;
    for (const mat of [].concat(o.material)) mat.metalness = 0; // Kenney glb 재질은 metallic=1 이라 환경맵 없이는 검다
  });
}

function piece(models, name, receive = true) {
  const model = models.get(`fantasy/${name}`);
  if (!model) return null;
  const clone = model.clone(true);
  shadowAll(clone, receive);
  return clone;
}

// 나무 간판 글씨 판(world.js 의 'Catch World' 팻말과 같은 밝은 나무판·어두운 글씨).
export function signTexture(text) {
  const canvas = document.createElement('canvas');
  canvas.width = 768;
  canvas.height = 256;
  const g = canvas.getContext('2d');
  g.fillStyle = '#d9b27c';
  g.fillRect(0, 0, canvas.width, canvas.height);
  g.strokeStyle = '#8a5f3a';
  g.lineWidth = 14;
  g.strokeRect(7, 7, canvas.width - 14, canvas.height - 14);
  let size = 150;
  const font = (px) => `bold ${px}px "Malgun Gothic", sans-serif`;
  g.font = font(size);
  while (size > 20 && g.measureText(text).width > canvas.width * 0.8) {
    size -= 4;
    g.font = font(size);
  }
  g.fillStyle = '#4a2f1a';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, canvas.width / 2, canvas.height / 2 + 6);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

// 세탁소 건물. 그룹의 로컬 +z 가 정면(문), 로컬 y=0 이 바닥이다.
function buildBuilding(scene, b, models) {
  const group = new THREE.Group();
  const T = b.tile;
  const hw = b.width / 2;
  const hd = b.depth / 2;
  const missing = ['wall', 'wall-door', 'roof-gable'].some((n) => !models.get(`fantasy/${n}`));
  // 지붕(박공 두 조각과 앞뒤 삼각형)은 벽 윗면을 축으로 세로로 줄어든다(플레이어가 가까이 가면 캐릭터가 가려지지 않게).
  const roofGroup = new THREE.Group();

  const plaster = new THREE.MeshStandardMaterial({ color: PLASTER, roughness: 0.9 });
  if (missing) {
    // 모델을 못 불러왔을 때: 색 상자(벽 0xe8dcc8, 지붕 0x8a4b3a, 문 0x6b4a2f).
    const walls = new THREE.Mesh(new THREE.BoxGeometry(b.width, T, b.depth), new THREE.MeshStandardMaterial({ color: 0xe8dcc8 }));
    walls.position.y = T / 2;
    const roof = new THREE.Mesh(new THREE.ConeGeometry(Math.hypot(hw, hd) * 1.05, 1.4, 4, 1), new THREE.MeshStandardMaterial({ color: 0x8a4b3a }));
    roof.rotation.y = Math.PI / 4;
    roof.position.y = T + 0.7;
    const door = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.5, 0.1), new THREE.MeshStandardMaterial({ color: 0x6b4a2f }));
    door.position.set(b.doorLocalX ?? -1.8, 0.75, hd + 0.05);
    for (const m of [walls, roof, door]) { m.castShadow = true; m.receiveShadow = true; }
    group.add(walls, roof, door);
  } else {
    // 벽: 정면 3칸, 뒷면 3칸, 양옆 2칸. 조각의 바깥 면(+x)이 건물 가장자리에 오도록 안쪽으로 반 칸 들여 놓는다.
    const place = (name, side, lx, lz) => {
      const m = piece(models, name, false);
      if (!m) return;
      m.scale.setScalar(T);
      m.rotation.y = SIDES[side].yaw;
      m.position.set(lx, 0, lz);
      group.add(m);
    };
    FRONT_WALL.forEach((n, i) => place(n, 'front', (i - 1) * T, hd - T / 2));
    BACK_WALL.forEach((n, i) => place(n, 'back', (i - 1) * T, -hd + T / 2));
    RIGHT_WALL.forEach((n, i) => place(n, 'right', hw - T / 2, hd - T / 2 - i * T));
    LEFT_WALL.forEach((n, i) => place(n, 'left', -hw + T / 2, hd - T / 2 - i * T));

    // 지붕: 용마루가 앞뒤(로컬 z)로 가는 박공. 원본 roof-gable 은 용마루가 x 방향이라 -90도 돌려 놓고 폭(원본 z)·높이만 늘린다.
    const roofLen = b.depth + 2 * ROOF.overhang;
    const roofSpan = b.width + ROOF.crossExtra;
    const wallTop = T * WALL_HEIGHT_TILES;
    const base = ROOF.lift; // roofGroup 기준(roofGroup 은 벽 윗면 높이)
    roofGroup.position.y = wallTop;
    group.add(roofGroup);
    for (const k of [0, 1]) {
      const r = piece(models, 'roof-gable');
      r.rotation.y = -Math.PI / 2; // 원본 +x(용마루) -> 로컬 +z
      r.scale.set(roofLen / 2 / 1.1, ROOF.scaleY, roofSpan / 1.08); // 회전 전 기준 (x: 용마루 방향, y: 높이, z: 폭)
      r.position.set(0, base, -roofLen / 4 + k * (roofLen / 2));
      roofGroup.add(r);
    }
    // 앞뒤 박공 삼각형 채움(회반죽).
    const rise = 0.57 * ROOF.scaleY; // 지붕 높이
    const tri = new THREE.Shape();
    tri.moveTo(-hw, 0);
    tri.lineTo(hw, 0);
    tri.lineTo(0, rise * 0.93);
    tri.closePath();
    const triGeo = new THREE.ExtrudeGeometry(tri, { depth: 0.18, bevelEnabled: false });
    for (const sz of [1, -1]) {
      const fill = new THREE.Mesh(triGeo, plaster);
      fill.position.set(0, base, sz > 0 ? hd - 0.2 : -hd + 0.02);
      fill.castShadow = true;
      roofGroup.add(fill);
    }
    // 벽 위 띠(둘레 전체): 지붕을 ROOF.lift 만큼 띄운 틈을 회반죽으로 채운다. 앞쪽 띠가 간판 자리다.
    const band = ROOF.lift + 0.02;
    for (const [w, d, x, z] of [[b.width, 0.18, 0, hd - 0.09], [b.width, 0.18, 0, -hd + 0.09], [0.18, b.depth - 0.36, hw - 0.09, 0], [0.18, b.depth - 0.36, -hw + 0.09, 0]]) {
      const strip = new THREE.Mesh(new THREE.BoxGeometry(w, band, d), plaster);
      strip.position.set(x, wallTop + band / 2 - 0.01, z);
      strip.castShadow = true;
      group.add(strip);
    }
  }

  // 바닥(창으로 들여다보일 때 허공이 비치지 않게).
  const floor = new THREE.Mesh(new THREE.BoxGeometry(b.width - 0.3, 0.06, b.depth - 0.3), new THREE.MeshStandardMaterial({ color: 0x8d7a66 }));
  floor.position.y = 0.03;
  group.add(floor);

  // 문 위 간판: 문 칸(로컬 x = doorLocalX) 위, 정면 벽 바깥.
  const sign = new THREE.Group();
  const board = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.46, 0.1), new THREE.MeshStandardMaterial({ color: 0xb98a56 }));
  board.castShadow = true;
  const face = new THREE.Mesh(
    new THREE.PlaneGeometry(1.5, 0.4),
    new THREE.MeshBasicMaterial({ map: signTexture(SIGN_TEXT), toneMapped: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }),
  );
  face.position.z = 0.056;
  sign.add(board, face);
  sign.position.set(b.doorLocalX ?? -1.8, T + ROOF.lift / 2 + 0.01, hd + 0.04);
  group.add(sign);

  group.position.set(b.x, 0, b.z);
  group.rotation.y = b.rotY;
  scene.add(group);
  return { group, sign, roofGroup };
}

// ---- 셔츠 ----
// 반팔 셔츠 윤곽(XY 평면, 법선 +z): 폭 0.5 x 높이 0.7, 윗변(옷깃 위)이 y=0.35.
function shirtShape() {
  const s = new THREE.Shape();
  s.moveTo(-0.09, 0.35);
  s.lineTo(-0.25, 0.27);
  s.lineTo(-0.25, 0.1);
  s.lineTo(-0.15, 0.06);
  s.lineTo(-0.15, -0.35);
  s.lineTo(0.15, -0.35);
  s.lineTo(0.15, 0.06);
  s.lineTo(0.25, 0.1);
  s.lineTo(0.25, 0.27);
  s.lineTo(0.09, 0.35);
  s.lineTo(0.0, 0.29); // 목 둘레(살짝 파임)
  s.closePath();
  return s;
}
const SHIRT_GEO = new THREE.ExtrudeGeometry(shirtShape(), { depth: 0.015, bevelEnabled: false });
SHIRT_GEO.translate(0, 0, -0.0075);

function cloth(color) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.95, side: THREE.DoubleSide });
}

// 손에 드는 깨끗한 흰 셔츠(납작): 손 기준으로 법선이 +z, 긴 방향이 y.
export function buildCleanShirt() {
  const group = new THREE.Group();
  const mesh = new THREE.Mesh(SHIRT_GEO, cloth(0xffffff));
  mesh.castShadow = true;
  mesh.scale.setScalar(0.85);
  group.add(mesh);
  return group;
}

// 손에 드는 구겨진 셔츠: 연한 파랑·흰 주름 덩어리 몇 개(고정된 모양, 난수 없음).
// group.userData.setSoiled(true) 로 그을음 묻은 어두운 색으로 바꾼다(소각 뒤 더러워진 내 셔츠를 세탁기에 넣을 때). false 면 원래 색.
export function buildCrumpledShirt() {
  const group = new THREE.Group();
  const lumps = [
    [0, 0, 0, 0.13, 0x8fc2f5], [0.09, 0.05, 0.03, 0.085, 0xffffff], [-0.08, -0.04, 0.04, 0.09, 0xa6d0fa], [0.02, -0.09, -0.05, 0.07, 0xe8f3ff],
  ];
  const SOILED = [0x3b3a3c, 0x6b655d, 0x2a292b, 0x57514a]; // 덩어리별 때 묻은 색(검은 그을음 + 누런 때)
  const meshes = [];
  lumps.forEach(([x, y, z, r, color], i) => {
    const geo = new THREE.IcosahedronGeometry(r, 1);
    const p = geo.attributes.position;
    for (let v = 0; v < p.count; v++) { // 결정적인 찌그러뜨림
      const k = 1 + 0.22 * Math.sin(v * 12.9898 + i * 7.1) * Math.cos(v * 4.1414 + i);
      p.setXYZ(v, p.getX(v) * k, p.getY(v) * k, p.getZ(v) * k);
    }
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color, roughness: 1, flatShading: true }));
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.userData.clean = color;
    meshes.push(mesh);
    group.add(mesh);
  });
  group.userData.setSoiled = (soiled) => meshes.forEach((m, i) => m.material.color.setHex(soiled ? SOILED[i] : m.userData.clean));
  return group;
}

// ---- 세탁기 줄 ----
export function buildWashers(scene, washers, models) {
  const unit = new THREE.Vector3();
  const items = washers.map((w) => {
    const wrapper = new THREE.Group();
    const model = models.get(`${w.pack}/${w.name}`);
    let height = 1.2;
    if (model) {
      const m = model.clone(true);
      shadowAll(m);
      m.scale.setScalar(w.scale);
      const box = new THREE.Box3().setFromObject(m); // 크기 적용 후 경계
      m.position.set(-(box.min.x + box.max.x) / 2, -box.min.y, -(box.min.z + box.max.z) / 2); // 바닥 중심을 원점에
      height = box.max.y - box.min.y;
      wrapper.add(m);
    } else {
      const box = new THREE.Mesh(new THREE.BoxGeometry(1, 1.2, 1.2), new THREE.MeshStandardMaterial({ color: 0xdddddd }));
      box.position.y = 0.6;
      box.castShadow = true;
      wrapper.add(box);
    }
    wrapper.position.set(w.x, 0, w.z);
    wrapper.rotation.y = w.rotY;
    scene.add(wrapper);

    const foam = [];
    for (let i = 0; i < FOAM_COUNT; i++) {
      const bubble = new THREE.Mesh(new THREE.SphereGeometry(1, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true }));
      bubble.visible = false;
      scene.add(bubble);
      foam.push(bubble);
    }
    return { wrapper, height, foam, wobbleT: -1, foamT: -1, top: new THREE.Vector3(w.x, height, w.z) };
  });

  return {
    count: items.length,
    // 투입구(윗면 가운데, 살짝 앞)의 월드 좌표: 구겨진 셔츠가 날아가 들어가는 곳.
    entryWorld(i, target = new THREE.Vector3()) {
      const it = items[i];
      it.wrapper.updateWorldMatrix(true, false);
      return it.wrapper.localToWorld(target.set(0, it.height + 0.02, 0.05));
    },
    // 흔들림(~1.2초)과 거품(~0.8초)을 시작한다.
    splash(i) {
      items[i].wobbleT = 0;
      items[i].foamT = 0;
    },
    activeFoam: () => items.reduce((n, it) => n + it.foam.filter((b) => b.visible).length, 0),
    update(dt) {
      for (const it of items) {
        if (it.wobbleT >= 0) {
          it.wobbleT += dt;
          const a = wobbleAmount(it.wobbleT);
          it.wrapper.rotation.z = 0.1 * a;
          it.wrapper.rotation.x = 0.04 * a * Math.cos(it.wobbleT * 9);
          if (it.wobbleT >= WOBBLE_SECONDS) { it.wobbleT = -1; it.wrapper.rotation.z = 0; it.wrapper.rotation.x = 0; }
        }
        if (it.foamT >= 0) {
          it.foamT += dt;
          it.wrapper.updateWorldMatrix(true, false);
          unit.set(0, it.height + 0.05, 0.05);
          it.wrapper.localToWorld(unit);
          it.foam.forEach((mesh, k) => {
            const b = foamBubble(k, it.foamT);
            mesh.visible = b.visible;
            if (!b.visible) return;
            mesh.position.set(unit.x + b.x, unit.y + b.y, unit.z + b.z);
            mesh.scale.setScalar(b.scale);
            mesh.material.opacity = b.opacity;
          });
          if (it.foamT >= FOAM_SECONDS) { it.foamT = -1; for (const mesh of it.foam) mesh.visible = false; }
        }
      }
    },
  };
}

// ---- 빨랫줄 ----
export function buildClothesline(scene, line) {
  const group = new THREE.Group();
  const postMat = new THREE.MeshStandardMaterial({ color: 0x6b4a2f });
  for (const [x, z] of [[line.x1, line.z1], [line.x2, line.z2]]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, line.postHeight, 8), postMat);
    post.position.set(x, line.postHeight / 2, z);
    post.castShadow = true;
    group.add(post);
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), postMat);
    cap.position.set(x, line.postHeight + 0.02, z);
    group.add(cap);
  }
  // 팽팽한 줄: 두 기둥의 줄 높이를 잇는 가는 원기둥.
  const dx = line.x2 - line.x1;
  const dz = line.z2 - line.z1;
  const len = Math.hypot(dx, dz);
  const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, len, 6), new THREE.MeshStandardMaterial({ color: 0xdddddd }));
  rope.position.set(line.centre.x, line.y, line.centre.z);
  rope.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(dx, 0, dz).normalize()); // 원기둥 축(y)을 줄 방향으로
  group.add(rope);
  scene.add(group);

  // 걸린 빨래 slots 칸: 처음엔 숨김. 줄을 축으로 흔들리도록 줄 방향을 향한 피벗에 단다.
  const yaw = -Math.atan2(dz, dx); // 피벗 로컬 +x 가 줄 방향
  const pinMat = new THREE.MeshStandardMaterial({ color: 0x6b4a2f });
  const slots = Array.from({ length: line.slots }, (_, i) => {
    const pivot = new THREE.Group();
    pivot.rotation.order = 'YXZ';
    const p = slotPoint(line, i);
    pivot.position.set(p.x, p.y, p.z);
    pivot.rotation.y = yaw;
    const shirt = new THREE.Mesh(SHIRT_GEO, cloth(0xffffff));
    shirt.position.y = -0.35 - 0.02; // 윗변(옷깃 위)이 줄에 닿게
    shirt.castShadow = true;
    pivot.add(shirt);
    for (const px of [-0.14, 0.14]) {
      const pin = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.09, 0.05), pinMat);
      pin.position.set(px, -0.02, 0);
      pivot.add(pin);
    }
    pivot.visible = false;
    scene.add(pivot);
    return { pivot, shirt, t: -1 };
  });

  let mine = -1; // 내 새 셔츠가 걸린 칸(없으면 -1)
  return {
    slots: slots.length,
    // count 번째(0부터) 널기: 칸 hangSlot(count) 에 파스텔 셔츠를 건다(가득 차면 가장 오래된 것을 바꾼다). 건 칸 번호를 돌려준다.
    // reserved(0 이상)는 건너뛸 칸(내 새 셔츠가 걸려 있는 동안 그 칸).
    hang(count, reserved = -1) {
      const i = hangSlot(count, slots.length, reserved);
      const s = slots[i];
      s.shirt.material.color.setHex(shirtColor(count));
      s.shirt.material.emissive.setHex(0x000000);
      s.pivot.visible = true;
      s.t = 0;
      return i;
    },
    // "내 셔츠": 새 흰 와이셔츠를 전용 칸 slot 에 건다(그 칸에 걸려 있던 파스텔 셔츠는 대체된다). 흰색이고 흔들린다.
    hangMine(slot) {
      const s = slots[slot];
      s.shirt.material.color.setHex(MY_SHIRT_COLOR);
      s.shirt.material.emissive.setHex(MY_SHIRT_GLOW); // 실내 조명이 약해 흰 천이 회색으로 보이므로 살짝 스스로 빛나게 한다
      s.pivot.visible = true;
      s.t = 0;
      mine = slot;
      return slot;
    },
    // 내 셔츠를 줄에서 내린다(입었거나 다시 하기). 칸은 비워 둔다.
    removeMine() {
      if (mine < 0) return;
      slots[mine].pivot.visible = false;
      slots[mine].t = -1;
      slots[mine].pivot.rotation.x = 0;
      mine = -1;
    },
    mineSlot: () => mine,
    visibleCount: () => slots.filter((s) => s.pivot.visible).length,
    update(dt) {
      for (const s of slots) {
        if (s.t < 0) continue;
        s.t += dt;
        s.pivot.rotation.x = swingAngle(s.t);
        if (s.t >= SWING_SECONDS) { s.t = -1; s.pivot.rotation.x = 0; }
      }
    },
  };
}

// 세탁소 건물 외관을 씬에 올린다. models: loadModels 결과(없는 조각은 색 상자로 대체).
export function buildLaundryBuilding(scene, layout, models) {
  return buildBuilding(scene, layout.buildings.find((b) => b.id === 'laundry'), models);
}
