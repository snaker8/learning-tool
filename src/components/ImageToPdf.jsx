import { useState, useRef, useCallback, useEffect } from 'react';
import { PDFDocument, PageSizes } from 'pdf-lib';
import { saveAs } from 'file-saver';
import { motion, AnimatePresence, Reorder } from 'framer-motion';
import {
  Upload, FileText, Download, Trash2, Loader2, AlertCircle,
  GripVertical, Plus, Image as ImageIcon, X
} from 'lucide-react';

const PAGE_SIZE_OPTIONS = [
  { value: 'fit',    label: '이미지 크기에 맞춤', size: null,           sub: '여백 그대로' },
  { value: 'A4',     label: 'A4',                  size: PageSizes.A4,   sub: '210 × 297mm' },
  { value: 'Letter', label: 'Letter',              size: PageSizes.Letter, sub: '8.5 × 11in' },
];

const MARGIN_OPTIONS = [
  { value: 0,  label: '없음' },
  { value: 24, label: '얇게' },
  { value: 48, label: '넉넉히' },
];

const ORIENTATION_OPTIONS = [
  { value: 'auto',      label: '자동' },
  { value: 'portrait',  label: '세로' },
  { value: 'landscape', label: '가로' },
];

export default function ImageToPdf() {
  const [items, setItems] = useState([]); // [{ id, file, previewUrl }]
  const [pageSize, setPageSize] = useState('fit');
  const [margin, setMargin] = useState(0);
  const [orientation, setOrientation] = useState('auto');
  const [status, setStatus] = useState('idle'); // 'idle' | 'processing' | 'done' | 'error'
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef(null);

  // Cleanup object URLs on unmount
  useEffect(() => {
    return () => {
      items.forEach(it => URL.revokeObjectURL(it.previewUrl));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const addFiles = useCallback((newFiles) => {
    const imageFiles = Array.from(newFiles).filter(f => f.type.startsWith('image/'));
    if (imageFiles.length === 0) {
      setError('이미지 파일만 업로드 가능합니다.');
      return;
    }
    setError('');
    const additions = imageFiles.map((file, idx) => ({
      id: `${Date.now()}-${idx}-${file.name}`,
      file,
      previewUrl: URL.createObjectURL(file),
    }));
    setItems(prev => [...prev, ...additions]);
    setStatus('idle');
  }, []);

  const handleDragOver = (e) => { e.preventDefault(); setIsDragOver(true); };
  const handleDragLeave = () => setIsDragOver(false);
  const handleDrop = (e) => {
    e.preventDefault(); setIsDragOver(false);
    if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files);
  };
  const handleFileChange = (e) => { if (e.target.files?.length) addFiles(e.target.files); };

  const removeItem = (id) => {
    setItems(prev => {
      const removed = prev.find(it => it.id === id);
      if (removed) URL.revokeObjectURL(removed.previewUrl);
      return prev.filter(it => it.id !== id);
    });
  };

  const clearAll = () => {
    items.forEach(it => URL.revokeObjectURL(it.previewUrl));
    setItems([]);
    setStatus('idle');
    setError('');
    setProgress(0);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleConvert = useCallback(async () => {
    if (items.length === 0) return;
    setStatus('processing');
    setProgress(0);
    setError('');

    try {
      const pdfDoc = await PDFDocument.create();

      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        const bytes = await it.file.arrayBuffer();
        const mime = it.file.type;

        let img;
        if (mime === 'image/png') {
          img = await pdfDoc.embedPng(bytes);
        } else if (mime === 'image/jpeg' || mime === 'image/jpg') {
          img = await pdfDoc.embedJpg(bytes);
        } else {
          // Re-encode unsupported format to PNG via canvas
          const reencoded = await reencodeToPng(it.previewUrl);
          img = await pdfDoc.embedPng(reencoded);
        }

        let page;
        if (pageSize === 'fit') {
          page = pdfDoc.addPage([img.width + margin * 2, img.height + margin * 2]);
        } else {
          const opt = PAGE_SIZE_OPTIONS.find(o => o.value === pageSize);
          let [w, h] = opt.size;
          const isLandscape =
            orientation === 'landscape' ||
            (orientation === 'auto' && img.width > img.height);
          if (isLandscape) [w, h] = [h, w];
          page = pdfDoc.addPage([w, h]);
        }

        const pw = page.getWidth();
        const ph = page.getHeight();
        const availW = Math.max(1, pw - margin * 2);
        const availH = Math.max(1, ph - margin * 2);

        const scale = Math.min(availW / img.width, availH / img.height);
        const drawW = img.width * scale;
        const drawH = img.height * scale;
        const x = (pw - drawW) / 2;
        const y = (ph - drawH) / 2;

        page.drawImage(img, { x, y, width: drawW, height: drawH });
        setProgress(Math.round(((i + 1) / items.length) * 100));
      }

      const pdfBytes = await pdfDoc.save();
      const blob = new Blob([pdfBytes], { type: 'application/pdf' });
      const baseName = items.length === 1
        ? items[0].file.name.replace(/\.[^/.]+$/, '')
        : `images_${items.length}p`;
      saveAs(blob, `${baseName}.pdf`);
      setStatus('done');
    } catch (e) {
      console.error(e);
      setError('PDF 생성 중 오류가 발생했습니다.');
      setStatus('error');
    }
  }, [items, pageSize, margin, orientation]);

  return (
    <div className="flex-1 overflow-y-auto custom-scrollbar p-8">
      <div className="max-w-6xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex items-end justify-between">
          <div>
            <span className="section-num">이미지 → PDF</span>
            <h1 className="mt-1.5 text-[22px] font-semibold text-zinc-100 tracking-tight">이미지 → PDF</h1>
          </div>
          <span className="eyebrow">JPEG · PNG · WebP</span>
        </div>

        {/* Error */}
        <AnimatePresence>
          {error && (
            <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              className="flex items-center gap-3 p-4 bg-red-500/[0.08] border border-red-500/25 text-red-300 rounded-xl">
              <AlertCircle className="w-4 h-4 flex-shrink-0" strokeWidth={2} />
              <p className="text-[13px]">{error}</p>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

          {/* ── Left: Image List ── */}
          <div className="lg:col-span-8">
            <div className="premium-panel overflow-hidden h-full">
              <div className="px-5 py-3.5 border-b border-white/[0.05] bg-white/[0.015] flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <span className="section-num">01</span>
                  <Upload className="w-3.5 h-3.5 text-amber-400" strokeWidth={1.75} />
                  <h2 className="text-[12.5px] font-semibold text-zinc-200 tracking-tight">이미지 업로드</h2>
                  {items.length > 0 && (
                    <span className="numeral text-[11px] px-1.5 py-px rounded bg-amber-400/10 border border-amber-400/25 text-amber-300 ml-1">
                      {items.length}장
                    </span>
                  )}
                </div>
                {items.length > 0 && (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="press flex items-center gap-1.5 text-[11.5px] font-medium px-2.5 py-1.5 rounded-md text-zinc-300 bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] hover:border-white/10 transition-colors"
                    >
                      <Plus className="w-3 h-3" strokeWidth={2.25} />
                      추가
                    </button>
                    <button
                      onClick={clearAll}
                      className="press flex items-center gap-1.5 text-[11.5px] font-medium px-2.5 py-1.5 rounded-md text-zinc-500 hover:text-red-400 hover:bg-red-500/[0.06] transition-colors"
                    >
                      <Trash2 className="w-3 h-3" strokeWidth={2} />
                      모두 삭제
                    </button>
                  </div>
                )}
              </div>
              <div className="p-5">
                {items.length === 0 ? (
                  /* Dropzone */
                  <div
                    onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}
                    onClick={() => fileInputRef.current?.click()}
                    className={`flex flex-col items-center justify-center min-h-[320px] border border-dashed rounded-2xl cursor-pointer transition-all
                      ${isDragOver
                        ? 'border-amber-400/50 bg-amber-400/[0.04]'
                        : 'border-white/[0.10] hover:border-amber-400/30 hover:bg-amber-400/[0.02]'}`}
                  >
                    <div className="w-14 h-14 mb-4 rounded-2xl glass flex items-center justify-center text-zinc-300">
                      <ImageIcon className="w-6 h-6" strokeWidth={1.5} />
                    </div>
                    <p className="text-[15px] font-semibold text-zinc-100 mb-1 tracking-tight">이미지를 드래그하거나 클릭</p>
                    <p className="text-[12px] text-zinc-500">여러 장 동시 선택 가능 · 드래그로 순서 변경</p>
                    <p className="numeral text-[11px] text-zinc-600 mt-3">JPEG · PNG · WebP</p>
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      ref={fileInputRef}
                      onChange={handleFileChange}
                      className="hidden"
                    />
                  </div>
                ) : (
                  <>
                    <p className="eyebrow mb-3">정렬 — 드래그하여 순서 변경</p>
                    <Reorder.Group
                      axis="y"
                      values={items}
                      onReorder={setItems}
                      className="space-y-2"
                    >
                      {items.map((it, idx) => (
                        <Reorder.Item
                          key={it.id}
                          value={it}
                          className="cursor-grab active:cursor-grabbing"
                          whileDrag={{ scale: 1.01, zIndex: 50 }}
                        >
                          <div className="flex items-center gap-3 bg-white/[0.025] border border-white/[0.06] hover:border-amber-400/30 rounded-xl p-2.5 transition-colors group">
                            <GripVertical className="w-4 h-4 text-zinc-600 group-hover:text-zinc-400 shrink-0" strokeWidth={1.75} />
                            <span className="numeral text-[11px] w-7 text-center text-zinc-500 shrink-0">
                              {String(idx + 1).padStart(2, '0')}
                            </span>
                            <div className="w-12 h-12 rounded-md bg-black/40 border border-white/[0.05] overflow-hidden shrink-0 flex items-center justify-center">
                              <img
                                src={it.previewUrl}
                                alt={it.file.name}
                                loading="lazy"
                                className="max-w-full max-h-full object-contain"
                              />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-[12.5px] font-medium text-zinc-100 truncate tracking-tight">
                                {it.file.name}
                              </p>
                              <p className="numeral text-[10.5px] text-zinc-500">
                                {(it.file.size / 1024).toFixed(1)} KB
                              </p>
                            </div>
                            <button
                              onClick={(e) => { e.stopPropagation(); removeItem(it.id); }}
                              className="press shrink-0 p-1.5 text-zinc-500 hover:text-red-400 hover:bg-red-500/[0.08] rounded-md transition-colors"
                              title="삭제"
                            >
                              <X className="w-3.5 h-3.5" strokeWidth={2} />
                            </button>
                          </div>
                        </Reorder.Item>
                      ))}
                    </Reorder.Group>

                    {/* Add more dropzone */}
                    <div
                      onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}
                      onClick={() => fileInputRef.current?.click()}
                      className={`mt-3 py-3 flex items-center justify-center gap-2 border border-dashed rounded-xl cursor-pointer text-[12px] transition-colors
                        ${isDragOver
                          ? 'border-amber-400/50 text-amber-200 bg-amber-400/[0.04]'
                          : 'border-white/[0.08] text-zinc-500 hover:border-amber-400/25 hover:text-amber-300'}`}
                    >
                      <Plus className="w-3.5 h-3.5" strokeWidth={2} />
                      이미지 더 추가
                      <input
                        type="file"
                        accept="image/*"
                        multiple
                        ref={fileInputRef}
                        onChange={handleFileChange}
                        className="hidden"
                      />
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* ── Right: Settings + Convert ── */}
          <div className="lg:col-span-4">
            <div className="premium-panel overflow-hidden h-full flex flex-col">
              <div className="px-5 py-3.5 border-b border-white/[0.05] bg-white/[0.015] flex items-center gap-2.5">
                <span className="section-num">02</span>
                <FileText className="w-3.5 h-3.5 text-amber-400" strokeWidth={1.75} />
                <h2 className="text-[12.5px] font-semibold text-zinc-200 tracking-tight">PDF 출력 설정</h2>
              </div>

              <div className="p-5 space-y-6 flex-1">
                {/* Page size */}
                <div className="space-y-2.5">
                  <label className="eyebrow block">페이지 크기</label>
                  <div className="space-y-1.5">
                    {PAGE_SIZE_OPTIONS.map(opt => (
                      <button key={opt.value} onClick={() => setPageSize(opt.value)}
                        className={`press w-full flex items-center justify-between px-3.5 py-2.5 rounded-lg border text-[12.5px] transition-colors ${
                          pageSize === opt.value
                            ? 'bg-amber-400/[0.06] border-amber-400/30 text-amber-200'
                            : 'bg-white/[0.02] border-white/[0.06] text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-200'
                        }`}>
                        <span className="font-medium">{opt.label}</span>
                        <span className="numeral text-[10.5px] opacity-70">{opt.sub}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Orientation — only when fixed page size */}
                {pageSize !== 'fit' && (
                  <div className="space-y-2.5">
                    <label className="eyebrow block">방향</label>
                    <div className="grid grid-cols-3 gap-2">
                      {ORIENTATION_OPTIONS.map(opt => (
                        <button key={opt.value} onClick={() => setOrientation(opt.value)}
                          className={`press py-2 rounded-lg border text-[12px] font-medium transition-colors ${
                            orientation === opt.value
                              ? 'bg-amber-400 text-zinc-950 border-amber-400'
                              : 'bg-white/[0.03] text-zinc-400 border-white/[0.06] hover:bg-white/[0.06] hover:text-zinc-100'
                          }`}>
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Margin */}
                <div className="space-y-2.5">
                  <label className="eyebrow block">여백</label>
                  <div className="grid grid-cols-3 gap-2">
                    {MARGIN_OPTIONS.map(opt => (
                      <button key={opt.value} onClick={() => setMargin(opt.value)}
                        className={`press py-2 rounded-lg border text-[12px] font-medium transition-colors ${
                          margin === opt.value
                            ? 'bg-amber-400 text-zinc-950 border-amber-400'
                            : 'bg-white/[0.03] text-zinc-400 border-white/[0.06] hover:bg-white/[0.06] hover:text-zinc-100'
                        }`}>
                        {opt.label}
                      </button>
                    ))}
                  </div>
                  <p className="text-[11px] text-zinc-500 leading-relaxed">
                    이미지가 여백 안에 비율 유지하며 중앙 정렬됩니다.
                  </p>
                </div>
              </div>

              {/* Convert button */}
              <div className="p-4 border-t border-white/[0.05]">
                {status === 'processing' ? (
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-center gap-2 text-zinc-200 font-medium">
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-400" strokeWidth={2.25} />
                      <span className="text-[13px]">생성 중</span>
                      <span className="numeral text-amber-300">{progress}%</span>
                    </div>
                    <div className="w-full h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
                      <div className="h-full bg-amber-400 rounded-full transition-all duration-300" style={{ width: `${progress}%` }} />
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={handleConvert}
                    disabled={items.length === 0}
                    className="premium-btn-primary press w-full py-2.5 px-4 text-[13px] flex items-center justify-center gap-2"
                  >
                    {status === 'done' ? (
                      <>
                        <Download className="w-3.5 h-3.5" strokeWidth={2.25} />
                        다시 다운로드
                      </>
                    ) : (
                      <>
                        <FileText className="w-3.5 h-3.5" strokeWidth={2.25} />
                        PDF 만들기 {items.length > 0 && <span className="numeral">· {items.length}p</span>}
                      </>
                    )}
                  </button>
                )}
                {items.length > 0 && status === 'idle' && (
                  <p className="text-center text-[11px] text-zinc-500 mt-2">
                    하나의 PDF 파일로 다운로드됩니다
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* Re-encode unsupported image (e.g. WebP) to PNG via canvas */
async function reencodeToPng(srcUrl) {
  return new Promise((resolve, reject) => {
    const img = new globalThis.Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
      canvas.toBlob(async (blob) => {
        if (!blob) return reject(new Error('PNG 변환 실패'));
        const ab = await blob.arrayBuffer();
        canvas.width = 0; canvas.height = 0;
        resolve(ab);
      }, 'image/png');
    };
    img.onerror = reject;
    img.src = srcUrl;
  });
}
