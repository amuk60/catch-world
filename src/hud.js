// 브라우저 전용: 공간 전환 오버레이(차원문)·툴팁·말풍선·면접장 말풍선들과 답변 선택 창·E 키 안내·포춘쿠키 모달·전역 스트레스 바·행동 막대(구역마다 버튼이 바뀐다, 구역에 따라 자동 버튼 없음)·불멍 안내·마시멜로 굽기 패널(가는 시간 줄)·감소량(-4) 팝업·측면 팝업(목표 달성)·가운데 팝업(지수 0)·캐치 칩(HTML). 컨테이너(#game) 안에 절대 위치로 놓는다.
import { barRatio } from './logic/burn.js';
import { emptyMessage, goalMessage, readyMessage } from './logic/cta.js';
import { sfx } from './audio/sfx.js';
import { createFortuneModal } from './fortuneModal.js';

const BUBBLE_MS = 3000;
const DELTA_MS = 800; // index.html 의 delta-rise 애니메이션 길이와 같게 둔다.
const MEDITATE_TEXT = '불멍 중… 가만히 있어도 지수가 줄어요 · V 시점 전환';
const MEDITATE_TEXT_FP = '불멍 중… V 시점 전환';
const AUTO_BUTTON = { id: 'auto', key: 'R', label: '자동' };
const TOO_FAR = '더 가까이 가세요';
const PORTAL_OPEN_PERCENT = 112; // 구멍이 완전히 열렸을 때의 반지름(%): 가장 먼 모서리(100%)와 빛의 띠가 화면 밖으로 나가는 값

