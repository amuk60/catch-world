// 브라우저 전용: 마시멜로 굽기 소품(긴 나무 막대 + 막대 끝 하얀 마시멜로 + 김 한 줄기). 외부 파일 없이 도형·재질로만 만든다.
// group 은 막대 시작점(손 뒤쪽)에 놓이고 +z 가 막대 끝을 향한다. place(start, tip) 이 두 월드 점에 막대를 맞춘다. wisps 는 월드 위치만 따라가는 별도 그룹(김이 위로 오르게).
import * as THREE from 'three';
import { colorAt, shapeAt, sideStep } from './logic/marshmallow.js';
import { MARSHMALLOW } from './config.js';

const STICK_RADIUS = 0.024;
const MALLOW_RADIUS = 0.12;
const MALLOW_LENGTH = 0.16;
const WISP_COUNT = 3;

function steamTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 32;
  canvas.height = 32;
  const g = canvas.getContext('2d');
  const grad = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  grad.addColorStop(0, 'rgba(255,255,255,0.8)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 32, 32);
  return new THREE.CanvasTexture(canvas);
}

// 완벽하게 구웠을 때 터지는 작은 색종이(점 40개, 1.4초). 월드 위치에서 사방으로 튀었다가 중력으로 떨어진다.
export function createConfetti(count = 40) {
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const vel = new Float32Array(count * 3);
  const palette = ['#ffd166', '#ff8fa3', '#8ecae6', '#b8f2a1', '#ffffff', '#e2ab5c'].map((c) => new THREE.Color(c));
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const mat = new THREE.PointsMaterial({ size: 0.13, vertexColors: true, transparent: true, opacity: 1, depthWrite: false, fog: false });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  points.visible = false;
  let age = -1;
  const LIFE = 1.4;
  return {
    points,
    burst(origin) {
      for (let i = 0; i < count; i++) {
        positions.set([origin.x, origin.y, origin.z], i * 3);
        const a = Math.random() * Math.PI * 2;
        const sp = 0.8 + Math.random() * 1.6;
        vel.set([Math.cos(a) * sp, 1.6 + Math.random() * 1.8, Math.sin(a) * sp], i * 3);
        const c = palette[i % palette.length];
        colors.set([c.r, c.g, c.b], i * 3);
      }
      geo.attributes.position.needsUpdate = true;
      geo.attributes.color.needsUpdate = true;
      mat.opacity = 1;
      points.visible = true;
      age = 0;
    },
    update(dt) {
      if (age < 0) return;
      age += dt;
      if (age >= LIFE) { age = -1; points.visible = false; return; }
      for (let i = 0; i < count; i++) {
        vel[i * 3 + 1] -= 4.2 * dt;
        vel[i * 3] *= 1 - 0.8 * dt;
        vel[i * 3 + 2] *= 1 - 0.8 * dt;
        for (let k = 0; k < 3; k++) positions[i * 3 + k] += vel[i * 3 + k] * dt;
      }
      geo.attributes.position.needsUpdate = true;
      mat.opacity = Math.min(1, (LIFE - age) / 0.5);
    },
    hide() { age = -1; points.visible = false; },
  };
}

