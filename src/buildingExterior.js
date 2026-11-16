// 브라우저 전용: 건물 외관 두 채. 면접장은 6층 회사 빌딩(평지붕, 유리창 격자, 로비 입구와 차양, 옥상 설비), 세탁소는 작은 상가(차양, 쇼윈도, 간판).
// 모델 파일은 쓰지 않는다: 창·간판·쇼윈도는 캔버스로 그린 텍스처이고, 입구·차양·옥상 같은 입체 디테일은 상자·원기둥으로 만들어 재질별로 합쳐(draw call 절약) 올린다.
// 그룹의 로컬 +z 가 정면(문), 로컬 y=0 이 바닥이다. 문 위치는 layout 의 b.doorLocalX(건물 로컬 x)이고 b.width/b.depth 는 터 안의 발자국이다.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { mulberry32 } from './logic/rng.js';
import { LAUNDRY_LOOK } from './config.js';

const PPM = 100; // 캔버스 한 변 1m 당 픽셀 수

// ---- 공용 도구 ----
function makeCanvas(w, h) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(2, Math.round(w));
  canvas.height = Math.max(2, Math.round(h));
  return { canvas, g: canvas.getContext('2d') };
}

function texOf(canvas, { repeat, aniso = 8 } = {}) {
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = aniso;
  if (repeat) { t.wrapS = THREE.RepeatWrapping; t.repeat.set(...repeat); }
  return t;
}

const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0, ...o });

function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

// 같은 재질끼리 지오메트리를 합쳐 하나의 메시로 만든다(정적 소품용).
function makeBatch() {
  const byMat = new Map();
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const add = (material, geo, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) => {
    geo.applyMatrix4(m4.compose(new THREE.Vector3(x, y, z), q.setFromEuler(e.set(rx, ry, rz)), new THREE.Vector3(1, 1, 1)));
    if (!byMat.has(material)) byMat.set(material, []);
    byMat.get(material).push(geo);
  };
  return {
    box: (material, w, h, d, x, y, z, rx, ry, rz) => add(material, new THREE.BoxGeometry(w, h, d), x, y, z, rx, ry, rz),
    cyl: (material, rt, rb, h, seg, x, y, z, rx, ry, rz) => add(material, new THREE.CylinderGeometry(rt, rb, h, seg), x, y, z, rx, ry, rz),
    sphere: (material, r, x, y, z, sx = 1, sy = 1, sz = 1) => { const g = new THREE.SphereGeometry(r, 10, 8); g.scale(sx, sy, sz); add(material, g, x, y, z); },
    flush(parent, { cast = true, receive = false } = {}) {
      for (const [material, geos] of byMat) {
        const mesh = new THREE.Mesh(mergeGeometries(geos), material);
        mesh.castShadow = cast;
        mesh.receiveShadow = receive;
        parent.add(mesh);
        for (const g of geos) g.dispose();
      }
      byMat.clear();
    },
  };
}

function plane(parent, material, w, h, x, y, z, ry = 0) {
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), material);
  mesh.position.set(x, y, z);
  mesh.rotation.y = ry;
  parent.add(mesh);
  return mesh;
}

// 간판 글씨(가운데 정렬, 폭에 맞춰 크기를 줄인다).
function fitText(g, text, cx, cy, maxW, size, color, weight = 'bold') {
  let s = size;
  const font = (px) => `${weight} ${px}px "Malgun Gothic", sans-serif`;
  g.font = font(s);
  while (s > 14 && g.measureText(text).width > maxW) { s -= 4; g.font = font(s); }
  g.fillStyle = color;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, cx, cy);
}

const signMat = (canvas) => new THREE.MeshBasicMaterial({ map: texOf(canvas), toneMapped: false });

// ============================================================
// 면접장: 회사 빌딩
// ============================================================
const OFFICE = {
  lobby: 2.25, band: 0.7, floors: 5, floorH: 1.15, // 아래부터 로비(유리), 간판 띠(중이층), 사무층 5개
  piers: 0.22, parapetBack: 0.35, parapetSign: 0.95, // 모서리 기둥 폭, 옥상 난간 높이(뒤·옆 / 간판이 붙는 앞·남쪽)
  win: { w: 0.72, h: 0.82, margin: 0.3, top: 0.17 },
};
OFFICE.bodyH = OFFICE.lobby + OFFICE.band + OFFICE.floors * OFFICE.floorH; // 8.7
const CONCRETE = '#e6dfd2';
const CONCRETE_DARK = '#b9afa0';
const NAVY = '#27384f';
const GOLD = '#d9b27c';

// 창 하나(밝은 틀 + 푸른 회색 유리 + 반사). lit 이면 따뜻한 노랑.
function paintWindow(g, x, y, w, h, lit) {
  g.fillStyle = '#c9c0b0'; // 창대 그림자
  g.fillRect(x - 2, y + h, w + 4, 4);
  g.fillStyle = '#f2eee4'; // 틀
  g.fillRect(x - 3, y - 3, w + 6, h + 6);
  const grad = g.createLinearGradient(0, y, 0, y + h);
  if (lit) { grad.addColorStop(0, '#ffe9a6'); grad.addColorStop(1, '#f2b755'); } else { grad.addColorStop(0, '#8fc0f0'); grad.addColorStop(1, '#3f6ea8'); }
  g.fillStyle = grad;
  g.fillRect(x, y, w, h);
  if (!lit) { // 하늘 반사 줄무늬
    g.fillStyle = 'rgba(255,255,255,0.22)';
    g.beginPath();
    g.moveTo(x + w * 0.1, y + h); g.lineTo(x + w * 0.45, y); g.lineTo(x + w * 0.72, y); g.lineTo(x + w * 0.37, y + h);
    g.closePath(); g.fill();
  }
  g.fillStyle = '#f2eee4'; // 가운데 문설주
  g.fillRect(x + w / 2 - 1.5, y, 3, h);
}

