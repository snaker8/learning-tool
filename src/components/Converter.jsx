import { useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowRight, FileText, Image as ImageIcon } from 'lucide-react';
import PdfToImage from './PdfToImage';
import ImageToPdf from './ImageToPdf';

const MODES = [
    { id: 'pdf2img', label: 'PDF', label2: '이미지', From: FileText, To: ImageIcon },
    { id: 'img2pdf', label: '이미지', label2: 'PDF', From: ImageIcon, To: FileText },
];

export default function Converter() {
    const [mode, setMode] = useState('pdf2img');

    return (
        <div className="flex-1 flex flex-col overflow-hidden">
            {/* Mode switcher */}
            <div className="px-8 pt-6 pb-2 shrink-0">
                <div className="inline-flex items-center gap-1 p-1 rounded-xl glass">
                    {MODES.map(({ id, label, label2, From, To }) => {
                        const isActive = mode === id;
                        return (
                            <button
                                key={id}
                                onClick={() => setMode(id)}
                                className={`relative press flex items-center gap-2.5 px-4 py-2 rounded-lg text-[12.5px] font-medium transition-colors ${
                                    isActive ? 'text-amber-200' : 'text-zinc-400 hover:text-zinc-100'
                                }`}
                            >
                                {isActive && (
                                    <motion.span
                                        layoutId="convert-mode"
                                        className="absolute inset-0 rounded-lg bg-amber-400/[0.08] border border-amber-400/25"
                                        style={{
                                            boxShadow:
                                                'inset 0 1px 0 rgba(252, 211, 77, 0.12), 0 0 18px -6px rgba(251, 191, 36, 0.45)',
                                        }}
                                        transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                                    />
                                )}
                                <From className="w-3.5 h-3.5 relative z-10" strokeWidth={2} />
                                <span className="relative z-10">{label}</span>
                                <ArrowRight className="w-3 h-3 relative z-10 opacity-60" strokeWidth={2.25} />
                                <To className="w-3.5 h-3.5 relative z-10" strokeWidth={2} />
                                <span className="relative z-10">{label2}</span>
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Active panel */}
            <div className="flex-1 overflow-hidden">
                {mode === 'pdf2img' ? <PdfToImage /> : <ImageToPdf />}
            </div>
        </div>
    );
}
