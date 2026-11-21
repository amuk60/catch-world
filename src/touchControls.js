// 브라우저 전용: 모바일(터치 기기) 조작 화면. PC 에서는 아무것도 부르지 않는다(main.js 가 logic/device.js 로 판정한 뒤에만 쓴다. 이 파일은 불러오기만 해서는 아무 일도 하지 않는다).
// - installTouchPage: <html class="touch">, 터치용 스타일(가로 배치 + 세로 화면이면 <html class="portrait"> 배치), 확대·당겨서 새로고침·길게 눌러 선택 막기, 첫 터치에서 소리 풀기, 키보드가 올라왔을 때 입력 카드 위치, 화면 크기 변화 대응.
// - createTouchUi: 왼쪽 아래 가상 조이스틱, 오른쪽 아래 E 버튼(가까운 대상 문구가 버튼 글자)·V 버튼·취소 버튼, 오른쪽 위 ⋯ 메뉴.
// - createTouchCamera: 캔버스 위 손가락 입력(한 손가락 끌기 = 회전, 탭 = 땅 탭 이동, 두 손가락 = 확대·축소). 포인터마다 따로 처리해서 조이스틱과 동시에 쓸 수 있다.
// 버튼은 키보드 이벤트를 흉내 낸다(pressKey): 게임 규칙(모드별로 받는 키)은 PC 와 똑같은 코드가 그대로 맡는다.
import { clampKnob, stickVector, stickDirection, isTap, passedDragSlop, gapOf } from './logic/touchInput.js';
import { isPortraitView } from './logic/device.js';

// 세로 화면(<html class="touch portrait">) 배치. 가로 배치(CSS) 뒤에 붙어 같은 요소를 덮어쓴다.
// 위쪽 세 줄: 1) 스트레스 막대(폭 전체) 2) 힐링 코스(왼쪽) · ⋯ 메뉴/소리(오른쪽) 3) 접속 칩(왼쪽) · 캐치 칩(오른쪽). 그 아래에 안내 글(토스트·불멍).
// 아래쪽: 조이스틱(왼쪽), E·V·취소 버튼과 그 위 행동 막대(오른쪽, 조이스틱 오른쪽 폭 안). 카드·팝업은 폭 전체 시트나 가운데 카드.
const PORTRAIT_CSS = `
html.touch.portrait { --p-row2: calc(50px + var(--st)); --p-row3: calc(98px + var(--st)); --p-below: calc(160px + var(--st)); --p-side: calc(8px + var(--sl)); --p-side-r: calc(8px + var(--sr)); }
html.touch.portrait #stress { left: var(--p-side); right: var(--p-side-r); top: calc(6px + var(--st)); transform: none; flex-direction: row; align-items: center; gap: 10px; padding: 7px 14px; border-radius: 999px; box-sizing: border-box; }
html.touch.portrait .stress-label { flex: none; font-size: 13px; white-space: nowrap; }
html.touch.portrait .stress-label b { font-size: 15px; }
html.touch.portrait .stress-bar { flex: 1; width: auto; min-width: 60px; }
html.touch.portrait #sound-btn { top: var(--p-row2); right: var(--p-side-r); }
html.touch.portrait .tc-menu-btn { top: var(--p-row2); right: calc(56px + var(--sr)); }
html.touch.portrait .tc-menu { top: var(--p-row3); right: var(--p-side-r); width: min(280px, calc(100% - 16px)); max-height: calc(100dvh - 120px - var(--st) - var(--sb)); }
html.touch.portrait .tc-menu button { font-size: 15px; }
html.touch.portrait .tc-menu .tc-legal { font-size: 12px; }
html.touch.portrait #tut-course { left: var(--p-side); top: var(--p-row2); width: auto; min-width: 0; max-width: calc(100% - 124px - var(--sl) - var(--sr)); font-size: 13px; }
html.touch.portrait #tut-course:not(.collapsed) { z-index: 4; }
html.touch.portrait #tut-course .tut-body { max-height: calc(100dvh - 330px - var(--st) - var(--sb)); }
html.touch.portrait #tut-course .tut-hint { font-size: 12px; }
html.touch.portrait #cta-chip { top: var(--p-row3); right: var(--p-side-r); padding: 7px 12px; font-size: 13px; }
html.touch.portrait #mp-chip { left: var(--p-side); right: auto; top: var(--p-row3); bottom: auto; transform: none; min-width: 0; max-width: calc(100% - 150px - var(--sl) - var(--sr)); justify-content: flex-start;
  padding: 4px 8px; font-size: 11px; opacity: 0.88; z-index: 1; } /* ⋯ 메뉴·힐링 코스 목록이 칩 위로 펼쳐지게 */
html.touch.portrait #tut-course .tut-body { background: rgba(18, 18, 31, 0.95); }
html.touch.portrait .mp-nick { max-width: 120px; }
html.touch.portrait #tut-toast { top: var(--p-below); max-width: calc(100% - 24px); min-width: 0; width: max-content; box-sizing: border-box; font-size: 14px; }
html.touch.portrait #meditate, html.touch.portrait #meditate.fp.visible { top: var(--p-below); width: max-content; max-width: calc(100% - 24px); min-width: 0; box-sizing: border-box; }
html.touch.portrait #tut-hint { left: var(--p-side); top: var(--p-below); max-width: calc(100% - 16px); font-size: 13px; }
html.touch.portrait #guide { top: var(--p-row3); left: var(--p-side); right: var(--p-side-r); width: auto; max-height: calc(100dvh - 300px - var(--st) - var(--sb)); font-size: 13px; z-index: 4; }
html.touch.portrait #tut-intro { max-width: calc(100% - 24px); }
html.touch.portrait #tut-intro p { font-size: 14px; }
/* 아래쪽 */
html.touch.portrait .tc-row { max-width: calc(100% - 184px - var(--sl) - var(--sr)); }
html.touch.portrait .tc-e { max-width: 100%; }
html.touch.portrait #action-bar { max-width: calc(100% - 184px - var(--sl) - var(--sr)); bottom: calc(80px + var(--sb)); }
html.touch.portrait.tc-v-on #action-bar { bottom: calc(142px + var(--sb)); }
html.touch.portrait #action-bar button { padding: 6px 14px; }
html.touch.portrait #roast-panel { bottom: calc(84px + var(--sb)); max-width: calc(100% - 16px); box-sizing: border-box; }
html.touch.portrait .roast-gauge { width: min(220px, 60vw); }
/* 카드·팝업 */
html.touch.portrait #side-popup { top: auto; bottom: calc(8px + var(--sb)); left: var(--p-side); right: var(--p-side-r); width: auto; max-width: none; max-height: 62vh; max-height: 62dvh;
  transform: translate(0, calc(100% + 40px)); }
html.touch.portrait #side-popup.open { transform: translate(0, 0); }
html.touch.portrait .side-message { font-size: 14px; }
html.touch.portrait .result-card { width: calc(100% - 32px); max-width: 440px; box-sizing: border-box; padding: 22px 18px 12px; }
html.touch.portrait .result-message { font-size: 15px; }
html.touch.portrait #choice { padding-bottom: calc(10px + var(--sb)); }
html.touch.portrait .choice-card { max-height: calc(100dvh - 160px - var(--st) - var(--sb)); }
html.touch.portrait .choice-list button { min-height: 48px; font-size: 15px; text-align: left; white-space: normal; }
html.touch.portrait .picker-card { bottom: calc(16px + var(--sb)); width: calc(100% - 16px); max-height: calc(100dvh - 180px - var(--st) - var(--sb)); }
html.touch.portrait .fortune-stage { max-width: calc(100% - 24px); }
html.touch.portrait .pick-cookie { width: 30vw; max-width: 124px; }
html.touch.portrait .pick-cookie svg { width: 22vw; max-width: 86px; }
html.touch.portrait .crack-cookie { width: min(240px, 70vw); height: min(168px, 49vw); }
html.touch.portrait .fortune-card { max-width: calc(100% - 8px); box-sizing: border-box; }
html.touch.portrait #nick-card, html.touch.portrait #wish-card { width: calc(100% - 24px); max-width: 380px; }
html.touch.portrait #qc-picker { top: var(--p-row3); right: var(--p-side-r); max-height: calc(100dvh - 120px - var(--st) - var(--sb)); }
html.touch.portrait #qc-picker button { font-size: 15px; min-height: 40px; }
html.touch.portrait #bubble { max-width: min(260px, 80vw); }
html.touch.portrait .speech { max-width: min(240px, 80vw); }
html.touch.portrait .speech.big { max-width: min(280px, 80vw); font-size: 22px; }
`;

