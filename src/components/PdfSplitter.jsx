import { useState, useRef, useEffect, useCallback } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import { PDFDocument } from 'pdf-lib';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import { motion, AnimatePresence } from 'framer-motion';
import { FileUp, Trash2, CheckSquare, Square, Scissors, ChevronDown, ChevronUp, Loader2, Combine, Plus, ArrowUp, ArrowDown, X } from 'lucide-react';
import { useAdoptSharedFile } from '../context/FileContext';
import { useToast } from '../context/ToastContext';

// Use fixed public path to avoid MIME/CSP issues on Safari/macOS
pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';

const THUMB_SCALE = 0.3;
const DRAG_THRESHOLD = 5;   // px — 이보다 적게 움직이면 클릭으로 본다
const AUTO_SCROLL_EDGE = 48; // px — 가장자리에 닿으면 저절로 스크롤

// Safari/macOS canvas memory detection
const isSafariSplitter = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);

const isPdf = (f) => f && (f.type === 'application/pdf' || /\.pdf$/i.test(f.name));
const baseName = (name) => name.replace(/\.pdf$/i, '');

// "1-3, 5, 8-" → [1,2,3,5,8,...,max]. 잘못된 조각은 null 을 돌려준다.
function parseRanges(text, max) {
  const out = new Set();
  const parts = text.split(/[,\s]+/).filter(Boolean);
  if (parts.length === 0) return null;
  for (const part of parts) {
    const m = part.match(/^(\d*)\s*[-~]\s*(\d*)$/);
    let lo, hi;
    if (m) {
      lo = m[1] ? parseInt(m[1], 10) : 1;
      hi = m[2] ? parseInt(m[2], 10) : max;
    } else if (/^\d+$/.test(part)) {
      lo = hi = parseInt(part, 10);
    } else {
      return null;
    }
    if (lo > hi) [lo, hi] = [hi, lo];
    lo = Math.max(1, lo);
    hi = Math.min(max, hi);
    for (let i = lo; i <= hi; i++) out.add(i);
  }
  return out;
}

// Format page numbers as compact ranges (e.g., 1-3, 5, 7-9)
function formatRanges(pages) {
  if (pages.length === 0) return '없음';
  const ranges = [];
  let start = pages[0], end = pages[0];
  for (let i = 1; i < pages.length; i++) {
    if (pages[i] === end + 1) { end = pages[i]; }
    else { ranges.push(start === end ? `${start}` : `${start}-${end}`); start = end = pages[i]; }
  }
  ranges.push(start === end ? `${start}` : `${start}-${end}`);
  return ranges.join(', ');
}

// --- Thumbnail Component ---
function PageThumb({ pdfDoc, pageNum, label, pageKey, isSelected, onClick }) {
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
    : 'border-white/10 hover:border-white/30';

  return (
    <div
      ref={containerRef}
      data-page-key={pageKey}
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
            alt={`Page ${label}`}
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
      </div>
      <span className={`numeral text-[11px] font-medium tabular-nums transition-colors ${isSelected ? 'text-amber-300' : 'text-white/40 group-hover:text-white/70'}`}>
        {label}
      </span>
    </div>
  );
}

