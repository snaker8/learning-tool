import { useState, useEffect } from 'react'
import Header from './components/Header'
import Sidebar from './components/Sidebar'
import PdfViewer from './components/PdfViewer'
import AnswerExtractor from './components/AnswerExtractor'
import PdfSplitter from './components/PdfSplitter'
import Converter from './components/Converter'
import Home from './components/Home'
import { CropProvider, useCropContext } from './context/CropContext'
import { FileProvider, useSharedFile } from './context/FileContext'
import { ToastProvider } from './context/ToastContext'
import ToolIntro from './components/ToolIntro'
import { FileText, Upload } from 'lucide-react'

function App() {
  return (
    <ToastProvider>
      <FileProvider>
        <CropProvider>
          <AppShell />
        </CropProvider>
      </FileProvider>
    </ToastProvider>
  )
}

function AppShell() {
  const { clearCrops } = useCropContext();
  const { file: sharedFile, token, openFile: setSharedFile, clearFile } = useSharedFile();
  const [zoomScale, setZoomScale] = useState(1.5);
  const [activeTab, setActiveTab] = useState('home');

  // 판서 제작기(maker)는 PDF 만 다룬다. 공유 파일이 PDF 일 때만 뷰어에 넘긴다.
  const makerPdf = sharedFile?.type === 'application/pdf' ? sharedFile : null;

  // 새 파일이 들어오면 이전 크롭을 비운다 (다른 교재의 크롭이 남지 않도록)
  useEffect(() => {
    clearCrops();
    // token 이 바뀔 때만 — 같은 파일을 다시 열어도 초기화된다
  }, [token]);

  const openFile = (file) => {
    if (!file) return;
    setSharedFile(file);
  };

  const handleOpenFile = (e) => {
    openFile(e.target.files[0]);
    // input 재선택을 위해 value 비우기 (같은 파일 다시 열 때도 onChange 발생)
    e.target.value = '';
  };

  // ★ picker 열기 직전 호출 — 이전 PDF/크롭을 미리 unmount 시켜
  // 메모리를 비우고 picker 가 OS 측에서 freeze ("응답없음") 되는 걸 방지.
  const handleBeforePick = () => {
    if (sharedFile) clearFile();
  };

  // Window-level guard: prevent browser from opening the dropped file when
  // the user misses the drop zone (otherwise the whole page navigates away).
  useEffect(() => {
    const stop = (e) => e.preventDefault();
    window.addEventListener('dragover', stop);
    window.addEventListener('drop', stop);
    return () => {
      window.removeEventListener('dragover', stop);
      window.removeEventListener('drop', stop);
    };
  }, []);

  const handleZoomIn = () => setZoomScale(prev => Math.min(prev + 0.1, 3.0));
  const handleZoomOut = () => setZoomScale(prev => Math.max(prev - 0.1, 0.5));
  const handleZoomReset = () => setZoomScale(1.5);

  return (
    <div className="app-canvas grain h-screen w-screen flex flex-col overflow-hidden text-zinc-100">

      <Header
        zoomLevel={zoomScale}
        onZoomIn={handleZoomIn}
        onZoomOut={handleZoomOut}
        onZoomReset={handleZoomReset}
        onOpenFile={handleOpenFile}
        onBeforePick={handleBeforePick}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        fileName={sharedFile?.name || null}
      />

      <div className="flex-1 flex overflow-hidden pt-16 relative">
        {activeTab === 'home' ? (
          <Home onPick={setActiveTab} />
        ) : activeTab === 'maker' ? (
          <>
            <MakerMain
              pdfFile={makerPdf}
              zoomScale={zoomScale}
              onOpenFile={handleOpenFile}
              onDropFile={openFile}
              hasNonPdf={!!sharedFile && !makerPdf}
            />
            <Sidebar />
          </>
        ) : activeTab === 'extractor' ? (
          <ToolPanel toolId="extractor">
            <AnswerExtractor />
          </ToolPanel>
        ) : activeTab === 'splitter' ? (
          <ToolPanel toolId="splitter">
            <PdfSplitter />
          </ToolPanel>
        ) : (
          <ToolPanel toolId="toimage">
            <Converter />
          </ToolPanel>
        )}
      </div>

    </div>
  )
}

/* 도구 화면 공통 껍데기 — 위에 안내 띠, 아래에 도구 본체 */
function ToolPanel({ toolId, children }) {
  return (
    <div className="flex-1 flex flex-col overflow-hidden min-w-0">
      <ToolIntro toolId={toolId} />
      <div className="flex-1 flex flex-col overflow-hidden min-h-0">{children}</div>
    </div>
  );
}

