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

// lanterns: 가로등 기둥 자리 [{x, z}], spots: 바닥 조명(작은 말뚝 등) 자리 [{x, z}] — 소원 조각상 발치 등.
// opts(모바일 저사양 모드만 넘긴다): maxPointLights(가로등 점광 개수 상한: 넘는 기둥은 빛무리·바닥 빛만), spotLight(false 면 조각상 가운데 점광 없음).
export function buildLanternLights(parent, lanterns, spots = [], { maxPointLights = Infinity, spotLight = true } = {}) {
  const cfg = LANTERN_LIGHT;
  const group = new THREE.Group();
  group.name = 'lantern-lights';
  const glowTex = radialTexture(128, [[0, 'rgba(255,240,200,1)'], [0.25, 'rgba(255,208,130,0.65)'], [1, 'rgba(255,170,70,0)']]);
  const poolTex = radialTexture(128, [[0, 'rgba(255,214,140,0.85)'], [0.55, 'rgba(255,190,100,0.3)'], [1, 'rgba(255,170,70,0)']]);
  const glowMat = new THREE.SpriteMaterial({ map: glowTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
  const poolMat = new THREE.MeshBasicMaterial({ map: poolTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
  const poolGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  const lamps = lanterns.map((l, i) => {
    const light = i < maxPointLights ? new THREE.PointLight(cfg.color, 0, cfg.distance, cfg.decay) : null;
    light?.position.set(l.x, cfg.headY, l.z);
    const glow = new THREE.Sprite(glowMat);
    glow.position.set(l.x, cfg.headY, l.z);
    glow.scale.setScalar(cfg.glowSize);
    const pool = new THREE.Mesh(poolGeo, poolMat);
    pool.position.set(l.x, 0.06, l.z);
    pool.scale.setScalar(cfg.poolSize);
    pool.renderOrder = 2;
    if (light) group.add(light);
    group.add(glow, pool);
    return { light, glow, pool };
  });
  // 소원 조각상 둘레의 바닥 매립등: 조각상을 가운데 두고 사각형 꼭짓점 4곳에 아주 작은 둥근 매립등(은색 테 + 따뜻하게 빛나는 면)을 땅과 거의 같은 높이로 박는다.
  // 점광은 조각상 발치 가운데에 약한 것 하나만 둬서(아래에서 위로 비추는 느낌) 광원 수를 아낀다. 각 매립등 둘레에는 작은 빛 웅덩이를 얹는다.
  const sp = cfg.spot;
  const spotLights = [];
  const discMats = [];
  if (spots.length) {
    const ringGeo = new THREE.CylinderGeometry(sp.ringRadius, sp.ringRadius, 0.03, 20);
    const discGeo = new THREE.CircleGeometry(sp.discRadius, 20).rotateX(-Math.PI / 2);
    const ringMat = new THREE.MeshStandardMaterial({ color: 0xb9bec6, metalness: 0.6, roughness: 0.35, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
    const discMat = new THREE.MeshBasicMaterial({ color: 0xffe2b0, polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -6 });
    discMats.push(discMat);
    let cx = 0; let cz = 0;
    for (const s of spots) {
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.position.set(s.x, 0.04, s.z);
      const disc = new THREE.Mesh(discGeo, discMat);
      disc.position.set(s.x, 0.062, s.z);
      disc.renderOrder = 3;
      const pool = new THREE.Mesh(poolGeo, poolMat);
      pool.position.set(s.x, 0.07, s.z);
      pool.scale.setScalar(sp.poolSize);
      pool.renderOrder = 2;
      group.add(ring, disc, pool);
      cx += s.x / spots.length; cz += s.z / spots.length;
    }
    if (spotLight) {
      const up = new THREE.PointLight(cfg.color, 0, sp.centerDistance, cfg.decay);
      up.position.set(cx, sp.centerY, cz);
      group.add(up);
      spotLights.push(up);
    }
  }
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
      for (const { light } of lamps) if (light) light.intensity = cfg.intensity * k;
      for (const light of spotLights) light.intensity = sp.centerIntensity * k;
      for (const m of discMats) m.color.setRGB(1, 0.89, 0.69).multiplyScalar(0.8 + 0.2 * d); // 어두울수록 매립등 면이 더 환하다
      glowMat.opacity = cfg.glowOpacity * k;
      poolMat.opacity = cfg.poolOpacity * d; // 바닥 웅덩이는 어두울 때만(낮에는 보이지 않는다)
    },
  };
}
