import { onRequest } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { setGlobalOptions } from 'firebase-functions/v2';
import { initializeApp, getApps } from 'firebase-admin/app';
import { getAppCheck } from 'firebase-admin/app-check';

// Initialize admin SDK once per cold start.
if (getApps().length === 0) initializeApp();

// Server-side secret — never exposed to clients.
const GEMINI_API_KEY = defineSecret('GEMINI_API_KEY');

setGlobalOptions({
    region: 'asia-northeast3', // Seoul
    maxInstances: 2,           // hard cap to limit blast radius from abuse
    timeoutSeconds: 120,
    memory: '512MiB',
});

// Production origins ONLY. Dev (localhost) origins are intentionally not
// included so an attacker cannot bypass the check by spoofing
// `Origin: http://localhost:5173`. For local dev, use the Functions emulator.
const ALLOWED_ORIGINS = new Set([
    'https://learning-tool-studio.web.app',
    'https://learning-tool-studio.firebaseapp.com',
]);

function applyCors(req, res) {
    const origin = req.get('origin');
    if (origin && ALLOWED_ORIGINS.has(origin)) {
        res.set('Access-Control-Allow-Origin', origin);
        res.set('Vary', 'Origin');
    }
    res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type, X-Firebase-AppCheck');
    res.set('Access-Control-Max-Age', '3600');
}

const SYSTEM_PROMPT = `이 이미지에서 정답표(정답지)를 찾아서 텍스트로 추출해줘. 문제 번호와 정답을 각 줄에 하나씩 나열해. 형식은 '문제번호. 정답' (예: 1. ①, 2. 5, 3. -1, 4. 1/2, 5. 해설참조) 형태로 해줘.

[중요 원칙]
1. 객관식 정답이 원문자(①, ②, ③, ④, ⑤)로 되어 있다면 반드시 해당 특수문자를 그대로 사용해. 절대 (1)이나 1로 바꾸지 마.
2. '해설참조', '별도첨부' 같이 텍스트로 된 정답도 절대 생략하지 말고 그대로 적어.
3. 수식은 LaTeX 포맷($...$)을 절대 쓰지 마. 대신 유니코드 기호(√, ³, ², /, π 등)를 사용하여 사람이 바로 읽을 수 있는 텍스트로 변환해.
4. 불필요한 말(인사, 설명)은 생략하고 데이터만 줘.`;

const MAX_INLINE_BYTES = 8 * 1024 * 1024; // 8MB cap on the base64 payload

const ALLOWED_MIME = new Set(['image/png', 'image/jpeg', 'image/webp', 'application/pdf']);

export const extractAnswers = onRequest({
    secrets: [GEMINI_API_KEY],
    invoker: 'public',
}, async (req, res) => {
    applyCors(req, res);

    if (req.method === 'OPTIONS') {
        res.status(204).end();
        return;
    }

    if (req.method !== 'POST') {
        res.status(405).json({ error: 'Method not allowed' });
        return;
    }

    // Defense layer 1 — origin allowlist (cheap, blocks naive curl/Postman).
    const origin = req.get('origin');
    if (!origin || !ALLOWED_ORIGINS.has(origin)) {
        res.status(403).json({ error: 'Forbidden' });
        return;
    }

    // Defense layer 2 — App Check token verification.
    // Manually verifying here (instead of relying on the runtime
    // `enforceAppCheck` option) because the latter doesn't reliably block
    // unauthenticated requests for onRequest in firebase-functions v7.
    const appCheckToken = req.get('X-Firebase-AppCheck');
    if (!appCheckToken) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
    }
    try {
        // Local JWT signature/issuer/audience verification only.
        // Replay protection (consume:true) requires the
        // `roles/firebaseappcheck.tokenVerifier` role on this service account
        // and is not yet enabled — origin allowlist + 1h token TTL already
        // limit replay risk.
        await getAppCheck().verifyToken(appCheckToken);
    } catch (err) {
        console.warn('App Check verification failed', err?.code || err?.message);
        res.status(401).json({ error: 'Unauthorized' });
        return;
    }

    try {
        const { imageData, mimeType } = req.body || {};
        if (!imageData || typeof imageData !== 'string') {
            res.status(400).json({ error: '잘못된 요청입니다.' });
            return;
        }
        if (!mimeType || typeof mimeType !== 'string') {
            res.status(400).json({ error: '잘못된 요청입니다.' });
            return;
        }
        if (imageData.length > MAX_INLINE_BYTES * 1.4) {
            res.status(413).json({ error: '파일이 너무 큽니다 (8MB 이하).' });
            return;
        }
        if (!ALLOWED_MIME.has(mimeType)) {
            res.status(400).json({ error: '지원하지 않는 형식입니다.' });
            return;
        }

        const apiKey = GEMINI_API_KEY.value();
        if (!apiKey) {
            console.error('GEMINI_API_KEY secret is not set');
            res.status(500).json({ error: '서버 설정 오류입니다.' });
            return;
        }

        const payload = {
            contents: [{
                parts: [
                    { text: SYSTEM_PROMPT },
                    { inlineData: { data: imageData, mimeType } },
                ],
            }],
        };

        const upstream = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            }
        );

        const data = await upstream.json().catch(() => ({}));

        if (!upstream.ok) {
            // Log full upstream error server-side, return generic message client-side.
            console.error('Gemini upstream error', {
                status: upstream.status,
                error: data?.error,
            });
            const safeMsg = upstream.status === 429
                ? '잠시 후 다시 시도해주세요.'
                : upstream.status >= 500
                    ? '일시적으로 분석 서비스를 이용할 수 없습니다.'
                    : '분석 요청에 실패했습니다.';
            res.status(upstream.status >= 500 ? 502 : 400).json({ error: safeMsg });
            return;
        }

        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!text) {
            res.status(502).json({ error: '분석 결과가 없습니다.' });
            return;
        }

        res.status(200).json({ text });
    } catch (err) {
        console.error('extractAnswers error', err);
        res.status(500).json({ error: '서버 오류가 발생했습니다.' });
    }
});
