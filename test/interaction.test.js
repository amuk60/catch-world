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
  assert.deepEqual(actionOf({ kind: 'furnace' }), { type: 'burn', prompt: '소각 시작' });
  assert.deepEqual(actionOf({ kind: 'comfort' }), { type: 'comfort', prompt: '살펴보기' });
  assert.deepEqual(actionOf({ kind: 'fortune' }), { type: 'fortune', prompt: '포춘쿠키 열기' });
  assert.deepEqual(actionOf({ kind: 'seat' }), { type: 'seat', prompt: '앉기' });
});

test('actionOf: 모르는 종류는 오류', () => {
  assert.throws(() => actionOf({ kind: 'door' }), /door/);
  assert.throws(() => actionOf({}), /undefined/);
});
