// 브라우저 전용: 공간 전환 오버레이(차원문)·툴팁·말풍선·E 키 안내·포춘쿠키 모달·전역 스트레스 바·행동 막대(구역마다 버튼이 바뀐다)·불멍 안내·감소량(-4) 팝업·측면 팝업(목표 달성)·가운데 팝업(지수 0)·캐치 칩(HTML). 컨테이너(#game) 안에 절대 위치로 놓는다.
import { barRatio } from './logic/burn.js';
import { emptyMessage, goalMessage, readyMessage } from './logic/cta.js';

const BUBBLE_MS = 3000;
const CRACK_MS = 400; // index.html 의 crack 애니메이션 길이와 같게 둔다.
const DELTA_MS = 800; // index.html 의 delta-rise 애니메이션 길이와 같게 둔다.
const AUTO_BUTTON = { id: 'auto', key: 'R', label: '자동' };
const TOO_FAR = '더 가까이 가세요';
const PORTAL_OPEN_PERCENT = 112; // 구멍이 완전히 열렸을 때의 반지름(%): 가장 먼 모서리(100%)와 빛의 띠가 화면 밖으로 나가는 값

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
    <div class="stress-bar"><div class="stress-fill"></div></div>`;
  const stressValue = stress.querySelector('b');
  const stressFill = stress.querySelector('.stress-fill');
  // 행동 막대(하단 중앙): 지금 구역의 [1] 첫째 행동 [2] 둘째 행동 [R] 자동(소각장: 태우기·파쇄, 세탁소: 세탁·널기).
  // 사용할 수 없는 버튼은 회색(aria-disabled)이고 눌러도 아무 일 없다. 구역이 바뀔 때만 버튼을 다시 만든다.
  const actionBar = document.createElement('div');
  actionBar.id = 'action-bar';
  let barButtons = {};
  let barZone = null;
  const makeButton = (b) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.action = b.id;
    button.innerHTML = `<span class="keycap">${b.key}</span><span class="label">${b.label}</span>`;
    button.addEventListener('pointerdown', (e) => e.preventDefault()); // 포커스를 가져가지 않는다(스페이스·엔터로 다시 눌리지 않게)
    return button;
  };
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
  // 클리어 팝업(종료 화면): 흐린 배경 + 카드. 문구는 열 때 채운다.
  const result = document.createElement('div');
  result.id = 'result';
  result.innerHTML = `
    <div class="result-card" role="dialog" aria-modal="true" aria-labelledby="result-title">
      <h2 id="result-title" class="result-title"></h2>
      <p class="result-message"></p>
      <button type="button" class="result-cta">캐치 구경하기</button>
      <div class="result-row">
        <button type="button" class="result-sub" data-act="save">결과 이미지 저장</button>
        <button type="button" class="result-sub" data-act="copy">사이트 주소 복사</button>
      </div>
      <p class="result-feedback" aria-live="polite"></p>
      <div class="result-row">
        <button type="button" class="result-text" data-act="continue">계속 둘러보기</button>
        <button type="button" class="result-text" data-act="restart">다시 하기</button>
      </div>
      <p class="result-note">※ 학사 과제용 비공식 프로젝트</p>
    </div>`;
  const resultTitle = result.querySelector('.result-title');
  const resultMessage = result.querySelector('.result-message');
  const resultFeedback = result.querySelector('.result-feedback');
  let resultHandlers = {};
  result.querySelector('.result-cta').addEventListener('click', () => resultHandlers.onCta?.());
  for (const button of result.querySelectorAll('[data-act]')) {
    const handler = { save: 'onSave', copy: 'onCopy', continue: 'onContinue', restart: 'onRestart' }[button.dataset.act];
    button.addEventListener('click', () => resultHandlers[handler]?.());
  }
  // 측면 팝업(목표 달성): 우측 가장자리에서 밀려 들어오는 카드. 배경을 어둡게 하지 않고 플레이를 막지 않으며 스스로 사라지지 않는다.
  const side = document.createElement('div');
  side.id = 'side-popup';
  side.setAttribute('role', 'dialog');
  side.setAttribute('aria-labelledby', 'side-title');
  side.innerHTML = `
    <button type="button" class="side-close" aria-label="닫기">✕</button>
    <h2 id="side-title" class="side-title"></h2>
    <p class="side-message"></p>
    <button type="button" class="side-cta">캐치 구경하기</button>
    <button type="button" class="side-later" hidden></button>`;
  const sideTitle = side.querySelector('.side-title');
  const sideMessage = side.querySelector('.side-message');
  const sideCta = side.querySelector('.side-cta');
  const sideLater = side.querySelector('.side-later');
  let sideHandlers = {};
  let sideKind = null; // 'goal' | 'ready' | null
  sideCta.addEventListener('click', () => sideHandlers.onCta?.());
  sideLater.addEventListener('click', () => sideHandlers.onLater?.());
  side.querySelector('.side-close').addEventListener('click', () => sideHandlers.onClose?.());
  // 캐치 칩(우상단): 측면 팝업을 닫은 뒤·가운데 팝업이 뜬 뒤 계속 보인다.
  const ctaChip = document.createElement('button');
  ctaChip.id = 'cta-chip';
  ctaChip.type = 'button';
  ctaChip.textContent = '캐치 구경하기 →';
  ctaChip.addEventListener('pointerdown', (e) => e.preventDefault()); // 포커스를 가져가지 않는다(스페이스·엔터로 다시 눌리지 않게)
  let chipHandler = () => {};
  ctaChip.addEventListener('click', () => chipHandler());
  // 공간 전환 오버레이(차원문): 화면 가장자리에서 가운데로 닫히는 빛의 원. --r 은 구멍 반지름(가장 먼 모서리 거리의 %).
  const portal = document.createElement('div');
  portal.id = 'portal';
  container.append(tooltip, bubble, prompt, fortune, stress, actionBar, meditate, ctaChip, side, result, portal);
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
    // 전환 오버레이: radius 1 = 활짝(보이지 않음), 0 = 화면 전체가 덮임. 전환 중에만 켜진다.
    setPortal(radius) {
      const open = radius >= 1;
      portal.classList.toggle('active', !open);
      if (!open) portal.style.setProperty('--r', (radius * PORTAL_OPEN_PERCENT).toFixed(2));
    },
    isPortalActive: () => portal.classList.contains('active'),
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
    // actionable 이 false 면 E 키캡 없이 글자만(눌러도 아무 일 없는 힌트).
    showPrompt(text, actionable = true) {
      promptLabel.textContent = text;
      keycap.hidden = !actionable;
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
    showStressBar(value, start) {
      stressStart = start;
      stress.classList.add('visible');
      this.updateStressBar(value);
    },
    updateStressBar(value) {
      stressValue.textContent = Math.round(value);
      stressFill.style.width = `${barRatio(value, stressStart) * 100}%`;
    },
    // 행동 막대. showActionBar 로 구역의 버튼(buttons: [{ id, key, label }])을 만들어 보이게 하고 handlers 를 등록, updateActionBar 로 버튼 상태를 갱신(매 프레임 불러도 된다).
    showActionBar({ zoneId = null, buttons = [], onAction = () => {}, onToggleAuto = () => {} } = {}) {
      barHandlers = { onAction, onToggleAuto };
      barZone = zoneId;
      barButtons = {};
      actionBar.replaceChildren();
      for (const b of [...buttons, AUTO_BUTTON]) {
        barButtons[b.id] = makeButton(b);
        actionBar.append(barButtons[b.id]);
      }
      actionBar.classList.add('visible');
    },
    // state: { <행동 id>: 사용 가능 여부, auto: 켜짐 여부, busy: 행동 진행 중(버튼을 잠깐 흐리게) }
    updateActionBar(state) {
      for (const [id, button] of Object.entries(barButtons)) {
        if (id === 'auto') continue;
        const enabled = Boolean(state[id]);
        button.setAttribute('aria-disabled', enabled ? 'false' : 'true');
        button.title = enabled ? '' : TOO_FAR;
      }
      barButtons.auto.classList.toggle('on', Boolean(state.auto));
      barButtons.auto.setAttribute('aria-pressed', state.auto ? 'true' : 'false');
      actionBar.classList.toggle('busy', Boolean(state.busy));
    },
    hideActionBar() {
      actionBar.classList.remove('visible');
      barZone = null;
    },
    isActionBarVisible: () => actionBar.classList.contains('visible'),
    actionBarZone: () => barZone,
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
    // 가운데 팝업(지수 0). 버튼 핸들러를 받는다.
    openResult({ onCta, onSave, onCopy, onContinue, onRestart }) {
      const m = emptyMessage();
      resultTitle.textContent = m.title;
      resultMessage.replaceChildren(m.line1, document.createElement('br'), m.line2);
      resultFeedback.textContent = '';
      resultHandlers = { onCta, onSave, onCopy, onContinue, onRestart };
      result.classList.add('open');
    },
    closeResult() {
      result.classList.remove('open');
      resultHandlers = {};
    },
    isResultOpen: () => result.classList.contains('open'),
    setResultFeedback(text) {
      resultFeedback.textContent = text;
    },
    // 측면 팝업. stress: 목표를 넘은 순간의 지수.
    openSidePopup({ stress: value, onCta, onClose }) {
      const m = goalMessage(value);
      sideTitle.textContent = m.title;
      sideMessage.replaceChildren(m.line1, document.createElement('br'), m.line2);
      sideCta.textContent = '캐치 구경하기';
      sideLater.hidden = true;
      sideHandlers = { onCta, onClose };
      sideKind = 'goal';
      side.classList.add('open');
    },
    // 측면 팝업(면접 갈 준비 완료): 같은 카드에 주 버튼(캐치 열기)과 보조 버튼(더 쉬다 가기)을 보여 준다.
    openReadyPopup({ onCta, onLater, onClose }) {
      const m = readyMessage();
      sideTitle.textContent = m.title;
      sideMessage.replaceChildren(m.line1, document.createElement('br'), m.line2);
      sideCta.textContent = m.cta;
      sideLater.textContent = m.later;
      sideLater.hidden = false;
      sideHandlers = { onCta, onLater, onClose };
      sideKind = 'ready';
      side.classList.add('open');
    },
    closeSidePopup() {
      side.classList.remove('open');
      sideHandlers = {};
      sideKind = null;
    },
    sidePopupKind: () => sideKind,
    isSidePopupOpen: () => side.classList.contains('open'),
    showCtaChip(onClick) {
      chipHandler = onClick;
      ctaChip.classList.add('visible');
    },
    hideCtaChip() {
      ctaChip.classList.remove('visible');
    },
    isFortuneOpen: () => stage !== null,
    fortuneStage: () => stage,
  };
}
