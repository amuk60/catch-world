import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createBagPicker, createRepeatFreePicker, createRound, openingFor, pickReactions, createTimeline,
  answerScript, improvScript, seatedImprov, EVENT_TYPES, validateInterview, IMPROV_IDS, remoteSayLine, remoteScene, finaleEvents, assignedImprov, ASK_CLIPS, REMOTE_BUBBLE_SECONDS, REMOTE_BUBBLE_AT, FAMILIES, MOVES, MOVE_WEIGHTS, REACTION_MIX, REACTION_MAX_LENGTH, pickReaction, TYPES,
} from '../src/logic/interview.js';
import * as INTERVIEW_LOGIC from '../src/logic/interview.js';
import { pickIndexFromCode } from '../src/logic/incinerator.js';
import { validateSay } from '../src/logic/net.js';
import { INTERVIEW, INTERVIEW_ROUND, INTERVIEW_ANSWER_SECONDS, INTERVIEW_IMPROV_SECONDS, INTERVIEW_FINALE_SECONDS, SPEECH_SECONDS, REDUCE_RANGE, INTERVIEW_BONUS_RANGE } from '../src/config.js';
import { mulberry32 } from '../src/logic/rng.js';

// ---- 질문 뽑기: 묶음(bag)을 다 돌아야 반복, 바로 앞과는 절대 같지 않다 ----
test('createBagPicker: n 개를 한 바퀴 모두 한 번씩 뽑은 뒤에야 반복한다', () => {
  const p = createBagPicker(12, mulberry32(1));
  for (let round = 0; round < 5; round++) {
    const seen = new Set();
    for (let i = 0; i < 12; i++) seen.add(p.next());
    assert.equal(seen.size, 12, `round ${round}`);
  }
});

test('createBagPicker: 바퀴가 바뀌는 자리에서도 직전과 같은 값이 연달아 나오지 않는다(여러 시드)', () => {
  for (let seed = 1; seed <= 200; seed++) {
    const p = createBagPicker(12, mulberry32(seed));
    let prev = -1;
    for (let i = 0; i < 100; i++) {
      const v = p.next();
      assert.notEqual(v, prev, `seed ${seed} i ${i}`);
      assert.ok(v >= 0 && v < 12);
      prev = v;
    }
  }
});

test('createBagPicker: 개수가 1 이면 어쩔 수 없이 같은 것, 0 이하는 오류', () => {
  const p = createBagPicker(1, mulberry32(1));
  assert.equal(p.next(), 0);
  assert.equal(p.next(), 0);
  assert.throws(() => createBagPicker(0), /1 이상/);
});

test('createBagPicker: 기본 난수(Math.random)로도 동작한다', () => {
  const p = createBagPicker(3);
  const a = p.next();
  assert.ok([0, 1, 2].includes(a));
});

test('createRepeatFreePicker: 같은 것이 두 번 연달아 나오지 않고 모든 값이 언젠가 나온다', () => {
  for (let seed = 1; seed <= 100; seed++) {
    const p = createRepeatFreePicker(4, mulberry32(seed));
    let prev = -1;
    const seen = new Set();
    for (let i = 0; i < 80; i++) {
      const v = p.next();
      assert.notEqual(v, prev);
      seen.add(v);
      prev = v;
    }
    assert.equal(seen.size, 4);
  }
});

test('createRepeatFreePicker: 난수가 극단(0, 0.999…)이어도 범위 안이고 반복하지 않는다', () => {
  for (const r of [() => 0, () => 0.9999999]) {
    const p = createRepeatFreePicker(4, r);
    let prev = -1;
    for (let i = 0; i < 10; i++) {
      const v = p.next();
      assert.ok(v >= 0 && v < 4);
      assert.notEqual(v, prev);
      prev = v;
    }
  }
});

// ---- 라운드: 5문항 연속 답하면 완주 ----
test('createRound: 답할 때마다 개수가 늘고, 마지막(5번째) 답에서만 finale 과 보너스, 그 뒤 처음으로', () => {
  const round = createRound(INTERVIEW_ROUND);
  assert.equal(round.count, 0);
  for (let i = 1; i < INTERVIEW_ROUND; i++) {
    const r = round.answer();
    assert.deepEqual(r, { count: i, finale: false });
    assert.equal(round.count, i);
  }
  const last = round.answer();
  assert.deepEqual(last, { count: INTERVIEW_ROUND, finale: true });
  assert.equal(round.count, 0, '완주하면 처음부터');
  assert.deepEqual(round.answer(), { count: 1, finale: false }, '새 라운드');
});

test('createRound: 한 라운드에 finale 은 정확히 한 번(보너스가 중복되지 않는다)', () => {
  const round = createRound(5);
  let finales = 0;
  for (let i = 0; i < 5 * 7; i++) if (round.answer().finale) finales++;
  assert.equal(finales, 7);
});

test('createRound: reset 은 중간에서 처음으로 되돌린다', () => {
  const round = createRound(5);
  round.answer();
  round.answer();
  assert.equal(round.count, 2);
  round.reset();
  assert.equal(round.count, 0);
  assert.equal(round.answer().count, 1);
});

test('createRound: total 이 1 이상이어야 한다', () => {
  assert.throws(() => createRound(0), /1 이상/);
});

// ---- 옷 상태 -> 첫 대사 ----
test('openingFor: clean=정장, dirty=그을음, tank/drying/dry=나시 대사', () => {
  const o = INTERVIEW.openings;
  assert.equal(openingFor(o, 'clean'), o.suit);
  assert.equal(openingFor(o, 'dirty'), o.soot);
  for (const s of ['tank', 'drying', 'dry']) assert.equal(openingFor(o, s), o.tank, s);
  assert.match(o.suit, /첫 질문/);
});

