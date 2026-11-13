// 면접장 규칙 (순수). 질문 뽑기, 5문항 완주 라운드, 옷에 따른 첫 대사, 답변·돌발행동·완주 연출 대본과 시간표, 설정(INTERVIEW) 검증.
// 연출 대본은 [{ t(초), type, ... }] 이벤트 목록이고, 시간표(createTimeline)가 시간만 보고 때가 된 이벤트를 내보낸다(렌더링·상태 변경은 main.js 가 한다).
import { appearanceOf } from './outfit.js';

const ID_LIST = ['leader', 'hr', 'junior']; // 면접관 id(팀장 / 인사담당 / 막내)
const TYPES = ['정석', '솔직', '엉뚱'];
export const IMPROV_IDS = ['paperToss', 'reverse', 'dance', 'banzai']; // 돌발행동 연출 이름(코드에 대본이 있다)

// 대본 이벤트 종류. who: 'player' | 면접관 id.
// say(말풍선, big 이면 큰 글씨) clip(한 번짜리 동작) pose(자세 'clap' 또는 null) fx(튀기·돌기 같은 덧입힘) face(방향 돌기) move(플레이어 이동 'desk'|'home')
// stand/sit(면접관 일어나기·앉기) papers(종이 흩날리기) effect(지수 감소 순간) bonus(완주 보너스 순간) end(끝)
export const EVENT_TYPES = ['say', 'clip', 'pose', 'fx', 'face', 'move', 'stand', 'sit', 'papers', 'effect', 'bonus', 'end'];

// ---- 뽑기 ----
// 0..n-1 을 섞은 묶음에서 하나씩 뽑는다. 묶음을 다 쓰면 다시 섞되, 직전에 나온 것이 맨 앞에 오지 않게 한다(한 바퀴 안에서는 반복 없음).
export function createBagPicker(n, rng = Math.random) {
  if (!(n >= 1)) throw new Error('개수는 1 이상이어야 합니다.');
  let bag = [];
  let last = -1;
  function refill() {
    bag = Array.from({ length: n }, (_, i) => i);
    for (let i = n - 1; i > 0; i--) { // Fisher-Yates
      const j = Math.floor(rng() * (i + 1));
      [bag[i], bag[j]] = [bag[j], bag[i]];
    }
    if (n > 1 && bag[bag.length - 1] === last) { // 맨 앞(= 배열 끝에서 꺼냄)이 직전과 같으면 앞쪽과 바꾼다.
      [bag[bag.length - 1], bag[0]] = [bag[0], bag[bag.length - 1]];
    }
  }
  return {
    next() {
      if (bag.length === 0) refill();
      last = bag.pop();
      return last;
    },
  };
}

// 무작위로 뽑되 직전과 같은 것은 연달아 나오지 않는다.
export function createRepeatFreePicker(n, rng = Math.random) {
  if (!(n >= 1)) throw new Error('개수는 1 이상이어야 합니다.');
  let last = -1;
  return {
    next() {
      let index;
      if (last >= 0 && n > 1) {
        const j = Math.min(n - 2, Math.floor(rng() * (n - 1)));
        index = j >= last ? j + 1 : j;
      } else {
        index = Math.min(n - 1, Math.floor(rng() * n));
      }
      last = index;
      return index;
    },
  };
}

// ---- 라운드(연속으로 total 문항에 답하면 완주) ----
export function createRound(total) {
  if (!(total >= 1)) throw new Error('문항 수는 1 이상이어야 합니다.');
  const round = {
    count: 0,
    // 질문에 답했다. 마지막 문항이면 finale(보너스·합격 연출)이고 개수는 처음으로 돌아간다(한 라운드에 한 번뿐).
    answer() {
      round.count += 1;
      const finale = round.count >= total;
      const result = { count: round.count, finale };
      if (finale) round.count = 0;
      return result;
    },
    reset() { round.count = 0; },
  };
  return round;
}

// ---- 대사 고르기 ----
// 옷 상태(clean/dirty/tank/drying/dry)에 맞는 팀장의 첫 대사. openings 는 겉모습(suit/soot/tank)을 키로 한다.
export const openingFor = (openings, outfitState) => openings[appearanceOf(outfitState)];

// 답변 종류별로 면접관마다 반응 대사 하나씩(후보 중 무작위).
export function pickReactions(reactions, type, rng = Math.random) {
  const row = reactions[type];
  if (!row) throw new Error(`알 수 없는 답변 종류: ${type}`);
  const out = {};
  for (const id of ID_LIST) out[id] = row[id][Math.min(row[id].length - 1, Math.floor(rng() * row[id].length))];
  return out;
}

