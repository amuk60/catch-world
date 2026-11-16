// 브라우저 전용: 손에 드는 불합격 통지서. 멀리서도 읽히도록 흰 종이 + 색 띠 머리글 + 큰 빨간 "불합격" 도장을 캔버스로 그린다.
// buildPaper() 는 Group 하나를 돌려준다: 납작한 종이(sheet) + 구겨진 공(ball). userData.setVariant(i) 로 문구 4종 중 하나를 고르고,
// userData.setCrumple(k) 로 종이(0) -> 구겨진 공(1)으로 바꾼다(공에도 빨간 도장 조각이 남는다).
import * as THREE from 'three';

const W = 480;
const H = 640;
const FONT = '"Malgun Gothic", "Apple SD Gothic Neo", "Noto Sans KR", sans-serif';

// 변형 4종: 머리글, 띠 색, 본문 줄 수.
export const NOTICE_VARIANTS = [
  { header: '불합격 통지서', band: '#2b3a67', lines: 5, greet: '귀하의 지원에 감사드립니다.' },
  { header: '서류 전형 결과', band: '#3b4a4f', lines: 4, greet: '서류 전형 결과를 알려 드립니다.' },
  { header: '전형 결과 안내', band: '#5a3b3b', lines: 5, greet: '아래와 같이 결과를 안내합니다.' },
  { header: '아쉽게도…', band: '#4a4560', lines: 3, greet: '많은 관심에 감사드립니다.' },
];

function fitText(g, text, maxWidth, px, weight = 'bold') {
  g.font = `${weight} ${px}px ${FONT}`;
  const w = g.measureText(text).width;
  if (w > maxWidth) g.font = `${weight} ${Math.floor(px * maxWidth / w)}px ${FONT}`;
}

// 빨간 도장 "불합격": 이중 테두리 + 굵은 글씨, 살짝 기울인다. (cx, cy) 가운데, 폭 sw.
function drawStamp(g, cx, cy, sw, angle) {
  const sh = sw * 0.46;
  g.save();
  g.translate(cx, cy);
  g.rotate(angle);
  g.globalAlpha = 0.92;
  g.strokeStyle = '#d3221c';
  g.fillStyle = '#d3221c';
  g.lineWidth = sw * 0.045;
  g.strokeRect(-sw / 2, -sh / 2, sw, sh);
  g.lineWidth = sw * 0.015;
  g.strokeRect(-sw / 2 + sw * 0.05, -sh / 2 + sw * 0.05, sw - sw * 0.1, sh - sw * 0.1);
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  fitText(g, '불합격', sw * 0.74, Math.floor(sw * 0.34), '900');
  g.fillText('불합격', 0, sh * 0.03);
  g.restore();
}

// 종이 앞면 무늬.
function noticeCanvas(v, index) {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const g = canvas.getContext('2d');
  g.fillStyle = '#fffefa';
  g.fillRect(0, 0, W, H);
  g.strokeStyle = '#cfcdc6';
  g.lineWidth = 6;
  g.strokeRect(3, 3, W - 6, H - 6);
  // 머리글 띠
  g.fillStyle = v.band;
  g.fillRect(0, 0, W, 130);
  g.fillStyle = '#ffffff';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  fitText(g, v.header, W - 60, 66);
  g.fillText(v.header, W / 2, 68);
  g.fillStyle = '#e9b44c'; // 띠 아래 가는 금색 줄
  g.fillRect(0, 130, W, 8);
  // 인사말 + 회색 줄
  g.fillStyle = '#555';
  g.textAlign = 'left';
  fitText(g, v.greet, W - 70, 30, 'normal');
  g.fillText(v.greet, 36, 175);
  g.fillStyle = '#b9b9b4';
  for (let i = 0; i < v.lines; i++) g.fillRect(36, 215 + i * 34, i % 3 === 2 ? 270 : (i % 2 ? 360 : 408), 12);
  // 큰 도장(본문 아래쪽, 살짝 기울임)
  drawStamp(g, 262 + index * 6, 420, 330, -0.2 + index * 0.04);
  // 하단: 작은 글씨 줄 + 직인
  g.fillStyle = '#b9b9b4';
  g.fillRect(36, 556, 190, 11);
  g.fillRect(36, 580, 150, 11);
  g.strokeStyle = '#c4382f';
  g.fillStyle = 'rgba(196,56,47,0.85)';
  g.lineWidth = 4;
  g.beginPath();
  g.arc(W - 86, 566, 34, 0, Math.PI * 2);
  g.stroke();
  g.font = `bold 34px ${FONT}`;
  g.textAlign = 'center';
  g.fillText('인', W - 86, 568);
  return canvas;
}

