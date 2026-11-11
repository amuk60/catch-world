import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clampOrbit, orbitPosition, applyDrag, applyZoom } from '../src/logic/orbit.js';

const L = { minPolarDeg: 25, maxPolarDeg: 75, minDistance: 5, maxDistance: 16 };
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} !~ ${b}`);

test('clampOrbit: polar 범위 제한', () => {
  assert.equal(clampOrbit({ azimuthDeg: 0, polarDeg: 10, distance: 9 }, L).polarDeg, 25);
  assert.equal(clampOrbit({ azimuthDeg: 0, polarDeg: 90, distance: 9 }, L).polarDeg, 75);
  assert.equal(clampOrbit({ azimuthDeg: 0, polarDeg: 60, distance: 9 }, L).polarDeg, 60);
});

test('clampOrbit: distance 범위 제한', () => {
  assert.equal(clampOrbit({ azimuthDeg: 0, polarDeg: 60, distance: 1 }, L).distance, 5);
  assert.equal(clampOrbit({ azimuthDeg: 0, polarDeg: 60, distance: 99 }, L).distance, 16);
});

test('clampOrbit: azimuth를 [0,360)으로 정규화', () => {
  const f = (a) => clampOrbit({ azimuthDeg: a, polarDeg: 60, distance: 9 }, L).azimuthDeg;
  assert.equal(f(-10), 350);
  assert.equal(f(370), 10);
  assert.equal(f(360), 0);
  assert.equal(f(45), 45);
});

test('clampOrbit: 입력을 변경하지 않고 새 객체를 반환한다', () => {
  const s = { azimuthDeg: -10, polarDeg: 10, distance: 1 };
  const r = clampOrbit(s, L);
  assert.notEqual(r, s);
  assert.deepEqual(s, { azimuthDeg: -10, polarDeg: 10, distance: 1 });
});

test('orbitPosition: polar=0이면 타깃 바로 위', () => {
  const [x, y, z] = orbitPosition([1, 2, 3], { azimuthDeg: 45, polarDeg: 0, distance: 10 });
  near(x, 1); near(y, 12); near(z, 3);
});

test('orbitPosition: azimuth=0, polar=90이면 타깃의 +z 쪽', () => {
  const [x, y, z] = orbitPosition([0, 1, 0], { azimuthDeg: 0, polarDeg: 90, distance: 7 });
  near(x, 0); near(y, 1); near(z, 7);
});

test('orbitPosition: azimuth=90, polar=90이면 +x 쪽', () => {
  const [x, , z] = orbitPosition([0, 0, 0], { azimuthDeg: 90, polarDeg: 90, distance: 4 });
  near(x, 4); near(z, 0);
});

test('applyDrag: azimuth - dx*k*57.29578, polar - dy*k*57.29578', () => {
  const s = { azimuthDeg: 100, polarDeg: 50, distance: 9 };
  const r = applyDrag(s, 10, 4, 0.005, { ...L });
  near(r.azimuthDeg, 100 - 10 * 0.005 * 57.29578);
  near(r.polarDeg, 50 - 4 * 0.005 * 57.29578);
  assert.equal(r.distance, 9);
});

test('applyDrag: polar를 제한하고 azimuth를 정규화한다', () => {
  const s = { azimuthDeg: 1, polarDeg: 30, distance: 9 };
  const r = applyDrag(s, 100, 1000, 0.005, L);
  assert.equal(r.polarDeg, 25);
  assert.ok(r.azimuthDeg >= 0 && r.azimuthDeg < 360);
  const r2 = applyDrag(s, 0, -1000, 0.005, L);
  assert.equal(r2.polarDeg, 75);
});

test('applyDrag: 입력 불변', () => {
  const s = { azimuthDeg: 1, polarDeg: 30, distance: 9 };
  applyDrag(s, 5, 5, 0.005, L);
  assert.deepEqual(s, { azimuthDeg: 1, polarDeg: 30, distance: 9 });
});

test('applyZoom: deltaY>0이면 멀어지고(/step) <0이면 가까워진다(*step)', () => {
  const s = { azimuthDeg: 0, polarDeg: 60, distance: 9 };
  near(applyZoom(s, 100, 0.9, L).distance, 9 / 0.9);
  near(applyZoom(s, -100, 0.9, L).distance, 9 * 0.9);
  assert.equal(applyZoom(s, 0, 0.9, L).distance, 9);
});

test('applyZoom: 제한과 불변', () => {
  const s = { azimuthDeg: 0, polarDeg: 60, distance: 15.5 };
  assert.equal(applyZoom(s, 1, 0.9, L).distance, 16);
  assert.equal(applyZoom({ ...s, distance: 5.2 }, -1, 0.9, L).distance, 5);
  assert.equal(s.distance, 15.5);
});
