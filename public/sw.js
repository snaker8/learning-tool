// 설치형(크롬 앱/PWA) 요건을 충족시키기 위한 최소 서비스워커.
// 캐시를 일절 하지 않고 네트워크로 그대로 흘려보낸다 — Firebase Hosting 이
// no-cache 헤더를 쓰고 있어, 여기서 캐싱하면 배포해도 옛 화면이 남는다.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => { /* 통과 — 설치 가능 조건만 만족시킨다 */ });
