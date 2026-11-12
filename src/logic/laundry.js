// 세탁소 연출 계산 (순수): 빨랫줄 칸·셔츠 색, 세탁기 흔들림, 거품, 빨래 흔들림. 그리는 쪽은 laundry.js.

export const PASTELS = [0xffb3c1, 0xb8e0d2, 0xfff1a8, 0xc3b6f2, 0xffcfa3, 0xa9d4f5]; // 분홍·민트·노랑·보라·살구·하늘

// n 번째(0부터) 널기가 걸리는 칸: 칸을 차례로 쓰고, 가득 차면 가장 오래된 것부터 바꾼다.
export const hangSlot = (count, slots) => ((count % slots) + slots) % slots;

// n 번째 널기의 셔츠 색(행동 횟수에서 정해지는 파스텔).
export const shirtColor = (count) => PASTELS[hangSlot(count, PASTELS.length)];

// 빨랫줄 위 i 번째 칸의 중심(두 기둥 사이를 slots 등분한 가운데).
export function slotPoint(line, i) {
  const t = (i + 0.5) / line.slots;
  return { x: line.x1 + (line.x2 - line.x1) * t, y: line.y, z: line.z1 + (line.z2 - line.z1) * t };
}

// 세탁기 흔들림: WOBBLE_SECONDS 동안 지수로 줄어드는 좌우 흔들림(-1~1). 시간 밖에서는 0.
export const WOBBLE_SECONDS = 1.2;
const WOBBLE_FREQ = 13; // 초당 진동 수
const WOBBLE_DECAY = 3.2;
export function wobbleAmount(t) {
  if (!(t >= 0) || t >= WOBBLE_SECONDS) return 0;
  const fade = Math.min(1, (WOBBLE_SECONDS - t) / 0.15); // 끝에서 0 으로 부드럽게
  return Math.exp(-WOBBLE_DECAY * t) * Math.sin(2 * Math.PI * WOBBLE_FREQ * t) * fade;
}

// 거품: 세탁기 위에서 올라오며 사라지는 작은 공 FOAM_COUNT 개. 공마다 시작이 조금씩 다르다.
export const FOAM_COUNT = 10;
export const FOAM_SECONDS = 0.8;
const FOAM_RISE = 0.7;
export function foamBubble(i, t) {
  const delay = (i % 5) * 0.04;
  const k = (t - delay) / (FOAM_SECONDS - 0.2);
  if (!(k >= 0) || k >= 1) return { visible: false, x: 0, y: 0, z: 0, scale: 0, opacity: 0 };
  const angle = i * 2.399963; // 황금각: 공들이 고르게 흩어진다
  const spread = 0.12 + 0.07 * (i % 3);
  const size = 0.08 + 0.025 * (i % 4);
  return {
    visible: true,
    x: Math.cos(angle) * spread * (0.5 + k),
    y: FOAM_RISE * k,
    z: Math.sin(angle) * spread * (0.5 + k),
    scale: size * (0.6 + 0.8 * Math.sin(Math.PI * Math.min(1, k * 1.2))),
    opacity: 1 - k * k,
  };
}

// 빨래가 줄에서 흔들리는 각도(라디안): SWING_SECONDS 동안 줄어드는 진동. 시간 밖에서는 0.
export const SWING_SECONDS = 1.0;
export function swingAngle(t) {
  if (!(t >= 0) || t >= SWING_SECONDS) return 0;
  const fade = Math.min(1, (SWING_SECONDS - t) / 0.2);
  return 0.35 * Math.exp(-2.6 * t) * Math.sin(2 * Math.PI * 2.2 * t) * fade;
}

// 점 pos 에서 가장 가까운 항목의 번호(거리가 같으면 앞쪽). 목록이 비어 있으면 -1. 세탁은 가장 가까운 세탁기를 향한다.
export function nearestIndex(pos, items) {
  let best = -1;
  let bestDist = Infinity;
  items.forEach((it, i) => {
    const dist = Math.hypot(pos.x - it.x, pos.z - it.z);
    if (dist < bestDist) {
      best = i;
      bestDist = dist;
    }
  });
  return best;
}
