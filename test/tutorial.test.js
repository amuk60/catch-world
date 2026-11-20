import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTutorial, createCourse, eventOfTrack, compassArrow, resolveTarget, STEP, TUTORIAL_KEY, COURSE_KEY, isTutorialSeen } from '../src/logic/tutorial.js';
import { TUTORIAL } from '../src/config.js';

const memory = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) }; };
const broken = { getItem() { throw new Error('막힘'); }, setItem() { throw new Error('막힘'); } };
const recorder = () => { const log = []; return { log, track: (n, p) => log.push([n, p]) }; };
const ITEMS = TUTORIAL.course.items;

test('처음에는 자동 시작 대상이고, 시작하면 본 것으로 저장된다', () => {
  const s = memory();
  const t = createTutorial({ storage: s });
  assert.equal(t.shouldAutoStart(), true);
  t.start();
  assert.equal(s.getItem(TUTORIAL_KEY), '1');
  assert.equal(isTutorialSeen(s), true);
  assert.equal(createTutorial({ storage: s }).shouldAutoStart(), false);
});

test('저장소가 없거나 막혀도 던지지 않는다(매번 처음)', () => {
  for (const storage of [null, undefined, broken]) {
    const t = createTutorial({ storage });
    assert.equal(t.shouldAutoStart(), true);
    t.start();
    assert.equal(t.step, STEP.INTRO);
  }
  assert.doesNotThrow(() => createCourse({ storage: broken, items: ITEMS }).notify('burn'));
});

test('단계 진행: 소개 -> 움직이기 -> 모닥불 -> 태우기 -> 축하 -> 끝', () => {
  const { log, track } = recorder();
  const t = createTutorial({ track, moveDistance: 2.5, congratsSeconds: 3 });
  assert.equal(t.active, false);
  t.start();
  assert.equal(t.step, STEP.INTRO);
  t.notifyMoved(10); // 소개 중에는 세지 않는다
  assert.equal(t.step, STEP.INTRO);
  t.begin();
  assert.equal(t.step, STEP.MOVE);
  t.notifyMoved(1); t.notifyMoved(1);
  assert.equal(t.step, STEP.MOVE);
  t.notifyMoved(0.6);
  assert.equal(t.step, STEP.FIRE);
  t.update(0.1, { zoneId: 'shredder' });
  assert.equal(t.step, STEP.FIRE);
  t.update(0.1, { zoneId: 'incinerator' });
  assert.equal(t.step, STEP.BURN);
  t.notifyEvent('wash'); // 다른 이벤트는 무시
  assert.equal(t.step, STEP.BURN);
  t.notifyEvent('burn');
  assert.equal(t.step, STEP.CONGRATS);
  assert.equal(t.update(2, {}), null);
  assert.equal(t.update(1.1, {}), 'complete');
  assert.equal(t.active, false);
  assert.deepEqual(log.map(([n]) => n), ['tutorial_start', 'tutorial_step', 'tutorial_step', 'tutorial_step', 'tutorial_step', 'tutorial_step', 'tutorial_complete']);
  assert.deepEqual(log.filter(([n]) => n === 'tutorial_step').map(([, p]) => p.n), [0, 1, 2, 3, 4]);
});

test('3단계에서 불을 떠나면(자유 상태) 2단계로 돌아가고, 고르기 창이 열려 있을 때(자유 아님)는 그대로', () => {
  const t = createTutorial({});
  t.start(); t.begin(); t.notifyMoved(5);
  t.update(0.1, { zoneId: 'incinerator' });
  assert.equal(t.step, STEP.BURN);
  t.update(0.1, { zoneId: null, free: false });
  assert.equal(t.step, STEP.BURN);
  t.update(0.1, { zoneId: null, free: true });
  assert.equal(t.step, STEP.FIRE);
});

test('건너뛰기: 어느 단계에서든 끝나고 tutorial_skip {n} 이 나가며, 끝난 뒤에는 아무 일 없다', () => {
  const { log, track } = recorder();
  const t = createTutorial({ track });
  assert.equal(t.skip(), false);
  t.start(); t.begin();
  assert.equal(t.skip(), true);
  assert.equal(t.active, false);
  assert.deepEqual(log.at(-1), ['tutorial_skip', { n: STEP.MOVE }]);
  assert.equal(t.skip(), false);
  t.notifyMoved(9); t.notifyEvent('burn');
  assert.equal(t.active, false);
});

