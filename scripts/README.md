# scripts/

FLOW-3D 결과 데이터를 프론트엔드에서 사용 가능한 포맷(JSON / glTF)으로 변환하기 위한 스크립트가 위치합니다.

## 권장 디렉토리 규약

| 위치 | 역할 |
| --- | --- |
| `../storage/flow3d/raw/` | FLOW-3D 원본 출력(예: `.flsgrf`, `.csv`, `.dat`) |
| `../storage/flow3d/processed/` | 변환된 데이터(예: `terrain.json`, `frames/*.bin`, `mesh.glb`) |
| `../storage/flow3d/metadata/` | 시뮬레이션 파라미터(시간 간격, 좌표계, 단위) JSON |
| `../storage/exports/` | 사용자 다운로드/내보내기 산출물 |

## 대용량 처리 가이드

- 단일 시뮬레이션이 GB 단위가 될 수 있으므로 메모리 적재 대신 **스트리밍 파서**(`stream`/`readline`) 사용을 권장합니다.
- 프레임별 분할 → 인덱스 파일(`manifest.json`) 생성 → 프론트엔드는 필요한 프레임만 fetch.
- 가능한 경우 Float32 / Int16 등 **타입드 배열 + 바이너리 포맷**으로 저장하여 네트워크와 파싱 비용을 모두 절감합니다.

## 추가 예정 스크립트

- `convert-terrain.ts` — 정적 하상 지형 → glTF 변환
- `extract-frames.ts` — 시간별 세굴 깊이 → 바이너리 프레임 시퀀스
- `build-manifest.ts` — 프레임 인덱스/메타데이터 manifest 생성