const CSS = `
html.touch { --sl: env(safe-area-inset-left, 0px); --sr: env(safe-area-inset-right, 0px); --st: env(safe-area-inset-top, 0px); --sb: env(safe-area-inset-bottom, 0px); }
html.touch, html.touch body { overscroll-behavior: none; -webkit-text-size-adjust: 100%; text-size-adjust: 100%; }
html.touch body { position: fixed; inset: 0; overflow: hidden; touch-action: none; -webkit-user-select: none; user-select: none; -webkit-touch-callout: none; -webkit-tap-highlight-color: transparent; }
html.touch input, html.touch textarea { -webkit-user-select: text; user-select: text; -webkit-touch-callout: default; font-size: 16px !important; touch-action: manipulation; }
html.touch button { touch-action: manipulation; }
html.touch #wrap { position: fixed; left: 0; top: 0; width: 100%; height: 100vh; height: 100dvh; }
html.touch #game canvas { touch-action: none; }
html.touch footer, html.touch #prompt, html.touch #qc-btn, html.touch #guide-btn, html.touch #tooltip { display: none !important; }
html.touch .keycap { box-shadow: none; }
html.touch #action-bar .keycap, html.touch #roast-panel .keycap, html.touch .picker-list .keycap, html.touch .choice-list .keycap, html.touch .choice-cancel .keycap,
html.touch .picker-cancel .keycap, html.touch #fortune kbd, html.touch #qc-picker .keycap { display: none !important; }
/* 위쪽: 스트레스 막대(가운데)·힐링 코스(왼쪽)·소리/메뉴/캐치 칩(오른쪽) */
html.touch #stress { top: calc(6px + var(--st)); padding: 5px 10px; gap: 3px; }
html.touch .stress-label { font-size: 12px; }
html.touch .stress-label b { font-size: 14px; }
html.touch .stress-bar { width: 160px; height: 8px; }
html.touch #sound-btn { top: calc(8px + var(--st)); right: calc(8px + var(--sr)); width: 40px; height: 40px; }
html.touch #cta-chip { top: calc(10px + var(--st)); right: calc(104px + var(--sr)); padding: 7px 12px; font-size: 13px; }
html.touch #tut-course { left: calc(8px + var(--sl)); top: calc(8px + var(--st)); width: 210px; font-size: 12px; }
html.touch #tut-course .tut-toggle { padding: 7px 4px 7px 10px; }
html.touch #tut-course .tut-close { width: 34px; height: 34px; }
html.touch #tut-course .tut-body { max-height: calc(100vh - 220px); max-height: calc(100dvh - 220px); overflow-y: auto; touch-action: pan-y; -webkit-overflow-scrolling: touch; }
html.touch #tut-course .tut-item { padding: 5px 6px; }
html.touch #tut-course .tut-hint { font-size: 11px; }
html.touch #tut-toast { top: calc(50px + var(--st)); font-size: 14px; max-width: calc(100% - 480px); min-width: 220px; }
html.touch #tut-toast { pointer-events: none; }
html.touch #tut-hint { left: calc(8px + var(--sl)); top: calc(56px + var(--st)); max-width: 200px; font-size: 12px; }
html.touch #tut-intro { max-height: calc(100vh - 20px); max-height: calc(100dvh - 20px); overflow-y: auto; touch-action: pan-y; padding: 14px 18px 10px; }
html.touch #tut-intro h2 { font-size: 17px; margin-bottom: 6px; }
html.touch #tut-intro p { margin-bottom: 6px; font-size: 13px; }
html.touch #tut-intro .tut-note { margin: 6px 0 10px; }
html.touch #tut-intro .tut-skip, html.touch #tut-toast .tut-skip { padding: 8px 12px; }
html.touch #guide { top: calc(56px + var(--st)); right: calc(8px + var(--sr)); bottom: auto; left: auto; transform: none; width: 300px; max-height: calc(100vh - 160px); max-height: calc(100dvh - 160px);
  overflow-y: auto; font-size: 12px; line-height: 1.45; padding: 8px 12px; }
html.touch #guide li { display: block; padding: 2px 0; }
html.touch #guide .guide-replay { display: none; }
html.touch #guide .guide-close { width: 36px; height: 36px; top: 2px; right: 2px; }
/* 아래쪽: 접속 칩(가운데)·불멍 안내·굽기 패널 */
html.touch #mp-chip { left: 50%; bottom: calc(6px + var(--sb)); transform: translateX(-50%); max-width: calc(100% - 420px); min-width: 180px; flex-wrap: wrap; justify-content: center; gap: 2px 6px;
  padding: 4px 8px; font-size: 11px; }
html.touch .mp-nick { max-width: 150px; }
html.touch .mp-toggle { padding: 4px 8px; }
html.touch #meditate, html.touch #meditate.fp.visible { top: calc(54px + var(--st)); bottom: auto; font-size: 13px; padding: 6px 12px; max-width: calc(100% - 480px); min-width: 200px; white-space: normal; text-align: center; word-break: keep-all; }
html.touch #roast-panel { bottom: calc(46px + var(--sb)); padding: 8px 12px; }
html.touch .roast-hint { display: none; }
html.touch .roast-turn, html.touch .roast-pull { min-height: 52px; padding: 8px 20px; font-size: 16px; }
html.touch .roast-gauge { width: 220px; }
/* 행동 막대: 오른쪽 아래(E 버튼 위), 엄지로 누르기 쉬운 크기 */
html.touch #action-bar { left: auto; right: calc(10px + var(--sr)); bottom: calc(84px + var(--sb)); transform: none; padding: 5px; gap: 6px; max-width: 54vw; flex-wrap: wrap; justify-content: flex-end; border-radius: 30px; }
html.touch #action-bar button { min-height: 50px; padding: 6px 16px; font-size: 15px; }
/* 팝업·카드: 낮은 가로 화면에서 잘리지 않게(넘치면 안에서 스크롤) */
html.touch .choice-card { max-height: calc(100vh - 70px); max-height: calc(100dvh - 70px); overflow-y: auto; touch-action: pan-y; }
html.touch #choice { padding-left: calc(12px + var(--sl)); padding-right: calc(12px + var(--sr)); padding-bottom: calc(8px + var(--sb)); }
html.touch .choice-list button { min-height: 44px; }
html.touch .choice-cancel, html.touch .picker-cancel { padding: 10px 12px; font-size: 14px; }
html.touch .picker-card { bottom: calc(78px + var(--sb)); max-height: calc(100vh - 96px); max-height: calc(100dvh - 96px); overflow-y: auto; touch-action: pan-y; }
html.touch .result-card { max-height: calc(100vh - 16px); max-height: calc(100dvh - 16px); overflow-y: auto; touch-action: pan-y; padding: 16px 18px 10px; }
html.touch .result-title { font-size: 21px; margin-bottom: 6px; }
html.touch .result-message { font-size: 14px; margin-bottom: 12px; }
html.touch .result-cta { font-size: 17px; padding: 12px 16px; }
html.touch .result-row { margin-top: 8px; }
html.touch .result-text { padding: 10px 12px; }
html.touch #side-popup { top: calc(54px + var(--st)); right: calc(10px + var(--sr)); width: 250px; padding: 14px 14px 10px; max-height: calc(100vh - 64px); max-height: calc(100dvh - 64px); overflow-y: auto;
  touch-action: pan-y; transform: translate(calc(100% + 24px), 0); }
html.touch #side-popup.open { transform: translate(0, 0); }
html.touch .side-title { font-size: 18px; margin-bottom: 4px; }
html.touch .side-message { font-size: 13px; margin-bottom: 10px; }
html.touch .side-cta { font-size: 15px; padding: 11px 8px; }
html.touch .side-close, html.touch .fortune-close { width: 44px; height: 44px; top: 0; right: 0; }
html.touch .side-later { padding: 10px; }
html.touch .fortune-stage { max-height: calc(100vh - 16px); max-height: calc(100dvh - 16px); overflow-y: auto; touch-action: pan-y; }
html.touch .fortune-pick h2 { font-size: 18px; margin-bottom: 10px; }
html.touch .pick-cookie { width: 124px; }
html.touch .pick-cookie svg { width: 86px; }
html.touch .crack-cookie { width: 240px; height: 168px; }
html.touch .fortune-card { padding: 22px 20px 10px; }
html.touch .fortune-text { font-size: 16px; margin-bottom: 10px; }
html.touch .fortune-more { padding: 10px 16px; }
.tc-fclose { display: none; position: absolute; top: calc(8px + var(--st)); right: calc(10px + var(--sr)); width: 46px; height: 46px; border: 0; border-radius: 50%;
  background: rgba(255, 255, 255, 0.2); color: #fff; font-size: 22px; line-height: 1; cursor: pointer; z-index: 1; }
#fortune[data-stage="pick"] .tc-fclose, #fortune[data-stage="crack"] .tc-fclose { display: block; }
html.touch #nick-card, html.touch #wish-card { max-height: calc(100vh - 16px); max-height: calc(100dvh - 16px); overflow-y: auto; touch-action: pan-y; padding: 14px 16px 8px; }
html.touch .wish-cancel, html.touch .nick-later { padding: 10px 14px; }
html.touch .nick-dice { min-height: 44px; }
html.touch.kb-open #nick-card, html.touch.kb-open #wish-card { top: var(--kb-mid, 50%); max-height: calc(var(--kb-h, 100vh) - 8px); padding-top: 8px; }
html.touch.kb-open .wish-sub, html.touch.kb-open .wish-note, html.touch.kb-open .nick-note, html.touch.kb-open #wish-card h2, html.touch.kb-open #nick-card h2 { display: none; }
html.touch #qc-picker { top: calc(54px + var(--st)); bottom: auto; right: calc(56px + var(--sr)); max-height: calc(100vh - 64px); max-height: calc(100dvh - 64px); overflow-y: auto; }
html.touch #qc-picker button { min-height: 36px; }
/* 터치 조작 층 */
#touch-ui { position: absolute; inset: 0; pointer-events: none; z-index: 2; }
#touch-ui .tc-stick, #touch-ui .tc-row > button, #touch-ui .tc-menu-btn, #touch-ui .tc-menu { pointer-events: auto; }
.tc-stick { position: absolute; left: calc(4px + var(--sl)); bottom: calc(4px + var(--sb)); width: 168px; height: 168px; touch-action: none; }
.tc-base { position: absolute; left: 50%; top: 50%; width: 116px; height: 116px; margin: -58px 0 0 -58px; box-sizing: border-box; border-radius: 50%;
  border: 2px solid rgba(255, 255, 255, 0.4); background: rgba(18, 18, 31, 0.32); transition: background 0.12s; }
.tc-knob { position: absolute; left: 50%; top: 50%; width: 54px; height: 54px; margin: -27px 0 0 -27px; border-radius: 50%; background: rgba(255, 255, 255, 0.6);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.35); will-change: transform; }
.tc-stick.on .tc-base { background: rgba(18, 18, 31, 0.5); }
.tc-stick.on .tc-knob { background: rgba(255, 233, 200, 0.9); }
#touch-ui[data-mode="fortune"] .tc-stick, #touch-ui[data-mode="result"] .tc-stick, #touch-ui[data-mode="item-choice"] .tc-stick, #touch-ui[data-mode="interview-choice"] .tc-stick,
#touch-ui[data-mode="interview-play"] .tc-stick, #touch-ui[data-mode="wishing"] .tc-stick, #touch-ui[data-mode="roasting"] .tc-stick { display: none; }
.tc-row { position: absolute; right: calc(10px + var(--sr)); bottom: calc(12px + var(--sb)); display: flex; flex-direction: column-reverse; align-items: flex-end; gap: 8px; max-width: 60vw; }
html.touch.tc-v-on #action-bar { bottom: calc(146px + var(--sb)); } /* V 버튼(E 위)이 떠 있으면 행동 막대를 그 위로 */
.tc-row > button { display: none; align-items: center; gap: 10px; min-height: 56px; box-sizing: border-box; border: 0; border-radius: 999px; font: inherit; color: #fff; cursor: pointer;
  box-shadow: 0 3px 12px rgba(0, 0, 0, 0.35); white-space: nowrap; }
.tc-row > button.visible { display: flex; }
.tc-row > button:active { transform: scale(0.95); }
.tc-e { max-width: 44vw; padding: 5px 18px 5px 5px; background: rgba(232, 131, 58, 0.94); font-size: 16px; font-weight: 700; }
.tc-e .tc-key { flex: none; width: 46px; height: 46px; display: flex; align-items: center; justify-content: center; border-radius: 50%; background: #fff; color: #c25a14; font-size: 20px; font-weight: 800; }
.tc-e .tc-label { overflow: hidden; text-overflow: ellipsis; }
.tc-e.hint { min-height: 40px; padding: 8px 14px; background: rgba(18, 18, 31, 0.8); font-size: 14px; font-weight: 500; pointer-events: none; }
.tc-e.hint .tc-key { display: none; }
.tc-v, .tc-cancel { padding: 6px 16px; background: rgba(18, 18, 31, 0.82); font-size: 15px; font-weight: 600; min-height: 52px; }
.tc-v .tc-key { display: inline-flex; align-items: center; justify-content: center; width: 28px; height: 28px; border-radius: 50%; background: #fff; color: #1b1b2f; font-weight: 800; font-size: 14px; }
.tc-menu-btn { position: absolute; top: calc(8px + var(--st)); right: calc(56px + var(--sr)); width: 40px; height: 40px; padding: 0; border: 0; border-radius: 999px;
  background: rgba(18, 18, 31, 0.78); color: #fff; font: 700 20px/1 system-ui, sans-serif; letter-spacing: 1px; cursor: pointer; }
.tc-menu-btn.on { background: #e8833a; }
.tc-menu { position: absolute; top: calc(54px + var(--st)); right: calc(8px + var(--sr)); display: none; flex-direction: column; gap: 4px; width: 240px; box-sizing: border-box;
  max-height: calc(100vh - 64px); max-height: calc(100dvh - 64px); overflow-y: auto; touch-action: pan-y; padding: 8px; border-radius: 14px; background: rgba(253, 246, 227, 0.97);
  box-shadow: 0 8px 26px rgba(0, 0, 0, 0.45); color: #3a2f1f; }
.tc-menu.open { display: flex; }
.tc-menu button { display: flex; align-items: center; gap: 8px; min-height: 44px; padding: 6px 10px; border: 0; border-radius: 10px; background: transparent; color: #3a2f1f;
  font: inherit; font-size: 15px; text-align: left; cursor: pointer; }
.tc-menu button:active { background: #f0e1b8; }
.tc-menu .tc-legal { margin: 4px 6px 2px; font-size: 11px; line-height: 1.45; color: #6b5d44; word-break: keep-all; }
${PORTRAIT_CSS}
`;