test('openingFor: 세 겉모습의 대사가 서로 다르고 비어 있지 않다', () => {
  const texts = [INTERVIEW.openings.suit, INTERVIEW.openings.soot, INTERVIEW.openings.tank];
  assert.equal(new Set(texts).size, 3);
  for (const t of texts) assert.ok(t.length > 0);
});

// ---- 반응 대사 ----
test('pickReactions: 세 면접관 모두의 { 대사, 스타일, 동작 }을 돌려주고 대사는 설정의 그 스타일 후보다', () => {
  for (const type of INTERVIEW.types) {
    const lines = pickReactions(INTERVIEW.reactions, type, mulberry32(7));
    assert.deepEqual(Object.keys(lines).sort(), ['hr', 'leader', 'mentor']);
    for (const [id, r] of Object.entries(lines)) {
      assert.ok(FAMILIES.includes(r.family), `${type} ${id} 스타일`);
      assert.ok(INTERVIEW.reactions[type][id][r.family].includes(r.text), `${type} ${id}`);
      assert.equal(MOVES[r.move].family, r.family, `${type} ${id} 동작은 스타일에 맞다`);
    }
  }
  assert.throws(() => pickReactions(INTERVIEW.reactions, '없는종류', Math.random), /없는종류/);
});

test('반응 스타일: 종류·면접관마다 가중치 합이 1이고 설정의 스타일 대사와 일치하며(2개 이상·28자·합쳐 4개 이상), 뽑으면 가중치대로 나온다', () => {
  for (const type of INTERVIEW.types) {
    for (const id of ['leader', 'hr', 'mentor']) {
      const mix = REACTION_MIX[type][id];
      assert.ok(Math.abs(Object.values(mix).reduce((a, b) => a + b, 0) - 1) < 1e-9, `${type}/${id} 합 1`);
      assert.deepEqual(Object.keys(INTERVIEW.reactions[type][id]).sort(), Object.keys(mix).sort(), `${type}/${id} 대사가 있는 스타일 = 가중치 스타일`);
      const lines = Object.values(INTERVIEW.reactions[type][id]).flat();
      assert.ok(lines.length >= 4 && lines.every((t) => t.length <= REACTION_MAX_LENGTH), `${type}/${id}`);
      for (const list of Object.values(INTERVIEW.reactions[type][id])) assert.ok(list.length >= 2);
    }
  }
  const tally = (type, id, n = 3000) => {
    const rng = mulberry32(11);
    const c = {};
    for (let i = 0; i < n; i++) { const f = pickReaction(type, id, rng).family; c[f] = (c[f] ?? 0) + 1 / n; }
    return c;
  };
  for (const id of ['leader', 'hr', 'mentor']) {
    const m = tally('모범형', id);
    assert.ok(m.유쾌 > 0.6 && m.감탄 > 0.2 && !m.황당, `모범형 ${id} 대부분 유쾌, 가끔 감탄`);
    const w = tally('4차원형', id);
    assert.ok(w.황당 + w.당혹 > 0.65 && w.유쾌 > 0.1, `4차원형 ${id} 황당·당혹이 대부분, 가끔 유쾌`);
  }
  assert.deepEqual(Object.keys(REACTION_MIX), ['모범형', '4차원형'], '속마음형 반응표는 없다');
  assert.deepEqual(Object.keys(INTERVIEW.reactions), ['모범형', '4차원형']);
  assert.throws(() => pickReaction('속마음형', 'hr', Math.random), /속마음형/);
});

test('반응 동작: 4가지 스타일을 모두 다룬다(당혹·황당·유쾌·감탄), 웃는 동작만 폭소 소리(튀기 freq 5 이상)를 낸다', () => {
  assert.deepEqual([...new Set(Object.values(MOVES).map((m) => m.family))].sort(), [...FAMILIES].sort());
  assert.deepEqual([...FAMILIES].sort(), ['감탄', '당혹', '유쾌', '황당'].sort(), '속마음형 전용 당황은 없다');
  const used = new Set(TYPES.flatMap((type) => Object.values(REACTION_MIX[type]).flatMap((mix) => Object.keys(mix))));
  assert.deepEqual([...used].sort(), [...FAMILIES].sort(), '쓰이지 않는 스타일이 없다');
  assert.ok(Object.keys(MOVES).length >= 12);
  for (const [name, m] of Object.entries(MOVES)) {
    assert.ok(m.family && FAMILIES.includes(m.family), name);
    for (const [emote, delay] of m.emotes ?? []) assert.ok(typeof emote === 'string' && delay >= 0 && delay <= 1, `${name} ${emote}`);
    if (m.bounce && m.family !== '유쾌') assert.ok(m.bounce.freq < 5, `${name} 폭소 소리가 나면 안 된다`);
  }
  for (const fam of FAMILIES) for (const id of ['leader', 'hr', 'mentor']) for (const m of Object.keys(MOVE_WEIGHTS[fam][id])) assert.equal(MOVES[m].family, fam, `${fam}/${id}/${m}`);
  assert.ok(Object.values(MOVES).some((m) => m.tilt < 0), '의자째 뒤로 젖히는 동작');
  assert.ok(['puff', 'pen', 'sweat'].every((e) => Object.values(MOVES).some((m) => m.emotes?.some(([n]) => n === e))), '커피 뿜기·펜·땀방울 효과');
});

