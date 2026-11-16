// 브라우저 전용: 소각장 물건 6종의 손에 드는 소품과 선택 창 그림. 물건 표는 config.js 의 INCINERATOR.items 이고 prop.kind 로 그림이 정해진다.
// 종이 물건(불합격 통지서·취업 잔소리 쪽지)은 src/notice.js 의 종이 소품(buildSheetProp: 앞뒤 모두 읽히는 납작한 종이 + 구겨진 공),
// 두툼한 물건(자소서·이력서 뭉치, 인적성 교재, 토익 단어장)은 표지 캔버스를 얹은 두꺼운 상자(buildSolid), 오로라 가루는 글씨 없는 천 주머니(buildPouch)다.
// 모든 소품은 userData.setCrumple(k) 와 userData.rot(손에 쥘 때의 방향)을 갖는다. 종이·두꺼운 소품은 rot [π/2,0,0] 으로 세우면 앞면이 +z 를 향하고 윗쪽이 하늘이다.
import * as THREE from 'three';
import { buildSheetProp, noticeFace, buildPaper } from './notice.js';

const W = 480;
const H = 640;
const FONT = '"Malgun Gothic", "Apple SD Gothic Neo", "Noto Sans KR", sans-serif';

function makeCanvas(w, h) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  return [canvas, canvas.getContext('2d')];
}

function fit(g, text, maxWidth, px, weight = 'bold') {
  g.font = `${weight} ${px}px ${FONT}`;
  const w = g.measureText(text).width;
  if (w > maxWidth) g.font = `${weight} ${Math.floor(px * maxWidth / w)}px ${FONT}`;
}

// 손글씨처럼 보이는 줄: 작게 출렁이는 선(결정적 난수). 글씨 한 줄을 흉내 낸다.
function scribble(g, x, y, width, seed, color = '#33405a') {
  let s = seed * 9301 + 49297;
  const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  g.strokeStyle = color;
  g.lineWidth = 3.5;
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(x, y);
  for (let cx = x; cx < x + width;) {
    const step = 10 + rnd() * 14;
    g.quadraticCurveTo(cx + step * 0.5, y - 7 - rnd() * 9, cx + step, y + (rnd() - 0.5) * 3);
    cx += step;
    if (rnd() < 0.18) { g.moveTo(cx + 8, y); cx += 8; }
  }
  g.stroke();
}

function paperBase(g, edge = '#cfcdc6') {
  g.fillStyle = '#fffefa';
  g.fillRect(0, 0, W, H);
  g.strokeStyle = edge;
  g.lineWidth = 6;
  g.strokeRect(3, 3, W - 6, H - 6);
}

// 빨간 펜 자국 한 줄: 두껍게 출렁이는 가로 선.
function redLine(g, x, y, width, seed) {
  let s = seed * 7919 + 13;
  const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  g.strokeStyle = '#d3221c';
  g.lineWidth = 7;
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(x, y + (rnd() - 0.5) * 6);
  g.bezierCurveTo(x + width * 0.3, y - 8 - rnd() * 8, x + width * 0.65, y + 8 + rnd() * 8, x + width, y + (rnd() - 0.5) * 8);
  g.stroke();
}

