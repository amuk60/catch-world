// 닉네임 순수 로직: 다듬기·검사(길이·허용 글자·URL·전화번호·욕설)와 무작위 추천. 내가 입력한 이름도, 다른 방문자가 보낸 이름(믿을 수 없는 입력)도 같은 함수로 검사한다.
export const NICK_MIN = 2;
export const NICK_MAX = 10;

// 허용: 한글 음절·자모, 영문 대소문자, 숫자, 공백, _ - .
const ALLOWED = /^[\u1100-\u11FF\u3131-\u318E\uAC00-\uD7A3A-Za-z0-9 _.-]+$/;
const HAS_LETTER = /[\u1100-\u11FF\u3131-\u318E\uAC00-\uD7A3A-Za-z0-9]/;
const DIGIT_RUN = /\d(?:[\s._-]*\d){6,}/; // 7자리 이상의 숫자(전화번호·계좌 같은 것, 구분 기호가 끼어도)
const URL_LIKE = /https?|www|:\/\/|[a-z0-9]\s*\.\s*(?:com|net|org|kr|io|me|co|app|dev|xyz|tv|gg|ly|link|site)(?![a-z])/i;

// 보이지 않는 글자·방향 제어 글자(제로폭, RTL 표시 등)와 제어 문자를 지운다.
// eslint-disable-next-line no-control-regex
const INVISIBLE = /[\u0000-\u001f\u007f-\u009f\u00ad\u061c\u180e\u200b-\u200f\u2028-\u202e\u2060-\u206f\ufeff]/g;

// 앞뒤 공백을 자르고 연속 공백을 하나로 줄인다(보이지 않는 글자는 그대로 둔다: 검사에서 거절하려고).
export function normalizeNick(raw) {
  if (typeof raw !== 'string') return '';
  return raw.normalize('NFC').replace(/[\s\u3000]+/g, ' ').trim();
}

// ---- 금칙어 ----
// 보수적이고 적은 목록. 비교는 소문자·구분 기호 제거·반복 글자 합치기를 거친 꼴로 한다(그래서 "시 발", "시.발", "씨이이발", "f.u.c.k" 를 잡는다). 팀이 고쳐 쓴다.
const BANNED = [
  // 한글 욕설·비하·혐오
  '시발', '씨발', '씨빨', '시팔', '씨팔', '쉬발', '병신', '븅신', '빙신', '지랄', '염병', '좆', '존나', '졸라게', '개새끼', '개새', '새끼야', '미친놈', '미친년', '쌍년', '쌍놈', '썅', '걸레년', '창녀', '창남', '느금마', '느그엄마', '니미', '니애미', '니엄마', '애미', '에미뒤', '엠창', '씹', '호로', '섹스', '야동', '자지', '보지', '딸딸이', '한남충', '김치녀', '된장녀', '일베', '메갈', '틀딱', '맘충', '급식충', '장애인새', '닥쳐', '꺼져', '뒤져', '죽어', '죽여', '자살', '엿먹', '개년', '병맛충',
  // 자모 약어
  'ㅅㅂ', 'ㅆㅂ', 'ㅂㅅ', 'ㅄ', 'ㅈㄹ', 'ㅈㄴ', 'ㄲㅈ', 'ㅁㅊ', 'ㄷㅊ',
  // 영어
  'fuck', 'shit', 'bitch', 'bastard', 'asshole', 'nigger', 'nigga', 'faggot', 'cunt', 'whore', 'slut', 'porn', 'rapist', 'nazi', 'hitler', 'retard', 'dickhead', 'motherfucker', 'cumshot', 'blowjob', 'kys',
];
const LEET = { 0: 'o', 1: 'i', 3: 'e', 4: 'a', 5: 's', 7: 't' };

