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

// 마당에서 건물이 카메라와 플레이어 사이를 가리면 카메라를 천천히 돌려 가림을 피하는 설정(logic/cameraClear.js). 끄려면 enabled: false.
// 건물 밖(마당)에서 서 있거나 걸을 때만 동작하고, 실내·공간 전환·앉아 있는 동안에는 절대 돌지 않는다. 나무는 따로 줄어들므로 건물만 본다.
// delaySeconds: 가림이 이만큼(초) 이어져야 돌기 시작한다. idleSeconds: 사용자가 카메라를 드래그·휠로 만진 뒤 이만큼(초) 지나야 돈다(드래그 중에는 절대 안 돈다).
// maxDegPerSecond: 도는 최대 속도(도/초, 출발과 도착은 서서히). margin: 건물 가장자리에서 시선이 이만큼(단위) 더 비켜 가야 "안 가려짐"으로 본다(경계에서 떨리지 않게).
export const CAMERA_CLEAR = { enabled: true, delaySeconds: 0.4, idleSeconds: 2, maxDegPerSecond: 45, margin: 0.3 };

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
// ACTION_REDUCE: 모션 1회당 스트레스 감소량(사용자가 5로 정함).
// AUTO_GAP: 자동 버튼이 행동을 끝낸 뒤 다음 행동(태우기 -> 파쇄 -> 태우기 ...)을 시작하기까지 쉬는 시간.
// PASSIVE: 불멍(소각로 옆 벤치에 앉아 있기)으로 interval 초마다 amount 씩 자동으로 줄어든다(행동 하나보다 약하게).
// FIRE_ZONE_RADIUS: 소각로 중심에서 이 거리 안에 있어야 행동 막대가 보인다.
// FIRE_RANGE: 이 거리 안이면 태우기가 켜진다(소각로 중심 기준).
// SHREDDER_RANGE: 파쇄기 중심에서 이 거리 안이면 파쇄가 켜진다. 두 범위가 겹치는 자리(소각로와 파쇄기 사이)에서 자동이 두 행동을 번갈아 한다.
// 행동 순서: 한숨(emote-no, 소각장 행동만: 세탁소 행동은 한숨 없이 바로) -> 재킷 주머니에서 종이를 꺼낸다(pick-up) -> 대상 쪽으로 돈다(ACTION_TURN_SECONDS, 유일한 회전)
// -> 던지기/치기 -> 후련(emote-yes). 캐릭터는 걷지 않고 제자리에서 돈다.
// ACTION_EFFECT_AT: 던지기/치기 단계 길이 중 효과(종이가 불에 닿는 순간 등)가 일어나는 비율.
// ACTION_TARGET_SECONDS: 행동 한 번의 총 길이 목표. 클립 합 + 회전이 이보다 짧으면 던지기/치기 클립만 천천히 재생해 맞춘다
// (나머지는 원래 속도, 더 길면 늘리지 않는다).
export const ACTION_REDUCE = 5;
export const AUTO_GAP = 1;
export const PASSIVE = { interval: 5, amount: 2 };
export const FIRE_ZONE_RADIUS = 4.5;
export const FIRE_RANGE = 4.0;
export const SHREDDER_RANGE = 4.0;
// 세탁소 구역(세탁·널기): 구역 중심은 layout 의 세탁기 줄과 빨랫줄 사이(logic/zones.js)이고 이 반경 안에서 행동 막대가 보인다.
// WASHER_RANGE: 가장 가까운 세탁기 중심에서 이 거리 안이면 세탁이 켜진다. CLOTHESLINE_RANGE: 빨랫줄 중심에서 이 거리 안이면 널기가 켜진다.
export const LAUNDRY_ZONE_RADIUS = 4.5; // 구역 중심은 실내 세탁기 줄과 빨랫줄 사이(logic/zones.js)
export const WASHER_RANGE = 4.0;
export const CLOTHESLINE_RANGE = 4.0;
// 빨랫줄 칸 수: 파스텔 셔츠가 돌려 쓰는 공용 칸(shared) + 방 정원(MULTIPLAYER.roomCap)만큼의 개인 "내 셔츠" 칸(personal). 여러 명이 한 줄을 같이 쓰므로 줄이 길다(interiors.js 가 칸 수에 맞춰 줄 길이를 정한다).
export const CLOTHESLINE_SLOTS = { shared: 6, personal: 6 };
// 옷 상태 연동(소각 -> 그을음 옷 -> 세탁 -> 나시 -> 새 셔츠 널기 -> 마르면 입기).
// DRY_SECONDS: 새 흰 셔츠를 빨랫줄에 널고 마르기까지 걸리는 시간(초, 실시간. 밖에 나가 있어도 센다).
// WEAR_SECONDS: 마른 새 셔츠를 입는 동작의 길이(초, 이동·입력은 잠긴다). WEAR_SWAP_AT: 그중 셔츠가 줄에서 사라지고 옷이 바뀌는 순간의 비율.
export const DRY_SECONDS = 8;

