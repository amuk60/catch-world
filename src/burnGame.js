// 브라우저 전용: 소각 미니게임(같은 3D 씬 안). 고정 카메라, 불, 파쇄기, 종이 트레이와 종이 큐(gameState).
// update(dt) 가 true 를 돌려주는 동안 카메라는 이 모듈이 맡는다(월드 궤도 카메라는 건드리지 않는다).
// 스트레스 지수와 진행은 전역 gameState 가 가진다. 이 모듈은 gameState 메서드를 부르고 HUD 만 갱신한다.
import * as THREE from 'three';
import { BURN } from './config.js';
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
const STRIP_MAX = 8; // 동시에 살아 있는 파쇄 조각 최대 수
const STRIP_LIFE = 0.6; // 조각이 사라지기까지(초)
const STRIPS_PER_TAP = 3;

// 종이 종류별 모양: 바탕색, 줄 색, 위쪽 띠 색(없으면 null), 제목 막대 색(없으면 null).
const PAPER_LOOK = {
  resume: { bg: '#ffffff', line: '#b8b8c4', strip: null, title: '#8a8a98' },
  notice: { bg: '#ffdcd8', line: '#e0aaa4', strip: '#d9463b', title: null },
  coverLetter: { bg: '#d8e8ff', line: '#7aa4e6', strip: null, title: '#4f7fcf' },
};

