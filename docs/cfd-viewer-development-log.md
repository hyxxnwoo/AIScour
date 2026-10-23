# 3D 세굴 가시화 — CFD 보기 모드 개발 기록

작성 시점 기준 브랜치: `develop_csv_test` (아래 변경은 모두 **미커밋** 상태)

---

## 1. 작업 범위

| 구분 | 내용 |
|---|---|
| A. CSV 업로드 개선 4건 | 수면 기본 체크, 수면 색 유지, 안내 문구 제거, "d50" 표기 교체 |
| B. CFD 보기 모드 | 3D 뷰어에 `[기본 \| CFD]` 토글을 추가하고, CFD 모드에서 FLOW-3D·ParaView 후처리 같은 표현 제공 |
| C. 보완 | 유선이 교각·하단부를 통과하는 문제 수정, 후류 와류 표현 |

기본 모드의 화면과 성능은 기존과 같고, CFD 전용 UI·계산은 CFD 모드에서만 동작한다.

---

## 2. A. CSV 업로드 개선 4건

| # | 요청 | 처리 |
|---|---|---|
| 1 | CSV 업로드 시 "지형 위 수면" 기본 체크 | 하상 변화만 있는 CSV에서도 수면을 켠 상태로 시작 (`src/main.ts`) |
| 2 | 시뮬레이션 중 수면 색이 변하지 않게 | 유속 데이터가 없는 CSV에서는 항목 전환·재생과 무관하게 기본 물 색(`#1d6fa8`) 유지. `TerrainWater.setBaseColorOnly()` 추가 |
| 3 | 결과 CSV 선택 창 안내 문구 제거 | "결과 CSV 를 고릅니다."만 남김 (`src/components/CsvSetupModal.ts`) |
| 4 | "d50" → "하상·퇴적물 입경" | 화면에 보이는 표기만 교체 (`scenarios.ts`, `CaseSwitcher.ts`, `fieldLabels.ts`). 코드 필드명(`d50Mm` 등)과 내보내기 CSV 헤더는 유지 |

미처리: 디자인 목업 HTML(`SCDT_파일럿DT_화면10종_v2.html`)과 문서(`docs/`, `교량세굴_구현지시서.md`)의 "d50" 표기.

---

## 3. B. CFD 보기 모드 — 0단계 분석 결과

### 3.1 현재 렌더링 구조
- Three.js 0.169, Vite, TypeScript. React 등 프레임워크 없이 순수 TS 클래스 + DOM.
- 단일 캔버스(`#scene-canvas`)를 화면 4~9번이 공유. `buildSimState()`가 모듈 묶음을 만들고 `swapSim()`이 통째로 교체.
- 하상 메시(`Terrain.ts`): 정점 단위 높이·색, 법선은 프레임 변경 시 재계산.
- 타임라인: `TimeControls` 시간 → `main.ts` 렌더 루프 한 곳에서 각 모듈 `updateAtTime(t)` 호출 (프레임 간 보간 없음).
- 상태: 전역 스토어 없이 `ScreenRouter`, `viewState` 싱글턴, `main.ts` 클로저 변수가 혼재.

### 3.2 데이터 필드 (가장 큰 제약)
현재 CSV는 `x_m, y_m, t0000s…`(시간별 scrdif) 한 종류뿐이다. **유속 u·v·w, 전단응력, 수면고는 데이터에 없다.** 그래서 유동 관련 레이어는 합성 유동장(목업)이 기본 동작이다.

### 3.3 항목별 가능 여부 (분석 시점)
| 항목 | 판정 |
|---|---|
| 토글 UI·전역 상태, 모드 저장 | 추가 개발 |
| 캡처 파일명에 모드 포함 | 기존 구조로 가능 |
| 연속 컨투어, 법선 음영 | 기존 구조로 가능 |
| 등심선, 와이어프레임 | 추가 개발 |
| pathline, 벡터 글리프 | 추가 개발 / 일부 기존 구조 |
| 말굽와류, 카르만 와류열 | 추가 개발 + **데이터 없음** |
| cut-plane | 추가 개발 + **데이터 없음** |
| 자유수면 | 기존 구조 + 추가 |
| 컬러바, 좌표축, 시각·프레임 오버레이 | 기존 구조 + 추가 |
| 클릭 프로브 | 추가 개발 (전단응력은 **데이터 없음**) |