// 세탁소 순서 안내 문구(눌러도 아무 일 없는 짧은 힌트, 화면 아래 E 안내 줄에 뜬다). 순서: 1 세탁 -> 2 널기 -> 마를 때까지 기다리기 -> E 새 셔츠 입기. 팀이 자유롭게 수정한다.
// washing: 세탁 동작이 진행되는 동안(셔츠가 세탁기에 들어가 덜컹거릴 때까지), tank: 세탁이 끝나고 아직 빨랫줄에 널기 전. (마르는 중·입기 문구는 logic/outfit.js 의 outfitPrompt)
export const LAUNDRY_GUIDE = {
  washing: '세탁 중… 다 빨리면 빨랫줄에 널어요',
  tank: '다음은 2 널기! 새 셔츠를 빨랫줄에 널어요',
};
export const WEAR_SECONDS = 1.2;
export const WEAR_SWAP_AT = 0.5;
export const ACTION_TURN_SECONDS = 0.5;
export const ACTION_EFFECT_AT = 0.45;
export const ACTION_TARGET_SECONDS = 5;

// 소각장 행동(태우기·파쇄)의 물건과 연출. 팀이 이 표를 고쳐 물건·멘트를 바꾼다(코드는 건드리지 않아도 된다).
// targetSeconds: 태우기·파쇄 한 번의 총 길이 목표(초). 단계별 길이는 logic/actions.js 가 이 값에 맞춰 비율로 늘이고 줄인다(세탁소 행동은 ACTION_TARGET_SECONDS 를 그대로 쓴다).
// auroraChance: 자동(R)의 태우기 차례에서 오로라 가루가 나올 확률(파쇄에는 나오지 않는다). 멘트 한 줄은 20자 이하로 쓴다.
// items: 물건 목록(선택 창에 이 순서로 1~5 번호가 붙는다).
//   id: 영문 고유 이름(분석 이벤트 burn_item / shred_item 에 실린다). label: 선택 창에 보이는 이름.
//   burn / shred: 그 행동으로 할 수 있으면 { lines: [멘트들] }(주머니에서 꺼낸 뒤 말풍선으로 한 줄 중얼거린다). 없으면 그 행동 목록에 나오지 않는다. 오로라 가루는 파쇄 못 한다.
//   prop: 손에 드는 물건의 겉모습. kind('letter' 자소서 | 'resume' 이력서 | 'notice' 불합격 통지서 | 'mail' 탈락 메일 | 'pouch' 가루 주머니), title(머리글), accent(색), ball(구긴 공에 남는 표식 색).
//   flame: 불 색 효과 { tint: 'aurora', seconds } (오로라 가루: 불꽃이 오로라 빛으로 바뀌었다가 seconds 뒤 돌아온다).
export const INCINERATOR = {
  targetSeconds: 6.8,
  auroraChance: 0.12,
  items: [
    {
      id: 'cover', label: '자소서',
      burn: { lines: ['지긋지긋했던 자소서는 태워버려!', '성장과정? 이제 재가 되었다!', '지원동기: 불타오르고 싶어서', '자소서야, 잘 가라~'] },
      shred: { lines: ['이 자소서는 잘게 잘게!', '문장아, 이제 가루가 되렴', '자소서 쓰다 늙겠다, 갈자!'] },
      prop: { kind: 'letter', title: '자기소개서', accent: '#3f6d5a', ball: '#3f6d5a' },
    },
    {
      id: 'resume', label: '이력서',
      burn: { lines: ['이력서야, 그동안 고생했다… 안녕!', '경력은 연기로 사라진다~', '증명사진도 같이 활활!', '빈칸 채우던 밤이여, 안녕'] },
      shred: { lines: ['이제 이력서는 갈아버리자…', '이력서, 국수가 되어라!', '사진 속 나, 잘게 안녕~'] },
      prop: { kind: 'resume', title: '이 력 서', accent: '#2f5fa8', ball: '#2f5fa8' },
    },
    {
      id: 'notice', label: '불합격 통지서',
      burn: { lines: ['불합격? 나도 너 불합격이야!', '통지서는 불쏘시개로 딱이지', '아쉽다고? 나도 아쉬워 죽겠다'] },
      shred: { lines: ['불합격 통지서는 가루가 되라', '싹둑싹둑 잘게 갈아주마', '너는 이제 종이국수야'] },
      prop: { kind: 'notice', title: '불합격 통지서', accent: '#2b3a67', ball: '#d3221c' },
    },
    {
      id: 'mail', label: '면접 탈락 메일',
      burn: { lines: ['탈락 메일, 연기가 되어라~', 'Re: 불합격… 재가 되어라', '메일함도 이렇게 비우고 싶다'] },
      shred: { lines: ['탈락 메일은 파쇄가 답이지', '인쇄한 보람이 있었네, 갈자', '메일아, 먼지가 되어버려'] },
      prop: { kind: 'mail', title: 'Re: 면접 결과 안내', accent: '#4a5a78', ball: '#d3221c' },
    },
    {
      id: 'aurora', label: '오로라 가루',
      burn: { lines: ['근심아, 오로라로 날아가라~', '반짝반짝 오로라 한 줌!', '스트레스야, 빛이 되어라~', '오로라 가루, 출동!'] },
      prop: { kind: 'pouch', title: '오로라 가루', accent: '#7a5cc8', ball: '#7a5cc8' },
      flame: { tint: 'aurora', seconds: 4.5 },
    },
  ],
};

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