// 게임 키를 누른 것처럼 키 이벤트를 보낸다(keydown 뒤 keyup). 게임의 모드별 키 규칙을 그대로 쓰려는 것: 터치 버튼은 이것만 부른다.
// 사용자 제스처(click) 안에서 바로 부르므로, 이 키로 열린 입력창(소원 카드)의 focus() 도 제스처 안에서 일어나 iOS 가 키보드를 띄운다.
export function pressKey(code, key = code) {
  const target = document.body || window;
  for (const type of ['keydown', 'keyup']) {
    try { target.dispatchEvent(new KeyboardEvent(type, { code, key, bubbles: true, cancelable: true })); } catch { /* 아주 옛 브라우저: 무시 */ }
  }
}

// 위로 올라가며 안에서 스크롤할 수 있는 상자가 있나(그 안의 손가락 끌기는 막지 않는다).
function insideScrollable(el) {
  for (let n = el; n && n !== document.body && n.nodeType === 1; n = n.parentElement) {
    let oy = '';
    try { oy = getComputedStyle(n).overflowY; } catch { /* 무시 */ }
    if ((oy === 'auto' || oy === 'scroll') && n.scrollHeight > n.clientHeight + 1) return true;
  }
  return false;
}

const isTextInput = (el) => Boolean(el && (el.tagName === 'TEXTAREA' || (el.tagName === 'INPUT' && !/^(button|checkbox|radio|range|submit|reset|file|image|color)$/i.test(el.type || ''))));