// 자소서·이력서 뭉치 맨 위 장: 파란 잉크 글줄 위에 빨간 펜 첨삭(줄 긋기·동그라미·"수정"·화살표)이 어지럽고 노란 포스트잇이 붙어 있다.
function stackCanvas(prop) {
  const [canvas, g] = makeCanvas(W, H);
  paperBase(g);
  g.fillStyle = prop.accent;
  g.fillRect(0, 0, W, 70);
  g.fillStyle = '#fff';
  g.textAlign = 'left';
  g.textBaseline = 'middle';
  fit(g, prop.title, 270, 44, '900');
  g.fillText(prop.title, 24, 37);
  g.textAlign = 'right';
  g.font = `bold 24px ${FONT}`;
  g.fillText('최종_진짜최종_v9', W - 20, 37);
  for (let i = 0; i < 9; i++) scribble(g, 34, 120 + i * 44, 400 - ((i * 37) % 90), i + 4, '#34498c');
  [[1, 340], [4, 380], [6, 300]].forEach(([row, w], i) => redLine(g, 28, 112 + row * 44, w, i + 1)); // 빨간 펜 취소선
  g.strokeStyle = '#d3221c'; // 동그라미 + 화살표
  g.lineWidth = 7;
  g.beginPath();
  g.ellipse(190, 310, 150, 40, -0.05, 0, Math.PI * 2);
  g.stroke();
  g.beginPath();
  g.moveTo(330, 350);
  g.quadraticCurveTo(400, 430, 330, 470);
  g.moveTo(330, 470);
  g.lineTo(352, 448);
  g.moveTo(330, 470);
  g.lineTo(360, 474);
  g.stroke();
  g.fillStyle = '#d3221c';
  g.textAlign = 'center';
  g.save();
  g.translate(360, 168);
  g.rotate(-0.2);
  fit(g, '수정!', 170, 84, '900');
  g.fillText('수정!', 0, 0);
  g.restore();
  g.save();
  g.translate(130, 520);
  g.rotate(0.08);
  fit(g, '다시 쓰기', 220, 56, '900');
  g.fillText('다시 쓰기', 0, 0);
  g.restore();
  g.font = `bold 40px ${FONT}`;
  g.fillText('???', 420, 380);
  g.save(); // 노란 포스트잇
  g.translate(330, 500);
  g.rotate(0.09);
  g.fillStyle = '#f6dc4e';
  g.fillRect(0, 0, 130, 100);
  g.fillStyle = '#c0392b';
  g.textAlign = 'center';
  fit(g, '또 수정?', 110, 34, '900');
  g.fillText('또 수정?', 65, 36);
  fit(g, '분량 ↑', 110, 28, '900');
  g.fillText('분량 ↑', 65, 72);
  g.restore();
  return canvas;
}

