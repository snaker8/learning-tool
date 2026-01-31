import React, { useState, useEffect, useRef } from 'react';
import { Sparkles, Wand2, Key, Eye, EyeOff, CloudUpload, FileText, Trash2, ArrowRightCircle, Filter, Copy, Check, CheckSquare, Inbox, Loader2, Info } from 'lucide-react';

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
    const [apiKey, setApiKey] = useState('');
    const [showApiKey, setShowApiKey] = useState(false);

    useEffect(() => {
        const savedKey = localStorage.getItem('gemini_api_key');
        if (savedKey) setApiKey(savedKey);
    }, []);

    const saveApiKey = (key) => {
        setApiKey(key);
        key ? localStorage.setItem('gemini_api_key', key) : localStorage.removeItem('gemini_api_key');
    };

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

            // 1. Plain Text: 탭 구분
            const textData = dataMatrix.map(row =>
                row.map(cell => (cell || '').toString().trim()).join('\t')
            ).join('\n');

            // 2. HTML (테이블 형식) - 오르조 사이트 인식용
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
            if (!result) {
                throw new Error('execCommand failed');
            }
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

    const fileToGenerativePart = async (file) => {
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve({ inlineData: { data: reader.result.split(',')[1], mimeType: file.type } });
            reader.readAsDataURL(file);
        });
    };

    const callGemini = async () => {
        if (!apiKey) { alert("API 키를 입력해주세요."); return; }
        if (!selectedFile) { alert("파일을 선택해주세요."); return; }
        setIsAnalyzing(true);
        try {
            const imagePart = await fileToGenerativePart(selectedFile);
            const payload = {
                contents: [{
                    parts: [
                        { text: "이 이미지에서 정답표(정답지)를 찾아서 텍스트로 추출해줘. 문제 번호와 정답을 각 줄에 하나씩 나열해. 형식은 '문제번호. 정답' (예: 1. ①, 2. 5, 3. -1, 4. 1/2, 5. 해설참조) 형태로 해줘.\n\n[중요 원칙]\n1. 객관식 정답이 원문자(①, ②, ③, ④, ⑤)로 되어 있다면 반드시 해당 특수문자를 그대로 사용해. 절대 (1)이나 1로 바꾸지 마.\n2. '해설참조', '별도첨부' 같이 텍스트로 된 정답도 절대 생략하지 말고 그대로 적어.\n3. 수식은 LaTeX 포맷($...$)을 절대 쓰지 마. 대신 유니코드 기호(√, ³, ², /, π 등)를 사용하여 사람이 바로 읽을 수 있는 텍스트로 변환해.\n4. 불필요한 말(인사, 설명)은 생략하고 데이터만 줘." },
                        imagePart
                    ]
                }]
            };
            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error?.message || "API 호출 실패");
            if (!data.candidates?.[0]?.content) throw new Error("분석 결과가 없습니다.");
            const extractedText = data.candidates[0].content.parts[0].text;
            setRawData(extractedText);
            parseData(extractedText);
        } catch (error) {
            alert(`오류: ${error.message}`);
        } finally {
            setIsAnalyzing(false);
        }
    };

    const getTypeStyle = (type) => {
        switch (type) {
            case 'multipleChoice': return 'bg-violet-500/20 text-violet-300 border-violet-500/30';
            case 'shortAnswer': return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30';
            default: return 'bg-amber-500/20 text-amber-300 border-amber-500/30';
        }
    };

    return (
        <div className="flex-1 flex overflow-hidden p-6 gap-6">
            {/* Left Panel */}
            <div className="w-96 space-y-4 overflow-y-auto custom-scrollbar">
                {/* AI Section */}
                <div className="bg-white/5 backdrop-blur-xl rounded-2xl p-5 border border-white/10">
                    <div className="flex items-center gap-3 mb-5">
                        <div className="w-10 h-10 bg-gradient-to-br from-violet-500 to-purple-600 rounded-xl flex items-center justify-center">
                            <Wand2 className="w-5 h-5 text-white" />
                        </div>
                        <div>
                            <h2 className="font-bold text-white">AI 자동 분석</h2>
                            <p className="text-xs text-slate-400">이미지에서 정답을 추출합니다</p>
                        </div>
                    </div>

                    {/* API Key */}
                    <div className="mb-4">
                        <label className="text-xs font-medium text-slate-400 mb-2 flex items-center gap-1.5">
                            <Key className="w-3.5 h-3.5" /> API Key
                        </label>
                        <div className="relative">
                            <input
                                type={showApiKey ? "text" : "password"}
                                value={apiKey}
                                onChange={(e) => saveApiKey(e.target.value)}
                                placeholder="Gemini API 키 입력"
                                className="w-full px-4 py-2.5 text-sm bg-black/30 border border-white/10 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-violet-500/50 pr-10"
                            />
                            <button
                                onClick={() => setShowApiKey(!showApiKey)}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white transition-colors"
                            >
                                {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            </button>
                        </div>
                        <p className="text-xs text-slate-500 mt-1.5 flex items-center gap-1">
                            <Info className="w-3 h-3" /> 브라우저에 자동 저장됩니다
                        </p>
                    </div>

                    {/* Upload Area */}
                    <div
                        className={`relative border-2 border-dashed rounded-2xl p-6 text-center cursor-pointer transition-all duration-300
                            ${isDragging ? 'border-violet-400 bg-violet-500/10 scale-[1.02]' : 'border-white/20 hover:border-violet-400/50 hover:bg-white/5'}`}
                        onClick={() => fileInputRef.current?.click()}
                        onDragOver={handleDragOver}
                        onDragLeave={handleDragLeave}
                        onDrop={handleDrop}
                    >
                        <input type="file" ref={fileInputRef} className="hidden" accept="image/*,application/pdf" onChange={handleFileChange} />
                        {previewUrl ? (
                            <div className="relative">
                                {selectedFile?.type.includes('image') ? (
                                    <img src={previewUrl} alt="Preview" className="max-h-32 mx-auto rounded-xl" />
                                ) : (
                                    <div className="flex flex-col items-center py-4">
                                        <FileText className="w-12 h-12 text-slate-400 mb-2" />
                                        <span className="text-sm text-slate-300">{selectedFile?.name}</span>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="py-2">
                                <CloudUpload className="w-10 h-10 text-violet-400 mx-auto mb-3" />
                                <p className="text-slate-300 font-medium text-sm">파일을 드래그하거나 클릭</p>
                                <p className="text-slate-500 text-xs mt-1">이미지, PDF 지원</p>
                            </div>
                        )}
                    </div>

                    <button
                        onClick={callGemini}
                        disabled={isAnalyzing || !selectedFile || !apiKey}
                        className="mt-4 w-full py-3 px-4 rounded-xl font-semibold text-white flex items-center justify-center gap-2 bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500 disabled:from-slate-600 disabled:to-slate-700 disabled:cursor-not-allowed transition-all shadow-lg shadow-violet-500/20"
                    >
                        {isAnalyzing ? (
                            <>
                                <Loader2 className="w-5 h-5 animate-spin" />
                                분석 중...
                            </>
                        ) : (
                            <>
                                <Sparkles className="w-5 h-5" />
                                AI로 정답 추출
                            </>
                        )}
                    </button>
                </div>

                {/* Text Input */}
                <div className="bg-white/5 backdrop-blur-xl rounded-2xl p-5 border border-white/10">
                    <div className="flex justify-between items-center mb-4">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-gradient-to-br from-slate-600 to-slate-800 rounded-xl flex items-center justify-center">
                                <FileText className="w-5 h-5 text-white" />
                            </div>
                            <h2 className="font-bold text-white">텍스트 입력</h2>
                        </div>
                        <button onClick={handleClear} className="text-xs text-red-400 hover:text-red-300 hover:bg-red-500/10 px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-colors">
                            <Trash2 className="w-3.5 h-3.5" /> 초기화
                        </button>
                    </div>
                    <textarea
                        className="w-full p-4 bg-black/30 border border-white/10 rounded-xl text-white placeholder-slate-500 resize-none font-mono text-sm h-36 focus:outline-none focus:border-violet-500/50"
                        placeholder="직접 입력하거나 AI 추출 결과가 표시됩니다..."
                        value={rawData}
                        onChange={(e) => setRawData(e.target.value)}
                    />
                    <div className="flex items-center gap-2 mt-3">
                        <div className="flex items-center gap-2 bg-black/30 px-3 py-1.5 rounded-lg border border-white/10">
                            <span className="text-xs text-slate-400">시작 번호</span>
                            <input
                                type="number"
                                value={startNumber}
                                onChange={(e) => setStartNumber(Number(e.target.value))}
                                className="w-12 px-2 py-1 text-center font-bold text-violet-400 bg-transparent border-0 focus:outline-none"
                            />
                        </div>
                        <button
                            onClick={() => parseData()}
                            className="flex-1 bg-slate-700 hover:bg-slate-600 text-white font-semibold py-2.5 px-4 rounded-xl text-sm flex items-center justify-center gap-2 transition-colors"
                        >
                            <ArrowRightCircle className="w-4 h-4" />
                            변환 적용
                        </button>
                    </div>
                </div>
            </div>

            {/* Right Panel - Results Table */}
            <div className="flex-1 bg-white/5 backdrop-blur-xl rounded-2xl p-5 border border-white/10 flex flex-col overflow-hidden">
                {/* Control Bar */}
                <div className="flex flex-col gap-4 mb-5 pb-5 border-b border-white/10">
                    <div className="flex justify-between items-center">
                        <div className="flex items-center gap-3">
                            <h2 className="text-xl font-bold text-white">변환 결과</h2>
                            <span className="px-3 py-1 bg-violet-500/20 text-violet-300 rounded-full text-sm font-semibold">
                                {parsedRows.length}개
                            </span>
                        </div>

                        <div className="flex items-center gap-2">
                            <div className="flex items-center">
                                <div className="relative">
                                    <Filter className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                                    <input
                                        type="text"
                                        value={rangeInput}
                                        onChange={(e) => setRangeInput(e.target.value)}
                                        placeholder="1, 3-5, 8"
                                        className="w-28 pl-9 pr-3 py-2 text-sm bg-black/30 border border-white/10 rounded-l-xl text-white placeholder-slate-500 focus:outline-none focus:border-violet-500/50"
                                    />
                                </div>
                                <button
                                    onClick={handleCopyRange}
                                    className={`px-4 py-2 rounded-r-xl text-sm font-medium border-y border-r transition-all flex items-center gap-1.5 ${copiedRange ? 'bg-emerald-500/20 border-emerald-500/30 text-emerald-300' : 'bg-white/5 border-white/10 hover:bg-white/10 text-slate-300'}`}
                                >
                                    {copiedRange ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                                    범위
                                </button>
                            </div>

                            <button
                                onClick={handleCopySelected}
                                className={`px-4 py-2 rounded-xl text-sm font-medium border transition-all flex items-center gap-1.5 ${copiedSelected ? 'bg-emerald-500/20 border-emerald-500/30 text-emerald-300' : 'bg-violet-500/20 border-violet-500/30 text-violet-300 hover:bg-violet-500/30'}`}
                            >
                                {copiedSelected ? <Check className="w-4 h-4" /> : <CheckSquare className="w-4 h-4" />}
                                선택 ({selectedRows.size})
                            </button>
                        </div>
                    </div>

                    <div className="flex gap-2 justify-end">
                        <button
                            onClick={() => handleCopyColumn('type', setCopiedType)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all flex items-center gap-1.5 ${copiedType ? 'bg-emerald-500/20 border-emerald-500/30 text-emerald-300' : 'bg-white/5 border-white/10 hover:bg-white/10 text-slate-300'}`}
                        >
                            {copiedType ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                            유형만
                        </button>
                        <button
                            onClick={() => handleCopyColumn('answer', setCopiedAnswer)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all flex items-center gap-1.5 ${copiedAnswer ? 'bg-emerald-500/20 border-emerald-500/30 text-emerald-300' : 'bg-white/5 border-white/10 hover:bg-white/10 text-slate-300'}`}
                        >
                            {copiedAnswer ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                            정답만
                        </button>
                        <button
                            onClick={handleCopyAll}
                            className={`px-4 py-1.5 rounded-lg text-xs font-bold border transition-all flex items-center gap-1.5 ${copiedAll ? 'bg-emerald-500 border-emerald-500 text-white' : 'bg-violet-600 border-violet-600 text-white hover:bg-violet-500'}`}
                        >
                            {copiedAll ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                            전체 복사
                        </button>
                    </div>
                </div>

                {/* Table */}
                <div className="flex-1 overflow-hidden flex flex-col min-h-0">
                    {/* Header */}
                    <div className="grid grid-cols-12 gap-3 bg-white/5 p-3 rounded-xl font-semibold text-sm text-slate-400">
                        <div className="col-span-1 text-center flex items-center justify-center">
                            <input
                                type="checkbox"
                                checked={parsedRows.length > 0 && selectedRows.size === parsedRows.length}
                                onChange={toggleAll}
                                className="w-4 h-4 rounded border-slate-600 bg-transparent text-violet-500 focus:ring-violet-500 cursor-pointer"
                            />
                        </div>
                        <div className="col-span-1 text-center">No.</div>
                        <div className="col-span-4">원본 데이터</div>
                        <div className="col-span-1 text-center">#</div>
                        <div className="col-span-2">유형</div>
                        <div className="col-span-3">정답</div>
                    </div>

                    {/* Body */}
                    <div className="flex-1 overflow-y-auto mt-2 space-y-1 custom-scrollbar">
                        {parsedRows.length === 0 ? (
                            <div className="h-full flex flex-col items-center justify-center text-slate-400 py-20">
                                <div className="w-20 h-20 bg-white/5 rounded-3xl flex items-center justify-center mb-4">
                                    <Inbox className="w-10 h-10 text-slate-500" />
                                </div>
                                <p className="text-lg font-medium text-slate-400">데이터가 없습니다</p>
                                <p className="text-sm text-slate-500 mt-1">파일을 업로드하여 정답을 추출하세요</p>
                            </div>
                        ) : (
                            parsedRows.map((row, idx) => (
                                <div
                                    key={row.id}
                                    className={`grid grid-cols-12 gap-3 p-3 rounded-xl items-center text-sm transition-colors ${selectedRows.has(row.id) ? 'bg-violet-500/10 ring-1 ring-violet-500/30' : 'bg-white/5 hover:bg-white/10'}`}
                                >
                                    <div className="col-span-1 text-center">
                                        <input
                                            type="checkbox"
                                            checked={selectedRows.has(row.id)}
                                            onClick={(e) => toggleRow(row.id, idx, e)}
                                            readOnly
                                            className="w-4 h-4 rounded border-slate-600 bg-transparent text-violet-500 focus:ring-violet-500 cursor-pointer"
                                        />
                                    </div>
                                    <div className="col-span-1 text-center font-mono text-slate-500 font-medium">
                                        {row.originNum}
                                    </div>
                                    <div className="col-span-4">
                                        <input
                                            type="text"
                                            value={row.original}
                                            onChange={(e) => updateRow(idx, 'original', e.target.value)}
                                            className="w-full bg-transparent hover:bg-white/5 focus:bg-white/10 border border-transparent focus:border-violet-500/50 rounded-lg px-2 py-1 text-slate-200 outline-none transition-all"
                                        />
                                    </div>
                                    <div className="col-span-1 text-center font-bold text-violet-400">
                                        {row.number}
                                    </div>
                                    <div className="col-span-2">
                                        <select
                                            value={row.type}
                                            onChange={(e) => updateRow(idx, 'type', e.target.value)}
                                            className={`w-full font-medium py-1.5 px-2 rounded-lg border cursor-pointer text-xs bg-transparent ${getTypeStyle(row.type)}`}
                                        >
                                            <option value="multipleChoice" className="bg-slate-800">5지선다형</option>
                                            <option value="shortAnswer" className="bg-slate-800">단답형</option>
                                            <option value="narrative" className="bg-slate-800">서술형</option>
                                        </select>
                                    </div>
                                    <div className="col-span-3">
                                        <input
                                            type="text"
                                            value={row.answer}
                                            onChange={(e) => updateRow(idx, 'answer', e.target.value)}
                                            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-violet-300 font-semibold focus:ring-2 focus:ring-violet-500/50 focus:border-transparent outline-none"
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
