// 종이 큐 (순수). 이력서 5(소각, -5) → 불합격 통지서 6(소각, -4) → 자소서 4(파쇄 8번, 탭당 -1).
import { SHREDDER_TAPS } from '../config.js';

export const PAPER_TYPES = {
  resume: { label: '이력서', action: 'burn', reduce: 5, count: 5 },
  notice: { label: '불합격 통지서', action: 'burn', reduce: 4, count: 6 },
  coverLetter: { label: '자소서', action: 'shred', taps: SHREDDER_TAPS, reducePerTap: 1, count: 4 },
};

export function buildQueue() {
  const queue = [];
  for (const [type, def] of Object.entries(PAPER_TYPES)) {
    for (let i = 1; i <= def.count; i++) {
      queue.push({
        id: `${type}-${i}`,
        type,
        label: def.label,
        action: def.action,
        reduce: def.reduce ?? 0,
        taps: def.taps ?? 0,
        reducePerTap: def.reducePerTap ?? 0,
      });
    }
  }
  return queue;
}

// 큐 전체를 끝냈을 때 줄어드는 스트레스 합.
export function totalReduction(queue) {
  return queue.reduce((sum, p) => sum + p.reduce + p.taps * p.reducePerTap, 0);
}
