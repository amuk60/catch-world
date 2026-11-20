// 브라우저 전용: 소원 조각상 발치의 소원 돌탑. 납작한 돌을 위로 쌓고(놓임새는 logic/wish.js 의 stoneAt), 새 돌은 위에서 살짝 내려앉는다.
// 돌 개수는 이 브라우저의 localStorage 에 기억한다(소원 글은 저장하지 않는다). 저장소를 못 쓰면 이번 방문 동안만 쌓인다.
import * as THREE from 'three';
import { stoneAt, parseStoneCount } from './logic/wish.js';

const STONE_COLORS = [0x9a9a92, 0xa8a59b, 0x8c8a84, 0xb3afa4, 0x96938a, 0xa19d92];
const DROP_SECONDS = 0.45;
const DROP_HEIGHT = 0.45;

export function loadStoneCount(key, max) {
  try { return parseStoneCount(localStorage.getItem(key), max); } catch { return 0; }
}
export function saveStoneCount(key, count) {
  try { localStorage.setItem(key, String(count)); } catch { /* 저장소를 못 써도 이번 방문에는 쌓인다 */ }
}

// 납작한 돌 하나(살짝 찌그러진 낮은 다면체: 결정적 흔들림).
function stoneGeometry(i) {
  const geo = new THREE.CylinderGeometry(1, 1, 1, 9, 1);
  const p = geo.attributes.position;
  for (let k = 0; k < p.count; k++) {
    const x = p.getX(k);
    const y = p.getY(k);
    const z = p.getZ(k);
    const a = Math.atan2(z, x);
    const r = 1 + 0.12 * Math.sin(a * 3 + i * 1.9) + 0.06 * Math.cos(a * 5 + i);
    const round = y > 0 ? 0.82 : 0.92; // 윗면이 좀 더 작아 둥근 돌처럼 보인다
    p.setXYZ(k, x * r * round, y, z * r * round);
  }
  geo.computeVertexNormals();
  return geo;
}

// root: 마당 그룹, spot: { x, z } 돌탑 자리, max: 최대 개수, count: 처음 개수.
export function createWishStones(root, spot, { max, count = 0 } = {}) {
  const group = new THREE.Group();
  group.position.set(spot.x, 0, spot.z);
  root.add(group);
  const stones = [];
  for (let i = 0; i < max; i++) {
    const s = stoneAt(i, { levels: max });
    const mesh = new THREE.Mesh(stoneGeometry(i), new THREE.MeshStandardMaterial({ color: STONE_COLORS[i % STONE_COLORS.length], roughness: 0.95, flatShading: true }));
    mesh.scale.set(s.radius, s.height, s.radius * 0.85);
    mesh.position.set(s.dx, s.y + s.height / 2 + 0.005, s.dz);
    mesh.rotation.y = s.rotY;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.visible = false;
    mesh.userData.restY = mesh.position.y;
    group.add(mesh);
    stones.push(mesh);
  }
  let shown = 0;
  let drop = null; // { mesh, t }
  const show = (n) => { shown = Math.max(0, Math.min(max, n)); stones.forEach((m, i) => { m.visible = i < shown; m.position.y = m.userData.restY; }); };
  show(count);

  return {
    group,
    get count() { return shown; },
    // 맨 위 높이(반짝임·말풍선 위치용).
    topY() { const s = stoneAt(Math.max(0, shown - 1), { levels: max }); return shown ? s.y + s.height : 0; },
    // n 개로 맞춘다. animate 면 새로 생긴 맨 위 돌이 위에서 내려앉는다.
    set(n, { animate = false } = {}) {
      const before = shown;
      show(n);
      if (animate && shown > before) {
        const mesh = stones[shown - 1];
        mesh.position.y = mesh.userData.restY + DROP_HEIGHT;
        drop = { mesh, t: 0 };
      }
    },
    update(dt) {
      if (!drop) return;
      drop.t += dt;
      const k = Math.min(1, drop.t / DROP_SECONDS);
      const fall = 1 - (1 - k) * (1 - k); // 처음엔 빠르게, 끝에서 사뿐히
      drop.mesh.position.y = drop.mesh.userData.restY + DROP_HEIGHT * (1 - fall);
      if (k >= 1) drop = null;
    },
  };
}
