// 브라우저 전용: 면접장 장면 진행. 질문 뽑기 -> 말풍선 + 답변 선택 창 -> 답변 연출(대본 시간표) -> 면접관 반응 -> 5문항 완주 연출, 돌발행동, 첫 대사.
// 규칙(뽑기·라운드·대본·시간표)은 logic/interview.js 에 있고, 여기서는 그 이벤트를 캐릭터 동작·말풍선·종이 효과·지수 감소로 옮긴다.
// 지수 감소는 main 이 넘겨 준 콜백(reduce/bonus)으로만 한다: 답변·돌발행동은 effect 순간에 reduce(= ACTION_REDUCE), 완주는 bonus 순간에 한 번.
import * as THREE from 'three';
import {
  createBagPicker, createRepeatFreePicker, createRound, createTimeline, answerScript, improvScript, seatedImprov, openingFor, pickReactions, finaleEvents, assignedImprov, ASK_CLIPS,
} from './logic/interview.js';
import { headingY } from './logic/movement.js';
import { sfx } from './audio/sfx.js';

const PAPER_COUNT = 12;
const PAPER_LIFE = 3.2; // 종이가 날려 떨어져 사라지기까지(초)
const OPENING_SECONDS = 3.4;
const PLAYER_SPEECH_Y = 1.9; // 플레이어 머리 위 말풍선 높이(발 기준)
const SEATED_SPEECH_Y = 1.4; // 앉아 있을 때(앉은 높이가 이미 position.y 에 들어 있다)
const RAW_FALLBACK = 0.667;

