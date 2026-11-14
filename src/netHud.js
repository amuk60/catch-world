// 브라우저 전용: 멀티플레이 안내 칩(왼쪽 아래): "접속 중 N명"과 "다른 방문자 보기: 켜짐/꺼짐" 토글. 멀티플레이가 켜져 있을 때만 만든다.
export function createNetHud(container, { enabled, onToggle }) {
  const chip = document.createElement('div');
  chip.id = 'mp-chip';
  const dot = document.createElement('span');
  dot.className = 'mp-dot';
  const text = document.createElement('span');
  text.className = 'mp-text';
  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'mp-toggle';
  toggle.addEventListener('click', () => onToggle());
  chip.append(dot, text, toggle);
  container.append(chip);
  let on = enabled;
  let status = 'connecting';
  let count = 1;

  function render() {
    toggle.textContent = `다른 방문자 보기: ${on ? '켜짐' : '꺼짐'}`;
    toggle.setAttribute('aria-pressed', String(on));
    chip.dataset.state = on ? status : 'off';
    if (!on) text.textContent = '혼자 보는 중';
    else if (status === 'ready') text.textContent = `접속 중 ${count}명`;
    else if (status === 'lost') text.textContent = '연결이 끊겼어요. 다시 연결 중…';
    else text.textContent = '연결 중…';
  }
  render();
  return {
    set({ enabled: nextOn = on, status: nextStatus = status, count: nextCount = count }) {
      if (nextOn === on && nextStatus === status && nextCount === count) return;
      on = nextOn;
      status = nextStatus;
      count = nextCount;
      render();
    },
    dispose() { chip.remove(); },
  };
}
