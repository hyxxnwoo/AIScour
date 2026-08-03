# CSV 좌표 → Three.js 월드 좌표 매핑

FLOW-3D CSV의 `x`, `y`, `z`, `scrdif`가 세굴/퇴적 3D 시각화에서 어떻게 Three.js 월드 좌표로 변환되는지 정리한 문서입니다.

관련 코드:

- `src/data/buildSampleProbeDashboard.ts` — bounds 계산, `dataToWorld`
- `src/data/buildScrdifBedField.ts` — 하상 축약, 지형 격자 보간
- `src/utils/fluidWorld.ts` — 지형 격자 ↔ 월드 XZ
- `src/modules/Terrain.ts` — 메쉬 정점 높이·색 렌더링

---

## 1. 축 대응 (FLOW-3D CSV ↔ Three.js)

FLOW-3D CSV와 Three.js 월드 좌표는 **축 이름이 다릅니다.**


| CSV 축 | FLOW-3D 의미    | Three.js 월드 축 |
| ----- | ------------- | ------------- |
| **x** | 흐름 방향 (수조 길이) | **X**         |
| **y** | 횡단 (수조 폭)     | **Z**         |
| **z** | 연직 (표고)       | **Y**         |


변환 함수 `dataToWorld()`:

```ts
// src/data/buildSampleProbeDashboard.ts
{
  x: dataX - bounds.originDataX,  // originDataX = tankLengthX / 2
  y: dataZ - bounds.centerDataZ,
  z: dataY - bounds.originDataY, // originDataY = 0
}
```

---



## 2. 기준점(anchor) — 수조 물리 좌표에 맞춤 

CSV 전체 행의 min/max는 **표시 범위** 계산에만 쓰고, **월드 XZ 배치**는 bbox 중심이 아니라 **수조 물리 좌표**를 따릅니다.

```ts
originDataX = tankLengthX / 2   // 기본 1.116 / 2 = 0.558 m
originDataY = 0                  // 횡단(y) 중심

worldX = dataX - originDataX     // CSV x=0 → 수조 입구 (-lengthX/2)
worldZ = dataY - originDataY     // CSV y=0 → 수로 중심 (Z=0)
```


| CSV x        | 월드 X (기본 수조)                        |
| ------------ | ----------------------------------- |
| 0            | **-0.558 m** (입구)                   |
| 0.1 (구조물 전방) | **-0.458 m** (= `structureCenterX`) |
| 0.558 (중앙)   | **0**                               |
| 1.116 (출구)   | **+0.558 m**                        |


→ **부분 CSV**(x가 0~0.85만 있는 경우)도 x=0 앵커는 고정이라, bbox 중심 정렬 때처럼 X축이 밀리지 않습니다.

수직(Y)은 프로브 표시용으로 `centerDataZ`를 유지합니다.

```ts
worldY = dataZ - centerDataZ
```

---



## 3. 세굴/퇴적: CSV 포인트를 1:1로 찍지 않음

**중요:** CSV의 `(x, y, z)`를 Three.js에 점 하나씩 배치하는 방식이 **아닙니다.**

세굴/퇴적 파이프라인은 다음 순서로 동작합니다.

```text
CSV 행 (x, y, z, scrdif)
        ↓
① (x, y) 하상 격자로 축약  — z는 층 선택용
        ↓
② 137×83 지형 격자에 이중선형 보간
        ↓
③ deltaElevations[] → 메쉬 정점 Y + vertex color
```

---



## 4. z 축의 역할 — 위치가 아니라 “층 선택”

같은 `(x, y)`에 `z`가 다른 행이 여러 개 있으면, **|scrdif|가 가장 큰 행의 부호 있는 값**만 남깁니다.

```ts
// src/data/buildScrdifBedField.ts — reduceScrdifToBed()
if (Math.abs(s) > Math.abs(out[idx])) {
  out[idx] = s;  // 부호 유지
}
```


| CSV 필드     | 세굴/퇴적에서의 역할                          |
| ---------- | ------------------------------------ |
| **x, y**   | 수평 위치 (하상 격자 축)                      |
| **z**      | 같은 (x,y) 여러 층 중 어느 scrdif를 쓸지 **선택** |
| **scrdif** | 실제 **Δ표고(미터)** — Three.js Y 변위       |


→ **CSV z는 Three.js Y 좌표로 직접 쓰이지 않습니다.** 높이는 **scrdif 값**입니다.

---



## 5. 지형 격자 (Three.js XZ 평면)

세굴/퇴적 메쉬는 **고정 2D 격자** 위에 그려집니다.


| 항목      | 값                                  |
| ------- | ---------------------------------- |
| 정점 수    | **137 × 83** (X × Z)               |
| 셀 수     | **136 × 82**                       |
| 셀 간격    | **0.01 m**                         |
| 물리 X 범위 | 1.356 m (수조 1.116 + margin 0.12×2) |
| 물리 Z 범위 | 0.816 m (수조 0.456 + margin 0.18×2) |
| XZ 중심   | **월드 원점 (0, 0)**                   |


격자 인덱스 `(gx, gy)` → 월드 XZ:

