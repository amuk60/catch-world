import test from 'node:test';
import assert from 'node:assert/strict';
import { nextMode, canWalk, showPrompt } from '../src/logic/playerMode.js';

const EVENTS = ['interact:seat', 'interact:fortune', 'interact', 'move', 'close'];
// 표에 없는 조합은 모드가 그대로다.
const TABLE = {
  free: { 'interact:seat': 'seated', 'interact:fortune': 'fortune', interact: 'free', move: 'free', close: 'free' },
  seated: { 'interact:seat': 'seated', 'interact:fortune': 'seated', interact: 'free', move: 'free', close: 'seated' },
  fortune: { 'interact:seat': 'fortune', 'interact:fortune': 'fortune', interact: 'fortune', move: 'fortune', close: 'free' },
};

test('nextMode: 모든 (모드, 이벤트) 조합', () => {
  for (const [mode, row] of Object.entries(TABLE)) {
    for (const ev of EVENTS) assert.equal(nextMode(mode, ev), row[ev], `${mode} + ${ev}`);
  }
});

test('nextMode: 모르는 이벤트는 모드 유지', () => {
  for (const mode of Object.keys(TABLE)) assert.equal(nextMode(mode, 'nope'), mode);
});

test('canWalk: free 만 true', () => {
  assert.equal(canWalk('free'), true);
  assert.equal(canWalk('seated'), false);
  assert.equal(canWalk('fortune'), false);
});

test('showPrompt: free, seated 에서만 true', () => {
  assert.equal(showPrompt('free'), true);
  assert.equal(showPrompt('seated'), true);
  assert.equal(showPrompt('fortune'), false);
});
