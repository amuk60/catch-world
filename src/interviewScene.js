// 브라우저 전용: 면접장 장면 진행. 질문 뽑기 -> 말풍선 + 답변 선택 창 -> 답변 연출(대본 시간표) -> 면접관 반응 -> 5문항 완주 연출, 돌발행동, 첫 대사.
// 규칙(뽑기·라운드·대본·시간표)은 logic/interview.js 에 있고, 여기서는 그 이벤트를 캐릭터 동작·말풍선·종이 효과·지수 감소로 옮긴다.
// 지수 감소는 main 이 넘겨 준 콜백(reduce/bonus)으로만 한다: 답변·돌발행동은 effect 순간에 reduce(= ACTION_REDUCE), 완주는 bonus 순간에 한 번.
import * as THREE from 'three';
import {
  createBagPicker, createRepeatFreePicker, createRound, createTimeline, answerScript, improvScript, seatedImprov, openingFor, pickReactions,
} from './logic/interview.js';
import { headingY } from './logic/movement.js';

const PAPER_COUNT = 12;
const PAPER_LIFE = 3.2; // 종이가 날려 떨어져 사라지기까지(초)
const OPENING_SECONDS = 3.4;
const ASK_CLIPS = { leader: 'interact-right', hr: 'emote-yes', mentor: 'interact-left' }; // 질문할 때 면접관 동작(성격별)
const PLAYER_SPEECH_Y = 1.9; // 플레이어 머리 위 말풍선 높이(발 기준)
const SEATED_SPEECH_Y = 1.4; // 앉아 있을 때(앉은 높이가 이미 position.y 에 들어 있다)
const RAW_FALLBACK = 0.667;