---

## 4. B. 구현 단계별 산출물

### 1단계 — 보기 모드 토글
- `src/state/viewState.ts`: `ViewMode`('basic'|'cfd'), `viewState.viewMode`, localStorage(`aiscour.viewMode`) 저장·복원
- `src/components/ViewModeToggle.ts` (신규): 뷰어 우측 상단 `[기본 | CFD]` 세그먼트
- `src/utils/screenshot.ts`: CFD 모드일 때 파일명에 `_CFD` 추가
- 카메라·시점·재생·선택 교각은 모드와 무관한 기존 상태라 전환해도 유지됨. 5~9번 화면에서만 표시.

### 2단계 — 레이어 패널·오버레이
- `src/state/cfdLayers.ts` (신규): 레이어 8종 상태(하상 컨투어/등심선/메시/유선/벡터/단면/수면/교량)
- `src/components/CfdLayerPanel.ts`, `CfdFrameReadout.ts`(`t = 012.3 s / Frame 5 / 90`), `AxisTriad.ts`(X 흐름·Y 횡단·Z 연직)
- `Terrain.frameIndex` getter 추가

### 3단계 — 하상 CFD 표면
- `src/utils/cfdScourColor.ts`: 세굴 적색 / 0 흰색 / 퇴적 청색 발산형 컬러맵
- `src/utils/isolines.ts`: marching squares 등심선. 간격은 자동(absMax의 약 1/4, 상한 0.5 m)
- `src/modules/BedIsolines.ts`: 등심선 렌더(주요선 굵게 + 라벨), 프레임이 바뀔 때만 재계산
- `Terrain.ts`: `setColorMode('basic'|'cfd'|'plain')`, 와이어프레임, 등심선 연동. `ColorLegend.setStyle()`로 컬러바도 CFD 색 전환

### 4단계 — 합성 유동장과 '목업' 표시
- `src/data/cfdFlowField.ts` (신규): `CfdFlowSource` 인터페이스. `SyntheticCfdFlow`(합성)와 `SeriesCfdFlow`(해석 데이터), `createCfdFlowField()`가 **해석 유속이 있으면 자동으로 실데이터로 전환**
- 합성 모델: 1/7 멱법칙 접근류 + 교각 포텐셜류 + 후류 결손 + 카르만 와류열 + 말굽와류
- 레이어 패널에 '목업' 태그와 `유동장: 목업(합성 유동장)` 표시

### 5단계 — 유동장
- `src/modules/CfdPathlines.ts`: 유속으로 색을 칠한 입자 추적선(1200개, 꼬리 20점, RK2). 재생 중에만 이동, 스크럽 시 재투입
- `src/modules/CfdVectorGlyphs.ts`: 벡터 화살표, 밀도 1~5 슬라이더
- `src/utils/cfdVelocityColor.ts`: 세굴 컬러맵·등급 4색과 RGB 거리 35 이상 떨어진 viridis 계열 (테스트로 보장)
- `src/components/CfdVelocityColorbar.ts`: 유속(m/s) 컬러바. 세굴심 컬러바는 기존 범례를 CFD 색으로 전환
- `src/constants/cfdSettings.ts`: 입자 수·꼬리 길이·벡터 최대 개수 등 설정값 분리

### 6단계 — 자유수면
- `TerrainWater.ts` 셰이더에 교란 추가: 교각 전면 수면 상승·측면 하강(베르누이) + 후면 파형. 시각화용 6배 과장
- "수면"·"교량" 레이어 토글 연동, 수면 투명도 슬라이더. 수면 레이어는 해석 데이터가 있어도 항상 '목업'

### 7단계 — 클릭 프로브
- `src/utils/cfdProbe.ts`, `src/components/CfdProbePanel.ts`, `src/modules/CfdProbeMarker.ts`
- 하상 클릭 → 좌표·표고 변화·유속·전단응력 표시, 시각에 따라 값 갱신. 전단응력은 '잠정'

### 8단계 — 단면 (cut-plane)
- `src/modules/CfdCutPlane.ts`: 연직 단면에 유속 컨투어 + 면내 벡터. 종단(XZ, A–A′) / 횡단(YZ, B–B′)
- 위치 슬라이더, `연동` 버튼으로 평면·단면 화면의 단면선(선택 교각)에 맞춤

