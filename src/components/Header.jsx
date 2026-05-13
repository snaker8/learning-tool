import React from 'react';
import { motion } from 'framer-motion';
import { ZoomIn, ZoomOut, RotateCcw, FileText, FolderOpen, Loader2, Scissors, Sparkles, Split, ArrowLeftRight } from 'lucide-react';

const TABS = [
    { id: 'maker', label: '판서 제작기', Icon: Scissors },
    { id: 'extractor', label: '답 추출기', Icon: Sparkles },
    { id: 'splitter', label: 'PDF 분할기', Icon: Split },
    { id: 'toimage', label: 'PDF ↔ 이미지', Icon: ArrowLeftRight },
];

export default function Header({
    onZoomIn,
    onZoomOut,
    onZoomReset,
    onOpenPageModal,
    onOpenFile,
    zoomLevel = 'Fit',
    isLoading = false,
    activeTab = 'maker',
    onTabChange,
    hasPdfFile = false,
}) {
    return (
        <header className="fixed top-0 left-0 right-0 h-16 z-50 flex items-center justify-between pl-5 pr-4 glass-strong">
            {/* Brand + Tabs */}
            <div className="flex items-center gap-6">
                {/* Wordmark — editorial, tight */}
                <div className="flex items-center gap-2.5 select-none">
                    <Mark />
                    <div className="flex items-baseline gap-2">
                        <span className="text-[15px] font-semibold tracking-tight text-zinc-100">
                            Learning Tool
                        </span>
                        <span className="text-[15px] font-light tracking-tight text-zinc-500 italic">
                            Studio
                        </span>
                    </div>
                </div>

                {/* Hairline divider */}
                <div className="w-px h-6 bg-white/10" />

                {/* Tabs — single accent with sliding indicator */}
                <nav className="flex items-center gap-0.5">
                    {TABS.map(({ id, label, Icon }) => {
                        const isActive = activeTab === id;
                        return (
                            <button
                                key={id}
                                onClick={() => onTabChange?.(id)}
                                className={`relative press flex items-center gap-2 px-3.5 py-2 rounded-lg text-[13px] font-medium transition-colors ${
                                    isActive
                                        ? 'text-amber-300'
                                        : 'text-zinc-400 hover:text-zinc-100'
                                }`}
                            >
                                {isActive && (
                                    <motion.span
                                        layoutId="tab-active"
                                        className="absolute inset-0 rounded-lg bg-amber-400/[0.08] border border-amber-400/20"
                                        style={{
                                            boxShadow: 'inset 0 1px 0 rgba(252, 211, 77, 0.12), 0 0 24px -8px rgba(251, 191, 36, 0.4)',
                                        }}
                                        transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                                    />
                                )}
                                <Icon className="w-3.5 h-3.5 relative z-10" strokeWidth={2} />
                                <span className="relative z-10">{label}</span>
                            </button>
                        );
                    })}
                </nav>
            </div>

            {/* Right controls — only on maker tab AND only after a PDF is loaded
                (otherwise the empty-state card already shows the open button) */}
            {activeTab === 'maker' && hasPdfFile && (
                <div className="flex items-center gap-2.5">
                    {/* Zoom cluster */}
                    <div className="flex items-center h-9 rounded-lg glass overflow-hidden">
                        <IconBtn onClick={onZoomOut} aria-label="축소">
                            <ZoomOut className="w-3.5 h-3.5" />
                        </IconBtn>
                        <div className="w-px h-4 bg-white/8" />
                        <span className="numeral text-[12px] text-zinc-300 px-3 select-none min-w-[52px] text-center">
                            {typeof zoomLevel === 'number' ? `${Math.round(zoomLevel * 100)}%` : zoomLevel}
                        </span>
                        <div className="w-px h-4 bg-white/8" />
                        <IconBtn onClick={onZoomIn} aria-label="확대">
                            <ZoomIn className="w-3.5 h-3.5" />
                        </IconBtn>
                        <div className="w-px h-4 bg-white/8" />
                        <IconBtn onClick={onZoomReset} aria-label="초기화" accent>
                            <RotateCcw className="w-3 h-3" />
                        </IconBtn>
                    </div>

                    {/* Page navigator */}
                    <button
                        onClick={onOpenPageModal}
                        className="press h-9 flex items-center gap-2 px-3 rounded-lg glass hover:bg-white/[0.045] transition-colors group"
                    >
                        <FileText className="w-3.5 h-3.5 text-zinc-400 group-hover:text-zinc-200 transition-colors" strokeWidth={1.75} />
                        <span className="text-[12px] text-zinc-300 font-medium">페이지</span>
                        <span className="numeral text-[10px] px-1.5 py-px rounded bg-white/5 border border-white/8 text-zinc-400">
                            All
                        </span>
                    </button>

                    {isLoading && (
                        <div className="flex items-center gap-2 text-[12px] px-2.5 h-9 rounded-lg glass">
                            <Loader2 className="w-3.5 h-3.5 text-amber-400 animate-spin" strokeWidth={2} />
                            <span className="text-amber-300/90 font-medium">분석 중</span>
                        </div>
                    )}

                    {/* Primary CTA — single accent */}
                    <label className="press h-9 flex items-center gap-2 pl-3 pr-3.5 rounded-lg bg-amber-400 hover:bg-amber-300 text-zinc-950 font-semibold cursor-pointer transition-colors shadow-[0_0_0_1px_rgba(0,0,0,0.25),0_0_24px_-6px_rgba(251,191,36,0.6)] group">
                        <FolderOpen className="w-3.5 h-3.5" strokeWidth={2.25} />
                        <span className="text-[13px] tracking-tight">PDF 열기</span>
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

/* — — — Subcomponents — — — */

function IconBtn({ children, accent, ...props }) {
    return (
        <button
            {...props}
            className={`press h-full px-2.5 flex items-center justify-center transition-colors ${
                accent
                    ? 'text-amber-400 hover:text-amber-300 hover:bg-amber-400/[0.08]'
                    : 'text-zinc-400 hover:text-zinc-100 hover:bg-white/5'
            }`}
        >
            {children}
        </button>
    );
}

/* Editorial mark — geometric, not generic icon */
function Mark() {
    return (
        <div className="relative w-7 h-7 flex items-center justify-center">
            <svg viewBox="0 0 28 28" className="w-7 h-7" aria-hidden>
                <defs>
                    <linearGradient id="markGrad" x1="0" y1="0" x2="1" y2="1">
                        <stop offset="0%" stopColor="#fcd34d" />
                        <stop offset="100%" stopColor="#d97706" />
                    </linearGradient>
                </defs>
                <rect
                    x="2.5" y="2.5" width="23" height="23" rx="6"
                    fill="none"
                    stroke="url(#markGrad)"
                    strokeWidth="1.5"
                    opacity="0.9"
                />
                <path
                    d="M9 18 L14 9 L19 18 M11 14 L17 14"
                    stroke="url(#markGrad)"
                    strokeWidth="1.75"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    fill="none"
                />
            </svg>
        </div>
    );
}
