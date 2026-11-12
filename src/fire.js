// 브라우저 전용: 소각로의 상시 불. 깜빡이는 원뿔 3개와 따뜻한 점광(그림자 없음).
// update(dt, time) 를 매 프레임 부르고, flare() 로 잠깐 커지게 한다(종이가 불에 닿았을 때).
import * as THREE from 'three';
import { easeInOut } from './logic/burn.js';

const FIRE_CONES = [ // 반지름, 높이, 색, x/z 오프셋
  { r: 0.8, h: 1.8, color: 0xff5a14, x: 0, z: 0 },
  { r: 0.55, h: 1.4, color: 0xff9a1e, x: 0.35, z: 0.15 },
  { r: 0.4, h: 1.1, color: 0xffe066, x: -0.3, z: -0.12 },
];
const FLARE = 1.35; // 커지는 배율
const FLARE_SEC = 0.2; // 커졌다 돌아오는 시간(초)
const LIGHT_INTENSITY = 3;

export function createFire(scene, furnacePos) {
  const cones = FIRE_CONES.map((c, i) => {
    const geo = new THREE.ConeGeometry(c.r, c.h, 12);
    geo.translate(0, c.h / 2, 0);
    const mat = new THREE.MeshBasicMaterial({ color: c.color, transparent: true, opacity: 0.88, toneMapped: false, depthWrite: false });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(c.x, 0, c.z);
    mesh.userData.phase = i * 2.1;
    return mesh;
  });
  const group = new THREE.Group();
  group.add(...cones);
  group.position.set(furnacePos.x, 0.3, furnacePos.z);
  const light = new THREE.PointLight(0xff9a4a, LIGHT_INTENSITY, 9);
  light.position.set(furnacePos.x, 1.2, furnacePos.z);
  light.castShadow = false;
  scene.add(group, light);

  let flareT = -1; // 커짐 경과 초(-1 이면 없음)

  return {
    group,
    flare() { flareT = 0; },
    update(dt, time) {
      let flare = 1;
      if (flareT >= 0) {
        flare = 1 + (FLARE - 1) * (1 - easeInOut(flareT / FLARE_SEC));
        flareT += dt;
        if (flareT >= FLARE_SEC) flareT = -1;
      }
      // 깜빡임: 원뿔마다 위상이 다른 사인 합.
      for (const cone of cones) {
        const p = cone.userData.phase;
        const n = 0.5 * Math.sin(time * 9 + p) + 0.3 * Math.sin(time * 17 + p * 1.7) + 0.2 * Math.sin(time * 31 + p * 0.6);
        cone.scale.set(1 + 0.08 * n, 1 + 0.22 * n, 1 + 0.08 * n);
      }
      group.scale.setScalar(flare);
      light.intensity = LIGHT_INTENSITY * flare * (1 + 0.15 * Math.sin(time * 13) + 0.1 * Math.sin(time * 23 + 1));
    },
  };
}
