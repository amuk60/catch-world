import test from 'node:test';
import assert from 'node:assert/strict';
import { nextMode, canWalk, showPrompt } from '../src/logic/playerMode.js';

const EVENTS = ['interact:seat', 'interact:fortune', 'interact', 'move', 'close', 'open:result'];
// 표에 없는 조합은 모드가 그대로다.
const TABLE = {
  free: { 'interact:seat': 'seated', 'interact:fortune': 'fortune', interact: 'free', move: 'free', close: 'free', 'open:result': 'result' },
  seated: { 'interact:seat': 'seated', 'interact:fortune': 'seated', interact: 'free', move: 'free', close: 'seated', 'open:result': 'result' },
  fortune: { 'interact:seat': 'fortune', 'interact:fortune': 'fortune', interact: 'fortune', move: 'fortune', close: 'free', 'open:result': 'fortune' },
  result: { 'interact:seat': 'result', 'interact:fortune': 'result', interact: 'result', move: 'result', close: 'free', 'open:result': 'result' },
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
  assert.equal(canWalk('result'), false);
});

test('showPrompt: free, seated 에서만 true', () => {
  assert.equal(showPrompt('free'), true);
  assert.equal(showPrompt('seated'), true);
  assert.equal(showPrompt('fortune'), false);
  assert.equal(showPrompt('result'), false);
});

test('소각 모드는 없다: burn 모드·interact:burn 이벤트', () => {
  assert.equal(nextMode('free', 'interact:burn'), 'free');
  assert.equal(nextMode('burn', 'close'), 'burn'); // 모르는 모드는 그대로
  assert.equal(canWalk('burn'), false);
  assert.equal(showPrompt('burn'), false);
});

// ---- 공간 전환(차원문) ----
test("전환: free 에서만 'transition:start' 로 들어가고, 끝나면 free 로 돌아온다", () => {
  assert.equal(nextMode('free', 'transition:start'), 'transition');
  assert.equal(nextMode('transition', 'transition:end'), 'free');
  // 앉아 있거나 포춘·종료 화면에서는 시작할 수 없다(일어난 뒤에 들어간다).
  for (const m of ['seated', 'fortune', 'result']) assert.equal(nextMode(m, 'transition:start'), m, m);
  // 전환이 아닐 때의 'transition:end' 는 무시.
  for (const m of ['free', 'seated', 'fortune', 'result']) assert.equal(nextMode(m, 'transition:end'), m, m);
});

test("전환 중에는 다른 이벤트가 모드를 바꾸지 못한다(이동·E·Esc·클리어 팝업 모두 무시)", () => {
  for (const ev of [...EVENTS, 'transition:start', 'nope']) assert.equal(nextMode('transition', ev), 'transition', ev);
});

test('전환 중에는 걷지 못하고 E 안내도 없다', () => {
  assert.equal(canWalk('transition'), false);
  assert.equal(showPrompt('transition'), false);
});
