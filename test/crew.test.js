import test from 'node:test';
import assert from 'node:assert/strict';
import { createCrew } from '../src/interviewCrew.js';
import { remoteScene } from '../src/logic/interview.js';
import { INTERVIEW } from '../src/config.js';
import { mulberry32 } from '../src/logic/rng.js';

const IDS = ['leader', 'hr', 'mentor'];
const NAMES = { leader: '팀장', hr: '인사담당', mentor: '예비 사수' };

// hud·interviewers 가짜: 불린 것을 기록한다.
function rig() {
  const log = [];
  const speech = new Map();
  const hud = {
    say: (id, text, o) => { speech.set(id, text); log.push(['say', id, text, o.name]); },
    clearSpeech: (id) => { speech.delete(id); log.push(['clear', id]); },
  };
  const state = Object.fromEntries(IDS.map((id) => [id, { pose: null, bounce: null }]));
  const interviewers = {
    byId: Object.fromEntries(IDS.map((id) => [id, {
      actor: {
        play: (name) => log.push(['clip', id, name]),
        setPose: (p) => { state[id].pose = p; log.push(['pose', id, p]); },
        fx: { setTilt: (r) => { state[id].tilt = r; log.push(['tilt', id, r]); }, setBounce: (b) => { state[id].bounce = b; log.push(['bounce', id, b]); }, startSpin: () => log.push(['spin', id]), setYaw: (r) => { state[id].yaw = r; log.push(['yaw', id, r]); } },
      },
    }])),
    emote: (id, name) => log.push(['emote', id, name]),
    stand: (id) => log.push(['stand', id]),
    sit: (id) => log.push(['sit', id]),
  };
  const crew = createCrew({ hud, interviewers, names: NAMES, ids: IDS });
  const run = (seconds, step = 0.1) => { for (let t = 0; t < seconds - 1e-9; t += step) crew.update(step); };
  const says = (id) => log.filter((e) => e[0] === 'say' && e[1] === id);
  return { crew, log, speech, state, run, says };
}
const ans = (assigned, q = 0, a = 0, seed = 1) => ({ ...remoteScene(INTERVIEW, { ty: 'ans', q, a }, assigned, { rng: mulberry32(seed) }) });
const imp = (assigned, id = 'banzai') => ({ ...remoteScene(INTERVIEW, { ty: 'imp', imp: id }, assigned, { rng: () => 0.99 }) });

test('crew: 다른 방문자의 답변 — 담당이 질문을 묻고, 1.2초쯤 뒤 보낸 사람의 말풍선, 곧이어 담당의 반응 대사·동작', () => {
  const { crew, log, run, says, state } = rig();
  let bubbleAt = null;
  const scene = ans('hr', 1, 0);
  assert.equal(crew.remote('hr', 'rA', { ...scene, onBubble: () => { bubbleAt = crew.clock; } }), 'start');
  assert.deepEqual(says('hr')[0].slice(2), [INTERVIEW.questions[1].text, '인사담당'], '질문 글과 이름표');
  assert.ok(log.some((e) => e[0] === 'clip' && e[1] === 'hr'), '질문하는 동작');
  assert.equal(bubbleAt, null);
  run(1.3);
  assert.ok(bubbleAt >= 1.2 - 1e-9 && bubbleAt < 1.4, `답변 말풍선 ${bubbleAt}`);
  assert.equal(says('hr').length, 1, '아직 반응 전');
  run(1.5);
  assert.equal(says('hr').length, 2);
  assert.ok(Object.values(INTERVIEW.reactions['모범형'].hr).flat().includes(says('hr')[1][2]), '모범형 반응 대사');
  run(4);
  assert.equal(state.hr.pose, null, '끝나면 자세를 되돌린다');
  assert.equal(crew.state('hr').kind, 'idle');
});

test('crew: 내 장면(팀장)이 진행되는 동안에도 다른 의자(인사담당)의 질문·반응은 나온다 — 팀장은 건드리지 않는다', () => {
  const { crew, log, run, says } = rig();
  assert.equal(crew.claim('leader'), true);
  crew.remote('hr', 'rA', { ...ans('hr', 2, 1), onBubble: () => {} });
  run(5);
  assert.equal(says('hr').length, 2);
  assert.ok(!log.some((e) => e[1] === 'leader'), '팀장(내 담당)에게는 어떤 연기도 가지 않는다(가벼운 반응도 건너뜀)');
  assert.equal(crew.state('leader').owner, 'me');
});

