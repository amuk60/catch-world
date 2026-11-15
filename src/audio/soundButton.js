// 브라우저 전용: 우상단 효과음 켜기/끄기 버튼과 M 키. 눌러도 포커스를 가져가지 않고(스페이스·엔터로 다시 눌리지 않는다), 게임의 E·숫자·R·Esc 키는 건드리지 않는다.
// Web Audio 를 쓸 수 없는 브라우저에서는 버튼을 만들지 않는다(게임은 소리 없이 그대로 돈다).
const SVG_ON = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9.5v5h3.5l4.5 3.5v-12L7.5 9.5z" fill="currentColor"/><path d="M15.5 9a4 4 0 0 1 0 6"/><path d="M18 6.5a8 8 0 0 1 0 11"/></svg>';
const SVG_OFF = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9.5v5h3.5l4.5 3.5v-12L7.5 9.5z" fill="currentColor"/><path d="M16 9.5l5 5"/><path d="M21 9.5l-5 5"/></svg>';

import { isTypingTarget as isTyping } from '../logic/typing.js'; // 입력 중에는 M 키가 반응하지 않는다

// container: #game, sfx: audio/sfx.js 의 sfx.
export function createSoundButton(container, sfx) {
  if (!sfx.supported) return null;
  const button = document.createElement('button');
  button.id = 'sound-btn';
  button.type = 'button';
  const sync = () => {
    const muted = sfx.isMuted();
    button.innerHTML = muted ? SVG_OFF : SVG_ON;
    button.setAttribute('aria-label', muted ? '효과음 켜기' : '효과음 끄기');
    button.setAttribute('aria-pressed', muted ? 'true' : 'false');
    button.title = muted ? '효과음 켜기 (M)' : '효과음 끄기 (M)';
    button.classList.toggle('muted', muted);
  };
  const toggle = () => {
    const muted = sfx.toggleMuted();
    if (!muted) sfx.play('click'); // 켠 순간 작은 소리로 알려 준다
  };
  button.addEventListener('pointerdown', (e) => e.preventDefault()); // 포커스를 가져가지 않는다
  button.addEventListener('click', () => { toggle(); button.blur(); });
  window.addEventListener('keydown', (e) => {
    if (e.code !== 'KeyM' || e.repeat || e.ctrlKey || e.metaKey || e.altKey || isTyping(e.target)) return;
    toggle();
  });
  sfx.onChange(sync);
  sync();
  container.append(button);
  return button;
}
