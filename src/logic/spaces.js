// 공간 레지스트리 (순수). 한 씬 안에 서로 멀리 떨어진 여러 공간이 있고(마당은 원점, 실내는 멀리), 플레이어는 지금 공간 하나에 있다.
// 공간마다 이동 범위(bounds), 원점, 도착 지점이 있다. 장애물·바닥 메시·분위기는 그리는 쪽(main.js·spaces.js)이 공간 id 로 고른다.
// 새 공간은 여기에 한 항목 더하고 데이터(logic/interiors.js)와 그리는 쪽(main.js 의 공간 목록)을 더하면 된다.
import { YARD, SPAWN, LAUNDRY_INTERIOR, INTERVIEW_INTERIOR } from '../config.js';
import { buildingFacade } from './layout.js';
import { buildLaundryInterior, buildInterviewInterior } from './interiors.js';

const interior = buildLaundryInterior();
const interviewInterior = buildInterviewInterior();

export const SPACES = {
  yard: {
    id: 'yard', origin: { x: 0, z: 0 },
    bounds: { minX: -YARD.width / 2, maxX: YARD.width / 2, minZ: -YARD.depth / 2, maxZ: YARD.depth / 2 },
    // 도착 지점: 어디서 왔는지(fromId)에 따라. default 는 처음 시작할 때.
    arrivals: { default: { ...SPAWN, rotY: 0 }, laundry: buildingFacade('laundry').arrival, interview: buildingFacade('interview').arrival },
  },
  laundry: {
    id: 'laundry', origin: { ...LAUNDRY_INTERIOR.origin }, bounds: { ...interior.bounds },
    arrivals: { default: interior.arrival, yard: interior.arrival },
  },
  interview: {
    id: 'interview', origin: { ...INTERVIEW_INTERIOR.origin }, bounds: { ...interviewInterior.bounds },
    arrivals: { default: interviewInterior.arrival, yard: interviewInterior.arrival },
  },
};

function space(id) {
  const s = SPACES[id];
  if (!s) throw new Error(`알 수 없는 공간: ${id}`);
  return s;
}

// 점에서 범위(사각형)까지의 거리(안이면 0).
function distanceToBounds(p, b) {
  return Math.hypot(Math.max(b.minX - p.x, 0, p.x - b.maxX), Math.max(b.minZ - p.z, 0, p.z - b.maxZ));
}

// 월드 위치가 속한 공간 id: 범위 안이면 그 공간, 벽 바로 밖이나 아주 먼 곳이면 범위가 가장 가까운 공간(같으면 먼저 등록된 마당).
export function spaceAt(pos) {
  let best = 'yard';
  let bestDist = Infinity;
  for (const [id, s] of Object.entries(SPACES)) {
    const dist = distanceToBounds(pos, s.bounds);
    if (dist < bestDist) {
      best = id;
      bestDist = dist;
    }
  }
  return best;
}

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// 점을 공간 범위 안으로(벽에서 margin 안쪽으로) 끌어들인다.
export function clampToSpace(point, spaceId, margin) {
  const { bounds } = space(spaceId);
  return { x: clamp(point.x, bounds.minX + margin, bounds.maxX - margin), z: clamp(point.z, bounds.minZ + margin, bounds.maxZ - margin) };
}

// spaceId 공간에 fromId 공간에서 들어왔을 때 서는 자리와 방향: { x, z, rotY }. fromId 를 모르면 그 공간의 기본 도착 지점. 새 객체를 돌려준다.
export function arrivalPoint(spaceId, fromId) {
  const { arrivals } = space(spaceId);
  return { ...(arrivals[fromId] ?? arrivals.default) };
}
