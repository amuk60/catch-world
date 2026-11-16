// 브라우저 전용: 유리 벽 조각(세탁소 실내). look.glass 가 있는 공간은 Furniture Kit 벽 모델 대신 이 조각으로 벽을 만든다(interiorKit.js 의 buildWallGroups).
// 불투명한 서리 유리: 밖이 전혀 비치지 않는 우윳빛 유리 판 + 가는 은색 철제 틀과 문설주. 밝은 그라데이션과 비스듬한 빛줄기(캔버스 질감)로 유리 느낌을 낸다(환경맵·투명도 없이 싸게).
// 조각 종류: wall(이어지는 유리 벽 한 칸), wallWindow(더 밝게 빛나는 큰 유리 창 + 창틀 + 선반), wallDoorwayWide(틀과 손잡이가 있는 유리 출입문 + 양옆 유리 + 위 유리).
// 조각 좌표계: 조각 중심 바닥이 원점, 방 안쪽이 +z, 폭 = tile(x), 높이 = wallHeight(y). 방 경계에 안쪽 면이 닿도록 판은 두께 0.05 를 z=0.02 에 둔다(logic/interiors.js 의 WALL_OFFSET 과 맞춘다).
import * as THREE from 'three';
import { openTagCanvas } from './buildingExterior.js';

const GLASS_Z = 0.02; // 유리 판 중심 z (안쪽 면 +0.045)
const FRAME_DEPTH = 0.12; // 틀 두께(유리보다 안쪽으로 살짝 튀어나온다)
const FRAME_Z = 0.02;

// 서리 유리 질감: 위에서 아래로 밝은 그라데이션 + 서리 알갱이 + 비스듬한 빛줄기 두 줄. kind: 'wall'(은은) | 'window'(밝고 반짝) | 'low'(아래 띠: 약간 더 푸른 서리). variant: 빛줄기 위치.
function frostTexture(look, kind, variant) {
  const w = 256;
  const h = 512;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const g = canvas.getContext('2d');
  const base = look.texture[kind];
  const grad = g.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, base[0]);
  grad.addColorStop(0.55, base[1]);
  grad.addColorStop(1, base[2]);
  g.fillStyle = grad;
  g.fillRect(0, 0, w, h);
  let seed = 11 + variant * 31; // 고정 시드(매번 같은 무늬)
  const rand = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
  for (let i = 0; i < 1400; i++) { // 서리 알갱이
    g.fillStyle = rand() < 0.55 ? 'rgba(255, 255, 255, 0.16)' : 'rgba(110, 170, 180, 0.07)';
    g.fillRect(rand() * w, rand() * h, 1 + rand() * 2, 1 + rand() * 2);
  }
  const sheen = look.sheen[kind];
  g.save();
  g.rotate(-0.38); // 비스듬히
  for (const [x, width, alpha] of [[0.18 + variant * 0.17, 0.2, 1], [0.58 + variant * 0.09, 0.07, 0.65]]) {
    const streak = g.createLinearGradient(x * w, 0, (x + width) * w, 0);
    streak.addColorStop(0, 'rgba(255, 255, 255, 0)');
    streak.addColorStop(0.5, `rgba(255, 255, 255, ${sheen * alpha})`);
    streak.addColorStop(1, 'rgba(255, 255, 255, 0)');
    g.fillStyle = streak;
    g.fillRect(x * w - 40, -h * 0.5, width * w + 80, h * 2);
  }
  g.restore();
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

