// 브라우저 전용: 면접장 돌발행동의 소품·효과(싸고 절차적으로 만든 도형): 마이크·합격 도장·선글라스·종이비행기·"합격" 도장 자국·음표.
// 면접 장면(interviewScene.js)이 대본의 prop / slam / plane / notes 이벤트를 이 모듈에 넘기고 매 프레임 update(dt) 를 불러 준다. 새 소리는 없다.
import * as THREE from 'three';

const NOTE_LIFE = 2.2; // 음표가 떠 있는 시간(초)
const STAMP_LIFE = 6; // 도장 자국이 남는 최대 시간(초, 장면이 끝나면 곧바로 지운다)
const RING_LIFE = 0.45;

const mat = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.6, ...extra });

function canvasTexture(draw, w, h) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  draw(canvas.getContext('2d'), w, h);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// 종이비행기 도형(두 날개 + 가운데 접힌 선). 크기 s.
function planeMesh(s = 1) {
  const geo = new THREE.BufferGeometry();
  const v = [
    0, 0, 0.2, -0.12, 0.02, -0.12, 0, -0.02, -0.1, // 왼쪽 날개
    0, 0, 0.2, 0, -0.02, -0.1, 0.12, 0.02, -0.12, // 오른쪽 날개
  ];
  geo.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0xffffff, side: THREE.DoubleSide, roughness: 0.9 }));
  mesh.scale.setScalar(s);
  return mesh;
}

