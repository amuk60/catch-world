// 브라우저 전용: 마당 가는 길(디딤돌 + 흙길 가장자리 + 자갈·들꽃)과 허브 이정표를 만든다. 계획(경로·방향)은 logic/paths.js 가 정한다.
// 그리기 호출을 아끼려고 같은 재질은 한 덩어리로 합친다: 디딤돌+자갈 1, 흙길(알파 가장자리) 1, 들꽃 1, 이정표 2. 모두 장식이라 충돌은 없다.
// 디딤돌은 모델이 아니라 납작한 돌 조각(8각 둥근 다각형, 높이 0.045)을 직접 만든다: 지면과 면이 겹쳐 깜빡이는 일이 없도록 높이를 띄우고 polygonOffset 을 준다.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { SEED } from './config.js';
import { mulberry32, rand } from './logic/rng.js';
import { PATH_STYLE, resample, buildPathPlan } from './logic/paths.js';
import { signCanvas, liveSignTexture, drawSignText } from './signFont.js';

const STONE_H = 0.045;
const PLAZA_LIFT = 0.03; // 포장 광장(y=0.02) 위에서는 돌을 그만큼 띄운다
const DIRT_Y = 0.012;
const STONE_COLORS = [0x8e9498, 0x899095, 0x959b9f, 0x848b90, 0x91979b, 0x9aa0a3]; // 잔디 위: 연한 회색(따뜻한 햇빛에 갈색으로 보이지 않게 살짝 차갑게) // 잔디 위: 연한 회색 톤
const DIRT_COLORS = [0xb59a6c, 0xa89578, 0xbba67a];
const FLOWER_COLORS = [0xffffff, 0xffe27a, 0xff9fb8, 0xc9a6ff];

const col = new THREE.Color();
const rgb = (hex, k = 1) => { col.setHex(hex); return [col.r * k, col.g * k, col.b * k]; };

// 납작한 돌 조각 하나: 위 가장자리를 살짝 깎은 다각형 기둥. 바닥은 만들지 않는다(안 보인다). 평평한 면 음영(비색인).
function stoneGeometry({ rx, rz, h, n = 10, rng, tint, lift = 0 }) {
  const rings = [];
  const a0 = rng() * Math.PI * 2;
  const fs = Array.from({ length: n }, () => rand(rng, 0.7, 1.12));
  const ring = (scale, y) => fs.map((f, i) => {
    const a = a0 + (i / n) * Math.PI * 2;
    return [Math.cos(a) * rx * f * scale, y, Math.sin(a) * rz * f * scale];
  });
  const top = ring(0.88, lift + h);
  const edge = ring(1.0, lift + h - 0.014);
  const bottom = ring(1.03, lift - 0.03);
  const centre = [0, lift + h + 0.007, 0];
  const pos = [];
  const colors = [];
  const tri = (a, b, c, shade) => { for (const v of [a, b, c]) { pos.push(...v); colors.push(...rgb(tint, shade)); } };
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    tri(centre, top[j], top[i], 1.0);
    // 위 -> 가장자리(깎은 면), 가장자리 -> 바닥(옆면)
    tri(top[i], top[j], edge[j], 1.08);
    tri(top[i], edge[j], edge[i], 1.08);
    tri(edge[i], edge[j], bottom[j], 0.72);
    tri(edge[i], bottom[j], bottom[i], 0.72);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  g.computeVertexNormals();
  return g;
}

function placed(geometry, x, y, z, yaw) {
  geometry.rotateY(yaw);
  geometry.translate(x, y, z);
  return geometry;
}

