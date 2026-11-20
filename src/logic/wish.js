// 소원 조각상 (순수): 소원 글 검사, 소원 사이 쿨다운, 발치에 쌓이는 돌 개수·돌 하나의 놓임새, 분석에 보낼 비식별 정보.
// 소원 글 자체는 이 화면에서만 쓰고 서버·분석·말풍선 어디에도 보내지 않는다(wishEventParams 는 글자 수만 돌려준다).
import { WISH } from '../config.js';

export const WISH_REASONS = {
  empty: '소원을 한 글자 이상 적어 주세요',
  long: `${WISH.maxLength}자까지 적을 수 있어요`,
};

// 소원 글 검사: 앞뒤 공백을 지우고 줄바꿈·제어 문자는 빈칸 하나로 바꾼 뒤 비었는지·길이(글자 수, 이모지도 한 글자)를 본다.
// 돌려주는 값: { ok: true, wish } | { ok: false, reason: 'empty' | 'long' }
export function validateWish(raw, max = WISH.maxLength) {
  const text = String(raw ?? '').replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!text) return { ok: false, reason: 'empty' };
  if ([...text].length > max) return { ok: false, reason: 'long' };
  return { ok: true, wish: text };
}

// 쿨다운: 마지막으로 빈 시각(lastAt, 초. 아직 없으면 null)에서 now 까지 cooldown 초가 지났는가. 남은 초(올림, 0 이면 빌 수 있다).
export function wishCooldownLeft(now, lastAt, cooldown = WISH.cooldownSeconds) {
  if (lastAt === null || lastAt === undefined || !Number.isFinite(lastAt)) return 0;
  return Math.max(0, Math.ceil(cooldown - (now - lastAt) - 1e-9));
}
export const canWish = (now, lastAt, cooldown = WISH.cooldownSeconds) => wishCooldownLeft(now, lastAt, cooldown) === 0;

// 돌 개수: 한 번 빌 때마다 하나씩, max 에서 멈춘다.
export const nextStoneCount = (count, max = WISH.maxStones) => Math.min(max, Math.max(0, Math.floor(Number(count) || 0)) + 1);
// 저장소에서 읽은 값(문자열·null·이상한 값)을 0~max 정수로.
export function parseStoneCount(raw, max = WISH.maxStones) {
  const n = Math.floor(Number(raw));
  return Number.isFinite(n) ? Math.min(max, Math.max(0, n)) : 0;
}

// 돌 하나(i 번째, 0 부터)의 놓임새: 아래 돌이 넓고 위로 갈수록 작아지는 돌탑. 높이는 아래 돌들 두께의 합이다.
// 돌려주는 값: { y(바닥 높이), radius(가로 반지름), height(두께), rotY, dx, dz(가운데에서 살짝 어긋남) } (월드 단위, 결정적).
export function stoneAt(i, { base = 0.26, top = 0.12, thickness = 0.08, levels = WISH.maxStones } = {}) {
  const shape = (k) => {
    const t = levels > 1 ? Math.min(1, k / (levels - 1)) : 0;
    const wobble = Math.sin(k * 2.3 + 0.7);
    return { radius: base + (top - base) * t + 0.012 * wobble, height: thickness * (1 - 0.3 * t) + 0.008 * Math.cos(k * 1.7) };
  };
  let y = 0;
  for (let k = 0; k < i; k++) y += shape(k).height;
  const { radius, height } = shape(i);
  return { y, radius, height, rotY: (i * 1.37) % (Math.PI * 2), dx: 0.018 * Math.sin(i * 3.1), dz: 0.018 * Math.cos(i * 2.6) };
}

// 응원 한 줄(직전 것은 피한다). 돌려주는 값: { index, text }
export function pickCheer(cheers = WISH.cheers, rng = Math.random, last = -1) {
  if (!cheers.length) return { index: -1, text: '' };
  let index = Math.min(cheers.length - 1, Math.floor(rng() * cheers.length));
  if (index === last && cheers.length > 1) index = (index + 1) % cheers.length;
  return { index, text: cheers[index] };
}

// 분석 이벤트 wish_made 에 싣는 값: 글자 수와 돌 개수뿐(소원 글은 절대 싣지 않는다).
export const wishEventParams = (wish, stones) => ({ length: [...String(wish ?? '')].length, stones });
