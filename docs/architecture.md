# 시스템 아키텍처

## 1. 개요

본 프로젝트는 FLOW-3D 시뮬레이션 결과를 기반으로 한 **교량 세굴 3D 시각화 대시보드**입니다. 다음 3계층 구조를 따릅니다.

```
                ┌────────────────────────┐
                │     사용자 브라우저     │
                └──────────┬─────────────┘
                           │ HTTPS
                ┌──────────▼─────────────┐
                │  Nginx (Reverse Proxy +│
                │   Static Asset Server) │
                └────┬───────────────┬───┘
                     │               │
            ┌────────▼─────┐   ┌─────▼──────────┐
            │  Frontend SPA │   │  Backend API   │
            │ (Vite+Three.js│   │ (Node/Python…) │
            │  Static dist) │   │                │
            └───────────────┘   └─────┬──────────┘
                                      │
                              ┌───────▼────────┐
                              │   PostgreSQL   │
                              └───────┬────────┘
                                      │
                              ┌───────▼────────┐
                              │  File Storage  │
                              │ (FLOW-3D data) │
                              └────────────────┘
```

## 2. 컴포넌트 역할

| 컴포넌트 | 책임 |
| --- | --- |
| **Frontend (Vite + TypeScript + Three.js)** | 3D 씬 렌더링, 시간 애니메이션, 사용자 인터랙션. Nginx 가 정적 파일로 서빙. |
| **Nginx (Reverse Proxy)** | TLS 종단(또는 외부 LB 위임), `/api/*` 백엔드 프록시, SPA 라우팅 폴백, gzip + 정적 캐시, 보안 헤더. |
| **Backend API** | FLOW-3D 데이터 메타정보 제공, 변환된 프레임/메시 전달, 사용자/권한, 작업 큐. |
| **PostgreSQL** | 시뮬레이션 메타데이터, 사용자, 작업 기록 등 관계형 저장소. |
| **Redis (선택)** | 세션, 캐시, 백엔드 작업 큐 브로커. |
| **File Storage** | FLOW-3D 원본 및 가공 데이터(대용량 바이너리). 컨테이너 볼륨 또는 S3 등 외부 스토리지로 확장. |

## 3. 프론트엔드 모듈 구조

```
src/
├── core/         # SceneManager, RendererManager, CameraManager, LightManager, AnimationLoop
├── components/   # UI 컴포넌트(HUD, 컨트롤 패널 등) — 향후 추가
├── modules/      # 기능 단위(Terrain, ScourAnimation, Picking 등) — 향후 추가
├── data/         # FLOW-3D 결과 로더/파서 — 향후 추가
├── types/        # 공통 타입 정의
├── utils/        # 유틸리티 (FPS 미터 등)
├── constants/    # 상수(기본 카메라/라이트/렌더러 옵션)
└── styles/       # 전역 CSS
```

각 코어 매니저는 `Disposable` 인터페이스를 구현하여 명시적 리소스 정리(Three.js GPU 리소스/이벤트 리스너)를 보장합니다.

## 4. 데이터 흐름

```
FLOW-3D 시뮬레이션 결과 (raw, GB 단위)
        │ scripts/ 변환
        ▼
storage/flow3d/processed (프레임 단위 바이너리 + manifest.json)
        │ Backend API 응답
        ▼
Frontend 3D 씬 (스트리밍 fetch + Three.js 렌더)
```

원본 데이터는 대용량이므로 **프레임 단위 분할 + 인덱스(manifest)** 방식으로 변환하여 프론트엔드는 필요한 시점의 프레임만 가져옵니다. 자세한 가이드는 [`scripts/README.md`](../scripts/README.md) 참조.

## 5. 네트워크 토폴로지 (Docker)

| 네트워크 | 소속 서비스 | 외부 노출 |
| --- | --- | --- |
| `frontend-net` | frontend, backend | frontend 80/443 |
| `backend-net` | backend, database, redis | 없음 (운영 환경 기준) |

DB 와 Redis 는 backend-net 에만 연결하여 외부에서 직접 접근할 수 없도록 분리합니다.

## 6. 확장 포인트

- **HTTPS**: 외부 LB(AWS ALB, Cloudflare 등) 종단을 권장. 컨테이너 자체에서 종단할 경우 Caddy/Traefik 또는 Certbot 사이드카 추가.
- **저장소**: `file-storage` 볼륨 → S3 호환 객체 스토리지로 교체. presigned URL 활용 시 백엔드 부담 최소화.
- **모니터링**: Prometheus + Grafana, 백엔드/Nginx 메트릭 노출. 로그는 Loki/CloudWatch 로 집계.
- **배포**: 단일 호스트 docker-compose → ECS/Fargate 또는 Kubernetes 로 단계적 이전.
