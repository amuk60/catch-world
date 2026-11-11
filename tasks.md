# 캐치 월드 작업 체크리스트 (tasks.md)

기준: [plan.md](plan.md) · 코드 상세: [docs/superpowers/plans/2026-11-11-catch-world.md](docs/superpowers/plans/2026-11-11-catch-world.md)
표기: `[ ]` 할 일 · `[x]` 완료 · 👀 = 눈으로 확인 · 🧪 = 자동 테스트 · 🙋 = 사람(팀원)이 직접 할 일

---

## 단계 0. 작업 환경 준비
- [ ] 🙋 터미널에서 `node --version` 실행해 v20 이상인지 확인
- [ ] 🙋 v20 미만이거나 없으면 nodejs.org에서 LTS 설치 후 다시 확인
- [ ] 🙋 터미널에서 `git --version` 확인 (없으면 git-scm.com에서 설치)
- [ ] 작업 폴더(`catch world`)에서 `git init` 실행

## 단계 1. 화면 띄우기
- [ ] `package.json` 만들기 (test, start 스크립트)
- [ ] `.gitignore` 만들기
- [ ] `src/config.js` 만들기 (크기, 상수, 문구, `CATCH_URL`, `GA_MEASUREMENT_ID`, `ASSET_MANIFEST`)
- [ ] 🧪 `test/env.test.js` 작성 후 실패 확인
- [ ] `src/env.js`(모바일 판별) 구현
- [ ] 🧪 `node --test` 통과 확인
- [ ] `src/textures.js` 만들기 (임시 도형 텍스처 9종)
- [ ] `src/scenes/BootScene.js` 만들기
- [ ] `src/scenes/WorldScene.js` 임시 버전 만들기
- [ ] `src/main.js` 만들기 (PC면 게임 시작, 모바일이면 안내)
- [ ] `index.html` 만들기 (Phaser 3.80.1 CDN, 하단 비공식 표기, 모바일 안내)
- [ ] 👀 `npm start` → 어두운 배경과 파란 캐릭터가 보인다
- [ ] 👀 화면 아래 비공식 표기가 보인다
- [ ] 👀 스마트폰에서 열면 PC 이용 안내만 보인다
- [ ] 👀 콘솔(F12)에 빨간 오류가 없다
- [ ] 커밋: "프로젝트 뼈대와 Phaser 부팅"

## 단계 2. 월드 걸어다니기
- [ ] `WorldScene`에 바닥 타일, 위쪽 간판 그리기
- [ ] 소각로(정적 오브젝트) 추가
- [ ] 캐릭터 생성, 월드 경계 안에 가두기
- [ ] 방향키/WASD 이동 구현
- [ ] 대각선 이동 속도 보정
- [ ] 캐릭터와 소각로 충돌 처리
- [ ] 👀 방향키와 WASD로 움직인다
- [ ] 👀 대각선이 더 빠르지 않다
- [ ] 👀 화면 밖·간판 영역으로 못 나간다
- [ ] 👀 소각로를 뚫고 지나가지 못한다
- [ ] 커밋: "월드 이동"

## 단계 3. 오브젝트와 위로 문구
- [ ] 🧪 `test/interact.test.js` 작성 후 실패 확인
- [ ] `src/logic/interact.js`(`findInteractable`) 구현
- [ ] 🧪 `node --test` 통과 확인
- [ ] 위로 문구 오브젝트 3개 배치 (좌상, 우, 좌하)
- [ ] 가까이 가면 뜨는 안내 텍스트 구현 ("E: 살펴보기" / "E: 소각 시작")
- [ ] E·스페이스로 상호작용하면 하단에 문구 3초 표시
- [ ] 🙋 위로 문구 3개를 팀이 원하는 문장으로 수정 (`config.js`의 `COMFORT_MESSAGES`)
- [ ] 👀 오브젝트 근처에서 안내가 뜨고 멀어지면 사라진다
- [ ] 👀 E/스페이스로 3개 오브젝트가 각각 다른 문구를 보여 준다
- [ ] 👀 소각로 근처에서 "E: 소각 시작"이 뜬다
- [ ] 커밋: "상호작용과 위로 문구"

## 단계 4. 미니게임 화면과 종이 1장 소각
- [ ] 🧪 `test/stress.test.js` 작성 후 실패 확인
- [ ] `src/logic/stress.js`(`StressMeter`) 구현
- [ ] 🧪 `node --test` 통과 확인
- [ ] `src/scenes/BurnGameScene.js` 뼈대 만들기 (배경, 불, 파쇄기, 라벨)
- [ ] 스트레스 바와 20% 지점 표시, "스트레스 지수 N" 텍스트
- [ ] 종이 하나를 만들어 드래그 가능하게 하기 (이미지+글자 컨테이너)
- [ ] 불 근처에 놓으면 소각(작아지며 사라짐 + 화면 흔들림) 처리
- [ ] 소각 시 지수 감소와 바 갱신
- [ ] `main.js`에 `BurnGameScene` 등록
- [ ] `WorldScene`의 소각로 E 입력 → `BurnGame` 씬 전환 연결
- [ ] 👀 소각로에서 E → 미니게임 화면으로 바뀐다
- [ ] 👀 빨간 바와 "스트레스 지수 100"이 보인다
- [ ] 👀 흰 종이를 불에 놓으면 사라지고 화면이 흔들리며 95가 된다
- [ ] 👀 불 밖에 놓으면 그 자리에 남는다
- [ ] 커밋: "미니게임 화면과 종이 소각"

