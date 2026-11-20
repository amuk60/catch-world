// 브라우저 전용: 면접장 실내 공간. 세탁소 실내(interiorLaundry.js)와 같은 방식(공용 조각은 interiorKit.js)이고 데이터는 logic/interiors.js 의 buildInterviewInterior 에서 온다.
// 차갑고 딱딱한 사무실 모양(config 의 INTERVIEW_LOOK: 쿨 화이트·회색 벽, 카펫 타일 바닥, 남색 포인트, 흰 조명, 가구는 재질 색을 덮어쓴 사무용).
// 긴 면접관 책상 + 책상 뒤 의자 3개(면접관은 interviewers.js 가 앉힌다), 지원자 의자, 서쪽 벽 화이트보드·안내판·유리 출입문, 북쪽 벽 벽시계·간판 "캐치 면접장"·블라인드 창, 서류함·정수기·쓰레기통·화분과 낮은 책장.
import * as THREE from 'three';
import { INTERVIEW_LOOK } from './config.js';
import { signCanvas, liveSignTexture, fontOf } from './signFont.js';
import { hiddenWalls } from './logic/wallVisibility.js';
import { buildPickables } from './world.js';
import { placed, buildFloor, buildWallGroups, addSign, addLights } from './interiorKit.js';

export const INTERVIEW_MODEL_ITEMS = [
  'wall', 'wallWindow', 'wallDoorwayWide', 'desk', 'chairDesk', 'chairModernCushion', 'laptop', 'books', 'plantSmall1', 'bookcaseOpenLow',
  'rugRectangle', 'pottedPlant', 'trashcan', 'coatRackStanding',
].map((name) => ({ pack: 'furniture', name }));

// 캔버스 판 하나(글씨 판 공통 뼈대).
function canvasTexture(width, height, draw) {
  return liveSignTexture(() => {
    const { canvas, g } = signCanvas(width, height);
    draw(g, width, height);
    return canvas;
  });
}

const FONT = (px, bold = false) => fontOf('corp', px, bold ? 'bold' : 'normal');

// 화이트보드 글씨 판(흰 바탕 + 남색 글씨 평가표).
function boardTexture() {
  return canvasTexture(512, 280, (g) => {
    g.fillStyle = '#f5f7fa';
    g.fillRect(0, 0, 512, 280);
    g.fillStyle = '#1f3a66';
    g.font = FONT(34, true);
    g.fillText('오늘의 면접 평가표', 30, 56);
    g.strokeStyle = '#1f3a66';
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(30, 72);
    g.lineTo(480, 72);
    g.stroke();
    g.fillStyle = '#3b4756';
    g.font = FONT(28);
    g.fillText('표정  ★★★☆☆', 40, 122);
    g.fillText('목소리  ★★★★☆', 40, 168);
    g.fillText('당당함  ★★★★★', 40, 214);
    g.fillStyle = '#2a7f9e';
    g.font = FONT(30, true);
    g.fillText('화이팅!', 360, 250);
  });
}

// 벽시계 판(흰 원판, 검은 눈금 12개, 검은 바늘).
function clockTexture() {
  return canvasTexture(256, 256, (g) => {
    g.fillStyle = '#f7f9fb';
    g.beginPath();
    g.arc(128, 128, 124, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = '#1a1d22';
    g.lineWidth = 8;
    g.stroke();
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      g.lineWidth = i % 3 === 0 ? 8 : 4;
      g.beginPath();
      g.moveTo(128 + Math.sin(a) * 100, 128 - Math.cos(a) * 100);
      g.lineTo(128 + Math.sin(a) * 116, 128 - Math.cos(a) * 116);
      g.stroke();
    }
    g.lineCap = 'round';
    g.lineWidth = 10; // 시침: 2시 쪽
    g.beginPath();
    g.moveTo(128, 128);
    g.lineTo(128 + Math.sin(1.05) * 56, 128 - Math.cos(1.05) * 56);
    g.stroke();
    g.lineWidth = 6; // 분침: 11 쪽
    g.beginPath();
    g.moveTo(128, 128);
    g.lineTo(128 + Math.sin(-0.5) * 84, 128 - Math.cos(-0.5) * 84);
    g.stroke();
  });
}

// 안내판 "면접 안내": 남색 머리띠 + 흰 종이 위 안내 문구.
function noticeTexture() {
  return canvasTexture(256, 320, (g) => {
    g.fillStyle = '#eef1f5';
    g.fillRect(0, 0, 256, 320);
    g.fillStyle = '#1d3157';
    g.fillRect(0, 0, 256, 64);
    g.fillStyle = '#ffffff';
    g.font = FONT(34, true);
    g.textBaseline = 'middle';
    g.fillText('면접 안내', 24, 34);
    g.fillStyle = '#3b4756';
    g.font = FONT(22);
    ['1. 질문은 총 5문항', '2. 답변은 1~2 선택', '3. 핸드폰은 무음으로', '4. 복장은 단정하게'].forEach((line, i) => g.fillText(line, 20, 104 + i * 44));
    g.fillStyle = '#4a78b5';
    g.fillRect(20, 282, 216, 4);
  });
}

