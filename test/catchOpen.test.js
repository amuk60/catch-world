import test from 'node:test';
import assert from 'node:assert/strict';
import { createCatchOpener } from '../src/logic/catchOpen.js';
import { trackCatchClick, track } from '../src/analytics.js';
import { CATCH_LINKS, FORTUNES } from '../src/config.js';
import { goalMessage, emptyMessage, readyMessage } from '../src/logic/cta.js';

// gtag 를 흉내 내어 CTA 한 번당 이벤트를 센다.
function setup() {
  const events = [];
  const opened = [];
  globalThis.gtag = (kind, name, params) => events.push({ kind, name, params });
  const openCatch = createCatchOpener({ links: CATCH_LINKS, open: (url) => opened.push(url), track, trackCatch: trackCatchClick });
  return { events, opened, openCatch };
}
const unified = (events) => events.filter((e) => e.name === 'catch_link_click');

// main.js 의 CTA 진입점과 같은 호출(링크·source).
const ENTRIES = [
  { name: '포춘 버튼', link: FORTUNES[0].cta.link, opts: { source: 'fortune', category: FORTUNES[0].category }, medium: 'fortune' },
  { name: '측면 팝업(≤20)', link: goalMessage(18).link, opts: { source: 'popup_goal' }, medium: 'popup' },
  { name: '가운데 팝업(종료)', link: emptyMessage().link, opts: { source: 'popup_clear' }, medium: 'popup' },
  { name: '면접 준비 팝업', link: readyMessage().link, opts: { source: 'popup_ready' }, medium: 'popup' },
  { name: '칩', link: 'home', opts: { source: 'chip' }, medium: 'chip' },
];

test('CTA 진입점마다 클릭 한 번에 새 탭 1번, catch_link_click 정확히 1번(link·source·medium 정확)', () => {
  for (const e of ENTRIES) {
    const { events, opened, openCatch } = setup();
    assert.equal(openCatch(e.link, e.opts), true, e.name);
    assert.equal(opened.length, 1, e.name);
    assert.ok(opened[0].includes(`utm_medium=${e.medium}`) && opened[0].includes(`utm_campaign=${e.link}`), opened[0]);
    const u = unified(events);
    assert.equal(u.length, 1, `${e.name}: ${events.map((x) => x.name)}`);
    assert.equal(u[0].params.link, e.link);
    assert.equal(u[0].params.source, e.opts.source);
    assert.equal(u[0].params.medium, e.medium);
    assert.equal(u[0].params.campaign, e.link);
    assert.equal(u[0].params.category, e.opts.category);
  }
  delete globalThis.gtag;
});

test('기존 상세 이벤트는 그대로 한 번씩 남는다(fortune_cta_click+cta_click, banner_click, cta_click outfit_ready)', () => {
  const names = (e) => { const { events, openCatch } = setup(); openCatch(e.link, e.opts); return events.map((x) => [x.name, x.params]); };
  const by = Object.fromEntries(ENTRIES.map((e) => [e.opts.source, names(e)]));
  const f = ENTRIES[0];
  assert.deepEqual(by.fortune.slice(1), [['fortune_cta_click', { category: f.opts.category, link: f.link }], ['cta_click', { source: 'fortune', category: f.opts.category, link: f.link }]]);
  assert.deepEqual(by.popup_goal.slice(1), [['banner_click', { place: 'side', link: 'home' }]]);
  assert.deepEqual(by.popup_clear.slice(1), [['banner_click', { place: 'modal', link: 'home' }]]);
  assert.deepEqual(by.popup_ready.slice(1), [['cta_click', { source: 'outfit_ready', link: 'ai_interview' }]]);
  assert.deepEqual(by.chip.slice(1), [['banner_click', { place: 'chip', link: 'home' }]]);
  delete globalThis.gtag;
});

test('모르는 링크 id 는 아무것도 열지 않고 이벤트도 보내지 않는다', () => {
  const { events, opened, openCatch } = setup();
  assert.equal(openCatch('nope', { source: 'chip' }), false);
  assert.equal(opened.length, 0);
  assert.equal(events.length, 0);
  delete globalThis.gtag;
});

test('같은 CTA 를 두 번 누르면 이벤트도 두 번(클릭당 1번씩, 중복 없음)', () => {
  const { events, openCatch } = setup();
  openCatch('home', { source: 'chip' });
  openCatch('home', { source: 'chip' });
  assert.equal(unified(events).length, 2);
  delete globalThis.gtag;
});

test('모든 운세 버튼이 표에 있는 링크로 열리고 catch_link_click 을 1번 보낸다', () => {
  for (const f of FORTUNES) {
    const { events, openCatch } = setup();
    assert.equal(openCatch(f.cta.link, { source: 'fortune', category: f.category }), true, f.cta.link);
    assert.equal(unified(events).length, 1);
  }
  delete globalThis.gtag;
});

test('main.js 에는 캐치 링크를 직접 여는 곳이 없다(window.open 은 openCatch 한 곳)', async () => {
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  assert.equal(src.match(/window\.open\(/g).length, 1);
  assert.equal(src.match(/linkCatchUrl\(/g), null);
});
