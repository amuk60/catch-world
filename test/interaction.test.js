import test from 'node:test';
import assert from 'node:assert/strict';
import { interactTarget, inRange, hoverLabel, nearestInRange, actionOf } from '../src/logic/interaction.js';

const stump = { id: 'comfort-0', label: '쉬어가는 그루터기', kind: 'comfort', x: 2, z: 3, radius: 0.5, interactRange: 1.7 };
const furnace = { id: 'furnace', label: '소각로', kind: 'furnace', x: -6, z: 0, radius: 1.6, interactRange: 2.8 };

test('interactTarget 은 오브젝트 중심의 x/z 를 돌려준다', () => {
  assert.deepEqual(interactTarget(stump), { x: 2, z: 3 });
});

test('inRange: 범위 안은 true, 밖은 false, 경계(=)는 true', () => {
  assert.equal(inRange({ x: 2, z: 4 }, stump), true);
  const edge = { ...stump, interactRange: 5 }; // 3-4-5 삼각형으로 부동소수 오차 없이 경계를 만든다.
  assert.equal(inRange({ x: 2 + 3, z: 3 + 4 }, edge), true);
  assert.equal(inRange({ x: 2 + 3, z: 3 + 4.01 }, edge), false);
});

test('inRange 는 x-z 평면 거리만 본다(y 무시)', () => {
  assert.equal(inRange({ x: 2, y: 50, z: 4 }, stump), true);
});

test('hoverLabel 은 label 을 돌려준다', () => {
  assert.equal(hoverLabel(stump), '쉬어가는 그루터기');
});

test('resolveArrival 은 없어졌다(도착 자동 실행 제거)', async () => {
  const mod = await import('../src/logic/interaction.js');
  assert.equal(mod.resolveArrival, undefined);
});

test('nearestInRange: 범위 안에서 가장 가까운 대상', () => {
  const a = { id: 'a', x: 0, z: 0, interactRange: 3 };
  const b = { id: 'b', x: 2, z: 0, interactRange: 3 };
  assert.equal(nearestInRange({ x: 1.5, z: 0 }, [a, b]), b);
  assert.equal(nearestInRange({ x: 0.5, z: 0 }, [a, b]), a);
});

test('nearestInRange: 범위 밖뿐이면 null, 빈 목록도 null', () => {
  const a = { id: 'a', x: 0, z: 0, interactRange: 1 };
  assert.equal(nearestInRange({ x: 5, z: 5 }, [a]), null);
  assert.equal(nearestInRange({ x: 0, z: 0 }, []), null);
});

test('nearestInRange: 더 가깝지만 범위 밖인 대상은 건너뛴다', () => {
  const near = { id: 'near', x: 1, z: 0, interactRange: 0.5 }; // 거리 1 > 0.5
  const far = { id: 'far', x: 3, z: 0, interactRange: 5 }; // 거리 3 <= 5
  assert.equal(nearestInRange({ x: 0, z: 0 }, [near, far]), far);
});

test('nearestInRange: 거리가 같으면 먼저 나온 대상, y 는 무시', () => {
  const a = { id: 'a', x: -1, z: 0, interactRange: 3 };
  const b = { id: 'b', x: 1, z: 0, interactRange: 3 };
  assert.equal(nearestInRange({ x: 0, y: 9, z: 0 }, [a, b]), a);
  assert.equal(nearestInRange({ x: 0, z: 0 }, [b, a]), b);
});

test('actionOf: 종류별 동작과 안내 문구', () => {
  assert.equal(actionOf({ kind: 'furnace' }), null); // 소각로는 E 동작이 없다(행동 막대로 한다).
  assert.deepEqual(actionOf({ kind: 'comfort' }), { type: 'comfort', prompt: '살펴보기' });
  assert.deepEqual(actionOf({ kind: 'fortune' }), { type: 'fortune', prompt: '포춘쿠키 열기' });
  assert.deepEqual(actionOf({ kind: 'seat' }), { type: 'seat', prompt: '앉기' });
});

test('actionOf: 건물(세탁소)은 E 동작이 없다(소각로처럼 호버 안내와 장애물일 뿐)', () => {
  assert.equal(actionOf({ kind: 'building' }), null);
});

test('hoverLabel: 건물은 세탁소', () => {
  assert.equal(hoverLabel({ id: 'laundry', label: '세탁소', kind: 'building' }), '세탁소');
});

test('nearestInRange: 건물은 건너뛴다(E 안내가 뜨지 않는다)', () => {
  const building = { id: 'laundry', kind: 'building', x: 0, z: 0, interactRange: 3 };
  const stump3 = { id: 's', kind: 'comfort', x: 2, z: 0, interactRange: 3 };
  assert.equal(nearestInRange({ x: 0, z: 0 }, [building]), null);
  assert.equal(nearestInRange({ x: 0, z: 0 }, [building, stump3]), stump3);
});

test('actionOf: 모르는 종류는 오류', () => {
  assert.throws(() => actionOf({ kind: 'door' }), /door/);
  assert.throws(() => actionOf({}), /undefined/);
});

test('nearestInRange: E 동작이 없는 종류(소각로)는 건너뛴다', () => {
  const stump2 = { id: 's', kind: 'comfort', x: 3, z: 0, interactRange: 3 };
  const fur = { id: 'f', kind: 'furnace', x: 0, z: 0, interactRange: 3 };
  assert.equal(nearestInRange({ x: 0, z: 0 }, [fur, stump2]), stump2);
  assert.equal(nearestInRange({ x: 0, z: 0 }, [fur]), null);
});

test('옛 burn 동작 종류와 "소각 시작" 문구는 없다', () => {
  for (const kind of ['comfort', 'fortune', 'seat']) {
    const a = actionOf({ kind });
    assert.notEqual(a.type, 'burn');
    assert.ok(!a.prompt.includes('소각'));
  }
});

test('interactTarget: walkTo 가 있으면 그 지점(건물은 문 앞)으로 간다', () => {
  assert.deepEqual(interactTarget({ id: 'laundry', kind: 'building', x: 8.5, z: 5.5, walkTo: { x: 5.2, z: 3.7 } }), { x: 5.2, z: 3.7 });
  assert.deepEqual(interactTarget({ x: 2, z: 3, walkTo: undefined }), { x: 2, z: 3 });
});
