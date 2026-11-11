// 브라우저 전용: 툴팁과 말풍선(HTML). 컨테이너(#game) 안에 절대 위치로 놓는다.
const BUBBLE_MS = 3000;

export function createHud(container) {
  const tooltip = document.createElement('div');
  tooltip.id = 'tooltip';
  const bubble = document.createElement('div');
  bubble.id = 'bubble';
  container.append(tooltip, bubble);

  let bubbleTimer = 0;

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
  };
}
