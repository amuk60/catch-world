import test from 'node:test';
import assert from 'node:assert/strict';
import { LAUNDRY_ITEMS, LAUNDRY_HANG, LAUNDRY_FX, LAUNDRY_GUIDE } from '../src/config.js';
import {
  validateLaundryItems, washLine, hangLine, pickRandomStain, pickIndexFromCode, stainName, ICON_KINDS,
} from '../src/logic/laundryItems.js';
import { MAX_LINE_LENGTH } from '../src/logic/incinerator.js';
import { washEvents, washPercent, washDisplay, displayAlpha, hangEvents, dryTwinkle } from '../src/logic/laundry.js';
import { laundryGuide } from '../src/logic/outfit.js';
import { nextMode } from '../src/logic/playerMode.js';

test('LAUNDRY_ITEMS: 5종, 표 검사에 문제가 없다(id 유일, 3~4멘트, 32자 이하, 표시 글·마무리 멘트·그림)', () => {
  assert.equal(LAUNDRY_ITEMS.length, 5);
  assert.deepEqual(validateLaundryItems(), []);
  assert.equal(new Set(LAUNDRY_ITEMS.map((i) => i.id)).size, 5);
  for (const item of LAUNDRY_ITEMS) {
    assert.ok(item.lines.length >= 3 && item.lines.length <= 4, item.id);
    for (const l of [...item.lines, item.done]) assert.ok([...l].length <= MAX_LINE_LENGTH, l);
    assert.ok(item.display && item.label && ICON_KINDS.includes(item.icon.kind));
  }
  assert.deepEqual(LAUNDRY_ITEMS.map((i) => i.label), ['월요일 냄새', '야근 찌든 때', '면접 긴장 얼룩', '자소서 잉크 얼룩', '새벽 감성 먼지']);
});

test('validateLaundryItems: 잘못된 표를 잡아낸다', () => {
  const ok = LAUNDRY_ITEMS[0];
  assert.ok(validateLaundryItems([ok, { ...ok }]).some((p) => p.includes('겹친다')));
  assert.ok(validateLaundryItems([{ ...ok, id: '' }]).some((p) => p.includes('id')));
  assert.ok(validateLaundryItems([{ ...ok, display: '' }]).some((p) => p.includes('display')));
  assert.ok(validateLaundryItems([{ ...ok, lines: ['하나'] }]).some((p) => p.includes('3~4')));
  assert.ok(validateLaundryItems([{ ...ok, lines: ['가'.repeat(40), 'b', 'c'] }]).some((p) => p.includes('넘는다')));
  assert.ok(validateLaundryItems([{ ...ok, done: '' }]).some((p) => p.includes('빈 멘트')));
  assert.ok(validateLaundryItems([{ ...ok, icon: { kind: '?' } }]).some((p) => p.includes('icon')));
  assert.ok(validateLaundryItems([ok], { lines: ['a'] }).some((p) => p.includes('hang')));
});

test('널기 멘트 3~4개, 모두 32자 이하', () => {
  assert.ok(LAUNDRY_HANG.lines.length >= 3 && LAUNDRY_HANG.lines.length <= 4);
  for (const l of LAUNDRY_HANG.lines) assert.ok([...l].length <= MAX_LINE_LENGTH);
});

test('washLine/hangLine: rng 로 한 줄 고르고 범위를 넘지 않는다', () => {
  const item = LAUNDRY_ITEMS[0];
  assert.equal(washLine(item, () => 0), item.lines[0]);
  assert.equal(washLine(item, () => 0.999999), item.lines[item.lines.length - 1]);
  assert.equal(washLine(item, () => 1), item.lines[item.lines.length - 1]);
  assert.equal(washLine(null), '');
  assert.equal(hangLine(() => 0), LAUNDRY_HANG.lines[0]);
  assert.ok(LAUNDRY_HANG.lines.includes(hangLine()));
});

test('pickRandomStain: 직전과 같은 빨 것을 연달아 고르지 않고 모든 종류가 나온다', () => {
  let last = null;
  const seen = new Set();
  let rng = 0.123;
  const next = () => (rng = (rng * 9301 + 0.49297) % 1);
  for (let n = 0; n < 200; n++) {
    const item = pickRandomStain(next, { lastId: last });
    assert.notEqual(item.id, last);
    seen.add(item.id);
    last = item.id;
  }
  assert.equal(seen.size, 5);
  assert.equal(pickRandomStain(() => 0, { items: [LAUNDRY_ITEMS[2]], lastId: LAUNDRY_ITEMS[2].id }).id, LAUNDRY_ITEMS[2].id);
  assert.equal(pickRandomStain(() => 0, { items: [] }), null);
});

test('선택 창 숫자 키: 1~5 는 0~4, 목록 밖·다른 키는 -1(소각장 선택 창과 같은 매핑)', () => {
  const n = LAUNDRY_ITEMS.length;
  assert.deepEqual(['Digit1', 'Digit5', 'Numpad3'].map((c) => pickIndexFromCode(c, n)), [0, 4, 2]);
  assert.equal(pickIndexFromCode('Digit6', n), -1);
  assert.equal(pickIndexFromCode('KeyA', n), -1);
});

test('선택 창 모드 전환: free -> item-choice(1 누름) -> 고르면 free(행동 시작) / 취소하면 free', () => {
  assert.equal(nextMode('free', 'pick:open'), 'item-choice');
  assert.equal(nextMode('item-choice', 'pick:choose'), 'free');
  assert.equal(nextMode('item-choice', 'pick:cancel'), 'free');
  assert.equal(nextMode('item-choice', 'interact:seat'), 'item-choice', '열려 있는 동안 다른 전환은 잠긴다');
});

