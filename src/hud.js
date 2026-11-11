// 브라우저 전용: 툴팁·말풍선·E 키 안내·포춘쿠키 모달(HTML). 컨테이너(#game) 안에 절대 위치로 놓는다.
const BUBBLE_MS = 3000;
const CRACK_MS = 400; // index.html 의 crack 애니메이션 길이와 같게 둔다.

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
  container.append(tooltip, bubble, prompt, fortune);

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
    isFortuneOpen: () => stage !== null,
    fortuneStage: () => stage,
  };
}
