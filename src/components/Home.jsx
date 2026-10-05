import { useState } from 'react';
import { motion } from 'framer-motion';
import { Upload, FileText, X, ShieldCheck, ArrowRight } from 'lucide-react';
import { useSharedFile } from '../context/FileContext';
import { TOOLS } from './toolCatalog';

export default function Home({ onPick }) {
  const { file, openFile, clearFile } = useSharedFile();
  const [isDragOver, setIsDragOver] = useState(false);

  const handleInput = (e) => {
    if (e.target.files?.[0]) openFile(e.target.files[0]);
    e.target.value = '';
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) openFile(f);
  };

  return (
    <main className="flex-1 overflow-y-auto custom-scrollbar">
      <div className="max-w-5xl mx-auto px-8 py-10 reveal">

        {/* — 소개 — */}
        <div className="flex items-start justify-between gap-6 flex-wrap">
          <div className="max-w-xl">
            <div className="eyebrow mb-2">LEARNING TOOL STUDIO</div>
            <h1 className="text-[28px] leading-tight font-semibold tracking-tight text-zinc-100">
              교재를 수업 자료로 바꾸는 도구
            </h1>
            <p className="text-[14px] text-zinc-500 mt-2 leading-relaxed">
              PDF를 한 번만 열면 아래 도구들이 같은 파일을 이어받습니다.
              탭을 옮길 때마다 다시 열 필요가 없습니다.
            </p>
          </div>
          <div className="flex items-center gap-2 px-3.5 py-2 rounded-xl glass text-[12px] text-emerald-300/90">
            <ShieldCheck className="w-4 h-4" strokeWidth={2} />
            <span className="font-medium">파일은 이 컴퓨터에서만 처리됩니다</span>
          </div>
        </div>

        {/* — 파일 자리 — */}
        <div className="mt-7">
          {file ? (
            <div className="flex items-center gap-4 px-5 py-4 rounded-2xl glass border border-amber-400/25">
              <div className="w-10 h-10 rounded-xl bg-amber-400/10 border border-amber-400/25 flex items-center justify-center shrink-0">
                <FileText className="w-5 h-5 text-amber-300" strokeWidth={1.75} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[14px] font-medium text-zinc-100 truncate">{file.name}</div>
                <div className="text-[12px] text-zinc-500 numeral">
                  {formatSize(file.size)} · 아래 도구에서 바로 이어서 씁니다
                </div>
              </div>
              <label className="press cursor-pointer text-[12px] px-3 py-2 rounded-lg glass hover:bg-white/[0.05] text-zinc-300 transition-colors">
                다른 파일
                <input type="file" accept="application/pdf,image/*" className="hidden" onChange={handleInput} />
              </label>
              <button
                onClick={clearFile}
                aria-label="파일 닫기"
                className="press w-9 h-9 rounded-lg glass hover:bg-white/[0.05] flex items-center justify-center text-zinc-400 hover:text-zinc-100 transition-colors"
              >
                <X className="w-4 h-4" strokeWidth={2} />
              </button>
            </div>
          ) : (
            <label
              onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
              onDragLeave={(e) => { if (e.currentTarget === e.target) setIsDragOver(false); }}
              onDrop={handleDrop}
              className={`press block cursor-pointer rounded-2xl px-6 py-9 text-center transition-colors ${
                isDragOver
                  ? 'border-2 border-dashed border-amber-400/60 bg-amber-400/[0.05]'
                  : 'glass border border-white/[0.06] hover:bg-white/[0.03]'
              }`}
            >
              <div className="w-12 h-12 rounded-2xl glass mx-auto flex items-center justify-center mb-3">
                <Upload className="w-5 h-5 text-amber-300" strokeWidth={1.75} />
              </div>
              <div className="text-[15px] font-semibold text-zinc-100">
                PDF를 열거나 이곳에 끌어다 놓으세요
              </div>
              <div className="text-[12px] text-zinc-500 mt-1.5">
                먼저 도구를 골라도 됩니다 · PDF · PNG · JPG
              </div>
              <input type="file" accept="application/pdf,image/*" className="hidden" onChange={handleInput} />
            </label>
          )}
        </div>

        {/* — 도구 — */}
        <div className="mt-9 flex items-baseline gap-3">
          <h2 className="text-[15px] font-semibold text-zinc-200 tracking-tight">도구</h2>
          <span className="text-[12px] text-zinc-600">
            무료 도구는 이 컴퓨터에서 처리되고, AI 도구는 서버 분석을 씁니다
          </span>
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {TOOLS.map((t, i) => (
            <ToolCard key={t.id} tool={t} index={i} hasFile={!!file} onPick={onPick} />
          ))}
        </div>

        <div className="h-10" />
      </div>
    </main>
  );
}

function ToolCard({ tool, index, hasFile, onPick }) {
  const { Icon, label, summary, steps, tag, accepts, id } = tool;
  const isAi = tag === 'AI';

  return (
    <motion.button
      onClick={() => onPick?.(id)}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.045, duration: 0.28 }}
      className="press text-left w-full rounded-2xl glass border border-white/[0.06] hover:bg-white/[0.035] hover:border-white/[0.1] transition-colors p-5 group"
    >
      <div className="flex items-start gap-3.5">
        <div
          className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border ${
            isAi
              ? 'bg-violet-400/10 border-violet-400/25'
              : 'bg-amber-400/10 border-amber-400/25'
          }`}
        >
          <Icon className={`w-5 h-5 ${isAi ? 'text-violet-300' : 'text-amber-300'}`} strokeWidth={1.9} />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-[15px] font-semibold text-zinc-100 tracking-tight">{label}</span>
            <span
              className={`text-[10px] font-bold px-1.5 py-px rounded border ${
                isAi
                  ? 'text-violet-300 border-violet-400/30 bg-violet-400/10'
                  : 'text-emerald-300 border-emerald-400/25 bg-emerald-400/10'
              }`}
            >
              {tag}
            </span>
          </div>
          <p className="text-[13px] text-zinc-500 mt-1 leading-relaxed">{summary}</p>
        </div>

        <ArrowRight
          className="w-4 h-4 text-zinc-600 group-hover:text-amber-300 transition-colors shrink-0 mt-1"
          strokeWidth={2}
        />
      </div>

      {/* 3단계 */}
      <div className="mt-4 flex items-center gap-1.5 flex-wrap">
        {steps.map((s, i) => (
          <span key={s} className="flex items-center gap-1.5">
            <span className="text-[11px] text-zinc-500 px-2 py-1 rounded-md bg-white/[0.04] border border-white/[0.05]">
              {i + 1}. {s}
            </span>
            {i < steps.length - 1 && <span className="text-zinc-700 text-[10px]">→</span>}
          </span>
        ))}
      </div>

      <div className="mt-3 flex items-center justify-between text-[11px]">
        <span className="text-zinc-600 mono">{accepts}</span>
        {hasFile && (
          <span className="text-amber-300/80 font-medium">연 파일로 바로 시작</span>
        )}
      </div>
    </motion.button>
  );
}

function formatSize(bytes) {
  if (!bytes && bytes !== 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