// 인적성 검사 교재 표지: 청록 바탕 + 큰 제목 + 노란 띠 + 연필.
function workbookCanvas(prop) {
  const [canvas, g] = makeCanvas(W, H);
  g.fillStyle = prop.accent;
  g.fillRect(0, 0, W, H);
  g.fillStyle = '#16536a';
  g.fillRect(0, 0, 36, H); // 책등 쪽 띠
  g.fillStyle = '#f2c94c';
  g.fillRect(36, 70, W - 36, 18);
  g.fillRect(36, H - 150, W - 36, 18);
  g.fillStyle = '#fff';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  fit(g, '인적성 검사', W - 110, 78, '900');
  g.fillText('인적성 검사', W / 2 + 18, 190);
  g.fillStyle = '#ffe27a';
  fit(g, '완벽 대비', W - 110, 100, '900');
  g.fillText('완벽 대비', W / 2 + 18, 300);
  g.fillStyle = '#d6eef5';
  fit(g, '언어 · 수리 · 추리 · 도형', W - 110, 30, 'bold');
  g.fillText('언어 · 수리 · 추리 · 도형', W / 2 + 18, 380);
  g.fillStyle = '#fff';
  g.beginPath();
  g.arc(W - 100, H - 70, 52, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#d3221c';
  fit(g, '최신판', 90, 34, '900');
  g.fillText('최신판', W - 100, H - 70);
  g.fillStyle = '#f2c94c'; // 연필
  g.save();
  g.translate(110, H - 70);
  g.rotate(-0.2);
  g.fillRect(-60, -9, 100, 18);
  g.fillStyle = '#f4d7b0';
  g.beginPath();
  g.moveTo(40, -9);
  g.lineTo(66, 0);
  g.lineTo(40, 9);
  g.fill();
  g.restore();
  return canvas;
}

// 토익 단어장 표지: 주황 바탕 + 큰 TOEIC + 한 줄.
function bookletCanvas(prop) {
  const [canvas, g] = makeCanvas(W, H);
  g.fillStyle = prop.accent;
  g.fillRect(0, 0, W, H);
  g.fillStyle = '#9a3a16';
  g.fillRect(0, 0, 30, H);
  g.fillStyle = '#fff';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  fit(g, 'TOEIC', W - 90, 120, '900');
  g.fillText('TOEIC', W / 2 + 14, 200);
  g.fillStyle = '#ffe9c2';
  fit(g, '단어장', W - 90, 96, '900');
  g.fillText('단어장', W / 2 + 14, 330);
  g.fillStyle = '#fff';
  g.fillRect(70, 410, W - 110, 8);
  fit(g, 'abandon  포기하다', W - 110, 36, 'bold');
  g.fillText('abandon  포기하다', W / 2 + 14, 470);
  g.fillStyle = '#ffe9c2';
  fit(g, '990', 120, 70, '900');
  g.fillText('990', W - 100, H - 60);
  return canvas;
}

// 취업 잔소리 쪽지: 노란 포스트잇 + 테이프 + 손글씨체 잔소리 두세 줄.
function nagCanvas() {
  const w = 480;
  const h = 520;
  const [canvas, g] = makeCanvas(w, h);
  g.fillStyle = '#f7de58';
  g.fillRect(0, 0, w, h);
  g.fillStyle = 'rgba(0,0,0,0.06)'; // 아래쪽 그늘
  g.fillRect(0, h - 40, w, 40);
  g.fillStyle = 'rgba(255,255,255,0.55)'; // 위의 테이프
  g.fillRect(150, 0, 180, 46);
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = '#2b2f55';
  const lines = [['옆집 아들은', 120, -0.03, 60], ['벌써 취직했다더라', 200, 0.02, 56], ['언제 취업하니?', 300, -0.025, 64], ['다 널 위해서야~', 400, 0.03, 48]];
  for (const [t, y, rot, px] of lines) {
    g.save();
    g.translate(w / 2, y);
    g.rotate(rot);
    fit(g, t, w - 60, px, '900');
    g.fillText(t, 0, 0);
    g.restore();
  }
  g.strokeStyle = '#d3221c';
  g.lineWidth = 7;
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(60, 340);
  g.quadraticCurveTo(240, 352, 420, 332); // 밑줄
  g.stroke();
  g.fillStyle = '#d3221c';
  g.font = `900 70px ${FONT}`;
  g.fillText('!!', 420, 470);
  return canvas;
}

// 물건의 앞면 캔버스(kind 별). 주머니는 그림이 따로 있다.
function faceCanvas(item) {
  const { kind } = item.prop;
  if (kind === 'stack') return stackCanvas(item.prop);
  if (kind === 'workbook') return workbookCanvas(item.prop);
  if (kind === 'booklet') return bookletCanvas(item.prop);
  if (kind === 'nag') return nagCanvas();
  if (kind === 'notice') return noticeFace(0);
  return null;
}

// 구겨진 공 무늬: 종이 바탕 + 회색 줄 조각 + 빨간 표식.
function ballCanvas(paper) {
  const [canvas, g] = makeCanvas(128, 128);
  g.fillStyle = paper;
  g.fillRect(0, 0, 128, 128);
  g.fillStyle = '#b9b9b4';
  for (let i = 0; i < 6; i++) g.fillRect(6, 10 + i * 20, 90 + (i % 3) * 10, 6);
  g.fillStyle = '#d3221c';
  g.fillRect(36, 34, 78, 46);
  g.fillStyle = paper;
  g.fillRect(44, 42, 62, 30);
  g.fillStyle = '#d3221c';
  g.fillRect(52, 50, 46, 10);
  return canvas;
}

const tex = (canvas) => {
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
};

// 종이 단면 줄무늬(겹친 장).
function pagesTexture() {
  const [canvas, g] = makeCanvas(64, 64);
  g.fillStyle = '#f1efe6';
  g.fillRect(0, 0, 64, 64);
  g.strokeStyle = '#c9c5b6';
  g.lineWidth = 1.5;
  for (let i = 3; i < 64; i += 5) { g.beginPath(); g.moveTo(0, i); g.lineTo(64, i); g.stroke(); }
  return tex(canvas);
}

// 두툼한 소품(뭉치·교재·단어장): 표지 캔버스를 위(+y)에 얹은 두꺼운 상자. 뒷면은 coverColor, 옆면은 종이 단면 줄무늬.
// stacked 가 true 면 뭉치처럼 아래 장 두 개를 조금 어긋나게 깔아 삐져나온 모양을 만든다.
function buildSolid(canvas, width, depth, thickness, coverColor, stacked = false) {
  const map = tex(canvas);
  const face = new THREE.MeshStandardMaterial({ map, emissive: 0xffffff, emissiveMap: map, emissiveIntensity: 0.4, roughness: 0.85 });
  const back = new THREE.MeshStandardMaterial({ color: coverColor, emissive: 0x222222, roughness: 0.85 });
  const side = new THREE.MeshStandardMaterial({ map: pagesTexture(), emissive: 0x555550, roughness: 0.9 });
  const top = new THREE.Mesh(new THREE.BoxGeometry(width, thickness, depth), [side, side, face, back, side, side]);
  top.castShadow = true;
  const group = new THREE.Group();
  group.add(top);
  if (stacked) {
    [[0.05, -0.06, 0.04, 0.99], [-0.04, 0.05, -0.05, 0.97]].forEach(([dx, dz, rot, k], i) => {
      const sheet = new THREE.Mesh(new THREE.BoxGeometry(width * k, thickness * 0.9, depth * k), side);
      sheet.position.set(dx, -thickness * (0.55 + i * 0.4), dz);
      sheet.rotation.y = rot;
      group.add(sheet);
    });
  }
  group.userData.rot = [Math.PI / 2, 0, 0];
  group.userData.sheet = true;
  group.userData.setCrumple = () => {};
  group.userData.setVariant = () => {};
  group.userData.variantCount = 1;
  return group;
}

// 반짝이 점 무늬(십자 광채).
function sparkMap() {
  const [canvas, g] = makeCanvas(32, 32);
  const grad = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.3, 'rgba(255,255,255,0.7)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 32, 32);
  g.fillStyle = 'rgba(255,255,255,0.9)';
  g.fillRect(15, 2, 2, 28);
  g.fillRect(2, 15, 28, 2);
  return new THREE.CanvasTexture(canvas);
}

// 글씨 없는 천 주머니(오로라 가루): 보랏빛 천 자루(불룩한 몸통 + 졸라맨 목, 솔기 박음질) + 금색 끈과 늘어진 끈 두 가닥 + 목에 수북한 반짝이 가루 + 반짝이 점. 선 모양 그대로 든다(rot 0).
function buildPouch(prop) {
  const [canvas, g] = makeCanvas(256, 256);
  const grad = g.createLinearGradient(0, 0, 256, 256);
  grad.addColorStop(0, '#b79cff');
  grad.addColorStop(0.55, '#8466e8');
  grad.addColorStop(1, '#4fc3d6');
  g.fillStyle = grad;
  g.fillRect(0, 0, 256, 256);
  g.strokeStyle = 'rgba(255,255,255,0.10)'; // 천 결
  g.lineWidth = 2;
  for (let i = 0; i < 256; i += 8) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 256); g.stroke(); g.beginPath(); g.moveTo(0, i); g.lineTo(256, i); g.stroke(); }
  g.strokeStyle = 'rgba(255, 235, 170, 0.65)'; // 박음질 솔기(세로)
  g.lineWidth = 3;
  g.setLineDash([10, 8]);
  for (const x of [0, 128, 255]) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 256); g.stroke(); }
  g.setLineDash([]);
  let s = 11;
  const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  for (let i = 0; i < 70; i++) { // 천에 묻은 가루
    g.fillStyle = ['#ffffff', '#bff7e6', '#f4d9ff', '#9fe8ff'][i % 4];
    const r = 1.5 + rnd() * 3;
    g.fillRect(rnd() * 256, rnd() * 256, r, r);
  }
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  const cloth = new THREE.MeshStandardMaterial({ map, emissive: 0x9a7cff, emissiveMap: map, emissiveIntensity: 0.55, roughness: 0.8, metalness: 0.05, side: THREE.DoubleSide });
  const profile = [[0.001, 0], [0.13, 0.012], [0.24, 0.07], [0.31, 0.16], [0.31, 0.25], [0.24, 0.34], [0.13, 0.42], [0.075, 0.47], [0.07, 0.52], [0.12, 0.58], [0.19, 0.66], [0.2, 0.7]].map(([r, y]) => new THREE.Vector2(r, y));
  const sack = new THREE.Mesh(new THREE.LatheGeometry(profile, 20), cloth);
  sack.scale.set(1, 1, 0.82);
  sack.castShadow = true;
  const gold = new THREE.MeshStandardMaterial({ color: 0xf2c14e, emissive: 0x8a6a1a, roughness: 0.4 });
  const tie = new THREE.Mesh(new THREE.TorusGeometry(0.085, 0.026, 8, 18), gold);
  tie.rotation.x = Math.PI / 2;
  tie.position.y = 0.5;
  tie.scale.set(1, 0.82, 1);
  const tails = [-0.4, 0.5].map((rz, i) => { // 늘어진 끈
    const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.17, 6), gold);
    tail.position.set(0.09 * (i ? 1 : -1), 0.42, 0.07);
    tail.rotation.z = rz;
    return tail;
  });
  const powder = new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 8), new THREE.MeshBasicMaterial({ color: 0xdff9ff }));
  powder.scale.set(1.15, 0.7, 1);
  powder.position.y = 0.66; // 주둥이에 수북한 가루
  const n = 26; // 반짝이 점: 목 둘레 + 몸통 솔기 위
  const pos = new Float32Array(n * 3);
  const col = new Float32Array(n * 3);
  const pal = [[0.7, 1, 0.9], [1, 0.8, 1], [1, 1, 1], [0.6, 0.95, 1]];
  for (let i = 0; i < n; i++) {
    const a = rnd() * Math.PI * 2;
    if (i < 15) {
      const r = 0.05 + rnd() * 0.13;
      pos.set([Math.cos(a) * r, 0.58 + rnd() * 0.2, Math.sin(a) * r * 0.8], i * 3);
    } else {
      const y = 0.1 + rnd() * 0.35;
      pos.set([(rnd() - 0.5) * 0.12, y, 0.3 * Math.sqrt(Math.max(0.1, 1 - ((y - 0.27) / 0.3) ** 2)) * 0.82 + 0.02], i * 3);
    }
    col.set(pal[i % pal.length], i * 3);
  }
  const dotGeo = new THREE.BufferGeometry();
  dotGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  dotGeo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const sparkles = new THREE.Points(dotGeo, new THREE.PointsMaterial({ size: 0.1, map: sparkMap(), vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, fog: false }));
  sparkles.frustumCulled = false;
  const group = new THREE.Group();
  group.add(sack, tie, ...tails, powder, sparkles);
  group.scale.setScalar(1.15);
  group.userData.rot = [0, 0, 0];
  group.userData.setCrumple = () => {};
  group.userData.setVariant = () => {};
  group.userData.variantCount = 1;
  group.userData.accent = prop.accent;
  return group;
}

