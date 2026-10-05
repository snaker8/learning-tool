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
    memory: '1GiB',
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

[혼동 케이스]
- ㄴ 과 ②(원문자 2)는 시각적으로 비슷. 원문자 숫자(①②③) 모양인지, 한글 자음(ㄱㄴㄷ) 모양인지 먼저 판별 후 표기.
- 보기 옵션이 한 곳이라도 ㄱ/ㄴ/ㄷ 형태로 보이면 해당 문항은 한글 보기 시험 → 동그라미 친 글자도 한글로 읽어라.

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

const DETECTION_PROMPT = `한국 수학·과학 시험지/문제집 페이지 이미지에서 **모든 번호 매겨진 문제**를 검출하라.

[작업 목표 — 가장 중요]
페이지에서 "번호가 붙은 문제"를 **빠짐없이** 찾아라. 페이지에 N개의 문제가 있으면 정확히 N개의 박스를 반환하라.

[문제(problem) 1개의 정의]
하나의 박스는 다음을 모두 포함하는 단위다:
- 문제 번호 (예: "01", "1.", "1)", "[1]", "①") — 박스 좌상단
- 발문(질문 본문) — 여러 줄에 걸친 텍스트, "구하시오" 같은 동사 포함
- 부속 그림/그래프/도표 (있을 때만)
- 보기/선택지 ① ② ③ ④ ⑤ 또는 ㄱ ㄴ ㄷ ㄹ ㅁ (있을 때만, 단답형은 보기 없음)
- 빈칸·답란 (단답형일 때)

★ 보기가 **없는 단답형 문제**(예: "값을 구하시오." 로 끝남)도 반드시 검출 대상이다. 보기 유무로 누락하지 말 것.
★ 발문, 그림, 보기는 **반드시 같은 박스 안에 함께** 들어간다. 발문만 잡고 보기를 빼면 안 된다.
★ 다음 문제의 번호가 시각적으로 나타나면 거기서 현재 박스가 끝난다.

[규칙]
1. 한 문제 = 정확히 한 박스. 쪼개거나 묶지 말 것.
2. 박스끼리 절대 겹치지 말 것. 인접 문제 사이 최소 2px 간격.
3. 박스는 문제 콘텐츠를 꽉 차게 감싸기. 큰 빈 여백 포함 금지(1~2% 패딩 OK).
4. **누락 금지**: 페이지에 보이는 번호 매겨진 모든 문제를 빠짐없이 박스로 반환. 큰 빈 공간이 있어도 그 위·아래 문제 둘 다 잡아라.
5. **검출 제외** (이건 박스 만들지 말 것):
   - 시험지 헤더(과목명, 단원명, 시험명)
   - 이름란, 학번란, 날짜란
   - 페이지 번호, 하단 푸터, 출처 표기
   - 표제만 있는 줄("빠른정답", "정답 및 해설" 등)
6. 레이아웃 순서: 1단=위→아래, 2단=왼쪽 컬럼 전체 위→아래 → 오른쪽 컬럼 위→아래.
7. label: 인쇄된 번호 그대로 (예: "09", "10", "12-3").

[ROI 힌트 — 약한 우선순위]
사용자가 관심 있는 세로 범위가 입력에 같이 주어질 수 있다. 이건 **참고용 힌트**일 뿐, 페이지의 모든 문제를 일단 모두 검출하고 반환하라. 필터링은 클라이언트가 한다.

[좌표]
- box_2d: [y_min, x_min, y_max, x_max], 0~1000 정수, 이미지 왼쪽 위=[0,0], 오른쪽 아래=[1000,1000].
- 폭<30 또는 높이<30 박스 반환 금지.

[출력]
JSON 배열만. 코드블록·설명·머리말 일체 금지.
예시: [{"box_2d":[120,40,310,490],"label":"1"},{"box_2d":[330,40,540,490],"label":"2"}]`;

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
        // consume:true 시도 → 재사용 차단. 권한 없으면 로컬 검증으로 폴백.
        try {
            await getAppCheck().verifyToken(appCheckToken, { consume: true });
        } catch (err) {
            if (err?.code === 'app-check/permission-denied') {
                await getAppCheck().verifyToken(appCheckToken);
            } else {
                throw err;
            }
        }
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
            generationConfig: {
                temperature: 0,
            },
        };

        const upstream = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${apiKey}`,
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

/**
 * Shared request gate — CORS preflight, method, origin, App Check.
 * Returns true if the request is allowed to proceed; otherwise writes the
 * response and returns false.
 */
async function gateRequest(req, res) {
    applyCors(req, res);

    if (req.method === 'OPTIONS') { res.status(204).end(); return false; }
    if (req.method !== 'POST')   { res.status(405).json({ error: 'Method not allowed' }); return false; }

    const origin = req.get('origin');
    if (!origin || !ALLOWED_ORIGINS.has(origin)) {
        res.status(403).json({ error: 'Forbidden' });
        return false;
    }

    const appCheckToken = req.get('X-Firebase-AppCheck');
    if (!appCheckToken) { res.status(401).json({ error: 'Unauthorized' }); return false; }
    try {
        // consume:true 시도 → 토큰 재사용(replay) 차단. 서비스 계정에
        // roles/firebaseappcheck.tokenVerifier 가 없으면 permission-denied
        // 가 떨어지므로 로컬 검증으로 폴백.
        try {
            await getAppCheck().verifyToken(appCheckToken, { consume: true });
        } catch (err) {
            if (err?.code === 'app-check/permission-denied') {
                await getAppCheck().verifyToken(appCheckToken);
            } else {
                throw err;
            }
        }
    } catch (err) {
        console.warn('App Check verification failed', err?.code || err?.message);
        res.status(401).json({ error: 'Unauthorized' });
        return false;
    }
    return true;
}

/**
 * Detects bounding boxes around each problem on a page image.
 * Used by the "AI 자동 인식" toggle in the maker tab.
 */
export const detectProblems = onRequest({
    secrets: [GEMINI_API_KEY],
    invoker: 'public',
}, async (req, res) => {
    if (!(await gateRequest(req, res))) return;

    try {
        const { imageData, mimeType, roiHint } = req.body || {};
        if (!imageData || typeof imageData !== 'string') {
            res.status(400).json({ error: '잘못된 요청입니다.' });
            return;
        }
        if (!mimeType || !ALLOWED_MIME.has(mimeType)) {
            res.status(400).json({ error: '지원하지 않는 형식입니다.' });
            return;
        }
        if (imageData.length > MAX_INLINE_BYTES * 1.4) {
            res.status(413).json({ error: '파일이 너무 큽니다 (8MB 이하).' });
            return;
        }

        const apiKey = GEMINI_API_KEY.value();
        if (!apiKey) {
            console.error('GEMINI_API_KEY secret is not set');
            res.status(500).json({ error: '서버 설정 오류입니다.' });
            return;
        }

        // roiHint: { y_min, x_min, y_max, x_max } each 0-1000.
        // Advisory only — Gemini still detects ALL problems on the page; the
        // client filters by ROI intersection.
        let userText = DETECTION_PROMPT;
        if (roiHint
            && Number.isFinite(roiHint.y_min)
            && Number.isFinite(roiHint.y_max)
            && Number.isFinite(roiHint.x_min)
            && Number.isFinite(roiHint.x_max)) {
            userText += `\n\n[참고용 사용자 ROI]\n[y_min=${Math.round(roiHint.y_min)}, x_min=${Math.round(roiHint.x_min)}, y_max=${Math.round(roiHint.y_max)}, x_max=${Math.round(roiHint.x_max)}]. 참고만 하고, 페이지의 모든 문제를 빠짐없이 검출하라.`;
        }

        const payload = {
            contents: [{
                parts: [
                    { text: userText },
                    { inlineData: { data: imageData, mimeType } },
                ],
            }],
            generationConfig: {
                responseMimeType: 'application/json',
                temperature: 0.1,
                responseSchema: {
                    type: 'ARRAY',
                    items: {
                        type: 'OBJECT',
                        properties: {
                            box_2d: {
                                type: 'ARRAY',
                                items: { type: 'INTEGER' },
                                minItems: 4,
                                maxItems: 4,
                            },
                            label: { type: 'STRING' },
                        },
                        required: ['box_2d'],
                    },
                },
            },
        };

        const upstream = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent?key=${apiKey}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            }
        );

        const data = await upstream.json().catch(() => ({}));
        if (!upstream.ok) {
            console.error('Gemini detect-problems error', {
                status: upstream.status,
                error: data?.error,
            });
            const safeMsg = upstream.status === 429
                ? '잠시 후 다시 시도해주세요.'
                : upstream.status >= 500
                    ? '일시적으로 분석 서비스를 이용할 수 없습니다.'
                    : '검출 요청에 실패했습니다.';
            res.status(upstream.status >= 500 ? 502 : 400).json({ error: safeMsg });
            return;
        }

        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!text) {
            res.status(502).json({ error: '검출 결과가 없습니다.' });
            return;
        }

        let boxes;
        try { boxes = JSON.parse(text); }
        catch (err) {
            console.error('JSON parse failed', err?.message, text.slice(0, 300));
            res.status(502).json({ error: '검출 결과 파싱 실패.' });
            return;
        }

        if (!Array.isArray(boxes)) {
            res.status(502).json({ error: '잘못된 응답 형식입니다.' });
            return;
        }

        res.status(200).json({ boxes });
    } catch (err) {
        console.error('detectProblems error', err);
        res.status(500).json({ error: '서버 오류가 발생했습니다.' });
    }
});
