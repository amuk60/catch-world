// 브라우저 전용: 소각로의 상시 모닥불. 셰이더로 그린 불꽃 혀(카메라를 보는 빌보드 한 덩어리) + 불티 + 연기 + 달아오른 숯 바닥 + 따뜻한 점광(그림자 없음).
// 드로 콜 5개(불꽃, 불티, 연기, 숯, 바닥 빛), 텍스처는 작은 캔버스 둘. 프레임마다 새 객체를 만들지 않는다.
// update(dt, time) 를 매 프레임 부르고, flare() 로 잠깐 커지게 한다(종이가 불에 닿았을 때: 더 높고 밝아지고 불티가 터진 뒤 가라앉는다).
// setTint('aurora', seconds): 오로라 가루가 닿았을 때 불꽃이 청록·초록·보라 그라데이션으로 바뀌고 반짝이 불티가 터졌다가 seconds 뒤 원래 색으로 돌아온다(null 이면 바로 끈다).
import * as THREE from 'three';
import { createAuroraTint } from './logic/aurora.js';

const BASE_Y = 0.22; // 불 바닥 높이(돌 두둑 위)
const LIGHT_INTENSITY = 3;
const FLARE_SEC = 1.4; // 불꽃이 커졌다 가라앉는 시간(초)
const FLARE_RISE = 0.12; // 커지는 데 걸리는 시간(초)
const SPARK_COUNT = 64;
const SMOKE_COUNT = 9;
const SPARK_BURST = 16; // 종이가 닿을 때 한꺼번에 터지는 불티 수

// 불꽃 혀: 층(0 바깥 붉은, 1 가운데 주황, 2 속 노란)별로 큰 것부터 그린다(뒤 -> 앞). x,z 오프셋, 폭, 높이, 속도 배율.
const TONGUES = [
  { layer: 0, x: 0.0, z: 0.0, w: 1.25, h: 1.7, speed: 0.9 },
  { layer: 0, x: 0.3, z: 0.12, w: 0.9, h: 1.35, speed: 1.15 },
  { layer: 0, x: -0.3, z: -0.1, w: 0.95, h: 1.4, speed: 1.0 },
  { layer: 1, x: 0.0, z: 0.05, w: 0.95, h: 1.5, speed: 1.3 },
  { layer: 1, x: -0.22, z: 0.18, w: 0.65, h: 1.05, speed: 1.6 },
  { layer: 1, x: 0.25, z: -0.15, w: 0.6, h: 1.0, speed: 1.45 },
  { layer: 2, x: 0.0, z: 0.0, w: 0.6, h: 1.0, speed: 1.9 },
  { layer: 2, x: -0.12, z: 0.1, w: 0.38, h: 0.62, speed: 2.4 },
  { layer: 2, x: 0.14, z: -0.06, w: 0.34, h: 0.55, speed: 2.7 },
];

const NOISE_GLSL = `
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}`;

const FLAME_VERT = `
attribute vec2 aCorner; // x -1..1, y 0..1
attribute vec4 aShape; // 폭, 높이, 시드, 속도
attribute float aLayer;
uniform float uTime;
uniform float uFlare;
varying vec2 vUv;
varying float vSeed;
varying float vLayer;
varying float vSpeed;
void main() {
  vUv = aCorner; vSeed = aShape.z; vLayer = aLayer; vSpeed = aShape.w;
  vec3 center = (modelMatrix * vec4(position, 1.0)).xyz;
  vec3 right = normalize(vec3(viewMatrix[0][0], 0.0, viewMatrix[2][0]));
  float t = uTime * aShape.w;
  float lift = 1.0 + 0.16 * sin(t * 5.1 + aShape.z * 6.0) + 0.1 * sin(t * 9.7 + aShape.z * 3.0) + 0.55 * uFlare;
  float h = aShape.y * lift;
  float sway = (sin(t * 3.1 + aShape.z * 9.0) * 0.6 + sin(t * 7.3 + aShape.z * 2.0) * 0.4) * 0.16 * aCorner.y * aCorner.y * aShape.y;
  float w = aShape.x * (1.0 + 0.25 * uFlare);
  vec3 p = center + right * (aCorner.x * 0.5 * w + sway) + vec3(0.0, aCorner.y * h, 0.0);
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}`;

