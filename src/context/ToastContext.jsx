import {
  createContext,
  useContext,
  useState,
  useCallback,
  useMemo,
  useRef,
} from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { CheckCircle2, AlertTriangle, Info, X, HelpCircle } from 'lucide-react';

/**
 * 앱 안 알림 · 확인창.
 *
 * 이전에는 alert()/confirm() 을 22군데에서 썼다. 브라우저 기본 모달은
 *  - 앱 밖에 뜨는 OS 창이라 흐름이 끊기고
 *  - 여러 개가 겹치면 순서가 뒤집히고
 *  - 스타일을 못 입혀서 "이 프로그램이 죽었나" 하는 인상을 준다.
 * 여기로 모아서 화면 안에서 처리한다.
 *
 *   const toast = useToast();
 *   toast.error('PDF를 불러오지 못했습니다');
 *   toast.ok('클립보드에 복사했습니다');
 *   if (await toast.confirm({ title: '모든 문제를 삭제할까요?' })) { ... }
 */
const ToastContext = createContext(null);

const AUTO_DISMISS = { ok: 2200, info: 3200, error: 5000 };

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const [ask, setAsk] = useState(null); // { title, message, confirmLabel, danger, resolve }
  const nextId = useRef(0);

  const dismiss = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    (kind, message) => {
      if (!message) return;
      const id = nextId.current++;
      // 같은 메시지가 연달아 오면 새로 쌓지 않는다 (반복 실패 시 화면이 덮이는 걸 막음)
      setToasts((prev) => {
        const dup = prev.find((t) => t.message === message && t.kind === kind);
        if (dup) return prev;
        return [...prev.slice(-3), { id, kind, message }];
      });
      window.setTimeout(() => dismiss(id), AUTO_DISMISS[kind] ?? 3200);
    },
    [dismiss]
  );

  const api = useMemo(
    () => ({
      ok: (m) => push('ok', m),
      info: (m) => push('info', m),
      error: (m) => push('error', m),
      confirm: ({ title, message, confirmLabel = '확인', danger = false } = {}) =>
        new Promise((resolve) => {
          setAsk({ title, message, confirmLabel, danger, resolve });
        }),
    }),
    [push]
  );

  const answer = (value) => {
    setAsk((cur) => {
      cur?.resolve(value);
      return null;
    });
  };

  return (
    <ToastContext.Provider value={api}>
      {children}

      {/* 알림 — 우하단 */}
      <div className="fixed bottom-5 right-5 z-[200] flex flex-col gap-2 items-end pointer-events-none">
        <AnimatePresence initial={false}>
          {toasts.map((t) => (
            <Toast key={t.id} toast={t} onClose={() => dismiss(t.id)} />
          ))}
        </AnimatePresence>
      </div>

      {/* 확인창 */}
      <AnimatePresence>
        {ask && <ConfirmDialog ask={ask} onAnswer={answer} />}
      </AnimatePresence>
    </ToastContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within <ToastProvider>');
  return ctx;
}

/* — — — 표시 — — — */

const STYLES = {
  ok: {
    Icon: CheckCircle2,
    ring: 'border-emerald-400/30',
    tint: 'text-emerald-300',
    glow: '0 0 28px -10px rgba(52, 211, 153, 0.5)',
  },
  info: {
    Icon: Info,
    ring: 'border-white/[0.1]',
    tint: 'text-zinc-200',
    glow: 'none',
  },
  error: {
    Icon: AlertTriangle,
    ring: 'border-rose-400/30',
    tint: 'text-rose-300',
    glow: '0 0 28px -10px rgba(251, 113, 133, 0.5)',
  },
};

function Toast({ toast, onClose }) {
  const { Icon, ring, tint, glow } = STYLES[toast.kind] ?? STYLES.info;
  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: 24, scale: 0.97 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: 24, scale: 0.97 }}
      transition={{ type: 'spring', stiffness: 420, damping: 32 }}
      style={{ boxShadow: glow }}
      className={`pointer-events-auto max-w-[380px] flex items-start gap-3 pl-4 pr-3 py-3 rounded-xl glass-strong border ${ring}`}
      role="status"
    >
      <Icon className={`w-4 h-4 shrink-0 mt-px ${tint}`} strokeWidth={2} />
      <span className="text-[14.5px] leading-relaxed text-zinc-200">{toast.message}</span>
      <button
        onClick={onClose}
        aria-label="닫기"
        className="press shrink-0 -mr-1 w-6 h-6 rounded-md flex items-center justify-center text-zinc-400 hover:text-zinc-200 hover:bg-white/5 transition-colors"
      >
        <X className="w-3.5 h-3.5" strokeWidth={2} />
      </button>
    </motion.div>
  );
}

function ConfirmDialog({ ask, onAnswer }) {
  const { title, message, confirmLabel, danger } = ask;
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.16 }}
      className="fixed inset-0 z-[300] flex items-center justify-center p-6 bg-zinc-950/70 backdrop-blur-sm"
      onClick={() => onAnswer(false)}
    >
      <motion.div
        initial={{ opacity: 0, y: 12, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 8, scale: 0.98 }}
        transition={{ type: 'spring', stiffness: 460, damping: 34 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[420px] rounded-2xl glass-strong border border-white/[0.1] p-6"
        role="dialog"
        aria-modal="true"
      >
        <div className="flex items-start gap-3.5">
          <div
            className={`w-10 h-10 rounded-xl shrink-0 flex items-center justify-center border ${
              danger
                ? 'bg-rose-400/10 border-rose-400/25'
                : 'bg-amber-400/10 border-amber-400/25'
            }`}
          >
            {danger ? (
              <AlertTriangle className="w-5 h-5 text-rose-300" strokeWidth={1.9} />
            ) : (
              <HelpCircle className="w-5 h-5 text-amber-300" strokeWidth={1.9} />
            )}
          </div>
          <div className="min-w-0 pt-0.5">
            <h3 className="text-[16px] font-semibold text-zinc-100 tracking-tight leading-snug">
              {title}
            </h3>
            {message && (
              <p className="text-[14.5px] text-zinc-300 mt-1.5 leading-relaxed whitespace-pre-line">
                {message}
              </p>
            )}
          </div>
        </div>

        <div className="mt-6 flex items-center justify-end gap-2">
          <button
            onClick={() => onAnswer(false)}
            className="press px-4 py-2 rounded-lg text-[14.5px] font-medium text-zinc-200 glass hover:bg-white/[0.05] transition-colors"
          >
            취소
          </button>
          <button
            autoFocus
            onClick={() => onAnswer(true)}
            className={`press px-4 py-2 rounded-lg text-[14.5px] font-semibold transition-colors ${
              danger
                ? 'bg-rose-400 hover:bg-rose-300 text-zinc-950'
                : 'bg-amber-400 hover:bg-amber-300 text-zinc-950'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
