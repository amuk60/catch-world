// 브라우저 전용: 다른 방문자의 면접 답변·돌발행동 말풍선과 면접관의 가벼운 반응(다대다 면접).
// 받은 것은 번호·id 뿐이고(logic/net.js 의 validateSay), 글은 내 config 에서 찾는다(logic/interview.js 의 remoteSayLine / remoteReaction).
// 멀티플레이가 켜져 있을 때만 main 이 만든다. 이 모듈은 내 지수·라운드·분석 이벤트를 건드리지 않고, 내 면접 장면이 진행 중이면 면접관 반응은 하지 않는다.
import * as THREE from 'three';
import { remoteSayLine, remoteReaction, REMOTE_BUBBLE_SECONDS, REMOTE_REACT_SECONDS, REMOTE_REACT_STEP, REMOTE_LINE_SECONDS } from './logic/interview.js';

const PREFIX = 'r-'; // hud 말풍선 id 앞머리(hud.js 의 REMOTE_PREFIX 와 같다)
const HEAD_HEIGHT = 1.8; // 이름표(remotePlayers.js 의 LABEL_HEIGHT)와 같은 머리 위 높이(발 기준)
const ABOVE_LABEL_PX = 26; // 말풍선이 이름표 위에 놓이도록 올리는 화면 거리
const GAP_PX = 8; // 옆 말풍선과 띄우는 거리

// opts: { hud, interviewers, camera, renderer, config(INTERVIEW), busy(): 내 면접 장면이 진행 중인가, rng }
export function createRemoteSpeech({ hud, interviewers, camera, renderer, config, busy, rng = Math.random }) {
  const names = Object.fromEntries(config.interviewers.map((i) => [i.id, i.name]));
  const order = config.interviewers.map((i) => i.id);
  const point = new THREE.Vector3();
  let lastSpace = null;
  let reaction = null; // { steps: [{ id, at, stop, started, stopped, spec }], t, who }

  const interviewerSpeaking = () => hud.speechIds().some((id) => interviewers.byId[id]);

  function stopStep(step) {
    if (!step.started || step.stopped) return;
    step.stopped = true;
    const actor = interviewers.byId[step.id].actor;
    if (step.spec.clap) actor.setPose(null);
    if (step.spec.bounce) actor.fx.setBounce(null);
  }
  function cancelReaction() {
    if (!reaction) return;
    for (const step of reaction.steps) stopStep(step);
    hud.clearSpeech(reaction.who);
    reaction = null;
  }

  // 면접관 세 명이 시간차를 두고 한 번씩 가볍게 반응하고, 한 명이 한마디 한다. 내 장면·다른 면접관 말풍선이 있으면 아무것도 하지 않는다.
  function react(line) {
    if (reaction || busy() || interviewerSpeaking()) return;
    const spec = remoteReaction(config, line, rng);
    if (!spec) return;
    reaction = { t: 0, who: spec.who, steps: order.map((id, i) => ({ id, at: i * REMOTE_REACT_STEP, stop: i * REMOTE_REACT_STEP + REMOTE_REACT_SECONDS, started: false, stopped: false, spec })) };
    hud.say(spec.who, spec.text, { name: names[spec.who], seconds: REMOTE_LINE_SECONDS });
  }

  function updateReaction(dt) {
    if (!reaction) return;
    if (busy()) { cancelReaction(); return; } // 내 장면이 우선: 즉시 걷는다
    reaction.t += dt;
    for (const step of reaction.steps) {
      const actor = interviewers.byId[step.id].actor;
      if (!step.started && reaction.t >= step.at) {
        step.started = true;
        actor.play(step.spec.clip);
        if (step.spec.clap) actor.setPose('clap');
        if (step.spec.bounce) actor.fx.setBounce(step.spec.bounce);
      }
      if (step.started && !step.stopped && reaction.t >= step.stop) stopStep(step);
    }
    if (reaction.steps.every((s) => s.stopped)) reaction = null;
  }

  // 말풍선들의 화면 위치: 방문자 머리(이름표) 위. 가까운 말풍선끼리 가로로 겹치면 오른쪽으로 비켜 놓는다(꼬리는 머리를 가리킨다).
  function placeBubbles(list, w, h) {
    const byId = new Map(list.map((p) => [p.id, p]));
    camera.updateMatrixWorld();
    const items = [];
    for (const key of hud.speechIds()) {
      if (!key.startsWith(PREFIX)) continue;
      const p = byId.get(key.slice(PREFIX.length));
      if (!p) { hud.clearRemoteSpeech(key); continue; } // 방문자가 사라지면 말풍선도 걷는다
      point.set(p.x, p.y + HEAD_HEIGHT, p.z).project(camera);
      if (point.z >= 1) { hud.clearRemoteSpeech(key); continue; }
      const size = hud.speechSize(key) ?? { w: 120, h: 40 };
      items.push({ key, x: (point.x * 0.5 + 0.5) * w, y: (-point.y * 0.5 + 0.5) * h - ABOVE_LABEL_PX, ...size, shift: 0 });
    }
    items.sort((a, b) => a.x - b.x);
    for (let i = 1; i < items.length; i++) {
      const cur = items[i];
      for (let j = 0; j < i; j++) {
        const prev = items[j];
        if (Math.abs(cur.y - prev.y) >= Math.max(cur.h, prev.h)) continue; // 세로로 떨어져 있으면 겹치지 않는다
        const minX = prev.x + prev.shift + (prev.w + cur.w) / 2 + GAP_PX;
        if (cur.x + cur.shift < minX) cur.shift = minX - cur.x;
      }
    }
    for (const it of items) hud.positionSpeech(it.key, it.x, it.y, it.shift);
  }

  return {
    // 다른 방문자의 한마디를 보여 준다. ev: session.onSay 의 { id, nick, ty, q, a, imp }. 보여 줬으면 true.
    show(ev) {
      const line = remoteSayLine(config, ev);
      if (!line) return false;
      hud.say(`${PREFIX}${ev.id}`, line.text, { name: ev.nick, seconds: REMOTE_BUBBLE_SECONDS, remote: true });
      react(line);
      return true;
    },
    // 매 프레임. list: net.remotes(보간된 방문자들). space: 내가 있는 공간 id.
    update(dt, list, space) {
      if (space !== lastSpace) { // 공간이 바뀌면 모두 치운다
        lastSpace = space;
        hud.clearRemoteSpeech();
        cancelReaction();
      }
      updateReaction(dt);
      placeBubbles(list, renderer.domElement.clientWidth, renderer.domElement.clientHeight);
    },
    clear() {
      hud.clearRemoteSpeech();
      cancelReaction();
    },
    get reacting() { return reaction !== null; },
  };
}
