// 브라우저 전용: 소원 적기 카드(가운데 작은 카드, 닉네임 카드와 같은 방식). 입력 중에는 게임 단축키가 반응하지 않는다(카드 안의 키 이벤트는 밖으로 나가지 않는다).
// Enter 로 빌기, Esc·취소로 닫는다. 비어 있으면 빌기 버튼이 눌리지 않는다. 적은 글은 onSubmit 으로만 넘기고 어디에도 저장·전송하지 않는다.
import { validateWish, WISH_REASONS } from './logic/wish.js';

// opts: { maxLength, onSubmit(wish: 검사를 통과한 글), onCancel() }
export function createWishCard(container, { maxLength, onSubmit = () => {}, onCancel = () => {} }) {
  const card = document.createElement('div');
  card.id = 'wish-card';
  card.setAttribute('role', 'dialog');
  card.setAttribute('aria-labelledby', 'wish-title');
  card.innerHTML = `
    <h2 id="wish-title">🌟 소원을 적어 주세요</h2>
    <p class="wish-sub">취업 희망·목표·소원을 한 줄로 적고 조각상에 빌어 보세요</p>
    <input class="wish-input" type="text" maxlength="${maxLength}" autocomplete="off" spellcheck="false" aria-label="소원" placeholder="예: 올해 안에 원하는 회사 합격!" />
    <div class="wish-meta"><span class="wish-error" role="alert" aria-live="polite"></span><span class="wish-count"></span></div>
    <p class="wish-note">적은 소원은 이 화면에서만 쓰이고 저장되거나 다른 사람에게 보이지 않아요</p>
    <button type="button" class="wish-go">소원 빌기</button>
    <button type="button" class="wish-cancel">취소</button>`;
  container.append(card);
  const input = card.querySelector('.wish-input');
  const error = card.querySelector('.wish-error');
  const count = card.querySelector('.wish-count');
  const go = card.querySelector('.wish-go');
  const cancelBtn = card.querySelector('.wish-cancel');
  let isOpen = false;

  const sync = () => {
    count.textContent = `${[...input.value].length}/${maxLength}`;
    go.disabled = !validateWish(input.value, maxLength).ok;
  };
  const setError = (text) => { error.textContent = text; card.classList.toggle('invalid', Boolean(text)); };
  function close() {
    if (!isOpen) return;
    isOpen = false;
    card.classList.remove('open');
    input.value = ''; // 적은 글은 남기지 않는다
    input.blur(); // 포커스를 돌려줘야 게임 키가 다시 먹는다
  }
  function submit() {
    const v = validateWish(input.value, maxLength);
    if (!v.ok) { setError(WISH_REASONS[v.reason]); input.focus(); return; }
    setError('');
    close();
    onSubmit(v.wish);
  }
  function cancel() { close(); onCancel(); }

  // 카드 안의 키는 게임으로 보내지 않는다(글자 입력 중 이동·E·1·R·T 가 눌리지 않게).
  card.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.isComposing || e.keyCode === 229) return; // 한글 조합 중의 Enter 는 글자 확정용
    if (e.key === 'Enter' && e.target !== cancelBtn) { e.preventDefault(); submit(); } else if (e.key === 'Escape') { e.preventDefault(); cancel(); }
  });
  card.addEventListener('keyup', (e) => e.stopPropagation());
  input.addEventListener('input', () => { setError(''); sync(); });
  go.addEventListener('click', submit);
  cancelBtn.addEventListener('click', cancel);

  return {
    open() {
      input.value = '';
      setError('');
      sync();
      isOpen = true;
      card.classList.add('open');
      input.focus();
    },
    // 밖에서 닫을 때(공간 전환 등): 취소와 같다.
    cancel() { if (isOpen) cancel(); },
    get isOpen() { return isOpen; },
    dispose() { card.remove(); },
  };
}
