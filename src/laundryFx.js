// 브라우저 전용: 세탁소 이펙트(외부 에셋 없음, 캔버스로 그린 질감 + 풀링한 스프라이트).
//  - 세탁기 위 LED 표시판(고른 빨 것 글 + 점·퍼센트), 셔츠가 들어갈 때 먼지·물방울, 돌아가는 동안 올라오는 무지갯빛 비누방울·반짝이, 끝의 향기 폭죽(별 반짝이·빛 고리·방울 터짐)
//  - 널 때 떨어지는 물방울과 자리 잡을 때의 반짝임, 마른 내 셔츠의 되풀이 반짝임
//  - 선택 창의 "빨 것" 썸네일(buildStainIcon: 셔츠 위의 얼룩·냄새 구름)
// 시간표·진행률 계산은 logic/laundry.js(순수). 스프라이트는 처음에 한꺼번에 만들어 쓰고 안 쓰는 것은 숨겨 draw call 이 없다.
import * as THREE from 'three';
import { LAUNDRY_FX } from './config.js';
import { fontOf } from './signFont.js';
import { slotPoint, washEvents, washDisplay, displayAlpha, hangEvents, dryTwinkle } from './logic/laundry.js';

const canvasOf = (w, h) => {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  return [canvas, canvas.getContext('2d')];
};
const textureOf = (canvas) => {
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
};

// ---- 질감 ----
function bubbleTexture() {
  const [c, g] = canvasOf(64, 64);
  const fill = g.createRadialGradient(32, 32, 6, 32, 32, 30);
  fill.addColorStop(0, 'rgba(255,255,255,0.05)');
  fill.addColorStop(0.8, 'rgba(210,240,255,0.22)');
  fill.addColorStop(1, 'rgba(255,255,255,0.5)');
  g.fillStyle = fill;
  g.beginPath(); g.arc(32, 32, 30, 0, Math.PI * 2); g.fill();
  for (let i = 0; i < 6; i++) { // 가장자리의 무지갯빛 띠
    g.strokeStyle = `hsla(${(i * 60 + 180) % 360}, 90%, 78%, 0.75)`;
    g.lineWidth = 3;
    g.beginPath(); g.arc(32, 32, 28.5, (i * Math.PI) / 3, ((i + 1) * Math.PI) / 3 + 0.05); g.stroke();
  }
  g.fillStyle = 'rgba(255,255,255,0.95)'; // 하이라이트
  g.beginPath(); g.ellipse(21, 20, 7, 4, -0.7, 0, Math.PI * 2); g.fill();
  g.fillStyle = 'rgba(255,255,255,0.6)';
  g.beginPath(); g.arc(44, 45, 2.6, 0, Math.PI * 2); g.fill();
  return textureOf(c);
}
function sparkTexture() {
  const [c, g] = canvasOf(64, 64);
  const glow = g.createRadialGradient(32, 32, 0, 32, 32, 30);
  glow.addColorStop(0, 'rgba(255,255,255,0.95)');
  glow.addColorStop(0.25, 'rgba(255,255,255,0.35)');
  glow.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = glow;
  g.fillRect(0, 0, 64, 64);
  g.fillStyle = '#fff'; // 네 갈래 별
  g.beginPath();
  g.moveTo(32, 2); g.quadraticCurveTo(35, 29, 62, 32); g.quadraticCurveTo(35, 35, 32, 62); g.quadraticCurveTo(29, 35, 2, 32); g.quadraticCurveTo(29, 29, 32, 2);
  g.fill();
  return textureOf(c);
}
function dropTexture() {
  const [c, g] = canvasOf(32, 48);
  const grad = g.createLinearGradient(0, 4, 0, 44);
  grad.addColorStop(0, '#d6f1ff');
  grad.addColorStop(1, '#5eb4ea');
  g.fillStyle = grad;
  g.beginPath();
  g.moveTo(16, 3); g.bezierCurveTo(16, 14, 5, 22, 5, 32); g.arc(16, 32, 11, Math.PI, 0, true); g.bezierCurveTo(27, 22, 16, 14, 16, 3);
  g.fill();
  g.fillStyle = 'rgba(255,255,255,0.8)';
  g.beginPath(); g.ellipse(11.5, 31, 2.4, 5, 0.3, 0, Math.PI * 2); g.fill();
  return textureOf(c);
}
function puffTexture() {
  const [c, g] = canvasOf(64, 64);
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 31);
  grad.addColorStop(0, 'rgba(255,252,244,0.85)');
  grad.addColorStop(0.5, 'rgba(240,232,216,0.45)');
  grad.addColorStop(1, 'rgba(235,228,214,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return textureOf(c);
}
function ringTexture() {
  const [c, g] = canvasOf(128, 128);
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 62);
  grad.addColorStop(0, 'rgba(255,255,255,0)');
  grad.addColorStop(0.62, 'rgba(255,255,255,0.05)');
  grad.addColorStop(0.82, 'rgba(255,255,255,0.9)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  return textureOf(c);
}