// ---- 공간 전환(차원문)과 세탁소 실내 ----
// 전환: 닫는 구간 -> (화면이 완전히 덮인 순간 공간 교체) -> 여는 구간. 합쳐 약 1초.
export const TRANSITION = { outSeconds: 0.45, inSeconds: 0.45 };
// 세탁소 실내는 마당에서 멀리 떨어진 같은 씬 안의 별도 공간이다(origin: 실내 중심). width 는 x, depth 는 z 방향 길이(안쪽 면 기준).
export const LAUNDRY_INTERIOR = { origin: { x: 300, z: 0 }, width: 12, depth: 10, wallHeight: 2.58 };
// 세탁소 실내(기본값. 면접장은 아래 INTERVIEW_LOOK): 유리 가게. 벽·창·출입문은 서리 유리(우윳빛, 밖이 전혀 안 보인다) + 은색 철제 틀이고, 바닥은 깨끗한 밝은 타일, 밝고 시원한 흰 조명이다.
// 필드: 배경색(background), hemi: 반구광 세기, lamp*: 천장 램프 점광(색·세기·닿는 거리), sun/sunColor: 그림자용 방향광 세기·색.
// floor: 바닥 타일 두 색(a, b)과 줄눈 색(line), speckle 이 true 면 카펫 같은 잔 얼룩, roughness(선택): 바닥 거칠기(작을수록 반짝), glow(선택, 0~1): 타일이 스스로 빛나는 정도(밝은 바닥이 흐려 보이지 않게). baseboard: 걸레받이 색(유리 벽에서는 틀의 아랫단이 대신한다).
// sign: 간판 판 색(board)과 글씨판 색(bg 바탕, border 테두리, text 글씨), brushed(선택)가 true 면 솔질한 금속 결. materials: 모델 재질 덮어쓰기(아래 INTERVIEW_LOOK 참고).
// glass(선택): 있으면 벽을 모델 대신 유리 조각으로 만든다(interiorGlass.js). 지우면(또는 materials 의 wall 항목을 채우면) 모델 벽으로 돌아간다.
//   frame/frameDark: 철제 틀 색(밝은 은색 / 어두운 보호판·문턱), texture: 유리 질감의 세로 그라데이션 세 색(위, 가운데, 아래) kind 별(wall 벽 / low 벽 아래 띠 / window 창·문),
//   sheen: 비스듬한 빛줄기의 세기(0~1), roughness·clearcoat: 유리 광택(작을수록 번들), emissive·emissiveIntensity: 유리가 스스로 은은히 빛나는 색·세기(서리 유리의 밝은 느낌).
// clothesline(선택): 빨랫줄 기둥·집게 색.
export const INTERIOR_LOOK = {
  background: 0xe4f1f3, hemiSky: 0xf4fbfd, hemiGround: 0xb8cad1, hemi: 1.25,
  lamp: 0xf2fbff, lampIntensity: 9, lampDistance: 12, sun: 0.7, sunColor: 0xf3f9ff,
  floor: { a: '#d9e8ed', b: '#c7dae1', line: 'rgba(90, 120, 135, 0.3)', speckle: false, roughness: 0.55, glow: 0.22 },
  baseboard: 0xb7c2ca,
  sign: { board: 0xc4ccd3, bg: '#e9eff1', border: '#a9b5be', text: '#1b8a98', brushed: true },
  materials: {
    table: { wood: 0xd3dde3 },
    benchCushion: { wood: 0xcfd7dc, carpet: 0x47b4c0 },
    pottedPlant: { wood: 0xe4eaed, woodDark: 0xbcc7ce },
    trashcan: { metal: 0xcbd3d9, metalDark: 0x74818b },
    cardboardBoxOpen: { wood: 0x6fc5cf, woodDark: 0x4aa7b3 },
    lampRoundFloor: { metal: 0xcbd3d9, lamp: 0xf4fbff },
    rugRectangle: { carpet: 0x93d5db, carpetDarker: 0x6dbcc4 },
  },
  glass: {
    frame: 0xd8e0e5, frameDark: 0xb4c0c9,
    texture: {
      wall: ['#f6fcfc', '#e6f4f5', '#d4ebee'], low: ['#e2f2f4', '#d0e9ec', '#bfe0e5'], window: ['#fbfeff', '#ecf8f9', '#d9eff2'],
    },
    sheen: { wall: 0.5, low: 0.4, window: 0.8 },
    roughness: 0.42, clearcoat: 0.55, emissive: 0xcde9ed, emissiveIntensity: 0.32,
  },
  clothesline: { post: 0xb4bec6, pin: 0x8e9ba5 },
};

