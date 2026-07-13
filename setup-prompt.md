# 프로젝트: 교량 세굴 3D 시각화 대시보드 - 개발 환경 및 인프라 구축

## 역할
당신은 Three.js, TypeScript, 모던 프론트엔드 빌드 도구, 그리고 클라우드 인프라(Docker, AWS/Nginx)에 능숙한 시니어 풀스택 개발자입니다.
유지보수성, 확장성, 배포 효율성을 최우선으로 고려하여 프로젝트 초기 환경과 인프라를 구축해주세요.

## 프로젝트 개요
- **목적**: FLOW-3D 시뮬레이션 데이터를 기반으로 한 교량 세굴(Bridge Scour) 3D 시각화 대시보드
- **주요 기능 (향후 구현 예정)**:
  - 하상 지형(Terrain) 3D 렌더링
  - 시간에 따른 세굴 변화 애니메이션
  - 카메라 컨트롤 및 인터랙션
  - 데이터 포인트 클릭 시 상세 정보 표시
  - 색상 매핑을 통한 세굴 깊이 시각화
- **시스템 구성**:
  - **Frontend**: Three.js + TypeScript 기반 3D 대시보드
  - **Backend**: REST API (FLOW-3D 데이터 제공)
  - **Infrastructure**: 컨테이너 기반 배포 환경

---

## 🎨 Part 1: 프론트엔드 개발 환경 구축

### 기술 스택
- **언어**: TypeScript (strict mode)
- **빌드 도구**: Vite (최신 버전)
- **3D 라이브러리**: Three.js (최신 안정 버전)
- **패키지 매니저**: npm
- **Node.js**: LTS 버전 기준

### 1. 프로젝트 초기화
- [ ] Vite + TypeScript 템플릿으로 프로젝트 생성
- [ ] Three.js 및 관련 타입 정의(@types/three) 설치
- [ ] 필수 개발 도구 설치:
  - ESLint (TypeScript 규칙 포함)
  - Prettier
  - Husky + lint-staged (커밋 전 자동 검사)
  - Vitest (단위 테스트)

### 2. 폴더 구조 설계
```
src/
├── core/           # Three.js 핵심 로직 (Scene, Renderer, Camera 등)
├── components/     # UI 컴포넌트
├── modules/        # 기능 단위 모듈 (Terrain, Animation, Controls 등)
├── data/           # 데이터 로더 및 파서
├── types/          # 공통 타입 정의
├── utils/          # 유틸리티 함수
├── constants/      # 상수 정의
├── styles/         # CSS/SCSS 파일
└── main.ts         # 엔트리 포인트
```

### 3. TypeScript 설정
- `tsconfig.json`에 다음 옵션 활성화:
  - `strict: true`
  - `noUnusedLocals: true`
  - `noUnusedParameters: true`
  - `noImplicitReturns: true`
  - `paths` 별칭 설정 (예: `@/core/*`, `@/utils/*`)
- Vite 설정에서도 동일한 path alias 적용

### 4. Three.js 기본 구조 작성
`src/core/` 안에 다음 클래스 생성 (단일 책임 원칙 준수):

- [ ] `SceneManager.ts` - Scene 생성 및 관리
- [ ] `RendererManager.ts` - WebGLRenderer 설정 및 반응형 처리
- [ ] `CameraManager.ts` - PerspectiveCamera + OrbitControls
- [ ] `LightManager.ts` - 조명 설정 (Ambient + Directional)
- [ ] `AnimationLoop.ts` - requestAnimationFrame 기반 렌더 루프

각 클래스 요구사항:
- TypeScript 타입 명시
- dispose() 메서드로 메모리 정리 가능
- 윈도우 리사이즈 대응

### 5. 동작 확인용 샘플 씬
- [ ] 회전하는 큐브 또는 평면(Plane) 렌더링
- [ ] OrbitControls로 카메라 조작 가능
- [ ] 기본 조명 적용
- [ ] FPS 표시(stats.js 또는 자체 구현)

### 6. 개발 편의 기능 (npm scripts)
- [ ] `npm run dev` - 개발 서버 실행
- [ ] `npm run build` - 프로덕션 빌드
- [ ] `npm run lint` - ESLint 검사
- [ ] `npm run format` - Prettier 포맷팅
- [ ] `npm run test` - 테스트 실행
- [ ] `npm run preview` - 빌드 결과 미리보기