// ---- 시간표 ----
// events: [{ t, ... }]. 같은 시각은 넘겨 준 순서를 지킨다. update(dt) 는 이번에 때가 된 이벤트를 돌려준다. 마지막 이벤트(end)가 나가면 done.
export function createTimeline(events) {
  const list = events.map((e, i) => ({ e, i })).sort((a, b) => a.e.t - b.e.t || a.i - b.i).map((x) => x.e);
  let elapsed = 0;
  let next = 0;
  const tl = {
    get done() { return next >= list.length; },
    get elapsed() { return elapsed; },
    duration: list.length ? list[list.length - 1].t : 0,
    update(dt) {
      elapsed += Math.max(0, Number.isFinite(dt) ? dt : 0);
      const out = [];
      while (next < list.length && list[next].t <= elapsed + 1e-9) out.push(list[next++]);
      return out;
    },
  };
  return tl;
}

// ---- 대본 만들기 ----
const readSeconds = (text, min) => Math.max(min, 0.9 + 0.07 * text.length); // 글자 수에 맞춰 말풍선이 떠 있는 시간
const sortStable = (events) => events.map((e, i) => ({ e, i })).sort((a, b) => a.e.t - b.e.t || a.i - b.i).map((x) => x.e);
const say = (t, who, text, seconds) => ({ t, type: 'say', who, text, seconds });
const clip = (t, who, name) => ({ t, type: 'clip', who, name });
const fx = (t, who, patch) => ({ t, type: 'fx', who, fx: patch });
const pose = (t, who, name) => ({ t, type: 'pose', who, name });

const PLAYER_CLIP = { 정석: 'emote-yes', 솔직: 'interact-right', 엉뚱: 'jump' }; // 당당하게 답하는 동작(엉뚱은 더 크게)
const REACT = {
  정석: { clip: 'emote-yes', clap: true }, // 박수
  솔직: { clip: 'emote-no' }, // 당황
  엉뚱: { clip: 'emote-yes', bounce: { amp: 0.07, freq: 5 } }, // 폭소
};

// 답변 한 번의 대본. line: 플레이어가 하는 말, lines: 면접관별 반응 대사, speech: 말풍선 최소 시간, total: 최소 전체 길이.
// finale 이면 끝에 "면접관 3명이 일어나 박수 + 최종 합격! + 보너스" 연출(finaleSeconds)이 이어진다.
// 지수 감소(effect)는 답하는 말풍선이 뜨는 순간 한 번이며 답변 종류와 무관하다.
export function answerScript({ type, line, lines, speech = 2.3, total = 5, finale = false, finaleSeconds = 3.6, finaleText = '최종 합격!' }) {
  if (!TYPES.includes(type)) throw new Error(`알 수 없는 답변 종류: ${type}`);
  const react = REACT[type];
  const SAY_AT = 0.3;
  const sayDur = readSeconds(line, speech);
  const reactAt = SAY_AT + sayDur + 0.15;
  const ev = [
    { t: 0, type: 'face', who: 'player', target: 'desk', seconds: 0.3 },
    clip(SAY_AT, 'player', PLAYER_CLIP[type]),
    say(SAY_AT, 'player', line, sayDur),
    { t: SAY_AT, type: 'effect' },
  ];
  if (type === '엉뚱') {
    ev.push(fx(SAY_AT, 'player', { bounce: { amp: 0.1, freq: 3 } }), fx(SAY_AT + sayDur, 'player', { bounce: null }));
  }
  let reactEnd = reactAt;
  ID_LIST.forEach((id, i) => {
    const t = reactAt + 0.2 * i;
    const dur = readSeconds(lines[id], speech);
    ev.push(clip(t, id, react.clip), say(t, id, lines[id], dur));
    if (react.clap) ev.push(pose(t, id, 'clap'), pose(t + dur, id, null));
    if (react.bounce) ev.push(fx(t, id, { bounce: react.bounce }), fx(t + dur, id, { bounce: null }));
    reactEnd = Math.max(reactEnd, t + dur);
  });
  const base = Math.max(total, reactEnd + 0.2);
  if (!finale) return sortStable([...ev, { t: base, type: 'end' }]);

  const tf = base;
  ID_LIST.forEach((id, i) => ev.push({ t: tf + 0.1 * i, type: 'stand', who: id }));
  const clapAt = tf + 0.5;
  ID_LIST.forEach((id) => ev.push(pose(clapAt, id, 'clap'), clip(clapAt, id, 'emote-yes'), pose(tf + finaleSeconds - 0.5, id, null)));
  ev.push({ ...say(clapAt, 'leader', finaleText, finaleSeconds - 0.7), big: true }, { t: clapAt, type: 'bonus' }); // 큰 글씨 말풍선
  ID_LIST.forEach((id, i) => ev.push({ t: tf + finaleSeconds - 0.5 + 0.1 * i, type: 'sit', who: id }));
  return sortStable([...ev, { t: tf + finaleSeconds, type: 'end' }]);
}