// 면접장 실내: 따뜻한 우드톤 대신 차갑고 딱딱한 사무실 느낌(쿨 화이트·회색 벽, 청회색 카펫 타일 바닥, 남색 포인트, 흰 형광등 빛).
// 필드 의미는 INTERIOR_LOOK 와 같다. 모든 색은 파랑 성분이 빨강 이상이다(test/interviewLook.test.js 가 확인).
// materials: 모델 이름 -> { 재질 이름: 색(0xRRGGBB) 또는 { color, roughness, opacity } }. '*' 는 모든 모델에 먼저 깔리는 기본값이다.
// Furniture Kit 모델의 재질(wood·metal·carpet 등)을 이 공간에서만 복제해 덮어쓰므로 세탁소·마당의 같은 모델은 그대로다.
export const INTERVIEW_LOOK = {
  background: 0xdde3ea, hemiSky: 0xf0f5ff, hemiGround: 0x9aa4b2, hemi: 1.0,
  lamp: 0xeef5ff, lampIntensity: 9, lampDistance: 12, sun: 0.5, sunColor: 0xe6eeff,
  floor: { a: '#a8b1bc', b: '#9ba5b1', line: 'rgba(40, 52, 70, 0.28)', speckle: true },
  baseboard: 0x4a525d,
  sign: { board: 0x14213d, bg: '#1d3157', border: '#c8d2e0', text: '#ffffff' },
  materials: {
    '*': { wood: 0x8c97a4, woodDark: 0x6d7886, metal: 0xb9c1cb, metalMedium: 0x59636f, metalDark: 0x3a424c, _defaultMat: 0xe4e9ee },
    wall: { wood: 0x8c97a4, _defaultMat: 0xf1f4f7, metalDark: 0x3a424c },
    wallWindow: { wood: 0x8c97a4, _defaultMat: 0xf1f4f7, metalDark: 0x3a424c, glass: { color: 0x9cc3e8, opacity: 0.42 } },
    wallDoorwayWide: { wood: 0x8c97a4, _defaultMat: 0xf1f4f7, metalDark: 0x3a424c },
    desk: { wood: 0xd9dee4, metal: 0x2b323b },
    chairDesk: { metalMedium: 0x15181d, carpet: 0x262b33 },
    chairModernCushion: { metal: 0x8d98a5, carpetBlue: 0x33496b },
    bookcaseOpenLow: { wood: 0x9aa4af },
    coatRackStanding: { wood: 0x2f353d },
    lampRoundFloor: { metal: 0x59636f, lamp: 0xf2f6ff },
    pottedPlant: { wood: 0xd5dae0, woodDark: 0xaab3bd },
    plantSmall1: { wood: 0xd5dae0 },
    rugRectangle: { carpet: 0x2c3c58, carpetDarker: 0x1f2c44 },
    trashcan: { metal: 0x8d98a5, metalDark: 0x3a424c },
    books: { carpetDarker: 0x1f3a66, carpetWhite: 0xeef1f5, plant: 0x5a7fb0, metal: 0x9aa4af },
    laptop: { metal: 0xb9c1cb, metalMedium: 0x59636f, metalDark: 0x2b323b },
  },
};

