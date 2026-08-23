import React, { useState } from 'react';
import { 
  AlertTriangle, 
  Check, 
  Plus, 
  Edit3, 
  ArrowLeft, 
  Sparkles, 
  HelpCircle,
  CheckCircle2,
  X,
  Tag,
  BookmarkPlus
} from 'lucide-react';
import { Medicine } from '../types';
import { Storage } from '../data/storage';
import { SimilarityConflict } from '../utils/similarity';

export type { SimilarityConflict };

interface SimilarityResolutionModalProps {
  conflicts: SimilarityConflict[];
  isOpen: boolean;
  onResolve: (resolutions: Map<string, { action: 'merge_existing' | 'create_new' | 'custom_name'; chosenName: string; medicineId?: string; aliasToAdd?: string }>) => void;
  onClose?: () => void;
  onCancel?: () => void;
  knownMedicines?: Medicine[];
}

export const SimilarityResolutionModal: React.FC<SimilarityResolutionModalProps> = ({
  conflicts,
  isOpen,
  onResolve,
  onClose,
  onCancel
}) => {
  const handleClose = () => {
    if (onCancel) onCancel();
    else if (onClose) onClose();
  };
  const [currentIndex, setCurrentIndex] = useState(0);
  const [resolutions, setResolutions] = useState<Map<string, { action: 'merge_existing' | 'create_new' | 'custom_name'; chosenName: string; medicineId?: string; aliasToAdd?: string }>>(new Map());
  const [customNameInput, setCustomNameInput] = useState('');
  const [isEditingCustom, setIsEditingCustom] = useState(false);
  const [saveAsAliasCheck, setSaveAsAliasCheck] = useState(true);

  if (!isOpen || conflicts.length === 0) return null;

  const currentConflict = conflicts[currentIndex] || conflicts[0];
  const progressPercent = Math.round(((currentIndex + 1) / conflicts.length) * 100);

  const handleDecision = (action: 'merge_existing' | 'create_new' | 'custom_name', chosenName: string, medicineId?: string) => {
    const updated = new Map(resolutions);
    const aliasToAdd = (action === 'merge_existing' && saveAsAliasCheck) ? currentConflict.candidateName : undefined;

    // Automatically persist alias to storage if user chooses to link
    if (action === 'merge_existing' && medicineId && currentConflict.candidateName) {
      try {
        Storage.addAliasToMedicine(medicineId, currentConflict.candidateName);
      } catch (e) {
        console.warn('Could not save alias to storage:', e);
      }
    }

    updated.set(currentConflict.id, {
      action,
      chosenName: chosenName.trim(),
      medicineId,
      aliasToAdd
    });
    setResolutions(updated);

    if (currentIndex < conflicts.length - 1) {
      setCurrentIndex(prev => prev + 1);
      setIsEditingCustom(false);
      setCustomNameInput('');
    } else {
      // Finished all conflicts
      onResolve(updated);
    }
  };

  const handleApplyAllAsSame = () => {
    const updated = new Map(resolutions);
    conflicts.forEach(c => {
      if (c.existingMedicine.id && c.candidateName) {
        try {
          Storage.addAliasToMedicine(c.existingMedicine.id, c.candidateName);
        } catch (e) {
          console.warn('Could not save alias to storage:', e);
        }
      }
      updated.set(c.id, {
        action: 'merge_existing',
        chosenName: c.existingMedicine.name,
        medicineId: c.existingMedicine.id,
        aliasToAdd: c.candidateName
      });
    });
    onResolve(updated);
  };

  const handleApplyAllAsNew = () => {
    const updated = new Map(resolutions);
    conflicts.forEach(c => {
      updated.set(c.id, {
        action: 'create_new',
        chosenName: c.candidateName
      });
    });
    onResolve(updated);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4" dir="rtl">
      <div className="bg-slate-900 border border-amber-500/40 rounded-3xl w-full max-w-xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        {/* Modal Top Banner */}
        <div className="p-5 bg-gradient-to-r from-amber-950/70 via-slate-900 to-slate-900 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <span>تأكيد ومطابقة الأصناف المتشابهة</span>
                {conflicts.length > 1 && (
                  <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 text-xs font-mono">
                    {currentIndex + 1} من {conflicts.length}
                  </span>
                )}
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                تأكيد هل الاسم المكتوب يتبع صنفاً مسجلاً لحفظه كمرادف تلقائياً أم أنه صنف جديد
              </p>
            </div>
          </div>

          <button
            onClick={handleClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Progress bar if multiple */}
        {conflicts.length > 1 && (
          <div className="w-full bg-slate-950 h-1.5">
            <div 
              className="bg-gradient-to-r from-amber-500 to-teal-400 h-full transition-all duration-300"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        )}

        {/* Comparison Content */}
        <div className="p-6 space-y-5">
          
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            {/* New / Extracted Name Box */}
            <div className="p-4 rounded-2xl bg-slate-950/80 border border-teal-500/30 space-y-1.5">
              <span className="text-[11px] font-bold text-teal-400 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5" />
                الاسم المكتوب / المستخرج:
              </span>
              <p className="text-base font-bold text-white break-words">
                "{currentConflict.candidateName}"
              </p>
              {currentConflict.unitPrice && (
                <p className="text-xs text-slate-400">
                  السعر: <strong className="text-teal-400 font-mono">{currentConflict.unitPrice.toLocaleString()} ريال</strong>
                </p>
              )}
            </div>

            {/* Existing Medicine in Catalog Box */}
            <div className="p-4 rounded-2xl bg-slate-950/80 border border-amber-500/30 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-amber-400 flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  الصنف المسجل في قاعدة الأدوية:
                </span>
                <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 font-mono font-bold text-[11px]">
                  تشابه {Math.round(currentConflict.similarityScore * 100)}%
                </span>
              </div>
              <p className="text-base font-bold text-amber-200 break-words">
                "{currentConflict.existingMedicine.name}"
              </p>
              {currentConflict.existingMedicine.aliases && currentConflict.existingMedicine.aliases.length > 0 && (
                <div className="flex items-center gap-1 flex-wrap pt-1">
                  <span className="text-[10px] text-slate-400">مرادفات سابقة:</span>
                  {currentConflict.existingMedicine.aliases.slice(0, 2).map((al, idx) => (
                    <span key={idx} className="text-[10px] px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-300">
                      {al}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Core Question Prompt */}
          <div className="bg-slate-950/60 p-3.5 rounded-2xl border border-slate-800 text-center">
            <p className="text-xs sm:text-sm font-semibold text-slate-200 leading-relaxed">
              هل الاسم المستخرج <span className="text-teal-300 font-bold">"{currentConflict.candidateName}"</span> هو نفس الصنف المحفوظ <span className="text-amber-300 font-bold">"{currentConflict.existingMedicine.name}"</span>؟
            </p>
          </div>

          {/* Custom Name input if toggled */}
          {isEditingCustom && (
            <div className="p-3 bg-slate-950 rounded-2xl border border-slate-700 space-y-2">
              <label className="text-xs text-slate-300 font-bold block">
                أدخل الاسم المعياري الدقيق الذي ترغب في اعتماده:
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={customNameInput}
                  onChange={(e) => setCustomNameInput(e.target.value)}
                  placeholder="مثال: بندول اكسترا 500 ملجم"
                  className="flex-1 px-3.5 py-2 bg-slate-900 border border-slate-700 rounded-xl text-sm text-white focus:outline-none focus:border-teal-400"
                />
                <button
                  type="button"
                  disabled={!customNameInput.trim()}
                  onClick={() => handleDecision('custom_name', customNameInput)}
                  className="px-4 py-2 bg-teal-500 hover:bg-teal-400 text-slate-950 rounded-xl font-bold text-xs cursor-pointer disabled:opacity-50"
                >
                  حفظ واعتماد
                </button>
              </div>
            </div>
          )}

          {/* Action Choice Buttons */}
          <div className="space-y-2.5">
            {/* Option 1: Merge with existing & remember alias */}
            <button
              type="button"
              onClick={() => handleDecision('merge_existing', currentConflict.existingMedicine.name, currentConflict.existingMedicine.id)}
              className="w-full p-3.5 rounded-2xl bg-gradient-to-r from-teal-500/20 to-emerald-500/20 hover:from-teal-500/30 hover:to-emerald-500/30 border border-teal-500/40 text-teal-200 hover:text-white flex items-center justify-between font-bold text-sm transition-all cursor-pointer group text-right"
            >
              <div className="flex items-center gap-3 text-right">
                <div className="w-9 h-9 rounded-xl bg-teal-500/20 border border-teal-500/40 flex items-center justify-center text-teal-400 shrink-0 group-hover:scale-110 transition-transform">
                  <Check className="w-5 h-5" />
                </div>
                <div>
                  <span className="block text-white text-xs sm:text-sm font-bold">
                    نعم، هو نفس الصنف (اعتماد اسم الصنف المحفوظ وحفظ الاسم الجديد كمرادف دائم)
                  </span>
                  <span className="text-[11px] text-teal-300 font-normal block mt-0.5">
                    سيتم حفظ "{currentConflict.candidateName}" كاسم بديل للصنف "{currentConflict.existingMedicine.name}" ليتعرف عليه النظام دائماً
                  </span>
                </div>
              </div>
              <ArrowLeft className="w-4 h-4 text-teal-400 shrink-0 group-hover:-translate-x-1 transition-transform" />
            </button>

            {/* Option 2: Add as new medicine */}
            <button
              type="button"
              onClick={() => handleDecision('create_new', currentConflict.candidateName)}
              className="w-full p-3.5 rounded-2xl bg-slate-950 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 text-slate-300 hover:text-white flex items-center justify-between font-bold text-sm transition-all cursor-pointer group text-right"
            >
              <div className="flex items-center gap-3 text-right">
                <div className="w-9 h-9 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-300 shrink-0 group-hover:scale-110 transition-transform">
                  <Plus className="w-5 h-5" />
                </div>
                <div>
                  <span className="block text-slate-200 text-xs sm:text-sm font-bold">
                    لا، هذا صنف مختلف تماماً (إضافته كصنف مستقل جديد)
                  </span>
                  <span className="text-[11px] text-slate-400 font-normal block mt-0.5">
                    سيتم تسجيل "{currentConflict.candidateName}" كصنف جديد ومستقل في قاعدة الأدوية
                  </span>
                </div>
              </div>
              <ArrowLeft className="w-4 h-4 text-slate-400 shrink-0 group-hover:-translate-x-1 transition-transform" />
            </button>

            {/* Option 3: Edit Custom Name */}
            {!isEditingCustom && (
              <button
                type="button"
                onClick={() => {
                  setIsEditingCustom(true);
                  setCustomNameInput(currentConflict.candidateName);
                }}
                className="w-full py-2.5 rounded-xl text-xs text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 flex items-center justify-center gap-2 cursor-pointer transition-colors"
              >
                <Edit3 className="w-3.5 h-3.5" />
                <span>تعديل وتخصيص الاسم يدوياً</span>
              </button>
            )}
          </div>

          {/* Quick Apply All for bulk conflicts */}
          {conflicts.length > 1 && (
            <div className="pt-3 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
              <span>تطبيق سريع على الكل ({conflicts.length} أصناف):</span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleApplyAllAsSame}
                  className="px-2.5 py-1 rounded-lg bg-teal-500/10 hover:bg-teal-500/20 text-teal-300 border border-teal-500/30 cursor-pointer"
                >
                  اعتماد الكل كأصناف موجودة وحفظ المرادفات
                </button>
                <button
                  type="button"
                  onClick={handleApplyAllAsNew}
                  className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 cursor-pointer"
                >
                  إضافة الكل كأصناف جديدة
                </button>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
};
