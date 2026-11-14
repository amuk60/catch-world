import test from 'node:test';
import assert from 'node:assert/strict';
import { isMobileUA, multiplayerMode, channelPrefix, numberParam } from '../src/env.js';

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

test('multiplayerMode: 꺼짐·?mp=off·키 없는 supabase 는 null, ?mp=local 은 local', () => {
  const keys = { url: 'u', anonKey: 'k' };
  const none = { url: '', anonKey: '' };
  const cfg = { enabled: true, transport: 'supabase' };
  assert.equal(multiplayerMode('', { ...cfg, enabled: false }, keys), null);
  assert.equal(multiplayerMode('?mp=off', cfg, keys), null);
  assert.equal(multiplayerMode('?mp=off', { ...cfg, transport: 'local' }, keys), null);
  assert.equal(multiplayerMode('', cfg, none), null);
  assert.equal(multiplayerMode('', cfg, { url: 'u', anonKey: '' }), null);
  assert.equal(multiplayerMode('', cfg, undefined), null);
  assert.equal(multiplayerMode('', cfg, keys), 'supabase');
  assert.equal(multiplayerMode('?mp=local', cfg, none), 'local');
  assert.equal(multiplayerMode('?a=1&mp=local', cfg, keys), 'local');
  assert.equal(multiplayerMode('', { ...cfg, transport: 'local' }, none), 'local');
  assert.equal(multiplayerMode('', { ...cfg, transport: 'weird' }, keys), null);
  assert.equal(multiplayerMode(undefined, cfg, keys), 'supabase');
});

test('channelPrefix: ?mpdev= 는 시험용 채널로, 이상한 값은 무시', () => {
  const cfg = { channelPrefix: 'catch-world:' };
  assert.equal(channelPrefix('', cfg), 'catch-world:');
  assert.equal(channelPrefix('?mpdev=abc1', cfg), 'catch-world-dev-abc1:');
  assert.equal(channelPrefix('?mpdev=a b', cfg), 'catch-world:');
  assert.equal(channelPrefix('?mpdev=' + 'x'.repeat(17), cfg), 'catch-world:');
  assert.equal(channelPrefix('?mpdev=', cfg), 'catch-world:');
  assert.equal(channelPrefix(undefined, cfg), 'catch-world:');
});

test('numberParam: 범위 안의 정수만, 아니면 기본값', () => {
  assert.equal(numberParam('?mpcap=2', 'mpcap', 8, 1, 50), 2);
  assert.equal(numberParam('?mpcap=0', 'mpcap', 8, 1, 50), 8);
  assert.equal(numberParam('?mpcap=51', 'mpcap', 8, 1, 50), 8);
  assert.equal(numberParam('?mpcap=x', 'mpcap', 8, 1, 50), 8);
  assert.equal(numberParam('?mpcap=-3', 'mpcap', 8, 1, 50), 8);
  assert.equal(numberParam('?mpcap=', 'mpcap', 8, 1, 50), 8);
  assert.equal(numberParam('', 'mpcap', 8, 1, 50), 8);
  assert.equal(numberParam(undefined, 'mpcap', 8, 1, 50), 8);
});