// ---- 면접장(압박 질문 받아치기) ----
// 면접장 실내도 세탁소처럼 마당에서 멀리 떨어진 같은 씬 안의 별도 공간이다(세탁소 실내와도 멀다). 크기·벽 높이 의미는 LAUNDRY_INTERIOR 와 같다.
export const INTERVIEW_INTERIOR = { origin: { x: 600, z: 0 }, width: 12, depth: 10, wallHeight: 2.58 };
// 면접 구역(의자·책상 근처, 이 반경 안에서 행동 막대 [1 면접 보기] [2 돌발행동] 이 보인다. 자동 버튼은 없다).
export const INTERVIEW_ZONE_RADIUS = 3.3;
// INTERVIEW_ROUND: 질문에 이만큼 연속으로 답하면 면접관 3명이 일어나 박수를 치고 "최종 합격!" (공간을 나가거나 끝나면 처음부터).
// INTERVIEW_BONUS: 완주 보너스로 한 번 더 줄어드는 지수(균형 조정 대상). 답변·돌발행동 한 번의 감소량은 언제나 ACTION_REDUCE 이다.
export const INTERVIEW_ROUND = 5;
export const INTERVIEW_BONUS = 5;
// 면접 연출 시간(초). 답변 한 번 = 답하는 동작 + 면접관 반응 합쳐 INTERVIEW_ANSWER_SECONDS, 돌발행동 하나 = INTERVIEW_IMPROV_SECONDS(다른 행동의 ACTION_TARGET_SECONDS 와 비슷하게).
// INTERVIEW_FINALE_SECONDS: 5문항 완주 때 이어지는 "일어나 박수 + 최종 합격!" 연출. SPEECH_SECONDS: 말풍선 하나가 떠 있는 시간.
export const INTERVIEW_ANSWER_SECONDS = 5;
export const INTERVIEW_IMPROV_SECONDS = 5;
export const INTERVIEW_FINALE_SECONDS = 3.6;
export const SPEECH_SECONDS = 2.3;

