export class AutoCropService {
    /**
     * Scans a canvas context to find horizontal gaps and distinct blocks of content.
     * @param {HTMLCanvasElement} canvas - The canvas to analyze
     * @param {number} sensitivity - Minimum gap height to consider a break (default 30)
     * @returns {Array<{y: number, height: number, x: number, width: number}>} Array of crop rects
     */
    static analyze(canvas, sensitivity = 30, roi = null) {
        const ctx = canvas.getContext('2d', { willReadFrequently: true });

        const bounds = roi || { x: 0, y: 0, width: canvas.width, height: canvas.height };
        const width = Math.floor(bounds.width);
        const height = Math.floor(bounds.height);

        if (width <= 0 || height <= 0) return [];

        const imageData = ctx.getImageData(bounds.x, bounds.y, width, height);
        const data = imageData.data;

        // 1. Exclusion Zones (More inclusive margins)
        const topMargin = roi ? 0 : Math.floor(height * 0.05);
        const bottomMargin = roi ? height : Math.floor(height * 0.98);

        // 2. Helper to check if a range in a row is empty
        // 2. Helper to check if a range in a row is empty
        const isSegmentEmpty = (rowY, startX, endX) => {
            const rowOffset = rowY * width;
            for (let x = startX; x < endX; x++) {
                const offset = (rowOffset + x) * 4;
                if (data[offset] + data[offset + 1] + data[offset + 2] < 600) {
                    return false;
                }
            }
            return true;
        };

        // 3. Detect Columns (Adaptive Split)
        // Find the clearest vertical gap in the middle region
        const scanStart = Math.floor(width * 0.4);
        const scanEnd = Math.floor(width * 0.6);
        const vProjection = new Int32Array(scanEnd - scanStart);

        for (let x = scanStart; x < scanEnd; x++) {
            for (let y = topMargin; y < bottomMargin; y += 4) {
                const offset = (y * width + x) * 4;
                if (data[offset] + data[offset + 1] + data[offset + 2] < 500) {
                    vProjection[x - scanStart]++;
                }
            }
        }

        let minDensity = height;
        let splitXRelative = -1;
        for (let i = 0; i < vProjection.length; i++) {
            if (vProjection[i] < minDensity) {
                minDensity = vProjection[i];
                splitXRelative = i;
            }
        }

        const splitX = scanStart + splitXRelative;
        const avgDensity = vProjection.reduce((a, b) => a + b, 0) / vProjection.length;
        const totalSampleLines = (bottomMargin - topMargin) / 4;
        const isTwoColumn = avgDensity < totalSampleLines * 0.2;

        const columnZones = isTwoColumn
            ? [{ start: 0, end: splitX - 1 }, { start: splitX + 1, end: width }]
            : [{ start: 0, end: width }];

        const allRegions = [];

        // 4. Process each column zone
        columnZones.forEach(zone => {
            const projection = new Uint8Array(height);
            for (let y = topMargin; y < bottomMargin; y++) {
                if (!isSegmentEmpty(y, zone.start, zone.end)) {
                    projection[y] = 1;
                }
            }

            let currentBlock = null;
            let gapCounter = 0;

            for (let y = topMargin; y < bottomMargin; y++) {
                if (projection[y] === 1) {
                    if (!currentBlock) {
                        currentBlock = { y: y, height: 0 };
                    }
                    gapCounter = 0;
                    currentBlock.height = y - currentBlock.y + 1;
                } else if (currentBlock) {
                    gapCounter++;
                    if (gapCounter > sensitivity) {
                        if (currentBlock.height > 20) {
                            // Use ABSOLUTE coordinates for getContentBounds
                            const absBlockRect = {
                                x: bounds.x + zone.start,
                                y: bounds.y + currentBlock.y,
                                width: zone.end - zone.start,
                                height: currentBlock.height
                            };

                            const refined = AutoCropService.getContentBounds(canvas, absBlockRect);
                            // getContentBounds returns absolute coords, so use as-is
                            if (refined.width > 30 && refined.height > 20) allRegions.push(refined);
                        }
                        currentBlock = null;
                        gapCounter = 0;
                    } else {
                        currentBlock.height = y - currentBlock.y + 1;
                    }
                }
            }
            if (currentBlock && currentBlock.height > 20) {
                const absBlockRect = {
                    x: bounds.x + zone.start,
                    y: bounds.y + currentBlock.y,
                    width: zone.end - zone.start,
                    height: currentBlock.height
                };
                const refined = AutoCropService.getContentBounds(canvas, absBlockRect);
                if (refined.width > 30 && refined.height > 20) allRegions.push(refined);
            }
        });

        // Coordinates are already absolute from getContentBounds

        // ROI Fallback: If ROI provided but no blocks found, return at least one block matching ROI
        if (allRegions.length === 0 && roi && (roi.width > 30 || roi.height > 30)) {
            const refined = AutoCropService.getContentBounds(canvas, bounds);
            if (refined.width > 20 && refined.height > 15) return [refined];
        }

        return allRegions;
    }

