import test from 'node:test';
import assert from 'node:assert/strict';
import {
  skyAt, parseClock, minutesOfDay, sunDirection, createSkyState, phaseSpans, phaseMiddle, skyClockParams, skyMinutes, SKY_PHASE_NAMES,
} from '../src/logic/skyCycle.js';
import { SKY_CYCLE } from '../src/config.js';

const luminance = ([r, g, b]) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;
const at = (hm) => skyAt(parseClock(hm));
const phase = (name) => SKY_CYCLE.phases.find((p) => p.name === name);

test('하늘 시각표: 새벽 04:30 -> 아침 06:30 -> 노을 16:30 -> 밤 19:00, 단계 길이 합은 하루', () => {
  assert.deepEqual(SKY_CYCLE.phases.map((p) => p.name), SKY_PHASE_NAMES);
  assert.deepEqual(SKY_CYCLE.phases.map((p) => p.start), ['04:30', '06:30', '16:30', '19:00']);
  const spans = phaseSpans();
  assert.equal(spans.reduce((s, x) => s + x.length, 0), 1440);
  assert.equal(spans[3].length, 570, '밤은 19:00~04:30(자정을 넘는다)');
});

test('parseClock·minutesOfDay', () => {
  assert.equal(parseClock('00:00'), 0);
  assert.equal(parseClock('18:00'), 1080);
  assert.equal(parseClock('7:05'), 425);
  for (const bad of ['24:00', '12:60', 'noon', '', null, '1230']) assert.equal(parseClock(bad), null, String(bad));
  assert.equal(minutesOfDay(new Date(2026, 0, 1, 13, 30, 30)), 13 * 60 + 30.5);
});

test('대표 시각: 03:00·23:30 은 밤, 05:30 은 새벽(밝아지는 중), 12:00 은 아침 그대로, 17:30 은 노을', () => {
  assert.equal(at('03:00').name, 'evening');
  assert.equal(at('03:00').blend, 0);
  assert.equal(at('23:30').name, 'evening');
  assert.equal(at('23:30').blend, 0);
  const d = at('05:30');
  assert.equal(d.name, 'dawn');
  assert.ok(d.blend > 0 && d.blend < 1, '05:30 은 아침으로 넘어가는 중');
  const noon = at('12:00');
  assert.equal(noon.name, 'morning');
  assert.equal(noon.blend, 0);
  assert.equal(noon.sun, phase('morning').sun);
  assert.ok(near(noon.skyTop[2], (phase('morning').skyTop & 255) / 255));
  const ss = at('17:30');
  assert.equal(ss.name, 'sunset');
  assert.equal(ss.blend, 0);
  assert.ok(ss.skyHorizon[0] > ss.skyHorizon[2] + 0.3, '노을 지평선은 붉다');
});

test('자정을 넘어도 밤 값이 그대로 이어지고, 밤 끝(04:30 직전)에 새벽으로 넘어간다', () => {
  const a = at('23:59');
  const b = skyAt(0);
  for (const key of ['skyTop', 'fog', 'hemiSky']) for (let j = 0; j < 3; j++) assert.ok(near(a[key][j], b[key][j]));
  assert.equal(b.name, 'evening');
  const late = skyAt(parseClock('04:30') - 0.01);
  assert.equal(late.name, 'evening');
  assert.ok(late.blend > 0.99);
  assert.equal(at('04:30').name, 'dawn');
  assert.equal(skyAt(-30).name, 'evening'); // 음수·범위 밖도 하루로 접는다
  assert.equal(skyAt(1440 + 720).name, 'morning');
  assert.equal(skyAt(NaN).name, 'evening');
});

