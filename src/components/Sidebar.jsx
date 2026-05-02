import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { Scissors, Settings, GripVertical, Trash2, Maximize2, Layers, Loader2, Check, X, ChevronRight, ChevronLeft, FileStack } from 'lucide-react';
import { useCropContext } from '../context/CropContext';
import { MergeService } from '../services/MergeService';
import { Reorder, AnimatePresence, motion } from 'framer-motion';

export default function Sidebar() {
    const {
        crops, removeCrop, selectedCropId, setSelectedCropId,
        settings, updateSettings, clearCrops, reorderCrops
    } = useCropContext();

    const {
        copyWidth, maxHeight, useMaxHeight,
        isGlobalMode, autoCrop, sensitivity,
        mergeWidth, mergeGap, renderScale
    } = settings;

    const [isMerging, setIsMerging] = useState(false);
    const [mergeStatus, setMergeStatus] = useState(null);
    const [showPreviewModal, setShowPreviewModal] = useState(false);
    const [copiedId, setCopiedId] = useState(null);

    const [sequentialIndex, setSequentialIndex] = useState(0);
    const [isSequentialMode, setIsSequentialMode] = useState(false);

    const handleSortCrops = () => {
        const sorted = [...crops].sort((a, b) => {
            if (a.pageNum !== b.pageNum) return a.pageNum - b.pageNum;
            return a.y - b.y;
        });
        reorderCrops(sorted);
    };

    const handleQuickCopy = async (crop) => {
        if (!crop.imageUrl) return;
        try {
            const success = await MergeService.copyToClipboard(crop.imageUrl);
            if (success) {
                setCopiedId(crop.id);
                setTimeout(() => setCopiedId(null), 1000);
            } else {
                alert("클립보드 복사에 실패했습니다. 브라우저 권한을 확인해주세요.");
            }
        } catch (err) {
            console.error("Quick copy failed:", err);
            alert("클립보드 복사 중 오류가 발생했습니다.");
        }
    };

    const selectedCrop = crops.find(c => c.id === selectedCropId);

    const handleMergeAndCopy = async () => {
        if (crops.length === 0) return;
        setIsMerging(true);
        setMergeStatus(null);
        try {
            const urls = crops.map(c => c.imageUrl).filter(Boolean);
            if (urls.length === 0) return;

            const mergedUrl = await MergeService.mergeImages(urls, mergeWidth, mergeGap);
            const success = await MergeService.copyToClipboard(mergedUrl);

            if (success) {
                setMergeStatus('success');
                setTimeout(() => setMergeStatus(null), 2000);
            } else {
                setMergeStatus('error');
                alert("이미지 병합 복사에 실패했습니다. 클립보드 권한을 확인해주세요.");
            }
        } catch (error) {
            console.error("Merge and copy failed:", error);
            setMergeStatus('error');
            alert("이미지 병합 복사 중 오류가 발생했습니다.");
        } finally {
            setIsMerging(false);
        }
    };

    const handleStartSequentialCopy = () => {
        if (crops.length === 0) return;
        setSequentialIndex(0);
        setIsSequentialMode(true);
        handleSequentialCopy(0);
    };

    const handleSequentialCopy = async (index) => {
        if (index >= crops.length) {
            setIsSequentialMode(false);
            setSequentialIndex(0);
            return;
        }
        const crop = crops[index];
        if (crop?.imageUrl) {
            try {
                const success = await MergeService.copyToClipboard(crop.imageUrl);
                if (success) {
                    setCopiedId(crop.id);
                    setTimeout(() => setCopiedId(null), 500);
                } else {
                    alert("연속 복사 중 클립보드 접근에 실패했습니다.");
                    handleStopSequentialCopy();
                }
            } catch (err) {
                console.error("Sequential copy failed:", err);
                alert("연속 복사 중 오류가 발생했습니다.");
                handleStopSequentialCopy();
            }
        }
    };

    const handleNextCopy = () => {
        const nextIndex = sequentialIndex + 1;
        if (nextIndex >= crops.length) {
            setIsSequentialMode(false);
            setSequentialIndex(0);
            return;
        }
        setSequentialIndex(nextIndex);
        handleSequentialCopy(nextIndex);
    };

    const handleStopSequentialCopy = () => {
        setIsSequentialMode(false);
        setSequentialIndex(0);
    };

    const [isManageMode, setIsManageMode] = useState(false);
    const [viewMode, setViewMode] = useState('list');
    const [isCollapsed, setIsCollapsed] = useState(false);

    return (
        <aside
            className={`${isCollapsed ? 'w-12' : 'w-[420px]'} relative shrink-0 z-40 flex flex-col h-full transition-[width] duration-300 ease-out
                bg-[rgba(13,13,16,0.7)] backdrop-blur-2xl border-l border-white/[0.06]`}
        >
            {/* Collapse handle — refined */}
            <button
                onClick={() => setIsCollapsed(!isCollapsed)}
                className="press absolute -left-3 top-20 z-50 w-6 h-6 rounded-full glass flex items-center justify-center text-zinc-400 hover:text-zinc-100 hover:border-white/20 transition-colors"
                title={isCollapsed ? "사이드바 펼치기" : "사이드바 접기"}
            >
                {isCollapsed ? <ChevronLeft size={12} /> : <ChevronRight size={12} />}
            </button>

            {!isCollapsed ? (
                <>
                    {/* §01 — Copy Settings */}
                    <Section num="01" title="개별 복사 설정" hint="Ctrl+C" Icon={Scissors}>
                        <div className="grid grid-cols-2 gap-3">
                            <Field label="가로 (px)">
                                <input
                                    type="number"
                                    value={copyWidth}
                                    onChange={(e) => updateSettings({ copyWidth: Number(e.target.value) })}
                                    className="numeral w-full bg-black/30 border border-white/[0.06] rounded-lg px-3 py-2 text-[13px] text-center text-zinc-100 focus-ring transition-all hover:border-white/10"
                                />
                            </Field>
                            <Field
                                label="세로 제한"
                                trailing={
                                    <input
                                        type="checkbox"
                                        checked={useMaxHeight}
                                        onChange={(e) => updateSettings({ useMaxHeight: e.target.checked })}
                                        className="accent-amber-400 w-3.5 h-3.5 cursor-pointer"
                                    />
                                }
                            >
                                <input
                                    type="number"
                                    value={maxHeight}
                                    disabled={!useMaxHeight}
                                    onChange={(e) => updateSettings({ maxHeight: Number(e.target.value) })}
                                    className="numeral w-full bg-black/30 border border-white/[0.06] rounded-lg px-3 py-2 text-[13px] text-center text-zinc-100 focus-ring transition-all hover:border-white/10 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:border-white/[0.06]"
                                />
                            </Field>
                        </div>
                    </Section>

                    {/* §02 — Detection Settings */}
                    <Section num="02" title="설정" Icon={Settings}>
                        {/* Toggle card — 일괄 모드 */}
                        <button
                            onClick={() => updateSettings({ isGlobalMode: !isGlobalMode })}
                            className={`press w-full text-left rounded-xl border transition-all p-3.5 ${
                                isGlobalMode
                                    ? 'bg-amber-400/[0.06] border-amber-400/25'
                                    : 'bg-white/[0.02] border-white/[0.06] hover:border-white/10'
                            }`}
                        >
                            <div className="flex items-start justify-between gap-3">
                                <div className="flex-1">
                                    <div className="flex items-center gap-2">
                                        <FileStack className={`w-3.5 h-3.5 ${isGlobalMode ? 'text-amber-300' : 'text-zinc-500'}`} strokeWidth={1.75} />
                                        <span className={`text-[13px] font-semibold ${isGlobalMode ? 'text-amber-200' : 'text-zinc-300'}`}>
                                            일괄 이미지 모드
                                        </span>
                                    </div>
                                    <p className="text-[11px] text-zinc-500 mt-1.5 leading-relaxed">
                                        선택한 범위를 모든 페이지에서 개별 검사
                                    </p>
                                </div>
                                <Toggle on={isGlobalMode} />
                            </div>
                        </button>

                        <div className="mt-3 space-y-3">
                            <label className="flex items-center gap-2.5 cursor-pointer select-none group">
                                <input
                                    type="checkbox"
                                    checked={autoCrop}
                                    onChange={(e) => updateSettings({ autoCrop: e.target.checked })}
                                    className="accent-amber-400 w-4 h-4 rounded cursor-pointer"
                                />
                                <span className="text-[13px] font-medium text-zinc-200 group-hover:text-zinc-50 transition-colors">
                                    문제 자동 인식 & 분할
                                </span>
                            </label>

                            <Slider
                                label="민감도"
                                value={sensitivity}
                                min={10}
                                max={100}
                                onChange={(v) => updateSettings({ sensitivity: v })}
                            />

                            <div className="pt-3 border-t border-white/[0.05]">
                                <Slider
                                    label="PDF 해상도"
                                    value={renderScale || 3.0}
                                    min={1.0}
                                    max={6.0}
                                    step={0.5}
                                    format={(v) => `${v.toFixed(1)}x`}
                                    onChange={(v) => updateSettings({ renderScale: v })}
                                />
                                <p className="text-[10px] text-zinc-600 mt-2 leading-relaxed">
                                    높을수록 고화질 — 메모리 사용 증가
                                </p>
                            </div>
                        </div>
                    </Section>

                    {/* §03 — List header */}
                    <div className="px-5 py-3.5 flex items-center justify-between border-y border-white/[0.05] shrink-0 bg-white/[0.015]">
                        <div className="flex items-center gap-3">
                            <span className="section-num">03</span>
                            <h2 className="text-[13px] font-semibold text-zinc-100">
                                문제 목록
                            </h2>
                            <span className="numeral text-[11px] px-1.5 py-px rounded-md bg-amber-400/10 border border-amber-400/25 text-amber-300">
                                {crops.length}
                            </span>
                        </div>
                        <div className="flex gap-1.5 items-center">
                            <button
                                onClick={() => setIsManageMode(true)}
                                className="press flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1.5 rounded-md text-zinc-300 bg-white/5 hover:bg-white/[0.08] border border-white/[0.06] hover:border-white/10 transition-colors"
                            >
                                <Maximize2 className="w-3 h-3" strokeWidth={2} />
                                <span>전체확대</span>
                            </button>
                            <button
                                onClick={() => {
                                    if (window.confirm('모든 문제를 삭제하시겠습니까?')) {
                                        clearCrops();
                                    }
                                }}
                                className="press flex items-center gap-1 text-[11px] text-zinc-500 hover:text-red-400 hover:bg-red-500/[0.06] px-2 py-1.5 rounded-md transition-colors"
                            >
                                <Trash2 className="w-3 h-3" strokeWidth={2} />
                                <span>전체 삭제</span>
                            </button>
                        </div>
                    </div>

                    {/* §03 — List */}
                    <div className="flex-1 overflow-y-auto px-3 py-3 min-h-0 custom-scrollbar">
                        {crops.length === 0 ? (
                            <div className="border border-dashed border-white/[0.08] rounded-xl h-44 flex flex-col items-center justify-center text-zinc-600 gap-3 hover:border-white/15 hover:bg-white/[0.02] transition-colors group">
                                <GripVertical className="w-7 h-7 opacity-30 group-hover:opacity-50 transition-opacity" strokeWidth={1.5} />
                                <span className="text-[11px] font-medium tracking-wide">드래그하여 문제를 선택하세요</span>
                            </div>
                        ) : (
                            <Reorder.Group
                                axis="y"
                                values={crops}
                                onReorder={reorderCrops}
                                className="grid grid-cols-2 gap-2.5"
                            >
                                {crops.map((crop, index) => (
                                    <Reorder.Item
                                        key={crop.id}
                                        value={crop}
                                        layout
                                        className="relative"
                                        whileDrag={{ scale: 1.04, zIndex: 100 }}
                                    >
                                        <div
                                            className={`relative rounded-xl p-2 transition-all cursor-pointer group select-none border ${
                                                selectedCropId === crop.id
                                                    ? 'bg-amber-400/[0.06] border-amber-400/40 shadow-[0_0_0_1px_rgba(251,191,36,0.2),0_4px_24px_-8px_rgba(251,191,36,0.4)]'
                                                    : 'bg-zinc-900/60 border-white/[0.05] hover:border-white/15 hover:bg-zinc-900'
                                            }`}
                                            onClick={() => {
                                                setSelectedCropId(crop.id);
                                                handleQuickCopy(crop);
                                                const element = document.getElementById(`page-${crop.pageNum}`);
                                                if (element) {
                                                    element.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                                }
                                            }}
                                            onDoubleClick={() => {
                                                setSelectedCropId(crop.id);
                                                setShowPreviewModal(true);
                                            }}
                                        >
                                            <div className="flex justify-between items-center mb-2">
                                                <span className={`numeral text-[10px] font-medium px-1.5 py-0.5 rounded flex items-center gap-1 transition-colors ${
                                                    copiedId === crop.id
                                                        ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/25'
                                                        : 'bg-white/[0.04] text-zinc-400 border border-white/[0.05]'
                                                }`}>
                                                    {copiedId === crop.id ? (
                                                        <>
                                                            <Check className="w-2.5 h-2.5" strokeWidth={2.5} />
                                                            <span>복사됨</span>
                                                        </>
                                                    ) : (
                                                        <>
                                                            <GripVertical className="w-2.5 h-2.5 opacity-50 cursor-grab active:cursor-grabbing" strokeWidth={2} />
                                                            <span>#{index + 1}</span>
                                                            <span className="opacity-50">P.{crop.pageNum}</span>
                                                        </>
                                                    )}
                                                </span>
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); removeCrop(crop.id); }}
                                                    className="opacity-0 group-hover:opacity-100 text-zinc-500 hover:text-red-400 hover:bg-red-500/[0.08] p-1 rounded transition-all"
                                                >
                                                    <Trash2 className="w-3 h-3" strokeWidth={2} />
                                                </button>
                                            </div>
                                            <div className="h-24 bg-black/40 rounded-lg flex items-center justify-center text-[10px] text-zinc-700 overflow-hidden border border-white/[0.04] relative dot-pattern">
                                                {crop.imageUrl ? (
                                                    <img
                                                        src={crop.imageUrl}
                                                        alt="Crop preview"
                                                        loading="lazy"
                                                        className="h-full object-contain relative z-10 pointer-events-none"
                                                    />
                                                ) : "No Preview"}
                                            </div>
                                        </div>
                                    </Reorder.Item>
                                ))}
                            </Reorder.Group>
                        )}
                    </div>

                    {/* Preview Modal */}
                    <AnimatePresence>
                        {showPreviewModal && selectedCrop && (
                            <div
                                className="fixed inset-0 z-[100] flex items-center justify-center bg-black/85 backdrop-blur-md p-10"
                                onClick={() => setShowPreviewModal(false)}
                            >
                                <motion.div
                                    initial={{ opacity: 0, scale: 0.96 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    exit={{ opacity: 0, scale: 0.96 }}
                                    transition={{ type: 'spring', stiffness: 300, damping: 28 }}
                                    className="relative max-w-full max-h-full glass-strong rounded-2xl p-2 flex flex-col"
                                    onClick={(e) => e.stopPropagation()}
                                >
                                    <div className="flex justify-between items-center px-3 py-2.5 border-b border-white/[0.05]">
                                        <div className="flex items-center gap-3">
                                            <span className="section-num">PREVIEW</span>
                                            <h3 className="text-zinc-100 font-semibold text-[15px] tracking-tight">문제 상세 보기</h3>
                                        </div>
                                        <button
                                            onClick={() => setShowPreviewModal(false)}
                                            className="press text-zinc-400 hover:text-zinc-100 p-1.5 rounded-md hover:bg-white/[0.06] transition-colors"
                                        >
                                            <X className="w-5 h-5" strokeWidth={2} />
                                        </button>
                                    </div>
                                    <div className="flex-1 overflow-auto min-h-0 custom-scrollbar p-4 flex items-center justify-center">
                                        <img src={selectedCrop.imageUrl} className="max-w-full max-h-[80vh] object-contain shadow-2xl" />
                                    </div>
                                </motion.div>
                            </div>
                        )}
                    </AnimatePresence>

                    {/* §04 — Merge Panel */}
                    <div className="p-4 shrink-0 border-t border-white/[0.05] bg-[rgba(8,8,11,0.6)] backdrop-blur-xl">
                        <div className="flex items-center gap-3 mb-3.5">
                            <span className="section-num">04</span>
                            <Layers className="w-3.5 h-3.5 text-amber-400" strokeWidth={1.75} />
                            <span className="text-[12px] font-semibold text-zinc-200">전체 이미지 병합</span>
                        </div>

                        <div className="grid grid-cols-2 gap-2.5 mb-3.5">
                            <Field label="가로 (px)" small>
                                <input
                                    type="number"
                                    value={mergeWidth}
                                    onChange={(e) => updateSettings({ mergeWidth: Number(e.target.value) })}
                                    className="numeral w-full bg-black/30 border border-white/[0.06] rounded-lg px-3 py-2 text-[13px] text-center text-zinc-100 focus-ring transition-colors hover:border-white/10"
                                />
                            </Field>
                            <Field label="간격 (px)" small>
                                <input
                                    type="number"
                                    value={mergeGap}
                                    onChange={(e) => updateSettings({ mergeGap: Number(e.target.value) })}
                                    className="numeral w-full bg-black/30 border border-white/[0.06] rounded-lg px-3 py-2 text-[13px] text-center text-zinc-100 focus-ring transition-colors hover:border-white/10"
                                />
                            </Field>
                        </div>

                        <div className="flex gap-2">
                            <button
                                onClick={handleMergeAndCopy}
                                disabled={isMerging || crops.length === 0}
                                className={`press flex-1 py-2.5 rounded-lg font-semibold text-[12.5px] flex justify-center items-center gap-2 transition-all border
                                    ${mergeStatus === 'success'
                                        ? 'bg-emerald-400/[0.12] border-emerald-400/30 text-emerald-200'
                                        : 'bg-amber-400 hover:bg-amber-300 border-transparent text-zinc-950 shadow-[0_0_0_1px_rgba(0,0,0,0.25),0_0_24px_-8px_rgba(251,191,36,0.5)] disabled:bg-white/[0.04] disabled:text-zinc-600 disabled:shadow-none disabled:cursor-not-allowed'
                                    }`}
                            >
                                {isMerging ? (
                                    <>
                                        <Loader2 className="w-3.5 h-3.5 animate-spin" strokeWidth={2.25} />
                                        <span>병합 중</span>
                                    </>
                                ) : mergeStatus === 'success' ? (
                                    <>
                                        <Check className="w-3.5 h-3.5" strokeWidth={2.5} />
                                        <span>복사 완료</span>
                                    </>
                                ) : (
                                    <>
                                        <Layers className="w-3.5 h-3.5" strokeWidth={2.25} />
                                        <span>병합 복사</span>
                                    </>
                                )}
                            </button>

                            {!isSequentialMode ? (
                                <button
                                    onClick={handleStartSequentialCopy}
                                    disabled={crops.length === 0}
                                    className="press flex-1 py-2.5 rounded-lg text-[12.5px] font-semibold flex justify-center items-center gap-2 border border-white/[0.08] bg-white/[0.03] text-zinc-200 hover:bg-white/[0.06] hover:text-zinc-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                                >
                                    <Scissors className="w-3.5 h-3.5" strokeWidth={2} />
                                    <span>개별 복사</span>
                                </button>
                            ) : (
                                <div className="flex-1 flex gap-1">
                                    <button
                                        onClick={handleNextCopy}
                                        className="press flex-1 bg-emerald-400 hover:bg-emerald-300 text-zinc-950 py-2.5 rounded-lg font-semibold text-[12.5px] flex justify-center items-center gap-1.5 transition-colors"
                                    >
                                        <span className="numeral">{sequentialIndex + 1}/{crops.length}</span>
                                        <ChevronRight className="w-3.5 h-3.5" strokeWidth={2.5} />
                                    </button>
                                    <button
                                        onClick={handleStopSequentialCopy}
                                        className="press bg-red-500/15 hover:bg-red-500/25 border border-red-500/20 text-red-300 px-2.5 rounded-lg transition-colors"
                                    >
                                        <X className="w-3.5 h-3.5" strokeWidth={2} />
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Manage Mode Overlay */}
                    {isManageMode && createPortal(
                        <div className="fixed inset-0 z-[9999] bg-[#07070a]/95 backdrop-blur-2xl p-8 flex flex-col grain">
                            <div className="flex justify-between items-center mb-6 shrink-0 max-w-7xl mx-auto w-full">
                                <div className="flex items-center gap-6">
                                    <div className="flex items-center gap-3">
                                        <span className="section-num">FULLSCREEN</span>
                                        <h2 className="text-[20px] font-semibold text-zinc-50 tracking-tight">
                                            문제 전체확대
                                        </h2>
                                        <span className="numeral text-[12px] px-2 py-0.5 rounded-md bg-amber-400/10 border border-amber-400/25 text-amber-300">
                                            Total {crops.length}
                                        </span>
                                    </div>

                                    <div className="glass p-1 rounded-lg flex items-center gap-1">
                                        <button
                                            onClick={() => setViewMode('list')}
                                            className={`press px-3 py-1.5 rounded-md text-[11.5px] font-medium transition-colors ${
                                                viewMode === 'list'
                                                    ? 'bg-amber-400 text-zinc-950'
                                                    : 'text-zinc-400 hover:text-zinc-100 hover:bg-white/5'
                                            }`}
                                        >
                                            리스트형 (순서변경)
                                        </button>
                                        <button
                                            onClick={() => setViewMode('grid')}
                                            className={`press px-3 py-1.5 rounded-md text-[11.5px] font-medium transition-colors ${
                                                viewMode === 'grid'
                                                    ? 'bg-amber-400 text-zinc-950'
                                                    : 'text-zinc-400 hover:text-zinc-100 hover:bg-white/5'
                                            }`}
                                        >
                                            바둑판형 (한눈에 보기)
                                        </button>
                                    </div>
                                </div>

                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={handleSortCrops}
                                        className="press text-[12px] font-medium px-3 py-2 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] text-zinc-200 hover:text-zinc-50 transition-colors"
                                    >
                                        번호순 정렬
                                    </button>
                                    <button
                                        onClick={() => setIsManageMode(false)}
                                        className="press w-9 h-9 rounded-lg glass hover:bg-white/[0.06] flex items-center justify-center text-zinc-400 hover:text-zinc-50 transition-colors"
                                    >
                                        <X className="w-4 h-4" strokeWidth={2} />
                                    </button>
                                </div>
                            </div>

                            <div className="flex-1 overflow-y-auto min-h-0 custom-scrollbar glass rounded-2xl p-6 max-w-7xl mx-auto w-full">
                                {viewMode === 'list' ? (
                                    <Reorder.Group
                                        axis="y"
                                        values={crops}
                                        onReorder={reorderCrops}
                                        className="flex flex-col gap-3 max-w-4xl mx-auto w-full"
                                    >
                                        {crops.map((crop, index) => (
                                            <Reorder.Item
                                                key={crop.id}
                                                value={crop}
                                                layout
                                                className="relative cursor-grab active:cursor-grabbing"
                                                whileDrag={{ scale: 1.02, zIndex: 100 }}
                                            >
                                                <div
                                                    className={`bg-zinc-900/60 border rounded-xl p-4 transition-all group flex gap-6 items-center ${
                                                        copiedId === crop.id
                                                            ? 'border-emerald-400/40 bg-emerald-400/[0.04]'
                                                            : 'border-white/[0.06] hover:border-amber-400/30'
                                                    }`}
                                                    onClick={() => handleQuickCopy(crop)}
                                                >
                                                    <div className="flex flex-col gap-2.5 shrink-0 w-32">
                                                        <span className={`numeral text-[12px] font-medium px-2 py-1.5 rounded-md border transition-colors flex items-center justify-center gap-1.5 ${
                                                            copiedId === crop.id
                                                                ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                                                                : 'bg-white/[0.04] text-zinc-300 border-white/[0.06]'
                                                        }`}>
                                                            {copiedId === crop.id ? (
                                                                <>
                                                                    <Check className="w-3 h-3" strokeWidth={2.5} />
                                                                    <span>복사됨</span>
                                                                </>
                                                            ) : (
                                                                <>
                                                                    <GripVertical className="w-3 h-3 opacity-50" strokeWidth={2} />
                                                                    <span>#{index + 1}</span>
                                                                </>
                                                            )}
                                                        </span>
                                                        <div className="numeral text-[10px] text-zinc-600 text-center">
                                                            Page {crop.pageNum}
                                                        </div>
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); removeCrop(crop.id); }}
                                                            className="press text-zinc-500 hover:text-red-400 bg-white/[0.03] hover:bg-red-500/[0.08] py-1.5 rounded-md transition-colors flex justify-center"
                                                            title="삭제"
                                                        >
                                                            <Trash2 className="w-3.5 h-3.5" strokeWidth={2} />
                                                        </button>
                                                    </div>

                                                    <div
                                                        className="flex-1 bg-black/40 rounded-lg flex items-center justify-center relative overflow-hidden border border-white/[0.04] dot-pattern h-32"
                                                        onDoubleClick={() => {
                                                            setSelectedCropId(crop.id);
                                                            setShowPreviewModal(true);
                                                        }}
                                                    >
                                                        {crop.imageUrl ? (
                                                            <img src={crop.imageUrl} alt="Crop preview" className="h-full object-contain p-2 pointer-events-none" />
                                                        ) : (
                                                            <span className="text-[10px] text-zinc-700">No Preview</span>
                                                        )}
                                                    </div>
                                                </div>
                                            </Reorder.Item>
                                        ))}
                                    </Reorder.Group>
                                ) : (
                                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-5">
                                        {crops.map((crop, index) => (
                                            <div
                                                key={crop.id}
                                                className={`bg-zinc-900/60 border rounded-xl p-3 transition-all group h-full flex flex-col cursor-pointer ${
                                                    copiedId === crop.id
                                                        ? 'border-emerald-400/40 scale-[1.02] bg-emerald-400/[0.04]'
                                                        : 'border-white/[0.06] hover:border-amber-400/30'
                                                }`}
                                                onClick={() => handleQuickCopy(crop)}
                                            >
                                                <div className="flex justify-between items-center mb-2.5">
                                                    <span className={`numeral text-[11px] font-medium px-2 py-0.5 rounded border transition-colors flex items-center gap-1 ${
                                                        copiedId === crop.id
                                                            ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                                                            : 'bg-white/[0.04] text-zinc-400 border-white/[0.06]'
                                                    }`}>
                                                        {copiedId === crop.id ? (
                                                            <>
                                                                <Check className="w-2.5 h-2.5" strokeWidth={2.5} />
                                                                <span>복사됨</span>
                                                            </>
                                                        ) : (
                                                            <span>#{index + 1} <span className="opacity-50">P.{crop.pageNum}</span></span>
                                                        )}
                                                    </span>
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); removeCrop(crop.id); }}
                                                        className="press opacity-0 group-hover:opacity-100 text-zinc-500 hover:text-red-400 bg-white/[0.04] hover:bg-red-500/[0.08] p-1 rounded transition-all"
                                                    >
                                                        <Trash2 className="w-3.5 h-3.5" strokeWidth={2} />
                                                    </button>
                                                </div>
                                                <div className="aspect-square bg-black/40 rounded-lg flex items-center justify-center relative overflow-hidden border border-white/[0.04] dot-pattern">
                                                    {crop.imageUrl ? (
                                                        <img src={crop.imageUrl} alt="Crop preview" className="w-full h-full object-contain p-2 pointer-events-none" />
                                                    ) : (
                                                        <span className="text-[10px] text-zinc-700">No Preview</span>
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                        , document.body)}
                </>
            ) : (
                <div className="h-full flex flex-col items-center pt-6 gap-4 opacity-40">
                    <span className="section-num [writing-mode:vertical-rl] rotate-180 tracking-[0.2em]">
                        SIDEBAR
                    </span>
                </div>
            )}
        </aside>
    );
}

/* — — — Local subcomponents — — — */

function Section({ num, title, hint, Icon, children }) {
    return (
        <div className="px-5 pt-4 pb-4 border-b border-white/[0.05] shrink-0">
            <div className="flex items-center gap-3 mb-3.5">
                <span className="section-num">{num}</span>
                {Icon && <Icon className="w-3.5 h-3.5 text-amber-400" strokeWidth={1.75} />}
                <span className="text-[12.5px] font-semibold text-zinc-200 tracking-tight">{title}</span>
                {hint && (
                    <span className="ml-auto numeral text-[10px] text-zinc-500 px-1.5 py-px rounded bg-white/[0.04] border border-white/[0.06]">
                        {hint}
                    </span>
                )}
            </div>
            {children}
        </div>
    );
}

function Field({ label, trailing, children, small }) {
    return (
        <div className="space-y-1.5">
            <div className="flex justify-between items-center min-h-[14px]">
                <label className={`eyebrow ${small ? 'text-[9px]' : ''}`}>{label}</label>
                {trailing}
            </div>
            {children}
        </div>
    );
}

function Toggle({ on }) {
    return (
        <div className={`relative w-9 h-5 rounded-full transition-colors duration-200 ease-out shrink-0 ${
            on ? 'bg-amber-400' : 'bg-white/[0.08] border border-white/[0.06]'
        }`}>
            <motion.span
                animate={{ x: on ? 16 : 2 }}
                transition={{ type: 'spring', stiffness: 500, damping: 32 }}
                className={`absolute top-[2px] w-4 h-4 rounded-full ${
                    on ? 'bg-zinc-950' : 'bg-zinc-300'
                }`}
            />
        </div>
    );
}

function Slider({ label, value, min, max, step = 1, onChange, format }) {
    return (
        <div className="space-y-2">
            <div className="flex justify-between items-baseline">
                <span className="text-[11.5px] text-zinc-400 font-medium">{label}</span>
                <span className="numeral text-[12px] font-semibold text-amber-300 tabular-nums">
                    {format ? format(value) : value}
                </span>
            </div>
            <input
                type="range"
                min={min}
                max={max}
                step={step}
                value={value}
                onChange={(e) => onChange(Number(e.target.value))}
                className="w-full"
            />
        </div>
    );
}
