// 순수 로직: 간판 글씨 모음과 구글 폰트 부분 집합(subset) 도우미. 건물 이름은 여기 한 곳에서만 정한다(layout·interiors·간판이 함께 쓴다).
// 간판 글씨를 바꾸면 SIGN_STRINGS 에도 넣는다: 여기 들어 있는 글자만 웹 폰트로 내려받아(수십 글자, 수 KB) 나머지는 시스템 글꼴로 그려진다.

export const BUILDING_NAMES = {
  interview: '캐치 면접장',
  laundry: '마음 세탁소',
  fortune: '포춘쿠키 상점',
};

// 폰트 종류별 설정. family: 구글 폰트 이름, weight: 그 글꼴이 가진 굵기(디스플레이 글꼴은 400 하나뿐이라 굵게 흉내 내지 않는다).
export const SIGN_FACE_SPECS = {
  corp: { family: 'Do Hyeon', weight: 400 }, // 캐치 면접장: 또렷한 회사 느낌
  friendly: { family: 'Jua', weight: 400 }, // 마음 세탁소: 동글동글 친근한 느낌
  stall: { family: 'Black Han Sans', weight: 400 }, // 포춘쿠키 상점: 굵고 따뜻한 장식체
  yard: { family: 'Jua', weight: 400 }, // 마당 팻말 "Catch World"
};

// 폰트 부분 집합에 들어가는 간판 글씨(전부).
export const SIGN_STRINGS = [
  ...Object.values(BUILDING_NAMES),
  'CATCH INTERVIEW HALL', 'INTERVIEW HALL', '2F 로비', 'HALL  ·  2F 로비',
  '세탁 · 다림질', '오늘의', '세탁', '접수 중', 'OPEN',
  '오늘의 면접 평가표', '표정  ★★★☆☆', '목소리  ★★★★☆', '당당함  ★★★★★', '화이팅!',
  '면접 안내', '1. 질문은 총 5문항', '2. 답변은 1·2·3 선택', '3. 핸드폰은 무음으로', '4. 복장은 단정하게',
  'Catch World',
];

// 글자 목록(중복 없이, 코드 순). 영문·숫자·기본 기호(0x20~0x7E)는 항상 넣어 둔다. 공백·제어 문자는 뺀다. 없는 글자는 시스템 글꼴이 채운다.
export function signGlyphs(strings) {
  const set = new Set();
  for (let c = 0x21; c <= 0x7e; c++) set.add(String.fromCharCode(c));
  for (const s of strings) for (const ch of String(s)) if (ch.trim() !== '') set.add(ch);
  return [...set].sort((a, b) => a.codePointAt(0) - b.codePointAt(0)).join('');
}

// 구글 폰트 CSS 주소. text= 로 필요한 글자만 담은 아주 작은 글꼴 파일을 받는다.
export function fontCssUrl(family, glyphs) {
  return `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family).replace(/%20/g, '+')}&display=swap&text=${encodeURIComponent(glyphs)}`;
}
