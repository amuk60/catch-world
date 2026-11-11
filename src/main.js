import * as THREE from 'three';
import { isMobileUA } from './env.js';
import { createStage } from './stage.js';
import { buildGround, buildBoundary, buildFurnace, buildPlayer, buildMarker } from './world.js';
import { createControls } from './controls.js';
import { ORBIT, YARD, PLAYER, FURNACE } from './config.js';
import { applyDrag, applyZoom, orbitPosition } from './logic/orbit.js';
import { clampToYard, stepToward, pushOutOfCircle, headingY } from './logic/movement.js';

if (isMobileUA(navigator.userAgent)) {
  document.getElementById('mobile-notice').style.display = 'flex';
} else {
  const { scene, camera, renderer, onFrame } = createStage(document.getElementById('game'));
  const ground = buildGround(scene);
  buildBoundary(scene);
  buildFurnace(scene);
  const player = buildPlayer(scene);
  const marker = buildMarker(scene);

  let orbit = { azimuthDeg: ORBIT.azimuthDeg, polarDeg: ORBIT.polarDeg, distance: ORBIT.distance };
  const targetPos = new THREE.Vector3(player.position.x, ORBIT.targetHeight, player.position.z);
  const desired = new THREE.Vector3();
  let moveTarget = null;
  const raycaster = new THREE.Raycaster();

  createControls(renderer.domElement, {
    onDrag: (dx, dy) => { orbit = applyDrag(orbit, dx, dy, ORBIT.rotateSpeed, ORBIT); },
    onWheel: (deltaY) => { orbit = applyZoom(orbit, deltaY, ORBIT.zoomStep, ORBIT); },
    onClick: (ndc) => {
      raycaster.setFromCamera(new THREE.Vector2(ndc.x, ndc.y), camera);
      const hit = raycaster.intersectObject(ground)[0];
      if (!hit) return;
      let p = clampToYard({ x: hit.point.x, z: hit.point.z }, YARD, PLAYER.radius + 0.5);
      p = pushOutOfCircle(p, PLAYER.radius, FURNACE);
      moveTarget = p;
      marker.position.set(p.x, 0.02, p.z);
      marker.visible = true;
    },
  });

  onFrame((dt) => {
    if (moveTarget) {
      const cur = { x: player.position.x, z: player.position.z };
      const next = stepToward(cur, moveTarget, PLAYER.speed, dt);
      if (Math.hypot(moveTarget.x - cur.x, moveTarget.z - cur.z) > 1e-3) {
        player.rotation.y = headingY(cur, moveTarget);
      }
      const pushed = pushOutOfCircle(next, PLAYER.radius, FURNACE);
      player.position.x = pushed.x;
      player.position.z = pushed.z;
      if (next.arrived) {
        moveTarget = null;
        marker.visible = false;
      }
    }

    const k = 1 - Math.exp(-ORBIT.followSpeed * dt);
    desired.set(player.position.x, ORBIT.targetHeight, player.position.z);
    targetPos.lerp(desired, k);
    camera.position.set(...orbitPosition(targetPos.toArray(), orbit));
    camera.lookAt(targetPos);
  });
}