// ---- 시간표 ----
test('createTimeline: 시각 순서대로 이벤트를 내보내고, 큰 dt 에서도 한 번씩만, 마지막은 end', () => {
  const tl = createTimeline([{ t: 0.5, type: 'say', who: 'player', text: 'b' }, { t: 0, type: 'clip', who: 'player', name: 'idle' }, { t: 2, type: 'end' }]);
  assert.deepEqual(tl.update(0).map((e) => e.type), ['clip']);
  assert.deepEqual(tl.update(0.4), []);
  assert.deepEqual(tl.update(0.2).map((e) => e.type), ['say']);
  assert.equal(tl.done, false);
  assert.deepEqual(tl.update(10).map((e) => e.type), ['end']);
  assert.equal(tl.done, true);
  assert.deepEqual(tl.update(10), []);
  assert.equal(tl.duration, 2);
});

test('createTimeline: 같은 시각 이벤트는 넘겨 준 순서를 지킨다', () => {
  const tl = createTimeline([{ t: 1, type: 'a' }, { t: 1, type: 'b' }, { t: 1, type: 'c' }, { t: 1, type: 'end' }]);
  assert.deepEqual(tl.update(1).map((e) => e.type), ['a', 'b', 'c', 'end']);
});

// ---- 연출 대본 ----
const WHO = new Set(['player', 'leader', 'hr', 'mentor']);
const LINES = { leader: '팀장 반응', hr: '인사 반응', mentor: '사수 반응' };
const opts = { speech: SPEECH_SECONDS, total: INTERVIEW_ANSWER_SECONDS, finaleSeconds: INTERVIEW_FINALE_SECONDS, finaleText: INTERVIEW.finale };

function assertScript(events, label) {
  assert.ok(events.length > 3, label);
  let prev = -Infinity;
  for (const e of events) {
    assert.ok(EVENT_TYPES.includes(e.type), `${label} 모르는 이벤트 ${e.type}`);
    assert.ok(Number.isFinite(e.t) && e.t >= 0, `${label} t`);
    assert.ok(e.t >= prev - 1e-9, `${label} 정렬 ${e.type}@${e.t}`);
    prev = e.t;
    if (e.who !== undefined) assert.ok(WHO.has(e.who), `${label} who ${e.who}`);
    if (e.type === 'say') assert.ok(typeof e.text === 'string' && e.text.length > 0 && e.seconds > 0, `${label} say`);
    if (e.type === 'clip') assert.ok(e.name, `${label} clip`);
  }
  const end = events.filter((e) => e.type === 'end');
  assert.equal(end.length, 1, `${label} end 하나`);
  assert.equal(events[events.length - 1], end[0], `${label} end 가 마지막`);
}

test('answerScript: 종류마다 효과(감소)가 정확히 한 번, 말풍선은 플레이어 대사 + 담당 면접관 반응 하나(다른 둘은 light)', () => {
  for (const type of INTERVIEW.types) {
    const ev = answerScript({ type, line: '내가 할 말', lines: LINES, ...opts });
    assertScript(ev, type);
    assert.equal(ev.filter((e) => e.type === 'effect').length, 1, `${type} effect`);
    assert.equal(ev.filter((e) => e.type === 'bonus').length, 0, '완주가 아니면 보너스 없음');
    const says = ev.filter((e) => e.type === 'say');
    assert.equal(says[0].who, 'player');
    assert.equal(says[0].text, '내가 할 말');
    assert.deepEqual(says.slice(1).map((e) => e.who), ['leader'], '반응 말풍선은 담당(기본 leader) 한 명');
    assert.equal(says[1].text, LINES.leader);
    assert.deepEqual(ev.filter((e) => e.type === 'light').map((e) => e.who).sort(), ['hr', 'mentor'], '다른 둘은 가벼운 반응');
    // 효과는 플레이어가 답하는 순간(반응보다 먼저), 종류와 무관하게 같은 시각.
    const effect = ev.find((e) => e.type === 'effect');
    assert.ok(effect.t < says[1].t, '효과가 반응보다 먼저');
    assert.equal(effect.t, says[0].t, '답하는 순간');
    assert.ok(ev[ev.length - 1].t >= INTERVIEW_ANSWER_SECONDS - 1e-9, '길이가 기준 이상');
  }
});

test('answerScript: 효과 시각과 시간표 구조가 세 종류에서 같다(감소는 종류와 무관)', () => {
  const times = INTERVIEW.types.map((type) => answerScript({ type, line: '같은 길이 대사', lines: LINES, ...opts }).find((e) => e.type === 'effect').t);
  assert.equal(new Set(times).size, 1);
});

test('answerScript: 종류별 연출 — 모범형은 박수, 4차원형은 튀어 오르는 폭소(플레이어도 더 크게)(문자열 대사의 기본 동작)', () => {
  const find = (type) => answerScript({ type, line: '대사', lines: LINES, ...opts });
  const clap = find('모범형').filter((e) => e.type === 'pose' && e.name === 'clap');
  assert.equal(clap.length, 1, '담당 면접관 한 명만 박수 자세');
  assert.equal(find('모범형').filter((e) => e.type === 'light').length, 2, '다른 둘의 가벼운 반응');
  assert.throws(() => find('속마음형'), /속마음형/, '속마음형 답변은 없다');
  const funny = find('4차원형');
  assert.ok(funny.some((e) => e.type === 'fx' && e.who === 'player' && e.fx.bounce), '4차원형은 플레이어도 튄다');
  assert.equal(funny.filter((e) => e.type === 'fx' && e.who !== 'player' && e.fx.bounce).length, 1, '담당 면접관 폭소');
  const bounces = funny.filter((e) => e.type === 'light').map((e) => e.spec.bounce?.amp ?? 0);
  assert.ok(bounces.length === 2, '다른 둘은 가벼운 반응');
  assert.ok(!find('모범형').some((e) => e.type === 'fx' && e.who === 'player' && e.fx.bounce), '모범형은 튀지 않는다');
});

