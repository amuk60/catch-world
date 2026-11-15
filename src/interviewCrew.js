// 면접관 3명의 "누가 지금 무슨 일을 하는가" 진행자(담당 면접관제). 장면 자체(내 장면: interviewScene.js, 다른 방문자 장면: remoteSpeech.js)는 여기에 일을 맡기고,
// 면접관 한 명에게 일이 겹치지 않게 하는 규칙은 logic/assign.js 의 중재자가 정한다. 이 모듈은 중재자의 결정을 말풍선·동작으로 옮기고 시계(dt)를 먹여 준다.
// three.js 를 쓰지 않는다(hud·interviewers 는 받아 쓰기만 해서 가짜로 시험할 수 있다).
//  - 내 장면(primary, 끝날 때까지): claim(id) / release(id).
//  - 다른 방문자의 장면(primary, 시간표): remote(id, owner, scene). 바쁘면 한 건만 기다리고 오래되면 버린다. 버려지면 보낸 방문자의 말풍선은 그 자리에서 바로 띄운다.
//  - 가벼운 반응(secondary): light(id, spec, owner). 한가할 때만 하고, 담당 일이 오면 곧바로 접는다.
import { createArbiter } from './logic/assign.js';
import { createTimeline } from './logic/interview.js';

const LIGHT_LINE_SECONDS = 1.4; // 가벼운 한마디 말풍선 시간

