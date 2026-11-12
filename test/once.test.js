import test from 'node:test';
import assert from 'node:assert/strict';
import { createOnce } from '../src/logic/once.js';

test('createOnce: 같은 키는 처음 한 번만 true', () => {
  const once = createOnce();
  assert.equal(once('game_start'), true);
  assert.equal(once('game_start'), false);
  assert.equal(once('game_start'), false);
});

test('createOnce: 키마다 따로, 인스턴스마다 따로', () => {
  const a = createOnce();
  const b = createOnce();
  assert.equal(a('x'), true);
  assert.equal(a('y'), true);
  assert.equal(b('x'), true);
});
