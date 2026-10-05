export class MergeService {
    /**
     * Merges multiple image Data URLs into a single vertical image.
     * @param {string[]} imageUrls - Array of base64 image strings
     * @param {number} width - Target width of the final image
     * @param {number} gap - Vertical gap between images
     * @param {string} backgroundColor - Background color (transparent by default if null)
     * @returns {Promise<string>} Promise resolving to the merged image Data URL
     */
    static async mergeImages(imageUrls, width = 800, gap = 50, backgroundColor = null) {
        if (!imageUrls || imageUrls.length === 0) return null;

        // 1. Load all images to get dimensions
        const images = await Promise.all(imageUrls.map(url => {
            return new Promise((resolve, reject) => {
                const img = new Image();
                img.onload = () => resolve(img);
                img.onerror = reject;
                img.src = url;
            });
        }));

        // 2. Determine actual canvas dimensions.
        // 캔버스 한도 초과 시 사용자가 설정한 *간격은 그대로 유지*하고 가로폭부터
        // 줄인다 (사용자가 간격을 명시적으로 정한 의도를 존중). 가로폭이 100px
        // 이하로 줄어들 정도면 에러.
        const MAX_CANVAS_HEIGHT = 30000;
        const aspectSum = images.reduce((s, img) => s + img.height / img.width, 0);
        const totalContentHeight = (w) => w * aspectSum;
        const gapsCount = Math.max(0, images.length - 1);

        let finalWidth = width;
        let finalGap = gap;
        let totalHeight = totalContentHeight(finalWidth) + finalGap * gapsCount;

        if (totalHeight > MAX_CANVAS_HEIGHT) {
            const allowedWidth = (MAX_CANVAS_HEIGHT - gap * gapsCount) / aspectSum;
            if (!Number.isFinite(allowedWidth) || allowedWidth < 100) {
                throw new Error(`간격 ${gap}px + 크롭 ${images.length}개로는 합칠 수 없습니다. 간격을 줄이거나 크롭을 나눠주세요.`);
            }
            console.warn(`[merge] 가로폭 자동 축소 ${width}→${Math.floor(allowedWidth)}px (간격 ${gap}px 유지)`);
            finalWidth = Math.floor(allowedWidth);
            totalHeight = totalContentHeight(finalWidth) + finalGap * gapsCount;
        }

        const scaledDimensions = images.map(img => ({
            img,
            h: finalWidth * (img.height / img.width),
        }));

        const canvas = document.createElement('canvas');
        canvas.width = finalWidth;
        canvas.height = Math.ceil(totalHeight);
        const ctx = canvas.getContext('2d');
        // 다운스케일 화질을 위해 고품질 보간 활성화.
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';

        if (backgroundColor) {
            ctx.fillStyle = backgroundColor;
            ctx.fillRect(0, 0, finalWidth, totalHeight);
        }

        // 4. Draw images
        // 그린 직후 src 를 비워 디코드된 비트맵을 바로 놓아준다. 크롭 50개를
        // 한꺼번에 합치면 디코드 비트맵만 수백 MB 가 되므로, 들고 있는 시간을
        // 최소로 줄인다 (2026-10-06 메모리 점검).
        let currentY = 0;
        scaledDimensions.forEach((item) => {
            ctx.drawImage(item.img, 0, currentY, finalWidth, item.h);
            currentY += item.h + finalGap;
            item.img.src = '';
        });

        // base64 dataURL 대신 blob URL 로 돌려준다.
        // 800×30,000 PNG 의 dataURL 은 수십 MB 짜리 문자열이고, 클립보드로
        // 보낼 때 fetch 로 또 한 벌 복사됐다. blob 은 복사가 없고 revoke 로
        // 즉시 반납된다 (2026-10-06 메모리 점검).
        const blob = await new Promise(res => canvas.toBlob(res, 'image/png'));
        // 합치기용 캔버스는 최대 800×30,000(약 96MB)까지 커진다. 반드시 반납.
        canvas.width = 0;
        canvas.height = 0;
        if (!blob) throw new Error('병합 이미지를 만들지 못했습니다.');

        return {
            dataUrl: URL.createObjectURL(blob),   // 호출부 호환을 위해 이름 유지
            finalGap,
            finalWidth,
            adjusted: finalGap !== gap || finalWidth !== width,
        };
    }

    /**
     * 개별 크롭을 "개별 복사 설정"(가로 px / 세로 제한)에 맞춰 리사이즈한다.
     *
     * 이 설정은 사이드바에 있었지만 복사 경로에서 한 번도 읽지 않아 값을 바꿔도
     * 아무 일이 없었다(2026-10-05 확인). 클립보드에는 항상 PDF 렌더 해상도
     * (기본 3배율) 원본이 들어가, 클래스인에 붙이면 설정과 다른 크기로 나왔다.
     *
     * @param {string} imageUrl - 크롭 blob URL
     * @param {{copyWidth?:number, maxHeight?:number, useMaxHeight?:boolean}} settings
     * @returns {Promise<string>} 리사이즈된 data URL (변경이 필요 없으면 원본 URL)
     */
    static async resizeForCopy(imageUrl, settings = {}) {
        const targetW = Number(settings.copyWidth) || 0;
        const useMax = !!settings.useMaxHeight;
        const maxH = Number(settings.maxHeight) || 0;
        if (targetW <= 0 && !(useMax && maxH > 0)) return imageUrl;

        const img = await new Promise((resolve, reject) => {
            const el = new Image();
            el.onload = () => resolve(el);
            el.onerror = reject;
            el.src = imageUrl;
        });
        if (!img.width || !img.height) return imageUrl;

        let w = targetW > 0 ? targetW : img.width;
        let h = w * (img.height / img.width);
        // 세로 제한이 켜져 있으면 가로를 더 줄여서라도 비율을 지킨다.
        if (useMax && maxH > 0 && h > maxH) {
            h = maxH;
            w = h * (img.width / img.height);
        }
        w = Math.max(1, Math.round(w));
        h = Math.max(1, Math.round(h));
        if (w === img.width && h === img.height) return imageUrl;

        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, w, h);
        const blob = await new Promise(res => canvas.toBlob(res, 'image/png'));
        canvas.width = 0;
        canvas.height = 0;
        return blob ? URL.createObjectURL(blob) : imageUrl;
    }

    /** 복사 후 임시 blob URL 을 반납한다. 원본(크롭) URL 은 건드리지 않는다. */
    static releaseTemp(url, original) {
        if (url && url !== original && typeof url === 'string' && url.startsWith('blob:')) {
            URL.revokeObjectURL(url);
        }
    }

    static async copyToClipboard(dataUrl) {
        try {
            const blob = await (await fetch(dataUrl)).blob();
            const item = new ClipboardItem({ 'image/png': blob });
            await navigator.clipboard.write([item]);
            return true;
        } catch (err) {
            console.error("Clipboard write failed", err);
            return false;
        }
    }
}
