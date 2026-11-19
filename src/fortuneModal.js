// 브라우저 전용: 포춘쿠키 모달(HUD). 단계: 'pick'(쿠키 3종 고르기) -> 'crack'(연타해서 깨기) -> 'burst'(깨지는 연출) -> 'card'(운세 종이 + 캐치 버튼).
// 입력(키보드)은 main.js 가 받고, 여기서는 화면과 클릭/터치만 맡는다. 쿠키 그림은 SVG(종류별 색)이고 금·흔들림·부스러기는 CSS 로 그린다.
const SVG_NS = 'http://www.w3.org/2000/svg';

// 쿠키 종류별 색: body 몸통, shade 그늘, edge 가장자리 선.
const LOOK = {
  gold: { body: '#f0b445', shade: '#d28a22', edge: '#a8641a' },
  choco: { body: '#8a5333', shade: '#5f3520', edge: '#3d2112' },
  matcha: { body: '#a9c97d', shade: '#7ea352', edge: '#587536' },
};
const BURST_MS = 900; // 깨지는 연출이 끝나고 종이가 나올 때까지
const MAX_CRUMBS = 48;

// 포춘쿠키 한 개(접힌 반달 모양)를 그리는 SVG 문자열.
export function cookieSvg(kind) {
  const c = LOOK[kind] ?? LOOK.gold;
  return `<svg viewBox="0 0 200 140" aria-hidden="true">
    <path d="M18 96 C 8 44 66 14 100 18 C 134 14 192 44 182 96 C 158 122 122 66 100 66 C 78 66 42 122 18 96 Z" fill="${c.body}" stroke="${c.edge}" stroke-width="5" stroke-linejoin="round"/>
    <path d="M30 92 C 24 54 70 30 100 30 C 112 30 126 34 138 42 C 110 38 60 52 44 96 Z" fill="${c.shade}" opacity="0.35"/>
    <path d="M100 66 C 94 56 96 40 104 22" fill="none" stroke="${c.edge}" stroke-width="4" stroke-linecap="round" opacity="0.55"/>
    <path d="M60 100 C 74 84 90 76 100 76 C 110 76 126 84 140 100" fill="none" stroke="${c.edge}" stroke-width="3.5" stroke-linecap="round" opacity="0.4"/>
    <ellipse cx="62" cy="48" rx="14" ry="6" fill="#fff" opacity="0.28" transform="rotate(-28 62 48)"/>
  </svg>`;
}

