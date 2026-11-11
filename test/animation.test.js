import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clipNameFor, findClip, FADE_SECONDS } from '../src/logic/animation.js';

test('이동 중이면 walk, 아니면 idle', () => {
  assert.equal(clipNameFor(true), 'walk');
  assert.equal(clipNameFor(false), 'idle');
});
test('findClip: 이름이 같은 클립을 찾고 없으면 null', () => {
  const walk = { name: 'walk' };
  const clips = [{ name: 'idle' }, walk, { name: 'jump' }];
  assert.equal(findClip(clips, 'walk'), walk);
  assert.equal(findClip(clips, 'die'), null);
  assert.equal(findClip([], 'idle'), null);
});
test('페이드 시간은 0.2초', () => {
  assert.equal(FADE_SECONDS, 0.2);
});
test('clipNameForState: walk / idle / sit', async () => {
  const { clipNameForState } = await import('../src/logic/animation.js');
  assert.equal(clipNameForState('walk'), 'walk');
  assert.equal(clipNameForState('idle'), 'idle');
  assert.equal(clipNameForState('sit'), 'sit');
  assert.throws(() => clipNameForState('fly'), /fly/);
});
