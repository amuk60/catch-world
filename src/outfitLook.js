// 브라우저 전용: 캐릭터의 옷 겉모습 세 가지(정장 / 그을음 / 흰 나시). 모델(character-male-d)은 색이 칠해진 면이 아니라
// 공용 팔레트 그림(colormap.png: 32px 칸마다 단색 + 위아래 그라데이션)에서 정점마다 한 칸씩 골라 쓰는 방식이다.
//  - 흰 나시: 정점 UV 를 다른 칸으로 옮긴다. 몸통의 재킷(어두운 칸)과 넥타이(빨간 칸)는 흰 셔츠 칸으로, 팔의 소매와 소맷단은 피부 칸으로.
//    칸 안의 위치(그라데이션)는 그대로 두므로 음영이 자연스럽다. 지오메트리는 복제해서 쓰고 재질은 원본을 공유한다(스키닝·그림자 그대로).
//  - 그을음: 팔레트로는 얼룩을 칠할 수 없어서(재킷과 바지가 같은 칸을 쓴다) 재질 셰이더에 절차적 노이즈를 얹는다.
//    정점의 바인드 포즈 좌표(스키닝 전 position)로 노이즈를 계산하므로 얼룩이 옷에 붙어 움직인다. 어두운 천에는 재(회갈색 먼지)를 먼저 앉혀 검은 얼룩이 보이게 한다.
//    나시의 흰 천은 따뜻한 석양 조명에 누렇게 보여서, 재질에 흰 부분만 살짝 스스로 빛나게 해 하얗게 읽히도록 한다.
// 칸 번호는 character-male-d 기준이다(다른 캐릭터로 바꾸면 해당 칸이 없어 나시 UV 이동이 일어나지 않고 그을음만 보인다).
import * as THREE from 'three';
import { appearanceOf } from './logic/outfit.js';

const GRID = 16; // colormap 512px = 32px 칸 16 x 16
const SWATCH_ROWS = 4; // 한 색의 세로 그라데이션이 차지하는 칸 수(칸 행 8~11, 12~15 두 벌)
const COL_DARK = 7; // 재킷·바지(어두운 회색) 칸 열
const COL_WHITE = 15; // 흰 셔츠 칸 열(행 12~15), 넥타이(빨강)는 같은 열의 행 8~11
const COL_SKIN = 5; // 피부 칸 열(행 8~11)

// 나시용 UV 이동 규칙: 지배 뼈 이름과 원래 칸(cx, cy) -> 새 칸. 해당 없으면 null.
function tankCell(bone, cx, cy) {
  if (bone === 'torso') {
    // 재킷·넥타이 -> 흰 셔츠 칸의 맨 윗줄(가장 하얀 부분. 아랫줄은 연보라로 어두워진다)
    if ((cx === COL_DARK && cy >= 12) || (cx === COL_WHITE && cy < 12)) return [COL_WHITE, 12];
  } else if (bone.startsWith('arm')) {
    if ((cx === COL_DARK || cx === COL_WHITE) && cy >= 12) return [COL_SKIN, cy - SWATCH_ROWS]; // 소매·소맷단 -> 맨살
  }
  return null;
}

// 나시 UV 를 만든 지오메트리 복제본. 바뀐 정점이 없으면 null.
function tankGeometry(mesh) {
  const src = mesh.geometry;
  const uv = src.attributes.uv;
  const si = src.attributes.skinIndex;
  const sw = src.attributes.skinWeight;
  if (!uv || !si || !sw || !mesh.skeleton) return null;
  const geo = src.clone();
  const out = geo.attributes.uv;
  let changed = 0;
  for (let i = 0; i < uv.count; i++) {
    let best = 0;
    for (let k = 1; k < 4; k++) if (sw.getComponent(i, k) > sw.getComponent(i, best)) best = k;
    const bone = mesh.skeleton.bones[si.getComponent(i, best)]?.name ?? '';
    const gu = uv.getX(i) * GRID;
    const gv = uv.getY(i) * GRID;
    const cx = Math.min(GRID - 1, Math.floor(gu));
    const cy = Math.min(GRID - 1, Math.floor(gv));
    const to = tankCell(bone, cx, cy);
    if (!to) continue;
    out.setXY(i, (to[0] + (gu - cx)) / GRID, (to[1] + (gv - cy)) / GRID);
    changed++;
  }
  if (!changed) { geo.dispose(); return null; }
  return geo;
}

