# 배포 및 운영 가이드

## 1. 사전 요구사항

| 항목 | 버전 |
| --- | --- |
| Node.js | 20 LTS 이상 |
| npm | 10 이상 |
| Docker | 24 이상 |
| Docker Compose plugin | v2 이상 (`docker compose ...`) |

## 2. 로컬 개발 환경

### 옵션 A — 호스트에서 직접 실행 (가장 빠른 반복)

```bash
npm install
cp .env.example .env
npm run dev
```

브라우저에서 `http://localhost:5173` 접속.

사용 가능한 npm 스크립트:

| 명령 | 설명 |
| --- | --- |
| `npm run dev` | Vite 개발 서버 (HMR) |
| `npm run build` | 프로덕션 빌드 (`tsc --noEmit && vite build`) |
| `npm run preview` | 빌드 결과 로컬 미리보기 |
| `npm run lint` / `lint:fix` | ESLint 검사 / 자동 수정 |
| `npm run format` / `format:check` | Prettier 포맷팅 / 검사 |
| `npm run test` / `test:watch` | Vitest 단위 테스트 |
| `npm run typecheck` | TypeScript 타입 검사만 수행 |

### 옵션 B — Docker Compose 개발 스택

```bash
cp .env.development.example .env.development
docker compose -f docker-compose.yml -f docker-compose.dev.yml --env-file .env.development up
```

서비스별 노출 포트:

- Frontend (Vite dev): `http://localhost:5173`
- Backend API: `http://localhost:8000`
- PostgreSQL: `localhost:5432`
- Redis: `localhost:6379`

## 3. 운영 환경 배포 절차

### 3.1 로컬에서 운영 시뮬레이션

```bash
# 운영용 환경 변수 준비 (시크릿은 시크릿 매니저에서 주입 권장)
cp .env.production.example .env.production
# .env.production 파일을 열어 비밀번호와 도메인 정보 채우기

docker compose -f docker-compose.yml -f docker-compose.prod.yml \
  --env-file .env.production up -d --build
```

브라우저에서 `http://localhost` 접속 (frontend 컨테이너의 8080 → 호스트 80 매핑).

### 3.2 운영 서버 배포 (예: 단일 VM)

1. CI 파이프라인이 GHCR(또는 다른 레지스트리)에 이미지를 푸시.
2. 배포 서버에서 `git pull` 후 `docker compose pull && docker compose up -d`.
3. 헬스체크가 `passing` 으로 전환되는지 확인 (`docker compose ps`).
4. 외부 LB / Nginx 가 설정된 경우 헬스체크 엔드포인트 `/healthz` 를 등록.

### 3.3 HTTPS 적용

권장 옵션:

- **외부 LB 종단**: AWS ALB / Cloudflare / GCP LB 가 TLS 를 처리하고 컨테이너로 80(HTTP) 프록시.
- **Caddy/Traefik 사이드카**: 자동 인증서 발급(Let's Encrypt) 및 종단을 컨테이너 단계에서 수행.
- **사내 인증서**: nginx 컨테이너에 인증서를 마운트하고 443 listen 추가.

## 4. CI/CD

- **CI** (`.github/workflows/ci.yml`): PR/Push 시 lint, typecheck, format, 테스트, 빌드, Docker 이미지 빌드 검증.
- **Deploy** (`.github/workflows/deploy.yml`): main 푸시 시 GHCR 이미지 빌드/푸시. 실 배포 단계는 환경(SSH/ECS/K8s)에 맞춰 마지막 step 을 채워 사용.

## 5. 환경 변수

| 변수 | 사용처 | 설명 |
| --- | --- | --- |
| `VITE_APP_TITLE` | Frontend (build time) | 페이지 제목 |
| `VITE_API_BASE_URL` | Frontend (build time) | API base URL (보통 `/api`) |
| `VITE_API_PROXY_TARGET` | Frontend dev | Vite dev server proxy 대상 |
| `BACKEND_PORT` | Backend | API 포트 |
| `POSTGRES_*` | Backend, DB | DB 접속 정보 |
| `REDIS_*` | Backend, Redis | 캐시 접속 정보 |
| `STORAGE_PATH` | Backend | 파일 스토리지 마운트 경로 |

> ⚠️ `Vite` 는 빌드 시점에 `VITE_` 접두사 변수를 정적으로 임베드합니다. **시크릿(API 키 등)은 절대 `VITE_` 변수에 넣지 마세요.**

## 6. 트러블슈팅

| 증상 | 원인 / 해결 |
| --- | --- |
| `npm install` 후 `husky` 가 `.git can't be found` 경고 | 저장소 초기화(`git init`) 후 다시 시도. 설치 자체는 성공하므로 무시해도 무방. |
| 컨테이너에서 nginx 가 권한 오류 | `docker/frontend.Dockerfile` 의 nginx 사용자 권한 단계가 정상 적용됐는지 확인. 마운트한 볼륨 권한도 점검. |
| Three.js 청크가 너무 큼 | `vite.config.ts` 의 `manualChunks` 분리가 적용 중. 추가 로딩이 필요한 경우 동적 `import()` 사용. |
| WebGL 컨텍스트 손실 | `RendererManager` 에서 `webglcontextlost` 핸들러를 추가하고 사용자 알림 후 재초기화. |
| FLOW-3D 데이터가 너무 큼 | `scripts/` 의 변환 스크립트로 프레임 단위 분할 + manifest 생성. 프론트엔드는 lazy fetch. |

## 7. 보안 체크리스트

- [x] 컨테이너 non-root 실행 (frontend: `nginx`, backend: `app`)
- [x] 보안 헤더 (X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy)
- [x] DB / Redis 외부 노출 차단 (운영 compose 기준)
- [x] `.env*` 파일 `.gitignore` 등록 (예시 `.env.example` 만 커밋)
- [ ] 운영 비밀번호를 시크릿 매니저로 이전 (TODO: 배포 환경 결정 후)
- [ ] 이미지 보안 스캔 (예: Trivy) 파이프라인 통합 (TODO)
- [ ] HTTPS 종단 구성 (TODO)
