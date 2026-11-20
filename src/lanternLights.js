// 브라우저 전용: 광장 서쪽 가장자리의 가로등 기둥(모델은 decor.js 가 그린다)에 불빛을 단다. 모델·디자인은 그대로 두고 조명만 더한다.
// 기둥마다 따뜻한 점광 1개(그림자 없음) + 머리 위치의 빛무리 스프라이트 + 바닥에 번지는 빛 웅덩이. 하늘이 어두울수록(darkness 0~1) 밝아지고, 낮에도 아주 은은하게 켜져 있다.
// 광원은 4개뿐이고 그림자 맵을 쓰지 않아 비용이 작다. 모두 장식이라 충돌은 없다.
import * as THREE from 'three';
import { LANTERN_LIGHT } from './config.js';

function radialTexture(size, stops) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  for (const [t, color] of stops) grad.addColorStop(t, color);
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function buildLanternLights(parent, lanterns) {
  const cfg = LANTERN_LIGHT;
  const group = new THREE.Group();
  group.name = 'lantern-lights';
  const glowTex = radialTexture(128, [[0, 'rgba(255,240,200,1)'], [0.25, 'rgba(255,208,130,0.65)'], [1, 'rgba(255,170,70,0)']]);
  const poolTex = radialTexture(128, [[0, 'rgba(255,214,140,0.85)'], [0.55, 'rgba(255,190,100,0.3)'], [1, 'rgba(255,170,70,0)']]);
  const glowMat = new THREE.SpriteMaterial({ map: glowTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
  const poolMat = new THREE.MeshBasicMaterial({ map: poolTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
  const poolGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  const lamps = lanterns.map((l) => {
    const light = new THREE.PointLight(cfg.color, 0, cfg.distance, cfg.decay);
    light.position.set(l.x, cfg.headY, l.z);
    const glow = new THREE.Sprite(glowMat);
    glow.position.set(l.x, cfg.headY, l.z);
    glow.scale.setScalar(cfg.glowSize);
    const pool = new THREE.Mesh(poolGeo, poolMat);
    pool.position.set(l.x, 0.06, l.z);
    pool.scale.setScalar(cfg.poolSize);
    pool.renderOrder = 2;
    group.add(light, glow, pool);
    return { light, glow, pool };
  });
  parent.add(group);
  let last = -1;
  return {
    group,
    // darkness: 0(밝은 낮) ~ 1(깊은 밤).
    setDarkness(darkness) {
      const d = Math.min(1, Math.max(0, darkness));
      if (Math.abs(d - last) < 0.004) return;
      last = d;
      const k = cfg.dayLevel + (1 - cfg.dayLevel) * d;
      for (const { light, glow } of lamps) { light.intensity = cfg.intensity * k; }
      glowMat.opacity = cfg.glowOpacity * k;
      poolMat.opacity = cfg.poolOpacity * d; // 바닥 웅덩이는 어두울 때만(낮에는 보이지 않는다)
    },
  };
}