---

## 5. C. 보완 작업

### 5.1 유선이 교각 기둥·하단부를 통과하는 문제
- 원인: 합성 유동장이 교각을 반경 R의 원기둥으로만 취급 → 하단부(footing)를 고려하지 않았고, 사각 기둥은 원으로 근사했으며, 고체에 들어간 입자는 밀려나지 않고 소멸 후 재투입됨.
- 수정: `src/data/flowSolids.ts` (신규). `PierMarker`와 같은 치수의 고체 모델(원/사각 기둥 + 원/타원/정사각/직사각 하단부). 유동장은 고체 안을 비워 두고, 하단부 높이 이하에서는 하단부 크기 기준으로 흐름이 비켜 간다. 유선은 고체 안에 들어가면 표면 밖으로 밀려나 미끄러지고, 하단부 윗면에서는 올라탄다.
- 검증: 300프레임 동안 어떤 입자 정점도 고체 안에 들어가지 않음(원형/사각 두 경우). 밀어내기를 끄면 6개 정점이 침투해 테스트가 이를 검출함.

### 5.2 후류 와류 표현
- 이전: 후류를 횡방향 사인파로만 흉내 → 입자가 소용돌이를 돌지 않음.
- 변경: 교각 좌우에서 번갈아 떨어져 나오는 연직축 Lamb-Oseen 와류가 하류로 이동하며 퍼지고 약해짐. 좌우 와류는 서로 반대 방향으로 돌고 교각 바로 뒤에 재순환 영역이 생김. 입자의 25%를 교각 바로 뒤에 투입. 와류는 하단부 가장자리에서 떨어져 나옴.
- 성능: 와류 상태를 시각마다 한 번만 계산 + 코어 밖 지수함수 생략 + 먼 점 계산 생략 + 적분 걸음 수 축소. 중간에 74 ms까지 올랐다가 6.7 ms로 회복.

---

## 6. 성능 측정 (Node CPU 시간, GPU 제외)

| 항목 | 측정값 |
|---|---|
| 유선 갱신 (1200개, 교각 3개 + 하단부 + 와류) | 약 6.7 ms/프레임 |
| 벡터 갱신 (780개, 0.12초마다) | 약 4.3 ms |
| 최초 구현 시 유선 | 62 ms → 꼬리 색을 기록 시점에 한 번만 계산하도록 개선 |

실제 FPS는 GPU 렌더링이 포함되므로 브라우저에서 확인이 필요하다.

---

## 7. 테스트

- 전체: 53개 파일, 255개 테스트 통과, `tsc --noEmit` 오류 없음
- 이번 작업에서 추가한 테스트 파일
  - `tests/viewMode.test.ts`, `cfdOverlay.test.ts`, `cfdBed.test.ts`
  - `tests/cfdFlowField.test.ts`, `cfdVelocityColor.test.ts`, `cfdFlowViz.test.ts`
  - `tests/cfdSurface.test.ts`, `cfdProbe.test.ts`, `cfdCutPlane.test.ts`, `cfdSolids.test.ts`
- 기존 테스트 수정 2건: `CaseSwitcher.test.ts`(바뀐 라벨 문자열), `cfdOverlay.test.ts`(레이어가 활성화됨에 따라 기대값 변경). `cfdFlowField.test.ts`의 후류 임계값은 0.6배 → 0.8배로 완화(후류 평균 결손을 의도적으로 줄이고 와류가 재순환을 만들게 했기 때문).

---

## 8. 지시서와 다르게 처리한 점 / 결정 사항

| 항목 | 지시서 | 구현 |
|---|---|---|
| 하상 컬러맵 | "기존 발산형 유지(세굴 적색 / 퇴적 청색)" | 기존 기본 모드는 세굴 청색·퇴적 갈색이라 일치하지 않음. CFD 모드만 적-백-청으로 구현, 기본 모드는 그대로 |
| 등심선 간격 | 0.5 m | 수 cm 규모의 세굴에서는 선이 나오지 않아 자동 간격(상한 0.5 m) + 설정값으로 고정 가능 |
| 사용자별 모드 저장 | 사용자별 | 로그인 식별자가 없어 브라우저 단위 localStorage |
| 말굽와류·카르만 와류열 | 2번 필수 항목 | 합성 유동장 모델로 구현(4단계). 별도 8단계가 아님 |