// 두툼한 소품의 크기 [폭, 길이, 두께](월드 단위).
const SOLID = { stack: [0.68, 0.9, 0.1], workbook: [0.66, 0.88, 0.17], booklet: [0.5, 0.7, 0.08] };

// 손에 드는 소품(물건 하나). clip: 주면 모든 재질에 이 클리핑 평면을 단다(파쇄: 투입구 아래로 들어간 부분을 안 보이게).
export function buildItemProp(item, width = 0.7, depth = 0.93, clip = null) {
  const { kind } = item.prop;
  let group;
  if (kind === 'pouch') group = buildPouch(item.prop);
  else if (SOLID[kind]) {
    const [w, d, t] = SOLID[kind];
    group = buildSolid(faceCanvas(item), w, d, t, kind === 'stack' ? '#f4f1e6' : item.prop.accent, kind === 'stack');
  } else if (kind === 'nag') {
    group = buildSheetProp([faceCanvas(item)], ballCanvas('#f3dc5e'), 0.66, 0.72);
    group.userData.rot = [Math.PI / 2, 0, 0];
    group.userData.sheet = true;
  } else {
    group = buildPaper(width, depth); // 불합격 통지서: 머리글 4종(setVariant)
    group.userData.rot = [Math.PI / 2, 0, 0];
    group.userData.sheet = true; // 들여다볼 때 카메라 쪽으로 돌려 읽기 쉽게 한다
  }
  group.userData.height = SOLID[kind] ? SOLID[kind][1] : kind === 'nag' ? 0.72 : depth; // 세웠을 때 세로 길이(월드 단위): 파쇄에서 내려가는 거리
  if (clip) {
    group.traverse((o) => {
      if (!o.isMesh) return;
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) m.clippingPlanes = [clip];
    });
  }
  return group;
}

