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

let appCheckInstance = null;
let appCheckInitError = null;

try {
    appCheckInstance = initializeAppCheck(firebaseApp, {
        provider: new ReCaptchaEnterpriseProvider(RECAPTCHA_SITE_KEY),
        isTokenAutoRefreshEnabled: true,
    });
    console.info('[AppCheck] initialized');
} catch (err) {
    appCheckInitError = err;
    console.error('[AppCheck] init failed:', err);
}

/** Returns a fresh App Check token, throwing a clear error on failure. */
export async function getAppCheckToken() {
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
