import { ShieldCheck, Sparkles } from 'lucide-react';
import { TOOLS } from './toolCatalog';

/**
 * 도구 화면 맨 위에 붙는 안내 띠.
 *
 * 홈 카드에서 본 것과 같은 문장 · 같은 3단계를 도구 안에서도 보여준다.
 * (홈을 안 거치고 탭으로 바로 들어온 사람이 "여기서 뭘 하는 거지"를
 *  묻지 않게 하는 게 목적이다. 문구는 toolCatalog 한 곳에서만 관리한다.)
 */
export default function ToolIntro({ toolId, right = null }) {
  const tool = TOOLS.find((t) => t.id === toolId);
  if (!tool) return null;

  const { label, summary, steps, accepts, tag } = tool;
  const isAi = tag === 'AI';

  return (
    <div className="shrink-0 px-8 pt-6 pb-4 [@media(max-height:820px)]:pt-3 [@media(max-height:820px)]:pb-2">
      <div className="flex items-start justify-between gap-5 flex-wrap">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-[19px] font-semibold tracking-tight text-zinc-100">{label}</h1>
            <span
              className={`text-[11.5px] font-bold px-1.5 py-px rounded border ${
                isAi
                  ? 'text-violet-300 border-violet-400/30 bg-violet-400/10'
                  : 'text-emerald-300 border-emerald-400/25 bg-emerald-400/10'
              }`}
            >
              {tag}
            </span>
            <span className="text-[12.5px] text-zinc-400 mono ml-1">{accepts}</span>
          </div>
          <p className="text-[14.5px] text-zinc-400 mt-1 leading-relaxed">{summary}</p>

          <div className="mt-3 flex items-center gap-1.5 flex-wrap [@media(max-height:820px)]:hidden">
            {steps.map((s, i) => (
              <span key={s} className="flex items-center gap-1.5">
                <span className="text-[13px] text-zinc-300 px-2 py-1 rounded-md bg-white/[0.04] border border-white/[0.05]">
                  <span className="text-zinc-400 mr-1">{i + 1}</span>
                  {s}
                </span>
                {i < steps.length - 1 && <span className="text-zinc-500 text-[11.5px]">→</span>}
              </span>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {right}
          {isAi ? (
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl glass text-[13px] text-violet-300/90">
              <Sparkles className="w-3.5 h-3.5" strokeWidth={2} />
              <span className="font-medium">AI 분석 — 파일이 서버로 전송됩니다</span>
            </div>
          ) : (
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl glass text-[13px] text-emerald-300/90">
              <ShieldCheck className="w-3.5 h-3.5" strokeWidth={2} />
              <span className="font-medium">이 컴퓨터에서만 처리됩니다</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
