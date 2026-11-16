// 브라우저 전용: 소각장 물건 5종의 손에 드는 소품과 선택 창 그림. 물건 표는 config.js 의 INCINERATOR.items 이고 prop.kind 로 그림이 정해진다.
// 종이 물건(자소서·이력서·불합격 통지서·면접 탈락 메일)은 src/notice.js 의 종이 소품(buildSheetProp: 앞뒤 모두 읽히는 납작한 종이 + 구겨진 공)을 쓰고,
// 오로라 가루는 반짝이는 가루 주머니(buildPouch)다. 모든 소품은 userData.setCrumple(k) 와 userData.rot(손에 쥘 때의 방향)을 갖는다.
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

// 자소서: 큰 제목 + 소제목 + 손글씨 줄.
function letterCanvas(prop) {
  const [canvas, g] = makeCanvas(W, H);
  paperBase(g);
  g.fillStyle = '#26324a';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  fit(g, prop.title, W - 90, 78, '900');
  g.fillText(prop.title, W / 2, 72);
  g.fillStyle = prop.accent;
  g.fillRect(70, 118, W - 140, 7);
  g.textAlign = 'left';
  let y = 170;
  ['1. 성장과정', '2. 지원동기', '3. 입사 후 포부'].forEach((head, k) => {
    g.fillStyle = prop.accent;
    fit(g, head, 300, 34);
    g.fillText(head, 40, y);
    for (let i = 0; i < 3; i++) scribble(g, 44, y + 38 + i * 30, 360 - ((i + k) % 3) * 45, k * 7 + i + 1);
    y += 150;
  });
  g.fillStyle = '#8a8f9c';
  g.textAlign = 'right';
  fit(g, '(1,000자 이내)', 200, 22, 'normal');
  g.fillText('(1,000자 이내)', W - 36, H - 24);
  return canvas;
}

// 이력서: 파란 머리글 + 사진 칸 + 표.
function resumeCanvas(prop) {
  const [canvas, g] = makeCanvas(W, H);
  paperBase(g);
  g.fillStyle = prop.accent;
  g.fillRect(0, 0, W, 112);
  g.fillStyle = '#fff';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  fit(g, prop.title, W - 100, 70, '900');
  g.fillText(prop.title, W / 2, 58);
  // 사진 칸(3x4)
  g.fillStyle = '#e6edf6';
  g.fillRect(36, 138, 132, 176);
  g.strokeStyle = '#8c98ab';
  g.lineWidth = 4;
  g.strokeRect(36, 138, 132, 176);
  g.fillStyle = '#9fb0c8'; // 증명사진 속 사람 모양
  g.beginPath();
  g.arc(102, 206, 28, 0, Math.PI * 2);
  g.fill();
  g.beginPath();
  g.ellipse(102, 300, 52, 48, 0, Math.PI, 0);
  g.fill();
  // 이름·생년월일 표
  const rows = ['성 명', '생년월일', '연락처'];
  rows.forEach((label, i) => {
    const y = 138 + i * 59;
    g.fillStyle = '#dbe5f3';
    g.fillRect(186, y, 100, 53);
    g.strokeStyle = '#8c98ab';
    g.lineWidth = 3;
    g.strokeRect(186, y, 100, 53);
    g.strokeRect(286, y, 160, 53);
    g.fillStyle = '#26324a';
    fit(g, label, 90, 26);
    g.fillText(label, 236, y + 28);
    scribble(g, 298, y + 33, 120 - i * 22, i + 3);
  });
  // 학력·경력 표
  const top = 340;
  ['학력', '경력', '자격'].forEach((label, i) => {
    const y = top + i * 78;
    g.fillStyle = '#dbe5f3';
    g.fillRect(36, y, 90, 72);
    g.strokeStyle = '#8c98ab';
    g.strokeRect(36, y, 90, 72);
    g.strokeRect(126, y, 318, 72);
    g.fillStyle = '#26324a';
    g.font = `bold 28px ${FONT}`;
    g.fillText(label, 81, y + 38);
    scribble(g, 140, y + 28, 270 - i * 40, i * 5 + 1);
    scribble(g, 140, y + 56, 190 - i * 25, i * 5 + 2);
  });
  return canvas;
}