// 면접장의 모든 글(질문·답변·면접관 반응·돌발행동·첫 대사). 팀이 자유롭게 고쳐 쓴다 (초안).
// - 면접관 id: leader(엄격한 팀장) / hr(친절한 척하는 인사담당) / mentor(말수 적은 예비 사수: 같이 일할 선배, 속으론 진심으로 응원하고 가끔 현실적인 한마디). model 은 캐릭터 모델 이름이다.
// - questions: 12개. asker 는 원래 질문자 표시(초안 문체의 기준)이고, 담당 면접관제에서는 지원자가 앉은 의자의 담당 면접관이 어느 질문이든 던진다. answers 는 정확히 정석/솔직/엉뚱 하나씩, text 는 40자 안팎(버튼과 말풍선에 그대로 뜬다).
// - reactions: 답변 종류별로 면접관마다 대사 후보(그중 하나를 무작위로). 정석은 박수, 솔직은 당황, 엉뚱은 폭소 연출이 함께 나온다.
// - improvs: 돌발행동 4개. id 는 코드의 연출 이름이라 바꾸지 말고, 대사(player/leader/hr/mentor)만 고친다. player 는 차례로 나오는 말풍선이다.
// - openings: 면접장에 들어와 자리에 설 때 팀장의 첫 대사. 옷 겉모습(suit 정장 / soot 그을음 / tank 나시)에 따라 다르다.
export const INTERVIEW = {
  interviewers: [
    { id: 'leader', name: '팀장', model: 'character-male-b', scale: 1.75 },
    { id: 'hr', name: '인사담당', model: 'character-female-e', scale: 1.7 },
    { id: 'mentor', name: '예비 사수', model: 'character-male-f', scale: 1.6 },
  ],
  openings: {
    suit: '자, 앉으세요. 첫 질문 드리겠습니다.',
    soot: '어디서 불이라도 나셨어요? ...계속하시죠.',
    tank: '복장이... 아주 시원하시네요.',
  },
  finale: '최종 합격!',
  // 담당 면접관제: 내 의자(또는 다른 사람 의자)의 담당이 아닌 면접관은 한가할 때만 동작으로 가볍게 반응하고, 가끔 이 중 아주 짧은 한마디를 한다(12자 이내).
  interjections: {
    정석: ['오~', '좋네요.', '음, 괜찮네.'],
    솔직: ['음...', '허...', '어머.'],
    엉뚱: ['푸핫!', '크흠...', '하하.'],
    improv: ['어머...', '허...', '이런.'],
  },
  cancelLabel: '다음에 할게요',
  types: ['정석', '솔직', '엉뚱'],
  questions: [
    {
      asker: 'leader', text: '1분 자기소개 부탁드립니다.',
      answers: [
        { type: '정석', text: '끈기 있게 끝까지 해내는 지원자입니다.' },
        { type: '솔직', text: '1분은 길어요. 제 자랑은 30초면 끝나요.' },
        { type: '엉뚱', text: '저는 이력서 한 장에 안 접히는 사람입니다!' },
      ],
    },
    {
      asker: 'hr', text: '저희 회사에 지원한 이유가 뭔가요~?',
      answers: [
        { type: '정석', text: '제 목표와 회사의 방향이 같다고 느꼈습니다.' },
        { type: '솔직', text: '공고를 읽을수록 마음에 들었어요. 진짜로요.' },
        { type: '엉뚱', text: '운명입니다. 지원 버튼이 저를 불렀어요.' },
      ],
    },
    {
      asker: 'leader', text: '본인의 단점을 말씀해 주세요.',
      answers: [
        { type: '정석', text: '꼼꼼해서 오래 걸리지만 일정표로 보완합니다.' },
        { type: '솔직', text: '월요일 아침의 저는 아직 로딩 중입니다.' },
        { type: '엉뚱', text: '눈부신 매력이 단점입니다. 선글라스 필수예요.' },
      ],
    },
    {
      asker: 'hr', text: '5년 뒤에는 어떤 모습일까요~?',
      answers: [
        { type: '정석', text: '이 분야의 믿음직한 전문가로 성장하겠습니다.' },
        { type: '솔직', text: '내일 점심도 고민인데요... 그래도 단단해질게요.' },
        { type: '엉뚱', text: '5년 뒤엔 저 자리에서 질문하고 있겠습니다!' },
      ],
    },
    {
      asker: 'leader', text: '저희가 왜 지원자를 뽑아야 하죠?',
      answers: [
        { type: '정석', text: '맡은 일을 책임지고 끝내는 사람이니까요.' },
        { type: '솔직', text: '저도 모르겠지만, 같이 일하면 후회 없게 할게요.' },
        { type: '엉뚱', text: '저를 안 뽑으면 이 의자가 서운해합니다.' },
      ],
    },
    {
      asker: 'mentor', text: '이 볼펜, 한번 팔아 보세요. 저도 궁금해서요.',
      answers: [
        { type: '정석', text: '매끄럽게 써져서 일이 즐거워지는 볼펜입니다.' },
        { type: '솔직', text: '쓰다 보면 정이 듭니다. 일단 써 보세요.' },
        { type: '엉뚱', text: '이 볼펜으로 서명하면 합격이 따라옵니다!' },
      ],
    },
    {
      asker: 'mentor', text: '저희 팀은 가끔 회식을 하는데, 괜찮으세요?',
      answers: [
        { type: '정석', text: '팀워크를 다지는 자리라면 기쁘게 참석하겠습니다.' },
        { type: '솔직', text: '가끔은 좋아요. 다만 2차는 내일의 제가 말려요.' },
        { type: '엉뚱', text: '회식 자리의 분위기 메이커, 제가 접니다!' },
      ],
    },
    {
      asker: 'hr', text: '가장 크게 실패했던 경험은요~?',
      answers: [
        { type: '정석', text: '실패에서 원인을 찾아 같은 실수를 줄였습니다.' },
        { type: '솔직', text: '지원서 이름란에 오타를 낸 적이 있어요.' },
        { type: '엉뚱', text: '라면 물 조절 실패요. 인생을 배웠습니다.' },
      ],
    },
    {
      asker: 'leader', text: '마지막으로 하고 싶은 말이 있나요?',
      answers: [
        { type: '정석', text: '기회를 주셔서 감사합니다. 최선을 다하겠습니다.' },
        { type: '솔직', text: '긴장해서 말이 꼬였지만, 진심은 진짜예요.' },
        { type: '엉뚱', text: '합격하면 커피는 제가 쏘겠습니다. 월급 받고요!' },
      ],
    },
    {
      asker: 'hr', text: '동료와 의견이 다르면 어떻게 하시겠어요~?',
      answers: [
        { type: '정석', text: '근거를 정리해 차분히 의견을 맞춰 가겠습니다.' },
        { type: '솔직', text: '일단 심호흡하고, 그다음에 커피를 사겠습니다.' },
        { type: '엉뚱', text: '가위바위보로... 아니, 대화로 풀겠습니다!' },
      ],
    },
    {
      asker: 'leader', text: '급한 일이 생겨 야근이 필요하다면?',
      answers: [
        { type: '정석', text: '필요한 일이라면 책임감을 갖고 임하겠습니다.' },
        { type: '솔직', text: '할 수는 있지만, 습관이 되진 않았으면 해요.' },
        { type: '엉뚱', text: '야근엔 저의 숨은 야식 레이더가 빛납니다!' },
      ],
    },
    {
      asker: 'mentor', text: '같이 일할 사이니까 묻는데, 동물로 치면 뭐예요?',
      answers: [
        { type: '정석', text: '꾸준히 걷는 거북이입니다. 끝까지 갑니다.' },
        { type: '솔직', text: '월요일엔 나무늘보, 금요일엔 치타예요.' },
        { type: '엉뚱', text: '저는 합격을 물어 오는 리트리버입니다. 멍!' },
      ],
    },
  ],
  reactions: {
    정석: {
      leader: ['흠, 나쁘지 않군요.', '기본기가 탄탄하네요.'],
      hr: ['어머~ 정말 훌륭하세요!', '역시 준비 많이 하셨네요~'],
      mentor: ['좋네요. 같이 일하면 든든하겠어요.', '(조용히 고개를 끄덕인다)'],
    },
    솔직: {
      leader: ['...솔직하시군요. 당황스럽게도.', '허, 그런 대답은 처음이라.'],
      hr: ['어머, 그렇게 말씀하시면... 호호.', '아, 네, 네~ 솔직하시네요~'],
      mentor: ['...저는 그런 솔직함, 좋아해요.', '현실적이라 마음에 드네요. 속으로만요.'],
    },
    엉뚱: {
      leader: ['푸핫! ...크흠, 계속하죠.', '웃음을 참느라 힘듭니다.'],
      hr: ['꺄하하! 너무 웃겨요~', '호호호, 이건 적어 둘게요~'],
      mentor: ['...푸흡. 아, 아닙니다. 계속하세요.', '재밌네요. 우리 팀 분위기에 딱이에요.'],
    },
  },
  improvs: [
    {
      id: 'paperToss', title: '서류 하늘 던지기',
      player: ['서류는... 하늘로!', '저는 오늘부로 퇴장하겠습니다!'],
      leader: '자, 잠깐! 어디 가세요!', hr: '어머나, 서류가 눈처럼...', mentor: '서류는 제가 주울게요. 응원은... 하고 있습니다.',
    },
    {
      id: 'reverse', title: '역질문 폭주',
      player: ['야근수당은요?', '점심 메뉴는 뭔가요?', '팀장님 MBTI는요?', '혹시 반려동물 키우세요?'],
      leader: '질문은 우리가... 아니...', hr: '어머, 하나씩 해요~', mentor: '저희 팀 야근은... 아, 아닙니다.',
    },
    {
      id: 'dance', title: '단체 댄스',
      player: ['음악 주세요! 다 같이 춤춰요~', '합격~ 합격~ 어깨춤~!'],
      leader: '뭐 하는... 크흠, 한 번만이다!', hr: '어머~ 같이 춰요~!', mentor: '...춤은 못 춰도 박수는 칠게요.',
    },
    {
      id: 'banzai', title: '책상 위 만세',
      player: ['취업 만세!!', '만세! 만세! 만세!'],
      leader: '내려오세요... 일단 박수는...', hr: '어머나, 활기차시네요~', mentor: '내려오실 땐 조심하세요. 만세, 좋았어요.',
    },
  ],
};

