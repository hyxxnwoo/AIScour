# 배포 가이드

AIScour(Bridge Scour 3D Dashboard)는 **백엔드 없이 동작하는 정적 SPA**입니다.

- 시뮬레이션 데이터가 없으면 브라우저에서 합성 데이터로 자동 폴백합니다.
- CSV는 사용자 PC에서 직접 업로드·파싱합니다.
- Postgres, Redis, API 서버가 **없어도** 대시보드 전체가 동작합니다.

따라서 운영 배포는 `npm run build` **→** `dist/`**를 nginx로 서빙**하면 됩니다.

---

## 1. 사전 요구사항


| 구분     | 항목                                           |
| ------ | -------------------------------------------- |
| 로컬(빌드) | Node.js 20+, npm 10+                         |
| VM(서빙) | nginx 설치, SSH 접속, sudo 권한                    |
| VM OS  | Rocky / RHEL 계열 기준 (SELinux·firewalld 아래 참고) |


---

## 2. 전체 흐름

```
[로컬 Windows]                    [Rocky VM]
npm run build  ──scp──▶  /var/www/aiscour/current/
     │                         │
     ▼                         ▼
  dist/ 폴더              nginx :8080 (전용 포트)
                               │
                               ▼
                        http://<VM_IP>:8080/
```

1. 로컬에서 프로덕션 빌드
2. `dist/` 내용을 VM에 업로드
3. nginx server 블록으로 정적 파일 서빙
4. 방화벽·SELinux에서 포트 개방

---



## 3. 로컬에서 빌드

```powershell
cd D:\13.연구과제\AIScour
npm install
npm run build
```

빌드 결과는 `dist/` 폴더에 생성됩니다.

로컬에서 미리 확인하려면:

```powershell
npm run preview
# http://localhost:4173 접속
```



### 빌드 전 권장 설정

외부 공개 시 `vite.config.ts`에서 source map을 끄는 것을 권장합니다.

```ts
build: {
  sourcemap: false,  // true 이면 TypeScript 원본이 dist/에 함께 노출됨
}
```

`public/data/sample_head.csv`(약 5.8MB)는 코드에서 참조하지 않습니다. 배포에 포함할 필요가 없으면 빌드 후 `dist/data/sample_head.csv`를 삭제하거나, `public/data/`에서 제거하세요. `sampledata.csv`(약 11KB)는 데모·테스트용으로 유지해도 됩니다.

---



## 4. VM 초기 설정 (1회만)



### 4.1 디렉터리 생성

VM에 SSH 접속 후:

```bash
sudo mkdir -p /var/www/aiscour/releases
sudo chown -R $USER:$USER /var/www/aiscour
```

배포 파일은 `/var/www/aiscour/current/`를 nginx root로 사용합니다.

### 4.2 nginx 설정

`/etc/nginx/conf.d/aiscour.conf` 파일을 생성합니다.

```nginx
server {
    listen 8080;                    # 사용할 포트 (아래 방화벽·SELinux와 동일하게)
    server_name _;

    root /var/www/aiscour/current;
    index index.html;

    # 보안 헤더
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    # 헬스체크
    location = /healthz {
        access_log off;
        return 200 "ok\n";
    }

    # Vite 빌드 자산 (해시 파일명 → 장기 캐시)
    location /assets/ {
        expires 1y;
        add_header Cache-Control "public, immutable";
        try_files $uri =404;
    }

    # public/data/ → dist/data/ (샘플 CSV 등)
    location /data/ {
        autoindex off;
        add_header Cache-Control "public, max-age=300";
        try_files $uri =404;
    }

    # SPA: 나머지 경로는 index.html 로
    location / {
        try_files $uri $uri/ /index.html;
    }

    location ~ /\. {
        deny all;
    }
}
```

설정 적용:

```bash
sudo nginx -t
sudo systemctl reload nginx
```

> **기존 nginx와 공존**: 80/443은 다른 프로젝트가 쓰고 있어도 됩니다. 이 대시보드는 **전용 포트(예: 8080)** 로만 listen 하면 충돌하지 않습니다.



### 4.3 gzip (선택, 권장)

`/etc/nginx/nginx.conf`의 `http { }` 블록에 gzip이 꺼져 있으면 추가합니다. Three.js 번들 전송량을 줄입니다.

```nginx
gzip on;
gzip_vary on;
gzip_min_length 1024;
gzip_types text/css application/javascript application/json image/svg+xml;
```



### 4.4 firewalld (Rocky)

```bash
sudo firewall-cmd --permanent --add-port=8080/tcp
sudo firewall-cmd --reload
```

클라우드 VM이면 **보안 그룹/네트워크 ACL**에서도 같은 포트를 인바운드 허용해야 합니다.

### 4.5 SELinux (Rocky/RHEL)

SELinux가 Enforcing 이면 아래가 필요합니다.