// 라벨을 크게 그린 종이 무늬(384x512, 종이 비율 3:4). 라벨이 종이 폭의 대부분을 차지한다.
function paperTexture(item) {
  const look = PAPER_LOOK[item.type];
  const canvas = document.createElement('canvas');
  canvas.width = 384;
  canvas.height = 512;
  const g = canvas.getContext('2d');
  g.fillStyle = look.bg;
  g.fillRect(0, 0, canvas.width, canvas.height);
  if (look.strip) {
    g.fillStyle = look.strip;
    g.fillRect(0, 0, canvas.width, 64);
  }
  if (look.title) {
    g.fillStyle = look.title;
    g.fillRect(40, 28, 130, 14);
  }
  g.fillStyle = look.line;
  for (let i = 0; i < 8; i++) g.fillRect(40, 200 + i * 38, i % 2 ? 240 : 304, 12);
  g.fillStyle = '#22223a';
  g.font = 'bold 64px "Malgun Gothic", sans-serif';
  const fit = Math.min(1, (canvas.width - 40) / g.measureText(item.label).width); // 긴 라벨은 종이 폭에 맞춰 줄인다
  if (fit < 1) g.font = `bold ${Math.floor(64 * fit)}px "Malgun Gothic", sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(item.label, canvas.width / 2, 128);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

// getReturnPose(): 나갈 때 돌아갈 월드 카메라 자세 { position, target } (Vector3).
// onExit: "나가기" 버튼을 눌렀을 때 호출(실제 종료는 main 이 exit() 를 불러 한다).
// onClear: 어느 동작이든 그 감소로 처음 목표치 이하가 됐을 때 한 번 호출.
export function createBurnGame({ scene, camera, renderer, hud, furnace, gameState, getReturnPose, onExit = () => {}, onClear = () => {} }) {
  const fire = { x: furnace.x, z: furnace.z, radius: BURN.fireRadius };
  const burnPose = {
    position: new THREE.Vector3(furnace.x + BURN.camOffset[0], BURN.camOffset[1], furnace.z + BURN.camOffset[2]),
    target: new THREE.Vector3(furnace.x + BURN.lookOffset[0], BURN.lookOffset[1], furnace.z + BURN.lookOffset[2]),
  };
  const trayPos = new THREE.Vector3(furnace.x + BURN.trayOffset[0], 0, furnace.z + BURN.trayOffset[2]);
  const shredPos = new THREE.Vector3(furnace.x + BURN.shredderOffset[0], 0, furnace.z + BURN.shredderOffset[2]);
  const shredZone = { x: shredPos.x, z: shredPos.z, radius: BURN.shredZoneRadius }; // isInFireZone 과 같은 수평 거리 판정
  const paperYaw = Math.atan2(burnPose.position.x - trayPos.x, burnPose.position.z - trayPos.z); // 라벨이 카메라에서 바로 읽히게
  const el = renderer.domElement;
  const raycaster = new THREE.Raycaster();
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -BURN.paperY);
  const ndc = new THREE.Vector2();
  const hitPoint = new THREE.Vector3();
  const hintPoint = new THREE.Vector3();

  let phase = 'idle'; // 'idle' | 'in'(카메라 이동 중) | 'active' | 'out'(월드로 돌아가는 중)
  let time = 0;
  let glideT = 0;
  const fromPos = new THREE.Vector3();
  const fromTarget = new THREE.Vector3();
  const curPos = new THREE.Vector3();
  const curTarget = new THREE.Vector3();
  let shakeT = -1; // 흔들림 경과 초(-1 이면 없음)
  let flareT = -1; // 불 커짐 경과 초(-1 이면 없음)

  let props = null; // { root, fireGroup, cones, light, shredder, stripGeo }
  let paper = null; // 트레이 쪽에 있는 종이(없으면 null)
  let dragging = false;
  const dragOffset = new THREE.Vector3();
  let burnT = -1; // 소각 연출 경과 초(-1 이면 아님)
  let loadT = -1; // 파쇄기 슬롯으로 들어가는 연출 경과 초
  let returnT = -1; // 트레이로 돌아가는 연출 경과 초
  const returnFrom = new THREE.Vector3();
  const loadFrom = new THREE.Vector3();
  const slotPos = new THREE.Vector3();
  let spawnIn = -1; // 다음 종이가 나오기까지 남은 초(-1 이면 대기 없음)
  let wiggleT = -1; // 파쇄기 흔들림 경과 초
  let hintOn = false; // 파쇄 안내 말풍선이 떠 있는가
  const strips = []; // 파쇄 조각 { mesh, vel, age }
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

    // 파쇄기.
    const shredder = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.0, 0.8), new THREE.MeshStandardMaterial({ color: 0x777788, emissive: 0x2a2a36 }));
    body.position.y = 0.5;
    body.castShadow = true;
    const slot = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.04, 0.14), new THREE.MeshStandardMaterial({ color: 0x15151f }));
    slot.position.y = 1.01;
    shredder.add(body, slot);
    shredder.position.copy(shredPos);
    shredder.rotation.y = Math.atan2(burnPose.position.x - shredder.position.x, burnPose.position.z - shredder.position.z); // 카메라 쪽을 본다

    const tray = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.06, 1.6), new THREE.MeshStandardMaterial({ color: 0xc8a26a }));
    tray.position.set(trayPos.x, 0.03, trayPos.z);
    tray.receiveShadow = true;

    root.add(fireGroup, light, shredder, tray);
    scene.add(root);
    return { root, fireGroup, cones, light, shredder, stripGeo: new THREE.BoxGeometry(0.05, 0.012, 0.3) };
  }

  // 종이 한 장(얇은 상자 + 라벨 무늬)을 트레이 위에 올린다.
  function spawnPaper(item) {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(1.05, 0.02, 1.4),
      new THREE.MeshStandardMaterial({ map: paperTexture(item), color: 0xffffff, emissive: 0x555555 }),
    );
    mesh.rotation.order = 'XZY'; // 돌림(y)은 종이 기준, 기울임(x, z)은 월드 기준
    mesh.rotation.y = paperYaw;
    mesh.position.set(trayPos.x, BURN.paperY, trayPos.z);
    mesh.castShadow = true;
    mesh.userData.item = item;
    props.root.add(mesh);
    paper = mesh;
    prevPaperPos.copy(mesh.position);
  }

  function disposeMesh(o) {
    o.geometry.dispose();
    o.material.map?.dispose();
    o.material.dispose();
  }

  function removePaper() {
    props.root.remove(paper);
    disposeMesh(paper);
    paper = null;
    burnT = loadT = returnT = -1;
  }

  // 큐의 지금 종이를 낸다(큐가 끝났거나 자소서가 파쇄기에 들어 있으면 아무것도 하지 않는다).
  function trySpawn() {
    if (!props || paper) return;
    const item = gameState.currentPaper();
    if (item) spawnPaper(item);
  }

  function disposeProps() {
    scene.remove(props.root);
    props.root.traverse((o) => { if (o.isMesh) disposeMesh(o); });
    props.stripGeo.dispose();
    strips.length = 0;
    props = null;
    paper = null;
  }

  function setRay(e) {
    const rect = el.getBoundingClientRect();
    ndc.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
  }

  function onPointerDown(e) {
    if (e.button !== 0 || phase !== 'active') return;
    setRay(e);
    if (gameState.shredder.loaded) { // 파쇄 중에는 파쇄기를 클릭(연타)한다.
      if (raycaster.intersectObject(props.shredder, true).length) tapShredder();
      return;
    }
    if (!paper || burnT >= 0 || loadT >= 0 || returnT >= 0) return;
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

  // 놓는다: 소각 종이는 불 구역, 자소서는 파쇄기 구역에서만 받아들이고, 그 밖에는 트레이로 돌아간다.
  function endDrag() {
    if (!dragging) return;
    dragging = false;
    if (!paper) return;
    const { action } = paper.userData.item;
    if (action === 'burn' && isInFireZone(paper.position, fire)) startBurn();
    else if (action === 'shred' && isInFireZone(paper.position, shredZone)) startLoad();
    else {
      returnT = 0;
      returnFrom.copy(paper.position);
    }
  }

  // 지수를 줄인 결과를 HUD 에 반영하고, 처음 목표치 이하가 됐으면 알린다.
  function applyResult({ value, justCleared }) {
    hud.updateStressBar(value);
    if (justCleared) onClear();
  }

  function startBurn() {
    burnT = 0;
    flareT = 0;
    shakeT = 0;
    applyResult(gameState.completeBurn(paper.userData.item));
  }

  // 자소서를 파쇄기에 넣는다: 슬롯으로 미끄러져 들어가 사라지고 안내 말풍선이 뜬다.
  function startLoad() {
    loadT = 0;
    loadFrom.copy(paper.position);
    props.shredder.updateWorldMatrix(true, false);
    props.shredder.localToWorld(slotPos.set(0, 1.05, 0));
    gameState.loadShredder(paper.userData.item);
    showHint();
  }

  function hintText() {
    return `파쇄 중! 연타! (${gameState.shredder.remaining}번 남음)`;
  }

  function showHint() {
    hintOn = true;
    hud.showShredHint(hintText());
  }

  // 파쇄기 클릭 한 번: 지수 -1, 흔들림, 조각 몇 개. 마지막 탭이면 이 자소서는 끝.
  function tapShredder() {
    const result = gameState.tapShredder();
    if (!result.reduced) return;
    wiggleT = 0;
    spawnStrips();
    if (result.done) {
      hintOn = false;
      hud.hideShredHint();
      spawnIn = BURN.nextPaperSec;
    } else {
      hud.showShredHint(hintText());
    }
    applyResult(result);
  }

  function spawnStrips() {
    const yaw = props.shredder.rotation.y;
    props.shredder.updateWorldMatrix(true, false);
    for (let i = 0; i < STRIPS_PER_TAP; i++) {
      if (strips.length >= STRIP_MAX) removeStrip(0);
      const mesh = new THREE.Mesh(props.stripGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true }));
      props.shredder.localToWorld(mesh.position.set((Math.random() - 0.5) * 0.8, 1.0, 0.1));
      mesh.rotation.y = yaw + (Math.random() - 0.5) * 0.6;
      props.root.add(mesh);
      // 슬롯 위로 살짝 튀었다가 카메라 쪽으로 떨어진다.
      const vel = new THREE.Vector3((Math.random() - 0.5) * 0.8, 1.2 + Math.random() * 0.8, 0.5 + Math.random() * 0.8);
      vel.applyAxisAngle(THREE.Object3D.DEFAULT_UP, yaw);
      strips.push({ mesh, vel, age: 0 });
    }
  }

  function removeStrip(i) {
    const [s] = strips.splice(i, 1);
    props.root.remove(s.mesh);
    s.mesh.material.dispose();
  }

  function updateShredder(dt) {
    if (wiggleT >= 0) {
      wiggleT += dt;
      const k = Math.min(1, wiggleT / BURN.wiggleSec);
      const pulse = Math.sin(Math.PI * k);
      props.shredder.scale.setScalar(1 + 0.1 * pulse);
      props.shredder.rotation.z = 0.07 * pulse * (gameState.shredder.remaining % 2 ? 1 : -1);
      if (k >= 1) wiggleT = -1;
    }
    for (let i = strips.length - 1; i >= 0; i--) {
      const s = strips[i];
      s.age += dt;
      if (s.age >= STRIP_LIFE) { removeStrip(i); continue; }
      s.vel.y -= 9 * dt;
      s.mesh.position.addScaledVector(s.vel, dt);
      s.mesh.material.opacity = 1 - (s.age / STRIP_LIFE) ** 2;
    }
    if (hintOn) { // 파쇄기 위 한 점을 화면 좌표로(말풍선과 같은 방식).
      camera.updateMatrixWorld();
      hintPoint.set(shredPos.x, 1.7, shredPos.z).project(camera);
      hud.positionShredHint((hintPoint.x * 0.5 + 0.5) * el.clientWidth, (-hintPoint.y * 0.5 + 0.5) * el.clientHeight);
    }
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

    updateShredder(dt);
    // 한 장을 끝낸 뒤 잠깐 기다렸다가 다음 종이.
    if (spawnIn >= 0 && !paper) {
      spawnIn -= dt;
      if (spawnIn < 0) { spawnIn = -1; trySpawn(); }
    }

    if (!paper) return;
    if (burnT >= 0) {
      burnT += dt;
      const k = Math.min(1, burnT / BURN.burnSec);
      paper.material.color.lerpColors(WHITE, BURN_TINT, easeInOut(Math.min(1, k * 2)));
      paper.material.emissive.copy(BURN_TINT).multiplyScalar(0.6 * k);
      paper.scale.setScalar(Math.max(0, 1 - easeInOut(k)));
      if (k >= 1) {
        removePaper();
        spawnIn = BURN.nextPaperSec;
      }
      return;
    }
    if (loadT >= 0) {
      loadT += dt;
      const k = Math.min(1, loadT / BURN.loadSec);
      paper.position.lerpVectors(loadFrom, slotPos, easeInOut(k));
      paper.scale.setScalar(1 - 0.9 * easeInOut(k));
      if (k >= 1) removePaper(); // 다음 종이는 파쇄가 끝난 뒤에 나온다.
      return;
    }
    if (returnT >= 0) { // 잘못 놓았다: 트레이로 미끄러져 돌아간다.
      returnT += dt;
      const k = easeInOut(returnT / BURN.returnSec);
      paper.position.set(
        returnFrom.x + (trayPos.x - returnFrom.x) * k,
        BURN.paperY,
        returnFrom.z + (trayPos.z - returnFrom.z) * k,
      );
      if (returnT >= BURN.returnSec) returnT = -1;
    } else {
      // 들고 있으면 y 는 평면 높이, 놓으면 둥실.
      paper.position.y = BURN.paperY + (dragging ? 0 : 0.06 * Math.sin(time * 2));
    }
    // 움직임에 따라 기울어진다.
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
      burnT = loadT = returnT = -1;
      flareT = -1;
      shakeT = -1;
      wiggleT = -1;
      spawnIn = -1;
      hintOn = false;
      dragging = false;
      time = 0;
      trySpawn(); // 큐의 지금 종이. 이미 끝낸 종이는 다시 나오지 않는다.
      if (gameState.shredder.loaded) showHint(); // 파쇄 중이던 자소서의 남은 횟수
      startGlide();
      phase = 'in';
      el.addEventListener('pointerdown', onPointerDown);
      el.addEventListener('pointermove', onPointerMove);
      el.addEventListener('pointerup', endDrag);
      el.addEventListener('pointercancel', endDrag);
      hud.showExit(() => onExit());
    },
    exit() {
      if (phase !== 'in' && phase !== 'active') return;
      el.removeEventListener('pointerdown', onPointerDown);
      el.removeEventListener('pointermove', onPointerMove);
      el.removeEventListener('pointerup', endDrag);
      el.removeEventListener('pointercancel', endDrag);
      dragging = false;
      hintOn = false;
      disposeProps();
      hud.hideShredHint();
      hud.hideExit();
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