test('answerScript: finale 이면 일어나 박수 -> 최종 합격! 말풍선 -> 보너스 한 번 -> 다시 앉기, 길이도 늘어난다', () => {
  const plain = answerScript({ type: '모범형', line: '대사', lines: LINES, ...opts });
  const fin = answerScript({ type: '모범형', line: '대사', lines: LINES, ...opts, finale: true });
  assertScript(fin, 'finale');
  assert.equal(fin.filter((e) => e.type === 'effect').length, 1, '답변 감소는 그대로 한 번');
  assert.equal(fin.filter((e) => e.type === 'bonus').length, 1, '보너스 한 번');
  const stand = fin.filter((e) => e.type === 'stand');
  assert.deepEqual(stand.map((e) => e.who).sort(), ['hr', 'leader', 'mentor']);
  const bonus = fin.find((e) => e.type === 'bonus');
  const say = fin.filter((e) => e.type === 'say').find((e) => e.text === INTERVIEW.finale);
  assert.ok(say && say.who === 'leader');
  assert.ok(stand.every((e) => e.t < bonus.t), '일어난 뒤에 합격');
  assert.equal(say.t, bonus.t, '"최종 합격!" 이 뜨는 순간 보너스');
  assert.ok(fin.some((e) => e.type === 'sit'), '끝에 다시 앉는다');
  assert.ok(fin[fin.length - 1].t >= plain[plain.length - 1].t + INTERVIEW_FINALE_SECONDS - 1e-9);
  const lastSit = Math.max(...fin.filter((e) => e.type === 'sit').map((e) => e.t));
  assert.ok(lastSit < fin[fin.length - 1].t);
});

test('answerScript: 종류를 모르면 오류', () => {
  assert.throws(() => answerScript({ type: '없는', line: 'x', lines: LINES, ...opts }), /없는/);
});

test('improvScript: 돌발행동 4개 모두 — 정렬·유효 이벤트·효과 정확히 한 번·길이 약 INTERVIEW_IMPROV_SECONDS', () => {
  assert.deepEqual([...IMPROV_IDS].sort(), INTERVIEW.improvs.map((i) => i.id).sort());
  for (const improv of INTERVIEW.improvs) {
    const ev = improvScript(improv, { total: INTERVIEW_IMPROV_SECONDS });
    assertScript(ev, improv.id);
    assert.equal(ev.filter((e) => e.type === 'effect').length, 1, `${improv.id} effect`);
    assert.equal(ev.filter((e) => e.type === 'bonus').length, 0);
    const end = ev[ev.length - 1].t;
    assert.ok(end >= INTERVIEW_IMPROV_SECONDS - 1e-9 && end <= INTERVIEW_IMPROV_SECONDS + 1.5, `${improv.id} 길이 ${end}`);
    const says = ev.filter((e) => e.type === 'say');
    for (const line of improv.player) assert.ok(says.some((s) => s.who === 'player' && s.text === line), `${improv.id} ${line}`);
    for (const id of ['leader', 'hr', 'mentor']) assert.ok(says.some((s) => s.who === id && s.text === improv[id]), `${improv.id} ${id}`);
    const effect = ev.find((e) => e.type === 'effect');
    assert.ok(effect.t > 0 && effect.t < end - 1, `${improv.id} 효과는 중간 순간`);
  }
});

test('improvScript: 연출 특징 — 서류 던지기는 종이가 날고, 춤은 모두 튀고 돌고, 만세는 책상 위로 올라갔다 내려온다', () => {
  const by = (id) => improvScript(INTERVIEW.improvs.find((i) => i.id === id), { total: INTERVIEW_IMPROV_SECONDS });
  assert.ok(by('paperToss').some((e) => e.type === 'papers'));
  assert.ok(by('paperToss').some((e) => e.type === 'face' && e.target === 'door'));
  const dance = by('dance');
  for (const who of ['player', 'leader', 'hr', 'mentor']) {
    assert.ok(dance.some((e) => e.type === 'fx' && e.who === who && e.fx.bounce), `${who} bounce`);
    assert.ok(dance.some((e) => e.type === 'fx' && e.who === who && e.fx.spin), `${who} spin`);
  }
  const banzai = by('banzai');
  const moves = banzai.filter((e) => e.type === 'move');
  assert.deepEqual(moves.map((e) => e.to), ['desk', 'home']);
  assert.ok(moves[0].t < moves[1].t);
  assert.ok(by('reverse').filter((e) => e.type === 'say' && e.who === 'player').length >= 4, '역질문은 연달아');
});

test('improvScript: 모르는 id 는 오류', () => {
  assert.throws(() => improvScript({ id: 'nope', player: ['a'], leader: 'b', hr: 'c', mentor: 'd' }, { total: 5 }), /nope/);
});

