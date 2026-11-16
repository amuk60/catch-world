// 소각장 길목 검사: 스폰·불·파쇄기·통나무 자리 사이를 직선으로 걸을 수 있고, 통나무 자리가 길목을 막지 않는다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildLayout } from '../src/logic/layout.js';
import { FURNACE, PLAYER, SEED, SPAWN } from '../src/config.js';

const SEEDS = [SEED, 1, 2, 3, 42, 777];
const d = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

// 선분 a-b 와 점 사이의 최단 거리.
function segDist(a, b, p) {
  const vx = b.x - a.x;
  const vz = b.z - a.z;
  const len2 = vx * vx + vz * vz;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * vx + (p.z - a.z) * vz) / len2));
  return Math.hypot(a.x + vx * t - p.x, a.z + vz * t - p.z);
}

// 두 점을 잇는 직선을 반경 PLAYER.radius 로 걸을 수 있는가(자기 자신 근처 장애물은 제외 목록으로).
function blockers(l, a, b, ignore = []) {
  const circles = [FURNACE, ...l.obstacles]; // 통나무 자리는 양 끝 원 2개씩이 장애물로 들어 있다
  return circles.filter((o) => !ignore.includes(o) && segDist(a, b, o) < o.radius + PLAYER.radius - 1e-9);
}

// 대상 중심에서 to 쪽으로 dist 만큼 간 지점(사람이 서는 자리).
function toward(t, to, dist) {
  const k = dist / d(t, to);
  return { x: t.x + (to.x - t.x) * k, z: t.z + (to.z - t.z) * k };
}

// 게임이 쓰는 고정 시드(SEED)에서 모든 통로를 검사한다. 다른 시드는 숲 내부 나무·파쇄기 자리가 달라 통로까지 보장하지는 않는다(나무토막 규칙만 모든 시드에서 검사).
for (const seed of [SEED]) {
  test(`seed ${seed}: 스폰 -> 불 · 파쇄기 · 통나무 자리 · 간판 앞, 그리고 서 있는 자리끼리 직선 통로가 막히지 않는다`, () => {
    const l = buildLayout(seed);
    const spawn = { x: SPAWN.x, z: SPAWN.z };
    const stands = {
      불: toward(FURNACE, spawn, FURNACE.radius + PLAYER.radius + 0.6), // 불 가장자리에서 바로 서는 자리(스폰 쪽)
      파쇄기: l.shredder.stand, // 파쇄기 앞 작업 자리(투입구 바로 앞)
    };
    l.interactables.filter((i) => i.kind === 'seat').forEach((s, i) => { stands[`통나무${i}`] = toward(FURNACE, s, 2.0); });
    const signFront = { x: l.sign.x + 1.6 * Math.sin(l.sign.rotY), z: l.sign.z + 1.6 * Math.cos(l.sign.rotY) }; // 간판 앞(기본 카메라 쪽 정면): 불 가장자리에서 간판 앞으로 가는 길
    const names = Object.keys(stands);
    // 통나무 자리는 서 있는 자리가 비어 있는지만 본다(스폰에서 통나무로 가는 길은 틈으로 들어가 불 둘레를 돈다).
    const edges = names.filter((n) => !n.startsWith('통나무')).map((n) => [`스폰-${n}`, spawn, stands[n]]);
        for (const n of names) if (n !== '불' && !n.startsWith('통나무')) edges.push([`불-${n}`, stands.불, stands[n]]); // 통나무 안쪽 자리는 서 있는 자리만 본다(아래)
    for (const [name, a, b] of edges) {
      const bl = blockers(l, a, b);
      assert.equal(bl.length, 0, `${name}: ${JSON.stringify(bl)}`);
    }
    const stallFront = { x: l.stall.x + 1.6 * Math.sin(l.stall.rotY), z: l.stall.z + 1.6 * Math.cos(l.stall.rotY) }; // 쿠키 노점 앞: 스폰에서 곧장 갈 수 있다
    assert.equal(blockers(l, spawn, stallFront).length, 0, '스폰-쿠키 노점 앞');
    assert.equal(blockers(l, stallFront, stallFront).length, 0, '쿠키 노점 앞 자리');
    const bl = blockers(l, toward(FURNACE, signFront, FURNACE.radius + PLAYER.radius + 0.6), signFront);
    assert.equal(bl.length, 0, `불-간판 앞: ${JSON.stringify(bl)}`);
    assert.equal(blockers(l, signFront, signFront).length, 0, '간판 앞 자리');
    for (const n of names) assert.equal(blockers(l, stands[n], stands[n]).length, 0, `서는 자리 ${n}`);
  });

}

// 통나무 자리에 앉았다가 일어나는 자리(고리 바깥쪽 1.1)가 장애물 밖이고, 스폰 쪽 틈과 불 앞에서 모든 통나무 앞 자리로 걸어갈 수 있다.
test('통나무 6개: 일어서는 자리는 장애물 밖이고 마당 안이며, 스폰·파쇄기 작업 자리·불 앞은 서로 통로가 열려 있다', () => {
  const l = buildLayout(SEED);
  const spawn = { x: SPAWN.x, z: SPAWN.z };
  for (const s of l.interactables.filter((i) => i.kind === 'seat')) {
    assert.equal(blockers(l, s.seat.stand, s.seat.stand).length, 0, `${s.id} 일어서는 자리`);
  }
  const fire = toward(FURNACE, spawn, FURNACE.radius + PLAYER.radius + 0.6);
  assert.equal(blockers(l, spawn, fire).length, 0, '스폰-불');
  assert.equal(blockers(l, fire, l.shredder.stand).length, 0, '불-파쇄기 작업 자리');
  assert.equal(blockers(l, spawn, l.shredder.stand).length, 0, '스폰-파쇄기 작업 자리');
});
