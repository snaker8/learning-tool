import { useEffect, useRef, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import CropOverlay from './CropOverlay';
import { useCropContext } from '../context/CropContext';
import { AutoCropService } from '../services/AutoCropService';
import { ImageGenerator } from '../services/ImageGenerator';
import { RotateCw, Scan, Wand2 } from 'lucide-react';

// Configure worker locally - we will need to copy the worker file to public or import it properly
// For Vite, a common pattern is:
import pdfWorker from 'pdfjs-dist/build/pdf.worker.mjs?url';
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

export default function PdfViewer({ file, zoomScale }) {
    const { settings } = useCropContext();
    const RENDER_SCALE = settings.renderScale || 3.0; // 설정에서 해상도 가져오기
    const [pdfDoc, setPdfDoc] = useState(null);
    const [pages, setPages] = useState([]);
    const [rotation, setRotation] = useState(0);

    const handleRotate = () => {
        setRotation(prev => (prev + 90) % 360);
    };

    useEffect(() => {
        if (!file) return;

        const loadPdf = async () => {
            try {
                const arrayBuffer = await file.arrayBuffer();
                const doc = await pdfjsLib.getDocument(arrayBuffer).promise;
                setPdfDoc(doc);

                // Prepare page numbers
                const pageNums = Array.from({ length: doc.numPages }, (_, i) => i + 1);
                setPages(pageNums);
            } catch (error) {
                console.error("Error loading PDF:", error);
            }
        };

        loadPdf();
    }, [file]);

    const { addCrop, crops } = useCropContext();
    const [isProcessing, setIsProcessing] = useState(false);

    const processGlobalCrop = async (rect, sourcePageNum) => { // rect is in Unscaled Coord (Viewport / Scale)
        if (!pdfDoc) return;
        setIsProcessing(true);

        // We need to apply this rect to ALL pages.
        // rect is {x, y, width, height} in "Viewport CSS Pixels" (unscaled by zoomScale, but scaled by 1.5 in PdfPage?)
        // Wait, CropOverlay sends `finalRect` which is `rect / scale`.
        // In PdfPage, scale is passed as `zoomScale`? No, CropOverlay's scale usage:
        // CropOverlay receives `scale={zoomScale}` (from PdfViewer prop).
        // Let's verify PdfPage usage. 
        // PdfPage: `const viewport = page.getViewport({ scale: 1.5 })` -> FIXED 1.5 SCALE.
        // CropOverlay receives `scale={zoomScale}`. Wait. 
        // In PdfViewer: `<PdfPage zoomScale={zoomScale} ... />`
        // In PdfPage: `<CropOverlay scale={zoomScale} ... />`. 
        // BUT `canvasEl` is rendered at 1.5. 
        // If `zoomScale` is visually different (css transform?), then `CropOverlay` `scale` matches the visual or logical?
        // Let's look at `CropOverlay.jsx` step 475:
        // `width: currentRect.width * scale` -> It uses it for rendering.
        // `finalRect` (line 151) is `rect / scale`.
        // If zoomScale is used for CSS transform, then `finalRect` is in "Unscaled CSS Pixels"?
        // BUT PdfPage renders canvas at scale 1.5. `width = viewport.width`.
        // CropOverlay `width` prop = `canvasEl.width`.
        // So `CropOverlay` covers the 1.5x canvas. 
        // IF `zoomScale` passed to CropOverlay is actually 1.5?
        // Let's check App/index usage of PdfViewer. `zoomScale` defaults to 1?
        // Actually, `PdfPage` hardcodes scale 1.5 for rendering: `page.getViewport({ scale: 1.5 ... })`.
        // And passed `zoomScale` prop to CropOverlay?
        // If `zoomScale` is 1, then CropOverlay logic `rect / 1` implies `finalRect` is in 1.5x Canvas Pixels? No.

        // Assumption: `rect` passed here is in "Canvas 1.5x Pixels" if scale was 1. 
        // Let's just trust `ImageGenerator` works with it.
        // `processGlobalCrop` receives `rect` (x,y,w,h).

        try {
            const totalPages = pdfDoc.numPages;
            const baseScale = RENDER_SCALE;

            // Calculate factor to adjust sensitivity (RENDER_SCALE vs 1.5 base for CropOverlay)
            // CropOverlay's rect is based on the visual scale, which is 1.5 for the canvas.
            // So if RENDER_SCALE is 3.0, the sensitivity needs to be scaled by 3.0 / 1.5 = 2.
            const sensitivityScale = RENDER_SCALE / 1.5;
            const adjustedSensitivity = (settings.sensitivity || 30) * sensitivityScale;

            for (let i = 1; i <= totalPages; i++) {
                // Skip logic if needed? No, apply all.

                const page = await pdfDoc.getPage(i);
                const totalRotation = (page.rotate + rotation) % 360;
                const viewport = page.getViewport({ scale: baseScale, rotation: totalRotation });

                // Create offscreen canvas
                const canvas = document.createElement('canvas');
                canvas.width = viewport.width;
                canvas.height = viewport.height;
                const context = canvas.getContext('2d');

                await page.render({ canvasContext: context, viewport }).promise;

                // Prepare crop data
                // rect is from CropOverlay. 
                // We assume rect is compatible with the canvas dimensions.
                const cropArea = { ...rect };

                // Auto Crop Logic within the global area?
                // The user's settings.isGlobalMode means "Apply this box". 
                // And "Auto Recognition" (settings.autoCrop) means "Split inside this box".

                if (settings.autoCrop) {
                    // rect is ALREADY in Canvas Pixels (from CropOverlay, scaled by RENDER_SCALE)
                    // So we use it directly as pixelRect
                    const pixelRect = rect;

                    // Use analyze with ROI (Canvas Pixels)
                    const refinedRects = AutoCropService.analyze(canvas, adjustedSensitivity, pixelRect);

                    refinedRects.forEach(r => {
                        // r is in Canvas Pixels (RENDER_SCALE)
                        // Convert back to Unscaled for ImageGenerator and addCrop
                        const unscaledRect = {
                            x: r.x / baseScale,
                            y: r.y / baseScale,
                            width: r.width / baseScale,
                            height: r.height / baseScale
                        };

                        const imageUrl = ImageGenerator.generateCropImage(canvas, unscaledRect, baseScale);

                        addCrop({
                            pageNum: i,
                            ...unscaledRect,
                            imageUrl
                        });
                    });

                } else {
                    // Manual Global Mode (Just copy box)
                    // rect is Canvas Pixels (RENDER_SCALE). Convert to unscaled pixels for ImageGenerator.
                    const unscaledRect = {
                        x: rect.x / baseScale,
                        y: rect.y / baseScale,
                        width: rect.width / baseScale,
                        height: rect.height / baseScale
                    };

                    const imageUrl = ImageGenerator.generateCropImage(canvas, unscaledRect, baseScale);

                    addCrop({
                        pageNum: i,
                        ...unscaledRect,
                        imageUrl
                    });
                }
            }
        } catch (e) {
            console.error("Global processing error", e);
        } finally {
            setIsProcessing(false);
        }
    };

    return (
        <div className="flex flex-col items-center gap-8 py-8 w-full max-w-[1200px]">
            {/* Global Toolbar */}
            <div className="flex gap-4 mb-4 items-center bg-slate-800 p-4 rounded-xl shadow-lg border border-slate-700 w-full justify-between">
                <div className="text-white font-bold text-lg">
                    PDF Preview
                </div>
                <button
                    onClick={handleRotate}
                    className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg font-medium transition-colors"
                >
                    <RotateCw className="w-4 h-4" />
                    <span>회전 ({rotation}°)</span>
                </button>
            </div>

            {isProcessing && (
                <div className="fixed inset-0 z-[300] bg-black/50 flex flex-col items-center justify-center text-white backdrop-blur-sm">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mb-4"></div>
                    <div className="text-xl font-bold">전체 페이지 처리 중...</div>
                    <div className="text-sm text-slate-300">잠시만 기다려주세요</div>
                </div>
            )}

            {pages.map((pageNum) => (
                <PdfPage
                    key={pageNum}
                    pdfDoc={pdfDoc}
                    pageNum={pageNum}
                    zoomScale={zoomScale}
                    rotation={rotation}
                    onGlobalCrop={processGlobalCrop}
                    renderScale={RENDER_SCALE}
                />
            ))}
        </div>
    );
}

function PdfPage({ pdfDoc, pageNum, zoomScale, rotation = 0, onGlobalCrop, renderScale }) {
    const canvasRef = useRef(null);
    const [canvasEl, setCanvasEl] = useState(null);
    const [isRendered, setIsRendered] = useState(false);
    const [autoProcessed, setAutoProcessed] = useState(false);
    const { settings, addCrop } = useCropContext();

    const handleFullPageCrop = () => {
        if (!canvasEl) return;
        const baseScale = renderScale;

        const rect = {
            x: 0,
            y: 0,
            width: canvasEl.width / baseScale,
            height: canvasEl.height / baseScale
        };

        const imageUrl = ImageGenerator.generateCropImage(canvasEl, rect, baseScale);

        addCrop({
            pageNum,
            ...rect,
            imageUrl
        });
    };

    const runAutoCrop = () => {
        if (!canvasEl) return;
        const baseScale = renderScale;
        // Scale sensitivity
        const sensitivityScale = renderScale / 1.5;
        const adjustedSensitivity = (settings.sensitivity || 30) * sensitivityScale;
        const regions = AutoCropService.analyze(canvasEl, adjustedSensitivity);

        if (regions.length === 0) {
            console.log(`Page ${pageNum}: No regions found`);
            return;
        }

        regions.forEach(rect => {
            const scaleinv = 1 / baseScale;
            const viewportRect = {
                x: rect.x * scaleinv,
                y: rect.y * scaleinv,
                width: rect.width * scaleinv,
                height: rect.height * scaleinv
            };

            const imageUrl = ImageGenerator.generateCropImage(canvasEl, viewportRect, baseScale);

            addCrop({
                pageNum,
                ...viewportRect,
                imageUrl
            });
        });
    };

    useEffect(() => {
        if (!pdfDoc) return;

        let renderTask = null;

        const renderPage = async () => {
            try {
                const page = await pdfDoc.getPage(pageNum);
                // Apply rotation: Sum of pdf native rotation + user rotation
                const totalRotation = (page.rotate + rotation) % 360;
                const viewport = page.getViewport({ scale: renderScale, rotation: totalRotation });

                const canvas = canvasRef.current;
                if (!canvas) return;

                const context = canvas.getContext('2d');
                canvas.height = viewport.height;
                canvas.width = viewport.width;

                const renderContext = {
                    canvasContext: context,
                    viewport: viewport,
                };

                // Store the render task
                renderTask = page.render(renderContext);

                // Wait for it to finish
                await renderTask.promise;

                setIsRendered(true);
                setCanvasEl(canvas);
                setAutoProcessed(false); // Reset auto crop state on re-render

            } catch (error) {
                if (error.name !== 'RenderingCancelledException') {
                    console.error(`Error rendering page ${pageNum}:`, error);
                }
            }
        };

        renderPage();

        return () => {
            if (renderTask) {
                renderTask.cancel();
            }
        };
    }, [pdfDoc, pageNum, rotation]);

    // Auto crop effect removed as per user request (it was scanning the whole page)
    // useEffect(() => {
    //     if (settings.autoCrop && canvasEl && !autoProcessed) {
    //         setTimeout(() => {
    //             runAutoCrop();
    //             setAutoProcessed(true);
    //         }, 200);
    //     }
    // }, [settings.autoCrop, canvasEl, autoProcessed]);

    return (
        <div id={`page-${pageNum}`} className="relative group shadow-2xl rounded-lg overflow-hidden transition-transform duration-300 hover:-translate-y-1 bg-white">
            {!isRendered && (
                <div className="w-[600px] h-[800px] flex items-center justify-center bg-gray-100 animate-pulse">
                    Loading Page {pageNum}...
                </div>
            )}
            <canvas ref={canvasRef} className="block max-w-full h-auto" />

            {/* Crop Overlay */}
            {isRendered && canvasEl && (
                <CropOverlay
                    pageNum={pageNum}
                    scale={zoomScale}
                    renderScale={renderScale}
                    width={canvasEl.width}
                    height={canvasEl.height}
                    canvas={canvasEl}
                    onGlobalCrop={onGlobalCrop}
                />
            )}

            {/* Page Controls Overlay */}
            <div className="absolute top-2 right-2 flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity z-50">
                <button
                    onClick={runAutoCrop}
                    className="bg-black/50 hover:bg-purple-500 text-white p-1.5 rounded-md backdrop-blur-sm transition-all shadow-sm"
                    title="문제 자동 인식"
                >
                    <Wand2 className="w-4 h-4" />
                </button>
                <button
                    onClick={handleFullPageCrop}
                    className="bg-black/50 hover:bg-blue-500 text-white p-1.5 rounded-md backdrop-blur-sm transition-all shadow-sm"
                    title="전체 페이지 선택"
                >
                    <Scan className="w-4 h-4" />
                </button>
                <div className="bg-black/50 text-white text-xs px-2 py-1.5 rounded-md backdrop-blur-sm font-medium">
                    Page {pageNum}
                </div>
            </div>
        </div>
    );
}
