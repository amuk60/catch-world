import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { YARD, FURNACE, SPAWN, COLORS } from './config.js';
import { signCanvas, liveSignTexture, drawSignText, fitSignFont } from './signFont.js';
import { SHREDDER_PLATE } from './logic/signText.js';

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
  return liveSignTexture(() => {
    const { canvas, g } = signCanvas(1024, 384);
    g.fillStyle = '#d9b27c';
    g.fillRect(0, 0, 1024, 384);
    g.strokeStyle = '#8a5f3a';
    g.lineWidth = 14;
    g.strokeRect(7, 7, 1024 - 14, 384 - 14);
    drawSignText(g, text, { x: 512, y: 196, maxW: 1024 * 0.85, size: 190, color: '#4a2f1a', face: 'yard', minPx: 20, shadow: 'rgba(255,240,205,0.55)', shadowOff: 4 });
    return canvas;
  });
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
    const r = it.pickRadius ?? it.radius * 1.4; // 노점처럼 넓은 대상은 pickRadius 로 넓힌다
    const h = it.pickHeight ?? 2.2; // 건물처럼 키가 큰 대상은 pickHeight 로 높인다
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h), new THREE.MeshBasicMaterial());
    mesh.material.visible = false;
    mesh.position.set(it.x, h / 2, it.z);
    mesh.userData.interactId = it.id;
    scene.add(mesh);
    return mesh;
  });
}

// ---- 소각장 상시 소품: 파쇄기와 손에 드는 종이 ----

const SHAKE_SEC = 1.1; // 파쇄기가 덜덜 떠는 시간(조각이 쏟아지는 동안)
const POUR_COUNT = 56; // 쏟아지는 조각 풀(동시에 떨어질 수 있는 최대 수)
const POUR_SEC = 1.0; // 한 번에 조각이 쏟아지는 시간
const POUR_PER_RUN = 34; // 파쇄 한 번에 쏟아지는 조각 수
const PILE_MAX = 54; // 통 안에 쌓이는 조각 최대 수(많이 하면 수북해진다)
const PILE_PER_RUN = 9; // 파쇄 한 번에 더미가 늘어나는 조각 수
const PILE_HOLD_SEC = 14; // 마지막 파쇄 뒤 이 시간이 지나면 더미가 천천히 줄기 시작한다(바닥에 흩어지지 않고 서서히 사라진다)
const PILE_DECAY_SEC = 0.7; // 줄어드는 조각 하나당 걸리는 시간
const BIN = { x: -1.15, w: 0.62, d: 0.95, h: 0.2, wall: 0.04 }; // 파쇄기 정면 기준 왼쪽 옆(-x: 정면이 스폰 쪽이라 기본 카메라에서 보이는 면)에 놓인 조각 통(파쇄기 기준 로컬). 틈에서 쏟아진 조각이 여기 쌓인다.
const SHREDDER_BODY = { w: 1.4, h: 1.0, d: 0.8 };
const SLOT_Z = 0.2; // 투입구는 몸통 앞쪽(작업 자리 쪽)에 치우쳐 있어 서 있는 사람의 손이 닿는다
const SLOT_Y = SHREDDER_BODY.h + 0.03; // 투입구 윗면 높이(월드 y): 종이는 이 아래로 들어가면 안 보인다(클리핑)
const GRIND_STRIPS = 46; // 종이 한 장이 다 갈리는 동안 쏟아지는 조각 수

// 손에 드는 종이(불합격 통지서)는 notice.js 에서 만든다.
export { buildPaper } from './notice.js';


