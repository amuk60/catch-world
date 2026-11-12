// 캐치 사이트 주소. 배포 전 브라우저에서 열어 캐치 사이트가 맞는지 확인한다.
export const CATCH_URL = 'https://www.catch.co.kr';

// GA4 측정 ID ('G-'로 시작). 비어 있으면 분석이 꺼진다. Task 10에서 입력한다.
export const GA_MEASUREMENT_ID = '';

export const STRESS = { start: 100, goal: 20 };

// 초안 문구. 팀이 자유롭게 수정한다.
export const COMFORT_MESSAGES = [
  '합격 메일은 아직 오는 중이에요. 배송이 좀 느릴 뿐!',
  '오늘 이력서 한 줄 썼다면 이미 상위 1% (제 마음속에서요).',
  '잠깐 쉬는 것도 스펙입니다. 휴식 경력 한 줄 추가!',
];

// 포춘쿠키 문구. 팀이 자유롭게 수정한다.
export const FORTUNES = [
  '오늘 보낸 지원서 중 하나는 반드시 읽힙니다. 그리고 그 사람은 당신 편입니다.',
  '면접장에서 긴장되면 이렇게 생각하세요. 저쪽도 사람이고, 저쪽도 퇴근하고 싶다.',
  "불합격은 거절이 아니라 '맞는 자리가 아직 아니었어요'의 다른 말입니다.",
  '행운의 숫자는 3. 이번 주에 세 번 웃으면 이미 반은 성공.',
  '오늘의 합격 운세: 맑음. 단, 이력서 오타는 한 번 더 확인하세요.',
  '당신의 강점은 이미 충분합니다. 아직 그걸 알아볼 사람을 못 만났을 뿐.',
  '잠깐 쉬어가도 괜찮아요. 쉬는 시간도 이력에 들어갑니다.',
  "다음 면접의 첫 마디는 '안녕하세요, 잘 부탁드립니다.' 이미 절반은 해냈어요.",
  '오늘은 지원서 한 장만 써도 충분한 하루입니다.',
  '커피 한 잔의 여유가 오늘의 합격 확률을 3% 올려줍니다. (제 마음속 통계)',
  '걱정의 90%는 일어나지 않고, 나머지 10%는 어떻게든 지나갑니다.',
  '행운의 아이템: 깨끗한 이력서와 깊은 심호흡.',
];

// ---- 3D 상수 (월드 단위) ----
// 마당 크기. 원점 중심, 바닥은 y=0, x가 가로(width), z가 세로(depth) 축.
export const YARD = { width: 24, depth: 24 };

// 제한형 궤도 카메라. 각도는 도(deg) 단위.
// polar: 수직 위가 0도, 수평이 90도. azimuth: 수직축 회전.
// baseFov는 세로 화각이며 minAspect보다 좁은 창에서는 fov를 키운다.
// followSpeed: 타깃 추적 지수 보간 속도, rotateSpeed: 드래그 1px당 라디안, zoomStep: 휠 1칸 배율.
export const ORBIT = {
  baseFov: 45, minAspect: 1.5,
  distance: 9, minDistance: 5, maxDistance: 12,
  azimuthDeg: 45, polarDeg: 60, minPolarDeg: 25, maxPolarDeg: 75,
  targetHeight: 1.0, followSpeed: 6, rotateSpeed: 0.005, zoomStep: 0.9,
};

// 플레이어 이동 속도(단위/초)와 충돌 반경(단위).
export const PLAYER = { speed: 4, radius: 0.4 };

// 플레이어 캐릭터 모델. name 을 예: 'character-female-a', 'character-worker' 로 바꾸면 캐릭터가 바뀐다.
// facingOffsetDeg: 모델이 +z 를 보지 않으면 (예: 180) 돌려서 맞춘다.
export const PLAYER_MODEL = { name: 'character-male-d', scale: 1.5, facingOffsetDeg: 0 };

// 카메라와 플레이어 사이를 가리는 나무를 줄이는 설정. radius: 가림 판정 거리(단위), minT/maxT: 카메라→타깃 선분의 판정 구간(0~1), minScale: 가장 작아질 때의 배율.
export const OCCLUSION = { radius: 2.0, minT: 0.08, maxT: 0.97, minScale: 0.2 };

// 클릭 판정: 이동 px와 시간(ms)이 모두 이하면 클릭, 넘으면 드래그.
export const CLICK = { maxMovePx: 6, maxMs: 350 };

