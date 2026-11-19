// 면접장 규칙 (순수). 질문 뽑기, 5문항 완주 라운드, 옷에 따른 첫 대사, 답변·돌발행동·완주 연출 대본과 시간표, 설정(INTERVIEW) 검증.
// 연출 대본은 [{ t(초), type, ... }] 이벤트 목록이고, 시간표(createTimeline)가 시간만 보고 때가 된 이벤트를 내보낸다(렌더링·상태 변경은 main.js 가 한다).
import { appearanceOf } from './outfit.js';

const ID_LIST = ['leader', 'hr', 'mentor']; // 면접관 id(팀장 / 인사담당 / 예비 사수)
const TYPES = ['정석', '솔직', '엉뚱', '속마음'];
export const IMPROV_IDS = ['paperToss', 'reverse', 'dance', 'banzai', 'heart', 'stamp', 'plane', 'shades', 'bow', 'song']; // 돌발행동 연출 이름(코드에 대본이 있다)
export const INNER_AT = 0.6; // 답변 말풍선이 뜬 뒤 속마음(생각 구름)이 뜨기까지(초)
export const INNER_SECONDS = 2.5; // 속마음이 떠 있는 시간
export const INNER_MAX_LENGTH = 36; // 속마음 글자 수 상한

// 대본 이벤트 종류. who: 'player' | 면접관 id.
// say(말풍선, big 이면 큰 글씨) clip(한 번짜리 동작) pose(자세 'clap' 또는 null) fx(튀기·돌기 같은 덧입힘) face(방향 돌기) move(플레이어 이동 'desk'|'home'|'stand'(의자에서 일어나 설 자리)|'seat'(의자))
// stand/sit(면접관 일어나기·앉기. who 가 'player' 면 지원자가 의자에서 일어나 서는 자세 / 다시 앉는 자세) papers(종이 흩날리기) effect(지수 감소 순간) bonus(완주 보너스 순간) end(끝)
// 담당 면접관제: light(who 가 담당이 아닌 면접관 — 한가할 때만 하는 가벼운 반응 spec: { clip, clap?, bounce?, seconds, text? }) finale(마지막 문항: 이 순간 최종 합격 연출을 이어 붙인다)
// remoteBubble(다른 방문자의 장면에서, 보낸 방문자의 답변 말풍선이 뜰 순간)
// think(플레이어의 속마음 구름) prop(소품 mic·stamp·shades·plane 을 seconds 동안) slam(도장 쾅) plane(종이비행기가 팀장에게 날아감) notes(음표가 떠오름) remoteThink(다른 방문자 머리 위 속마음 구름)
export const EVENT_TYPES = ['say', 'clip', 'pose', 'fx', 'face', 'move', 'stand', 'sit', 'papers', 'effect', 'bonus', 'end', 'light', 'finale', 'remoteBubble', 'think', 'prop', 'slam', 'plane', 'notes', 'remoteThink'];

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