// 면접장 한 면의 텍스처. fw: 면 폭(m). 위에서 아래로: 사무층 5개 / 중이층 띠 / 로비. opts.lobby: 'front'(출입구) | 'glass' | 'solid'.
function officeFaceTextures(fw, seed, { cols, lobby, doorX, front }) {
  const H = OFFICE.bodyH;
  const w = fw * PPM;
  const h = H * PPM;
  const rng = mulberry32(seed);
  const { canvas, g } = makeCanvas(w, h);
  const em = makeCanvas(w / 2, h / 2); // 불 켜진 창만 담는 발광 지도(반 해상도)
  em.g.fillStyle = '#4a463e'; em.g.fillRect(0, 0, em.canvas.width, em.canvas.height); // 발광 바닥: 그늘진 면도 칙칙하지 않게 살짝 밝힌다
  const emitRect = (x, y, rw, rh, color) => { em.g.fillStyle = color; em.g.fillRect(x / 2, y / 2, rw / 2, rh / 2); };

  // 콘크리트 바탕과 얼룩, 층 구분선
  g.fillStyle = CONCRETE; g.fillRect(0, 0, w, h);
  for (let i = 0; i < w * h / 120; i++) {
    g.fillStyle = `rgba(${rng() < 0.5 ? '120,108,90' : '255,250,240'},${0.03 + rng() * 0.05})`;
    g.fillRect(rng() * w, rng() * h, 1 + rng() * 3, 1 + rng() * 2);
  }
  const { w: ww, h: wh, margin, top } = OFFICE.win;
  const gap = (fw - 2 * margin - cols * ww) / (cols - 1);
  for (let r = 0; r < OFFICE.floors; r++) {
    const y0 = r * OFFICE.floorH;
    g.fillStyle = CONCRETE_DARK; g.fillRect(0, (y0 + OFFICE.floorH) * PPM - 2, w, 3); // 층 구분선
    for (let c = 0; c < cols; c++) {
      const lit = rng() < 0.2;
      const x = (margin + c * (ww + gap)) * PPM;
      const y = (y0 + top) * PPM;
      paintWindow(g, x, y, ww * PPM, wh * PPM, lit);
      if (lit) emitRect(x, y, ww * PPM, wh * PPM, '#ffcf70');
    }
  }
  // 중이층 띠
  const bandY = OFFICE.floors * OFFICE.floorH * PPM;
  const bandH = OFFICE.band * PPM;
  g.fillStyle = CONCRETE_DARK; g.fillRect(0, bandY - 2, w, 3);
  if (!front) { // 앞면은 3D 간판이 가린다. 나머지 면은 가로로 긴 유리 띠
    g.fillStyle = '#f2eee4'; g.fillRect(margin * PPM - 3, bandY + 0.14 * PPM - 3, (fw - 2 * margin) * PPM + 6, 0.42 * PPM + 6);
    const gr = g.createLinearGradient(0, bandY, 0, bandY + bandH);
    gr.addColorStop(0, '#8fc0f0'); gr.addColorStop(1, '#3f6ea8');
    g.fillStyle = gr; g.fillRect(margin * PPM, bandY + 0.14 * PPM, (fw - 2 * margin) * PPM, 0.42 * PPM);
  }
  // 로비
  const ly = (OFFICE.floors * OFFICE.floorH + OFFICE.band) * PPM;
  const lh = OFFICE.lobby * PPM;
  g.fillStyle = CONCRETE_DARK; g.fillRect(0, ly - 2, w, 3);
  if (lobby === 'solid') {
    g.fillStyle = '#c9bfb0'; g.fillRect(0, ly, w, lh);
    for (const fx of [0.3, 0.7]) paintWindow(g, fw * PPM * fx - 28, ly + 0.7 * PPM, 56, 0.5 * PPM, false);
  } else {
    const gx = margin * 0.5 * PPM; // 유리벽 좌우 여백
    const gy = ly + 0.2 * PPM;
    const gh = lh - 0.2 * PPM - 0.14 * PPM;
    const gr = g.createLinearGradient(0, gy, 0, gy + gh);
    gr.addColorStop(0, '#7fb0e0'); gr.addColorStop(0.5, '#4a78b0'); gr.addColorStop(1, '#6b6a62');
    g.fillStyle = '#f2eee4'; g.fillRect(gx - 3, gy - 3, w - 2 * gx + 6, gh + 6);
    g.fillStyle = gr; g.fillRect(gx, gy, w - 2 * gx, gh);
    const glow = g.createLinearGradient(0, gy, 0, gy + gh); // 로비 안쪽의 따뜻한 조명
    glow.addColorStop(0, 'rgba(255,214,150,0.0)'); glow.addColorStop(1, 'rgba(255,214,150,0.30)');
    g.fillStyle = glow; g.fillRect(gx, gy, w - 2 * gx, gh);
    emitRect(gx, gy + gh * 0.45, w - 2 * gx, gh * 0.55, '#6a5a44');
    g.fillStyle = 'rgba(255,255,255,0.13)'; // 반사
    g.beginPath();
    g.moveTo(gx + w * 0.12, gy + gh); g.lineTo(gx + w * 0.34, gy); g.lineTo(gx + w * 0.5, gy); g.lineTo(gx + w * 0.28, gy + gh);
    g.closePath(); g.fill();
    const panes = Math.max(2, Math.round(fw / 0.9)); // 세로 문설주
    g.fillStyle = '#e9e4d8';
    for (let i = 1; i < panes; i++) g.fillRect(gx + ((w - 2 * gx) * i) / panes - 2.5, gy, 5, gh);
    g.fillRect(gx, gy + 0.35 * PPM, w - 2 * gx, 4); // 가로 문설주(트랜섬)
    if (lobby === 'front') { // 출입구 자리: 짙은 개구부(3D 문이 앞에 선다)
      const ox = (doorX + fw / 2 - 0.7) * PPM;
      g.fillStyle = '#e9e4d8'; g.fillRect(ox - 6, gy, 1.4 * PPM + 12, gh);
      g.fillStyle = '#34455a'; g.fillRect(ox, gy + 0.04 * PPM, 1.4 * PPM, gh - 0.04 * PPM);
    }
  }
  g.fillStyle = '#6e6a64'; g.fillRect(0, h - 0.14 * PPM, w, 0.14 * PPM); // 화강암 기단
  return { map: texOf(canvas), emissive: texOf(em.canvas) };
}

