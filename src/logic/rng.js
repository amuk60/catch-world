// 시드 기반 난수 (mulberry32). 같은 시드는 항상 같은 수열을 만든다.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const rand = (rng, min, max) => min + rng() * (max - min);
export const pick = (rng, array) => array[Math.floor(rng() * array.length)];
