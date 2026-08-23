import React, { useState, useEffect } from 'react';
import { useBackgroundAnalysis } from '../context/BackgroundAnalysisContext';
import { 
  Sparkles, 
  CheckCircle2, 
  AlertCircle, 
  Loader2, 
  ArrowLeft, 
  X, 
  Layers, 
  FileText, 
  Receipt, 
  ShoppingCart, 
  ChevronDown, 
  ChevronUp, 
  Activity, 
  Clock, 
  Terminal, 
  Check, 
  Zap, 
  Eye
} from 'lucide-react';

interface BackgroundProcessingBannerProps {
  onNavigate: (tab: string, id?: string) => void;
}

export const BackgroundProcessingBanner: React.FC<BackgroundProcessingBannerProps> = ({ onNavigate }) => {
  const { activeTask, isBannerVisible, dismissBanner, clearTask } = useBackgroundAnalysis();
  const [isMinimized, setIsMinimized] = useState(false);
  const [showDetailedLogs, setShowDetailedLogs] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  // Timer counter
  useEffect(() => {
    if (!activeTask || activeTask.status !== 'processing') {
      return;
    }
    const interval = setInterval(() => {
      const sec = Math.floor((Date.now() - activeTask.startedAt) / 1000);
      setElapsedSeconds(sec);
    }, 1000);
    return () => clearInterval(interval);
  }, [activeTask?.startedAt, activeTask?.status]);

  if (!activeTask || !isBannerVisible) return null;

  const getTaskIcon = () => {
    switch (activeTask.type) {
      case 'order':
        return <ShoppingCart className="w-4 h-4 text-teal-400" />;
      case 'invoice':
        return <Receipt className="w-4 h-4 text-emerald-400" />;
      case 'document':
      default:
        return <FileText className="w-4 h-4 text-cyan-400" />;
    }
  };

  const handleOpenResults = () => {
    onNavigate(activeTask.targetTab);
  };

  const isCompleted = activeTask.status === 'completed';
  const isError = activeTask.status === 'error';
  const isProcessing = activeTask.status === 'processing';

  return (
    <aside 
      aria-label="شريط معالجة واستخراج النصوص الذكية"
      className="fixed top-3 left-3 right-3 sm:left-auto sm:right-6 sm:max-w-lg z-50 transition-all duration-300 animate-in slide-in-from-top-4"
      dir="rtl"
    >
      <div className={`rounded-3xl border shadow-2xl backdrop-blur-2xl transition-all duration-300 overflow-hidden ${
        isCompleted
          ? 'bg-slate-900/95 border-emerald-500/50 shadow-emerald-950/60 ring-1 ring-emerald-500/30'
          : isError
          ? 'bg-slate-900/95 border-rose-500/50 shadow-rose-950/60 ring-1 ring-rose-500/20'
          : 'bg-slate-900/95 border-teal-500/40 shadow-teal-950/60 ring-1 ring-teal-500/20'
      }`}>
        
        {/* Top Mini Progress Header Line */}
        <div className="w-full h-1.5 bg-slate-800/80 overflow-hidden relative">
          <div 
            className={`h-full transition-all duration-500 rounded-full ${
              isCompleted 
                ? 'bg-gradient-to-r from-emerald-500 via-teal-400 to-emerald-300 w-full' 
                : isError
                ? 'bg-rose-500 w-full'
                : 'bg-gradient-to-r from-teal-500 via-cyan-400 to-indigo-400 animate-pulse'
            }`}
            style={{ width: `${Math.max(activeTask.progress, 5)}%` }}
          />
        </div>

        {/* Header Bar */}
        <div className="p-3.5 sm:p-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            {/* Status Icon with Glowing Badge */}
            <div className="relative shrink-0">
              <div className={`w-10 h-10 rounded-2xl flex items-center justify-center transition-all ${
                isCompleted
                  ? 'bg-emerald-500/20 text-emerald-300 ring-1 ring-emerald-500/40'
                  : isError
                  ? 'bg-rose-500/20 text-rose-300 ring-1 ring-rose-500/40'
                  : 'bg-teal-500/20 text-teal-300 ring-1 ring-teal-500/40'
              }`}>
                {isProcessing && (
                  <Loader2 className="w-5 h-5 animate-spin text-teal-400" />
                )}
                {isCompleted && (
                  <CheckCircle2 className="w-5 h-5 text-emerald-400 animate-bounce" />
                )}
                {isError && (
                  <AlertCircle className="w-5 h-5 text-rose-400" />
                )}
              </div>
              
              {isProcessing && (
                <span className="absolute -bottom-1 -left-1 flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-teal-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-teal-500"></span>
                </span>
              )}
            </div>

            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h4 className="text-xs sm:text-sm font-black text-white truncate">
                  {activeTask.title}
                </h4>
                {/* Live Real-time Percentage Tag */}
                <span className={`px-2 py-0.5 rounded-full text-[11px] font-black font-mono tracking-wider shrink-0 ${
                  isCompleted
                    ? 'bg-emerald-500/30 text-emerald-300 border border-emerald-500/40'
                    : isError
                    ? 'bg-rose-500/30 text-rose-300 border border-rose-500/40'
                    : 'bg-teal-500/30 text-teal-200 border border-teal-500/40 animate-pulse'
                }`}>
                  {activeTask.progress}%
                </span>
              </div>

              <div className="flex items-center gap-2 mt-0.5 text-[11px] text-slate-400 truncate">
                <span className="truncate max-w-[200px] sm:max-w-[260px] text-slate-300">
                  {isProcessing ? activeTask.currentStep : activeTask.resultSummary || activeTask.subtitle}
                </span>
                {isProcessing && elapsedSeconds > 0 && (
                  <span className="font-mono text-[10px] text-slate-500 shrink-0 flex items-center gap-0.5">
                    <Clock className="w-3 h-3 text-teal-400" />
                    {elapsedSeconds}ث
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Header Action Buttons */}
          <div className="flex items-center gap-1.5 shrink-0">
            {isCompleted && (
              <button
                type="button"
                onClick={handleOpenResults}
                className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-black text-xs flex items-center gap-1 shadow-lg shadow-emerald-500/20 cursor-pointer transition-all active:scale-95 animate-pulse"
              >
                <span>معاينة النتيجة</span>
                <ArrowLeft className="w-3.5 h-3.5" />
              </button>
            )}

            <button
              type="button"
              onClick={() => setIsMinimized(!isMinimized)}
              className="p-1.5 text-slate-400 hover:text-slate-200 rounded-xl hover:bg-slate-800/80 transition-colors"
              title={isMinimized ? 'توسيع' : 'تصغير'}
            >
              {isMinimized ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
            </button>

            <button
              type="button"
              onClick={dismissBanner}
              className="p-1.5 text-slate-400 hover:text-slate-200 rounded-xl hover:bg-slate-800/80 transition-colors"
              title="إخفاء الإشعار"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Expanded Progress Breakdown */}
        {!isMinimized && (
          <div className="px-3.5 pb-3.5 sm:px-4 sm:pb-4 space-y-3 border-t border-slate-800/80 pt-3">
            
            {/* Real Multi-Stage Breadcrumb / Stepper */}
            {activeTask.stages && activeTask.stages.length > 0 && (
              <div className="grid grid-cols-4 gap-1.5 bg-slate-950/60 p-1.5 rounded-2xl border border-slate-800/60">
                {activeTask.stages.map(stg => {
                  const isStgDone = stg.status === 'completed';
                  const isStgActive = stg.status === 'in_progress';
                  return (
                    <div 
                      key={stg.id}
                      className={`p-1.5 rounded-xl text-center transition-all flex flex-col items-center justify-center gap-0.5 ${
                        isStgDone
                          ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                          : isStgActive
                          ? 'bg-teal-500/20 text-teal-200 border border-teal-500/40 shadow-sm shadow-teal-500/20'
                          : 'bg-slate-900/40 text-slate-500 border border-slate-800/40'
                      }`}
                    >
                      <div className="flex items-center justify-center">
                        {isStgDone ? (
                          <Check className="w-3 h-3 text-emerald-400" />
                        ) : isStgActive ? (
                          <Loader2 className="w-3 h-3 text-teal-400 animate-spin" />
                        ) : (
                          <span className="text-[10px] font-mono font-bold text-slate-500">{stg.id}</span>
                        )}
                      </div>
                      <span className="text-[9px] font-black leading-tight truncate w-full">
                        {stg.label.split(' ')[0]}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Current Step Description & Progress Meter */}
            {isProcessing && (
              <div className="space-y-1.5 bg-teal-950/20 p-2.5 rounded-2xl border border-teal-500/20">
                <div className="flex items-center justify-between text-[11px] font-bold">
                  <span className="text-teal-300 flex items-center gap-1.5">
                    <Activity className="w-3.5 h-3.5 animate-pulse text-teal-400" />
                    {activeTask.currentStep}
                  </span>
                  <span className="font-mono text-teal-400 text-xs font-black">{activeTask.progress}%</span>
                </div>
                
                {/* Progress Bar with Shimmer Animation */}
                <div className="w-full h-2 bg-slate-950 rounded-full overflow-hidden p-0.5 border border-slate-800/60">
                  <div 
                    className="h-full bg-gradient-to-r from-teal-500 via-emerald-400 to-cyan-300 rounded-full transition-all duration-300 relative overflow-hidden"
                    style={{ width: `${activeTask.progress}%` }}
                  >
                    <div className="absolute inset-0 bg-white/20 animate-[shimmer_2s_infinite] bg-gradient-to-r from-transparent via-white/30 to-transparent"></div>
                  </div>
                </div>
              </div>
            )}

            {/* Completion View */}
            {isCompleted && (
              <div className="flex items-center justify-between bg-emerald-950/40 border border-emerald-500/30 rounded-2xl p-2.5 text-xs text-emerald-300">
                <div className="flex items-center gap-2 min-w-0">
                  <Sparkles className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span className="text-[11px] font-bold truncate">
                    {activeTask.resultSummary || 'اكتملت المعالجة بنجاح! تم استخراج وتنقيح الأصناف.'}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={handleOpenResults}
                  className="px-2.5 py-1 rounded-xl bg-emerald-500 text-slate-950 font-black text-xs shrink-0 hover:bg-emerald-400 transition-colors shadow-sm"
                >
                  فتح الشاشة
                </button>
              </div>
            )}

            {/* Error View */}
            {isError && (
              <div className="p-2.5 bg-rose-950/40 border border-rose-500/30 rounded-2xl text-xs text-rose-300 space-y-1">
                <div className="flex items-center gap-1.5 font-bold">
                  <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                  <span>{activeTask.error || 'تعذر استخراج النصوص تلقائياً'}</span>
                </div>
                <p className="text-[10px] text-rose-400/80">
                  يمكنك إعادة المحاولة أو إدخال الأصناف يدوياً وتعديلها بسهولة.
                </p>
              </div>
            )}

            {/* Collapsible Live Log Stream */}
            {activeTask.logs && activeTask.logs.length > 0 && (
              <div className="pt-1">
                <button
                  type="button"
                  onClick={() => setShowDetailedLogs(!showDetailedLogs)}
                  className="w-full flex items-center justify-between text-[10px] text-slate-400 hover:text-slate-200 py-1 px-1.5 rounded-lg hover:bg-slate-800/40 transition-colors"
                >
                  <span className="flex items-center gap-1">
                    <Terminal className="w-3 h-3 text-teal-400" />
                    سجل المعالجة الحية ({activeTask.logs.length} أحداث)
                  </span>
                  <span>{showDetailedLogs ? 'إخفاء' : 'عرض السجل'}</span>
                </button>

                {showDetailedLogs && (
                  <div className="mt-1.5 max-h-32 overflow-y-auto space-y-1 p-2 bg-slate-950/80 rounded-xl border border-slate-800/80 font-mono text-[10px]">
                    {activeTask.logs.map(log => (
                      <div key={log.id} className="flex items-start gap-1.5 leading-tight">
                        <span className="text-slate-500 shrink-0">{log.timestamp}</span>
                        <span className={`shrink-0 ${
                          log.percent === 100 ? 'text-emerald-400' : 'text-teal-400'
                        }`}>
                          [{log.percent}%]
                        </span>
                        <span className={`truncate ${
                          log.type === 'success' ? 'text-emerald-300' : log.type === 'warn' ? 'text-amber-300' : 'text-slate-300'
                        }`}>
                          {log.message}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

          </div>
        )}
      </div>
    </aside>
  );
};
