import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCatchUrl, fortuneCatchUrl } from '../src/logic/catchUrl.js';
import { CATCH_URL, FORTUNE_UTM } from '../src/config.js';

test('buildCatchUrl: 쿼리를 덧붙인다', () => {
  assert.equal(buildCatchUrl('https://www.catch.co.kr', { a: 1, b: 'x' }), 'https://www.catch.co.kr/?a=1&b=x');
});

test('buildCatchUrl: 기존 쿼리와 해시를 보존하고 같은 이름은 덮어쓴다', () => {
  assert.equal(buildCatchUrl('https://x.kr/p?keep=1&a=old#frag', { a: 2 }), 'https://x.kr/p?keep=1&a=2#frag');
});

test('buildCatchUrl: 안전하게 인코딩하고 빈 값은 건너뛴다', () => {
  const u = new URL(buildCatchUrl('https://x.kr', { q: 'a b&c=d/한글', no: null, un: undefined, e: '' }));
  assert.equal(u.searchParams.get('q'), 'a b&c=d/한글');
  assert.equal([...u.searchParams.keys()].join(','), 'q');
  assert.ok(!u.search.includes(' ') && !u.search.includes('&c='));
});

test('buildCatchUrl: 잘못된 주소는 그대로 돌려준다', () => {
  assert.equal(buildCatchUrl('not a url', { a: 1 }), 'not a url');
});

test('fortuneCatchUrl: utm 세 개가 붙는다', () => {
  const u = new URL(fortuneCatchUrl(CATCH_URL, FORTUNE_UTM, 'interview'));
  assert.equal(u.origin, new URL(CATCH_URL).origin);
  assert.equal(u.searchParams.get('utm_source'), 'catchworld');
  assert.equal(u.searchParams.get('utm_medium'), 'fortune');
  assert.equal(u.searchParams.get('utm_campaign'), 'interview');
});
