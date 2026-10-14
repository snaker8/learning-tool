import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import CropOverlay from './CropOverlay';
import { useCropContext } from '../context/CropContext';
import { AiCropService } from '../services/AiCropService';
import { ImageGenerator } from '../services/ImageGenerator';
import { RotateCw, Scan, Lock, Unlock, ChevronLeft, ChevronRight } from 'lucide-react';
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

const PdfPage = React.memo(function PdfPage({ pdfDoc, pageNum, zoomScale, rotation = 0, onGlobalCrop, renderScale, numPages, baseSize }) {
    const containerRef = useRef(null);
    const canvasRef = useRef(null);
    const [canvasEl, setCanvasEl] = useState(null);
    // 회전하면 가로·세로가 뒤바뀐다. 예약 높이도 같이 돌아야 한다.
    const pageAspect = baseSize
        ? (rotation % 180 === 90 ? baseSize.h / baseSize.w : baseSize.w / baseSize.h)
        : null;
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
        <div
            id={`page-${pageNum}`}
            ref={containerRef}
            /* 🔴 높이를 미리 잡아둔다. 화면 밖으로 나가면 cleanup() 이 캔버스를 비우는데,
               예약이 없으면 칸이 쪼그라들어 아래 내용이 통째로 밀린다 — 여러 장을
               오갈 때 화면이 저절로 올라갔다 내려가던 원인 (2026-10-14). */
            style={pageAspect ? { aspectRatio: String(pageAspect) } : { minHeight: 800 }}
            className="relative group shadow-2xl rounded-lg overflow-hidden transition-transform duration-300 bg-white w-full max-w-[800px] flex flex-col items-center justify-center"
        >
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
                    numPages={numPages}
                />
            )}

            {/* Page Controls Overlay */}
            <div className="absolute top-2 right-2 flex items-center gap-1.5 z-50">
                <button
                    onClick={handleFullPageCrop}
                    className="press opacity-0 group-hover:opacity-100 bg-black/55 hover:bg-amber-400 hover:text-zinc-950 text-white p-1.5 rounded-md backdrop-blur-md border border-white/10 transition-all"
                    title="전체 페이지 선택"
                >
                    <Scan className="w-3.5 h-3.5" strokeWidth={1.75} />
                </button>
                {/* 쪽 번호는 항상 보인다 — 마우스를 올려야만 보이면 작업 중에 길을 잃는다 */}
                <div className="numeral bg-black/55 text-white text-[11px] px-2 py-1 rounded-md backdrop-blur-md border border-white/10 font-medium">
                    P. {pageNum}{numPages ? ` / ${numPages}` : ''}
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
    const [pageSizes, setPageSizes] = useState({});   // { [pageNum]: {w,h} } — 칸 높이 예약용
    const [rotation, setRotation] = useState(0);

    // 작업 페이지 고정 — 켜면 그 페이지만 띄운다. 스크롤이 아예 없으니
    // 드래그 중에 화면이 움직일 일이 없다 (2026-10-14 대표 요청).
    const [pinnedPage, setPinnedPage] = useState(null);

    const handleRotate = useCallback(() => {
        setRotation(prev => (prev + 90) % 360);
    }, []);

    /* 지금 화면 한가운데 있는 페이지. 고정을 켤 때 보던 페이지에 그대로 걸기 위한 것 —
       1쪽으로 튀어버리면 고정이 오히려 길을 잃게 만든다. */
    const currentPageInView = useCallback(() => {
        const mid = window.innerHeight / 2;
        let best = pages[0] || 1;
        let bestDist = Infinity;
        for (const n of pages) {
            const el = document.getElementById(`page-${n}`);
            if (!el) continue;
            const r = el.getBoundingClientRect();
            const d = Math.abs((r.top + r.bottom) / 2 - mid);
            if (d < bestDist) { bestDist = d; best = n; }
        }
        return best;
    }, [pages]);

    const togglePin = useCallback(() => {
        setPinnedPage(prev => (prev ? null : currentPageInView()));
    }, [currentPageInView]);

    // 고정 중이면 그 한 장만 그린다 — 스크롤할 것이 없으니 화면이 움직이지 않는다.
    const visiblePages = useMemo(
        () => (pinnedPage ? pages.filter(n => n === pinnedPage) : pages),
        [pages, pinnedPage]
    );

    useEffect(() => {
        if (!file) return;

        let objectUrl = null;
        let cancelled = false;
        setPageSizes({});
        setPinnedPage(null);
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

                // 각 페이지의 원래 크기를 미리 읽어 칸 높이를 예약한다 (스크롤 튐 방지).
                // getPage 는 메타데이터만 읽는 가벼운 호출이고, 읽은 뒤 바로 반납한다.
                const sizes = {};
                let idx = 1;
                const reader = async () => {
                    while (idx <= doc.numPages) {
                        const n = idx++;
                        try {
                            const pg = await doc.getPage(n);
                            const vp = pg.getViewport({ scale: 1, rotation: pg.rotate % 360 });
                            sizes[n] = { w: vp.width, h: vp.height };
                            pg.cleanup();
                        } catch { /* 크기를 못 읽으면 그 페이지만 기본값을 쓴다 */ }
                    }
                };
                await Promise.all(Array.from({ length: Math.min(8, doc.numPages) }, () => reader()));
                if (!cancelled) setPageSizes(sizes);
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
    const [progress, setProgress] = useState(null); // { done, total, from, to }

    // rect === null 이면 ROI 없이 "그 구간 모든 페이지의 모든 문제"를 검출한다.
    // (페이지 위 '전체 페이지' / '구간 지정' 버튼이 이 경로를 쓴다 — 드래그가 필요 없다)
    // range === null 이면 전체. { from, to } 를 주면 그 구간만 — 100페이지 교재에서
    // 필요한 단원만 돌릴 때 나머지 페이지 값을 버리지 않게 한다.
    const processGlobalCrop = useCallback(async (rect, range = null) => {
        if (!pdfDoc) return;

        const numPages = pdfDoc.numPages;
        const from = Math.max(1, Math.min(numPages, Math.floor(range?.from ?? 1)));
        const to = Math.max(from, Math.min(numPages, Math.floor(range?.to ?? numPages)));
        const pageList = Array.from({ length: to - from + 1 }, (_, i) => from + i);
        const totalPages = pageList.length;
        const isSubset = totalPages < numPages;

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
            toast.error(`${totalPages}페이지는 한 번에 처리할 수 없습니다 (한도 ${HARD_LIMIT}페이지). 구간을 나눠서 돌리거나 PDF 분할기로 나눈 뒤 다시 시도해주세요.`);
            return;
        }
        if (totalPages > CONFIRM_THRESHOLD) {
            const estCost = totalPages * PAGE_COST_KRW;
            const estSec = Math.round((totalPages / 4) * 5);
            const ok = await toast.confirm({
                title: isSubset
                    ? `${from}–${to} 페이지(${totalPages}장)에서 문제를 찾을까요?`
                    : `${totalPages}페이지 전체에서 문제를 찾을까요?`,
                message:
                    `예상 비용 약 ₩${estCost.toLocaleString()} (페이지당 ~₩${PAGE_COST_KRW})
` +
                    `예상 시간 약 ${estSec < 60 ? `${estSec}초` : `${Math.round(estSec / 60)}분`}.`,
                confirmLabel: '적용',
            });
            if (!ok) return;
        }

        setIsProcessing(true);
        setProgress({ done: 0, total: totalPages, from, to });
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
            let nextIdx = 0;
            const runner = async () => {
                while (nextIdx < pageList.length) {
                    const myPage = pageList[nextIdx++];
                    try { await processPage(myPage); }
                    catch (e) {
                        console.error(`page ${myPage} failed`, e);
                        failedPages.push(myPage);
                    }
                    setProgress((p) => (p ? { ...p, done: p.done + 1 } : p));
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
            setProgress(null);
        }
    }, [pdfDoc, rotation, RENDER_SCALE, addCrop, sortCrops, toast]);

    return (
        // 아래쪽 여백(pb-20) — 마지막 장이 화면 바닥에 딱 붙어 있으면 그 페이지
        // 하단을 드래그할 자리가 없다. 더 스크롤해서 위로 올릴 수 있게 띄워둔다.
        <div className="flex flex-col items-center gap-8 pt-2 pb-20 w-full max-w-[1200px]">
            {/* Global Toolbar */}
            <div className="glass-strong flex items-center justify-between px-5 py-3 rounded-xl w-full">
                <div className="flex items-center gap-3">
                    <span className="section-num">PREVIEW</span>
                    <div className="text-zinc-100 font-semibold text-[14px] tracking-tight">PDF</div>
                </div>
                <div className="flex items-center gap-2">
                    {/* 작업 페이지 고정 — 한 장만 띄워 스크롤 자체를 없앤다 */}
                    <div className={`flex items-stretch rounded-lg overflow-hidden border transition-colors ${
                        pinnedPage ? 'border-amber-400/40' : 'border-white/[0.08]'
                    }`}>
                        <button
                            onClick={togglePin}
                            className={`press flex items-center gap-2 px-3 py-1.5 text-[12.5px] font-medium transition-colors ${
                                pinnedPage
                                    ? 'bg-amber-400 text-zinc-950 font-semibold'
                                    : 'bg-white/[0.04] hover:bg-white/[0.08] text-zinc-200'
                            }`}
                            title={pinnedPage
                                ? '고정을 풀고 전체 페이지를 다시 띄웁니다'
                                : '한 페이지만 띄웁니다 — 드래그 중에 화면이 스크롤되지 않습니다'}
                        >
                            {pinnedPage ? <Lock className="w-3.5 h-3.5" strokeWidth={2} /> : <Unlock className="w-3.5 h-3.5" strokeWidth={2} />}
                            <span>{pinnedPage ? '페이지 고정됨' : '페이지 고정'}</span>
                        </button>
                        {pinnedPage && (
                            <div className="flex items-stretch bg-black/40">
                                <button
                                    onClick={() => setPinnedPage(p => Math.max(1, p - 1))}
                                    disabled={pinnedPage <= 1}
                                    className="press px-2 text-zinc-300 hover:text-white hover:bg-white/[0.08] disabled:opacity-30 transition-colors"
                                    title="이전 페이지"
                                >
                                    <ChevronLeft className="w-3.5 h-3.5" strokeWidth={2.5} />
                                </button>
                                <input
                                    type="number"
                                    min={1}
                                    max={pdfDoc?.numPages || 1}
                                    value={pinnedPage}
                                    onChange={(e) => {
                                        const n = parseInt(e.target.value, 10);
                                        if (Number.isFinite(n)) {
                                            setPinnedPage(Math.max(1, Math.min(pdfDoc?.numPages || 1, n)));
                                        }
                                    }}
                                    onFocus={(e) => e.target.select()}
                                    className="numeral w-[56px] bg-transparent text-center text-[12.5px] text-amber-300 font-semibold outline-none"
                                />
                                <span className="numeral flex items-center pr-2 text-[11.5px] text-zinc-500">
                                    / {pdfDoc?.numPages || '?'}
                                </span>
                                <button
                                    onClick={() => setPinnedPage(p => Math.min(pdfDoc?.numPages || p, p + 1))}
                                    disabled={pinnedPage >= (pdfDoc?.numPages || 1)}
                                    className="press px-2 text-zinc-300 hover:text-white hover:bg-white/[0.08] disabled:opacity-30 transition-colors"
                                    title="다음 페이지"
                                >
                                    <ChevronRight className="w-3.5 h-3.5" strokeWidth={2.5} />
                                </button>
                            </div>
                        )}
                    </div>
                    <button
                        onClick={handleRotate}
                        className="press flex items-center gap-2 bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] text-zinc-200 px-3.5 py-1.5 rounded-lg text-[12.5px] font-medium transition-colors"
                    >
                        <RotateCw className="w-3.5 h-3.5" strokeWidth={2} />
                        <span>회전 <span className="numeral text-amber-300">{rotation}°</span></span>
                    </button>
                </div>
            </div>

            {isProcessing && (
                <div className="fixed inset-0 z-[300] bg-black/70 flex flex-col items-center justify-center text-white backdrop-blur-md">
                    <div className="animate-spin rounded-full h-10 w-10 border-2 border-zinc-700 border-t-amber-400 mb-4"></div>
                    <div className="text-[15px] font-semibold tracking-tight">
                        {progress && progress.total < (pdfDoc?.numPages || 0)
                            ? `${progress.from}–${progress.to} 페이지 처리 중`
                            : '전체 페이지 처리 중'}
                    </div>
                    <div className="text-[12px] text-zinc-400 mt-1 numeral">
                        {progress ? `${progress.done} / ${progress.total} 페이지` : '잠시만 기다려주세요'}
                    </div>
                </div>
            )}

            {/* Progressive Page Rendering */}
            {visiblePages.map((pageNum) => (
                <PdfPage
                    key={`${pageNum}-${rotation}`}
                    pdfDoc={pdfDoc}
                    pageNum={pageNum}
                    zoomScale={zoomScale}
                    rotation={rotation}
                    onGlobalCrop={processGlobalCrop}
                    renderScale={RENDER_SCALE}
                    numPages={pdfDoc?.numPages || 0}
                    baseSize={pageSizes[pageNum]}
                />
            ))}
        </div>
    );
}


