// 브라우저 전용: 면접관 3명(팀장·인사담당·예비 사수). 책상 뒤 의자에 앉아 있고(sit 동작), 답변 반응·돌발행동·완주 때 한 번짜리 동작·박수·튀기·돌기·일어서기를 한다.
// 캐릭터 모델은 config 의 INTERVIEW.interviewers 에서 온다. 모델을 못 불러오면 색 막대 대체물(말풍선·연출 신호는 그대로 동작).
import * as THREE from 'three';
import { createActor, createFx } from './actor.js';

const ONE_SHOTS = ['emote-yes', 'emote-no', 'interact-left', 'interact-right', 'jump', 'pick-up'];
const CHAIR_PUSH = 0.7; // 일어설 때 의자가 뒤(북쪽)로 밀리는 거리
const CHAIR_SECONDS = 0.35;
const STAND_SECONDS = 0.35;
const STAND_LIFT = 0.12; // 일어설 때 앉은 높이보다 더 올라오는 거리
const BUBBLE_SHIFT = 62; // 면접관 말풍선 가로 비킴(px)
const COLORS = { leader: 0xb4382e, hr: 0xc2569a, mentor: 0x3d7be0 };

// 모델이 없을 때의 대체 연기자: 색 막대. 연출 호출은 모두 받되 동작은 없다.
function fallbackActor(color) {
  const group = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.25, 0.6, 4, 8), new THREE.MeshStandardMaterial({ color }));
  body.position.y = 0.55;
  group.add(body);
  const fx = createFx(group);
  return { group, fx, top: 1.2, setBase() {}, play: () => false, setPose() {}, update: (dt) => fx.update(dt) };
}

// root: 실내 그룹(방과 함께 숨는다). interior: 실내 데이터(seats). gltfs: 면접관 id -> gltf(없으면 null). chairs: 면접관 id -> 의자 오브젝트. cfg: INTERVIEW.interviewers.
export function createInterviewers({ root, interior, gltfs, chairs, cfg }) {
  const list = cfg.map((c) => {
    const seat = interior.seats.find((s) => s.id === c.id);
    const gltf = gltfs[c.id];
    const actor = gltf ? createActor(gltf, { scale: c.scale, base: 'sit', oneShots: ONE_SHOTS }) : fallbackActor(COLORS[c.id]);
    actor.group.position.set(seat.x, seat.y, seat.z);
    actor.group.rotation.y = seat.rotY;
    root.add(actor.group);
    actor.fx.begin(); // 이 연기자는 항상 앵커(앉은 자리) 기준으로 움직인다
    const chair = chairs[c.id];
    return {
      id: c.id, name: c.name, seat, actor, chair, standing: false,
      chairBase: chair ? chair.position.clone() : null, chairT: 1, chairFrom: 0, chairTo: 0, // 의자 z 오프셋 보간
      yawBase: seat.rotY,
    };
  });
  const byId = Object.fromEntries(list.map((m) => [m.id, m]));

  function moveChair(m, toOffset) {
    if (!m.chair) return;
    m.chairFrom = m.chairT >= 1 ? m.chairTo : m.chairFrom + (m.chairTo - m.chairFrom) * m.chairT;
    m.chairTo = toOffset;
    m.chairT = 0;
  }

  const api = {
    list, byId,
    // 일어선다(앉은 자세 -> 서기, 의자가 뒤로 밀린다).
    stand(id) {
      const m = byId[id];
      if (!m || m.standing) return;
      m.standing = true;
      m.actor.setBase('idle');
      m.actor.fx.moveAnchor({ y: m.seat.y + STAND_LIFT }, STAND_SECONDS); // 앉는 동작이 낮춘 몸이 펴지고 살짝 더 올라온다(발은 책상에 가려 있다)
      moveChair(m, -CHAIR_PUSH);
    },
    // 다시 앉는다.
    sit(id) {
      const m = byId[id];
      if (!m || !m.standing) return;
      m.standing = false;
      m.actor.setBase('sit');
      m.actor.fx.moveAnchor({ y: m.seat.y }, STAND_SECONDS);
      moveChair(m, 0);
    },
    // 장면 중간에 끊겼을 때: 그 면접관만 앉히고 효과를 지운다(즉시). 담당 면접관제에서는 다른 면접관이 남의 장면 중일 수 있어 한 명씩 되돌린다.
    resetOne(id) {
      const m = byId[id];
      if (!m) return;
      m.actor.setPose(null);
      m.actor.fx.setBounce(null);
      m.standing = false;
      m.actor.setBase('sit');
      m.actor.fx.setAnchor({ y: m.seat.y });
      m.actor.group.rotation.y = m.yawBase;
      m.chairT = 1;
      m.chairTo = 0;
      if (m.chair) m.chair.position.copy(m.chairBase);
    },
    // 모두 즉시 되돌린다(방을 나갈 때).
    reset() {
      for (const m of list) api.resetOne(m.id);
    },
    // 말풍선이 옆 면접관과 겹치지 않게 비켜 놓는 가로 거리(px): 서쪽 면접관은 왼쪽, 동쪽 면접관은 오른쪽, 가운데는 그대로.
    bubbleShift(id) {
      return Math.sign(Math.round((byId[id].seat.x - interior.origin.x) * 10)) * BUBBLE_SHIFT;
    },
    // 말풍선 기준점(머리 위)을 out 에 넣는다.
    headPoint(id, out) {
      const m = byId[id];
      const { group, top } = m.actor;
      return out.set(group.position.x, group.position.y + top * (m.standing ? 1 : 0.62) + 0.45, group.position.z);
    },
    update(dt) {
      for (const m of list) {
        m.actor.update(dt);
        if (m.chair && m.chairT < 1) {
          m.chairT = Math.min(1, m.chairT + dt / CHAIR_SECONDS);
          const e = m.chairT * m.chairT * (3 - 2 * m.chairT);
          m.chair.position.z = m.chairBase.z + m.chairFrom + (m.chairTo - m.chairFrom) * e;
        }
      }
    },
  };
  return api;
}
