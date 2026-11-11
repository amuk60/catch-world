import test from 'node:test';
import assert from 'node:assert/strict';
import { findInteractable } from '../src/logic/interact.js';

const objects = [
  { id: 'furnace', x: 100, y: 100 },
  { id: 'comfort-0', x: 130, y: 100 },
];

test('반경 안에 아무것도 없으면 null', () => {
  assert.equal(findInteractable({ x: 500, y: 500 }, objects, 60), null);
});

test('반경 안의 오브젝트를 찾는다', () => {
  assert.equal(findInteractable({ x: 100, y: 140 }, objects, 60).id, 'furnace');
});

test('여러 개면 가장 가까운 것을 고른다', () => {
  assert.equal(findInteractable({ x: 125, y: 100 }, objects, 60).id, 'comfort-0');
});

test('반경 경계(<=)는 포함한다', () => {
  assert.equal(findInteractable({ x: 100, y: 160 }, objects, 60).id, 'furnace');
});