// 흙길 띠: 중심선 양옆으로 폭이 살짝 일렁이는 띠(가장자리 알파 0). 양 끝도 서서히 사라진다. 점별 RGBA.
function dirtRibbon(samples, rng, { fadeEnds = [true, true], yBase = DIRT_Y }) {
  const pos = [];
  const colors = [];
  const idx = [];
  const lat = [-1, -0.55, 0.55, 1];
  const alphas = [0, 0.82, 0.82, 0];
  const base = samples.length;
  const total = samples[samples.length - 1].s;
  samples.forEach((p, i) => {
    const wob = 0.62 + 0.14 * Math.sin(p.s * 1.7 + 1.3) + rand(rng, -0.03, 0.03);
    const tint = DIRT_COLORS[Math.floor(rng() * DIRT_COLORS.length)];
    const fade = Math.min(fadeEnds[0] ? Math.min(1, p.s / 0.8) : 1, fadeEnds[1] ? Math.min(1, (total - p.s) / 0.8) : 1);
    lat.forEach((l, k) => {
      const nx = -p.tz;
      const nz = p.tx;
      pos.push(p.x + nx * l * wob, yBase, p.z + nz * l * wob);
      colors.push(...rgb(tint, k === 0 || k === 3 ? 0.95 : 1), alphas[k] * fade);
    });
  });
  for (let i = 0; i < base - 1; i++) {
    for (let k = 0; k < 3; k++) {
      const a = i * 4 + k;
      const b = a + 1;
      const c = a + 4;
      const d = c + 1;
      idx.push(a, b, c, b, d, c); // 위(+y)를 향하게 감는다
    }
  }
  return { pos, colors, idx };
}

function dirtDisc(cx, cz, r, rng) {
  const pos = [cx, DIRT_Y, cz];
  const colors = [...rgb(DIRT_COLORS[0]), 0.85];
  const idx = [];
  const n = 28;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const rr = r * (0.55 + rand(rng, -0.03, 0.03));
    pos.push(cx + Math.cos(a) * rr, DIRT_Y, cz + Math.sin(a) * rr);
    colors.push(...rgb(DIRT_COLORS[i % 3]), 0.8);
  }
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    pos.push(cx + Math.cos(a) * r * (1 + rand(rng, -0.05, 0.05)), DIRT_Y, cz + Math.sin(a) * r * (1 + rand(rng, -0.05, 0.05)));
    colors.push(...rgb(DIRT_COLORS[(i + 1) % 3]), 0);
  }
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    idx.push(0, j + 1, i + 1); // 위를 향하게
    idx.push(i + 1, j + 1, n + 1 + i, j + 1, n + 1 + j, n + 1 + i);
  }
  return { pos, colors, idx, offset: 0 };
}

function tuftGeometry(rng, flowerHex) {
  const parts = [];
  const green = [0x5f8f3a, 0x6fa043, 0x4f7f33];
  for (let i = 0; i < 5; i++) {
    const g = new THREE.ConeGeometry(0.022, rand(rng, 0.16, 0.26), 4).toNonIndexed();
    g.translate(0, 0.11, 0);
    g.rotateZ(rand(rng, -0.45, 0.45));
    g.rotateY(rng() * Math.PI * 2);
    g.translate(rand(rng, -0.04, 0.04), 0, rand(rng, -0.04, 0.04));
    parts.push({ g, hex: green[i % 3] });
  }
  const f = new THREE.SphereGeometry(0.05, 6, 4).toNonIndexed();
  f.translate(rand(rng, -0.02, 0.02), 0.26, rand(rng, -0.02, 0.02));
  parts.push({ g: f, hex: flowerHex });
  const core = new THREE.SphereGeometry(0.022, 5, 3).toNonIndexed();
  core.translate(0, 0.29, 0);
  parts.push({ g: core, hex: 0xe8a93a });
  for (const { g, hex } of parts) {
    const n = g.attributes.position.count;
    const c = [];
    for (let i = 0; i < n; i++) c.push(...rgb(hex));
    g.setAttribute('color', new THREE.Float32BufferAttribute(c, 3));
    g.deleteAttribute('uv');
  }
  return mergeGeometries(parts.map((p) => p.g));
}

