// 브라우저 전용: 행운의 쿠키 노점. 줄무늬 차양 + 나무 계산대 + 쿠키 바구니 + 전구 줄 + 흔들리는 쿠키 장식 + "오늘의 행운" 간판 + 떠 있는 쿠키 표시.
// 모두 코드로 만든 도형이고 같은 모양은 InstancedMesh 로 묶어 그린다(쿠키 18개·전구 12개·부스러기 10개가 각각 한 번의 그리기).
// 노점 좌표계: 로컬 x 가 가로, +z 가 앞(기본 카메라 쪽), 원점은 계산대 가운데 바닥. update(시간) 을 매 프레임 부른다.
import * as THREE from 'three';

const WOOD = 0x8a5a33;
const WOOD_DARK = 0x6b4a2f;
const WOOD_LIGHT = 0xc99a62;
const ORANGE = 0xf29a4a;
const CREAM = 0xfff0d6;
const COOKIE_COLORS = [0xe6a93c, 0x6b3d24, 0xf0a0b8, 0x9ec27a]; // 황금·초코·분홍·말차
const BULB_COLORS = [0xffe08a, 0xffb36b, 0xfff2c4, 0xffc4d6];
const BULB_COUNT = 12;
const COOKIE_COUNT = 18;
const CRUMB_COUNT = 10;
const CANOPY_TILT = 0.2;

// 포춘쿠키 모양: 납작한 공을 반으로 접은 듯 양 끝이 위로 휘고 가운데가 모인 형태. 반경 1 기준(가로 폭 2).
function cookieGeometry() {
  const g = new THREE.SphereGeometry(1, 14, 10);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i); let y = p.getY(i); let z = p.getZ(i);
    z *= 0.62; // 얇게
    y *= 0.55;
    y += 0.55 * x * x - 0.2; // 양 끝이 위로 휜다
    z *= 1 - 0.35 * Math.abs(x); // 양 끝이 가늘어진다
    p.setXYZ(i, x, y, z);
  }
  g.computeVertexNormals();
  return g;
}

function textTexture(w, h, draw) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  draw(canvas.getContext('2d'), w, h);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function signTexture() {
  return textTexture(1024, 300, (g, w, h) => {
    g.fillStyle = '#fff0d6';
    g.fillRect(0, 0, w, h);
    g.strokeStyle = '#d9803a';
    g.lineWidth = 16;
    g.strokeRect(8, 8, w - 16, h - 16);
    g.setLineDash([22, 14]);
    g.lineWidth = 5;
    g.strokeStyle = '#f29a4a';
    g.strokeRect(34, 34, w - 68, h - 68);
    g.setLineDash([]);
    g.fillStyle = '#6b3d1c';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = 'bold 150px "Malgun Gothic", "Apple SD Gothic Neo", "Noto Sans KR", sans-serif';
    g.fillText('오늘의 행운', w / 2, h / 2 + 6);
  });
}

// 떠 있는 표시용 쿠키 그림(이모지 글꼴이 없어도 보이도록 직접 그린다).
function markerTexture() {
  return textTexture(128, 128, (g) => {
    const glow = g.createRadialGradient(64, 64, 6, 64, 64, 62);
    glow.addColorStop(0, 'rgba(255,224,138,0.9)');
    glow.addColorStop(1, 'rgba(255,224,138,0)');
    g.fillStyle = glow;
    g.fillRect(0, 0, 128, 128);
    g.fillStyle = '#e6a93c';
    g.strokeStyle = '#a56a1f';
    g.lineWidth = 5;
    g.beginPath();
    g.moveTo(22, 74);
    g.bezierCurveTo(28, 28, 100, 28, 106, 74);
    g.bezierCurveTo(88, 62, 40, 62, 22, 74);
    g.closePath();
    g.fill();
    g.stroke();
    g.fillStyle = '#fff';
    g.fillRect(58, 78, 14, 20); // 삐져나온 종이쪽지
  });
}