```bash
sudo dnf install -y policycoreutils-python-utils

# 정적 파일 경로 라벨
sudo semanage fcontext -a -t httpd_sys_content_t "/var/www/aiscour(/.*)?"
sudo restorecon -Rv /var/www/aiscour

# 8080 은 nginx 기본 http_port_t 가 아님 → 포트 등록
sudo semanage port -a -t http_port_t -p tcp 8080
```

포트를 **8008, 8009, 9000** 중 하나로 쓰면 `semanage port` 단계를 생략할 수 있습니다(이 포트들은 SELinux 기본 허용).

---



## 5. 배포 (매번)



### 방법 A — scp로 dist 업로드 (가장 단순)

**로컬(Windows PowerShell):**

```powershell
# dist 내용을 VM에 직접 복사
scp -r dist/* user@<VM_IP>:/var/www/aiscour/current/
```

**VM에서 SELinux 라벨 재적용 (필요 시):**

```bash
restorecon -Rv /var/www/aiscour
sudo nginx -t && sudo systemctl reload nginx
```



### 방법 B — tar로 한 번에 업로드

**로컬:**

```powershell
cd dist
tar -czf ..\aiscour-dist.tar.gz .
scp ..\aiscour-dist.tar.gz user@<VM_IP>:/tmp/
```

**VM:**

```bash
mkdir -p /var/www/aiscour/current
tar -xzf /tmp/aiscour-dist.tar.gz -C /var/www/aiscour/current
restorecon -Rv /var/www/aiscour
sudo nginx -t && sudo systemctl reload nginx
rm /tmp/aiscour-dist.tar.gz
```



### 방법 C — 릴리스 디렉터리 + 심볼릭 링크 (롤백 용이)

문제 발생 시 이전 버전으로 즉시 되돌릴 수 있습니다.

```bash
# VM — 최초 1회 current 링크 준비
mkdir -p /var/www/aiscour/releases

# 배포마다 (VM에서)
TS=20260803-120000   # 타임스탬프
mkdir -p /var/www/aiscour/releases/$TS
tar -xzf /tmp/aiscour-dist.tar.gz -C /var/www/aiscour/releases/$TS
ln -sfn /var/www/aiscour/releases/$TS /var/www/aiscour/current
restorecon -Rv /var/www/aiscour
sudo nginx -t && sudo systemctl reload nginx
```

롤백:

```bash
ln -sfn /var/www/aiscour/releases/<이전-타임스탬프> /var/www/aiscour/current
sudo systemctl reload nginx
```

---



## 6. 배포 확인

```bash
curl -I http://<VM_IP>:8080/healthz   # HTTP/1.1 200
curl -I http://<VM_IP>:8080/         # HTTP/1.1 200, index.html
```

브라우저에서 `http://<VM_IP>:8080/` 접속 후 확인:

- [ ] 3D 씬(WebGL) 렌더링
- [ ] 좌/우 패널 UI 표시
- [ ] CSV 업로드 동작
- [ ] DevTools Network 탭에 404 없음

---



## 7. 트러블슈팅


| 증상             | 원인 / 해결                                                             |
| -------------- | ------------------------------------------------------------------- |
| 연결 자체가 안 됨     | firewalld, 클라우드 보안 그룹, VM 방화벽에서 포트 개방 확인                            |
| 403 Forbidden  | SELinux: `restorecon -Rv /var/www/aiscour` 실행                       |
| 502 / nginx 거부 | `sudo nginx -t` 로 설정 문법 확인, `error.log` 확인                          |
| 빈 화면 / JS 404  | `root` 경로가 `/var/www/aiscour/current` 인지, `dist/` 내용이 올바르게 올라갔는지 확인 |
| 새로고침 시 404     | SPA 폴백 누락 → `try_files $uri $uri/ /index.html;` 추가                  |
| Three.js 느림    | nginx gzip 설정 확인                                                    |


로그 확인:

```bash
sudo tail -f /var/log/nginx/error.log
sudo tail -f /var/log/nginx/access.log
```

---



## 8. HTTPS (향후)

현재 가이드는 `http://IP:포트` 기준입니다. 도메인이 생기면:

- **certbot** + Let's Encrypt
- 기존 nginx 443 reverse proxy에서 TLS 종단 후 내부 8080으로 프록시

중 하나를 선택하면 됩니다.

---



## 9. 참고 — Docker Compose는?

저장소에 `docker-compose.yml`, `docker/backend.Dockerfile` 등이 있으나, **백엔드 코드가 아직 없어** 현재 compose 스택은 그대로 사용할 수 없습니다.

이 프로젝트의 **현재 권장 배포 방식**은 위 VM + nginx 정적 서빙입니다.

---



## 10. 로컬 개발 (참고)

```bash
npm install
npm run dev
# http://localhost:5174 (vite.config.ts 기준)
```


| 명령                | 설명            |
| ----------------- | ------------- |
| `npm run dev`     | Vite 개발 서버    |
| `npm run build`   | 프로덕션 빌드       |
| `npm run preview` | 빌드 결과 로컬 미리보기 |
| `npm run test`    | 단위 테스트        |