// ---- INTERVIEW 설정 검증 ----
test('INTERVIEW: 질문 12개, 각 질문은 모범형·4차원형 정확히 2개(키 1~2), 글자 길이·질문자 규칙을 지키고 속마음(inner)은 없다', () => {
  assert.deepEqual(validateInterview(INTERVIEW), []);
  assert.equal(INTERVIEW.questions.length, 12);
  const ids = INTERVIEW.interviewers.map((i) => i.id);
  assert.deepEqual(ids, ['leader', 'hr', 'mentor']);
  assert.equal(new Set(INTERVIEW.interviewers.map((i) => i.model)).size, 3, '서로 다른 캐릭터 모델');
  for (const q of INTERVIEW.questions) {
    assert.ok(ids.includes(q.asker));
    assert.ok(q.text.length > 0 && q.text.length <= 40, q.text);
    assert.deepEqual(q.answers.map((a) => a.type).sort(), [...INTERVIEW.types].sort(), q.text);
    assert.equal(q.answers.length, 2, q.text);
    assert.deepEqual(q.answers.map((a) => a.type), ['모범형', '4차원형'], '번호 0~1 = 키 1~2 순서');
    for (const a of q.answers) assert.ok(a.text.length > 0 && a.text.length <= 38, a.text);
    for (const a of q.answers) assert.deepEqual(Object.keys(a).sort(), ['text', 'type'], `속마음(inner) 같은 다른 필드 없음: ${a.text}`);
  }
  assert.equal(new Set(INTERVIEW.questions.flatMap((q) => q.answers.map((a) => a.text))).size, 24, '답변 24개 모두 다르다');
  assert.ok(!JSON.stringify(INTERVIEW.questions).includes('속마음'), '질문·답변에 속마음이 없다');
  assert.ok(INTERVIEW.questions.every((q) => !/솔직형|정석형|엉뚱형/.test(JSON.stringify(q))), '옛 솔직형은 없다');
  assert.equal(INTERVIEW.improvs.length, 9);
  assert.equal(new Set(INTERVIEW.improvs.map((i) => i.id)).size, 9, '돌발행동 id 중복 없음');
  assert.ok(!INTERVIEW.improvs.some((i) => i.id === 'heart') && !IMPROV_IDS.includes('heart'), '속마음 방송은 없다');
  assert.ok(INTERVIEW.improvs.every((i) => !('inner' in i)), '돌발행동에는 속마음 구름이 없다');
  assert.deepEqual(INTERVIEW.types, ['모범형', '4차원형']);
  assert.deepEqual(TYPES, INTERVIEW.types);
  assert.equal(INTERVIEW.finale, '최종 합격!');
});

test('validateInterview: 잘못된 설정은 문제 목록으로 알려 준다', () => {
  const bad = structuredClone(INTERVIEW);
  bad.questions[0].answers = bad.questions[0].answers.slice(0, 1);
  bad.questions[3].answers.push({ type: '속마음형', text: '옛 속마음형 답' }); // 3번째 답(옛 속마음형)은 거부
  bad.questions[4].answers[0].inner = '(옛 속마음)'; // 남은 inner 는 검증과 무관(쓰이지 않는다)
  bad.questions[1].answers[0].text = '가'.repeat(60);
  bad.questions[2].asker = '유령';
  bad.openings.soot = '';
  bad.improvs.pop();
  const problems = validateInterview(bad);
  assert.ok(problems.length >= 5, problems.join('\n'));
  assert.ok(problems.some((p) => p.includes('돌발행동')));
  assert.ok(problems.some((p) => p.includes('첫 대사')));
  assert.ok(problems.some((p) => p.startsWith('질문 1:') && p.includes('모두 2개')), '답 1개는 거부');
  assert.ok(problems.some((p) => p.startsWith('질문 4:') && p.includes('모두 2개')), '답 3개(옛 속마음형)는 거부');
  assert.ok(!problems.some((p) => p.startsWith('질문 5:')), 'inner 는 검사하지 않는다');
});

// ---- 감소량 규칙(설정) ----
test('설정: 완주 보너스는 별도 범위(10~12)이고 답변 감소량은 다른 행동과 같은 REDUCE_RANGE(7~12)', () => {
  assert.equal(INTERVIEW_ROUND, 5);
  assert.deepEqual(INTERVIEW_BONUS_RANGE, { min: 10, max: 12 });
  assert.deepEqual(REDUCE_RANGE, { min: 7, max: 12 });
});

test('answerScript: 최종 합격! 말풍선만 큰 글씨(big)이고 다른 말풍선은 아니다', () => {
  const fin = answerScript({ type: '모범형', line: '대사', lines: LINES, ...opts, finale: true });
  const bigs = fin.filter((e) => e.type === 'say' && e.big);
  assert.deepEqual(bigs.map((e) => e.text), [INTERVIEW.finale]);
});

// ---- 의자에 앉아서 하는 면접 ----
test('answerScript(seated): 서서 하는 동작 클립 없이 앉은 자세 그대로 몸을 튀겨 답한다 — 엉뚱이 가장 크고, 감소·반응·완주 규칙은 그대로', () => {
  const seatedOf = (type, extra = {}) => answerScript({ type, line: '대사', lines: LINES, ...opts, seated: true, ...extra });
  for (const type of INTERVIEW.types) {
    const ev = seatedOf(type);
    assertScript(ev, `seated ${type}`);
    assert.ok(!ev.some((e) => e.type === 'clip' && e.who === 'player'), `${type}: 플레이어 클립(서서 하는 동작) 없음`);
    const bob = ev.find((e) => e.type === 'fx' && e.who === 'player' && e.fx.bounce);
    assert.ok(bob && bob.fx.bounce.amp > 0 && bob.fx.bounce.lean > 0, `${type}: 위아래 + 앞으로 숙임`);
    const off = ev.filter((e) => e.type === 'fx' && e.who === 'player' && e.fx.bounce === null);
    assert.equal(off.length, 1, `${type}: 튀기를 끈다`);
    assert.ok(off[0].t > bob.t);
    assert.equal(ev.filter((e) => e.type === 'effect').length, 1);
    const plain = answerScript({ type, line: '대사', lines: LINES, ...opts });
    assert.deepEqual(ev.filter((e) => e.type === 'say'), plain.filter((e) => e.type === 'say'), `${type}: 말풍선은 그대로`);
    assert.equal(ev[ev.length - 1].t, plain[plain.length - 1].t, `${type}: 길이는 그대로`);
  }
  const amp = (type) => seatedOf(type).find((e) => e.type === 'fx' && e.who === 'player' && e.fx.bounce).fx.bounce;
  assert.ok(amp('4차원형').amp > amp('모범형').amp);
  assert.ok(amp('4차원형').lean > amp('모범형').lean);
  const fin = seatedOf('모범형', { finale: true });
  assertScript(fin, 'seated finale');
  assert.equal(fin.filter((e) => e.type === 'bonus').length, 1);
  assert.deepEqual(fin.filter((e) => e.type === 'stand').map((e) => e.who).sort(), ['hr', 'leader', 'mentor'], '일어서는 건 면접관뿐');
  assert.ok(!seatedOf('모범형').some((e) => e.type === 'stand' || e.type === 'sit'));
});

