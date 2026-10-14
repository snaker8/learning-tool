import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { Scissors, Settings, GripVertical, Trash2, Maximize2, Layers, Loader2, Check, X, ChevronRight, ChevronLeft, Sparkles } from 'lucide-react';
import { useCropContext } from '../context/CropContext';
import { MergeService } from '../services/MergeService';
import { Reorder, AnimatePresence, motion } from 'framer-motion';
import { useToast } from '../context/ToastContext';

export default function Sidebar() {
    const toast = useToast();
    const {
        crops, removeCrop, selectedCropId, setSelectedCropId,
        settings, updateSettings, clearCrops, reorderCrops,
        copiedCropId, markCopied
    } = useCropContext();

    const {
        copyWidth, maxHeight, useMaxHeight,
        mergeWidth, mergeGap, renderScale
    } = settings;

    const [isMerging, setIsMerging] = useState(false);
    const [mergeStatus, setMergeStatus] = useState(null);
    const [showPreviewModal, setShowPreviewModal] = useState(false);
    const [showSettings, setShowSettings] = useState(false);
    // Local sidebar uses the context's copiedCropId. Keep a local alias for the
    // existing JSX to avoid a sweeping rename.
    const copiedId = copiedCropId;

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
            const toCopy = await MergeService.resizeForCopy(crop.imageUrl, settings);
            const success = await MergeService.copyToClipboard(toCopy);
            MergeService.releaseTemp(toCopy, crop.imageUrl);
            if (success) {
                markCopied(crop.id);
            } else {
                toast.error('클립보드 복사에 실패했습니다. 브라우저의 클립보드 권한을 확인해주세요.');
            }
        } catch (err) {
            console.error("Quick copy failed:", err);
            toast.error('클립보드 복사 중 오류가 발생했습니다.');
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

            // 🔴 화질을 깎아서 맞추지 않는다. 무거우면 묻고, 불가능하면 에러로 알린다.
            const result = await MergeService.mergeImages(urls, mergeWidth, mergeGap, null, {
                confirmOversize: ({ width, height, megapixels, memoryMB, count }) =>
                    toast.confirm({
                        title: `크롭 ${count}개를 ${width}×${height.toLocaleString()}px 로 합칩니다`,
                        message:
                            `원본 화질을 그대로 유지하면 ${megapixels}백만 화소(메모리 약 ${memoryMB}MB)가 됩니다.
` +
                            `크롬이 버거워할 수 있습니다. 가볍게 하려면 취소하고 간격을 줄이거나 크롭을 나눠 합쳐주세요.`,
                        confirmLabel: '이대로 합치기',
                    }),
            });
            // 경고에서 취소한 경우 — 실패가 아니므로 조용히 끝낸다.
            if (!result) return;

            const success = await MergeService.copyToClipboard(result.dataUrl);
            MergeService.releaseTemp(result.dataUrl, null);

            if (success) {
                setMergeStatus('success');
                setTimeout(() => setMergeStatus(null), 2000);
                // 설정값이 원본보다 작아 화질을 버린 경우 — 사용자가 직접 정한 값이라 한 번만 짚는다.
                if (result.downscaled) {
                    toast.info(
                        `가로 ${result.finalWidth}px 로 합쳤습니다. 크롭 원본은 ${result.sourceWidth}px 라 ` +
                        `그만큼 화질이 떨어집니다 — 선명하게 쓰려면 '가로 (px)'를 ${result.sourceWidth} 로 올려주세요.`
                    );
                }
            } else {
                setMergeStatus('error');
                toast.error('이미지 병합 복사에 실패했습니다. 클립보드 권한을 확인해주세요.');
            }
        } catch (error) {
            console.error("Merge and copy failed:", error);
            setMergeStatus('error');
            toast.error(`이미지 병합 복사 중 오류: ${error?.message || '알 수 없는 오류'}`);
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
                const toCopy = await MergeService.resizeForCopy(crop.imageUrl, settings);
                const success = await MergeService.copyToClipboard(toCopy);
                MergeService.releaseTemp(toCopy, crop.imageUrl);
                if (success) {
                    markCopied(crop.id);
                } else {
                    toast.error('연속 복사 중 클립보드 접근에 실패했습니다.');
                    handleStopSequentialCopy();
                }
            } catch (err) {
                console.error("Sequential copy failed:", err);
                toast.error('연속 복사 중 오류가 발생했습니다.');
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
                    {/* 화질은 작업 중에도 자주 바꾸는 값이라 접지 않고 밖에 둔다. */}
                    <div className="px-5 pt-4 pb-3 shrink-0 border-b border-white/[0.05]">
                        <Slider
                            label="화질 (PDF 해상도)"
                            value={renderScale || 3.0}
                            min={1.0}
                            max={6.0}
                            step={0.5}
                            format={(v) => `${v.toFixed(1)}x`}
                            onChange={(v) => updateSettings({ renderScale: v })}
                        />
                        <p className="text-[10px] text-zinc-600 mt-2 leading-relaxed">
                            높을수록 고화질 — 메모리 사용 증가. 바꾸면 그 페이지를 다시 그립니다.
                        </p>
                    </div>

                    {/* 설정 — 한 번 정해두면 거의 안 바꾸는 값들이라 접어 둔다.
                        자리를 문제 목록(미리보기)에 몰아주는 것이 목적이다. */}
                    <button
                        onClick={() => setShowSettings(v => !v)}
                        className="px-5 py-2.5 flex items-center justify-between shrink-0 border-b border-white/[0.05] hover:bg-white/[0.02] transition-colors"
                    >
                        <div className="flex items-center gap-2.5">
                            <Settings className="w-3.5 h-3.5 text-zinc-500" strokeWidth={1.75} />
                            <span className="text-[12px] font-medium text-zinc-400">개별 복사 설정</span>
                            <span className="numeral text-[10.5px] text-zinc-600">
                                개별 복사 {copyWidth}px{useMaxHeight ? ` · 세로 ${maxHeight}px` : ''}
                            </span>
                        </div>
                        <ChevronRight className={`w-3.5 h-3.5 text-zinc-600 transition-transform ${showSettings ? 'rotate-90' : ''}`} />
                    </button>

                    {showSettings && (
                        <div className="shrink-0 border-b border-white/[0.05] bg-black/20 px-5 py-4 space-y-4">
                        <div className="grid grid-cols-2 gap-3">
                            <Field label="가로 (px)">
                                <input
                                    type="number"
                                    value={copyWidth}
                                    onChange={(e) => updateSettings({ copyWidth: Number(e.target.value) })}
                                    onFocus={(e) => e.target.select()}
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
                                    onFocus={(e) => e.target.select()}
                                    className="numeral w-full bg-black/30 border border-white/[0.06] rounded-lg px-3 py-2 text-[13px] text-center text-zinc-100 focus-ring transition-all hover:border-white/10 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:border-white/[0.06]"
                                />
                            </Field>
                        </div>

                        {/* 인식 버튼은 시험지 위에 있다 (페이지 왼쪽 위).
                            여기 토글로 모드를 켜고 드래그까지 해야 하던 걸 없앴다. */}
                        <p className="text-[11px] text-zinc-500 leading-relaxed">
                            문제 인식은 <span className="text-violet-300 font-medium">시험지 왼쪽 위 버튼</span>에서 합니다.
                            <br />· <span className="text-zinc-300">이 페이지 인식</span> — 문제를 찾아 후보로 띄우고, 이후 드래그가 문제 경계에 딱 맞춰집니다
                            <br />· <span className="text-zinc-300">전체 페이지</span> — 모든 페이지의 문제를 찾아 전부 담습니다
                            <br />· <span className="text-zinc-300">구간 지정</span> — 필요한 페이지 구간만 (예: 12–28쪽)
                            <br />드래그만 하면 그린 그대로 잘립니다 (즉시·무료).
                        </p>

                        </div>
                    )}

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
                                onClick={async () => {
                                    const ok = await toast.confirm({
                                        title: '잘라둔 문제를 모두 지울까요?',
                                        message: '되돌릴 수 없습니다.',
                                        confirmLabel: '모두 지우기',
                                        danger: true,
                                    });
                                    if (ok) {
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
                                            <div className="min-h-[72px] max-h-[300px] bg-white rounded-lg flex items-center justify-center text-[10px] text-zinc-400 overflow-hidden border border-white/[0.04] relative">
                                                {(crop.thumbUrl || crop.imageUrl) ? (
                                                    <img
                                                        src={crop.thumbUrl || crop.imageUrl}
                                                        alt="Crop preview"
                                                        loading="lazy"
                                                        decoding="async"
                                                        className="w-full h-auto max-h-[300px] object-contain relative z-10 pointer-events-none"
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
                            <Field label={`가로 (px)${mergeWidth < 1600 ? ' · 원본 1600' : ''}`} small>
                                <input
                                    type="number"
                                    title={mergeWidth < 1600
                                        ? `크롭 원본은 1600px 입니다. ${mergeWidth}px 로 합치면 그만큼 줄어들어 화질이 떨어집니다.`
                                        : '크롭 원본(1600px) 그대로 합칩니다'}
                                    value={mergeWidth}
                                    onChange={(e) => updateSettings({ mergeWidth: Number(e.target.value) })}
                                    onFocus={(e) => e.target.select()}
                                    className={`numeral w-full bg-black/30 border rounded-lg px-3 py-2 text-[13px] text-center text-zinc-100 focus-ring transition-colors ${
                                        mergeWidth < 1600
                                            ? 'border-amber-400/40 hover:border-amber-400/60'
                                            : 'border-white/[0.06] hover:border-white/10'
                                    }`}
                                />
                            </Field>
                            <Field label="간격 (px)" small>
                                <input
                                    type="number"
                                    value={mergeGap}
                                    onChange={(e) => updateSettings({ mergeGap: Number(e.target.value) })}
                                    onFocus={(e) => e.target.select()}
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
                                                            <img src={crop.thumbUrl || crop.imageUrl} alt="Crop preview" loading="lazy" decoding="async" className="h-full object-contain p-2 pointer-events-none" />
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
                                                        <img src={crop.thumbUrl || crop.imageUrl} alt="Crop preview" loading="lazy" decoding="async" className="w-full h-full object-contain p-2 pointer-events-none" />
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
