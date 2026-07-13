# 시뮬레이션 기술 스택 & 흐름 정리

본 문서는 **Bridge Scour 3D Dashboard** 한 사이클이 어떤 기술 위에서 어떻게 동작하는지 정리한 기술 개요입니다. 코드 진입점은 `src/main.ts` 의 `bootstrap()` 이며, 모든 시각화 모듈은 단일 시간축(`updateAtTime(t)`) 규약을 공유합니다.

---

## 1. 기술 스택 개요

| 영역 | 사용 기술 | 코드 위치 |
| --- | --- | --- |
| 빌드/런타임 | **Vite 5**, **TypeScript 5 (strict)**, ESM, `tsconfig` path alias (`@/...`) | `package.json`, `vite.config.ts` |
| 3D 렌더링 | **Three.js 0.169**, `WebGLRenderer`, `PerspectiveCamera`, `OrbitControls`, `InstancedMesh`, `DataTexture`, `Raycaster` | `src/core/`, `src/modules/` |
| UI | **순수 DOM API + CSS** (프레임워크 없음). 모든 패널은 클래스 + `element: HTMLElement` 패턴 | `src/components/`, `src/styles/main.css` |
| 성능 측정 | **stats.js** | `src/utils/fpsMeter.ts` |
| 품질 | ESLint, Prettier, Husky + lint-staged, **Vitest** + jsdom | `package.json`, `tests/` |
| 데이터 변환 | `tsx` 기반 Node 스크립트 → manifest.json + Float32 바이너리 | `scripts/build-manifest.ts` |
| 인프라 | **Docker 멀티스테이지**, **Nginx alpine**, **Docker Compose**(dev/prod 오버라이드), GitHub Actions | `docker/`, `docker-compose*.yml`, `.github/workflows/` |

---

## 2. 부트스트랩 흐름 (전체 파이프라인)

`src/main.ts` 의 `bootstrap()` 이 모든 것을 조립합니다. 한 번의 사이클은 다음 순서대로 구성됩니다.

```text
HTML(canvas, dock-left, dock-right)
  ↓
SceneManager / RendererManager / CameraManager / LightManager / AnimationLoop  (Three.js 코어)
  ↓
createDataSource → manifest.json HEAD 검사 → ManifestSource(있으면) | SyntheticScourSource(폴백)
  ↓
buildSimState(params)  ⟵ 파라미터(SimParams) 적용해 모듈 묶음 생성
  ├─ Terrain                ← ScourSeries (delta elevations 시계열)
  ├─ PierMarker
  ├─ BridgeCollapse
  ├─ SyntheticFluidSource → FluidSeries
  ├─ FluidSlicePlane        ← DataTexture 수평 단면
  └─ VelocityArrows         ← InstancedMesh 화살표
  ↓
UI 패널 마운트(TimeControls, FluidControls, SimParamPanel, DashboardCustomizePanel, …)
  ↓
AnimationLoop.add(delta ⇒ {
    timeControls.tick → 현재 t
    terrain/bridgeCollapse/slicePlane/arrows.updateAtTime(t)
    cellSeries.setTime(t), warning.update(...)
    camera.update(), renderer.render(scene, camera)
})
  ↓
loop.start()
```

핵심은 **“모든 시각 모듈이 `updateAtTime(t)` 한 메서드로 동기화”** 된다는 점입니다. 시간축이 곧 데이터를 슬라이싱하는 인덱스가 됩니다.

---

## 3. Three.js 코어 — `src/core/`

각 클래스는 단일 책임 + `Disposable` 패턴(`dispose()`)을 갖고, HMR/언로드 시 정상 해제됩니다.

- **`SceneManager`** : `Scene` 생성, 배경색 변경, 그리고 `dispose()` 시 `scene.traverse` 로 모든 자식의 `geometry/material` 까지 재귀 정리 — Three.js 의 가장 큰 메모리 누수 원인을 차단.
- **`RendererManager`** : `WebGLRenderer({ antialias, powerPreference: 'high-performance' })`. `setPixelRatio(min(devicePixelRatio, 2))` 로 GPU 부담 제어. `webglcontextlost/restored` 이벤트를 받아 외부에 콜백 발행 → 컨텍스트 손실 배너 + 루프 일시정지(`main.ts`).
- **`CameraManager`** : `PerspectiveCamera` + `OrbitControls`(damping=0.08). `applyPreset('reset'|'top'|'side'|'front')` 가 씬 반경 `sceneRadius` 에 비례해 위치를 계산 → 데이터 크기에 자동 맞춰지는 카메라.
- **`LightManager`** : `AmbientLight` + `DirectionalLight`. 강도는 런타임에서 슬라이더로 즉시 조절.
- **`AnimationLoop`** : `requestAnimationFrame` 래퍼. 다중 콜백 등록(Set), 등록 해제 함수 반환 → 모듈별 lifecycle 분리.