// 반짝이·방울 색(파스텔).
const SPARK_COLORS = [0xffd6e7, 0xc9f3e6, 0xfff3b0, 0xdcd0ff, 0xffffff, 0xbfe6ff].map((h) => new THREE.Color(h));
const BUBBLE_HUES = [0.5, 0.58, 0.85, 0.15, 0.7, 0.35];

// ---- LED 표시판(세탁기 위) ----
const LED_W = 512;
const LED_H = 144;
function paintLed(g, text, percent, done) {
  g.clearRect(0, 0, LED_W, LED_H);
  g.fillStyle = '#17434d'; // 청록 어두운 판
  g.beginPath(); g.roundRect(4, 4, LED_W - 8, LED_H - 8, 22); g.fill();
  g.strokeStyle = '#f3e4bf'; // 크림 테두리
  g.lineWidth = 6;
  g.beginPath(); g.roundRect(7, 7, LED_W - 14, LED_H - 14, 20); g.stroke();
  let size = 54;
  g.font = fontOf('friendly', size);
  while (size > 22 && g.measureText(text).width > LED_W - 60) { size -= 3; g.font = fontOf('friendly', size); }
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.shadowColor = done ? '#ffe9a0' : '#7ff2d8';
  g.shadowBlur = 14;
  g.fillStyle = done ? '#fff3c2' : '#b8fff0';
  g.fillText(text, LED_W / 2, 50);
  g.shadowBlur = 0;
  const bx = 40; const by = 96; const bw = LED_W - 150; const bh = 20; // 진행 막대
  g.fillStyle = 'rgba(255,255,255,0.14)';
  g.beginPath(); g.roundRect(bx, by, bw, bh, 10); g.fill();
  g.fillStyle = done ? '#ffd98a' : '#6ff0d2';
  if (percent > 0) { g.beginPath(); g.roundRect(bx, by, Math.max(bh, (bw * percent) / 100), bh, 10); g.fill(); }
  g.font = fontOf('friendly', 34);
  g.textAlign = 'right';
  g.fillStyle = done ? '#fff3c2' : '#b8fff0';
  g.fillText(`${percent}%`, LED_W - 36, by + 11);
}

// ---- 풀링한 스프라이트 입자 ----
const KINDS = { bubble: 36, spark: 64, drop: 20, puff: 8, ring: 3 };

