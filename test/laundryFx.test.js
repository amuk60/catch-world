import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PASTELS, nearestIndex, hangSlot, shirtColor, slotPoint, wobbleAmount, WOBBLE_SECONDS, foamBubble, FOAM_COUNT, FOAM_SECONDS, swingAngle, SWING_SECONDS,
} from '../src/logic/laundry.js';
import { buildLayout } from '../src/logic/layout.js';
import { SEED } from '../src/config.js';

const line = buildLayout(SEED).clothesline;

test('hangSlot: 칸을 차례로 쓰고 가득 차면 가장 오래된 칸(0)부터 바꾼다', () => {
  assert.deepEqual([0, 1, 2, 3, 4, 5, 6, 7, 11, 12].map((n) => hangSlot(n, 6)), [0, 1, 2, 3, 4, 5, 0, 1, 5, 0]);
  assert.equal(hangSlot(-1, 6), 5); // 방어
});

test('shirtColor: 행동 횟수에서 정해지는 파스텔, 같은 횟수는 같은 색, 6가지를 돌려 쓴다', () => {
  assert.equal(PASTELS.length, 6);
  assert.equal(new Set(PASTELS).size, 6);
  for (let n = 0; n < 12; n++) {
    assert.equal(shirtColor(n), shirtColor(n));
    assert.equal(shirtColor(n), PASTELS[n % 6]);
  }
  // 파스텔: 모든 채널이 밝다.
  for (const c of PASTELS) for (const shift of [16, 8, 0]) assert.ok(((c >> shift) & 255) >= 0xa0);
});

test('slotPoint: 6칸이 두 기둥 사이를 고르게 나누고 줄 높이에 있다', () => {
  const pts = Array.from({ length: line.slots }, (_, i) => slotPoint(line, i));
  assert.equal(pts.length, 6);
  for (const p of pts) {
    assert.equal(p.y, line.y);
    assert.ok(p.z > Math.min(line.z1, line.z2) && p.z < Math.max(line.z1, line.z2));
  }
  const gaps = pts.slice(1).map((p, i) => Math.hypot(p.x - pts[i].x, p.z - pts[i].z));
  for (const g of gaps) assert.ok(Math.abs(g - gaps[0]) < 1e-9);
  assert.ok(gaps[0] >= 0.5, `칸 간격 ${gaps[0]}`); // 0.5 폭의 셔츠가 겹치지 않는다
  // 줄의 가운데는 3번째와 4번째 칸 사이.
  assert.ok(Math.abs((pts[2].z + pts[3].z) / 2 - line.centre.z) < 1e-9);
});

test('wobbleAmount: 0 에서 시작해 흔들리다 줄어들어 ~1.2초 뒤 0, 범위 -1~1', () => {
  assert.equal(WOBBLE_SECONDS, 1.2);
  assert.equal(wobbleAmount(0), 0);
  assert.equal(wobbleAmount(-1), 0);
  assert.equal(wobbleAmount(1.2), 0);
  assert.equal(wobbleAmount(5), 0);
  assert.equal(wobbleAmount(Number.NaN), 0);
  let peakEarly = 0;
  let peakLate = 0;
  for (let t = 0; t < 1.2; t += 0.005) {
    const a = Math.abs(wobbleAmount(t));
    assert.ok(a <= 1);
    if (t < 0.3) peakEarly = Math.max(peakEarly, a);
    if (t > 0.8) peakLate = Math.max(peakLate, a);
  }
  assert.ok(peakEarly > 0.3, `early ${peakEarly}`); // 눈에 띄게 흔들리고
  assert.ok(peakLate < peakEarly / 3, `late ${peakLate}`); // 점점 줄어든다
  // 부호가 바뀐다(좌우로 흔들린다).
  const signs = new Set();
  for (let t = 0.01; t < 0.5; t += 0.01) signs.add(Math.sign(wobbleAmount(t)));
  assert.ok(signs.has(1) && signs.has(-1));
});

test('foamBubble: 최대 10개, 약 0.8초 동안 올라가며 투명해지고 그 뒤로는 보이지 않는다', () => {
  assert.equal(FOAM_COUNT, 10);
  assert.equal(FOAM_SECONDS, 0.8);
  for (let i = 0; i < FOAM_COUNT; i++) {
    assert.equal(foamBubble(i, -0.1).visible, false);
    assert.equal(foamBubble(i, FOAM_SECONDS + 0.01).visible, false);
    assert.equal(foamBubble(i, 5).visible, false);
    let lastY = -1;
    let seen = 0;
    for (let t = 0; t < FOAM_SECONDS; t += 0.01) {
      const b = foamBubble(i, t);
      if (!b.visible) continue;
      seen++;
      assert.ok(b.y >= lastY - 1e-12, `rise ${i}`);
      lastY = b.y;
      assert.ok(b.opacity >= 0 && b.opacity <= 1 && b.scale > 0 && b.scale < 0.25, `${i} ${JSON.stringify(b)}`);
    }
    assert.ok(seen > 30, `bubble ${i} visible ${seen}`);
  }
  // 공마다 위치가 다르다.
  const xs = new Set(Array.from({ length: FOAM_COUNT }, (_, i) => foamBubble(i, 0.3).x.toFixed(3)));
  assert.ok(xs.size >= 8);
  // 결정적이다.
  assert.deepEqual(foamBubble(3, 0.4), foamBubble(3, 0.4));
});

test('swingAngle: 널기 뒤 ~1초 동안 흔들리다 줄어들고 0 으로 끝난다', () => {
  assert.equal(SWING_SECONDS, 1.0);
  assert.equal(swingAngle(0), 0);
  assert.equal(swingAngle(1.0), 0);
  assert.equal(swingAngle(3), 0);
  let early = 0;
  let late = 0;
  for (let t = 0; t < 1; t += 0.005) {
    const a = Math.abs(swingAngle(t));
    assert.ok(a <= 0.4);
    if (t < 0.3) early = Math.max(early, a);
    if (t > 0.7) late = Math.max(late, a);
  }
  assert.ok(early > 0.1 && late < early / 2, `${early} ${late}`);
});

test('nearestIndex: 가장 가까운 항목의 번호, 같으면 앞쪽, 빈 목록은 -1', () => {
  const items = [{ x: 0, z: 0 }, { x: 4, z: 0 }, { x: 8, z: 0 }];
  assert.equal(nearestIndex({ x: 1, z: 1 }, items), 0);
  assert.equal(nearestIndex({ x: 5, z: 0 }, items), 1);
  assert.equal(nearestIndex({ x: 7, z: 3 }, items), 2);
  assert.equal(nearestIndex({ x: 2, z: 0 }, items), 0); // 거리가 같으면 앞쪽
  assert.equal(nearestIndex({ x: 0, z: 0 }, []), -1);
  const w = buildLayout(SEED).washers;
  assert.equal(nearestIndex({ x: w[2].x - 1, z: w[2].z }, w), 2);
});