합성 유동장의 계수(Strouhal 0.2, 마찰계수 0.0035, 와류 강도·간격·감쇠 등)는 모두 **잠정값**이다.

---

## 9. 알려진 한계 / 남은 확인 사항

1. **브라우저 실확인 전**: 모든 검증은 jsdom·Node 기반이다. 특히 수면 GLSL 셰이더는 컴파일 여부를 테스트로 검증할 수 없어, CFD 모드에서 콘솔 셰이더 에러를 확인해야 한다.
2. **실제 FPS 미측정**: GPU 비용이 빠진 CPU 시간만 측정했다.
3. 수면 높이 슬라이더를 바꿔도 합성 유동장의 수위는 처음 값 기준이다.
4. 기본 모드의 추적 입자(`FluidTracers`)는 하단부를 고려하지 않는 기존 동작 그대로다.
5. 후류 와류는 연직축 회전(수평 방향)만 표현한다. 하상에서 올라오는 3차원 와류는 없다.
6. 자유수면 투명도 슬라이더(CFD 패널)와 기존 도크의 투명도 슬라이더는 서로 반영되지 않는다.
7. 와이어프레임은 1 cm 격자에서 멀리서 보면 어두운 면처럼 보일 수 있어 투명도(0.3) 조정이 필요할 수 있다.

---

## 10. 조정 위치 (화면을 보고 튜닝할 때)

| 조정하고 싶은 것 | 위치 |
|---|---|
| 유선 입자 수·꼬리·속도 배율, 후류/말굽 입자 비율, 벡터 개수·밀도 | `src/constants/cfdSettings.ts` |
| 자유수면 교란 과장 배율, 수면 기본 불투명도 | `src/constants/cfdSettings.ts` |
| 와류 강도·간격·감쇠, 접근류·후류 결손 | `src/data/cfdFlowField.ts` |
| 등심선 간격 | `Terrain.setIsolineStep()` (null = 자동), 상한 `ISOLINE_MAX_STEP_M` in `src/utils/isolines.ts` |
| 와이어프레임 투명도 | `Terrain.setWireframeVisible()` 내부 |

---

## 11. 현재 변경 파일 목록 (git 기준, 미커밋)

신규
- `src/state/cfdLayers.ts`
- `src/constants/cfdSettings.ts`
- `src/data/cfdFlowField.ts`, `src/data/flowSolids.ts`
- `src/modules/BedIsolines.ts`, `CfdPathlines.ts`, `CfdVectorGlyphs.ts`, `CfdCutPlane.ts`, `CfdProbeMarker.ts`
- `src/components/ViewModeToggle.ts`, `CfdLayerPanel.ts`, `CfdFrameReadout.ts`, `AxisTriad.ts`, `CfdVelocityColorbar.ts`, `CfdProbePanel.ts`
- `src/utils/cfdScourColor.ts`, `isolines.ts`, `cfdVelocityColor.ts`, `cfdProbe.ts`
- `tests/` 신규 10개 (위 7장 참고)

수정
- `src/main.ts`, `src/state/viewState.ts`, `src/modules/Terrain.ts`, `src/modules/TerrainWater.ts`
- `src/components/ColorLegend.ts`, `CaseSwitcher.ts`, `CsvSetupModal.ts`
- `src/constants/fieldLabels.ts`, `scenarios.ts`
- `src/utils/screenshot.ts`, `src/styles/viz.css`
- `tests/CaseSwitcher.test.ts`

---

## 12. 확인 방법

```bash
npm run dev          # 5번 화면에서 우측 상단 [기본 | CFD] 토글
npx tsc --noEmit     # 타입 검사
npx vitest run       # 전체 테스트
```

CFD 모드에서 확인할 것:
1. 레이어 패널(우측): 하상 컨투어·등심선·메시·유선·벡터·단면·수면·교량 토글, 벡터 밀도·수면 투명도·단면 위치 슬라이더
2. 좌하단: 좌표축 트라이어드, `t / Frame` 오버레이 / 우하단: 유속 컬러바
3. 하상 클릭: 프로브 카드(좌상단)
4. 유선: 교각 뒤 와류, 기둥·하단부 표면을 따라 도는지
5. 콘솔: 수면 셰이더 에러 없음
