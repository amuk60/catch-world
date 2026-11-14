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
  const optional = new Set(['glass', 'clothesline']); // 세탁소만 가지는 선택 필드(유리 벽, 빨랫줄 색)
  assert.deepEqual(Object.keys(INTERVIEW_LOOK).sort(), Object.keys(INTERIOR_LOOK).filter((k) => !optional.has(k)).sort());
  for (const look of [INTERIOR_LOOK, INTERVIEW_LOOK]) {
    for (const k of ['background', 'hemiSky', 'hemiGround', 'lamp', 'sunColor', 'baseboard']) assert.ok(isHex(look[k]), k);
    for (const k of ['hemi', 'lampIntensity', 'lampDistance', 'sun']) assert.ok(look[k] > 0 && Number.isFinite(look[k]), k);
    assert.ok(cssRgb(look.floor.a) && cssRgb(look.floor.b), '바닥 두 색');
    assert.equal(typeof look.floor.line, 'string');
    assert.ok(isHex(look.sign.board) && cssRgb(look.sign.bg) && cssRgb(look.sign.border) && cssRgb(look.sign.text));
  }
});

test('세탁소 실내 모양: 서리 유리 가게. 배경·조명·바닥·걸레받이·간판·유리·빨랫줄 색이 모두 밝고 시원하다(파랑 성분 >= 빨강 성분)', () => {
  const L = INTERIOR_LOOK;
  for (const k of ['background', 'hemiSky', 'hemiGround', 'lamp', 'sunColor', 'baseboard']) assert.ok(cool(L[k]), k);
  for (const c of [L.floor.a, L.floor.b, L.sign.bg]) { const [r, , b] = cssRgb(c); assert.ok(b >= r, c); }
  assert.ok(cool(L.sign.board));
  assert.equal(L.floor.speckle, false);
  assert.ok(L.sign.brushed, '솔질한 금속 간판');
  const [r, g, b] = rgb(L.background);
  assert.ok(Math.min(r, g, b) > 0xc8, '밝은 배경(밖 풍경이 아닌 흰 안개 같은 바탕)');
  assert.notEqual(L.background, INTERVIEW_LOOK.background);
  const [fr, fg, fb] = cssRgb(L.floor.a);
  assert.ok(Math.min(fr, fg, fb) > 200, '밝은 타일 바닥');
});

test('세탁소 유리 벽 설정: 틀·유리 질감 색이 올바르고 유리는 밝다(불투명 서리 유리)', () => {
  const G = INTERIOR_LOOK.glass;
  assert.ok(G, '세탁소는 유리 벽(look.glass)');
  assert.ok(isHex(G.frame) && isHex(G.frameDark) && isHex(G.emissive));
  for (const kind of ['wall', 'low', 'window']) {
    assert.equal(G.texture[kind].length, 3, kind);
    for (const c of G.texture[kind]) { const [r, g, b] = cssRgb(c); assert.ok(Math.min(r, g, b) > 0xb8 && b >= r, `${kind} ${c}`); }
    assert.ok(G.sheen[kind] > 0 && G.sheen[kind] <= 1, kind);
  }
  assert.ok(G.sheen.window > G.sheen.wall, '창이 벽보다 더 반짝인다');
  assert.ok(G.roughness > 0 && G.roughness <= 1 && G.clearcoat >= 0 && G.clearcoat <= 1 && G.emissiveIntensity >= 0);
  assert.equal(INTERVIEW_LOOK.glass, undefined, '면접장은 유리 벽이 아니다(모델 벽 그대로)');
  assert.ok(isHex(INTERIOR_LOOK.clothesline.post) && isHex(INTERIOR_LOOK.clothesline.pin));
});

test('세탁소 가구 재질 덮어쓰기: 값이 올바르고 나무색·분홍 카펫이 남지 않는다(색이 밝고 푸른 쪽)', () => {
  let count = 0;
  for (const [model, over] of Object.entries(INTERIOR_LOOK.materials)) {
    for (const [mat, spec] of Object.entries(over)) {
      count++;
      assert.ok(isHex(colorOf(spec)), `${model}.${mat}`);
      const [r, , b] = rgb(colorOf(spec));
      assert.ok(b >= r, `${model}.${mat} 파랑 성분 >= 빨강 성분`);
    }
  }
  assert.ok(count >= 10);
  // 세탁소에 놓이는 가구 중 원래 따뜻한 색(나무·카펫)이 있는 모델은 모두 덮어쓴다
  for (const n of ['table', 'benchCushion', 'pottedPlant', 'cardboardBoxOpen', 'rugRectangle']) assert.ok(INTERIOR_LOOK.materials[n], n);
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
    ...I.furniture.map((f) => f.name), ...I.seats.map((s) => s.chair.name), ...I.chairs.map((c) => c.name), ...I.waitChairs.map((c) => c.name), ...I.walls.flatMap((w) => w.pieces.map((p) => p.name)),
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