### 7. Git 및 설정 파일
- [ ] `.gitignore` 작성 (node_modules, dist, .env 등)
- [ ] `.env.example` 파일 생성
- [ ] `.editorconfig` 추가
- [ ] `.vscode/extensions.json` (권장 확장 프로그램)
- [ ] README.md 작성

---

## 🏗️ Part 2: 인프라 아키텍처 구축

### 전체 아키텍처 개요

다음과 같은 3계층 구조로 설계해주세요:

```
[ 사용자 브라우저 ]
        ↓ HTTPS
[ Nginx (Reverse Proxy + Static Server) ]
        ↓
   ┌────┴────┐
   ↓         ↓
[ Frontend ] [ Backend API ]
  (Static)    (Node.js/Python)
              ↓
         [ Database ]
              ↓
         [ File Storage ]
         (FLOW-3D 결과 데이터)
```

### 1. 컨테이너화 (Docker)

#### 1-1. 프론트엔드 Dockerfile
- [ ] 멀티 스테이지 빌드 적용:
  - **Stage 1 (builder)**: Node.js 이미지에서 의존성 설치 및 빌드
  - **Stage 2 (production)**: Nginx alpine 이미지에서 정적 파일 서빙
- [ ] 빌드 결과물(`dist/`)만 최종 이미지에 포함하여 이미지 크기 최소화
- [ ] `.dockerignore` 파일 작성 (node_modules, .git 등 제외)

#### 1-2. Nginx 설정
- [ ] `nginx.conf` 파일 작성:
  - SPA 라우팅 지원 (`try_files $uri /index.html`)
  - Gzip 압축 활성화
  - 정적 자원 캐싱 헤더 설정
  - CORS 설정 (필요 시)
  - `/api/*` 요청을 백엔드로 프록시
  - 보안 헤더 추가 (X-Frame-Options, X-Content-Type-Options 등)

#### 1-3. Backend Dockerfile (템플릿)
- [ ] 백엔드 컨테이너 기본 구조 작성
- [ ] 헬스체크 엔드포인트 포함

### 2. Docker Compose 구성

`docker-compose.yml`에 다음 서비스 정의:

- [ ] **frontend** 서비스
  - Nginx 컨테이너로 정적 파일 서빙
  - 포트: 80, 443
- [ ] **backend** 서비스
  - API 서버
  - 환경 변수로 DB 연결 정보 주입
- [ ] **database** 서비스 (예: PostgreSQL)
  - 볼륨 마운트로 데이터 영속화
  - 헬스체크 설정
- [ ] **(선택) redis** 서비스
  - 캐싱 및 세션 관리용

추가 요구사항:
- [ ] `docker-compose.dev.yml` (개발 환경용 오버라이드)
- [ ] `docker-compose.prod.yml` (운영 환경용)
- [ ] 네트워크 분리 (frontend-net, backend-net)
- [ ] 볼륨 정의 (db-data, file-storage)

### 3. 환경 변수 관리
- [ ] `.env.development`
- [ ] `.env.production`
- [ ] `.env.example` (Git에 포함, 실제 값은 제외)
- [ ] Vite의 환경 변수 규칙 준수 (`VITE_` 접두사)

### 4. 데이터 흐름 설계

다음 데이터 파이프라인을 고려한 디렉토리 구조 생성:

```
storage/
├── flow3d/
│   ├── raw/          # FLOW-3D 원본 출력 데이터
│   ├── processed/    # 가공된 데이터 (JSON, glTF 등)
│   └── metadata/     # 시뮬레이션 메타정보
└── exports/          # 사용자 내보내기 파일
```

- [ ] 데이터 변환 스크립트 위치(`scripts/` 폴더) 구성
- [ ] 대용량 파일 처리를 위한 스트리밍 방식 검토

### 5. 배포 환경 구성

#### 5-1. CI/CD (GitHub Actions 기준)
- [ ] `.github/workflows/ci.yml` 작성:
  - PR 시 lint, test 자동 실행
  - 빌드 검증