export function createLaundryFx(root, washers, clothesline, fx = LAUNDRY_FX) {
  const textures = { bubble: bubbleTexture(), spark: sparkTexture(), drop: dropTexture(), puff: puffTexture(), ring: ringTexture() };
  const group = new THREE.Group();
  group.name = 'laundry-fx';
  root.add(group);
  const pools = {};
  for (const [kind, n] of Object.entries(KINDS)) {
    pools[kind] = Array.from({ length: n }, () => {
      const material = new THREE.SpriteMaterial({
        map: textures[kind], transparent: true, depthWrite: false, toneMapped: false, fog: false,
        blending: kind === 'spark' || kind === 'ring' ? THREE.AdditiveBlending : THREE.NormalBlending,
      });
      const sprite = new THREE.Sprite(material);
      sprite.visible = false;
      sprite.renderOrder = 7;
      group.add(sprite);
      return { sprite, live: false, t: 0, life: 1, vel: new THREE.Vector3(), grav: 0, s0: 0.1, s1: 0.1, op: 1, shape: 'lin', pop: false, phase: 0, kind };
    });
  }
  let liveCount = 0;
  const rnd = (a, b) => a + Math.random() * (b - a);

  function emit(kind, pos, o = {}) {
    const p = pools[kind].find((q) => !q.live);
    if (!p) return null; // 풀이 가득이면 그냥 생략(가장 오래된 것을 끊지 않는다)
    p.live = true;
    p.t = 0;
    p.life = o.life ?? 1;
    p.vel.set(o.vx ?? 0, o.vy ?? 0, o.vz ?? 0);
    p.grav = o.grav ?? 0;
    p.s0 = o.s0 ?? 0.1;
    p.s1 = o.s1 ?? p.s0;
    p.op = o.op ?? 1;
    p.shape = o.shape ?? 'lin';
    p.pop = Boolean(o.pop);
    p.phase = Math.random() * 6.28;
    p.sprite.position.copy(pos);
    p.sprite.material.color.copy(o.color ?? new THREE.Color(0xffffff));
    p.sprite.material.rotation = o.rot ?? 0;
    p.sprite.material.opacity = 0;
    p.sprite.scale.setScalar(p.s0);
    p.sprite.visible = true;
    liveCount++;
    return p;
  }
  const tmp = new THREE.Vector3();
  const tmp2 = new THREE.Vector3();
  const sparkColor = () => SPARK_COLORS[Math.floor(Math.random() * SPARK_COLORS.length)];
  const bubbleColor = () => new THREE.Color().setHSL(BUBBLE_HUES[Math.floor(Math.random() * BUBBLE_HUES.length)], 0.7, 0.86);

  // ---- 세탁기 위 표시판 ----
  const displays = Array.from({ length: washers.count }, () => null);
  function displayOf(i) {
    if (displays[i]) return displays[i];
    const [canvas, g] = canvasOf(LED_W, LED_H);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2.5, 2.5 * (LED_H / LED_W)), new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, toneMapped: false, fog: false }));
    mesh.visible = false;
    mesh.renderOrder = 8;
    group.add(mesh);
    return (displays[i] = { mesh, g, texture, key: '' });
  }

  const washes = new Map(); // 세탁기 번호 -> { t, text, events, next, onBurst, burst }
  const entry = new THREE.Vector3();
  const topOf = (i, target) => washers.entryWorld(i, target);

  function dropIn(i) { // 셔츠가 들어간 순간의 먼지와 물방울(startWash 가 부르지만 따로도 쓸 수 있다)
    topOf(i, entry);
    for (let k = 0; k < 4; k++) {
      emit('puff', tmp.set(entry.x + rnd(-0.2, 0.2), entry.y + 0.05, entry.z + rnd(-0.2, 0.2)), { life: rnd(0.8, 1.1), s0: 0.4, s1: rnd(0.9, 1.3), op: 0.8, vx: rnd(-0.25, 0.25), vy: rnd(0.25, 0.5), vz: rnd(-0.25, 0.25) });
    }
    for (let k = 0; k < 5; k++) {
      emit('drop', tmp.set(entry.x + rnd(-0.12, 0.12), entry.y, entry.z + rnd(-0.12, 0.12)), { life: 0.75, s0: 0.2, s1: 0.16, vx: rnd(-0.9, 0.9), vy: rnd(2.2, 3.4), vz: rnd(-0.9, 0.9), grav: 8 });
    }
  }
  function bubbleAt(i, o = {}) {
    topOf(i, entry);
    const a = Math.random() * Math.PI * 2;
    const r = Math.random() * 0.32;
    emit('bubble', tmp.set(entry.x + Math.cos(a) * r, entry.y + 0.05, entry.z + Math.sin(a) * r * 0.8), {
      life: rnd(1.4, 2.0), s0: rnd(0.1, 0.16), s1: rnd(0.26, 0.42), op: 0.95, vx: rnd(-0.12, 0.12), vy: rnd(0.55, 0.95), vz: rnd(-0.1, 0.1), color: bubbleColor(), ...o,
    });
  }
  function sparkleAt(i, spread = 0.4, up = 0.5) {
    topOf(i, entry);
    emit('spark', tmp.set(entry.x + rnd(-spread, spread), entry.y + rnd(0.1, 0.5), entry.z + rnd(-spread, spread)), {
      life: rnd(0.7, 1.05), s0: 0.08, s1: rnd(0.34, 0.52), op: 1, shape: 'pulse', vy: up * rnd(0.2, 1), color: sparkColor(), rot: Math.random() * 3,
    });
  }
  function burstAt(i) { // 향기 폭죽: 파스텔 별 반짝이가 사방으로 퍼졌다가 천천히 오른다
    topOf(i, entry);
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2 + Math.random() * 0.4;
      const sp = rnd(0.6, 1.5);
      emit('spark', tmp.set(entry.x, entry.y + 0.3, entry.z), {
        life: rnd(1.0, 1.5), s0: 0.1, s1: rnd(0.38, 0.62), shape: 'pulse', vx: Math.cos(a) * sp, vy: rnd(0.4, 1.4), vz: Math.sin(a) * sp * 0.8, grav: -0.1, color: sparkColor(), rot: Math.random() * 3,
      });
    }
  }
  function ringAt(i) { // 부드러운 빛 고리가 떠오른다
    topOf(i, entry);
    emit('ring', tmp.set(entry.x, entry.y + 0.2, entry.z), { life: 1.4, s0: 0.5, s1: 2.6, op: 0.6, vy: 0.5, color: new THREE.Color(0xfff2c4) });
  }
  function floatersAt(i, n) { // 떠오르다 톡 터지는 방울
    topOf(i, entry);
    for (let k = 0; k < n; k++) {
      emit('bubble', tmp.set(entry.x + rnd(-0.3, 0.3), entry.y + 0.3, entry.z + rnd(-0.25, 0.25)), {
        life: rnd(0.9, 1.4), s0: 0.22, s1: rnd(0.36, 0.5), op: 0.95, vx: rnd(-0.2, 0.2), vy: rnd(0.45, 0.8), vz: rnd(-0.15, 0.15), color: bubbleColor(), pop: true,
      });
    }
  }

  function fire(i, e) {
    if (e.type === 'dust' || e.type === 'splash') { if (e.type === 'dust') dropIn(i); }
    else if (e.type === 'bubble') bubbleAt(i);
    else if (e.type === 'sparkle') sparkleAt(i);
    else if (e.type === 'burst') burstAt(i);
    else if (e.type === 'ring') ringAt(i);
    else if (e.type === 'floaters') floatersAt(i, e.n ?? 5);
  }

  // item: 고른 빨 것(없으면 다른 방문자의 세탁: 글은 "세탁 중"). onBurst: 향기가 터지는 순간(끝 멘트).
  function startWash(i, item = null, onBurst = null) {
    if (i < 0 || i >= washers.count) return;
    washes.set(i, { t: 0, text: item?.display ?? '세탁 중', events: washEvents(fx), next: 0, onBurst });
  }

  // ---- 널기 ----
  const hangs = []; // { slot, t, events, next }
  const shirtPoint = (slot, dy) => { const p = slotPoint(clothesline, slot); return tmp2.set(p.x, p.y + dy, p.z); };
  function hang(slot) {
    if (!(slot >= 0 && slot < clothesline.slots)) return;
    hangs.push({ slot, t: 0, events: hangEvents(fx), next: 0 });
    if (hangs.length > 6) hangs.shift();
  }
  function hangFire(h, e) {
    if (e.type === 'drip') {
      const p = slotPoint(clothesline, h.slot);
      const dx = clothesline.x2 - clothesline.x1;
      const dz = clothesline.z2 - clothesline.z1;
      const len = Math.hypot(dx, dz) || 1;
      const along = rnd(-0.16, 0.16);
      emit('drop', tmp.set(p.x + (dx / len) * along, p.y - 0.68, p.z + (dz / len) * along + rnd(-0.03, 0.03)), { life: 0.62, s0: 0.16, s1: 0.13, vy: -0.2, grav: 7, op: 0.95 });
    } else if (e.type === 'twinkle') {
      for (let k = 0; k < (e.n ?? 6); k++) {
        const p = slotPoint(clothesline, h.slot);
        emit('spark', tmp.set(p.x + rnd(-0.12, 0.12), p.y - rnd(0.05, 0.6), p.z + rnd(-0.14, 0.14)), { life: rnd(0.6, 0.95), s0: 0.06, s1: rnd(0.26, 0.42), shape: 'pulse', vy: rnd(0.05, 0.3), color: sparkColor(), rot: Math.random() * 3 });
      }
    }
  }

  // ---- 마른 내 셔츠의 되풀이 반짝임 ----
  let dryT = 0;
  let dryCycle = -1;
  let dryActive = false;
  function dryUpdate(dt, slot) {
    if (slot < 0) { dryActive = false; return; }
    if (!dryActive) { dryActive = true; dryT = 0; dryCycle = -1; }
    dryT += dt;
    const cycle = Math.floor(dryT / fx.dryPeriod);
    if (cycle !== dryCycle) {
      dryCycle = cycle;
      shirtPoint(slot, -0.3);
      emit('spark', tmp2, { life: fx.dryPulse * 1.5, s0: 0.1, s1: 0.8, shape: 'pulse', color: new THREE.Color(0xfff6c8), rot: 0.4, op: 1 });
      const p = slotPoint(clothesline, slot);
      for (let k = 0; k < 3; k++) {
        emit('spark', tmp.set(p.x + rnd(-0.18, 0.18), p.y - rnd(0.1, 0.6), p.z + rnd(-0.12, 0.12)), { life: rnd(0.5, 0.8), s0: 0.06, s1: rnd(0.2, 0.34), shape: 'pulse', vy: rnd(0.1, 0.3), color: sparkColor(), rot: Math.random() * 3 });
      }
    }
  }

  const camPos = new THREE.Vector3();
  function update(dt, camera, { drySlot = -1 } = {}) {
    // 세탁: 시간표의 사건을 차례로 일으키고, 표시판 글·투명도를 갱신한다.
    for (const [i, w] of washes) {
      w.t += dt;
      while (w.next < w.events.length && w.events[w.next].t <= w.t) {
        const e = w.events[w.next++];
        fire(i, e);
        if (e.type === 'burst') w.onBurst?.();
      }
      const d = displayOf(i);
      const alpha = displayAlpha(w.t, fx);
      if (alpha <= 0) {
        d.mesh.visible = false;
        if (w.t >= fx.seconds) washes.delete(i);
        continue;
      }
      const disp = washDisplay(w.text, w.t, fx);
      const key = `${disp.text}|${disp.percent}`;
      if (key !== d.key) { d.key = key; paintLed(d.g, disp.text, disp.percent, disp.done); d.texture.needsUpdate = true; }
      topOf(i, entry);
      d.mesh.position.set(entry.x, entry.y + 0.5 + 0.03 * Math.sin(w.t * 4), entry.z + 0.35);
      if (camera) { camera.getWorldPosition(camPos); d.mesh.rotation.y = Math.atan2(camPos.x - entry.x, camPos.z - entry.z); }
      d.mesh.material.opacity = alpha;
      d.mesh.scale.setScalar(0.85 + 0.15 * Math.min(1, w.t / 0.25));
      d.mesh.visible = true;
    }
    for (let n = hangs.length - 1; n >= 0; n--) {
      const h = hangs[n];
      h.t += dt;
      while (h.next < h.events.length && h.events[h.next].t <= h.t) hangFire(h, h.events[h.next++]);
      if (h.next >= h.events.length) hangs.splice(n, 1);
    }
    dryUpdate(dt, drySlot);
    if (!liveCount) return;
    for (const pool of Object.values(pools)) {
      for (const p of pool) {
        if (!p.live) continue;
        p.t += dt;
        const k = p.t / p.life;
        if (k >= 1) {
          p.live = false;
          p.sprite.visible = false;
          liveCount--;
          if (p.pop) for (let s = 0; s < 3; s++) emit('spark', p.sprite.position, { life: 0.35, s0: 0.04, s1: 0.12, shape: 'pulse', vx: rnd(-0.5, 0.5), vy: rnd(0.1, 0.5), vz: rnd(-0.5, 0.5), color: sparkColor() });
          continue;
        }
        p.vel.y -= p.grav * dt;
        p.sprite.position.addScaledVector(p.vel, dt);
        if (p.kind === 'bubble') p.sprite.position.x += Math.sin(p.t * 5 + p.phase) * 0.12 * dt;
        let size = p.s0 + (p.s1 - p.s0) * (p.shape === 'pulse' ? Math.sin(Math.PI * k) : k);
        let op = Math.min(1, k / 0.12, (1 - k) / 0.3) * p.op;
        if (p.pop && k > 0.86) { size *= 1 + (k - 0.86) * 3; op *= Math.max(0, 1 - (k - 0.86) / 0.14); }
        p.sprite.scale.setScalar(Math.max(0.001, size));
        p.sprite.material.opacity = Math.max(0, op);
      }
    }
  }

  return {
    startWash, dropIn, hang, update,
    // 진단용: 지금 보이는 입자 수.
    activeCount: () => liveCount,
    activeWashes: () => washes.size,
  };
}

