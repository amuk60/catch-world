import test from 'node:test';
import assert from 'node:assert/strict';
import {
  answerScript, improvScript, EVENT_TYPES, validateInterview, remoteScene, finaleEvents, assignedImprov, ASK_CLIPS, REMOTE_BUBBLE_AT,
} from '../src/logic/interview.js';
import { INTERVIEW, INTERVIEW_ANSWER_SECONDS, INTERVIEW_IMPROV_SECONDS, INTERVIEW_FINALE_SECONDS, SPEECH_SECONDS } from '../src/config.js';
import { mulberry32 } from '../src/logic/rng.js';

// 담당 면접관제: 담당 면접관이 묻고 반응하고, 나머지 둘은 한가할 때만 가볍게 반응한다.
const IDS3 = ['leader', 'hr', 'mentor'];
const LINES = { leader: '팀장 반응', hr: '인사 반응', mentor: '사수 반응' };
const opts = { speech: SPEECH_SECONDS, total: INTERVIEW_ANSWER_SECONDS, finaleSeconds: INTERVIEW_FINALE_SECONDS, finaleText: INTERVIEW.finale };
const DIRECT = ['say', 'clip', 'pose', 'fx'];

function assertSorted(events, label) {
  let prev = -Infinity;
  for (const e of events) {
    assert.ok(EVENT_TYPES.includes(e.type), `${label} 모르는 이벤트 ${e.type}`);
    assert.ok(Number.isFinite(e.t) && e.t >= 0 && e.t >= prev - 1e-9, `${label} 정렬 ${e.type}@${e.t}`);
    prev = e.t;
  }
}

test('answerScript(assigned): 어느 면접관이 담당이든 반응 말풍선·동작은 담당 한 명, 다른 둘은 light 이고, 감소 규칙은 그대로', () => {
  for (const assigned of IDS3) {
    for (const type of INTERVIEW.types) {
      const ev = answerScript({ type, line: '내가 할 말', lines: LINES, assigned, ...opts });
      assertSorted(ev, `${assigned} ${type}`);
      const says = ev.filter((e) => e.type === 'say');
      assert.deepEqual(says.map((e) => e.who), ['player', assigned]);
      assert.equal(says[1].text, LINES[assigned]);
      assert.equal(ev.filter((e) => e.type === 'clip' && e.who === assigned).length, 1);
      for (const other of IDS3.filter((x) => x !== assigned)) {
        assert.ok(!ev.some((e) => DIRECT.includes(e.type) && e.who === other), `${assigned}: ${other} 의 직접 연기는 없다`);
        const lights = ev.filter((e) => e.type === 'light' && e.who === other);
        assert.equal(lights.length, 1);
        assert.ok(lights[0].t >= says[1].t - 1e-9, '담당이 반응하기 시작한 뒤에 곁들인다');
        assert.ok(lights[0].spec.clip && lights[0].spec.seconds > 0 && lights[0].spec.seconds <= 2);
      }
      assert.equal(ev.filter((e) => e.type === 'effect').length, 1);
      assert.equal(ev.filter((e) => e.type === 'end').length, 1);
    }
  }
  assert.throws(() => answerScript({ type: '정석', line: 'x', lines: LINES, assigned: 'nobody', ...opts }), /nobody/);
});

test('answerScript: 가벼운 반응의 짧은 한마디는 interjections 후보 중에서 가끔만(rng), 후보가 없으면 동작만', () => {
  const lightOf = (rng, interjections) => answerScript({ type: '엉뚱', line: '대사', lines: LINES, assigned: 'hr', interjections, rng, ...opts }).filter((e) => e.type === 'light');
  const sometimes = lightOf(() => 0, INTERVIEW.interjections);
  assert.ok(sometimes.every((e) => INTERVIEW.interjections.엉뚱.includes(e.spec.text)), '짧은 한마디가 붙는 경우');
  assert.ok(lightOf(() => 0.99, INTERVIEW.interjections).every((e) => e.spec.text === undefined), '대부분은 동작만');
  assert.ok(lightOf(() => 0, undefined).every((e) => e.spec.text === undefined));
});

test('answerScript(finale): 담당이 "최종 합격!" 을 말하고 finaleIds 만 일어나 박수 친다 — 담당 혼자일 수도, 셋 모두일 수도 있다', () => {
  const one = answerScript({ type: '정석', line: '대사', lines: LINES, assigned: 'hr', finale: true, finaleIds: ['hr'], ...opts });
  assertSorted(one, 'finale one');
  assert.deepEqual(one.filter((e) => e.type === 'stand').map((e) => e.who), ['hr']);
  assert.deepEqual(one.filter((e) => e.type === 'sit').map((e) => e.who), ['hr']);
  assert.equal(one.find((e) => e.type === 'say' && e.text === INTERVIEW.finale).who, 'hr');
  assert.equal(one.filter((e) => e.type === 'bonus').length, 1);
  const all = answerScript({ type: '정석', line: '대사', lines: LINES, assigned: 'mentor', finale: true, ...opts });
  assert.deepEqual(all.filter((e) => e.type === 'stand').map((e) => e.who).sort(), IDS3.slice().sort());
  assert.equal(all.find((e) => e.type === 'say' && e.text === INTERVIEW.finale).who, 'mentor');
});