// ---- 멀티플레이(다른 방문자 아바타 보기) ----
// 같은 공간(마당·세탁소·면접장)에 동시에 있는 방문자를 실시간 아바타로 보여 준다. 채팅·충돌·이펙트 공유는 없고, 스트레스 지수는 각자 개인 것이다.
// 공유되는 정보는 임의로 만든 닉네임·위치·방향·동작·옷 상태뿐이다(개인정보 아님). 끄려면 enabled: false. 접속 주소 뒤에 ?mp=off 를 붙이면 그 탭에서만 끈다.
// transport: 'supabase'(실서비스: Supabase Realtime) | 'local'(같은 브라우저의 탭끼리 BroadcastChannel, 개발·시험용. 접속 주소에 ?mp=local 을 붙이면 이 탭에서만 local 로 바꾼다. 시작할 때 한 번만 읽는다).
//   'supabase' 인데 아래 SUPABASE_URL / SUPABASE_ANON_KEY 가 비어 있으면 아무 일도 하지 않고(요청도 없다) 조용히 꺼진다.
// sendHz: 내 상태를 보내는 최대 횟수(회/초, 바뀐 것이 있을 때만). heartbeatMs: 가만히 있어도 이 간격(ms)마다 한 번은 보낸다. 같은 공간에 다른 사람이 없으면 아무것도 보내지 않는다.
// epsPos / epsRot: 이만큼(단위 / 라디안) 이상 바뀌어야 "움직였다"로 본다. minGapMs: 동작·옷·공간이 바뀌어 즉시 보낼 때도 이 간격(ms)은 둔다.
// maxRemote: 한 번에 그리는 다른 방문자 수의 최대(가까운 순). maxTracked: 메시지를 받아 기억해 두는 방문자 수의 최대(악의적 폭주 방지). minRecvGapMs: 한 방문자가 이 간격보다 촘촘히 보내는 메시지는 버린다.
// interpDelayMs: 다른 방문자를 이만큼(ms) 과거 위치로 그려 부드럽게 보이게 한다(3Hz 전송 주기 약 333ms 에 맞춘다). extrapolateMs: 다음 메시지가 늦을 때 걷는 방향으로 더 내다보는 최대 시간(ms). teleportDist: 이 거리(단위) 이상 한 번에 움직이면 보간 없이 곧장 옮긴다(공간이 바뀌어도 마찬가지).
// staleMs: 이 시간(ms) 동안 메시지가 없으면 그 방문자를 지운다. 닉네임 규칙(2~10자, 허용 글자, 금칙어)은 logic/nick.js.
// 방 샤딩: 한 공간을 roomCap 명 단위의 방(<공간>-1, <공간>-2, ...)으로 나눈다(전달 메시지 수가 방 인원의 제곱에 비례해서 무료 한도를 지키기 위함).
// 들어갈 때 1번 방부터 shardProbeMs(ms) 동안 presence 로 다른 사람 수를 세어 보고 roomCap 미만인 가장 앞 방에 머문다. 모두 차면(maxShards 개) 멀티플레이만 끄고(게임은 정상) fullRetryMs(ms) 뒤에 다시 시도한다.
// 이미 접속한 사람은 쫓아내지 않는다. 동시에 들어오면 roomCap 을 조금 넘을 수 있다. 시험용으로 주소에 ?mpcap=2 처럼 쓰면 이 탭의 roomCap 을 바꾼다.
// 전송 절감: 탭이 숨겨지거나 입력이 idleMs(ms) 동안 없으면 상태 전송을 멈춘다(연결·presence 는 유지, 상대 화면에서는 staleMs 뒤에 사라진다). 돌아오면 곧바로 다시 보낸다.
// retryBaseMs / retryMaxMs: 연결이 끊기면 이 간격(ms)에서 시작해 두 배씩(최대 retryMaxMs) 늘려 가며 다시 연결한다.
// nickAdjectives / nickNouns: 닉네임은 임의 id 로 만든 "형용사 명사 #숫자". 개인정보는 절대 쓰지 않는다.
// 인사·응원말 프리셋(T 키 또는 우하단 💬 버튼). 글은 전송되지 않고 번호만 전송되며 받는 쪽이 이 목록에서 글을 찾는다 -> 순서(번호)를 바꾸면 옛 접속자와 말이 어긋나니 배포 중에는 끝에만 덧붙이는 게 안전하다. 항목당 16자 이하, 최대 9개(숫자 키 1~9). 팀이 자유롭게 고친다.
export const QUICK_CHAT = ['안녕하세요! 👋', '화이팅! 💪', '합격하세요! 🍀', '수고했어요 😊', '같이 태워요 🔥', '면접 잘 보세요!', '힘내요, 우리 같이 해요', 'ㅎㅎ 반가워요'];

