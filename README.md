# Bridge Scour 3D Dashboard

FLOW-3D 시뮬레이션 데이터를 기반으로 한 **교량 세굴(Bridge Scour) 3D 시각화 대시보드**입니다.
Three.js + TypeScript 기반의 SPA 프론트엔드와 Docker 기반의 컨테이너화된 백엔드/인프라를 포함합니다.

## ✨ 주요 기능 (계획)

- 하상 지형(Terrain) 3D 렌더링
- 시간에 따른 세굴 변화 애니메이션
- 카메라 컨트롤 및 인터랙션
- 데이터 포인트 클릭 시 상세 정보 표시
- 색상 매핑을 통한 세굴 깊이 시각화

## 🏗️ 기술 스택

| 영역 | 기술 |
| --- | --- |
| Frontend | Vite, TypeScript (strict), Three.js, stats.js |
| Quality | ESLint, Prettier, Husky + lint-staged, Vitest |
| Infra | Docker (멀티스테이지), Nginx, Docker Compose |
| Backend (예정) | Node.js / Python (REST API) |
| Storage | PostgreSQL, Redis(선택), 파일 볼륨 / S3 |

## 🚀 빠른 시작

```bash
# 1. 의존성 설치
npm install

# 2. 환경 변수 준비
cp .env.example .env

# 3. 개발 서버 실행
npm run dev
# → http://localhost:5173
```

Docker 로 전체 스택을 띄우려면:

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml \
  --env-file .env.development up
```

자세한 사용법은 [`docs/deployment.md`](docs/deployment.md) 를 참고하세요.

## 📂 프로젝트 구조

```
.
├── .github/workflows/   # CI/CD 파이프라인
├── .vscode/             # 에디터 권장 설정
├── docs/                # 아키텍처/배포 문서
├── docker/              # Dockerfile, nginx 설정
├── scripts/             # FLOW-3D 데이터 변환 스크립트
├── storage/             # 시뮬레이션 데이터 (gitignored)
├── public/              # 정적 자원
├── src/
│   ├── core/            # Three.js 매니저 (Scene/Renderer/Camera/Light/Loop)
│   ├── components/      # UI 컴포넌트 (TBD)
│   ├── modules/         # 기능 단위 모듈 (Terrain, Animation 등)
│   ├── data/            # 데이터 로더/파서
│   ├── types/           # 공통 타입
│   ├── utils/           # 유틸 (FPS 미터 등)
│   ├── constants/       # 시각/카메라/렌더러 상수
│   ├── styles/          # 전역 CSS
│   └── main.ts          # 엔트리 포인트
├── tests/               # Vitest 테스트
├── docker-compose.yml         # 베이스 compose
├── docker-compose.dev.yml     # 개발 오버라이드
├── docker-compose.prod.yml    # 운영 오버라이드
├── tsconfig.json
├── vite.config.ts
└── package.json
```

## 📜 npm 스크립트

| 명령 | 설명 |
| --- | --- |
| `npm run dev` | Vite 개발 서버 |
| `npm run build` | 타입체크 + 프로덕션 빌드 |
| `npm run preview` | 빌드 결과 미리보기 |
| `npm run lint` | ESLint |
| `npm run format` | Prettier 포맷팅 |
| `npm run test` | Vitest 단위 테스트 |
| `npm run typecheck` | TypeScript 타입 검사 |

## 🔒 보안 / 운영

- 컨테이너는 non-root 사용자로 실행됩니다.
- DB / Redis 는 외부에 노출되지 않으며 backend-net 내부에서만 통신합니다.
- 시크릿은 `.env*` 파일이 아닌 시크릿 매니저로 주입할 것을 권장합니다.
- 자세한 내용은 [`docs/architecture.md`](docs/architecture.md) 와 [`docs/deployment.md`](docs/deployment.md) 참조.

## 📄 라이선스

내부 연구용 프로젝트이며, 라이선스는 추후 결정됩니다.
