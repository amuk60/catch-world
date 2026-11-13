import test from 'node:test';
import assert from 'node:assert/strict';
import { INTERIOR_LOOK, INTERVIEW_LOOK } from '../src/config.js';
import { materialOverrides, rgb, cssRgb } from '../src/logic/look.js';
import { buildInterviewInterior } from '../src/logic/interiors.js';

const I = buildInterviewInterior();
const isHex = (v) => Number.isInteger(v) && v >= 0 && v <= 0xffffff;
const cool = (hex) => { const [r, , b] = rgb(hex); return b >= r; };
const colorOf = (s) => (typeof s === 'object' ? s.color : s);

test('모양(look): 면접장과 세탁소(기본)가 같은 필드를 가지고, 모든 색이 올바른 값이다', () => {
  assert.deepEqual(Object.keys(INTERVIEW_LOOK).sort(), Object.keys(INTERIOR_LOOK).sort());
  for (const look of [INTERIOR_LOOK, INTERVIEW_LOOK]) {
    for (const k of ['background', 'hemiSky', 'hemiGround', 'lamp', 'sunColor', 'baseboard']) assert.ok(isHex(look[k]), k);
    for (const k of ['hemi', 'lampIntensity', 'lampDistance', 'sun']) assert.ok(look[k] > 0 && Number.isFinite(look[k]), k);
    assert.ok(cssRgb(look.floor.a) && cssRgb(look.floor.b), '바닥 두 색');
    assert.equal(typeof look.floor.line, 'string');
    assert.ok(isHex(look.sign.board) && cssRgb(look.sign.bg) && cssRgb(look.sign.border) && cssRgb(look.sign.text));
  }
});

test('세탁소 실내 모양은 따뜻한 값 그대로다(면접장만 바꿨다)', () => {
  const { floor, sign, materials, ...plain } = INTERIOR_LOOK;
  assert.deepEqual(plain, {
    background: 0xf3e6d0, hemiSky: 0xfff4e0, hemiGround: 0xb59a78, hemi: 0.6, lamp: 0xffd9a0, lampIntensity: 9, lampDistance: 12, sun: 0.55, sunColor: 0xfff0d8, baseboard: 0x8a6a48,
  });
  assert.deepEqual(floor, { a: '#ead9b8', b: '#d7c19a', line: 'rgba(120, 95, 60, 0.25)', speckle: false });
  assert.deepEqual(sign, { board: 0xb98a56, bg: '#d9b27c', border: '#8a5f3a', text: '#4a2f1a' });
  assert.deepEqual(materials, {}, '세탁소 모델 재질은 덮어쓰지 않는다');
  const [r, , b] = rgb(INTERIOR_LOOK.background);
  assert.ok(r > b, '따뜻한 배경');
});

test('면접장 모양: 배경·조명·걸레받이·바닥·간판이 모두 차갑다(파랑 성분 >= 빨강 성분)', () => {
  const L = INTERVIEW_LOOK;
  for (const k of ['background', 'hemiSky', 'hemiGround', 'lamp', 'sunColor', 'baseboard']) assert.ok(cool(L[k]), k);
  assert.ok(cool(L.sign.board));
  for (const c of [L.floor.a, L.floor.b, L.sign.bg]) {
    const [r, , b] = cssRgb(c);
    assert.ok(b >= r, c);
  }
  assert.notEqual(L.background, INTERIOR_LOOK.background);
  assert.equal(L.floor.speckle, true, '카펫 타일');
  const [r, g, b] = rgb(L.background);
  assert.ok(Math.min(r, g, b) > 0xc0, '밝은 회색 배경');
});

test('면접장 재질 덮어쓰기: 값이 올바르고, 나무·카펫 재질은 전부 회색·남색 계열(따뜻한 갈색·분홍 없음)이다', () => {
  let count = 0;
  for (const [model, over] of Object.entries(INTERVIEW_LOOK.materials)) {
    for (const [mat, s] of Object.entries(over)) {
      count++;
      const spec = typeof s === 'object' ? s : { color: s };
      assert.ok(isHex(spec.color), `${model}.${mat}`);
      if (spec.opacity !== undefined) assert.ok(spec.opacity > 0 && spec.opacity <= 1);
      if (spec.roughness !== undefined) assert.ok(spec.roughness >= 0 && spec.roughness <= 1);
      if (['wood', 'woodDark', 'carpet', 'carpetDarker', 'metal', 'metalMedium', 'metalDark'].includes(mat)) assert.ok(cool(colorOf(s)), `${model}.${mat}`);
    }
  }
  assert.ok(count > 20);
});

test('면접장에 놓이는 모델(벽·가구·의자)은 모두 재질 덮어쓰기 항목이 있다(나무색이 그대로 남지 않게)', () => {
  const names = new Set([
    ...I.furniture.map((f) => f.name), ...I.seats.map((s) => s.chair.name), I.chair.name, ...I.walls.flatMap((w) => w.pieces.map((p) => p.name)),
  ]);
  for (const n of names) assert.ok(Object.keys(materialOverrides(INTERVIEW_LOOK, n)).length > 0, n);
  for (const n of ['desk', 'chairDesk', 'chairModernCushion', 'bookcaseOpenLow', 'laptop', 'rugRectangle']) assert.ok(INTERVIEW_LOOK.materials[n], n);
});

test('materialOverrides: 모델 이름별 설정이 "*" 기본값 위에 얹히고, 없는 모델은 기본값만, look 에 materials 가 없으면 빈 객체', () => {
  const look = { materials: { '*': { wood: 1, metal: 2 }, desk: { wood: 3 } } };
  assert.deepEqual(materialOverrides(look, 'desk'), { wood: 3, metal: 2 });
  assert.deepEqual(materialOverrides(look, 'other'), { wood: 1, metal: 2 });
  assert.deepEqual(materialOverrides({}, 'desk'), {});
  assert.deepEqual(materialOverrides(INTERIOR_LOOK, 'wall'), {}, '세탁소는 덮어쓰지 않는다');
});

test('rgb/cssRgb: 색 분해', () => {
  assert.deepEqual(rgb(0x1a2b3c), [0x1a, 0x2b, 0x3c]);
  assert.deepEqual(cssRgb('#1a2b3c'), [0x1a, 0x2b, 0x3c]);
  assert.equal(cssRgb('rgba(1, 2, 3, 0.5)'), null);
});
