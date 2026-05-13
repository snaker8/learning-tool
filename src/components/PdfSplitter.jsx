import { useState, useRef, useEffect, useCallback } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import { PDFDocument } from 'pdf-lib';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import { motion, AnimatePresence } from 'framer-motion';
import { FileUp, Download, Trash2, CheckSquare, Square, Scissors, ChevronDown, ChevronUp, Loader2 } from 'lucide-react';

// Use fixed public path to avoid MIME/CSP issues on Safari/macOS
pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';

const THUMB_SCALE = 0.3;

// Safari/macOS canvas memory detection
const isSafariSplitter = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);

// --- Thumbnail Component ---
function PageThumb({ pdfDoc, pageNum, isSelected, isInRange, onClick }) {
  const containerRef = useRef(null);
  const [rendered, setRendered] = useState(false);
  const [visible, setVisible] = useState(false);
  const [thumbSrc, setThumbSrc] = useState(null); // store as image instead of keeping canvas alive

  useEffect(() => {
    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) setVisible(true); },
      { rootMargin: '400px 0px' }
    );
    if (containerRef.current) obs.observe(containerRef.current);
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    if (!pdfDoc || !visible) return;
    let cancelled = false;
    let task = null;
    let page = null;

    const render = async () => {
      try {
        page = await pdfDoc.getPage(pageNum);
        // Lower scale on Safari to reduce per-thumb memory
        const scale = isSafariSplitter ? THUMB_SCALE * 2 : THUMB_SCALE * 4;
        const vp = page.getViewport({ scale });
        const canvas = document.createElement('canvas');
        canvas.width = vp.width;
        canvas.height = vp.height;
        task = page.render({ canvasContext: canvas.getContext('2d'), viewport: vp });
        await task.promise;
        if (!cancelled) {
          // Convert to image data URL immediately, then release canvas memory
          const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
          canvas.width = 0;
          canvas.height = 0;
          setThumbSrc(dataUrl);
          setRendered(true);
        } else {
          canvas.width = 0;
          canvas.height = 0;
        }
      } catch (e) {
        if (e.name !== 'RenderingCancelledException') console.error(e);
      }
    };
    render();
    return () => {
      cancelled = true;
      task?.cancel();
      page?.cleanup();
    };
  }, [pdfDoc, pageNum, visible]);

  const borderClass = isSelected
    ? 'border-amber-400 shadow-[0_0_0_2px_rgba(251,191,36,0.55),0_0_24px_-4px_rgba(251,191,36,0.55)]'
    : isInRange
    ? 'border-amber-400/50 shadow-[0_0_0_1px_rgba(251,191,36,0.3)]'
    : 'border-white/10 hover:border-white/30';

  return (
    <div
      ref={containerRef}
      onClick={onClick}
      className={`relative flex flex-col items-center gap-1.5 cursor-pointer select-none group`}
    >
      <div className={`relative rounded-lg overflow-hidden border-2 transition-all duration-150 ${borderClass} bg-white`}
        style={{ width: 120, minHeight: 160 }}>
        {!rendered && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/5">
            <Loader2 className="w-5 h-5 text-white/30 animate-spin" />
          </div>
        )}
        {thumbSrc ? (
          <img
            src={thumbSrc}
            alt={`Page ${pageNum}`}
            className="block w-full h-auto"
            draggable={false}
          />
        ) : null}
        {/* Selected overlay */}
        {isSelected && (
          <div className="absolute inset-0 bg-amber-400/15 flex items-center justify-center">
            <div className="w-6 h-6 rounded-full bg-amber-400 flex items-center justify-center shadow-md">
              <CheckSquare className="w-4 h-4 text-zinc-950" strokeWidth={2.5} />
            </div>
          </div>
        )}
        {isInRange && !isSelected && (
          <div className="absolute inset-0 bg-amber-400/10" />
        )}
      </div>
      <span className={`numeral text-[11px] font-medium tabular-nums transition-colors ${isSelected ? 'text-amber-300' : 'text-white/40 group-hover:text-white/70'}`}>
        {pageNum}
      </span>
    </div>
  );
}