// 옥상 난간 간판 면(남색 바탕, 금색 테두리, 서류가방 로고와 글씨).
function crownSignCanvas(w, h, text) {
  const { canvas, g } = makeCanvas(w, h);
  g.fillStyle = NAVY; g.fillRect(0, 0, w, h);
  g.strokeStyle = GOLD; g.lineWidth = 8; g.strokeRect(10, 10, w - 20, h - 20);
  const s = h * 0.5; // 로고(서류가방)
  const lx = w * 0.5 - Math.min(w * 0.3, 190) - s * 0.9;
  const ly = h / 2 - s * 0.3;
  g.fillStyle = GOLD;
  roundRect(g, lx, ly, s * 1.2, s * 0.8, 8); g.fill();
  g.strokeStyle = GOLD; g.lineWidth = 7; roundRect(g, lx + s * 0.38, ly - s * 0.22, s * 0.44, s * 0.3, 6); g.stroke();
  g.fillStyle = NAVY; g.fillRect(lx, ly + s * 0.36, s * 1.2, 5);
  fitText(g, text, w * 0.5 + s * 0.45, h / 2 + 4, w * 0.6, h * 0.66, '#f6e7c8');
  return canvas;
}

// 입구 위 간판 띠(작은 글씨 부제 포함).
function entranceSignCanvas(w, h) {
  const { canvas, g } = makeCanvas(w, h);
  g.fillStyle = '#34465f'; g.fillRect(0, 0, w, h);
  g.strokeStyle = GOLD; g.lineWidth = 6; g.strokeRect(8, 8, w - 16, h - 16);
  fitText(g, '면접장', w * 0.38, h / 2 + 4, w * 0.42, h * 0.62, '#f6e7c8');
  g.fillStyle = GOLD; g.fillRect(w * 0.6, h * 0.2, 4, h * 0.6);
  fitText(g, 'INTERVIEW', w * 0.78, h * 0.38, w * 0.28, h * 0.26, '#e9dcc0');
  fitText(g, 'HALL  ·  2F 로비', w * 0.78, h * 0.68, w * 0.28, h * 0.22, '#b9c7d8', 'normal');
  return canvas;
}

