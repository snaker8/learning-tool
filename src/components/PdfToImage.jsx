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
    <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
      <div className="max-w-6xl mx-auto space-y-6">

        {/* Error */}
        <AnimatePresence>
          {error && (
            <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              className="flex items-center gap-3 p-4 bg-red-500/10 border border-red-500/30 text-red-400 rounded-xl">
              <AlertCircle className="w-5 h-5 flex-shrink-0" />
              <p className="text-sm">{error}</p>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

          {/* ── Left: Upload / File Info ── */}
          <div className="lg:col-span-8">
            <div className="premium-panel overflow-hidden h-full">
              <div className="px-6 py-4 border-b border-white/5 bg-white/[0.02] flex items-center gap-2">
                <Upload className="w-4 h-4 text-white/40" />
                <h2 className="text-sm font-semibold text-white">PDF 파일 업로드</h2>
              </div>
              <div className="p-6 flex flex-col">
                {!file ? (
                  /* Dropzone */
                  <div
                    onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}
                    onClick={() => fileInputRef.current?.click()}
                    className={`flex-1 flex flex-col items-center justify-center min-h-[280px] border-2 border-dashed rounded-xl cursor-pointer transition-all
                      ${isDragOver ? 'border-white/60 bg-white/[0.06]' : 'border-white/15 hover:border-white/40 hover:bg-white/[0.03]'}`}
                  >
                    <div className="w-16 h-16 mb-4 rounded-full bg-white/10 flex items-center justify-center text-white/60">
                      <Upload className="w-7 h-7" />
                    </div>
                    <p className="text-base font-medium text-white mb-1">클릭하거나 파일을 드래그하세요</p>
                    <p className="text-sm text-white/30">지원 형식: .pdf</p>
                    <input type="file" accept=".pdf" ref={fileInputRef} onChange={handleFileChange} className="hidden" />
                  </div>
                ) : (
                  /* File Info */
                  <div className="flex-1 flex flex-col items-center justify-center min-h-[280px] bg-white/[0.02] rounded-xl border border-white/5 p-8">
                    <FileText className="w-14 h-14 text-white/40 mb-4" />
                    <h3 className="text-lg font-semibold text-white text-center break-all mb-1">{file.name}</h3>
                    <p className="text-sm text-white/40 mb-8">{(file.size / 1024 / 1024).toFixed(2)} MB</p>

                    {/* Idle: action buttons */}
                    {status === 'idle' && (
                      <div className="flex gap-3">
                        <button onClick={resetAll}
                          className="px-4 py-2 text-sm font-medium text-white/60 bg-white/5 border border-white/10 rounded-lg hover:bg-white/10 transition-colors">
                          취소
                        </button>
                        <button onClick={handleConvert}
                          className="premium-btn-primary px-6 py-2 text-sm flex items-center gap-2">
                          변환 시작 <Image className="w-4 h-4" />
                        </button>
                      </div>
                    )}

                    {/* Processing */}
                    {status === 'processing' && (
                      <div className="w-full max-w-sm space-y-3 text-center">
                        <div className="flex items-center justify-center gap-2 text-white/70 font-medium">
                          <Loader2 className="w-4 h-4 animate-spin" />
                          이미지 추출 중... {progress}%
                        </div>
                        <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden">
                          <div className="h-full bg-white rounded-full transition-all duration-300" style={{ width: `${progress}%` }} />
                        </div>
                      </div>
                    )}

                    {/* Done / Error: reset button */}
                    {(status === 'done' || status === 'error') && (
                      <button onClick={resetAll}
                        className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white/50 bg-white/5 border border-white/10 rounded-lg hover:bg-white/10 transition-colors">
                        <Trash2 className="w-4 h-4" /> 새 파일 업로드
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
              <div className="px-6 py-4 border-b border-white/5 bg-white/[0.02] flex items-center gap-2">
                <Image className="w-4 h-4 text-white/40" />
                <h2 className="text-sm font-semibold text-white">출력 설정</h2>
              </div>
              <div className="p-6 space-y-6">
                {/* Format */}
                <div className="space-y-3">
                  <label className="block text-sm font-medium text-white/60">이미지 포맷</label>
                  <div className="grid grid-cols-2 gap-2">
                    {['jpeg', 'png'].map(f => (
                      <button key={f} onClick={() => setFormat(f)}
                        className={`py-2.5 px-4 rounded-lg border text-sm font-semibold transition-all ${format === f
                          ? 'bg-white text-black border-white'
                          : 'bg-white/5 text-white/50 border-white/10 hover:bg-white/10 hover:text-white'}`}>
                        {f.toUpperCase()}
                      </button>
                    ))}
                  </div>
                  <p className="text-xs text-white/30">JPEG는 용량이 작고, PNG는 화질 손실이 없습니다.</p>
                </div>

                {/* Scale */}
                <div className="space-y-3">
                  <label className="block text-sm font-medium text-white/60">해상도 배율</label>
                  <div className="space-y-2">
                    {SCALE_OPTIONS.map(opt => (
                      <button key={opt.value} onClick={() => setScale(opt.value)}
                        className={`w-full flex items-center justify-between px-4 py-2.5 rounded-lg border text-sm transition-all ${scale === opt.value
                          ? 'bg-white/10 border-white/40 text-white'
                          : 'bg-white/[0.02] border-white/10 text-white/40 hover:bg-white/5 hover:text-white/70'}`}>
                        <span className="font-medium">{opt.label}</span>
                        <span className="text-xs opacity-60">{opt.sub}</span>
                      </button>
                    ))}
                  </div>
                  <p className="text-xs text-white/30">배율이 높을수록 선명하지만 처리가 느리고 용량이 커집니다.</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ── Results Grid ── */}
        <AnimatePresence>
          {results.length > 0 && (
            <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="premium-panel overflow-hidden">
              <div className="px-6 py-4 border-b border-white/5 bg-white/[0.02] flex items-center justify-between">
                <h2 className="text-sm font-semibold text-white flex items-center gap-2">
                  <Image className="w-4 h-4 text-white/40" />
                  변환 결과
                  <span className="px-2 py-0.5 rounded-full bg-white/10 text-white/60 text-xs font-normal">{results.length}장</span>
                </h2>
                <button onClick={handleDownloadZip}
                  className="premium-btn-primary flex items-center gap-2 px-4 py-2 text-sm">
                  <Archive className="w-4 h-4" /> ZIP으로 다운로드
                </button>
              </div>
              <div className="p-6">
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                  {results.map(img => {
                    const ext = format === 'png' ? 'png' : 'jpg';
                    const downloadName = `${file.name.replace(/\.[^/.]+$/, '')}_page_${img.page}.${ext}`;
                    return (
                      <div key={img.page} className="group flex flex-col bg-white/[0.02] rounded-xl border border-white/10 overflow-hidden hover:border-white/25 transition-colors">
                        <div className="relative bg-white/5 overflow-hidden flex items-center justify-center p-2" style={{ aspectRatio: '1/1.4' }}>
                          <img src={img.dataUrl} className="max-w-full max-h-full object-contain shadow-sm bg-white rounded" alt={`Page ${img.page}`} />
                        </div>
                        <div className="p-3 bg-black/20 flex items-center justify-between border-t border-white/5">
                          <div>
                            <p className="text-sm font-semibold text-white">페이지 {img.page}</p>
                            <p className="text-xs text-white/30">{img.width} × {img.height}px</p>
                          </div>
                          <a href={img.dataUrl} download={downloadName}
                            className="p-1.5 text-white/30 hover:text-white hover:bg-white/10 rounded-lg transition-colors" title="개별 다운로드">
                            <Download className="w-4 h-4" />
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