test('crew: 세 의자 동시 활동 — 나 + 원격 둘, 모두 자기 담당 면접관이 처리하고 가벼운 반응은 아무도 못 한다', () => {
  const { crew, log, run, says } = rig();
  crew.claim('leader');
  const bubbles = [];
  assert.equal(crew.remote('hr', 'rA', { ...ans('hr', 0, 0), onBubble: () => bubbles.push('A') }), 'start');
  assert.equal(crew.remote('mentor', 'rB', { ...ans('mentor', 3, 2, 5), onBubble: () => bubbles.push('B') }), 'start');
  run(5);
  assert.deepEqual(bubbles.sort(), ['A', 'B']);
  assert.equal(says('hr').length, 2);
  assert.equal(says('mentor').length, 2);
  assert.equal(says('hr')[0][2], INTERVIEW.questions[0].text);
  assert.equal(says('mentor')[0][2], INTERVIEW.questions[3].text);
  assert.ok(!log.some((e) => e[1] === 'leader'));
  assert.equal(crew.light('leader', { clip: 'emote-yes', seconds: 1 }), false, '내 장면 중인 팀장에게 곁들이기 불가');
});

test('crew: 같은 의자에 이벤트가 연달아 오면 하나는 진행, 하나만 기다렸다 이어서 한다(최신이 이기고, 밀려난 것의 말풍선은 바로 보인다)', () => {
  const { crew, run, says } = rig();
  const shown = [];
  const mk = (name, q) => ({ ...ans('hr', q, 0), onBubble: () => shown.push([name, crew.clock]) });
  assert.equal(crew.remote('hr', 'R', mk('p1', 0)), 'start');
  run(0.5);
  assert.equal(crew.remote('hr', 'R', mk('p2', 1)), 'queue');
  run(0.3);
  assert.equal(crew.remote('hr', 'R', mk('p3', 2)), 'queue');
  assert.deepEqual(shown.map((s) => s[0]), ['p2'], '밀려난 p2 의 방문자 말풍선은 그 자리에서 바로 보인다(p1 은 아직 답변 순서 전)');
  run(7);
  const names = shown.map((s) => s[0]);
  assert.ok(names.includes('p1') && names.includes('p2') && names.includes('p3'), `모든 방문자 말풍선이 결국 보인다 ${names}`);
  const asked = says('hr').map((s) => s[2]);
  assert.ok(asked.includes(INTERVIEW.questions[0].text));
  assert.ok(!asked.includes(INTERVIEW.questions[1].text), '밀려난 p2 의 질문 연기는 하지 않는다');
  assert.ok(asked.includes(INTERVIEW.questions[2].text), '최신 p3 는 이어서 한다');
});

test('crew: 기다리던 일이 4초를 넘기면 버리고, 버려도 보낸 방문자의 말풍선은 띄운다', () => {
  const { crew, run, says } = rig();
  crew.claim('hr');
  const shown = [];
  assert.equal(crew.remote('hr', 'R', { ...ans('hr', 4, 0), onBubble: () => shown.push('x') }), 'queue');
  run(3.9);
  assert.equal(says('hr').length, 0);
  run(0.3);
  assert.deepEqual(shown, ['x'], '폐기되며 말풍선만');
  assert.equal(says('hr').length, 0, '질문 연기는 하지 않는다');
  crew.release('hr');
  assert.equal(crew.state('hr').kind, 'idle');
});

test('crew: 내 장면이 끝나면(release) 기다리던 다른 사람 장면이 이어진다', () => {
  const { crew, run, says } = rig();
  crew.claim('mentor');
  crew.remote('mentor', 'R', { ...ans('mentor', 5, 1), onBubble: () => {} });
  run(2);
  assert.equal(says('mentor').length, 0);
  crew.release('mentor');
  assert.equal(says('mentor').length, 1, '바로 질문을 시작');
  assert.equal(crew.state('mentor').owner, 'R');
});