const NOISE_GLSL = `
float sootHash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float sootNoise(vec3 x) {
  vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(sootHash(i), sootHash(i + vec3(1, 0, 0)), f.x), mix(sootHash(i + vec3(0, 1, 0)), sootHash(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(sootHash(i + vec3(0, 0, 1)), sootHash(i + vec3(1, 0, 1)), f.x), mix(sootHash(i + vec3(0, 1, 1)), sootHash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}
float sootFbm(vec3 p) { return 0.55 * sootNoise(p) + 0.3 * sootNoise(p * 2.1) + 0.15 * sootNoise(p * 4.3); }
`;

// maskExpr: 바인드 포즈 좌표 sp 로 계산하는 0~1 마스크(GLSL 식). 몸은 허리 위로만 진하게, 머리는 얼굴에 몇 군데만.
// strength: 그을음이 얼마나 진한가(0~1). 숯가루가 살짝 묻은 정도를 목표로 옅고 가장자리가 부드럽다.
function sootMaterial(base, key, maskExpr, threshold, freq, strength) {
  const m = base.clone();
  m.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vSootPos;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSootPos = position;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vSootPos;\n${NOISE_GLSL}`)
      .replace('#include <map_fragment>', `#include <map_fragment>
      {
        vec3 sp = vSootPos;
        float mask = ${maskExpr};
        float lum = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));
        float darkCloth = 1.0 - smoothstep(0.04, 0.2, lum);
        // 재: 어두운 천 위에 회갈색 먼지가 군데군데 앉는다(검은 얼룩이 보이도록 바탕을 밝힌다).
        float ash = smoothstep(0.26, 0.46, sootFbm(sp * ${(freq * 0.55).toFixed(1)} + 7.3));
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.29, 0.25, 0.19), ash * 0.22 * darkCloth * mask);
        // 흰 천과 맨살은 누렇게 꾀죄죄하게.
        diffuseColor.rgb *= mix(vec3(1.0), vec3(0.80, 0.74, 0.64), (1.0 - darkCloth) * mask * 0.25);
        // 그을음: 옅고 부드러운 숯가루 얼룩.
        float blot = smoothstep(${threshold.toFixed(2)}, ${(threshold + 0.12).toFixed(2)}, sootFbm(sp * ${freq.toFixed(1)}));
        float soot = clamp(blot * mask, 0.0, 1.0);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.07, 0.06, 0.05), soot * ${strength.toFixed(2)});
      }`);
  };
  m.customProgramCacheKey = () => `soot-${key}`;
  return m;
}

// 나시용 재질: 원본 복제 + 밝은(흰) 픽셀만 약하게 자체 발광.
function tankMaterial(base) {
  const m = base.clone();
  m.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
      totalEmissiveRadiance += diffuseColor.rgb * smoothstep(0.55, 0.8, dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114))) * 0.3;`);
  };
  m.customProgramCacheKey = () => 'tank';
  return m;
}

// root: 복제된 캐릭터 모델. 돌려주는 apply(state) 는 옷 상태('clean' | 'dirty' | 'tank' | 'drying' | 'dry')에 맞춰 모든 스킨 메시의 지오메트리·재질을 바꾼다.
export function createOutfitLook(root) {
  const entries = [];
  root.traverse((o) => {
    if (!o.isSkinnedMesh) return;
    const isHead = /head/i.test(o.name);
    const mats = [].concat(o.material);
    entries.push({
      mesh: o,
      suit: { geometry: o.geometry, material: o.material },
      soot: {
        geometry: o.geometry,
        material: mats.length === 1
          ? sootMaterial(mats[0], isHead ? 'head' : 'body', isHead ? 'smoothstep(0.05, 0.14, sp.z)' : 'mix(0.45, 1.0, smoothstep(0.12, 0.2, sp.y))', isHead ? 0.56 : 0.52, isHead ? 11.0 : 8.0, isHead ? 0.32 : 0.25)
          : o.material,
      },
      tank: (() => { const geometry = tankGeometry(o); return geometry ? { geometry, material: mats.length === 1 ? tankMaterial(mats[0]) : o.material } : { geometry: o.geometry, material: o.material }; })(),
    });
  });
  let current = 'suit';
  return {
    apply(state) {
      const look = appearanceOf(state);
      if (look === current) return;
      current = look;
      for (const e of entries) {
        const pick = e[look];
        e.mesh.geometry = pick.geometry;
        e.mesh.material = pick.material;
      }
    },
    get appearance() { return current; },
  };
}
