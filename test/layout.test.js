import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildLayout } from '../src/logic/layout.js';
import { YARD, FURNACE, PLAYER, SEED } from '../src/config.js';

const L = buildLayout(SEED);
const WALK = YARD.width / 2 - (PLAYER.radius + 0.5);
const d = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const interior = ['rocks', 'bushes', 'flowers', 'grass', 'plants'];
const decor = interior.flatMap((k) => L[k]);
const fixed = [...L.lanterns, ...L.obelisks];

test('같은 시드는 같은 배치, 다른 시드는 다른 배치', () => {
  assert.deepEqual(buildLayout(1), buildLayout(1));
  assert.notDeepEqual(buildLayout(1), buildLayout(2));
});

test('모든 나무 밑동은 걸을 수 있는 영역 밖', () => {
  for (const t of L.trees) assert.ok(Math.max(Math.abs(t.x), Math.abs(t.z)) > WALK, JSON.stringify(t));
});

test('안쪽 고리 나무와 바깥 띠 나무 범위', () => {
  const m = L.trees.map((t) => Math.max(Math.abs(t.x), Math.abs(t.z)));
  assert.ok(m.filter((v) => v >= 11.8 && v <= 13.5).length >= 40);
  assert.ok(m.every((v) => v >= 11.8 && v <= 22));
});

test('내부 장식은 걸을 수 있는 영역 안', () => {
  for (const o of decor) assert.ok(Math.abs(o.x) <= WALK && Math.abs(o.z) <= WALK);
});

test('내부 장식은 금지 구역 밖', () => {
  for (const o of decor) {
    assert.ok(d(o, FURNACE) >= 3.2, 'furnace');
    assert.ok(d(o, L.pond) >= L.pond.radius + 0.8, 'pond');
    assert.ok(!(Math.abs(o.x) < 1.8 && o.z >= -2.5 && o.z <= 11.6), 'path');
    assert.ok(d(o, { x: 0, z: 4 }) >= 2.6, 'spawn');
    for (const f of fixed) assert.ok(d(o, f) >= 1.5, 'lantern/obelisk');
  }
});

test('스폰 지점은 어떤 장애물과도 겹치지 않는다', () => {
  for (const o of L.obstacles) assert.ok(d(o, { x: 0, z: 4 }) >= o.radius + PLAYER.radius, JSON.stringify(o));
});

test('장애물은 마당 + 2 안에 있고 값이 유효', () => {
  for (const o of L.obstacles) {
    assert.ok(Number.isFinite(o.x) && Number.isFinite(o.z) && o.radius > 0);
    assert.ok(Math.abs(o.x) <= YARD.width / 2 + 2 && Math.abs(o.z) <= YARD.depth / 2 + 2);
  }
});

test('개수', () => {
  assert.ok(L.trees.length >= 80 && L.trees.length <= 100);
  assert.equal(L.lanterns.length, 6);
  assert.equal(L.obelisks.length, 2);
  assert.ok(L.pathTiles.length >= 10);
  assert.equal(L.pondLilies.length, 8);
  assert.equal(L.pondRocks.length, 10);
  assert.equal(L.furnaceItems.length, 4);
  assert.equal(L.rocks.length, 10);
  // 장애물: 랜턴 6 + 오벨리스크 2 + 연못 1 + 연못 바위 10 + 바위 10
  assert.equal(L.obstacles.length, 29);
});

test('연못과 소각로 배치', () => {
  assert.deepEqual(L.pond, { x: 7.5, z: -1.5, radius: 3.2 });
  for (const l of L.pondLilies) assert.ok(d(l, L.pond) <= L.pond.radius * 0.8);
  for (const r of L.pondRocks) assert.ok(d(r, L.pond) >= 3.4 && d(r, L.pond) <= 3.9 + 1e-9);
  const [fire, ...rest] = L.furnaceItems;
  assert.equal(fire.name, 'campfire_stones');
  for (const it of rest) assert.ok(d(it, FURNACE) >= 1.6 - 1e-9 && d(it, FURNACE) <= 2.0 + 1e-9);
});

test('길 타일: x≈0, 간격 1.3, 지터 범위', () => {
  const t = L.pathTiles;
  assert.equal(t[0].name, 'path_stone');
  for (let i = 0; i < t.length; i++) {
    assert.ok(Math.abs(t[i].x) <= 0.12 && Math.abs(t[i].rotY) <= 0.12);
    assert.ok(Math.abs(t[i].z - (11.4 - i * 1.3)) < 1e-9);
    assert.ok(t[i].z >= -1.9 - 1e-9);
  }
});

test('모든 아이템은 pack,name,scale,rotY 를 가진다', () => {
  for (const k of Object.keys(L)) {
    if (!Array.isArray(L[k]) || k === 'obstacles') continue;
    for (const it of L[k]) {
      assert.ok(it.pack && it.name && it.scale > 0 && Number.isFinite(it.rotY), k);
    }
  }
});
