// 브라우저 전용: 노을 하늘, 안개, 조명, 톤매핑.
import * as THREE from 'three';
import { COLORS, FOG, LIGHT } from './config.js';

const SKY_RADIUS = 100;

function buildSkyDome() {
  const geo = new THREE.SphereGeometry(SKY_RADIUS, 32, 16);
  const horizon = new THREE.Color(COLORS.skyHorizon);
  const top = new THREE.Color(COLORS.skyTop);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const t = THREE.MathUtils.clamp((pos.getY(i) / SKY_RADIUS) * 1.6, 0, 1);
    c.copy(horizon).lerp(top, t);
    c.toArray(colors, i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const dome = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
    vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false, toneMapped: false,
  }));
  dome.renderOrder = -1;
  return dome;
}

export function applyAtmosphere(scene, renderer) {
  scene.background = null;
  scene.add(buildSkyDome());
  scene.fog = new THREE.Fog(COLORS.fog, FOG.near, FOG.far);

  const sun = new THREE.DirectionalLight(COLORS.sun, LIGHT.sun);
  sun.position.set(...LIGHT.sunPosition);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const e = LIGHT.shadowExtent;
  Object.assign(sun.shadow.camera, { left: -e, right: e, top: e, bottom: -e, near: 1, far: 60 });
  sun.shadow.camera.updateProjectionMatrix();
  sun.shadow.bias = -0.0005;
  scene.add(sun);
  scene.add(new THREE.HemisphereLight(COLORS.hemiSky, COLORS.hemiGround, LIGHT.hemi));

  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
}