// fortuneHandlers: 포춘쿠키 모달의 onPick·onTap·onMore·onCta, onClose: ✕ 를 눌렀을 때 (main.js 가 상태를 결정한다). 모달은 hud.fortune 으로 쓴다(fortuneModal.js).
export function createHud(container, { fortuneHandlers = {}, onClose = () => {} } = {}) {
  const fortune = createFortuneModal(container, { ...fortuneHandlers, onClose });
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
  // 불멍 안내(소각로 옆 벤치에 앉아 있고 굽는 중이 아닐 때, 행동 막대 위에 뜬다).
  const meditate = document.createElement('div');
  meditate.id = 'meditate';
  meditate.textContent = MEDITATE_TEXT;
  // 마시멜로 굽기 패널(굽는 동안 행동 막대 자리에 뜬다): 불 위에 있던 시간을 보여 주는 가는 줄(황금 구간 표시 없음) + 꺼내기 버튼 + 안내 글.
  const roastPanel = document.createElement('div');
  roastPanel.id = 'roast-panel';
  roastPanel.innerHTML = `
    <div class="roast-gauge"><div class="roast-fill"></div></div>
    <div class="roast-row"><button type="button" class="roast-pull"><span class="keycap">1</span><span class="label">꺼내기</span></button><span class="roast-hint"></span></div>`;
  const roastFill = roastPanel.querySelector('.roast-fill');
  const roastPull = roastPanel.querySelector('.roast-pull');
  const roastHint = roastPanel.querySelector('.roast-hint');
  let roastHandlers = { onPull: () => {} };
  roastPull.addEventListener('pointerdown', (e) => e.preventDefault());
  roastPull.addEventListener('click', () => { if (roastPull.getAttribute('aria-disabled') !== 'true') roastHandlers.onPull(); });
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
  // 면접장 말풍선들(말하는 사람마다 하나): 플레이어와 면접관 3명의 머리 위에 main 이 위치를 정해 준다.
  const speechLayer = document.createElement('div');
  speechLayer.id = 'speech-layer';
  const speeches = new Map(); // 말하는 사람 id -> { el, timer }
  const REMOTE_PREFIX = 'r-'; // 다른 방문자의 말풍선 id 앞머리(내 장면이 시작·끝날 때 치우는 대상에서 빼고, 따로 치운다)
  // 답변 선택 창(하단): 질문 + 선택지 3개(실제로 할 말 + 작은 색 라벨) + "다음에 할게요".
  const choice = document.createElement('div');
  choice.id = 'choice';
  choice.setAttribute('role', 'dialog');
  choice.setAttribute('aria-label', '면접 질문에 답하기');
  choice.innerHTML = `
    <div class="choice-card">
      <div class="choice-q"><b class="choice-who"></b><span class="choice-text"></span></div>
      <div class="choice-list"></div>
      <button type="button" class="choice-cancel"><span class="choice-cancel-label"></span><span class="keycap">Esc</span></button>
    </div>`;
  const choiceWho = choice.querySelector('.choice-who');
  const choiceText = choice.querySelector('.choice-text');
  const choiceList = choice.querySelector('.choice-list');
  const choiceCancel = choice.querySelector('.choice-cancel');
  const choiceCancelLabel = choice.querySelector('.choice-cancel-label');
  let choiceHandlers = {};
  choice.addEventListener('pointerdown', (e) => { if (e.target.closest('button')) e.preventDefault(); }); // 버튼이 포커스를 가져가지 않게
  choiceList.addEventListener('click', (e) => {
    const button = e.target.closest('button');
    if (button) choiceHandlers.onPick?.(Number(button.dataset.index));
  });
  choiceCancel.addEventListener('click', () => choiceHandlers.onCancel?.());
  // 소각장 물건 고르기 창: 행동 막대 위에 뜬다. 배경(창 밖)을 누르거나 Esc 로 닫는다.
  const picker = document.createElement('div');
  picker.id = 'picker';
  picker.setAttribute('role', 'dialog');
  picker.innerHTML = `
    <div class="picker-card">
      <p class="picker-title"></p>
      <div class="picker-list"></div>
      <button type="button" class="picker-cancel"><span class="picker-cancel-label">취소</span><span class="keycap">Esc</span></button>
    </div>`;
  const pickerTitle = picker.querySelector('.picker-title');
  const pickerList = picker.querySelector('.picker-list');
  let pickerHandlers = {};
  picker.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); }); // 아래 게임 화면으로 클릭이 새지 않게(이동·드래그 방지)
  picker.addEventListener('click', (e) => {
    const button = e.target.closest('button[data-index]');
    if (button) pickerHandlers.onPick?.(Number(button.dataset.index));
    else if (!e.target.closest('.picker-card') || e.target.closest('.picker-cancel')) pickerHandlers.onCancel?.();
  });
  container.append(tooltip, bubble, speechLayer, prompt, stress, actionBar, meditate, roastPanel, ctaChip, side, result, choice, picker, portal);
  let stressStart = 100;

  let bubbleTimer = 0;
  function removeSpeech(id) {
    const s = speeches.get(id);
    if (!s) return;
    clearTimeout(s.timer);
    s.el.remove();
    speeches.delete(id);
  }

  return {
    // 면접장 말풍선. id: 'player' | 면접관 id | 'r-<방문자 id>'(다른 방문자), name: 이름표(없으면 생략), seconds 뒤에 스스로 사라진다(0 이하면 clearSpeech 로 지울 때까지).
    // 같은 id 로 다시 부르면 내용을 바꾸고 시간을 새로 센다. remote 면 다른 방문자 모양(하늘색 바탕).
    say(id, text, { name = '', seconds = 2.3, big = false, remote = false, at, quiet = false, silent = false } = {}) {
      // 말풍선마다 웅얼거림(말하는 사람마다 목소리가 다르다). 큰 글씨(최종 합격!)는 팡파르가 맡는다. quiet: 다른 방문자의 장면에서 면접관이 하는 말(작고 초당 상한이 있다).
      if (!big && !silent) sfx.speech(id, text.length, { at, remote: quiet }); // silent: 소리 없는 말풍선(인사·응원말)
      let s = speeches.get(id);
      if (!s) {
        const el = document.createElement('div');
        el.className = `speech speech-${id}`;
        speechLayer.append(el);
        s = { el, timer: 0 };
        speeches.set(id, s);
      }
      clearTimeout(s.timer);
      s.el.classList.toggle('big', big);
      s.el.classList.toggle('remote', remote);
      s.el.replaceChildren();
      if (name) {
        const who = document.createElement('b');
        who.className = 'speech-who';
        who.textContent = name;
        s.el.append(who);
      }
      s.el.append(text);
      if (seconds > 0) s.timer = setTimeout(() => removeSpeech(id), seconds * 1000);
    },
    // id 없이 부르면 내 장면의 말풍선(플레이어·면접관)을 모두 치운다. 다른 방문자의 말풍선은 clearRemoteSpeech 로 따로.
    clearSpeech(id) {
      if (id === undefined) { for (const key of [...speeches.keys()]) if (!key.startsWith(REMOTE_PREFIX)) removeSpeech(key); } else removeSpeech(id);
    },
    clearRemoteSpeech(id) {
      if (id === undefined) { for (const key of [...speeches.keys()]) if (key.startsWith(REMOTE_PREFIX)) removeSpeech(key); } else removeSpeech(id);
    },
    // 말풍선 크기(px, 겹침 피하기용). 없으면 null.
    speechSize(id) {
      const s = speeches.get(id);
      return s ? { w: s.el.offsetWidth, h: s.el.offsetHeight } : null;
    },
    speechIds: () => [...speeches.keys()],
    // 말풍선은 머리 위 화면 좌표에 놓되, 옆 사람과 겹치지 않게 shift(px) 만큼 비켜 놓고(꼬리는 머리를 가리킨다) 화면 위·옆으로 잘리지 않게 안쪽으로 당긴다.
    positionSpeech(id, screenX, screenY, shift = 0) {
      const s = speeches.get(id);
      if (!s) return;
      const w = s.el.offsetWidth;
      const h = s.el.offsetHeight;
      const x = Math.min(Math.max(screenX + shift, w / 2 + 6), container.clientWidth - w / 2 - 6);
      const y = Math.max(screenY, h + 16);
      s.el.style.left = `${x}px`;
      s.el.style.top = `${y}px`;
      s.el.style.setProperty('--tail', `${Math.max(-w / 2 + 14, Math.min(w / 2 - 14, screenX - x))}px`);
    },
    // 답변 선택 창. choices: [{ key, type, text }]. onPick(선택 번호), onCancel().
    openChoice({ who, question, choices, cancelLabel, onPick, onCancel }) {
      choiceWho.textContent = who;
      choiceText.textContent = question;
      choiceList.replaceChildren(...choices.map((c, i) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.dataset.index = String(i);
        button.dataset.type = c.type;
        const keycap = document.createElement('span');
        keycap.className = 'keycap';
        keycap.textContent = c.key;
        const tag = document.createElement('span');
        tag.className = `choice-tag tag-${c.type}`;
        tag.textContent = c.type;
        const line = document.createElement('span');
        line.className = 'choice-line';
        line.textContent = c.text;
        button.append(keycap, tag, line);
        return button;
      }));
      choiceCancelLabel.textContent = cancelLabel;
      choiceHandlers = { onPick, onCancel };
      choice.classList.add('open');
    },
    closeChoice() {
      choice.classList.remove('open');
      choiceHandlers = {};
    },
    isChoiceOpen: () => choice.classList.contains('open'),
    // 소각장 물건 고르기 창. items: [{ key, label, icon(캔버스) }]. onPick(번호 0~), onCancel().
    openPicker({ title, items, onPick, onCancel }) {
      pickerTitle.textContent = title;
      pickerList.replaceChildren(...items.map((it, i) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.dataset.index = String(i);
        const keycap = document.createElement('span');
        keycap.className = 'keycap';
        keycap.textContent = it.key;
        const icon = document.createElement('canvas');
        icon.className = 'picker-icon';
        icon.width = it.icon.width;
        icon.height = it.icon.height;
        icon.getContext('2d').drawImage(it.icon, 0, 0);
        const label = document.createElement('span');
        label.textContent = it.label;
        button.append(keycap, icon, label);
        return button;
      }));
      pickerHandlers = { onPick, onCancel };
      picker.classList.add('open');
    },
    closePicker() {
      picker.classList.remove('open');
      pickerHandlers = {};
    },
    isPickerOpen: () => picker.classList.contains('open'),
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
    // auto: false 면 자동(R) 버튼을 만들지 않는다(면접장).
    showActionBar({ zoneId = null, buttons = [], auto = true, onAction = () => {}, onToggleAuto = () => {} } = {}) {
      barHandlers = { onAction, onToggleAuto };
      barZone = zoneId;
      barButtons = {};
      actionBar.replaceChildren();
      for (const b of auto ? [...buttons, AUTO_BUTTON] : buttons) {
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
      if (barButtons.auto) {
        barButtons.auto.classList.toggle('on', Boolean(state.auto));
        barButtons.auto.setAttribute('aria-pressed', state.auto ? 'true' : 'false');
      }
      actionBar.classList.toggle('busy', Boolean(state.busy));
    },
    hideActionBar() {
      actionBar.classList.remove('visible');
      barZone = null;
    },
    isActionBarVisible: () => actionBar.classList.contains('visible'),
    actionBarZone: () => barZone,
    // firstPerson: 1인칭 불멍 중이면 작고 옅게 + 시점 되돌리기 안내.
    showMeditate(firstPerson = false) {
      meditate.classList.toggle('fp', firstPerson);
      meditate.textContent = firstPerson ? MEDITATE_TEXT_FP : MEDITATE_TEXT;
      meditate.classList.add('visible');
    },
    hideMeditate() {
      meditate.classList.remove('visible');
    },
    // 마시멜로 굽기 패널. state: { fill(0..1 가는 시간 줄), color('rgb(..)'), canPull(꺼내기 버튼 켜짐), hint(안내 글) } — 완벽 구간은 알려 주지 않는다.
    showRoast(handlers = {}) {
      roastHandlers = { onPull: () => {}, ...handlers };
      roastPanel.classList.add('visible');
    },
    updateRoast({ fill = 0, color = '#fff', canPull = false, hint = '' } = {}) {
      roastFill.style.width = `${fill * 100}%`;
      roastFill.style.background = color;
      roastPull.setAttribute('aria-disabled', canPull ? 'false' : 'true');
      roastHint.textContent = hint;
    },
    hideRoast() {
      roastPanel.classList.remove('visible');
    },
    isRoastVisible: () => roastPanel.classList.contains('visible'),
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
      sfx.play('popupModal');
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
      sfx.play('popupSide');
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
      sfx.play('jingle');
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
    fortune, // 포춘쿠키 모달: openPicker·startCrack·tap·burst·close·stage
  };
}