## 단계 5. 종이 3종 전체와 클리어
- [ ] 🧪 `test/paperQueue.test.js` 작성 후 실패 확인 (15장, 순서, 합계 81, 끝까지 하면 클리어)
- [ ] `src/logic/paperQueue.js`(`buildQueue`, `totalReduction`) 구현
- [ ] 🧪 통과 확인
- [ ] 🧪 `test/shredder.test.js` 작성 후 실패 확인 (장전, 연타 8회, 중복 장전 금지)
- [ ] `src/logic/shredder.js`(`ShredderState`) 구현
- [ ] 🧪 `node --test` 전체 통과 확인
- [ ] 종이를 큐 순서대로 3.5초 간격 생성
- [ ] 통지서 소각(장당 4) 연결
- [ ] 자소서를 파쇄기에 놓으면 장전, "파쇄 중! 연타!" 힌트 표시
- [ ] 파쇄기 클릭마다 지수 1 감소, 8번 후 완료
- [ ] 지수 20 이하 시 종료 처리 (0.7초 지연)
- [ ] 👀 흰 → 붉은 → 푸른 종이 순서로 나온다
- [ ] 👀 파쇄기 연타 때마다 남은 횟수가 줄어든다
- [ ] 👀 파쇄기 사용 중 두 번째 자소서는 들어가지 않는다
- [ ] 👀 지수 20 이하가 되면 게임이 끝나고, 끝까지 하면 반드시 클리어된다
- [ ] 👀 한 판이 60~90초 안에 끝난다 (초시계로 측정)
- [ ] 🙋 너무 길거나 지루하면 `SPAWN_INTERVAL_MS`·장수·감소량 조정 후 합계 테스트 값 갱신
- [ ] 커밋: "종이 3종과 클리어 조건"

## 단계 6. 종료 화면과 캐치 링크
- [ ] `src/analytics.js` 먼저 만들기 (`track`, `initAnalytics`) — 다음 단계 이벤트에 필요
- [ ] 🧪 `test/analytics.test.js` 작성 → 구현 → 통과 확인
- [ ] `main.js`에서 `initAnalytics(GA_MEASUREMENT_ID)` 호출
- [ ] `BurnGameScene`에 `track('game_clear')`, `WorldScene`에 `track('game_start')` 연결
- [ ] `src/scenes/ResultScene.js` 만들기 ("소각 완료!" + 최종 지수 메시지)
- [ ] "캐치 구경하기" 버튼 (새 탭으로 `CATCH_URL`, `track('banner_click')`)
- [ ] `main.js`에 `ResultScene` 등록
- [ ] 🙋 `CATCH_URL`을 브라우저에서 열어 캐치 사이트가 맞는지 확인, 틀리면 수정
- [ ] 👀 클리어하면 "스트레스 지수 N! ..." 메시지가 보인다
- [ ] 👀 "캐치 구경하기"를 누르면 새 탭에 캐치 사이트가 열린다
- [ ] 커밋: "종료 화면과 캐치 배너"

## 단계 7. 결과 공유와 다시 하기
- [ ] 🧪 `test/share.test.js` 작성 후 실패 확인 (파일명, 공유 문구)
- [ ] `src/share.js` 구현 (`buildShareFilename`, `buildShareLines`, `renderShareCard`, `saveShareCard`, `copyText`)
- [ ] 🧪 `node --test` 전체 통과 확인
- [ ] 종료 화면에 "결과 이미지 저장" 버튼 연결
- [ ] 종료 화면에 "사이트 주소 복사" 버튼과 안내 문구 연결
- [ ] 종료 화면에 "다시 하기" 버튼 연결 (월드로 복귀)
- [ ] 👀 PNG가 내려받아지고 지수 변화와 비공식 표기가 이미지에 보인다
- [ ] 👀 주소 복사 후 메모장에 붙여넣으면 주소가 나온다
- [ ] 👀 다시 하기 → 월드 → 두 번째 소각도 정상 동작한다
- [ ] 커밋: "결과 공유와 다시 하기"

