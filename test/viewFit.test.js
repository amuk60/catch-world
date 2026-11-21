import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeFov, viewFit } from '../src/logic/camera.js';
import { ORBIT, MOBILE, FIRST_PERSON } from '../src/config.js';

const OPT = { baseFov: ORBIT.baseFov, minAspect: ORBIT.minAspect, fpFov: FIRST_PERSON.fov };

test('viewFit: 보정값을 안 주면(PC) 어떤 비율이든 computeFov 그대로, 거리·내림·1인칭 화각은 그대로', () => {
  for (const a of [0.46, 0.75, 1, 1.33, 1.78, 2.16]) {
    assert.deepEqual(viewFit(a, OPT), { fov: computeFov(ORBIT.baseFov, a, ORBIT.minAspect), distanceScale: 1, offsetFrac: 0, fpFov: FIRST_PERSON.fov });
  }
});

test('viewFit: 터치 가로 화면(aspect >= 1)은 보정 없음(직전 가로 플레이와 같다)', () => {
  for (const a of [1, 1.33, 2.16]) {
    const v = viewFit(a, OPT, MOBILE.portrait);
    assert.equal(v.fov, computeFov(ORBIT.baseFov, a, ORBIT.minAspect));
    assert.equal(v.distanceScale, 1);
    assert.equal(v.offsetFrac, 0);
    assert.equal(v.fpFov, FIRST_PERSON.fov);
  }
});

test('viewFit: 폰 세로(390x844 등)는 화각을 묶고 멀리서, 캐릭터를 아래로 내린다', () => {
  for (const [w, h] of [[390, 844], [430, 932], [375, 667], [360, 740]]) {
    const v = viewFit(w / h, OPT, MOBILE.portrait);
    assert.ok(computeFov(ORBIT.baseFov, w / h, ORBIT.minAspect) > 90); // 보정 없이는 지나치게 넓다
    assert.equal(v.fov, MOBILE.portrait.maxFov);
    assert.equal(v.distanceScale, MOBILE.portrait.distanceScale);
    assert.equal(v.offsetFrac, MOBILE.portrait.offsetFrac);
    assert.equal(v.fpFov, MOBILE.portrait.fpFov);
    // 캐릭터 둘레 가로 폭(타깃 거리에서 보이는 너비)이 소품이 들어갈 만큼(6 단위 이상)
    const half = Math.tan((v.fov * Math.PI) / 360) * (w / h);
    assert.ok(2 * ORBIT.distance * v.distanceScale * half >= 6, `${w}x${h}`);
  }
});

test('viewFit: 정사각형에 가까울수록 보정이 서서히 줄어 aspect 1 에서 이어진다(튀지 않는다)', () => {
  const near = viewFit(0.999, OPT, MOBILE.portrait);
  const at = viewFit(1, OPT, MOBILE.portrait);
  assert.ok(Math.abs(near.fov - at.fov) < 0.5);
  assert.ok(Math.abs(near.distanceScale - 1) < 0.01);
  assert.ok(near.offsetFrac < 0.01);
  const mid = viewFit(0.8, OPT, MOBILE.portrait);
  assert.ok(mid.distanceScale > 1 && mid.distanceScale < MOBILE.portrait.distanceScale);
});

test('viewFit: 세로 실내는 더 멀리·덜 내리고, 아래 선택 창이 뜨면 캐릭터를 위로 올린다(가로·PC 는 장소와 상관없이 보정 없음)', () => {
  const a = 390 / 844;
  const yard = viewFit(a, OPT, MOBILE.portrait);
  const indoor = viewFit(a, OPT, MOBILE.portrait, { indoor: true });
  const sheet = viewFit(a, OPT, MOBILE.portrait, { indoor: true, sheet: true });
  assert.ok(indoor.distanceScale > yard.distanceScale);
  assert.ok(indoor.offsetFrac < yard.offsetFrac && indoor.offsetFrac >= 0);
  assert.ok(sheet.offsetFrac < 0); // 위로
  assert.equal(sheet.distanceScale, indoor.distanceScale);
  for (const where of [{ indoor: true }, { sheet: true }]) {
    assert.deepEqual(viewFit(2.16, OPT, MOBILE.portrait, where), viewFit(2.16, OPT));
    assert.deepEqual(viewFit(a, OPT, null, where), viewFit(a, OPT));
  }
});

test('viewFit: 잘못된 비율은 보정 없이 기본값', () => {
  for (const a of [0, NaN, -1, Infinity]) {
    const v = viewFit(a, OPT, MOBILE.portrait);
    assert.equal(v.fov, ORBIT.baseFov);
    assert.equal(v.distanceScale, 1);
    assert.equal(v.offsetFrac, 0);
  }
});