function buildOfficeTower(b) {
  const group = new THREE.Group();
  const W = b.width;
  const D = b.depth;
  const hw = W / 2;
  const hd = D / 2;
  const H = OFFICE.bodyH;
  const dx = b.doorLocalX ?? 1.8;
  const side = Math.sign(dx) || 1;
  const batch = makeBatch();
  const cream = std(0xefe9dc);
  const steel = std(0x4a5666, { roughness: 0.5, metalness: 0.2 });
  const gold = std(0xd9b27c);
  const concrete = std(0xcfc6b8);
  const roofDeck = std(0x8f9094);

  // 본체: 면마다 창 격자 텍스처(+x 남쪽, -x 북쪽, 지붕, 바닥, +z 정면, -z 뒤).
  const faceMat = (tx) => new THREE.MeshStandardMaterial({ map: tx.map, emissiveMap: tx.emissive, emissive: 0xffffff, emissiveIntensity: 0.5, roughness: 0.7, metalness: 0 });
  const front = officeFaceTextures(W, 11, { cols: 5, lobby: 'front', doorX: dx, front: true });
  const south = officeFaceTextures(D, 23, { cols: 3, lobby: 'glass' });
  const back = officeFaceTextures(W, 37, { cols: 5, lobby: 'solid' });
  const north = officeFaceTextures(D, 41, { cols: 3, lobby: 'solid' });
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(W, H, D),
    [faceMat(south), faceMat(north), std(0x6f6a64), std(0x6f6a64), faceMat(front), faceMat(back)],
  );
  body.position.y = H / 2;
  body.castShadow = true;
  group.add(body);

  // 모서리 기둥 4개, 로비 위 처마띠와 지붕 처마(층 구분 그림자 선).
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) batch.box(cream, OFFICE.piers, H, OFFICE.piers, sx * (hw - OFFICE.piers / 2 + 0.02), H / 2, sz * (hd - OFFICE.piers / 2 + 0.02));
  const cornY = OFFICE.lobby + 0.04;
  batch.box(cream, W + 0.14, 0.1, D + 0.14, 0, cornY, 0);
  batch.box(cream, W + 0.16, 0.2, D + 0.16, 0, H - 0.1, 0); // 지붕 처마
  batch.box(roofDeck, W - 0.1, 0.04, D - 0.1, 0, H + 0.02, 0); // 옥상 바닥

  // 옥상 난간: 앞(+z)·남쪽(+x)은 간판(높이 0.95), 뒤·북쪽은 낮은 난간.
  const t = 0.22;
  batch.box(concrete, W + 0.14, OFFICE.parapetBack, t, 0, H + OFFICE.parapetBack / 2, -hd - 0.07 + t / 2);
  batch.box(concrete, t, OFFICE.parapetBack, D + 0.14, -hw - 0.07 + t / 2, H + OFFICE.parapetBack / 2, 0);
  batch.box(cream, W + 0.24, 0.05, t + 0.06, 0, H + OFFICE.parapetBack + 0.02, -hd - 0.07 + t / 2); // 난간 머릿돌
  batch.box(cream, t + 0.06, 0.05, D + 0.24, -hw - 0.07 + t / 2, H + OFFICE.parapetBack + 0.02, 0);
  const signH = OFFICE.parapetSign;
  const crownFront = new THREE.Mesh(new THREE.BoxGeometry(W + 0.14, signH, t), [concrete, concrete, concrete, concrete, signMat(crownSignCanvas(1160, 200, '면접장')), concrete]);
  crownFront.position.set(0, H + signH / 2, hd + 0.07 - t / 2);
  const crownSouth = new THREE.Mesh(new THREE.BoxGeometry(t, signH, D + 0.14), [signMat(crownSignCanvas(780, 200, '면접장')), concrete, concrete, concrete, concrete, concrete]);
  crownSouth.position.set(hw + 0.07 - t / 2, H + signH / 2, 0);
  for (const m of [crownFront, crownSouth]) { m.castShadow = true; group.add(m); }
  batch.box(cream, W + 0.24, 0.05, t + 0.06, 0, H + signH + 0.02, hd + 0.07 - t / 2);
  batch.box(cream, t + 0.06, 0.05, D + 0.24, hw + 0.07 - t / 2, H + signH + 0.02, 0);

  // 옥상 설비: 계단실, 물탱크, 실외기, 안테나, 위성안테나.
  const grey = std(0xbfc3c7, { roughness: 0.6, metalness: 0.15 });
  const darkGrey = std(0x4a4f57, { roughness: 0.6 });
  const wood = std(0x8a5f3a);
  const topY = H + 0.04;
  batch.box(concrete, 1.3, 1.0, 0.95, -1.45, topY + 0.5, -0.45); // 계단실
  batch.box(cream, 1.4, 0.08, 1.05, -1.45, topY + 1.04, -0.45);
  batch.box(steel, 0.38, 0.62, 0.04, -1.45, topY + 0.31, 0.04); // 계단실 문
  for (const [lx, lz] of [[-0.3, -0.3], [0.3, -0.3], [-0.3, 0.3], [0.3, 0.3]]) batch.box(steel, 0.06, 0.4, 0.06, 1.2 + lx * 0.9, topY + 0.2, -0.85 + lz);
  batch.box(steel, 0.9, 0.05, 0.9, 1.2, topY + 0.42, -0.85);
  batch.cyl(wood, 0.42, 0.42, 0.85, 14, 1.2, topY + 0.87, -0.85);
  batch.cyl(steel, 0.435, 0.435, 0.04, 14, 1.2, topY + 0.65, -0.85);
  batch.cyl(steel, 0.435, 0.435, 0.04, 14, 1.2, topY + 1.05, -0.85);
  batch.cyl(darkGrey, 0.02, 0.46, 0.28, 14, 1.2, topY + 1.43, -0.85); // 원뿔 지붕
  for (const [x, z] of [[-0.1, 0.85], [0.7, 0.85], [-0.1, 0.1]]) { // 실외기
    batch.box(grey, 0.62, 0.42, 0.45, x, topY + 0.21, z);
    batch.cyl(darkGrey, 0.17, 0.17, 0.03, 14, x, topY + 0.435, z);
    batch.box(darkGrey, 0.62, 0.05, 0.02, x, topY + 0.22, z + 0.23);
  }
  batch.cyl(steel, 0.025, 0.035, 2.1, 6, -2.0, topY + 1.05, -1.3); // 안테나 기둥
  batch.box(steel, 0.5, 0.03, 0.03, -2.0, topY + 1.7, -1.3);
  batch.box(steel, 0.34, 0.03, 0.03, -2.0, topY + 1.95, -1.3);
  batch.cyl(steel, 0.02, 0.02, 0.5, 6, 2.0, topY + 0.25, -1.25); // 위성안테나
  batch.sphere(grey, 0.26, 2.0, topY + 0.62, -1.25, 1, 0.3, 1);
  batch.flush(group);
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff4a3a }));
  lamp.position.set(-2.0, topY + 2.12, -1.3); // 항공장애등
  group.add(lamp);

  // 정면 입구: 유리문, 차양(캐노피), 입구 위 간판 띠, 아래 포장 바닥.
  const doorY = 2.0;
  const dc = makeCanvas(130, 200); // 문 유리: 위는 하늘빛 반사, 아래는 로비 조명
  const dgr = dc.g.createLinearGradient(0, 0, 0, 200);
  dgr.addColorStop(0, '#9dbbd6'); dgr.addColorStop(0.55, '#5d7c9a'); dgr.addColorStop(1, '#d9b57a');
  dc.g.fillStyle = dgr; dc.g.fillRect(0, 0, 130, 200);
  dc.g.fillStyle = 'rgba(255,255,255,0.2)';
  dc.g.beginPath(); dc.g.moveTo(10, 200); dc.g.lineTo(60, 0); dc.g.lineTo(95, 0); dc.g.lineTo(45, 200); dc.g.closePath(); dc.g.fill();
  const doorMat = new THREE.MeshBasicMaterial({ map: texOf(dc.canvas), toneMapped: false, color: 0xe8e2d8 });
  for (const sx of [-1, 1]) plane(group, doorMat, 0.62, doorY - 0.06, dx + sx * 0.32, doorY / 2 + 0.04, hd + 0.02);
  batch.box(steel, 0.06, doorY + 0.18, 0.12, dx - 0.68, (doorY + 0.18) / 2, hd + 0.04);
  batch.box(steel, 0.06, doorY + 0.18, 0.12, dx + 0.68, (doorY + 0.18) / 2, hd + 0.04);
  batch.box(steel, 1.42, 0.1, 0.12, dx, doorY + 0.1, hd + 0.04);
  batch.box(steel, 0.05, doorY, 0.1, dx, doorY / 2 + 0.04, hd + 0.04);
  for (const sx of [-1, 1]) batch.cyl(grey, 0.016, 0.016, 0.55, 8, dx + sx * 0.12, 1.0, hd + 0.12);
  batch.box(std(0x7a3a2e), 1.0, 0.02, 0.55, dx, 0.03, hd + 0.4); // 현관 매트
  batch.box(std(0xc5bdae), 2.3, 0.04, 1.3, dx, 0.02, hd + 0.75); // 입구 포장
  batch.box(cream, 1.9, 0.1, 1.0, dx, 2.2, hd + 0.5); // 차양 판
  batch.box(gold, 1.9, 0.17, 0.06, dx, 2.2, hd + 1.0);
  for (const sx of [-1, 1]) batch.box(gold, 0.06, 0.17, 1.0, dx + sx * 0.92, 2.2, hd + 0.5);
  // 입구 옆 화단 2개와 관목
  const leaf = std(0x5f8f3a);
  const box = std(0x8d8678);
  for (const px of [-side * 0.9, -side * 2.0]) {
    batch.box(box, 0.85, 0.34, 0.5, px, 0.17, hd + 0.3);
    batch.sphere(leaf, 0.3, px - 0.18, 0.5, hd + 0.3);
    batch.sphere(leaf, 0.34, px + 0.14, 0.55, hd + 0.3);
  }
  batch.flush(group, { cast: true, receive: false });
  // 차양 아래 조명(두 개)
  for (const sx of [-1, 1]) {
    const dl = new THREE.Mesh(new THREE.CircleGeometry(0.07, 10), new THREE.MeshBasicMaterial({ color: 0xffe6b0, toneMapped: false }));
    dl.rotation.x = Math.PI / 2;
    dl.position.set(dx + sx * 0.5, 2.145, hd + 0.6);
    group.add(dl);
  }
  const entSign = new THREE.Mesh(new THREE.BoxGeometry(W - 0.5, 0.58, 0.1), [cream, cream, cream, cream, signMat(entranceSignCanvas(1100, 120)), cream]);
  entSign.position.set(0, OFFICE.lobby + OFFICE.band / 2 + 0.02, hd + 0.05);
  entSign.castShadow = true;
  group.add(entSign);

  group.position.set(b.x, 0, b.z);
  group.rotation.y = b.rotY;
  return { group };
}

