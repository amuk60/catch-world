import { LAUNDRY_FX } from '../config.js';
// 세탁소 연출 계산 (순수): 빨랫줄 칸·셔츠 색, 세탁기 흔들림, 거품, 빨래 흔들림. 그리는 쪽은 laundry.js.

export const PASTELS = [0xffb3c1, 0xb8e0d2, 0xfff1a8, 0xc3b6f2, 0xffcfa3, 0xa9d4f5]; // 분홍·민트·노랑·보라·살구·하늘

// n 번째(0부터) 널기가 걸리는 칸: 칸을 차례로 쓰고, 가득 차면 가장 오래된 것부터 바꾼다.
// reserved(0 이상)가 주어지면 그 칸(내 새 셔츠 자리)은 건너뛴다. 나머지 칸끼리 같은 규칙으로 돈다.
export function hangSlot(count, slots, reserved = -1) {
  const free = reserved >= 0 && reserved < slots ? slots - 1 : slots;
  const k = ((count % free) + free) % free;
  return free < slots && k >= reserved ? k + 1 : k;
}

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

// ---- 세탁·널기 이펙트 시간표 (순수). 숫자(시간·개수)는 config.js 의 LAUNDRY_FX. 그리는 쪽은 laundryFx.js. ----
// 세탁: 셔츠가 세탁기에 들어간 순간이 t=0. 처음에 먼지·물방울, 돌아가는 동안 올라오는 비누방울·반짝이, burstAt 에 향기 폭죽(별 반짝이 + 빛 고리 + 떠오르는 방울).

export function washEvents(fx = LAUNDRY_FX) {
  const events = [{ t: 0, type: 'dust' }, { t: 0, type: 'splash', n: 5 }];
  for (let t = 0.2; t < fx.burstAt - 0.1 + 1e-9; t += fx.bubbleEvery) events.push({ t: Math.round(t * 1000) / 1000, type: 'bubble' });
  for (let t = 0.45; t < fx.burstAt - 0.1 + 1e-9; t += fx.sparkleEvery) events.push({ t: Math.round(t * 1000) / 1000, type: 'sparkle' });
  events.push({ t: fx.burstAt, type: 'burst', n: 16 }, { t: fx.burstAt, type: 'ring' }, { t: fx.burstAt + 0.1, type: 'floaters', n: 5 });
  return events.sort((a, b) => a.t - b.t);
}

// 세탁 진행률(0~100, 단조 증가): burstAt 까지 천천히 시작해 올라가고 그 순간 100.
export function washPercent(t, fx = LAUNDRY_FX) {
  if (!(t > 0)) return 0;
  if (t >= fx.burstAt) return 100;
  const k = t / fx.burstAt;
  return Math.min(99, Math.floor(100 * (k * (2 - k)))); // 앞이 빠르고 끝이 느린 곡선
}

// 세탁기 LED 에 보일 글과 퍼센트. 돌아가는 동안은 "표시 글" + 점 1~3개 번갈아, 끝나면 "완료!".
export function washDisplay(text, t, fx = LAUNDRY_FX) {
  if (t >= fx.burstAt) return { text: '세탁 완료!', percent: 100, done: true };
  const dots = '.'.repeat(1 + (Math.floor(Math.max(0, t) * 3) % 3));
  return { text: `${text}${dots}`, percent: washPercent(t, fx), done: false };
}

// LED 표시판의 투명도(0~1): 처음 0.25 초에 켜지고 끝(seconds) 0.5 초 전부터 꺼진다. 시간 밖에서는 0.
export function displayAlpha(t, fx = LAUNDRY_FX) {
  if (!(t >= 0) || t >= fx.seconds) return 0;
  return Math.min(1, t / 0.25, (fx.seconds - t) / 0.5);
}

// 널기: 셔츠가 걸린 순간이 t=0. 물방울이 떨어지고 hangTwinkleAt 에 자리 잡으며 반짝인다.
export function hangEvents(fx = LAUNDRY_FX) {
  const drops = [0.05, 0.2, 0.34, 0.5, 0.65, 0.82, 0.97].filter((t) => t < fx.hangSeconds).map((t) => ({ t, type: 'drip' }));
  return [...drops, { t: fx.hangTwinkleAt, type: 'twinkle', n: 6 }].sort((a, b) => a.t - b.t);
}

// 마른 내 셔츠의 반짝임: 주기 dryPeriod 마다 dryPulse 동안 0 -> 1 -> 0 으로 번쩍(사인 곡선). 쉬는 동안 0. 음수 시간은 0.
export function dryTwinkle(t, fx = LAUNDRY_FX) {
  if (!(t >= 0)) return 0;
  const phase = t % fx.dryPeriod;
  return phase < fx.dryPulse ? Math.sin(Math.PI * (phase / fx.dryPulse)) : 0;
}