export function buildGroundPaths(scene, plan, layout) {
  const rng = mulberry32((SEED ^ 0x9a7b5e17) >>> 0);
  const plaza = layout.plaza;
  const inPlaza = (x, z) => x > plaza.x1 - 0.15 && x < plaza.x2 && z > plaza.z1 && z < plaza.z2;
  const stoneGeos = [];
  const tuftGeos = [];
  const dirt = { pos: [], colors: [], idx: [] };
  const addDirt = (d) => {
    const o = dirt.pos.length / 3;
    dirt.pos.push(...d.pos);
    dirt.colors.push(...d.colors);
    for (const i of d.idx) dirt.idx.push(i + o);
  };
  const free = (x, z) => !plan.obstacles.some((o) => Math.hypot(x - o.x, z - o.z) < o.radius + 0.12);
  let stones = 0;

  // 허브(스폰): 흙 마당.

  for (const path of plan.paths) {
    const centre = resample(path.points, 0.7, PATH_STYLE.hubClear);
    // 디딤돌: 폭 비슷하지만 크기·옆 어긋남·방향이 조금씩 다르다.
    centre.forEach((p, i) => {
      const lateral = rand(rng, -0.03, 0.03);
      const nx = -p.tz;
      const nz = p.tx;
      const x = p.x + nx * lateral + p.tx * 0;
      const z = p.z + nz * lateral + p.tz * 0;
      const yaw = -Math.atan2(p.tz, p.tx) + rand(rng, -0.3, 0.3);
      const onPlaza = inPlaza(x, z);
      const lift = onPlaza ? PLAZA_LIFT : 0;
      const palette = STONE_COLORS; // 광장 위도 잔디 위와 같은 회색
      const tint = palette[Math.floor(rng() * palette.length)];
      const s = rand(rng, 0.92, 1.08);
      stoneGeos.push(placed(stoneGeometry({ rx: 0.27 * s, rz: 0.23 * s, h: STONE_H * rand(rng, 0.8, 1.1), rng, tint, lift }), x, 0, z, yaw));
      stones++;
    });
  }

  const group = new THREE.Group();
  group.name = 'guide-paths';
  // 디딤돌 + 자갈
  const stoneMesh = new THREE.Mesh(
    mergeGeometries(stoneGeos),
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }),
  );
  stoneMesh.receiveShadow = true;
  stoneMesh.name = 'path-stones';
  group.add(stoneMesh);
  // 흙길(알파 가장자리)
  const dg = new THREE.BufferGeometry();
  dg.setAttribute('position', new THREE.Float32BufferAttribute(dirt.pos, 3));
  dg.setAttribute('color', new THREE.Float32BufferAttribute(dirt.colors, 4));
  dg.setIndex(dirt.idx);
  dg.computeVertexNormals();
  const dirtMesh = new THREE.Mesh(dg, new THREE.MeshStandardMaterial({
    vertexColors: true, transparent: true, depthWrite: false, roughness: 1, metalness: 0,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  }));
  dirtMesh.receiveShadow = true;
  dirtMesh.renderOrder = 1;
  dirtMesh.name = 'path-dirt';
  group.add(dirtMesh);
  // 들꽃 포기
  if (tuftGeos.length) {
    const tuftMesh = new THREE.Mesh(mergeGeometries(tuftGeos), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0 }));
    tuftMesh.name = 'path-tufts';
    group.add(tuftMesh);
  }
  for (const m of group.children) m.frustumCulled = false; // 마당 전체에 퍼져 있어 하나의 경계로 판정하지 않는다
  scene.add(group);
  return { group, stoneCount: stones };
}

// ---- 이정표 ----
const BOARD = { len: 1.7, h: 0.36, depth: 0.05, post: 2.5, topY: 2.12, step: 0.4 };
const BOARD_COLORS = { fire: '#e0703a', interview: '#4f7cc2', laundry: '#4aa6a0', fortune: '#d9a23a', shredder: '#c2484a' };

function atlasTexture(boards) {
  const rowW = 1000;
  const rowH = 207;
  return liveSignTexture(() => {
    const { canvas, g } = signCanvas(rowW, rowH * boards.length);
    boards.forEach((b, r) => {
      const y0 = r * rowH;
      g.fillStyle = '#f4e6c3';
      g.fillRect(0, y0, rowW, rowH);
      g.fillStyle = BOARD_COLORS[b.id] ?? '#8a5f3a';
      g.fillRect(0, y0, 54, rowH);
      g.strokeStyle = '#8a5f3a';
      g.lineWidth = 8;
      g.strokeRect(4, y0 + 4, rowW - 8, rowH - 8);
      drawSignText(g, b.label, { x: 54 + (rowW - 54) / 2, y: y0 + rowH / 2 + 4, maxW: rowW - 54 - 70, size: 138, color: '#3d2412', face: 'stall', minPx: 30, shadow: 'rgba(255,248,225,0.7)', shadowOff: 3 });
    });
    return canvas;
  });
}