test('다시 보기: 끝난 뒤 start({replay}) 로 처음부터, 시작 이벤트에 replay 표시', () => {
  const { log, track } = recorder();
  const t = createTutorial({ track, storage: memory() });
  t.start(); t.skip();
  t.start({ replay: true });
  assert.equal(t.step, STEP.INTRO);
  assert.deepEqual(log.filter(([n]) => n === 'tutorial_start').map(([, p]) => p.replay), [false, true]);
  t.begin(); t.notifyMoved(3);
  t.start({ replay: true }); // 진행 중에 다시: 거리도 처음부터
  t.begin(); t.notifyMoved(1);
  assert.equal(t.step, STEP.MOVE);
});

test('begin 은 소개 단계에서만 먹는다', () => {
  const t = createTutorial({});
  t.begin();
  assert.equal(t.step, null);
  t.start(); t.begin(); t.begin();
  assert.equal(t.step, STEP.MOVE);
});

test('eventOfTrack: 실제 분석 이벤트를 코스 이벤트로', () => {
  assert.equal(eventOfTrack('action_done', { action: 'burn' }), 'burn');
  assert.equal(eventOfTrack('action_done', { action: 'shred' }), 'burn');
  assert.equal(eventOfTrack('action_done', { action: 'wash' }), 'wash');
  assert.equal(eventOfTrack('action_done', { action: 'hang' }), 'hang');
  assert.equal(eventOfTrack('action_done', { action: 'interview' }), null);
  assert.equal(eventOfTrack('outfit_ready'), 'wear');
  assert.equal(eventOfTrack('interview_answer', { type: 'a' }), 'interview');
  assert.equal(eventOfTrack('fortune_crack', {}), 'fortune');
  assert.equal(eventOfTrack('marshmallow', { result: 'perfect' }), 'marshmallow');
  assert.equal(eventOfTrack('game_start'), null);
  assert.equal(eventOfTrack('action_done'), null);
});

test('체크리스트: 5개 항목, 세탁소는 세탁·널기·입기 셋이 모두 필요', () => {
  const { log, track } = recorder();
  const c = createCourse({ items: ITEMS, track });
  assert.equal(c.items.length, 5);
  assert.deepEqual(c.progress(), { done: 0, total: 5 });
  assert.deepEqual(c.notify('burn'), ['burn']);
  assert.deepEqual(c.notify('wash'), []);
  assert.deepEqual(c.notify('hang'), []);
  assert.equal(c.isDone('laundry'), false);
  assert.deepEqual(c.notify('wear'), ['laundry']);
  assert.deepEqual(c.notify('burn'), []); // 중복은 무시
  assert.deepEqual(c.notify('nope'), []);
  assert.deepEqual(c.progress(), { done: 2, total: 5 });
  assert.equal(c.complete, false);
  c.notify('interview'); c.notify('fortune');
  assert.equal(c.complete, false);
  c.notify('marshmallow');
  assert.equal(c.complete, true);
  assert.deepEqual(log.filter(([n]) => n === 'checklist_item').map(([, p]) => p.id), ['burn', 'laundry', 'interview', 'fortune', 'marshmallow']);
  assert.equal(log.filter(([n]) => n === 'checklist_complete').length, 1);
});

test('체크리스트는 저장되어 다음 방문에 이어지고, 깨진 저장값은 무시한다', () => {
  const s = memory();
  const a = createCourse({ storage: s, items: ITEMS });
  a.notify('burn'); a.notify('wash'); a.setHidden(true); a.setCollapsed(true);
  const b = createCourse({ storage: s, items: ITEMS });
  assert.equal(b.isDone('burn'), true);
  assert.equal(b.hasGot('wash'), true);
  assert.equal(b.hidden, true);
  assert.equal(b.collapsed, true);
  assert.deepEqual(b.notify('hang'), []);
  assert.deepEqual(b.notify('wear'), ['laundry']);
  s.setItem(COURSE_KEY, '{망가짐');
  assert.deepEqual(createCourse({ storage: s, items: ITEMS }).progress(), { done: 0, total: 5 });
  s.setItem(COURSE_KEY, JSON.stringify({ got: ['burn', 'zzz'], done: ['burn', 'zzz'] }));
  assert.deepEqual(createCourse({ storage: s, items: ITEMS }).progress(), { done: 1, total: 5 });
});

test('config 의 코스 항목: 아이콘·이름·한 줄 힌트가 있고 소개는 3줄 + 안내 문구', () => {
  for (const i of ITEMS) { assert.ok(i.id && i.icon && i.label && i.hint && i.needs.length); assert.ok(i.hint.length <= 24); }
  assert.equal(TUTORIAL.intro.lines.length, 2);
  assert.ok(TUTORIAL.intro.note);
});