const mat = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.6, ...extra });
const box = (w, h, d, material, x = 0, y = 0, z = 0) => {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  return mesh;
};

// 서류함(회색 철제 4단): 앞면이 +z.
function buildFilingCabinet({ width: w, depth: d, height: h }) {
  const g = new THREE.Group();
  const body = mat(0x9aa4af, { roughness: 0.5 });
  const front = mat(0xb4bcc6, { roughness: 0.45 });
  const handle = mat(0x2b323b);
  g.add(box(w, h, d, body, 0, h / 2, 0));
  const rows = 4;
  const rh = (h - 0.1) / rows;
  for (let i = 0; i < rows; i++) {
    const y = 0.06 + rh * (i + 0.5);
    g.add(box(w - 0.06, rh - 0.04, 0.02, front, 0, y, d / 2 + 0.005));
    g.add(box(w * 0.4, 0.03, 0.03, handle, 0, y + rh * 0.18, d / 2 + 0.03));
  }
  return g;
}

// 정수기: 흰 회색 몸통 + 위의 푸른 물통 + 앞의 수도꼭지 두 개: 앞면이 +z.
function buildWaterDispenser({ width: w, depth: d, height: h }) {
  const g = new THREE.Group();
  const bodyH = h * 0.62;
  g.add(box(w, bodyH, d, mat(0xdfe5eb, { roughness: 0.4 }), 0, bodyH / 2, 0));
  g.add(box(w * 0.8, 0.22, 0.02, mat(0x2b323b), 0, bodyH * 0.72, d / 2 + 0.01)); // 앞 패널
  g.add(box(0.05, 0.05, 0.08, mat(0x3f7fc0), -w * 0.18, bodyH * 0.72, d / 2 + 0.05)); // 찬물
  g.add(box(0.05, 0.05, 0.08, mat(0x8d98a5), w * 0.18, bodyH * 0.72, d / 2 + 0.05)); // 보통
  g.add(box(w * 0.7, 0.04, d * 0.7, mat(0x59636f), 0, bodyH * 0.35, d / 2 - 0.06)); // 물받이
  const bottleH = h - bodyH;
  const bottle = new THREE.Mesh(new THREE.CylinderGeometry(d * 0.38, d * 0.42, bottleH, 20), mat(0x7fb3e6, { transparent: true, opacity: 0.6, roughness: 0.15 }));
  bottle.position.set(0, bodyH + bottleH / 2, 0);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(d * 0.16, d * 0.2, 0.05, 16), mat(0x3f7fc0));
  cap.position.set(0, h + 0.02, 0);
  g.add(bottle, cap);
  return g;
}

const PROP_BUILDERS = { filingCabinet: buildFilingCabinet, waterDispenser: buildWaterDispenser };

// 창 블라인드: 열린 창 위쪽에 가로 살을 걸고 아래는 열어 둔다(유리가 보이게). 창 조각 좌표계(조각 위치·방향 그대로).
function buildBlinds(piece) {
  const g = new THREE.Group();
  g.position.set(piece.x, 0, piece.z);
  g.rotation.y = piece.rotY;
  const slat = mat(0xd7dde4, { roughness: 0.5 });
  const top = 2.1; // 창 열린 부분의 윗변(바닥에서)
  const count = 9;
  for (let i = 0; i < count; i++) g.add(box(0.8, 0.045, 0.02, slat, 0, top - 0.07 - i * 0.07, 0.07));
  g.add(box(0.86, 0.07, 0.07, mat(0x59636f), 0, top, 0.07)); // 윗틀
  g.add(box(0.012, 0.32, 0.012, mat(0x59636f), 0.34, top - 0.07 - count * 0.07 - 0.16, 0.08)); // 당김줄
  return g;
}

// 출입문의 유리문: 금속 틀 + 푸른 반투명 유리 + 흐린 띠 + 손잡이(문 열림 표시는 없다, 상호작용은 그대로 E).
function buildGlassDoor(piece) {
  const g = new THREE.Group();
  g.position.set(piece.x, 0, piece.z);
  g.rotation.y = piece.rotY;
  const w = 1.46;
  const h = 2.0;
  const frame = mat(0x3a424c, { roughness: 0.4 });
  g.add(box(w, h, 0.02, mat(0x9cc3e8, { transparent: true, opacity: 0.3, roughness: 0.1 }), 0, h / 2, 0.02));
  g.add(box(0.07, h, 0.06, frame, -w / 2, h / 2, 0.02), box(0.07, h, 0.06, frame, w / 2, h / 2, 0.02), box(w + 0.07, 0.07, 0.06, frame, 0, h, 0.02));
  g.add(box(w, 0.28, 0.025, mat(0xf2f6fa, { transparent: true, opacity: 0.55 }), 0, 1.1, 0.025)); // 시선 가림 띠
  g.add(box(0.035, 0.5, 0.05, mat(0xc8d0d9, { roughness: 0.3 }), w / 2 - 0.2, 1.0, 0.07)); // 손잡이
  return g;
}