test('crew: 가벼운 반응은 한가할 때만 — 하는 동안 담당 일이 오면 즉시 접는다(자세·튀기·한마디 정리)', () => {
  const { crew, state, speech, run } = rig();
  assert.equal(crew.light('mentor', { clip: 'emote-yes', clap: true, bounce: { amp: 0.03, freq: 5 }, seconds: 1.4, text: '오~' }, 'me'), true);
  assert.equal(state.mentor.pose, 'clap');
  assert.equal(speech.get('mentor'), '오~');
  assert.equal(crew.light('mentor', { clip: 'emote-no', seconds: 1 }, 'me'), false, '이미 가벼운 반응 중이면 건너뜀');
  run(0.3);
  crew.remote('mentor', 'rB', { ...ans('mentor', 3, 2), onBubble: () => {} });
  assert.equal(state.mentor.pose, null, '박수 자세를 접었다');
  assert.equal(state.mentor.bounce, null);
  assert.notEqual(speech.get('mentor'), '오~', '짧은 한마디도 걷었다(곧이어 질문이 뜬다)');
  run(1.3);
  assert.equal(crew.state('mentor').kind, 'primary', '원래 가벼운 반응 종료 시각이 지나도 담당 일은 그대로');
  run(5);
  assert.equal(crew.state('mentor').kind, 'idle');
  assert.equal(crew.light('mentor', { clip: 'emote-no', seconds: 1 }, 'me'), true, '끝난 뒤엔 다시 가능');
});

test('crew: 내 장면이 한가한 면접관의 가벼운 반응을 접고 담당으로 잡는다(claim 이 secondary 를 끊는다), 남의 담당 장면 중이면 못 잡는다', () => {
  const { crew, state } = rig();
  crew.light('hr', { clip: 'emote-yes', clap: true, seconds: 1.4 }, 'x');
  assert.equal(crew.claim('hr'), true);
  assert.equal(state.hr.pose, null);
  crew.release('hr');
  crew.remote('hr', 'R', { ...ans('hr'), onBubble: () => {} });
  assert.equal(crew.claim('hr'), false, '같은 의자의 남의 장면 중이면 내 장면이 시작하지 못한다');
});

test('crew: 완주 연출 — 다른 둘이 남의 장면 중이면 담당 혼자, 한가하면 셋(가벼운 반응 중인 둘은 접고 합류)', () => {
  const a = rig();
  a.crew.claim('leader');
  a.crew.remote('mentor', 'rB', { ...ans('mentor', 3, 0), onBubble: () => {} });
  assert.deepEqual(a.crew.claimFinale('leader'), ['leader']);
  assert.equal(a.crew.state('mentor').owner, 'rB', '남의 장면은 그대로');
  const b = rig();
  b.crew.claim('leader');
  b.crew.light('hr', { clip: 'emote-yes', clap: true, seconds: 1.4 }, 'me');
  assert.deepEqual(b.crew.claimFinale('leader'), ['leader', 'hr', 'mentor']);
  assert.equal(b.state.hr.pose, null, '가벼운 반응은 접혔다');
  assert.equal(b.crew.state('hr').owner, 'me');
  assert.equal(b.crew.state('mentor').owner, 'me');
  // 완주 중 들어온 원격 이벤트는 기다렸다가 완주가 끝나면(release) 한다.
  b.crew.remote('hr', 'rA', { ...ans('hr'), onBubble: () => {} });
  b.run(2);
  assert.equal(b.says('hr').length, 0);
  for (const id of ['hr', 'mentor', 'leader']) b.crew.release(id);
  assert.equal(b.says('hr').length, 1);
});

test('crew: 다른 방문자의 돌발행동 — 담당 면접관의 반응 대사·동작이 나오고 다른 면접관은 한가할 때만 가볍게 거든다', () => {
  const { crew, log, run, says } = rig();
  const sc = imp('hr', 'dance');
  assert.equal(sc.bubbleAt, 0);
  crew.remote('hr', 'R', { ...sc, onBubble: () => {} });
  run(6);
  const dance = INTERVIEW.improvs.find((i) => i.id === 'dance');
  assert.ok(says('hr').some((s) => s[2] === dance.hr), '담당의 돌발행동 반응 대사');
  assert.ok(log.some((e) => e[0] === 'spin' && e[1] === 'hr'));
  assert.ok(!log.some((e) => e[0] === 'spin' && e[1] !== 'hr'), '다른 면접관은 돌지 않는다');
  assert.ok(log.some((e) => e[0] === 'clip' && e[1] === 'leader'), '한가한 팀장은 가볍게 거든다');
  assert.ok(!says('leader').length || says('leader').every((s) => INTERVIEW.interjections.improv.includes(s[2])), '다른 면접관의 말은 아주 짧은 한마디뿐');
  // 이미 남의 장면 중인 면접관은 거들지 못한다.
  const r2 = rig();
  r2.crew.claim('mentor');
  r2.crew.remote('hr', 'R', { ...imp('hr', 'dance'), onBubble: () => {} });
  r2.run(6);
  assert.ok(!r2.log.some((e) => e[1] === 'mentor'));
});

