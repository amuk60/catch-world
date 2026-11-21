import test from 'node:test';
import assert from 'node:assert/strict';
import { isTouchDevice, mobileOverride, decideTouch, readDeviceEnv, shouldShowRotate } from '../src/logic/device.js';

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0 Mobile/15E148 Safari/604.1';
const ANDROID = 'Mozilla/5.0 (Linux; Android 14; SM-S918N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36';
const IPAD_OLD = 'Mozilla/5.0 (iPad; CPU OS 12_0 like Mac OS X) AppleWebKit/605.1.15';
const MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15';
const WIN = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

test('isTouchDevice: 아이폰(크롬 앱 포함)·안드로이드·옛 아이패드는 UA 로 터치 기기', () => {
  assert.equal(isTouchDevice({ ua: IPHONE }), true);
  assert.equal(isTouchDevice({ ua: ANDROID }), true);
  assert.equal(isTouchDevice({ ua: IPAD_OLD }), true);
});

test('isTouchDevice: Mac 으로 위장한 iPadOS 는 접점 수로 알아본다, 진짜 Mac 은 PC', () => {
  assert.equal(isTouchDevice({ ua: MAC, platform: 'MacIntel', maxTouchPoints: 5 }), true);
  assert.equal(isTouchDevice({ ua: MAC, platform: 'MacIntel', maxTouchPoints: 0 }), false);
  assert.equal(isTouchDevice({ ua: MAC, platform: 'MacIntel', maxTouchPoints: 1 }), false);
});

test('isTouchDevice: 윈도 PC 는 터치스크린(접점 10)이어도 주 포인터가 마우스면 PC, 굵은 포인터면 터치', () => {
  assert.equal(isTouchDevice({ ua: WIN, platform: 'Win32', maxTouchPoints: 10, coarse: false }), false);
  assert.equal(isTouchDevice({ ua: WIN, platform: 'Win32', maxTouchPoints: 10, coarse: true }), true);
  assert.equal(isTouchDevice({ ua: WIN }), false);
  assert.equal(isTouchDevice(), false);
  assert.equal(isTouchDevice({ ua: undefined, coarse: 'yes' }), false); // 진짜 true 만
});

test('mobileOverride: ?mobile=1/0 과 별칭, 그 밖에는 null', () => {
  assert.equal(mobileOverride('?mobile=1'), true);
  assert.equal(mobileOverride('?a=2&mobile=on'), true);
  assert.equal(mobileOverride('?mobile=TRUE'), true);
  assert.equal(mobileOverride('?mobile=0'), false);
  assert.equal(mobileOverride('?mobile=off'), false);
  assert.equal(mobileOverride('?mobile=maybe'), null);
  assert.equal(mobileOverride('?mobile='), null);
  assert.equal(mobileOverride(''), null);
  assert.equal(mobileOverride(undefined), null);
});

test('decideTouch: 주소 강제값이 기기 판정을 이긴다', () => {
  assert.equal(decideTouch('', { ua: IPHONE }), true);
  assert.equal(decideTouch('?mobile=0', { ua: IPHONE }), false);
  assert.equal(decideTouch('?mobile=1', { ua: WIN }), true);
  assert.equal(decideTouch('', { ua: WIN }), false);
});

test('readDeviceEnv: 창이 없거나 matchMedia 가 던져도 빈 값', () => {
  assert.deepEqual(readDeviceEnv(undefined), { ua: '', maxTouchPoints: 0, platform: '', coarse: false });
  const win = { navigator: { userAgent: IPHONE, maxTouchPoints: 5, platform: 'iPhone' }, matchMedia: () => { throw new Error('x'); } };
  assert.deepEqual(readDeviceEnv(win), { ua: IPHONE, maxTouchPoints: 5, platform: 'iPhone', coarse: false });
  const win2 = { navigator: {}, matchMedia: (q) => ({ matches: q === '(pointer: coarse)' }) };
  assert.equal(readDeviceEnv(win2).coarse, true);
});

test('shouldShowRotate: 터치 기기의 세로 화면에서만', () => {
  assert.equal(shouldShowRotate({ touch: true, width: 390, height: 844 }), true);
  assert.equal(shouldShowRotate({ touch: true, width: 844, height: 390 }), false);
  assert.equal(shouldShowRotate({ touch: true, width: 500, height: 500 }), false); // 정사각형은 막지 않는다
  assert.equal(shouldShowRotate({ touch: false, width: 390, height: 844 }), false); // PC 의 좁은 창은 막지 않는다
  assert.equal(shouldShowRotate({ touch: true, width: 0, height: 844 }), false);
  assert.equal(shouldShowRotate({ touch: true }), false);
});