// 유리·틀 재질 묶음(공간 하나에 한 번 만든다). 유리는 불투명(transparent 아님): 밖이 보이지 않는다. 빛줄기를 살리려고 살짝 스스로 빛나게(emissiveMap = 같은 질감).
export function createGlassKit(look) {
  const variants = 3;
  const pane = (kind) => Array.from({ length: variants }, (_, v) => {
    const map = frostTexture(look, kind, v);
    return new THREE.MeshPhysicalMaterial({
      map, roughness: look.roughness, metalness: 0, clearcoat: look.clearcoat, clearcoatRoughness: 0.3,
      emissive: look.emissive, emissiveMap: map, emissiveIntensity: look.emissiveIntensity,
    });
  });
  let openTag = null; // 출입문 안쪽 "OPEN" 표시(외관 문과 같은 그림). look.openTag 가 켜진 공간만
  if (look.openTag) {
    const map = new THREE.CanvasTexture(openTagCanvas());
    map.colorSpace = THREE.SRGBColorSpace;
    openTag = new THREE.MeshBasicMaterial({ map, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
  }
  return {
    openTag,
    wall: pane('wall'), window: pane('window'), low: pane('low'),
    frame: new THREE.MeshStandardMaterial({ color: look.frame, roughness: 0.38, metalness: 0.3, emissive: look.frame, emissiveIntensity: 0.12 }),
    frameDark: new THREE.MeshStandardMaterial({ color: look.frameDark, roughness: 0.45, metalness: 0.3, emissive: look.frameDark, emissiveIntensity: 0.1 }),
  };
}

const box = (w, h, d, material, x, y, z) => {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  mesh.position.set(x, y, z);
  return mesh;
};

// y0~y1 구간의 유리 판(폭 w, 중심 x).
function glassPane(material, w, y0, y1, x = 0, z = GLASS_Z) {
  return box(w, y1 - y0, 0.05, material, x, (y0 + y1) / 2, z);
}

// 가로 틀(폭 w, 중심 높이 y).
const rail = (kit, w, h, y, x = 0, dark = false) => box(w, h, FRAME_DEPTH, dark ? kit.frameDark : kit.frame, x, y, FRAME_Z);
const post = (kit, h, x, w = 0.05) => box(w, h, FRAME_DEPTH, kit.frame, x, h / 2, FRAME_Z);

function wallPiece(kit, v, W, H) {
  const g = new THREE.Group();
  g.add(
    glassPane(kit.low[v], W - 0.1, 0.18, 1.0), glassPane(kit.wall[v], W - 0.1, 1.025, H - 0.1),
    rail(kit, W, 0.18, 0.09, 0, true), rail(kit, W - 0.1, 0.05, 1.0125), rail(kit, W, 0.1, H - 0.05),
    post(kit, H, -(W / 2 - 0.025)), post(kit, H, W / 2 - 0.025),
  );
  return g;
}

// 창: 아래 서리 띠 + 선반(창턱) + 위에 틀을 두른 큰 유리 창(더 밝고 반짝이는 질감). 가운데 문설주로 두 칸.
function windowPiece(kit, v, W, H) {
  const g = new THREE.Group();
  const sill = 0.88;
  const top = 2.34;
  const ow = W - 0.34; // 창 열린 폭
  g.add(
    glassPane(kit.low[v], W - 0.1, 0.18, sill), glassPane(kit.wall[v], W - 0.1, sill + 0.03, H - 0.1),
    rail(kit, W, 0.18, 0.09, 0, true), rail(kit, W, 0.1, H - 0.05),
    post(kit, H, -(W / 2 - 0.025)), post(kit, H, W / 2 - 0.025),
    box(W - 0.1, 0.06, 0.2, kit.frame, 0, sill + 0.015, 0.08), // 창턱
    glassPane(kit.window[v], ow, sill + 0.06, top, 0, GLASS_Z + 0.025), // 밝은 유리 창
    box(ow + 0.12, 0.07, 0.15, kit.frame, 0, top + 0.03, 0.05), box(ow + 0.12, 0.05, 0.15, kit.frame, 0, sill + 0.075, 0.05), // 창틀 위·아래
    box(0.06, top - sill + 0.05, 0.15, kit.frame, -ow / 2 - 0.03, (top + sill) / 2 + 0.03, 0.05),
    box(0.06, top - sill + 0.05, 0.15, kit.frame, ow / 2 + 0.03, (top + sill) / 2 + 0.03, 0.05),
    box(0.04, top - sill - 0.06, 0.15, kit.frame, 0, (top + sill) / 2 + 0.03, 0.05), // 가운데 문설주
  );
  return g;
}

// 출입문: 양옆 좁은 유리 + 위 유리(상인방) + 서리 유리문(은색 틀, 걸쇠 손잡이, 아래 보호판) + 문턱. 문 열림 표시는 없다(상호작용은 그대로 E).
function doorPiece(kit, v, W, H) {
  const g = new THREE.Group();
  const dw = 1.46;
  const dh = 2.0;
  const side = (W - dw) / 2;
  const handleMat = kit.frame;
  g.add(
    glassPane(kit.low[v], side, 0.18, dh, -(dw / 2 + side / 2)), glassPane(kit.low[v], side, 0.18, dh, dw / 2 + side / 2),
    glassPane(kit.wall[v], W - 0.1, dh + 0.03, H - 0.1),
    rail(kit, W, 0.18, 0.09, 0, true), rail(kit, W, 0.1, H - 0.05), rail(kit, W - 0.1, 0.06, dh + 0.015),
    post(kit, H, -(W / 2 - 0.025)), post(kit, H, W / 2 - 0.025),
    box(0.07, dh, FRAME_DEPTH + 0.02, kit.frame, -dw / 2, dh / 2, FRAME_Z), box(0.07, dh, FRAME_DEPTH + 0.02, kit.frame, dw / 2, dh / 2, FRAME_Z), // 문설주
    glassPane(kit.window[v], dw - 0.07, 0.24, dh - 0.03, 0, GLASS_Z + 0.015), // 서리 유리문
    box(dw - 0.07, 0.22, 0.07, kit.frameDark, 0, 0.12, FRAME_Z + 0.015), // 아래 보호판
    box(dw - 0.07, 0.06, 0.07, kit.frame, 0, 1.12, FRAME_Z + 0.015), // 문 가로대
    box(dw + 0.08, 0.025, 0.24, kit.frameDark, 0, 0.0125, 0.0), // 문턱
  );
  if (kit.openTag) { // 안쪽 면에 걸린 OPEN 표시(문 가로대 위, 손잡이 반대쪽)
    const tag = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.16), kit.openTag);
    tag.position.set(-0.22, 1.5, FRAME_Z + 0.07);
    g.add(tag);
  }
  const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.62, 12), handleMat);
  bar.position.set(dw / 2 - 0.2, 1.05, FRAME_Z + 0.115); // 문을 여는 쪽(오른쪽) 세로 손잡이
  g.add(bar);
  for (const y of [0.82, 1.28]) {
    const stand = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.07, 8), handleMat);
    stand.rotation.x = Math.PI / 2;
    stand.position.set(dw / 2 - 0.2, y, FRAME_Z + 0.075);
    g.add(stand);
  }
  return g;
}

const BUILDERS = { wall: wallPiece, wallWindow: windowPiece, wallDoorwayWide: doorPiece };

// 벽 조각 하나(piece: logic/interiors.js 의 { name, x, z, rotY })를 유리 조각으로. 알 수 없는 이름은 보통 유리 벽.
export function buildGlassPiece(kit, piece, { tile, wallHeight }) {
  const v = Math.abs(Math.round(piece.x * 7 + piece.z * 13)) % kit.wall.length; // 칸마다 빛줄기 위치가 다르다(결정적)
  const g = (BUILDERS[piece.name] ?? wallPiece)(kit, v, tile, wallHeight);
  g.position.set(piece.x, 0, piece.z);
  g.rotation.y = piece.rotY;
  return g;
}
