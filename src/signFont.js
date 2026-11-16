// 브라우저 전용: 간판 글꼴 불러오기와 선명한 간판 텍스처.
//  - 구글 폰트(부분 집합: 간판에 쓰는 글자만)를 <link> 로 비동기 요청한다. 게임은 기다리지 않고, 글꼴이 준비되면 등록된 간판 캔버스를 다시 그려 needsUpdate 를 켠다.
//  - 실패(오프라인·차단·시간 초과)하면 예전 시스템 글꼴(맑은 고딕 굵게)로 그대로 그린다(에러·빈 간판 없음).
//  - 간판 캔버스는 SIGN_SCALE 배 해상도로 그리고, 텍스처는 밉맵 + 이방성 필터링 + sRGB 로 만든다.
import * as THREE from 'three';
import { LAUNDRY_ITEMS } from './config.js';
import { SIGN_FACE_SPECS, SIGN_STRINGS, signGlyphs, fontCssUrl } from './logic/signText.js';

export const SIGN_SCALE = 2; // 간판 캔버스 해상도 배율(논리 크기 x2)
const SYSTEM_STACK = '"Malgun Gothic", "Apple SD Gothic Neo", "Noto Sans KR", sans-serif';
const TIMEOUT_MS = 8000;

const loaded = new Set(); // 불러온 글꼴 종류(face 키)
const redraws = new Set();
let timer = 0;

// 폰트 문자열. 웹 글꼴이 준비되었으면 그 글꼴(가진 굵기 그대로), 아니면 시스템 글꼴 굵게.
export function fontOf(face, px, weight = 'bold') {
  const spec = SIGN_FACE_SPECS[face];
  if (spec && loaded.has(face)) return `${spec.weight} ${px}px "${spec.family}", ${SYSTEM_STACK}`;
  return `${weight} ${px}px ${SYSTEM_STACK}`;
}

// 간판 캔버스 하나(논리 크기 w x h, 실제 SIGN_SCALE 배). g 에는 이미 배율이 적용되어 있어 논리 좌표로 그리면 된다.
export function signCanvas(w, h, k = SIGN_SCALE) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(2, Math.round(w * k));
  canvas.height = Math.max(2, Math.round(h * k));
  const g = canvas.getContext('2d');
  g.scale(k, k);
  return { canvas, g };
}

// 폭 maxW 에 들어가도록 글씨 크기를 줄여(1px 단위) g.font 를 맞춘다. 돌려주는 값: { size, width }.
export function fitSignFont(g, text, { maxW, size, face, weight = 'bold', minPx = 10 }) {
  let s = size;
  g.font = fontOf(face, s, weight);
  let width = g.measureText(text).width;
  if (width > maxW) { s = Math.max(minPx, Math.floor((s * maxW) / width)); g.font = fontOf(face, s, weight); width = g.measureText(text).width; }
  return { size: s, width };
}

// 가운데 정렬로 그린다(폭에 맞춰 크기를 줄인다). 그림자·윤곽선 옵션으로 입체감을 준다. 돌려주는 값: 실제 글씨 크기.
export function drawSignText(g, text, { x, y, maxW, size, color, face, weight = 'bold', outline, outlineW = 0, shadow, shadowOff = 0, minPx = 10 }) {
  const fit = fitSignFont(g, text, { maxW, size, face, weight, minPx });
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineJoin = 'round';
  if (shadow && shadowOff) { g.fillStyle = shadow; g.fillText(text, x + shadowOff, y + shadowOff); }
  if (outline && outlineW) { g.strokeStyle = outline; g.lineWidth = outlineW; g.strokeText(text, x, y); }
  g.fillStyle = color;
  g.fillText(text, x, y);
  return fit.size;
}

// 간판 텍스처. make() 는 캔버스를 돌려주는 함수(결정적, 같은 크기): 글꼴이 늦게 준비되면 다시 불러 같은 캔버스에 덮어 그린다.
export function liveSignTexture(make, { repeat } = {}) {
  const canvas = make();
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8; // GPU 한계를 넘으면 three 가 알아서 줄인다
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  if (repeat) { texture.wrapS = THREE.RepeatWrapping; texture.repeat.set(...repeat); }
  redraws.add(() => {
    const fresh = make();
    if (fresh.width !== canvas.width || fresh.height !== canvas.height) return;
    const g = canvas.getContext('2d');
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, canvas.width, canvas.height);
    g.drawImage(fresh, 0, 0);
    texture.needsUpdate = true;
  });
  return texture;
}

function scheduleRedraw() {
  clearTimeout(timer);
  timer = setTimeout(() => { for (const fn of redraws) { try { fn(); } catch { /* 글씨 다시 그리기 실패는 무시 */ } } }, 30);
}

function loadCss(href) {
  return new Promise((resolve) => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    const done = (ok) => { clearTimeout(t); resolve(ok); };
    const t = setTimeout(() => done(false), TIMEOUT_MS);
    link.onload = () => done(true);
    link.onerror = () => done(false);
    document.head.appendChild(link);
  });
}

// 게임 시작 때 한 번 부른다(기다리지 않아도 된다). 글꼴마다 준비되는 대로 간판을 다시 그린다.
export function loadSignFonts(strings = [...SIGN_STRINGS, '세탁 완료!', ...LAUNDRY_ITEMS.map((i) => i.display)]) {
  if (typeof document === 'undefined' || !document.fonts) return Promise.resolve();
  const glyphs = signGlyphs(strings);
  const byFamily = new Map();
  for (const [face, spec] of Object.entries(SIGN_FACE_SPECS)) {
    if (!byFamily.has(spec.family)) byFamily.set(spec.family, { spec, faces: [] });
    byFamily.get(spec.family).faces.push(face);
  }
  return Promise.all([...byFamily].map(async ([family, { spec, faces }]) => {
    try {
      if (!(await loadCss(fontCssUrl(family, glyphs)))) return;
      await document.fonts.load(`${spec.weight} 64px "${family}"`, glyphs);
      if (!document.fonts.check(`${spec.weight} 64px "${family}"`, glyphs)) return;
      for (const f of faces) loaded.add(f);
      scheduleRedraw();
    } catch { /* 실패하면 시스템 글꼴 그대로 */ }
  }));
}