const FLAME_FRAG = `
uniform float uTime;
uniform float uFlare;
uniform float uAurora;
varying vec2 vUv;
varying float vSeed;
varying float vLayer;
varying float vSpeed;
${NOISE_GLSL}
void main() {
  float y = vUv.y;
  float t = uTime * vSpeed;
  // 위로 흐르는 노이즈로 옆 흔들림과 끝 갈라짐.
  float n1 = vnoise(vec2(vUv.x * 1.6 + vSeed * 13.0, y * 2.6 - t * 2.2));
  float n2 = vnoise(vec2(vUv.x * 3.4 - vSeed * 7.0, y * 5.0 - t * 3.6));
  float x = vUv.x + (n1 - 0.5) * (0.35 + 0.7 * y);
  // 혀 모양: 아래는 둥글게 시작해 끝으로 갈수록 가늘다.
  float width = pow(max(1.0 - y, 0.0), 0.75) * (0.35 + 0.65 * smoothstep(0.0, 0.25, y));
  float d = abs(x) / max(width, 0.001);
  float body = 1.0 - smoothstep(0.45, 1.0, d);
  body *= 1.0 - smoothstep(0.55, 1.0, y + (n2 - 0.5) * 0.45); // 끝이 불규칙하게 끊긴다
  body *= smoothstep(0.0, 0.07, y);
  // 열: 아래·가운데일수록 뜨겁다.
  float heat = (1.0 - y) * (1.0 - 0.75 * d) + vLayer * 0.28 + uFlare * 0.18;
  heat += (n2 - 0.5) * 0.25;
  vec3 red = vec3(0.62, 0.06, 0.02);
  vec3 orange = vec3(1.0, 0.42, 0.04);
  vec3 yellow = vec3(1.0, 0.82, 0.28);
  vec3 white = vec3(1.0, 0.96, 0.78);
  vec3 c = mix(red, orange, smoothstep(0.1, 0.45, heat));
  c = mix(c, yellow, smoothstep(0.42, 0.78, heat));
  c = mix(c, white, smoothstep(0.8, 1.05, heat));
  if (uAurora > 0.0) { // 오로라: 위로 흐르는 청록 -> 초록 -> 보라 -> 분홍
    float k = y * 2.4 + uTime * 0.9 + vSeed * 3.0;
    float a = 0.5 + 0.5 * sin(k * 2.0);
    float b = 0.5 + 0.5 * sin(k * 1.3 + 2.0);
    vec3 ac = mix(mix(vec3(0.1, 0.95, 0.78), vec3(0.4, 1.0, 0.45), a), mix(vec3(0.62, 0.36, 1.0), vec3(1.0, 0.5, 0.92), b), smoothstep(0.3, 0.9, y));
    ac = mix(ac * (0.8 + 0.5 * heat), vec3(1.0), smoothstep(0.85, 1.05, heat) * 0.5);
    c = mix(c, ac, uAurora);
  }
  float alpha = body * mix(0.85, 0.95, vLayer * 0.5);
  gl_FragColor = vec4(c * (1.0 + 0.5 * uFlare), alpha);
}`;

const SPARK_VERT = `
attribute float aLife; // 0 (갓 태어남) .. 1 (사라짐), 쉬는 입자는 -1
uniform float uPixels; // 드로잉 버퍼 높이(px) / 2
varying float vLife;
void main() {
  vLife = aLife;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  float fade = aLife < 0.0 ? 0.0 : (1.0 - aLife * 0.55);
  gl_PointSize = 0.075 * fade * uPixels * projectionMatrix[1][1] / -mv.z;
}`;

const SPARK_FRAG = `
uniform float uAurora;
varying float vLife;
void main() {
  if (vLife < 0.0) discard;
  float r = length(gl_PointCoord - 0.5) * 2.0;
  float a = (1.0 - smoothstep(0.0, 1.0, r));
  a *= a;
  vec3 c = mix(vec3(1.0, 0.9, 0.5), vec3(1.0, 0.35, 0.05), vLife);
  vec3 ac = 0.62 + 0.38 * cos(6.2831 * (vLife * 1.4 + vec3(0.0, 0.33, 0.67)) + gl_FragCoord.x * 0.07); // 알록달록 반짝이
  c = mix(c, ac, uAurora);
  gl_FragColor = vec4(c * 1.4, a * (1.0 - vLife * vLife));
}`;

const SMOKE_VERT = `
attribute float aLife;
uniform float uPixels;
varying float vLife;
void main() {
  vLife = aLife;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  float size = aLife < 0.0 ? 0.0 : (0.55 + 1.5 * aLife);
  gl_PointSize = size * uPixels * projectionMatrix[1][1] / -mv.z;
}`;

