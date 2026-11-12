// 브라우저 전용: 툴팁·말풍선·E 키 안내·포춘쿠키 모달·전역 스트레스 바·행동 막대·불멍 안내·감소량(-4) 팝업(HTML). 컨테이너(#game) 안에 절대 위치로 놓는다.
import { barRatio, goalRatio } from './logic/burn.js';

const BUBBLE_MS = 3000;
const CRACK_MS = 400; // index.html 의 crack 애니메이션 길이와 같게 둔다.
const DELTA_MS = 800; // index.html 의 delta-rise 애니메이션 길이와 같게 둔다.
const ACTION_BUTTONS = [
  { id: 'burn', key: '1', label: '태우기' },
  { id: 'shred', key: '2', label: '파쇄' },
  { id: 'auto', key: 'R', label: '자동' },
];
const TOO_FAR = '더 가까이 가세요';

// onCrack: 쿠키를 클릭했을 때, onClose: ✕ 를 눌렀을 때 (main.js 가 상태를 결정한다).
export function createHud(container, { onCrack = () => {}, onClose = () => {} } = {}) {
  const tooltip = document.createElement('div');
  tooltip.id = 'tooltip';
  const bubble = document.createElement('div');
  bubble.id = 'bubble';
  const prompt = document.createElement('div');
  prompt.id = 'prompt';
  const keycap = document.createElement('span');
  keycap.className = 'keycap';
  keycap.textContent = 'E';
  const promptLabel = document.createElement('span');
  prompt.append(keycap, promptLabel);

  // 포춘쿠키 모달: 흐린 배경 + 쿠키 단계 + 종이 카드 단계.
  const fortune = document.createElement('div');
  fortune.id = 'fortune';
  fortune.innerHTML = `
    <div class="fortune-stage fortune-cookie">
      <button type="button" class="cookie" aria-label="쿠키 깨기">🥠</button>
      <p>클릭하거나 E를 눌러 깨 보세요</p>
    </div>
    <div class="fortune-stage fortune-card">
      <button type="button" class="fortune-close" aria-label="닫기">✕</button>
      <p class="fortune-text"></p>
      <p class="fortune-hint">E 또는 Esc로 닫기</p>
    </div>`;
  const cookieButton = fortune.querySelector('.cookie');
  const fortuneText = fortune.querySelector('.fortune-text');
  // 전역 스트레스 바(상단 중앙).
  const stress = document.createElement('div');
  stress.id = 'stress';
  stress.innerHTML = `
    <div class="stress-label">스트레스 지수 <b></b></div>
    <div class="stress-bar"><div class="stress-fill"></div><div class="stress-goal"></div></div>`;
  const stressValue = stress.querySelector('b');
  const stressFill = stress.querySelector('.stress-fill');
  const stressGoal = stress.querySelector('.stress-goal');
  // 행동 막대(하단 중앙): [1] 태우기 [2] 파쇄 [R] 자동. 사용할 수 없는 버튼은 회색(aria-disabled)이고 눌러도 아무 일 없다.
  const actionBar = document.createElement('div');
  actionBar.id = 'action-bar';
  const barButtons = {};
  for (const b of ACTION_BUTTONS) {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.action = b.id;
    button.innerHTML = `<span class="keycap">${b.key}</span><span class="label">${b.label}</span>`;
    button.addEventListener('pointerdown', (e) => e.preventDefault()); // 포커스를 가져가지 않는다(스페이스·엔터로 다시 눌리지 않게)
    barButtons[b.id] = button;
    actionBar.append(button);
  }
  let barHandlers = { onAction: () => {}, onToggleAuto: () => {} };
  actionBar.addEventListener('click', (e) => {
    const button = e.target.closest('button');
    if (!button || button.getAttribute('aria-disabled') === 'true') return;
    if (button.dataset.action === 'auto') barHandlers.onToggleAuto();
    else barHandlers.onAction(button.dataset.action);
  });
  // 불멍 안내(벤치에 앉아 소각로를 보는 동안, 행동 막대 자리에 뜬다).
  const meditate = document.createElement('div');
  meditate.id = 'meditate';
  meditate.textContent = '불멍 중… 가만히 있어도 지수가 줄어요';
  container.append(tooltip, bubble, prompt, fortune, stress, actionBar, meditate);
  let stressStart = 100;

  cookieButton.addEventListener('click', () => onCrack());
  fortune.querySelector('.fortune-close').addEventListener('click', () => onClose());

  let bubbleTimer = 0;
  let crackTimer = 0;
  let stage = null; // null(닫힘) | 'cookie' | 'cracking' | 'card'

  function setStage(next) {
    stage = next;
    fortune.classList.toggle('open', next !== null);
    fortune.dataset.stage = next ?? '';
  }

  return {
    showTooltip(text, clientX, clientY) {
      const rect = container.getBoundingClientRect();
      tooltip.textContent = text;
      tooltip.style.left = `${clientX - rect.left}px`;
      tooltip.style.top = `${clientY - rect.top}px`;
      tooltip.classList.add('visible');
    },
    hideTooltip() {
      tooltip.classList.remove('visible');
    },
    showBubble(text) {
      bubble.textContent = text;
      bubble.classList.add('visible');
      clearTimeout(bubbleTimer);
      bubbleTimer = setTimeout(() => bubble.classList.remove('visible'), BUBBLE_MS);
    },
    hideBubble() {
      clearTimeout(bubbleTimer);
      bubble.classList.remove('visible');
    },
    isBubbleVisible: () => bubble.classList.contains('visible'),
    positionBubble(screenX, screenY) {
      bubble.style.left = `${screenX}px`;
      bubble.style.top = `${screenY}px`;
    },
    showPrompt(text) {
      promptLabel.textContent = text;
      prompt.classList.add('visible');
    },
    hidePrompt() {
      prompt.classList.remove('visible');
    },
    openFortune(text) {
      clearTimeout(crackTimer);
      fortuneText.textContent = text;
      setStage('cookie');
    },
    // 쿠키 단계에서만 동작: 400ms 깨지는 애니메이션 뒤에 종이 카드를 보여 준다.
    crackFortune() {
      if (stage !== 'cookie') return;
      setStage('cracking');
      crackTimer = setTimeout(() => setStage('card'), CRACK_MS);
    },
    closeFortune() {
      clearTimeout(crackTimer);
      setStage(null);
    },
    // 전역 스트레스 바: 항상 보인다. 처음 한 번 만들고 값이 바뀔 때마다 update.
    showStressBar(value, start, goal) {
      stressStart = start;
      stressGoal.style.left = `${goalRatio(goal, start) * 100}%`;
      stress.classList.add('visible');
      this.updateStressBar(value);
    },
    updateStressBar(value) {
      stressValue.textContent = Math.round(value);
      stressFill.style.width = `${barRatio(value, stressStart) * 100}%`;
    },
    // 행동 막대. showActionBar 로 보이게 하고 handlers 를 등록, updateActionBar 로 버튼 상태를 갱신(매 프레임 불러도 된다).
    showActionBar({ onAction = () => {}, onToggleAuto = () => {} } = {}) {
      barHandlers = { onAction, onToggleAuto };
      actionBar.classList.add('visible');
    },
    // state: { burn, shred: 사용 가능 여부, auto: 켜짐 여부, busy: 행동 진행 중(버튼을 잠깐 흐리게) }
    updateActionBar(state) {
      for (const id of ['burn', 'shred']) {
        const enabled = Boolean(state[id]);
        const button = barButtons[id];
        button.setAttribute('aria-disabled', enabled ? 'false' : 'true');
        button.title = enabled ? '' : TOO_FAR;
      }
      barButtons.auto.classList.toggle('on', Boolean(state.auto));
      barButtons.auto.setAttribute('aria-pressed', state.auto ? 'true' : 'false');
      actionBar.classList.toggle('busy', Boolean(state.busy));
    },
    hideActionBar() {
      actionBar.classList.remove('visible');
    },
    isActionBarVisible: () => actionBar.classList.contains('visible'),
    showMeditate() {
      meditate.classList.add('visible');
    },
    hideMeditate() {
      meditate.classList.remove('visible');
    },
    // 감소량 같은 짧은 글자를 화면 좌표에 띄운다(약 40px 올라가며 0.8초에 걸쳐 사라진다). 여러 개가 겹쳐도 된다.
    popDelta(text, screenX, screenY) {
      const el = document.createElement('div');
      el.className = 'delta';
      el.textContent = text;
      el.style.left = `${screenX}px`;
      el.style.top = `${screenY}px`;
      container.append(el);
      setTimeout(() => el.remove(), DELTA_MS + 100);
    },
    isFortuneOpen: () => stage !== null,
    fortuneStage: () => stage,
  };
}
