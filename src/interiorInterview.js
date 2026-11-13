// 브라우저 전용: 면접장 실내 공간. 세탁소 실내(interiorLaundry.js)와 같은 방식(공용 조각은 interiorKit.js)이고 데이터는 logic/interiors.js 의 buildInterviewInterior 에서 온다.
// 긴 면접관 책상 + 책상 뒤 의자 3개(면접관은 interviewers.js 가 앉힌다), 지원자 의자, 서쪽 벽 칠판, 북쪽 벽 벽시계·간판 "면접장"·창, 화분과 낮은 책장.
import * as THREE from 'three';
import { INTERIOR_LOOK } from './config.js';
import { hiddenWalls } from './logic/wallVisibility.js';
import { buildPickables } from './world.js';
import { placed, buildFloor, buildWallGroups, addSign, addLights } from './interiorKit.js';

export const INTERVIEW_MODEL_ITEMS = [
  'wall', 'wallWindow', 'wallDoorwayWide', 'desk', 'chairDesk', 'chairCushion', 'laptop', 'books', 'plantSmall1', 'bookcaseOpenLow',
  'rugRectangle', 'pottedPlant', 'benchCushion', 'lampRoundFloor', 'coatRackStanding',
].map((name) => ({ pack: 'furniture', name }));

// 칠판 글씨 판(흰 바탕 + 낙서 같은 글).
function boardTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 280;
  const g = canvas.getContext('2d');
  g.fillStyle = '#f7f7f2';
  g.fillRect(0, 0, 512, 280);
  g.fillStyle = '#2f5d9e';
  g.font = 'bold 34px "Malgun Gothic", sans-serif';
  g.fillText('오늘의 면접 평가표', 30, 56);
  g.strokeStyle = '#2f5d9e';
  g.lineWidth = 3;
  g.beginPath();
  g.moveTo(30, 72);
  g.lineTo(480, 72);
  g.stroke();
  g.fillStyle = '#c9423a';
  g.font = '28px "Malgun Gothic", sans-serif';
  g.fillText('표정  ★★★☆☆', 40, 122);
  g.fillText('목소리  ★★★★☆', 40, 168);
  g.fillText('당당함  ★★★★★', 40, 214);
  g.fillStyle = '#3a8a4a';
  g.font = 'bold 30px "Malgun Gothic", sans-serif';
  g.fillText('화이팅!', 360, 250);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

// 벽시계 판(원판, 눈금 12개, 바늘).
function clockTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const g = canvas.getContext('2d');
  g.fillStyle = '#fffaf0';
  g.beginPath();
  g.arc(128, 128, 124, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = '#3a2f1f';
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
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export function buildInteriorInterview(scene, interior, models) {
  const root = new THREE.Group();
  root.name = 'interior-interview';
  root.visible = false;
  const { bounds } = interior;

  const ground = buildFloor(bounds);
  root.add(ground);
  const wallGroups = buildWallGroups(root, interior, models);

  // 가구와 러그(러그 위 바닥 장식은 그림자를 받지 않는다).
  for (const f of interior.furniture) root.add(placed(models, f.name, f, f.name !== 'rugRectangle'));
  // 면접관 의자: 일어설 때 뒤로 밀리므로 따로 보관한다.
  const chairs = {};
  for (const seat of interior.seats) {
    chairs[seat.id] = placed(models, seat.chair.name, seat.chair);
    root.add(chairs[seat.id]);
  }

  // 간판 "면접장"(북쪽 벽), 벽시계(북쪽 벽), 칠판(서쪽 벽).
  addSign(wallGroups, interior.sign);
  const { clock, board } = interior;
  const clockMesh = new THREE.Group();
  const rim = new THREE.Mesh(new THREE.CylinderGeometry(clock.radius, clock.radius, 0.06, 32), new THREE.MeshStandardMaterial({ color: 0x5a4630 }));
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

  const boardMesh = new THREE.Group();
  const frame = new THREE.Mesh(new THREE.BoxGeometry(board.width + 0.12, board.height + 0.12, 0.06), new THREE.MeshStandardMaterial({ color: 0x9aa3ad, roughness: 0.6 }));
  const surface = new THREE.Mesh(
    new THREE.PlaneGeometry(board.width, board.height),
    new THREE.MeshBasicMaterial({ map: boardTexture(), toneMapped: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }),
  );
  surface.position.z = 0.034;
  const tray = new THREE.Mesh(new THREE.BoxGeometry(board.width * 0.7, 0.04, 0.1), new THREE.MeshStandardMaterial({ color: 0x9aa3ad }));
  tray.position.set(0, -board.height / 2 - 0.08, 0.06);
  boardMesh.add(frame, surface, tray);
  boardMesh.position.set(board.x, board.y, board.z);
  boardMesh.rotation.y = board.rotY;
  wallGroups.west.add(boardMesh);

  addLights(root, interior);
  const pickables = buildPickables(root, interior.interactables);
  scene.add(root);

  return {
    root, ground, pickables, wallGroups, chairs,
    background: new THREE.Color(INTERIOR_LOOK.background),
    fog: new THREE.Fog(INTERIOR_LOOK.background, 250, 500),
    updateWalls(cameraPos) {
      const hidden = new Set(hiddenWalls(cameraPos, bounds, interior.walls));
      for (const [id, group] of Object.entries(wallGroups)) group.visible = !hidden.has(id);
    },
    update() {},
  };
}
