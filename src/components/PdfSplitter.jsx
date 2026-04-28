import { useState, useRef, useEffect, useCallback } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorker from 'pdfjs-dist/build/pdf.worker.mjs?url';
import { PDFDocument } from 'pdf-lib';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import { motion, AnimatePresence } from 'framer-motion';
import { FileUp, Download, Trash2, CheckSquare, Square, Scissors, ChevronDown, ChevronUp, Loader2 } from 'lucide-react';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

const THUMB_SCALE = 0.3;

// --- Thumbnail Component ---
function PageThumb({ pdfDoc, pageNum, isSelected, isInRange, onClick }) {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const [rendered, setRendered] = useState(false);
  const [visible, setVisible] = useState(false);

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
        const vp = page.getViewport({ scale: THUMB_SCALE * 4 });
        const canvas = canvasRef.current;
        if (!canvas || cancelled) return;
        canvas.width = vp.width;
        canvas.height = vp.height;
        task = page.render({ canvasContext: canvas.getContext('2d'), viewport: vp });
        await task.promise;
        if (!cancelled) setRendered(true);
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
    ? 'border-white shadow-[0_0_0_2px_rgba(255,255,255,0.8)]'
    : isInRange
    ? 'border-white/50 shadow-[0_0_0_1px_rgba(255,255,255,0.3)]'
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
        <canvas
          ref={canvasRef}
          className={`block w-full h-auto ${rendered ? '' : 'opacity-0'}`}
        />
        {/* Selected overlay */}
        {isSelected && (
          <div className="absolute inset-0 bg-white/20 flex items-center justify-center">
            <div className="w-6 h-6 rounded-full bg-white flex items-center justify-center shadow-md">
              <CheckSquare className="w-4 h-4 text-black" />
            </div>
          </div>
        )}
        {isInRange && !isSelected && (
          <div className="absolute inset-0 bg-white/10" />
        )}
      </div>
      <span className={`text-xs font-medium tabular-nums transition-colors ${isSelected ? 'text-white' : 'text-white/40 group-hover:text-white/70'}`}>
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
      const doc = await pdfjsLib.getDocument(url).promise;
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
                className="border-2 border-dashed border-white/15 rounded-2xl p-16 text-center cursor-pointer transition-all hover:border-white/40 hover:bg-white/[0.03] flex flex-col items-center gap-4 w-full max-w-lg"
                onDragOver={handleDragOver}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
              >
                <div className="w-20 h-20 rounded-full bg-white/10 flex items-center justify-center text-white">
                  <FileUp size={36} />
                </div>
                <div>
                  <h3 className="m-0 text-lg font-semibold text-white mb-1">PDF 파일 업로드</h3>
                  <p className="m-0 text-sm text-white/40">클릭하거나 드래그하여 파일을 불러오세요</p>
                </div>
                <input type="file" accept="application/pdf" ref={fileInputRef} onChange={handleFileChange} className="hidden" />
              </div>
            </motion.div>
          ) : (
            <motion.div key="thumbs" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              {/* Selection hint bar */}
              <div className="flex items-center justify-between mb-4 px-1">
                <p className="text-xs text-white/30">
                  클릭: 단일 선택 &nbsp;·&nbsp; Shift+클릭: 범위 선택 &nbsp;·&nbsp; Ctrl+클릭: 추가 선택
                </p>
                <div className="flex items-center gap-2">
                  <button onClick={selectAll} className="text-xs text-white/50 hover:text-white transition-colors px-2 py-1 rounded hover:bg-white/5">
                    전체 선택
                  </button>
                  <button onClick={clearSelection} className="text-xs text-white/50 hover:text-white transition-colors px-2 py-1 rounded hover:bg-white/5">
                    선택 해제
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
            className="w-72 flex-shrink-0 border-l border-white/5 bg-black/30 flex flex-col overflow-hidden"
          >
            {/* File Info */}
            <div className="p-4 border-b border-white/5 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-white truncate">{file.name}</p>
                <p className="text-xs text-white/40 mt-0.5">{pageCount}p · {(file.size / 1024 / 1024).toFixed(1)} MB</p>
              </div>
              <button onClick={clearFile} className="p-1.5 text-white/30 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-all flex-shrink-0">
                <Trash2 size={16} />
              </button>
            </div>

            {/* Selected Pages Summary (collapsible) */}
            <div className="flex-1 overflow-y-auto custom-scrollbar">
              <button
                onClick={() => setPanelOpen(v => !v)}
                className="w-full flex items-center justify-between px-4 py-3 text-xs font-semibold text-white/50 uppercase tracking-widest hover:text-white/80 transition-colors"
              >
                <span>선택된 페이지 <span className="text-white ml-1">{selectedPages.size}</span></span>
                {panelOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
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
                          <Square className="w-8 h-8 text-white/10" />
                          <p className="text-xs text-white/30">왼쪽에서 페이지를<br/>클릭해 선택하세요</p>
                        </div>
                      ) : (
                        <div>
                          <p className="text-xs text-white/50 mb-3">
                            범위: <span className="text-white font-mono">{formatSelected(sortedSelected)}</span>
                          </p>
                          {/* Selected page chips */}
                          <div className="flex flex-wrap gap-1.5">
                            {sortedSelected.map(pg => (
                              <button
                                key={pg}
                                onClick={() => setSelectedPages(prev => {
                                  const n = new Set(prev); n.delete(pg); return n;
                                })}
                                className="text-xs px-2 py-0.5 rounded bg-white/10 text-white/70 hover:bg-red-500/20 hover:text-red-400 transition-all font-mono"
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
            <div className="p-4 border-t border-white/5">
              <button
                onClick={handleSplit}
                disabled={isProcessing || selectedPages.size === 0}
                className="premium-btn-primary w-full py-3 flex items-center justify-center gap-2 text-sm font-semibold disabled:opacity-30 disabled:cursor-not-allowed relative overflow-hidden"
              >
                {isProcessing ? (
                  <>
                    <div className="absolute inset-0 bg-black/10 transition-all duration-300" style={{ width: `${progress}%` }} />
                    <Loader2 size={16} className="animate-spin relative z-10" />
                    <span className="relative z-10">{progress}% 분할 중...</span>
                  </>
                ) : (
                  <>
                    <Scissors size={16} />
                    <span>{selectedPages.size > 0 ? `${selectedPages.size}페이지 분할` : '페이지를 선택하세요'}</span>
                  </>
                )}
              </button>
              {selectedPages.size > 0 && !isProcessing && (
                <p className="text-center text-xs text-white/30 mt-2">ZIP 파일로 다운로드됩니다</p>
              )}
            </div>
          </motion.aside>
        )}
      </AnimatePresence>
    </div>
  );
}