export const ASK_CLIPS = { leader: 'interact-right', hr: 'emote-yes', mentor: 'interact-left' }; // 질문할 때 면접관 동작(성격별)
const LIGHT_SECONDS = 1.4; // 가벼운 반응(곁들임)이 이어지는 시간
const LIGHT_LINE_CHANCE = 0.35; // 가벼운 반응에 아주 짧은 한마디가 붙을 확률
const LIGHT_BOUNCE_SCALE = 0.5; // 가벼운 반응은 담당 면접관보다 작게 튄다
const pickOne = (list, rng) => list[Math.min(list.length - 1, Math.floor(rng() * list.length))];
// 담당이 아닌 면접관의 가벼운 반응 spec. react: { clip, clap?, bounce? }, key: 아주 짧은 한마디 후보(interjections)의 열쇠.
function lightSpec(react, key, { interjections, rng }) {
  const spec = { clip: react.clip, seconds: LIGHT_SECONDS };
  if (react.clap) spec.clap = true;
  if (react.bounce) spec.bounce = { amp: react.bounce.amp * LIGHT_BOUNCE_SCALE, freq: react.bounce.freq };
  if (react.tilt) spec.tilt = react.tilt; // 큰절에 맞절(숙이기)
  const pool = interjections?.[key];
  if (pool?.length && rng() < LIGHT_LINE_CHANCE) spec.text = pickOne(pool, rng);
  return spec;
}
const PLAYER_CLIP = { 정석: 'emote-yes', 솔직: 'interact-right', 엉뚱: 'jump', 속마음: 'jump' }; // 당당하게 답하는 동작(엉뚱은 더 크게)
// 의자에 앉은 채 답할 때: 서서 하는 동작 클립은 앉은 높이에서 어색하므로 쓰지 않고, 앉은 자세 그대로 몸통을 튀기며(위아래 + 앞으로 숙임) 당당함을 나타낸다. 엉뚱이 가장 크다.
const SEATED_BOB = { 정석: { amp: 0.06, freq: 3, lean: 0.12, seconds: 1.0 }, 솔직: { amp: 0.05, freq: 2.5, lean: 0.09, seconds: 0.9 }, 엉뚱: { amp: 0.12, freq: 3, lean: 0.25, seconds: 1.6 }, 속마음: { amp: 0.1, freq: 3.5, lean: 0.22, seconds: 1.4 } };
const REACT = {
  정석: { clip: 'emote-yes', clap: true }, // 박수
  솔직: { clip: 'emote-no' }, // 당황
  엉뚱: { clip: 'emote-yes', bounce: { amp: 0.07, freq: 5 } }, // 폭소
  // 속마음형: 면접관 성격대로 — 팀장은 얼어붙고(당황), 인사담당은 폭소, 예비 사수는 몰래 끄덕(소리 없는 작은 튀기).
  속마음: { byId: { leader: { clip: 'emote-no' }, hr: { clip: 'emote-yes', bounce: { amp: 0.1, freq: 6 } }, mentor: { clip: 'emote-yes', bounce: { amp: 0.04, freq: 2 } } } },
};
const reactFor = (type, id) => REACT[type].byId?.[id] ?? REACT[type];

// 답변 한 번의 대본. line: 플레이어가 하는 말, lines: 면접관별 반응 대사, speech: 말풍선 최소 시간, total: 최소 전체 길이.
// 담당 면접관제: assigned(내가 앉은 의자의 담당 면접관)가 전체 반응(동작·대사)을 하고, 나머지 둘은 light 이벤트(동작 위주의 가벼운 반응, 한가할 때만 그리는 쪽이 실행)다.
// finale 이면 끝에 "면접관이 일어나 박수 + 최종 합격! + 보너스" 연출(finaleSeconds)이 이어진다: finaleIds 가 일어나 박수 치고 assigned 가 말한다(기본은 셋 모두).
// deferFinale 이면 그 자리에 finale 이벤트 하나만 두고(end 없음) 그리는 쪽이 그때의 형편(다른 사람 장면 중인 면접관)을 보고 finaleEvents 를 이어 붙인다.
// 지수 감소(effect)는 답하는 말풍선이 뜨는 순간 한 번이며 답변 종류와 무관하다.
export function answerScript({
  type, line, lines, assigned = 'leader', speech = 2.3, total = 5, finale = false, finaleSeconds = 3.6, finaleText = '최종 합격!', finaleIds = ID_LIST, deferFinale = false,
  seated = false, interjections, rng = Math.random, inner,
}) {
  if (!TYPES.includes(type)) throw new Error(`알 수 없는 답변 종류: ${type}`);
  if (!ID_LIST.includes(assigned)) throw new Error(`알 수 없는 면접관: ${assigned}`);
  const SAY_AT = 0.3;
  const sayDur = readSeconds(line, speech);
  const reactAt = SAY_AT + sayDur + 0.15;
  const ev = [
    { t: 0, type: 'face', who: 'player', target: 'desk', seconds: 0.3 },
    say(SAY_AT, 'player', line, sayDur),
    { t: SAY_AT, type: 'effect' },
  ];
  if (inner) ev.push({ t: SAY_AT + INNER_AT, type: 'think', who: 'player', text: inner, seconds: INNER_SECONDS }); // 속마음: 말풍선 뒤에 구름으로(지수 감소·반응 시각은 그대로)
  if (seated) {
    const { seconds, ...bob } = SEATED_BOB[type];
    ev.push(fx(SAY_AT, 'player', { bounce: bob }), fx(SAY_AT + Math.min(seconds, sayDur), 'player', { bounce: null }));
  } else {
    ev.push(clip(SAY_AT, 'player', PLAYER_CLIP[type]));
    if (type === '엉뚱') ev.push(fx(SAY_AT, 'player', { bounce: { amp: 0.1, freq: 3 } }), fx(SAY_AT + sayDur, 'player', { bounce: null }));
  }
  const reactEnd = pushReaction(ev, assigned, reactAt, lines[assigned], reactFor(type, assigned), speech);
  ID_LIST.filter((id) => id !== assigned).forEach((id, i) => ev.push({ t: reactAt + 0.2 * (i + 1), type: 'light', who: id, spec: lightSpec(reactFor(type, id), type, { interjections, rng }) }));
  const base = Math.max(total, reactEnd + 0.2);
  if (!finale) return sortStable([...ev, { t: base, type: 'end' }]);
  if (deferFinale) return sortStable([...ev, { t: base, type: 'finale' }]);
  return sortStable([...ev, ...finaleEvents({ ids: finaleIds, speaker: assigned, t0: base, finaleSeconds, finaleText })]);
}