// 선택 창 그림(작은 캔버스). 종이·책은 앞면을 줄여 그리고, 주머니는 글씨 없는 간단한 그림.
export function buildItemIcon(item, w = 54, h = 72) {
  const [canvas, g] = makeCanvas(w, h);
  if (item.prop.kind === 'pouch') { // 천 주머니: 불룩한 몸통 + 졸라맨 목의 주름 + 금색 끈 + 목에 수북한 가루와 반짝이(글씨 없음)
    const grad = g.createLinearGradient(0, h * 0.3, w, h);
    grad.addColorStop(0, '#b79cff');
    grad.addColorStop(0.6, '#8466e8');
    grad.addColorStop(1, '#4fc3d6');
    g.fillStyle = grad;
    g.beginPath();
    g.ellipse(w * 0.5, h * 0.66, w * 0.46, h * 0.27, 0, 0, Math.PI * 2);
    g.fill();
    g.beginPath(); // 짧게 졸라맨 목
    g.moveTo(w * 0.36, h * 0.5);
    g.quadraticCurveTo(w * 0.46, h * 0.44, w * 0.42, h * 0.34);
    g.lineTo(w * 0.58, h * 0.34);
    g.quadraticCurveTo(w * 0.54, h * 0.44, w * 0.64, h * 0.5);
    g.closePath();
    g.fill();
    g.fillStyle = '#9e83f0'; // 주름 잡힌 주둥이
    g.beginPath();
    g.moveTo(w * 0.3, h * 0.2);
    g.quadraticCurveTo(w * 0.4, h * 0.3, w * 0.42, h * 0.36);
    g.lineTo(w * 0.58, h * 0.36);
    g.quadraticCurveTo(w * 0.6, h * 0.3, w * 0.7, h * 0.2);
    g.quadraticCurveTo(w * 0.5, h * 0.27, w * 0.3, h * 0.2);
    g.fill();
    g.fillStyle = '#f2c14e'; // 끈과 매듭
    g.fillRect(w * 0.38, h * 0.37, w * 0.24, h * 0.045);
    g.fillRect(w * 0.6, h * 0.4, w * 0.04, h * 0.14);
    g.fillStyle = '#dff9ff'; // 목에 수북한 가루
    g.beginPath();
    g.ellipse(w / 2, h * 0.2, w * 0.2, h * 0.06, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#fff';
    for (const [x, y] of [[0.25, 0.62], [0.68, 0.72], [0.48, 0.58], [0.76, 0.6], [0.36, 0.8], [0.58, 0.07], [0.38, 0.06], [0.7, 0.12]]) g.fillRect(w * x, h * y, 3, 3);
    return canvas;
  }
  const face = faceCanvas(item);
  g.drawImage(face, 0, 0, w, h);
  g.strokeStyle = 'rgba(0,0,0,0.25)';
  g.lineWidth = 1;
  g.strokeRect(0.5, 0.5, w - 1, h - 1);
  return canvas;
}

// 오로라 가루 반짝이: Points 하나(그리기 호출 1, 쓰지 않을 때는 숨김). cloud(center, seconds): 주머니가 터지며 반짝이 가루 구름이 사방으로 퍼졌다 가라앉는다.
export function createGlitter(scene, count = 90) {
  const canvas = document.createElement('canvas');
  canvas.width = 32;
  canvas.height = 32;
  const g = canvas.getContext('2d');
  const grad = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.35, 'rgba(255,255,255,0.7)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 32, 32);
  const map = new THREE.CanvasTexture(canvas);
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const points = new THREE.Points(geo, new THREE.PointsMaterial({ size: 0.18, map, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, fog: false }));
  points.frustumCulled = false;
  points.visible = false;
  points.renderOrder = 6;
  scene.add(points);
  const parts = Array.from({ length: count }, () => ({ live: false, t: 0, dur: 1, from: new THREE.Vector3(), vel: new THREE.Vector3(), hue: 0 }));
  const palette = [[0.2, 1, 0.8], [0.45, 1, 0.5], [0.7, 0.45, 1], [1, 0.55, 0.95], [1, 1, 1]];
  let live = 0;
  return {
    points,
    cloud(center, seconds) {
      for (const p of parts) {
        p.live = true;
        p.t = 0;
        p.dur = seconds * (0.6 + Math.random() * 0.4);
        p.from.set(center.x + (Math.random() - 0.5) * 0.2, center.y + (Math.random() - 0.5) * 0.2, center.z + (Math.random() - 0.5) * 0.2);
        const a = Math.random() * Math.PI * 2;
        const speed = 0.8 + Math.random() * 1.9;
        p.vel.set(Math.cos(a) * speed, 0.6 + Math.random() * 1.8, Math.sin(a) * speed);
        p.hue = Math.floor(Math.random() * palette.length);
      }
      live = parts.length;
      points.visible = true;
    },
    clear() { for (const p of parts) p.live = false; live = 0; points.visible = false; },
    update(dt) {
      if (!live) return;
      let alive = 0;
      parts.forEach((p, i) => {
        if (!p.live) { colors.fill(0, i * 3, i * 3 + 3); return; }
        p.t += dt;
        if (p.t >= p.dur) { p.live = false; colors.fill(0, i * 3, i * 3 + 3); return; }
        alive++;
        const k = p.t / p.dur;
        const drag = 1 - Math.exp(-3 * p.t); // 퍼지며 느려진다
        positions[i * 3] = p.from.x + (p.vel.x / 3) * drag;
        positions[i * 3 + 1] = p.from.y + (p.vel.y / 3) * drag - 0.45 * p.t * p.t; // 가라앉는다
        positions[i * 3 + 2] = p.from.z + (p.vel.z / 3) * drag;
        const tw = (0.6 + 0.4 * Math.sin((p.t + i) * 30)) * (1 - k * k);
        const c = palette[p.hue];
        colors[i * 3] = c[0] * tw;
        colors[i * 3 + 1] = c[1] * tw;
        colors[i * 3 + 2] = c[2] * tw;
      });
      geo.attributes.position.needsUpdate = true;
      geo.attributes.color.needsUpdate = true;
      live = alive;
      if (!alive) points.visible = false;
    },
  };
}
