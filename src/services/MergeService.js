export class MergeService {
    /**
     * 크롭 여러 개를 세로로 이어 한 장으로 만든다.
     *
     * 🔴 가로폭은 절대 자동으로 줄이지 않는다. 종전에는 캔버스 높이 한도에 걸리면
     * 조용히 가로를 깎아서, 사용자는 왜 흐려졌는지 모르는 채 화질을 잃었다
     * (2026-10-07 대표 지시: "줄이지말고 경고를 하면되잖아").
     * 지금은 무거우면 묻고(confirmOversize), 진짜 불가능하면 에러로 알린다.
     *
     * @param {string[]} imageUrls - 크롭 이미지 URL 배열
     * @param {number} width - 목표 가로폭 (원본보다 크면 원본에서 끊는다 — 부풀려도 선명해지지 않는다)
     * @param {number} gap - 크롭 사이 세로 간격
     * @param {string} backgroundColor - 배경색 (null 이면 투명)
     * @param {{confirmOversize?: (info:{width:number,height:number,megapixels:number,memoryMB:number,count:number})=>Promise<boolean>}} options
     * @returns {Promise<object|null>} 병합 결과. 사용자가 경고에서 취소하면 null.
     */
    static async mergeImages(imageUrls, width = 800, gap = 50, backgroundColor = null, options = {}) {
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

        // 2. 캔버스 크기 결정 — 요청한 가로폭을 그대로 쓴다.
        // 브라우저 실제 한도: 한 변 65,535px, 총 면적 2^28 px (크롬·사파리 공통 하한).
        // 이건 '취향'이 아니라 넘으면 빈 캔버스가 나오는 물리적 벽이다.
        const MAX_DIM = 65535;
        const MAX_AREA = 268435456;      // 2^28
        // 메모리 경고선 — 1600×30,000 ≈ 48Mpx ≈ 192MB. 여기까지는 실측으로 버텼다.
        // 넘으면 깎지 않고 사용자에게 묻는다 (크롬이 탭을 날릴 수 있으므로).
        const WARN_AREA = 48000000;

        const aspectSum = images.reduce((s, img) => s + img.height / img.width, 0);
        const gapsCount = Math.max(0, images.length - 1);

        // 원본보다 넓게 잡아봐야 보간으로 부풀 뿐 선명해지지 않는다. 원본 폭에서 끊는다.
        // (이건 화질을 깎는 축소가 아니라 '부풀리기 거부'다.)
        const sourceWidth = Math.max(...images.map(img => img.width));

        const finalWidth = Math.min(width, sourceWidth);
        const finalGap = gap;
        const totalHeight = Math.ceil(finalWidth * aspectSum + finalGap * gapsCount);
        const area = finalWidth * totalHeight;

        // 물리적으로 불가능한 경우만 에러 — 무엇을 어떻게 하면 되는지 숫자로 알려준다.
        if (totalHeight > MAX_DIM || area > MAX_AREA) {
            const fitGap = Math.floor((MAX_DIM - finalWidth * aspectSum) / Math.max(1, gapsCount));
            const fitCount = Math.max(1, Math.floor(MAX_DIM / ((finalWidth * aspectSum) / images.length + finalGap)));
            throw new Error(
                `크롭 ${images.length}개 · 가로 ${finalWidth}px · 간격 ${finalGap}px 이면 ` +
                `세로가 ${totalHeight.toLocaleString()}px 가 되어 브라우저 한도(${MAX_DIM.toLocaleString()}px)를 넘습니다. ` +
                (fitGap > 0
                    ? `간격을 ${fitGap}px 이하로 줄이거나, `
                    : '') +
                `한 번에 ${fitCount}개씩 나눠 합쳐주세요. (가로폭은 화질 때문에 자동으로 줄이지 않습니다)`
            );
        }

        // 무겁지만 가능한 경우 — 깎지 않고 묻는다.
        if (area > WARN_AREA && typeof options.confirmOversize === 'function') {
            const ok = await options.confirmOversize({
                width: finalWidth,
                height: totalHeight,
                megapixels: Math.round(area / 1e6),
                memoryMB: Math.round((area * 4) / (1024 * 1024)),
                count: images.length,
            });
            if (!ok) {
                images.forEach((img) => { img.src = ''; });
                return null;
            }
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
            sourceWidth,
            // 설정값이 원본보다 작아 화질을 버린 경우 — 사용자가 직접 정한 값일 때만 생긴다.
            downscaled: finalWidth < sourceWidth,
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

    /**
     * 클립보드에 이미지를 쓴다.
     *
     * 🔴 navigator.clipboard.write 는 탭이 백그라운드면 거부도 하지 않고
     * 영영 끝나지 않는다 (2026-10-14 실측: visibilityState='hidden' 에서
     * reject 없이 무응답). 그냥 await 하면 호출부의 finally 가 실행되지 않아
     * '병합 중' 버튼이 영구히 멈춘다 — 병합을 걸어두고 클래스인 창으로
     * 넘어가면 바로 이 상태가 됐다. 그래서 반드시 타임아웃을 건다.
     *
     * @returns {Promise<{ok: boolean, reason?: 'timeout'|'error'}>}
     */
    static CLIPBOARD_TIMEOUT_MS = 10000;

    static async copyToClipboard(dataUrl) {
        let timer = null;
        try {
            const blob = await (await fetch(dataUrl)).blob();
            const item = new ClipboardItem({ 'image/png': blob });

            const timeout = new Promise((resolve) => {
                timer = setTimeout(
                    () => resolve({ ok: false, reason: 'timeout' }),
                    MergeService.CLIPBOARD_TIMEOUT_MS
                );
            });
            // write 가 끝나지 않아도 race 는 끝난다. 버려진 promise 는 그대로 둔다 —
            // 되돌릴 방법이 없고, 나중에 늦게 끝나도 해가 없다.
            const result = await Promise.race([
                navigator.clipboard.write([item]).then(() => ({ ok: true })),
                timeout,
            ]);
            if (!result.ok) {
                console.warn('[clipboard] 쓰기가 끝나지 않아 중단했습니다 (visibility=' + document.visibilityState + ')');
            }
            return result;
        } catch (err) {
            console.error('Clipboard write failed', err);
            return { ok: false, reason: 'error' };
        } finally {
            if (timer) clearTimeout(timer);
        }
    }

    /** 복사 실패를 사람이 읽을 문장으로. 탭을 벗어난 경우를 콕 집어 말한다. */
    static copyFailMessage(reason, what = '복사') {
        return reason === 'timeout'
            ? `${what}가 끝나지 않아 중단했습니다. 복사하는 동안 이 탭을 벗어나면 브라우저가 클립보드를 막습니다 — 창을 켜둔 채로 다시 눌러주세요.`
            : `${what}에 실패했습니다. 브라우저의 클립보드 권한을 확인해주세요.`;
    }
}
