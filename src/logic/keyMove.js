// 키보드 이동 (순수). WASD·방향키를 event.code 로 받아(한글 자판에서도 같다) 카메라 기준 이동 방향을 만든다.
// 카메라는 목표 둘레 (sin az, cos az) 쪽에 놓이므로(logic/orbit.js) 화면 위쪽(카메라에서 멀어지는 쪽)은 (-sin az, -cos az),
// 화면 오른쪽은 (cos az, -sin az) 이다.
const DEG = Math.PI / 180;

// 코드 -> [오른쪽 성분, 앞쪽 성분]
const AXIS = {
  KeyW: [0, 1], ArrowUp: [0, 1],
  KeyS: [0, -1], ArrowDown: [0, -1],
  KeyD: [1, 0], ArrowRight: [1, 0],
  KeyA: [-1, 0], ArrowLeft: [-1, 0],
};

export const isMoveKey = (code) => code in AXIS;
export const isArrowKey = (code) => code.startsWith('Arrow');

// 눌린 키 집합(코드) -> 월드 x-z 평면의 단위 방향(없거나 반대 키끼리 상쇄되면 null). 대각선도 길이 1.
export function keyDirection(pressed, azimuthDeg) {
  let right = 0;
  let fwd = 0;
  for (const code of pressed) {
    const a = AXIS[code];
    if (!a) continue;
    right += a[0];
    fwd += a[1];
  }
  right = Math.sign(right); // 같은 방향 키를 둘(W+↑) 눌러도 한 번으로 센다
  fwd = Math.sign(fwd);
  const len = Math.hypot(right, fwd);
  if (len === 0) return null;
  const az = azimuthDeg * DEG;
  const s = Math.sin(az);
  const c = Math.cos(az);
  const r = right / len;
  const f = fwd / len;
  return { x: r * c - f * s, z: -r * s - f * c };
}

// 키 입력을 무시해야 하는가: Ctrl/Alt/Meta 조합, 또는 글자를 입력하는 요소(입력칸 등)에 포커스가 있을 때.
export function shouldIgnoreKey({ ctrlKey = false, altKey = false, metaKey = false } = {}, target = null) {
  if (ctrlKey || altKey || metaKey) return true;
  if (!target) return false;
  if (target.isContentEditable) return true;
  return /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName ?? '');
}

// 눌린 키 집합 한 개를 관리한다. 모드가 바뀌거나 창이 포커스를 잃으면 clear() 로 비운다(걷기가 멈추지 않는 일을 막는다).
export function createKeyState() {
  const pressed = new Set();
  return {
    down(code) { if (isMoveKey(code)) { pressed.add(code); return true; } return false; },
    up(code) { return pressed.delete(code); },
    clear() { pressed.clear(); },
    any: () => pressed.size > 0,
    direction: (azimuthDeg) => keyDirection(pressed, azimuthDeg),
  };
}
