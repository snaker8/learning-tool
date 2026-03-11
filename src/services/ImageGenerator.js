export class ImageGenerator {
    /**
     * Generates a Blob URL for a specific crop region from a canvas.
     * @param {HTMLCanvasElement} sourceCanvas - The source canvas containing the PDF page
     * @param {object} rect - { x, y, width, height } in UNSCALED units
     * @param {number} scale - The scale factor of the sourceCanvas (e.g., 1.5)
     * @returns {Promise<string>} Promise resolving to a Blob URL of the cropped image
     */
    static generateCropImage(sourceCanvas, rect, scale = 1.5) {
        return new Promise((resolve) => {
            if (!sourceCanvas) {
                resolve(null);
                return;
            }

            // Create a temporary canvas
            const tempCanvas = document.createElement('canvas');
            const ctx = tempCanvas.getContext('2d');

            // Map the rect to the canvas pixel coordinates
            const pixelX = rect.x * scale;
            const pixelY = rect.y * scale;
            const pixelW = rect.width * scale;
            const pixelH = rect.height * scale;

            tempCanvas.width = pixelW;
            tempCanvas.height = pixelH;

            // Draw content
            ctx.drawImage(
                sourceCanvas,
                pixelX, pixelY, pixelW, pixelH,
                0, 0, pixelW, pixelH
            );

            // Convert to Blob URL (more memory efficient than Data URL)
            tempCanvas.toBlob((blob) => {
                if (blob) {
                    const url = URL.createObjectURL(blob);
                    resolve(url);
                } else {
                    resolve(null);
                }
                // Cleanup temp canvas
                tempCanvas.width = 0;
                tempCanvas.height = 0;
            }, 'image/png');
        });
    }
}