// 돌발행동 하나의 대본(연출은 id 마다 코드에 있고 대사는 improv 설정에서 온다). 지수 감소(effect)는 중간의 한 순간.
export function improvScript(improv, { total = 5 } = {}) {
  const P = improv.player;
  const read = (text, min = 2) => readSeconds(text, min);
  const face = (t, target, seconds = 0.3) => ({ t, type: 'face', who: 'player', target, seconds });
  const ev = [];
  let last = 0; // 마지막으로 말풍선이 닫히는 시각
  const talk = (t, who, text, min = 2) => { const d = read(text, min); ev.push(say(t, who, text, d)); last = Math.max(last, t + d); };
  const gasp = (t, who, text, clipName = 'emote-no') => { ev.push(clip(t, who, clipName)); talk(t, who, text); };
  const reactAll = (t0, step, clipName) => ID_LIST.forEach((id, i) => gasp(t0 + step * i, id, improv[id], clipName));
  let tail = 0.3; // 마지막 말풍선이 닫힌 뒤 여유

  switch (improv.id) {
    case 'paperToss': // 서류를 하늘로 던지고 일어나 퇴장 선언
      ev.push(face(0, 'desk', 0.2), clip(0, 'player', 'pick-up'));
      talk(0, 'player', P[0], 1.6);
      ev.push(clip(0.8, 'player', 'attack-melee-right'), { t: 0.95, type: 'papers' }, { t: 1.0, type: 'effect' });
      ev.push(face(1.9, 'door', 0.4), clip(1.9, 'player', 'jump'));
      talk(1.9, 'player', P[1], 2.4);
      reactAll(2.2, 0.25, 'emote-no');
      ID_LIST.forEach((id, i) => ev.push(fx(2.2 + 0.25 * i, id, { bounce: { amp: 0.08, freq: 4 } }), fx(2.8 + 0.25 * i, id, { bounce: null })));
      ev.push(face(Math.max(total, last) - 0.7, 'desk', 0.5));
      break;
    case 'reverse': // 면접관에게 역질문 폭주
      ev.push(face(0, 'desk', 0.2));
      P.forEach((text, i) => {
        const t = 0.1 + 1.1 * i;
        ev.push(clip(t, 'player', i % 2 ? 'interact-left' : 'interact-right'));
        talk(t, 'player', text, 1.1);
      });
      ev.push({ t: 0.5, type: 'effect' });
      reactAll(1.6, 1.0, 'emote-no');
      break;
    case 'dance': { // 갑자기 다 같이 춤추기: 플레이어와 면접관이 튀고 돈다
      ev.push(face(0, 'desk', 0.2), { t: 0.6, type: 'effect' });
      talk(0.1, 'player', P[0], 2.2);
      talk(2.4, 'player', P[1], 2.2);
      ev.push(fx(0.4, 'player', { bounce: { amp: 0.1, freq: 3 } }), fx(0.6, 'player', { spin: { turns: 2, seconds: 3.4 } }));
      for (let k = 0; k < 6; k++) ev.push(clip(0.3 + 0.7 * k, 'player', k % 2 ? 'interact-left' : 'interact-right'));
      ID_LIST.forEach((id, i) => {
        const t = 1.0 + 0.2 * i;
        ev.push(fx(t, id, { bounce: { amp: 0.05, freq: 3 } }), fx(t, id, { spin: { turns: 1, seconds: 3 } }));
        for (let k = 0; k < 3; k++) ev.push(clip(t + 0.8 * k, id, (k + i) % 2 ? 'interact-left' : 'interact-right'));
        talk(t + 0.2, id, improv[id], 2);
      });
      for (const who of ['player', ...ID_LIST]) ev.push(fx(4.2, who, { bounce: null }));
      last = Math.max(last, 4.4);
      break;
    }
    case 'banzai': // 책상 위에서 만세
      ev.push(clip(0, 'player', 'jump'), { t: 0, type: 'move', who: 'player', to: 'desk', seconds: 0.7 }, face(0.2, 'camera', 0.4));
      ev.push(clip(0.8, 'player', 'emote-yes'), fx(0.8, 'player', { bounce: { amp: 0.08, freq: 2.5 } }), { t: 0.9, type: 'effect' });
      talk(0.8, 'player', P[0], 2.0);
      ev.push(clip(2.9, 'player', 'interact-right'));
      talk(2.9, 'player', P[1], 2.0);
      gasp(1.5, 'leader', improv.leader);
      ev.push(clip(1.8, 'hr', 'emote-yes'), pose(1.8, 'hr', 'clap'), pose(3.9, 'hr', null));
      talk(1.8, 'hr', improv.hr);
      ev.push(clip(2.1, 'junior', 'emote-yes'), fx(2.1, 'junior', { bounce: { amp: 0.06, freq: 4 } }), fx(3.9, 'junior', { bounce: null }));
      talk(2.1, 'junior', improv.junior);
      ev.push(fx(3.9, 'player', { bounce: null }), { t: 3.9, type: 'move', who: 'player', to: 'home', seconds: 0.6 }, face(4.5, 'desk', 0.4));
      tail = 0.6;
      break;
    default:
      throw new Error(`알 수 없는 돌발행동: ${improv.id}`);
  }
  const end = Math.max(total, last + tail);
  return sortStable([...ev, { t: end, type: 'end' }]);
}

