export class ImageGenerator {
    /**
     * Generates a Data URL for a specific crop region from a canvas.
     * @param {HTMLCanvasElement} sourceCanvas - The source canvas containing the PDF page
     * @param {object} rect - { x, y, width, height } in UNSCALED units (if canvas is scaled, need to adjust)
     * @param {number} scale - The scale factor of the sourceCanvas (e.g., 1.5)
     * @returns {string} Data URL of the cropped image
     */
    static generateCropImage(sourceCanvas, rect, scale = 1.5) {
        if (!sourceCanvas) return null;

        // Create a temporary canvas
        const tempCanvas = document.createElement('canvas');
        const ctx = tempCanvas.getContext('2d');

        // The rect coords are usually passed as "viewport" coords (e.g. 800px width),
        // BUT `sourceCanvas` is rendered at `scale` (e.g. 1.5x -> 1200px width).
        // So we need to map the rect to the canvas pixel coordinates.

        // If rect is coming from AutoCropService (which analyzes the canvas directly), 
        // its coords might already be in canvas pixels?
        // -> In PdfViewer, we did `rect.x * scaleinv`. That put them in "Viewport Points".
        // -> So `rect` here is likely in "Viewport Points".

        // So to get Canvas Pixels:
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

        return tempCanvas.toDataURL('image/png');
    }
}