// ---- 선택 창 썸네일: 셔츠 위의 얼룩·냄새 구름(글씨 없음). 선택 창 CSS 크기(54x72)의 2배로 그려 또렷하다. ----
export function buildStainIcon(item, w = 108, h = 144) {
  const [canvas, g] = canvasOf(w, h);
  const bg = g.createLinearGradient(0, 0, 0, h);
  bg.addColorStop(0, '#fffaf0');
  bg.addColorStop(1, '#f0e2bc');
  g.fillStyle = bg;
  g.fillRect(0, 0, w, h);
  const s = w / 54; // 54x72 기준 좌표를 쓴다
  g.save();
  g.scale(s, s);
  const color = item.icon.color;
  // 셔츠 윤곽(반팔).
  const shirt = () => {
    g.beginPath();
    g.moveTo(21, 21); g.lineTo(10, 27); g.lineTo(13, 40); g.lineTo(19, 38); g.lineTo(19, 64); g.lineTo(35, 64); g.lineTo(35, 38); g.lineTo(41, 40); g.lineTo(44, 27); g.lineTo(33, 21);
    g.quadraticCurveTo(27, 28, 21, 21); g.closePath();
  };
  shirt();
  g.fillStyle = '#ffffff'; g.fill();
  g.strokeStyle = '#a9bbc0'; g.lineWidth = 1.4; g.stroke();
  g.save();
  shirt(); g.clip();
  const blob = (cx, cy, r, col, a = 1) => { g.globalAlpha = a; g.fillStyle = col; g.beginPath(); g.ellipse(cx, cy, r, r * 0.82, 0.4, 0, Math.PI * 2); g.fill(); g.globalAlpha = 1; };
  switch (item.icon.kind) {
    case 'grime': // 찌든 때: 갈색 얼룩 덩어리와 번진 가장자리
      blob(27, 48, 8.5, color, 0.35); blob(25, 46, 6, color, 0.85); blob(31, 51, 4.5, color, 0.9); blob(22, 53, 2.6, color, 0.9); blob(33, 44, 2, color, 0.9);
      break;
    case 'sweat': // 긴장: 겨드랑이 땀 자국
      blob(17, 38, 5.5, color, 0.45); blob(37, 38, 5.5, color, 0.45); blob(27, 50, 6, color, 0.22);
      break;
    case 'ink': // 잉크: 번진 청색 얼룩과 튄 방울
      blob(27, 47, 7, color, 0.95); blob(32, 52, 3.4, color, 0.95); blob(21, 53, 2.6, color, 0.95); blob(35, 43, 1.8, color, 0.95); blob(20, 43, 1.4, color, 0.95);
      break;
    default: break;
  }
  g.restore();
  // 셔츠 밖으로 나오는 효과.
  g.lineCap = 'round';
  if (item.icon.kind === 'smell') { // 냄새: 위로 피어오르는 구불구불한 선과 구름
    g.strokeStyle = color; g.lineWidth = 2.4;
    for (const x of [18, 27, 36]) { g.beginPath(); g.moveTo(x, 19); g.bezierCurveTo(x - 5, 14, x + 5, 9, x, 4); g.stroke(); }
    blob(14, 52, 5, color, 0.5); blob(40, 54, 6, color, 0.5); blob(27, 56, 5, color, 0.45);
    g.fillStyle = '#4a5a3a'; g.fillRect(23, 45, 2, 2); g.fillRect(29, 45, 2, 2); g.beginPath(); g.arc(27, 52, 2.4, Math.PI, 0); g.stroke();
  } else if (item.icon.kind === 'sweat') {
    g.fillStyle = color;
    for (const [x, y, r] of [[8, 17, 3], [45, 20, 3.4], [12, 8, 2.2]]) { g.beginPath(); g.moveTo(x, y - r * 1.5); g.quadraticCurveTo(x + r * 1.1, y, x, y + r); g.quadraticCurveTo(x - r * 1.1, y, x, y - r * 1.5); g.fill(); }
  } else if (item.icon.kind === 'dust') { // 새벽 감성: 보랏빛 먼지 뭉치와 반짝이, 초승달
    blob(14, 52, 4.5, color, 0.8); blob(41, 55, 5, color, 0.8); blob(27, 14, 4, color, 0.45);
    g.fillStyle = '#7d6bc2';
    for (const [x, y] of [[10, 12], [44, 10], [38, 18], [8, 60], [46, 63]]) { g.fillRect(x, y, 2, 2); g.fillRect(x - 1, y + 0.5, 4, 1); g.fillRect(x + 0.5, y - 1, 1, 4); }
    g.fillStyle = '#f2d86a'; g.beginPath(); g.arc(44, 8, 5, 0.6, Math.PI * 2 - 0.6); g.arc(46.6, 8, 4.2, Math.PI * 2 - 0.9, 0.9, true); g.fill();
  } else if (item.icon.kind === 'grime') {
    g.fillStyle = color;
    for (const [x, y, r] of [[8, 58, 1.8], [46, 50, 1.4], [44, 62, 2]]) { g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); }
  } else if (item.icon.kind === 'ink') {
    g.fillStyle = color;
    for (const [x, y, r] of [[8, 54, 1.8], [47, 58, 1.5], [45, 36, 1.2]]) { g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); }
  }
  g.restore();
  return canvas;
}
