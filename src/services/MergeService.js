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

        // 2. Calculate total height
        // Maintain aspect ratio for each image relative to target width
        let totalHeight = 0;
        const scaledDimensions = images.map(img => {
            const aspectRatio = img.height / img.width;
            const targetHeight = width * aspectRatio;
            totalHeight += targetHeight;
            return { img, h: targetHeight };
        });

        // Add gaps (gaps between images, so n-1 gaps)
        if (images.length > 1) {
            totalHeight += (images.length - 1) * gap;
        }

        // 3. Create canvas
        // Canvas 높이 제한 체크 (브라우저마다 다르지만 안전하게 30,000px 설정)
        const MAX_CANVAS_HEIGHT = 30000;
        if (totalHeight > MAX_CANVAS_HEIGHT) {
            throw new Error(`이미지 전체 높이가 너무 큽니다 (${Math.round(totalHeight)}px). ${MAX_CANVAS_HEIGHT}px 이하로 나눠서 합쳐주세요.`);
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = totalHeight;
        const ctx = canvas.getContext('2d');

        if (backgroundColor) {
            ctx.fillStyle = backgroundColor;
            ctx.fillRect(0, 0, width, totalHeight);
        }

        // 4. Draw images
        let currentY = 0;
        scaledDimensions.forEach((item, index) => {
            ctx.drawImage(item.img, 0, currentY, width, item.h);
            currentY += item.h + gap;
        });

        return canvas.toDataURL('image/png');
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