---

## 4. 데이터 레이어 — `src/data/`, `src/types/`

“실제 FLOW-3D 결과” 와 “데모용 합성 데이터” 를 같은 인터페이스로 추상화한 것이 시뮬레이션의 핵심 설계입니다.

- **타입(`types/terrain.ts`, `types/fluid.ts`)** : 모든 격자 데이터를 `Float32Array` 1차원으로 저장. 인덱스 규약 `i = y*W + x` / `i = x + y*W + z*W*H` 를 고정 → CPU↔GPU 전송과 캐시 친화성 확보.
- **`ScourDataSource` 인터페이스** : `load(): Promise<ScourSeries>` 단 하나. 구현체가 세 종류 있습니다.
  - **`SyntheticScourSource`** : 가우시안 + 로그 곡선으로 교각 주변 세굴공 시계열을 즉석 생성(`maxDepth = -1.2 * scourRate * log1p(3t)`, 반경은 시간에 따라 확장).
  - **`SyntheticFluidSource`** : 2D **potential flow 근사**로 교각 주변 유동을 계산하고, 후류는 **Strouhal 수 ≈ 0.2** 기반 사인파 진동(와류 흘림 모사), 압력은 **Bernoulli 근사** + 정체점 보정, 바닥 경계는 로그 분포 — 즉 “물리 기반 그럴듯한” 데모 데이터.
  - **`ManifestSource`** : 외부 `manifest.json` + 프레임별 `.bin`(Float32) 을 동시 fetch(워커 풀, `concurrency=6`)로 받아 같은 `ScourSeries` 로 조립.
  - **`Flow3dCsvSource`** : FLOW-3D CSV 어댑터 스텁. `parseGridCsv` 가 행/열 구분자(쉼표/탭/공백/세미콜론), 주석(`#`), 빈 줄을 모두 허용.
- **`createDataSource`** : 운영 환경에서 manifest URL 에 HEAD 요청 → 200 이면 `ManifestSource`, 아니면 합성으로 폴백. 실패 시에도 화면이 항상 뜨도록 설계.
- **변환 스크립트(`scripts/build-manifest.ts`)** : FLOW-3D 결과를 사전 처리하여 Float32 바이너리 + manifest 로 변환 → 브라우저는 JSON 파싱 비용 없이 `ArrayBuffer` 그대로 GPU 로 흘려보냄.

---

## 5. 시각화 모듈 — `src/modules/`

### 5-1. `Terrain.ts` — 하상 지형 + 세굴 변화

- 단일 `Mesh(PlaneGeometry, MeshStandardMaterial{ vertexColors:true, side:DoubleSide })`.
- 베이스 표고를 정점 Y 에, 매 프레임 `deltaElevations` 를 더해 정점을 **in-place 갱신**(`positions.setY`, `needsUpdate=true`).
- 정점 색은 **diverging color ramp** (`utils/colorRamp.ts`, 청색↔베이지↔황토)로 프레임별 `±absMax` 정규화 — 매 프레임 가시성이 살아남.
- `computeVertexNormals()` 으로 라이팅 자동 갱신.
- `queryAtWorld(worldX, worldZ)` 가 클릭 좌표를 격자 인덱스로 환산 → `CellTimeSeries` 가 셀 시계열을 그릴 수 있게 한다.
- `setVerticalExaggeration(f)` 는 **Δ만** 스케일(베이스는 그대로) → 세굴 변화를 강조하면서 지형 비율은 유지.

### 5-2. `FluidSlicePlane.ts` — 수평 단면 색칠

- `Y = const` 평면을 잘라낸 **W×D `DataTexture` (RGBA8)** 를 `MeshBasicMaterial.map` 으로 입혀 표시.
- `setQuantity('speed'|'pressure'|'density'|U_x/y/z)` 변경 시 텍셀을 새로 채움. **viridis** 컬러맵(`fluidColorRamp.ts`)으로 정규화.
- 슬라이스 높이 변경(`setHeight`)은 격자 인덱스 단위로 스냅 + `mesh.position.y` 이동.