test('answerScript(deferFinale): 끝에 finale 신호만 두고(end 없음) finaleEvents 가 그 뒤를 이어 붙인다 — 합치면 deferFinale 없는 대본과 같다', () => {
  for (const finaleIds of [['leader'], IDS3]) {
    const deferred = answerScript({ type: '솔직', line: '대사', lines: LINES, assigned: 'leader', finale: true, deferFinale: true, finaleIds, ...opts });
    assert.ok(!deferred.some((e) => e.type === 'end' || e.type === 'bonus' || e.type === 'stand'));
    const marker = deferred[deferred.length - 1];
    assert.equal(marker.type, 'finale');
    const tail = finaleEvents({ ids: finaleIds, speaker: 'leader', finaleSeconds: INTERVIEW_FINALE_SECONDS, finaleText: INTERVIEW.finale });
    assert.equal(tail[0].t, 0);
    assert.deepEqual([tail[tail.length - 1].type, tail[tail.length - 1].t], ['end', INTERVIEW_FINALE_SECONDS]);
    const whole = answerScript({ type: '솔직', line: '대사', lines: LINES, assigned: 'leader', finale: true, finaleIds, ...opts });
    const joined = [...deferred.slice(0, -1), ...tail.map((e) => ({ ...e, t: e.t + marker.t }))];
    const key = (e) => JSON.stringify([e.t.toFixed(6), e.type, e.who ?? '', e.name ?? '']);
    assert.deepEqual(joined.map(key).sort(), whole.map(key).sort());
  }
  assert.equal(answerScript({ type: '정석', line: '대사', lines: LINES, ...opts, deferFinale: true }).slice(-1)[0].type, 'end', '완주가 아니면 평소처럼 end');
});

test('assignedImprov: 담당 면접관의 대사·동작은 그대로, 다른 면접관은 첫 이벤트 시각에 light 하나로 줄어든다(입력 불변, 돌기·긴 대사 없음)', () => {
  for (const improv of INTERVIEW.improvs) {
    const base = improvScript(improv, { total: INTERVIEW_IMPROV_SECONDS });
    const copy = JSON.parse(JSON.stringify(base));
    for (const assigned of IDS3) {
      const ev = assignedImprov(base, assigned, { interjections: INTERVIEW.interjections, rng: () => 0.99 });
      assertSorted(ev, `${improv.id} ${assigned}`);
      assert.deepEqual(ev.filter((e) => e.who === assigned), base.filter((e) => e.who === assigned), `${improv.id}: 담당 연기 그대로`);
      assert.equal(ev.filter((e) => e.type === 'effect').length, 1);
      assert.equal(ev.filter((e) => e.type === 'end').length, 1);
      for (const other of IDS3.filter((x) => x !== assigned)) {
        assert.ok(!ev.some((e) => DIRECT.includes(e.type) && e.who === other), `${improv.id}: ${other} 직접 연기 없음`);
        const light = ev.find((e) => e.type === 'light' && e.who === other);
        assert.ok(light, `${improv.id}: ${other} light`);
        assert.equal(light.t, Math.min(...base.filter((e) => e.who === other).map((e) => e.t)));
        assert.equal(light.spec.spin, undefined);
        assert.equal(light.spec.text, undefined);
      }
    }
    assert.deepEqual(base, copy);
  }
  const dance = assignedImprov(improvScript(INTERVIEW.improvs.find((i) => i.id === 'dance'), { total: 5 }), 'hr');
  assert.ok(dance.some((e) => e.type === 'fx' && e.who === 'hr' && e.fx.spin), '춤: 담당은 돈다');
  assert.ok(!dance.some((e) => e.type === 'fx' && e.who !== 'hr' && e.who !== 'player' && e.fx.spin), '춤: 다른 면접관은 돌지 않는다');
  const banzai = assignedImprov(improvScript(INTERVIEW.improvs.find((i) => i.id === 'banzai'), { total: 5 }), 'leader');
  assert.equal(banzai.find((e) => e.type === 'light' && e.who === 'hr').spec.clap, true, '만세: 인사담당의 박수 성격을 가볍게 따른다');
  assert.ok(banzai.find((e) => e.type === 'light' && e.who === 'mentor').spec.bounce.amp < 0.06, '만세: 예비 사수의 튀기는 더 작게');
});