// 면접관 한 명의 전체 반응(동작 + 대사 + 박수/튀기) 이벤트를 ev 에 더하고 말풍선이 닫히는 시각을 돌려준다.
function pushReaction(ev, id, t, text, react, speech) {
  const dur = readSeconds(text, speech);
  ev.push(clip(t, id, react.clip), say(t, id, text, dur));
  if (react.clap) ev.push(pose(t, id, 'clap'), pose(t + dur, id, null));
  if (react.bounce) ev.push(fx(t, id, { bounce: react.bounce }), fx(t + dur, id, { bounce: null }));
  if (react.tilt) ev.push(fx(t, id, { tilt: react.tilt }), fx(t + dur, id, { tilt: 0 }));
  return t + dur;
}

// 최종 합격 연출: ids 가 차례로 일어나 박수 -> speaker 가 큰 글씨 "최종 합격!" + 보너스 한 번 -> 다시 앉기 -> 끝. 모든 시각은 t0 부터.
export function finaleEvents({ ids = ID_LIST, speaker = 'leader', t0 = 0, finaleSeconds = 3.6, finaleText = '최종 합격!' } = {}) {
  const ev = [];
  ids.forEach((id, i) => ev.push({ t: t0 + 0.1 * i, type: 'stand', who: id }));
  const clapAt = t0 + 0.5;
  ids.forEach((id) => ev.push(pose(clapAt, id, 'clap'), clip(clapAt, id, 'emote-yes'), pose(t0 + finaleSeconds - 0.5, id, null)));
  ev.push({ ...say(clapAt, speaker, finaleText, finaleSeconds - 0.7), big: true }, { t: clapAt, type: 'bonus' }); // 큰 글씨 말풍선
  ids.forEach((id, i) => ev.push({ t: t0 + finaleSeconds - 0.5 + 0.1 * i, type: 'sit', who: id }));
  return sortStable([...ev, { t: t0 + finaleSeconds, type: 'end' }]);
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
  const think = (t, text, seconds = INNER_SECONDS) => { ev.push({ t, type: 'think', who: 'player', text, seconds }); last = Math.max(last, t + seconds); };
  const prop = (t, name, seconds) => ev.push({ t, type: 'prop', name, seconds });
  const I = improv.inner ?? [];
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
      ev.push(clip(2.1, 'mentor', 'emote-yes'), fx(2.1, 'mentor', { bounce: { amp: 0.06, freq: 4 } }), fx(3.9, 'mentor', { bounce: null }));
      talk(2.1, 'mentor', improv.mentor);
      ev.push(fx(3.9, 'player', { bounce: null }), { t: 3.9, type: 'move', who: 'player', to: 'home', seconds: 0.6 }, face(4.5, 'desk', 0.4));
      tail = 0.6;
      break;
    case 'heart': // 속마음 방송: 상상의 마이크를 쥐고 진짜 마음을 외친다
      ev.push(face(0, 'camera', 0.3), clip(0.2, 'player', 'interact-right'), { t: 0.6, type: 'effect' });
      prop(0.1, 'mic', 5.3);
      talk(0.3, 'player', P[0], 2.3);
      ev.push(clip(2.6, 'player', 'interact-left'));
      talk(2.6, 'player', P[1], 2.3);
      if (I[0]) think(3.3, I[0], 2.2);
      ev.push(clip(2.8, 'leader', 'emote-no'), fx(2.8, 'leader', { bounce: { amp: 0.04, freq: 4 } }), fx(3.6, 'leader', { bounce: null }));
      talk(2.8, 'leader', improv.leader);
      ev.push(clip(3.2, 'hr', 'emote-yes'), pose(3.2, 'hr', 'clap'), pose(5.0, 'hr', null));
      talk(3.2, 'hr', improv.hr);
      ev.push(clip(3.6, 'mentor', 'emote-yes'), fx(3.6, 'mentor', { bounce: { amp: 0.04, freq: 2 } }), fx(5.2, 'mentor', { bounce: null }));
      talk(3.6, 'mentor', improv.mentor);
      break;
    case 'stamp': // 합격 도장 쾅: 책상 위 서류에 합격 도장을 마구 찍는다
      ev.push(face(0, 'desk', 0.2), clip(0, 'player', 'pick-up'));
      prop(0.3, 'stamp', 3.6);
      talk(0.2, 'player', P[0], 1.6);
      [0.9, 1.6, 2.3].forEach((t) => ev.push(clip(t - 0.25, 'player', 'attack-melee-right'), { t, type: 'slam' }));
      ev.push({ t: 0.9, type: 'effect' });
      talk(1.7, 'player', P[1], 2.2);
      if (I[0]) think(2.8, I[0]);
      gasp(2.3, 'leader', improv.leader);
      ev.push(clip(2.6, 'hr', 'emote-yes'), pose(2.6, 'hr', 'clap'), pose(4.6, 'hr', null));
      talk(2.6, 'hr', improv.hr);
      ev.push(clip(2.9, 'mentor', 'emote-yes'), fx(2.9, 'mentor', { bounce: { amp: 0.05, freq: 4 } }), fx(4.8, 'mentor', { bounce: null }));
      talk(2.9, 'mentor', improv.mentor);
      break;
    case 'plane': // 종이비행기: 이력서를 접어 팀장에게 날린다
      ev.push(face(0, 'desk', 0.2), clip(0, 'player', 'pick-up'));
      prop(0.3, 'plane', 0.9);
      talk(0.2, 'player', P[0], 2.0);
      ev.push(clip(0.95, 'player', 'attack-melee-right'), { t: 1.2, type: 'plane', seconds: 1.1 }, { t: 1.3, type: 'effect' });
      talk(3.0, 'player', P[1], 2.3);
      if (I[0]) think(3.5, I[0]);
      ev.push(clip(2.4, 'leader', 'jump'), fx(2.4, 'leader', { bounce: { amp: 0.1, freq: 4 } }), fx(3.1, 'leader', { bounce: null }));
      talk(2.4, 'leader', improv.leader);
      ev.push(clip(2.9, 'hr', 'emote-yes'), fx(2.9, 'hr', { bounce: { amp: 0.07, freq: 5 } }), fx(4.3, 'hr', { bounce: null }));
      talk(2.9, 'hr', improv.hr);
      ev.push(clip(3.3, 'mentor', 'emote-yes'));
      talk(3.3, 'mentor', improv.mentor);
      break;
    case 'shades': // 선글라스를 쓰고 한 바퀴(360도) 돌며 "제 매력을 보세요"
      ev.push(face(0, 'camera', 0.3), clip(0, 'player', 'pick-up'), { t: 0.5, type: 'effect' });
      prop(0.3, 'shades', 5.0);
      talk(0.3, 'player', P[0], 1.9);
      ev.push(fx(0.5, 'player', { spin: { turns: 1, seconds: 1.6 } }), fx(0.5, 'player', { bounce: { amp: 0.06, freq: 2.5 } }), fx(2.2, 'player', { bounce: null }));
      ev.push(face(2.3, 'camera', 0.3), clip(2.4, 'player', 'interact-right'));
      talk(2.4, 'player', P[1], 2.4);
      if (I[0]) think(3.2, I[0]);
      gasp(2.6, 'leader', improv.leader);
      ev.push(clip(3.0, 'hr', 'emote-yes'), pose(3.0, 'hr', 'clap'), pose(4.8, 'hr', null));
      talk(3.0, 'hr', improv.hr);
      ev.push(clip(3.4, 'mentor', 'emote-yes'), fx(3.4, 'mentor', { bounce: { amp: 0.04, freq: 2 } }), fx(5.0, 'mentor', { bounce: null }));
      talk(3.4, 'mentor', improv.mentor);
      break;
    case 'bow': // 큰절: 무릎을 꿇고 깊이 숙여 "합격시켜 주세요!" -> 면접관들이 맞절
      ev.push(face(0, 'desk', 0.2));
      talk(0.2, 'player', P[0], 1.4);
      ev.push(fx(0.5, 'player', { tilt: 1.2, lower: -0.28 }), { t: 0.8, type: 'effect' });
      talk(1.5, 'player', P[1], 2.0);
      if (I[0]) think(2.1, I[0], 2.2);
      ID_LIST.forEach((id, i) => {
        const t = 2.3 + 0.3 * i;
        ev.push(clip(t, id, 'emote-yes'), fx(t, id, { tilt: 0.5 }), fx(t + 1.6, id, { tilt: 0 }));
        talk(t, id, improv[id]);
      });
      ev.push(fx(3.4, 'player', { tilt: 0, lower: 0 }));
      tail = 0.5;
      break;
    case 'song': // 노래 한 소절: 음표가 떠오른다
      ev.push(face(0, 'camera', 0.3), clip(0.2, 'player', 'emote-yes'), { t: 0.8, type: 'effect' });
      ev.push(fx(0.3, 'player', { bounce: { amp: 0.05, freq: 2 } }), fx(4.9, 'player', { bounce: null }), { t: 0.3, type: 'notes', count: 9, seconds: 4.6 });
      talk(0.3, 'player', P[0], 2.3);
      [1.3, 2.3, 3.3, 4.2].forEach((t, k) => ev.push(clip(t, 'player', k % 2 ? 'interact-left' : 'interact-right')));
      talk(2.7, 'player', P[1], 2.3);
      if (I[0]) think(1.6, I[0], 2.0);
      gasp(2.0, 'leader', improv.leader);
      ev.push(clip(2.4, 'hr', 'emote-yes'), pose(2.4, 'hr', 'clap'), pose(4.6, 'hr', null));
      talk(2.4, 'hr', improv.hr);
      ev.push(clip(3.0, 'mentor', 'emote-yes'), pose(3.0, 'mentor', 'clap'), pose(5.0, 'mentor', null));
      talk(3.0, 'mentor', improv.mentor);
      break;
    default:
      throw new Error(`알 수 없는 돌발행동: ${improv.id}`);
  }
  const end = Math.max(total, last + tail);
  return sortStable([...ev, { t: end, type: 'end' }]);
}

