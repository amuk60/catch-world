// 브라우저 전용: 같은 공간에 있는 다른 방문자들의 아바타. 플레이어와 같은 캐릭터(createPlayer: 복제 + 믹서 + 옷 겉모습)를 쓰고,
// 발밑의 옅은 하늘색 고리와 머리 위 닉네임(HTML)으로 내 캐릭터와 구분한다. 충돌·가림·상호작용·장애물에는 넣지 않는다.
// 아바타는 풀에서 재사용한다(옷 겉모습이 만든 복제 재질·지오메트리를 버리지 않아도 되고, 새 방문자가 들어올 때 생기는 끊김도 줄인다).
// 사라질 때의 페이드는 몸 크기·고리·이름표 투명도로 한다(몸 재질은 내 캐릭터와 공유하므로 투명도를 건드리지 않는다).
import * as THREE from 'three';
import { createPlayer } from './player.js';
import { PLAZA } from './logic/layout.js';
import { createFootstepper, surfaceAt, remoteAnimCue, STEP_SOUND, FOOTSTEP_STRIDE, FOOTSTEP_JITTER } from './logic/audioPolicy.js';
import { sfx } from './audio/sfx.js';

const FADE_SECONDS = 0.4;
const LABEL_HEIGHT = 1.8; // 이름표를 다는 머리 위 높이(발 기준, 단위)
const LABEL_MAX_DIST = 45; // 이보다 먼 아바타는 이름표를 숨긴다
const CREATE_PER_FRAME = 2; // 한 프레임에 새로 만드는 아바타 수 상한(만드는 비용 분산)
const WALK_ON = 0.6; // 이 속도(단위/초) 이상이면 걷기
const WALK_OFF = 0.25; // 걷는 중에는 이 속도 미만이어야 멈춤(떨림 방지)
const BASE_STATES = new Set(['idle', 'walk', 'sit']);
const ringGeometry = new THREE.RingGeometry(0.42, 0.55, 40).rotateX(-Math.PI / 2);

