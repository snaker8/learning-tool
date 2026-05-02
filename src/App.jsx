import { useState } from 'react'
import Header from './components/Header'
import Sidebar from './components/Sidebar'
import PdfViewer from './components/PdfViewer'
import AnswerExtractor from './components/AnswerExtractor'
import PdfSplitter from './components/PdfSplitter'
import Converter from './components/Converter'
import { CropProvider } from './context/CropContext'
import { FileText, Upload } from 'lucide-react'

function App() {
  const [zoomScale, setZoomScale] = useState(1.5);
  const [pdfFile, setPdfFile] = useState(null);
  const [activeTab, setActiveTab] = useState('maker');

  const handleOpenFile = (e) => {
    const file = e.target.files[0];
    if (file) {
      setPdfFile(file);
    }
  };

  const handleZoomIn = () => setZoomScale(prev => Math.min(prev + 0.1, 3.0));
  const handleZoomOut = () => setZoomScale(prev => Math.max(prev - 0.1, 0.5));
  const handleZoomReset = () => setZoomScale(1.5);

  const handleOpenPageModal = () => {
    const pageNum = prompt("이동할 페이지 번호를 입력하세요:");
    if (pageNum) {
      const element = document.getElementById(`page-${pageNum}`);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } else {
        alert("해당 페이지를 찾을 수 없습니다.");
      }
    }
  };

  return (
    <CropProvider>
      <div className="app-canvas grain h-screen w-screen flex flex-col overflow-hidden text-zinc-100">

        <Header
          zoomLevel={zoomScale}
          onZoomIn={handleZoomIn}
          onZoomOut={handleZoomOut}
          onZoomReset={handleZoomReset}
          onOpenPageModal={handleOpenPageModal}
          onOpenFile={handleOpenFile}
          activeTab={activeTab}
          onTabChange={setActiveTab}
        />

        <div className="flex-1 flex overflow-hidden pt-16 relative">
          {activeTab === 'maker' ? (
            <>
              <main className="flex-1 relative overflow-y-auto custom-scrollbar p-10 flex flex-col items-center min-h-0">
                {pdfFile ? (
                  <PdfViewer file={pdfFile} zoomScale={zoomScale} />
                ) : (
                  <EmptyState onOpenFile={handleOpenFile} />
                )}
              </main>

              <Sidebar />
            </>
          ) : activeTab === 'extractor' ? (
            <AnswerExtractor />
          ) : activeTab === 'splitter' ? (
            <div className="flex-1 overflow-hidden">
              <PdfSplitter />
            </div>
          ) : (
            <div className="flex-1 overflow-hidden">
              <Converter />
            </div>
          )}
        </div>

      </div>
    </CropProvider>
  )
}

function EmptyState({ onOpenFile }) {
  return (
    <div className="w-full max-w-4xl h-full min-h-[520px] flex flex-col items-center justify-center reveal">
      <div className="relative w-full h-full rounded-3xl glass overflow-hidden flex flex-col items-center justify-center">
        {/* Decorative editorial number */}
        <div className="absolute top-6 left-8 section-num">
          01 / 04 — 판서 제작
        </div>
        <div className="absolute top-6 right-8 eyebrow">
          드래그-크롭 모드
        </div>

        {/* Faint dot grid behind content */}
        <div className="absolute inset-0 dot-pattern opacity-40 pointer-events-none" />

        <div className="relative z-10 flex flex-col items-center gap-6 px-8 text-center">
          <div className="relative">
            <div className="w-16 h-16 rounded-2xl glass flex items-center justify-center">
              <FileText className="w-7 h-7 text-zinc-400" strokeWidth={1.5} />
            </div>
            <div className="absolute -inset-3 rounded-2xl border border-amber-400/20 animate-pulse pointer-events-none" />
          </div>

          <div className="space-y-2 max-w-md">
            <h2 className="text-2xl font-semibold text-zinc-100 tracking-tight">
              PDF 파일을 열어주세요
            </h2>
            <p className="text-sm text-zinc-500 leading-relaxed">
              파일을 열고 캔버스에 드래그하면 자동으로 영역을 잘라
              문제 단위로 인식합니다.
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

          <div className="text-[11px] text-zinc-600 mono mt-1">
            .PDF · 드래그 자동 인식 활성
          </div>
        </div>

        {/* Bottom hairline label */}
        <div className="absolute bottom-6 left-8 right-8 flex items-center justify-between">
          <span className="section-num">LEARNING TOOL STUDIO</span>
          <span className="section-num">v1.0</span>
        </div>
      </div>
    </div>
  );
}

export default App
