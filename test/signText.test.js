import test from 'node:test';
import assert from 'node:assert/strict';
import { BUILDING_NAMES, SIGN_STRINGS, SIGN_FACE_SPECS, signGlyphs, fontCssUrl } from '../src/logic/signText.js';

test('건물 이름: 캐치 면접장 · 마음 세탁소 · 포춘쿠키 상점', () => {
  assert.deepEqual(BUILDING_NAMES, { interview: '캐치 면접장', laundry: '마음 세탁소', fortune: '포춘쿠키 상점' });
});

test('signGlyphs: 중복 없이 코드 순이고 공백은 빠지며 영문·숫자·기호는 항상 들어 있다', () => {
  const g = signGlyphs(['캐치 면접장', '캐치']);
  assert.equal(new Set(g).size, g.length);
  assert.ok(!g.includes(' '));
  for (const ch of '캐치면접장ABCxyz09!') assert.ok(g.includes(ch), ch);
  const codes = [...g].map((c) => c.codePointAt(0));
  assert.deepEqual(codes, [...codes].sort((a, b) => a - b));
});

test('SIGN_STRINGS: 모든 건물 이름과 간판 글씨 글자가 부분 집합에 들어 있다', () => {
  const g = signGlyphs(SIGN_STRINGS);
  for (const name of Object.values(BUILDING_NAMES)) for (const ch of name.replace(/ /g, '')) assert.ok(g.includes(ch), `${name}: ${ch}`);
  for (const ch of 'Catch World') if (ch !== ' ') assert.ok(g.includes(ch));
  assert.ok(g.length < 200, '아주 작은 부분 집합');
});

test('fontCssUrl: text 매개변수에 글자가 인코딩되어 들어간다', () => {
  const u = fontCssUrl('Do Hyeon', '캐치A');
  assert.ok(u.startsWith('https://fonts.googleapis.com/css2?family=Do+Hyeon&display=swap&text='));
  assert.equal(decodeURIComponent(u.split('text=')[1]), '캐치A');
});

test('SIGN_FACE_SPECS: 허용된 구글 폰트만 쓴다', () => {
  const allowed = ['Jua', 'Do Hyeon', 'Black Han Sans', 'Gugi', 'Gowun Dodum', 'Noto Sans KR'];
  for (const spec of Object.values(SIGN_FACE_SPECS)) assert.ok(allowed.includes(spec.family));
});

test('파쇄기 명판 "스트레스 파쇄기"·이정표 글씨(캠프파이어·파쇄기)의 글자가 부분 집합에 들어 있고 명판 글꼴은 굵은 각인체다', async () => {
  const { SHREDDER_PLATE } = await import('../src/logic/signText.js');
  assert.equal(SHREDDER_PLATE, '스트레스 파쇄기');
  const g = signGlyphs(SIGN_STRINGS);
  for (const s of [SHREDDER_PLATE, '캠프파이어', '파쇄기', 'STRESS  SHREDDER']) for (const ch of s) if (ch !== ' ') assert.ok(g.includes(ch), `${s}: ${ch}`);
  assert.equal(SIGN_FACE_SPECS.plate.family, 'Black Han Sans');
});
