import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import CropOverlay from './CropOverlay';
import { useCropContext } from '../context/CropContext';
import { AutoCropService } from '../services/AutoCropService';
import { ImageGenerator } from '../services/ImageGenerator';
import { RotateCw, Scan, Wand2 } from 'lucide-react';
import React from 'react'; // Added React import for React.memo

// Configure worker locally - we will need to copy the worker file to public or import it properly
// For Vite, a common pattern is:
import pdfWorker from 'pdfjs-dist/build/pdf.worker.mjs?url';
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

const PdfPage = React.memo(function PdfPage({ pdfDoc, pageNum, zoomScale, rotation = 0, onGlobalCrop, renderScale }) {
    const containerRef = useRef(null);
    const canvasRef = useRef(null);
    const [canvasEl, setCanvasEl] = useState(null);
    const [isRendered, setIsRendered] = useState(false);
    const [isVisible, setIsVisible] = useState(false);
    const [shouldMount, setShouldMount] = useState(false);
    const { settings, addCrop } = useCropContext();

    useEffect(() => {
        const observer = new IntersectionObserver(
            ([entry]) => {
                setIsVisible(entry.isIntersecting);
                if (entry.isIntersecting) {
                    setShouldMount(true);
                }
            },
            { rootMargin: '800px 0px' } // Load even earlier to prevent empty boxes
        );

        if (containerRef.current) {
            observer.observe(containerRef.current);
        }

        return () => {
            observer.disconnect();
        };
    }, []);

    const handleFullPageCrop = async () => {
        if (!canvasEl) return;
        const baseScale = renderScale;

        const rect = {
            x: 0,
            y: 0,
            width: canvasEl.width / baseScale,
            height: canvasEl.height / baseScale
        };

        const imageUrl = await ImageGenerator.generateCropImage(canvasEl, rect, baseScale);

        addCrop({
            pageNum,
            ...rect,
            imageUrl
        });
    };

    const runAutoCrop = async () => {
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

        for (const rect of regions) {
            const scaleinv = 1 / baseScale;
            const viewportRect = {
                x: rect.x * scaleinv,
                y: rect.y * scaleinv,
                width: rect.width * scaleinv,
                height: rect.height * scaleinv
            };

            const imageUrl = await ImageGenerator.generateCropImage(canvasEl, viewportRect, baseScale);

            addCrop({
                pageNum,
                ...viewportRect,
                imageUrl
            });
        }
    };

    useEffect(() => {
        let renderTask = null;
        let pageProxy = null;
        let isCancelled = false;

        const renderPage = async () => {
            if (!pdfDoc || !isVisible || !shouldMount) return;

            try {
                pageProxy = await pdfDoc.getPage(pageNum);

                if (isCancelled) {
                    pageProxy.cleanup();
                    return;
                }

                const totalRotation = (pageProxy.rotate + rotation) % 360;
                const viewport = pageProxy.getViewport({ scale: renderScale, rotation: totalRotation });

                const canvas = canvasRef.current;
                if (!canvas) return;

                const context = canvas.getContext('2d');
                canvas.height = viewport.height;
                canvas.width = viewport.width;

                const renderContext = {
                    canvasContext: context,
                    viewport: viewport,
                };

                renderTask = pageProxy.render(renderContext);
                await renderTask.promise;

                if (isCancelled) return;

                setIsRendered(true);
                setCanvasEl(canvas);

            } catch (error) {
                if (error.name !== 'RenderingCancelledException') {
                    console.error(`Error rendering page ${pageNum}:`, error);
                }
            }
        };

        const cleanup = () => {
            isCancelled = true;
            if (renderTask) {
                renderTask.cancel();
            }
            if (pageProxy) {
                pageProxy.cleanup();
            }
            if (canvasRef.current) {
                // Free GPU memory
                canvasRef.current.width = 0;
                canvasRef.current.height = 0;
            }
            setIsRendered(false);
            setCanvasEl(null);
        };

        if (isVisible && shouldMount) {
            renderPage();
        } else {
            cleanup();
        }

        return cleanup;
    }, [pdfDoc, pageNum, rotation, isVisible, shouldMount, renderScale]);

    return (
        <div id={`page-${pageNum}`} ref={containerRef} className="relative group shadow-2xl rounded-lg overflow-hidden transition-transform duration-300 hover:-translate-y-1 bg-white min-h-[800px] w-full max-w-[800px] flex flex-col items-center justify-center">
            {!shouldMount ? (
                <div className="text-slate-400 text-sm">Waiting to load Page {pageNum}...</div>
            ) : !isRendered ? (
                <div className="flex flex-col items-center justify-center gap-4 animate-pulse">
                    <div className="w-12 h-12 rounded-full border-4 border-slate-200 border-t-blue-500 animate-spin"></div>
                    <div className="text-slate-500 font-medium">Loading Page {pageNum}...</div>
                </div>
            ) : null}
            <canvas
                ref={canvasRef}
                className={`block max-w-full h-auto ${!isRendered ? 'hidden' : ''}`}
            />

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
});

export default function PdfViewer({ file, zoomScale }) {
    const { settings } = useCropContext();
    const RENDER_SCALE = settings.renderScale || 3.0;
    const [pdfDoc, setPdfDoc] = useState(null);
    const [pages, setPages] = useState([]);
    const [rotation, setRotation] = useState(0);

    const handleRotate = useCallback(() => {
        setRotation(prev => (prev + 90) % 360);
    }, []);

    useEffect(() => {
        if (!file) return;

        let objectUrl = null;

        const loadPdf = async () => {
            try {
                // Use Object URL instead of ArrayBuffer to prevent heavy memory usage for large files
                objectUrl = URL.createObjectURL(file);
                const doc = await pdfjsLib.getDocument(objectUrl).promise;
                setPdfDoc(doc);

                // Prepare page numbers
                const pageNums = Array.from({ length: doc.numPages }, (_, i) => i + 1);
                setPages(pageNums);
            } catch (error) {
                console.error("Error loading PDF:", error);
            }
        };

        loadPdf();

        return () => {
            if (objectUrl) {
                URL.revokeObjectURL(objectUrl);
            }
        };
    }, [file]);

    const { addCrop, crops } = useCropContext();
    const [isProcessing, setIsProcessing] = useState(false);

    const processGlobalCrop = useCallback(async (rect, sourcePageNum) => { // rect is in Unscaled Coord (Viewport / Scale)
        if (!pdfDoc) return;
        setIsProcessing(true);

        try {
            const totalPages = pdfDoc.numPages;
            const baseScale = RENDER_SCALE;

            const sensitivityScale = RENDER_SCALE / 1.5;
            const adjustedSensitivity = (settings.sensitivity || 30) * sensitivityScale;

            for (let i = 1; i <= totalPages; i++) {
                if (i % 5 === 0) {
                    await new Promise(resolve => setTimeout(resolve, 0));
                }

                const page = await pdfDoc.getPage(i);
                const totalRotation = (page.rotate + rotation) % 360;
                const viewport = page.getViewport({ scale: baseScale, rotation: totalRotation });

                const canvas = document.createElement('canvas');
                canvas.width = viewport.width;
                canvas.height = viewport.height;
                const context = canvas.getContext('2d');

                await page.render({ canvasContext: context, viewport }).promise;

                if (settings.autoCrop) {
                    const pixelRect = rect;
                    const refinedRects = AutoCropService.analyze(canvas, adjustedSensitivity, pixelRect);

                    for (const r of refinedRects) {
                        const unscaledRect = {
                            x: r.x / baseScale,
                            y: r.y / baseScale,
                            width: r.width / baseScale,
                            height: r.height / baseScale
                        };

                        const imageUrl = await ImageGenerator.generateCropImage(canvas, unscaledRect, baseScale);

                        addCrop({
                            pageNum: i,
                            ...unscaledRect,
                            imageUrl
                        });
                    }

                } else {
                    const unscaledRect = {
                        x: rect.x / baseScale,
                        y: rect.y / baseScale,
                        width: rect.width / baseScale,
                        height: rect.height / baseScale
                    };

                    const imageUrl = await ImageGenerator.generateCropImage(canvas, unscaledRect, baseScale);

                    addCrop({
                        pageNum: i,
                        ...unscaledRect,
                        imageUrl
                    });
                }

                canvas.width = 0;
                canvas.height = 0;
                page.cleanup();
            }
        } catch (e) {
            console.error("Global processing error", e);
        } finally {
            setIsProcessing(false);
        }
    }, [pdfDoc, rotation, RENDER_SCALE, settings.autoCrop, settings.sensitivity, addCrop]);

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

            {/* Progressive Page Rendering */}
            {pages.map((pageNum) => (
                <PdfPage
                    key={`${pageNum}-${rotation}`}
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