// 앉은 채 시작하는 돌발행동 대본: 앞에 "의자에서 일어나 설 자리로 나오기"를, 뒤에 "다시 의자로 돌아와 앉기"를 붙이고 원래 대본(improvScript 결과)은 standSeconds 만큼 늦춘다.
// 원래 대본의 end 는 떼어 내고 새 end 를 맨 끝에 둔다. 이벤트 'stand'/'sit'(who 'player')와 move 의 'stand'/'seat' 는 그리는 쪽(interviewScene)이 처리한다.
export function seatedImprov(events, { standSeconds = 0.5, sitSeconds = 0.5 } = {}) {
  const body = events.filter((e) => e.type !== 'end').map((e) => ({ ...e, t: e.t + standSeconds }));
  const oldEnd = events.reduce((m, e) => (e.type === 'end' ? Math.max(m, e.t) : m), 0);
  const sitAt = Math.max(oldEnd, ...events.map((e) => e.t)) + standSeconds;
  return sortStable([
    { t: 0, type: 'stand', who: 'player' }, { t: 0, type: 'move', who: 'player', to: 'stand', seconds: standSeconds },
    ...body,
    { t: sitAt, type: 'sit', who: 'player' }, { t: sitAt, type: 'move', who: 'player', to: 'seat', seconds: sitSeconds },
    { t: sitAt + sitSeconds + 0.05, type: 'end' },
  ]);
}

