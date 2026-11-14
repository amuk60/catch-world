import test from 'node:test';
import assert from 'node:assert/strict';
import { shardRoom, nextShard } from '../src/logic/shards.js';

test('shardRoom: 접두어 + 공간 + 번호', () => {
  assert.equal(shardRoom('catch-world:', 'yard', 1), 'catch-world:yard-1');
  assert.equal(shardRoom('catch-world-dev-x:', 'laundry', 3), 'catch-world-dev-x:laundry-3');
});

test('nextShard: cap 미만이면 머문다(내가 cap 번째까지)', () => {
  assert.deepEqual(nextShard({ shard: 1, others: 0, cap: 8, maxShards: 6 }), { action: 'stay' });
  assert.deepEqual(nextShard({ shard: 1, others: 7, cap: 8, maxShards: 6 }), { action: 'stay' });
});

test('nextShard: cap 이상이면 다음 방, 마지막 방도 차면 full', () => {
  assert.deepEqual(nextShard({ shard: 1, others: 8, cap: 8, maxShards: 6 }), { action: 'try', shard: 2 });
  assert.deepEqual(nextShard({ shard: 5, others: 12, cap: 8, maxShards: 6 }), { action: 'try', shard: 6 });
  assert.deepEqual(nextShard({ shard: 6, others: 8, cap: 8, maxShards: 6 }), { action: 'full' });
  assert.deepEqual(nextShard({ shard: 1, others: 2, cap: 2, maxShards: 1 }), { action: 'full' });
});

test('nextShard: 앞 번호 방부터 채우는 시뮬레이션(순차 입장)', () => {
  const counts = new Map();
  const join = (cap, maxShards) => {
    let shard = 1;
    for (;;) {
      const r = nextShard({ shard, others: counts.get(shard) ?? 0, cap, maxShards });
      if (r.action === 'stay') { counts.set(shard, (counts.get(shard) ?? 0) + 1); return shard; }
      if (r.action === 'full') return null;
      shard = r.shard;
    }
  };
  const got = Array.from({ length: 7 }, () => join(2, 3));
  assert.deepEqual(got, [1, 1, 2, 2, 3, 3, null]);
  counts.set(1, 1); // 누가 나가서 1번 방에 자리가 났다
  assert.equal(join(2, 3), 1);
});
