// 브라우저 전용: 조작 안내 카드(처음 방문 때 자동으로 뜨고, 우상단 "?" 버튼이나 H 키로 다시 연다). 입력을 막지 않는다(카드는 pointer-events 없음, ×만 받는다).
// 스타일은 이 파일이 직접 넣는다(index.html 을 건드리지 않는다). update(dt, moving, spaceId) 를 매 프레임 부른다.
import { createGuideTimer, isFirstVisit, markSeen } from './logic/guide.js';
import { shouldIgnoreKey } from './logic/keyMove.js';

const CSS = `
#guide { position: absolute; right: 16px; bottom: 16px; width: 300px; max-width: calc(100% - 32px); box-sizing: border-box;
  padding: 12px 14px; border-radius: 14px; background: rgba(18, 18, 31, 0.86); color: #fff; font-size: 14px; line-height: 1.55;
  box-shadow: 0 4px 18px rgba(0, 0, 0, 0.4); z-index: 2; pointer-events: none; visibility: hidden; opacity: 0; transition: opacity 0.2s, visibility 0.2s; }
#guide.open { visibility: visible; opacity: 1; }
#guide .guide-title { font-weight: 700; margin-bottom: 4px; padding-right: 26px; }
#guide ul { list-style: none; margin: 0; padding: 0; }
#guide li { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 5px; padding: 1px 0; }
#guide .keycap { min-width: 18px; padding: 0 6px; font-size: 12px; }
#guide .guide-sep { opacity: 0.6; }
#guide .guide-close { position: absolute; top: 6px; right: 8px; width: 26px; height: 26px; padding: 0; border: 0; border-radius: 999px;
  background: transparent; color: #cfcfe6; font-size: 18px; line-height: 1; cursor: pointer; pointer-events: auto; }
#guide .guide-close:hover { background: rgba(255, 255, 255, 0.18); color: #fff; }
#guide-btn { position: absolute; top: 54px; right: 12px; width: 36px; height: 36px; display: flex; align-items: center; justify-content: center;
  padding: 0; border: 0; border-radius: 999px; background: rgba(18, 18, 31, 0.78); color: #fff; font: inherit; font-size: 17px; font-weight: 700;
  cursor: pointer; z-index: 2; transition: background 0.12s; }
#guide-btn:hover { background: rgba(255, 255, 255, 0.26); }
#guide-btn:focus-visible, #guide .guide-close:focus-visible { outline: 2px solid #ffd9a8; outline-offset: 2px; }
#guide-btn.on { background: #e8833a; }
@media (max-width: 640px) { #guide { right: 50%; transform: translateX(50%); bottom: 118px; font-size: 13px; padding: 10px 12px; } }
`;

const k = (t) => `<span class="keycap">${t}</span>`;
const ACTION_LINE = {
  default: `${k('1')} 행동 <span class="guide-sep">·</span> ${k('R')} 자동`,
  interview: `${k('1')}${k('2')} 면접 보기·돌발행동 (의자에 앉아서)`,
};

function rows(spaceId) {
  return [
    `<li><b>이동</b> 바닥 클릭 또는 ${k('W')}${k('A')}${k('S')}${k('D')} / ${k('↑')}${k('←')}${k('↓')}${k('→')}</li>`,
    '<li><b>시점</b> 마우스 드래그, 휠로 확대·축소</li>',
    `<li>${k('E')} 상호작용 (앉기·들어가기)</li>`,
    `<li>${spaceId === 'interview' ? ACTION_LINE.interview : ACTION_LINE.default}</li>`,
    ...(spaceId === 'yard' ? [`<li>${k('1')} 불 옆 벤치에 앉아 마시멜로 굽기(1인칭) · 앉아만 있어도 불멍</li>`] : []),
    `<li>${k('M')} 소리 켜기/끄기</li>`,
  ].join('');
}

export function createGuideHud(container, { storage = null } = {}) {
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.append(style);

  const card = document.createElement('div');
  card.id = 'guide';
  card.setAttribute('role', 'note');
  const title = document.createElement('div');
  title.className = 'guide-title';
  title.textContent = '이렇게 해 보세요';
  const list = document.createElement('ul');
  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'guide-close';
  closeBtn.setAttribute('aria-label', '조작 안내 닫기');
  closeBtn.textContent = '×';
  card.append(title, list, closeBtn);

  const btn = document.createElement('button');
  btn.id = 'guide-btn';
  btn.type = 'button';
  btn.textContent = '?';
  btn.setAttribute('aria-label', '조작 안내 보기');
  btn.title = '조작 안내 (H)';
  container.append(card, btn);

  const timer = createGuideTimer();
  let isOpen = false;
  let space = 'yard';
  const render = () => { list.innerHTML = rows(space); };
  const show = () => { isOpen = true; timer.reset(); render(); card.classList.add('open'); btn.classList.add('on'); btn.setAttribute('aria-pressed', 'true'); };
  const hide = () => { isOpen = false; card.classList.remove('open'); btn.classList.remove('on'); btn.setAttribute('aria-pressed', 'false'); };
  const toggle = () => (isOpen ? hide() : show());

  btn.addEventListener('pointerdown', (e) => e.preventDefault()); // 포커스를 가져가지 않는다
  btn.addEventListener('click', () => { toggle(); btn.blur(); });
  closeBtn.addEventListener('pointerdown', (e) => e.preventDefault());
  closeBtn.addEventListener('click', hide);
  window.addEventListener('keydown', (e) => {
    if (e.code !== 'KeyH' || e.repeat || shouldIgnoreKey(e, e.target)) return;
    toggle();
  });

  if (isFirstVisit(storage)) { show(); markSeen(storage); } else hide();

  return {
    isOpen: () => isOpen,
    open: show,
    close: hide,
    update(dt, moving, spaceId) {
      if (spaceId !== space) { space = spaceId; if (isOpen) render(); }
      if (isOpen && timer.update(dt, moving)) hide();
    },
  };
}
