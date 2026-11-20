import test from 'node:test';
import assert from 'node:assert/strict';
import { ctaMessage, emptyMessage, goalMessage, readyMessage, resultPlan, shareLines, shareFilename, shareUrl } from '../src/logic/cta.js';

test('ctaMessage: 제목과 두 줄 문구', () => {
  assert.deepEqual(ctaMessage(19), {
    title: '소각 완료!',
    line1: '스트레스 지수 19! 이제 새 시작할 준비 끝.',
    line2: '다음 지원서는 캐치가 같이 찾아드릴게요!',
  });
  assert.equal(ctaMessage(20).line1, '스트레스 지수 20! 이제 새 시작할 준비 끝.');
});

test('shareLines: 행동 횟수가 있으면 소각 횟수 문구', () => {
  assert.deepEqual(shareLines(19, 27, 100), {
    title: '번아웃 소각 완료!',
    delta: '스트레스 지수 100 → 19',
    detail: '27번의 소각으로 후련해졌어요',
    tagline: '다음 지원서는 캐치와 함께',
  });
});

test('shareLines: 행동이 0번이면 횟수 없는 문구', () => {
  const s = shareLines(20, 0, 100);
  assert.equal(s.detail, '후련해졌어요');
  assert.equal(s.delta, '스트레스 지수 100 → 20');
});

test('shareFilename: 로컬 날짜, 0 채움', () => {
  assert.equal(shareFilename(new Date(2026, 0, 5, 13, 0)), 'catch-world-20260105.png');
  assert.equal(shareFilename(new Date(2026, 10, 27, 23, 59)), 'catch-world-20261127.png');
});

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
    line1: '스트레스 지수 18! 이제 새 시작할 준비 끝.',
    line2: '다음 지원서는 캐치에서 찾아볼까요?',
    cta: '캐치 구경하러 가기',
    link: 'home',
  });
});

test('shareLines: 지수 0 이면 100 → 0', () => {
  assert.equal(shareLines(0, 34, 100).delta, '스트레스 지수 100 → 0');
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
    line1: '빳빳한 새 와이셔츠로 갈아입었어요.',
    line2: '이제 진짜 면접 볼 차례예요. 그 전에 AI 면접 튜터와 한 번 연습해 볼까요?',
    cta: 'AI 면접 튜터로 연습하기',
    link: 'ai_interview',
    later: '더 쉬다 가기',
  });
});
