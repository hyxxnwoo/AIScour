# =====================================================
# Backend Dockerfile 템플릿
# 실제 백엔드 스택이 결정되면(Node.js / Python / Go 등) 베이스 이미지와 빌드 단계를 교체한다.
# 본 템플릿은 Node.js LTS 기준의 멀티스테이지 예시이다.
# =====================================================
FROM node:20-alpine AS builder

WORKDIR /app

COPY backend/package.json backend/package-lock.json* ./
RUN npm ci --no-audit --no-fund

COPY backend/ ./
RUN npm run build

# =====================================================
# Stage 2: 런타임 (non-root 실행)
# =====================================================
FROM node:20-alpine AS production

# 비특권 사용자 생성 후 그 권한으로 실행
RUN addgroup -S app && adduser -S app -G app

WORKDIR /app

COPY --from=builder --chown=app:app /app/node_modules ./node_modules
COPY --from=builder --chown=app:app /app/dist ./dist
COPY --from=builder --chown=app:app /app/package.json ./package.json

USER app

ENV NODE_ENV=production
EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:8000/healthz || exit 1

CMD ["node", "dist/server.js"]
