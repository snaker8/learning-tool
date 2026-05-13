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

const SYSTEM_PROMPT = `한국 시험 정답표 이미지에서 정답만 정확히 추출. 각 줄에 '문제번호. 정답' 한 짝.

[1단계 — 정답을 먼저 분류해라]
정답을 보기 전에 다음 중 무엇인지부터 판별:
(A) 그냥 한글 자음 1글자 (ㄱ/ㄴ/ㄷ/ㄹ/ㅁ/ㅂ/ㅅ) — 가능 시 가장 흔함
(B) 자음 위/주변에 손으로 그린 동그라미 — 여전히 자음. 동그라미는 강조 표시일 뿐
(C) 원문자 숫자 ①②③④⑤⑥⑦⑧⑨ (유니코드, 정자 모양 원 + 안에 숫자)
(D) 원문자 한글 ㉠㉡㉢㉣㉤ (유니코드, 정자 모양 원 + 안에 한글)
(E) 그냥 숫자/분수/문자열

[2단계 — 표기 규칙 (절대 위반 금지)]
(A)·(B) → ㄱ/ㄴ/ㄷ/ㄹ/ㅁ/ㅂ 한글 그대로. 절대 ①/②/③ 또는 1/2/3 으로 바꾸지 말 것.
(C) → ①②③④⑤ 그 특수문자 그대로. 절대 1/2/3 으로 바꾸지 말 것.
(D) → ㉠㉡㉢㉣㉤ 그 특수문자 그대로. 절대 ①②③ 또는 ㄱ/ㄴ/ㄷ 로 바꾸지 말 것.
(E) → 원본 그대로. 분수는 1/2 또는 ½, 수식은 유니코드(√, ³, π 등). LaTeX($...$) 절대 금지.

[혼동 케이스 ★ 매우 중요]
한국 시험에서 자주: 손글씨로 ㄴ에 동그라미. 시각적으로 ②(원문자 2)와 비슷.
판별 기준:
- ㄴ은 "ㅡ" 위에 "ㅣ"가 꺾인 모양 (왼쪽 위 모서리가 직각, 오른쪽 위는 트여있음)
- 숫자 2는 곡선으로 시작해 직선으로 내려옴
- 원이 손으로 그렸고 안의 글자가 직각·꺾임 형태면 한글 자음. 곡선 위주면 숫자.
보기 옵션이 한 곳이라도 ㄱ/ㄴ/ㄷ 형태로 보이면 해당 문항은 한글 보기 시험이다 → 동그라미 친 글자도 한글로 읽어라.

[복수 정답]
콤마로 구분: "ㄱ,ㄷ" / "①,③" / "1,3"

[텍스트 정답]
"해설참조", "별도첨부", "정답 없음" 같은 표현은 그대로 유지.

[출력 형식]
- 인사·설명·머리말 0. 데이터 줄만.
- 예시:
  1. ②
  2. ㄴ
  3. ㉡
  4. 1/2
  5. 해설참조
  6. ㄱ,ㄷ
- 정답표 표 구조: 왼쪽=문제번호, 오른쪽=정답. 헷갈리지 말 것.`;

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
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent?key=${apiKey}`,
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
