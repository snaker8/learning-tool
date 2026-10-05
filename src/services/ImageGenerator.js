export class ImageGenerator {
    /**
     * 크롭 1개당 만들어지는 비트맵을 통제한다.
     *
     * 이전에는 PDF 렌더 해상도(기본 3배율) 그대로 PNG 를 만들었다. 한 문제가
     * 1,800×2,700px 이면 디코드된 비트맵만 19MB 고, 사이드바 목록이 그걸 그대로
     * 띄우니 크롭 10개에 수백 MB 가 나갔다 (2026-10-06 크롬 먹통 원인 중 하나).
     *
     * - 본 이미지: 가로 MAX_WIDTH 로 상한. 클래스인에 붙이는 용도로 충분하고,
     *   '개별 복사 설정'의 기본 복사 폭(1200px)보다 넉넉하다.
     * - 썸네일: 사이드바 목록 전용. 목록은 400px 폭이라 그 이상은 낭비다.
     */
    static MAX_WIDTH = 1600;
    static THUMB_WIDTH = 400;

    /**
     * @param {HTMLCanvasElement} sourceCanvas - 페이지 캔버스
     * @param {{x,y,width,height}} rect - 논리 좌표(렌더 배율로 나눈 값)
     * @param {number} scale - sourceCanvas 의 렌더 배율
     * @returns {Promise<{imageUrl: string|null, thumbUrl: string|null}>}
     */
    static async generateCrop(sourceCanvas, rect, scale = 1.5) {
        if (!sourceCanvas) return { imageUrl: null, thumbUrl: null };

        const sx = rect.x * scale;
        const sy = rect.y * scale;
        const sw = rect.width * scale;
        const sh = rect.height * scale;
        if (!(sw > 0 && sh > 0)) return { imageUrl: null, thumbUrl: null };

        const draw = (targetW, type, quality) => new Promise((resolve) => {
            const w = Math.max(1, Math.round(Math.min(targetW, sw)));
            const h = Math.max(1, Math.round(sh * (w / sw)));
            const c = document.createElement('canvas');
            c.width = w;
            c.height = h;
            const ctx = c.getContext('2d');
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';
            ctx.drawImage(sourceCanvas, sx, sy, sw, sh, 0, 0, w, h);
            c.toBlob((blob) => {
                resolve(blob ? URL.createObjectURL(blob) : null);
                c.width = 0;
                c.height = 0;   // 임시 캔버스 즉시 반납
            }, type, quality);
        });

        const imageUrl = await draw(ImageGenerator.MAX_WIDTH, 'image/png');
        // 썸네일은 JPEG — 목록용이라 무손실일 필요가 없고 용량이 1/5 수준이다.
        const thumbUrl = await draw(ImageGenerator.THUMB_WIDTH, 'image/jpeg', 0.82);
        return { imageUrl, thumbUrl };
    }

    /** 이전 호출부 호환 — 본 이미지 URL 만 돌려준다. */
    static async generateCropImage(sourceCanvas, rect, scale = 1.5) {
        const { imageUrl } = await ImageGenerator.generateCrop(sourceCanvas, rect, scale);
        return imageUrl;
    }
}
