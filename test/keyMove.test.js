import { test } from 'node:test';
import assert from 'node:assert/strict';
import { keyDirection, shouldIgnoreKey, createKeyState, isMoveKey, isArrowKey } from '../src/logic/keyMove.js';
import { orbitPosition } from '../src/logic/orbit.js';

const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} !~ ${b}`);
const AZ = [0, 30, 90, 135, 180, 225, 270, 333];

test('W 는 카메라에서 멀어지는 쪽, S 는 가까워지는 쪽 (여러 방위각)', () => {
  for (const az of AZ) {
    const cam = orbitPosition([0, 0, 0], { azimuthDeg: az, polarDeg: 60, distance: 10 });
    const w = keyDirection(new Set(['KeyW']), az);
    const s = keyDirection(new Set(['KeyS']), az);
    const dist = (d) => Math.hypot(cam[0] - d.x, cam[2] - d.z);
    const here = Math.hypot(cam[0], cam[2]);
    assert.ok(dist(w) > here, `az ${az}: W 는 멀어져야 한다`);
    assert.ok(dist(s) < here, `az ${az}: S 는 가까워져야 한다`);
    near(w.x, -s.x); near(w.z, -s.z);
  }
});

test('D 는 화면 오른쪽: 카메라가 (0,0,+z)에서 볼 때 +x', () => {
  const d = keyDirection(new Set(['KeyD']), 0);
  near(d.x, 1); near(d.z, 0);
  const a = keyDirection(new Set(['ArrowLeft']), 0);
  near(a.x, -1);
  // 방위각 90: 카메라가 +x 쪽, 화면 오른쪽은 -z
  const d90 = keyDirection(new Set(['KeyD']), 90);
  near(d90.x, 0); near(d90.z, -1);
});

test('방향키와 WASD 는 같다, 둘을 같이 눌러도 한 번으로 센다', () => {
  for (const [a, b] of [['KeyW', 'ArrowUp'], ['KeyS', 'ArrowDown'], ['KeyA', 'ArrowLeft'], ['KeyD', 'ArrowRight']]) {
    assert.deepEqual(keyDirection(new Set([a]), 77), keyDirection(new Set([b]), 77));
    assert.deepEqual(keyDirection(new Set([a, b]), 77), keyDirection(new Set([a]), 77));
  }
});

test('반대 키는 상쇄되고 아무 키도 없으면 null', () => {
  assert.equal(keyDirection(new Set(), 0), null);
  assert.equal(keyDirection(new Set(['KeyW', 'KeyS']), 10), null);
  assert.equal(keyDirection(new Set(['KeyA', 'ArrowRight']), 10), null);
  const d = keyDirection(new Set(['KeyW', 'KeyS', 'KeyD']), 0);
  near(d.x, 1); near(d.z, 0);
});

test('대각선도 길이 1(단일 축과 같은 속도)', () => {
  for (const az of AZ) {
    for (const keys of [['KeyW'], ['KeyW', 'KeyD'], ['KeyS', 'KeyA'], ['ArrowUp', 'ArrowLeft']]) {
      const d = keyDirection(new Set(keys), az);
      near(Math.hypot(d.x, d.z), 1);
    }
  }
});

test('이동 키가 아닌 코드는 무시한다', () => {
  assert.equal(keyDirection(new Set(['KeyE', 'Digit1', 'KeyM']), 0), null);
  assert.ok(isMoveKey('KeyA') && isMoveKey('ArrowDown') && !isMoveKey('KeyE') && !isMoveKey('KeyR'));
  assert.ok(isArrowKey('ArrowUp') && !isArrowKey('KeyW'));
});

test('shouldIgnoreKey: 수정키·입력칸', () => {
  assert.equal(shouldIgnoreKey({}, null), false);
  assert.equal(shouldIgnoreKey({ ctrlKey: true }, null), true);
  assert.equal(shouldIgnoreKey({ altKey: true }, null), true);
  assert.equal(shouldIgnoreKey({ metaKey: true }, null), true);
  assert.equal(shouldIgnoreKey({}, { tagName: 'INPUT' }), true);
  assert.equal(shouldIgnoreKey({}, { tagName: 'TEXTAREA' }), true);
  assert.equal(shouldIgnoreKey({}, { tagName: 'SELECT' }), true);
  assert.equal(shouldIgnoreKey({}, { tagName: 'DIV', isContentEditable: true }), true);
  assert.equal(shouldIgnoreKey({}, { tagName: 'CANVAS' }), false);
  assert.equal(shouldIgnoreKey({}, { tagName: 'BUTTON' }), false);
});

test('createKeyState: 누름·뗌·비우기', () => {
  const k = createKeyState();
  assert.equal(k.any(), false);
  assert.equal(k.down('KeyE'), false);
  assert.equal(k.down('KeyW'), true);
  k.down('KeyD');
  assert.equal(k.any(), true);
  assert.ok(k.direction(0));
  assert.equal(k.up('KeyW'), true);
  assert.equal(k.up('KeyW'), false);
  k.clear();
  assert.equal(k.any(), false);
  assert.equal(k.direction(0), null);
});