// 담당 면접관제: 내가 앉은 의자 하나마다 담당 면접관 한 명(interior.assignments)이 모든 질문과 전체 반응을 맡고, 나머지 둘은 한가할 때만 가볍게 반응한다(crew 가 일을 중재한다).
// ctx: { hud, interviewers, crew(interviewCrew.js), character, player, playerFx, interior, root, camera, renderer, config, params, callbacks, rng }
// params: { round, speech, answerSeconds, improvSeconds, finaleSeconds }
// callbacks: { dispatch(event) -> bool, reduce(), bonus(), track(name, params), outfitState(), seat(), say?(msg) }
// say(msg): (멀티플레이) 내가 답하거나 돌발행동을 시작했다고 알린다. msg 는 { ty:'ans', q(질문 번호), a(답변 번호) } | { ty:'imp', imp(돌발행동 id) }(번호·id 만, 글은 없다). 없으면 알리지 않는다.
// seat(): 지금 앉아 있는 의자 { id, x, y, z, rotY, stand: { x, z } }(없으면 null). 앉은 채면 답변은 앉은 자세로 하고, 돌발행동은 stand 로 일어나 했다가 다시 앉는다.
export function createInterviewScene(ctx) {
  const { hud, interviewers, crew, character, player, playerFx, interior, root, camera, renderer, config, params, callbacks } = ctx;
  const rng = ctx.rng ?? Math.random;
  const questionPicker = createBagPicker(config.questions.length, rng);
  const improvPicker = createRepeatFreePicker(config.improvs.length, rng);
  const round = createRound(params.round);
  const names = Object.fromEntries(config.interviewers.map((i) => [i.id, i.name]));
  const home = { x: 0, z: 0 };
  const point = new THREE.Vector3();

  let openingDone = false; // 이번 방문에서 첫 대사를 했는가
  let current = null; // 진행 중인 장면 { timeline, kind, home }
  let asking = null; // 선택 창이 열려 있는 질문 { question, index }
  let playerIdleAt = -1; // 이때(장면 시간)가 되면 플레이어 동작을 idle 로
  let sceneTime = 0;
  const papers = []; // { mesh, vel, spin, t }
  const paperGeo = new THREE.PlaneGeometry(0.28, 0.38);
  const paperMat = new THREE.MeshStandardMaterial({ color: 0xffffff, side: THREE.DoubleSide, roughness: 0.9 });

  const rawDuration = (name) => (character ? (character.getRawClipDurations()[name] ?? RAW_FALLBACK) : RAW_FALLBACK);
  const interjections = config.interjections;
  // 내가 앉은 의자의 담당 면접관(앉아 있지 않으면 팀장).
  const assignedNow = () => interior.assignments?.[seatNow()?.id] ?? 'leader';
  // 이 장면이 담당(또는 완주에 함께하는) 면접관으로 잡고 있는 id 들. 끝나면 놓고 자세를 되돌린다.
  const mine = new Set();
  function claimInterviewer(id) {
    if (!crew.claim(id, 'me')) return false;
    mine.add(id);
    return true;
  }
  function releaseInterviewers() {
    for (const id of mine) {
      interviewers.resetOne(id);
      hud.clearSpeech(id);
      crew.release(id, 'me');
    }
    mine.clear();
  }
  const clearMySpeech = () => { hud.clearSpeech('player'); for (const id of mine) hud.clearSpeech(id); };

  function facePlayer(x, z, seconds) {
    if (character) character.turnToward(x, z, seconds);
    else player.rotation.y = headingY(player.position, { x, z });
  }
  const faceTarget = (target) => ({
    desk: interior.deskTop, door: interior.exit, camera: camera.position,
  })[target];
  const seatNow = () => callbacks.seat?.() ?? null;
  // 지금 의자에 앉은 모습인가(일어나 나와 있는 동안이나 책상 위에서는 아니다). 말풍선 높이가 달라진다.
  function isSitting() {
    const seat = seatNow();
    return Boolean(seat) && player.position.y > 0.3 && Math.hypot(player.position.x - seat.x, player.position.z - seat.z) < 0.3;
  }

  // ---- 종이 효과(서류 던지기) ----
  function spawnPapers() {
    for (let i = 0; i < PAPER_COUNT; i++) {
      const mesh = new THREE.Mesh(paperGeo, paperMat);
      mesh.position.set(player.position.x, 1.3, player.position.z);
      mesh.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
      mesh.castShadow = false;
      const a = Math.random() * Math.PI * 2;
      const speed = 1.2 + Math.random() * 1.8;
      papers.push({ mesh, vel: new THREE.Vector3(Math.cos(a) * speed, 4.2 + Math.random() * 1.8, Math.sin(a) * speed), spin: new THREE.Vector3(Math.random() * 8 - 4, Math.random() * 8 - 4, Math.random() * 8 - 4), t: 0 });
      root.add(mesh);
    }
  }
  function updatePapers(dt) {
    for (let i = papers.length - 1; i >= 0; i--) {
      const p = papers[i];
      p.t += dt;
      if (p.mesh.position.y > 0.03) {
        p.vel.y -= 5.5 * dt; // 종이라 천천히 떨어진다
        p.vel.x *= 1 - 1.1 * dt;
        p.vel.z *= 1 - 1.1 * dt;
        p.mesh.position.addScaledVector(p.vel, dt);
        p.mesh.rotation.x += p.spin.x * dt;
        p.mesh.rotation.y += p.spin.y * dt;
        p.mesh.rotation.z += p.spin.z * dt;
        if (p.mesh.position.y <= 0.03) { p.mesh.position.y = 0.03; p.mesh.rotation.set(-Math.PI / 2, 0, p.mesh.rotation.z); }
      }
      if (p.t >= PAPER_LIFE) {
        root.remove(p.mesh);
        papers.splice(i, 1);
      }
    }
  }
  function clearPapers() {
    for (const p of papers) root.remove(p.mesh);
    papers.length = 0;
  }

  // ---- 장면 이벤트 처리 ----
  function onEvent(e) {
    if (e.who !== undefined && e.who !== 'player' && ['say', 'clip', 'pose', 'fx', 'stand', 'sit'].includes(e.type)) { crew.apply(e); return; } // 면접관의 연기는 진행자가 그린다
    switch (e.type) {
      case 'say': // 플레이어: 질문 말풍선은 내가 답하기 시작하면 걷는다(반응 때 담당이 다시 말한다)
        if (current?.assigned) hud.clearSpeech(current.assigned);
        hud.say('player', e.text, { name: '', seconds: e.seconds, big: Boolean(e.big) });
        break;
      case 'clip': {
        const speed = 1;
        character?.playClip(e.name, speed);
        playerIdleAt = sceneTime + rawDuration(e.name) / speed + 0.05;
        break;
      }
      case 'fx':
        if ('bounce' in e.fx) playerFx.setBounce(e.fx.bounce);
        if (e.fx.spin) playerFx.startSpin(e.fx.spin);
        break;
      case 'stand': character?.idleInPlace(); break; // 의자에서 일어난다: 앉은 자세 -> 서기
      case 'sit': playerIdleAt = -1; character?.sitInPlace(); break; // 다시 앉는다
      case 'light': crew.light(e.who, e.spec, 'me'); break; // 담당이 아닌 면접관의 가벼운 반응: 한가할 때만 한다
      case 'finale': { // 마지막 문항: 그때 한가한 면접관까지 셋이, 아니면 담당 혼자 일어나 박수 친다
        const ids = crew.claimFinale(current.assigned, 'me');
        for (const id of ids) mine.add(id);
        current.timeline = createTimeline(finaleEvents({ ids, speaker: current.assigned, finaleSeconds: params.finaleSeconds, finaleText: config.finale }));
        for (const f of current.timeline.update(0)) onEvent(f);
        break;
      }
      case 'face': {
        const t = faceTarget(e.target);
        facePlayer(t.x, t.z, e.seconds);
        break;
      }
      case 'move': {
        if (e.to === 'desk') playerFx.moveAnchor({ x: interior.deskTop.x, y: interior.deskTop.y, z: interior.deskTop.z }, e.seconds, 0.6);
        else if (e.to === 'stand') playerFx.moveAnchor({ x: current.stand.x, y: 0, z: current.stand.z }, e.seconds, 0.05); // 의자에서 앞으로 미끄러져 나온다
        else if (e.to === 'seat') playerFx.moveAnchor({ x: current.seat.x, y: current.seat.y, z: current.seat.z }, e.seconds, 0);
        else playerFx.moveAnchor({ x: current.home.x, y: 0, z: current.home.z }, e.seconds, 0.4);
        break;
      }
      case 'papers': spawnPapers(); break;
      case 'effect':
        if (current.kind === 'improv') callbacks.track('improv_action', { id: current.improvId });
        callbacks.reduce(); // ACTION_REDUCE (다른 행동과 같은 경로)
        break;
      case 'bonus':
        callbacks.track('interview_complete');
        sfx.play('fanfare'); // 최종 합격!
        callbacks.bonus(); // INTERVIEW_BONUS 한 번
        break;
      case 'end': finish(); break;
      default: break;
    }
  }

  // 장면을 시작한다: 플레이어 동작을 맡고(행동 중 상태), 시간표를 돌린다. 모드는 호출한 쪽이 이미 'interview-play' 로 바꿨다.
  function begin(events, info) {
    clearMySpeech();
    character?.beginAction();
    playerFx.begin();
    const seat = info.seated ? seatNow() : null;
    current = { timeline: createTimeline(events), home: seat ? { x: seat.stand.x, z: seat.stand.z } : { x: playerFx.anchor.x, z: playerFx.anchor.z }, seat, stand: seat?.stand, ...info };
    playerIdleAt = -1;
    sceneTime = 0;
    for (const e of current.timeline.update(0)) onEvent(e);
  }

  function finish() {
    const seated = Boolean(current?.seat);
    current = null;
    clearMySpeech();
    releaseInterviewers(); // 담당(과 완주에 함께한) 면접관만 되돌린다: 다른 사람 장면 중인 면접관은 그대로
    playerFx.end();
    character?.endAction(seated ? 'sit' : 'idle'); // 앉아서 한 장면은 앉은 자세 그대로 돌아온다
    clearPapers();
    callbacks.dispatch('interview:end');
  }

  const api = {
    get busy() { return current !== null || asking !== null; },
    get roundCount() { return round.count; },
    get playing() { return current ? (current.improvId ?? current.kind) : null; }, // 진행 중인 장면(돌발행동 id 또는 'answer')

    // 방에 들어왔다(방문마다 첫 대사를 다시 한다).
    enterHall() { openingDone = false; },
    // 방을 나간다: 진행 횟수를 처음으로 되돌리고 말풍선을 치운다(이미 줄어든 지수는 그대로).
    leaveHall() {
      round.reset();
      api.abort();
    },
    // "다시 하기": 진행 횟수를 처음으로.
    resetRound() { round.reset(); },
    // 진행 중인 것을 모두 즉시 끊는다.
    abort() {
      asking = null;
      current = null;
      hud.closeChoice();
      mine.clear();
      crew.clear(); // 다른 사람 장면·가벼운 반응·내 잡은 면접관 모두 접는다(공간을 나가는 중)
      hud.clearSpeech();
      interviewers.reset();
      if (playerFx.active) playerFx.end();
      clearPapers();
    },

    // 자리에 처음 선 순간: 팀장이 옷에 맞는 첫 대사를 한다(방문마다 한 번). 했으면 true.
    maybeOpening() {
      if (openingDone) return false;
      openingDone = true;
      const id = assignedNow(); // 담당 면접관이 첫 대사를 한다(다른 사람 장면 중이면 건너뛴다)
      crew.light(id, { clip: ASK_CLIPS[id], seconds: OPENING_SECONDS, text: openingFor(config.openings, callbacks.outfitState()), textSeconds: OPENING_SECONDS }, 'me');
      return true;
    },

    // [1 면접 보기]: 질문을 뽑아 면접관이 말풍선으로 묻고, 답변 선택 창을 연다.
    openQuestion() {
      if (current || asking) return false;
      const id = assignedNow();
      if (!claimInterviewer(id)) return false; // 같은 의자의 다른 사람 장면 중이면 못 한다(드문 동시 착석)
      if (!callbacks.dispatch('interview:open')) { releaseInterviewers(); return false; }
      const index = questionPicker.next();
      const question = config.questions[index]; // 질문은 그대로 뽑고, 던지는 사람은 언제나 담당 면접관이다
      asking = { question, index, assigned: id };
      clearMySpeech();
      facePlayer(interior.deskTop.x, interior.deskTop.z, 0.3);
      crew.apply({ type: 'clip', who: id, name: ASK_CLIPS[id] });
      hud.say(id, question.text, { name: names[id], seconds: 0 });
      hud.openChoice({
        who: `${names[id]} · 질문`, question: question.text, cancelLabel: config.cancelLabel,
        choices: question.answers.map((a, i) => ({ key: String(i + 1), type: a.type, text: a.text })),
        onPick: (i) => api.pick(i), onCancel: () => api.cancel(),
      });
      sfx.play('ding'); // 면접관이 질문을 던졌다
      return true;
    },

    // 선택 창을 감소 없이 닫는다("다음에 할게요", Esc).
    cancel() {
      if (!asking) return false;
      asking = null;
      hud.closeChoice();
      clearMySpeech();
      releaseInterviewers();
      callbacks.dispatch('interview:cancel');
      return true;
    },

    // 선택지를 골랐다(0~2): 답변 연출이 시작된다. 지수 감소는 연출의 effect 순간에 일어난다.
    pick(i) {
      if (!asking || !asking.question.answers[i]) return false;
      const { question, index, assigned } = asking;
      const answer = question.answers[i];
      if (!callbacks.dispatch('interview:pick')) return false;
      asking = null;
      hud.closeChoice();
      sfx.play('confirm');
      const seated = Boolean(seatNow());
      const result = round.answer();
      callbacks.track('interview_answer', { type: answer.type });
      callbacks.say?.({ ty: 'ans', q: index, a: i }); // 같은 방의 다른 방문자 화면에 내 답변 말풍선이 뜬다(번호만 보낸다)
      const events = answerScript({
        type: answer.type, line: answer.text, lines: pickReactions(config.reactions, answer.type, rng), assigned, interjections, rng,
        speech: params.speech, total: params.answerSeconds, finale: result.finale, deferFinale: true, finaleSeconds: params.finaleSeconds, finaleText: config.finale, seated,
      });
      begin(events, { kind: 'answer', assigned, seated });
      return true;
    },

    // [2 돌발행동]: 선택 없이 바로, 직전과 다른 돌발행동 하나.
    startImprov() {
      if (current || asking) return false;
      const assigned = assignedNow();
      if (!claimInterviewer(assigned)) return false;
      if (!callbacks.dispatch('interview:play')) { releaseInterviewers(); return false; }
      const improv = config.improvs[improvPicker.next()];
      const seated = Boolean(seatNow()); // 앉아 있으면 일어나서 하고 마지막에 다시 앉는다
      callbacks.say?.({ ty: 'imp', imp: improv.id });
      const script = assignedImprov(improvScript(improv, { total: params.improvSeconds }), assigned, { interjections, rng }); // 담당만 전체 연기, 다른 둘은 가볍게
      begin(seated ? seatedImprov(script) : script, { kind: 'improv', improvId: improv.id, assigned, seated });
      return true;
    },

    // 매 프레임: 시간표, 종이, 말풍선 위치.
    update(dt) {
      sceneTime += dt;
      updatePapers(dt);
      if (current) {
        if (playerIdleAt >= 0 && sceneTime >= playerIdleAt) {
          playerIdleAt = -1;
          character?.idleInPlace();
        }
        for (const e of current.timeline.update(dt)) {
          if (!current) break;
          onEvent(e);
        }
      }
      const ids = hud.speechIds();
      if (ids.length) {
        const w = renderer.domElement.clientWidth;
        const h = renderer.domElement.clientHeight;
        for (const id of ids) {
          if (id === 'player') point.set(player.position.x, player.position.y + (isSitting() ? SEATED_SPEECH_Y : PLAYER_SPEECH_Y), player.position.z);
          else if (interviewers.byId[id]) interviewers.headPoint(id, point);
          else continue; // 다른 방문자의 말풍선은 remoteSpeech.js 가 위치를 정한다
          point.project(camera);
          hud.positionSpeech(id, (point.x * 0.5 + 0.5) * w, (-point.y * 0.5 + 0.5) * h, id === 'player' ? 0 : interviewers.bubbleShift(id));
        }
      }
    },
  };
  return api;
}
