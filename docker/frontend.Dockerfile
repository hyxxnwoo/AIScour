# =====================================================
# Stage 1: 빌더 (Vite + TypeScript 빌드)
# =====================================================
FROM node:20-alpine AS builder

WORKDIR /app

# 의존성 캐시 최적화: 먼저 매니페스트만 복사하여 npm ci 캐시 레이어를 분리한다.
COPY package.json package-lock.json* ./
RUN npm ci --no-audit --no-fund

# 소스 복사 후 프로덕션 빌드
COPY tsconfig.json vite.config.ts index.html ./
COPY src ./src
COPY public ./public

# 빌드 시점에 환경 변수를 주입하기 위해 ARG 사용 (VITE_ 접두사 변수만 클라이언트에 임베드된다)
ARG VITE_APP_TITLE="Bridge Scour 3D Dashboard"
ARG VITE_API_BASE_URL="/api"
ENV VITE_APP_TITLE=$VITE_APP_TITLE
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL

RUN npm run build

# =====================================================
# Stage 2: 런타임 (Nginx alpine 정적 파일 서빙)
# =====================================================
FROM nginx:1.27-alpine AS production

# 보안: non-root 사용자로 실행하기 위해 nginx 디폴트 사용자 권한을 조정한다.
# nginx alpine 이미지는 기본적으로 nginx 사용자(uid=101)를 포함한다.
RUN rm -rf /usr/share/nginx/html/* /etc/nginx/conf.d/default.conf

COPY docker/nginx/nginx.conf /etc/nginx/nginx.conf
COPY docker/nginx/default.conf /etc/nginx/conf.d/default.conf

# 빌드 결과물만 최종 이미지에 포함 → 이미지 크기 최소화
COPY --from=builder /app/dist /usr/share/nginx/html

# nginx 의 PID/캐시 디렉토리에 nginx 사용자가 쓸 수 있도록 권한 조정
RUN chown -R nginx:nginx /var/cache/nginx /var/log/nginx /usr/share/nginx/html \
    && touch /var/run/nginx.pid \
    && chown nginx:nginx /var/run/nginx.pid

USER nginx

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:8080/healthz || exit 1

CMD ["nginx", "-g", "daemon off;"]