// ============================================================
// 세탁소: 작은 상가
// ============================================================
const SHOP = { h: 3.1, parapet: 0.35, win: { x0: -1.0, x1: 2.4, y0: 0.55, y1: 2.05 }, doorW: 0.95, doorH: 2.0 };
// 세탁소 외관·실내가 함께 쓰는 팔레트(config.js 의 LAUNDRY_LOOK).
const TEAL = LAUNDRY_LOOK.teal;
const TEAL_DARK = LAUNDRY_LOOK.tealFrame;
const CREAM = LAUNDRY_LOOK.cream;
const BRICK = 0xa8553c;

function paintWasher(g, x, y, s) {
  g.fillStyle = '#f4f1e8'; roundRect(g, x, y, s, s, s * 0.1); g.fill();
  g.strokeStyle = '#cfc8b8'; g.lineWidth = 3; g.stroke();
  g.fillStyle = '#9fb4c0'; g.fillRect(x + s * 0.08, y + s * 0.1, s * 0.84, s * 0.14); // 조작부
  g.fillStyle = '#e07a5f'; g.beginPath(); g.arc(x + s * 0.2, y + s * 0.17, s * 0.045, 0, 7); g.fill();
  g.fillStyle = '#5aa9d6'; g.beginPath(); g.arc(x + s * 0.5, y + s * 0.6, s * 0.3, 0, 7); g.fill(); // 문(물)
  g.strokeStyle = '#b8c4cc'; g.lineWidth = s * 0.06; g.stroke();
  g.fillStyle = 'rgba(255,255,255,0.55)'; g.beginPath(); g.arc(x + s * 0.4, y + s * 0.5, s * 0.07, 0, 7); g.fill();
  g.fillStyle = 'rgba(255,255,255,0.8)'; // 거품
  for (const [bx, by, br] of [[0.62, 0.66, 0.05], [0.55, 0.74, 0.035], [0.7, 0.55, 0.03]]) { g.beginPath(); g.arc(x + s * bx, y + s * by, s * br, 0, 7); g.fill(); }
}

function paintShirt(g, cx, top, s, color) {
  g.fillStyle = color;
  g.beginPath();
  g.moveTo(cx - s * 0.17, top); g.lineTo(cx - s * 0.5, top + s * 0.22); g.lineTo(cx - s * 0.4, top + s * 0.42); g.lineTo(cx - s * 0.3, top + s * 0.36);
  g.lineTo(cx - s * 0.3, top + s * 1.0); g.lineTo(cx + s * 0.3, top + s * 1.0); g.lineTo(cx + s * 0.3, top + s * 0.36); g.lineTo(cx + s * 0.4, top + s * 0.42);
  g.lineTo(cx + s * 0.5, top + s * 0.22); g.lineTo(cx + s * 0.17, top); g.lineTo(cx, top + s * 0.1); g.closePath(); g.fill();
}

function shopSignCanvas(w, h) {
  const { canvas, g } = makeCanvas(w, h);
  g.fillStyle = TEAL; g.fillRect(0, 0, w, h);
  g.strokeStyle = CREAM; g.lineWidth = 7; g.strokeRect(9, 9, w - 18, h - 18);
  paintWasher(g, 28, 22, h - 44);
  paintShirt(g, w - 80, 26, h - 56, '#f6f1e6');
  fitText(g, '세탁소', w * 0.5, h / 2 + 5, w * 0.5, h * 0.7, CREAM);
  return canvas;
}

function bladeSignCanvas(s) {
  const { canvas, g } = makeCanvas(s, s);
  g.fillStyle = '#e9d9ae'; g.fillRect(0, 0, s, s);
  g.strokeStyle = TEAL; g.lineWidth = 10; g.strokeRect(8, 8, s - 16, s - 16);
  paintShirt(g, s / 2, s * 0.12, s * 0.52, '#6fb1c8');
  fitText(g, '세탁 · 다림질', s / 2, s * 0.84, s * 0.76, s * 0.2, '#2a4a52');
  return canvas;
}