export function buildInteriorInterview(scene, interior, models, look = INTERVIEW_LOOK) {
  const root = new THREE.Group();
  root.name = 'interior-interview';
  root.visible = false;
  const { bounds } = interior;

  const ground = buildFloor(bounds, look);
  root.add(ground);
  const wallGroups = buildWallGroups(root, interior, models, look);
  // 창에는 블라인드, 출입문에는 유리문(조각이 속한 벽 그룹에 넣어 벽과 함께 숨는다).
  for (const wall of interior.walls) {
    for (const piece of wall.pieces) {
      if (piece.name === 'wallWindow') wallGroups[wall.id].add(buildBlinds(piece));
      else if (piece.name === 'wallDoorwayWide') wallGroups[wall.id].add(buildGlassDoor(piece));
    }
  }

  // 가구와 러그(러그 위 바닥 장식은 그림자를 받지 않는다).
  for (const f of interior.furniture) root.add(placed(models, f.name, f, f.name !== 'rugRectangle', look));
  // 도형으로 만든 사무용품(서류함·정수기).
  for (const p of interior.props) {
    const prop = PROP_BUILDERS[p.kind](p);
    prop.position.set(p.x, 0, p.z);
    prop.rotation.y = p.rotY;
    root.add(prop);
  }
  // 면접관 의자: 일어설 때 뒤로 밀리므로 따로 보관한다.
  const chairs = {};
  for (const seat of interior.seats) {
    chairs[seat.id] = placed(models, seat.chair.name, seat.chair, true, look);
    root.add(chairs[seat.id]);
  }

  // 간판 "캐치 면접장"(북쪽 벽), 벽시계(북쪽 벽), 화이트보드와 안내판(서쪽 벽).
  addSign(wallGroups, interior.sign, look);
  const { clock, board, notice } = interior;
  const clockMesh = new THREE.Group();
  const rim = new THREE.Mesh(new THREE.CylinderGeometry(clock.radius, clock.radius, 0.06, 32), mat(0x1a1d22, { roughness: 0.4 }));
  rim.rotation.x = Math.PI / 2;
  const face = new THREE.Mesh(
    new THREE.CircleGeometry(clock.radius * 0.94, 32),
    new THREE.MeshBasicMaterial({ map: clockTexture(), toneMapped: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }),
  );
  face.position.z = 0.034;
  clockMesh.add(rim, face);
  clockMesh.position.set(clock.x, clock.y, clock.z + 0.03);
  clockMesh.rotation.y = clock.rotY;
  wallGroups.north.add(clockMesh);

  // 벽걸이 판(화이트보드·안내판): 틀 + 글씨 판. trayWidth > 0 이면 아래에 펜 받침대.
  function wallBoard(spec, texture, frameColor, trayWidth) {
    const group = new THREE.Group();
    group.add(box(spec.width + 0.12, spec.height + 0.12, 0.06, mat(frameColor, { roughness: 0.4 })));
    const surface = new THREE.Mesh(
      new THREE.PlaneGeometry(spec.width, spec.height),
      new THREE.MeshBasicMaterial({ map: texture, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }),
    );
    surface.position.z = 0.034;
    group.add(surface);
    if (trayWidth > 0) group.add(box(trayWidth, 0.04, 0.1, mat(0x59636f), 0, -spec.height / 2 - 0.08, 0.06));
    group.position.set(spec.x, spec.y, spec.z);
    group.rotation.y = spec.rotY;
    return group;
  }
  wallGroups.west.add(wallBoard(board, boardTexture(), 0xb8c0ca, board.width * 0.7), wallBoard(notice, noticeTexture(), 0x3a424c, 0));

  addLights(root, interior, look);
  const pickables = buildPickables(root, interior.interactables);
  scene.add(root);

  return {
    root, ground, pickables, wallGroups, chairs,
    background: new THREE.Color(look.background),
    fog: new THREE.Fog(look.background, 250, 500),
    updateWalls(cameraPos) {
      const hidden = new Set(hiddenWalls(cameraPos, bounds, interior.walls));
      for (const [id, group] of Object.entries(wallGroups)) group.visible = !hidden.has(id);
    },
    update() {},
  };
}
