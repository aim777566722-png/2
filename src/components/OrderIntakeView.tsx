import React, { useState, useRef, useEffect } from 'react';
import { 
  Medicine, 
  PharmacyOrder, 
  OrderItem 
} from '../types';
import { 
  FileText, 
  Camera, 
  Upload, 
  Sparkles, 
  AlertCircle, 
  CheckCircle2, 
  Trash2, 
  Plus, 
  ArrowRight, 
  Info,
  Layers,
  Edit3,
  Check,
  RefreshCw,
  FileSpreadsheet,
  FileUp,
  Loader2
} from 'lucide-react';
import { useBackgroundAnalysis } from '../context/BackgroundAnalysisContext';

interface OrderIntakeProps {
  knownMedicines: Medicine[];
  onOrderApproved: (order: PharmacyOrder) => void;
  onCancel: () => void;
}

export const OrderIntakeView: React.FC<OrderIntakeProps> = ({
  knownMedicines,
  onOrderApproved,
  onCancel
}) => {
  const [activeTab, setActiveTab] = useState<'text' | 'image' | 'doc'>('text');
  const [pharmacyName, setPharmacyName] = useState('صيدلية النخبة المركزية');
  const [orderNumber, setOrderNumber] = useState(`ORD-${new Date().getFullYear()}-${Math.floor(100 + Math.random() * 900)}`);
  const [textInput, setTextInput] = useState(`4 بندول اكسترا\nزواجرا 50 4\nلوفر 10 عدد 5\n6 بندول اكسترا`);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageMime, setImageMime] = useState<string>('image/jpeg');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);

  // Review Stage State
  const [isReviewed, setIsReviewed] = useState(false);
  const [parsedItems, setParsedItems] = useState<OrderItem[]>([]);
  const [duplicateMergedNotes, setDuplicateMergedNotes] = useState<string[]>([]);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { activeTask, startOrderTask, clearActiveTask, clearTask } = useBackgroundAnalysis();

  // Restore background order parsing if completed or running
  useEffect(() => {
    if (activeTask && activeTask.type === 'order' && activeTask.status === 'completed' && activeTask.payload.parsedItems) {
      setParsedItems(activeTask.payload.parsedItems);
      if (activeTask.payload.pharmacyName) setPharmacyName(activeTask.payload.pharmacyName);
      if (activeTask.payload.orderNumber) setOrderNumber(activeTask.payload.orderNumber);
      setIsReviewed(true);
      setIsAnalyzing(false);
    } else if (activeTask && activeTask.type === 'order' && activeTask.status === 'processing') {
      setIsAnalyzing(true);
    }
  }, [activeTask]);

  // Quick Preset Prompts for testing
  const handlePreset = (preset: string) => {
    setTextInput(preset);
  };

  // Image Upload Handler
  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setImageMime(file.type || 'image/jpeg');
      const reader = new FileReader();
      reader.onload = () => {
        setImagePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  // Client-Side Smart Fallback Parser if offline or without key
  const fallbackRuleBasedParser = (rawText: string): OrderItem[] => {
    const lines = rawText.split('\n').map(l => l.trim()).filter(Boolean);
    const itemMap = new Map<string, { qty: number; rawTexts: string[]; isUncertain: boolean; note: string }>();

    lines.forEach(line => {
      let qty = 1;
      let cleaned = line;
      let isUncertain = false;
      let note = '';

      // Pattern 1: Starts with quantity (e.g. "4 بندول اكسترا")
      const startNumMatch = line.match(/^(\d+)\s*(?:عدد|علبة|شريط|باكيت)?\s*(.+)$/i);
      // Pattern 2: Ends with quantity or count (e.g. "بندول اكسترا 4" or "لوفر 10 عدد 5" or "زواجرا 50 4")
      const endCountMatch = line.match(/^(.+?)\s*(?:عدد|x|×)?\s*(\d+)$/i);

      if (startNumMatch && isNaN(Number(startNumMatch[2]))) {
        qty = parseInt(startNumMatch[1], 10);
        cleaned = startNumMatch[2].trim();
      } else if (endCountMatch) {
        cleaned = endCountMatch[1].trim();
        qty = parseInt(endCountMatch[2], 10);
      } else {
        isUncertain = true;
        note = 'الكمية غير واضحة (تم الافتراض 1 - يرجى المراجعة)';
      }

      // Normalization of name while keeping dosage (e.g. "زواجرا 50" -> "زواجرا 50 ملجم")
      let matchedName = cleaned;
      if (cleaned.includes('زواجرا 50') || cleaned.includes('zwagra 50')) {
        matchedName = 'زواجرا 50 ملجم';
      } else if (cleaned.includes('زواجرا 25')) {
        matchedName = 'زواجرا 25 ملجم';
      } else if (cleaned.includes('زواجرا 100')) {
        matchedName = 'زواجرا 100 ملجم';
      } else if (cleaned.includes('بندول') || cleaned.includes('بنادول') || cleaned.toLowerCase().includes('panadol')) {
        matchedName = 'بندول اكسترا';
      } else if (cleaned.includes('لوفر 10') || cleaned.includes('lover 10')) {
        matchedName = 'لوفر 10 ملجم';
      } else if (cleaned.includes('لوفر 5')) {
        matchedName = 'لوفر 5 ملجم';
      } else if (cleaned.includes('أوجمنتين') || cleaned.includes('اوغمنتين') || cleaned.toLowerCase().includes('augmentin')) {
        matchedName = 'أوجمنتين 1 جم';
      } else if (cleaned.includes('كونكور 5') || cleaned.toLowerCase().includes('concor 5')) {
        matchedName = 'كونكور 5 مجم';
      }

      // Duplicate handling & aggregation
      const existing = itemMap.get(matchedName);
      if (existing) {
        existing.qty += qty;
        existing.rawTexts.push(line);
        existing.note = `تم دمج تكرار الصنف (${existing.rawTexts.join(' + ')})`;
      } else {
        itemMap.set(matchedName, {
          qty,
          rawTexts: [line],
          isUncertain,
          note
        });
      }
    });

    const result: OrderItem[] = [];
    itemMap.forEach((val, name) => {
      const nameClean = String(name || '').trim().toLowerCase();
      const matchMed = knownMedicines.find(m => (m.name || '').trim().toLowerCase() === nameClean);
      result.push({
        id: `parsed-${Math.random().toString(36).substring(2, 9)}`,
        rawText: val.rawTexts.join(' | '),
        matchedMedicineName: name,
        matchedMedicineId: matchMed?.id,
        quantity: val.qty,
        unit: 'علبة/شريط',
        isUncertain: val.isUncertain,
        uncertaintyReason: val.isUncertain ? 'الكمية تحتاج لتأكيد' : undefined,
        notes: val.note
      });
    });

    return result;
  };

  // Main Analyze Function (Calling AI server endpoint with background execution)
  const handleAnalyzeOrder = async () => {
    setIsAnalyzing(true);
    setAnalysisError(null);

    try {
      const uploadedImages = imagePreview ? [{
        name: 'order-image.jpg',
        base64: imagePreview,
        mimeType: imageMime
      }] : [];

      await startOrderTask({
        orderText: textInput,
        uploadedImages,
        inputMode: activeTab === 'image' ? 'camera' : 'text',
        pharmacyName,
        orderNumber,
        knownMedicines,
        marketPrices: []
      });
    } catch (err: any) {
      console.warn('Using client-side smart parser due to network/server response:', err);
      const fallback = fallbackRuleBasedParser(textInput);
      setParsedItems(fallback);
      setIsReviewed(true);
      setIsAnalyzing(false);
    }
  };

  // Update item field during review
  const handleItemChange = (id: string, field: keyof OrderItem, value: any) => {
    setParsedItems(prev => prev.map(item => {
      if (item.id === id) {
        const updated = { ...item, [field]: value };
        if (field === 'quantity' && value > 0) {
          updated.isUncertain = false;
        }
        return updated;
      }
      return item;
    }));
  };

  // Delete item
  const handleDeleteItem = (id: string) => {
    setParsedItems(prev => prev.filter(item => item.id !== id));
  };

  // Add new manual row
  const handleAddRow = () => {
    const newItem: OrderItem = {
      id: `manual-${Date.now()}`,
      rawText: 'إدخال يدوي',
      matchedMedicineName: '',
      quantity: 1,
      unit: 'علبة',
      isUncertain: false
    };
    setParsedItems(prev => [...prev, newItem]);
  };

  // Approve & Save Order
  const handleApprove = () => {
    if (parsedItems.length === 0) {
      alert('يرجى إضافة صنف واحد على الأقل للطلب');
      return;
    }

    const order: PharmacyOrder = {
      id: `order-${Date.now()}`,
      orderNumber,
      pharmacyName,
      orderDate: new Date().toISOString().split('T')[0],
      status: 'reviewed',
      rawInputText: textInput,
      items: parsedItems,
      createdTimestamp: Date.now()
    };

    clearActiveTask();
    clearTask();
    onOrderApproved(order);
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <FileText className="w-6 h-6 text-teal-400" />
            <span>استقبال وتحليل طلب صيدلية</span>
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            إدخال نصي حر، تصوير الورقة المكتوبة بخط اليد، أو استيراد الملف مع تحليل ذكي للأصناف والكميات
          </p>
        </div>

        <button
          onClick={onCancel}
          className="text-xs text-slate-400 hover:text-slate-200 px-3 py-1.5 rounded-lg border border-slate-700 cursor-pointer"
        >
          إلغاء والعودة
        </button>
      </div>

      {/* Stage 1: Input & Extraction */}
      {!isReviewed ? (
        <div className="bg-slate-800/70 border border-slate-700/70 rounded-2xl p-6 space-y-6">
          {/* Pharmacy Name & Order Ref */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                اسم الصيدلية الطالبة
              </label>
              <input
                type="text"
                value={pharmacyName}
                onChange={e => setPharmacyName(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-teal-500"
                placeholder="مثال: صيدلية النخبة المركزية"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                رقم / مرجع الطلب
              </label>
              <input
                type="text"
                value={orderNumber}
                onChange={e => setOrderNumber(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-teal-500"
                placeholder="ORD-2026-..."
              />
            </div>
          </div>

          {/* Input Method Tabs */}
          <div className="flex border-b border-slate-700 gap-4">
            <button
              onClick={() => setActiveTab('text')}
              className={`pb-3 text-sm font-semibold flex items-center gap-2 border-b-2 transition-all cursor-pointer ${
                activeTab === 'text' 
                  ? 'border-teal-500 text-teal-400' 
                  : 'border-transparent text-slate-400 hover:text-slate-300'
              }`}
            >
              <FileText className="w-4 h-4" />
              <span>إدخال نصي حر (نص الطلب)</span>
            </button>

            <button
              onClick={() => setActiveTab('image')}
              className={`pb-3 text-sm font-semibold flex items-center gap-2 border-b-2 transition-all cursor-pointer ${
                activeTab === 'image' 
                  ? 'border-teal-500 text-teal-400' 
                  : 'border-transparent text-slate-400 hover:text-slate-300'
              }`}
            >
              <Camera className="w-4 h-4" />
              <span>تصوير / رفع صورة الطلب (OCR)</span>
            </button>

            <button
              onClick={() => setActiveTab('doc')}
              className={`pb-3 text-sm font-semibold flex items-center gap-2 border-b-2 transition-all cursor-pointer ${
                activeTab === 'doc' 
                  ? 'border-teal-500 text-teal-400' 
                  : 'border-transparent text-slate-400 hover:text-slate-300'
              }`}
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>استيراد مستند (PDF / Excel / Word)</span>
            </button>
          </div>

          {/* Tab Content 1: Free Text */}
          {activeTab === 'text' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-xs text-slate-400">
                  اكتب أو ألصق رسالة الطلب المرسلة من الصيدلية بأي ترتيب:
                </label>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-slate-500">أمثلة جاهزة للتجربة:</span>
                  <button
                    onClick={() => handlePreset("4 بندول اكسترا\nزواجرا 50 4\nلوفر 10 عدد 5")}
                    className="text-[11px] px-2 py-0.5 rounded bg-slate-900 text-teal-400 border border-slate-700 hover:bg-slate-800 cursor-pointer"
                  >
                    مثال القياس
                  </button>
                  <button
                    onClick={() => handlePreset("4 بندول اكسترا\n6 بندول اكسترا\nزواجرا 50")}
                    className="text-[11px] px-2 py-0.5 rounded bg-slate-900 text-amber-400 border border-slate-700 hover:bg-slate-800 cursor-pointer"
                  >
                    تكرار + غير مؤكد
                  </button>
                </div>
              </div>

              <textarea
                rows={6}
                value={textInput}
                onChange={e => setTextInput(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-xl p-4 text-sm text-slate-100 font-mono leading-relaxed focus:outline-none focus:border-teal-500"
                placeholder={`اكتب مثلاً:\n4 بندول اكسترا\nزواجرا 50 4\nلوفر 10 عدد 5`}
              />

              <div className="p-3 bg-slate-900/60 rounded-xl border border-slate-700/50 flex items-start gap-2.5 text-xs text-slate-400">
                <Info className="w-4 h-4 text-teal-400 shrink-0 mt-0.5" />
                <span>
                  <strong>ملاحظة هامة:</strong> النظام يفهم القوة كجزء من اسم الصنف (مثل <code>زواجرا 50 ملجم</code>) ويفهم الأرقام قبل أو بعد الاسم، ويدمج التكرارات تلقائياً.
                </span>
              </div>
            </div>
          )}

          {/* Tab Content 2: Image / OCR */}
          {activeTab === 'image' && (
            <div className="space-y-4">
              <div 
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-slate-700 hover:border-teal-500/50 rounded-2xl p-8 text-center bg-slate-900/40 cursor-pointer transition-colors"
              >
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  onChange={handleImageChange} 
                  accept="image/*" 
                  className="hidden" 
                />
                
                {imagePreview ? (
                  <div className="space-y-3">
                    <img 
                      src={imagePreview} 
                      alt="معاينة الطلب" 
                      className="max-h-64 mx-auto rounded-xl border border-slate-700 object-contain shadow-md" 
                    />
                    <p className="text-xs text-teal-400 font-medium">انقر لتغيير الصورة المحددة</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="w-12 h-12 rounded-full bg-teal-500/10 text-teal-400 flex items-center justify-center mx-auto">
                      <Camera className="w-6 h-6" />
                    </div>
                    <div className="text-sm font-semibold text-slate-200">
                      اضغط لتصوير الطلب الورقي أو رفع صورة من الجهاز
                    </div>
                    <p className="text-xs text-slate-400">
                      يدعم الخط اليدوي، الروشتات، والطلبات المطبوعة
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Tab Content 3: Document Import */}
          {activeTab === 'doc' && (
            <div className="p-8 border-2 border-dashed border-slate-700 rounded-2xl text-center bg-slate-900/40 space-y-3">
              <div className="w-12 h-12 rounded-full bg-amber-500/10 text-amber-400 flex items-center justify-center mx-auto">
                <FileSpreadsheet className="w-6 h-6" />
              </div>
              <div className="text-sm font-semibold text-slate-200">استيراد ملف طلبية (Excel / Word / PDF)</div>
              <p className="text-xs text-slate-400 max-w-md mx-auto">
                يقوم الذكاء الاصطناعي بقراءة الجداول وقوائم الأصناف والكميات واستخراجها مباشرة لقاعدة المقارنة.
              </p>
              <button
                onClick={() => {
                  setTextInput(`بندول اكسترا\t10\nزواجرا 50 ملجم\t8\nلوفر 10 ملجم\t5\nأوجمنتين 1 جم\t12`);
                  setActiveTab('text');
                }}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs rounded-xl border border-slate-700 cursor-pointer inline-flex items-center gap-2"
              >
                <FileUp className="w-4 h-4 text-teal-400" />
                <span>تجربة استيراد ملف جدول إكسل افتراضي</span>
              </button>
            </div>
          )}

          {/* Action Button */}
          <div className="pt-2 flex items-center justify-end gap-3">
            <button
              disabled={isAnalyzing || (!textInput && !imagePreview)}
              onClick={handleAnalyzeOrder}
              className="px-6 py-3 rounded-xl bg-teal-500 hover:bg-teal-400 text-slate-950 font-bold text-sm flex items-center gap-2 transition-all shadow-md disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              {isAnalyzing ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>جاري تحليل الأصناف والكميات بالذكاء الاصطناعي...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  <span>تحليل الطلب واستخراج الأصناف</span>
                </>
              )}
            </button>
          </div>
        </div>
      ) : (
        /* Stage 2: Order Review Before Approval (Screen 12 & 13) */
        <div className="bg-slate-800/70 border border-slate-700/70 rounded-2xl p-6 space-y-6">
          <div className="flex items-center justify-between border-b border-slate-700/70 pb-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-0.5 rounded-full bg-teal-500/20 text-teal-300 text-xs font-semibold border border-teal-500/30">
                  المرحلة 2: مراجعة الطلب قبل اعتماده
                </span>
                <span className="text-xs text-slate-400 font-mono">({parsedItems.length} أصناف مستخرجة)</span>
              </div>
              <h2 className="text-lg font-bold text-white mt-1">نتيجة التحليل الذكي للطلب</h2>
            </div>

            <button
              onClick={() => setIsReviewed(false)}
              className="text-xs text-slate-400 hover:text-slate-200 px-3 py-1.5 rounded-lg border border-slate-700 cursor-pointer"
            >
              تعديل النص المدخل
            </button>
          </div>

          {/* Uncertain Items Warning if any */}
          {parsedItems.some(i => i.isUncertain) && (
            <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
              <div className="text-xs space-y-1">
                <div className="font-bold text-amber-300">⚠️ هناك أصناف تحتاج مراجعة وتأكيد الكمية:</div>
                <div className="text-amber-200/80">
                  لم يتمكن النظام من الجزم بالكمية لبعض الأصناف لتفادي التخمين الخاطئ. يرجى مراجعة وتعديل الحقول المميزة باللون الأصفر.
                </div>
              </div>
            </div>
          )}

          {/* Editable Review Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead className="bg-slate-900/80 text-slate-400 border-b border-slate-700">
                <tr>
                  <th className="py-3 px-4">النص الأصلي</th>
                  <th className="py-3 px-4">اسم الصنف المعتمد (مع القوة)</th>
                  <th className="py-3 px-4 w-28">الكمية</th>
                  <th className="py-3 px-4 w-24">الوحدة</th>
                  <th className="py-3 px-4">الملاحظات والتطابق</th>
                  <th className="py-3 px-4 text-center w-16">حذف</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/50">
                {parsedItems.map((item) => (
                  <tr 
                    key={item.id}
                    className={`transition-colors ${
                      item.isUncertain ? 'bg-amber-950/20' : 'hover:bg-slate-900/40'
                    }`}
                  >
                    {/* Raw Text */}
                    <td className="py-3 px-4 text-slate-400 font-mono text-[11px]">
                      {item.rawText}
                    </td>

                    {/* Matched Name */}
                    <td className="py-3 px-4">
                      <input
                        type="text"
                        value={item.matchedMedicineName}
                        onChange={e => handleItemChange(item.id, 'matchedMedicineName', e.target.value)}
                        className="w-full bg-slate-900/90 border border-slate-700 focus:border-teal-500 rounded-lg px-2.5 py-1.5 text-xs text-slate-100 font-medium"
                      />
                    </td>

                    {/* Quantity */}
                    <td className="py-3 px-4">
                      <div className="relative">
                        <input
                          type="number"
                          min="1"
                          value={item.quantity}
                          onChange={e => handleItemChange(item.id, 'quantity', parseInt(e.target.value, 10) || 1)}
                          className={`w-full bg-slate-900/90 border rounded-lg px-2.5 py-1.5 text-xs text-center font-bold ${
                            item.isUncertain 
                              ? 'border-amber-500 text-amber-300' 
                              : 'border-slate-700 text-teal-400 focus:border-teal-500'
                          }`}
                        />
                      </div>
                    </td>

                    {/* Unit */}
                    <td className="py-3 px-4">
                      <input
                        type="text"
                        value={item.unit || 'علبة'}
                        onChange={e => handleItemChange(item.id, 'unit', e.target.value)}
                        className="w-full bg-slate-900/90 border border-slate-700 focus:border-teal-500 rounded-lg px-2 py-1.5 text-xs text-slate-300 text-center"
                      />
                    </td>

                    {/* Notes & Status */}
                    <td className="py-3 px-4">
                      {item.notes ? (
                        <span className="text-[11px] text-teal-400 bg-teal-500/10 px-2 py-0.5 rounded border border-teal-500/20">
                          {item.notes}
                        </span>
                      ) : item.isUncertain ? (
                        <span className="text-[11px] text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
                          {item.uncertaintyReason || 'تحتاج تأكيد'}
                        </span>
                      ) : (
                        <span className="text-[11px] text-slate-400">
                          مطابق للقاعدة
                        </span>
                      )}
                    </td>

                    {/* Delete */}
                    <td className="py-3 px-4 text-center">
                      <button
                        onClick={() => handleDeleteItem(item.id)}
                        className="p-1 text-slate-500 hover:text-rose-400 rounded transition-colors cursor-pointer"
                        title="حذف الصنف"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Add Row Button */}
          <div className="flex items-center justify-between pt-2">
            <button
              onClick={handleAddRow}
              className="text-xs text-teal-400 hover:text-teal-300 font-semibold flex items-center gap-1.5 bg-slate-900 px-3 py-1.5 rounded-lg border border-slate-700 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>+ إضافة صنف يدوياً</span>
            </button>

            {/* Approval Action */}
            <div className="flex items-center gap-3">
              <button
                onClick={() => setIsReviewed(false)}
                className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold border border-slate-700 cursor-pointer"
              >
                رجوع
              </button>

              <button
                onClick={handleApprove}
                className="px-6 py-2.5 rounded-xl bg-teal-500 hover:bg-teal-400 text-slate-950 font-bold text-sm flex items-center gap-2 transition-all shadow-md cursor-pointer"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>اعتماد الطلب والبدء بمقارنة الأسعار</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