function aFrameCanvas() {
  const { canvas, g } = makeCanvas(256, 360);
  g.fillStyle = '#2f3a33'; g.fillRect(0, 0, 256, 360);
  g.strokeStyle = '#d9b27c'; g.lineWidth = 10; g.strokeRect(8, 8, 240, 344);
  fitText(g, '오늘의', 128, 70, 190, 56, '#f6f1e6');
  fitText(g, '세탁', 128, 140, 190, 70, '#ffd98a');
  fitText(g, '접수 중', 128, 210, 190, 56, '#f6f1e6');
  paintShirt(g, 128, 250, 90, '#8fc2f5');
  return canvas;
}

// 쇼윈도 안쪽 풍경: 따뜻한 벽, 옷걸이 봉에 걸린 셔츠, 선반 위 개어 놓은 옷.
function displayCanvas(w, h) {
  const { canvas, g } = makeCanvas(w, h);
  const wall = g.createLinearGradient(0, 0, 0, h);
  wall.addColorStop(0, '#fff1cf'); wall.addColorStop(1, '#f3d79b');
  g.fillStyle = wall; g.fillRect(0, 0, w, h);
  g.fillStyle = '#c99a5b'; g.fillRect(0, h - h * 0.12, w, h * 0.12); // 바닥
  g.fillStyle = '#8c6a44'; g.fillRect(0, h * 0.19, w, 6); // 옷걸이 봉
  const colors = ['#8fc2f5', '#f6f1e6', '#f2a7b5', '#a9d6a0', '#f6f1e6', '#ffd98a', '#8fc2f5'];
  const n = colors.length;
  colors.forEach((c, i) => paintShirt(g, ((i + 0.5) * w) / n, h * 0.2, w / n * 0.78, c));
  g.fillStyle = '#a77a4a'; g.fillRect(w * 0.08, h * 0.66, w * 0.84, 8); // 선반
  const stackColors = ['#f6f1e6', '#8fc2f5', '#f2a7b5', '#ffd98a'];
  stackColors.forEach((c, i) => {
    for (let k = 0; k < 4; k++) { g.fillStyle = k % 2 ? c : '#fff8e8'; g.fillRect(w * (0.14 + i * 0.2), h * (0.66 - 0.05 * (k + 1)), w * 0.14, h * 0.045); }
  });
  return canvas;
}

function stripeCanvas() {
  const { canvas, g } = makeCanvas(256, 64);
  const n = 8;
  for (let i = 0; i < n; i++) { g.fillStyle = i % 2 ? LAUNDRY_LOOK.stripeLight : LAUNDRY_LOOK.tealStripe; g.fillRect((i * 256) / n, 0, 256 / n + 1, 64); }
  return canvas;
}

// 처마(발랑스) 무늬: 줄무늬 + 아래쪽 물결(반원) 모양으로 오려낸다.
function valanceCanvas() {
  const { canvas, g } = makeCanvas(256, 64);
  const n = 8;
  const r = 256 / n / 2;
  g.beginPath();
  g.rect(0, 0, 256, 64 - r);
  for (let i = 0; i < n; i++) g.arc((i + 0.5) * (256 / n), 64 - r, r, 0, Math.PI);
  g.clip();
  for (let i = 0; i < n; i++) { g.fillStyle = i % 2 ? LAUNDRY_LOOK.stripeLight : LAUNDRY_LOOK.tealStripe; g.fillRect((i * 256) / n, 0, 256 / n + 1, 64); }
  return canvas;
}

// "OPEN" 표시 캔버스(외관 문 안쪽 유리 위와 실내 출입문 안쪽이 같은 그림을 쓴다).
function openTagCanvas() {
  const openTag = makeCanvas(200, 80);
  openTag.g.fillStyle = '#b5372c'; roundRect(openTag.g, 4, 4, 192, 72, 14); openTag.g.fill();
  fitText(openTag.g, 'OPEN', 100, 44, 170, 56, '#fff1d6');
  return openTag.canvas;
}