// ---- 설정 검증 ----
// INTERVIEW 설정 모양과 글자 길이를 확인해 문제 목록(비어 있으면 정상)을 돌려준다. 팀이 글을 고친 뒤 테스트로 실수를 잡는다.
export function validateInterview(cfg, { questions = 12, improvs = 4, maxLength = 40 } = {}) {
  const problems = [];
  const ids = (cfg.interviewers ?? []).map((i) => i.id);
  if (ids.join() !== ID_LIST.join()) problems.push(`면접관은 ${ID_LIST.join(', ')} 순서로 3명이어야 합니다.`);
  if ((cfg.questions ?? []).length !== questions) problems.push(`질문은 ${questions}개여야 합니다.`);
  (cfg.questions ?? []).forEach((q, n) => {
    const name = `질문 ${n + 1}`;
    if (!ID_LIST.includes(q.asker)) problems.push(`${name}: 질문자 ${q.asker} 를 모릅니다.`);
    if (!q.text || q.text.length > maxLength) problems.push(`${name}: 질문 글이 비었거나 ${maxLength}자를 넘습니다.`);
    const types = (q.answers ?? []).map((a) => a.type).sort().join();
    if (types !== [...TYPES].sort().join()) problems.push(`${name}: 답변은 정석·솔직·엉뚱 하나씩이어야 합니다.`);
    for (const a of q.answers ?? []) if (!a.text || a.text.length > maxLength) problems.push(`${name}: ${a.type} 답변 글이 비었거나 ${maxLength}자를 넘습니다.`);
  });
  for (const type of TYPES) {
    for (const id of ID_LIST) {
      const list = cfg.reactions?.[type]?.[id];
      if (!Array.isArray(list) || list.length === 0 || list.some((t) => !t)) problems.push(`반응 대사: ${type}/${id} 후보가 필요합니다.`);
    }
  }
  const imps = cfg.improvs ?? [];
  if (imps.length !== improvs) problems.push(`돌발행동은 ${improvs}개여야 합니다.`);
  for (const im of imps) {
    if (!IMPROV_IDS.includes(im.id)) problems.push(`돌발행동 id ${im.id} 의 연출이 없습니다.`);
    if (!Array.isArray(im.player) || im.player.length === 0 || im.player.some((t) => !t)) problems.push(`돌발행동 ${im.id}: player 대사가 필요합니다.`);
    for (const id of ID_LIST) if (!im[id]) problems.push(`돌발행동 ${im.id}: ${id} 대사가 필요합니다.`);
  }
  for (const key of ['suit', 'soot', 'tank']) if (!cfg.openings?.[key]) problems.push(`첫 대사(${key})가 필요합니다.`);
  if (!cfg.finale) problems.push('최종 합격 문구가 필요합니다.');
  return problems;
}
