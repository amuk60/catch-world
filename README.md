# 캐치 월드 (번아웃 소각장)

취업 준비생을 위한 3D 힐링 마당입니다. 서류를 태우고, 빨고, 면접을 받아치며 스트레스 지수를 줄입니다.
**학사 과제용 비공식 프로젝트**이며 캐치(Catch)와 무관하고 비상업적 목적으로 제작했습니다.

## 실행

```
npm start        # http://localhost:5173
npm test         # 순수 로직 테스트(node:test)
```

빌드 도구 없이 정적 파일로 동작합니다(Three.js 는 CDN importmap). 배포는 Vercel 에서 Framework 를 **Other**, 빌드 명령 없이 저장소 루트를 그대로 올립니다.

## 구성

- `src/logic/` 화면과 무관한 순수 로직(테스트 포함), `src/` 브라우저 모듈, `assets/` 3D 모델(CC0)과 출처(`assets/CREDITS.md`).
- 설정과 문구(스트레스 지수, 면접 질문 등)는 `src/config.js`에서 고칩니다.
- 방문 통계(Google Analytics 4)는 `GA_MEASUREMENT_ID` 를 넣으면 켜집니다.
