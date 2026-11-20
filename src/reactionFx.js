// 브라우저 전용: 면접관 반응의 작은 효과(싸고 절차적인 스프라이트·도형). 면접관 머리 위 땀방울·ㅋㅋㅋ·엄지, 커피 뿜기, 떨어지는 펜, 흩날리는 서류.
// 장면 대본의 emote 이벤트(interviewCrew.apply)가 interviewers.emote(id, name) 을 부르면 여기서 그린다. 새 소리는 없다. 모두 짧게 떠 있다 사라지고 clear() 로 한꺼번에 치운다.
import * as THREE from 'three';
import { canvasTexture } from './interviewProps.js';

const LABEL_SIZE = 1.0; // 글자 효과 높이(월드 단위, 캐릭터 머리 폭 약 0.7)
const FONT = '900 84px "Malgun Gothic", "Noto Sans KR", "Segoe UI Emoji", sans-serif';
// 글자 효과: 이름 -> { text, color, life(초) }
const LABELS = {
  dots: { text: '...', color: '#59607a', life: 1.4 },
  laugh: { text: 'ㅋㅋㅋ', color: '#ff9a1f', life: 1.2 },
  cough: { text: '크흠!', color: '#59607a', life: 1.1 },
  thumb: { text: '👍', color: '#ffb400', life: 1.2 },
  sparkle: { text: '✨', color: '#ffd23a', life: 1.1 },
};

