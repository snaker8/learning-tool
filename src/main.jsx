import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './lib/firebase.js' // initializes Firebase + App Check on boot
import App from './App.jsx'

// 설치형(크롬 앱/PWA) 등록. 캐시를 하지 않는 통과형 워커라 배포 즉시 반영된다.
// Electron(file://)에서는 등록하지 않는다.
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((e) => {
      console.warn('[sw] 등록 실패:', e?.message);
    });
  });
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
