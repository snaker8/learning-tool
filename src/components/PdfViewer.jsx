import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import CropOverlay from './CropOverlay';
import { useCropContext } from '../context/CropContext';
import { AiCropService } from '../services/AiCropService';
import { ImageGenerator } from '../services/ImageGenerator';
import { RotateCw, Scan } from 'lucide-react';
import React from 'react'; // Added React import for React.memo
import { useToast } from '../context/ToastContext';

// Use fixed public path to avoid MIME/CSP issues on Safari/macOS
pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';

// Safari/macOS has stricter canvas memory limits (~256-450MB)
// Fix: reduce rootMargin so only 3-4 pages render simultaneously (safe even at 3.0x)
const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
// 한 페이지 캔버스는 3.0배율에서 1,785×2,526 = 약 18MB 다. rootMargin 이 넓으면
// 그만큼 여러 장이 동시에 메모리에 올라간다. 800px 에서는 화면 밖 위·아래로
// 각각 한 장씩 더 붙잡고 있었다 (2026-10-06 메모리 점검).
const SAFARI_ROOT_MARGIN = '200px 0px';
const DEFAULT_ROOT_MARGIN = '400px 0px';

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
            { rootMargin: isSafari ? SAFARI_ROOT_MARGIN : DEFAULT_ROOT_MARGIN }
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

        const { imageUrl, thumbUrl } = await ImageGenerator.generateCrop(canvasEl, rect, baseScale);

        addCrop({
            pageNum,
            ...rect,
            imageUrl,
            thumbUrl
        });
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

                canvas.height = viewport.height;
                canvas.width = viewport.width;
                // willReadFrequently 를 쓰지 않는다 — 켜면 캔버스가 GPU 가속을
                // 포기하고 CPU 메모리에 올라간다. 픽셀을 직접 읽던 AutoCropService
                // 를 삭제한 뒤로 이 페이지 캔버스에서 getImageData 를 호출하는
                // 코드가 하나도 없는데 플래그만 남아 있었다 (2026-10-06).
                const context = canvas.getContext('2d');

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
                <div className="text-zinc-400 text-sm mono">Page {pageNum} 대기 중…</div>
            ) : !isRendered ? (
                <div className="flex flex-col items-center justify-center gap-4">
                    <div className="w-10 h-10 rounded-full border-2 border-zinc-200 border-t-amber-400 animate-spin"></div>
                    <div className="text-zinc-500 font-medium mono text-[12px]">Loading Page {pageNum}…</div>
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
            <div className="absolute top-2 right-2 flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity z-50">
                <button
                    onClick={handleFullPageCrop}
                    className="press bg-black/55 hover:bg-amber-400 hover:text-zinc-950 text-white p-1.5 rounded-md backdrop-blur-md border border-white/10 transition-colors"
                    title="전체 페이지 선택"
                >
                    <Scan className="w-3.5 h-3.5" strokeWidth={1.75} />
                </button>
                <div className="numeral bg-black/55 text-white text-[11px] px-2 py-1 rounded-md backdrop-blur-md border border-white/10 font-medium">
                    P. {pageNum}
                </div>
            </div>
        </div>
    );
});