export function buildSignpost(scene, signpost, { rng = mulberry32((SEED ^ 0x51a9) >>> 0) } = {}) {
  const wood = [];
  const decals = [];
  const tint = (g, hex) => {
    const g2 = g.index ? g.toNonIndexed() : g;
    const n = g2.attributes.position.count;
    const c = [];
    for (let i = 0; i < n; i++) c.push(...rgb(hex));
    g2.setAttribute('color', new THREE.Float32BufferAttribute(c, 3));
    g2.deleteAttribute('uv');
    return g2;
  };
  const boards = signpost.boards;
  wood.push(tint(new THREE.CylinderGeometry(0.075, 0.095, BOARD.post, 10).translate(0, BOARD.post / 2, 0), 0x7a5230));
  wood.push(tint(new THREE.SphereGeometry(0.1, 10, 6).translate(0, BOARD.post + 0.03, 0), 0x6a4527));
  wood.push(tint(new THREE.CylinderGeometry(0.3, 0.36, 0.1, 12).translate(0, 0.04, 0), 0x9d978a)); // 받침 돌무더기
  const tex = atlasTexture(boards);
  const n = boards.length;
  boards.forEach((b, i) => {
    const L = BOARD.len;
    const hh = BOARD.h / 2;
    const shape = new THREE.Shape();
    shape.moveTo(-0.12, -hh); shape.lineTo(L - 0.2, -hh); shape.lineTo(L, 0); shape.lineTo(L - 0.2, hh); shape.lineTo(-0.12, hh); shape.closePath();
    const body = new THREE.ExtrudeGeometry(shape, { depth: BOARD.depth, bevelEnabled: false });
    body.translate(0, 0, -BOARD.depth / 2);
    const y = BOARD.topY - i * BOARD.step;
    const yaw = -b.heading + rand(rng, -0.05, 0.05);
    const dw = L - 0.34;
    const dh = BOARD.h - 0.06;
    const v1 = 1 - i / n - 0.002;
    const v0 = 1 - (i + 1) / n + 0.002;
    for (const side of [1, -1]) {
      const p = new THREE.PlaneGeometry(dw, dh);
      const uv = p.attributes.uv;
      for (let k = 0; k < uv.count; k++) uv.setXY(k, uv.getX(k), v0 + uv.getY(k) * (v1 - v0));
      if (side < 0) p.rotateY(Math.PI);
      p.translate(0.04 + dw / 2, 0, side * (BOARD.depth / 2 + 0.003));
      p.rotateY(yaw); p.translate(0, y, 0);
      decals.push(p);
    }
    const nb = tint(body, 0xb98a56);
    nb.rotateY(yaw); nb.translate(0, y, 0);
    wood.push(nb);
    // 팔(기둥에서 판까지 이어 주는 짧은 나무 줄)은 판 뒤쪽 두께로 갈음한다.
  });
  const woodMesh = new THREE.Mesh(mergeGeometries(wood), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0 }));
  woodMesh.castShadow = true;
  woodMesh.receiveShadow = true;
  const decalMesh = new THREE.Mesh(mergeGeometries(decals), new THREE.MeshBasicMaterial({
    map: tex, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
  }));
  const group = new THREE.Group();
  group.name = 'signpost';
  group.add(woodMesh, decalMesh);
  group.position.set(signpost.x, 0, signpost.z);
  scene.add(group);
  return { group, drawCalls: 2 };
}

// main.js 가 한 줄로 부른다: 계획 -> 바닥 길 -> 이정표. 계획을 돌려준다(시험·디버그용).
export function buildGuidePaths(scene, layout) {
  const plan = buildPathPlan(layout);
  const ground = buildGroundPaths(scene, plan, layout);
  return { plan, ground, signpost: null }; // 가운데 이정표는 쓰지 않는다
}