const view = { width: 800, height: 600 };
test('compassArrow: 화면 안의 점은 그 위치 그대로', () => {
  assert.deepEqual(compassArrow({ x: 0.5, y: 0.5 }, false, view, 20), { onScreen: true, x: 600, y: 150 });
  assert.equal(compassArrow({ x: 0, y: 0 }, false, view).x, 400);
});

test('compassArrow: 화면 밖은 가장자리에 붙고 각도는 목표 쪽', () => {
  const right = compassArrow({ x: 3, y: 0 }, false, view, 20);
  assert.equal(right.onScreen, false);
  assert.ok(Math.abs(right.x - 780) < 1e-6 && Math.abs(right.y - 300) < 1e-6);
  assert.ok(Math.abs(right.angle) < 1e-9);
  const up = compassArrow({ x: 0, y: 4 }, false, view, 20);
  assert.ok(Math.abs(up.y - 20) < 1e-6 && Math.abs(up.x - 400) < 1e-6);
  assert.ok(Math.abs(up.angle + Math.PI / 2) < 1e-9); // 화면 위쪽 = -90도
  const down = compassArrow({ x: 0, y: -4 }, false, view, 20);
  assert.ok(Math.abs(down.angle - Math.PI / 2) < 1e-9);
  const left = compassArrow({ x: -3, y: 0 }, false, view, 20);
  assert.ok(Math.abs(Math.abs(left.angle) - Math.PI) < 1e-9 && Math.abs(left.x - 20) < 1e-6);
});

test('compassArrow: 대각선은 사각형 가장자리에 닿고 각도는 중심에서 목표 쪽', () => {
  const r = compassArrow({ x: 2, y: 2 }, false, view, 0);
  assert.equal(r.onScreen, false);
  assert.ok(Math.abs(r.angle - Math.atan2(-2 * 300, 2 * 400)) < 1e-9);
  assert.ok(Math.abs(r.x - 800) < 1e-6 || Math.abs(r.y) < 1e-6);
});

test('compassArrow: 여백은 면별로 줄 수 있고, 여백 안쪽으로 들어온 점은 화면 밖 취급', () => {
  const m = { top: 100, bottom: 120, left: 10, right: 10 };
  const up = compassArrow({ x: 0, y: 0.9 }, false, view, m); // 화면 안이지만 위 여백(스트레스 막대) 안
  assert.equal(up.onScreen, false);
  assert.ok(Math.abs(up.y - 100) < 1e-6);
  const down = compassArrow({ x: 0, y: -0.9 }, false, view, m);
  assert.equal(down.onScreen, false);
  assert.ok(Math.abs(down.y - 480) < 1e-6);
});

test('compassArrow: 카메라 뒤의 점은 거울상을 뒤집어 같은 쪽을 가리키고 항상 가장자리', () => {
  const r = compassArrow({ x: -0.2, y: 0 }, true, view, 20); // 투영하면 왼쪽이지만 실제로는 오른쪽 뒤
  assert.equal(r.onScreen, false);
  assert.ok(Math.abs(r.angle) < 1e-9);
  const dead = compassArrow({ x: 0, y: 0 }, true, view, 20);
  assert.equal(dead.onScreen, false);
  assert.ok(Math.abs(dead.angle - Math.PI / 2) < 1e-9); // 정확히 뒤: 아래
});

test('resolveTarget: 그 공간에 목표가 있으면 그 지점, 다른 실내면 출구, 없으면 null', () => {
  const places = { burn: { yard: { x: 1, z: 2 } }, laundry: { yard: { x: 5, z: 5 }, laundry: { x: 600, z: 0 } } };
  const exits = { laundry: { x: 601, z: 3 }, interview: { x: 701, z: 3 } };
  assert.deepEqual(resolveTarget('burn', 'yard', places, exits), { x: 1, z: 2 });
  assert.deepEqual(resolveTarget('burn', 'laundry', places, exits), { x: 601, z: 3 });
  assert.deepEqual(resolveTarget('laundry', 'laundry', places, exits), { x: 600, z: 0 });
  assert.deepEqual(resolveTarget('laundry', 'interview', places, exits), { x: 701, z: 3 });
  assert.equal(resolveTarget('nope', 'yard', places, exits), null);
  assert.equal(resolveTarget('burn', 'mystery', places, exits), null);
});