// --- Main Component ---
// 여러 PDF 를 한 줄로 이어 붙여 다룬다. 페이지 번호는 전체를 통틀어 1 부터 센다.
export default function PdfSplitter() {
  const toast = useToast();
  // [{ id, file, doc, numPages, url }]
  const [files, setFiles] = useState([]);
  const [selectedKeys, setSelectedKeys] = useState(new Set()); // `${fileId}:${pageNum}`
  const [lastClicked, setLastClicked] = useState(null);         // 전체 기준 index
  const [isProcessing, setIsProcessing] = useState(null);       // null | 'split' | 'merge'
  const [isLoading, setIsLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [panelOpen, setPanelOpen] = useState(true);
  const [rangeText, setRangeText] = useState('');
  const [marquee, setMarquee] = useState(null); // { x, y, w, h } — 스크롤 영역 안 좌표
  const fileInputRef = useRef(null);
  const scrollRef = useRef(null);
  const filesRef = useRef(files);
  const nextIdRef = useRef(1);
  const dragRef = useRef(null);
  const swallowClickRef = useRef(false);

  useEffect(() => { filesRef.current = files; }, [files]);

  // 언마운트 시 열린 문서·URL 반납
  useEffect(() => {
    return () => {
      for (const f of filesRef.current) {
        URL.revokeObjectURL(f.url);
        f.doc.destroy();
      }
    };
  }, []);

  // 전체 페이지 목록 (파일 순서대로)
  const pages = [];
  for (const f of files) {
    for (let n = 1; n <= f.numPages; n++) {
      pages.push({ key: `${f.id}:${n}`, fileId: f.id, pageNum: n, index: pages.length });
    }
  }
  const totalPages = pages.length;

  const openFiles = useCallback(async (list, { replace = false } = {}) => {
    const incoming = Array.from(list || []);
    const pdfs = incoming.filter(isPdf);
    if (pdfs.length === 0) {
      toast.error('PDF 파일만 열 수 있습니다.');
      return;
    }
    if (pdfs.length < incoming.length) {
      toast.error(`PDF 가 아닌 파일 ${incoming.length - pdfs.length}개는 건너뛰었습니다.`);
    }
    // 드롭 순서가 뒤섞여 오는 경우가 많아 이름순으로 맞춘다
    pdfs.sort((a, b) => a.name.localeCompare(b.name, 'ko', { numeric: true }));

    setIsLoading(true);
    const loaded = [];
    for (const f of pdfs) {
      const url = URL.createObjectURL(f);
      try {
        const doc = await pdfjsLib.getDocument({
          url,
          cMapUrl: '/cmaps/',
          cMapPacked: true,
          standardFontDataUrl: '/standard_fonts/',
          useSystemFonts: false,
        }).promise;
        loaded.push({ id: nextIdRef.current++, file: f, doc, numPages: doc.numPages, url });
      } catch (e) {
        console.error(e);
        URL.revokeObjectURL(url);
        toast.error(`${f.name}: 불러오지 못했습니다. 암호가 걸렸거나 손상된 파일일 수 있습니다.`);
      }
    }
    setIsLoading(false);
    if (loaded.length === 0) return;

    setFiles(prev => {
      if (replace) {
        for (const f of prev) { URL.revokeObjectURL(f.url); f.doc.destroy(); }
        return loaded;
      }
      return [...prev, ...loaded];
    });
    if (replace) {
      setSelectedKeys(new Set());
      setLastClicked(null);
    }
  }, [toast]);

  // 홈에서 연 파일을 이어받는다 (탭마다 다시 열 필요 없음)
  const adoptShared = useCallback((f) => openFiles([f], { replace: true }), [openFiles]);
  useAdoptSharedFile(adoptShared, 'pdf');

  const handleFileChange = (e) => {
    if (e.target.files.length) openFiles(e.target.files);
    e.target.value = '';
  };
  const handleDragOver = (e) => e.preventDefault();
  const handleDrop = (e) => {
    e.preventDefault();
    if (e.dataTransfer.files.length) openFiles(e.dataTransfer.files);
  };

  const handlePageClick = useCallback((page, e) => {
    if (swallowClickRef.current) { swallowClickRef.current = false; return; }
    setSelectedKeys(prev => {
      const next = new Set(prev);
      if (e.shiftKey && lastClicked !== null) {
        // Range select
        const lo = Math.min(lastClicked, page.index);
        const hi = Math.max(lastClicked, page.index);
        for (let i = lo; i <= hi; i++) next.add(pages[i].key);
        return next;
      }
      if (e.ctrlKey || e.metaKey) {
        // Toggle
        next.has(page.key) ? next.delete(page.key) : next.add(page.key);
        return next;
      }
      // Single click: toggle or clear-and-select
      if (next.size === 1 && next.has(page.key)) {
        next.clear();
      } else {
        next.clear();
        next.add(page.key);
      }
      return next;
    });
    if (!e.shiftKey) setLastClicked(page.index);
  }, [lastClicked, pages]);

  // ─── 드래그로 영역 선택 ───
  const toContent = (clientX, clientY) => {
    const el = scrollRef.current;
    const r = el.getBoundingClientRect();
    return { x: clientX - r.left + el.scrollLeft, y: clientY - r.top + el.scrollTop };
  };

  const updateMarquee = () => {
    const d = dragRef.current;
    const el = scrollRef.current;
    if (!d || !el) return;
    const cur = toContent(d.clientX, d.clientY);
    const x = Math.min(d.start.x, cur.x), y = Math.min(d.start.y, cur.y);
    const w = Math.abs(cur.x - d.start.x), h = Math.abs(cur.y - d.start.y);
    if (!d.active) {
      if (w < DRAG_THRESHOLD && h < DRAG_THRESHOLD) return;
      d.active = true;
    }
    setMarquee({ x, y, w, h });

    const r = el.getBoundingClientRect();
    const next = new Set(d.base);
    el.querySelectorAll('[data-page-key]').forEach(node => {
      const nr = node.getBoundingClientRect();
      const nx = nr.left - r.left + el.scrollLeft;
      const ny = nr.top - r.top + el.scrollTop;
      if (nx < x + w && nx + nr.width > x && ny < y + h && ny + nr.height > y) {
        next.add(node.dataset.pageKey);
      }
    });
    setSelectedKeys(next);
  };

  const autoScrollLoop = () => {
    const d = dragRef.current;
    const el = scrollRef.current;
    if (!d || !el) return;
    if (d.active) {
      const r = el.getBoundingClientRect();
      let dy = 0;
      if (d.clientY < r.top + AUTO_SCROLL_EDGE) dy = -Math.ceil((r.top + AUTO_SCROLL_EDGE - d.clientY) / 4);
      else if (d.clientY > r.bottom - AUTO_SCROLL_EDGE) dy = Math.ceil((d.clientY - (r.bottom - AUTO_SCROLL_EDGE)) / 4);
      if (dy) {
        el.scrollTop += dy;
        updateMarquee();
      }
    }
    d.raf = requestAnimationFrame(autoScrollLoop);
  };

  const handlePointerDown = (e) => {
    if (e.button !== 0 || e.pointerType === 'touch') return;
    if (e.target.closest('button, input, a')) return;
    const additive = e.ctrlKey || e.metaKey || e.shiftKey;
    dragRef.current = {
      start: toContent(e.clientX, e.clientY),
      clientX: e.clientX,
      clientY: e.clientY,
      base: additive ? new Set(selectedKeys) : new Set(),
      active: false,
      raf: 0,
    };
    dragRef.current.raf = requestAnimationFrame(autoScrollLoop);
  };

  useEffect(() => {
    const onMove = (e) => {
      const d = dragRef.current;
      if (!d) return;
      d.clientX = e.clientX;
      d.clientY = e.clientY;
      updateMarquee();
    };
    const onUp = (e) => {
      const d = dragRef.current;
      if (!d) return;
      cancelAnimationFrame(d.raf);
      dragRef.current = null;
      if (d.active) {
        // 드래그 끝의 click 이 선택을 다시 덮어쓰지 않게 막는다
        swallowClickRef.current = !!e.target.closest?.('[data-page-key]');
        setMarquee(null);
      }
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  });

  const selectAll = () => setSelectedKeys(new Set(pages.map(p => p.key)));
  const clearSelection = () => setSelectedKeys(new Set());

  const applyRange = (mode) => {
    const nums = parseRanges(rangeText, totalPages);
    if (!nums) {
      toast.error('범위는 1-5, 8, 10-12 처럼 적어 주세요.');
      return;
    }
    if (nums.size === 0) {
      toast.error(`페이지는 1-${totalPages} 사이입니다.`);
      return;
    }
    setSelectedKeys(prev => {
      const next = mode === 'add' ? new Set(prev) : new Set();
      for (const n of nums) next.add(pages[n - 1].key);
      return next;
    });
  };

  const selectedPages = pages.filter(p => selectedKeys.has(p.key)); // 문서 순서
  const selectedNums = selectedPages.map(p => p.index + 1);

  // pdf-lib 문서는 작업할 때만 연다 (파일별로 한 번)
  const loadSources = async (needed) => {
    const map = new Map();
    for (const f of files) {
      if (!needed.has(f.id)) continue;
      map.set(f.id, await PDFDocument.load(await f.file.arrayBuffer(), { ignoreEncryption: true }));
    }
    return map;
  };

  const outputBase = () => (files.length === 1 ? baseName(files[0].file.name) : `${baseName(files[0].file.name)} 외 ${files.length - 1}개`);

  const handleSplit = async () => {
    if (selectedPages.length === 0) return;
    setIsProcessing('split');
    setProgress(0);
    try {
      const sources = await loadSources(new Set(selectedPages.map(p => p.fileId)));
      const zip = new JSZip();
      const multi = files.length > 1;
      for (let i = 0; i < selectedPages.length; i++) {
        const p = selectedPages[i];
        const newDoc = await PDFDocument.create();
        const [copied] = await newDoc.copyPages(sources.get(p.fileId), [p.pageNum - 1]);
        newDoc.addPage(copied);
        const bytes = await newDoc.save();
        const name = multi
          ? `${String(p.index + 1).padStart(3, '0')}_${baseName(files.find(f => f.id === p.fileId).file.name)}_p${p.pageNum}.pdf`
          : `page-${String(p.pageNum).padStart(3, '0')}.pdf`;
        zip.file(name, bytes);
        setProgress(Math.round(((i + 1) / selectedPages.length) * 100));
      }
      const blob = await zip.generateAsync({ type: 'blob' });
      saveAs(blob, `${outputBase()}_split.zip`);
    } catch (e) {
      console.error(e);
      toast.error(e.message || '분할 중 오류가 발생했습니다.');
    } finally {
      setIsProcessing(null);
      setProgress(0);
    }
  };

  // 선택이 있으면 선택한 페이지만, 없으면 전부를 순서대로 PDF 하나로
  const handleMerge = async () => {
    const target = selectedPages.length > 0 ? selectedPages : pages;
    if (target.length === 0) return;
    setIsProcessing('merge');
    setProgress(0);
    try {
      const sources = await loadSources(new Set(target.map(p => p.fileId)));
      const out = await PDFDocument.create();
      // 같은 파일에서 연속된 페이지는 한 번에 복사한다
      let i = 0;
      while (i < target.length) {
        let j = i;
        while (j + 1 < target.length && target[j + 1].fileId === target[i].fileId) j++;
        const chunk = target.slice(i, j + 1);
        const copied = await out.copyPages(sources.get(target[i].fileId), chunk.map(p => p.pageNum - 1));
        copied.forEach(pg => out.addPage(pg));
        i = j + 1;
        setProgress(Math.round((i / target.length) * 90));
      }
      const bytes = await out.save();
      setProgress(100);
      saveAs(new Blob([bytes], { type: 'application/pdf' }), `${outputBase()}_merged.pdf`);
    } catch (e) {
      console.error(e);
      toast.error(e.message || '합치는 중 오류가 발생했습니다.');
    } finally {
      setIsProcessing(null);
      setProgress(0);
    }
  };

  const moveFile = (id, dir) => {
    setFiles(prev => {
      const i = prev.findIndex(f => f.id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
    setLastClicked(null);
  };

  const removeFile = (id) => {
    const f = files.find(x => x.id === id);
    if (!f) return;
    URL.revokeObjectURL(f.url);
    f.doc.destroy();
    setFiles(prev => prev.filter(x => x.id !== id));
    setSelectedKeys(prev => new Set([...prev].filter(k => !k.startsWith(`${id}:`))));
    setLastClicked(null);
  };

  const clearAll = () => {
    for (const f of files) { URL.revokeObjectURL(f.url); f.doc.destroy(); }
    setFiles([]); setSelectedKeys(new Set()); setLastClicked(null); setRangeText('');
  };

  const totalSize = files.reduce((s, f) => s + f.file.size, 0);
  const hasFiles = files.length > 0;
  const mergeCount = selectedPages.length > 0 ? selectedPages.length : totalPages;

  return (
    <div className="w-full h-full flex overflow-hidden">
      <input type="file" accept="application/pdf" multiple ref={fileInputRef} onChange={handleFileChange} className="hidden" />

      {/* ─── Left: Thumbnail Grid ─── */}
      <div
        ref={scrollRef}
        className="relative flex-1 overflow-y-auto custom-scrollbar p-6 select-none"
        onDragOver={hasFiles ? handleDragOver : undefined}
        onDrop={hasFiles ? handleDrop : undefined}
        onPointerDown={hasFiles ? handlePointerDown : undefined}
      >
        <AnimatePresence mode="wait">
          {!hasFiles ? (
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
                <span className="absolute top-5 left-6 section-num">PDF · 분할 / 합치기</span>
                <span className="absolute top-5 right-6 eyebrow">DRAG / CLICK</span>
                <div className="w-16 h-16 rounded-2xl glass flex items-center justify-center text-zinc-300 group-hover:text-amber-300 transition-colors">
                  {isLoading ? <Loader2 size={28} strokeWidth={1.5} className="animate-spin" /> : <FileUp size={28} strokeWidth={1.5} />}
                </div>
                <div className="space-y-1.5 mt-1">
                  <h3 className="m-0 text-[18px] font-semibold text-zinc-100 tracking-tight">PDF 파일 업로드</h3>
                  <p className="m-0 text-[13px] text-zinc-500">여러 개를 한꺼번에 끌어다 놓을 수 있습니다</p>
                </div>
              </div>
            </motion.div>
          ) : (
            <motion.div key="thumbs" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              {/* Selection hint bar */}
              <div className="flex items-center justify-between mb-5 px-1 gap-4">
                <p className="text-[11px] text-zinc-500">
                  <span className="mono">드래그</span> 영역 선택
                  <span className="mx-2 text-zinc-700">·</span>
                  <span className="mono">Shift+클릭</span> 범위 선택
                  <span className="mx-2 text-zinc-700">·</span>
                  <span className="mono">Ctrl+클릭/드래그</span> 추가 선택
                </p>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <button onClick={selectAll} className="press text-[11.5px] text-zinc-300 hover:text-zinc-50 transition-colors px-2.5 py-1.5 rounded-md hover:bg-white/5 border border-white/[0.06]">
                    전체 선택
                  </button>
                  <button onClick={clearSelection} className="press text-[11.5px] text-zinc-400 hover:text-zinc-100 transition-colors px-2.5 py-1.5 rounded-md hover:bg-white/5">
                    해제
                  </button>
                </div>
              </div>
              {/* Grid — 파일별 구획 */}
              <div className="flex flex-col gap-6">
                {files.map((f, fi) => {
                  const offset = pages.findIndex(p => p.fileId === f.id);
                  return (
                    <section key={f.id}>
                      {files.length > 1 && (
                        <div className="flex items-center gap-2 mb-3 px-1">
                          <span className="numeral text-[11px] text-amber-300/80">{offset + 1}–{offset + f.numPages}</span>
                          <span className="text-[12px] text-zinc-300 truncate">{f.file.name}</span>
                          <div className="flex items-center gap-0.5 ml-auto flex-shrink-0">
                            <button onClick={() => moveFile(f.id, -1)} disabled={fi === 0} title="앞으로" className="press p-1 rounded text-zinc-500 hover:text-zinc-100 hover:bg-white/5 disabled:opacity-30 disabled:pointer-events-none">
                              <ArrowUp size={13} />
                            </button>
                            <button onClick={() => moveFile(f.id, 1)} disabled={fi === files.length - 1} title="뒤로" className="press p-1 rounded text-zinc-500 hover:text-zinc-100 hover:bg-white/5 disabled:opacity-30 disabled:pointer-events-none">
                              <ArrowDown size={13} />
                            </button>
                            <button onClick={() => removeFile(f.id)} title="이 파일 빼기" className="press p-1 rounded text-zinc-500 hover:text-red-400 hover:bg-red-500/10">
                              <X size={13} />
                            </button>
                          </div>
                        </div>
                      )}
                      <div className="flex flex-wrap gap-4">
                        {Array.from({ length: f.numPages }, (_, i) => pages[offset + i]).map(p => (
                          <PageThumb
                            key={p.key}
                            pageKey={p.key}
                            pdfDoc={f.doc}
                            pageNum={p.pageNum}
                            label={p.index + 1}
                            isSelected={selectedKeys.has(p.key)}
                            onClick={(e) => handlePageClick(p, e)}
                          />
                        ))}
                      </div>
                    </section>
                  );
                })}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {marquee && (
          <div
            className="absolute pointer-events-none border border-amber-400/70 bg-amber-400/10 rounded-sm z-20"
            style={{ left: marquee.x, top: marquee.y, width: marquee.w, height: marquee.h }}
          />
        )}
      </div>

      {/* ─── Right: Settings Panel ─── */}
      <AnimatePresence>
        {hasFiles && (
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
                  <p className="text-[13px] font-semibold text-zinc-100 truncate tracking-tight">
                    {files.length === 1 ? files[0].file.name : `PDF ${files.length}개`}
                  </p>
                  <p className="numeral text-[11px] text-zinc-500 mt-0.5">{totalPages}p · {(totalSize / 1024 / 1024).toFixed(1)} MB</p>
                </div>
                <div className="flex items-center gap-0.5 flex-shrink-0">
                  <button onClick={() => fileInputRef.current?.click()} title="파일 추가" className="press p-1.5 text-zinc-500 hover:text-amber-300 hover:bg-amber-400/10 rounded-md transition-colors">
                    {isLoading ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} strokeWidth={1.75} />}
                  </button>
                  <button onClick={clearAll} title="모두 닫기" className="press p-1.5 text-zinc-500 hover:text-red-400 hover:bg-red-500/10 rounded-md transition-colors">
                    <Trash2 size={15} strokeWidth={1.75} />
                  </button>
                </div>
              </div>
            </div>

            {/* Range input */}
            <div className="px-4 py-3 border-b border-white/[0.05]">
              <span className="eyebrow">페이지 범위</span>
              <input
                value={rangeText}
                onChange={(e) => setRangeText(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') applyRange(e.shiftKey ? 'add' : 'replace'); }}
                placeholder={`예: 1-5, 8, 10-${Math.max(totalPages, 12)}`}
                className="numeral mt-2 w-full px-2.5 py-1.5 rounded-md bg-white/[0.04] border border-white/[0.08] text-[12px] text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-amber-400/40"
              />
              <div className="mt-2 flex gap-1.5">
                <button onClick={() => applyRange('replace')} disabled={!rangeText.trim()} className="press flex-1 text-[11.5px] text-zinc-200 px-2 py-1.5 rounded-md border border-white/[0.08] hover:bg-white/5 disabled:opacity-40 disabled:pointer-events-none">
                  이 범위 선택
                </button>
                <button onClick={() => applyRange('add')} disabled={!rangeText.trim()} className="press flex-1 text-[11.5px] text-zinc-400 px-2 py-1.5 rounded-md hover:bg-white/5 hover:text-zinc-100 disabled:opacity-40 disabled:pointer-events-none">
                  추가로 선택
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
                    {selectedPages.length}
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
                      {selectedPages.length === 0 ? (
                        <div className="flex flex-col items-center gap-2 py-8 text-center">
                          <Square className="w-7 h-7 text-zinc-700" strokeWidth={1.5} />
                          <p className="text-[11px] text-zinc-500 leading-relaxed">왼쪽에서 페이지를<br/>클릭하거나 드래그해 고르세요</p>
                        </div>
                      ) : (
                        <div>
                          <p className="text-[11px] text-zinc-500 mb-3">
                            범위 <span className="numeral ml-1 text-amber-300">{formatRanges(selectedNums)}</span>
                          </p>
                          {/* Selected page chips */}
                          <div className="flex flex-wrap gap-1">
                            {selectedPages.map(p => (
                              <button
                                key={p.key}
                                onClick={() => setSelectedKeys(prev => {
                                  const n = new Set(prev); n.delete(p.key); return n;
                                })}
                                className="numeral press text-[11px] px-1.5 py-0.5 rounded bg-white/[0.04] text-zinc-300 hover:bg-red-500/20 hover:text-red-300 border border-white/[0.06] hover:border-red-500/30 transition-colors"
                                title="클릭해서 제거"
                              >
                                {p.index + 1}
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

            {/* Action Buttons */}
            <div className="p-4 border-t border-white/[0.05] flex flex-col gap-2">
              <button
                onClick={handleMerge}
                disabled={!!isProcessing || mergeCount === 0}
                className="premium-btn-primary w-full py-3 flex items-center justify-center gap-2 text-[13px] relative overflow-hidden press"
              >
                {isProcessing === 'merge' ? (
                  <>
                    <div className="absolute inset-0 bg-black/15 transition-all duration-300" style={{ width: `${progress}%` }} />
                    <Loader2 size={14} className="animate-spin relative z-10" strokeWidth={2.25} />
                    <span className="relative z-10 numeral">{progress}% 합치는 중</span>
                  </>
                ) : (
                  <>
                    <Combine size={14} strokeWidth={2.25} />
                    <span>{selectedPages.length > 0 ? `선택 ${mergeCount}페이지 합치기` : `전체 ${mergeCount}페이지 합치기`}</span>
                  </>
                )}
              </button>
              <button
                onClick={handleSplit}
                disabled={!!isProcessing || selectedPages.length === 0}
                className="w-full py-2.5 flex items-center justify-center gap-2 text-[12.5px] relative overflow-hidden press rounded-xl border border-white/[0.10] text-zinc-200 hover:bg-white/5 disabled:opacity-40 disabled:pointer-events-none transition-colors"
              >
                {isProcessing === 'split' ? (
                  <>
                    <div className="absolute inset-0 bg-white/10 transition-all duration-300" style={{ width: `${progress}%` }} />
                    <Loader2 size={14} className="animate-spin relative z-10" strokeWidth={2.25} />
                    <span className="relative z-10 numeral">{progress}% 분할 중</span>
                  </>
                ) : (
                  <>
                    <Scissors size={14} strokeWidth={2.25} />
                    <span>{selectedPages.length > 0 ? `${selectedPages.length}페이지 낱장 분할` : '분할할 페이지를 선택하세요'}</span>
                  </>
                )}
              </button>
              <p className="text-center text-[11px] text-zinc-500">합치기는 PDF 하나, 분할은 ZIP 으로 받습니다</p>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>
    </div>
  );
}
