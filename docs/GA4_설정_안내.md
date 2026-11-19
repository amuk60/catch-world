# GA4 설정 안내: 캐치 링크 클릭 통합 이벤트

Catch World 에서 캐치 사이트로 나가는 **모든 링크 클릭**(운세 버튼, 목표 달성/게임 종료/면접 준비 팝업, 우상단 칩 등)은 클릭 한 번에 `catch_link_click` 이벤트 **1개**를 보냅니다. UTM 이 CTA 마다 달라도 이 이벤트 하나만 보면 전체 클릭 수가 합산되어 있습니다.

## 이벤트 파라미터

| 파라미터 | 값 | 설명 |
|---|---|---|
| `link` | `home`, `jobs`, `company`, `ai_match`, `interview_review`, `ai_interview`, `cover_letter`, `cafe`, `tv` | 이동한 캐치 서비스(`config.js` 의 `CATCH_LINKS` id) |
| `source` | `fortune`, `popup_goal`, `popup_clear`, `popup_ready`, `chip`, `share` | 어느 CTA 에서 눌렀는지 (`popup_goal`: 스트레스 20 이하 측면 팝업, `popup_clear`: 게임 종료 가운데 팝업, `popup_ready`: 면접 갈 준비 완료 팝업) |
| `category` | 운세 분류(`interview`, `growth` 등) | 운세 버튼일 때만 |
| `medium`, `campaign` | UTM 의 `utm_medium`, `utm_campaign` 과 같은 값 | 참고용 |

기존 상세 이벤트(`cta_click`, `banner_click`, `fortune_cta_click`)는 그대로 함께 전송되므로 예전 보고서도 계속 쓸 수 있습니다. 새 보고서는 `catch_link_click` 만 쓰면 됩니다.

## 1. 핵심 이벤트(Key event)로 표시

1. GA4 → **관리(Admin)** → **데이터 표시(Data display)** → **이벤트(Events)**
2. 이벤트 목록에서 `catch_link_click` 을 찾습니다(처음 한 번 이벤트가 들어온 뒤 최대 24시간 후 표시).
3. 오른쪽 **핵심 이벤트로 표시(Mark as key event)** 를 켭니다.

## 2. 맞춤 측정기준(Custom definitions) 등록

`link`, `source`, `category` 를 등록해야 보고서/탐색에서 항목별로 나눠 볼 수 있습니다.

1. **관리** → **데이터 표시** → **맞춤 정의(Custom definitions)** → **맞춤 측정기준 만들기(Create custom dimension)**
2. 아래 세 개를 각각 만듭니다. **범위(Scope)는 모두 `이벤트(Event)`**.

| 측정기준 이름 | 범위 | 이벤트 매개변수 |
|---|---|---|
| 캐치 링크 | 이벤트 | `link` |
| 캐치 CTA 위치 | 이벤트 | `source` |
| 운세 분류 | 이벤트 | `category` |

등록 후 데이터가 쌓이기까지 보통 24~48시간이 걸리며, 등록 이전 데이터에는 소급 적용되지 않습니다.

## 3. 전체 클릭 수 보는 곳

- **보고서(Reports) → 참여도(Engagement) → 이벤트(Events)** 에서 `catch_link_click` 행의 **이벤트 수(Event count)** 가 캐치 링크 전체 클릭 수입니다.
- 핵심 이벤트로 표시했다면 **보고서 → 참여도 → 이벤트** 의 핵심 이벤트 열(또는 전환 보고서)에서도 확인할 수 있습니다.

## 4. 목적지/위치별로 나눠 보기 (탐색 보고서 레시피)

1. **탐색(Explore)** → **빈 탐색 / 자유 형식(Free form)**
2. **측정기준 가져오기**: `캐치 링크`, `캐치 CTA 위치`, (필요하면 `운세 분류`) **측정항목**: `이벤트 수(Event count)`
3. **행(Rows)** 에 `캐치 링크`(위치별로 보려면 `캐치 CTA 위치`), **값(Values)** 에 `이벤트 수`
4. **필터(Filters)**: `이벤트 이름(Event name)` **정확히 일치** `catch_link_click`
5. 총합은 표의 **합계** 행으로 확인합니다.

## 참고

- 측정 ID 가 비어 있거나 localhost 에서는 전송되지 않습니다(`config.js` 의 `GA_MEASUREMENT_ID`).
- 광고 차단 도구를 쓰는 사용자의 클릭은 일부 누락될 수 있습니다.
- 캐치 사이트 쪽 유입은 UTM(`utm_source=catchworld`, `utm_medium`, `utm_campaign`)으로 캐치 측 분석에서 확인합니다.