export function createInterviewProps({ root, player, interior, interviewers }) {
  const handHolder = player.getObjectByName('hand-holder') ?? null;
  let headBone = null;
  player.traverse((o) => { if (!headBone && o.isBone && /^head$/i.test(o.name)) headBone = o; });

  // ---- 손에 드는 소품 ----
  const micGroup = new THREE.Group();
  const micHandle = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.03, 0.2, 10), mat(0x2b2b33));
  const micHead = new THREE.Mesh(new THREE.SphereGeometry(0.055, 12, 10), mat(0xc9ced6, { metalness: 0.5, roughness: 0.35 }));
  micHead.position.y = 0.13;
  micGroup.add(micHandle, micHead);

  const stampGroup = new THREE.Group();
  const stampBase = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.04, 0.15), mat(0xb82820));
  const stampGrip = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, 0.12, 10), mat(0x5a2d14));
  stampGrip.position.y = 0.08;
  stampGroup.add(stampBase, stampGrip);

  const handPlane = planeMesh(1);

  // 선글라스: 머리뼈(없으면 머리 높이 고정)에 붙인다.
  const shadesGroup = new THREE.Group();
  const lensMat = mat(0x111118, { roughness: 0.15, metalness: 0.4 });
  for (const sx of [-1, 1]) {
    const lens = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.11, 0.03), lensMat);
    lens.position.x = sx * 0.13;
    shadesGroup.add(lens);
  }
  shadesGroup.add(new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.025, 0.03), lensMat)); // 코받침(렌즈 사이)

  const holds = { mic: micGroup, stamp: stampGroup, plane: handPlane, shades: shadesGroup };
  const HAND_OFFSET = { mic: { pos: [0, 0.05, 0], rot: [0.5, 0, 0] }, stamp: { pos: [0, 0.04, 0], rot: [0, 0, 0] }, plane: { pos: [0, 0.05, 0], rot: [0, 0, 0] } };
  const shown = new Map(); // 이름 -> 남은 초

  function attach(name) {
    const obj = holds[name];
    if (name === 'shades') {
      if (headBone) {
        headBone.add(obj);
        const sc = new THREE.Vector3();
        headBone.updateWorldMatrix(true, false);
        headBone.getWorldScale(sc);
        obj.scale.set(1 / sc.x, 1 / sc.y, 1 / sc.z);
        obj.position.set(0, 0.3 / sc.y, 0.27 / sc.z); // 머리 모델(뼈 기준 위 0.5, 앞면 z 0.255)의 눈높이 바로 앞
      } else {
        player.add(obj);
        obj.position.set(0, 1.5, 0.13);
      }
      return;
    }
    const o = HAND_OFFSET[name];
    if (handHolder) handHolder.add(obj);
    else player.add(obj);
    if (!handHolder) obj.position.set(-0.35, 0.8, 0.3); // 손 뼈가 없으면 몸 옆 고정 위치
    else obj.position.set(...o.pos);
    obj.rotation.set(...o.rot);
    obj.scale.setScalar(2.2); // 캐릭터가 크다(머리 폭 약 0.7)
  }
  function detach(name) {
    holds[name].removeFromParent();
  }

  // ---- 도장 자국과 충격 고리 ----
  const stampTex = canvasTexture((g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.strokeStyle = '#d6322b';
    g.fillStyle = '#d6322b';
    g.lineWidth = 12;
    g.strokeRect(10, 10, w - 20, h - 20);
    g.font = '900 96px "Malgun Gothic", "Noto Sans KR", sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('합격', w / 2, h / 2 + 4);
  }, 192, 192);
  const stampGeo = new THREE.PlaneGeometry(0.5, 0.5);
  const stamps = []; // { mesh, t }
  const rings = []; // { mesh, t }
  const ringGeo = new THREE.RingGeometry(0.1, 0.13, 28);

  // ---- 종이비행기(날아가는 중) ----
  const flights = []; // { mesh, from, to, t, seconds, phase, fall }
  const tmpA = new THREE.Vector3();
  const tmpB = new THREE.Vector3();

  // ---- 음표 ----
  const noteTex = ['♪', '♫'].map((ch, i) => canvasTexture((g, w, h) => {
    g.font = '700 84px "Malgun Gothic", sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = i ? '#ff7ab8' : '#5fa8ff';
    g.strokeStyle = '#ffffff';
    g.lineWidth = 8;
    g.strokeText(ch, w / 2, h / 2);
    g.fillText(ch, w / 2, h / 2);
  }, 96, 96));
  const notes = []; // { sprite, t, delay, drift, x0 }
  const noteSpawns = []; // { at, left } 예약

  const api = {
    // 소품을 seconds 동안 손(머리)에 든다.
    show(name, seconds) {
      if (!holds[name]) return;
      if (!shown.has(name)) attach(name);
      shown.set(name, seconds);
    },
    hide(name) {
      if (shown.delete(name)) detach(name);
    },
    // 도장 쾅: 책상 위(플레이어 앞)에 "합격" 자국이 팡 찍히고 충격 고리가 퍼진다.
    slam() {
      const x = player.position.x + (Math.random() - 0.5) * 1.1;
      const z = interior.deskTop.z + 0.28 + (Math.random() - 0.5) * 0.3;
      const y = interior.deskTop.y + 0.012 + stamps.length * 0.0005;
      const mesh = new THREE.Mesh(stampGeo, new THREE.MeshBasicMaterial({ map: stampTex, transparent: true, depthWrite: false, opacity: 0.92 }));
      mesh.rotation.set(-Math.PI / 2, 0, (Math.random() - 0.5) * 0.7);
      mesh.position.set(x, y, z);
      root.add(mesh);
      stamps.push({ mesh, t: 0 });
      const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0xffe08a, transparent: true, depthWrite: false }));
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(x, y + 0.004, z);
      root.add(ring);
      rings.push({ mesh: ring, t: 0 });
    },
    // 종이비행기: 손에서 팀장 쪽으로 포물선을 그리며 날아가고, 맞으면 튕겨 책상 위로 떨어진다.
    plane(seconds, targetId = 'leader') {
      const mesh = planeMesh(2.2);
      root.add(mesh);
      const from = (handHolder ? handHolder.getWorldPosition(tmpA) : tmpA.set(player.position.x, 1.2, player.position.z)).clone();
      const to = interviewers.headPoint(targetId, tmpB).clone();
      to.y -= 0.35; // 이마 높이
      flights.push({ mesh, from, to, t: 0, seconds: Math.max(0.3, seconds), fall: 0, floorY: interior.deskTop.y + 0.02 });
    },
    // 음표가 count 개, seconds 동안 나뉘어 플레이어 머리 옆에서 떠오른다.
    notes(count, seconds) {
      noteSpawns.push({ at: 0, left: count, gap: seconds / Math.max(1, count) });
    },
    update(dt) {
      for (const [name, left] of [...shown]) {
        if (left - dt <= 0) api.hide(name);
        else shown.set(name, left - dt);
      }
      for (let i = stamps.length - 1; i >= 0; i--) {
        const s = stamps[i];
        s.t += dt;
        const pop = s.t < 0.14 ? 1.5 - (s.t / 0.14) * 0.5 : 1; // 쾅: 커졌다 자리 잡는다
        s.mesh.scale.setScalar(pop);
        if (s.t > STAMP_LIFE) { root.remove(s.mesh); s.mesh.material.dispose(); stamps.splice(i, 1); }
      }
      for (let i = rings.length - 1; i >= 0; i--) {
        const r = rings[i];
        r.t += dt;
        const k = r.t / RING_LIFE;
        r.mesh.scale.setScalar(1 + k * 3);
        r.mesh.material.opacity = Math.max(0, 0.8 * (1 - k));
        if (k >= 1) { root.remove(r.mesh); r.mesh.material.dispose(); rings.splice(i, 1); }
      }
      for (let i = flights.length - 1; i >= 0; i--) {
        const f = flights[i];
        f.t += dt;
        if (f.t < f.seconds) {
          const k = f.t / f.seconds;
          const prev = f.mesh.position.clone();
          f.mesh.position.lerpVectors(f.from, f.to, k);
          f.mesh.position.y += 0.45 * Math.sin(Math.PI * k);
          const dir = f.mesh.position.clone().sub(prev);
          if (dir.lengthSq() > 1e-8) f.mesh.lookAt(f.mesh.position.clone().add(dir));
          f.mesh.rotation.z += Math.sin(k * 14) * 0.2;
        } else {
          f.fall += dt; // 튕겨 나와 책상으로 떨어진다
          const u = f.fall;
          f.mesh.position.x += (f.from.x - f.to.x) * 0.25 * dt;
          f.mesh.position.z += (f.from.z - f.to.z) * 0.25 * dt;
          f.mesh.position.y = Math.max(f.floorY, f.mesh.position.y - (0.4 + 2.2 * u) * dt);
          f.mesh.rotation.x += 6 * dt;
          if (u > 1.4) { root.remove(f.mesh); f.mesh.geometry.dispose(); f.mesh.material.dispose(); flights.splice(i, 1); }
        }
      }
      for (let i = noteSpawns.length - 1; i >= 0; i--) {
        const sp = noteSpawns[i];
        sp.at -= dt;
        while (sp.at <= 0 && sp.left > 0) {
          const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: noteTex[sp.left % 2], transparent: true, depthWrite: false, depthTest: false }));
          sprite.scale.setScalar(0.36);
          sprite.renderOrder = 10;
          const x0 = player.position.x + (sp.left % 3 - 1) * 0.35;
          sprite.position.set(x0, player.position.y + 1.7, player.position.z);
          root.add(sprite);
          notes.push({ sprite, t: 0, x0, drift: Math.random() * Math.PI * 2 });
          sp.left--;
          sp.at += sp.gap;
        }
        if (sp.left <= 0) noteSpawns.splice(i, 1);
      }
      for (let i = notes.length - 1; i >= 0; i--) {
        const n = notes[i];
        n.t += dt;
        const k = n.t / NOTE_LIFE;
        n.sprite.position.y += 0.75 * dt;
        n.sprite.position.x = n.x0 + Math.sin(n.t * 4 + n.drift) * 0.16;
        n.sprite.material.opacity = k > 0.75 ? Math.max(0, (1 - k) / 0.25) : 1;
        if (k >= 1) { root.remove(n.sprite); n.sprite.material.dispose(); notes.splice(i, 1); }
      }
    },
    // 장면이 끝났거나 끊겼다: 소품과 효과를 모두 치운다.
    clear() {
      for (const name of [...shown.keys()]) api.hide(name);
      for (const s of stamps) { root.remove(s.mesh); s.mesh.material.dispose(); }
      for (const r of rings) { root.remove(r.mesh); r.mesh.material.dispose(); }
      for (const f of flights) { root.remove(f.mesh); f.mesh.geometry.dispose(); f.mesh.material.dispose(); }
      for (const n of notes) { root.remove(n.sprite); n.sprite.material.dispose(); }
      stamps.length = 0; rings.length = 0; flights.length = 0; notes.length = 0; noteSpawns.length = 0;
    },
    // 시험·디버그용 개수.
    get counts() { return { shown: [...shown.keys()], stamps: stamps.length, flights: flights.length, notes: notes.length }; },
  };
  return api;
}