// onPick(index): 쿠키를 골랐다, onTap(): 깨는 중 쿠키를 눌렀다, onMore(): 한 개 더, onClose(), onCta(category, linkId).
export function createFortuneModal(container, { onPick = () => {}, onTap = () => {}, onMore = () => {}, onClose = () => {}, onCta = () => {} } = {}) {
  const root = document.createElement('div');
  root.id = 'fortune';
  root.innerHTML = `
    <div class="fortune-stage fortune-pick">
      <h2>포춘쿠키를 하나 골라 보세요</h2>
      <div class="pick-row"></div>
      <p class="fortune-hint">1 · 2 · 3 키 또는 클릭 &nbsp;·&nbsp; Esc로 닫기</p>
    </div>
    <div class="fortune-stage fortune-crack">
      <div class="crack-cookie" role="button" aria-label="쿠키 깨기">
        <div class="cookie-body">
          <div class="half half-l"></div>
          <div class="half half-r"></div>
          <svg class="cracks" viewBox="0 0 200 140" aria-hidden="true">
            <path class="crack-1" d="M100 20 L97 32 L103 40" />
            <path class="crack-2" d="M100 20 L97 32 L103 44 L96 56 L102 68 L98 80 L100 90" />
            <path class="crack-2b" d="M103 44 L118 50 M96 56 L82 62" />
          </svg>
          <div class="slip-peek"></div>
        </div>
        <div class="crumbs"></div>
      </div>
      <div class="crack-gauge" aria-hidden="true"><div class="crack-fill"></div></div>
      <p class="crack-label">쿠키를 깨는 중…</p>
      <p class="fortune-hint crack-hint">Space · E · Enter 를 연타하거나 쿠키를 마구 눌러 보세요! (멈추면 다시 단단해져요)</p>
    </div>
    <div class="fortune-stage fortune-card">
      <button type="button" class="fortune-close" aria-label="닫기">✕</button>
      <div class="fortune-cat"></div>
      <p class="fortune-text"></p>
      <button type="button" class="fortune-cta"></button>
      <p class="fortune-dest"></p>
      <div class="fortune-more-row"><button type="button" class="fortune-more">🥠 한 개 더 깨기 <kbd>R</kbd></button></div>
      <p class="fortune-hint">Esc 또는 ✕ 로 닫기</p>
    </div>`;
  container.append(root);
  const $ = (sel) => root.querySelector(sel);
  const pickRow = $('.pick-row');
  const crackCookie = $('.crack-cookie');
  const body = $('.cookie-body');
  const crumbs = $('.crumbs');
  const fill = $('.crack-fill');
  let stage = null; // null(닫힘) | 'pick' | 'crack' | 'burst' | 'card'
  let burstTimer = 0;
  let cardCategory = null;
  let cardLink = null;
  let currentKind = 'gold';

  function setStage(next) {
    stage = next;
    root.classList.toggle('open', next !== null);
    root.dataset.stage = next ?? '';
    if (document.activeElement && root.contains(document.activeElement)) document.activeElement.blur(); // 포커스가 남아 Space/Enter 가 버튼을 누르지 않게
  }

  const half = (el, kind) => { el.innerHTML = cookieSvg(kind); };

  function spawnCrumbs(n, power = 1) {
    for (let i = 0; i < n && crumbs.childElementCount < MAX_CRUMBS; i++) {
      const c = document.createElement('i');
      const a = Math.random() * Math.PI * 2;
      const d = (30 + Math.random() * 60) * power;
      c.style.setProperty('--dx', `${Math.cos(a) * d}px`);
      c.style.setProperty('--dy', `${Math.sin(a) * d * 0.7 - 24 * power}px`);
      c.style.setProperty('--s', `${4 + Math.random() * 5}px`);
      c.style.setProperty('--r', `${Math.floor(Math.random() * 360)}deg`);
      c.addEventListener('animationend', () => c.remove());
      crumbs.append(c);
    }
  }

  // 눌렀을 때 찌그러지는 모션(애니메이션 재시작).
  function squish() {
    body.classList.remove('tap');
    void body.offsetWidth;
    body.classList.add('tap');
  }

  root.querySelector('.fortune-close').addEventListener('click', () => onClose());
  root.addEventListener('pointerdown', (e) => { // 흐린 배경을 누르면 닫는다(쿠키를 깨는 중에는 닫지 않는다: 연타하다 빗나가도 안전하게)
    if (e.target === root && (stage === 'pick' || stage === 'card')) onClose();
  });
  crackCookie.addEventListener('pointerdown', (e) => { e.preventDefault(); if (stage === 'crack') onTap(); });
  $('.fortune-cta').addEventListener('click', () => onCta(cardCategory, cardLink));
  $('.fortune-more').addEventListener('click', () => onMore());

  return {
    stage: () => stage,
    isOpen: () => stage !== null,
    // 쿠키 고르기: kinds 는 COOKIE_KINDS.
    openPicker(kinds) {
      clearTimeout(burstTimer);
      pickRow.textContent = '';
      kinds.forEach((k, i) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = `pick-cookie kind-${k.id}`;
        b.innerHTML = `${cookieSvg(k.id)}<span class="pick-name">${k.label}</span><kbd>${i + 1}</kbd>`;
        b.addEventListener('click', () => onPick(i));
        pickRow.append(b);
      });
      setStage('pick');
    },
    // 고른 쿠키를 크게 보여 주고 깨기 시작.
    startCrack(kind) {
      clearTimeout(burstTimer);
      currentKind = kind.id;
      root.dataset.kind = kind.id;
      half($('.half-l'), kind.id);
      half($('.half-r'), kind.id);
      crumbs.textContent = '';
      body.className = 'cookie-body';
      crackCookie.dataset.level = '0';
      fill.style.width = '0%';
      $('.crack-label').textContent = `${kind.label}를 깨 보세요!`;
      setStage('crack');
    },
    // 진행 상태 반영(매 프레임 불러도 된다). state: { progress, stage }
    setProgress(state) {
      if (stage !== 'crack') return;
      fill.style.width = `${Math.round(state.progress * 100)}%`;
      crackCookie.dataset.level = String(state.stage);
    },
    // 눌렀다: 찌그러짐 + 부스러기 + 진행 표시.
    tap(state) {
      if (stage !== 'crack') return;
      squish();
      spawnCrumbs(2 + state.stage);
      this.setProgress(state);
    },
    // 깨졌다: 두 쪽으로 갈라지고 부스러기가 튄 뒤 종이 카드가 나온다.
    // link: 버튼이 가는 서비스 { id, name, desc }(CATCH_LINKS 항목). 버튼 아래에 "서비스 이름 · 한 줄 설명" 을 작게 보인다.
    burst(fortune, categoryName, ctaLabel, category, link) {
      if (stage !== 'crack') return;
      setStage('burst');
      crackCookie.dataset.level = '4';
      fill.style.width = '100%';
      body.classList.remove('tap');
      body.classList.add('broken');
      spawnCrumbs(24, 1.6);
      $('.crack-label').textContent = '';
      cardCategory = category;
      cardLink = link?.id ?? null;
      $('.fortune-dest').textContent = link ? `${link.name} · ${link.desc}` : '';
      $('.fortune-cat').textContent = `🥠 ${categoryName}`;
      $('.fortune-text').textContent = fortune.text;
      $('.fortune-cta').textContent = ctaLabel;
      burstTimer = setTimeout(() => setStage('card'), BURST_MS);
    },
    close() {
      clearTimeout(burstTimer);
      setStage(null);
    },
    get kind() { return currentKind; },
  };
}