export default function PdfViewer({ file, zoomScale }) {
    const toast = useToast();
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
        let cancelled = false;
        let loadedDoc = null;

        // ★ 새 PDF 로드 시작 전에 이전 doc/pages 를 먼저 비워서 PdfPage들을
        // 언마운트시킨다 (canvas/render 리소스 즉시 해제). 이렇게 안 하면
        // 이전 PDF의 페이지들이 새 doc 로드 동안 함께 메모리 잔존 → 큰
        // 파일에선 "응답없음" 으로 팅긴다.
        setPdfDoc(prev => {
            if (prev) prev.destroy().catch(() => {});
            return null;
        });
        setPages([]);

        const loadPdf = async () => {
            try {
                objectUrl = URL.createObjectURL(file);
                const doc = await pdfjsLib.getDocument({
                    url: objectUrl,
                    cMapUrl: '/cmaps/',
                    cMapPacked: true,
                    standardFontDataUrl: '/standard_fonts/',
                    useSystemFonts: false,
                }).promise;
                if (cancelled) {
                    doc.destroy().catch(() => {});
                    return;
                }
                loadedDoc = doc;
                setPdfDoc(doc);
                setPages(Array.from({ length: doc.numPages }, (_, i) => i + 1));
            } catch (error) {
                console.error("Error loading PDF:", error);
            }
        };

        loadPdf();

        return () => {
            cancelled = true;
            if (objectUrl) URL.revokeObjectURL(objectUrl);
            if (loadedDoc) loadedDoc.destroy().catch(() => {});
        };
    }, [file]);

    const { addCrop, crops, sortCrops } = useCropContext();
    const [isProcessing, setIsProcessing] = useState(false);

    // rect === null 이면 ROI 없이 "모든 페이지의 모든 문제"를 검출한다.
    // (페이지 위 '전체 페이지' 버튼이 이 경로를 쓴다 — 드래그가 필요 없다)
    const processGlobalCrop = useCallback(async (rect) => {
        if (!pdfDoc) return;

        const totalPages = pdfDoc.numPages;

        // 비용 폭주 방지 — 많은 페이지에 AI 일괄 적용 시 사용자 확인.
        // 페이지당 단가(실측, 2026-10-05):
        //   요청 1회 = 입력 1,912 tok + 출력 138 tok + 사고 641 tok (5페이지 평균)
        //   gemini-3.8-flash $0.75/$3.75 per 1M (2026-12-31 까지 프로모션가)
        //   → $0.0044/페이지 ≈ ₩6 (환율 1,400원 가정). 100페이지 ≈ ₩610.
        //   참고: 이전 gemini-2.5-pro 는 사고 토큰이 10배라 ₩23/페이지였다.
        //   2027-01-01 부터 단가가 2배가 되므로 그때 PAGE_COST_KRW 를 12로 올릴 것.
        const PAGE_COST_KRW = 6;
        const HARD_LIMIT = 300;
        const CONFIRM_THRESHOLD = 30;
        if (totalPages > HARD_LIMIT) {
            toast.error(`${totalPages}페이지는 한 번에 처리할 수 없습니다 (한도 ${HARD_LIMIT}페이지). PDF 분할기로 나눈 뒤 다시 시도해주세요.`);
            return;
        }
        if (totalPages > CONFIRM_THRESHOLD) {
            const estCost = totalPages * PAGE_COST_KRW;
            const estSec = Math.round((totalPages / 4) * 5);
            const ok = await toast.confirm({
                title: `${totalPages}페이지 전체에서 문제를 찾을까요?`,
                message:
                    `예상 비용 약 ₩${estCost.toLocaleString()} (페이지당 ~₩${PAGE_COST_KRW})
` +
                    `예상 시간 약 ${estSec < 60 ? `${estSec}초` : `${Math.round(estSec / 60)}분`}.`,
                confirmLabel: '적용',
            });
            if (!ok) return;
        }

        setIsProcessing(true);
        const failedPages = [];

        try {
            const baseScale = RENDER_SCALE;

            const processPage = async (pageNum) => {
                const page = await pdfDoc.getPage(pageNum);
                let canvas = null;
                try {
                    const totalRotation = (page.rotate + rotation) % 360;
                    const viewport = page.getViewport({ scale: baseScale, rotation: totalRotation });

                    canvas = document.createElement('canvas');
                    canvas.width = viewport.width;
                    canvas.height = viewport.height;
                    const context = canvas.getContext('2d');
                    await page.render({ canvasContext: context, viewport }).promise;

                    {
                        // AI 검출만 쓴다. 픽셀 분석 폴백은 제거했다 —
                        // 실측에서 과검출이 심해(한 페이지 4문제를 7~11개로 반환)
                        // 조용히 틀린 결과를 주는 것보다 실패를 알리는 편이 낫다.
                        const refinedRects = await AiCropService.detectProblems(canvas, rect || null);
                        if (!refinedRects || refinedRects.length === 0) {
                            failedPages.push(pageNum);
                            return;
                        }

                        for (const r of refinedRects) {
                            const unscaledRect = {
                                x: r.x / baseScale,
                                y: r.y / baseScale,
                                width: r.width / baseScale,
                                height: r.height / baseScale,
                            };
                            const { imageUrl, thumbUrl } = await ImageGenerator.generateCrop(canvas, unscaledRect, baseScale);
                            // label은 Gemini가 반환한 문제 번호 ("01", "10" 등).
                            // 자동 정렬 시 사용.
                            addCrop({ pageNum, ...unscaledRect, imageUrl, thumbUrl, label: r.label || '' });
                        }
                    }
                } finally {
                    if (canvas) { canvas.width = 0; canvas.height = 0; }
                    page.cleanup();
                }
            };

            // 페이지 병렬 처리 — concurrency 4 (Cloud Function maxInstances=2,
            // 각 instance가 다중 요청 처리 가능하지만 과한 fan-out 방지).
            const CONCURRENCY = 4;
            let nextIdx = 1;
            const runner = async () => {
                while (nextIdx <= totalPages) {
                    const myPage = nextIdx++;
                    try { await processPage(myPage); }
                    catch (e) {
                        console.error(`page ${myPage} failed`, e);
                        failedPages.push(myPage);
                    }
                }
            };
            await Promise.all(
                Array.from({ length: Math.min(CONCURRENCY, totalPages) }, () => runner())
            );
            // 페이지가 병렬로 처리되어 addCrop 순서가 섞일 수 있으므로
            // 끝나면 page → y 순으로 자동 재정렬한다.
            sortCrops();
            if (failedPages.length) {
                const shown = failedPages.sort((a, b) => a - b).slice(0, 10).join(', ');
                toast.error(
                    `${failedPages.length}개 페이지에서 문제를 찾지 못했습니다 (p${shown}${failedPages.length > 10 ? ' 외' : ''}). ` +
                    `해당 페이지는 직접 드래그해서 잘라주세요.`
                );
            }
        } catch (e) {
            console.error("Global processing error", e);
        } finally {
            setIsProcessing(false);
        }
    }, [pdfDoc, rotation, RENDER_SCALE, addCrop, sortCrops, toast]);

    return (
        <div className="flex flex-col items-center gap-8 py-2 w-full max-w-[1200px]">
            {/* Global Toolbar */}
            <div className="glass-strong flex items-center justify-between px-5 py-3 rounded-xl w-full">
                <div className="flex items-center gap-3">
                    <span className="section-num">PREVIEW</span>
                    <div className="text-zinc-100 font-semibold text-[14px] tracking-tight">PDF</div>
                </div>
                <button
                    onClick={handleRotate}
                    className="press flex items-center gap-2 bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] text-zinc-200 px-3.5 py-1.5 rounded-lg text-[12.5px] font-medium transition-colors"
                >
                    <RotateCw className="w-3.5 h-3.5" strokeWidth={2} />
                    <span>회전 <span className="numeral text-amber-300">{rotation}°</span></span>
                </button>
            </div>

            {isProcessing && (
                <div className="fixed inset-0 z-[300] bg-black/70 flex flex-col items-center justify-center text-white backdrop-blur-md">
                    <div className="animate-spin rounded-full h-10 w-10 border-2 border-zinc-700 border-t-amber-400 mb-4"></div>
                    <div className="text-[15px] font-semibold tracking-tight">전체 페이지 처리 중</div>
                    <div className="text-[12px] text-zinc-400 mt-1">잠시만 기다려주세요</div>
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


