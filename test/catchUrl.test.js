import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCatchUrl, fortuneCatchUrl, linkCatchUrl } from '../src/logic/catchUrl.js';
import { CATCH_URL, FORTUNE_UTM, CATCH_LINKS, FORTUNES } from '../src/config.js';
import { goalMessage, emptyMessage, readyMessage } from '../src/logic/cta.js';

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

// ---- CATCH_LINKS: 서비스별 직접 링크 ----
const EXPECTED = {
  jobs: 'https://www.catch.co.kr/NCS/RecruitSearch',
  company: 'https://www.catch.co.kr/Comp/CompMajor',
  ai_match: 'https://www.catch.co.kr/NCS/RecruitInformation',
  interview_review: 'https://www.catch.co.kr/JobN/Interview/main',
  ai_interview: 'https://www.catch.co.kr/JobN/AIInterviewTutor/main',
  cover_letter: 'https://www.catch.co.kr/JobN/CoverLetter/Main',
  cafe: 'https://www.catch.co.kr/CatchCafe/',
  tv: 'https://www.catch.co.kr/News/CatchCast',
};

test('CATCH_LINKS: id 중복 없음, 이름·설명·주소가 모두 있고 주소는 https://www.catch.co.kr/ 로 시작(home 은 CATCH_URL)', () => {
  assert.equal(new Set(CATCH_LINKS.map((l) => l.id)).size, CATCH_LINKS.length, 'id 중복');
  for (const l of CATCH_LINKS) {
    assert.ok(l.id && l.name && l.desc, l.id);
    assert.ok(l.url === CATCH_URL || l.url.startsWith('https://www.catch.co.kr/'), l.url);
  }
  assert.deepEqual(CATCH_LINKS.map((l) => l.id).sort(), [...Object.keys(EXPECTED), 'home'].sort());
  assert.equal(CATCH_LINKS.find((l) => l.id === 'home').url, CATCH_URL);
});

test('linkCatchUrl: 표의 모든 항목이 경로(대소문자 포함)를 그대로 두고 utm 3개를 붙인다', () => {
  for (const l of CATCH_LINKS) {
    for (const medium of ['fortune', 'popup', 'chip', 'banner']) {
      const u = new URL(linkCatchUrl(CATCH_LINKS, l.id, medium));
      assert.equal(u.origin, 'https://www.catch.co.kr');
      assert.equal(u.pathname, new URL(l.url).pathname, `${l.id} 경로`);
      assert.equal(u.hash, '');
      assert.equal(u.searchParams.get('utm_source'), 'catchworld');
      assert.equal(u.searchParams.get('utm_medium'), medium);
      assert.equal(u.searchParams.get('utm_campaign'), l.id);
    }
  }
});

test('linkCatchUrl: 서비스별 정확한 주소(대소문자 경로 보존)와 campaign 지정', () => {
  for (const [id, url] of Object.entries(EXPECTED)) {
    assert.equal(linkCatchUrl(CATCH_LINKS, id, 'popup'), `${url}?utm_source=catchworld&utm_medium=popup&utm_campaign=${id}`);
  }
  assert.equal(linkCatchUrl(CATCH_LINKS, 'jobs', 'fortune', 'growth'), 'https://www.catch.co.kr/NCS/RecruitSearch?utm_source=catchworld&utm_medium=fortune&utm_campaign=growth');
  assert.equal(linkCatchUrl(CATCH_LINKS, 'home', 'chip'), 'https://www.catch.co.kr/?utm_source=catchworld&utm_medium=chip&utm_campaign=home');
});

test('linkCatchUrl: 표에 기존 쿼리·해시가 있어도 보존한다, 모르는 id 는 undefined', () => {
  const links = [{ id: 'x', url: 'https://www.catch.co.kr/A/B?keep=1#h' }];
  assert.equal(linkCatchUrl(links, 'x', 'popup'), 'https://www.catch.co.kr/A/B?keep=1&utm_source=catchworld&utm_medium=popup&utm_campaign=x#h');
  assert.equal(linkCatchUrl(CATCH_LINKS, 'nope', 'popup'), undefined);
});

test('팝업 버튼의 서비스: 목표(≤20)·지수 0(게임 종료)=home(캐치 메인), 면접 준비=ai_interview (모두 표에 있다)', () => {
  const ids = new Set(CATCH_LINKS.map((l) => l.id));
  assert.equal(goalMessage(18).link, 'home');
  assert.equal(emptyMessage().link, 'home');
  const home = 'https://www.catch.co.kr/?utm_source=catchworld&utm_medium=popup&utm_campaign=home';
  assert.equal(linkCatchUrl(CATCH_LINKS, goalMessage(18).link, 'popup'), home);
  assert.equal(linkCatchUrl(CATCH_LINKS, emptyMessage().link, 'popup'), home);
  assert.equal(readyMessage().link, 'ai_interview');
  for (const m of [goalMessage(18), emptyMessage(), readyMessage()]) {
    assert.ok(ids.has(m.link));
    assert.ok(m.cta.length <= 20, m.cta);
  }
});

test('운세 버튼: 모든 운세의 link 가 표에 있고 이름은 20자 이내, 실제 주소가 만들어진다', () => {
  for (const f of FORTUNES) {
    assert.ok(f.cta.label.length <= 20, f.cta.label);
    assert.ok(linkCatchUrl(CATCH_LINKS, f.cta.link, 'fortune', f.category), f.cta.link);
  }
});
