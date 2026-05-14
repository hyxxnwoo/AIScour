import { defineConfig } from 'vite';
import tsconfigPaths from 'vite-tsconfig-paths';
import path from 'node:path';
import { existsSync, statSync, createReadStream } from 'node:fs';
import type { Plugin } from 'vite';

// 로컬 storage/ 디렉토리를 /data/ URL 로 정적 서빙하는 dev 전용 미들웨어.
// 운영 환경에서는 Nginx 가 동일 경로(/data/)를 호스트 경로로 매핑한다 (docker/nginx/default.conf 참고).
function storageStaticPlugin(rootDir: string, mountPath = '/data/'): Plugin {
  return {
    name: 'scour-storage-static',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = req.url ?? '';
        if (!url.startsWith(mountPath)) return next();
        const rel = decodeURIComponent(url.slice(mountPath.length).split('?')[0] ?? '');
        // 디렉토리 탈출 방지
        const safeRel = rel.replace(/\.\.+/g, '');
        const absPath = path.join(rootDir, safeRel);
        if (!absPath.startsWith(rootDir)) {
          res.statusCode = 403;
          res.end('forbidden');
          return;
        }
        if (!existsSync(absPath) || !statSync(absPath).isFile()) {
          res.statusCode = 404;
          res.end('not found');
          return;
        }
        const ext = path.extname(absPath).toLowerCase();
        const ctype =
          ext === '.json'
            ? 'application/json'
            : ext === '.bin'
              ? 'application/octet-stream'
              : 'application/octet-stream';
        res.setHeader('Content-Type', ctype);
        res.setHeader('Cache-Control', 'no-cache');
        createReadStream(absPath).pipe(res);
      });
    },
  };
}

// Vite 설정: TypeScript path alias를 자동 동기화하고, 개발/빌드/테스트 환경을 통합 정의한다.
export default defineConfig({
  plugins: [tsconfigPaths(), storageStaticPlugin(path.resolve(__dirname, 'storage'))],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  server: {
    host: true,
    port: 5173,
    strictPort: true,
    proxy: {
      // 백엔드 API 프록시: 운영 환경에서는 Nginx가 동일 경로로 라우팅한다.
      '/api': {
        target: process.env['VITE_API_PROXY_TARGET'] ?? 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    target: 'es2022',
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      output: {
        // Three.js 번들이 크기 때문에 별도 청크로 분리하여 캐시 효율을 높인다.
        manualChunks: {
          three: ['three'],
        },
      },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['tests/**/*.{test,spec}.ts'],
  },
});
