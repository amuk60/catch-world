// 마당 자연 소리 정하기 (순수). 무엇을(새소리·풀벌레 중 어느 레시피), 언제(간격), 얼마나 크게(시간대 비중·불 옆 줄임) 낼지만 정한다.
// 실제 소리 만들기는 audio/ambient.js, 설정은 config.js 의 AMBIENT, 시간대는 logic/skyCycle.js 의 skyAt 결과({ name, next, blend })를 쓴다.
import { AMBIENT, FIRE_ZONE_RADIUS } from '../config.js';

const clamp01 = (v) => Math.min(1, Math.max(0, v));

// 시간대 비중: 지금 단계와 다음 단계의 비중을 넘어가는 정도(blend)만큼 섞는다. 모르는 이름은 0.
export function phaseWeight(weights, sky) {
  const a = weights?.[sky?.name] ?? 0;
  const b = weights?.[sky?.next] ?? a;
  const k = clamp01(sky?.blend ?? 0);
  return clamp01(a + (b - a) * k);
}

// 자연 소리 전체의 목표 크기(0~volume). 꺼짐·마당 밖·소리 끔·불멍 중이면 0. 소각장 반경 안에서는 fireDuck 배로 줄이고 반경 밖 fireDuckFade 동안 원래대로 돌아온다.
// s: { space, muted, meditating, fireDistance }
export function ambientLevel(s, cfg = AMBIENT, fireRadius = FIRE_ZONE_RADIUS) {
  if (!cfg.enabled || s.space !== 'yard' || s.muted || s.meditating) return 0;
  let duck = 1;
  if (Number.isFinite(s.fireDistance)) {
    const k = cfg.fireDuckFade > 0 ? clamp01((s.fireDistance - fireRadius) / cfg.fireDuckFade) : (s.fireDistance > fireRadius ? 1 : 0);
    duck = cfg.fireDuck + (1 - cfg.fireDuck) * k;
  }
  return cfg.volume * duck;
}

// 다음 소리까지 간격(초): [lo, hi] 사이 무작위.
export function nextInterval([lo, hi], rng = Math.random) {
  return lo + (hi - lo) * rng();
}

// 목록에서 하나 고르기: 직전과 같은 것은 (2개 이상이면) 고르지 않는다.
export function pickVariant(list, last, rng = Math.random) {
  if (!list.length) return null;
  if (list.length === 1) return list[0];
  const pool = list.filter((n) => n !== last);
  return pool[Math.min(pool.length - 1, Math.floor(rng() * pool.length))];
}

const CATEGORIES = ['birds', 'insects'];

// 새소리·풀벌레 일정표. 갈래마다 따로 타이머가 돌고, 때가 되면 그 시간대 비중의 확률로 소리를 낸다(비중이 0 이면 안 난다).
// step(dt, sky, active) -> [{ name, gain, category }](이번 프레임에 낼 소리, 보통 빈 배열). active 가 false 면 시간도 흐르지 않는다(실내·소리 끔에서 몰아서 나지 않게).
export function createAmbientScheduler(cfg = AMBIENT, rng = Math.random) {
  const state = {};
  for (const c of CATEGORIES) state[c] = { wait: nextInterval(cfg[c].interval, rng) * 0.5, last: null }; // 첫 소리는 조금 빨리
  const events = [];
  return {
    get waits() { return Object.fromEntries(CATEGORIES.map((c) => [c, state[c].wait])); },
    step(dt, sky, active = true) {
      events.length = 0;
      if (!active || !(dt > 0)) return events;
      for (const c of CATEGORIES) {
        const st = state[c];
        st.wait -= dt;
        if (st.wait > 0) continue;
        st.wait = nextInterval(cfg[c].interval, rng);
        const w = phaseWeight(cfg[c].weights, sky);
        if (w <= 0 || rng() >= w) continue;
        const name = pickVariant(cfg[c].sounds, st.last, rng);
        if (!name) continue;
        st.last = name;
        events.push({ name, gain: 0.5 + 0.5 * w, category: c });
      }
      return events;
    },
  };
}