test('seatedImprov: 앞에 일어나 나오기, 뒤에 돌아와 앉기를 붙이고 원래 대본은 그만큼 늦춘다(효과 한 번, 순서·end 규칙 유지)', () => {
  for (const improv of INTERVIEW.improvs) {
    const base = improvScript(improv, { total: INTERVIEW_IMPROV_SECONDS });
    const ev = seatedImprov(base, { standSeconds: 0.5, sitSeconds: 0.5 });
    assertScript(ev, `seated ${improv.id}`);
    assert.equal(ev.filter((e) => e.type === 'effect').length, 1, `${improv.id} effect`);
    assert.equal(ev.filter((e) => e.type === 'bonus').length, 0);
    const stand = ev.find((e) => e.type === 'stand' && e.who === 'player');
    const out = ev.find((e) => e.type === 'move' && e.to === 'stand');
    assert.equal(stand.t, 0);
    assert.equal(out.t, 0);
    assert.equal(out.seconds, 0.5);
    const back = ev.find((e) => e.type === 'move' && e.to === 'seat');
    const sit = ev.find((e) => e.type === 'sit' && e.who === 'player');
    assert.equal(sit.t, back.t);
    assert.equal(back.seconds, 0.5);
    const rest = ev.filter((e) => e !== stand && e !== out && e !== back && e !== sit && e.type !== 'end');
    assert.equal(rest.length, base.filter((e) => e.type !== 'end').length, `${improv.id} 원래 이벤트가 모두 남는다`);
    for (const e of rest) assert.ok(e.t >= 0.5 - 1e-9, `${improv.id} 일어난 뒤에 시작`);
    const lastOld = Math.max(...base.map((e) => e.t));
    assert.ok(back.t >= lastOld + 0.5 - 1e-9, `${improv.id} 원래 연출이 다 끝난 뒤에 앉는다`);
    assert.ok(ev.filter((e) => e.t > back.t && e.type !== 'end').length === 0, '앉은 뒤에는 다른 연출 없음');
    const end = ev[ev.length - 1];
    assert.ok(end.t >= back.t + back.seconds - 1e-9, '다 앉은 뒤에 끝');
    // 원래 시간차(효과 순간 등)는 그대로 유지된다.
    const eff = ev.find((e) => e.type === 'effect');
    assert.ok(Math.abs(eff.t - base.find((e) => e.type === 'effect').t - 0.5) < 1e-9);
  }
});

test('seatedImprov: 만세는 책상 위로 올라갔다(desk) 서 있던 자리로 내려온다(home) — 일어난 자리가 home, 마지막에 의자(seat)', () => {
  const banzai = INTERVIEW.improvs.find((i) => i.id === 'banzai');
  const moves = seatedImprov(improvScript(banzai, { total: INTERVIEW_IMPROV_SECONDS })).filter((e) => e.type === 'move').map((e) => e.to);
  assert.deepEqual(moves, ['stand', 'desk', 'home', 'seat']);
});

test('seatedImprov: 입력 대본을 바꾸지 않는다', () => {
  const base = improvScript(INTERVIEW.improvs[0], { total: INTERVIEW_IMPROV_SECONDS });
  const copy = JSON.parse(JSON.stringify(base));
  seatedImprov(base);
  assert.deepEqual(base, copy);
});

test('예비 사수: 설정 이름·id, 말투에서 막내 느낌이 나는 대사가 없다', () => {
  const m = INTERVIEW.interviewers.find((i) => i.id === 'mentor');
  assert.equal(m.name, '예비 사수');
  assert.ok(!INTERVIEW.interviewers.some((i) => i.id === 'junior' || i.name === '막내'));
  const texts = [
    ...INTERVIEW.questions.filter((q) => q.asker === 'mentor').map((q) => q.text),
    ...Object.values(INTERVIEW.reactions).flatMap((r) => r.mentor),
    ...INTERVIEW.improvs.map((i) => i.mentor),
  ];
  assert.ok(texts.length >= 3 + 6 + 4);
  for (const t of texts) assert.ok(!/저, 저도|어떡해|죄송해요|괜찮을까요|눈치/.test(t), t);
  assert.equal(INTERVIEW.questions.filter((q) => q.asker === 'mentor').length, 3, '질문 던지기 차례 유지');
});

// ---- 다른 방문자의 말 보기(멀티플레이): 번호로 내 config 에서 글을 찾는다 ----

test('remoteSayLine: 답변은 질문 q 의 a 번째 답변 글·종류·질문자를, 돌발행동은 id 의 첫 대사를 돌려준다', () => {
  for (let q = 0; q < INTERVIEW.questions.length; q++) {
    for (let a = 0; a < 2; a++) {
      const line = remoteSayLine(INTERVIEW, { ty: 'ans', q, a });
      const src = INTERVIEW.questions[q];
      assert.deepEqual(line, { text: src.answers[a].text, type: src.answers[a].type, asker: src.asker, improvId: null });
    }
  }
  for (const im of INTERVIEW.improvs) assert.deepEqual(remoteSayLine(INTERVIEW, { ty: 'imp', imp: im.id }), { text: im.player[0], type: null, asker: null, improvId: im.id });
  assert.ok(REMOTE_BUBBLE_SECONDS >= 2 && REMOTE_BUBBLE_SECONDS <= 4);
});