// --- Main Component ---
export default function PdfSplitter() {
  const [file, setFile] = useState(null);
  const [pdfDoc, setPdfDoc] = useState(null);       // pdfjs doc (for preview)
  const [pageCount, setPageCount] = useState(0);
  const [selectedPages, setSelectedPages] = useState(new Set()); // 1-indexed
  const [lastClicked, setLastClicked] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [panelOpen, setPanelOpen] = useState(true);
  const fileInputRef = useRef(null);
  const objectUrlRef = useRef(null);

  // Cleanup on unmount / file change
  useEffect(() => {
    return () => {
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    };
  }, []);

  const loadFile = useCallback(async (f) => {
    if (!f || f.type !== 'application/pdf') {
      alert('올바른 PDF 파일을 선택해주세요.');
      return;
    }
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    const url = URL.createObjectURL(f);
    objectUrlRef.current = url;
    setFile(f);
    setSelectedPages(new Set());
    setLastClicked(null);
    try {
      const doc = await pdfjsLib.getDocument({
        url: url,
        cMapUrl: '/cmaps/',
        cMapPacked: true,
        standardFontDataUrl: '/standard_fonts/',
        useSystemFonts: false,
      }).promise;
      setPdfDoc(doc);
      setPageCount(doc.numPages);
    } catch (e) {
      console.error(e);
      alert('PDF를 불러오는데 실패했습니다.');
      setFile(null);
    }
  }, []);

  const handleFileChange = (e) => { if (e.target.files[0]) loadFile(e.target.files[0]); };
  const handleDragOver = (e) => e.preventDefault();
  const handleDrop = (e) => { e.preventDefault(); if (e.dataTransfer.files[0]) loadFile(e.dataTransfer.files[0]); };

  const handlePageClick = useCallback((pageNum, e) => {
    setSelectedPages(prev => {
      const next = new Set(prev);
      if (e.shiftKey && lastClicked !== null) {
        // Range select
        const lo = Math.min(lastClicked, pageNum);
        const hi = Math.max(lastClicked, pageNum);
        for (let i = lo; i <= hi; i++) next.add(i);
        return next;
      }
      if (e.ctrlKey || e.metaKey) {
        // Toggle
        next.has(pageNum) ? next.delete(pageNum) : next.add(pageNum);
        setLastClicked(pageNum);
        return next;
      }
      // Single click: toggle or clear-and-select
      if (next.size === 1 && next.has(pageNum)) {
        next.clear();
      } else {
        next.clear();
        next.add(pageNum);
      }
      setLastClicked(pageNum);
      return next;
    });
    if (!e.shiftKey) setLastClicked(pageNum);
  }, [lastClicked]);

  const selectAll = () => {
    const all = new Set();
    for (let i = 1; i <= pageCount; i++) all.add(i);
    setSelectedPages(all);
  };
  const clearSelection = () => setSelectedPages(new Set());

  const handleSplit = async () => {
    if (!file || selectedPages.size === 0) return;
    setIsProcessing(true);
    setProgress(0);
    try {
      const ab = await file.arrayBuffer();
      const srcDoc = await PDFDocument.load(ab);
      const zip = new JSZip();
      const pages = Array.from(selectedPages).sort((a, b) => a - b);

      for (let i = 0; i < pages.length; i++) {
        const pg = pages[i];
        const newDoc = await PDFDocument.create();
        const [copied] = await newDoc.copyPages(srcDoc, [pg - 1]);
        newDoc.addPage(copied);
        const bytes = await newDoc.save();
        zip.file(`page-${String(pg).padStart(3, '0')}.pdf`, bytes);
        setProgress(Math.round(((i + 1) / pages.length) * 100));
      }

      const blob = await zip.generateAsync({ type: 'blob' });
      saveAs(blob, `${file.name.replace('.pdf', '')}_split.zip`);
    } catch (e) {
      console.error(e);
      alert(e.message || '분할 중 오류가 발생했습니다.');
    } finally {
      setIsProcessing(false);
      setProgress(0);
    }
  };

  const clearFile = () => {
    if (objectUrlRef.current) { URL.revokeObjectURL(objectUrlRef.current); objectUrlRef.current = null; }
    setFile(null); setPdfDoc(null); setPageCount(0); setSelectedPages(new Set()); setLastClicked(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const sortedSelected = Array.from(selectedPages).sort((a, b) => a - b);

  // Format selected pages as compact ranges (e.g., 1-3, 5, 7-9)
  const formatSelected = (pages) => {
    if (pages.length === 0) return '없음';
    const ranges = [];
    let start = pages[0], end = pages[0];
    for (let i = 1; i < pages.length; i++) {
      if (pages[i] === end + 1) { end = pages[i]; }
      else { ranges.push(start === end ? `${start}` : `${start}-${end}`); start = end = pages[i]; }
    }
    ranges.push(start === end ? `${start}` : `${start}-${end}`);
    return ranges.join(', ');
  };

  return (
    <div className="w-full h-full flex overflow-hidden">
      {/* ─── Left: Thumbnail Grid ─── */}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
        <AnimatePresence mode="wait">
          {!file ? (
            <motion.div
              key="upload"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex items-center justify-center h-full min-h-[400px]"
            >
              <div
                className="relative border border-dashed border-white/[0.10] rounded-3xl p-16 text-center cursor-pointer transition-all hover:border-amber-400/30 hover:bg-amber-400/[0.02] flex flex-col items-center gap-4 w-full max-w-lg group glass"
                onDragOver={handleDragOver}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
              >
                <span className="absolute top-5 left-6 section-num">PDF · 분할기</span>
                <span className="absolute top-5 right-6 eyebrow">DRAG / CLICK</span>
                <div className="w-16 h-16 rounded-2xl glass flex items-center justify-center text-zinc-300 group-hover:text-amber-300 transition-colors">
                  <FileUp size={28} strokeWidth={1.5} />
                </div>
                <div className="space-y-1.5 mt-1">
                  <h3 className="m-0 text-[18px] font-semibold text-zinc-100 tracking-tight">PDF 파일 업로드</h3>
                  <p className="m-0 text-[13px] text-zinc-500">클릭하거나 드래그하여 파일을 불러오세요</p>
                </div>
                <input type="file" accept="application/pdf" ref={fileInputRef} onChange={handleFileChange} className="hidden" />
              </div>
            </motion.div>
          ) : (
            <motion.div key="thumbs" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              {/* Selection hint bar */}
              <div className="flex items-center justify-between mb-5 px-1">
                <p className="text-[11px] text-zinc-500">
                  <span className="mono">클릭</span> 단일 선택
                  <span className="mx-2 text-zinc-700">·</span>
                  <span className="mono">Shift+클릭</span> 범위 선택
                  <span className="mx-2 text-zinc-700">·</span>
                  <span className="mono">Ctrl+클릭</span> 추가 선택
                </p>
                <div className="flex items-center gap-1.5">
                  <button onClick={selectAll} className="press text-[11.5px] text-zinc-300 hover:text-zinc-50 transition-colors px-2.5 py-1.5 rounded-md hover:bg-white/5 border border-white/[0.06]">
                    전체 선택
                  </button>
                  <button onClick={clearSelection} className="press text-[11.5px] text-zinc-400 hover:text-zinc-100 transition-colors px-2.5 py-1.5 rounded-md hover:bg-white/5">
                    해제
                  </button>
                </div>
              </div>
              {/* Grid */}
              <div className="flex flex-wrap gap-4">
                {Array.from({ length: pageCount }, (_, i) => i + 1).map(pg => (
                  <PageThumb
                    key={pg}
                    pdfDoc={pdfDoc}
                    pageNum={pg}
                    isSelected={selectedPages.has(pg)}
                    isInRange={false}
                    onClick={(e) => handlePageClick(pg, e)}
                  />
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ─── Right: Settings Panel ─── */}
      <AnimatePresence>
        {file && (
          <motion.aside
            initial={{ x: 320, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 320, opacity: 0 }}
            transition={{ type: 'spring', damping: 28, stiffness: 300 }}
            className="w-72 flex-shrink-0 border-l border-white/[0.06] bg-[rgba(13,13,16,0.65)] backdrop-blur-2xl flex flex-col overflow-hidden"
          >
            {/* File Info */}
            <div className="px-4 pt-4 pb-3 border-b border-white/[0.05]">
              <span className="section-num">FILE</span>
              <div className="mt-2 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[13px] font-semibold text-zinc-100 truncate tracking-tight">{file.name}</p>
                  <p className="numeral text-[11px] text-zinc-500 mt-0.5">{pageCount}p · {(file.size / 1024 / 1024).toFixed(1)} MB</p>
                </div>
                <button onClick={clearFile} className="press p-1.5 text-zinc-500 hover:text-red-400 hover:bg-red-500/10 rounded-md transition-colors flex-shrink-0">
                  <Trash2 size={15} strokeWidth={1.75} />
                </button>
              </div>
            </div>

            {/* Selected Pages Summary (collapsible) */}
            <div className="flex-1 overflow-y-auto custom-scrollbar">
              <button
                onClick={() => setPanelOpen(v => !v)}
                className="w-full flex items-center justify-between px-4 py-3 hover:bg-white/[0.02] transition-colors"
              >
                <div className="flex items-center gap-2.5">
                  <span className="eyebrow">선택된 페이지</span>
                  <span className="numeral text-[12px] px-1.5 py-px rounded bg-amber-400/10 border border-amber-400/25 text-amber-300">
                    {selectedPages.size}
                  </span>
                </div>
                {panelOpen ? <ChevronUp size={13} className="text-zinc-500" /> : <ChevronDown size={13} className="text-zinc-500" />}
              </button>

              <AnimatePresence>
                {panelOpen && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="px-4 pb-4">
                      {selectedPages.size === 0 ? (
                        <div className="flex flex-col items-center gap-2 py-8 text-center">
                          <Square className="w-7 h-7 text-zinc-700" strokeWidth={1.5} />
                          <p className="text-[11px] text-zinc-500 leading-relaxed">왼쪽에서 페이지를<br/>클릭해 선택하세요</p>
                        </div>
                      ) : (
                        <div>
                          <p className="text-[11px] text-zinc-500 mb-3">
                            범위 <span className="numeral ml-1 text-amber-300">{formatSelected(sortedSelected)}</span>
                          </p>
                          {/* Selected page chips */}
                          <div className="flex flex-wrap gap-1">
                            {sortedSelected.map(pg => (
                              <button
                                key={pg}
                                onClick={() => setSelectedPages(prev => {
                                  const n = new Set(prev); n.delete(pg); return n;
                                })}
                                className="numeral press text-[11px] px-1.5 py-0.5 rounded bg-white/[0.04] text-zinc-300 hover:bg-red-500/20 hover:text-red-300 border border-white/[0.06] hover:border-red-500/30 transition-colors"
                                title="클릭해서 제거"
                              >
                                {pg}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Action Button */}
            <div className="p-4 border-t border-white/[0.05]">
              <button
                onClick={handleSplit}
                disabled={isProcessing || selectedPages.size === 0}
                className="premium-btn-primary w-full py-3 flex items-center justify-center gap-2 text-[13px] relative overflow-hidden press"
              >
                {isProcessing ? (
                  <>
                    <div className="absolute inset-0 bg-black/15 transition-all duration-300" style={{ width: `${progress}%` }} />
                    <Loader2 size={14} className="animate-spin relative z-10" strokeWidth={2.25} />
                    <span className="relative z-10 numeral">{progress}% 분할 중</span>
                  </>
                ) : (
                  <>
                    <Scissors size={14} strokeWidth={2.25} />
                    <span>{selectedPages.size > 0 ? `${selectedPages.size}페이지 분할` : '페이지를 선택하세요'}</span>
                  </>
                )}
              </button>
              {selectedPages.size > 0 && !isProcessing && (
                <p className="text-center text-[11px] text-zinc-500 mt-2">ZIP 파일로 다운로드됩니다</p>
              )}
            </div>
          </motion.aside>
        )}
      </AnimatePresence>
    </div>
  );
}
