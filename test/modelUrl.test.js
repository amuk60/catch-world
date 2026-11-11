import { test } from 'node:test';
import assert from 'node:assert/strict';
import { modelUrl } from '../src/logic/modelUrl.js';

test('nature 팩 URL은 공백이 %20으로 인코딩된다', () => {
  assert.equal(modelUrl('nature', 'tree_oak_fall'),
    'assets/models/kenney_nature-kit/Models/GLTF%20format/tree_oak_fall.glb');
});
test('fantasy 팩 URL', () => {
  assert.equal(modelUrl('fantasy', 'lantern'),
    'assets/models/kenney_fantasy-town-kit_2.0/Models/GLB%20format/lantern.glb');
});
test('characters 팩 URL', () => {
  assert.equal(modelUrl('characters', 'character-male-a'),
    'assets/models/kenney-mini-characters/Models/GLB%20format/character-male-a.glb');
});
test('알 수 없는 팩은 오류', () => {
  assert.throws(() => modelUrl('scifi', 'x'), /scifi/);
});
test('furniture 팩 URL', () => {
  assert.equal(modelUrl('furniture', 'bench'),
    'assets/models/kenney_furniture-kit/Models/GLTF%20format/bench.glb');
});