// 페이지 설정(한 번만). opts: { sfx(audio/sfx.js), text(MOBILE.text) }. 돌려준 setResize(fn) 로 렌더러 크기 갱신 함수를 넘기면 회전·주소창 변화 때 부른다.
export function installTouchPage({ sfx = null, text = {} } = {}) {
  const root = document.documentElement;
  root.classList.add('touch');
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.append(style);

  let resizeFn = null;
  const orientationFns = [];
  const vv = window.visualViewport;
  // 가로·세로 모두 플레이한다. 세로면 <html class="touch portrait"> 로 배치(CSS)만 바꾼다. 바뀌는 순간 잡고 있던 조이스틱·카메라 손가락을 놓는다(위치가 옮겨져 어긋나지 않게).
  function syncOrientation() {
    const w = window.innerWidth || document.documentElement.clientWidth || 0;
    const h = window.innerHeight || document.documentElement.clientHeight || 0;
    const prev = root.classList.contains('portrait');
    const next = isPortraitView({ touch: true, width: w, height: h, keyboardOpen: root.classList.contains('kb-open'), prev }); // 키보드가 떠 있으면 높이가 줄어도 그대로
    if (next === prev) return;
    root.classList.toggle('portrait', next);
    for (const fn of orientationFns) { try { fn(next); } catch { /* 무시 */ } }
  }
  function syncKeyboard() {
    const el = document.activeElement;
    const h = vv?.height ?? window.innerHeight;
    const typing = isTextInput(el) && h < (window.innerHeight || h) * 0.85;
    root.classList.toggle('kb-open', Boolean(typing && vv));
    if (typing && vv) {
      root.style.setProperty('--kb-mid', `${Math.round((vv.offsetTop || 0) + vv.height / 2)}px`);
      root.style.setProperty('--kb-h', `${Math.round(vv.height)}px`);
    }
  }
  let later = 0;
  function onViewport() {
    syncKeyboard();
    syncOrientation();
    try { resizeFn?.(); } catch { /* 무시 */ }
    clearTimeout(later);
    later = setTimeout(() => { syncKeyboard(); syncOrientation(); try { resizeFn?.(); } catch { /* 무시 */ } }, 350); // iOS 는 회전 직후 크기를 늦게 알려 준다
  }
  window.addEventListener('resize', onViewport);
  window.addEventListener('orientationchange', onViewport);
  vv?.addEventListener?.('resize', onViewport);
  vv?.addEventListener?.('scroll', syncKeyboard);
  document.addEventListener('focusin', () => setTimeout(syncKeyboard, 50));
  document.addEventListener('focusout', () => setTimeout(() => {
    syncKeyboard();
    if (!isTextInput(document.activeElement)) { try { window.scrollTo(0, 0); } catch { /* 무시 */ } } // iOS 가 키보드를 닫은 뒤 화면을 밀어 둔 채로 두지 않게
  }, 80));
  syncOrientation();

  // 확대(두 손가락·두 번 탭)·당겨서 새로고침·길게 눌러 메뉴 막기. 안에서 스크롤하는 카드의 끌기와 입력칸은 그대로 둔다.
  const stop = (e) => { try { e.preventDefault(); } catch { /* 무시 */ } };
  for (const type of ['gesturestart', 'gesturechange', 'gestureend']) document.addEventListener(type, stop, { passive: false }); // iOS 사파리의 핀치 확대
  document.addEventListener('dblclick', stop, { passive: false });
  document.addEventListener('touchmove', (e) => {
    if (e.touches && e.touches.length > 1) { stop(e); return; }
    if (!insideScrollable(e.target)) stop(e);
  }, { passive: false });
  document.addEventListener('contextmenu', (e) => { if (!isTextInput(e.target)) stop(e); });

  // 소리: iOS 는 touchend·click 같은 "끝난" 제스처 안에서만 소리를 풀어 준다(엔진은 pointerdown·touchstart 에서 만든다). 끊겼다(전화·백그라운드) 돌아와도 다음 터치에 다시 푼다.
  let primed = false;
  const unlock = () => {
    try {
      sfx?.unlock?.();
      const ctx = sfx?.engine?.context;
      if (!ctx) return;
      if (ctx.state !== 'running' && !document.hidden) { const p = ctx.resume?.(); p?.catch?.(() => {}); }
      if (!primed) { // 아주 짧은 무음 하나를 재생해 두면 옛 iOS 도 소리 길이 열린다
        primed = true;
        const b = ctx.createBuffer(1, 1, 22050);
        const s = ctx.createBufferSource();
        s.buffer = b;
        s.connect(ctx.destination);
        s.start(0);
      }
    } catch { /* 소리 없이 계속 */ }
  };
  for (const type of ['touchend', 'pointerup', 'click']) window.addEventListener(type, unlock, { capture: true, passive: true });

  return {
    setResize(fn) { resizeFn = fn; },
    onOrientation(fn) { orientationFns.push(fn); }, // 가로 <-> 세로가 바뀔 때 fn(portrait)
    get portrait() { return root.classList.contains('portrait'); },
  };
}