test('laundryGuide: 고른 빨 것 이름이 세탁 중 안내에 들어가고, 없으면 기본 문구', () => {
  assert.equal(laundryGuide('tank', { washing: true, stain: LAUNDRY_ITEMS[0] }), '월요일 냄새 세탁 중… 다 빨리면 빨랫줄에 널어요');
  assert.equal(laundryGuide('tank', { washing: true }), LAUNDRY_GUIDE.washing);
  assert.equal(laundryGuide('tank', { washing: false, stain: LAUNDRY_ITEMS[0] }), LAUNDRY_GUIDE.tank);
  assert.equal(laundryGuide('clean', { stain: LAUNDRY_ITEMS[0] }), null);
  assert.equal(laundryGuide('tank', { washing: true, spaceId: 'yard', stain: LAUNDRY_ITEMS[0] }), null);
  assert.equal(stainName(LAUNDRY_ITEMS[1]), '야근 찌든 때');
  assert.equal(stainName(null), null);
});

test('washEvents: 시간순, 시간표 안, 향기 폭죽(burst·ring)은 burstAt 에 한 번, 방울·반짝이는 그 전에만', () => {
  const ev = washEvents();
  for (let i = 1; i < ev.length; i++) assert.ok(ev[i].t >= ev[i - 1].t);
  for (const e of ev) assert.ok(e.t >= 0 && e.t < LAUNDRY_FX.seconds, `${e.type} ${e.t}`);
  assert.equal(ev.filter((e) => e.type === 'burst').length, 1);
  assert.equal(ev.find((e) => e.type === 'burst').t, LAUNDRY_FX.burstAt);
  assert.equal(ev.filter((e) => e.type === 'ring').length, 1);
  assert.deepEqual(ev.slice(0, 2).map((e) => e.type).sort(), ['dust', 'splash']);
  for (const e of ev.filter((x) => x.type === 'bubble' || x.type === 'sparkle')) assert.ok(e.t < LAUNDRY_FX.burstAt);
  assert.ok(ev.filter((e) => e.type === 'bubble').length >= 8);
  assert.ok(ev.filter((e) => e.type === 'sparkle').length >= 5);
  assert.ok(ev.find((e) => e.type === 'floaters').t > LAUNDRY_FX.burstAt);
});

test('washPercent: 0 에서 시작해 단조 증가, burstAt 에 100(그 전에는 99 이하)', () => {
  assert.equal(washPercent(0), 0);
  assert.equal(washPercent(-1), 0);
  let prev = 0;
  for (let t = 0; t < LAUNDRY_FX.burstAt; t += 0.05) {
    const p = washPercent(t);
    assert.ok(p >= prev && p <= 99, `${t}: ${p}`);
    prev = p;
  }
  assert.equal(washPercent(LAUNDRY_FX.burstAt), 100);
  assert.equal(washPercent(99), 100);
});

test('washDisplay: 표시 글 + 점 1~3개가 돌고, 끝나면 "세탁 완료!"', () => {
  const dots = new Set();
  for (let t = 0; t < 1; t += 0.1) {
    const d = washDisplay('월요일 냄새 세탁 중', t);
    assert.match(d.text, /^월요일 냄새 세탁 중\.{1,3}$/);
    dots.add(d.text.length);
    assert.equal(d.done, false);
  }
  assert.equal(dots.size, 3);
  assert.deepEqual(washDisplay('x', LAUNDRY_FX.burstAt), { text: '세탁 완료!', percent: 100, done: true });
});

test('displayAlpha: 켜지고(0.25초) 꺼진다(끝 0.5초 전부터), 시간 밖은 0', () => {
  assert.equal(displayAlpha(-0.1), 0);
  assert.equal(displayAlpha(0), 0);
  assert.equal(displayAlpha(0.125), 0.5);
  assert.equal(displayAlpha(1.5), 1);
  assert.ok(displayAlpha(LAUNDRY_FX.seconds - 0.25) > 0 && displayAlpha(LAUNDRY_FX.seconds - 0.25) < 1);
  assert.equal(displayAlpha(LAUNDRY_FX.seconds), 0);
  assert.ok(displayAlpha(LAUNDRY_FX.burstAt + 0.05) > 0.9, '"완료!" 글이 잠깐 또렷하게 보인다');
});

test('hangEvents: 물방울이 먼저 떨어지고 hangTwinkleAt 에 반짝임이 한 번', () => {
  const ev = hangEvents();
  for (let i = 1; i < ev.length; i++) assert.ok(ev[i].t >= ev[i - 1].t);
  assert.ok(ev.filter((e) => e.type === 'drip').length >= 5);
  assert.equal(ev.filter((e) => e.type === 'twinkle').length, 1);
  assert.equal(ev.find((e) => e.type === 'twinkle').t, LAUNDRY_FX.hangTwinkleAt);
  for (const e of ev) assert.ok(e.t >= 0 && e.t <= LAUNDRY_FX.hangSeconds);
});

test('dryTwinkle: 주기마다 번쩍(0~1), 쉬는 동안 0, 음수 시간은 0', () => {
  assert.equal(dryTwinkle(0), 0);
  assert.ok(Math.abs(dryTwinkle(LAUNDRY_FX.dryPulse / 2) - 1) < 1e-9);
  assert.equal(dryTwinkle(LAUNDRY_FX.dryPulse + 0.1), 0);
  assert.equal(dryTwinkle(-1), 0);
  assert.ok(Math.abs(dryTwinkle(LAUNDRY_FX.dryPeriod + LAUNDRY_FX.dryPulse / 2) - 1) < 1e-9, '되풀이');
  for (let t = 0; t < 10; t += 0.07) { const v = dryTwinkle(t); assert.ok(v >= 0 && v <= 1); }
});