// 면접 탈락 메일: 인쇄한 이메일. 위 머리글 띠 + 보낸이·제목 + 본문 + 빨간 ✕ 와 불합격 표시.
function mailCanvas(prop) {
  const [canvas, g] = makeCanvas(W, H);
  paperBase(g);
  g.fillStyle = prop.accent;
  g.fillRect(0, 0, W, 78);
  // 봉투 그림
  g.strokeStyle = '#fff';
  g.lineWidth = 5;
  g.strokeRect(26, 22, 64, 40);
  g.beginPath();
  g.moveTo(26, 22);
  g.lineTo(58, 46);
  g.lineTo(90, 22);
  g.stroke();
  g.fillStyle = '#fff';
  g.textAlign = 'left';
  g.textBaseline = 'middle';
  g.font = `bold 34px ${FONT}`;
  g.fillText('받은편지함', 110, 42);
  g.textAlign = 'left';
  g.fillStyle = '#7a808c';
  g.font = `24px ${FONT}`;
  g.fillText('보낸 사람  인사팀 <hr@company.com>', 28, 112);
  g.fillText('받는 사람  지원자 님', 28, 144);
  g.fillStyle = '#e6e8ee';
  g.fillRect(24, 164, W - 48, 3);
  g.fillStyle = '#1f2433';
  fit(g, prop.title, W - 56, 40, '900');
  g.fillText(prop.title, 28, 206);
  g.fillStyle = '#3a3f4e';
  ['안녕하세요, 지원자님.', '귀하의 면접에 감사드립니다.', '아쉽게도 이번에는 함께하지', '못하게 되었습니다.'].forEach((t, i) => {
    fit(g, t, W - 56, 28, 'normal');
    g.fillText(t, 28, 262 + i * 40);
  });
  // 빨간 ✕ 동그라미 + 불합격
  g.strokeStyle = '#d3221c';
  g.fillStyle = '#d3221c';
  g.lineWidth = 14;
  g.lineCap = 'round';
  g.beginPath();
  g.arc(120, 500, 66, 0, Math.PI * 2);
  g.stroke();
  g.lineWidth = 18;
  g.beginPath();
  g.moveTo(88, 468);
  g.lineTo(152, 532);
  g.moveTo(152, 468);
  g.lineTo(88, 532);
  g.stroke();
  g.textAlign = 'left';
  fit(g, '불합격', 250, 96, '900');
  g.fillText('불합격', 206, 502);
  return canvas;
}

// 구겨진 공 무늬: 종이 바탕 + 회색 줄 조각 + 물건 색 표식.
function ballCanvas(color) {
  const [canvas, g] = makeCanvas(128, 128);
  g.fillStyle = '#f4f3ee';
  g.fillRect(0, 0, 128, 128);
  g.fillStyle = '#b9b9b4';
  for (let i = 0; i < 6; i++) g.fillRect(6, 10 + i * 20, 90 + (i % 3) * 10, 6);
  g.fillStyle = color;
  g.fillRect(36, 34, 78, 46);
  g.fillStyle = '#f4f3ee';
  g.fillRect(44, 42, 62, 30);
  g.fillStyle = color;
  g.fillRect(52, 50, 46, 10);
  return canvas;
}

// 종이 물건의 앞면 캔버스(kind 별).
function faceCanvas(item) {
  const { kind } = item.prop;
  if (kind === 'letter') return letterCanvas(item.prop);
  if (kind === 'resume') return resumeCanvas(item.prop);
  if (kind === 'mail') return mailCanvas(item.prop);
  if (kind === 'notice') return noticeFace(0);
  return null;
}

// 반짝이는 가루 주머니(오로라 가루): 보랏빛 자루 + 오므린 주둥이 + 금색 끈 + 반짝이 점. setOpen(k): 0 닫힘 ... 1 활짝(주둥이가 벌어진다).
function buildPouch(prop) {
  const [canvas, g] = makeCanvas(256, 256);
  const grad = g.createLinearGradient(0, 0, 256, 256);
  grad.addColorStop(0, '#5b3fb0');
  grad.addColorStop(0.5, '#2f9a9a');
  grad.addColorStop(1, '#6a3fb8');
  g.fillStyle = grad;
  g.fillRect(0, 0, 256, 256);
  let s = 11;
  const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  for (let i = 0; i < 90; i++) {
    g.fillStyle = ['#ffffff', '#bff7e6', '#f4d9ff', '#9fe8ff'][i % 4];
    const r = 1 + rnd() * 3;
    g.fillRect(rnd() * 256, rnd() * 256, r, r);
  }
  g.fillStyle = 'rgba(255,255,255,0.92)';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  fit(g, '오로라', 200, 56, '900');
  g.fillText('오로라', 128, 108);
  fit(g, '가루', 200, 44, '900');
  g.fillText('가루', 128, 160);
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  const sack = new THREE.MeshStandardMaterial({ map, emissive: 0xffffff, emissiveMap: map, emissiveIntensity: 0.5, roughness: 0.55, metalness: 0.15 });
  const group = new THREE.Group();
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.26, 18, 14), sack);
  body.scale.set(1, 1.05, 0.85);
  body.position.y = 0.2;
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.15, 0.16, 14, 1, true), new THREE.MeshStandardMaterial({ color: 0x4d36a0, emissive: 0x241a58, roughness: 0.7, side: THREE.DoubleSide }));
  neck.position.y = 0.43;
  const string = new THREE.Mesh(new THREE.TorusGeometry(0.115, 0.02, 8, 18), new THREE.MeshStandardMaterial({ color: 0xf2c14e, emissive: 0x8a6a1a, roughness: 0.4 }));
  string.rotation.x = Math.PI / 2;
  string.position.y = 0.4;
  const top = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.09, 0.12, 14, 1, true), neck.material);
  top.position.y = 0.52;
  group.add(body, neck, string, top);
  group.scale.setScalar(1.1);
  group.userData.rot = [0, 0, 0];
  group.userData.setCrumple = () => {};
  group.userData.setVariant = () => {};
  group.userData.variantCount = 1;
  group.userData.setOpen = (k) => {
    top.scale.set(1 + 0.55 * k, 1, 1 + 0.55 * k);
    string.scale.setScalar(1 + 0.6 * k);
    string.position.y = 0.4 + 0.04 * k;
  };
  group.userData.pour = new THREE.Vector3(0, 0.62, 0); // 가루가 쏟아지는 곳(소품 기준)
  group.userData.accent = prop.accent;
  return group;
}

