// 브라우저 전용: 소각 미니게임(같은 3D 씬 안). 고정 카메라, 불, 파쇄기 자리표시자, 종이 트레이와 종이 1장.
// update(dt) 가 true 를 돌려주는 동안 카메라는 이 모듈이 맡는다(월드 궤도 카메라는 건드리지 않는다).
import * as THREE from 'three';
import { BURN, STRESS } from './config.js';
import { StressMeter } from './logic/stress.js';
import { isInFireZone, shakeOffset, easeInOut } from './logic/burn.js';

const FIRE_CONES = [ // 반지름, 높이, 색, x/z 오프셋
  { r: 0.8, h: 1.8, color: 0xff5a14, x: 0, z: 0 },
  { r: 0.55, h: 1.4, color: 0xff9a1e, x: 0.35, z: 0.15 },
  { r: 0.4, h: 1.1, color: 0xffe066, x: -0.3, z: -0.12 },
];
const WHITE = new THREE.Color(0xffffff);
const BURN_TINT = new THREE.Color(0xff7a2a);
const MAX_DRAG = 9; // 소각로 중심에서 이만큼 넘게 끌 수 없다.
const MAX_TILT = 0.5;

function paperTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 192;
  canvas.height = 256;
  const g = canvas.getContext('2d');
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, canvas.width, canvas.height);
  g.fillStyle = '#8a8a98';
  g.fillRect(20, 24, 70, 12); // 제목
  g.fillStyle = '#b8b8c4';
  for (let y = 60; y < 230; y += 20) g.fillRect(20, y, y % 40 === 0 ? 150 : 120, 7);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