// ---- 담당 면접관제: 돌발행동 대본을 담당 면접관 중심으로 ----
const INTERVIEWER_EVENTS = ['say', 'clip', 'pose', 'fx', 'stand', 'sit'];
const isOtherInterviewer = (e, assigned) => ID_LIST.includes(e.who) && e.who !== assigned && INTERVIEWER_EVENTS.includes(e.type);

// 돌발행동 대본(improvScript 결과)에서 담당 면접관의 이벤트만 남기고, 다른 면접관의 연기는 한가할 때만 하는 가벼운 반응(light 이벤트 하나)으로 바꾼다.
// 가벼운 반응은 그 면접관의 첫 이벤트 시각에 시작하고, 원래 대본의 동작 종류(clip·박수·튀기)를 따르되 작게(돌기·긴 대사 없음) 한다. 입력은 바꾸지 않는다.
export function assignedImprov(events, assigned, { interjections, rng = Math.random } = {}) {
  const kept = events.filter((e) => !isOtherInterviewer(e, assigned));
  const lights = [];
  for (const id of ID_LIST.filter((x) => x !== assigned)) {
    const mine = events.filter((e) => e.who === id && isOtherInterviewer(e, assigned));
    if (!mine.length) continue;
    const bounce = mine.find((e) => e.type === 'fx' && e.fx.bounce)?.fx.bounce;
    const tilt = mine.find((e) => e.type === 'fx' && e.fx.tilt)?.fx.tilt;
    const react = { clip: mine.find((e) => e.type === 'clip')?.name ?? 'emote-no', clap: mine.some((e) => e.type === 'pose' && e.name === 'clap'), bounce, tilt };
    lights.push({ t: Math.min(...mine.map((e) => e.t)), type: 'light', who: id, spec: lightSpec(react, 'improv', { interjections, rng }) });
  }
  return sortStable([...kept, ...lights]);
}