// opts: { scene, container(이름표 층을 붙일 요소), camera, gltf(캐릭터 모델, 없으면 상자), maxAvatars }
export function createRemotePlayers({ scene, container, camera, gltf, maxAvatars = 20 }) {
  const layer = document.createElement('div');
  layer.className = 'mp-labels';
  container.append(layer);
  const active = new Map(); // id -> avatar
  const pool = []; // 쉬는 아바타
  let created = 0;
  let lastSpace = null;
  const tmp = new THREE.Vector3();

  function build() {
    const root = new THREE.Group();
    root.visible = false;
    let character = null;
    let body;
    if (gltf) {
      character = createPlayer(gltf);
      body = character.group;
    } else {
      body = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.4, 0.6), new THREE.MeshLambertMaterial({ color: 0x6ec6ff }));
      body.position.y = 0.7;
    }
    root.add(body);
    const ring = new THREE.Mesh(ringGeometry, new THREE.MeshBasicMaterial({ color: 0x8fd8ff, transparent: true, opacity: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
    ring.position.y = 0.04;
    ring.renderOrder = 1;
    root.add(ring);
    const label = document.createElement('div');
    label.className = 'mp-label';
    label.style.display = 'none';
    layer.append(label);
    scene.add(root);
    created++;
    return { id: null, root, body, character, ring, label, alpha: 0, target: 0, anim: null, walking: false, outfit: null, nick: '', lx: NaN, ly: NaN, lo: -1, stepper: createFootstepper(FOOTSTEP_STRIDE, { jitter: FOOTSTEP_JITTER }), sx: NaN, sz: NaN, animSound: undefined };
  }

  function acquire(id) {
    let av = pool.pop();
    if (!av) {
      if (created >= maxAvatars + 4) return null;
      av = build();
    }
    av.id = id;
    av.alpha = 0;
    av.target = 1;
    av.anim = null;
    av.walking = false;
    av.outfit = null;
    av.nick = '';
    av.stepper.reset();
    av.sx = NaN;
    av.sz = NaN;
    av.animSound = undefined;
    av.root.visible = true;
    active.set(id, av);
    return av;
  }

  function release(av) {
    active.delete(av.id);
    av.id = null;
    av.root.visible = false;
    av.label.style.display = 'none';
    av.lx = NaN;
    av.lo = -1;
    av.character?.endAction();
    pool.push(av);
  }

  function applyAnim(av, p) {
    const c = av.character;
    if (!c) { av.anim = p.anim; return; }
    if (!BASE_STATES.has(p.anim)) {
      if (av.anim !== p.anim) { c.beginAction(); c.playClip(p.anim, 1); }
    } else {
      if (c.isActing()) c.endAction(p.seat ? 'sit' : 'idle');
      av.walking = p.speed > (av.walking ? WALK_OFF : WALK_ON);
      c.setState(p.seat || p.anim === 'sit' ? 'sit' : av.walking ? 'walk' : 'idle');
    }
    av.anim = p.anim;
  }

  // 다른 방문자의 효과음(발소리·세탁소 널기): 같은 공간에서 가까울수록 크게, 아주 작게(거리 감쇠와 초당 상한은 sfx 가 맡는다). 처음 보이는 순간의 자세는 소리 내지 않는다.
  function sounds(av, p, space) {
    const at = { x: p.x, z: p.z };
    const opts = { at, space, remote: true };
    if (av.walking && Number.isFinite(av.sx)) {
      if (av.stepper.advance(Math.hypot(p.x - av.sx, p.z - av.sz))) sfx.play(STEP_SOUND[surfaceAt(space, p.x, p.z, PLAZA)], opts);
    } else av.stepper.reset();
    av.sx = p.x;
    av.sz = p.z;
    if (av.animSound !== undefined && av.animSound !== p.anim) {
      const cue = remoteAnimCue(p.anim, space);
      if (cue) sfx.play(cue, opts);
    }
    av.animSound = p.anim;
  }

  function placeLabel(av, p, w, h, camPos) {
    tmp.set(p.x, p.y + LABEL_HEIGHT * (0.3 + 0.7 * av.alpha), p.z);
    const dist = tmp.distanceTo(camPos);
    tmp.project(camera);
    const on = tmp.z < 1 && Math.abs(tmp.x) < 1.15 && Math.abs(tmp.y) < 1.15 && dist < LABEL_MAX_DIST;
    if (!on) {
      if (av.lo !== 0) { av.label.style.display = 'none'; av.lo = 0; }
      return false;
    }
    const x = Math.round((tmp.x * 0.5 + 0.5) * w);
    const y = Math.round((-tmp.y * 0.5 + 0.5) * h);
    if (av.lo === 0 || av.lx !== x || av.ly !== y) {
      av.label.style.transform = `translate(${x}px, ${y}px) translate(-50%, -100%)`;
      av.lx = x;
      av.ly = y;
    }
    const o = Math.round(av.alpha * 20) / 20;
    if (av.lo !== o) { av.label.style.opacity = String(o); av.lo = o; }
    if (av.label.style.display !== 'block') av.label.style.display = 'block';
    return true;
  }

  return {
    // list: session.sample() 결과. space: 내가 있는 공간 id. w/h: 화면 크기(px).
    update(dt, list, space, w, h) {
      if (space !== lastSpace) { // 공간이 바뀌면 모두 곧장 치운다(이 공간의 좌표에 남아 있지 않게)
        lastSpace = space;
        for (const av of [...active.values()]) release(av);
      }
      const seen = new Set();
      let budget = CREATE_PER_FRAME;
      for (const p of list) {
        let av = active.get(p.id);
        if (!av) {
          if (budget <= 0) continue;
          if (!pool.length) budget--;
          av = acquire(p.id);
          if (!av) continue;
        }
        seen.add(p.id);
        av.target = 1;
        if (av.nick !== p.nick) { av.nick = p.nick; av.label.textContent = p.nick; }
        if (av.outfit !== p.outfit) { av.outfit = p.outfit; av.character?.applyOutfit(p.outfit); }
        av.root.position.set(p.x, 0, p.z);
        av.body.rotation.y = p.rotY;
        if (av.character) av.body.position.y = p.y;
        applyAnim(av, p);
        av.pose = p;
        sounds(av, p, space);
      }
      camera.updateMatrixWorld();
      const camPos = camera.position;
      for (const av of [...active.values()]) {
        if (!seen.has(av.id)) av.target = 0;
        const step = dt / FADE_SECONDS;
        av.alpha = av.target > av.alpha ? Math.min(av.target, av.alpha + step) : Math.max(av.target, av.alpha - step);
        if (av.alpha <= 0 && av.target === 0) { release(av); continue; }
        const a = av.alpha * av.alpha * (3 - 2 * av.alpha);
        av.root.scale.setScalar(0.3 + 0.7 * a);
        const sitting = Boolean(av.pose && (av.pose.seat || av.pose.anim === 'sit')); // 앉아 있으면 발밑 링이 의자에 가려 반쪽 호처럼 보이므로 숨긴다(어느 의자든)
        av.ring.material.opacity = sitting ? 0 : 0.55 * a;
        const visible = placeLabel(av, av.pose, w, h, camPos);
        if (visible || av.alpha < 1) av.character?.update(dt); // 화면 밖의 아바타는 애니메이션을 건너뛴다
      }
    },
    get activeCount() { return active.size; },
    get createdCount() { return created; },
    // 모두 치운다(끄기 토글·연결 끊김).
    clear() { for (const av of [...active.values()]) release(av); },
    dispose() {
      this.clear();
      for (const av of pool) { scene.remove(av.root); av.ring.material.dispose(); av.label.remove(); }
      pool.length = 0;
      layer.remove();
    },
  };
}