function MakerMain({ pdfFile, zoomScale, onOpenFile, onDropFile, hasNonPdf }) {
  const [isDragOver, setIsDragOver] = useState(false);

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.types.includes('Files')) setIsDragOver(true);
  };
  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.currentTarget === e.target) setIsDragOver(false);
  };
  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) onDropFile(file);
  };

  return (
    <main
      className="flex-1 relative overflow-y-auto custom-scrollbar p-10 flex flex-col items-center min-h-0"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {pdfFile ? (
        <PdfViewer file={pdfFile} zoomScale={zoomScale} />
      ) : (
        <EmptyState onOpenFile={onOpenFile} isDragOver={isDragOver} hasNonPdf={hasNonPdf} />
      )}
      {pdfFile && isDragOver && (
        <div className="pointer-events-none absolute inset-4 rounded-3xl border-2 border-dashed border-amber-400/60 bg-amber-400/5 flex items-center justify-center z-50">
          <div className="px-5 py-3 rounded-xl glass-strong text-amber-200 font-semibold text-[15px] tracking-tight">
            새 PDF로 교체
          </div>
        </div>
      )}
    </main>
  );
}

function EmptyState({ onOpenFile, isDragOver, hasNonPdf }) {
  return (
    <div className="w-full max-w-4xl h-full min-h-[520px] flex flex-col items-center justify-center reveal">
      <div className={`relative w-full h-full rounded-3xl overflow-hidden flex flex-col items-center justify-center transition-colors ${
        isDragOver
          ? 'border-2 border-dashed border-amber-400/60 bg-amber-400/[0.04]'
          : 'glass'
      }`}>
        <div className="absolute top-6 left-8 section-num">판서 제작기</div>
        <div className="absolute top-6 right-8 eyebrow">드래그-크롭 모드</div>

        <div className="absolute inset-0 dot-pattern opacity-40 pointer-events-none" />

        <div className="relative z-10 flex flex-col items-center gap-6 px-8 text-center">
          <div className="relative">
            <div className="w-16 h-16 rounded-2xl glass flex items-center justify-center">
              <FileText className="w-7 h-7 text-zinc-300" strokeWidth={1.5} />
            </div>
            <div className="absolute -inset-3 rounded-2xl border border-amber-400/20 animate-pulse pointer-events-none" />
          </div>

          <div className="space-y-2 max-w-md">
            <h2 className="text-2xl font-semibold text-zinc-100 tracking-tight">
              {hasNonPdf ? '이 도구는 PDF만 다룹니다' : 'PDF 파일을 열어주세요'}
            </h2>
            <p className="text-sm text-zinc-400 leading-relaxed">
              {hasNonPdf
                ? '지금 열려 있는 파일은 이미지입니다. 판서 제작기에는 PDF를 열어주세요.'
                : '파일을 열고 캔버스에 드래그하면 자동으로 영역을 잘라 문제 단위로 인식합니다.'}
            </p>
          </div>

          <label className="press cursor-pointer mt-2 inline-flex items-center gap-2.5 px-5 py-3 rounded-xl bg-amber-400 hover:bg-amber-300 text-zinc-950 font-semibold text-sm shadow-[0_0_0_1px_rgba(0,0,0,0.2),0_0_24px_-4px_rgba(251,191,36,0.5)] transition-colors">
            <Upload className="w-4 h-4" strokeWidth={2.25} />
            <span>PDF 파일 열기</span>
            <input
              type="file"
              accept="application/pdf"
              className="hidden"
              onChange={onOpenFile}
            />
          </label>

          {/* 홈 카드와 같은 3단계 — 탭으로 바로 들어온 사람도 흐름을 알 수 있게 */}
          <div className="flex items-center gap-1.5 flex-wrap justify-center mt-1">
            {['PDF 열기', '문제 영역 드래그', '복사해서 붙여넣기'].map((s, i, arr) => (
              <span key={s} className="flex items-center gap-1.5">
                <span className="text-[13px] text-zinc-300 px-2 py-1 rounded-md bg-white/[0.04] border border-white/[0.05]">
                  <span className="text-zinc-400 mr-1">{i + 1}</span>{s}
                </span>
                {i < arr.length - 1 && <span className="text-zinc-500 text-[11.5px]">→</span>}
              </span>
            ))}
          </div>

          <div className="text-[12.5px] text-zinc-400 mono">
            .PDF · 이 컴퓨터에서만 처리됩니다
          </div>
        </div>

        <div className="absolute bottom-6 left-8 right-8 flex items-center justify-between">
          <span className="section-num">LEARNING TOOL STUDIO</span>
          <span className="section-num">v1.0</span>
        </div>
      </div>
    </div>
  );
}

export default App
