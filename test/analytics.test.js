import test from 'node:test';
import assert from 'node:assert/strict';
import { initAnalytics, track } from '../src/analytics.js';

function clean() {
  delete globalThis.gtag;
  delete globalThis.dataLayer;
}

test('gtag 가 없으면 track 은 false', () => {
  clean();
  assert.equal(track('x', { a: 1 }), false);
});

test('gtag 가 있으면 track 은 ["event", name, params] 를 기록하고 true', () => {
  clean();
  const calls = [];
  globalThis.gtag = (...args) => calls.push(args);
  assert.equal(track('banner_click', { place: 'chip' }), true);
  assert.equal(track('share_link'), true);
  assert.deepEqual(calls, [['event', 'banner_click', { place: 'chip' }], ['event', 'share_link', {}]]);
  clean();
});

test('initAnalytics: id 가 비었거나 doc 이 없으면 false, 아무것도 하지 않는다', () => {
  clean();
  assert.equal(initAnalytics('', { head: {} }), false);
  assert.equal(initAnalytics(undefined, { head: {} }), false);
  assert.equal(initAnalytics('G-TEST123', null), false);
  assert.equal(globalThis.gtag, undefined);
  assert.equal(globalThis.dataLayer, undefined);
});

test('initAnalytics: 스크립트를 넣고 gtag·dataLayer 를 만들며 js/config 를 호출한다', () => {
  clean();
  const appended = [];
  const doc = { createElement: () => ({}), head: { appendChild: (el) => appended.push(el) } };
  assert.equal(initAnalytics('G-TEST123', doc), true);
  assert.equal(appended.length, 1);
  assert.ok(appended[0].src.includes('googletagmanager.com/gtag/js?id=G-TEST123'));
  assert.equal(appended[0].async, true);
  assert.equal(typeof globalThis.gtag, 'function');
  const queued = [...globalThis.dataLayer].map((a) => [...a]);
  assert.equal(queued[0][0], 'js');
  assert.ok(queued[0][1] instanceof Date);
  assert.deepEqual(queued[1], ['config', 'G-TEST123']);
  clean();
});

test('initAnalytics: id 는 URL 인코딩된다', () => {
  clean();
  const appended = [];
  initAnalytics('G-A&B', { createElement: () => ({}), head: { appendChild: (el) => appended.push(el) } });
  assert.ok(appended[0].src.endsWith('id=G-A%26B'));
  clean();
});
