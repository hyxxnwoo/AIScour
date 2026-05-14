import { defineConfig } from 'vite';
import tsconfigPaths from 'vite-tsconfig-paths';
import path from 'node:path';

// Vite 설정: TypeScript path alias를 자동 동기화하고, 개발/빌드/테스트 환경을 통합 정의한다.
export default defineConfig({
  plugins: [tsconfigPaths()],
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