test('remoteSayLine: config 에 없는 번호·id·이상한 입력은 null', () => {
  for (const say of [null, undefined, {}, { ty: 'ans', q: 99, a: 0 }, { ty: 'ans', q: 0, a: 2 }, { ty: 'ans', q: 0, a: 3 }, { ty: 'ans', q: -1, a: 0 }, { ty: 'imp', imp: 'nope' }, { ty: 'x' }]) assert.equal(remoteSayLine(INTERVIEW, say), null, JSON.stringify(say));
  assert.equal(remoteSayLine({ questions: [], improvs: [] }, { ty: 'ans', q: 0, a: 0 }), null);
});

// ---- 속마음 없음 · 답변 2유형 · 새 돌발행동 ----
test('속마음 삭제: 생각 구름 이벤트·상수가 없고, answerScript 는 inner 를 받아도 구름을 만들지 않는다', () => {
  assert.ok(!EVENT_TYPES.includes('think') && !EVENT_TYPES.includes('remoteThink'), '구름 이벤트 종류 없음');
  for (const name of ['INNER_AT', 'INNER_SECONDS', 'INNER_MAX_LENGTH']) assert.equal(INTERVIEW_LOGIC[name], undefined, `${name} 없음`);
  for (const type of TYPES) {
    const plain = answerScript({ type, line: '대사 하나', lines: LINES, ...opts, rng: mulberry32(4) });
    const withInner = answerScript({ type, line: '대사 하나', lines: LINES, ...opts, rng: mulberry32(4), inner: '(옛 속마음)' });
    assert.deepEqual(withInner, plain, `${type}: 남은 inner 인자는 무시한다`);
    assert.ok(!plain.some((e) => e.type === 'think'));
  }
});

test('답변 2유형: 키 1~2 만 답변을 고르고(3 이상은 무시), 종류를 모르면 오류', () => {
  assert.deepEqual(TYPES, ['모범형', '4차원형']);
  const n = INTERVIEW.types.length;
  assert.equal(n, 2);
  assert.equal(pickIndexFromCode('Digit1', n), 0);
  assert.equal(pickIndexFromCode('Numpad1', n), 0);
  assert.equal(pickIndexFromCode('Digit2', n), 1);
  assert.equal(pickIndexFromCode('Numpad2', n), 1);
  for (const code of ['Digit3', 'Numpad3', 'Digit9', 'Digit0', 'KeyA']) assert.equal(pickIndexFromCode(code, n), -1, code);
  for (const q of INTERVIEW.questions) assert.equal(q.answers.length, n, '모든 질문의 답변 수 = 선택 키 수');
  assert.throws(() => answerScript({ type: '속마음형', line: '대사', lines: LINES, ...opts }), /속마음형/);
});

test('멀티플레이 호환: 옛 클라이언트가 보낸 속마음형(a=2)·범위 밖 번호·thought 필드는 오류 없이 버리거나 지운다', () => {
  const limits = { questions: INTERVIEW.questions.length, answers: Math.max(...INTERVIEW.questions.map((q) => q.answers.length)), improvs: [...IMPROV_IDS] };
  assert.equal(limits.answers, 2, '받는 쪽 허용 범위는 답변 2개');
  const base = { k: 'say', id: 'peer00001', space: 'interview', ty: 'ans', q: 1 };
  for (const a of [0, 1]) assert.deepEqual(validateSay({ ...base, a }, limits), { id: 'peer00001', space: 'interview', ty: 'ans', q: 1, a });
  for (const a of [2, 3, -1, 1.5, '1', null]) {
    assert.doesNotThrow(() => validateSay({ ...base, a }, limits));
    assert.equal(validateSay({ ...base, a }, limits), null, `a=${a} 는 버린다`);
  }
  const withThought = validateSay({ ...base, a: 0, thought: '(옛 속마음)', inner: '(옛 속마음)' }, limits);
  assert.deepEqual(withThought, { id: 'peer00001', space: 'interview', ty: 'ans', q: 1, a: 0 }, 'thought·inner 는 복사하지 않는다');
  // 검증을 건너뛴 값이 오더라도 장면은 오류 없이 null
  assert.doesNotThrow(() => remoteScene(INTERVIEW, { ty: 'ans', q: 1, a: 2 }, 'hr'));
  assert.equal(remoteScene(INTERVIEW, { ty: 'ans', q: 1, a: 2 }, 'hr'), null);
  assert.equal(remoteSayLine(INTERVIEW, { ty: 'ans', q: 1, a: 2 }), null);
});