## 단계 8. 에셋 교체 (단계 2~7과 병행, 11/13 선정)
- [ ] 🙋 kenney.nl에서 탑다운 RPG·실내 소품 팩 1~2개 선정
- [ ] 🙋 각 팩 라이선스 페이지에서 CC0인지 확인 (아니면 출처 표기 준비)
- [ ] 🙋 PNG를 `assets/`에 배치 (키 이름과 맞추기: floor, player, furnace, comfort, resume, notice, coverLetter, fire, shredder)
- [ ] 🙋 캐치 브랜드 요소(로고 등)를 직접 제작해 월드 배경에 배치할 이미지 준비
- [ ] `config.js`의 `ASSET_MANIFEST`에 있는 파일만 등록
- [ ] 크기가 어색한 이미지는 `setScale`로 맞추기, `floor`는 32×32로 맞추기
- [ ] `assets/CREDITS.md` 작성 (파일별 출처·라이선스)
- [ ] 👀 바꾼 키는 실제 이미지로, 나머지는 임시 도형으로 보인다
- [ ] 👀 콘솔에 404 오류가 없다
- [ ] 👀 캐치 브랜드 요소가 배경에 자연스럽게 보인다
- [ ] 커밋: "에셋 교체와 출처 기록"

## 단계 9. 첫 배포와 GA4 연결 → MVP (11/16)
- [ ] `node --test` 전체 통과 최종 확인
- [ ] 월드 → 소각 → 종료 → 다시 하기를 2번 연속 플레이해 오류 확인
- [ ] 🙋 analytics.google.com에서 GA4 속성·웹 데이터 스트림 생성, 측정 ID(`G-...`) 복사
- [ ] `config.js`의 `GA_MEASUREMENT_ID`에 입력
- [ ] 🙋 GitHub에 새 저장소 생성
- [ ] 커밋 후 저장소에 푸시 (`git remote add origin ...` → `git push -u origin main`)
- [ ] 🙋 vercel.com에서 GitHub로 로그인 → 저장소 가져오기 (Framework: Other, 빌드 명령·출력 폴더는 비움) → 배포
- [ ] 👀 `*.vercel.app` 주소에서 끝까지 플레이된다
- [ ] 👀 GA4 실시간에 방문과 `game_start`, `game_clear`가 나타난다 (광고 차단 끈 브라우저)
- [ ] 👀 스마트폰에서 열면 PC 이용 안내가 나온다
- [ ] 🙋 팀 밖 1~2명에게 주소를 주고 플레이시키기
- [ ] 🙋 막힌 곳·오류를 기록해 버그 목록 만들기

## 단계 10. 연출 강화 (11/17~20)
- [ ] `textures.js`에 `spark` 텍스처 추가
- [ ] `BurnGameScene`에 소각 파티클(불꽃) 추가
- [ ] `BurnGameScene`에 파쇄 파티클 추가
- [ ] `playSfx` 메서드 추가 (오디오가 없으면 아무 일도 하지 않게)
- [ ] 🙋 (선택) CC0 효과음을 `assets/audio/`에 넣고 `AUDIO_MANIFEST`, `BootScene` 로드 추가, 출처를 `CREDITS.md`에 기록
- [ ] 👀 소각 때 불꽃 입자가 튄다
- [ ] 👀 파쇄기를 칠 때 작은 입자가 튄다
- [ ] 👀 효과음 파일이 없어도 오류가 없다
- [ ] 🧪 `node --test` 통과 확인
- [ ] 커밋: "소각·파쇄 연출 강화"

## 단계 11. 버그 수정과 추가 미니게임 결정 (~11/20)
- [ ] 단계 9의 버그 목록을 하나씩 수정하고 재배포
- [ ] 🙋 추가 미니게임을 할지, 한다면 어떤 종류인지 결정 (소각장과 같은 조작 재활용)
- [ ] (하기로 했다면) 별도 계획으로 분리해 작성 후 구현
- [ ] 👀 버그 목록의 항목이 모두 해결됐다
- [ ] 👀 (추가했다면) 월드에서 새 미니게임으로 들어가 끝까지 플레이된다

## 단계 12. 최종 점검과 배포 확정 (11/21~27)
- [ ] `node --test` 전체 통과
- [ ] 👀 크롬에서 전체 흐름 확인
- [ ] 👀 엣지에서 전체 흐름 확인
- [ ] 👀 (가능하면) 사파리에서 전체 흐름 확인
- [ ] 👀 하단 비공식 표기, 결과 이미지 표기, 모바일 안내가 모두 있다
- [ ] 👀 GA4에 `game_start`, `game_clear`, `banner_click`, `share_image`, `share_link`가 모두 들어온다
- [ ] 🙋 `assets/CREDITS.md`에 사용한 모든 에셋이 있고 라이선스를 확인했다
- [ ] 🙋 최종 배포 주소와 화면 캡처를 팀에 공유 (PPT 전략 페이지용)
- [ ] 🙋 **11/27 23:59 전에 최종 주소를 한 번 더 열어 정상 동작 확인**
