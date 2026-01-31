import React from 'react';
import { Zap, ZoomIn, ZoomOut, RotateCcw, FileText, FolderOpen, Loader2, Scissors, Sparkles } from 'lucide-react';

export default function Header({
    onZoomIn,
    onZoomOut,
    onZoomReset,
    onOpenPageModal,
    onOpenFile,
    zoomLevel = 'Fit',
    fileName,
    isLoading = false,
    activeTab = 'maker',
    onTabChange
}) {
    return (
        <header className="fixed top-0 left-0 right-0 h-16 bg-black/20 backdrop-blur-xl border-b border-white/5 shadow-2xl z-50 flex items-center justify-between px-6 text-slate-100 transition-all">
            {/* Logo & Title */}
            <div className="flex items-center gap-4">
                <div className="flex items-center gap-3 group">
                    <div className="p-1.5 bg-gradient-to-br from-blue-500/20 to-purple-500/20 rounded-lg border border-blue-500/20 group-hover:border-blue-500/50 transition-colors">
                        <Zap className="w-5 h-5 text-blue-400 group-hover:text-blue-300 transition-colors" />
                    </div>
                    <h1 className="text-xl font-bold bg-gradient-to-r from-white via-slate-200 to-slate-400 bg-clip-text text-transparent tracking-tight">
                        Learning Tool Studio
                    </h1>
                </div>

                {/* Tab Navigation */}
                <div className="flex items-center gap-1 bg-black/40 rounded-xl p-1 border border-white/5 ml-4">
                    <button
                        onClick={() => onTabChange?.('maker')}
                        className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === 'maker'
                            ? 'bg-gradient-to-r from-blue-600/80 to-indigo-600/80 text-white shadow-lg shadow-blue-500/20'
                            : 'text-slate-400 hover:text-white hover:bg-white/5'
                            }`}
                    >
                        <Scissors className="w-4 h-4" />
                        판서 제작기
                    </button>
                    <button
                        onClick={() => onTabChange?.('extractor')}
                        className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === 'extractor'
                            ? 'bg-gradient-to-r from-violet-600/80 to-purple-600/80 text-white shadow-lg shadow-violet-500/20'
                            : 'text-slate-400 hover:text-white hover:bg-white/5'
                            }`}
                    >
                        <Sparkles className="w-4 h-4" />
                        답 추출기
                    </button>
                </div>
            </div>

            {/* Controls - Only show for maker tab */}
            {activeTab === 'maker' && (
                <div className="flex items-center gap-4">
                    {/* Zoom Controls */}
                    <div className="flex items-center gap-1 bg-black/40 rounded-lg px-2 py-1.5 border border-white/5 shadow-inner">
                        <button onClick={onZoomOut} className="p-1.5 hover:bg-white/10 rounded-md text-slate-400 hover:text-white transition-all active:scale-95">
                            <ZoomOut className="w-4 h-4" />
                        </button>
                        <span className="text-xs font-mono w-14 text-center text-slate-300 select-none tabular-nums">
                            {typeof zoomLevel === 'number' ? `${Math.round(zoomLevel * 100)}%` : zoomLevel}
                        </span>
                        <button onClick={onZoomIn} className="p-1.5 hover:bg-white/10 rounded-md text-slate-400 hover:text-white transition-all active:scale-95">
                            <ZoomIn className="w-4 h-4" />
                        </button>
                        <div className="w-px h-4 bg-white/10 mx-1"></div>
                        <button onClick={onZoomReset} className="p-1.5 text-blue-400 hover:text-blue-300 hover:bg-blue-400/10 rounded-md transition-all" title="Reset Zoom">
                            <RotateCcw className="w-3.5 h-3.5" />
                        </button>
                    </div>

                    {/* Page Modal Button */}
                    <button
                        onClick={onOpenPageModal}
                        className="flex items-center gap-2 bg-white/5 hover:bg-white/10 px-3 py-1.5 rounded-lg text-sm transition-all border border-white/5 hover:border-white/10 group shadow-sm active:scale-95"
                    >
                        <FileText className="w-4 h-4 text-slate-400 group-hover:text-blue-400 transition-colors" />
                        <span className="text-slate-300 group-hover:text-slate-100 font-medium">페이지</span>
                        <span className="bg-blue-500/20 text-blue-300 text-[10px] px-1.5 py-0.5 rounded border border-blue-500/20 font-mono">
                            All
                        </span>
                    </button>

                    {/* Loading Spinner */}
                    {isLoading && (
                        <div className="flex items-center gap-2 text-sm">
                            <Loader2 className="w-4 h-4 text-yellow-400 animate-spin" />
                            <span className="text-yellow-400">분석중...</span>
                        </div>
                    )}

                    {/* File Open */}
                    <label className="flex items-center gap-2 bg-gradient-to-r from-blue-600/90 to-indigo-600/90 hover:from-blue-500 hover:to-indigo-500 text-white px-4 py-2 rounded-lg font-bold cursor-pointer transition-all shadow-lg shadow-blue-500/20 hover:shadow-blue-500/40 hover:-translate-y-0.5 active:translate-y-0 border border-white/10 group">
                        <FolderOpen className="w-4 h-4 group-hover:animate-bounce" />
                        <span className="text-sm tracking-wide">PDF 열기</span>
                        <input
                            type="file"
                            accept="application/pdf"
                            className="hidden"
                            onChange={onOpenFile}
                        />
                    </label>
                </div>
            )}
        </header>
    );
}
