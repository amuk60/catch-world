import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WISH } from '../src/config.js';
import { validateWish, wishCooldownLeft, canWish, nextStoneCount, parseStoneCount, stoneAt, pickCheer, wishEventParams, WISH_REASONS } from '../src/logic/wish.js';
import { nextMode, canWalk, showPrompt, holdsSeat } from '../src/logic/playerMode.js';
import { actionOf } from '../src/logic/interaction.js';
import { MAX_LINE_LENGTH } from '../src/logic/incinerator.js';
import { RECIPES } from '../src/audio/recipes.js';

test('설정: 최대 40자, 쿨다운 10초, 돌은 최대 개수에서 멈추고, 응원 문구 5~6개(말풍선 길이 이하)', () => {
  assert.equal(WISH.maxLength, 40);
  assert.equal(WISH.cooldownSeconds, 10);
  assert.ok(WISH.maxStones >= 5 && WISH.maxStones <= 20);
  assert.ok(WISH.cheers.length >= 5 && WISH.cheers.length <= 6);
  for (const c of WISH.cheers) assert.ok(c.trim() && [...c].length <= MAX_LINE_LENGTH, c);
  assert.equal(new Set(WISH.cheers).size, WISH.cheers.length);
});

test('소원 글 검사: 비어 있으면(공백만 포함) 못 내고, 40자까지는 되고 41자는 안 된다', () => {
  for (const raw of ['', '   ', '\n\t', null, undefined]) assert.deepEqual(validateWish(raw), { ok: false, reason: 'empty' }, String(raw));
  assert.deepEqual(validateWish('  올해 꼭 합격!  '), { ok: true, wish: '올해 꼭 합격!' });
  assert.deepEqual(validateWish('가'.repeat(40)), { ok: true, wish: '가'.repeat(40) });
  assert.deepEqual(validateWish('가'.repeat(41)), { ok: false, reason: 'long' });
  assert.deepEqual(validateWish('🍀'.repeat(40)).ok, true, '이모지도 한 글자');
  assert.deepEqual(validateWish('첫 줄\n둘째   줄'), { ok: true, wish: '첫 줄 둘째 줄' }, '줄바꿈·연속 공백은 빈칸 하나');
  assert.equal(validateWish('가'.repeat(5), 4).reason, 'long');
  assert.ok(WISH_REASONS.empty && WISH_REASONS.long.includes('40'));
});

test('쿨다운: 처음은 바로, 빈 뒤 10초 동안은 남은 초(올림), 10초가 지나면 다시', () => {
  assert.equal(wishCooldownLeft(5, null), 0);
  assert.equal(canWish(5, null), true);
  assert.equal(wishCooldownLeft(100, 100), 10);
  assert.equal(wishCooldownLeft(100.2, 100), 10);
  assert.equal(wishCooldownLeft(105, 100), 5);
  assert.equal(wishCooldownLeft(109.5, 100), 1);
  assert.equal(canWish(109.99, 100), false);
  assert.equal(canWish(110, 100), true);
  assert.equal(canWish(200, 100), true);
  assert.equal(wishCooldownLeft(103, 100, 2), 0);
});

test('돌 개수: 빌 때마다 하나씩, 최대에서 멈추고, 저장소 값은 0~최대 정수로 읽는다', () => {
  assert.equal(nextStoneCount(0), 1);
  assert.equal(nextStoneCount(4), 5);
  assert.equal(nextStoneCount(WISH.maxStones - 1), WISH.maxStones);
  assert.equal(nextStoneCount(WISH.maxStones), WISH.maxStones);
  assert.equal(nextStoneCount(99, 3), 3);
  assert.equal(nextStoneCount('x'), 1);
  for (const [raw, n] of [[null, 0], ['', 0], ['abc', 0], ['3', 3], ['-2', 0], ['999', WISH.maxStones], [4.7, 4], [undefined, 0]]) assert.equal(parseStoneCount(raw), n, String(raw));
});

test('돌 놓임새: 아래 돌이 넓고 위로 갈수록 작아지며, 각 돌은 아래 돌 위에 얹힌다(결정적)', () => {
  let prevTop = 0;
  for (let i = 0; i < WISH.maxStones; i++) {
    const s = stoneAt(i);
    assert.ok(Math.abs(s.y - prevTop) < 1e-9, `${i}: 바로 아래 돌 위`);
    assert.ok(s.radius > 0.05 && s.radius < 0.3 && s.height > 0.03 && s.height < 0.1, `${i}`);
    assert.ok(Math.abs(s.dx) < 0.03 && Math.abs(s.dz) < 0.03);
    prevTop = s.y + s.height;
  }
  assert.ok(stoneAt(0).radius > stoneAt(WISH.maxStones - 1).radius + 0.05, '위가 더 작다');
  assert.ok(prevTop < 1.0, `돌탑 높이 ${prevTop}`);
  assert.deepEqual(stoneAt(3), stoneAt(3));
});

test('응원 한 줄: 목록에서 고르고 직전 것은 피한다', () => {
  assert.deepEqual(pickCheer(['a', 'b', 'c'], () => 0), { index: 0, text: 'a' });
  assert.deepEqual(pickCheer(['a', 'b', 'c'], () => 0, 0), { index: 1, text: 'b' });
  assert.deepEqual(pickCheer(['a', 'b', 'c'], () => 0.9999, 2), { index: 0, text: 'a' });
  assert.deepEqual(pickCheer(['a'], () => 0, 0), { index: 0, text: 'a' });
  assert.deepEqual(pickCheer([], () => 0), { index: -1, text: '' });
  for (let i = 0; i < 50; i++) assert.ok(WISH.cheers.includes(pickCheer().text));
});

test('분석: wish_made 에는 글자 수와 돌 개수만 싣고 소원 글은 절대 싣지 않는다', () => {
  const wish = '캐치 회사 최종 합격';
  const p = wishEventParams(wish, 3);
  assert.deepEqual(p, { length: [...wish].length, stones: 3 });
  assert.deepEqual(Object.keys(p).sort(), ['length', 'stones']);
  assert.ok(!JSON.stringify(p).includes('합격'));
});

test('모드: free 에서 wish:open 하면 wishing, wish:close 로 free. 그 사이 걷기·E 안내·앉기·다른 전이는 잠긴다', () => {
  assert.equal(nextMode('free', 'wish:open'), 'wishing');
  assert.equal(nextMode('wishing', 'wish:close'), 'free');
  assert.equal(canWalk('wishing'), false);
  assert.equal(showPrompt('wishing'), false);
  assert.equal(holdsSeat('wishing'), false);
  for (const event of ['move', 'interact', 'interact:seat', 'interact:fortune', 'close', 'open:result', 'transition:start', 'wear:start', 'pick:open', 'wish:open']) {
    assert.equal(nextMode('wishing', event), 'wishing', event);
  }
  for (const mode of ['seated', 'fortune', 'result', 'transition', 'wearing', 'interview-choice', 'interview-play', 'item-choice', 'roasting']) assert.equal(nextMode(mode, 'wish:open'), mode, mode);
});

test('E 동작: 소원 조각상(kind wish)은 "소원 빌기"', () => {
  assert.deepEqual(actionOf({ kind: 'wish' }), { type: 'wish', prompt: '소원 빌기' });
});

test('소리: 소원 종소리(wishBell) 하나만 더했다(부드러운 종소리, 화면 묶음)', () => {
  const def = RECIPES.wishBell;
  assert.ok(def && typeof def.run === 'function');
  assert.ok(def.gain > 0 && def.gain <= 3);
  assert.ok(def.minInterval >= 0.5);
});
