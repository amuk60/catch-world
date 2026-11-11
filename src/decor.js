// 브라우저 전용: 배치 데이터로 장식을 만들어 씬에 넣는다. 같은 모델은 InstancedMesh 로 그린다.
import * as THREE from 'three';
import { COLORS } from './config.js';

// 그룹 이름 -> 그림자 던지기 여부
const GROUPS = {
  trees: true, bushes: false, rocks: true, lanterns: true, furnaceItems: true,
};

// Kenney 'grass'·'leafsDark' 재질은 원본 색이 청록(시안)에 가까워 초록 덤불·소나무가 청록으로 보인다. 재질 이름별로 초록으로 되돌린다.
const MATERIAL_TINTS = { grass: COLORS.bush, leafsDark: COLORS.pine };

const m = new THREE.Matrix4();
const q = new THREE.Quaternion();
const up = new THREE.Vector3(0, 1, 0);

export function buildDecor(scene, layout, models) {
  const root = new THREE.Group();

  for (const [group, castShadow] of Object.entries(GROUPS)) {
    // 이 그룹의 아이템을 모델별로 묶는다.
    const byModel = new Map();
    for (const it of layout[group]) {
      const key = `${it.pack}/${it.name}`;
      if (!models.get(key)) continue; // 로딩 실패한 모델은 조용히 건너뜀
      if (!byModel.has(key)) byModel.set(key, []);
      byModel.get(key).push(it);
    }

    for (const [key, items] of byModel) {
      const model = models.get(key);
      model.updateMatrixWorld(true);
      const rootInv = new THREE.Matrix4().copy(model.matrixWorld).invert();
      const instances = items.map((it) => new THREE.Matrix4().compose(
        new THREE.Vector3(it.x, 0, it.z),
        q.setFromAxisAngle(up, it.rotY),
        new THREE.Vector3(it.scale, it.scale, it.scale),
      ));

      model.traverse((obj) => {
        if (!obj.isMesh) return;
        // Kenney glb 재질은 metallic=1 이라 환경맵 없이는 검게 보인다. 비금속으로 되돌린다.
        for (const mat of [].concat(obj.material)) {
          mat.metalness = 0;
          if (MATERIAL_TINTS[mat.name] !== undefined) mat.color.setHex(MATERIAL_TINTS[mat.name]);
        }
        const local = new THREE.Matrix4().multiplyMatrices(rootInv, obj.matrixWorld);
        const mesh = new THREE.InstancedMesh(obj.geometry, obj.material, items.length);
        instances.forEach((inst, i) => mesh.setMatrixAt(i, m.multiplyMatrices(inst, local)));
        mesh.instanceMatrix.needsUpdate = true;
        mesh.castShadow = castShadow;
        mesh.receiveShadow = true;
        mesh.frustumCulled = false; // 인스턴스가 넓게 퍼져 있어 모델 하나의 경계로는 판정할 수 없다.
        root.add(mesh);
      });
    }
  }

  scene.add(root);
  return root;
}
