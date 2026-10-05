import { getAppCheckToken } from '../lib/firebase';

/**
 * Server-side Gemini-vision proxy for per-page problem bounding boxes.
 * Returns canvas-pixel rectangles ready to use as crops.
 */
export class AiCropService {
    /**
     * @param {HTMLCanvasElement} canvas — the full page canvas (canvas pixels)
     * @param {{x:number,y:number,width:number,height:number}|null} [roi] — user ROI in canvas pixels
     * @param {{roiMode?: 'column'|'strict'}} [opts]
     *   column: ROI 를 "열 힌트"로만 쓴다 (일괄 모드 — 페이지마다 문제의 Y 위치가
     *           다르므로 X 겹침만 본다)
     *   strict: ROI 안에 실제로 들어있는 문제만 남긴다 (수동 드래그 — 사용자가
     *           이 페이지의 이 영역을 콕 집어 그린 것이다)
     * @returns {Promise<Array<{x:number,y:number,width:number,height:number,label?:string}>>}
     */
    static async detectProblems(canvas, roi = null, opts = {}) {
        const roiMode = opts.roiMode === 'strict' ? 'strict' : 'column';
        // Downsample for transmission. Bounding-box detection doesn't need
        // 3x render-scale resolution — ~1500px wide is plenty and saves
        // ~50% transfer + inference time. Boxes are normalized 0–1000, so
        // they scale back to the original canvas without extra math.
        const MAX_AI_WIDTH = 1500;
        let sendCanvas = canvas;
        if (canvas.width > MAX_AI_WIDTH) {
            const scale = MAX_AI_WIDTH / canvas.width;
            const dest = document.createElement('canvas');
            dest.width = MAX_AI_WIDTH;
            dest.height = Math.round(canvas.height * scale);
            const dctx = dest.getContext('2d');
            dctx.imageSmoothingEnabled = true;
            dctx.imageSmoothingQuality = 'high';
            dctx.drawImage(canvas, 0, 0, dest.width, dest.height);
            sendCanvas = dest;
        }
        // JPEG with high quality is much smaller than PNG for photographic-like
        // page renders and the model handles it equally well.
        const dataUrl = sendCanvas.toDataURL('image/jpeg', 0.85);
        const imageData = dataUrl.split(',')[1];
        const sendMime = 'image/jpeg';

        let roiHint = null;
        if (roi && roi.width > 0 && roi.height > 0) {
            roiHint = {
                y_min: (roi.y / canvas.height) * 1000,
                x_min: (roi.x / canvas.width) * 1000,
                y_max: ((roi.y + roi.height) / canvas.height) * 1000,
                x_max: ((roi.x + roi.width) / canvas.width) * 1000,
            };
        }

        const headers = { 'Content-Type': 'application/json' };
        headers['X-Firebase-AppCheck'] = await getAppCheckToken();

        const response = await fetch('/api/detect-problems', {
            method: 'POST',
            headers,
            body: JSON.stringify({ imageData, mimeType: sendMime, roiHint }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || `요청 실패 (${response.status})`);
        if (!Array.isArray(data.boxes)) return [];

        // Convert [y_min, x_min, y_max, x_max] (0–1000) to canvas pixels.
        const raw = data.boxes
            .filter(b => Array.isArray(b.box_2d) && b.box_2d.length === 4)
            .map(b => {
                const [yMin, xMin, yMax, xMax] = b.box_2d.map(n => Number(n));
                const x = (xMin / 1000) * canvas.width;
                const y = (yMin / 1000) * canvas.height;
                const width = ((xMax - xMin) / 1000) * canvas.width;
                const height = ((yMax - yMin) / 1000) * canvas.height;
                return { x, y, width, height, label: b.label || '' };
            });

        // 후처리 — 픽셀 분석을 쓰지 않는다.
        //
        // 예전에는 Gemini 박스를 받아 Y 를 확장한 뒤 픽셀 밝기로 콘텐츠 경계를
        // 다시 찾았다. 그 방식은 교재 레이아웃(2단/배경색 박스/난이도 배지/표)에
        // 따라 결과가 들쭉날쭉했고, 확장 창 안의 "모든 잉크"를 집어삼켜 아래 문제
        // 일부가 같이 잘려 들어왔다. 교재 종류마다 상수를 맞출 수 없는 구조였다.
        //
        // 실측(2026-10-05, 동래여중 3-1 기말 5p × 3회, 텍스트레이어 GT 대조,
        //      gemini-3.8-flash):
        //   픽셀 조임(확장 3%)        IoU 0.904 / 침범 0.75% (최대 7.2%)
        //   AI 박스 그대로            IoU 0.973 / 침범 0.03% / 단 7/60 에서 살짝 잘림
        //   AI + 여백 0.5% + 이웃클램프 IoU 0.934 / 침범 0.03% / 잘림 0/60  ← 채택
        //
        // 즉 모델이 주는 박스가 이미 정확하다. 우리가 할 일은 아주 작은 여백을
        // 주되(모델이 드물게 1~2% 짧게 주는 걸 덮는다), 그 여백이 옆/아래 문제를
        // 침범하지 않도록 이웃 박스에 막아 세우는 것뿐이다.
        const MARGIN_RATIO = 0.005;
        const mx = canvas.width * MARGIN_RATIO;
        const my = canvas.height * MARGIN_RATIO;
        const OVERLAP_MIN = 0.5;   // 이웃으로 칠 최소 겹침 비율
        const GAP = 1;             // 이웃과 띄울 최소 간격(px)

        const clamped = raw.map((r, i) => {
            let x0 = r.x - mx, y0 = r.y - my;
            let x1 = r.x + r.width + mx, y1 = r.y + r.height + my;

            // 여백이 이웃 박스를 넘지 않게 막는다.
            for (let j = 0; j < raw.length; j++) {
                if (i === j) continue;
                const o = raw[j];
                const ox1 = o.x + o.width, oy1 = o.y + o.height;
                const hOverlap = Math.min(r.x + r.width, ox1) - Math.max(r.x, o.x);
                const vOverlap = Math.min(r.y + r.height, oy1) - Math.max(r.y, o.y);
                // 같은 열(가로가 겹침) → 위/아래 이웃
                if (hOverlap > OVERLAP_MIN * Math.min(r.width, o.width)) {
                    if (oy1 <= r.y) y0 = Math.max(y0, oy1 + GAP);
                    if (o.y >= r.y + r.height) y1 = Math.min(y1, o.y - GAP);
                }
                // 같은 행(세로가 겹침) → 좌/우 이웃
                if (vOverlap > OVERLAP_MIN * Math.min(r.height, o.height)) {
                    if (ox1 <= r.x) x0 = Math.max(x0, ox1 + GAP);
                    if (o.x >= r.x + r.width) x1 = Math.min(x1, o.x - GAP);
                }
            }

            x0 = Math.max(0, x0); y0 = Math.max(0, y0);
            x1 = Math.min(canvas.width, x1); y1 = Math.min(canvas.height, y1);
            return { ...r, x: x0, y: y0, width: Math.max(1, x1 - x0), height: Math.max(1, y1 - y0) };
        });

        const validated = clamped.filter(r => AiCropService._isValidBox(r, canvas));
        // ROI is interpreted as a COLUMN/X-band hint only. Y position varies
        // page to page (problem 09 might be top on page 1, middle on page 3),
        // so filtering by Y from the user's first-page ROI would drop valid
        // problems. We keep boxes whose X range overlaps the ROI's X range.
        const filtered = !roi
            ? validated
            : roiMode === 'strict'
                ? validated.filter(r => AiCropService._insideRoi(r, roi))
                : validated.filter(r => AiCropService._xOverlap(r, roi));
        const deduped = AiCropService._removeOverlaps(filtered);

        if (raw.length !== deduped.length) {
            console.info('[ai-crop] filtered', {
                raw: raw.length,
                validated: validated.length,
                roiFiltered: filtered.length,
                final: deduped.length,
            });
        }

        // Sort: column-major (left→right), then top→bottom inside each column.
        deduped.sort((a, b) => {
            const halfW = canvas.width / 2;
            const colA = a.x + a.width / 2 < halfW ? 0 : 1;
            const colB = b.x + b.width / 2 < halfW ? 0 : 1;
            if (colA !== colB) return colA - colB;
            return a.y - b.y;
        });

        return deduped;
    }

    static _isValidBox(r, canvas) {
        if (!Number.isFinite(r.x) || !Number.isFinite(r.y)) return false;
        if (!Number.isFinite(r.width) || !Number.isFinite(r.height)) return false;
        if (r.width < 20 || r.height < 20) return false;
        // Aspect ratio sanity (extreme slivers).
        const ratio = r.width / r.height;
        if (ratio < 0.05 || ratio > 30) return false;
        // Boundary checks happen after clamp, so just need rect inside canvas.
        if (r.x < -1 || r.y < -1) return false;
        if (r.x + r.width > canvas.width + 2) return false;
        if (r.y + r.height > canvas.height + 2) return false;
        return true;
    }

    /**
     * 박스가 사용자가 그린 영역 안에 "들어있다"고 볼 수 있는가.
     * 면적의 55% 이상이 ROI 안에 있거나, 박스 중심이 ROI 안에 있으면 채택.
     * (사용자가 문제 경계를 딱 맞춰 그리지 않으므로 양쪽 조건을 둔다)
     */
    static _insideRoi(box, roi) {
        const ix = Math.max(box.x, roi.x);
        const iy = Math.max(box.y, roi.y);
        const ax = Math.min(box.x + box.width, roi.x + roi.width);
        const ay = Math.min(box.y + box.height, roi.y + roi.height);
        const iw = Math.max(0, ax - ix);
        const ih = Math.max(0, ay - iy);
        if (iw === 0 || ih === 0) return false;
        const ratio = (iw * ih) / (box.width * box.height);
        if (ratio >= 0.55) return true;
        const cx = box.x + box.width / 2;
        const cy = box.y + box.height / 2;
        return cx >= roi.x && cx <= roi.x + roi.width && cy >= roi.y && cy <= roi.y + roi.height;
    }

    /** Box's X range overlaps ROI's X range by ≥ 20% of box width. */
    static _xOverlap(box, roi) {
        const ix = Math.max(box.x, roi.x);
        const ax = Math.min(box.x + box.width, roi.x + roi.width);
        const iw = Math.max(0, ax - ix);
        if (iw === 0) return false;
        return iw / box.width >= 0.2;
    }

    /**
     * Merge boxes that significantly overlap (treats it as Gemini double-detection).
     * Two boxes merge if intersection-over-min-area > 0.4.
     */
    static _removeOverlaps(rects) {
        if (rects.length < 2) return rects;
        const sorted = [...rects].sort((a, b) => a.y - b.y);
        const out = [];
        for (const r of sorted) {
            let mergedWith = -1;
            for (let i = 0; i < out.length; i++) {
                const o = out[i];
                const ix = Math.max(r.x, o.x);
                const iy = Math.max(r.y, o.y);
                const ax = Math.min(r.x + r.width, o.x + o.width);
                const ay = Math.min(r.y + r.height, o.y + o.height);
                const iw = Math.max(0, ax - ix);
                const ih = Math.max(0, ay - iy);
                if (iw === 0 || ih === 0) continue;
                const interArea = iw * ih;
                const minArea = Math.min(r.width * r.height, o.width * o.height);
                if (interArea / minArea > 0.4) {
                    mergedWith = i;
                    break;
                }
            }
            if (mergedWith >= 0) {
                const o = out[mergedWith];
                const x1 = Math.min(o.x, r.x);
                const y1 = Math.min(o.y, r.y);
                const x2 = Math.max(o.x + o.width, r.x + r.width);
                const y2 = Math.max(o.y + o.height, r.y + r.height);
                out[mergedWith] = {
                    x: x1, y: y1, width: x2 - x1, height: y2 - y1,
                    label: o.label || r.label || '',
                };
            } else {
                out.push({ ...r });
            }
        }
        return out;
    }
}