    static getContentBounds(canvas, rect, padding = 10) {
        const ctx = canvas.getContext('2d', { willReadFrequently: true });

        // Ensure bounds are within canvas
        const startX = Math.max(0, Math.floor(rect.x));
        const startY = Math.max(0, Math.floor(rect.y));
        const w = Math.min(canvas.width - startX, Math.floor(rect.width));
        const h = Math.min(canvas.height - startY, Math.floor(rect.height));

        if (w <= 0 || h <= 0) return rect;

        const imageData = ctx.getImageData(startX, startY, w, h);
        const data = imageData.data;

        let minX = w, maxX = 0, minY = h, maxY = 0;
        let hasContent = false;

        // Scan all pixels in the selection
        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                const offset = (y * w + x) * 4;
                const r = data[offset];
                const g = data[offset + 1];
                const b = data[offset + 2];
                // const alpha = data[offset + 3];

                // Check for non-white pixel
                // Sum < 600 is "dark" enough for text
                if (r + g + b < 600) {
                    if (x < minX) minX = x;
                    if (x > maxX) maxX = x;
                    if (y < minY) minY = y;
                    if (y > maxY) maxY = y;
                    hasContent = true;
                }
            }
        }

        if (!hasContent) {
            return rect;
        }

        // Apply padding
        const finalX = Math.max(0, startX + minX - padding);
        const finalY = Math.max(0, startY + minY - padding);
        const finalMaxX = Math.min(canvas.width, startX + maxX + padding);
        const finalMaxY = Math.min(canvas.height, startY + maxY + padding);

        return {
            x: finalX,
            y: finalY,
            width: finalMaxX - finalX,
            height: finalMaxY - finalY
        };
    }
    /**
     * Analyzes a specific area to find multiple distinct blocks (questions) separated by vertical gaps.
     * @param {HTMLCanvasElement} canvas 
     * @param {{x: number, y: number, width: number, height: number}} rect 
     * @param {number} sensitivity 
     * @returns {Array<{x: number, y: number, width: number, height: number}>} Array of separate blocks
     */
    static getMultiBlocks(canvas, rect, sensitivity = 30) {
        const ctx = canvas.getContext('2d', { willReadFrequently: true });

        // Ensure bounds
        const startX = Math.max(0, Math.floor(rect.x));
        const startY = Math.max(0, Math.floor(rect.y));
        const w = Math.min(canvas.width - startX, Math.floor(rect.width));
        const h = Math.min(canvas.height - startY, Math.floor(rect.height));

        if (w <= 0 || h <= 0) return [rect];

        const imageData = ctx.getImageData(startX, startY, w, h);
        const data = imageData.data;

        // 1. Projection on Y axis (check if row has content)
        const hasContentRow = new Uint8Array(h);

        // Use same high sensitivity as analyze
        for (let y = 0; y < h; y++) {
            let darkCount = 0;
            const rowOffset = y * w;
            for (let x = 0; x < w; x++) { // stride 1
                const offset = (rowOffset + x) * 4;
                // Threshold 600 for better sensitivity
                if (data[offset] + data[offset + 1] + data[offset + 2] < 600) {
                    darkCount++;
                }
            }
            if (darkCount > 0) {
                hasContentRow[y] = 1;
            }
        }

        // 2. Find blocks
        const blocks = [];
        let inBlock = false;
        let blockStart = 0;
        let gapCount = 0;

        for (let y = 0; y < h; y++) {
            if (hasContentRow[y] === 1) {
                if (!inBlock) {
                    inBlock = true;
                    blockStart = y;
                }
                gapCount = 0;
            } else {
                if (inBlock) {
                    gapCount++;
                    if (gapCount > sensitivity) {
                        // End of block
                        if (y - gapCount - blockStart > 10) { // Min height 10
                            blocks.push({
                                y: blockStart,
                                height: y - gapCount - blockStart
                            });
                        }
                        inBlock = false;
                    }
                }
            }
        }
        // Close last block
        if (inBlock && (h - blockStart > 10)) {
            blocks.push({
                y: blockStart,
                height: h - blockStart
            });
        }

        // If only 1 or 0 blocks found, check if the WHOLE region effectively has content
        // Instead of returning [refined], we want to ensure we don't return an empty box if refinement fails
        if (blocks.length === 0) {
            const refined = this.getContentBounds(canvas, rect);
            return [refined];
        }

        if (blocks.length === 1) {
            const blockRect = {
                x: startX,
                y: startY + blocks[0].y,
                width: w,
                height: blocks[0].height
            };
            return [this.getContentBounds(canvas, blockRect)];
        }

        // 3. Convert blocks back to absolute rects and refine each
        return blocks.map(block => {
            const blockRect = {
                x: startX,
                y: startY + block.y,
                width: w,
                height: block.height
            };
            return this.getContentBounds(canvas, blockRect);
        });
    }
}

function finalizeBlock(block, fullWidth) {
    // Default to full width minus some padding?
    // Or scan X axis too? For now, full width is safer for board materials.
    return {
        x: 0,
        y: block.y,
        width: fullWidth,
        height: block.height
    };
}
