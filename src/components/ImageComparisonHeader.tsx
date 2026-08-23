import React, { useState } from 'react';
import { 
  ZoomIn, 
  ZoomOut, 
  RotateCw, 
  Maximize2, 
  ChevronLeft, 
  ChevronRight, 
  Eye, 
  EyeOff, 
  FileText,
  Sparkles,
  Layers
} from 'lucide-react';

interface ImageComparisonHeaderProps {
  images: Array<{ id?: string; base64: string; name?: string }>;
  rawText?: string;
  title?: string;
  subtitle?: string;
}

export const ImageComparisonHeader: React.FC<ImageComparisonHeaderProps> = ({
  images,
  rawText,
  title = 'معاينة ومطابقة الوثيقة الأصلية',
  subtitle = 'طابق الأصناف المستخرجة أدناه مع الصورة أو النص الأصلي مباشرة للتأكد من الدقة'
}) => {
  const [activeImageIdx, setActiveImageIdx] = useState(0);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [isExpanded, setIsExpanded] = useState(true);
  const [showFullModal, setShowFullModal] = useState(false);
  const [rotation, setRotation] = useState(0);

  const hasImages = images && images.length > 0;
  const currentImg = hasImages ? images[activeImageIdx] : null;

  if (!hasImages && !rawText) return null;

  const handleZoomIn = () => setZoomLevel(prev => Math.min(prev + 0.3, 3.0));
  const handleZoomOut = () => setZoomLevel(prev => Math.max(prev - 0.3, 0.7));
  const handleResetZoom = () => {
    setZoomLevel(1);
    setRotation(0);
  };
  const handleRotate = () => setRotation(prev => (prev + 90) % 360);

  return (
    <div className="bg-slate-900 border border-teal-500/30 rounded-3xl overflow-hidden shadow-xl shadow-black/20 mb-5">
      {/* Header bar */}
      <div className="px-5 py-3.5 bg-gradient-to-r from-teal-950/60 to-slate-900 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-teal-500/10 border border-teal-500/30 flex items-center justify-center text-teal-400">
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <span>{title}</span>
              {hasImages && images.length > 1 && (
                <span className="px-2 py-0.5 rounded-full bg-teal-500/20 text-teal-300 text-[11px] font-mono">
                  {activeImageIdx + 1} من {images.length} صور
                </span>
              )}
            </h3>
            <p className="text-[11px] text-slate-400">{subtitle}</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {hasImages && isExpanded && (
            <div className="flex items-center gap-1 bg-slate-950/80 p-1 rounded-xl border border-slate-800">
              <button
                type="button"
                onClick={handleZoomIn}
                title="تكبير الصورة"
                className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-300 hover:text-teal-400 transition-colors"
              >
                <ZoomIn className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={handleZoomOut}
                title="تصغير الصورة"
                className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-300 hover:text-teal-400 transition-colors"
              >
                <ZoomOut className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={handleRotate}
                title="تدوير الصورة"
                className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-300 hover:text-teal-400 transition-colors"
              >
                <RotateCw className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setShowFullModal(true)}
                title="تكبير بملء الشاشة"
                className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-300 hover:text-teal-400 transition-colors"
              >
                <Maximize2 className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          <button
            type="button"
            onClick={() => setIsExpanded(!isExpanded)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold transition-all cursor-pointer"
          >
            {isExpanded ? (
              <>
                <EyeOff className="w-3.5 h-3.5 text-slate-400" />
                <span>إخفاء الصورة</span>
              </>
            ) : (
              <>
                <Eye className="w-3.5 h-3.5 text-teal-400" />
                <span>إظهار الصورة للمطابقة</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Expandable Image / Text Preview Box */}
      {isExpanded && (
        <div className="p-4 bg-slate-950/60 flex flex-col items-center">
          {hasImages && currentImg ? (
            <div className="w-full space-y-3">
              {/* Image pagination if multiple */}
              {images.length > 1 && (
                <div className="flex items-center justify-center gap-2 overflow-x-auto py-1">
                  {images.map((img, idx) => (
                    <button
                      key={img.id || idx}
                      type="button"
                      onClick={() => {
                        setActiveImageIdx(idx);
                        handleResetZoom();
                      }}
                      className={`px-3 py-1 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                        activeImageIdx === idx
                          ? 'bg-teal-500 text-slate-950 shadow-md shadow-teal-500/20'
                          : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800'
                      }`}
                    >
                      <Layers className="w-3 h-3" />
                      <span>صورة {idx + 1}</span>
                    </button>
                  ))}
                </div>
              )}

              {/* Main image container */}
              <div className="relative w-full max-h-72 sm:max-h-80 overflow-auto rounded-2xl bg-black/50 border border-slate-800 flex items-center justify-center p-2">
                <img
                  src={currentImg.base64}
                  alt={currentImg.name || 'Original document'}
                  style={{
                    transform: `scale(${zoomLevel}) rotate(${rotation}deg)`,
                    transformOrigin: 'center center',
                    transition: 'transform 0.2s ease-out'
                  }}
                  className="max-h-64 sm:max-h-72 w-auto object-contain rounded-lg shadow-2xl"
                />

                {/* Left/Right Floating Navigation if multiple images */}
                {images.length > 1 && (
                  <>
                    <button
                      type="button"
                      onClick={() => setActiveImageIdx(prev => (prev > 0 ? prev - 1 : images.length - 1))}
                      className="absolute right-3 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-slate-900/80 hover:bg-slate-900 text-white border border-slate-700 flex items-center justify-center cursor-pointer shadow-lg"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveImageIdx(prev => (prev < images.length - 1 ? prev + 1 : 0))}
                      className="absolute left-3 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-slate-900/80 hover:bg-slate-900 text-white border border-slate-700 flex items-center justify-center cursor-pointer shadow-lg"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                  </>
                )}
              </div>
            </div>
          ) : rawText ? (
            <div className="w-full bg-slate-900/90 border border-slate-800 rounded-2xl p-3.5 max-h-48 overflow-y-auto">
              <div className="flex items-center gap-2 text-xs font-bold text-teal-400 mb-1.5">
                <FileText className="w-3.5 h-3.5" />
                <span>النص الأصلي المكتوب للطلب:</span>
              </div>
              <pre className="text-xs font-mono text-slate-300 whitespace-pre-wrap leading-relaxed">
                {rawText}
              </pre>
            </div>
          ) : null}
        </div>
      )}

      {/* Fullscreen modal */}
      {showFullModal && hasImages && currentImg && (
        <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex flex-col p-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <h4 className="text-white font-bold text-sm">
              معاينة الوثيقة الأصلية كاملة (صورة {activeImageIdx + 1} من {images.length})
            </h4>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleZoomIn}
                className="px-3 py-1.5 rounded-xl bg-slate-800 text-white text-xs font-bold flex items-center gap-1"
              >
                <ZoomIn className="w-3.5 h-3.5" />
                <span>تكبير</span>
              </button>
              <button
                type="button"
                onClick={handleRotate}
                className="px-3 py-1.5 rounded-xl bg-slate-800 text-white text-xs font-bold flex items-center gap-1"
              >
                <RotateCw className="w-3.5 h-3.5" />
                <span>تدوير</span>
              </button>
              <button
                type="button"
                onClick={() => setShowFullModal(false)}
                className="px-4 py-1.5 rounded-xl bg-rose-500 hover:bg-rose-600 text-white text-xs font-bold"
              >
                إغلاق
              </button>
            </div>
          </div>
          <div className="flex-1 overflow-auto flex items-center justify-center p-4">
            <img
              src={currentImg.base64}
              alt="Fullscreen original"
              style={{
                transform: `scale(${zoomLevel}) rotate(${rotation}deg)`
              }}
              className="max-h-[85vh] max-w-full object-contain rounded-xl"
            />
          </div>
        </div>
      )}
    </div>
  );
};
