import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeLoopData, loadFireFile, fireFile, resetFireFile, FIRE_FILE } from '../src/audio/fireFile.js';

const ramp = (n, f) => Float32Array.from({ length: n }, (_, i) => f(i));

test('makeLoopData: 길이는 원본 - 겹침, 끝에서 처음으로 이어질 때 값이 끊기지 않는다', () => {
  const n = 1000, xf = 100;
  const src = ramp(n, (i) => Math.sin(i * 0.05));
  const [out] = makeLoopData([src], xf);
  assert.equal(out.length, n - xf);
  // 이어붙인 자리: 마지막 값 다음이 처음 값. 사인파라면 인접 표본 차이가 한 걸음 변화량(≈0.05) 근처여야 한다.
  const jump = Math.abs(out[0] - out[out.length - 1]);
  assert.ok(jump < 0.1, `이음매 점프 ${jump}`);
  // 겹침 구간 밖은 원본 그대로
  assert.equal(out[500], src[500]);
});

test('makeLoopData: 같은 힘 겹침이라 상수 입력은 크기가 유지된다(약 1.0 ~ 1.41)', () => {
  const src = new Float32Array(2000).fill(0.5);
  const [out] = makeLoopData([src], 400);
  for (let i = 0; i < 400; i++) assert.ok(out[i] >= 0.5 - 1e-6 && out[i] <= 0.5 * Math.SQRT2 + 1e-6);
});

test('makeLoopData: 이상한 입력에도 던지지 않는다', () => {
  assert.equal(makeLoopData([], 10), null);
  assert.equal(makeLoopData(null, 10), null);
  const [out] = makeLoopData([new Float32Array(10)], 9999); // 겹침은 길이의 절반 아래로 잘린다
  assert.ok(out.length >= 5);
  const [o2] = makeLoopData([new Float32Array(100)], NaN);
  assert.equal(o2.length, 100);
});

test('loadFireFile: 성공하면 버퍼를 만들고 듣는 쪽에 알린다, 한 번만 불러온다', async () => {
  resetFireFile();
  const data = ramp(44100 * 10, (i) => Math.sin(i * 0.01));
  const ctx = {
    decodeAudioData: async () => ({ numberOfChannels: 1, sampleRate: 44100, getChannelData: () => data }),
    createBuffer: (ch, len, sr) => { const d = Array.from({ length: ch }, () => new Float32Array(len)); return { numberOfChannels: ch, length: len, sampleRate: sr, duration: len / sr, getChannelData: (c) => d[c] }; },
  };
  let calls = 0;
  const fetchFn = async () => { calls++; return { ok: true, arrayBuffer: async () => new ArrayBuffer(8) }; };
  let notified = 0;
  fireFile.onLoaded(() => { notified++; });
  assert.equal(await loadFireFile(ctx, fetchFn), true);
  assert.equal(fireFile.status, 'ready');
  assert.ok(fireFile.buffer);
  assert.equal(fireFile.buffer.length, 44100 * 10 - Math.round(FIRE_FILE.crossfadeSeconds * 44100));
  assert.equal(notified, 1);
  assert.equal(await loadFireFile(ctx, fetchFn), false);
  assert.equal(calls, 1);
});

test('loadFireFile: 404·해독 실패·fetch 없음은 조용히 실패하고 버퍼가 없다(합성 소리로 대체)', async () => {
  resetFireFile();
  assert.equal(await loadFireFile({}, async () => ({ ok: false, status: 404 })), false);
  assert.equal(fireFile.status, 'failed');
  assert.equal(fireFile.buffer, null);
  resetFireFile();
  const ctx = { decodeAudioData: async () => { throw new Error('bad'); } };
  assert.equal(await loadFireFile(ctx, async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(1) })), false);
  resetFireFile();
  assert.equal(await loadFireFile(ctx, undefined), false);
  resetFireFile();
});