test('remoteScene(답변): 담당이 q 번 질문 글을 묻고 -> REMOTE_BUBBLE_AT 에 보낸 사람의 답변 말풍선 -> 담당의 종류별 반응과 대사, 다른 둘은 light', () => {
  const q = 5;
  for (const assigned of IDS3) {
    for (const [a, type] of [[0, '정석'], [1, '솔직'], [2, '엉뚱']]) {
      const sc = remoteScene(INTERVIEW, { ty: 'ans', q, a }, assigned, { rng: mulberry32(3) });
      assert.equal(sc.line.text, INTERVIEW.questions[q].answers[a].text);
      assert.equal(sc.line.type, type);
      assert.equal(sc.bubbleAt, REMOTE_BUBBLE_AT);
      const says = sc.events.filter((e) => e.type === 'say');
      assert.deepEqual([says[0].who, says[0].text, says[0].t], [assigned, INTERVIEW.questions[q].text, 0], '질문자는 설정의 asker 가 아니라 담당');
      assert.equal(sc.events.find((e) => e.type === 'clip').name, ASK_CLIPS[assigned]);
      assert.equal(says[1].who, assigned);
      assert.ok(INTERVIEW.reactions[type][assigned].includes(says[1].text), '그 종류의 반응 대사 후보');
      assert.ok(says[1].t > sc.bubbleAt, '답변 말풍선 뒤에 반응');
      assert.equal(sc.events.find((e) => e.type === 'remoteBubble').t, sc.bubbleAt);
      if (type === '정석') assert.ok(sc.events.some((e) => e.type === 'pose' && e.who === assigned && e.name === 'clap'));
      if (type === '솔직') assert.ok(sc.events.some((e) => e.type === 'clip' && e.who === assigned && e.name === 'emote-no'));
      if (type === '엉뚱') assert.ok(sc.events.some((e) => e.type === 'fx' && e.who === assigned && e.fx.bounce));
      assert.deepEqual(sc.events.filter((e) => e.type === 'light').map((e) => e.who).sort(), IDS3.filter((x) => x !== assigned).sort());
      assert.ok(!sc.events.some((e) => DIRECT.includes(e.type) && e.who !== assigned), '다른 면접관의 직접 연기는 없다');
      assert.ok(sc.events.every((e) => !['effect', 'bonus', 'end', 'papers'].includes(e.type)), '지수·라운드와 무관');
      assertSorted(sc.events, 'remote');
      assert.ok(sc.duration > says[1].t + says[1].seconds - 1e-9 && sc.duration < 9);
    }
  }
});

test('remoteScene(돌발행동): 담당 면접관의 대사·연기를 그대로 보이고, 방문자 본인 연기·지수 감소는 없고, 말풍선은 바로 뜬다', () => {
  for (const improv of INTERVIEW.improvs) {
    for (const assigned of IDS3) {
      const sc = remoteScene(INTERVIEW, { ty: 'imp', imp: improv.id }, assigned, { rng: () => 0.99 });
      assert.equal(sc.bubbleAt, 0);
      assert.equal(sc.line.improvId, improv.id);
      assert.ok(sc.events.some((e) => e.type === 'say' && e.who === assigned && e.text === improv[assigned]), `${improv.id}: ${assigned} 의 돌발행동 반응 대사`);
      assert.ok(sc.events.some((e) => e.type === 'clip' && e.who === assigned));
      assert.ok(!sc.events.some((e) => e.who === 'player' || ['effect', 'bonus', 'end', 'papers', 'face', 'move'].includes(e.type)));
      assert.deepEqual(sc.events.filter((e) => e.type === 'light').map((e) => e.who).sort(), IDS3.filter((x) => x !== assigned).sort());
      assert.equal(sc.events.filter((e) => e.type === 'remoteBubble').length, 1);
      assertSorted(sc.events, improv.id);
    }
  }
  const dance = remoteScene(INTERVIEW, { ty: 'imp', imp: 'dance' }, 'mentor');
  assert.ok(dance.events.some((e) => e.type === 'fx' && e.who === 'mentor' && e.fx.spin), '춤: 담당만 돈다');
  assert.ok(!dance.events.some((e) => e.type === 'fx' && e.who !== 'mentor' && e.fx.spin));
});

test('remoteScene: 모르는 번호·id·면접관은 null', () => {
  for (const say of [null, { ty: 'ans', q: 99, a: 0 }, { ty: 'imp', imp: 'nope' }, { ty: 'x' }]) assert.equal(remoteScene(INTERVIEW, say, 'hr'), null);
  assert.equal(remoteScene(INTERVIEW, { ty: 'ans', q: 0, a: 0 }, 'nobody'), null);
});

test('설정 검증: interjections(정석·솔직·엉뚱·improv 별 12자 이내 후보)가 필요하다', () => {
  assert.deepEqual(validateInterview(INTERVIEW), []);
  for (const key of ['정석', 'improv']) {
    const bad = { ...INTERVIEW, interjections: { ...INTERVIEW.interjections, [key]: [] } };
    assert.ok(validateInterview(bad).some((p) => p.includes(`짧은 한마디: ${key}`)), key);
  }
  assert.ok(validateInterview({ ...INTERVIEW, interjections: undefined }).length >= 4);
  assert.ok(validateInterview({ ...INTERVIEW, interjections: { ...INTERVIEW.interjections, 솔직: ['이건 열두 글자를 훌쩍 넘기는 아주 긴 한마디입니다'] } }).some((p) => p.includes('솔직')));
});
