import React, { createContext, useContext, useState, useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';

const CropContext = createContext();

export function useCropContext() {
    return useContext(CropContext);
}

export function CropProvider({ children }) {
    const [crops, setCrops] = useState([]);
    const [selectedCropId, setSelectedCropId] = useState(null);
    const [settings, setSettings] = useState({
        copyWidth: 1200,
        maxHeight: 1600,
        useMaxHeight: false,
        isGlobalMode: false,
        autoCrop: true,
        sensitivity: 30,
        mergeWidth: 800,
        mergeGap: 50,
        renderScale: 3.0  // PDF 렌더링 해상도 (1.0 ~ 6.0)
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

    const removeCrop = useCallback((id) => {
        setCrops(prev => prev.filter(c => c.id !== id));
        if (selectedCropId === id) setSelectedCropId(null);
    }, [selectedCropId]);

    const updateCrop = useCallback((id, updates) => {
        setCrops(prev => prev.map(c => c.id === id ? { ...c, ...updates } : c));
    }, []);

    const clearCrops = useCallback(() => {
        setCrops([]);
        setSelectedCropId(null);
    }, []);

    const reorderCrops = useCallback((newCrops) => {
        setCrops(newCrops);
    }, []);

    return (
        <CropContext.Provider value={{
            crops,
            addCrop,
            removeCrop,
            updateCrop,
            clearCrops,
            reorderCrops,
            selectedCropId,
            setSelectedCropId,
            settings,
            updateSettings
        }}>
            {children}
        </CropContext.Provider>
    );
}
