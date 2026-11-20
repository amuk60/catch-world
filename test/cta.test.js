import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyMessage, goalMessage, readyMessage, resultPlan, shareUrl } from '../src/logic/cta.js';

test('shareUrl: origin + pathname, 쿼리·해시 제거', () => {
  assert.equal(shareUrl({ origin: 'https://a.vercel.app', pathname: '/', search: '?x=1', hash: '#h' }), 'https://a.vercel.app/');
  assert.equal(shareUrl({ origin: 'http://localhost:5173', pathname: '/play/index.html', search: '?q=2', hash: '' }), 'http://localhost:5173/play/index.html');
});

test('emptyMessage: 지수 0 문구', () => {
  assert.deepEqual(emptyMessage(), {
    title: '소각 완료!',
    line1: '스트레스 지수 0! 마음은 이미 후련해졌죠?\n이제 합격만 남았어요.',
    line2: '맞춤 공고부터 AI 면접 연습까지,\n다음 지원서는 캐치와 함께!',
    cta: '캐치에서 합격 준비 시작하기',
    link: 'home',
  });
});

test('goalMessage: 측면 팝업 문구(제목 목표 달성!)', () => {
  assert.deepEqual(goalMessage(18), {
    title: '목표 달성!',
    line1: '스트레스 지수 18!\n벌써 마음이 가벼워졌네요.',
    line2: '이 기세로 다음 지원서도 가볍게!\n내게 맞는 공고, 캐치가 찾아드려요.',
    cta: '내게 맞는 공고 찾으러 가기',
    link: 'home',
  });
});

test('resultPlan: 0 이 우선(modal), 목표만이면 side, 둘 다 아니면 none', () => {
  assert.equal(resultPlan({ justGoal: false, justEmpty: false }), 'none');
  assert.equal(resultPlan({ justGoal: true, justEmpty: false }), 'side');
  assert.equal(resultPlan({ justGoal: false, justEmpty: true }), 'modal');
  assert.equal(resultPlan({ justGoal: true, justEmpty: true }), 'modal');
});

test('readyMessage: 면접 준비 완료 팝업 문구', () => {
  assert.deepEqual(readyMessage(), {
    title: '면접 갈 준비 완료!',
    line1: '빳빳한 새 와이셔츠로\n갈아입었어요.',
    line2: '이제 진짜 면접 볼 차례예요.\n그 전에 AI 면접 튜터와\n실전처럼 연습해 볼까요?',
    cta: 'AI 면접 튜터와 연습하기',
    link: 'ai_interview',
    later: '더 쉬다 가기',
  });
});