// 손에 드는 소품(물건 하나). 종이 물건은 앞뒤가 모두 읽히는 납작한 종이 + 구겨진 공, 오로라 가루는 주머니.
export function buildItemProp(item, width = 0.7, depth = 0.93) {
  if (item.prop.kind === 'pouch') return buildPouch(item.prop);
  let group;
  if (item.prop.kind === 'notice') group = buildPaper(width, depth); // 불합격 통지서: 머리글 4종(setVariant)
  else group = buildSheetProp([faceCanvas(item)], ballCanvas(item.prop.ball), width, depth);
  group.userData.rot = [Math.PI / 2, 0, 0];
  group.userData.sheet = true; // 들여다볼 때 카메라 쪽으로 돌려 읽기 쉽게 한다
  return group;
}

// 선택 창 그림(작은 캔버스). 종이는 앞면을 줄여 그리고, 주머니는 간단한 그림.
export function buildItemIcon(item, w = 54, h = 72) {
  const [canvas, g] = makeCanvas(w, h);
  if (item.prop.kind === 'pouch') {
    const grad = g.createLinearGradient(0, 0, w, h);
    grad.addColorStop(0, '#5b3fb0');
    grad.addColorStop(0.5, '#2f9a9a');
    grad.addColorStop(1, '#6a3fb8');
    g.fillStyle = grad;
    g.beginPath();
    g.ellipse(w / 2, h * 0.62, w * 0.38, h * 0.3, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#4d36a0';
    g.fillRect(w * 0.36, h * 0.18, w * 0.28, h * 0.2);
    g.fillStyle = '#f2c14e';
    g.fillRect(w * 0.32, h * 0.34, w * 0.36, h * 0.05);
    g.fillStyle = '#fff';
    for (const [x, y] of [[0.3, 0.55], [0.62, 0.7], [0.5, 0.5], [0.72, 0.58], [0.4, 0.78]]) g.fillRect(w * x, h * y, 3, 3);
    return canvas;
  }
  const face = faceCanvas(item);
  g.drawImage(face, 0, 0, w, h);
  g.strokeStyle = 'rgba(0,0,0,0.25)';
  g.lineWidth = 1;
  g.strokeRect(0.5, 0.5, w - 1, h - 1);
  return canvas;
}


// 오로라 가루 반짝이: Points 하나(그리기 호출 1, 쓰지 않을 때는 숨김). burst(from, to, seconds): 손에서 불 위로 반짝이 가루가 포물선으로 날아간다.
export function createGlitter(scene, count = 56) {
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
  const points = new THREE.Points(geo, new THREE.PointsMaterial({ size: 0.16, map, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, fog: false }));
  points.frustumCulled = false;
  points.visible = false;
  points.renderOrder = 6;
  scene.add(points);
  const parts = Array.from({ length: count }, () => ({ live: false, t: 0, dur: 1, from: new THREE.Vector3(), to: new THREE.Vector3(), arc: 0, hue: 0 }));
  const palette = [[0.2, 1, 0.8], [0.45, 1, 0.5], [0.7, 0.45, 1], [1, 0.55, 0.95], [1, 1, 1]];
  let live = 0;
  return {
    points,
    burst(from, to, seconds) {
      for (const p of parts) {
        p.live = true;
        p.t = -Math.random() * seconds * 0.35;
        p.dur = seconds * (0.65 + Math.random() * 0.35);
        p.from.set(from.x + (Math.random() - 0.5) * 0.12, from.y + (Math.random() - 0.5) * 0.08, from.z + (Math.random() - 0.5) * 0.12);
        p.to.set(to.x + (Math.random() - 0.5) * 0.7, to.y + (Math.random() - 0.5) * 0.3, to.z + (Math.random() - 0.5) * 0.7);
        p.arc = 0.25 + Math.random() * 0.5;
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
        const k = Math.max(0, p.t / p.dur);
        positions[i * 3] = p.from.x + (p.to.x - p.from.x) * k;
        positions[i * 3 + 1] = p.from.y + (p.to.y - p.from.y) * k + p.arc * Math.sin(Math.PI * k);
        positions[i * 3 + 2] = p.from.z + (p.to.z - p.from.z) * k;
        const tw = p.t < 0 ? 0 : 0.6 + 0.4 * Math.sin((p.t + i) * 30);
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