test('하루 내내 1분마다 값이 끊기지 않는다(경계 연속성)', () => {
  const a = createSkyState();
  const b = createSkyState();
  for (let m = 0; m < 1440; m += 0.5) {
    skyAt(m, SKY_CYCLE, a);
    skyAt(m + 1, SKY_CYCLE, b);
    for (const key of ['skyTop', 'skyHorizon', 'fog', 'hemiSky', 'sunColor', 'glow']) {
      for (let j = 0; j < 3; j++) assert.ok(Math.abs(a[key][j] - b[key][j]) < 0.04, `${key} 가 ${m}분에 튐`);
    }
    assert.ok(Math.abs(a.sun - b.sun) < 0.05 && Math.abs(a.hemi - b.hemi) < 0.03 && Math.abs(a.fire - b.fire) < 0.06, `${m}분 세기가 튐`);
    let dot = 0;
    for (let j = 0; j < 3; j++) dot += a.sunDir[j] * b.sunDir[j];
    assert.ok(dot > 0.99, `${m}분 해 방향이 튐`);
  }
});

test('밤은 낮보다 확연히 어둡고 모닥불은 더 밝지만, 하루 내내 최소 밝기는 지킨다', () => {
  const noon = at('12:00');
  const night = at('23:30');
  assert.ok(luminance(night.skyTop) < luminance(noon.skyTop) * 0.4);
  assert.ok(night.hemi < noon.hemi && night.sun < noon.sun);
  assert.ok(night.fire > noon.fire * 1.5);
  for (let m = 0; m < 1440; m += 5) {
    const s = skyAt(m);
    assert.ok(s.hemi >= SKY_CYCLE.minHemi && s.sun >= SKY_CYCLE.minSun, `${m}분 너무 어두움`);
  }
});

test('새벽은 보랏빛이고 해가 낮으며, 시간이 갈수록 밝아진다', () => {
  const early = at('04:45');
  const late = at('06:20');
  assert.ok(early.skyHorizon[2] > early.skyHorizon[1], '새벽 지평선은 보랏빛(파랑 > 초록)');
  assert.ok(early.sunDir[1] < at('12:00').sunDir[1]);
  assert.ok(luminance(late.skyTop) > luminance(early.skyTop));
  assert.ok(late.hemi > early.hemi);
});

test('skyClockParams: ?sky=HH:MM 고정, ?sky=단계 이름은 그 단계 한가운데, ?skyspeed=N 배율, 없으면 실제 시각(배율 1)', () => {
  assert.deepEqual(skyClockParams(''), { fixed: null, speed: 1 });
  assert.deepEqual(skyClockParams('?mp=off'), { fixed: null, speed: 1 });
  assert.deepEqual(skyClockParams('?sky=18:00'), { fixed: 1080, speed: 0 });
  assert.deepEqual(skyClockParams('?sky=18:00&skyspeed=60'), { fixed: 1080, speed: 60 });
  assert.deepEqual(skyClockParams('?skyspeed=120'), { fixed: null, speed: 120 });
  assert.deepEqual(skyClockParams('?sky=25:00'), { fixed: null, speed: 1 });
  assert.deepEqual(skyClockParams('?skyspeed=-3'), { fixed: null, speed: 1 });
  for (const name of SKY_PHASE_NAMES) {
    const { fixed } = skyClockParams(`?sky=${name}`);
    assert.equal(fixed, phaseMiddle(name));
    const s = skyAt(fixed);
    assert.equal(s.name, name);
    assert.equal(s.blend, 0);
  }
});

test('skyMinutes: 실제 시각은 그대로 흐르고, 고정이면 멈추며, 배율이면 빨리 흐른다(하루를 넘으면 접는다)', () => {
  assert.equal(skyMinutes({ fixed: null, speed: 1 }, 600, 120), 600);
  assert.equal(skyMinutes({ fixed: 1080, speed: 0 }, 600, 120), 1080);
  assert.equal(skyMinutes({ fixed: 1080, speed: 60 }, 600, 60), 1140);
  assert.equal(skyMinutes({ fixed: null, speed: 61 }, 600, 60), 660);
  assert.equal(skyMinutes({ fixed: 1430, speed: 60 }, 0, 60), 50);
});

test('sunDirection: 단위 길이, 높이 90도는 위 / skyAt 은 out 을 채워 돌려준다', () => {
  assert.ok(near(Math.hypot(...sunDirection(30, 200)), 1));
  assert.ok(near(sunDirection(90, 0)[1], 1));
  const out = createSkyState();
  assert.equal(skyAt(100, SKY_CYCLE, out), out);
});
