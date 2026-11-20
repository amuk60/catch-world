// 캐치 사이트 주소. 배포 전 브라우저에서 열어 캐치 사이트가 맞는지 확인한다.
export const CATCH_URL = 'https://www.catch.co.kr';

// 캐치 서비스 바로가기 표(팀이 고치는 단일 기준). CTA 버튼은 모두 여기 있는 id(link)를 가리키고, 누르면 해당 서비스 페이지가 새 탭으로 열린다.
// 각 항목: id(고유), name(서비스 이름), desc(버튼 아래에 작게 보이는 한 줄 설명), url(https://www.catch.co.kr/ 로 시작, 대소문자 경로는 그대로 둔다).
// 주소 뒤에는 utm_source=catchworld&utm_medium=<fortune|popup|chip|banner>&utm_campaign=<id> 가 붙는다(logic/catchUrl.js 의 linkCatchUrl).
export const CATCH_LINKS = [
  { id: 'jobs', name: '채용공고', desc: '연봉·기업 규모 등 조건별로 공고를 탐색해요', url: 'https://www.catch.co.kr/NCS/RecruitSearch' },
  { id: 'company', name: '기업정보', desc: '초봉·연봉, 최근 이슈, 현직자 리뷰, 면접후기를 볼 수 있어요', url: 'https://www.catch.co.kr/Comp/CompMajor' },
  { id: 'ai_match', name: 'AI 매칭', desc: '이력서와 행동 패턴을 바탕으로 공고를 추천해요', url: 'https://www.catch.co.kr/NCS/RecruitInformation' },
  { id: 'interview_review', name: '면접 후기', desc: '합격자들의 실제 면접 후기를 볼 수 있어요', url: 'https://www.catch.co.kr/JobN/Interview/main' },
  { id: 'ai_interview', name: 'AI 면접 튜터', desc: 'AI와 실전처럼 면접을 연습하고 피드백을 받아요', url: 'https://www.catch.co.kr/JobN/AIInterviewTutor/main' },
  { id: 'cover_letter', name: '합격자소서', desc: '합격자들의 자기소개서를 참고할 수 있어요', url: 'https://www.catch.co.kr/JobN/CoverLetter/Main' },
  { id: 'cafe', name: '캐치카페', desc: '회원에게 무료로 제공하는 오프라인 공간: 대학생·취준생 모두 무료, 매일 음료 1잔, 카페 좌석·스터디 공간 대여·채용설명회', url: 'https://www.catch.co.kr/CatchCafe/' },
  { id: 'tv', name: '캐치TV', desc: '취준생의 영원한 친구 캐치TV, 취업 정보를 재미있게 풀어 주는 유튜브 채널', url: 'https://www.catch.co.kr/News/CatchCast' },
  { id: 'home', name: '캐치', desc: '취업 준비의 모든 것', url: CATCH_URL }, // 칩·배너·공유 카드 등 일반 용도
];

// GA4 측정 ID ('G-'로 시작). 비어 있으면 분석이 꺼진다. localhost 에서는 켜지지 않는다.
export const GA_MEASUREMENT_ID = 'G-RN2Z8252B8';

export const STRESS = { start: 100, goal: 20 };

// 초안 문구. 팀이 자유롭게 수정한다.
export const COMFORT_MESSAGES = [
  '합격 메일은 아직 오는 중이에요. 배송이 좀 느릴 뿐!',
  '오늘 이력서 한 줄 썼다면 이미 상위 1% (제 마음속에서요).',
  '잠깐 쉬는 것도 스펙입니다. 휴식 경력 한 줄 추가!',
];

// 포춘쿠키 운세 분류 이름(종이 위에 보인다). 버튼 이름과 이동할 서비스는 아래 FORTUNES 의 항목마다 cta: { label, link } 로 정한다.
export const FORTUNE_CTA = {
  interview: { name: '면접운' },
  resume: { name: '서류운' },
  growth: { name: '이직·성장운' },
  rest: { name: '휴식운' },
  confidence: { name: '자신감·멘탈운' },
  luck: { name: '재물·행운운' },
};
export const FORTUNE_UTM = { source: 'catchworld', medium: 'fortune' };

// 고를 수 있는 쿠키 3종. favors: 이 쿠키가 조금 더 자주 내놓는 운세 분류(그래도 어떤 분류든 나올 수 있다).
export const COOKIE_KINDS = [
  { id: 'gold', label: '황금 쿠키', favors: ['interview', 'luck'] },
  { id: 'choco', label: '초코 쿠키', favors: ['rest', 'confidence'] },
  { id: 'matcha', label: '말차 쿠키', favors: ['resume', 'growth'] },
];

