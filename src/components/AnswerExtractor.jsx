import React, { useState, useRef } from 'react';
import {
    Sparkles, Wand2, CloudUpload, FileText, Trash2,
    ArrowRightCircle, Filter, Copy, Check, CheckSquare, Inbox, Loader2, ShieldCheck
} from 'lucide-react';
import { getAppCheckToken } from '../lib/firebase';

export default function AnswerExtractor() {
    const [rawData, setRawData] = useState('');
    const [parsedRows, setParsedRows] = useState([]);
    const [startNumber, setStartNumber] = useState(1);
    const [selectedRows, setSelectedRows] = useState(new Set());
    const [lastCheckedIndex, setLastCheckedIndex] = useState(null);
    const [copiedType, setCopiedType] = useState(false);
    const [copiedAnswer, setCopiedAnswer] = useState(false);
    const [copiedAll, setCopiedAll] = useState(false);
    const [copiedRange, setCopiedRange] = useState(false);
    const [copiedSelected, setCopiedSelected] = useState(false);
    const [rangeInput, setRangeInput] = useState('');
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [selectedFile, setSelectedFile] = useState(null);
    const [previewUrl, setPreviewUrl] = useState(null);
    const [isDragging, setIsDragging] = useState(false);
    const fileInputRef = useRef(null);

    const hasCircledNumber = (str) => {
        const circled = ['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨', '⑩', '⑪', '⑫', '⑬', '⑭', '⑮'];
        return circled.some(c => str.includes(c));
    };

    const convertCircledToNumber = (str) => {
        const map = { '①': '1', '②': '2', '③': '3', '④': '4', '⑤': '5', '⑥': '6', '⑦': '7', '⑧': '8', '⑨': '9', '⑩': '10', '⑪': '11', '⑫': '12', '⑬': '13', '⑭': '14', '⑮': '15' };
        let parts = str.split(/[,|\s]+/).filter(Boolean);
        return parts.map(part => {
            for (const [key, val] of Object.entries(map)) {
                if (part.includes(key)) return val;
            }
            return part;
        }).join(' | ');
    };

    const determineType = (val) => {
        if (!val) return 'narrative';
        const cleanVal = val.trim();
        if (cleanVal.split(/[,|\s]+/).filter(Boolean).length > 1) return 'narrative';
        if (hasCircledNumber(cleanVal)) return 'multipleChoice';
        if (!isNaN(Number(cleanVal)) && cleanVal !== '') return 'shortAnswer';
        if (/^(-?\d+(?:\.\d+)?)\s*[a-zA-Z가-힣]+$/.test(cleanVal)) return 'shortAnswer';
        return 'narrative';
    };

    const determineAnswer = (val) => {
        if (!val) return '';
        const type = determineType(val);
        const cleanVal = val.trim();
        if (type === 'multipleChoice') return convertCircledToNumber(val);
        const match = cleanVal.match(/^(-?\d+(?:\.\d+)?)\s*[a-zA-Z가-힣]+$/);
        if (match) return match[1];
        return val;
    };

    const parseData = (inputData = rawData) => {
        if (!inputData.trim()) return;
        const lines = inputData.split('\n').filter(line => line.trim() !== '');
        const newRows = lines.map((line, index) => {
            let content = line.trim();
            const numberMatch = content.match(/^(\d+)[.|)]\s*/);
            const originNum = numberMatch ? numberMatch[1] : '-';
            content = content.replace(/^\d+[.|)]\s*/, '');
            return {
                id: Date.now() + index,
                number: startNumber + index,
                originNum,
                original: content,
                type: determineType(content),
                answer: determineAnswer(content)
            };
        });
        setParsedRows(newRows);
        setSelectedRows(new Set());
        setLastCheckedIndex(null);
    };

    const handleClear = () => {
        setRawData('');
        setParsedRows([]);
        setStartNumber(1);
        setSelectedFile(null);
        setPreviewUrl(null);
        setSelectedRows(new Set());
        setLastCheckedIndex(null);
    };

    const performCopy = (dataMatrix, setFn) => {
        const handleCopy = (e) => {
            e.preventDefault();
            const textData = dataMatrix.map(row =>
                row.map(cell => (cell || '').toString().trim()).join('\t')
            ).join('\n');
            const tableRows = dataMatrix.map(row => {
                const cells = row.map(cell => `<td>${cell || ''}</td>`).join('');
                return `<tr>${cells}</tr>`;
            }).join('');
            const htmlData = `<table><tbody>${tableRows}</tbody></table>`;
            if (e.clipboardData) {
                e.clipboardData.setData('text/plain', textData);
                e.clipboardData.setData('text/html', htmlData);
                setFn(true);
            }
        };

        document.addEventListener('copy', handleCopy);

        try {
            const result = document.execCommand('copy');
            if (!result) throw new Error('execCommand failed');
        } catch (err) {
            console.error('Copy failed', err);
            alert('복사에 실패했습니다.');
        } finally {
            document.removeEventListener('copy', handleCopy);
            setTimeout(() => setFn(false), 2000);
        }
    };

    const handleCopyColumn = (key, setFn) => {
        const dataMatrix = parsedRows.map(row => [row[key]]);
        performCopy(dataMatrix, setFn);
    };

    const handleCopyAll = () => {
        const dataMatrix = parsedRows.map(row => [row.type, row.answer]);
        performCopy(dataMatrix, setCopiedAll);
    };

    const handleCopyRange = () => {
        if (!rangeInput.trim()) { alert('범위를 입력해주세요 (예: 1, 3-5)'); return; }
        const targetNumbers = new Set();
        rangeInput.split(',').forEach(part => {
            const trimmed = part.trim();
            if (trimmed.includes('-')) {
                const [start, end] = trimmed.split('-').map(Number);
                if (!isNaN(start) && !isNaN(end)) for (let i = start; i <= end; i++) targetNumbers.add(i);
            } else {
                const num = Number(trimmed);
                if (!isNaN(num)) targetNumbers.add(num);
            }
        });
        const filteredRows = parsedRows.filter(row => targetNumbers.has(row.number));
        if (filteredRows.length === 0) { alert('해당 범위에 문제가 없습니다.'); return; }
        const dataMatrix = filteredRows.map(row => [row.type, row.answer]);
        performCopy(dataMatrix, setCopiedRange);
    };

    const handleCopySelected = () => {
        if (selectedRows.size === 0) { alert('복사할 항목을 선택해주세요.'); return; }
        const selectedData = parsedRows.filter(row => selectedRows.has(row.id));
        const dataMatrix = selectedData.map(row => [row.type, row.answer]);
        performCopy(dataMatrix, setCopiedSelected);
    };

    const toggleRow = (id, index, e) => {
        const newSelected = new Set(selectedRows);
        if (e.shiftKey && lastCheckedIndex !== null) {
            const [start, end] = [Math.min(lastCheckedIndex, index), Math.max(lastCheckedIndex, index)];
            for (let i = start; i <= end; i++) newSelected.add(parsedRows[i].id);
        } else {
            newSelected.has(id) ? newSelected.delete(id) : newSelected.add(id);
            setLastCheckedIndex(index);
        }
        setSelectedRows(newSelected);
    };

    const toggleAll = () => {
        if (selectedRows.size === parsedRows.length && parsedRows.length > 0) {
            setSelectedRows(new Set());
            setLastCheckedIndex(null);
        } else {
            setSelectedRows(new Set(parsedRows.map(row => row.id)));
        }
    };

    const updateRow = (index, field, value) => {
        const updated = [...parsedRows];
        updated[index][field] = value;
        if (field === 'original') {
            updated[index]['type'] = determineType(value);
            updated[index]['answer'] = determineAnswer(value);
        }
        setParsedRows(updated);
    };

    const processFile = (file) => {
        if (!file) return;
        if (!file.type.startsWith('image/') && file.type !== 'application/pdf') {
            alert('이미지 또는 PDF 파일만 업로드 가능합니다.');
            return;
        }
        setSelectedFile(file);
        setPreviewUrl(URL.createObjectURL(file));
    };

    const handleFileChange = (e) => processFile(e.target.files[0]);
    const handleDragOver = (e) => { e.preventDefault(); setIsDragging(true); };
    const handleDragLeave = (e) => { e.preventDefault(); setIsDragging(false); };
    const handleDrop = (e) => { e.preventDefault(); setIsDragging(false); if (e.dataTransfer.files[0]) processFile(e.dataTransfer.files[0]); };

    const fileToBase64 = (file) => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => {
                const result = reader.result;
                if (typeof result !== 'string') return reject(new Error('파일 읽기 실패'));
                const idx = result.indexOf(',');
                resolve(idx >= 0 ? result.slice(idx + 1) : result);
            };
            reader.onerror = () => reject(reader.error || new Error('파일 읽기 실패'));
            reader.readAsDataURL(file);
        });
    };

    const callGemini = async () => {
        if (!selectedFile) { alert("파일을 선택해주세요."); return; }
        setIsAnalyzing(true);
        try {
            const imageData = await fileToBase64(selectedFile);
            const headers = { 'Content-Type': 'application/json' };

            // Attach App Check token so the function can verify the call comes
            // from this real web app (not a curl/Postman/cloned site).
            // getAppCheckToken throws on failure — let it bubble so the user
            // sees a real error instead of a generic 401.
            headers['X-Firebase-AppCheck'] = await getAppCheckToken();

            const response = await fetch('/api/extract-answers', {
                method: 'POST',
                headers,
                body: JSON.stringify({ imageData, mimeType: selectedFile.type }),
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) {
                throw new Error(data.error || `요청 실패 (${response.status})`);
            }
            if (!data.text) throw new Error('분석 결과가 없습니다.');
            setRawData(data.text);
            parseData(data.text);
        } catch (error) {
            alert(`오류: ${error.message}`);
        } finally {
            setIsAnalyzing(false);
        }
    };

    const getTypeStyle = (type) => {
        switch (type) {
            case 'multipleChoice': return 'bg-amber-400/10 text-amber-200 border-amber-400/25';
            case 'shortAnswer':    return 'bg-emerald-400/10 text-emerald-200 border-emerald-400/25';
            default:                return 'bg-zinc-500/10 text-zinc-300 border-zinc-500/25';
        }
    };

    return (
        <div className="flex-1 flex overflow-hidden p-6 gap-6">
            {/* ─── Left Panel ─── */}
            <div className="w-96 space-y-5 overflow-y-auto custom-scrollbar pr-1">

                {/* §01 — AI 자동 분석 */}
                <div className="premium-panel p-5">
                    <div className="flex items-start gap-3.5 mb-5">
                        <div className="relative">
                            <div className="w-10 h-10 rounded-xl bg-amber-400/[0.08] border border-amber-400/25 flex items-center justify-center shadow-[0_0_24px_-6px_rgba(251,191,36,0.45),inset_0_1px_0_rgba(252,211,77,0.15)]">
                                <Wand2 className="w-4.5 h-4.5 text-amber-300" strokeWidth={1.75} />
                            </div>
                        </div>
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2.5">
                                <span className="section-num">01</span>
                                <h2 className="text-[14px] font-semibold text-zinc-100 tracking-tight">AI 자동 분석</h2>
                            </div>
                            <p className="text-[11.5px] text-zinc-500 mt-1 leading-relaxed">이미지에서 정답을 추출합니다</p>
                        </div>
                    </div>

                    {/* Key-less notice */}
                    <div className="mb-4 flex items-start gap-2.5 px-3 py-2.5 rounded-lg bg-emerald-400/[0.05] border border-emerald-400/20">
                        <ShieldCheck className="w-3.5 h-3.5 text-emerald-300 mt-0.5 shrink-0" strokeWidth={2} />
                        <div className="flex-1 min-w-0">
                            <p className="text-[12px] font-medium text-emerald-200 tracking-tight">
                                키 입력 없이 바로 사용
                            </p>
                            <p className="text-[10.5px] text-zinc-500 mt-0.5 leading-relaxed">
                                서버에 안전하게 보관된 키로 처리됩니다.
                            </p>
                        </div>
                    </div>

                    {/* Upload Area */}
                    <div
                        className={`relative border border-dashed rounded-xl p-5 text-center cursor-pointer transition-all duration-200
                            ${isDragging
                                ? 'border-amber-400/50 bg-amber-400/[0.04]'
                                : 'border-white/[0.10] hover:border-amber-400/30 hover:bg-amber-400/[0.02]'}`}
                        onClick={() => fileInputRef.current?.click()}
                        onDragOver={handleDragOver}
                        onDragLeave={handleDragLeave}
                        onDrop={handleDrop}
                    >
                        <input type="file" ref={fileInputRef} className="hidden" accept="image/*,application/pdf" onChange={handleFileChange} />
                        {previewUrl ? (
                            <div className="relative">
                                {selectedFile?.type.includes('image') ? (
                                    <img src={previewUrl} alt="Preview" className="max-h-32 mx-auto rounded-lg" />
                                ) : (
                                    <div className="flex flex-col items-center py-3">
                                        <FileText className="w-10 h-10 text-zinc-400 mb-2" strokeWidth={1.5} />
                                        <span className="text-[12.5px] text-zinc-200 break-all">{selectedFile?.name}</span>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="py-1.5">
                                <CloudUpload className="w-9 h-9 text-zinc-300 mx-auto mb-2.5" strokeWidth={1.5} />
                                <p className="text-zinc-100 font-semibold text-[13px] tracking-tight">파일을 드래그하거나 클릭</p>
                                <p className="text-zinc-500 text-[11px] mt-1">이미지 · PDF 지원</p>
                            </div>
                        )}
                    </div>

                    <button
                        onClick={callGemini}
                        disabled={isAnalyzing || !selectedFile}
                        className="premium-btn-primary press mt-4 w-full py-2.5 px-4 text-[13px] flex items-center justify-center gap-2"
                    >
                        {isAnalyzing ? (
                            <>
                                <Loader2 className="w-4 h-4 animate-spin" strokeWidth={2.25} />
                                분석 중
                            </>
                        ) : (
                            <>
                                <Sparkles className="w-4 h-4" strokeWidth={2.25} />
                                AI로 정답 추출
                            </>
                        )}
                    </button>
                </div>

                {/* §02 — 텍스트 입력 */}
                <div className="premium-panel p-5">
                    <div className="flex justify-between items-start mb-4">
                        <div className="flex items-start gap-3.5">
                            <div className="w-10 h-10 rounded-xl bg-white/[0.04] border border-white/[0.06] flex items-center justify-center">
                                <FileText className="w-4.5 h-4.5 text-zinc-300" strokeWidth={1.5} />
                            </div>
                            <div>
                                <div className="flex items-center gap-2.5">
                                    <span className="section-num">02</span>
                                    <h2 className="text-[14px] font-semibold text-zinc-100 tracking-tight">텍스트 입력</h2>
                                </div>
                                <p className="text-[11.5px] text-zinc-500 mt-1 leading-relaxed">직접 입력 또는 AI 결과 편집</p>
                            </div>
                        </div>
                        <button onClick={handleClear} className="press text-[11px] text-zinc-500 hover:text-red-400 hover:bg-red-500/[0.06] px-2.5 py-1.5 rounded-md flex items-center gap-1.5 transition-colors">
                            <Trash2 className="w-3 h-3" strokeWidth={2} /> 초기화
                        </button>
                    </div>
                    <textarea
                        className="w-full p-3.5 bg-black/30 border border-white/[0.06] rounded-lg text-zinc-100 placeholder-zinc-600 resize-none mono text-[12.5px] h-32 focus-ring transition-colors hover:border-white/10 leading-relaxed"
                        placeholder="직접 입력하거나 AI 추출 결과가 표시됩니다…"
                        value={rawData}
                        onChange={(e) => setRawData(e.target.value)}
                    />
                    <div className="flex items-center gap-2 mt-3">
                        <div className="flex items-center gap-2 bg-black/30 px-3 py-2 rounded-lg border border-white/[0.06]">
                            <span className="eyebrow !text-[9.5px]">시작 번호</span>
                            <input
                                type="number"
                                value={startNumber}
                                onChange={(e) => setStartNumber(Number(e.target.value))}
                                className="numeral w-12 px-1 py-0.5 text-center font-semibold text-amber-300 bg-transparent border-0 focus:outline-none"
                            />
                        </div>
                        <button
                            onClick={() => parseData()}
                            className="press flex-1 bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] hover:border-white/[0.12] text-zinc-100 font-semibold py-2.5 px-4 rounded-lg text-[12.5px] flex items-center justify-center gap-2 transition-colors"
                        >
                            <ArrowRightCircle className="w-3.5 h-3.5" strokeWidth={2} />
                            변환 적용
                        </button>
                    </div>
                </div>
            </div>

            {/* ─── Right Panel — Results Table ─── */}
            <div className="flex-1 premium-panel p-5 flex flex-col overflow-hidden">
                {/* Control Bar */}
                <div className="flex flex-col gap-4 mb-4 pb-4 border-b border-white/[0.05]">
                    <div className="flex justify-between items-center">
                        <div className="flex items-center gap-3">
                            <span className="section-num">RESULT</span>
                            <h2 className="text-[16px] font-semibold text-zinc-100 tracking-tight">변환 결과</h2>
                            <span className="numeral text-[11px] px-1.5 py-px rounded-md bg-amber-400/10 border border-amber-400/25 text-amber-300">
                                {parsedRows.length}개
                            </span>
                        </div>

                        <div className="flex items-center gap-2">
                            <div className="flex items-center">
                                <div className="relative">
                                    <Filter className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500" strokeWidth={1.75} />
                                    <input
                                        type="text"
                                        value={rangeInput}
                                        onChange={(e) => setRangeInput(e.target.value)}
                                        placeholder="1, 3-5, 8"
                                        className="numeral w-32 pl-8 pr-3 py-2 text-[12px] bg-black/30 border border-white/[0.06] rounded-l-lg text-zinc-100 placeholder-zinc-600 focus-ring transition-colors hover:border-white/10"
                                    />
                                </div>
                                <button
                                    onClick={handleCopyRange}
                                    className={`press px-3.5 py-2 rounded-r-lg text-[12px] font-medium border-y border-r transition-colors flex items-center gap-1.5 ${
                                        copiedRange
                                            ? 'bg-emerald-400/[0.08] border-emerald-400/30 text-emerald-200'
                                            : 'bg-white/[0.04] border-white/[0.06] hover:bg-white/[0.08] text-zinc-200'
                                    }`}
                                >
                                    {copiedRange ? <Check className="w-3.5 h-3.5" strokeWidth={2.25} /> : <Copy className="w-3.5 h-3.5" strokeWidth={2} />}
                                    범위
                                </button>
                            </div>

                            <button
                                onClick={handleCopySelected}
                                className={`press px-3.5 py-2 rounded-lg text-[12px] font-medium border transition-colors flex items-center gap-1.5 ${
                                    copiedSelected
                                        ? 'bg-emerald-400/[0.08] border-emerald-400/30 text-emerald-200'
                                        : 'bg-amber-400/[0.06] border-amber-400/25 text-amber-200 hover:bg-amber-400/[0.10]'
                                }`}
                            >
                                {copiedSelected ? <Check className="w-3.5 h-3.5" strokeWidth={2.25} /> : <CheckSquare className="w-3.5 h-3.5" strokeWidth={2} />}
                                선택 <span className="numeral">({selectedRows.size})</span>
                            </button>
                        </div>
                    </div>

                    <div className="flex gap-2 justify-end">
                        <button
                            onClick={() => handleCopyColumn('type', setCopiedType)}
                            className={`press px-3 py-1.5 rounded-md text-[11px] font-semibold border transition-colors flex items-center gap-1.5 ${
                                copiedType
                                    ? 'bg-emerald-400/[0.08] border-emerald-400/30 text-emerald-200'
                                    : 'bg-white/[0.04] border-white/[0.06] hover:bg-white/[0.08] text-zinc-300'
                            }`}
                        >
                            {copiedType ? <Check className="w-3 h-3" strokeWidth={2.25} /> : <Copy className="w-3 h-3" strokeWidth={2} />}
                            유형만
                        </button>
                        <button
                            onClick={() => handleCopyColumn('answer', setCopiedAnswer)}
                            className={`press px-3 py-1.5 rounded-md text-[11px] font-semibold border transition-colors flex items-center gap-1.5 ${
                                copiedAnswer
                                    ? 'bg-emerald-400/[0.08] border-emerald-400/30 text-emerald-200'
                                    : 'bg-white/[0.04] border-white/[0.06] hover:bg-white/[0.08] text-zinc-300'
                            }`}
                        >
                            {copiedAnswer ? <Check className="w-3 h-3" strokeWidth={2.25} /> : <Copy className="w-3 h-3" strokeWidth={2} />}
                            정답만
                        </button>
                        <button
                            onClick={handleCopyAll}
                            className={`press px-3.5 py-1.5 rounded-md text-[11px] font-semibold border transition-colors flex items-center gap-1.5 ${
                                copiedAll
                                    ? 'bg-emerald-400 border-emerald-400 text-zinc-950'
                                    : 'premium-btn-primary !rounded-md !py-1.5'
                            }`}
                        >
                            {copiedAll ? <Check className="w-3 h-3" strokeWidth={2.5} /> : <Copy className="w-3 h-3" strokeWidth={2.25} />}
                            전체 복사
                        </button>
                    </div>
                </div>

                {/* Table */}
                <div className="flex-1 overflow-hidden flex flex-col min-h-0">
                    {/* Header */}
                    <div className="grid grid-cols-12 gap-3 bg-white/[0.025] px-3 py-2.5 rounded-lg border border-white/[0.05]">
                        <div className="col-span-1 text-center flex items-center justify-center">
                            <input
                                type="checkbox"
                                checked={parsedRows.length > 0 && selectedRows.size === parsedRows.length}
                                onChange={toggleAll}
                                className="w-3.5 h-3.5 rounded accent-amber-400 cursor-pointer"
                            />
                        </div>
                        <div className="col-span-1 text-center eyebrow">No.</div>
                        <div className="col-span-4 eyebrow">원본 데이터</div>
                        <div className="col-span-1 text-center eyebrow">#</div>
                        <div className="col-span-2 eyebrow">유형</div>
                        <div className="col-span-3 eyebrow">정답</div>
                    </div>

                    {/* Body */}
                    <div className="flex-1 overflow-y-auto mt-1.5 space-y-1 custom-scrollbar pr-1">
                        {parsedRows.length === 0 ? (
                            <div className="h-full flex flex-col items-center justify-center text-zinc-500 py-20">
                                <div className="w-16 h-16 rounded-2xl glass flex items-center justify-center mb-4">
                                    <Inbox className="w-7 h-7 text-zinc-500" strokeWidth={1.5} />
                                </div>
                                <p className="text-[14px] font-semibold text-zinc-200 tracking-tight">데이터가 없습니다</p>
                                <p className="text-[12px] text-zinc-500 mt-1">파일을 업로드하여 정답을 추출하세요</p>
                            </div>
                        ) : (
                            parsedRows.map((row, idx) => (
                                <div
                                    key={row.id}
                                    className={`grid grid-cols-12 gap-3 px-3 py-2.5 rounded-lg items-center text-[13px] border transition-colors ${
                                        selectedRows.has(row.id)
                                            ? 'bg-amber-400/[0.06] border-amber-400/25'
                                            : 'bg-white/[0.015] border-white/[0.04] hover:bg-white/[0.04] hover:border-white/[0.08]'
                                    }`}
                                >
                                    <div className="col-span-1 text-center">
                                        <input
                                            type="checkbox"
                                            checked={selectedRows.has(row.id)}
                                            onClick={(e) => toggleRow(row.id, idx, e)}
                                            readOnly
                                            className="w-3.5 h-3.5 rounded accent-amber-400 cursor-pointer"
                                        />
                                    </div>
                                    <div className="col-span-1 text-center numeral text-zinc-500 text-[12px]">
                                        {row.originNum}
                                    </div>
                                    <div className="col-span-4">
                                        <input
                                            type="text"
                                            value={row.original}
                                            onChange={(e) => updateRow(idx, 'original', e.target.value)}
                                            className="w-full bg-transparent hover:bg-white/[0.04] focus:bg-white/[0.06] border border-transparent focus:border-amber-400/40 rounded-md px-2 py-1 text-zinc-100 outline-none transition-colors"
                                            style={{ fontFamily: 'inherit' }}
                                        />
                                    </div>
                                    <div className="col-span-1 text-center numeral font-semibold text-amber-300">
                                        {row.number}
                                    </div>
                                    <div className="col-span-2">
                                        <select
                                            value={row.type}
                                            onChange={(e) => updateRow(idx, 'type', e.target.value)}
                                            className={`w-full font-medium py-1 px-2 rounded-md border cursor-pointer text-[11px] bg-transparent ${getTypeStyle(row.type)}`}
                                        >
                                            <option value="multipleChoice" className="bg-zinc-900">5지선다형</option>
                                            <option value="shortAnswer" className="bg-zinc-900">단답형</option>
                                            <option value="narrative" className="bg-zinc-900">서술형</option>
                                        </select>
                                    </div>
                                    <div className="col-span-3">
                                        <input
                                            type="text"
                                            value={row.answer}
                                            onChange={(e) => updateRow(idx, 'answer', e.target.value)}
                                            className="numeral w-full bg-black/20 border border-white/[0.06] rounded-md px-2.5 py-1 text-amber-200 font-semibold focus-ring outline-none transition-colors hover:border-white/10"
                                        />
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
