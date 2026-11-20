import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSay, validateSay, createSayLimiter } from '../src/logic/net.js';

const limits = { questions: 12, answers: 2, improvs: ['paperToss', 'reverse', 'dance', 'banzai', 'stamp', 'plane', 'shades', 'bow', 'song'] };
const ok = { k: 'say', id: 'peer00001', space: 'interview', ty: 'ans', q: 3, a: 1 };

test('buildSay: 답변은 번호만, 돌발행동은 id 만 담는다(자유 글 필드 없음)', () => {
  const self = { id: 'me0000001', nick: '나' };
  assert.deepEqual(buildSay(self, 'interview', { ty: 'ans', q: 4, a: 1, text: '보내면 안 되는 글' }), { k: 'say', id: 'me0000001', space: 'interview', ty: 'ans', q: 4, a: 1 });
  assert.deepEqual(buildSay(self, 'interview', { ty: 'imp', imp: 'dance', text: 'x' }), { k: 'say', id: 'me0000001', space: 'interview', ty: 'imp', imp: 'dance' });
});

test('validateSay: 정상 메시지는 필요한 필드만 복사한다(모르는 필드·글은 버린다)', () => {
  assert.deepEqual(validateSay(ok, limits), { id: 'peer00001', space: 'interview', ty: 'ans', q: 3, a: 1 });
  assert.deepEqual(validateSay({ ...ok, text: '<script>', nick: 'x', extra: 1 }, limits), { id: 'peer00001', space: 'interview', ty: 'ans', q: 3, a: 1 });
  assert.deepEqual(validateSay({ k: 'say', id: 'peer00001', space: 'interview', ty: 'imp', imp: 'banzai', text: 'x' }, limits), { id: 'peer00001', space: 'interview', ty: 'imp', imp: 'banzai' });
});

test('validateSay: 범위 밖·정수 아님·목록에 없음·형식 오류는 null', () => {
  const bad = [
    null, undefined, 3, 'x', [], {}, { ...ok, k: 'state' }, { ...ok, k: undefined },
    { ...ok, id: 'a' }, { ...ok, id: 'bad id!!' }, { ...ok, id: 5 }, { ...ok, space: 'nowhere' }, { ...ok, space: 3 },
    { ...ok, q: -1 }, { ...ok, q: 12 }, { ...ok, q: 1.5 }, { ...ok, q: '3' }, { ...ok, q: NaN }, { ...ok, q: Infinity }, { ...ok, q: undefined },
    { ...ok, a: -1 }, { ...ok, a: 2 }, { ...ok, a: 3 }, { ...ok, a: 4 }, { ...ok, a: 0.1 }, { ...ok, a: null }, // a=2: 옛 클라이언트의 속마음형
    { ...ok, ty: 'other' }, { ...ok, ty: undefined },
    { k: 'say', id: 'peer00001', space: 'interview', ty: 'imp', imp: 'nope' }, { k: 'say', id: 'peer00001', space: 'interview', ty: 'imp', imp: 3 },
    { k: 'say', id: 'peer00001', space: 'interview', ty: 'imp', imp: '__proto__' }, { k: 'say', id: 'peer00001', space: 'interview', ty: 'imp' },
  ];
  for (const raw of bad) assert.equal(validateSay(raw, limits), null, JSON.stringify(raw));
  assert.equal(validateSay(ok, null), null, 'limits 가 없으면 받지 않는다');
  assert.equal(validateSay({ k: 'say', id: 'peer00001', space: 'interview', ty: 'imp', imp: 'dance' }, { questions: 12, answers: 2 }), null, '허용 목록이 없으면 받지 않는다');
});

test('createSayLimiter: 같은 보낸 사람은 간격 안이면 막고, 다른 사람은 따로 센다', () => {
  const lim = createSayLimiter(1500);
  assert.equal(lim.allow('a', 0), true);
  assert.equal(lim.allow('a', 1499), false);
  assert.equal(lim.allow('b', 1499), true);
  assert.equal(lim.allow('a', 1500), true, '경계 포함');
  assert.equal(lim.allow('a', 2000), false, '통과한 시각부터 다시 센다');
  lim.clear();
  assert.equal(lim.allow('a', 2001), true);
});

test('createSayLimiter: 막힌 시도는 간격을 늘리지 않는다(계속 보내도 간격 뒤에 한 번은 통과)', () => {
  const lim = createSayLimiter(1000);
  assert.equal(lim.allow('a', 0), true);
  for (let t = 100; t < 1000; t += 100) assert.equal(lim.allow('a', t), false);
  assert.equal(lim.allow('a', 1000), true);
});

test('validateSay: 답변은 0~1 만 받고(2유형), 옛 클라이언트의 속마음형(a=2)·4번째 답변(a=3)·thought 필드와 지운 돌발행동 id(heart)는 오류 없이 버린다', () => {
  assert.deepEqual(validateSay({ k: 'say', id: 'peer00001', space: 'interview', ty: 'ans', q: 11, a: 1 }, limits), { id: 'peer00001', space: 'interview', ty: 'ans', q: 11, a: 1 });
  for (const a of [2, 3]) {
    assert.doesNotThrow(() => validateSay({ k: 'say', id: 'peer00001', space: 'interview', ty: 'ans', q: 0, a }, limits));
    assert.equal(validateSay({ k: 'say', id: 'peer00001', space: 'interview', ty: 'ans', q: 0, a }, limits), null, `a=${a}`);
  }
  assert.deepEqual(validateSay({ k: 'say', id: 'peer00001', space: 'interview', ty: 'ans', q: 0, a: 0, thought: '(옛 속마음)', inner: '(옛 속마음)' }, limits), { id: 'peer00001', space: 'interview', ty: 'ans', q: 0, a: 0 }, 'thought·inner 는 복사하지 않는다');
  assert.equal(validateSay({ k: 'say', id: 'peer00001', space: 'interview', ty: 'imp', imp: 'heart' }, limits), null);
  for (const imp of ['stamp', 'plane', 'shades', 'bow', 'song']) assert.deepEqual(validateSay({ k: 'say', id: 'peer00001', space: 'interview', ty: 'imp', imp }, limits), { id: 'peer00001', space: 'interview', ty: 'imp', imp });
});