### 5-3. `VelocityArrows.ts` — 속도 벡터 화살표

- **`InstancedMesh`** 두 개(샤프트 = `CylinderGeometry`, 헤드 = `ConeGeometry`)로 다운샘플 격자(stride=4)마다 한 화살표.
- 각 인스턴스에 `compose(position, quaternion, scale)` 로 회전·길이·위치를 매트릭스로 직접 쓰고, `setColorAt` 로 색까지 instanced — 수천 개 화살표도 1드로우콜.
- 길이는 magnitude 비율, 색은 viridis, 거의 정지 셀은 scale 0 으로 숨김.

### 5-4. `PierMarker.ts` / `BridgeCollapse.ts` — 교각과 붕괴 시뮬레이션

- 교각은 `CylinderGeometry` 샤프트 + 캡 메쉬.
- `BridgeCollapse` 가 매 프레임 **교각 반경+1셀 범위의 max erosion** 을 샘플링 → `scour/criticalScourDepth = ratio`.
  - ratio > 0.45 / 0.75 / ≥1.0 단계별로 색을 베이지→주황→빨강으로 변경.
  - 임계 초과 시 `SHAKE_DURATION=1.5s` 진동(sin) → `TILT_DURATION=5s` 동안 smoothstep 으로 회전 + 침강 → 데크 낙하(quadratic ease-in 중력) 애니메이션.
  - `onCollapse(evt)` 이벤트 → `ScourWarning` 배너 노출.

### 5-5. `Picking.ts` — 마우스 인터랙션

- `Raycaster` + 화면 NDC 변환. 호버는 **`hoverThrottleMs=60` 스로틀**, 클릭은 즉시 발행.
- 결과 `worldX/Y/Z` 를 `Terrain.queryAtWorld` 에 넘겨 셀 시계열을 띄움.

---

## 6. 시간/상호작용 컨트롤 — `src/components/`

- **`TimeControls`** : 단일 시간축의 진실 공급원. `tick(delta)` 에서 재생 중일 때만 `currentTime += delta * speed` 진행(루프 시 modulo), 사용자가 슬라이더를 잡고 있으면(`isUserScrubbing=true`) 자동 진행을 정지. 슬라이더 단위는 ms 정수 → 매끄러운 스크럽.
- **`SimParamPanel`** : `SIM_PARAM_META` 기반으로 슬라이더+숫자입력 자동 생성. **380ms 디바운스 라이브 모드** 또는 “적용” 버튼. 적용 시 `buildSimState` 가 새 모듈을 만들고 **이전 sim 의 `dispose()` 호출** → 메모리 누수 없이 핫스왑.
- **`DashboardCustomizePanel`** : 즉시 반영형 슬라이더(세굴 수직 과장, 배경색 picker, FOV, 주변광/방향광, 유체 단면 불투명도) — 재시뮬 후에도 값이 유지되도록 `main.ts` 가 `terrainExaggeration`, `fluidSliceOpacity` 를 외부에 보관.
- **`FluidControls`** : 양 선택 라디오, 슬라이스 가시성/높이, 화살표 토글, 현재 데이터 범위 라벨.
- **`CameraPresets`** : Reset / Top / Side / Front 버튼.
- **`KeyboardShortcuts`** : `Space` 재생, `←/→`(+Shift 5초), `Home/End`, `R/T/F/X` 프리셋, `P` 스크린샷. 입력 필드 포커스/모디파이어는 무시.

---

## 7. 분석/HUD/오버레이

- **`CellTimeSeries`** : 클릭한 셀의 Δelevation 을 **순수 SVG `<path>` sparkline** 으로 그리고, 현재 시간 위치에 노란 마커가 따라 이동(`setTime`). DOM 만으로 처리(Three 텍스처 X) → 가벼움.
- **`ColorLegend`** : `colorRampToCssGradient()` 가 만든 CSS `linear-gradient` 와 동일한 컬러맵을 표시, 라벨은 `±absMax` 동적 갱신.
- **`ScourWarning`** : 교각별 게이지(0~100%), 단계별 클래스(`is-warning/is-danger/is-collapsed`), 붕괴 이벤트 시 배너+이력.
- **`FpsMeter`** : `stats.js` 래퍼. `loop` 콜백에서 `begin/end` 사이의 작업 시간을 측정.
- **`captureSceneScreenshot`** : `renderer.render` 직후 `canvas.toBlob` 으로 PNG 다운로드 — `preserveDrawingBuffer` 없이도 안전 캡처.

