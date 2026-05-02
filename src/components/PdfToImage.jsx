import { useState, useRef, useCallback } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorker from 'pdfjs-dist/build/pdf.worker.mjs?url';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import { motion, AnimatePresence } from 'framer-motion';
import { Upload, FileText, Image, Download, Archive, Trash2, Loader2, AlertCircle } from 'lucide-react';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

const SCALE_OPTIONS = [
  { value: 1.0, label: '표준 (1.0x)', sub: '가장 빠름' },
  { value: 1.5, label: '고화질 (1.5x)', sub: '권장' },
  { value: 2.0, label: '초고화질 (2.0x)', sub: '용량 큼' },
  { value: 3.0, label: '인쇄용 (3.0x)', sub: '처리 느림' },
];

export default function PdfToImage() {
  const [file, setFile] = useState(null);
  const [format, setFormat] = useState('jpeg');
  const [scale, setScale] = useState(2.0);
  const [status, setStatus] = useState('idle'); // 'idle' | 'processing' | 'done' | 'error'
  const [progress, setProgress] = useState(0);
  const [results, setResults] = useState([]); // [{ page, dataUrl, width, height }]
  const [error, setError] = useState('');
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef(null);

  const handleFile = (f) => {
    if (!f || f.type !== 'application/pdf') { setError('PDF 파일만 업로드 가능합니다.'); return; }
    setFile(f); setResults([]); setStatus('idle'); setError(''); setProgress(0);
  };

  const handleDragOver = (e) => { e.preventDefault(); setIsDragOver(true); };
  const handleDragLeave = () => setIsDragOver(false);
  const handleDrop = (e) => {
    e.preventDefault(); setIsDragOver(false);
    if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
  };
  const handleFileChange = (e) => { if (e.target.files[0]) handleFile(e.target.files[0]); };

  const resetAll = () => {
    setFile(null); setResults([]); setStatus('idle'); setError(''); setProgress(0);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleConvert = useCallback(async () => {
    if (!file) return;
    setStatus('processing'); setError(''); setProgress(0); setResults([]);

    try {
      const ab = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(ab) }).promise;
      const total = pdf.numPages;
      const imgs = [];
      const mimeType = format === 'png' ? 'image/png' : 'image/jpeg';
      const quality = format === 'jpeg' ? 0.9 : undefined;

      for (let i = 1; i <= total; i++) {
        const page = await pdf.getPage(i);
        const vp = page.getViewport({ scale });
        const canvas = document.createElement('canvas');
        canvas.width = vp.width; canvas.height = vp.height;
        await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
        const dataUrl = canvas.toDataURL(mimeType, quality);
        imgs.push({ page: i, dataUrl, width: canvas.width, height: canvas.height });
        // free memory
        canvas.width = 0; canvas.height = 0;
        page.cleanup();
        setProgress(Math.round((i / total) * 100));
      }

      setResults(imgs);
      setStatus('done');
    } catch (e) {
      console.error(e);
      setError('PDF 변환 중 오류가 발생했습니다. 암호가 걸려있거나 손상된 파일일 수 있습니다.');
      setStatus('error');
    }
  }, [file, format, scale]);

  const handleDownloadZip = useCallback(async () => {
    if (results.length === 0) return;
    const zip = new JSZip();
    const folder = zip.folder('converted_images');
    const ext = format === 'png' ? 'png' : 'jpg';
    results.forEach(img => {
      const base64 = img.dataUrl.split(',')[1];
      const name = `${file.name.replace(/\.[^/.]+$/, '')}_page_${img.page}.${ext}`;
      folder.file(name, base64, { base64: true });
    });
    const blob = await zip.generateAsync({ type: 'blob' });
    saveAs(blob, `${file.name.replace(/\.[^/.]+$/, '')}_images.zip`);
  }, [results, format, file]);

  return (
    <div className="flex-1 overflow-y-auto custom-scrollbar p-8">
      <div className="max-w-6xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex items-end justify-between">
          <div>
            <span className="section-num">04 / 04 — 이미지 변환</span>
            <h1 className="mt-1.5 text-[22px] font-semibold text-zinc-100 tracking-tight">PDF → 이미지</h1>
          </div>
          <span className="eyebrow">JPEG · PNG · ZIP</span>
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

          {/* ── Left: Upload / File Info ── */}
          <div className="lg:col-span-8">
            <div className="premium-panel overflow-hidden h-full">
              <div className="px-5 py-3.5 border-b border-white/[0.05] bg-white/[0.015] flex items-center gap-2.5">
                <span className="section-num">01</span>
                <Upload className="w-3.5 h-3.5 text-amber-400" strokeWidth={1.75} />
                <h2 className="text-[12.5px] font-semibold text-zinc-200 tracking-tight">PDF 파일 업로드</h2>
              </div>
              <div className="p-6 flex flex-col">
                {!file ? (
                  /* Dropzone */
                  <div
                    onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}
                    onClick={() => fileInputRef.current?.click()}
                    className={`flex-1 flex flex-col items-center justify-center min-h-[280px] border border-dashed rounded-2xl cursor-pointer transition-all
                      ${isDragOver
                        ? 'border-amber-400/50 bg-amber-400/[0.04]'
                        : 'border-white/[0.10] hover:border-amber-400/30 hover:bg-amber-400/[0.02]'}`}
                  >
                    <div className="w-14 h-14 mb-4 rounded-2xl glass flex items-center justify-center text-zinc-300">
                      <Upload className="w-6 h-6" strokeWidth={1.5} />
                    </div>
                    <p className="text-[15px] font-semibold text-zinc-100 mb-1 tracking-tight">클릭하거나 파일을 드래그하세요</p>
                    <p className="text-[12px] text-zinc-500">지원 형식 <span className="mono ml-1">.pdf</span></p>
                    <input type="file" accept=".pdf" ref={fileInputRef} onChange={handleFileChange} className="hidden" />
                  </div>
                ) : (
                  /* File Info */
                  <div className="flex-1 flex flex-col items-center justify-center min-h-[280px] bg-white/[0.02] rounded-2xl border border-white/[0.05] p-8">
                    <div className="w-14 h-14 rounded-2xl glass flex items-center justify-center mb-4">
                      <FileText className="w-7 h-7 text-zinc-300" strokeWidth={1.5} />
                    </div>
                    <h3 className="text-[16px] font-semibold text-zinc-100 text-center break-all mb-1 tracking-tight">{file.name}</h3>
                    <p className="numeral text-[12px] text-zinc-500 mb-8">{(file.size / 1024 / 1024).toFixed(2)} MB</p>

                    {/* Idle: action buttons */}
                    {status === 'idle' && (
                      <div className="flex gap-2.5">
                        <button onClick={resetAll}
                          className="premium-btn-secondary press px-4 py-2 text-[12.5px]">
                          취소
                        </button>
                        <button onClick={handleConvert}
                          className="premium-btn-primary press px-5 py-2 text-[12.5px] flex items-center gap-2">
                          변환 시작 <Image className="w-3.5 h-3.5" strokeWidth={2.25} />
                        </button>
                      </div>
                    )}

                    {/* Processing */}
                    {status === 'processing' && (
                      <div className="w-full max-w-sm space-y-3 text-center">
                        <div className="flex items-center justify-center gap-2 text-zinc-200 font-medium">
                          <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-400" strokeWidth={2.25} />
                          <span className="text-[13px]">이미지 추출 중</span>
                          <span className="numeral text-amber-300">{progress}%</span>
                        </div>
                        <div className="w-full h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
                          <div className="h-full bg-amber-400 rounded-full transition-all duration-300" style={{ width: `${progress}%` }} />
                        </div>
                      </div>
                    )}

                    {/* Done / Error: reset button */}
                    {(status === 'done' || status === 'error') && (
                      <button onClick={resetAll}
                        className="premium-btn-secondary press flex items-center gap-2 px-4 py-2 text-[12.5px]">
                        <Trash2 className="w-3.5 h-3.5" strokeWidth={1.75} /> 새 파일 업로드
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ── Right: Settings ── */}
          <div className="lg:col-span-4">
            <div className="premium-panel overflow-hidden h-full">
              <div className="px-5 py-3.5 border-b border-white/[0.05] bg-white/[0.015] flex items-center gap-2.5">
                <span className="section-num">02</span>
                <Image className="w-3.5 h-3.5 text-amber-400" strokeWidth={1.75} />
                <h2 className="text-[12.5px] font-semibold text-zinc-200 tracking-tight">출력 설정</h2>
              </div>
              <div className="p-5 space-y-6">
                {/* Format */}
                <div className="space-y-2.5">
                  <label className="eyebrow block">이미지 포맷</label>
                  <div className="grid grid-cols-2 gap-2">
                    {['jpeg', 'png'].map(f => (
                      <button key={f} onClick={() => setFormat(f)}
                        className={`press py-2.5 px-4 rounded-lg border text-[12.5px] font-semibold transition-colors ${format === f
                          ? 'bg-amber-400 text-zinc-950 border-amber-400'
                          : 'bg-white/[0.03] text-zinc-400 border-white/[0.06] hover:bg-white/[0.06] hover:text-zinc-100 hover:border-white/10'}`}>
                        {f.toUpperCase()}
                      </button>
                    ))}
                  </div>
                  <p className="text-[11px] text-zinc-500 leading-relaxed">JPEG는 용량이 작고, PNG는 화질 손실이 없습니다.</p>
                </div>

                {/* Scale */}
                <div className="space-y-2.5">
                  <label className="eyebrow block">해상도 배율</label>
                  <div className="space-y-1.5">
                    {SCALE_OPTIONS.map(opt => (
                      <button key={opt.value} onClick={() => setScale(opt.value)}
                        className={`press w-full flex items-center justify-between px-3.5 py-2.5 rounded-lg border text-[12.5px] transition-colors ${scale === opt.value
                          ? 'bg-amber-400/[0.06] border-amber-400/30 text-amber-200'
                          : 'bg-white/[0.02] border-white/[0.06] text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-200'}`}>
                        <span className="font-medium">{opt.label}</span>
                        <span className="numeral text-[10.5px] opacity-70">{opt.sub}</span>
                      </button>
                    ))}
                  </div>
                  <p className="text-[11px] text-zinc-500 leading-relaxed">배율이 높을수록 선명하지만 처리가 느리고 용량이 커집니다.</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ── Results Grid ── */}
        <AnimatePresence>
          {results.length > 0 && (
            <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="premium-panel overflow-hidden">
              <div className="px-5 py-3.5 border-b border-white/[0.05] bg-white/[0.015] flex items-center justify-between">
                <h2 className="text-[12.5px] font-semibold text-zinc-200 flex items-center gap-2.5 tracking-tight">
                  <span className="section-num">RESULT</span>
                  <Image className="w-3.5 h-3.5 text-amber-400" strokeWidth={1.75} />
                  변환 결과
                  <span className="numeral text-[11px] px-1.5 py-px rounded bg-amber-400/10 border border-amber-400/25 text-amber-300 ml-1">{results.length}장</span>
                </h2>
                <button onClick={handleDownloadZip}
                  className="premium-btn-primary press flex items-center gap-2 px-4 py-2 text-[12.5px]">
                  <Archive className="w-3.5 h-3.5" strokeWidth={2.25} /> ZIP으로 다운로드
                </button>
              </div>
              <div className="p-5">
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                  {results.map(img => {
                    const ext = format === 'png' ? 'png' : 'jpg';
                    const downloadName = `${file.name.replace(/\.[^/.]+$/, '')}_page_${img.page}.${ext}`;
                    return (
                      <div key={img.page} className="group flex flex-col bg-white/[0.02] rounded-xl border border-white/[0.06] overflow-hidden hover:border-amber-400/30 transition-colors">
                        <div className="relative bg-white/5 overflow-hidden flex items-center justify-center p-2" style={{ aspectRatio: '1/1.4' }}>
                          <img src={img.dataUrl} className="max-w-full max-h-full object-contain shadow-sm bg-white rounded" alt={`Page ${img.page}`} />
                        </div>
                        <div className="p-2.5 bg-black/30 flex items-center justify-between border-t border-white/[0.05]">
                          <div>
                            <p className="text-[12.5px] font-semibold text-zinc-100">페이지 {img.page}</p>
                            <p className="numeral text-[10.5px] text-zinc-500">{img.width} × {img.height}px</p>
                          </div>
                          <a href={img.dataUrl} download={downloadName}
                            className="press p-1.5 text-zinc-500 hover:text-amber-300 hover:bg-amber-400/[0.08] rounded-md transition-colors" title="개별 다운로드">
                            <Download className="w-3.5 h-3.5" strokeWidth={1.75} />
                          </a>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

      </div>
    </div>
  );
}
