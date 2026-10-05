import React, { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { useCropContext } from '../context/CropContext';
import { ImageGenerator } from '../services/ImageGenerator';
import { AiCropService } from '../services/AiCropService';
import { MergeService } from '../services/MergeService';
import { useToast } from '../context/ToastContext';
import { Sparkles, Check, RefreshCw, Layers } from 'lucide-react';

const CropOverlay = React.memo(function CropOverlay({ pageNum, scale, renderScale = 1.5, width, height, canvas, onGlobalCrop }) {
    const toast = useToast();
    const { crops, addCrop, updateCrop, removeCrop, selectedCropId, setSelectedCropId, settings, copiedCropId, markCopied, detections, setPageDetections, updateSettings } = useCropContext();
    const [isDrawing, setIsDrawing] = useState(false);
    const [isDragging, setIsDragging] = useState(false);
    const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
    const [initialCropRect, setInitialCropRect] = useState(null);
    const [startPos, setStartPos] = useState({ x: 0, y: 0 });
    const [currentRect, setCurrentRect] = useState(null);
    const containerRef = useRef(null);
    const [activeCropOverride, setActiveCropOverride] = useState(null);
    const [isDetecting, setIsDetecting] = useState(false);
    const [showCandidates, setShowCandidates] = useState(true);

    const pageDetections = detections[pageNum] || null;

    /* 후보가 이미 담겼는지 — 같은 자리에 크롭이 있으면 담긴 것으로 본다. */
    const isAdded = (cand) => {
        if (!canvas) return false;
        const cx = cand.x * canvas.width / renderScale;
        const cy = cand.y * canvas.height / renderScale;
        const cw = cand.width * canvas.width / renderScale;
        const ch = cand.height * canvas.height / renderScale;
        return pageCrops.some((c) => {
            const ix = Math.max(0, Math.min(cx + cw, c.x + c.width) - Math.max(cx, c.x));
            const iy = Math.max(0, Math.min(cy + ch, c.y + c.height) - Math.max(cy, c.y));
            const inter = ix * iy;
            if (!inter) return false;
            return inter / Math.min(cw * ch, c.width * c.height) > 0.5;
        });
    };

    const addCandidate = async (cand) => {
        if (!canvas) return;
        const rect = {
            x: cand.x * canvas.width / renderScale,
            y: cand.y * canvas.height / renderScale,
            width: cand.width * canvas.width / renderScale,
            height: cand.height * canvas.height / renderScale,
        };
        if (rect.width <= 5 || rect.height <= 5) return;
        const imageUrl = await ImageGenerator.generateCropImage(canvas, rect, renderScale);
        addCrop({ pageNum, ...rect, imageUrl, label: cand.label || '' });
    };

    const handleDetect = async () => {
        if (!canvas || isDetecting) return;
        setIsDetecting(true);
        try {
            const boxes = await AiCropService.detectProblems(canvas, null);
            // 캔버스 크기에 독립적인 0~1 비율로 저장 — 확대/해상도가 바뀌어도 쓸 수 있다.
            const normalized = boxes.map((b) => ({
                x: b.x / canvas.width,
                y: b.y / canvas.height,
                width: b.width / canvas.width,
                height: b.height / canvas.height,
                label: b.label || '',
            }));
            setPageDetections(pageNum, normalized);
            setShowCandidates(true);
            if (normalized.length === 0) toast.info('이 페이지에서 문제를 찾지 못했습니다. 직접 드래그해 주세요.');
        } catch (err) {
            console.error('문제 인식 실패:', err);
            toast.error(`문제 인식 실패 — ${err?.message || '알 수 없는 오류'}`);
        } finally {
            setIsDetecting(false);
        }
    };

    const addAllCandidates = async () => {
        if (!pageDetections) return;
        for (const cand of pageDetections) {
            if (!isAdded(cand)) await addCandidate(cand);
        }
    };

    // null = not yet measured. We must not render existing crops until measured,
    // otherwise they flash at wrong size on every (re)mount during scroll.
    const [actualScale, setActualScale] = useState(null);

    // useLayoutEffect runs synchronously after DOM mutations and BEFORE paint,
    // so the first measurement lands in time for the first paint and we avoid
    // a one-frame flicker on every IntersectionObserver-driven remount.
    useLayoutEffect(() => {
        if (!containerRef.current || !canvas) return;

        const updateScale = () => {
            if (!containerRef.current || !canvas) return;
            const visualRect = containerRef.current.getBoundingClientRect();
            if (visualRect.width > 0) {
                setActualScale(canvas.width / visualRect.width);
            }
        };

        updateScale();

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

    const handlePointerUp = async (e) => {
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

            // '문제에 맞춤' 모드: 드래그 범위에 걸친 문제들로 쪼갠다.
            // 이미 인식한 페이지면 즉시(호출 0). 아직이면 이때 한 번 호출하고
            // 결과를 페이지에 보관해 다음 드래그부터는 즉시가 된다.
            // Alt 를 누른 채 놓으면 이번만 그린 그대로.
            if (settings.snapToProblem && !e.altKey) {
                let boxes = pageDetections;
                if (!boxes) {
                    setIsDetecting(true);
                    try {
                        const detected = await AiCropService.detectProblems(canvas, null);
                        boxes = detected.map((b) => ({
                            x: b.x / canvas.width,
                            y: b.y / canvas.height,
                            width: b.width / canvas.width,
                            height: b.height / canvas.height,
                            label: b.label || '',
                        }));
                        setPageDetections(pageNum, boxes);
                    } catch (err) {
                        console.error('문제 인식 실패:', err);
                        toast.error(`문제 인식 실패 — 그린 그대로 잘랐습니다. (${err?.message || '알 수 없는 오류'})`);
                        boxes = [];
                    } finally {
                        setIsDetecting(false);
                    }
                }

                const roi = {
                    x: pixelRect.x / canvas.width,
                    y: pixelRect.y / canvas.height,
                    width: pixelRect.width / canvas.width,
                    height: pixelRect.height / canvas.height,
                };
                const matches = (boxes || []).filter((c) => AiCropService.boxInsideRoi(c, roi));

                // 대충 그려도 문제 경계에 딱 맞추는 게 기본이다.
                // 예외는 "한 문제 안에서 일부만 떼려는" 의도가 분명할 때뿐 —
                // 매치가 1개이고 그 문제의 1/4 도 안 되게 작게 그렸을 때.
                const roiArea = roi.width * roi.height;
                const insideOne =
                    matches.length === 1 &&
                    roiArea < 0.25 * matches[0].width * matches[0].height;

                if (matches.length > 0 && !insideOne) {
                    for (const cand of matches) {
                        if (!isAdded(cand)) await addCandidate(cand);
                    }
                    setCurrentRect(null);
                    return;
                }
            }

            // 그 외에는 그린 그대로 — 즉시, 호출 없음.
            if (currentRect.width > 5 && currentRect.height > 5) {
                // 캔버스 픽셀 → 논리 좌표(renderScale 기준)로 환산
                const finalRectNormalized = {
                    x: pixelRect.x / renderScale,
                    y: pixelRect.y / renderScale,
                    width: pixelRect.width / renderScale,
                    height: pixelRect.height / renderScale
                };
                const imageUrl = await ImageGenerator.generateCropImage(canvas, finalRectNormalized, renderScale);

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

    const handleCropPointerUp = async (e) => {
        if (isDragging) {
            setIsDragging(false);

            if (activeCropOverride) {
                // Regenerate image on drag end
                const finalRect = { x: activeCropOverride.x, y: activeCropOverride.y, width: activeCropOverride.width, height: activeCropOverride.height };
                const imageUrl = await ImageGenerator.generateCropImage(canvas, finalRect, renderScale);
                updateCrop(selectedCropId, { ...finalRect, imageUrl });
                setActiveCropOverride(null);
            } else {
                // Pointer down + up without movement = simple click on a crop.
                // Auto-copy that crop's image to clipboard.
                const clicked = crops.find(c => c.id === selectedCropId);
                if (clicked?.imageUrl) {
                    try {
                        const toCopy = await MergeService.resizeForCopy(clicked.imageUrl, settings);
                        const ok = await MergeService.copyToClipboard(toCopy);
                        if (ok) {
                            markCopied(clicked.id);
                        } else {
                            toast.error('클립보드 복사에 실패했습니다. 브라우저의 클립보드 권한을 확인해주세요.');
                        }
                    } catch (err) {
                        console.error('Auto-copy on click failed', err);
                        toast.error('클립보드 복사 중 오류가 발생했습니다.');
                    }
                }
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

        const handleKeyUp = async (e) => {
            if (!selectedCropId) return;
            const keys = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'];
            if (keys.includes(e.key)) {
                const crop = crops.find(c => c.id === selectedCropId);
                if (crop && canvas) {
                    const finalRect = { x: crop.x, y: crop.y, width: crop.width, height: crop.height };
                    const imageUrl = await ImageGenerator.generateCropImage(canvas, finalRect, renderScale);
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

    const handleResizePointerUp = async (e) => {
        if (resizeState) {
            if (activeCropOverride) {
                // Regenerate image on resize end
                const finalRect = { x: activeCropOverride.x, y: activeCropOverride.y, width: activeCropOverride.width, height: activeCropOverride.height };
                const imageUrl = await ImageGenerator.generateCropImage(canvas, finalRect, renderScale);
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
            {isDetecting && (
                <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/35 backdrop-blur-[2px] pointer-events-none">
                    <div className="flex items-center gap-2.5 px-4 py-2.5 rounded-xl bg-zinc-950/85 border border-white/10 shadow-lg">
                        <div className="w-4 h-4 rounded-full border-2 border-zinc-700 border-t-amber-400 animate-spin" />
                        <span className="text-[12.5px] font-medium text-zinc-100">문제 인식 중…</span>
                    </div>
                </div>
            )}

            {/* 인식 버튼 — 페이지 위에 항상 보인다. 누를 때만 호출한다.
                '이 페이지 인식' = 1회(약 ₩6) → 후보 표시 + 드래그 스냅 활성화
                '전체 페이지'   = 모든 페이지 검출 후 전부 담기 (페이지당 약 ₩6) */}
            <div
                className="absolute top-2 left-2 z-50 flex items-center gap-1.5"
                onPointerDown={(e) => e.stopPropagation()}
            >
                {!pageDetections ? (
                    <>
                        <button
                            onClick={handleDetect}
                            disabled={isDetecting}
                            className="press flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-violet-500/90 hover:bg-violet-400 text-white text-[11.5px] font-semibold backdrop-blur-md border border-violet-300/30 shadow-lg transition-colors disabled:opacity-60"
                            title="이 페이지의 문제를 찾습니다. 그 다음부터 드래그가 문제 경계에 딱 맞춰집니다 (약 ₩6)"
                        >
                            <Sparkles className="w-3.5 h-3.5" strokeWidth={2} />
                            <span>이 페이지 인식</span>
                        </button>
                        {onGlobalCrop && (
                            <button
                                onClick={() => onGlobalCrop(null, pageNum)}
                                className="press flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-black/60 hover:bg-violet-500 text-white text-[11.5px] font-medium backdrop-blur-md border border-white/15 shadow-lg transition-colors"
                                title="모든 페이지의 문제를 찾아 전부 담습니다 (페이지당 약 ₩6)"
                            >
                                <Layers className="w-3.5 h-3.5" strokeWidth={2} />
                                <span>전체 페이지</span>
                            </button>
                        )}
                    </>
                ) : (
                    <>
                        <button
                            onClick={addAllCandidates}
                            className="press flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-amber-400 hover:bg-amber-300 text-zinc-950 text-[11.5px] font-semibold backdrop-blur-md transition-colors"
                        >
                            <Check className="w-3.5 h-3.5" strokeWidth={2.5} />
                            <span>전체 담기 {pageDetections.filter(c => !isAdded(c)).length}</span>
                        </button>
                        <button
                            onClick={() => setShowCandidates(v => !v)}
                            className="press px-2.5 py-1.5 rounded-md bg-black/55 hover:bg-black/75 text-white text-[11.5px] font-medium backdrop-blur-md border border-white/10 transition-colors"
                        >
                            {showCandidates ? '후보 숨기기' : `후보 보기 ${pageDetections.length}`}
                        </button>
                        <button
                            onClick={handleDetect}
                            disabled={isDetecting}
                            className="press px-2 py-1.5 rounded-md bg-black/55 hover:bg-violet-500 text-white backdrop-blur-md border border-white/10 transition-colors disabled:opacity-60"
                            title="다시 인식 (약 ₩6)"
                        >
                            <RefreshCw className="w-3.5 h-3.5" strokeWidth={2} />
                        </button>

                        {/* 드래그 방식 — 정밀하게 직접 잡아야 할 때를 위해 눈에 보이게 둔다.
                            (Alt 를 누른 채 놓으면 일시적으로 '그린 대로'가 된다) */}
                        <div className="flex items-center rounded-md overflow-hidden border border-white/15 backdrop-blur-md ml-1">
                            {[
                                { on: true, label: '문제에 맞춤' },
                                { on: false, label: '그린 대로' },
                            ].map(({ on, label }) => (
                                <button
                                    key={label}
                                    onClick={() => updateSettings({ snapToProblem: on })}
                                    className={`px-2 py-1.5 text-[11px] font-medium transition-colors ${
                                        !!settings.snapToProblem === on
                                            ? 'bg-amber-400 text-zinc-950 font-semibold'
                                            : 'bg-black/55 text-zinc-300 hover:bg-black/75'
                                    }`}
                                    title={on
                                        ? '대충 드래그해도 인식된 문제 경계에 맞춰 잘립니다'
                                        : '그린 사각형 그대로 잘립니다 (문제 일부만 떼어낼 때)'}
                                >
                                    {label}
                                </button>
                            ))}
                        </div>
                    </>
                )}
            </div>

            {/* 검출 후보 — 클릭하면 담긴다 */}
            {actualScale !== null && showCandidates && pageDetections && canvas && pageDetections.map((cand, i) => {
                const added = isAdded(cand);
                const left = cand.x * canvas.width / actualScale;
                const top = cand.y * canvas.height / actualScale;
                const width = cand.width * canvas.width / actualScale;
                const height = cand.height * canvas.height / actualScale;
                return (
                    <button
                        key={`cand-${i}`}
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={() => !added && addCandidate(cand)}
                        className={`absolute group/cand border-2 border-dashed rounded-sm transition-colors ${
                            added
                                ? 'border-emerald-400/40 bg-emerald-400/[0.07] cursor-default'
                                : 'border-violet-400/70 bg-violet-400/[0.06] hover:bg-violet-400/20 hover:border-violet-300'
                        }`}
                        style={{ left: `${left}px`, top: `${top}px`, width: `${width}px`, height: `${height}px` }}
                        title={added ? '이미 담김' : '클릭하면 담깁니다'}
                    >
                        <span className={`absolute -top-2.5 left-1.5 px-1.5 py-0.5 rounded text-[10px] font-bold leading-none ${
                            added ? 'bg-emerald-400 text-zinc-950' : 'bg-violet-400 text-zinc-950'
                        }`}>
                            {added ? '담김' : (cand.label || '문제')}
                        </span>
                    </button>
                );
            })}

            {/* Existing Crops — gated on a real measurement to avoid flicker on remount */}
            {actualScale !== null && pageCrops.map(originalCrop => {
                const crop = (activeCropOverride && activeCropOverride.id === originalCrop.id)
                    ? { ...originalCrop, ...activeCropOverride }
                    : originalCrop;

                // 논리적 좌표 -> DOM 픽셀 변환
                const displayScale = renderScale / actualScale;
                const isCopied = copiedCropId === crop.id;
                return (
                    <div
                        key={crop.id}
                        className={`absolute border-2 transition-all ${isCopied
                            ? 'border-emerald-400 bg-emerald-400/20 z-30 shadow-[0_0_0_2px_rgba(52,211,153,0.4)]'
                            : selectedCropId === crop.id
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
                        {isCopied && (
                            <div className="absolute -top-2 left-1/2 -translate-x-1/2 -translate-y-full pointer-events-none">
                                <div className="px-2 py-1 rounded-md bg-emerald-500 text-white text-[11px] font-semibold shadow-lg whitespace-nowrap">
                                    ✓ 복사됨
                                </div>
                            </div>
                        )}
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