const SMOKE_FRAG = `
varying float vLife;
void main() {
  if (vLife < 0.0) discard;
  float r = length(gl_PointCoord - 0.5) * 2.0;
  float a = 1.0 - smoothstep(0.1, 1.0, r);
  a *= a;
  float env = smoothstep(0.0, 0.2, vLife) * (1.0 - smoothstep(0.55, 1.0, vLife));
  gl_FragColor = vec4(vec3(0.42, 0.38, 0.36), a * env * 0.2);
}`;

// 숯 바닥 텍스처: 어두운 숯 + 주황으로 달아오른 틈(64x64).
function emberTexture() {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const g = canvas.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 2, 32, 32, 31);
  grad.addColorStop(0, 'rgba(255,150,40,1)');
  grad.addColorStop(0.45, 'rgba(190,60,12,0.95)');
  grad.addColorStop(0.8, 'rgba(50,20,10,0.8)');
  grad.addColorStop(1, 'rgba(30,14,8,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  let s = 7; // 결정적 점박이
  const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  for (let i = 0; i < 46; i++) {
    const a = rnd() * Math.PI * 2;
    const r = Math.sqrt(rnd()) * 24;
    g.fillStyle = rnd() < 0.5 ? 'rgba(255,200,80,0.9)' : 'rgba(255,110,20,0.85)';
    g.fillRect(32 + Math.cos(a) * r, 32 + Math.sin(a) * r, 1 + rnd() * 2, 1 + rnd() * 2);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// 바닥 빛무리 텍스처(작은 방사형 그라디언트).
function glowTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 32;
  canvas.height = 32;
  const g = canvas.getContext('2d');
  const grad = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  grad.addColorStop(0, 'rgba(255,170,70,0.55)');
  grad.addColorStop(0.5, 'rgba(255,110,30,0.2)');
  grad.addColorStop(1, 'rgba(255,90,20,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 32, 32);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function buildFlameMesh(uniforms) {
  const n = TONGUES.length;
  const pos = new Float32Array(n * 4 * 3);
  const corner = new Float32Array(n * 4 * 2);
  const shape = new Float32Array(n * 4 * 4);
  const layer = new Float32Array(n * 4);
  const index = new Uint16Array(n * 6);
  TONGUES.forEach((t, i) => {
    for (let v = 0; v < 4; v++) {
      const k = i * 4 + v;
      pos.set([t.x, 0, t.z], k * 3);
      corner.set([v % 2 ? 1 : -1, v < 2 ? 0 : 1], k * 2);
      shape.set([t.w * 1.15, t.h * 1.25, i * 0.37 + 0.11, t.speed], k * 4);
      layer[k] = t.layer;
    }
    index.set([i * 4, i * 4 + 1, i * 4 + 3, i * 4, i * 4 + 3, i * 4 + 2], i * 6);
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aCorner', new THREE.BufferAttribute(corner, 2));
  geo.setAttribute('aShape', new THREE.BufferAttribute(shape, 4));
  geo.setAttribute('aLayer', new THREE.BufferAttribute(layer, 1));
  geo.setIndex(new THREE.BufferAttribute(index, 1));
  const mat = new THREE.ShaderMaterial({
    uniforms, vertexShader: FLAME_VERT, fragmentShader: FLAME_FRAG, transparent: true, depthWrite: false, toneMapped: false, fog: false, side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = 3;
  return mesh;
}

// 입자 풀: Points 하나. positions/lifes 는 CPU 에서 갱신한다(life 속성: 0..1, 쉬는 입자는 -1).
function buildParticles(count, vert, frag, blending, order) {
  const positions = new Float32Array(count * 3);
  const lifes = new Float32Array(count).fill(-1);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('aLife', new THREE.BufferAttribute(lifes, 1));
  const uniforms = { uPixels: { value: 400 }, uAurora: { value: 0 } };
  const mat = new THREE.ShaderMaterial({
    uniforms, vertexShader: vert, fragmentShader: frag, transparent: true, depthWrite: false, blending, toneMapped: false, fog: false,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  points.renderOrder = order;
  const size = new THREE.Vector2();
  points.onBeforeRender = (renderer) => { renderer.getDrawingBufferSize(size); uniforms.uPixels.value = size.y * 0.5; };
  return { points, positions, lifes, vel: new Float32Array(count * 3), life: new Float32Array(count), maxLife: new Float32Array(count), geo };
}

export function createFire(scene, furnacePos) {
  const group = new THREE.Group();
  group.position.set(furnacePos.x, BASE_Y, furnacePos.z);

  const flameUniforms = { uTime: { value: 0 }, uFlare: { value: 0 }, uAurora: { value: 0 } };
  const flames = buildFlameMesh(flameUniforms);

  // 숯 바닥(납작한 원)과 땅에 번지는 빛무리.
  const emberMat = new THREE.MeshBasicMaterial({ map: emberTexture(), transparent: true, depthWrite: false, toneMapped: false });
  const bed = new THREE.Mesh(new THREE.CircleGeometry(0.85, 24), emberMat);
  bed.rotation.x = -Math.PI / 2;
  bed.position.y = 0.02;
  bed.renderOrder = 1;
  const glowMat = new THREE.MeshBasicMaterial({
    map: glowTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, fog: false,
  });
  const glow = new THREE.Mesh(new THREE.CircleGeometry(3.4, 24), glowMat);
  glow.rotation.x = -Math.PI / 2;
  glow.position.y = -BASE_Y + 0.05;
  glow.renderOrder = 0;

  const sparks = buildParticles(SPARK_COUNT, SPARK_VERT, SPARK_FRAG, THREE.AdditiveBlending, 4);
  const smoke = buildParticles(SMOKE_COUNT, SMOKE_VERT, SMOKE_FRAG, THREE.NormalBlending, 5);
  group.add(glow, bed, smoke.points, flames, sparks.points);

  const light = new THREE.PointLight(0xff8a3a, LIGHT_INTENSITY, 9);
  light.position.set(furnacePos.x, 1.2, furnacePos.z);
  light.castShadow = false;
  scene.add(group, light);

  const tint = createAuroraTint(); // 오로라 불꽃 진행(번짐·사그라듦·클릭 되돌리기는 logic/aurora.js)
  let lightBoost = 1; // 점광 세기 배율(시간대: 밤에 더 밝게, setLightBoost)
  let flareT = -1; // 불이 커진 뒤 경과 초(-1 이면 없음)
  let sparkAcc = 0;
  let smokeAcc = 0;

  function spawnSpark(speedBoost) {
    for (let i = 0; i < SPARK_COUNT; i++) {
      if (sparks.lifes[i] >= 0) continue;
      const a = Math.random() * Math.PI * 2;
      const r = Math.random() * 0.4;
      sparks.positions[i * 3] = Math.cos(a) * r;
      sparks.positions[i * 3 + 1] = 0.3 + Math.random() * 0.4;
      sparks.positions[i * 3 + 2] = Math.sin(a) * r;
      sparks.vel[i * 3] = (Math.random() - 0.5) * 0.7;
      sparks.vel[i * 3 + 1] = (0.9 + Math.random() * 1.1) * speedBoost;
      sparks.vel[i * 3 + 2] = (Math.random() - 0.5) * 0.7;
      sparks.maxLife[i] = 1.0 + Math.random() * 1.2;
      sparks.life[i] = 0;
      sparks.lifes[i] = 0;
      return;
    }
  }
  function spawnSmoke() {
    for (let i = 0; i < SMOKE_COUNT; i++) {
      if (smoke.lifes[i] >= 0) continue;
      smoke.positions[i * 3] = (Math.random() - 0.5) * 0.4;
      smoke.positions[i * 3 + 1] = 1.2 + Math.random() * 0.3;
      smoke.positions[i * 3 + 2] = (Math.random() - 0.5) * 0.4;
      smoke.vel[i * 3] = 0.12 + Math.random() * 0.12; // 바람에 살짝 흐른다
      smoke.vel[i * 3 + 1] = 0.45 + Math.random() * 0.25;
      smoke.vel[i * 3 + 2] = (Math.random() - 0.5) * 0.1;
      smoke.maxLife[i] = 3.5 + Math.random() * 1.5;
      smoke.life[i] = 0;
      smoke.lifes[i] = 0;
      return;
    }
  }
  function stepParticles(p, count, dt, drag, rise) {
    for (let i = 0; i < count; i++) {
      if (p.lifes[i] < 0) continue;
      p.life[i] += dt;
      if (p.life[i] >= p.maxLife[i]) { p.lifes[i] = -1; continue; }
      p.lifes[i] = p.life[i] / p.maxLife[i];
      p.vel[i * 3] += (Math.sin(p.life[i] * 5 + i * 1.7) * 0.9 - p.vel[i * 3] * drag) * dt; // 흔들리며 날아오른다
      p.vel[i * 3 + 1] += rise * dt;
      p.vel[i * 3 + 2] += (Math.cos(p.life[i] * 4 + i) * 0.6 - p.vel[i * 3 + 2] * drag) * dt;
      for (let k = 0; k < 3; k++) p.positions[i * 3 + k] += p.vel[i * 3 + k] * dt;
    }
    p.geo.attributes.position.needsUpdate = true;
    p.geo.attributes.aLife.needsUpdate = true;
  }

  return {
    group,
    flare() {
      flareT = 0;
      for (let i = 0; i < SPARK_BURST; i++) spawnSpark(1.9);
    },
    // 불꽃 색 효과. 'aurora' 만 있다(알 수 없는 이름이나 null 은 끈다). 시작할 때 반짝이 불티가 한꺼번에 터진다.
    // 이미 켜져 있으면 지금 세기에서 이어서 다시 시작하고(번쩍이지 않게 불티도 덜 터뜨린다) seconds 가 새로 센다.
    setTint(name, seconds = 4) {
      if (name !== 'aurora' || !(seconds > 0)) { tint.stop(); return; }
      const burst = Math.round(28 * (1 - tint.amount));
      tint.start(seconds);
      for (let i = 0; i < burst; i++) spawnSpark(1.5 + Math.random() * 0.8);
    },
    // 불꽃을 클릭해 원래 색으로 되돌린다(약 1초). 오로라가 켜져 있었으면 true.
    clearTint() { return tint.clear(); },
    tintActive: () => tint.active && !tint.returning,
    // 불티 몇 개를 느리게 띄운다(타는 걸 지켜보는 동안의 불씨).
    embers(count = 4) { for (let i = 0; i < count; i++) spawnSpark(0.8 + Math.random() * 0.5); },
    tintAmount: () => flameUniforms.uAurora.value,
    // 점광 세기 배율(마당 시간대 순환이 매 프레임 정한다: 저녁에는 불빛이 주변을 더 밝힌다).
    setLightBoost(k) { lightBoost = Number.isFinite(k) && k > 0 ? k : 1; },
    update(dt, time) {
      const aur = tint.update(dt); // 오로라 정도(0..1): 0.6초에 번지고 끝나기 2초 전부터 사그라든다
      flameUniforms.uAurora.value = aur;
      sparks.points.material.uniforms.uAurora.value = aur;
      // 커졌다 가라앉는 정도(0..1): 빠르게 올라가 느리게 내려온다.
      let e = 0;
      if (flareT >= 0) {
        e = flareT < FLARE_RISE ? flareT / FLARE_RISE : Math.exp(-(flareT - FLARE_RISE) * 3.2);
        flareT += dt;
        if (flareT >= FLARE_SEC) flareT = -1;
      }
      flameUniforms.uTime.value = time;
      flameUniforms.uFlare.value = e;

      // 점광: 느린 숨결 + 빠른 일렁임, 색도 살짝 흔들린다.
      const n = 0.5 * Math.sin(time * 9.3) + 0.3 * Math.sin(time * 17.1 + 1.3) + 0.2 * Math.sin(time * 31 + 0.6);
      const slow = Math.sin(time * 2.1) * 0.5 + Math.sin(time * 3.7 + 2) * 0.5;
      light.intensity = LIGHT_INTENSITY * lightBoost * (0.9 + 0.1 * slow + 0.12 * n + 0.9 * e);
      light.color.setRGB(1 - 0.65 * aur, 0.52 + 0.06 * n + 0.08 * e + 0.38 * aur, 0.22 + 0.05 * n + 0.1 * e + 0.55 * aur);
      glowMat.opacity = Math.min(1, 0.85 + 0.15 * n + 0.4 * e);
      const pulse = 0.82 + 0.18 * Math.sin(time * 2.6) + 0.1 * n + 0.35 * e;
      emberMat.color.setRGB(pulse, pulse * 0.92, pulse * 0.85);

      // 불티: 평소 초당 7개쯤, 불이 커질 때 더 자주. 연기: 초당 2.4개.
      sparkAcc += dt * (7 + 26 * e + 22 * aur);
      while (sparkAcc >= 1) { sparkAcc -= 1; spawnSpark(1 + 0.6 * e); }
      stepParticles(sparks, SPARK_COUNT, dt, 0.4, 0.15);
      smokeAcc += dt * 2.4;
      while (smokeAcc >= 1) { smokeAcc -= 1; spawnSmoke(); }
      stepParticles(smoke, SMOKE_COUNT, dt, 0.5, 0);
    },
    meshes: [flames, bed, glow, sparks.points, smoke.points], // 그리기 호출 수 확인용
  };
}
