import React from 'react';
import { flushSync } from 'react-dom';
import { motion } from 'framer-motion';
import { ZoomIn, ZoomOut, RotateCcw, FileText, FolderOpen, Loader2, LayoutGrid } from 'lucide-react';
import { TOOLS } from './toolCatalog';

// 홈 + 도구 4개. 라벨·아이콘은 toolCatalog 에서 가져온다
// (예전엔 여기서 따로 적어서 홈 카드와 탭 이름이 갈라질 수 있었다)
const TABS = [
    { id: 'home', label: '홈', Icon: LayoutGrid },
    ...TOOLS.map(({ id, label, Icon, tag }) => ({ id, label, Icon, ai: tag === 'AI' })),
];

export default function Header({
    onZoomIn,
    onZoomOut,
    onZoomReset,
    onOpenFile,
    onBeforePick,
    zoomLevel = 'Fit',
    isLoading = false,
    activeTab = 'home',
    onTabChange,
    fileName = null,
}) {
    const hasPdfFile = !!fileName;
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
                    {TABS.map(({ id, label, Icon, ai }) => {
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
                                {ai && (
                                    <span className="relative z-10 text-[9px] font-bold px-1 py-px rounded text-violet-300 border border-violet-400/30 bg-violet-400/10">
                                        AI
                                    </span>
                                )}
                            </button>
                        );
                    })}
                </nav>
            </div>

            {/* Right controls */}
            <div className="flex items-center gap-2.5">

                {/* 지금 열린 파일 — 어느 탭에서든 보인다.
                    (예전에는 maker 탭에서만 떠서 다른 탭의 헤더가 텅 비었다) */}
                {fileName && (
                    <div className="hidden md:flex items-center gap-2 h-9 px-3 rounded-lg glass max-w-[260px]">
                        <FileText className="w-3.5 h-3.5 text-amber-300 shrink-0" strokeWidth={1.75} />
                        <span className="text-[12px] text-zinc-300 truncate" title={fileName}>
                            {fileName}
                        </span>
                    </div>
                )}

                {activeTab === 'maker' && hasPdfFile && (
                  <>
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

                    {isLoading && (
                        <div className="flex items-center gap-2 text-[12px] px-2.5 h-9 rounded-lg glass">
                            <Loader2 className="w-3.5 h-3.5 text-amber-400 animate-spin" strokeWidth={2} />
                            <span className="text-amber-300/90 font-medium">분석 중</span>
                        </div>
                    )}

                    {/* Primary CTA — single accent.
                        ★ picker freeze 회귀 (2026-05-20): 기존 PDF/크롭이 메모리에 있는 채로
                        OS file picker 열면 Chrome 렌더러가 GC 압력으로 "응답 없음" 상태로 빠짐.
                        flushSync 로 cleanup 을 동기 적용한 뒤에 input 을 클릭해 picker 가 가벼운
                        상태에서 열리도록 한다. */}
                    <label
                        className="press h-9 flex items-center gap-2 pl-3 pr-3.5 rounded-lg bg-amber-400 hover:bg-amber-300 text-zinc-950 font-semibold cursor-pointer transition-colors shadow-[0_0_0_1px_rgba(0,0,0,0.25),0_0_24px_-6px_rgba(251,191,36,0.6)] group"
                        onClick={() => {
                            if (onBeforePick) flushSync(() => onBeforePick());
                        }}
                    >
                        <FolderOpen className="w-3.5 h-3.5" strokeWidth={2.25} />
                        <span className="text-[13px] tracking-tight">PDF 열기</span>
                        <input
                            type="file"
                            accept="application/pdf"
                            className="hidden"
                            onChange={onOpenFile}
                        />
                    </label>
                  </>
                )}
            </div>
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