// 파쇄기 몸통 명판: 어두운 강판에 "스트레스 파쇄기"를 새긴(레이저 각인) 모양 + 빨간 띠 + 작은 영문 줄. 고해상도 캔버스(signFont 의 SIGN_SCALE 배 + 밉맵·이방성).
const PLATE = { w: 1.32, h: 0.48, lw: 1100, lh: 400 }; // 월드 크기(w x h)와 캔버스 논리 크기
function shredderPlateTexture() {
  return liveSignTexture(() => {
    const { canvas, g } = signCanvas(PLATE.lw, PLATE.lh);
    const { lw, lh } = PLATE;
    const steel = g.createLinearGradient(0, 0, 0, lh);
    steel.addColorStop(0, '#454c58'); steel.addColorStop(0.5, '#2f353f'); steel.addColorStop(1, '#262b33');
    g.fillStyle = steel;
    g.fillRect(0, 0, lw, lh);
    for (let y = 6; y < lh; y += 5) { // 솔질한 강판 결
      g.fillStyle = `rgba(255,255,255,${0.018 + ((y * 7) % 5) * 0.006})`;
      g.fillRect(0, y, lw, 1.5);
    }
    g.lineWidth = 6; // 테두리 모서리 윤곽(위·왼쪽 밝게, 아래·오른쪽 어둡게)
    g.strokeStyle = 'rgba(190,200,214,0.55)'; g.beginPath(); g.moveTo(9, lh - 9); g.lineTo(9, 9); g.lineTo(lw - 9, 9); g.stroke();
    g.strokeStyle = 'rgba(0,0,0,0.65)'; g.beginPath(); g.moveTo(lw - 9, 9); g.lineTo(lw - 9, lh - 9); g.lineTo(9, lh - 9); g.stroke();
    for (const [rx, ry] of [[34, 34], [lw - 34, 34], [34, lh - 34], [lw - 34, lh - 34]]) { // 나사
      g.fillStyle = '#7b8494'; g.beginPath(); g.arc(rx, ry, 11, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#20242b'; g.fillRect(rx - 8, ry - 1.5, 16, 3);
    }
    g.fillStyle = '#d63a3a'; g.fillRect(70, 38, lw - 140, 16); // 빨간 포인트 띠
    g.fillStyle = 'rgba(255,255,255,0.25)'; g.fillRect(70, 38, lw - 140, 3);
    // 큰 글씨(각인): 아래로 떨어지는 그림자 + 어두운 테두리(파인 느낌) + 은빛 속 + 위쪽 어두운 안쪽 그림자 줄
    const cx = lw / 2;
    const cy = 168;
    const fit = fitSignFont(g, SHREDDER_PLATE, { maxW: lw - 110, size: 190, face: 'plate', minPx: 40 });
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
    g.fillStyle = 'rgba(255,255,255,0.32)'; g.fillText(SHREDDER_PLATE, cx + 2, cy + 5); // 파인 아랫선 하이라이트
    g.strokeStyle = 'rgba(8,10,14,0.9)'; g.lineWidth = Math.max(5, fit.size * 0.05); g.strokeText(SHREDDER_PLATE, cx, cy);
    const silver = g.createLinearGradient(0, cy - fit.size / 2, 0, cy + fit.size / 2);
    silver.addColorStop(0, '#ffffff'); silver.addColorStop(0.55, '#e3e7ee'); silver.addColorStop(1, '#a9b1be');
    g.fillStyle = silver; g.fillText(SHREDDER_PLATE, cx, cy);
    g.fillStyle = 'rgba(20,24,30,0.28)'; g.fillText(SHREDDER_PLATE, cx - 1.5, cy - 4); // 위쪽 안쪽 그림자 느낌
    // 영문 줄
    const sub = 'STRESS  SHREDDER';
    fitSignFont(g, sub, { maxW: lw - 360, size: 60, face: 'plate', minPx: 20 });
    g.fillStyle = 'rgba(255,255,255,0.22)'; g.fillText(sub, cx + 1.5, 324 + 2.5);
    g.fillStyle = '#aab3c1'; g.fillText(sub, cx, 324);
    g.fillStyle = '#d63a3a'; g.fillRect(70, 366, lw - 140, 6); // 아래 가는 빨간 줄
    return canvas;
  });
}

// 파쇄기: 회색 상자 + 어두운 투입구(+ 켜지는 표시등) + 옆에 놓인 조각 통. 바닥 y=0, 앞(+z)이 스폰 쪽(작업 자리 쪽)이다.
// beginGrind(palette, seconds) -> setFeed(k) -> endGrind(): 종이가 투입구로 내려가는 진행(k 0~1)에 맞춰 덜덜 떨고 그 색의 가는 조각이 아래 틈에서 쏟아져 통에 쌓인다(표시등·투입구가 켜진다).
// shake()/wiggle() 로 덜덜 떨고, pour() 로 조각이 아래 틈에서 한꺼번에 쏟아져 통에 쌓인다(조각 풀 하나 + 더미 한 덩어리 = InstancedMesh 하나, 그리기 호출 1). 통은 한 덩어리 메시다.
// 쏟아짐·더미·흔들림은 매 프레임 update(dt) 가 진행한다. 더미는 파쇄할수록 수북해지고 한동안 안 하면 천천히 줄어든다.
export function buildShredder(scene, shredder) {
  const group = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(SHREDDER_BODY.w, SHREDDER_BODY.h, SHREDDER_BODY.d),
    new THREE.MeshStandardMaterial({ color: 0x777788, emissive: 0x2a2a36 }),
  );
  body.position.y = SHREDDER_BODY.h / 2;
  body.castShadow = true;
  body.receiveShadow = true;
  const slotMat = new THREE.MeshStandardMaterial({ color: 0x15151f, emissive: 0x000000 });
  const slot = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.04, 0.14), slotMat);
  slot.position.set(0, SHREDDER_BODY.h + 0.01, SLOT_Z);
  slot.receiveShadow = true;
  // 아래 앞쪽의 조각 나오는 틈(어두운 줄).
  const outlet = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.05, 0.6), new THREE.MeshBasicMaterial({ color: 0x101018 }));
  outlet.position.set(-SHREDDER_BODY.w / 2 - 0.005, 0.22, 0);
  // 표시등: 정면 윗쪽 모서리의 작은 등(평소엔 꺼진 회색, 갈 때 초록으로 켜진다).
  const lampMat = new THREE.MeshBasicMaterial({ color: 0x3a3f46 });
  const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.07, 0.03), lampMat);
  lamp.position.set(0.5, SHREDDER_BODY.h - 0.12, SHREDDER_BODY.d / 2 + 0.012);
  // 명판: 정면(+z, 스폰 쪽)에만 붙인다. 깊이 겹침 방지로 몸통에서 4mm 띄우고 polygonOffset 을 준다.
  const plateTex = shredderPlateTexture();
  const plateMat = new THREE.MeshStandardMaterial({
    map: plateTex, emissive: 0xffffff, emissiveMap: plateTex, emissiveIntensity: 0.4, roughness: 0.5, metalness: 0,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  });
  const plate = new THREE.Mesh(new THREE.PlaneGeometry(PLATE.w, PLATE.h), plateMat);
  plate.position.set(0, 0.46, SHREDDER_BODY.d / 2 + 0.004);
  // 조각 통: 바닥 + 벽 4개를 한 덩어리로 합친다.
  const walls = [
    [BIN.w, BIN.wall, BIN.d, 0, BIN.wall / 2, 0], // 바닥
    [BIN.w, BIN.h, BIN.wall, 0, BIN.h / 2, BIN.d / 2 - BIN.wall / 2], // 앞
    [BIN.w, BIN.h, BIN.wall, 0, BIN.h / 2, -BIN.d / 2 + BIN.wall / 2], // 뒤
    [BIN.wall, BIN.h, BIN.d, BIN.w / 2 - BIN.wall / 2, BIN.h / 2, 0],
    [BIN.wall, BIN.h, BIN.d, -BIN.w / 2 + BIN.wall / 2, BIN.h / 2, 0],
  ].map(([w, h, d, x, y, z]) => new THREE.BoxGeometry(w, h, d).translate(x, y, z));
  const bin = new THREE.Mesh(mergeGeometries(walls), new THREE.MeshStandardMaterial({ color: 0x59657a, emissive: 0x1c2230, roughness: 0.8 }));
  bin.position.set(BIN.x, 0, 0);
  bin.castShadow = true;
  bin.receiveShadow = true;

  // 조각: 얇고 긴 상자. 풀(0..POUR_COUNT-1: 떨어지는 조각) 뒤에 더미(PILE_MAX 개)가 이어진다.
  const stripGeo = new THREE.BoxGeometry(0.028, 0.012, 0.3);
  const total = POUR_COUNT + PILE_MAX;
  const strips = new THREE.InstancedMesh(stripGeo, new THREE.MeshBasicMaterial({ color: 0xffffff }), total);
  strips.frustumCulled = false;
  const tints = [0xffffff, 0xf3efe2, 0xe4e6ee, 0xfaf4dc];
  for (let i = 0; i < total; i++) strips.setColorAt(i, new THREE.Color(tints[i % tints.length]));
  strips.instanceColor.needsUpdate = true;
  group.add(body, slot, outlet, lamp, plate, bin, strips);
  group.position.set(shredder.x, 0, shredder.z);
  group.rotation.y = shredder.rotY;
  scene.add(group);

  // 결정적 난수(더미 모양은 늘 같다).
  let seed = 13;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const pileSpots = Array.from({ length: PILE_MAX }, (_, i) => {
    const layer = Math.floor(i / 18); // 아래층부터 채우고 위로 쌓는다(위로 갈수록 좁은 더미)
    const r = 1 - layer * 0.3;
    return { x: (rnd() - 0.5) * (BIN.w - 0.2) * r, z: (rnd() - 0.5) * (BIN.d - 0.16) * r, y: BIN.wall + 0.008 + layer * 0.03 + rnd() * 0.012, yaw: rnd() * Math.PI, tilt: (rnd() - 0.5) * 0.35 };
  });
  const dummy = new THREE.Object3D();
  const pour = Array.from({ length: POUR_COUNT }, () => ({ color: 0xffffff, live: false, age: 0, delay: 0, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, spin: 0, yaw: 0, land: 0 }));
  let pileShown = 0; // 지금 보이는 더미 조각 수(실수: 쌓일 때 늘고, 줄어들 때 준다)
  let pileTarget = 0;
  let idleSince = 0;
  let grinding = false;
  let emitted = 0; // 이번 종이에서 내보낸 조각 수
  let emitLeft = 0; // 아직 내보낼 조각 수
  let emitClock = 0;
  let pending = 0; // 떨어진 조각이 더미에 더해질 몫
  let shakeT = -1;
  let shakeLen = SHAKE_SEC;
  let shakeSign = 1;
  let dirty = true;

  function hideInstance(i) {
    dummy.position.set(0, -5, 0);
    dummy.scale.setScalar(0.0001);
    dummy.rotation.set(0, 0, 0);
    dummy.updateMatrix();
    strips.setMatrixAt(i, dummy.matrix);
  }
  for (let i = 0; i < total; i++) hideInstance(i);

  const tint = new THREE.Color();
  let palette = [0xffffff]; // 이번 종이 조각 색들(beginGrind 가 정한다)
  let pileSlot = 0; // 다음에 조각 색을 입힐 더미 자리
  function emit() {
    const p = pour.find((q) => !q.live);
    if (!p) return;
    p.color = palette[Math.floor(rnd() * palette.length)];
    strips.setColorAt(pour.indexOf(p), tint.set(p.color));
    strips.instanceColor.needsUpdate = true;
    p.live = true;
    p.age = 0;
    p.x = -SHREDDER_BODY.w / 2 - 0.01;
    p.y = 0.2;
    p.z = (rnd() - 0.5) * 0.6;
    p.vx = -(0.28 + rnd() * 0.4); // 옆(통 쪽)으로 흘러나온다
    p.vy = -0.2 - rnd() * 0.3;
    p.vz = (rnd() - 0.5) * 0.25;
    p.spin = (rnd() - 0.5) * 8;
    p.yaw = (rnd() - 0.5) * 0.9;
    p.land = BIN.wall + 0.02 + 0.03 * Math.min(1, pileShown / PILE_MAX);
  }

  return {
    group,
    // 투입구의 월드 좌표(종이가 들어가는 곳).
    slotWorld(target = new THREE.Vector3()) {
      group.updateWorldMatrix(true, false);
      return group.localToWorld(target.set(0, SLOT_Y, SLOT_Z));
    },
    // seconds 동안 덜덜 떤다(한 번 더 부르면 처음부터).
    shake(seconds = SHAKE_SEC) {
      shakeT = 0;
      shakeLen = seconds;
      shakeSign = -shakeSign;
    },
    wiggle() { this.shake(0.08); },
    // 조각이 아래 틈에서 쏟아진다(POUR_SEC 동안 POUR_PER_RUN 개). 떨어진 조각만큼 더미가 늘어난다.
    pour() {
      emitLeft = POUR_PER_RUN;
      emitClock = 0;
      pending += PILE_PER_RUN;
      idleSince = 0;
    },
    // 종이를 가는 동안: beginGrind(palette: 조각 색 목록, seconds) 로 시작(표시등 켜짐·떨림), setFeed(k: 0~1 종이가 들어간 정도) 를 매 프레임 불러 진행에 맞춰 조각을 내보내고, endGrind() 로 끝낸다(마지막 조각이 떨어지는 동안 더미가 자리 잡는다).
    beginGrind(colors, seconds) {
      palette = colors?.length ? colors : [0xffffff];
      grinding = true;
      emitted = 0;
      pending += PILE_PER_RUN;
      idleSince = 0;
      this.shake(seconds + 0.3);
      lampMat.color.set(0x56f08a);
      slotMat.emissive.set(0x5a1f10);
    },
    setFeed(k) {
      if (!grinding) return;
      const want = Math.floor(Math.min(1, k) * GRIND_STRIPS);
      while (emitted < want) { emit(); emitted++; }
      slotMat.emissive.setHex(0x5a1f10 + (Math.floor(k * 14) % 2) * 0x180800); // 투입구가 깜빡이며 빨갛게 빛난다
    },
    endGrind() {
      if (!grinding) return;
      this.setFeed(1);
      grinding = false;
      lampMat.color.set(0x3a3f46);
      slotMat.emissive.set(0x000000);
    },
    isGrinding: () => grinding,
    // 투입구 윗면 높이(종이가 이 아래로 내려가면 클리핑으로 안 보인다).
    slotY: SLOT_Y,
    // 예전 이름(조각 몇 개를 떨어뜨린다).
    spawnStrips() { this.pour(); },
    update(dt) {
      if (shakeT >= 0) {
        shakeT += dt;
        const k = Math.min(1, shakeT / shakeLen);
        const pulse = Math.sin(Math.PI * Math.min(1, k * 1.2));
        group.scale.setScalar(1 + 0.03 * pulse);
        group.rotation.z = 0.035 * pulse * Math.sin(shakeT * 55) * shakeSign;
        group.position.y = 0.012 * pulse * Math.abs(Math.sin(shakeT * 43));
        if (k >= 1) { shakeT = -1; group.scale.setScalar(1); group.rotation.z = 0; group.position.y = 0; }
      }
      if (emitLeft > 0) {
        emitClock += dt;
        const due = Math.min(emitLeft, Math.floor((emitClock / POUR_SEC) * POUR_PER_RUN) - (POUR_PER_RUN - emitLeft));
        for (let i = 0; i < due; i++) { emit(); emitLeft -= 1; }
      }
      let any = false;
      for (let i = 0; i < POUR_COUNT; i++) {
        const p = pour[i];
        if (!p.live) continue;
        any = true;
        p.age += dt;
        p.vy -= 5.5 * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.z += p.vz * dt;
        p.vx *= 1 - 0.8 * dt;
        p.yaw += p.spin * dt * 0.3;
        if (p.y <= p.land) { // 통 바닥(더미 위)에 닿았다: 이 조각은 사라지고 더미가 늘어난다
          p.live = false;
          hideInstance(i);
          strips.setColorAt(POUR_COUNT + (pileSlot++ % PILE_MAX), tint.set(p.color)); // 떨어진 조각의 색이 더미에 남는다
          strips.instanceColor.needsUpdate = true;
          dirty = true;
          continue;
        }
        dummy.position.set(Math.max(p.x, BIN.x - BIN.w / 2 + 0.1), p.y, Math.max(-BIN.d / 2 + 0.08, Math.min(BIN.d / 2 - 0.08, p.z)));
        dummy.rotation.set(Math.sin(p.age * p.spin) * 0.6, p.yaw, p.spin * 0.05 * p.age);
        dummy.scale.setScalar(1);
        dummy.updateMatrix();
        strips.setMatrixAt(i, dummy.matrix);
        dirty = true;
      }
      // 더미: 조각이 다 떨어졌으면(쏟아질 조각이 없고 날아가는 조각도 없을 때) 늘어날 몫을 쌓는다.
      if (grinding) {
        // 가는 동안 조각이 나온 만큼 더미가 조금씩 쌓인다.
        const share = Math.min(pending, dt * (PILE_PER_RUN / 2.6));
        pileTarget = Math.min(PILE_MAX, pileTarget + share);
        pending -= share;
      } else if (pending > 0 && emitLeft === 0 && !any) {
        pileTarget = Math.min(PILE_MAX, pileTarget + pending);
        pending = 0;
      } else if (pending > 0 && emitLeft > 0) {
        // 쏟아지는 동안 조금씩 먼저 쌓아 보이게 한다.
        const share = Math.min(pending, dt * (PILE_PER_RUN / POUR_SEC));
        pileTarget = Math.min(PILE_MAX, pileTarget + share);
        pending -= share;
      }
      if (!any && emitLeft === 0 && pending === 0 && pileTarget > 0 && !grinding) {
        idleSince += dt;
        if (idleSince > PILE_HOLD_SEC) pileTarget = Math.max(0, pileTarget - dt / PILE_DECAY_SEC);
      }
      const prev = Math.floor(pileShown);
      pileShown += Math.sign(pileTarget - pileShown) * Math.min(Math.abs(pileTarget - pileShown), dt * 28);
      const shown = Math.floor(pileShown + 1e-6);
      if (shown !== prev || dirty) {
        for (let i = 0; i < PILE_MAX; i++) {
          if (i >= shown) { hideInstance(POUR_COUNT + i); continue; }
          const sp = pileSpots[i];
          dummy.position.set(BIN.x + sp.x, sp.y, sp.z);
          dummy.rotation.set(sp.tilt, sp.yaw, sp.tilt * 0.6);
          dummy.scale.setScalar(1);
          dummy.updateMatrix();
          strips.setMatrixAt(POUR_COUNT + i, dummy.matrix);
        }
        dirty = true;
      }
      strips.visible = any || emitLeft > 0 || shown > 0; // 쓰지 않을 때는 그리지 않는다
      if (dirty) { strips.instanceMatrix.needsUpdate = true; dirty = false; }
    },
    stripCount: () => pour.filter((p) => p.live).length,
    pileCount: () => Math.floor(pileShown + 1e-6),
    meshes: [body, slot, outlet, lamp, bin, strips],
  };
}
