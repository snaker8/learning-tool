import React, { createContext, useContext, useState, useCallback, useRef } from 'react';
import { v4 as uuidv4 } from 'uuid';

const CropContext = createContext();

// eslint-disable-next-line react-refresh/only-export-components
export function useCropContext() {
    return useContext(CropContext);
}

export function CropProvider({ children }) {
    const [crops, setCrops] = useState([]);
    // 페이지별 AI 검출 결과(후보). 좌표는 캔버스 크기에 독립적인 0~1 비율로 보관해
    // 확대/해상도가 바뀌어도 그대로 쓴다. { [pageNum]: [{x,y,width,height,label}] }
    // 한 번 누른 페이지를 다시 호출하지 않게 하는 것이 목적이다 (호출 1회 = 약 ₩6).
    const [detections, setDetections] = useState({});
    const [selectedCropId, setSelectedCropId] = useState(null);
    const [settings, setSettings] = useState({
        copyWidth: 1200,
        maxHeight: 1600,
        useMaxHeight: false,
        // 병합 가로폭 — 크롭 원본(ImageGenerator.MAX_WIDTH = 1600px)과 맞춘다.
        // 800px 이던 때는 모든 크롭을 절반으로 줄여 붙여서, 개별 복사(1200px)보다
        // 눈에 띄게 뭉개졌다 (2026-10-07 확인). 줄이려면 여기가 아니라 사이드바에서.
        mergeWidth: 1600,
        mergeGap: 800,
        renderScale: 3.0, // PDF 렌더링 해상도 (1.0 ~ 6.0)
        // 드래그했을 때 인식된 문제 경계로 맞출지. 끄면 그린 그대로 잘린다
        // (한 문제를 정밀하게 잡거나, 그림·표만 떼어낼 때)
        snapToProblem: true
    });

    const updateSettings = useCallback((updates) => {
        setSettings(prev => ({ ...prev, ...updates }));
    }, []);

    const addCrop = useCallback((cropData) => {
        const newCrop = {
            id: uuidv4(),
            ...cropData,
        };
        setCrops(prev => [...prev, newCrop]);
        return newCrop.id;
    }, []);

    const revokeCropUrls = (crop) => {
        for (const url of [crop?.imageUrl, crop?.thumbUrl]) {
            if (typeof url === 'string' && url.startsWith('blob:')) URL.revokeObjectURL(url);
        }
    };

    const removeCrop = useCallback((id) => {
        setCrops(prev => {
            revokeCropUrls(prev.find(c => c.id === id));
            return prev.filter(c => c.id !== id);
        });
        if (selectedCropId === id) setSelectedCropId(null);
    }, [selectedCropId]);

    const updateCrop = useCallback((id, updates) => {
        setCrops(prev => prev.map(c => {
            if (c.id !== id) return c;
            // 이미지가 새로 만들어졌으면 이전 blob 을 반드시 반납한다.
            // (크롭 이동·크기조절·방향키 이동마다 새 이미지가 생기는데, 예전엔
            //  옛 URL 을 놔둬서 작업할수록 메모리가 쌓였다 — 2026-10-06)
            for (const key of ['imageUrl', 'thumbUrl']) {
                const next = updates[key];
                const prevUrl = c[key];
                if (next && prevUrl && next !== prevUrl &&
                    typeof prevUrl === 'string' && prevUrl.startsWith('blob:')) {
                    URL.revokeObjectURL(prevUrl);
                }
            }
            return { ...c, ...updates };
        }));
    }, []);

    const setPageDetections = useCallback((pageNum, boxes) => {
        setDetections(prev => ({ ...prev, [pageNum]: boxes }));
    }, []);

    const clearPageDetections = useCallback((pageNum) => {
        setDetections(prev => {
            if (!(pageNum in prev)) return prev;
            const next = { ...prev };
            delete next[pageNum];
            return next;
        });
    }, []);

    const clearCrops = useCallback(() => {
        setCrops(prev => {
            prev.forEach(revokeCropUrls);
            return [];
        });
        setSelectedCropId(null);
        setDetections({});
    }, []);

    const reorderCrops = useCallback((newCrops) => {
        setCrops(newCrops);
    }, []);

    // 자동 정렬 (일괄 자동 인식 후 호출됨).
    // 우선순위:
    //   1) AI가 label("01", "10" 등)을 반환한 경우 → 페이지×번호 순
    //   2) label 없으면 → 페이지×y(같으면 x) 순 (2단 레이아웃 보정)
    const sortCrops = useCallback(() => {
        setCrops(prev => {
            const parseLabel = (l) => {
                if (!l) return NaN;
                const m = String(l).match(/\d+/);
                return m ? parseInt(m[0], 10) : NaN;
            };
            const haveLabels = prev.length > 0 && prev.every(c => Number.isFinite(parseLabel(c.label)));
            if (haveLabels) {
                return [...prev].sort((a, b) => {
                    if (a.pageNum !== b.pageNum) return a.pageNum - b.pageNum;
                    return parseLabel(a.label) - parseLabel(b.label);
                });
            }
            return [...prev].sort((a, b) => {
                if (a.pageNum !== b.pageNum) return a.pageNum - b.pageNum;
                // 행이 거의 같으면(50px 이내) x 순(열 순), 아니면 y 순
                if (Math.abs(a.y - b.y) < 50) return a.x - b.x;
                return a.y - b.y;
            });
        });
    }, []);

    // 복사 피드백 — 캔버스 클릭이든 사이드바 클릭이든 어디서든 호출하면
    // 해당 크롭에 "복사됨" 표시가 잠깐 떴다가 사라진다.
    const [copiedCropId, setCopiedCropId] = useState(null);
    const copiedTimerRef = useRef(null);
    const markCopied = useCallback((id) => {
        if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
        setCopiedCropId(id);
        copiedTimerRef.current = setTimeout(() => {
            setCopiedCropId(null);
            copiedTimerRef.current = null;
        }, 1200);
    }, []);

    return (
        <CropContext.Provider value={{
            crops,
            detections,
            setPageDetections,
            clearPageDetections,
            addCrop,
            removeCrop,
            updateCrop,
            clearCrops,
            reorderCrops,
            sortCrops,
            selectedCropId,
            setSelectedCropId,
            copiedCropId,
            markCopied,
            settings,
            updateSettings
        }}>
            {children}
        </CropContext.Provider>
    );
}
