import { useState } from 'react'
import Header from './components/Header'
import Sidebar from './components/Sidebar'
import PdfViewer from './components/PdfViewer' // Disabled for build test
import AnswerExtractor from './components/AnswerExtractor'
import { CropProvider } from './context/CropContext'

function App() {
  const [zoomScale, setZoomScale] = useState(1.5);
  const [pdfFile, setPdfFile] = useState(null);
  const [activeTab, setActiveTab] = useState('maker'); // 'maker' | 'extractor'

  const handleOpenFile = (e) => {
    const file = e.target.files[0];
    if (file) {
      setPdfFile(file);
    }
  };

  const handleZoomIn = () => setZoomScale(prev => Math.min(prev + 0.1, 3.0));
  const handleZoomOut = () => setZoomScale(prev => Math.max(prev - 0.1, 0.5));
  const handleZoomReset = () => setZoomScale(1.5);

  /* Page Navigation Handler */
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
      <div className="h-screen w-screen flex flex-col overflow-hidden bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-slate-900 via-[#0a0a0a] to-black text-slate-100 font-sans selection:bg-cyan-500/30">

        {/* 1. Header (Fixed Top) */}
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

        {/* 2. Main Content Area (Below Header) */}
        <div className="flex-1 flex overflow-hidden pt-16">
          {activeTab === 'maker' ? (
            <>
              {/* Left: PDF Canvas Area */}
              <main className="flex-1 relative overflow-y-auto bg-transparent custom-scrollbar p-8 flex flex-col items-center min-h-0">
                {pdfFile ? (
                  <PdfViewer file={pdfFile} zoomScale={zoomScale} />
                ) : (
                  <div className="w-full max-w-4xl min-h-[500px] border-2 border-dashed border-slate-300 rounded-2xl flex flex-col items-center justify-center text-slate-400 bg-white/40 backdrop-blur-sm">
                    <p className="text-2xl font-bold mb-2">PDF 파일을 열어주세요</p>
                    <p className="text-sm opacity-70">드래그하면 자동으로 잘리고 인식됩니다.</p>
                  </div>
                )}
              </main>

              {/* Right: Sidebar (Fixed Width) */}
              <Sidebar />
            </>
          ) : (
            /* Answer Extractor Mode */
            <AnswerExtractor />
          )}
        </div>

      </div>
    </CropProvider>
  )
}

export default App
