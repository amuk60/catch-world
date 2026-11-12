// 종료 화면(CTA)·공유 문구 (순수).
const pad = (n) => String(n).padStart(2, '0');

// 목표 달성 문구. stress 는 그 순간의 지수.
export function ctaMessage(stress) {
  return {
    title: '소각 완료!',
    line1: `스트레스 지수 ${stress}! 이제 새 시작할 준비 끝.`,
    line2: '다음 지원서는 캐치가 같이 찾아드릴게요!',
  };
}

// 측면 팝업(목표 달성) 문구.
export const goalMessage = (stress) => ({ ...ctaMessage(stress), title: '목표 달성!' });

// 가운데 팝업(지수 0) 문구.
export function emptyMessage() {
  return {
    title: '소각 완료!',
    line1: '스트레스 지수 0! 마음이 한결 가벼워졌죠?',
    line2: '다음 지원서는 캐치가 같이 찾아드릴게요!',
  };
}

// apply() 의 결과로 어떤 팝업을 띄울지: 0 이 되면 가운데 팝업('modal', 목표와 동시여도 이것만), 목표만 넘으면 측면 팝업('side').
export function resultPlan({ justGoal, justEmpty }) {
  if (justEmpty) return 'modal';
  return justGoal ? 'side' : 'none';
}

// 공유 이미지에 쓰는 문구. actionsDone 이 0 이면(불멍으로 클리어) 불멍 문구.
export function shareLines(stress, actionsDone, start) {
  return {
    title: '번아웃 소각 완료!',
    delta: `스트레스 지수 ${start} → ${stress}`,
    detail: actionsDone > 0 ? `${actionsDone}번의 소각으로 후련해졌어요` : '불멍으로 후련해졌어요',
    tagline: '다음 지원서는 캐치와 함께',
  };
}

// catch-world-YYYYMMDD.png (로컬 날짜)
export function shareFilename(date) {
  return `catch-world-${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}.png`;
}

// 공유할 사이트 주소: 쿼리와 해시는 뺀다.
export const shareUrl = (loc) => `${loc.origin}${loc.pathname}`;
