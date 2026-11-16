// 브라우저 전용: 마시멜로 굽기 소품(긴 나무 막대 + 막대 끝 하얀 마시멜로 + 김 한 줄기). 외부 파일 없이 도형·재질로만 만든다.
// group 은 막대 시작점(손 뒤쪽)에 놓이고 +z 가 막대 끝을 향한다. place(start, tip) 이 두 월드 점에 막대를 맞춘다. wisps 는 월드 위치만 따라가는 별도 그룹(김이 위로 오르게).
import * as THREE from 'three';
import { colorAt, shapeAt } from './logic/marshmallow.js';

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
  const mallowMat = new THREE.MeshStandardMaterial({ color: '#fffdf6', roughness: 0.75, emissive: '#000000' });
  const mallow = new THREE.Mesh(new THREE.CapsuleGeometry(MALLOW_RADIUS, MALLOW_LENGTH, 4, 14), mallowMat);
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
    setLevel(level, eaten = 0) {
      const [r, g, b] = colorAt(level);
      mallowMat.color.setRGB(r, g, b);
      const warm = Math.max(0, 1 - Math.abs(level - 0.55) / 0.35); // 노릇해질 때 은은히 달아오른 빛
      mallowMat.emissive.setRGB(0.32 * warm * (r + 0.2), 0.12 * warm, 0.02 * warm);
      const { puff, sag } = shapeAt(level);
      const keep = Math.max(0.001, 1 - eaten);
      mallowHolder.scale.set(puff * (1 + 0.1 * sag) * keep, puff * (1 - 0.12 * sag) * keep, puff * keep);
      mallowHolder.position.y = -0.045 * sag; // 아래로 처진다
      steam = Math.max(0, 1 - Math.abs(level - 0.5) / 0.3); // 황금빛 근처에서 가장 많이
    },
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