test('면접관 반응 효과: 물음표·느낌표 마크(exclaim·question·exqu)를 쓰지 않고, 몸짓(클립·기울임·고개·튀기)은 그대로 보인다', () => {
  const MARKS = ['exclaim', 'question', 'exqu'];
  for (const [name, m] of Object.entries(MOVES)) {
    assert.ok(!(m.emotes ?? []).some(([n]) => MARKS.includes(n)), `${name}: 마크 없음`);
    assert.ok(m.clip || m.tilt || m.yaw || m.bounce || m.pose || (m.emotes ?? []).length, `${name}: 마크가 없어도 보이는 연출이 있다`);
  }
  assert.ok(MOVES.wow.tilt > 0 && MOVES.wow.clip, '감탄은 앞으로 숙이는 몸짓');
  assert.ok(MOVES.huh.tilt > 0 && MOVES.huh.clip, '"어?"도 몸짓으로');
  assert.ok(MOVES.turn.yaw > 0, '고개 돌리기는 그대로');
  const seen = new Set();
  for (let seed = 1; seed <= 200; seed++) {
    for (const type of TYPES) {
      for (const assigned of ['leader', 'hr', 'mentor']) {
        const rng = mulberry32(seed);
        const ev = answerScript({ type, line: '대사', lines: pickReactions(INTERVIEW.reactions, type, rng), assigned, ...opts, rng });
        for (const e of ev.filter((x) => x.type === 'emote')) seen.add(e.name);
        for (const e of ev.filter((x) => x.type === 'light')) if (e.spec.emote) seen.add(e.spec.emote);
      }
    }
  }
  assert.ok(!MARKS.some((n) => seen.has(n)), `마크가 나오지 않는다: ${[...seen]}`);
  for (const name of ['sweat', 'dots', 'cough', 'laugh']) assert.ok(seen.has(name), `효과 ${name} 는 그대로`);
});

test('모든 반응 동작 대본: 각 동작은 담당 면접관 이벤트(클립·자세·기울임·고개·효과)로 풀리고 말풍선 3초 안에 끝난다', () => {
  for (const [name, move] of Object.entries(MOVES)) {
    const ev = answerScript({ type: '모범형', line: '대사', lines: { leader: { text: '반응 대사입니다', move: name }, hr: '인사', mentor: '사수' }, assigned: 'leader', ...opts });
    assertScript(ev, name);
    const own = ev.filter((e) => e.who === 'leader');
    const sayEv = own.find((e) => e.type === 'say');
    if (move.clip) assert.ok(own.some((e) => e.type === 'clip' && e.name === move.clip), name);
    if (move.pose) assert.ok(own.some((e) => e.type === 'pose' && e.name === move.pose) && own.some((e) => e.type === 'pose' && e.name === null), name);
    if (move.tilt) assert.ok(own.some((e) => e.type === 'fx' && e.fx.tilt === move.tilt) && own.some((e) => e.type === 'fx' && e.fx.tilt === 0), name);
    if (move.yaw) assert.ok(own.some((e) => e.type === 'fx' && e.fx.yaw === move.yaw) && own.some((e) => e.type === 'fx' && e.fx.yaw === 0), name);
    assert.equal(own.filter((e) => e.type === 'emote').length, (move.emotes ?? []).length, name);
    for (const e of own.filter((x) => x.type === 'emote')) assert.ok(e.t >= sayEv.t && e.t <= sayEv.t + 1, `${name} 효과는 반응 시작 직후`);
    assert.ok(sayEv.seconds <= 3, name);
  }
});

test('새 돌발행동 5개: 합격 도장·종이비행기·선글라스·큰절·노래 — 대사 2줄 이상, 소품·연출 이벤트, 길이 5~6.5초, 효과 한 번', () => {
  const NEW = ['stamp', 'plane', 'shades', 'bow', 'song'];
  assert.equal(INTERVIEW.improvs.length, 9);
  for (const id of NEW) {
    const improv = INTERVIEW.improvs.find((i) => i.id === id);
    assert.ok(improv && improv.title && improv.player.length >= 2, id);
    for (const who of ['leader', 'hr', 'mentor']) assert.ok(improv[who].length > 0 && improv[who].length <= 40, `${id} ${who}`);
    const ev = improvScript(improv, { total: INTERVIEW_IMPROV_SECONDS });
    assertScript(ev, id);
    const end = ev[ev.length - 1].t;
    assert.ok(end >= 5 - 1e-9 && end <= 6.5, `${id} 길이 ${end}`);
    assert.equal(ev.filter((e) => e.type === 'effect').length, 1);
    assert.ok(!ev.some((e) => e.type === 'prop' && e.name === 'mic'), `${id}: 마이크 없음`);
  }
  const by = (id) => improvScript(INTERVIEW.improvs.find((i) => i.id === id), { total: INTERVIEW_IMPROV_SECONDS });
  assert.throws(() => improvScript({ id: 'heart', player: ['a'], leader: 'b', hr: 'c', mentor: 'd' }, { total: 5 }), /heart/, '속마음 방송은 지웠다');
  assert.equal(by('stamp').filter((e) => e.type === 'slam').length, 3);
  assert.ok(by('stamp').some((e) => e.type === 'prop' && e.name === 'stamp'));
  assert.ok(by('plane').some((e) => e.type === 'plane') && by('plane').some((e) => e.type === 'clip' && e.who === 'leader'));
  assert.ok(by('shades').some((e) => e.type === 'prop' && e.name === 'shades') && by('shades').some((e) => e.type === 'fx' && e.who === 'player' && e.fx.spin && e.fx.spin.turns === 1));
  assert.ok(by('bow').some((e) => e.type === 'fx' && e.who === 'player' && e.fx.tilt > 1), '큰절은 깊이 숙인다');
  for (const id of ['leader', 'hr', 'mentor']) assert.ok(by('bow').some((e) => e.type === 'fx' && e.who === id && e.fx.tilt > 0), `${id} 맞절`);
  assert.ok(by('song').some((e) => e.type === 'notes'));
});

test('remoteScene(답변 2유형): 모범형·4차원형 모두 구름 없이 말풍선과 반응만', () => {
  for (const [a, type] of [[0, '모범형'], [1, '4차원형']]) {
    const sc = remoteScene(INTERVIEW, { ty: 'ans', q: 1, a }, 'hr', { rng: mulberry32(2) });
    assert.equal(sc.line.type, type);
    assert.ok(!sc.events.some((e) => e.type === 'remoteThink' || e.type === 'think'));
    assert.ok(sc.duration > sc.bubbleAt);
  }
});