test('crew: clear 는 모든 일을 접고, 기다리던 방문자 말풍선은 띄우지 않는다', () => {
  const { crew, state, log } = rig();
  crew.claim('leader');
  crew.remote('hr', 'R', { ...ans('hr'), onBubble: () => log.push(['bubble']) });
  crew.remote('leader', 'R2', { ...ans('leader'), onBubble: () => log.push(['bubble2']) });
  crew.clear();
  assert.ok(IDS.every((id) => crew.state(id).kind === 'idle'));
  assert.equal(state.hr.pose, null);
  assert.ok(!log.some((e) => e[0] === 'bubble' || e[0] === 'bubble2'));
});

test('crew: 속마음 — 보낸 방문자 머리 위 구름(onThink)이 답변 말풍선 뒤에, 속마음형은 구름 없이 반응만', () => {
  for (const [a, expectThink] of [[0, true], [2, false]]) {
    const { crew, run } = rig();
    const calls = [];
    const scene = ans('hr', 1, a);
    crew.remote('hr', 'rA', { ...scene, onBubble: () => calls.push(['bubble', crew.clock]), onThink: (e) => calls.push(['think', crew.clock, e.text]) });
    run(5);
    assert.equal(calls.some((c) => c[0] === 'think'), expectThink, `a=${a}`);
    if (expectThink) {
      assert.equal(calls[1][2], INTERVIEW.questions[1].answers[a].inner);
      assert.ok(calls[1][1] > calls[0][1], '말풍선 뒤에 구름');
    }
  }
});

test('crew: 큰절 — 담당 면접관이 숙였다가(tilt) 돌아오고, 끝나면 자세를 되돌린다(다른 둘은 가벼운 맞절)', () => {
  const { crew, log, run, state } = rig();
  crew.remote('leader', 'rA', { ...imp('leader', 'bow') });
  run(3);
  assert.ok(log.some((e) => e[0] === 'tilt' && e[1] === 'leader' && e[2] > 0), '숙임');
  assert.ok(log.some((e) => e[0] === 'tilt' && e[1] !== 'leader' && e[2] > 0), '다른 면접관의 가벼운 맞절');
  run(6);
  for (const id of IDS) assert.ok(!state[id].tilt, `${id} 숙임 해제`);
});

// 반응 스타일: 어떤 가중치 뽑기 결과가 나오든 효과(emote)가 면접관 이름으로 그려지고 끝나면 자세·기울임·고개가 모두 돌아온다.
test('crew: 반응 스타일 — 여러 번 뽑아도 효과·자세·기울임·고개가 그려지고, 끝나면 모두 되돌아온다', () => {
  const kinds = new Set();
  for (let seed = 1; seed <= 60; seed++) {
    const { crew, log, run, state } = rig();
    const type = seed % 3;
    crew.remote('hr', 'rA', ans('hr', 3, type, seed));
    run(9);
    for (const e of log) if (e[1] === 'hr' || e[0] === 'emote') kinds.add(e[0]);
    assert.ok(!state.hr.pose && !state.hr.tilt && !state.hr.yaw && !state.hr.bounce, `seed ${seed}: 끝나면 되돌린다`);
    assert.equal(crew.state('hr').kind, 'idle');
  }
  for (const k of ['emote', 'tilt', 'yaw', 'pose', 'bounce']) assert.ok(kinds.has(k), `${k} 가 나온다`);
});

test('crew: 가벼운 반응(light)은 손 번쩍·고개 돌리기·효과 하나까지 하고(동작 클립이 없어도), 끝나면 되돌린다', () => {
  const { crew, log, run, state } = rig();
  assert.equal(crew.light('mentor', { clip: 'emote-yes', pose: 'raise', yaw: 0.4, emote: 'thumb', seconds: 1.2 }, 'me'), true);
  assert.ok(log.some((e) => e[0] === 'pose' && e[2] === 'raise') && log.some((e) => e[0] === 'yaw' && e[2] === 0.4) && log.some((e) => e[0] === 'emote' && e[2] === 'thumb'));
  assert.equal(crew.light('hr', { emote: 'dots', seconds: 1 }, 'me'), true);
  run(3);
  assert.ok(!state.mentor.pose && !state.mentor.yaw);
});