function buildShop(b) {
  const group = new THREE.Group();
  const W = b.width;
  const D = b.depth;
  const hw = W / 2;
  const hd = D / 2;
  const H = SHOP.h;
  const dx = b.doorLocalX ?? -1.8;
  const batch = makeBatch();
  const wallMat = std(0xefdcae);
  const teal = std(TEAL_DARK);
  const brick = std(BRICK);
  const cream = std(0xf4e9cd);
  const steelM = std(0x59606a, { roughness: 0.5, metalness: 0.2 });

  // 본체(따뜻한 크림색 회벽)와 벽돌색 하단부.
  const body = new THREE.Mesh(new THREE.BoxGeometry(W, H, D), wallMat);
  body.position.y = H / 2;
  body.castShadow = true;
  group.add(body);
  const bulkhead = (w, d, x, z) => batch.box(brick, w, 0.5, d, x, 0.25, z);
  bulkhead(W + 0.06, 0.06, 0, hd + 0.02);
  bulkhead(0.06, D + 0.06, hw + 0.02, 0);
  bulkhead(0.06, D + 0.06, -hw - 0.02, 0);
  bulkhead(W + 0.06, 0.06, 0, -hd - 0.02);
  batch.box(cream, W + 0.1, 0.1, D + 0.1, 0, H - 0.05, 0); // 처마띠
  batch.box(dark(), W - 0.1, 0.04, D - 0.1, 0, H + 0.02, 0); // 옥상 바닥
  // 난간(전 둘레)
  const t = 0.18;
  const ph = SHOP.parapet;
  batch.box(cream, W + 0.1, ph, t, 0, H + ph / 2, hd + 0.05 - t / 2);
  batch.box(cream, W + 0.1, ph, t, 0, H + ph / 2, -hd - 0.05 + t / 2);
  batch.box(cream, t, ph, D + 0.1, hw + 0.05 - t / 2, H + ph / 2, 0);
  batch.box(cream, t, ph, D + 0.1, -hw - 0.05 + t / 2, H + ph / 2, 0);
  batch.box(teal, W + 0.2, 0.05, t + 0.06, 0, H + ph + 0.02, hd + 0.05 - t / 2);
  batch.box(teal, W + 0.2, 0.05, t + 0.06, 0, H + ph + 0.02, -hd - 0.05 + t / 2);
  batch.box(teal, t + 0.06, 0.05, D + 0.2, hw + 0.05 - t / 2, H + ph + 0.02, 0);
  batch.box(teal, t + 0.06, 0.05, D + 0.2, -hw - 0.05 + t / 2, H + ph + 0.02, 0);
  // 옥상 소품: 실외기와 환기구
  const grey = std(0xc4c8cc, { roughness: 0.6, metalness: 0.15 });
  batch.box(grey, 0.7, 0.45, 0.5, -1.2, H + 0.26, -0.6);
  batch.cyl(std(0x4a4f57), 0.18, 0.18, 0.03, 14, -1.2, H + 0.5, -0.6);
  batch.cyl(grey, 0.14, 0.14, 0.7, 10, 1.4, H + 0.38, -0.5);
  batch.cyl(grey, 0.2, 0.14, 0.12, 10, 1.4, H + 0.78, -0.5);
  batch.box(grey, 0.5, 0.3, 0.4, 0.3, H + 0.2, -0.9);

  // 쇼윈도(문 옆 큰 유리창): 안쪽 풍경 + 바깥 유리 + 틀.
  const { x0, x1, y0, y1 } = SHOP.win;
  const ww = x1 - x0;
  const wcx = (x0 + x1) / 2;
  const wh = y1 - y0;
  const wy = (y0 + y1) / 2;
  const dispMat = new THREE.MeshBasicMaterial({ map: texOf(displayCanvas(680, 300)), toneMapped: false, color: 0xfff3e0 });
  plane(group, dispMat, ww, wh, wcx, wy, hd + 0.01);
  const gl = makeCanvas(256, 128); // 유리 반사
  gl.g.fillStyle = 'rgba(255,255,255,0.0)'; gl.g.fillRect(0, 0, 256, 128);
  gl.g.fillStyle = 'rgba(255,255,255,0.18)';
  gl.g.beginPath(); gl.g.moveTo(30, 128); gl.g.lineTo(95, 0); gl.g.lineTo(130, 0); gl.g.lineTo(65, 128); gl.g.closePath(); gl.g.fill();
  gl.g.beginPath(); gl.g.moveTo(150, 128); gl.g.lineTo(200, 0); gl.g.lineTo(215, 0); gl.g.lineTo(165, 128); gl.g.closePath(); gl.g.fill();
  const reflect = new THREE.MeshBasicMaterial({ map: texOf(gl.canvas), transparent: true, depthWrite: false, toneMapped: false });
  plane(group, reflect, ww, wh, wcx, wy, hd + 0.03);
  const fr = 0.07;
  batch.box(teal, ww + 2 * fr, fr, 0.12, wcx, y1 + fr / 2, hd + 0.05);
  batch.box(teal, ww + 2 * fr, fr, 0.12, wcx, y0 - fr / 2, hd + 0.05);
  for (const x of [x0 - fr / 2, x1 + fr / 2, wcx]) batch.box(teal, fr, wh + 2 * fr, 0.12, x, wy, hd + 0.05);
  batch.box(cream, ww + 0.3, 0.06, 0.22, wcx, y0 - fr - 0.03, hd + 0.1); // 창대

  // 문: 유리 문짝, 틀, 손잡이, OPEN 표시.
  const dW = SHOP.doorW;
  const dH = SHOP.doorH;
  const doorGlass = new THREE.MeshBasicMaterial({ color: 0xe6f2ec, toneMapped: false }); // 실내 유리와 같은 서리 유리 느낌(밖에서 안이 안 보인다)
  plane(group, doorGlass, dW - 0.2, dH - 0.75, dx, 0.45 + (dH - 0.75) / 2 + 0.2, hd + 0.01);
  batch.box(teal, dW, 0.5, 0.06, dx, 0.25 + 0.04, hd + 0.04); // 아래 판
  batch.box(teal, 0.1, dH, 0.12, dx - dW / 2 + 0.05, dH / 2, hd + 0.05);
  batch.box(teal, 0.1, dH, 0.12, dx + dW / 2 - 0.05, dH / 2, hd + 0.05);
  batch.box(teal, dW, 0.1, 0.12, dx, dH - 0.05, hd + 0.05);
  batch.box(teal, dW - 0.2, 0.06, 0.1, dx, 0.5 + 0.2, hd + 0.045);
  batch.box(teal, dW + 0.2, 0.1, 0.12, dx, dH + 0.18, hd + 0.05); // 문 위 틀
  const kicks = std(0x6b4a2f);
  batch.box(kicks, 0.04, 0.4, 0.05, dx + dW / 2 - 0.2, 1.0, hd + 0.1); // 손잡이
  batch.box(std(0x7a3a2e), 1.1, 0.02, 0.55, dx, 0.03, hd + 0.4); // 현관 매트
  plane(group, new THREE.MeshBasicMaterial({ map: texOf(openTagCanvas()), toneMapped: false }), 0.32, 0.128, dx - 0.12, 1.55, hd + 0.115);

  // 줄무늬 차양: 문과 쇼윈도 위(경사판 + 물결 처마).
  const awnX0 = -hw + 0.2;
  const awnX1 = hw - 0.2;
  const awnW = awnX1 - awnX0;
  const awnC = (awnX0 + awnX1) / 2;
  const proj = 0.95;
  const yHi = 2.6;
  const yLo = 2.25;
  const slope = Math.hypot(proj, yHi - yLo);
  const stripes = texOf(stripeCanvas(), { repeat: [1, 1] });
  const stripeMat = new THREE.MeshStandardMaterial({ map: stripes, roughness: 0.9, side: THREE.DoubleSide });
  const awning = new THREE.Mesh(new THREE.BoxGeometry(awnW, 0.04, slope), stripeMat);
  awning.position.set(awnC, (yHi + yLo) / 2, hd + proj / 2);
  awning.rotation.x = Math.atan2(yHi - yLo, proj);
  awning.castShadow = true;
  group.add(awning);
  const valance = new THREE.Mesh(new THREE.PlaneGeometry(awnW, 0.24), new THREE.MeshStandardMaterial({ map: texOf(valanceCanvas()), alphaTest: 0.5, roughness: 0.9, side: THREE.DoubleSide }));
  valance.position.set(awnC, yLo - 0.1, hd + proj);
  group.add(valance);
  for (const sx of [-1, 1]) { // 차양 옆면 삼각 가리개
    const tri = new THREE.Shape();
    tri.moveTo(0, 0); tri.lineTo(proj, -(yHi - yLo)); tri.lineTo(0, -(yHi - yLo)); tri.closePath();
    const m = new THREE.Mesh(new THREE.ShapeGeometry(tri), new THREE.MeshStandardMaterial({ color: 0x2c8a99, side: THREE.DoubleSide }));
    m.rotation.y = -Math.PI / 2; // 모양의 x 를 +z 로
    m.position.set(sx > 0 ? awnX1 : awnX0, yHi, hd);
    group.add(m);
  }

  // 간판: 차양 위 정면 가운데(세탁기·셔츠 그림 + 글씨).
  const signW = 4.0;
  const signY = 2.95;
  const signBoard = new THREE.Mesh(new THREE.BoxGeometry(signW, 0.66, 0.1), [cream, cream, cream, cream, signMat(shopSignCanvas(1200, 200)), cream]);
  signBoard.position.set(0, signY, hd + 0.05);
  signBoard.castShadow = true;
  group.add(signBoard);

  // 남쪽 옆면: 모서리 가게 느낌의 옆 창과 짧은 차양, 튀어나온 걸이 간판.
  const sw = 1.6;
  const swz = 0.35; // 옆 창 중심(로컬 z)
  plane(group, dispMat, sw, wh, hw + 0.006, wy, swz, Math.PI / 2);
  plane(group, reflect, sw, wh, hw + 0.03, wy, swz, Math.PI / 2);
  batch.box(teal, 0.12, fr, sw + 2 * fr, hw + 0.05, y1 + fr / 2, swz);
  batch.box(teal, 0.12, fr, sw + 2 * fr, hw + 0.05, y0 - fr / 2, swz);
  for (const z of [swz - sw / 2 - fr / 2, swz + sw / 2 + fr / 2]) batch.box(teal, 0.12, wh + 2 * fr, fr, hw + 0.05, wy, z);
  batch.box(cream, 0.22, 0.06, sw + 0.3, hw + 0.1, y0 - fr - 0.03, swz);
  const sTex = texOf(stripeCanvas());
  sTex.center.set(0.5, 0.5);
  sTex.rotation = Math.PI / 2; // 줄이 경사 방향(바깥)으로 달리게
  const sProj = 0.6;
  const sDrop = 0.3;
  const sAw = new THREE.Mesh(new THREE.BoxGeometry(Math.hypot(sProj, sDrop), 0.04, sw + 0.3), new THREE.MeshStandardMaterial({ map: sTex, roughness: 0.9, side: THREE.DoubleSide }));
  sAw.position.set(hw + sProj / 2, 2.45 - sDrop / 2, swz);
  sAw.rotation.z = -Math.atan2(sDrop, sProj); // 바깥(+x)으로 갈수록 낮아진다
  sAw.castShadow = true;
  group.add(sAw);
  // 걸이 간판: 모서리 근처 벽에서 바깥(+x)으로 뻗은 팔에 매달린 정사각 간판.
  const bz = hd - 0.3;
  batch.box(steelM, 0.8, 0.04, 0.04, hw + 0.4, 2.88, bz);
  const bladeMat = signMat(bladeSignCanvas(256));
  const blade = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.7, 0.06), [cream, cream, cream, cream, bladeMat, bladeMat]);
  blade.position.set(hw + 0.45, 2.42, bz);
  group.add(blade);
  for (const sx of [-0.25, 0.25]) batch.box(steelM, 0.012, 0.12, 0.012, hw + 0.45 + sx, 2.83, bz);

  // 앞마당 소품: 에이프레임 입간판, 화분 상자.
  const af = new THREE.MeshStandardMaterial({ map: texOf(aFrameCanvas()), roughness: 0.9 });
  const woodSide = std(0x8a5f3a);
  for (const s of [-1, 1]) {
    const board = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.82, 0.04), [woodSide, woodSide, woodSide, woodSide, s > 0 ? af : woodSide, s > 0 ? woodSide : af]);
    board.position.set(1.15, 0.4, hd + 0.62 + s * 0.14);
    board.rotation.x = -s * 0.2;
    board.castShadow = true;
    group.add(board);
  }
  const leaf = std(0x5f8f3a);
  const pot = std(0x9a5a3a);
  for (const px of [hw - 0.35, -hw + 0.3]) {
    batch.box(pot, 0.6, 0.32, 0.38, px, 0.16, hd + 0.28);
    batch.sphere(leaf, 0.24, px - 0.14, 0.46, hd + 0.28);
    batch.sphere(leaf, 0.28, px + 0.12, 0.5, hd + 0.28);
  }
  batch.flush(group);

  group.position.set(b.x, 0, b.z);
  group.rotation.y = b.rotY;
  return { group };
}

function dark() { return std(0x8d9196); }

// 세탁소 실내가 같은 그림을 쓰도록 내보낸다: 간판(청록 판 + 세탁기·셔츠 + 글씨), 줄무늬·물결 차양 무늬, OPEN 표시.
export { buildOfficeTower, buildShop, shopSignCanvas as laundrySignCanvas, stripeCanvas, valanceCanvas, openTagCanvas };