// ---- 설정 검증 ----
// INTERVIEW 설정 모양과 글자 길이를 확인해 문제 목록(비어 있으면 정상)을 돌려준다. 팀이 글을 고친 뒤 테스트로 실수를 잡는다.
export function validateInterview(cfg, { questions = 12, improvs = 10, maxLength = 40, innerMax = INNER_MAX_LENGTH } = {}) {
  const problems = [];
  const ids = (cfg.interviewers ?? []).map((i) => i.id);
  if (ids.join() !== ID_LIST.join()) problems.push(`면접관은 ${ID_LIST.join(', ')} 순서로 3명이어야 합니다.`);
  if ((cfg.questions ?? []).length !== questions) problems.push(`질문은 ${questions}개여야 합니다.`);
  (cfg.questions ?? []).forEach((q, n) => {
    const name = `질문 ${n + 1}`;
    if (!ID_LIST.includes(q.asker)) problems.push(`${name}: 질문자 ${q.asker} 를 모릅니다.`);
    if (!q.text || q.text.length > maxLength) problems.push(`${name}: 질문 글이 비었거나 ${maxLength}자를 넘습니다.`);
    const types = (q.answers ?? []).map((a) => a.type).sort().join();
    if (types !== [...TYPES].sort().join()) problems.push(`${name}: 답변은 정석·솔직·엉뚱·속마음 하나씩(모두 4개)이어야 합니다.`);
    for (const a of q.answers ?? []) {
      if (!a.text || a.text.length > maxLength) problems.push(`${name}: ${a.type} 답변 글이 비었거나 ${maxLength}자를 넘습니다.`);
      if (a.type !== '속마음' && (typeof a.inner !== 'string' || !a.inner || a.inner.length > innerMax)) problems.push(`${name}: ${a.type} 답변에 속마음(inner)이 없거나 ${innerMax}자를 넘습니다.`);
    }
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
  for (const key of [...TYPES, 'improv']) { // 담당이 아닌 면접관의 아주 짧은 한마디 후보(담당 면접관제)
    const list = cfg.interjections?.[key];
    if (!Array.isArray(list) || list.length === 0 || list.some((t) => !t || t.length > 12)) problems.push(`짧은 한마디: ${key} 후보가 필요합니다(12자 이내).`);
  }
  if (!cfg.finale) problems.push('최종 합격 문구가 필요합니다.');
  return problems;
}

// ---- 다른 방문자의 답변·돌발행동 보기(멀티플레이) ----
// 받은 말 한마디(logic/net.js 의 validateSay 결과)를 내 config 로 풀어 말풍선 글과 그 의자 담당 면접관의 장면을 정한다. 보낸 쪽 글은 쓰지 않는다. 번호·id 가 config 에 없으면 null.
export const REMOTE_BUBBLE_SECONDS = 3; // 보낸 방문자 머리 위 말풍선이 떠 있는 시간
export const REMOTE_BUBBLE_AT = 1.2; // 질문을 던진 뒤 이만큼(초) 지나 보낸 방문자의 답변 말풍선이 뜬다
const REMOTE_ASK_SECONDS = 1.4; // 담당 면접관이 던진 질문 말풍선이 떠 있는 시간
const REMOTE_REACT_AFTER = 0.9; // 답변 말풍선이 뜬 뒤 담당 면접관이 반응하기까지

// 방문자 머리 위에 띄울 글: { text, type('정석'|'솔직'|'엉뚱'|'속마음'|null), asker(질문 설정상의 질문자 id | null), improvId(돌발행동 id | null), inner(속마음 글 | null) }.
export function remoteSayLine(config, say) {
  if (!say) return null;
  if (say.ty === 'ans') {
    const question = config.questions?.[say.q];
    const answer = question?.answers?.[say.a];
    if (!answer || typeof answer.text !== 'string' || !TYPES.includes(answer.type)) return null;
    return { text: answer.text, type: answer.type, asker: question.asker, improvId: null, inner: typeof answer.inner === 'string' && answer.inner ? answer.inner : null };
  }
  if (say.ty === 'imp') {
    const improv = config.improvs?.find((im) => im.id === say.imp);
    const text = improv?.player?.[0];
    if (typeof text !== 'string' || !text) return null;
    return { text, type: null, asker: null, improvId: improv.id, inner: null };
  }
  return null;
}

// 다른 방문자 한 명의 한마디에 대한 담당 면접관(assigned)의 장면: { line(remoteSayLine), bubbleAt(보낸 방문자의 말풍선이 뜰 시각, 0 이면 바로), events, duration }.
// events 는 시간표(createTimeline)에 넣는 이벤트들이다: 담당 면접관의 질문·반응·돌발행동 연기(who 가 assigned), 다른 면접관의 light, 시각 bubbleAt 의 remoteBubble.
// 답변: 담당이 질문 글(q 번호로 찾는다)을 말풍선으로 던지고 -> bubbleAt 에 답변 말풍선 -> 곧이어 담당이 종류에 맞는 반응(박수 / 당황 / 폭소)과 반응 대사.
// 돌발행동: 돌발행동 대본에서 담당 면접관의 연기를 그대로 쓰고(대사·동작·튀기·돌기 모두) 다른 면접관은 light 만 한다. 잘못된 입력이면 null.
export function remoteScene(config, msg, assigned, { rng = Math.random, speech = 2.3 } = {}) {
  const line = remoteSayLine(config, msg);
  if (!line || !ID_LIST.includes(assigned)) return null;
  const interjections = config.interjections;
  let events;
  let bubbleAt;
  if (line.type) {
    const question = config.questions[msg.q];
    const lines = pickReactions(config.reactions, line.type, rng);
    bubbleAt = REMOTE_BUBBLE_AT;
    const reactAt = bubbleAt + REMOTE_REACT_AFTER;
    events = [clip(0, assigned, ASK_CLIPS[assigned]), say(0, assigned, question.text, REMOTE_ASK_SECONDS)];
    pushReaction(events, assigned, reactAt, lines[assigned], reactFor(line.type, assigned), speech);
    ID_LIST.filter((id) => id !== assigned).forEach((id, i) => events.push({ t: reactAt + 0.2 * (i + 1), type: 'light', who: id, spec: lightSpec(reactFor(line.type, id), line.type, { interjections, rng }) }));
    if (line.inner) events.push({ t: bubbleAt + INNER_AT, type: 'remoteThink', text: line.inner, seconds: INNER_SECONDS }); // 보낸 방문자 머리 위 속마음 구름
  } else {
    const improv = config.improvs.find((im) => im.id === line.improvId);
    bubbleAt = 0;
    events = assignedImprov(improvScript(improv, { total: 0 }), assigned, { interjections, rng })
      .filter((e) => e.type === 'light' || e.who === assigned); // 방문자 본인의 연기(플레이어)·종이·지수 감소·끝 신호는 뺀다
  }
  events.push({ t: bubbleAt, type: 'remoteBubble' });
  const duration = Math.max(...events.map((e) => e.t + (e.type === 'say' ? e.seconds : 0))) + 0.2;
  return { line, bubbleAt, events: sortStable(events), duration };
}
