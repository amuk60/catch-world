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

test('wearing: free 에서만 시작하고, 입는 동안은 어떤 입력 이벤트에도 모드가 그대로, wear:end 로 free', () => {
  assert.equal(nextMode('free', 'wear:start'), 'wearing');
  for (const mode of ['seated', 'fortune', 'result', 'transition']) assert.equal(nextMode(mode, 'wear:start'), mode, mode);
  for (const ev of [...EVENTS, 'transition:start', 'wear:start']) assert.equal(nextMode('wearing', ev), 'wearing', ev);
  assert.equal(nextMode('wearing', 'wear:end'), 'free');
  assert.equal(nextMode('free', 'wear:end'), 'free');
  assert.equal(canWalk('wearing'), false);
  assert.equal(showPrompt('wearing'), false);
});

// ---- 면접장: 답변 선택 창('interview-choice')과 연출 중('interview-play') ----
const INTERVIEW_EVENTS = ['interview:open', 'interview:cancel', 'interview:pick', 'interview:play', 'interview:end'];

test('면접 보기: free 에서 열면 선택 모드, 감소 없이 닫으면(cancel) free, 고르면(pick) 연출 모드, 연출이 끝나면 free', () => {
  assert.equal(nextMode('free', 'interview:open'), 'interview-choice');
  assert.equal(nextMode('interview-choice', 'interview:cancel'), 'free');
  assert.equal(nextMode('interview-choice', 'interview:pick'), 'interview-play');
  assert.equal(nextMode('interview-play', 'interview:end'), 'free');
});

test('돌발행동: free 에서 바로 연출 모드로 들어가고 끝나면 free', () => {
  assert.equal(nextMode('free', 'interview:play'), 'interview-play');
  assert.equal(nextMode('interview-play', 'interview:end'), 'free');
});

test('면접 이벤트는 free 에서만 시작한다(앉기·포춘·종료 화면·전환·입기 중에는 무시)', () => {
  for (const m of ['seated', 'fortune', 'result', 'transition', 'wearing']) {
    for (const ev of ['interview:open', 'interview:play']) assert.equal(nextMode(m, ev), m, `${m} + ${ev}`);
  }
});

test('선택 창이 열려 있는 동안에는 다른 이벤트가 모드를 바꾸지 못한다(이동 클릭·전환·입기·결과 팝업 무시, Esc 는 main 이 cancel 로 처리)', () => {
  for (const ev of [...EVENTS, 'transition:start', 'wear:start', 'interview:open', 'interview:play', 'interview:end', 'nope']) {
    assert.equal(nextMode('interview-choice', ev), 'interview-choice', ev);
  }
});

test('연출 중에는 끝(end)만 모드를 바꾼다', () => {
  for (const ev of [...EVENTS, 'transition:start', 'wear:start', 'interview:open', 'interview:cancel', 'interview:pick', 'interview:play', 'nope']) {
    assert.equal(nextMode('interview-play', ev), 'interview-play', ev);
  }
  assert.ok(INTERVIEW_EVENTS.length === 5);
});

test('면접 모드에서는 걷지 못하고 E 안내도 없다', () => {
  for (const m of ['interview-choice', 'interview-play']) {
    assert.equal(canWalk(m), false, m);
    assert.equal(showPrompt(m), false, m);
  }
});