function sparkleTexture() {
  return textTexture(64, 64, (g) => {
    g.fillStyle = '#fff6c8';
    g.beginPath();
    g.moveTo(32, 2); g.quadraticCurveTo(34, 30, 62, 32); g.quadraticCurveTo(34, 34, 32, 62); g.quadraticCurveTo(30, 34, 2, 32); g.quadraticCurveTo(30, 30, 32, 2);
    g.fill();
  });
}

export function buildFortuneStall(scene, stall) {
  const group = new THREE.Group();
  const mats = {};
  const mat = (color, extra = {}) => (mats[color + JSON.stringify(extra)] ??= new THREE.MeshStandardMaterial({ color, roughness: 0.85, ...extra }));
  const add = (parent, geo, material, x, y, z, { shadow = true } = {}) => {
    const m = new THREE.Mesh(geo, material);
    m.position.set(x, y, z);
    m.castShadow = shadow;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  };

  // 계산대(몸통 + 상판 + 앞 판 장식).
  add(group, new THREE.BoxGeometry(2.0, 0.85, 0.8), mat(WOOD), 0, 0.425, 0);
  add(group, new THREE.BoxGeometry(2.12, 0.07, 0.92), mat(WOOD_LIGHT), 0, 0.885, 0);
  add(group, new THREE.BoxGeometry(1.8, 0.5, 0.03), mat(ORANGE), 0, 0.45, 0.41);
  add(group, new THREE.BoxGeometry(1.7, 0.4, 0.035), mat(CREAM), 0, 0.45, 0.415, { shadow: false });
  // 뒤 판(가게 벽)과 기둥 4개.
  add(group, new THREE.BoxGeometry(2.0, 1.5, 0.05), mat(WOOD_DARK), 0, 1.6, -0.42);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) add(group, new THREE.CylinderGeometry(0.05, 0.055, 2.3, 8), mat(WOOD_DARK), sx * 1.02, 1.15, sz * 0.42);
  // 뒤 선반 위 작은 쪽지 더미(운세 종이).
  for (let i = 0; i < 3; i++) add(group, new THREE.BoxGeometry(0.28, 0.012, 0.18), mat(CREAM), 0.55, 0.93 + i * 0.012, 0.1 - i * 0.02 + 0.0, { shadow: false }).rotation.y = i * 0.35;

  // 줄무늬 차양: 앞이 낮게 기울고, 앞 가장자리에 물결 장식.
  const canopy = new THREE.Group();
  canopy.position.set(0, 2.25, 0.05);
  canopy.rotation.x = CANOPY_TILT;
  group.add(canopy);
  for (let i = 0; i < 11; i++) {
    const color = i % 2 === 0 ? ORANGE : CREAM;
    add(canopy, new THREE.BoxGeometry(0.2, 0.045, 1.3), mat(color), -1.0 + i * 0.2, 0, 0);
    const scallop = add(canopy, new THREE.CircleGeometry(0.1, 12, Math.PI, Math.PI), mat(color, { side: THREE.DoubleSide }), -1.0 + i * 0.2, 0, 0.65, { shadow: false });
    scallop.position.y = -0.02;
  }

  // 차양 위 간판(두 개의 짧은 기둥으로 받친다).
  const board = new THREE.Group();
  board.position.set(0, 2.78, -0.3);
  group.add(board);
  add(board, new THREE.BoxGeometry(1.9, 0.56, 0.06), mat(WOOD_LIGHT), 0, 0, 0);
  const face = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 0.5), new THREE.MeshBasicMaterial({ map: signTexture(), toneMapped: false }));
  face.position.z = 0.04;
  board.add(face);
  for (const sx of [-1, 1]) add(group, new THREE.CylinderGeometry(0.035, 0.035, 0.5, 6), mat(WOOD_DARK), sx * 0.7, 2.5, -0.3);

  // 전구 줄: 차양 앞 가장자리 아래로 늘어진 선 + 반짝이는 전구 12개(인스턴스).
  const wirePts = [];
  const bulbPos = [];
  const curve = (u) => new THREE.Vector3(u * 1.12, 1.96 - 0.11 * (1 - u * u), 0.74);
  for (let i = 0; i <= 24; i++) wirePts.push(curve((i / 24) * 2 - 1));
  group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(wirePts), new THREE.LineBasicMaterial({ color: 0x3a2a1c })));
  const bulbs = new THREE.InstancedMesh(new THREE.SphereGeometry(0.04, 8, 6), new THREE.MeshBasicMaterial({ toneMapped: false }), BULB_COUNT);
  const bulbBase = [];
  const m4 = new THREE.Matrix4();
  for (let i = 0; i < BULB_COUNT; i++) {
    const p = curve((i / (BULB_COUNT - 1)) * 2 - 1);
    bulbPos.push(p);
    m4.makeTranslation(p.x, p.y - 0.04, p.z);
    bulbs.setMatrixAt(i, m4);
    bulbBase.push(new THREE.Color(BULB_COLORS[i % BULB_COLORS.length]));
    bulbs.setColorAt(i, bulbBase[i]);
  }
  group.add(bulbs);

  // 쿠키 바구니(계산대 왼쪽): 선반처럼 둥근 그릇 + 테두리 + 가는 띠.
  const basket = new THREE.Group();
  basket.position.set(-0.4, 0.92, 0.05);
  group.add(basket);
  const bowl = new THREE.LatheGeometry([[0, 0], [0.3, 0], [0.38, 0.1], [0.43, 0.24], [0.4, 0.25], [0.35, 0.12], [0, 0.1]].map(([x, y]) => new THREE.Vector2(x, y)), 18);
  add(basket, bowl, mat(0xb98a4e, { side: THREE.DoubleSide }), 0, 0, 0);
  const rim = add(basket, new THREE.TorusGeometry(0.42, 0.025, 6, 20), mat(0x8b5e2c), 0, 0.245, 0);
  rim.rotation.x = Math.PI / 2;
  for (const y of [0.07, 0.15]) {
    const band = add(basket, new THREE.TorusGeometry(0.36 + y * 0.35, 0.014, 5, 20), mat(0x8b5e2c), 0, y, 0, { shadow: false });
    band.rotation.x = Math.PI / 2;
  }
  // 바구니 속 쿠키(황금·초코·분홍·말차 섞어서, 고정 난수로 같은 모양).
  const cookies = new THREE.InstancedMesh(cookieGeometry(), new THREE.MeshStandardMaterial({ roughness: 0.7 }), COOKIE_COUNT);
  cookies.castShadow = true;
  let seed = 7;
  const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const c = new THREE.Color();
  for (let i = 0; i < COOKIE_COUNT; i++) {
    const layer = i < 10 ? 0 : 1;
    const a = rnd() * Math.PI * 2;
    const r = (layer ? 0.1 : 0.27) * Math.sqrt(rnd()) + (layer ? 0 : 0.05);
    const s = 0.095 + rnd() * 0.02;
    e.set((rnd() - 0.5) * 0.7, rnd() * Math.PI * 2, (rnd() - 0.5) * 0.7);
    q.setFromEuler(e);
    m4.compose(new THREE.Vector3(-0.4 + Math.cos(a) * r, 0.93 + 0.17 + layer * 0.09, 0.05 + Math.sin(a) * r), q, new THREE.Vector3(s, s, s));
    cookies.setMatrixAt(i, m4);
    cookies.setColorAt(i, c.setHex(COOKIE_COLORS[i % COOKIE_COLORS.length]));
  }
  group.add(cookies);

  // 부스러기(계산대 위·앞 바닥에 조금).
  const crumbs = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.018, 0), new THREE.MeshStandardMaterial({ color: 0xe6a93c, roughness: 0.8 }), CRUMB_COUNT);
  for (let i = 0; i < CRUMB_COUNT; i++) {
    const onCounter = i < 6;
    const x = onCounter ? -0.9 + rnd() * 0.9 : -0.8 + rnd() * 1.6;
    const z = onCounter ? 0.28 + rnd() * 0.12 : 0.65 + rnd() * 0.5;
    const s = 0.7 + rnd() * 0.9;
    e.set(rnd() * 3, rnd() * 3, rnd() * 3);
    m4.compose(new THREE.Vector3(x, onCounter ? 0.93 : 0.02, z), q.setFromEuler(e), new THREE.Vector3(s, s * 0.6, s));
    crumbs.setMatrixAt(i, m4);
  }
  group.add(crumbs);

  // 작은 화분(계산대 오른쪽 끝).
  const pot = new THREE.Group();
  pot.position.set(0.82, 0.92, 0.12);
  group.add(pot);
  add(pot, new THREE.CylinderGeometry(0.1, 0.075, 0.13, 10), mat(0xc4673a), 0, 0.065, 0);
  for (let i = 0; i < 5; i++) {
    const leaf = add(pot, new THREE.ConeGeometry(0.045, 0.22, 5), mat(0x5fa860), Math.cos(i * 1.256) * 0.05, 0.22, Math.sin(i * 1.256) * 0.05, { shadow: false });
    leaf.rotation.set(Math.sin(i * 1.256) * 0.45, 0, -Math.cos(i * 1.256) * 0.45);
  }

  // 흔들리는 쿠키 장식(차양 앞 오른쪽에서 실로 늘어뜨린다).
  const mobile = new THREE.Group();
  mobile.position.set(0.62, 2.1, 0.36);
  group.add(mobile);
  const cookieGeo = cookieGeometry();
  const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.32, 4), mat(0x3a2a1c));
  cord.position.y = -0.16;
  mobile.add(cord);
  [0, 1, 2, 3].forEach((i) => {
    const a = (i / 4) * Math.PI * 2;
    const hang = new THREE.Group();
    hang.position.set(Math.cos(a) * 0.15, -0.34, Math.sin(a) * 0.15);
    const string = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.2, 4), mat(0x3a2a1c));
    string.position.y = -0.1;
    hang.add(string);
    const cookie = new THREE.Mesh(cookieGeo, new THREE.MeshStandardMaterial({ color: COOKIE_COLORS[i], roughness: 0.7 }));
    cookie.scale.setScalar(0.07);
    cookie.position.y = -0.24;
    cookie.rotation.set(Math.PI, a, 0); // 뒤집어 걸린다
    cookie.castShadow = true;
    hang.add(cookie);
    mobile.add(hang);
  });
  add(mobile, new THREE.TorusGeometry(0.15, 0.007, 4, 14), mat(0xc99a62), 0, -0.34, 0, { shadow: false }).rotation.x = Math.PI / 2;

  // 멀리서도 눈에 띄는 떠 있는 쿠키 표시 + 바구니 위 반짝임.
  const marker = new THREE.Sprite(new THREE.SpriteMaterial({ map: markerTexture(), transparent: true, depthWrite: false, toneMapped: false }));
  marker.scale.set(0.8, 0.8, 1);
  marker.position.set(0, 3.55, -0.2);
  group.add(marker);
  const sparkleTex = sparkleTexture();
  const sparkles = [[-0.55, 1.35, 0.3], [-0.2, 1.5, 0.15], [-0.35, 1.25, 0.45]].map(([x, y, z], i) => {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: sparkleTex, transparent: true, depthWrite: false, toneMapped: false }));
    s.position.set(x, y, z);
    s.userData.phase = i * 2.1;
    group.add(s);
    return s;
  });

  group.position.set(stall.x, 0, stall.z);
  group.rotation.y = stall.rotY;
  scene.add(group);

  const color = new THREE.Color();
  return {
    group,
    update(time) {
      mobile.rotation.z = Math.sin(time * 1.3) * 0.06;
      mobile.rotation.x = Math.sin(time * 1.05 + 1) * 0.045;
      marker.position.y = 3.55 + Math.sin(time * 2.2) * 0.12;
      for (const s of sparkles) {
        const k = 0.5 + 0.5 * Math.sin(time * 2.6 + s.userData.phase);
        s.scale.setScalar(0.1 + k * 0.14);
        s.material.opacity = 0.35 + k * 0.65;
      }
      for (let i = 0; i < BULB_COUNT; i++) { // 전구가 천천히 깜빡인다
        const k = 0.62 + 0.38 * Math.sin(time * 2.4 + i * 1.7);
        bulbs.setColorAt(i, color.copy(bulbBase[i]).multiplyScalar(k));
      }
      bulbs.instanceColor.needsUpdate = true;
    },
  };
}
