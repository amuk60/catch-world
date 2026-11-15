// 브라우저 전용: 다른 방문자의 면접 답변·돌발행동 말풍선과, 그 방문자가 앉은 의자의 담당 면접관의 질문·반응(담당 면접관제, 다대다 면접).
// 받은 것은 번호·id 뿐이고(logic/net.js 의 validateSay), 글은 내 config 에서 찾는다(logic/interview.js 의 remoteScene).
// 면접관 연기는 진행자(interviewCrew.js)에게 맡긴다: 내 장면이 진행 중이어도 담당 면접관이 다르면 그대로 보이고, 같은 면접관이 바쁘면 진행자가 한 건만 기다리게 한다.
// 멀티플레이가 켜져 있을 때만 main 이 만든다. 이 모듈은 내 지수·라운드·분석 이벤트를 건드리지 않는다.
import * as THREE from 'three';
import { remoteSayLine, remoteScene, REMOTE_BUBBLE_SECONDS } from './logic/interview.js';

const PREFIX = 'r-'; // hud 말풍선 id 앞머리(hud.js 의 REMOTE_PREFIX 와 같다)
const HEAD_HEIGHT = 1.8; // 이름표(remotePlayers.js 의 LABEL_HEIGHT)와 같은 머리 위 높이(발 기준)
const ABOVE_LABEL_PX = 26; // 말풍선이 이름표 위에 놓이도록 올리는 화면 거리
const GAP_PX = 8; // 옆 말풍선과 띄우는 거리

// opts: { hud, crew, camera, renderer, config(INTERVIEW), interviewerOf(방문자 id): 그 방문자가 앉은 의자의 담당 면접관 id(없으면 null), posOf(방문자 id): 그 방문자의 { x, z }(효과음 위치, 없어도 된다), rng }
export function createRemoteSpeech({ hud, crew, camera, renderer, config, interviewerOf, posOf, rng = Math.random }) {
  const point = new THREE.Vector3();
  let lastSpace = null;

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
    // 담당 면접관이 있으면 그 면접관이 질문 -> (잠시 뒤) 방문자의 답변 말풍선 -> 반응(또는 돌발행동 반응)을 하고, 없으면(의자를 못 찾음) 말풍선만 바로 띄운다.
    show(ev) {
      const line = remoteSayLine(config, ev);
      if (!line) return false;
      const bubble = () => {
        const pos = posOf?.(ev.id); // 말풍선 웅얼거림이 그 방문자의 위치에서 나도록(멀면 작게)
        hud.say(`${PREFIX}${ev.id}`, line.text, { name: ev.nick, seconds: REMOTE_BUBBLE_SECONDS, remote: true, at: pos ? { x: pos.x, z: pos.z } : undefined });
      };
      const assigned = interviewerOf(ev.id);
      const scene = assigned && remoteScene(config, ev, assigned, { rng });
      if (!scene) { bubble(); return true; }
      if (scene.bubbleAt === 0) bubble(); // 돌발행동은 말풍선을 바로(면접관 반응은 기다릴 수 있다)
      crew.remote(assigned, ev.id, { ...scene, onBubble: scene.bubbleAt === 0 ? null : bubble });
      return true;
    },
    // 매 프레임. list: net.remotes(보간된 방문자들). space: 내가 있는 공간 id.
    update(dt, list, space) {
      if (space !== lastSpace) { // 공간이 바뀌면 모두 치운다
        lastSpace = space;
        hud.clearRemoteSpeech();
        crew.clear();
      }
      placeBubbles(list, renderer.domElement.clientWidth, renderer.domElement.clientHeight);
    },
    clear() {
      hud.clearRemoteSpeech();
      crew.clear();
    },
  };
}