export function createReactionFx({ root, interviewers, interior }) {
  const items = []; // { obj, t, life, tick(item, dt), done?(item) }
  const textures = {};
  const tmp = new THREE.Vector3();
  const forward = new THREE.Vector3();
  const side = {}; // 면접관마다 효과를 좌우로 번갈아 놓는다

  function labelTexture(name) {
    if (!textures[name]) {
      const { text, color } = LABELS[name];
      textures[name] = canvasTexture((g, w, h) => {
        g.font = FONT;
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.lineJoin = 'round';
        g.lineWidth = 14;
        g.strokeStyle = '#ffffff';
        g.strokeText(text, w / 2, h / 2 + 4);
        g.fillStyle = color;
        g.fillText(text, w / 2, h / 2 + 4);
      }, 256, 128);
    }
    return textures[name];
  }
  const dropTexture = () => (textures.drop ??= canvasTexture((g, w, h) => {
    g.fillStyle = '#7cc7ff';
    g.strokeStyle = '#ffffff';
    g.lineWidth = 6;
    g.beginPath();
    g.moveTo(w / 2, 6);
    g.bezierCurveTo(w * 0.95, h * 0.55, w * 0.8, h - 6, w / 2, h - 6);
    g.bezierCurveTo(w * 0.2, h - 6, w * 0.05, h * 0.55, w / 2, 6);
    g.fill();
    g.stroke();
  }, 64, 96));
  const puffTexture = () => (textures.puff ??= canvasTexture((g, w, h) => {
    const grad = g.createRadialGradient(w / 2, h / 2, 2, w / 2, h / 2, w / 2);
    grad.addColorStop(0, 'rgba(255,255,255,0.95)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);
  }, 64, 64));

  function sprite(map, scale, aspect = 1) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map, transparent: true, depthWrite: false, depthTest: false }));
    sp.scale.set(scale * aspect, scale, 1);
    sp.renderOrder = 11;
    root.add(sp);
    return sp;
  }
  function add(item) { items.push({ t: 0, ...item }); }
  function head(id) { return interviewers.headPoint(id, tmp).clone(); }
  function faceDir(id) { // 면접관이 바라보는 쪽(앞)
    const y = interviewers.byId[id].actor.group.rotation.y;
    return forward.set(Math.sin(y), 0, Math.cos(y)).clone();
  }

  // 머리 옆에서 톡 튀어나와 떠오르다 사라지는 글자(머리 위는 말풍선이 쓴다).
  function label(id, name) {
    const { life } = LABELS[name];
    side[id] = -(side[id] ?? 1);
    const sp = sprite(labelTexture(name), LABEL_SIZE, 2);
    const base = head(id).add(new THREE.Vector3(side[id] * 0.8, -0.7, 0));
    sp.position.copy(base);
    add({
      obj: sp, life,
      tick(it) {
        const k = it.t / life;
        const pop = it.t < 0.14 ? 0.4 + (it.t / 0.14) * 1.0 : 1.4 - Math.min(1, (it.t - 0.14) / 0.2) * 0.4;
        sp.scale.set(LABEL_SIZE * 2 * pop, LABEL_SIZE * pop, 1);
        sp.position.set(base.x + Math.sin(it.t * 14) * 0.03 * (1 - k), base.y + 0.3 * k, base.z);
        sp.material.opacity = k > 0.7 ? Math.max(0, (1 - k) / 0.3) : 1;
      },
    });
  }

  // 땀방울 두 개: 머리 양옆에서 흘러내린다.
  function sweat(id) {
    for (const sx of [-1, 1]) {
      const sp = sprite(dropTexture(), 0.62, 0.67);
      const base = head(id).add(new THREE.Vector3(sx * 0.6, -0.5, 0));
      sp.position.copy(base);
      add({
        obj: sp, life: 1.1,
        tick(it) {
          const k = it.t / 1.1;
          sp.position.set(base.x + sx * 0.1 * k, base.y - 0.55 * k * k - 0.1 * k, base.z);
          sp.material.opacity = k > 0.6 ? Math.max(0, (1 - k) / 0.4) : 1;
        },
      });
    }
  }

  // 커피 뿜기: 입 쪽에서 작은 흰 방울들이 앞으로 퍼져 나간다.
  function puff(id) {
    const f = faceDir(id);
    const mouth = head(id).add(new THREE.Vector3(0, -0.45, 0)).addScaledVector(f, 0.45);
    for (let i = 0; i < 12; i++) {
      const sp = sprite(puffTexture(), 0.22 + Math.random() * 0.16);
      const vel = new THREE.Vector3((Math.random() - 0.5) * 1.6, 0.5 + Math.random() * 0.9, 0).addScaledVector(f, 1.3 + Math.random() * 1.4);
      sp.position.copy(mouth);
      add({
        obj: sp, life: 0.85,
        tick(it, dt) {
          vel.y -= 2.6 * dt;
          sp.position.addScaledVector(vel, dt);
          sp.material.opacity = Math.max(0, 1 - it.t / 0.85);
        },
      });
    }
  }

  // 펜 떨어뜨리기: 손 높이에서 빙글 돌며 책상으로 떨어져 튕긴다.
  function pen(id) {
    const f = faceDir(id);
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.8, 8), new THREE.MeshStandardMaterial({ color: 0x2c5fd0, roughness: 0.5 }));
    const floor = interior.deskTop.y + 0.04;
    mesh.position.copy(head(id)).add(new THREE.Vector3(0, -0.5, 0)).addScaledVector(f, 0.55);
    mesh.position.y = Math.max(floor + 0.5, mesh.position.y);
    root.add(mesh);
    let vy = 1.2;
    add({
      obj: mesh, life: 1.6, dispose: true,
      tick(it, dt) {
        if (mesh.position.y > floor || vy > 0) {
          vy -= 9 * dt;
          mesh.position.y += vy * dt;
          mesh.rotation.z += 7 * dt;
          mesh.rotation.x += 4 * dt;
          if (mesh.position.y <= floor) { mesh.position.y = floor; if (vy < -2) vy = -vy * 0.35; else vy = 0; }
        }
        if (it.t > 1.2) mesh.material.opacity = 1;
      },
    });
  }

  // 서류 쏟기: 책상 위 면접관 앞에서 종이 여러 장이 튀어 올랐다가 하늘하늘 떨어진다.
  function papers(id) {
    const f = faceDir(id);
    const g = (fx.paperGeo ??= new THREE.PlaneGeometry(0.28, 0.38));
    const m = (fx.paperMat ??= new THREE.MeshStandardMaterial({ color: 0xffffff, side: THREE.DoubleSide, roughness: 0.9 }));
    const group = interviewers.byId[id].actor.group.position;
    for (let i = 0; i < 7; i++) {
      const mesh = new THREE.Mesh(g, m);
      mesh.position.set(group.x, interior.deskTop.y + 0.1, group.z).addScaledVector(f, 0.75);
      mesh.position.x += (Math.random() - 0.5) * 0.8;
      mesh.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
      root.add(mesh);
      const vel = new THREE.Vector3((Math.random() - 0.5) * 1.4, 2.4 + Math.random() * 1.6, (Math.random() - 0.5) * 0.8).addScaledVector(f, 0.5);
      const floor = interior.deskTop.y + 0.03;
      add({
        obj: mesh, life: 2.2,
        tick(it, dt) {
          if (mesh.position.y > floor) {
            vel.y -= 5.5 * dt;
            vel.x *= 1 - 1.1 * dt;
            mesh.position.addScaledVector(vel, dt);
            mesh.rotation.x += 6 * dt;
            mesh.rotation.z += 4 * dt;
            if (mesh.position.y <= floor) { mesh.position.y = floor; mesh.rotation.set(-Math.PI / 2, 0, mesh.rotation.z); }
          }
        },
      });
    }
  }

  const fx = {
    emote(id, name) {
      if (!interviewers.byId[id]) return;
      if (LABELS[name]) label(id, name);
      else if (name === 'sweat') sweat(id);
      else if (name === 'puff') puff(id);
      else if (name === 'pen') pen(id);
      else if (name === 'papers') papers(id);
    },
    update(dt) {
      for (let i = items.length - 1; i >= 0; i--) {
        const it = items[i];
        it.t += dt;
        it.tick(it, dt);
        if (it.t >= it.life) { remove(i); }
      }
    },
    clear() { for (let i = items.length - 1; i >= 0; i--) remove(i); },
    get count() { return items.length; },
  };
  function remove(i) {
    const it = items[i];
    root.remove(it.obj);
    if (it.obj.material && !it.obj.material.map && it.dispose) { it.obj.material.dispose(); it.obj.geometry.dispose(); } else if (it.obj.isSprite) it.obj.material.dispose();
    items.splice(i, 1);
  }
  return fx;
}
