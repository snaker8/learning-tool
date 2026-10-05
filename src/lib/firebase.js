import { initializeApp } from 'firebase/app';
import {
    initializeAppCheck,
    ReCaptchaEnterpriseProvider,
    getToken,
} from 'firebase/app-check';

const firebaseConfig = {
    apiKey: 'AIzaSyCVXsLGJLSMt64_2jh2qq8sQSJRSKnxWH0',
    authDomain: 'learning-tool-studio.firebaseapp.com',
    projectId: 'learning-tool-studio',
    storageBucket: 'learning-tool-studio.firebasestorage.app',
    messagingSenderId: '623000875727',
    appId: '1:623000875727:web:00e547ada9d81cf10ffdba',
};

const RECAPTCHA_SITE_KEY = '6Ldx1tMsAAAAADTSxSKFHp2R1FWdNXwT3hLJqa9r';

export const firebaseApp = initializeApp(firebaseConfig);

// App Check 는 **lazy init**: 처음 토큰 요청이 들어올 때만 초기화한다.
// 이전엔 모듈 로드 시 즉시 init + isTokenAutoRefreshEnabled:true 로 인해
// reCAPTCHA Enterprise iframe 이 백그라운드에서 계속 돌면서 메인 스레드를
// 점유 → OS file picker 가 "응답 없음" 으로 freeze 되는 증상이 있었음.
// 답 추출 / 일괄 AI 인식 을 안 쓰는 사용자에겐 reCAPTCHA 가 아예 안 로드된다.
let appCheckInstance = null;
let appCheckInitError = null;
let initPromise = null;

function ensureAppCheck() {
    if (appCheckInstance || appCheckInitError) return;
    if (initPromise) return initPromise;
    initPromise = (async () => {
        try {
            appCheckInstance = initializeAppCheck(firebaseApp, {
                provider: new ReCaptchaEnterpriseProvider(RECAPTCHA_SITE_KEY),
                // 자동 갱신 OFF — 토큰 만료 직전에 또 발급받지 않게.
                // getToken 호출 시점에만 발급/갱신된다. 메인 스레드 부하 감소.
                isTokenAutoRefreshEnabled: false,
            });
        } catch (err) {
            appCheckInitError = err;
            console.error('[AppCheck] init failed:', err);
        }
    })();
    return initPromise;
}

/** Returns a fresh App Check token, throwing a clear error on failure. */
export async function getAppCheckToken() {
    await ensureAppCheck();
    if (!appCheckInstance) {
        throw new Error(
            appCheckInitError
                ? `보안 토큰 발급기 초기화 실패: ${appCheckInitError?.code || appCheckInitError?.message || 'unknown'}`
                : '보안 토큰 발급기가 준비되지 않았습니다.'
        );
    }
    try {
        const result = await getToken(appCheckInstance, /* forceRefresh */ false);
        if (!result?.token) throw new Error('빈 토큰');
        return result.token;
    } catch (err) {
        console.error('[AppCheck] getToken failed:', err);
        throw new Error(`보안 토큰 발급 실패: ${err?.code || err?.message || 'unknown'}`);
    }
}
