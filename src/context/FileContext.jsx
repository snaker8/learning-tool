import {
  createContext,
  useContext,
  useState,
  useCallback,
  useMemo,
  useEffect,
  useRef,
} from 'react';

/**
 * 앱 전체가 공유하는 "지금 작업 중인 파일".
 *
 * 이전에는 판서 제작기 · 분할·합치기 · PDF↔이미지 · 답 추출기가 각자
 * <input type="file"> 을 들고 있어서, 같은 교재로 다른 작업을 하려면
 * 탭을 옮길 때마다 파일을 다시 열어야 했다.
 * 여기에 한 번 담아두면 모든 도구가 같은 파일을 이어받는다.
 *
 * 각 도구는 여전히 자기 파일을 따로 열 수 있다(= "다른 파일 열기").
 */
const FileContext = createContext(null);

export function FileProvider({ children }) {
  const [file, setFile] = useState(null);
  // 파일이 바뀔 때마다 증가. 도구들은 이 값으로 "새 파일이 왔다"를 판단한다.
  // (같은 파일을 다시 열어도 재적용되도록 객체 동일성에 의존하지 않는다)
  const [token, setToken] = useState(0);

  const openFile = useCallback((next) => {
    if (!next) return;
    setFile(next);
    setToken((t) => t + 1);
  }, []);

  const clearFile = useCallback(() => {
    setFile(null);
    setToken((t) => t + 1);
  }, []);

  const value = useMemo(
    () => ({ file, token, openFile, clearFile }),
    [file, token, openFile, clearFile]
  );

  return <FileContext.Provider value={value}>{children}</FileContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useSharedFile() {
  const ctx = useContext(FileContext);
  if (!ctx) throw new Error('useSharedFile must be used within <FileProvider>');
  return ctx;
}

/**
 * 도구 컴포넌트용 헬퍼.
 * 공유 파일이 "새로" 들어왔을 때만 onAdopt(file) 을 한 번 호출한다.
 * 도구 안에서 다른 파일을 열어도 공유 파일로 되돌리지 않는다.
 *
 *   useAdoptSharedFile(loadFile, 'pdf');
 *
 * accept: 'any' | 'pdf' | 'image' | 'pdf-or-image'
 */
// eslint-disable-next-line react-refresh/only-export-components
export function useAdoptSharedFile(onAdopt, accept = 'any') {
  const { file, token } = useSharedFile();
  const seenToken = useRef(-1);
  const cb = useRef(onAdopt);

  // 렌더 중에 ref 를 쓰면 안 되므로 effect 로 갱신한다.
  // (매 렌더 실행 — 항상 최신 콜백을 들고 있게 하려는 것이 목적)
  useEffect(() => {
    cb.current = onAdopt;
  });

  useEffect(() => {
    if (!file) return;
    if (token === seenToken.current) return;
    seenToken.current = token;

    const isPdf = file.type === 'application/pdf';
    const isImage = !!file.type?.startsWith('image/');
    const ok =
      accept === 'any' ||
      (accept === 'pdf' && isPdf) ||
      (accept === 'image' && isImage) ||
      (accept === 'pdf-or-image' && (isPdf || isImage));

    if (ok) cb.current(file);
  }, [file, token, accept]);
}