- [ ] `.github/workflows/deploy.yml` 작성:
  - main 브랜치 푸시 시 Docker 이미지 빌드
  - 이미지 레지스트리에 푸시
  - 운영 서버 배포

#### 5-2. 로깅 및 모니터링 (기본 설정)
- [ ] 컨테이너 로그 출력 표준화 (stdout/stderr)
- [ ] 로그 로테이션 설정
- [ ] (선택) Prometheus + Grafana 연동 준비

### 6. 보안 기본 설정
- [ ] HTTPS 적용 준비 (Let's Encrypt or 사내 인증서)
- [ ] CORS 정책 명시
- [ ] 환경 변수에 민감 정보 분리
- [ ] Docker 이미지 보안 스캔 도구 검토 (예: Trivy)
- [ ] 컨테이너를 non-root 사용자로 실행

### 7. 인프라 문서화
- [ ] `docs/architecture.md` 작성:
  - 전체 시스템 구성도 (텍스트 다이어그램)
  - 각 컴포넌트의 역할
  - 데이터 흐름 설명
- [ ] `docs/deployment.md` 작성:
  - 로컬 개발 환경 실행 방법
  - 운영 환경 배포 절차
  - 트러블슈팅 가이드

---

## 📂 최종 프로젝트 루트 구조

```
bridge-scour-dashboard/
├── .github/
│   └── workflows/          # CI/CD 파이프라인
├── .vscode/                # 에디터 설정
├── docs/                   # 문서
│   ├── architecture.md
│   └── deployment.md
├── docker/
│   ├── frontend.Dockerfile
│   ├── backend.Dockerfile
│   └── nginx/
│       └── nginx.conf
├── scripts/                # 데이터 변환 등 유틸 스크립트
├── src/                    # 프론트엔드 소스
├── public/                 # 정적 자원
├── tests/                  # 테스트 코드
├── .dockerignore
├── .editorconfig
├── .env.example
├── .eslintrc.cjs
├── .gitignore
├── .prettierrc
├── docker-compose.yml
├── docker-compose.dev.yml
├── docker-compose.prod.yml
├── package.json
├── tsconfig.json
├── vite.config.ts
└── README.md
```

---

## 🚦 작업 진행 방식

1. **전체 작업 계획**을 단계별 체크리스트로 먼저 보여주세요.
2. 각 단계마다:
   - **무엇을** 할지 명시
   - **왜** 그렇게 하는지 설명
   - 실제 **명령어 또는 코드** 제공
   - 단계 완료 후 **검증 방법** 안내
3. 중요한 결정 사항(라이브러리 버전, 구조 등)에는 **이유**를 함께 설명해주세요.
4. 각 Part 완료 후 동작 확인:
   - **Part 1 완료 시**: `npm run dev`로 샘플 씬 렌더링 확인
   - **Part 2 완료 시**: `docker compose up`으로 전체 스택 기동 확인

---

## ⚠️ 제약 조건

- 모든 코드는 TypeScript strict 모드를 통과해야 합니다.
- `any` 타입 사용 금지 (불가피한 경우 주석으로 사유 명시).
- **주석은 한국어**로 작성해주세요.
- **함수/클래스명, 변수명은 영어**로 작성해주세요.
- 외부 의존성은 최소화해주세요.
- Docker 이미지는 가능한 한 alpine 기반으로 경량화해주세요.
- 운영 환경에서 컨테이너는 **non-root 사용자**로 실행되어야 합니다.
- 민감 정보(비밀번호, API 키 등)는 절대 코드에 하드코딩하지 마세요.

---

## 🎯 최종 산출물 기대치

작업 완료 시 다음이 가능해야 합니다:

✅ `npm run dev` → 로컬에서 Three.js 샘플 씬 확인  
✅ `docker compose -f docker-compose.dev.yml up` → 개발용 전체 스택 기동  
✅ `docker compose -f docker-compose.prod.yml up` → 운영 환경 시뮬레이션  
✅ GitHub에 푸시 시 CI 파이프라인 자동 실행  
✅ README만 보고도 신규 개발자가 환경 셋업 가능  

준비되면 **Part 1부터 순차적으로** 시작해주세요.