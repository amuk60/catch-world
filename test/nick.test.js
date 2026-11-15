import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeNick, validateNick, isBannedNick, suggestNick, suggestNickFor, NICK_MAX } from '../src/logic/nick.js';
import { isTypingTarget } from '../src/logic/typing.js';
import { MULTIPLAYER } from '../src/config.js';

const ok = (s) => validateNick(s);

test('normalizeNick: 앞뒤 공백 제거·연속 공백 하나로', () => {
  assert.equal(normalizeNick('  가   나\t다 '), '가 나 다');
  assert.equal(normalizeNick(5), '');
});

test('validateNick: 정상 이름은 다듬어 통과', () => {
  assert.deepEqual(ok('  너구리   왕 '), { ok: true, nick: '너구리 왕' });
  for (const n of ['ab', 'Tom_01', 'a-b.c', '합격기원', 'ㅋㅋ', '가'.repeat(10)]) assert.equal(ok(n).ok, true, n);
});

test('validateNick: 길이 2~10(다듬은 뒤)', () => {
  assert.equal(ok('가').reason, 'short');
  assert.equal(ok('   가   ').reason, 'short');
  assert.equal(ok('').reason, 'short');
  assert.equal(ok('가'.repeat(11)).reason, 'long');
  assert.equal(ok('가'.repeat(5000)).reason, 'long');
  assert.equal(ok(null).reason, 'type');
  assert.equal(ok({}).reason, 'type');
});

test('validateNick: 허용하지 않는 글자(HTML·이모지·제어·제로폭·RTL)', () => {
  for (const n of ['<b>hi</b>', 'a&b', '"quote"', "it's", 'a`b', '😀😀', '안녕😀', 'a\u0000b', 'a\u200bb', 'a\u202eb', 'ab\ufeff', '한\u200f글', '你好', '..', '___']) assert.equal(ok(n).ok, false, JSON.stringify(n));
  assert.equal(ok('<script>').reason, 'chars');
});

test('validateNick: URL·이메일·전화번호', () => {
  for (const n of ['http://a.b', 'www.abc', 'abc.com', 'a b . com', 'x@y.kr']) assert.equal(ok(n).ok, false, n);
  assert.equal(ok('abc.com').reason, 'url');
  for (const n of ['01012345678', '010-1234-5678', '010 1234 5678', '1234567']) assert.equal(ok(n).reason, 'digits', n);
  assert.equal(ok('합격 123456').ok, true, '6자리까지는 괜찮다');
});

test('금칙어: 한글·영어와 간단한 우회(반복·공백·점·숫자 끼움)', () => {
  for (const n of ['시발', '시 발', '시.발', '시_발', '씨이이발', '시1발', '병   신', '지랄이야', '개새끼', 'ㅅㅂ', 'fuck', 'F.U.C.K', 'fuuuck', 'f u c k', 'sh1t', 'Bitch', 'ni99a'.replace('99', 'gg'), '너 병신']) {
    assert.equal(isBannedNick(n), true, n);
    if (validateNick(n).reason !== 'short') assert.equal(validateNick(n).ok, false, n);
  }
  assert.equal(ok('시발').reason, 'banned');
  assert.equal(ok('fuuuck').reason, 'banned');
});

test('금칙어: 무난한 이름은 막지 않는다', () => {
  for (const n of ['야근 마스터', '퇴사 준비생', '합격 기원', 'Coffee Lover', 'class pass', '카피바라', '신입 사원', '면접 베테랑', '시바견', 'Hello World']) assert.equal(isBannedNick(n), false, n);
});

test('suggestNick: 풀에서 뽑고 항상 통과(10자 이하), 같은 id 는 같은 이름', () => {
  const { nickAdjectives: A, nickNouns: N } = MULTIPLAYER;
  for (const a of A) for (const n of N) { const s = suggestNick([a], [n], () => 0); assert.equal(validateNick(s).ok, true, s); assert.ok([...s].length <= NICK_MAX, s); }
  for (let i = 0; i < 200; i++) assert.equal(validateNick(suggestNick(A, N)).ok, true);
  assert.equal(suggestNickFor('abc123def456', A, N), suggestNickFor('abc123def456', A, N));
  assert.equal(validateNick(suggestNickFor('zzzz', [], [])).ok, true);
  assert.equal(validateNick(suggestNick(['아주아주아주아주긴형용사'], ['아주아주긴명사'], () => 0)).ok, true);
});

test('isTypingTarget: 입력칸·텍스트영역·선택·편집 가능 요소', () => {
  assert.equal(isTypingTarget({ tagName: 'INPUT', type: 'text' }), true);
  assert.equal(isTypingTarget({ tagName: 'input', type: 'search' }), true);
  assert.equal(isTypingTarget({ tagName: 'TEXTAREA' }), true);
  assert.equal(isTypingTarget({ tagName: 'SELECT' }), true);
  assert.equal(isTypingTarget({ tagName: 'DIV', isContentEditable: true }), true);
  assert.equal(isTypingTarget({ tagName: 'INPUT', type: 'checkbox' }), false);
  assert.equal(isTypingTarget({ tagName: 'BUTTON' }), false);
  assert.equal(isTypingTarget({ tagName: 'CANVAS' }), false);
  assert.equal(isTypingTarget(null), false);
  assert.equal(isTypingTarget(undefined), false);
});