export const MULTIPLAYER = {
  enabled: true,
  transport: 'supabase',
  sendHz: 3, heartbeatMs: 3000, epsPos: 0.05, epsRot: 0.05, minGapMs: 40,
  maxRemote: 20, maxTracked: 60, minRecvGapMs: 30,
  interpDelayMs: 250, extrapolateMs: 150, teleportDist: 8,
  staleMs: 9000, 
  chatGapMs: 2000, chatGlobalMax: 6, chatGlobalWindowMs: 3000,
  roomCap: 6, maxShards: 8, shardProbeMs: 700, fullRetryMs: 60000, idleMs: 5 * 60 * 1000,
  retryBaseMs: 1000, retryMaxMs: 30000,
  supabaseSdkUrl: 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.118.0/+esm',
  channelPrefix: 'catch-world:',
  nickAdjectives: ['야근 마스터', '퇴사 준비생', '합격 기원', '자소서 장인', '면접 베테랑', '커피 수혈', '월급 루팡', '출근 거부', '스펙 쌓는', '포트폴리오', '이력서 탈주', '긴장 만렙', '불합격 초월', '연봉 협상', '인턴 출신', '신입 사원'],
  nickNouns: ['너구리', '펭귄', '고양이', '다람쥐', '호랑이', '수달', '부엉이', '토끼', '판다', '오리', '곰', '여우', '거북이', '고슴도치', '카피바라', '미어캣'],
};

// Supabase Realtime 접속 정보. 프로젝트를 만든 뒤 Project Settings > API 의 Project URL 과 anon public 키를 넣는다(publishable/anon 키는 공개해도 되는 키다. secret/service_role 키는 절대 넣지 않는다).
// 둘 중 하나라도 비어 있으면 멀티플레이는 조용히 꺼진다.
export const SUPABASE_URL = 'https://gwdyiczmxdzbtenhtlsd.supabase.co';
export const SUPABASE_ANON_KEY = 'sb_publishable_idHVy3M8kBSOIxkIvAMgCA_I5sQnMvN';
