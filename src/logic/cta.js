// 종료 화면(CTA) 문구와 공유할 주소 (순수).
// 측면 팝업(목표 달성) 문구와 버튼(cta) 이름, 버튼이 가는 서비스(link: CATCH_LINKS 의 id).
export const goalMessage = (stress) => ({
  title: '목표 달성!',
  line1: `스트레스 지수 ${stress}!\n벌써 마음이 가벼워졌네요.`,
  line2: '이 기세로 다음 지원서도 가볍게!\n내게 맞는 공고, 캐치가 찾아드려요.',
  cta: '내게 맞는 공고 찾으러 가기',
  link: 'home',
});

// 가운데 팝업(지수 0) 문구와 버튼(cta) 이름·서비스(link).
export function emptyMessage() {
  return {
    title: '소각 완료!',
    line1: '스트레스 지수 0! 마음은 이미 후련해졌죠?\n이제 합격만 남았어요.',
    line2: '맞춤 공고부터 AI 면접 연습까지,\n다음 지원서는 캐치와 함께!',
    cta: '캐치에서 합격 준비 시작하기',
    link: 'home',
  };
}

// apply() 의 결과로 어떤 팝업을 띄울지: 0 이 되면 가운데 팝업('modal', 목표와 동시여도 이것만), 목표만 넘으면 측면 팝업('side').
export function resultPlan({ justGoal, justEmpty }) {
  if (justEmpty) return 'modal';
  return justGoal ? 'side' : 'none';
}

// 공유할 사이트 주소: 쿼리와 해시는 뺀다.
export const shareUrl = (loc) => `${loc.origin}${loc.pathname}`;

// 측면 팝업(새 와이셔츠를 입어 면접 갈 준비가 됐을 때) 문구와 두 버튼 이름(cta: 캐치 열기, later: 닫기), cta 가 가는 서비스(link).
export function readyMessage() {
  return {
    title: '면접 갈 준비 완료!',
    line1: '빳빳한 새 와이셔츠로\n갈아입었어요.',
    line2: '이제 진짜 면접 볼 차례예요.\n그 전에 AI 면접 튜터와\n실전처럼 연습해 볼까요?',
    cta: 'AI 면접 튜터와 연습하기',
    link: 'ai_interview',
    later: '더 쉬다 가기',
  };
}
