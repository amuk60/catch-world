import test from 'node:test';
import assert from 'node:assert/strict';
import { isMobileUA } from '../src/env.js';

test('안드로이드·아이폰은 모바일로 판별한다', () => {
  assert.equal(isMobileUA('Mozilla/5.0 (Linux; Android 13; SM-S918N) Mobile Safari'), true);
  assert.equal(isMobileUA('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)'), true);
});

test('데스크톱 브라우저는 모바일이 아니다', () => {
  assert.equal(isMobileUA('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120 Safari/537.36'), false);
});

test('빈 값은 모바일이 아니다', () => {
  assert.equal(isMobileUA(''), false);
  assert.equal(isMobileUA(undefined), false);
});
