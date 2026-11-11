// 브라우저 전용: 캐릭터 모델 + idle/walk 애니메이션.
import * as THREE from 'three';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { PLAYER_MODEL } from './config.js';
import { clipNameFor, findClip, FADE_SECONDS } from './logic/animation.js';

// gltf: loadGltf 결과. group 이 이동/회전되는 대상이고, 모델은 그 자식이다.
export function createPlayer(gltf) {
  const group = new THREE.Group();
  const model = clone(gltf.scene);
  model.scale.setScalar(PLAYER_MODEL.scale);
  model.rotation.y = THREE.MathUtils.degToRad(PLAYER_MODEL.facingOffsetDeg);
  model.traverse((o) => {
    if (o.isMesh) { o.castShadow = true; o.receiveShadow = false; }
  });
  group.add(model);

  const mixer = new THREE.AnimationMixer(model);
  const actions = {};
  for (const name of ['idle', 'walk']) {
    const clip = findClip(gltf.animations, name);
    if (clip) actions[name] = mixer.clipAction(clip);
  }
  let current = 'idle';
  actions.idle?.play();

  function setMoving(isMoving) {
    const next = clipNameFor(isMoving);
    if (next === current) return;
    const from = actions[current];
    const to = actions[next];
    current = next;
    if (!to) { from?.fadeOut(FADE_SECONDS); return; }
    to.reset().play();
    if (from) from.crossFadeTo(to, FADE_SECONDS, false);
  }

  return { group, setMoving, update: (dt) => mixer.update(dt) };
}