// 구분 기호를 지우고 같은 글자의 반복을 하나로 합친다. leet: 숫자를 비슷한 글자로 바꿀지(true) 숫자를 아예 지울지(false).
function fold(text, leet) {
  let s = text.toLowerCase().replace(/[\s._-]+/g, '');
  s = leet ? s.replace(/[013457]/g, (c) => LEET[c] ?? c) : s.replace(/\d+/g, '');
  return s.replace(/(.)\1+/gu, '$1');
}
// 모음만 있는 글자(이·으·어·아·오·우)를 끼워 넣는 우회("시이발")를 위해 그 글자를 뺀 꼴도 비교한다.
const drop = (t) => t.replace(/[이으어아오우]/g, '');
const FOLDED = [...new Set(BANNED.map((w) => fold(w, true)))];
const FOLDED_DROP = [...new Set(FOLDED.map(drop).filter((w) => w.length >= 2))];

// 금칙어가 들어 있는가(이미 다듬은 문자열을 준다).
export function isBannedNick(text) {
  if (typeof text !== 'string' || !text) return false;
  const forms = [fold(text, true), fold(text, false)];
  return FOLDED.some((w) => forms.some((f) => f.includes(w))) || FOLDED_DROP.some((w) => forms.some((f) => drop(f).includes(w)));
}

// 사람이 입력했거나 받은 이름을 검사한다. 반환: { ok: true, nick } | { ok: false, reason: 'type'|'short'|'long'|'chars'|'url'|'digits'|'banned' }.
// 너무 길면 자르지 않고 거절한다(받는 쪽은 그러면 무난한 이름으로 바꾼다).
export function validateNick(raw) {
  if (typeof raw !== 'string') return { ok: false, reason: 'type' };
  if (raw.length > 200) return { ok: false, reason: 'long' };
  if (INVISIBLE.test(raw)) { INVISIBLE.lastIndex = 0; return { ok: false, reason: 'chars' }; }
  INVISIBLE.lastIndex = 0;
  const nick = normalizeNick(raw);
  const len = [...nick].length;
  if (len < NICK_MIN) return { ok: false, reason: 'short' };
  if (!ALLOWED.test(nick) || !HAS_LETTER.test(nick)) return { ok: false, reason: 'chars' };
  if (URL_LIKE.test(nick)) return { ok: false, reason: 'url' };
  if (DIGIT_RUN.test(nick)) return { ok: false, reason: 'digits' };
  if (isBannedNick(nick)) return { ok: false, reason: 'banned' };
  if (len > NICK_MAX) return { ok: false, reason: 'long' };
  return { ok: true, nick };
}

export const NICK_REASONS = {
  type: '이름을 입력해 주세요',
  short: `이름은 ${NICK_MIN}글자 이상이에요`,
  long: `이름은 ${NICK_MAX}글자까지예요`,
  chars: '한글·영문·숫자와 _ - . 만 쓸 수 있어요',
  url: '주소처럼 보이는 이름은 쓸 수 없어요',
  digits: '긴 숫자(전화번호 등)는 쓸 수 없어요',
  banned: '사용할 수 없는 이름이에요',
};

// ---- 추천 이름 ----
// 기존 형용사·명사 풀에서 "<형용사> <명사>" 를 뽑는다(NICK_MAX 글자 이하만). rng: () => [0,1).
export function suggestNick(adjectives, nouns, rng = Math.random) {
  const adjs = adjectives?.length ? adjectives : ['신입'];
  const ns = nouns?.length ? nouns : ['방문자'];
  for (let i = 0; i < 40; i++) {
    const name = `${adjs[Math.floor(rng() * adjs.length)]} ${ns[Math.floor(rng() * ns.length)]}`;
    if (validateNick(name).ok) return name;
  }
  for (const a of adjs) for (const n of ns) if (validateNick(`${a} ${n}`).ok) return `${a} ${n}`;
  return `${ns[0]}${100 + Math.floor(rng() * 900)}`.slice(0, NICK_MAX);
}

// 같은 id 는 항상 같은 추천 이름(처음 접속할 때 기본 이름).
export function suggestNickFor(id, adjectives, nouns) {
  let h = 0x811c9dc5;
  for (const ch of String(id)) { h ^= ch.codePointAt(0); h = Math.imul(h, 0x01000193) >>> 0; }
  let a = h >>> 0;
  const rng = () => { a = (Math.imul(a, 1664525) + 1013904223) >>> 0; return a / 4294967296; };
  return suggestNick(adjectives, nouns, rng);
}
