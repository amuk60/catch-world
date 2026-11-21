// 터치 조작 계산 (순수): 가상 조이스틱 벡터·데드존, 카메라 기준 이동 방향, 탭/드래그 구분, 두 손가락 확대·축소, 터치용 안내 문구.
// 이동 방향은 키보드 이동(logic/keyMove.js 의 keyDirection)과 같은 규칙이다: 카메라는 목표 둘레 (sin az, cos az) 쪽에 있으므로
// 화면 위쪽(카메라에서 멀어지는 쪽)은 (-sin az, -cos az), 화면 오른쪽은 (cos az, -sin az).
const DEG = Math.PI / 180;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// 손잡이(노브)를 기준점에서 (dx, dy)px 끌었을 때 실제로 놓일 자리: 반지름 radius 원 밖으로는 나가지 않는다.
export function clampKnob(dx, dy, radius) {
  const len = Math.hypot(dx, dy);
  if (len <= radius || len === 0) return { x: dx, y: dy };
  const k = radius / len;
  return { x: dx * k, y: dy * k };
}

// 조이스틱 입력: (dx, dy)px(화면 기준, 아래가 +y) -> { x, y, mag }. x·y 는 단위 방향(오른쪽 +x, 아래 +y), mag 는 세기 0~1.
// 데드존(radius * deadZone) 안이면 mag 0(방향도 0). 데드존 밖은 0~1 로 다시 펼친다(살짝 밀어도 천천히 걷기 시작).
export function stickVector(dx, dy, { radius, deadZone = 0.15 }) {
  const len = Math.hypot(dx, dy);
  const dead = radius * deadZone;
  if (!(radius > 0) || len <= dead) return { x: 0, y: 0, mag: 0 };
  const mag = clamp((Math.min(len, radius) - dead) / (radius - dead), 0, 1);
  return { x: dx / len, y: dy / len, mag };
}

// 조이스틱 벡터 -> 월드 x-z 이동 벡터(길이 = 속도 배율 minSpeed~1). 세기가 0 이면 null(멈춤).
// 길이를 속도 배율로 쓰므로 main.js 는 키보드 이동과 같은 식(방향 * PLAYER.speed * dt)으로 움직이면 된다.
export function stickDirection(vec, azimuthDeg, minSpeed = 0.4) {
  if (!vec || !(vec.mag > 0)) return null;
  const right = vec.x;
  const fwd = -vec.y; // 화면 위로 밀면 앞으로
  const len = Math.hypot(right, fwd);
  if (len === 0) return null;
  const az = azimuthDeg * DEG;
  const s = Math.sin(az);
  const c = Math.cos(az);
  const r = right / len;
  const f = fwd / len;
  const speed = clamp(minSpeed + (1 - minSpeed) * vec.mag, 0, 1);
  return { x: (r * c - f * s) * speed, z: (-r * s - f * c) * speed };
}

// 손가락 탭 판정: 움직임과 시간이 모두 한도 이하면 탭(땅 탭 이동), 넘으면 드래그(카메라 회전). 손가락은 마우스보다 흔들리므로 한도가 더 넉넉하다.
export function isTap({ dx, dy, dtMs }, { maxMovePx, maxMs }) {
  return Math.hypot(dx, dy) <= maxMovePx && dtMs <= maxMs;
}

// 드래그로 넘어갔나: 처음 누른 자리에서 한도보다 멀어지면(그때부터 카메라를 돌린다. 탭 도중의 작은 떨림으로 시점이 흔들리지 않게).
export function passedDragSlop(dx, dy, slopPx) {
  return Math.hypot(dx, dy) > slopPx;
}

// 두 손가락 확대·축소: 손가락 사이가 prevGap -> gap(px) 으로 바뀌면 카메라 거리를 그 비율의 역수로(벌리면 가까이), limits 의 min~maxDistance 안에서.
// 간격이 너무 작거나 이상하면 거리를 그대로 둔다.
export function pinchDistance(distance, prevGap, gap, { minDistance, maxDistance }) {
  if (!(prevGap > 0) || !(gap > 0)) return clamp(distance, minDistance, maxDistance);
  return clamp(distance * (prevGap / gap), minDistance, maxDistance);
}

// 두 점 사이 거리(px).
export const gapOf = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

// 튜토리얼 문구를 터치용으로 바꾼 사본을 만든다(원본은 그대로). text: { intro: { lines }, steps: { move, burn }, courseHints: { <항목 id>: hint } }.
// 주어지지 않은 값은 원래 문구를 쓴다.
export function touchTutorial(tutorial, text = {}) {
  const intro = { ...tutorial.intro, ...(text.intro?.lines ? { lines: tutorial.intro.lines.map((l, i) => text.intro.lines[i] ?? l) } : {}) };
  const steps = { ...tutorial.steps, ...(text.steps ?? {}) };
  const hints = text.courseHints ?? {};
  const items = tutorial.course.items.map((it) => (hints[it.id] ? { ...it, hint: hints[it.id] } : it));
  return { ...tutorial, intro, steps, course: { ...tutorial.course, items } };
}