// hud: { say, clearSpeech }, interviewers: { byId, stand, sit }, names: id -> 이름표, ids: 면접관 id 목록.
export function createCrew({ hud, interviewers, names, ids }) {
  const arbiter = createArbiter({ ids });
  const jobs = new Map(); // 면접관 id -> { kind: 'remote' | 'light', owner, timeline?, spec?, payload?, bubbleShown }
  let clock = 0;

  const actorOf = (id) => interviewers.byId[id].actor;

  // 면접관 한 명의 연기 이벤트 하나를 화면에 옮긴다(내 장면의 시간표도 같은 함수를 쓴다).
  function apply(e) {
    switch (e.type) {
      case 'say': hud.say(e.who, e.text, { name: names[e.who], seconds: e.seconds, big: Boolean(e.big) }); break;
      case 'clip': actorOf(e.who).play(e.name); break;
      case 'pose': actorOf(e.who).setPose(e.name); break;
      case 'fx': {
        const fx = actorOf(e.who).fx;
        if ('bounce' in e.fx) fx.setBounce(e.fx.bounce);
        if (e.fx.spin) fx.startSpin(e.fx.spin);
        break;
      }
      case 'stand': interviewers.stand(e.who); break;
      case 'sit': interviewers.sit(e.who); break;
      default: break;
    }
  }

  // 그 면접관이 하던 남의 장면·가벼운 반응을 접는다(자세·튀기·말풍선 정리). 내 장면(claim)은 건드리지 않는다.
  function cleanup(id) {
    const job = jobs.get(id);
    if (!job) return;
    jobs.delete(id);
    const actor = actorOf(id);
    actor.setPose(null);
    actor.fx.setBounce(null);
    hud.clearSpeech(id);
    if (job.kind === 'remote' && !job.bubbleShown) showBubble(job); // 끝까지 못 보였으면 보낸 방문자의 말풍선은 지금이라도
  }

  function showBubble(job) {
    if (job.bubbleShown) return;
    job.bubbleShown = true;
    job.payload.onBubble?.();
  }

  function startRemote(id, entry) {
    const scene = entry.payload;
    const job = { kind: 'remote', owner: entry.owner, timeline: createTimeline(scene.events), payload: scene, bubbleShown: false };
    jobs.set(id, job);
    runRemote(id, job, 0);
  }

  function runRemote(id, job, dt) {
    for (const e of job.timeline.update(dt)) {
      if (jobs.get(id) !== job) return; // 처리 도중 접혔다
      if (e.type === 'light') crew.light(e.who, e.spec, job.owner);
      else if (e.type === 'remoteBubble') showBubble(job);
      else if (e.who === id) apply(e);
    }
  }

  function startLight(id, spec, owner) {
    jobs.set(id, { kind: 'light', owner, spec });
    const actor = actorOf(id);
    actor.play(spec.clip);
    if (spec.clap) actor.setPose('clap');
    if (spec.bounce) actor.fx.setBounce(spec.bounce);
    if (spec.text) hud.say(id, spec.text, { name: names[id], seconds: spec.textSeconds ?? LIGHT_LINE_SECONDS });
  }

  // 중재자가 알려 준 변화(끝남·시작·폐기)를 반영한다.
  function handle(events) {
    for (const ev of events) {
      if (ev.type === 'ended') cleanup(ev.id);
      else if (ev.type === 'started') startRemote(ev.id, ev.entry);
      else if (ev.type === 'dropped') ev.entry.payload?.onBubble?.(); // 폐기된 장면: 보낸 방문자의 말풍선만이라도 바로
    }
  }

  const crew = {
    arbiter,
    apply,
    get clock() { return clock; },

    // 내 장면이 이 면접관을 담당으로 잡는다(끝날 때까지). 남의 담당 장면 중이면 false. 가벼운 반응 중이었다면 접고 시작한다.
    claim(id, owner = 'me') {
      const r = arbiter.request(id, { kind: 'primary', owner, t: clock, queue: false });
      if (r.decision !== 'start') return false;
      if (r.preempted) cleanup(id);
      return true;
    },
    // 내 장면이 이 면접관을 놓는다. 기다리던 남의 장면이 있으면 이어서 시작한다.
    release(id, owner = 'me') {
      handle(arbiter.release(id, owner, clock));
    },
    // 다른 방문자의 장면을 그 의자의 담당 면접관에게 맡긴다. scene: remoteScene 결과 + onBubble(보낸 방문자의 말풍선을 띄우는 함수). 'start' | 'queue' 를 돌려준다.
    remote(id, owner, scene) {
      const r = arbiter.request(id, { kind: 'primary', owner, t: clock, duration: scene.duration, payload: scene });
      if (r.decision === 'start') {
        if (r.preempted) cleanup(id);
        startRemote(id, { owner, payload: scene });
      } else if (r.dropped) r.dropped.payload?.onBubble?.();
      return r.decision;
    },
    // 가벼운 반응(담당이 아닌 면접관). 한가할 때만 하고 했으면 true.
    light(id, spec, owner = 'me') {
      const r = arbiter.request(id, { kind: 'secondary', owner, t: clock, duration: spec.seconds });
      if (r.decision !== 'start') return false;
      startLight(id, spec, owner);
      return true;
    },
    // 마지막 문항 완주 연출에 함께할 면접관(담당 포함): 담당 말고 둘이 모두 남의 장면 중이 아니면 셋, 아니면 담당만. 함께하는 면접관은 내 장면이 잡는다.
    claimFinale(assigned, owner = 'me') {
      const list = arbiter.finaleIds(assigned);
      for (const id of list) if (id !== assigned) crew.claim(id, owner);
      return list;
    },
    // 지금 이 면접관의 상태(시험·디버그용).
    state: (id) => arbiter.state(id),

    // 매 프레임.
    update(dt) {
      clock += dt;
      handle(arbiter.tick(clock));
      for (const [id, job] of [...jobs]) if (job.kind === 'remote' && jobs.get(id) === job) runRemote(id, job, dt);
    },
    // 모두 접는다(공간을 나가거나 장면을 끊을 때). 기다리던 방문자 말풍선은 걷는다(공간을 나갔으니 의미가 없다).
    clear() {
      arbiter.reset();
      for (const id of [...jobs.keys()]) {
        const job = jobs.get(id);
        if (job.kind === 'remote') job.bubbleShown = true; // 말풍선은 띄우지 않는다
        cleanup(id);
      }
    },
  };
  return crew;
}
