import React, { useState, useRef, useEffect } from 'react';
import { useCropContext } from '../context/CropContext';
import { ImageGenerator } from '../services/ImageGenerator';
import { AutoCropService } from '../services/AutoCropService';

const CropOverlay = React.memo(function CropOverlay({ pageNum, scale, renderScale = 1.5, width, height, canvas, onGlobalCrop }) {
    const { crops, addCrop, updateCrop, removeCrop, selectedCropId, setSelectedCropId, settings } = useCropContext();
    const [isDrawing, setIsDrawing] = useState(false);
    const [isDragging, setIsDragging] = useState(false);
    const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
    const [initialCropRect, setInitialCropRect] = useState(null);
    const [startPos, setStartPos] = useState({ x: 0, y: 0 });
    const [currentRect, setCurrentRect] = useState(null);
    const containerRef = useRef(null);
    const [activeCropOverride, setActiveCropOverride] = useState(null);
    const [actualScale, setActualScale] = useState(1);

    useEffect(() => {
        if (!containerRef.current || !canvas) return;

        const updateScale = () => {
            if (!containerRef.current || !canvas) return;
            const visualRect = containerRef.current.getBoundingClientRect();
            if (visualRect.width > 0) {
                setActualScale(canvas.width / visualRect.width);
            }
        };

        updateScale(); // Initial call

        const observer = new ResizeObserver(updateScale);
        observer.observe(containerRef.current);

        return () => observer.disconnect();
    }, [canvas, scale, renderScale]);

    // Filter crops for this page
    const pageCrops = crops.filter(c => c.pageNum === pageNum);

    const getOhterCropsOnPage = () => crops.filter(c => c.pageNum === pageNum);

    const handlePointerDown = (e) => {
        if (e.target !== containerRef.current) return;
        e.preventDefault(); // Prevent text selection
        e.stopPropagation();

        const rect = containerRef.current.getBoundingClientRect();
        // DOM 픽셀 좌표를 그대로 저장 (나중에 ratio로 변환)
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        setIsDrawing(true);
        setStartPos({ x, y });
        setCurrentRect({ x, y, width: 0, height: 0 });
        setSelectedCropId(null);

        // Capture pointer to track outside window
        e.target.setPointerCapture(e.pointerId);
    };

    const scrollLoop = useRef(null);
    const scrollSpeed = useRef(0);
    const lastMousePos = useRef({ x: 0, y: 0 });

    // Helper to find scroll parent
    const getScrollParent = (node) => {
        if (!node) return null;
        if (node.scrollHeight > node.clientHeight) {
            const overflowY = window.getComputedStyle(node).overflowY;
            if (overflowY === 'auto' || overflowY === 'scroll') return node;
        }
        return getScrollParent(node.parentNode);
    };

    const stopAutoScroll = () => {
        if (scrollLoop.current) {
            cancelAnimationFrame(scrollLoop.current);
            scrollLoop.current = null;
        }
        scrollSpeed.current = 0;
    };


    // Update the drag rect based on current mouse pos (screen) and current scroll (container)
    const updateDragRect = (clientX, clientY) => {
        if (!isDrawing || !containerRef.current) return;

        const rect = containerRef.current.getBoundingClientRect();
        // DOM 픽셀 좌표를 그대로 사용
        const currentX = clientX - rect.left;
        const currentY = clientY - rect.top;

        const width = currentX - startPos.x;
        const height = currentY - startPos.y;

        setCurrentRect({
            x: width > 0 ? startPos.x : currentX,
            y: height > 0 ? startPos.y : currentY,
            width: Math.abs(width),
            height: Math.abs(height)
        });
    };

    const startAutoScroll = (parent) => {
        if (scrollLoop.current) return;

        const loop = () => {
            if (scrollSpeed.current !== 0 && parent) {
                parent.scrollTop += scrollSpeed.current;

                // Keep rect synced during scroll
                updateDragRect(lastMousePos.current.x, lastMousePos.current.y);

                scrollLoop.current = requestAnimationFrame(loop);
            } else {
                stopAutoScroll();
            }
        };
        scrollLoop.current = requestAnimationFrame(loop);
    };

    const handlePointerMove = (e) => {
        if (!isDrawing) return;

        // Store last pos for scroll sync
        lastMousePos.current = { x: e.clientX, y: e.clientY };

        updateDragRect(e.clientX, e.clientY);

        // Auto Scroll Logic
        const scrollParent = getScrollParent(containerRef.current);
        if (scrollParent) {
            const parentRect = scrollParent.getBoundingClientRect();
            const threshold = 50;

            if (e.clientY > parentRect.bottom - threshold) {
                scrollSpeed.current = 10;
                startAutoScroll(scrollParent);
            } else if (e.clientY < parentRect.top + threshold) {
                scrollSpeed.current = -10;
                startAutoScroll(scrollParent);
            } else {
                stopAutoScroll();
            }
        }
    };

    const handlePointerUp = (e) => {
        if (!isDrawing) return;

        setIsDrawing(false);
        stopAutoScroll();
        e.target.releasePointerCapture(e.pointerId);

        // Only add if it's large enough (e.g. > 10px)
        if (currentRect && currentRect.width > 10 && currentRect.height > 10) {

            // Calculate precise ratio between Visual DOM and Actual Canvas
            const visualRect = containerRef.current.getBoundingClientRect();
            // Note: visualRect.width should match the rendered width on screen
            // canvas.width is the intrinsic size (e.g. 1240px)
            // Safety check for width 0
            const ratio = visualRect.width > 0 ? (canvas.width / visualRect.width) : renderScale;

            // Convert to Canvas Pixels (for AutoCrop and Global Mode)
            // currentRect는 이제 DOM 픽셀 좌표이므로 ratio만 곱함
            const pixelRect = {
                x: currentRect.x * ratio,
                y: currentRect.y * ratio,
                width: currentRect.width * ratio,
                height: currentRect.height * ratio
            };

            // Global Mode Check
            if (settings.isGlobalMode && onGlobalCrop) {
                onGlobalCrop(pixelRect, pageNum);
                setCurrentRect(null);
                return;
            }

            let finalRect = currentRect;

            // Only apply smart snap if 'Auto Crop' is enabled in settings
            if (settings.autoCrop) {

                try {
                    // Use the calculated pixelRect directly
                    // 2. Get Multiple Blocks (Splitting)
                    // Note: AutoCropService expects Canvas Pixels
                    // Scale sensitivity implementation
                    const sensitivityScale = renderScale / 1.5;
                    const adjustedSensitivity = (settings.sensitivity || 30) * sensitivityScale;
                    const refinedPixelRects = AutoCropService.getMultiBlocks(canvas, pixelRect, adjustedSensitivity);

                    // 3. Add crop for EACH block found
                    refinedPixelRects.forEach(rect => {
                        const finalRect = {
                            x: rect.x / renderScale,
                            y: rect.y / renderScale,
                            width: rect.width / renderScale,
                            height: rect.height / renderScale
                        };

                        if (finalRect.width > 5 && finalRect.height > 5) {
                            const imageUrl = ImageGenerator.generateCropImage(canvas, finalRect, renderScale);
                            addCrop({
                                pageNum,
                                ...finalRect,
                                imageUrl
                            });
                        }
                    });

                    // Clear current rect and return, as we've already added crops
                    setCurrentRect(null);
                    return;
                } catch (error) {
                    console.error("Auto Crop Failed:", error);
                    // Fallback to manual crop below
                }
            }

            // Fallback for manual mode (Auto Crop OFF or Error)
            if (finalRect.width > 5 && finalRect.height > 5) {
                // Ensure finalRect is normalized to renderScale for accuracy
                const finalRectNormalized = {
                    x: pixelRect.x / renderScale,
                    y: pixelRect.y / renderScale,
                    width: pixelRect.width / renderScale,
                    height: pixelRect.height / renderScale
                };
                const imageUrl = ImageGenerator.generateCropImage(canvas, finalRectNormalized, renderScale);

                addCrop({
                    pageNum,
                    ...finalRectNormalized,
                    imageUrl
                });
            }
        }
        setCurrentRect(null);
    };

    // --- Drag Logic ---
    const handleCropPointerDown = (e, crop) => {
        e.stopPropagation();
        setSelectedCropId(crop.id);

        const rect = containerRef.current.getBoundingClientRect();
        const ratio = canvas.width / rect.width;
        // DOM 픽셀을 논리적 좌표로 변환 (crop은 논리적 좌표로 저장됨)
        const x = (e.clientX - rect.left) * ratio / renderScale;
        const y = (e.clientY - rect.top) * ratio / renderScale;

        setIsDragging(true);
        setDragStart({ x, y });
        setInitialCropRect({ ...crop });
        e.target.setPointerCapture(e.pointerId);
    };

    const handleCropPointerMove = (e) => {
        if (!isDragging || !initialCropRect) return;
        e.stopPropagation();

        const rect = containerRef.current.getBoundingClientRect();
        const ratio = canvas.width / rect.width;
        // DOM 픽셀을 논리적 좌표로 변환
        const currentX = (e.clientX - rect.left) * ratio / renderScale;
        const currentY = (e.clientY - rect.top) * ratio / renderScale;

        const deltaX = currentX - dragStart.x;
        const deltaY = currentY - dragStart.y;

        const newRect = {
            ...initialCropRect,
            x: initialCropRect.x + deltaX,
            y: initialCropRect.y + deltaY
        };

        setActiveCropOverride(newRect);
    };

    const handleCropPointerUp = (e) => {
        if (isDragging) {
            setIsDragging(false);

            if (activeCropOverride) {
                // Regenerate image on drag end
                const finalRect = { x: activeCropOverride.x, y: activeCropOverride.y, width: activeCropOverride.width, height: activeCropOverride.height };
                const imageUrl = ImageGenerator.generateCropImage(canvas, finalRect, renderScale);
                updateCrop(selectedCropId, { ...finalRect, imageUrl });
                setActiveCropOverride(null);
            }

            setInitialCropRect(null);
            e.target.releasePointerCapture(e.pointerId);
        }
    };

    // Keyboard Shortcuts
    useEffect(() => {
        const handleKeyDown = (e) => {
            if (!selectedCropId) return;
            const crop = crops.find(c => c.id === selectedCropId);
            if (!crop) return;

            // step은 논리적 좌표 단위 (renderScale 기준)
            const step = e.shiftKey ? 10 : 1;
            let updates = null;

            switch (e.key) {
                case 'ArrowLeft': updates = { x: crop.x - step }; break;
                case 'ArrowRight': updates = { x: crop.x + step }; break;
                case 'ArrowUp': updates = { y: crop.y - step }; break;
                case 'ArrowDown': updates = { y: crop.y + step }; break;
                case 'Delete':
                case 'Backspace':
                    removeCrop(crop.id);
                    break;
            }

            if (updates) {
                e.preventDefault();
                updateCrop(crop.id, updates);
            }
        };

        window.addEventListener('keydown', handleKeyDown);

        const handleKeyUp = (e) => {
            if (!selectedCropId) return;
            const keys = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'];
            if (keys.includes(e.key)) {
                const crop = crops.find(c => c.id === selectedCropId);
                if (crop && canvas) {
                    const finalRect = { x: crop.x, y: crop.y, width: crop.width, height: crop.height };
                    const imageUrl = ImageGenerator.generateCropImage(canvas, finalRect, renderScale);
                    updateCrop(selectedCropId, { imageUrl });
                }
            }
        };
        window.addEventListener('keyup', handleKeyUp);

        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('keyup', handleKeyUp);
        };
    }, [selectedCropId, crops, scale, updateCrop, removeCrop, canvas]);

    // --- Resize Logic ---
    const [resizeState, setResizeState] = useState(null);

    const handleResizePointerDown = (e, handle, crop) => {
        e.stopPropagation();
        e.preventDefault();
        setResizeState({
            handle,
            startX: e.clientX,
            startY: e.clientY,
            initialRect: { ...crop }, // Copy crop stats
            id: crop.id
        });
        e.target.setPointerCapture(e.pointerId);
    };

    const handleResizePointerMove = (e) => {
        if (!resizeState) return;
        e.stopPropagation();

        const { handle, startX, startY, initialRect, id } = resizeState;
        // DOM 픽셀 delta를 논리적 좌표로 변환
        const displayScale = renderScale / actualScale;
        const deltaX = (e.clientX - startX) / displayScale;
        const deltaY = (e.clientY - startY) / displayScale;

        let newRect = { ...initialRect, id }; // ensure id is retained

        if (handle.includes('e')) newRect.width = Math.max(10, initialRect.width + deltaX);
        if (handle.includes('s')) newRect.height = Math.max(10, initialRect.height + deltaY);
        if (handle.includes('w')) {
            const w = Math.max(10, initialRect.width - deltaX);
            newRect.x = initialRect.x + (initialRect.width - w);
            newRect.width = w;
        }
        if (handle.includes('n')) {
            const h = Math.max(10, initialRect.height - deltaY);
            newRect.y = initialRect.y + (initialRect.height - h);
            newRect.height = h;
        }

        setActiveCropOverride(newRect);
    };

    const handleResizePointerUp = (e) => {
        if (resizeState) {
            if (activeCropOverride) {
                // Regenerate image on resize end
                const finalRect = { x: activeCropOverride.x, y: activeCropOverride.y, width: activeCropOverride.width, height: activeCropOverride.height };
                const imageUrl = ImageGenerator.generateCropImage(canvas, finalRect, renderScale);
                updateCrop(resizeState.id, { ...finalRect, imageUrl });
                setActiveCropOverride(null);
            }

            setResizeState(null);
            e.target.releasePointerCapture(e.pointerId);
        }
    };

    return (
        <div
            ref={containerRef}
            className="absolute top-0 left-0 w-full h-full z-10 cursor-custom-crosshair touch-none"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerLeave={handlePointerUp}
        >
            {/* Existing Crops */}
            {pageCrops.map(originalCrop => {
                const crop = (activeCropOverride && activeCropOverride.id === originalCrop.id)
                    ? { ...originalCrop, ...activeCropOverride }
                    : originalCrop;

                // 논리적 좌표 -> DOM 픽셀 변환
                const displayScale = renderScale / actualScale;
                return (
                    <div
                        key={crop.id}
                        className={`absolute border-2 transition-all ${selectedCropId === crop.id
                            ? 'border-blue-500 bg-blue-500/20 z-20 shadow-[0_0_0_2px_rgba(59,130,246,0.3)]'
                            : 'border-red-500 bg-red-500/10 hover:border-red-600 hover:bg-red-500/20 z-10'
                            }`}
                        style={{
                            left: `${crop.x * displayScale}px`,
                            top: `${crop.y * displayScale}px`,
                            width: `${crop.width * displayScale}px`,
                            height: `${crop.height * displayScale}px`,
                        }}
                        onPointerDown={(e) => handleCropPointerDown(e, crop)}
                        onPointerMove={handleCropPointerMove}
                        onPointerUp={handleCropPointerUp}
                    >
                        {/* Delete Button (Visible on hover or select) */}
                        {/* Delete Button & Resize Handles */}
                        {(selectedCropId === crop.id) && (
                            <>
                                <button
                                    className="absolute -top-3 -right-3 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center text-xs shadow-md hover:scale-110 transition-transform z-50"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        removeCrop(crop.id);
                                    }}
                                >
                                    ✕
                                </button>

                                {/* Resize Handles */}
                                {[
                                    { h: 'nw', pos: 'top-0 left-0 -translate-x-1/2 -translate-y-1/2', cursor: 'cursor-nw-resize' },
                                    { h: 'n', pos: 'top-0 left-1/2 -translate-x-1/2 -translate-y-1/2', cursor: 'cursor-n-resize' },
                                    { h: 'ne', pos: 'top-0 right-0 translate-x-1/2 -translate-y-1/2', cursor: 'cursor-ne-resize' },
                                    { h: 'w', pos: 'top-1/2 left-0 -translate-x-1/2 -translate-y-1/2', cursor: 'cursor-w-resize' },
                                    { h: 'e', pos: 'top-1/2 right-0 translate-x-1/2 -translate-y-1/2', cursor: 'cursor-e-resize' },
                                    { h: 'sw', pos: 'bottom-0 left-0 -translate-x-1/2 translate-y-1/2', cursor: 'cursor-sw-resize' },
                                    { h: 's', pos: 'bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2', cursor: 'cursor-s-resize' },
                                    { h: 'se', pos: 'bottom-0 right-0 translate-x-1/2 translate-y-1/2', cursor: 'cursor-se-resize' }
                                ].map(({ h, pos, cursor }) => (
                                    <div
                                        key={h}
                                        className={`absolute w-3 h-3 bg-white border border-blue-500 rounded-full z-40 ${pos} ${cursor}`}
                                        onPointerDown={(e) => handleResizePointerDown(e, h, crop)}
                                        onPointerMove={handleResizePointerMove}
                                        onPointerUp={handleResizePointerUp}
                                    />
                                ))}
                            </>
                        )}
                    </div>
                );
            })}

            {/* Currently Drawing Rect */}
            {currentRect && (
                <div
                    className="absolute border-2 border-blue-400 bg-blue-400/20 pointer-events-none"
                    style={{
                        left: `${currentRect.x}px`,
                        top: `${currentRect.y}px`,
                        width: `${currentRect.width}px`,
                        height: `${currentRect.height}px`
                    }}
                />
            )}
        </div>
    );
});

export default CropOverlay;