// 임시 소각로(장애물).
export const FURNACE = { x: -6.5, z: -1.5, radius: 1.6 };

// 플레이어 시작 위치. 숲과 도시 사이 완충 구역의 열린 잔디밭.
export const SPAWN = { x: 0, z: 3 };

// 구역 경계(world x축, +x = 동쪽). x <= forestMaxX 는 숲+소각로, x >= cityMinX 는 도시, 그 사이는 완충 구역.
export const ZONES = { forestMaxX: -1.5, cityMinX: 2.5 };

// 상호작용 반경(단위). 이후 단계에서 사용한다.
export const INTERACT_RADIUS = 1.5;

// 소각장 행동(태우기·파쇄)과 불멍. 거리는 월드 단위, 시간은 초.
// ACTION_REDUCE: 행동 하나가 효과 순간에 줄이는 스트레스 지수.
// AUTO_GAP: 자동 버튼이 행동을 끝낸 뒤 다음 행동(태우기 -> 파쇄 -> 태우기 ...)을 시작하기까지 쉬는 시간.
// PASSIVE: 불멍(소각로 옆 벤치에 앉아 있기)으로 interval 초마다 amount 씩 자동으로 줄어든다(행동 하나보다 약하게).
// FIRE_ZONE_RADIUS: 소각로 중심에서 이 거리 안에 있어야 행동 막대가 보인다.
// FIRE_RANGE: 이 거리 안이면 태우기가 켜진다(소각로 중심 기준).
// SHREDDER_RANGE: 파쇄기 중심에서 이 거리 안이면 파쇄가 켜진다. 두 범위가 겹치는 자리(소각로와 파쇄기 사이)에서 자동이 두 행동을 번갈아 한다.
// 행동 순서: 한숨(emote-no) -> 재킷 주머니에서 종이를 꺼낸다(pick-up) -> 대상 쪽으로 돈다(ACTION_TURN_SECONDS, 유일한 회전)
// -> 던지기/치기 -> 후련(emote-yes). 캐릭터는 걷지 않고 제자리에서 돈다.
// ACTION_EFFECT_AT: 던지기/치기 단계 길이 중 효과(종이가 불에 닿는 순간 등)가 일어나는 비율.
// ACTION_TARGET_SECONDS: 행동 한 번의 총 길이 목표. 클립 합 + 회전이 이보다 짧으면 던지기/치기 클립만 천천히 재생해 맞춘다
// (나머지는 원래 속도, 더 길면 늘리지 않는다).
export const ACTION_REDUCE = 3;
export const AUTO_GAP = 1;
export const PASSIVE = { interval: 5, amount: 2 };
export const FIRE_ZONE_RADIUS = 4.5;
export const FIRE_RANGE = 4.0;
export const SHREDDER_RANGE = 4.0;
export const ACTION_TURN_SECONDS = 0.5;
export const ACTION_EFFECT_AT = 0.45;
export const ACTION_TARGET_SECONDS = 5;

// 시드: 마당 배치를 항상 같게 만든다.
export const SEED = 20261111;

// 색상 (0xRRGGBB)
export const COLORS = {
  skyTop: 0x3f6fa8, skyHorizon: 0xf1c48f, fog: 0xdcbf94,
  ground: 0x6b8f3a, sun: 0xffd6a0,
  hemiSky: 0xe9dcc0, hemiGround: 0x7a6a4a,
  // 도시 구역: 포장 광장과 건물 터(건물 자체는 이후 단계).
  plaza: 0x8a98b8, pad: 0x707e96,
  // 모델 재질 보정: 원본이 청록이라 초록으로 바꾼다(덤불 / 소나무 잎).
  bush: 0x6aa83a, pine: 0x4f7a2a,
  // 아래 셋은 모델 로딩 실패 시 쓰는 도형 대체물용.
  player: 0x6ec6ff, trunk: 0x6b4a2f, leaves: 0xb5452a, furnace: 0x6a6a78, marker: 0xffd166,
};

// 안개 거리(단위).
export const FOG = { near: 22, far: 75 };

// 조명: 해(방향광) 세기, 하늘빛(반구광) 세기, 해 위치, 그림자 범위(단위).
export const LIGHT = { sun: 1.5, hemi: 0.95, sunPosition: [-9, 14, 7], shadowExtent: 24 };
