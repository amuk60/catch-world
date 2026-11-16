// 소각장 길목 검사: 스폰·불·파쇄기·벤치 사이를 직선으로 걸을 수 있고, 나무토막이 길목과 상호작용 자리를 가리지 않는다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildLayout } from '../src/logic/layout.js';
import { FURNACE, PLAYER, SEED, SPAWN } from '../src/config.js';

const SEEDS = [SEED, 1, 2, 3, 42, 777];
const LOG_VISUAL_RADIUS = 0.7; // 나무토막은 충돌은 없지만 눈에 보이는 덩치라 길목에서는 장애물처럼 센다.
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
  const circles = [FURNACE, ...l.obstacles, ...l.furnaceItems.filter((i) => i.name === 'log').map((o) => ({ x: o.x, z: o.z, radius: LOG_VISUAL_RADIUS }))];
  return circles.filter((o) => !ignore.includes(o) && segDist(a, b, o) < o.radius + PLAYER.radius - 1e-9);
}

// 대상 중심에서 to 쪽으로 dist 만큼 간 지점(사람이 서는 자리).
function toward(t, to, dist) {
  const k = dist / d(t, to);
  return { x: t.x + (to.x - t.x) * k, z: t.z + (to.z - t.z) * k };
}

// 게임이 쓰는 고정 시드(SEED)에서 모든 통로를 검사한다. 다른 시드는 숲 내부 나무·파쇄기 자리가 달라 통로까지 보장하지는 않는다(나무토막 규칙만 모든 시드에서 검사).
for (const seed of [SEED]) {
  test(`seed ${seed}: 스폰 -> 불 · 파쇄기 · 벤치 · 간판 앞, 그리고 서 있는 자리끼리 직선 통로가 막히지 않는다`, () => {
    const l = buildLayout(seed);
    const spawn = { x: SPAWN.x, z: SPAWN.z };
    const stands = {
      불: toward(FURNACE, spawn, FURNACE.radius + PLAYER.radius + 0.6), // 불 가장자리에서 바로 서는 자리(스폰 쪽)
      파쇄기: toward(l.shredder, spawn, l.shredder.radius + PLAYER.radius + 0.4),
    };
    l.interactables.filter((i) => i.kind === 'seat').forEach((s, i) => { stands[`벤치${i}`] = toward(s, spawn, s.radius + PLAYER.radius + 0.4); });
    const signFront = { x: l.sign.x + 1.6 * Math.sin(l.sign.rotY), z: l.sign.z + 1.6 * Math.cos(l.sign.rotY) }; // 간판 앞(기본 카메라 쪽 정면): 불 가장자리에서 간판 앞으로 가는 길
    const names = Object.keys(stands);
    // 벤치는 스폰에서 곧장 가지 않고 불 앞(불-벤치 통로)을 거쳐 간다: 파쇄기가 스폰과 북동 벤치 사이 대각선에 놓일 수 있다.
    const edges = names.filter((n) => !n.startsWith('벤치')).map((n) => [`스폰-${n}`, spawn, stands[n]]);
    // 벤치로 가는 길은 불의 그 벤치 쪽 가장자리에서 출발한다(불 둘레를 도는 것은 자유).
    for (const n of names) if (n !== '불') edges.push([`불-${n}`, n.startsWith('벤치') ? toward(FURNACE, stands[n], FURNACE.radius + PLAYER.radius + 0.6) : stands.불, stands[n]]);
    for (const [name, a, b] of edges) {
      const bl = blockers(l, a, b);
      assert.equal(bl.length, 0, `${name}: ${JSON.stringify(bl)}`);
    }
    const bl = blockers(l, toward(FURNACE, signFront, FURNACE.radius + PLAYER.radius + 0.6), signFront);
    assert.equal(bl.length, 0, `불-간판 앞: ${JSON.stringify(bl)}`);
    assert.equal(blockers(l, signFront, signFront).length, 0, '간판 앞 자리');
    for (const n of names) assert.equal(blockers(l, stands[n], stands[n]).length, 0, `서는 자리 ${n}`);
  });

}

for (const seed of SEEDS) {
  test(`seed ${seed}: 나무토막은 불·파쇄기·벤치 상호작용 자리와 통로 위에 없다`, () => {
    const l = buildLayout(seed);
    const logs = l.furnaceItems.filter((i) => i.name === 'log');
    assert.equal(logs.length, 2);
    for (const lg of logs) {
      assert.ok(d(lg, FURNACE) >= 2.0 - 1e-9, 'fire');
      assert.ok(d(lg, l.shredder) >= 2.0, `shredder ${d(lg, l.shredder)}`);
      for (const s of l.interactables.filter((i) => i.kind === 'seat')) assert.ok(d(lg, s) >= 1.5, `seat ${s.id}`);
      assert.ok(d(lg, SPAWN) >= 4, 'spawn');
      // 스폰-불 직선과 불-파쇄기 직선에서 눈에 보이는 덩치 + 플레이어 반경만큼 떨어진다.
      assert.ok(segDist(SPAWN, FURNACE, lg) >= LOG_VISUAL_RADIUS + PLAYER.radius, 'spawn-fire line');
      assert.ok(segDist(l.shredder, FURNACE, lg) >= LOG_VISUAL_RADIUS + PLAYER.radius, 'shredder-fire line');
    }
  });
}