export function createRoastStick() {
  const group = new THREE.Group();
  group.name = 'roast-stick';
  group.visible = false;

  const stickGeo = new THREE.CylinderGeometry(STICK_RADIUS * 0.7, STICK_RADIUS, 1, 8);
  stickGeo.rotateX(Math.PI / 2);
  stickGeo.translate(0, 0, 0.5); // 0..1 (z): scale.z = 막대 길이
  const stick = new THREE.Mesh(stickGeo, new THREE.MeshStandardMaterial({ color: '#8a5a2b', roughness: 0.9 }));
  stick.castShadow = true;
  group.add(stick);

  // 마시멜로: 막대 축(z)을 따라 놓인 둥근 원통(캡슐). 색은 굽기 정도로 바뀐다.
  // 면마다 색이 다르다: 정점 색을 막대 축 둘레 각도에 따라 이웃한 두 면의 색으로 섞는다(면 i 의 한가운데가 각도 i * 360/sides, 0번 면이 처음 불을 마주 본다).
  const mallowMat = new THREE.MeshStandardMaterial({ color: '#ffffff', vertexColors: true, roughness: 0.75, emissive: '#000000' });
  const mallowGeo = new THREE.CapsuleGeometry(MALLOW_RADIUS, MALLOW_LENGTH, 4, 14);
  const sides = MARSHMALLOW.sides;
  const vertexBlend = []; // 정점마다 [면 a, 면 b, b 의 비율] (축 위의 극점은 모든 면의 평균)
  {
    const pos = mallowGeo.attributes.position;
    const step = sideStep(MARSHMALLOW);
    for (let v = 0; v < pos.count; v++) {
      const x = pos.getX(v);
      const z = pos.getZ(v);
      if (Math.hypot(x, z) < 1e-4) { vertexBlend.push(null); continue; }
      let a = Math.atan2(x, z);
      if (a < 0) a += Math.PI * 2;
      const f = a / step;
      const i0 = Math.floor(f) % sides;
      const k = f - Math.floor(f);
      vertexBlend.push([i0, (i0 + 1) % sides, k * k * (3 - 2 * k)]);
    }
    mallowGeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(pos.count * 3).fill(1), 3));
  }
  const sideColors = Array.from({ length: sides }, () => [1, 1, 1]);
  const mallow = new THREE.Mesh(mallowGeo, mallowMat);
  mallow.rotation.x = Math.PI / 2;
  mallow.castShadow = true;
  const mallowHolder = new THREE.Group(); // 처짐·부풂을 주는 자리(막대 끝)
  group.add(mallowHolder);
  mallowHolder.add(mallow);

  // 김: 마시멜로 위로 오르는 흐릿한 점 몇 개(월드 위치만 따라가는 그룹).
  const wisps = new THREE.Group();
  wisps.visible = false;
  const wispTex = steamTexture();
  const wispList = [];
  for (let i = 0; i < WISP_COUNT; i++) {
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: wispTex, transparent: true, depthWrite: false, opacity: 0, fog: false }));
    sprite.scale.setScalar(0.22);
    wisps.add(sprite);
    wispList.push({ sprite, phase: i / WISP_COUNT, dx: (i - 1) * 0.04 });
  }
  let steam = 0; // 0..1 김의 세기
  let wispTime = 0;

  const up = new THREE.Vector3(0, 1, 0);
  const dir = new THREE.Vector3();
  const lookTarget = new THREE.Vector3();
  const mallowPos = new THREE.Vector3();

  return {
    group,
    wisps,
    mallow,
    // 굽는 정도(0..1)에 맞춘 색·부풂·처짐. eaten(0..1)은 먹어서 줄어든 정도.
    // fx: { glow(0..1: 좋음 띠 전체에 걸친 아주 은은한 밝기 힌트), blush(0..1: 가짜 신호, 잠깐 노릇해 보임), steam(0..1: 김의 세기) }. 완벽 한가운데만 알리는 반짝임은 일부러 없다.
    // fx.sides: 면별 굽기(없으면 모든 면이 level). 색은 면마다 따로 칠하고, 은은한 빛·모양은 평균 level 을 따른다.
    setLevel(level, eaten = 0, fx = {}) {
      const [br, bg, bb] = colorAt(0.5);
      const blushOf = (l) => (l < 0.45 ? 1 : 0) * 0.45 * (fx.blush ?? 0);
      for (let i = 0; i < sides; i++) {
        const l = fx.sides?.[i] ?? level;
        const [r0, g0, b0] = colorAt(l);
        const k = blushOf(l);
        sideColors[i] = [r0 + (br - r0) * k, g0 + (bg - g0) * k, b0 + (bb - b0) * k];
      }
      const col = mallowGeo.attributes.color;
      for (let v = 0; v < vertexBlend.length; v++) {
        const vb = vertexBlend[v];
        let r; let g; let b;
        if (vb) {
          const A = sideColors[vb[0]]; const B = sideColors[vb[1]]; const k = vb[2];
          r = A[0] + (B[0] - A[0]) * k; g = A[1] + (B[1] - A[1]) * k; b = A[2] + (B[2] - A[2]) * k;
        } else {
          r = g = b = 0;
          for (const c of sideColors) { r += c[0] / sides; g += c[1] / sides; b += c[2] / sides; }
        }
        col.setXYZ(v, r, g, b);
      }
      col.needsUpdate = true;
      const [r0, g0, b0] = colorAt(level);
      const r = r0; const g = g0; const b = b0;
      const warm = Math.max(0, 1 - Math.abs(level - 0.55) / 0.35) + 0.35 * (fx.blush ?? 0); // 노릇해질 때 은은히 달아오른 빛
      const glow = 0.05 * (fx.glow ?? 0);
      mallowMat.emissive.setRGB(0.32 * warm * (r + 0.2) + glow, 0.12 * warm + glow * 0.7, 0.02 * warm + glow * 0.3);
      const { puff, sag } = shapeAt(level);
      const keep = Math.max(0.001, 1 - eaten);
      mallowHolder.scale.set(puff * (1 + 0.1 * sag) * keep, puff * (1 - 0.12 * sag) * keep, puff * keep);
      mallowHolder.position.y = -0.045 * sag; // 아래로 처진다
      steam = Math.min(1, fx.steam ?? 0);
    },
    // 마시멜로를 막대 축 둘레로 angle(라디안) 돌린 모습: 0번 면이 아래(불 쪽)를 보고, 늘어날수록 다음 면이 아래로 온다.
    setSpin(angle) { mallow.rotation.y = -angle; },
    // 막대를 start(손 뒤쪽)에서 tip(끝)까지 맞춘다. visible 이 false 면 숨긴다.
    place(start, tip, visible = true) {
      group.visible = visible;
      wisps.visible = visible && steam > 0.05;
      if (!visible) return;
      group.position.copy(start);
      lookTarget.copy(tip);
      group.lookAt(lookTarget);
      const length = Math.max(0.2, start.distanceTo(tip));
      stick.scale.z = length;
      dir.subVectors(tip, start).normalize();
      mallowPos.set(0, 0, length - MALLOW_RADIUS * 0.9);
      mallowHolder.position.x = mallowPos.x;
      mallowHolder.position.z = mallowPos.z;
      wisps.position.copy(tip).addScaledVector(up, MALLOW_RADIUS + 0.05);
    },
    update(dt) {
      if (!wisps.visible) return;
      wispTime += dt;
      for (const w of wispList) {
        const k = (wispTime * 0.55 + w.phase) % 1;
        w.sprite.position.set(w.dx + Math.sin(k * 6 + w.phase * 5) * 0.03, k * 0.5, 0);
        w.sprite.material.opacity = steam * 0.55 * Math.sin(Math.PI * k);
        w.sprite.scale.setScalar(0.14 + 0.2 * k);
      }
    },
    hide() {
      group.visible = false;
      wisps.visible = false;
    },
  };
}