```ts
// src/utils/fluidWorld.ts — terrainGridToWorldXZ()
halfW = ((width - 1) * cellSize) / 2
halfH = ((height - 1) * cellSize) / 2

worldX = gx * cellSize - halfW
worldZ = gy * cellSize - halfH
```

기본 하상 표고(`elevations`)는 **전부 0** (퇴적물 표면 = 표고 0).

---



## 6. CSV (x, y) → 지형 격자 보간

각 지형 격자점 `(gx, gy)`마다:

1. `terrainGridToWorldXZ(gx, gy)`로 월드 `(worldX, worldZ)` 계산
2. CSV 좌표로 역변환: `dataX = worldX + originDataX`, `dataY = worldZ + originDataY`
3. CSV 하상 격자에서 `scrdif`를 **이중선형 보간**
4. 결과를 `deltaElevations[gy * width + gx]`에 저장

```ts
// src/data/buildScrdifBedField.ts — resampleBedToTerrain()
const { x: worldX, z: worldZ } = terrainGridToWorldXZ(gx, gy, terrain);
const dataX = worldX + originDataX;
const dataY = worldZ + originDataY;
out[gy * width + gx] = sampleBedBilinear(bed, xAxis, yAxis, dataX, dataY, ...);
```

**경계 처리:**

- CSV 발자국 **밖** → `0` (변화 없음)
- **외삽(extrapolation) 없음** — 데이터 범위 안에서만 보간

---



## 7. Three.js 메쉬 높이 (Y)

렌더링 시 각 정점의 최종 높이:

```text
vertexY = baseElevation + scrdif × verticalExaggeration
        = 0 + deltaElevations[i] × (과장 계수, 기본 1)
```

- **음수 scrdif** → 세굴 (파임)
- **양수 scrdif** → 퇴적 (쌓임)
- 단위: **미터** (`scourRate` 배율 없음, CSV 실측값 그대로)
- vertex color도 동일 Δ값 기준 (모래색 + 세굴/퇴적 강조)

코드: `src/modules/Terrain.ts`

---



## 8. 기둥(교각) 배치

CSV 대시보드에서는 기둥을 **지형·CSV 데이터 중심(월드 x=0, z=0)** 에 둡니다.


| 조건                         | 배치                           |
| -------------------------- | ---------------------------- |
| `pierCount = 1` (기본)       | **(0, 0)** — 도메인 중심          |
| `pierCount ≥ 2`, scrdif 없음 | x=0 또는 z=0 기준 **대칭 배치**      |
| `pierCount ≥ 2`, scrdif 있음 | scrdif **국소 최대** 위치 (greedy) |
| `pierX` / `pierZ` 지정       | 지정 좌표 사용                     |


코드: `src/data/buildSampleProbeDashboard.ts` — `resolveCsvPierLayout()`

---



## 9. FLOW-3D 원본 CSV 격자 (참고)

`sampledata.csv` 헤더 기준 전체 메쉬:

```text
ix=3 to 120   jy=3 to 50   kz=3 to 47
```


| 축   | 격자 수    | 물리 범위 (대략)           | 간격 (대략)   |
| --- | ------- | -------------------- | --------- |
| x   | **118** | 0 ~ 1.116 m          | ~0.0095 m |
| y   | **48**  | ±0.228 m (폭 0.456 m) | ~0.0096 m |
| z   | **45**  | 하상(표고 0) 기준 연직       | ~0.0095 m |


한 시간 블록(`t=...`)당 약 **118 × 48 × 45 ≈ 255,000** 포인트.

scrdif 하상 축약 후: **118 × 48** (2D).

저장소의 `public/data/sampledata.csv`는 테스트용 **일부 슬라이스**(x 방향 92점, y·z 각 1면)만 포함합니다.

---



## 10. 한 줄 요약


| CSV        | Three.js에서 쓰는 방식                                |
| ---------- | ----------------------------------------------- |
| **x**      | → **X** (흐름). `worldX = x - tankLengthX/2`      |
| **y**      | → **Z** (폭). `worldZ = y`                       |
| **z**      | XZ 위치에 **미사용**. 같은 (x,y) 여러 층 중 |scrdif| 최대만 선택 |
| **scrdif** | → **Y 변위**. `vertexY = 0 + scrdif` (미터)         |


**핵심:** CSV 포인트를 Three.js에 1:1로 찍는 것이 아니라, **CSV (x,y)의 scrdif를 중심 맞춘 137×83 지형 격자에 보간**하여 메쉬 높이·색으로 표현합니다.

---



## 11. 데이터 흐름 다이어그램

```text
┌─────────────────────────────────────────────────────────────┐
│  FLOW-3D CSV                                                │
│  각 행: (x, y, z, scrdif) × N                               │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│  reduceScrdifToBed                                          │
│  (x,y) 격자 — z층 중 |scrdif| 최대 선택                      │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│  resampleBedToTerrain                                       │
│  CSV (dataX,dataY) ←→ world (X,Z) via centerData            │
│  137×83 deltaElevations[]                                   │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│  Terrain.ts (Three.js)                                      │
│  PlaneGeometry XZ + vertexY = baseZ + delta                 │
│  vertex color = f(scrdif)                                   │
└─────────────────────────────────────────────────────────────┘
```

