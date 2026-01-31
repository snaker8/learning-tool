import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { Scissors, Settings, GripVertical, Trash2, Maximize2, Layers, Loader2, Check, X, ChevronRight, ChevronLeft } from 'lucide-react';
import { useCropContext } from '../context/CropContext';
import { MergeService } from '../services/MergeService';
import { Reorder, AnimatePresence, motion } from 'framer-motion';

export default function Sidebar() {
    const {
        crops, removeCrop, selectedCropId, setSelectedCropId,
        settings, updateSettings, clearCrops, reorderCrops
    } = useCropContext();

    // Destructure for easier access
    const {
        copyWidth, maxHeight, useMaxHeight,
        isGlobalMode, autoCrop, sensitivity,
        mergeWidth, mergeGap, renderScale
    } = settings;

    const [isMerging, setIsMerging] = useState(false);
    const [mergeStatus, setMergeStatus] = useState(null); // 'success', 'error'
    const [showPreviewModal, setShowPreviewModal] = useState(false);
    const [copiedId, setCopiedId] = useState(null); // Feedback for quick copy

    // 순차 복사 관련 상태
    const [sequentialIndex, setSequentialIndex] = useState(0);
    const [isSequentialMode, setIsSequentialMode] = useState(false);

    const handleSortCrops = () => {
        const sorted = [...crops].sort((a, b) => {
            if (a.pageNum !== b.pageNum) return a.pageNum - b.pageNum;
            return a.y - b.y; // Sort by vertical position
        });
        reorderCrops(sorted);
    };

    const handleQuickCopy = async (crop) => {
        if (!crop.imageUrl) return;
        try {
            await MergeService.copyToClipboard(crop.imageUrl);
            setCopiedId(crop.id);
            setTimeout(() => setCopiedId(null), 1000);
        } catch (err) {
            console.error(err);
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
            }
        } catch (error) {
            console.error(error);
            setMergeStatus('error');
        } finally {
            setIsMerging(false);
        }
    };

    // 순차 복사 시작
    const handleStartSequentialCopy = () => {
        if (crops.length === 0) return;
        setSequentialIndex(0);
        setIsSequentialMode(true);
        handleSequentialCopy(0);
    };

    // 다음 이미지 복사
    const handleSequentialCopy = async (index) => {
        if (index >= crops.length) {
            setIsSequentialMode(false);
            setSequentialIndex(0);
            return;
        }
        const crop = crops[index];
        if (crop?.imageUrl) {
            await MergeService.copyToClipboard(crop.imageUrl);
            setCopiedId(crop.id);
            setTimeout(() => setCopiedId(null), 500);
        }
    };

    // 다음 복사
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

    // 순차 복사 종료
    const handleStopSequentialCopy = () => {
        setIsSequentialMode(false);
        setSequentialIndex(0);
    };

    const [isManageMode, setIsManageMode] = useState(false);
    const [viewMode, setViewMode] = useState('list'); // Default to list for reordering
    const [isCollapsed, setIsCollapsed] = useState(false);

    return (
        <aside className={`${isCollapsed ? 'w-12 border-l-0' : 'w-[420px]'} bg-black/40 backdrop-blur-2xl shadow-2xl border-l border-white/5 flex flex-col h-full z-40 shrink-0 transition-all duration-300 relative`}>

            {/* Collapse Toggle */}
            <button
                onClick={() => setIsCollapsed(!isCollapsed)}
                className="absolute -left-3 top-1/2 -translate-y-1/2 bg-slate-800 text-slate-300 hover:text-white p-1 rounded-full border border-slate-600 shadow-xl z-50 transition-transform hover:scale-110"
                title={isCollapsed ? "사이드바 펼치기" : "사이드바 접기"}
            >
                {isCollapsed ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}
            </button>

            {!isCollapsed ? (
                <>


                    {/* 1. Copy Settings */}
                    <div className="p-4 bg-white/5 border-b border-white/5 shrink-0 backdrop-blur-sm">
                        <div className="text-xs font-bold text-slate-400 mb-3 flex items-center gap-2 uppercase tracking-wider">
                            <Scissors className="w-3.5 h-3.5 text-blue-400" />
                            <span>개별 복사 설정 (Ctrl+C)</span>
                        </div>
                        <div className="flex items-end gap-3">
                            <div className="flex-1 space-y-1.5">
                                <label className="block text-[10px] text-slate-500 font-bold uppercase tracking-wider">가로 (px)</label>
                                <input
                                    type="number"
                                    value={copyWidth}
                                    onChange={(e) => updateSettings({ copyWidth: Number(e.target.value) })}
                                    className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-sm text-center text-slate-200 focus:border-blue-500/50 focus:bg-blue-500/5 focus:ring-1 focus:ring-blue-500/50 outline-none transition-all"
                                />
                            </div>
                            <div className="flex-1 space-y-1">
                                <div className="flex justify-between items-center">
                                    <label className="block text-[10px] text-slate-500 font-bold uppercase tracking-wider">세로 제한</label>
                                    <input
                                        type="checkbox"
                                        checked={useMaxHeight}
                                        onChange={(e) => updateSettings({ useMaxHeight: e.target.checked })}
                                        className="accent-blue-600 w-3.5 h-3.5 cursor-pointer"
                                    />
                                </div>
                                <input
                                    type="number"
                                    value={maxHeight}
                                    disabled={!useMaxHeight}
                                    onChange={(e) => updateSettings({ maxHeight: Number(e.target.value) })}
                                    className="w-full bg-white/80 border border-slate-200 rounded px-2 py-1.5 text-sm text-center disabled:bg-slate-100 disabled:text-slate-400 focus:border-blue-500 outline-none transition-all"
                                />
                            </div>
                        </div>
                    </div>

                    {/* 2. Auto Settings */}
                    <div className="p-4 bg-white/[0.02] border-b border-white/5 shrink-0 backdrop-blur-sm">
                        <h2 className="font-bold text-slate-400 text-xs mb-3 flex items-center gap-2 uppercase tracking-wider">
                            <Settings className="w-3.5 h-3.5 text-purple-400" />
                            <span>설정</span>
                        </h2>

                        <div className="mb-3 bg-indigo-500/10 p-3 rounded-lg border border-indigo-500/20 hover:bg-indigo-500/15 transition-colors">
                            <label className="flex items-center justify-between cursor-pointer group select-none">
                                <span className="text-xs font-bold text-indigo-300 flex items-center gap-2">
                                    <span className="text-lg">📋</span>
                                    <span>일괄 이미지 모드</span>
                                </span>
                                <div className="relative">
                                    <input
                                        type="checkbox"
                                        checked={isGlobalMode}
                                        onChange={(e) => updateSettings({ isGlobalMode: e.target.checked })}
                                        className="sr-only peer"
                                    />
                                    <div className="w-10 h-5 bg-slate-600 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-500 shadow-inner"></div>
                                </div>
                            </label>
                            <p className="text-[10px] text-indigo-400/70 mt-1.5 pl-7 leading-snug">
                                * 선택한 <b>범위</b>를 모든 페이지에서 개별 검사
                            </p>
                        </div>

                        <div className="space-y-3">
                            <label className="flex items-center gap-2 text-xs font-bold text-slate-300 cursor-pointer select-none">
                                <input
                                    type="checkbox"
                                    checked={autoCrop}
                                    onChange={(e) => updateSettings({ autoCrop: e.target.checked })}
                                    className="accent-blue-500 w-4 h-4 rounded"
                                />
                                <span>문제 자동 인식 & 분할</span>
                            </label>

                            <div className="space-y-2">
                                <div className="flex justify-between text-xs text-slate-400">
                                    <span>민감도</span>
                                    <span className="font-bold text-blue-400 tabular-nums">{sensitivity}</span>
                                </div>
                                <input
                                    type="range"
                                    min="10"
                                    max="100"
                                    value={sensitivity}
                                    onChange={(e) => updateSettings({ sensitivity: Number(e.target.value) })}
                                    className="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
                                />
                            </div>

                            <div className="space-y-2 pt-2 border-t border-white/5">
                                <div className="flex justify-between text-xs text-slate-400">
                                    <span>PDF 해상도</span>
                                    <span className="font-bold text-emerald-400 tabular-nums">{renderScale?.toFixed(1) || '3.0'}x</span>
                                </div>
                                <input
                                    type="range"
                                    min="1.0"
                                    max="6.0"
                                    step="0.5"
                                    value={renderScale || 3.0}
                                    onChange={(e) => updateSettings({ renderScale: Number(e.target.value) })}
                                    className="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-emerald-500"
                                />
                                <p className="text-[10px] text-slate-500">* 높을수록 고화질 (메모리 사용 증가)</p>
                            </div>
                        </div>
                    </div>

                    {/* 3. List Header */}
                    <div className="px-4 py-3 bg-white/5 border-b border-white/5 flex justify-between items-center shadow-sm z-10 shrink-0 backdrop-blur-sm">
                        <div>
                            <h2 className="font-bold text-slate-200 text-sm flex items-center gap-2">
                                문제 목록
                                <span className="bg-blue-500/20 text-blue-300 border border-blue-500/20 text-[10px] px-1.5 py-0.5 rounded-full min-w-[20px] text-center">{crops.length}</span>
                            </h2>
                        </div>
                        <div className="flex gap-1.5 items-center">
                            <button
                                onClick={() => setIsManageMode(true)}
                                className="flex items-center gap-1 text-xs bg-blue-600 hover:bg-blue-500 text-white px-3 py-1.5 rounded-md border border-blue-500 transition-all shadow-lg hover:shadow-blue-500/20"
                            >
                                <Maximize2 className="w-3 h-3" />
                                <span>전체확대</span>
                            </button>
                            <button
                                onClick={() => {
                                    if (window.confirm('모든 문제를 삭제하시겠습니까?')) {
                                        clearCrops();
                                    }
                                }}
                                className="flex items-center gap-1 text-xs text-red-500 hover:text-red-700 hover:bg-red-50 px-2 py-1 rounded transition-colors"
                            >
                                <Trash2 className="w-3 h-3" />
                                <span>전체 삭제</span>
                            </button>
                        </div>
                    </div>

                    {/* 4. List (Reorderable) */}
                    <div className="flex-1 overflow-y-auto p-3 bg-black/10 min-h-0 custom-scrollbar relative">
                        {crops.length === 0 ? (
                            <div className="border-2 border-dashed border-white/10 rounded-xl h-40 flex flex-col items-center justify-center text-slate-500 gap-3 hover:border-white/20 hover:bg-white/5 transition-all group">
                                <GripVertical className="w-8 h-8 opacity-30 group-hover:opacity-50 transition-opacity" />
                                <span className="text-xs font-medium">드래그하여 문제를 선택하세요</span>
                            </div>
                        ) : (
                            <Reorder.Group
                                axis="y"
                                values={crops}
                                onReorder={reorderCrops}
                                className="grid grid-cols-2 gap-3"
                            >
                                {crops.map((crop, index) => (
                                    <Reorder.Item
                                        key={crop.id}
                                        value={crop}
                                        layout
                                        className="relative"
                                        whileDrag={{ scale: 1.05, zIndex: 100 }}
                                    >
                                        <div
                                            className={`relative bg-gray-900 border rounded-xl p-2.5 shadow-sm transition-all cursor-pointer group select-none ${selectedCropId === crop.id
                                                ? 'ring-2 ring-blue-500/50 border-blue-500 shadow-blue-500/20 bg-gray-800'
                                                : 'border-white/5 hover:border-white/20 hover:bg-gray-800 hover:shadow-md'
                                                }`}
                                            onClick={() => {
                                                setSelectedCropId(crop.id);
                                                handleQuickCopy(crop); // Auto copy on click
                                                // Scroll to page
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
                                                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded flex items-center gap-1 transition-colors ${copiedId === crop.id
                                                    ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                                                    : 'bg-white/5 text-slate-400 border border-white/5'
                                                    }`}>
                                                    {copiedId === crop.id ? (
                                                        <span className="flex items-center gap-1"><Check className="w-2.5 h-2.5" /> 복사됨</span>
                                                    ) : (
                                                        <>
                                                            <GripVertical className="w-2.5 h-2.5 opacity-50 cursor-grab active:cursor-grabbing" />
                                                            #{index + 1} (P.{crop.pageNum})
                                                        </>
                                                    )}
                                                </span>
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); removeCrop(crop.id); }}
                                                    className="text-slate-600 hover:text-red-400 hover:bg-red-500/10 p-1 rounded transition-colors"
                                                >
                                                    <Trash2 className="w-3 h-3" />
                                                </button>
                                            </div>
                                            <div className="h-24 bg-black/20 rounded-lg flex items-center justify-center text-[10px] text-slate-600 overflow-hidden border border-white/5 relative">
                                                <div className="absolute inset-0 bg-[radial-gradient(#ffffff08_1px,transparent_1px)] [background-size:8px_8px] opacity-50"></div>
                                                {crop.imageUrl ? (
                                                    <img src={crop.imageUrl} alt="Crop preview" className="h-full object-contain relative z-10 pointer-events-none" />
                                                ) : (
                                                    "No Preview"
                                                )}
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
                            <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-10" onClick={() => setShowPreviewModal(false)}>
                                <motion.div
                                    initial={{ opacity: 0, scale: 0.9 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    exit={{ opacity: 0, scale: 0.9 }}
                                    className="relative max-w-full max-h-full bg-slate-900 border border-white/10 rounded-2xl p-2 shadow-2xl flex flex-col"
                                    onClick={(e) => e.stopPropagation()}
                                >
                                    <div className="flex justify-between items-center p-2 border-b border-white/5 mb-2">
                                        <h3 className="text-white font-bold text-lg px-2">문제 상세 보기</h3>
                                        <button onClick={() => setShowPreviewModal(false)} className="text-slate-400 hover:text-white p-1 bg-white/5 rounded-full hover:bg-white/10 transition-colors">
                                            <X className="w-6 h-6" />
                                        </button>
                                    </div>
                                    <div className="flex-1 overflow-auto min-h-0 custom-scrollbar p-4 flex items-center justify-center bg-black/20 rounded-xl">
                                        <img src={selectedCrop.imageUrl} className="max-w-full max-h-[80vh] object-contain shadow-lg" />
                                    </div>
                                </motion.div>
                            </div>
                        )}
                    </AnimatePresence>

                    {/* 5. Merge Panel */}
                    <div className="p-4 bg-white/5 border-t border-white/5 z-50 shadow-[0_-4px_30px_-4px_rgba(0,0,0,0.5)] shrink-0 backdrop-blur-xl">
                        <div className="text-xs font-bold text-slate-300 mb-3 flex items-center gap-2">
                            <Layers className="w-4 h-4 text-emerald-400" />
                            <span>전체 이미지 병합</span>
                        </div>

                        <div className="grid grid-cols-2 gap-3 mb-4">
                            <div className="space-y-1.5">
                                <label className="block text-[10px] text-slate-500 font-bold uppercase tracking-wide">가로길이(PX)</label>
                                <input
                                    type="number"
                                    value={mergeWidth}
                                    onChange={(e) => updateSettings({ mergeWidth: Number(e.target.value) })}
                                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-center text-slate-200 focus:border-blue-500/50 focus:bg-blue-500/5 outline-none transition-all"
                                />
                            </div>
                            <div className="space-y-1.5">
                                <label className="block text-[10px] text-slate-500 font-bold uppercase tracking-wide">프로세서(PX)</label>
                                <input
                                    type="number"
                                    value={mergeGap}
                                    onChange={(e) => updateSettings({ mergeGap: Number(e.target.value) })}
                                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-center text-slate-200 focus:border-blue-500/50 focus:bg-blue-500/5 outline-none transition-all"
                                />
                            </div>
                        </div>


                        <div className="flex gap-2">
                            <button
                                onClick={handleMergeAndCopy}
                                disabled={isMerging || crops.length === 0}
                                className={`flex-1 border border-transparent py-2.5 rounded-lg font-bold shadow-md text-xs flex justify-center items-center gap-2 transition-all
                            ${mergeStatus === 'success'
                                        ? 'bg-green-500 hover:bg-green-600 text-white shadow-green-500/20'
                                        : 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white shadow-blue-500/20 hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-50 disabled:cursor-not-allowed'
                                    }`}
                            >
                                {isMerging ? (
                                    <>
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                        <span>병합 중...</span>
                                    </>
                                ) : mergeStatus === 'success' ? (
                                    <>
                                        <Check className="w-4 h-4" />
                                        <span>복사 완료!</span>
                                    </>
                                ) : (
                                    <>
                                        <Layers className="w-4 h-4" />
                                        <span>병합 복사</span>
                                    </>
                                )}
                            </button>

                            {/* 순차 복사 버튼 */}
                            {!isSequentialMode ? (
                                <button
                                    onClick={handleStartSequentialCopy}
                                    disabled={crops.length === 0}
                                    className="flex-1 border border-emerald-500/30 bg-emerald-600/20 hover:bg-emerald-600/40 text-emerald-300 py-2.5 rounded-lg font-bold text-xs flex justify-center items-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    <Scissors className="w-4 h-4" />
                                    <span>개별 복사</span>
                                </button>
                            ) : (
                                <div className="flex-1 flex gap-1">
                                    <button
                                        onClick={handleNextCopy}
                                        className="flex-1 bg-emerald-500 hover:bg-emerald-400 text-white py-2.5 rounded-lg font-bold text-xs flex justify-center items-center gap-1 transition-all"
                                    >
                                        <span>{sequentialIndex + 1}/{crops.length}</span>
                                        <ChevronRight className="w-4 h-4" />
                                    </button>
                                    <button
                                        onClick={handleStopSequentialCopy}
                                        className="bg-red-500/20 hover:bg-red-500/40 text-red-400 px-2 rounded-lg transition-all"
                                    >
                                        <X className="w-4 h-4" />
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>


                    {/* Manage Mode Overlay - Moved to Portal for Full Screen */}
                    {isManageMode && createPortal(
                        <div className="fixed inset-0 z-[9999] bg-slate-950/95 backdrop-blur-md p-8 flex flex-col font-sans">
                            <div className="flex justify-between items-center mb-6 shrink-0 max-w-7xl mx-auto w-full">
                                <div className="flex items-center gap-6">
                                    <h2 className="text-2xl font-bold text-white flex items-center gap-3">
                                        <Maximize2 className="w-6 h-6 text-blue-500" />
                                        <span>문제 전체확대</span>
                                        <span className="bg-blue-500/20 text-blue-400 text-sm px-2 py-0.5 rounded-full border border-blue-500/20">Total: {crops.length}</span>
                                    </h2>

                                    {/* View Mode Toggle */}
                                    <div className="bg-white/10 p-1 rounded-lg flex items-center gap-1">
                                        <button
                                            onClick={() => setViewMode('list')}
                                            className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${viewMode === 'list' ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}
                                        >
                                            리스트형 (순서변경)
                                        </button>
                                        <button
                                            onClick={() => setViewMode('grid')}
                                            className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${viewMode === 'grid' ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}
                                        >
                                            바둑판형 (한눈에 보기)
                                        </button>
                                    </div>
                                </div>

                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={handleSortCrops}
                                        className="bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold px-3 py-1.5 rounded-lg flex items-center gap-2 transition-colors shadow-lg shadow-blue-500/20"
                                    >
                                        <span>번호순 정렬</span>
                                    </button>
                                    <button
                                        onClick={() => setIsManageMode(false)}
                                        className="bg-white/10 hover:bg-white/20 text-white p-2 rounded-full transition-colors"
                                    >
                                        <X className="w-6 h-6" />
                                    </button>
                                </div>
                            </div>

                            <div className="flex-1 overflow-y-auto min-h-0 custom-scrollbar bg-black/20 rounded-2xl border border-white/5 p-6 shadow-inner max-w-7xl mx-auto w-full">
                                {viewMode === 'list' ? (
                                    /* 1. List Mode: Reorder Enabled, Single Column strictly */
                                    <Reorder.Group
                                        axis="y"
                                        values={crops}
                                        onReorder={reorderCrops}
                                        className="flex flex-col gap-4 max-w-4xl mx-auto w-full"
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
                                                    className={`bg-slate-900 border rounded-xl p-4 shadow-lg transition-all group flex gap-6 items-center
                                                        ${copiedId === crop.id ? 'border-green-500 shadow-green-500/20' : 'border-white/10 hover:border-blue-500/50'}
                                                    `}
                                                    onClick={() => handleQuickCopy(crop)}
                                                >
                                                    {/* Left: Info & Controls */}
                                                    <div className="flex flex-col gap-3 shrink-0 w-32">
                                                        <span className={`text-xs font-bold px-2 py-1.5 rounded border transition-colors flex items-center justify-center gap-2 ${copiedId === crop.id ? 'bg-green-500/20 text-green-400 border-green-500/30' : 'bg-white/5 text-slate-400 border-white/5'}`}>
                                                            {copiedId === crop.id ? (
                                                                <>
                                                                    <Check className="w-3.5 h-3.5" />
                                                                    <span>복사됨!</span>
                                                                </>
                                                            ) : (
                                                                <>
                                                                    <GripVertical className="w-4 h-4 opacity-50" />
                                                                    <span className="text-sm">#{index + 1}</span>
                                                                </>
                                                            )}
                                                        </span>
                                                        <div className="text-[10px] text-slate-500 text-center font-mono">
                                                            Page {crop.pageNum}
                                                        </div>
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); removeCrop(crop.id); }}
                                                            className="text-slate-500 hover:text-red-400 bg-white/5 hover:bg-red-500/10 py-2 rounded transition-colors flex justify-center"
                                                            title="삭제"
                                                        >
                                                            <Trash2 className="w-4 h-4" />
                                                        </button>
                                                    </div>

                                                    {/* Right: Image Preview */}
                                                    <div className="flex-1 bg-black/40 rounded-lg flex items-center justify-center relative overflow-hidden border border-white/5 h-32"
                                                        onDoubleClick={() => {
                                                            setSelectedCropId(crop.id);
                                                            setShowPreviewModal(true);
                                                        }}
                                                    >
                                                        <div className="absolute inset-0 bg-[radial-gradient(#ffffff08_1px,transparent_1px)] [background-size:8px_8px] opacity-50"></div>
                                                        {crop.imageUrl ? (
                                                            <img src={crop.imageUrl} alt="Crop preview" className="h-full object-contain p-2 pointer-events-none" />
                                                        ) : (
                                                            "No Preview"
                                                        )}
                                                    </div>
                                                </div>
                                            </Reorder.Item>
                                        ))}
                                    </Reorder.Group>
                                ) : (
                                    /* 2. Grid Mode: Static (No Reorder), Multi Column */
                                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
                                        {crops.map((crop, index) => (
                                            <div
                                                key={crop.id}
                                                className={`bg-slate-900 border rounded-xl p-3 shadow-lg transition-all group h-full flex flex-col cursor-pointer 
                                                        ${copiedId === crop.id ? 'border-green-500 shadow-green-500/20 scale-[1.02]' : 'border-white/10 hover:border-blue-500/50'}
                                                    `}
                                                onClick={() => handleQuickCopy(crop)}
                                            >
                                                <div className="flex justify-between items-center mb-3">
                                                    <span className={`text-xs font-bold px-2 py-1 rounded border transition-colors flex items-center gap-1 ${copiedId === crop.id ? 'bg-green-500/20 text-green-400 border-green-500/30' : 'bg-white/5 text-slate-400 border-white/5'}`}>
                                                        {copiedId === crop.id ? (
                                                            <>
                                                                <Check className="w-3 h-3" />
                                                                <span>복사됨!</span>
                                                            </>
                                                        ) : (
                                                            <span>#{index + 1} (P.{crop.pageNum})</span>
                                                        )}
                                                    </span>
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); removeCrop(crop.id); }}
                                                        className="text-slate-600 hover:text-red-400 bg-white/5 hover:bg-red-500/10 p-1.5 rounded transition-colors"
                                                    >
                                                        <Trash2 className="w-4 h-4" />
                                                    </button>
                                                </div>
                                                <div className="aspect-square bg-black/40 rounded-lg flex items-center justify-center relative overflow-hidden border border-white/5">
                                                    <div className="absolute inset-0 bg-[radial-gradient(#ffffff08_1px,transparent_1px)] [background-size:8px_8px] opacity-50"></div>
                                                    {crop.imageUrl ? (
                                                        <img src={crop.imageUrl} alt="Crop preview" className="w-full h-full object-contain p-2 pointer-events-none" />
                                                    ) : (
                                                        "No Preview"
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
                <div className="h-full flex flex-col items-center pt-8 gap-4 opacity-50">
                    <div className="w-1 h-full bg-white/5 rounded-full"></div>
                </div>
            )}
        </aside >
    );
}
