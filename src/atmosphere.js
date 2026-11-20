// 브라우저 전용: 마당 하늘, 안개, 조명, 톤매핑. 하늘·해·반구광은 마당 루트(root)에 넣어 마당을 숨기면 함께 꺼진다.
// 시간대 순환(logic/skyCycle.js): setSky(sky) 를 매 프레임 부르면 하늘 색·해(달) 둘레 빛·안개·해 방향/색/세기·반구광이 그 값으로 바뀐다.
// 새 광원·그림자 맵을 만들지 않고 기존 값만 바꾼다(실내는 자기 조명이라 건드리지 않는다: 안개는 마당 전용 Fog 객체만 바꾼다).
import * as THREE from 'three';
import { COLORS, FOG, LIGHT } from './config.js';

const SKY_RADIUS = 100;
const SUN_DISTANCE = 30; // 해(방향광)를 원점에서 이만큼 떨어진 곳에 둔다(그림자 카메라가 마당 전체를 덮게)

const SKY_VERT = `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;
// 지평선 -> 꼭대기 그라데이션 + 해(달) 쪽의 넓은 빛무리와 작은 원반.
const SKY_FRAG = `
uniform vec3 uTop;
uniform vec3 uHorizon;
uniform vec3 uGlow;
uniform vec3 uSunDir;
varying vec3 vDir;
void main() {
  vec3 d = normalize(vDir);
  float t = clamp(d.y * 1.6, 0.0, 1.0);
  vec3 c = mix(uHorizon, uTop, t);
  float s = max(dot(d, uSunDir), 0.0);
  c += uGlow * (pow(s, 6.0) * 0.35 + pow(s, 900.0) * 1.2);
  gl_FragColor = vec4(c, 1.0);
  #include <colorspace_fragment>
}`;

function buildSkyDome() {
  const uniforms = {
    uTop: { value: new THREE.Color(COLORS.skyTop) },
    uHorizon: { value: new THREE.Color(COLORS.skyHorizon) },
    uGlow: { value: new THREE.Color(0x000000) },
    uSunDir: { value: new THREE.Vector3(...LIGHT.sunPosition).normalize() },
  };
  const dome = new THREE.Mesh(new THREE.SphereGeometry(SKY_RADIUS, 32, 16), new THREE.ShaderMaterial({
    uniforms, vertexShader: SKY_VERT, fragmentShader: SKY_FRAG, side: THREE.BackSide, fog: false, depthWrite: false,
  }));
  dome.renderOrder = -1;
  return { dome, uniforms };
}

// 돌려주는 fog 는 마당용 안개이고(공간을 바꿀 때 scene.fog 에 다시 넣는다), 지금은 scene 에 이미 설정돼 있다.
// setSky(sky): sky 는 logic/skyCycle.js 의 skyAt 결과(색은 sRGB [r, g, b]).
export function applyAtmosphere(scene, renderer, root = scene) {
  scene.background = null;
  const sky = buildSkyDome();
  root.add(sky.dome);
  const fog = new THREE.Fog(COLORS.fog, FOG.near, FOG.far);
  scene.fog = fog;

  const sun = new THREE.DirectionalLight(COLORS.sun, LIGHT.sun);
  sun.position.set(...LIGHT.sunPosition);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const e = LIGHT.shadowExtent;
  Object.assign(sun.shadow.camera, { left: -e, right: e, top: e, bottom: -e, near: 1, far: SUN_DISTANCE + 50 });
  sun.shadow.camera.updateProjectionMatrix();
  sun.shadow.bias = -0.0005;
  root.add(sun);
  const hemi = new THREE.HemisphereLight(COLORS.hemiSky, COLORS.hemiGround, LIGHT.hemi);
  root.add(hemi);

  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;

  const S = THREE.SRGBColorSpace;
  const set = (color, [r, g, b]) => color.setRGB(r, g, b, S);
  function setSky(s) {
    const u = sky.uniforms;
    set(u.uTop.value, s.skyTop);
    set(u.uHorizon.value, s.skyHorizon);
    set(u.uGlow.value, s.glow);
    u.uSunDir.value.set(s.sunDir[0], s.sunDir[1], s.sunDir[2]);
    set(fog.color, s.fog);
    fog.near = s.fogNear;
    fog.far = s.fogFar;
    sun.position.set(s.sunDir[0] * SUN_DISTANCE, s.sunDir[1] * SUN_DISTANCE, s.sunDir[2] * SUN_DISTANCE);
    set(sun.color, s.sunColor);
    sun.intensity = s.sun;
    set(hemi.color, s.hemiSky);
    set(hemi.groundColor, s.hemiGround);
    hemi.intensity = s.hemi;
  }
  return { fog, setSky };
}