// 터치 조작 화면. opts: { container(#game), stick(MOBILE.stick), onStickStart(), menu: [{ label, onClick }], legal(작은 안내 글) }
export function createTouchUi({ container, stick: stickCfg, onStickStart = () => {}, menu = [], legal = '' }) {
  const root = document.createElement('div');
  root.id = 'touch-ui';
  root.dataset.mode = 'free';

  // 가상 조이스틱(왼쪽 아래). 누른 손가락 하나만 따라간다(다른 손가락은 카메라·버튼으로).
  const zone = document.createElement('div');
  zone.className = 'tc-stick';
  zone.setAttribute('aria-label', '이동 조이스틱');
  zone.innerHTML = '<div class="tc-base"></div><div class="tc-knob"></div>';
  const base = zone.querySelector('.tc-base');
  const knob = zone.querySelector('.tc-knob');
  let stickId = null;
  let center = { x: 0, y: 0 };
  let vec = { x: 0, y: 0, mag: 0 };
  const radius = stickCfg?.radius ?? 46;
  function moveStick(e) {
    const dx = e.clientX - center.x;
    const dy = e.clientY - center.y;
    const k = clampKnob(dx, dy, radius);
    knob.style.transform = `translate(${k.x.toFixed(1)}px, ${k.y.toFixed(1)}px)`;
    vec = stickVector(dx, dy, { radius, deadZone: stickCfg?.deadZone ?? 0.18 });
  }
  function endStick(e) {
    if (stickId === null || (e && e.pointerId !== stickId)) return;
    stickId = null;
    vec = { x: 0, y: 0, mag: 0 };
    knob.style.transform = '';
    zone.classList.remove('on');
  }
  zone.addEventListener('pointerdown', (e) => {
    if (stickId !== null) return;
    e.preventDefault();
    stickId = e.pointerId;
    try { zone.setPointerCapture(e.pointerId); } catch { /* 없으면 영역 안에서만 */ }
    const r = base.getBoundingClientRect();
    center = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    zone.classList.add('on');
    moveStick(e);
    onStickStart();
  });
  zone.addEventListener('pointermove', (e) => { if (e.pointerId === stickId) moveStick(e); });
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) zone.addEventListener(type, endStick);

  // 오른쪽 아래 버튼 줄(오른쪽부터 E · V · 취소).
  const row = document.createElement('div');
  row.className = 'tc-row';
  const mk = (cls, html, onTap) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = cls;
    b.innerHTML = html;
    b.addEventListener('pointerdown', (e) => e.preventDefault()); // 포커스를 가져가지 않는다
    b.addEventListener('click', (e) => { e.preventDefault(); onTap(); });
    row.append(b);
    return b;
  };
  const eBtn = mk('tc-e', '<span class="tc-key">E</span><span class="tc-label"></span>', () => { if (!eBtn.classList.contains('hint')) pressKey('KeyE', 'e'); });
  const eLabel = eBtn.querySelector('.tc-label');
  const vBtn = mk('tc-v', '<span class="tc-key">V</span><span class="tc-label"></span>', () => pressKey('KeyV', 'v'));
  const vLabel = vBtn.querySelector('.tc-label');
  const cancelBtn = mk('tc-cancel', '취소', () => pressKey('Escape'));

  // ⋯ 메뉴(오른쪽 위): 보조 기능과 비공식 안내.
  const menuBtn = document.createElement('button');
  menuBtn.type = 'button';
  menuBtn.className = 'tc-menu-btn';
  menuBtn.textContent = '⋯';
  menuBtn.setAttribute('aria-label', '메뉴');
  menuBtn.setAttribute('aria-expanded', 'false');
  const panel = document.createElement('div');
  panel.className = 'tc-menu';
  panel.setAttribute('role', 'menu');
  let menuOpen = false;
  const setMenu = (open) => { menuOpen = open; panel.classList.toggle('open', open); menuBtn.classList.toggle('on', open); menuBtn.setAttribute('aria-expanded', String(open)); };
  for (const item of menu) {
    const b = document.createElement('button');
    b.type = 'button';
    b.setAttribute('role', 'menuitem');
    b.textContent = item.label;
    b.addEventListener('pointerdown', (e) => e.preventDefault());
    b.addEventListener('click', () => { setMenu(false); item.onClick(); });
    panel.append(b);
  }
  if (legal) { const p = document.createElement('p'); p.className = 'tc-legal'; p.textContent = legal; panel.append(p); }
  menuBtn.addEventListener('pointerdown', (e) => e.preventDefault());
  menuBtn.addEventListener('click', () => setMenu(!menuOpen));
  window.addEventListener('pointerdown', (e) => { if (menuOpen && !panel.contains(e.target) && !menuBtn.contains(e.target)) setMenu(false); }, true); // 메뉴 밖을 누르면 닫는다

  root.append(zone, row, menuBtn, panel);
  container.append(root);

  const release = () => { endStick(); };
  window.addEventListener('blur', release);
  document.addEventListener('visibilitychange', () => { if (document.hidden) { release(); setMenu(false); } });

  let mode = 'free';
  let promptKey = '';
  return {
    // 조이스틱 이동 벡터(월드 x-z, 길이 = 속도 배율). 놓았거나 데드존 안이면 null.
    moveDirection(azimuthDeg) {
      if (stickId === null) return null;
      return stickDirection(vec, azimuthDeg, stickCfg?.minSpeed ?? 0.45);
    },
    get stickActive() { return stickId !== null; },
    // E 안내 문구를 버튼으로: text 가 없으면 숨김, actionable 이 false 면 누를 수 없는 힌트. extra({ key, label }) 가 있으면 V 버튼.
    setPrompt(text, actionable = true, extra = null) {
      const key = `${text ?? ''}|${actionable}|${extra?.label ?? ''}`;
      if (key === promptKey) return;
      promptKey = key;
      eLabel.textContent = text ?? '';
      eBtn.classList.toggle('visible', Boolean(text));
      eBtn.classList.toggle('hint', Boolean(text) && !actionable);
      eBtn.setAttribute('aria-label', text ? (actionable ? `E ${text}` : text) : 'E');
      vBtn.classList.toggle('visible', Boolean(extra));
      document.documentElement.classList.toggle('tc-v-on', Boolean(extra));
      vLabel.textContent = extra?.label ?? '';
    },
    // 지금 모드(main.js 의 mode). 모달 중에는 조이스틱을 숨기고, 굽는 중에는 취소 버튼을 보인다.
    setMode(next) {
      if (next === mode) return;
      mode = next;
      root.dataset.mode = next;
      cancelBtn.classList.toggle('visible', next === 'roasting');
      if (next !== 'free' && next !== 'seated') setMenu(false);
    },
    closeMenu: () => setMenu(false),
    release, // 화면이 돌아갈 때: 잡고 있던 조이스틱을 놓는다(조이스틱 위치가 바뀌므로)
  };
}

