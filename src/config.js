// 캐치 사이트 주소. 배포 전 브라우저에서 열어 캐치 사이트가 맞는지 확인한다.
export const CATCH_URL = 'https://www.catch.co.kr';

// GA4 측정 ID ('G-'로 시작). 비어 있으면 분석이 꺼진다. Task 10에서 입력한다.
export const GA_MEASUREMENT_ID = '';

export const STRESS = { start: 100, goal: 20 };
export const SPAWN_INTERVAL_MS = 3500;
export const SHREDDER_TAPS = 8;

// 초안 문구. 팀이 자유롭게 수정한다.
export const COMFORT_MESSAGES = [
  '합격 메일은 아직 오는 중이에요. 배송이 좀 느릴 뿐!',
  '오늘 이력서 한 줄 썼다면 이미 상위 1% (제 마음속에서요).',
  '잠깐 쉬는 것도 스펙입니다. 휴식 경력 한 줄 추가!',
];

// ---- 3D 상수 (월드 단위) ----
// 방 크기. 원점 중심, 바닥은 y=0, x가 가로(width), z가 세로(depth) 축.
export const ROOM = { width: 16, depth: 12 };

// 쿼터뷰 고정 카메라. baseFov는 세로 화각(도), minAspect보다 좁은 창에서는 fov를 키운다.
export const CAMERA = { baseFov: 35, position: [10, 12, 10], lookAt: [0, 0, 0], minAspect: 1.5 };

// 이동 속도(단위/초)와 상호작용 반경(단위). 이후 단계에서 사용한다.
export const PLAYER_SPEED = 5;
export const INTERACT_RADIUS = 1.5;

// 색상 (0xRRGGBB)
export const COLORS = { background: 0x2a2a40, floorA: 0x4a4a6a, floorB: 0x424262, player: 0x6ec6ff };