// ctx: { hud, interviewers, character, player, playerFx, interior, root, camera, renderer, config, params, callbacks, rng }
// params: { round, speech, answerSeconds, improvSeconds, finaleSeconds }
// callbacks: { dispatch(event) -> bool, reduce(), bonus(), track(name, params), outfitState(), seat() }
// seat(): 지금 앉아 있는 의자 { x, y, z, rotY, stand: { x, z } }(없으면 null). 앉은 채면 답변은 앉은 자세로 하고, 돌발행동은 stand 로 일어나 했다가 다시 앉는다.
export function createInterviewScene(ctx) {
  const { hud, interviewers, character, player, playerFx, interior, root, camera, renderer, config, params, callbacks } = ctx;
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
  const actorOf = (who) => interviewers.byId[who].actor;
  const fxOf = (who) => (who === 'player' ? playerFx : actorOf(who).fx);

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
    switch (e.type) {
      case 'say': {
        if (e.who === 'player' && current?.askerId) hud.clearSpeech(current.askerId); // 질문 말풍선은 내가 답하기 시작하면 걷는다(반응 때 같은 면접관이 다시 말한다)
        hud.say(e.who, e.text, { name: e.who === 'player' ? '' : names[e.who], seconds: e.seconds, big: Boolean(e.big) });
        break;
      }
      case 'clip':
        if (e.who === 'player') {
          const speed = 1;
          character?.playClip(e.name, speed);
          playerIdleAt = sceneTime + rawDuration(e.name) / speed + 0.05;
        } else actorOf(e.who).play(e.name);
        break;
      case 'pose': actorOf(e.who).setPose(e.name); break;
      case 'fx': {
        const fx = fxOf(e.who);
        if ('bounce' in e.fx) fx.setBounce(e.fx.bounce);
        if (e.fx.spin) fx.startSpin(e.fx.spin);
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
      case 'stand':
        if (e.who === 'player') character?.idleInPlace(); // 의자에서 일어난다: 앉은 자세 -> 서기
        else interviewers.stand(e.who);
        break;
      case 'sit':
        if (e.who === 'player') { playerIdleAt = -1; character?.sitInPlace(); } // 다시 앉는다
        else interviewers.sit(e.who);
        break;
      case 'papers': spawnPapers(); break;
      case 'effect':
        if (current.kind === 'improv') callbacks.track('improv_action', { id: current.improvId });
        callbacks.reduce(); // ACTION_REDUCE (다른 행동과 같은 경로)
        break;
      case 'bonus':
        callbacks.track('interview_complete');
        callbacks.bonus(); // INTERVIEW_BONUS 한 번
        break;
      case 'end': finish(); break;
      default: break;
    }
  }

  // 장면을 시작한다: 플레이어 동작을 맡고(행동 중 상태), 시간표를 돌린다. 모드는 호출한 쪽이 이미 'interview-play' 로 바꿨다.
  function begin(events, info) {
    hud.clearSpeech();
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
    hud.clearSpeech();
    interviewers.reset();
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
      hud.clearSpeech();
      interviewers.reset();
      if (playerFx.active) playerFx.end();
      clearPapers();
    },

    // 자리에 처음 선 순간: 팀장이 옷에 맞는 첫 대사를 한다(방문마다 한 번). 했으면 true.
    maybeOpening() {
      if (openingDone) return false;
      openingDone = true;
      const text = openingFor(config.openings, callbacks.outfitState());
      actorOf('leader').play(ASK_CLIPS.leader);
      hud.say('leader', text, { name: names.leader, seconds: OPENING_SECONDS });
      return true;
    },

    // [1 면접 보기]: 질문을 뽑아 면접관이 말풍선으로 묻고, 답변 선택 창을 연다.
    openQuestion() {
      if (current || asking || !callbacks.dispatch('interview:open')) return false;
      const index = questionPicker.next();
      const question = config.questions[index];
      asking = { question, index };
      hud.clearSpeech();
      facePlayer(interior.deskTop.x, interior.deskTop.z, 0.3);
      actorOf(question.asker).play(ASK_CLIPS[question.asker]);
      hud.say(question.asker, question.text, { name: names[question.asker], seconds: 0 });
      hud.openChoice({
        who: names[question.asker], question: question.text, cancelLabel: config.cancelLabel,
        choices: question.answers.map((a, i) => ({ key: String(i + 1), type: a.type, text: a.text })),
        onPick: (i) => api.pick(i), onCancel: () => api.cancel(),
      });
      return true;
    },

    // 선택 창을 감소 없이 닫는다("다음에 할게요", Esc).
    cancel() {
      if (!asking) return false;
      const { question } = asking;
      asking = null;
      hud.closeChoice();
      hud.clearSpeech(question.asker);
      callbacks.dispatch('interview:cancel');
      return true;
    },

    // 선택지를 골랐다(0~2): 답변 연출이 시작된다. 지수 감소는 연출의 effect 순간에 일어난다.
    pick(i) {
      if (!asking || !asking.question.answers[i]) return false;
      const { question } = asking;
      const answer = question.answers[i];
      if (!callbacks.dispatch('interview:pick')) return false;
      asking = null;
      hud.closeChoice();
      const seated = Boolean(seatNow());
      const result = round.answer();
      callbacks.track('interview_answer', { type: answer.type });
      const events = answerScript({
        type: answer.type, line: answer.text, lines: pickReactions(config.reactions, answer.type, rng),
        speech: params.speech, total: params.answerSeconds, finale: result.finale, finaleSeconds: params.finaleSeconds, finaleText: config.finale, seated,
      });
      begin(events, { kind: 'answer', askerId: question.asker, seated });
      return true;
    },

    // [2 돌발행동]: 선택 없이 바로, 직전과 다른 돌발행동 하나.
    startImprov() {
      if (current || asking || !callbacks.dispatch('interview:play')) return false;
      const improv = config.improvs[improvPicker.next()];
      const seated = Boolean(seatNow()); // 앉아 있으면 일어나서 하고 마지막에 다시 앉는다
      const script = improvScript(improv, { total: params.improvSeconds });
      begin(seated ? seatedImprov(script) : script, { kind: 'improv', improvId: improv.id, seated });
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
          else interviewers.headPoint(id, point);
          point.project(camera);
          hud.positionSpeech(id, (point.x * 0.5 + 0.5) * w, (-point.y * 0.5 + 0.5) * h, id === 'player' ? 0 : interviewers.bubbleShift(id));
        }
      }
    },
  };
  return api;
}