// getReturnPose(): 나갈 때 돌아갈 월드 카메라 자세 { position, target } (Vector3).
// onExit: "나가기" 버튼을 눌렀을 때 호출(실제 종료는 main 이 exit() 를 불러 한다).
export function createBurnGame({ scene, camera, renderer, hud, furnace, getReturnPose, onExit = () => {} }) {
  const meter = new StressMeter(STRESS);
  const fire = { x: furnace.x, z: furnace.z, radius: BURN.fireRadius };
  const burnPose = {
    position: new THREE.Vector3(furnace.x + BURN.camOffset[0], BURN.camOffset[1], furnace.z + BURN.camOffset[2]),
    target: new THREE.Vector3(furnace.x + BURN.lookOffset[0], BURN.lookOffset[1], furnace.z + BURN.lookOffset[2]),
  };
  const trayPos = new THREE.Vector3(furnace.x + BURN.trayOffset[0], 0, furnace.z + BURN.trayOffset[2]);
  const el = renderer.domElement;
  const raycaster = new THREE.Raycaster();
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -BURN.paperY);
  const ndc = new THREE.Vector2();
  const hitPoint = new THREE.Vector3();

  let phase = 'idle'; // 'idle' | 'in'(카메라 이동 중) | 'active' | 'out'(월드로 돌아가는 중)
  let time = 0;
  let glideT = 0;
  const fromPos = new THREE.Vector3();
  const fromTarget = new THREE.Vector3();
  const curPos = new THREE.Vector3();
  const curTarget = new THREE.Vector3();
  let shakeT = -1; // 흔들림 경과 초(-1 이면 없음)
  let flareT = -1; // 불 커짐 경과 초(-1 이면 없음)

  let props = null; // { root, fireGroup, cones, light, texture, paper }
  let paper = null; // 남아 있는 종이(없으면 null)
  let dragging = false;
  const dragOffset = new THREE.Vector3();
  let burnT = -1; // 소각 연출 경과 초(-1 이면 아님)
  const prevPaperPos = new THREE.Vector3();

  function buildProps() {
    const root = new THREE.Group();
    const cones = FIRE_CONES.map((c, i) => {
      const geo = new THREE.ConeGeometry(c.r, c.h, 12);
      geo.translate(0, c.h / 2, 0);
      const mat = new THREE.MeshBasicMaterial({ color: c.color, transparent: true, opacity: 0.88, toneMapped: false, depthWrite: false });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(c.x, 0, c.z);
      mesh.userData.phase = i * 2.1;
      return mesh;
    });
    const fireGroup = new THREE.Group();
    fireGroup.add(...cones);
    fireGroup.position.set(furnace.x, 0.3, furnace.z);
    const light = new THREE.PointLight(0xff9a4a, 3, 9);
    light.position.set(furnace.x, 1.2, furnace.z);

    // 파쇄기 자리표시자(이번 단계에서는 보여 주기만 한다).
    const shredder = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.0, 0.8), new THREE.MeshStandardMaterial({ color: 0x777788, emissive: 0x2a2a36 }));
    body.position.y = 0.5;
    body.castShadow = true;
    const slot = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.04, 0.14), new THREE.MeshStandardMaterial({ color: 0x15151f }));
    slot.position.y = 1.01;
    shredder.add(body, slot);
    shredder.position.set(furnace.x + BURN.shredderOffset[0], 0, furnace.z + BURN.shredderOffset[2]);
    shredder.rotation.y = Math.atan2(burnPose.position.x - shredder.position.x, burnPose.position.z - shredder.position.z); // 카메라 쪽을 본다

    const tray = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.06, 1.6), new THREE.MeshStandardMaterial({ color: 0xc8a26a }));
    tray.position.set(trayPos.x, 0.03, trayPos.z);
    tray.receiveShadow = true;

    const texture = paperTexture();
    const paperMesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.9, 0.02, 1.2),
      new THREE.MeshStandardMaterial({ map: texture, color: 0xffffff, emissive: 0x555555 }),
    );
    paperMesh.position.set(trayPos.x, BURN.paperY, trayPos.z);
    paperMesh.castShadow = true;
    paperMesh.userData.item = { ...BURN.item };

    root.add(fireGroup, light, shredder, tray, paperMesh);
    scene.add(root);
    return { root, fireGroup, cones, light, texture, paper: paperMesh };
  }

  function disposeProps() {
    scene.remove(props.root);
    props.root.traverse((o) => {
      if (!o.isMesh) return;
      o.geometry.dispose();
      o.material.dispose();
    });
    props.texture.dispose();
    props = null;
    paper = null;
  }

  function setRay(e) {
    const rect = el.getBoundingClientRect();
    ndc.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
  }

  function onPointerDown(e) {
    if (e.button !== 0 || phase !== 'active' || !paper || burnT >= 0) return;
    setRay(e);
    if (!raycaster.intersectObject(paper, false).length) return;
    if (!raycaster.ray.intersectPlane(plane, hitPoint)) return;
    dragging = true;
    dragOffset.set(paper.position.x - hitPoint.x, 0, paper.position.z - hitPoint.z);
    el.setPointerCapture(e.pointerId);
  }

  function onPointerMove(e) {
    if (!dragging || !paper) return;
    setRay(e);
    if (!raycaster.ray.intersectPlane(plane, hitPoint)) return;
    let x = hitPoint.x + dragOffset.x - furnace.x;
    let z = hitPoint.z + dragOffset.z - furnace.z;
    const d = Math.hypot(x, z);
    if (d > MAX_DRAG) { x *= MAX_DRAG / d; z *= MAX_DRAG / d; }
    paper.position.x = furnace.x + x;
    paper.position.z = furnace.z + z;
  }

  // 놓는다: 불 구역 안이면 소각, 아니면 그 자리에 둔다.
  function endDrag() {
    if (!dragging) return;
    dragging = false;
    if (paper && isInFireZone(paper.position, fire)) startBurn();
  }

  function startBurn() {
    burnT = 0;
    flareT = 0;
    shakeT = 0;
    meter.reduce(paper.userData.item.reduce);
    hud.updateStressBar(meter.value);
  }

  function updateProps(dt) {
    // 불 깜빡임: 원뿔마다 위상이 다른 사인 합. 소각 직후에는 잠깐 커진다.
    let flare = 1;
    if (flareT >= 0) {
      flare = 1 + (BURN.flare - 1) * (1 - easeInOut(flareT / BURN.flareSec));
      flareT += dt;
      if (flareT >= BURN.flareSec) flareT = -1;
    }
    for (const cone of props.cones) {
      const p = cone.userData.phase;
      const n = 0.5 * Math.sin(time * 9 + p) + 0.3 * Math.sin(time * 17 + p * 1.7) + 0.2 * Math.sin(time * 31 + p * 0.6);
      cone.scale.set(1 + 0.08 * n, 1 + 0.22 * n, 1 + 0.08 * n);
    }
    props.fireGroup.scale.setScalar(flare);
    props.light.intensity = 3 * flare * (1 + 0.15 * Math.sin(time * 13) + 0.1 * Math.sin(time * 23 + 1));

    if (!paper) return;
    if (burnT >= 0) {
      burnT += dt;
      const k = Math.min(1, burnT / BURN.burnSec);
      paper.material.color.lerpColors(WHITE, BURN_TINT, easeInOut(Math.min(1, k * 2)));
      paper.material.emissive.copy(BURN_TINT).multiplyScalar(0.6 * k);
      paper.scale.setScalar(Math.max(0, 1 - easeInOut(k)));
      if (k >= 1) {
        props.root.remove(paper);
        paper.geometry.dispose();
        paper.material.dispose();
        paper = null;
      }
      return;
    }
    // 들고 있으면 y 는 평면 높이, 놓으면 둥실. 움직임에 따라 기울어진다.
    paper.position.y = BURN.paperY + (dragging ? 0 : 0.06 * Math.sin(time * 2));
    const vx = dt > 0 ? (paper.position.x - prevPaperPos.x) / dt : 0;
    const vz = dt > 0 ? (paper.position.z - prevPaperPos.z) / dt : 0;
    const tiltX = THREE.MathUtils.clamp(vz * 0.05, -MAX_TILT, MAX_TILT);
    const tiltZ = THREE.MathUtils.clamp(-vx * 0.05, -MAX_TILT, MAX_TILT);
    const s = 1 - Math.exp(-12 * dt);
    paper.rotation.x += (tiltX - paper.rotation.x) * s;
    paper.rotation.z += (tiltZ - paper.rotation.z) * s;
    prevPaperPos.copy(paper.position);
  }

  function startGlide() {
    glideT = 0;
    fromPos.copy(curPos);
    fromTarget.copy(curTarget);
  }

  return {
    enter() {
      if (phase === 'in' || phase === 'active') return;
      if (phase === 'idle') {
        curPos.copy(camera.position);
        curTarget.copy(getReturnPose().target);
      }
      props = buildProps();
      paper = props.paper;
      prevPaperPos.copy(paper.position);
      burnT = -1;
      flareT = -1;
      shakeT = -1;
      dragging = false;
      time = 0;
      startGlide();
      phase = 'in';
      el.addEventListener('pointerdown', onPointerDown);
      el.addEventListener('pointermove', onPointerMove);
      el.addEventListener('pointerup', endDrag);
      el.addEventListener('pointercancel', endDrag);
      hud.showStressBar(meter.value, meter.start, meter.goal);
      hud.showExit(() => onExit());
    },
    exit() {
      if (phase !== 'in' && phase !== 'active') return;
      el.removeEventListener('pointerdown', onPointerDown);
      el.removeEventListener('pointermove', onPointerMove);
      el.removeEventListener('pointerup', endDrag);
      el.removeEventListener('pointercancel', endDrag);
      dragging = false;
      disposeProps();
      hud.hideStressBar();
      hud.hideExit();
      meter.reset(); // 다음에 들어오면 새 판
      shakeT = -1;
      startGlide();
      phase = 'out';
    },
    // 카메라를 이 모듈이 맡고 있으면 true(그 프레임에 월드 궤도 카메라는 건드리지 않는다).
    update(dt) {
      if (phase === 'idle') return false;
      time += dt;
      if (phase === 'in' || phase === 'out') {
        glideT += dt / BURN.glideSec;
        const to = phase === 'in' ? burnPose : getReturnPose();
        const e = easeInOut(glideT);
        curPos.lerpVectors(fromPos, to.position, e);
        curTarget.lerpVectors(fromTarget, to.target, e);
        if (glideT >= 1) {
          if (phase === 'out') { phase = 'idle'; return false; }
          phase = 'active';
        }
      }
      camera.position.copy(curPos);
      camera.lookAt(curTarget);
      if (shakeT >= 0) {
        const o = shakeOffset(shakeT, BURN.shakeSec, BURN.shakeAmp);
        camera.translateX(o.x);
        camera.translateY(o.y);
        shakeT += dt;
        if (shakeT >= BURN.shakeSec) shakeT = -1;
      }
      if (props) updateProps(dt);
      return true;
    },
    isActive: () => phase === 'in' || phase === 'active',
    // 현재(흔들림 제외) 카메라 자세 { position, target }. 가림 나무 판정의 타깃으로 쓴다.
    cameraPose: () => ({ position: curPos, target: curTarget }),
  };
}