---

## 8. 유틸 / 컬러맵

- **`utils/colorRamp.ts`** : 6 stop diverging ramp (세굴-퇴적). `sampleColorRamp(value, min, max, out)` 가 0~1 RGB 를 채우고, 같은 정의를 `colorRampToCssGradient()` 로 CSS 에 재사용 → **3D 정점 색과 HTML 범례가 한 소스에서 생성**.
- **`utils/fluidColorRamp.ts`** : viridis 8 stop, 동일한 패턴.

---

## 9. 인프라/품질

- **Dockerfile (frontend)** : multi-stage — Node 빌더에서 `vite build` → `nginx:alpine` 에 `dist/` 만 복사, non-root 사용자.
- **Nginx** : `try_files $uri /index.html`(SPA), gzip, 정적 캐시, `/api/*` 프록시, 보안 헤더(X-Frame-Options, X-Content-Type-Options 등).
- **Compose** : `docker-compose.yml` + `dev/prod` 오버라이드, 네트워크 분리(`frontend-net`, `backend-net`), DB/Redis 외부 미노출, 볼륨 `db-data`/`file-storage`.
- **CI** : PR 시 lint/typecheck/format/test/build + Docker 이미지 빌드 검증, main 푸시 시 GHCR 푸시 + 배포 훅.
- **테스트** : Vitest + jsdom (`tests/Terrain.test.ts` 등).

---

## 10. 한 사이클 데이터 흐름 요약

```text
[SimParams 슬라이더] → buildSimState
        │
        ▼
SyntheticScourSource ─→ ScourSeries(baseTerrain + frames[Δelev])
SyntheticFluidSource ─→ FluidSeries(grid + frames[Vx,Vy,Vz,P,ρ])
        │
        ▼
   Terrain          FluidSlicePlane     VelocityArrows     BridgeCollapse
 (PlaneGeometry      (DataTexture        (InstancedMesh    (Cylinder Group
  vertex Y/color     RGBA8 W×D)          shaft+head)        + Deck Box)
  in-place)
        │                                                        │
        ▼                                                        ▼
   ColorLegend ↔ absMax                              ScourWarning(gauges)
   CellTimeSeries(SVG, clicked cell)                  + CollapseEvent

           ↑
   TimeControls.tick(delta) ── current t ──→ 모든 모듈.updateAtTime(t)
           ↑
   AnimationLoop(requestAnimationFrame)
           ↑
   RendererManager.render(SceneManager.scene, CameraManager.camera)
```

---

## 11. 디자인 관점에서 인상적인 포인트

1. **단일 시간축 + `updateAtTime(t)` 규약** — 새 시각 모듈을 붙일 때 이 한 메서드만 구현하면 끝.
2. **데이터 소스 인터페이스(`ScourDataSource`, `FluidDataSource`) 추상화** — 합성/Manifest/CSV 가 동일 진입점이라 FLOW-3D 실데이터를 붙일 준비가 끝나 있음.
3. **`Float32Array` + 인덱스 규약 통일** — 격자 데이터가 메모리/네트워크/GPU 어디서나 같은 형태로 흐름.
4. **`Disposable` 패턴 + `buildSimState.dispose()`** — 파라미터를 바꿔도 메모리/리스너 누수 없이 “핫 리빌드” 가능.
5. **컬러맵 1 소스 → 3D 정점색 + HTML 범례 공유** — 시각 표현의 일관성이 코드 한 곳에 모여 있음.
6. **WebGL 컨텍스트 손실 처리 + non-root Nginx + 보안 헤더** 까지 운영 관점까지 포함된 “전 스택 데모”라는 점.

---

## 12. 함께 보면 좋은 문서

- [`docs/architecture.md`](./architecture.md) — 시스템 구성/네트워크 분리/데이터 파이프라인
- [`docs/deployment.md`](./deployment.md) — 로컬/Docker/운영 배포 절차
- [`setup-prompt.md`](../setup-prompt.md) — 초기 프로젝트 셋업 청사진(체크리스트)
