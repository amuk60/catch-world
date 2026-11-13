// 브라우저 전용: 건물 외관 배치(외관 자체는 buildingExterior.js), 간판 글씨 판, 세탁기 줄, 빨랫줄과 널린 빨래, 손에 드는 셔츠.
// 건물은 layout(logic/layout.js)의 buildings 에서, 세탁기·빨랫줄은 실내 데이터(logic/interiors.js)에서 온다(실내는 interiorLaundry.js 가 이 모듈의 buildWashers/buildClothesline 을 쓴다).
import * as THREE from 'three';
import {
  hangSlot, shirtColor, slotPoint, wobbleAmount, WOBBLE_SECONDS, foamBubble, FOAM_COUNT, FOAM_SECONDS, swingAngle, SWING_SECONDS,
} from './logic/laundry.js';
import { buildOfficeTower, buildShop } from './buildingExterior.js';

const MY_SHIRT_COLOR = 0xffffff; // 내 새 셔츠(흰색. 파스텔 셔츠와 구별된다)
const MY_SHIRT_GLOW = 0xb0b0b0;

// 건물 외관은 모델 없이 만든다(buildingExterior.js). main 이 미리 불러올 모델 조각은 없다.
export const LAUNDRY_MODEL_ITEMS = [];

// receive 를 끄면 얇은 판벽 조각의 그림자 줄무늬(shadow acne)가 사라진다. 지붕·소품은 받는다.
function shadowAll(root, receive = true) {
  root.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = true;
    o.receiveShadow = receive;
    for (const mat of [].concat(o.material)) mat.metalness = 0; // Kenney glb 재질은 metallic=1 이라 환경맵 없이는 검다
  });
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

// layout.buildings 의 모든 건물을 마당에 세운다: 면접장은 회사 빌딩, 세탁소는 상가. 건물 id -> { group }.
export function buildBuildings(scene, layout) {
  const entries = layout.buildings.map((b) => {
    const built = b.id === 'interview' ? buildOfficeTower(b) : buildShop(b);
    scene.add(built.group);
    return [b.id, built];
  });
  return Object.fromEntries(entries);
}