// 포춘쿠키 문구. 팀이 자유롭게 수정한다. 각 항목: { text, category(FORTUNE_CTA 의 키), cta: { label(20자 이내, 가는 곳을 설명), link(CATCH_LINKS 의 id) } }
// 문구의 뜻과 가는 곳이 자연스럽게 이어지도록 짝을 맞춘다.
const fortune = (category, text, link, label) => ({ text, category, cta: { label, link } });
export const FORTUNES = [
  // 면접운 -> 면접 후기 / AI 면접 튜터
  fortune('interview', '면접장에서 긴장되면 이렇게 생각하세요. 저쪽도 사람이고, 저쪽도 퇴근하고 싶다.', 'interview_review', '합격자 면접 후기 훔쳐보기'),
  fortune('interview', "다음 면접의 첫 마디는 '안녕하세요, 잘 부탁드립니다.' 이미 절반은 해냈어요.", 'ai_interview', 'AI 면접 튜터와 연습하기'),
  fortune('interview', '오늘 운이 좋네요! 면접 대비를 미리 해 두시면 좋겠어요.', 'ai_interview', 'AI 면접 실전 연습 해보기'),
  fortune('interview', '자기소개는 30초면 충분합니다. 나머지 30초는 미소 담당이에요.', 'interview_review', '합격자 면접 후기 엿보기'),
  // 서류운 -> 합격자소서
  fortune('resume', '오늘 보낸 지원서 중 하나는 반드시 읽힙니다. 그리고 그 사람은 당신 편입니다.', 'cover_letter', '합격 자소서 몰래 보기'),
  fortune('resume', '오늘의 합격 운세: 맑음. 단, 이력서 오타는 한 번 더 확인하세요.', 'cover_letter', '합격 자소서로 내 글 비교'),
  fortune('resume', '행운의 아이템: 깨끗한 이력서와 깊은 심호흡.', 'cover_letter', '합격 자소서로 한 번 더 점검'),
  fortune('resume', '자소서 첫 문장이 안 써질 땐 둘째 문장부터 쓰세요. 첫 문장은 나중에 알아서 옵니다.', 'cover_letter', '합격 자소서 첫 문장 엿보기'),
  // 이직·성장운 -> AI 매칭 / 채용공고
  fortune('growth', "불합격은 거절이 아니라 '맞는 자리가 아직 아니었어요'의 다른 말입니다.", 'ai_match', '내게 맞는 공고 추천받기'),
  fortune('growth', '지금 걷는 길이 돌아가는 길처럼 보여도, 풍경 구경하다 보면 도착합니다.', 'jobs', '내 조건 공고 찾아보기'),
  fortune('growth', '귀인은 멀리 있지 않아요. 오늘 열어 본 공고 속에 숨어 있을지도!', 'ai_match', '귀인 공고 찾으러 가기'),
  fortune('growth', '어제의 나보다 이력서 한 줄만큼 성장했다면 오늘도 대성공입니다.', 'jobs', '내 조건 공고 찾아보기'),
  // 휴식운 -> 캐치카페 / 캐치TV
  fortune('rest', '잠깐 쉬어가도 괜찮아요. 쉬는 시간도 이력에 들어갑니다.', 'cafe', '캐치카페 음료 1잔 받기'),
  fortune('rest', '오늘은 지원서 한 장만 써도 충분한 하루입니다.', 'tv', '캐치TV로 잠깐 쉬어가기'),
  fortune('rest', '커피 한 잔의 여유가 오늘의 합격 확률을 3% 올려줍니다. (제 마음속 통계)', 'cafe', '카페에서 커피 한 잔 받기'),
  fortune('rest', '급할수록 산책. 걷다 보면 막힌 문장도 슬슬 풀립니다.', 'tv', '캐치TV로 머리 식히기'),
  // 자신감·멘탈운 -> 캐치TV / 면접 후기
  fortune('confidence', '당신의 강점은 이미 충분합니다. 아직 그걸 알아볼 사람을 못 만났을 뿐.', 'tv', '캐치TV 취업 꿀팁 보기'),
  fortune('confidence', '걱정의 90%는 일어나지 않고, 나머지 10%는 어떻게든 지나갑니다.', 'interview_review', '선배들 후기로 걱정 덜기'),
  fortune('confidence', '합격한 사람들도 처음엔 다 떨리는 손으로 지원 버튼을 눌렀답니다.', 'interview_review', '합격 선배 후기 보며 힘내기'),
  fortune('confidence', '오늘의 나에게 한 마디. "여기까지 온 것만으로도 이미 잘하고 있어."', 'tv', '캐치TV로 응원 받기'),
  // 재물·행운운 -> 기업정보 / 채용공고
  fortune('luck', '행운의 숫자는 3. 이번 주에 관심 기업 세 곳의 초봉을 알아보면 이미 반은 성공.', 'company', '관심 기업 초봉 확인하기'),
  fortune('luck', '오늘의 행운 포인트는 새로고침. 어제 없던 공고가 오늘 올라왔을지도요.', 'jobs', '오늘 새로 뜬 공고 보기'),
  fortune('luck', '곧 반가운 메일 한 통이 도착할 예정입니다. 스팸함도 꼭 확인하고, 면접후기도 미리 읽어 두세요.', 'company', '기업 면접 후기 미리 보기'),
  fortune('luck', '이번 달 재물운 상승 중. 첫 월급으로 먹을 메뉴를 미리 정해 두세요.', 'company', '기업 연봉·후기 확인하기'),
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

// 소각장 행동(태우기·파쇄)과 마시멜로 굽기. 거리는 월드 단위, 시간은 초.
// REDUCE_RANGE: 행동(태우기·파쇄·세탁·널기·면접 답변·돌발행동) 1회당 스트레스 감소량의 범위. 행동마다 효과 순간에 이 범위(양끝 포함)에서 정수를 무작위로 한 번 뽑는다(평균 약 9.5, 팀 결정: 크게 잡아 빨리 닳게).
// AUTO_GAP: 자동 버튼이 행동을 끝낸 뒤 다음 행동(태우기 -> 파쇄 -> 태우기 ...)을 시작하기까지 쉬는 시간.
// FIRE_ZONE_RADIUS: 소각로 중심에서 이 거리 안에 있어야 행동 막대가 보인다(소각로 옆 벤치에 앉아 있어도 이 거리 안이면 마시멜로 굽기 막대가 뜬다).
// FIRE_RANGE: 이 거리 안이면 태우기가 켜진다(소각로 중심 기준).
// SHREDDER_RANGE: 파쇄기 중심에서 이 거리 안이면 파쇄가 켜진다. 소각로(태우기 전용)와 파쇄기(파쇄 전용)는 따로 떨어진 구역이고, 자동(R)은 서 있는 구역의 행동만 되풀이한다.
// 행동 순서: 한숨(emote-no, 소각장 행동만: 세탁소 행동은 한숨 없이 바로) -> 재킷 주머니에서 종이를 꺼낸다(pick-up) -> 대상 쪽으로 돈다(ACTION_TURN_SECONDS, 유일한 회전)
// -> 던지기/치기 -> 후련(emote-yes). 캐릭터는 걷지 않고 제자리에서 돈다.
// ACTION_EFFECT_AT: 던지기/치기 단계 길이 중 효과(종이가 불에 닿는 순간 등)가 일어나는 비율.
// ACTION_TARGET_SECONDS: 행동 한 번의 총 길이 목표. 클립 합 + 회전이 이보다 짧으면 던지기/치기 클립만 천천히 재생해 맞춘다
// (나머지는 원래 속도, 더 길면 늘리지 않는다).
export const REDUCE_RANGE = { min: 7, max: 12 };
export const ACTION_REDUCE = 5; // 더는 쓰지 않는다(옛 고정 감소량, 호환용). 실제 감소는 REDUCE_RANGE 의 무작위 값.
export const AUTO_GAP = 1;
export const FIRE_ZONE_RADIUS = 4.5;
// 불멍: 소각로 옆 벤치에 앉아 있기만 해도(마시멜로를 굽는 중에도 같이) interval 초마다 amount 씩 지수가 천천히 자동으로 줄어든다(행동 하나보다 약하게, 행동 횟수에는 넣지 않는다).
export const PASSIVE = { interval: 5, amount: 2 };
// 마시멜로 굽기(소각로 옆 벤치에 앉아서 1번): 1인칭 시점으로 막대 끝 마시멜로를 불 위에 들고 굽는 미니게임. 판마다 타이밍이 다르다.
// 굽는 정도(level 0 -> 1)는 색·모양으로만 읽는다(게이지는 황금 구간을 알려 주지 않는다). 지수 감소는 ACTION_REDUCE 가 아니라 결과별 rewards 표를 따른다(한 번만, 행동 횟수에 들어간다).
//   takeSeconds: 막대를 꺼내 드는 시간, reachSeconds: 팔을 뻗어 불 위에 대는 시간(이 둘 동안은 Esc/E 로 취소할 수 있다). burntAt: 이 level 에 닿으면 꺼내지 않아도 자동으로 빼낸다(탄 결과).
//   round: 판마다 logic/marshmallow.js 의 makeRound 가 이 범위에서 뽑는다.
//     perfectCenter: 완벽 구간 한가운데 level 의 범위, perfectWidth: 완벽 구간 폭(level), goodMargin: 완벽 구간 양옆의 "좋음" 띠 폭(level),
//     perfectSeconds: 완벽 구간이 실제로 지속되는 시간(초, 이 범위가 곧 난이도), preSeconds: 불에 댄 뒤 완벽 구간이 열리기까지(초, 불꽃 튐이 없을 때),
//     postSpeed: 완벽 구간이 끝난 뒤 타오르는 속도 배율, knots/jitter: 앞부분 진행 속도를 들쭉날쭉하게 만드는 마디 수와 흔들림(0..1),
//     flareChance/flareSeconds/flareBoost/flareEarliest: 불이 튀는 사건(확률, 지속 초, 그동안 익는 속도 배율, 전체 길이의 이 비율 이전에는 나오지 않는다),
//     falseCues: 완벽 구간 전에 나오는 가짜 신호(잠깐 노릇해 보이거나 김이 나는) 개수 범위, cueSeconds: 가짜 신호 한 번의 길이 범위(초).
//   rewards: 결과별 지수 감소량(완벽 > 좋음 > 덜 익음·살짝 탐 > 숯덩이). gaugeSeconds: 게이지(가는 시간 줄)가 가득 차는 시간(판과 상관없는 고정값).
//   stages: level 이 from 에 닿을 때 한 줄 말한다(황금 구간 위치는 판마다 달라서 "지금이다" 같은 말은 하지 않는다). colors: [level, 색] 사이를 부드럽게 섞는다. shape: 처짐이 시작되는 level 과 가장 부푼 level.
//   eat: 꺼낸 뒤 입으로 가져가기·씹기·후련 자세의 길이(초). results: 결과별 멘트(20자 안팎). flareLine: 불이 튈 때 말풍선.
export const MARSHMALLOW = {
  takeSeconds: 1,
  reachSeconds: 1,
  burntAt: 0.92,
  round: {
    perfectCenter: [0.52, 0.62],
    perfectWidth: [0.06, 0.09],
    goodMargin: 0.04,
    perfectSeconds: [0.55, 0.85],
    preSeconds: [8.5, 14.5],
    postSpeed: 1.15,
    knots: 4,
    jitter: 0.35,
    flareChance: 0.75,
    flareSeconds: [0.9, 1.2],
    flareBoost: 2.4,
    flareEarliest: 0.15,
    falseCues: [2, 3],
    cueSeconds: [0.6, 1.0],
  },
  // 돌리기: 마시멜로는 sides 개의 면을 가진다. 불을 마주 보는 면이 가장 빨리(속도 sideSpeed) 익고 나머지 면은 ambientRate 비율로 천천히 익는다.
  // 굴리기: 마우스 버튼·Space 를 누르고 있는 동안 막대가 한 방향으로 일정한 속도(rollDegPerSec 도/초)로 굴러가고(양꼬치·통닭처럼) rollRampSeconds 동안 부드럽게 오르내린다.
  // 굴리는 동안은 열이 모든 면에 돌아가며 닿아 면마다 평균 비율이 낮아지므로 rollHeat 배로 보정한다(고르게 굽는 데 걸리는 시간이 가만히 굽는 것과 비슷하다). 결과는 면들의 평균 굽기로 가르고, 면 사이 차이(최댓값-최솟값)가 evenSpread 이하여야 "고르게"다.
  // 한쪽 탐: 고르지 않은데 가장 많이 익은 면이 unevenAt 이상(평균이 숯 전이면).
  sides: 3,
  rollDegPerSec: 300,
  rollRampSeconds: 0.12,
  rollHeat: 1.9,
  ambientRate: 0.3,
  sideSpeed: 1.7,
  evenSpread: 0.2,
  unevenAt: 0.75,
  rewards: { perfect: 12, good: 10, under: 8, over: 8, uneven: 8, burnt: 7 },
  gaugeSeconds: 20,
  stages: [
    { id: 'white', from: 0, line: '천천히… 천천히…' },
    { id: 'pale', from: 0.25, line: '오, 노릇노릇해지는 중!' },
    { id: 'golden', from: 0.45, line: '황금빛이 돈다… 잘 봐!' },
    { id: 'dark', from: 0.7, line: '앗, 너무 익는다…!' },
    { id: 'burnt', from: 0.92, line: '아아, 새까맣게…!' },
  ],
  colors: [[0, '#fffdf6'], [0.2, '#f5e4b8'], [0.45, '#e0a24a'], [0.58, '#c47a30'], [0.7, '#7b4721'], [0.92, '#1d1511']],
  shape: { sagFrom: 0.45, puffPeak: 0.65 },
  eat: { bringSeconds: 1, chewSeconds: 1.4, reliefSeconds: 1 },
  results: {
    perfect: '골고루 노릇노릇, 완벽한 굽기다! 스트레스가 녹는다!',
    good: '거의 완벽! 쫀득하고 달콤하다',
    under: '조금 덜 익었지만 맛있다',
    over: '살짝 탔지만 이것도 매력!',
    uneven: '앗, 한쪽만 숯이 됐네! 돌려줄걸~',
    burnt: '앗, 숯덩이가 됐다… 그래도 후련!',
  },
  flareLine: '앗, 불이 튀었다!',
};
// 마시멜로를 굽는 동안의 1인칭 시점: 궤도 카메라에서 enterSeconds 동안 부드럽게 캐릭터 눈높이로 옮기고, 끝나면 exitSeconds 동안 원래 궤도 상태 그대로 돌아온다.
//   fov: 1인칭 세로 시야각(도). eyeForward/eyeUp: 머리 뼈에서 눈까지의 앞·위 보정(단위). hideAt: 전환이 이 비율(0..1)을 넘으면 캐릭터 몸을 숨긴다(카메라가 머리 안에 들어가므로).
//   lookDeg: 마우스로 둘러볼 수 있는 최대 각도(좌우·상하), lookRate: 따라가는 속도. sway: 숨쉬기·손 흔들림 크기(단위).
export const FIRST_PERSON = { enterSeconds: 0.5, exitSeconds: 0.5, fov: 66, eyeForward: 0.12, eyeUp: 0.1, hideAt: 0.88, lookDeg: 12, lookRate: 6, sway: 0.012 };
export const FIRE_RANGE = 4.0;
export const SHREDDER_RANGE = 3.6;
export const SHREDDER_ZONE_RADIUS = 3.6; // 파쇄기 구역(파쇄만): 파쇄기 중심에서 이 거리 안이면 [1 파쇄][R 자동] 막대가 뜬다. 소각로와 6~8단위 떨어져 있어 구역이 거의 겹치지 않는다(겹치면 중심이 더 가까운 쪽)
// 세탁소 구역(세탁·널기): 구역 중심은 layout 의 세탁기 줄과 빨랫줄 사이(logic/zones.js)이고 이 반경 안에서 행동 막대가 보인다.
// WASHER_RANGE: 가장 가까운 세탁기 중심에서 이 거리 안이면 세탁이 켜진다. CLOTHESLINE_RANGE: 빨랫줄 중심에서 이 거리 안이면 널기가 켜진다.
export const LAUNDRY_ZONE_RADIUS = 4.5; // 구역 중심은 실내 세탁기 줄과 빨랫줄 사이(logic/zones.js)
export const WASHER_RANGE = 4.0;
export const CLOTHESLINE_RANGE = 4.0;
// 빨랫줄 칸 수: 파스텔 셔츠가 돌려 쓰는 공용 칸(shared) + 방 정원(MULTIPLAYER.roomCap)만큼의 개인 "내 셔츠" 칸(personal). 여러 명이 한 줄을 같이 쓰므로 줄이 길다(interiors.js 가 칸 수에 맞춰 줄 길이를 정한다).
export const CLOTHESLINE_SLOTS = { shared: 6, personal: 6 };

// ---- 세탁소 외관·실내가 함께 쓰는 팔레트(청록 · 크림 · 따뜻한 나무 · 흰색). 간판·차양·창틀·바닥·틀·가구가 모두 여기 색을 따른다. ----
export const LAUNDRY_LOOK = {
  teal: '#2c7a89', tealFrame: 0x35909e, tealDeep: 0x2a6f7b, tealSoft: '#a9d6da', tealStripe: '#2c8a99',
  cream: '#f3e4bf', creamBoard: 0xf4e9cd, creamWarm: 0xf0e2bc, stripeLight: '#f6efdc',
  wood: 0x8a5f3a, woodWarm: 0xc99a5b, woodDark: 0xa77a4a, terracotta: 0x9a5a3a,
  white: '#f6f1e6',
};

// ---- 세탁소 "빨 것" 5종(세탁 1 을 누르면 뜨는 선택 창의 1~5번 순서). 팀이 이 표를 고쳐 이름·멘트를 바꾼다(코드는 건드리지 않아도 된다). ----
//   id: 영문 고유 이름(분석 이벤트 wash_item 에 실린다). label: 선택 창 이름. display: 세탁기 위 LED 표시 글("…" 뒤에 점과 퍼센트가 붙는다, 14자 이하 권장).
//   lines: 세탁을 시작하며 한 줄 말한다(3~4개, 각 32자 이하). done: 다 빨린 뒤 한마디. icon: 선택 창 그림 { kind: 'smell'|'grime'|'sweat'|'ink'|'dust', color }(셔츠 위의 얼룩·구름).
export const LAUNDRY_ITEMS = [
  {
    id: 'firePlay', label: '불장난 그을음', display: '불장난 그을음 세탁 중',
    lines: ['소각장 불장난의 흔적, 박박!', '숯검정 묻은 소매도 깨끗하게~', '불 앞에서 놀았더니 이 꼴이네!', '그을음 싹, 새 마음으로 출발!'],
    done: '깨끗! 불장난 그을음 제거 완료!',
    icon: { kind: 'grime', color: '#4a4540' },
  },
  {
    id: 'monday', label: '월요일 냄새', display: '월요일 냄새 세탁 중',
    lines: ['월요일 냄새, 이제 안녕~', '월요일 아침의 퀴퀴함, 거품에 풍덩!', '일요일 밤의 한숨도 같이 빨자!', '출근길 지하철 냄새도 빠져라~'],
    done: '뽀송뽀송~ 월요일 냄새 제거 완료!',
    icon: { kind: 'smell', color: '#8fb06a' },
  },
  {
    id: 'allnighter', label: '밤샘작업 찌든 때', display: '밤샘작업 찌든 때 표백 중',
    lines: ['밤샘의 흔적을 박박!', '표백제 한 스푼, 걱정은 두 스푼 빠져라', '새벽까지 쓴 자소서 때, 싹 빼 준다!', '꿀잠 기운을 한 스푼 넣자~'],
    done: '새하얗게! 밤샘작업 찌든 때 표백 완료!',
    icon: { kind: 'grime', color: '#8a6a46' },
  },
  {
    id: 'nerves', label: '면접 긴장 얼룩', display: '긴장 얼룩 제거 중',
    lines: ['식은땀 자국, 거품으로 안녕~', '떨리던 손바닥 땀도 같이 빨자!', '면접장의 긴장을 헹궈 낸다~', '긴장은 물에 풀고 자신감만 남겨!'],
    done: '긴장 얼룩 싹~ 자신감만 남았다!',
    icon: { kind: 'sweat', color: '#6fb7e8' },
  },
  {
    id: 'ink', label: '자소서 잉크 얼룩', display: '잉크 얼룩 표백 중',
    lines: ['자소설 쓰다 묻은 잉크, 빠져라!', '볼펜 자국도 퇴고하듯 지운다~', '밤새 고친 흔적을 헹구자!', '번진 잉크는 이제 안녕~'],
    done: '잉크 얼룩 제거 완료! 새 문장처럼 깨끗!',
    icon: { kind: 'ink', color: '#3f5fb8' },
  },
];
// 널기(2)는 고르는 것 없이 이 멘트 중 하나를 말한다(3~4개, 각 32자 이하).
export const LAUNDRY_HANG = { lines: ['바람에 보송보송 말려 보자~', '향기 퐁퐁~', '구김 없이 쫙!', '햇살 한 줌 넣어서 말리자~'] };
// 세탁·널기 이펙트 시간표(초, 세탁기에 셔츠가 들어간 순간부터): seconds 세탁 연출 전체 길이, burstAt 향기 터지는 순간(표시 글은 여기서 "완료!"), bubbleEvery/sparkleEvery 올라오는 비누방울·반짝이 간격,
// hangSeconds 널기 물방울이 떨어지는 시간, hangTwinkleAt 셔츠가 자리 잡고 반짝이는 순간, dryPeriod/dryPulse 마른 내 셔츠의 반짝임 주기·길이.
export const LAUNDRY_FX = {
  seconds: 3.6, burstAt: 2.6, bubbleEvery: 0.2, sparkleEvery: 0.32, hangSeconds: 1.1, hangTwinkleAt: 0.7, dryPeriod: 1.8, dryPulse: 0.5,
};
// 옷 상태 연동(소각 -> 그을음 옷 -> 세탁 -> 나시 -> 새 셔츠 널기 -> 마르면 입기).
// DRY_SECONDS: 새 흰 셔츠를 빨랫줄에 널고 마르기까지 걸리는 시간(초, 실시간. 밖에 나가 있어도 센다).
// WEAR_SECONDS: 마른 새 셔츠를 입는 동작의 길이(초, 이동·입력은 잠긴다). WEAR_SWAP_AT: 그중 셔츠가 줄에서 사라지고 옷이 바뀌는 순간의 비율.
export const DRY_SECONDS = 8;

// 세탁소 순서 안내 문구(눌러도 아무 일 없는 짧은 힌트, 화면 아래 E 안내 줄에 뜬다). 순서: 1 세탁 -> 2 널기 -> 마를 때까지 기다리기 -> E 새 셔츠 입기. 팀이 자유롭게 수정한다.
// washing: 세탁 동작이 진행되는 동안(셔츠가 세탁기에 들어가 덜컹거릴 때까지), tank: 세탁이 끝나고 아직 빨랫줄에 널기 전. (마르는 중·입기 문구는 logic/outfit.js 의 outfitPrompt)
export const LAUNDRY_GUIDE = {
  washing: '세탁 중… 다 빨리면 빨랫줄에 널어요',
  washingItem: '{item} 세탁 중… 다 빨리면 빨랫줄에 널어요', // 고른 빨 것이 있을 때({item} 자리에 이름)
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
// items: 소각장(태우기 전용) 물건 목록, shredItems: 파쇄기(파쇄 전용) 서류 목록. 두 목록은 겹치지 않는다(선택 창에 각 목록의 순서대로 1~N 번호가 붙는다).
//   id: 영문 고유 이름(분석 이벤트 burn_item / shred_item 에 실린다, 두 목록 전체에서 하나뿐). label: 선택 창에 보이는 이름.
//   burn / shred: 그 행동으로 할 수 있으면 { lines: [멘트들] }(주머니에서 꺼낸 뒤 말풍선으로 한 줄 중얼거린다). 소각장 물건은 burn 만, 파쇄기 서류는 shred 만 가진다.
//   prop: 손에 드는 물건의 겉모습. kind('stack' 서류 뭉치 | 'notice' 불합격 통지서 | 'nag' 잔소리 쪽지 | 'workbook'·'booklet' 책 | 'pouch' 가루 주머니
//         | 서류 한 장: 'resume' 지원서·표 양식 | 'letter' 줄 친 문서 | 'mail' 출력한 웹 문서), title(머리글), accent(색), ball(구긴 공에 남는 표식 색), stamp(서류 한 장에 찍힌 빨간 도장 글씨, 선택).
//   flame: 불 색 효과 { tint: 'aurora', seconds } (오로라 가루: 불꽃이 오로라 빛으로 바뀌었다가 seconds 뒤 돌아온다).
// auroraFade: 오로라 불꽃의 번짐(in 초)·사그라듦(out 초: 끝나기 전)·클릭해서 되돌릴 때 걸리는 시간(returnSeconds).
export const INCINERATOR = {
  targetSeconds: 7.4,
  auroraFade: { in: 0.6, out: 2, returnSeconds: 1 },
  auroraChance: 0.12,
  // 소각장 물건 5종(태우기 전용, 선택 창의 1~5번 순서). 물건 하나: id, label(선택 창 이름), burn(lines = 멘트 3~5개, 32자 이하), prop(손에 드는 그림: kind·제목·색, solid 가 true 면 두툼해서 구기지 않고 통째로 던진다), flame(태울 때 불꽃 색을 잠깐 바꾼다).
  items: [
    {
      id: 'resume', label: '자소서·이력서 뭉치',
      burn: { lines: ['매번 고치고 새로 지어내는 것도 힘들다, 잠깐 쉴게', '또 처음부터 다시 쓰라고? 잠깐 쉴게!', '자소설 쓰느라 고생했다, 이제 쉴게~', '수정하고 또 수정… 오늘은 여기까지!', '내 새벽을 갈아 넣은 자소설, 안녕~'] },
      prop: { kind: 'stack', title: '자소서·이력서', accent: '#2f5fa8', ball: '#d3221c', solid: true },
    },
    {
      id: 'notice', label: '불합격 통지서',
      burn: { lines: ['불합격도 합격이다! 기죽지 말자', '불합격? 나도 너 불합격이야!', '불합격 통지서는 불쏘시개로 딱이지', '아쉽다고? 나도 아쉬워 죽겠다'] },
      prop: { kind: 'notice', title: '불합격 통지서', accent: '#2b3a67', ball: '#d3221c' },
    },
    {
      id: 'workbook', label: '인적성 검사 교재',
      burn: { lines: ['서류/면접준비도 힘든데 이젠 필기까지!? 쉽지 않네', '서류도 면접도 버거운데 필기까지… 잠깐 쉴게', '문제집은 불쏘시개가 제맛!', '정답이 뭐든 오늘은 재가 된다!'] },
      prop: { kind: 'workbook', title: '인적성 검사 완벽 대비', accent: '#1f6f8b', ball: '#1f6f8b', solid: true },
    },
    {
      id: 'nag', label: '취업 잔소리 쪽지',
      burn: { lines: ['힘 빠지는 잔소리는 프리패스! 응원만 받을게요', '걱정은 고맙지만 응원만 받을게요~', '취업은 언제 하니? 안 들려~', '잔소리는 불에 던져 버리자!'] },
      prop: { kind: 'nag', title: '취업 잔소리', accent: '#f2d64b', ball: '#f2d64b' },
    },
    {
      id: 'aurora', label: '오로라 가루',
      burn: { lines: ['근심아, 오로라로 날아가라~', '반짝반짝 오로라 한 줌!', '스트레스야, 빛이 되어라~', '통째로 던진다, 오로라 주머니!'] },
      prop: { kind: 'pouch', title: '오로라 가루', accent: '#7a5cc8', ball: '#7a5cc8', solid: true },
      flame: { tint: 'aurora', seconds: 15 },
    },
  ],
  // 파쇄기 전용 서류 5종(파쇄 전용, 선택 창의 1~5번 순서): 소각장 물건과 겹치지 않는, 취준생이 잘게 갈아 버리고 싶은 서류 한 장들. shred.lines = 멘트 3~5개(32자 이하).
  shredItems: [
    {
      id: 'app_copy', label: '지원서 출력 사본',
      shred: { lines: ['출력만 하고 못 낸 지원서, 안녕~', '사본은 필요 없어, 원본은 나니까!', '마감 1분 전의 기억, 가루로!', '지원서 사본, 잘게 갈아 준다!'] },
      prop: { kind: 'resume', title: '입사지원서', accent: '#3b5998', ball: '#3b5998', stamp: '사본' },
    },
    {
      id: 'eval_sheet', label: '탈락 면접 평가표',
      shred: { lines: ['평가는 내가 할게, 넌 가루 해!', '점수표는 숫자일 뿐, 나는 사람이다!', '압박 면접 기억도 싹둑싹둑~', '다음 면접은 내가 이긴다!'] },
      prop: { kind: 'letter', title: '면접 평가표', accent: '#7a2e3a', ball: '#7a2e3a', stamp: '탈락' },
    },
    {
      id: 'spec_sheet', label: '스펙 정리표·증명서 사본',
      shred: { lines: ['남이랑 스펙 비교는 그만, 싹둑!', '스펙보다 나다움이 먼저야~', '증명서 사본은 서랍 말고 파쇄기로!', '줄 세우는 스펙표, 가루가 되어라'] },
      prop: { kind: 'resume', title: '나의 스펙 정리표', accent: '#2e7d4f', ball: '#2e7d4f', stamp: '사본' },
    },
    {
      id: 'wrong_notes', label: '인적성 오답 노트 출력본',
      shred: { lines: ['틀린 문제는 여기서 끝!', '도형 회전은 파쇄기가 돌려 줄게~', '오답은 가루로, 정답은 머리로!', '시간 부족? 파쇄는 순식간이지!'] },
      prop: { kind: 'letter', title: '인적성 오답 노트', accent: '#1f6f8b', ball: '#1f6f8b', stamp: '오답' },
    },
    {
      id: 'job_post', label: '마감 지난 채용공고 스크랩',
      shred: { lines: ['놓친 공고는 잊자, 새 공고가 온다!', '마감 지난 미련도 같이 갈아~', '우대사항이 왜 이렇게 길어, 싹둑!'] },
      prop: { kind: 'mail', title: '채용공고 스크랩', accent: '#c2484a', ball: '#c2484a', stamp: '마감' },
    },
  ],
};

// 소원 조각상(면접장과 세탁소 사이 골목): E 로 작은 입력 창을 열어 취업 희망·목표·소원을 적고 빈다. 적은 글은 이 화면에만 잠깐 쓰이고 서버·분석·말풍선 어디에도 보내지 않는다.
// maxLength: 최대 글자 수, cooldownSeconds: 소원 사이 최소 간격(초, 도배 방지: 간격 안에서는 창이 열리지 않는다), maxStones: 조각상 발치에 쌓이는 돌의 최대 개수(돌 개수는 이 브라우저에 기억한다),
// cheers: 소원을 빈 뒤 말풍선 응원 한 줄(32자 이하), wait: 쿨다운 중에 E 를 누르면 보이는 말풍선({s} 자리에 남은 초).
export const WISH = {
  maxLength: 40,
  cooldownSeconds: 10,
  maxStones: 12,
  storageKey: 'catchworld.wishStones',
  cheers: [
    '소원 접수 완료!\n좋은 소식이 오고 있어요',
    '돌 하나만큼\n꿈에 가까워졌어요',
    '그 마음이면\n반드시 닿을 거예요',
    '오늘의 소원,\n조각상이 꼭 기억할게요',
    '천천히 가도 괜찮아요,\n방향이 맞으니까',
    '적은 만큼 이루어지는\n날이 올 거예요',
  ],
  wait: '조금 있다가 다시 빌어 주세요 ({s}초)',
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
  background: 0xe9f2ee, hemiSky: 0xf8fcfa, hemiGround: 0xc4cfc9, hemi: 1.25,
  lamp: 0xfff9ee, lampIntensity: 9, lampDistance: 12, sun: 0.7, sunColor: 0xfff8ec,
  floor: { a: '#f4ead2', b: '#a9d6da', line: 'rgba(44, 122, 137, 0.28)', speckle: false, roughness: 0.55, glow: 0.22 }, // 외관의 크림·청록 체크 타일
  baseboard: 0xb7c2ca,
  sign: { board: 0xf4e9cd, bg: '#2c7a89', border: '#f3e4bf', text: '#f3e4bf', brushed: false }, // 외관 간판과 같은 청록 판 + 크림 글씨(그림은 interiorLaundry.js 가 외관과 같은 캔버스로 그린다)
  materials: {
    table: { wood: 0xf0e2bc },
    benchCushion: { wood: 0xf0e2bc, carpet: 0x35909e },
    pottedPlant: { wood: 0x9a5a3a, woodDark: 0x7a3f28 },
    trashcan: { metal: 0xe9ddbd, metalDark: 0x35909e },
    cardboardBoxOpen: { wood: 0xc99a5b, woodDark: 0xa77a4a },
    lampRoundFloor: { metal: 0xe9ddbd, lamp: 0xfff6e0 },
    rugRectangle: { carpet: 0x7fc3cb, carpetDarker: 0x5aa9b4 },
  },
  glass: {
    frame: 0x35909e, frameDark: 0x2a6f7b, // 외관 문틀과 같은 청록
    texture: {
      wall: ['#f8fdfb', '#e9f5f1', '#d7ebe6'], low: ['#e4f2f1', '#d2e9e8', '#c0e0e1'], window: ['#fcfffd', '#eff9f6', '#dcf0ee'],
    },
    sheen: { wall: 0.5, low: 0.4, window: 0.8 },
    roughness: 0.42, clearcoat: 0.55, emissive: 0xd3ece6, emissiveIntensity: 0.32,
    openTag: true, // 출입문 안쪽의 "OPEN" 표시(외관 문과 같다)
  },
  clothesline: { post: 0x8a5f3a, pin: 0x35909e },
  valance: true, // 세탁기 줄 위의 청록·크림 줄무늬 차양(외관 차양과 같다)
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
  sign: { board: 0x14213d, bg: '#1d3157', border: '#c8d2e0', text: '#ffffff', face: 'corp', shadow: 'rgba(5,12,30,0.5)' },
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
// INTERVIEW_BONUS_RANGE: 완주 보너스로 한 번 더 줄어드는 지수의 범위(양끝 포함, 균형 조정 대상). 답변·돌발행동 한 번의 감소량은 다른 행동처럼 REDUCE_RANGE 에서 뽑는다.
export const INTERVIEW_ROUND = 5;
export const INTERVIEW_BONUS_RANGE = { min: 10, max: 12 };
// 면접 연출 시간(초). 답변 한 번 = 답하는 동작 + 면접관 반응 합쳐 INTERVIEW_ANSWER_SECONDS, 돌발행동 하나 = INTERVIEW_IMPROV_SECONDS(다른 행동의 ACTION_TARGET_SECONDS 와 비슷하게).
// INTERVIEW_FINALE_SECONDS: 5문항 완주 때 이어지는 "일어나 박수 + 최종 합격!" 연출. SPEECH_SECONDS: 말풍선 하나가 떠 있는 시간.
export const INTERVIEW_ANSWER_SECONDS = 5;
export const INTERVIEW_IMPROV_SECONDS = 5;
export const INTERVIEW_FINALE_SECONDS = 3.6;
export const SPEECH_SECONDS = 2.3;

// 면접장의 모든 글(질문·답변·면접관 반응·돌발행동·첫 대사). 팀이 자유롭게 고쳐 쓴다 (초안).
// - 면접관 id: leader(엄격한 팀장) / hr(친절한 척하는 인사담당) / mentor(말수 적은 예비 사수: 같이 일할 선배, 속으론 진심으로 응원하고 가끔 현실적인 한마디). model 은 캐릭터 모델 이름이다.
// - questions: 12개. asker 는 원래 질문자 표시(초안 문체의 기준)이고, 담당 면접관제에서는 지원자가 앉은 의자의 담당 면접관이 어느 질문이든 던진다. answers 는 정확히 모범형/4차원형/속마음형 하나씩(번호 0~2, 키 1~3), text 는 40자 안팎(버튼과 말풍선에 그대로 뜬다).
//   모범형 = 정석 답변, 4차원형 = 엉뚱한 답변, 속마음형 = 현실 취준생의 솔직한 속마음을 소리 내어 말하는 답(38자 이내).
//   inner: 모범형 답에만 붙는 속마음(36자 이내, 4차원형·속마음형에는 없다). 말풍선 뒤 0.6초에 생각 구름으로 따로 뜬다(말 못 한 진짜 마음). 속마음형 답은 그 마음을 소리 내어 말하는 것이라 inner 가 없다.
// - reactions: 답변 종류 > 면접관 > 반응 스타일(당황·당혹·황당·유쾌·감탄)별 대사 후보(28자 이내, 스타일당 2개 이상, 면접관·종류당 합쳐 4개 이상). 어떤 스타일이 나올지는 logic/interview.js 의 REACTION_MIX 가중치로 정하고, 스타일에 맞는 동작·소품·효과가 함께 나온다.
// - improvs: 돌발행동 9개. id 는 코드의 연출 이름이라 바꾸지 말고, 대사(player/leader/hr/mentor)만 고친다. player 는 차례로 나오는 말풍선이다.
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
    모범형: ['오~', '좋네요.', '음, 괜찮네.'],
    '4차원형': ['푸핫!', '크흠...', '허...'],
    속마음형: ['헉!', '푸흡...', '(끄덕)'],
    improv: ['어머...', '허...', '이런.'],
  },
  cancelLabel: '다음에 할게요',
  types: ['모범형', '4차원형', '속마음형'],
  questions: [
    {
      asker: 'leader', text: '1분 자기소개 부탁드립니다.',
      answers: [
        { type: '모범형', text: '끈기 있게 끝까지 해내는 지원자입니다.', inner: '(사실 어제 새벽 3시까지 자소서 고쳤다…)' },
        { type: '4차원형', text: '저는 이력서 한 장에 안 접히는 사람입니다!' },
        { type: '속마음형', text: '솔직히 자소서는 AI 도움 좀 받았습니다. 소개는 직접요!' },
      ],
    },
    {
      asker: 'hr', text: '저희 회사에 지원한 이유가 뭔가요~?',
      answers: [
        { type: '모범형', text: '제 목표와 회사의 방향이 같다고 느꼈습니다.', inner: '(공고문 외운 티 내면 안 돼…)' },
        { type: '4차원형', text: '운명입니다. 지원 버튼이 저를 불렀어요.' },
        { type: '속마음형', text: '솔직히 월급 보고 지원했습니다. 죄송합니다!' },
      ],
    },
    {
      asker: 'leader', text: '본인의 단점을 말씀해 주세요.',
      answers: [
        { type: '모범형', text: '꼼꼼해서 오래 걸리지만 일정표로 보완합니다.', inner: '(단점 없는 게 단점인 척하는 중)' },
        { type: '4차원형', text: '눈부신 매력이 단점입니다. 선글라스 필수예요.' },
        { type: '속마음형', text: '아침잠이 많습니다. 알람 7개 맞춰 놨어요.' },
      ],
    },
    {
      asker: 'hr', text: '5년 뒤에는 어떤 모습일까요~?',
      answers: [
        { type: '모범형', text: '이 분야의 믿음직한 전문가로 성장하겠습니다.', inner: '(5년 뒤엔 정시 퇴근하고 싶다)' },
        { type: '4차원형', text: '5년 뒤엔 저 자리에서 질문하고 있겠습니다!' },
        { type: '속마음형', text: '솔직히 5년 뒤엔 월급 오르고 정시 퇴근이요!' },
      ],
    },
    {
      asker: 'leader', text: '저희가 왜 지원자를 뽑아야 하죠?',
      answers: [
        { type: '모범형', text: '맡은 일을 책임지고 끝내는 사람이니까요.', inner: '(나도 내가 왜 뽑혀야 하는지 궁금)' },
        { type: '4차원형', text: '저를 안 뽑으면 이 의자가 서운해합니다.' },
        { type: '속마음형', text: '일단 붙여만 주시면 정말 감사하겠습니다!' },
      ],
    },
    {
      asker: 'mentor', text: '이 볼펜, 한번 팔아 보세요. 저도 궁금해서요.',
      answers: [
        { type: '모범형', text: '매끄럽게 써져서 일이 즐거워지는 볼펜입니다.', inner: '(이 볼펜, 사실 아까 처음 만져 봤다)' },
        { type: '4차원형', text: '이 볼펜으로 서명하면 합격이 따라옵니다!' },
        { type: '속마음형', text: '사실 자소서 쓰다가 이 볼펜 세 자루 닳았어요.' },
      ],
    },
    {
      asker: 'mentor', text: '저희 팀은 가끔 회식을 하는데, 괜찮으세요?',
      answers: [
        { type: '모범형', text: '팀워크를 다지는 자리라면 기쁘게 참석하겠습니다.', inner: '(회식보단 집에 가는 게 제일 좋다)' },
        { type: '4차원형', text: '회식 자리의 분위기 메이커, 제가 접니다!' },
        { type: '속마음형', text: '솔직히 회식은 1차까지만 가고 싶어요.' },
      ],
    },
    {
      asker: 'hr', text: '가장 크게 실패했던 경험은요~?',
      answers: [
        { type: '모범형', text: '실패에서 원인을 찾아 같은 실수를 줄였습니다.', inner: '(그날 밤새 이불킥한 건 비밀)' },
        { type: '4차원형', text: '라면 물 조절 실패요. 인생을 배웠습니다.' },
        { type: '속마음형', text: '사실 서류에서 마흔 번 넘게 떨어졌습니다.' },
      ],
    },
    {
      asker: 'leader', text: '마지막으로 하고 싶은 말이 있나요?',
      answers: [
        { type: '모범형', text: '기회를 주셔서 감사합니다. 최선을 다하겠습니다.', inner: '(빨리 끝내고 치킨 먹고 싶다)' },
        { type: '4차원형', text: '합격하면 커피는 제가 쏘겠습니다. 월급 받고요!' },
        { type: '속마음형', text: '사실 여기 말고 다섯 군데 더 냈어요. 합격 주세요!' },
      ],
    },
    {
      asker: 'hr', text: '동료와 의견이 다르면 어떻게 하시겠어요~?',
      answers: [
        { type: '모범형', text: '근거를 정리해 차분히 의견을 맞춰 가겠습니다.', inner: '(속으론 단톡방에 하소연 중)' },
        { type: '4차원형', text: '가위바위보로... 아니, 대화로 풀겠습니다!' },
        { type: '속마음형', text: '솔직히 일단 참고, 퇴근길에 친구한테 하소연해요.' },
      ],
    },
    {
      asker: 'leader', text: '급한 일이 생겨 야근이 필요하다면?',
      answers: [
        { type: '모범형', text: '필요한 일이라면 책임감을 갖고 임하겠습니다.', inner: '(말은 이래도 마음은 이미 퇴근)' },
        { type: '4차원형', text: '야근엔 저의 숨은 야식 레이더가 빛납니다!' },
        { type: '속마음형', text: '솔직히 야근수당만 정확히 주시면 괜찮습니다.' },
      ],
    },
    {
      asker: 'mentor', text: '같이 일할 사이니까 묻는데, 동물로 치면 뭐예요?',
      answers: [
        { type: '모범형', text: '꾸준히 걷는 거북이입니다. 끝까지 갑니다.', inner: '(사실 거북이처럼 숨고 싶다)' },
        { type: '4차원형', text: '저는 합격을 물어 오는 리트리버입니다. 멍!' },
        { type: '속마음형', text: '솔직히 지금은 떨고 있는 새끼 사슴입니다.' },
      ],
    },
  ],
  reactions: {
    // 답변 종류 > 면접관 > 반응 스타일(당황 허둥지둥 / 당혹 얼어붙음 / 황당 턱이 빠짐 / 유쾌 폭소·박수 / 감탄 "어?"). 어떤 스타일이 나올지는 logic/interview.js 의 REACTION_MIX 가중치(종류·면접관마다)로 정한다.
    // 팀장은 엄격하고 체면을 차리고, 인사담당은 친절한 척하고, 예비 사수는 조용하지만 공감한다.
    모범형: {
      leader: {
        유쾌: ['흠, 합격점입니다. 박수!', '이런 지원자를 기다렸습니다!', '기본기가 아주 좋군요. 하하!'],
        감탄: ['어? 이 정도일 줄은...', '오... 예상보다 훨씬 낫군요.', '어? 준비 단단히 하셨네.'],
      },
      hr: {
        유쾌: ['어머~ 박수 짝짝짝!', '완벽해요~ 제가 다 뿌듯해요!', '꺄~ 모범 답안이에요~!'],
        감탄: ['어머, 정말요? 대단하세요~', '어머나! 이렇게 잘하셔도 돼요?', '어? 우와~ 진짜 훌륭하세요~'],
      },
      mentor: {
        유쾌: ['(작게) 오, 든든하네요.', '좋아요. 엄지 척입니다.', '(조용히 박수) 잘하셨어요.'],
        감탄: ['어? 말씀 정말 잘하시네요.', '오... 이건 예상 못 했네요.', '어, 방금 좀 멋졌어요.'],
      },
    },
    '4차원형': {
      leader: {
        황당: ['잠깐, 방금... 뭐라고요?', '이게 면접 답변입니까...!', '허... 말문이 막히는군요.'],
        당혹: ['...지금 제가 뭘 들은 거죠?', '그, 그게 무슨 뜻입니까?', '크흠... 다시 한 번만...'],
        유쾌: ['푸핫! ...크흠, 계속하죠.', '웃으면 안 되는데... 푸흡!', '허허, 이거 참 기가 막히네.'],
      },
      hr: {
        황당: ['어머나, 이게 무슨 소리예요?!', '네?! 지금 뭐라고 하셨죠~?', '어머... 턱이 빠질 뻔했어요~'],
        당혹: ['아, 네... 네에~ 호호... 네...', '어머, 저... 뭐라고 받죠~?', '(웃음이 굳었다) 호, 호호...'],
        유쾌: ['꺄하하! 너무 웃겨요~!', '호호호! 이건 꼭 적어 둘게요!', '아 배 아파~ 하하하!'],
      },
      mentor: {
        황당: ['...네? 방금 뭐라고...', '(펜을 떨어뜨렸다) 아, 죄송.', '...저, 지금 잘못 들은 거죠?'],
        당혹: ['...(헛기침) 독특하시네요.', '음... 그렇게 오셨군요.', '...일단 메모는 해 둘게요.'],
        유쾌: ['...푸흡. 아, 아닙니다.', '재밌네요. 우리 팀에 딱이에요.', '(작게) 이거 꽤 웃기네요.'],
      },
    },
    // 속마음형: 평소엔 절대 못 할 현실 취준생의 속마음. 팀장은 허둥대거나 얼어붙고, 인사담당과 예비 사수는 가끔 터지거나("저도 그래요!") 몰래 공감한다.
    속마음형: {
      leader: {
        당황: ['어, 어디 보자... 서류가...!', '그, 그건 못 들은 걸로 하죠!', '자, 잠깐만요! 잠깐만!'],
        당혹: ['...(얼어붙어 말이 없다)', '지금 그 말... 진심입니까?', '...솔직하시군요. 너무.'],
        황당: ['면접에서 그런 말을 합니까?!', '허... 이런 답변은 처음이네.', '아니, 그걸 왜 지금 말합니까!'],
      },
      hr: {
        당황: ['어머어머! 이걸 어쩌죠~!', '어, 어머나! 서류가~!', '꺄악! 저, 저도 당황했어요~'],
        당혹: ['어머... 솔직하시네요... 호호...', '아, 네... 적, 적어 둘게요...', '(웃는 얼굴로 굳어 버렸다)'],
        황당: ['어머, 그걸 소리 내어 말하네요?!', '네에?! 정말 솔직하시네요~!', '어머나, 간이 크시네요~!'],
        유쾌: ['꺄하하! 저도 그래요~!', '호호호! 솔직해서 너무 좋아요~!', '맞아요~ 다들 그렇죠 뭐~!'],
      },
      mentor: {
        당황: ['(펜을 떨어뜨리며) 아, 어...', '어, 어... 저는 못 들었어요.', '(허둥대며) 저는 아무 말도...'],
        당혹: ['...(조용히 고개를 돌린다)', '...저도 그래요. 쉿.', '(헛기침) 아... 네, 알겠어요.'],
        황당: ['...와. 그걸 말하시네요.', '(입이 벌어진다) ...대단하네요.', '...진짜 솔직하시군요.'],
        유쾌: ['저도 그래요! ...아, 쉿.', '(엄지 척) 후련하겠어요.', '푸흡... 공감 백 퍼센트.'],
      },
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
    {
      id: 'stamp', title: '합격 도장 쾅',
      player: ['합격! 합격! 합격!', '이 서류도 합격! 저도 합격!'],
      leader: '그 도장은 제 건데요...?', hr: '어머, 도장 소리가 시원하네요~', mentor: '도장은 제자리에 두고 가세요. 후련해 보이긴 하네요.',
    },
    {
      id: 'plane', title: '종이비행기',
      player: ['이력서가... 날아갑니다!', '합격 비행기, 착륙 부탁드려요!'],
      leader: '으악, 이력서가 제 이마에...!', hr: '어머나~ 멀리 날았네요!', mentor: '각도가 좋았어요. 비행기는 접어 둘게요.',
    },
    {
      id: 'shades', title: '선글라스 360도',
      player: ['휘이이잉~ 한 바퀴 돕니다!', '자소서 말고 제 매력을 보세요.'],
      leader: '실내에서 선글라스는... 왜 멋있죠...', hr: '꺄! 연예인 같아요~', mentor: '...눈부시긴 하네요. 진짜로요.',
    },
    {
      id: 'bow', title: '큰절',
      player: ['큰절 올리겠습니다!', '합격시켜 주세요!'],
      leader: '일어나세요... 저도 맞절을...', hr: '어머나, 저도 절할게요~', mentor: '(같이 고개를 숙인다) 마음은 전해졌어요.',
    },
    {
      id: 'song', title: '노래 한 소절',
      player: ['합격만 시켜줘~ 라라라~', '월급날만 기다려요~ 랄랄라~'],
      leader: '...음정이... 아니, 계속하세요.', hr: '앙코르! 앙코르~!', mentor: '(박수 치며) 후렴이 중독성 있네요.',
    },
  ],
};

// ---- 멀티플레이(다른 방문자 아바타 보기) ----
// 같은 공간(마당·세탁소·면접장)에 동시에 있는 방문자를 실시간 아바타로 보여 준다. 채팅·충돌·이펙트 공유는 없고, 스트레스 지수는 각자 개인 것이다.
// 공유되는 정보는 임의로 만든 닉네임·위치·방향·동작·옷 상태뿐이다(개인정보 아님). 끄려면 enabled: false. 접속 주소 뒤에 ?mp=off 를 붙이면 그 탭에서만 끈다.
// transport: 'supabase'(실서비스: Supabase Realtime) | 'local'(같은 브라우저의 탭끼리 BroadcastChannel, 개발·시험용. 접속 주소에 ?mp=local 을 붙이면 이 탭에서만 local 로 바꾼다. 시작할 때 한 번만 읽는다).
//   'supabase' 인데 아래 SUPABASE_URL / SUPABASE_ANON_KEY 가 비어 있으면 아무 일도 하지 않고(요청도 없다) 조용히 꺼진다.
// ---- 전송량(무료 요금제 한도: 프로젝트 전체 초당 약 100 메시지·월 약 200만) ----
// 실측: 5명이 15분 내내 움직이면 "이벤트 방송" 약 20,700건/시간(초당 약 23건)이었다 = 서로 한 쌍(보내는 사람 -> 받는 사람)당 초당 약 1.15건(옛 방식: 3Hz 시계 전송).
// 어림 공식(초당 전달 메시지 수 = 서버가 세는 값): 초당 전달 ≈ 인원 × (방 정원 - 1) × 쌍당 초당 전송.  쌍당 초당 전송 = 한 사람이 1초에 보내는 메시지 수.
//   옛 방식(1.15, 정원 6, 60명 모두 이동): 60 × 5 × 1.15 ≈ 345/초(한도 초과). 새 방식(정원 4, 사람당 초당 0.3 이하): 60 × 3 × 0.3 ≈ 54/초 + 서 있는 사람 하트비트. 계산은 logic/netBudget.js.
// 새 방식(dead reckoning): 위치를 시계로 보내지 않는다. 받는 쪽이 "마지막 위치 + 속도"로 이어서 그리고, 내 입력(걷기 시작·멈춤·방향 꺾임·속도 변화·동작·옷·앉기·공간)이 바뀌거나 예측과 실제가 벌어질 때만 보낸다.
// 발표 때 보낼 양이 더 모자라면(한도 근처) 이 값들을 키운다: sustainedHz(평균 상한, 가장 직접적) -> roomCap(작게) -> heartbeatMs/heartbeatMovingMs(크게).
// sendHz: 방향이 자주 바뀌는 순간에도 이동 메시지는 초당 이만큼(4회)을 넘지 않는다(minGapMs 이상 간격: 250ms). sustainedHz: 오래 평균으로 사람당 초당 이 횟수를 넘지 않는다(토큰 통, 순간 burst 개 모아 쓴다).
//   -> 오래 계속 지그재그로 움직여도 사람당 초당 약 0.3건. 그만큼 모자란 정확도는 받는 쪽이 부드럽게 보정한다(오차가 커도 teleportDist 전에는 순간이동하지 않고 스프링처럼 따라붙는다).
// heartbeatMs: 서 있을 때 이 간격(ms)마다 한 번(소식 확인·위치 보정). heartbeatMovingMs: 걷는 중(곧게 걸으면 아무것도 안 보내므로)이 간격마다 한 번. 같은 공간에 다른 사람이 없으면 아무것도 보내지 않는다.
// epsPos: 받는 쪽이 그릴 예측 위치와 내 실제 위치가 이만큼(단위) 넘게 벌어지면 보낸다(플레이어 속도 4). epsRot: 걷는 방향이 이만큼(라디안, 0.35 ≈ 20도) 넘게 꺾이면, epsSpeed: 속도가 이 비율(0.3 = 30%) 넘게 바뀌면 보낸다.
// settleMs: 걷기 시작·방향·속도 변화가 이만큼(ms) 계속될 때 보낸다(속도 추정이 안정된 뒤라 값이 정확하다). minGapMs: 공간·동작·옷이 바뀌어 즉시 보낼 때도 이 간격은 둔다.
// maxExtrapMs: 받는 쪽이 마지막 메시지 뒤로 최대 이만큼(ms)까지 속도로 이어 그리고 그 뒤로는 멈춘다(heartbeatMovingMs 보다 커야 곧게 걷는 사람이 끊기지 않는다). 공간 경계 밖으로는 나가지 않는다. smoothOmega: 보정 속도(클수록 빠름, 임계 감쇠).
// 비상 조치(발표 당일): 위의 enabled 를 false 로 올리면 접속한 모든 사람의 멀티플레이가 즉시 꺼진다(게임은 정상). 일부만 줄이려면 roomCap 을 낮춘다(주소 ?mpcap=N 은 시험용으로 그 탭만).
// maxRemote: 한 번에 그리는 다른 방문자 수의 최대(가까운 순). maxTracked: 메시지를 받아 기억해 두는 방문자 수의 최대(악의적 폭주 방지). minRecvGapMs: 한 방문자가 이 간격(ms)보다 촘촘히 보내는 메시지는 버린다(정상 전송은 minGapMs 250 이상 간격).
// interpDelayMs: (옛 클라이언트와 섞여 있을 때만 쓴다: 옛 방식 메시지는 속도가 없어 이만큼 과거 위치로 보간한다. 옛 3Hz 전송 주기 약 333ms 에 맞춘다.) extrapolateMs: 다음 메시지가 늦을 때 걷는 방향으로 더 내다보는 최대 시간(ms). teleportDist: 이 거리(단위) 이상 한 번에 움직이면 보간 없이 곧장 옮긴다(공간이 바뀌어도 마찬가지).
// staleMs: (서 있는 사람은 heartbeatMs 마다 보내므로 그 2배보다 길어야 한다) 이 시간(ms) 동안 메시지가 없으면(서 있는 사람은 heartbeatMs 마다 보내므로 그 2배보다 길어야 한다) 그 방문자를 지운다. 닉네임 규칙(2~10자, 허용 글자, 금칙어)은 logic/nick.js.
// 방 샤딩: 한 공간을 roomCap 명 단위의 방(<공간>-1, <공간>-2, ...)으로 나눈다(전달 메시지 수가 방 인원의 제곱에 비례해서 무료 한도를 지키기 위함). 발표(약 60명)에서는 정원 4 + 공간마다 최대 20개 방(maxShards). 발표(약 60명)에서는 정원 4 + 공간마다 최대 20개 방(maxShards).
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
  sendHz: 4, minGapMs: 250, sustainedHz: 0.25, burst: 3, heartbeatMs: 10000, heartbeatMovingMs: 4000, epsPos: 0.8, epsRot: 0.35, epsSpeed: 0.3, settleMs: 120,
  maxRemote: 20, maxTracked: 60, minRecvGapMs: 100,
  interpDelayMs: 250, extrapolateMs: 150, maxExtrapMs: 6500, smoothOmega: 9, teleportDist: 8,
  staleMs: 25000,
  chatGapMs: 2000, chatGlobalMax: 6, chatGlobalWindowMs: 3000,
  roomCap: 4, maxShards: 20, shardProbeMs: 700, fullRetryMs: 60000, idleMs: 5 * 60 * 1000,
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

// 첫 접속 튜토리얼과 "오늘의 힐링 코스" 체크리스트 문구·수치. 팀이 자유롭게 고친다(글은 짧게: 카드는 두 줄 안팎). {keys}·{key1} 은 키 모양 그림으로 바뀐다.
export const TUTORIAL = {
  intro: {
    title: '캐치월드에 온 것을 환영해요!',
    lines: [
      '취업 준비하며 꽉 찬 스트레스 지수!',
      '태우고, 세탁하고, 속마음을 표출하며\n마음껏 힐링해 보세요.',
      '발밑 돌길을 따라 걸으면\n곳곳에서 E 키가 떠요.',
    ],
    note: '(캐치와 무관한 학사 과제용 비공식 프로젝트예요)',
    start: '시작하기',
    skip: '건너뛰기',
  },
  steps: {
    move: '바닥을 클릭하거나 {keys} 로 움직여 보세요',
    fire: '저 모닥불 쪽으로 가 보세요',
    burn: '{key1} 키를 눌러 태울 물건을 골라 보세요',
    congrats: '스트레스 지수가 줄었어요!',
    congratsSub: '위쪽 지수가 낮아질수록 마음이 가벼워져요',
    skip: '건너뛰기',
  },
  hintBubble: { text: '👈 항목을 눌러 가는 방향을 확인해 보세요', seconds: 5 }, // 처음 시작 직후 체크리스트 옆에 잠깐 뜨는 말풍선
  moveDistance: 2.5, // 걸어서 이만큼(월드 단위) 움직이면 1단계 완료
  congratsSeconds: 4.5, // 축하 줄을 보여 주는 시간
  arriveRadius: 2.2, // 체크리스트 길안내 화살표: 목표에 이만큼 가까워지면 사라진다
  pinHeight: 3.0, // 목표 위에 뜨는 화살표 높이
  course: {
    title: '오늘의 힐링 코스',
    sub: '항목을 누르면 가는 방향을 알려 줘요',
    celebrate: '힐링 코스 완주! 오늘도 수고했어요, 마음이 한결 가벼워졌길 바라요.',
    celebrateSeconds: 7,
    items: [
      { id: 'burn', icon: '🔥', label: '소각장 태우기', hint: '모닥불 앞에서 1 키로 서류 태우기', needs: ['burn'] },
      { id: 'laundry', icon: '🧺', label: '마음 세탁소', hint: '세탁 → 널기 → 새 셔츠 입기', needs: ['wash', 'hang', 'wear'] },
      { id: 'interview', icon: '🎤', label: '캐치 면접장', hint: '문 앞에서 E 키로 입장', needs: ['interview'] },
      { id: 'fortune', icon: '🥠', label: '포춘쿠키 상점', hint: '노점 앞에서 E 키로 쿠키 깨기', needs: ['fortune'] },
      { id: 'marshmallow', icon: '🍡', label: '마시멜로 굽기', hint: '통나무에 앉아 마시멜로 굽기', needs: ['marshmallow'] },
    ],
  },
};