// 캔버스 위 손가락 입력. handlers: { onDrag(dx, dy), onClick(ndc), onPinch(prevGap, gap), onWheel(deltaY) }, opts: { tap(MOBILE.tap), dragScale }.
// main.js 의 controls 와 같은 모양({ isDown, setEnabled })을 돌려준다(마우스 포인터도 손가락 하나처럼 받는다: ?mobile=1 시험용).
export function createTouchCamera(el, { onDrag, onClick, onPinch, onWheel }, { tap, dragScale = 1 }) {
  const pts = new Map(); // pointerId -> { x, y, sx, sy, t }
  let enabled = true;
  let tapId = null; // 탭이 될 수 있는 첫 손가락(두 번째 손가락이 닿거나 많이 움직이면 취소)
  let dragging = false;
  let gap = 0;
  const firstTwo = () => { const it = pts.values(); return [it.next().value, it.next().value]; };
  const ndcOf = (x, y) => { const r = el.getBoundingClientRect(); return { x: ((x - r.left) / Math.max(1, r.width)) * 2 - 1, y: -((y - r.top) / Math.max(1, r.height)) * 2 + 1 }; };

  el.addEventListener('pointerdown', (e) => {
    if (!enabled || (e.pointerType === 'mouse' && e.button !== 0)) return;
    try { el.setPointerCapture(e.pointerId); } catch { /* 무시 */ }
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, t: performance.now() });
    if (pts.size === 1) { tapId = e.pointerId; dragging = false; } else {
      tapId = null; // 두 손가락: 탭·회전이 아니라 확대·축소
      const [a, b] = firstTwo();
      gap = gapOf(a, b);
    }
  });
  el.addEventListener('pointermove', (e) => {
    const p = pts.get(e.pointerId);
    if (!enabled || !p) return;
    const dx = e.clientX - p.x;
    const dy = e.clientY - p.y;
    p.x = e.clientX;
    p.y = e.clientY;
    if (pts.size >= 2) {
      const [a, b] = firstTwo();
      if (p !== a && p !== b) return;
      const next = gapOf(a, b);
      if (gap > 0 && next > 0) onPinch?.(gap, next);
      gap = next;
      return;
    }
    if (!dragging) {
      if (!passedDragSlop(e.clientX - p.sx, e.clientY - p.sy, tap.maxMovePx)) return; // 탭 도중의 떨림으로는 돌리지 않는다
      dragging = true;
      if (e.pointerId === tapId) tapId = null;
    }
    onDrag(dx * dragScale, dy * dragScale);
  });
  const end = (e, canceled) => {
    const p = pts.get(e.pointerId);
    if (!p) return;
    pts.delete(e.pointerId);
    try { el.releasePointerCapture?.(e.pointerId); } catch { /* 무시 */ }
    if (!canceled && enabled && e.pointerId === tapId && isTap({ dx: e.clientX - p.sx, dy: e.clientY - p.sy, dtMs: performance.now() - p.t }, tap)) onClick(ndcOf(e.clientX, e.clientY));
    if (e.pointerId === tapId) tapId = null;
    if (pts.size < 2) gap = 0;
    if (pts.size === 1) dragging = true; // 확대하다 한 손가락이 남으면 그 손가락은 회전(탭은 아니다)
    if (pts.size === 0) dragging = false;
  };
  el.addEventListener('pointerup', (e) => end(e, false));
  el.addEventListener('pointercancel', (e) => end(e, true));
  el.addEventListener('lostpointercapture', (e) => { if (pts.has(e.pointerId)) end(e, true); });
  el.addEventListener('wheel', (e) => { e.preventDefault(); if (enabled) onWheel?.(e.deltaY); }, { passive: false });
  el.addEventListener('contextmenu', (e) => e.preventDefault());

  const reset = () => {
    for (const id of pts.keys()) { try { el.releasePointerCapture?.(id); } catch { /* 무시 */ } }
    pts.clear(); tapId = null; gap = 0; dragging = false;
  };
  return {
    isDown: () => pts.size > 0,
    setEnabled(value) {
      enabled = value;
      if (!value) reset();
    },
    reset, // 화면이 돌아갈 때: 누르고 있던 손가락을 모두 잊는다(돌아간 뒤 첫 끌기가 튀거나 탭으로 잘못 읽히지 않게)
  };
}

// 포춘쿠키 모달을 터치용으로: 고르기·깨기 단계에도 닫기(✕) 버튼, 안내 글을 키보드 대신 손가락 기준으로.
export function patchFortuneForTouch(container, text = {}) {
  const root = container.querySelector('#fortune');
  if (!root) return;
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'tc-fclose';
  close.setAttribute('aria-label', '닫기');
  close.textContent = '✕';
  close.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); });
  close.addEventListener('click', () => pressKey('Escape'));
  root.append(close);
  const set = (sel, value) => { const n = root.querySelector(sel); if (n && value) n.textContent = value; };
  set('.fortune-pick .fortune-hint', text.fortunePick);
  set('.fortune-crack .crack-hint', text.fortuneCrack);
  set('.fortune-card > .fortune-hint', text.fortuneCard);
}