// 구겨진 공 무늬: 흰색 바탕에 회색 줄 조각과 빨간 도장 조각.
function ballCanvas() {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const g = canvas.getContext('2d');
  g.fillStyle = '#f4f3ee';
  g.fillRect(0, 0, 128, 128);
  g.fillStyle = '#b9b9b4';
  for (let i = 0; i < 6; i++) g.fillRect(6, 10 + i * 20, 90 + (i % 3) * 10, 6);
  g.fillStyle = '#d3221c';
  g.fillRect(40, 38, 70, 40);
  g.fillStyle = '#f4f3ee';
  g.fillRect(48, 46, 54, 24);
  g.fillStyle = '#d3221c';
  g.fillRect(56, 54, 38, 8);
  return canvas;
}

const tex = (canvas) => {
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
};

// 손에 드는 종이 한 장(불합격 통지서). width x depth 는 월드 단위 크기(3:4 비율을 권장), 두께는 얇게.
export function buildPaper(width = 0.7, depth = 0.93) {
  const textures = NOTICE_VARIANTS.map((v, i) => tex(noticeCanvas(v, i)));
  const lit = (map) => new THREE.MeshStandardMaterial({ map, emissive: 0xffffff, emissiveMap: map, emissiveIntensity: 0.45, roughness: 0.9 });
  const front = lit(textures[0]);
  const mirrored = textures.map((t) => { const m = t.clone(); m.wrapS = THREE.RepeatWrapping; m.repeat.x = -1; m.needsUpdate = true; return m; });
  const back = front.clone();
  const setBack = () => { back.map = mirrored[textures.indexOf(front.map)]; back.emissiveMap = back.map; back.needsUpdate = true; };
  setBack();
  const plain = new THREE.MeshStandardMaterial({ color: 0xf2f1ec, emissive: 0x555550, roughness: 0.9 });
  const sheet = new THREE.Mesh(new THREE.BoxGeometry(width, 0.012, depth), [plain, plain, front, back, plain, plain]); // +y 면이 앞면, -y 면(뒷면)에도 같은 무늬(거울 반전으로 바로 읽힘): 등 뒤 카메라에서도 보인다
  sheet.castShadow = true;

  // 구겨진 공: 흔들린 정이십면체. 평소엔 숨겨져 있다.
  const ballGeo = new THREE.IcosahedronGeometry(width * 0.4, 1);
  const p = ballGeo.attributes.position;
  for (let i = 0; i < p.count; i++) { // 같은 점은 같은 방향으로 밀려야 찢어지지 않는다: 위치로 정한 결정적 흔들림
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const j = 1 + 0.16 * Math.sin(x * 37 + y * 19) * Math.cos(z * 29 - x * 11);
    p.setXYZ(i, x * j, y * j, z * j);
  }
  ballGeo.computeVertexNormals();
  const ball = new THREE.Mesh(ballGeo, new THREE.MeshStandardMaterial({ map: tex(ballCanvas()), emissive: 0x777770, flatShading: true, roughness: 1 }));
  ball.castShadow = true;
  ball.visible = false;

  const group = new THREE.Group();
  group.add(sheet, ball);
  group.userData.setVariant = (i) => { front.map = textures[i % textures.length]; front.emissiveMap = front.map; front.needsUpdate = true; setBack(); };
  // k: 0 종이 ... 1 공. 종이가 오그라들며 공이 나타난다.
  group.userData.setCrumple = (k) => {
    const s = Math.max(0.02, 1 - k * 0.85);
    sheet.scale.set(s, 1 + k * 8, s);
    sheet.visible = k < 0.7;
    ball.visible = k > 0.35;
    ball.scale.setScalar(Math.min(1, (k - 0.35) / 0.4 + 0.2));
  };
  group.userData.variantCount = textures.length;
  return group;
}
