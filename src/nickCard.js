// 브라우저 전용: 닉네임 정하기 카드(가운데 작은 카드, 화면을 막지 않는다)와 저장소 도우미.
// 입력 중에는 게임 단축키가 반응하지 않는다(카드 안의 키 이벤트는 밖으로 나가지 않는다). Enter 로 확정, Esc 로 닫는다.
import { validateNick, suggestNick, NICK_MAX, NICK_REASONS } from './logic/nick.js';

const NICK_KEY = 'catch-world-nick';
const ASKED_KEY = 'catch-world-nick-asked';

// 저장된 닉네임(다시 검사해 통과한 것만). 저장소를 못 쓰면 null.
export function loadNick() {
  try {
    const v = validateNick(localStorage.getItem(NICK_KEY));
    return v.ok ? v.nick : null;
  } catch { return null; }
}
export function saveNick(nick) {
  try { localStorage.setItem(NICK_KEY, nick); localStorage.setItem(ASKED_KEY, '1'); } catch { /* 저장소를 못 써도 이번 방문에는 동작한다 */ }
}
export function wasAsked() {
  try { return localStorage.getItem(ASKED_KEY) === '1'; } catch { return false; }
}
export function markAsked() {
  try { localStorage.setItem(ASKED_KEY, '1'); } catch { /* 무시 */ }
}

// opts: { adjectives, nouns, onSubmit(nick: 검사를 통과한 이름), onLater() }
export function createNickCard(container, { adjectives, nouns, onSubmit = () => {}, onLater = () => {} }) {
  const card = document.createElement('div');
  card.id = 'nick-card';
  card.setAttribute('role', 'dialog');
  card.setAttribute('aria-labelledby', 'nick-title');
  card.innerHTML = `
    <h2 id="nick-title">닉네임을 정해 주세요</h2>
    <div class="nick-row">
      <input class="nick-input" type="text" maxlength="${NICK_MAX}" autocomplete="off" spellcheck="false" aria-label="닉네임" />
      <button type="button" class="nick-dice" title="다른 이름 추천받기">🎲 랜덤</button>
    </div>
    <div class="nick-meta"><span class="nick-error" role="alert" aria-live="polite"></span><span class="nick-count"></span></div>
    <p class="nick-note">실명이나 개인정보는 쓰지 마세요(다른 방문자에게 보입니다)</p>
    <button type="button" class="nick-go">이 이름으로 시작</button>
    <button type="button" class="nick-later">나중에 정하기</button>`;
  container.append(card);
  const input = card.querySelector('.nick-input');
  const error = card.querySelector('.nick-error');
  const count = card.querySelector('.nick-count');
  const go = card.querySelector('.nick-go');
  const later = card.querySelector('.nick-later');
  let isOpen = false;

  const syncCount = () => { count.textContent = `${[...input.value].length}/${NICK_MAX}`; };
  const setError = (text) => { error.textContent = text; card.classList.toggle('invalid', Boolean(text)); };
  function close() {
    if (!isOpen) return;
    isOpen = false;
    card.classList.remove('open');
    input.blur(); // 포커스를 돌려줘야 게임 키가 다시 먹는다
  }
  function submit() {
    const v = validateNick(input.value);
    if (!v.ok) { setError(NICK_REASONS[v.reason] ?? NICK_REASONS.chars); input.focus(); return; }
    setError('');
    close();
    onSubmit(v.nick);
  }
  function skip() { close(); onLater(); }

  // 카드 안의 키는 게임으로 보내지 않는다.
  card.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Enter' && e.target !== card.querySelector('.nick-later') && e.target !== card.querySelector('.nick-dice')) { e.preventDefault(); submit(); } else if (e.key === 'Escape') { e.preventDefault(); skip(); }
  });
  card.addEventListener('keyup', (e) => e.stopPropagation());
  input.addEventListener('input', () => { setError(''); syncCount(); });
  card.querySelector('.nick-dice').addEventListener('click', () => { input.value = suggestNick(adjectives, nouns); setError(''); syncCount(); input.focus(); });
  go.addEventListener('click', submit);
  later.addEventListener('click', skip);

  return {
    // value: 칸에 미리 채울 이름(보통 지금 이름이나 무작위 추천). canLater: "나중에 정하기"(처음 방문) / 닫기(바꿀 때) 문구 구분.
    open(value, { first = false } = {}) {
      input.value = value ?? suggestNick(adjectives, nouns);
      setError('');
      syncCount();
      later.textContent = first ? '나중에 정하기' : '닫기';
      go.textContent = first ? '이 이름으로 시작' : '이 이름으로 바꾸기';
      isOpen = true;
      card.classList.add('open');
      input.focus();
      input.select();
    },
    close,
    get isOpen() { return isOpen; },
    dispose() { card.remove(); },
  };
}
