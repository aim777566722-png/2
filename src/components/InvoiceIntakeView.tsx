import React, { useState, useRef, useEffect } from 'react';
import { 
  PurchaseInvoice, 
  InvoiceItem, 
  Supplier, 
  Medicine, 
  PharmacyOrder,
  MarketPriceRecord
} from '../types';
import { 
  Receipt, 
  Camera, 
  Upload, 
  Sparkles, 
  Plus, 
  Trash2, 
  CheckCircle2, 
  Calendar, 
  Building2, 
  RefreshCw, 
  Info, 
  ArrowLeft,
  FileSpreadsheet,
  FileUp,
  Link,
  ChevronLeft,
  X,
  Image as ImageIcon,
  AlertTriangle,
  FileText,
  Check,
  TrendingDown,
  TrendingUp,
  Loader2
} from 'lucide-react';
import { formatCurrency, computeMedicinePriceSummary } from '../utils/helpers';
import { parseUploadedFile, ParsedDocumentResult } from '../utils/documentParser';
import { findSimilarMedicine, SimilarityConflict } from '../utils/similarity';
import { ImageComparisonHeader } from './ImageComparisonHeader';
import { SimilarityResolutionModal } from './SimilarityResolutionModal';
import { Storage } from '../data/storage';
import { useBackgroundAnalysis } from '../context/BackgroundAnalysisContext';

interface InvoiceIntakeProps {
  knownSuppliers: Supplier[];
  knownMedicines: Medicine[];
  marketPrices?: MarketPriceRecord[];
  orders: PharmacyOrder[];
  preSelectedOrderId?: string;
  onInvoiceSaved: (invoice: PurchaseInvoice, targetOrderId?: string) => void;
  onCancel: () => void;
}

interface ImageUploadItem {
  id: string;
  name: string;
  base64: string;
  mimeType: string;
}

export const InvoiceIntakeView: React.FC<InvoiceIntakeProps> = ({
  knownSuppliers,
  knownMedicines,
  marketPrices = [],
  orders,
  preSelectedOrderId,
  onInvoiceSaved,
  onCancel
}) => {
  const [activeTab, setActiveTab] = useState<'image' | 'text' | 'manual'>('image');
  const [supplierName, setSupplierName] = useState('شركة الشفاء للأدوية');
  const [invoiceNumber, setInvoiceNumber] = useState(`INV-${Math.floor(10000 + Math.random() * 90000)}`);
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().split('T')[0]);
  const [selectedOrderId, setSelectedOrderId] = useState<string>(preSelectedOrderId || (orders.length > 0 ? orders[0].id : ''));
  
  // Multi-image state
  const [uploadedImages, setUploadedImages] = useState<ImageUploadItem[]>([]);
  const [rawText, setRawText] = useState(`بندول اكسترا\t20\t1450\nزواجرا 50 ملجم\t10\t2450\nلوفر 10 ملجم\t5\t1200`);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [notes, setNotes] = useState('');

  // Similarity Conflict Modal State
  const [similarityConflicts, setSimilarityConflicts] = useState<SimilarityConflict[]>([]);
  const [showSimilarityModal, setShowSimilarityModal] = useState(false);

  // Invoice Items
  const [invoiceItems, setInvoiceItems] = useState<InvoiceItem[]>([
    {
      id: 'inv-item-1',
      itemName: 'بندول اكسترا',
      quantity: 20,
      unitPrice: 1450,
      bonusScheme: '20+2',
      discountPercent: 0,
      totalPrice: 29000
    },
    {
      id: 'inv-item-2',
      itemName: 'زواجرا 50 ملجم',
      quantity: 10,
      unitPrice: 2450,
      bonusScheme: '',
      discountPercent: 0,
      totalPrice: 24500
    },
    {
      id: 'inv-item-3',
      itemName: 'لوفر 10 ملجم',
      quantity: 5,
      unitPrice: 1200,
      bonusScheme: '5+1',
      discountPercent: 0,
      totalPrice: 6000
    }
  ]);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const addMoreInputRef = useRef<HTMLInputElement>(null);

  const { activeTask, startInvoiceTask, clearActiveTask, clearTask } = useBackgroundAnalysis();

  // Restore background analysis results for invoice
  useEffect(() => {
    if (activeTask && activeTask.type === 'invoice' && activeTask.status === 'completed' && activeTask.payload.invoiceItems) {
      setInvoiceItems(activeTask.payload.invoiceItems);
      if (activeTask.payload.invoiceSupplierName) setSupplierName(activeTask.payload.invoiceSupplierName);
      if (activeTask.payload.invoiceNumber) setInvoiceNumber(activeTask.payload.invoiceNumber);
      if (activeTask.payload.invoiceDate) setInvoiceDate(activeTask.payload.invoiceDate);
      if (activeTask.payload.uploadedImages && uploadedImages.length === 0) {
        setUploadedImages(activeTask.payload.uploadedImages);
      }
      setIsAnalyzing(false);
    } else if (activeTask && activeTask.type === 'invoice' && activeTask.status === 'processing') {
      setIsAnalyzing(true);
    }
  }, [activeTask]);

  // Handle uploading multiple images
  const handleAddImages = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setAnalysisError(null);

    const newItems: ImageUploadItem[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      try {
        const parsed = await parseUploadedFile(file);
        if (parsed.extractedText) {
          setRawText(prev => prev + '\n' + parsed.extractedText);
        }
        if (parsed.base64) {
          newItems.push({
            id: `inv-img-${Date.now()}-${i}-${Math.random().toString(36).substr(2, 4)}`,
            name: file.name,
            base64: parsed.base64,
            mimeType: parsed.mimeType || 'image/jpeg'
          });
        }
      } catch (err) {
        console.error('Error parsing image:', file.name, err);
      }
    }

    setUploadedImages(prev => [...prev, ...newItems]);
  };

  const handleRemoveImage = (id: string) => {
    setUploadedImages(prev => prev.filter(img => img.id !== id));
  };

  const handleAnalyzeInvoice = async () => {
    setIsAnalyzing(true);
    setAnalysisError(null);

    try {
      await startInvoiceTask({
        rawText,
        uploadedImages,
        knownSuppliers,
        knownMedicines,
        activeTabMode: activeTab === 'image' ? 'image' : 'text'
      });
    } catch (err: any) {
      console.warn('Analysis error:', err);
      setAnalysisError('تعذر تحليل الفاتورة تلقائياً، يمكنك إدخال وتعديل الأصناف يدوياً.');
      setIsAnalyzing(false);
    }
  };

  const handleItemChange = (id: string, field: keyof InvoiceItem, value: any) => {
    setInvoiceItems(prev => prev.map(it => {
      if (it.id === id) {
        const updated = { ...it, [field]: value };
        if (field === 'quantity' || field === 'unitPrice') {
          updated.totalPrice = (Number(updated.quantity) || 0) * (Number(updated.unitPrice) || 0);
        }
        return updated;
      }
      return it;
    }));
  };

  const handleAddItem = () => {
    const newItem: InvoiceItem = {
      id: `item-${Date.now()}`,
      itemName: '',
      quantity: 1,
      unitPrice: 0,
      totalPrice: 0
    };
    setInvoiceItems(prev => [...prev, newItem]);
  };

  const handleDeleteItem = (id: string) => {
    setInvoiceItems(prev => prev.filter(it => it.id !== id));
  };

  const totalInvoiceSum = invoiceItems.reduce((sum, it) => sum + (it.totalPrice || 0), 0);

  // Detect similarity conflicts with existing medicines
  const detectSimilarityConflicts = (itemsToCheck: InvoiceItem[]): SimilarityConflict[] => {
    const conflicts: SimilarityConflict[] = [];

    itemsToCheck.forEach((item, idx) => {
      const match = findSimilarMedicine(item.itemName, knownMedicines);
      if (match && match.isNearMatch && match.existingMedicine.name !== item.itemName) {
        conflicts.push({
          id: item.id || `inv-conflict-${idx}`,
          candidateName: item.itemName,
          existingMedicine: match.existingMedicine as Medicine,
          similarityScore: match.similarityScore,
          unitPrice: item.unitPrice,
          quantity: item.quantity,
          supplierName: supplierName,
          bonusScheme: item.bonusScheme,
          originalIndex: idx
        });
      }
    });

    return conflicts;
  };

  // Handle resolutions from SimilarityResolutionModal
  const handleApplyResolutions = (resolutions: Map<string, { action: 'merge_existing' | 'create_new' | 'custom_name'; chosenName: string; medicineId?: string; aliasToAdd?: string }>) => {
    const updated = invoiceItems.map(item => {
      const res = resolutions.get(item.id);
      if (res) {
        if (res.action === 'merge_existing' && res.medicineId && item.itemName) {
          try {
            Storage.addAliasToMedicine(res.medicineId, item.itemName);
          } catch (err) {
            console.error('Failed to save alias:', err);
          }
        }
        return {
          ...item,
          itemName: res.chosenName,
          matchedMedicineId: res.medicineId || item.matchedMedicineId
        };
      }
      return item;
    });

    setInvoiceItems(updated);
    setShowSimilarityModal(false);

    // Save final invoice
    const supClean = String(supplierName || '').trim();
    const matchedSup = knownSuppliers.find(s => (s.name || '').trim().toLowerCase() === supClean.toLowerCase());
    const supplierId = matchedSup?.id || `sup-${(supClean || 'supplier').replace(/\s+/g, '-').toLowerCase()}`;

    const invoice: PurchaseInvoice = {
      id: `inv-${Date.now()}`,
      invoiceNumber,
      supplierId,
      supplierName,
      invoiceDate,
      totalAmount: updated.reduce((sum, it) => sum + (it.totalPrice || 0), 0),
      items: updated,
      matchedOrderId: selectedOrderId || undefined,
      notes,
      createdTimestamp: Date.now()
    };

    clearActiveTask();
    clearTask();
    onInvoiceSaved(invoice, selectedOrderId || undefined);
  };

  const handleSave = () => {
    if (!supplierName.trim()) {
      alert('يرجى تحديد اسم المورد');
      return;
    }
    if (invoiceItems.length === 0) {
      alert('يرجى إضافة صنف واحد على الأقل في الفاتورة');
      return;
    }

    const conflicts = detectSimilarityConflicts(invoiceItems);
    if (conflicts.length > 0) {
      setSimilarityConflicts(conflicts);
      setShowSimilarityModal(true);
      return;
    }

    const supClean = String(supplierName || '').trim();
    const matchedSup = knownSuppliers.find(s => (s.name || '').trim().toLowerCase() === supClean.toLowerCase());
    const supplierId = matchedSup?.id || `sup-${(supClean || 'supplier').replace(/\s+/g, '-').toLowerCase()}`;

    const invoice: PurchaseInvoice = {
      id: `inv-${Date.now()}`,
      invoiceNumber,
      supplierId,
      supplierName,
      invoiceDate,
      totalAmount: totalInvoiceSum,
      items: invoiceItems,
      matchedOrderId: selectedOrderId || undefined,
      notes,
      createdTimestamp: Date.now()
    };

    clearActiveTask();
    clearTask();
    onInvoiceSaved(invoice, selectedOrderId || undefined);
  };

  return (
    <div className="space-y-6 pb-24 max-w-5xl mx-auto" dir="rtl">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-white flex items-center gap-2">
            <Receipt className="w-6 h-6 text-teal-400" />
            <span>تسجيل وتحليل فاتورة شراء</span>
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            تصوير أو إرفاق صور متعددة لفواتير الشراء من السوق لتغذية قاعدة الأسعار تلقائياً ومطابقتها مع الطلبات
          </p>
        </div>

        <button
          onClick={onCancel}
          className="text-xs text-slate-400 hover:text-slate-200 px-3.5 py-2 rounded-2xl border border-slate-800 self-start sm:self-auto cursor-pointer"
        >
          إلغاء والعودة
        </button>
      </div>

      {/* Main Form Container */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-5 sm:p-6 space-y-6 shadow-sm">
        
        {/* Invoice Metadata Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-bold text-slate-300 mb-1.5">
              اسم المورد / المستودع *
            </label>
            <input
              type="text"
              list="suppliers-list"
              value={supplierName}
              onChange={e => setSupplierName(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-2xl px-3.5 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-teal-500 font-bold"
              placeholder="مثال: شركة الشفاء للأدوية"
            />
            <datalist id="suppliers-list">
              {knownSuppliers.map(s => (
                <option key={s.id} value={s.name} />
              ))}
            </datalist>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-300 mb-1.5">
              رقم الفاتورة
            </label>
            <input
              type="text"
              value={invoiceNumber}
              onChange={e => setInvoiceNumber(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-2xl px-3.5 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-teal-500 font-mono"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-300 mb-1.5">
              تاريخ الفاتورة
            </label>
            <input
              type="date"
              value={invoiceDate}
              onChange={e => setInvoiceDate(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-2xl px-3.5 py-2 text-sm text-slate-100 focus:outline-none focus:border-teal-500 font-mono"
            />
          </div>
        </div>

        {/* Link with Active Order */}
        <div className="p-4 bg-slate-950/70 rounded-2xl border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Link className="w-4 h-4 text-teal-400 shrink-0" />
            <span className="text-xs font-bold text-slate-300">ربط الفاتورة بطلب صيدلية لمطابقة الكميات والتوفير:</span>
          </div>

          <select
            value={selectedOrderId}
            onChange={e => setSelectedOrderId(e.target.value)}
            className="bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-teal-500"
          >
            <option value="">-- بدون ربط بطلب (تسجيل سعر سوق فقط) --</option>
            {orders.map(o => (
              <option key={o.id} value={o.id}>
                {o.orderNumber} - {o.pharmacyName} ({o.items.length} أصناف)
              </option>
            ))}
          </select>
        </div>

        {/* Intake Tabs (Image OCR vs Text Input) */}
        <div className="border-t border-slate-800 pt-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-xs font-bold">
              <button
                type="button"
                onClick={() => setActiveTab('image')}
                className={`px-3.5 py-2 rounded-xl border flex items-center gap-1.5 transition-all cursor-pointer ${
                  activeTab === 'image' 
                    ? 'bg-teal-500/20 text-teal-300 border-teal-500/40 shadow-sm' 
                    : 'bg-slate-950 text-slate-400 border-slate-800'
                }`}
              >
                <Camera className="w-4 h-4" />
                <span>تصوير / رفع صور متعددة ({uploadedImages.length})</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('text')}
                className={`px-3.5 py-2 rounded-xl border flex items-center gap-1.5 transition-all cursor-pointer ${
                  activeTab === 'text' 
                    ? 'bg-teal-500/20 text-teal-300 border-teal-500/40 shadow-sm' 
                    : 'bg-slate-950 text-slate-400 border-slate-800'
                }`}
              >
                <FileSpreadsheet className="w-4 h-4" />
                <span>لصق نص / جدول الفاتورة</span>
              </button>
            </div>

            <button
              type="button"
              onClick={handleAnalyzeInvoice}
              disabled={isAnalyzing || (activeTab === 'image' && uploadedImages.length === 0 && !rawText)}
              className="px-4 py-2 rounded-xl bg-teal-500 hover:bg-teal-400 text-slate-950 font-bold text-xs flex items-center justify-center gap-2 cursor-pointer transition-all disabled:opacity-40 shadow-md"
            >
              {isAnalyzing ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>
                    جاري استخراج البيانات ({activeTask && activeTask.type === 'invoice' ? activeTask.progress : 45}%)
                  </span>
                </>
              ) : (
                <>
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>تحليل الفاتورة بالذكاء الاصطناعي</span>
                </>
              )}
            </button>
          </div>

          {/* Multi-Image Upload Tab Content */}
          {activeTab === 'image' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Pick Multiple Files */}
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="border-2 border-dashed border-slate-700 hover:border-teal-500 rounded-2xl p-5 text-center bg-slate-950/60 cursor-pointer transition-all flex flex-col items-center justify-center min-h-[120px]"
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    accept="image/*,.pdf,.xlsx,.csv,.docx"
                    onChange={(e) => handleAddImages(e.target.files)}
                    className="hidden"
                  />
                  <Upload className="w-5 h-5 text-teal-400 mb-2" />
                  <span className="text-xs font-bold text-slate-200">
                    اختر صورة أو عدة صور للفاتورة من الهاتف
                  </span>
                  <span className="text-[10px] text-slate-400 mt-0.5">
                    يمكنك اختيار أكثر من صورة لصفحات الفاتورة
                  </span>
                </div>

                {/* Camera Snapper */}
                <div
                  onClick={() => cameraInputRef.current?.click()}
                  className="border-2 border-dashed border-slate-700 hover:border-emerald-500 rounded-2xl p-5 text-center bg-slate-950/60 cursor-pointer transition-all flex flex-col items-center justify-center min-h-[120px]"
                >
                  <input
                    ref={cameraInputRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    onChange={(e) => handleAddImages(e.target.files)}
                    className="hidden"
                  />
                  <Camera className="w-5 h-5 text-emerald-400 mb-2" />
                  <span className="text-xs font-bold text-slate-200">
                    التقاط صورة بالكاميرا
                  </span>
                  <span className="text-[10px] text-slate-400 mt-0.5">
                    التقط صورة بعد صورة لكل صفحة
                  </span>
                </div>
              </div>

              {/* Uploaded Images Thumbnails Strip */}
              {uploadedImages.length > 0 && (
                <div className="bg-slate-950 p-3.5 rounded-2xl border border-slate-800 space-y-2.5">
                  <div className="flex items-center justify-between text-xs font-bold text-slate-300">
                    <span>صور صفحات الفاتورة المرفقة ({uploadedImages.length}):</span>
                    <button
                      type="button"
                      onClick={() => setUploadedImages([])}
                      className="text-rose-400 hover:text-rose-300 text-[11px] cursor-pointer"
                    >
                      مسح الصور
                    </button>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-2">
                    {uploadedImages.map((img, idx) => (
                      <div key={img.id} className="relative group rounded-xl bg-slate-900 border border-slate-800 overflow-hidden h-20">
                        <img src={img.base64} alt={img.name} className="w-full h-full object-cover" />
                        <button
                          type="button"
                          onClick={() => handleRemoveImage(img.id)}
                          className="absolute top-1 left-1 w-5 h-5 rounded-full bg-rose-500/80 hover:bg-rose-600 text-white flex items-center justify-center text-[10px] cursor-pointer"
                        >
                          <X className="w-3 h-3" />
                        </button>
                        <span className="absolute bottom-1 right-1 px-1.5 py-0.5 bg-slate-950/80 rounded text-[9px] font-mono text-slate-200">
                          صفحة {idx + 1}
                        </span>
                      </div>
                    ))}

                    <button
                      type="button"
                      onClick={() => addMoreInputRef.current?.click()}
                      className="h-20 rounded-xl border-2 border-dashed border-slate-800 hover:border-teal-500 bg-slate-950/40 hover:bg-slate-900 flex flex-col items-center justify-center gap-1 text-slate-400 hover:text-teal-300 cursor-pointer"
                    >
                      <input
                        ref={addMoreInputRef}
                        type="file"
                        multiple
                        accept="image/*"
                        onChange={(e) => handleAddImages(e.target.files)}
                        className="hidden"
                      />
                      <Plus className="w-4 h-4" />
                      <span className="text-[10px] font-bold">+ إضافة صفحة</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Text Tab Content */}
          {activeTab === 'text' && (
            <div>
              <textarea
                value={rawText}
                onChange={e => setRawText(e.target.value)}
                rows={4}
                className="w-full bg-slate-950 border border-slate-800 rounded-2xl p-3.5 text-xs text-slate-200 font-mono focus:outline-none focus:border-teal-500 resize-y"
                placeholder="الصنف	الكمية	السعر	بونص"
              />
            </div>
          )}

          {analysisError && (
            <p className="text-xs text-rose-400">{analysisError}</p>
          )}
        </div>

        {/* Image Comparison Header (صورة الفاتورة أعلى الجدول لسهولة مطابقة الأسعار والأصناف) */}
        <ImageComparisonHeader
          images={uploadedImages}
          rawText={activeTab === 'text' ? rawText : undefined}
          title="معاينة صورة الفاتورة الأصلية للمطابقة"
          subtitle="طابق بنود الفاتورة والأسعار المستخرجة أدناه مع صورة الفاتورة الأصلية مباشرة للتأكد من دقة البيانات"
        />

        {/* Invoice Items Table */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <span>بنود وأصناف الفاتورة المستخرجة</span>
              <span className="text-xs px-2 py-0.5 bg-slate-800 text-teal-400 rounded-full font-mono font-bold">
                {invoiceItems.length} أصناف
              </span>
            </h3>

            <button
              type="button"
              onClick={handleAddItem}
              className="text-xs text-teal-400 hover:text-teal-300 font-bold flex items-center gap-1 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>إضافة بند يدوي</span>
            </button>
          </div>

          <div className="overflow-x-auto rounded-2xl border border-slate-800">
            <table className="w-full text-right text-xs">
              <thead className="bg-slate-950 text-slate-400 border-b border-slate-800 font-bold">
                <tr>
                  <th className="py-2.5 px-3">اسم الصنف الصيدلاني (مع القوة)</th>
                  <th className="py-2.5 px-3 text-center w-20">الكمية</th>
                  <th className="py-2.5 px-3 text-center w-28">سعر الشراء</th>
                  <th className="py-2.5 px-3 text-center w-24">البونص</th>
                  <th className="py-2.5 px-3 text-center w-28">الإجمالي</th>
                  <th className="py-2.5 px-2 text-center w-10"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 bg-slate-950/40">
                {invoiceItems.map((item) => {
                  const similarity = findSimilarMedicine(item.itemName, knownMedicines);
                  const isNear = similarity && similarity.isNearMatch && similarity.existingMedicine.name !== item.itemName;

                  return (
                    <tr key={item.id} className="hover:bg-slate-950/80">
                      <td className="py-2 px-3">
                        <div className="space-y-1">
                          <input
                            type="text"
                            list={`inv-meds-${item.id}`}
                            value={item.itemName}
                            onChange={e => handleItemChange(item.id, 'itemName', e.target.value)}
                            className="w-full bg-slate-900 border border-slate-800 rounded-xl px-2.5 py-1.5 text-xs text-slate-100 font-bold focus:border-teal-500 focus:outline-none"
                          />
                          <datalist id={`inv-meds-${item.id}`}>
                            {knownMedicines.map(m => (
                              <option key={m.id} value={m.name} />
                            ))}
                          </datalist>

                          {isNear && (
                            <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 font-bold border border-amber-500/30">
                              <AlertTriangle className="w-3 h-3" />
                              مشابه لـ: {similarity.existingMedicine.name}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-2 px-3">
                        <input
                          type="number"
                          min="1"
                          value={item.quantity}
                          onChange={e => handleItemChange(item.id, 'quantity', Number(e.target.value))}
                          className="w-full bg-slate-900 border border-slate-800 rounded-xl px-2 py-1.5 text-xs text-center text-teal-400 font-mono font-bold focus:border-teal-500 focus:outline-none"
                        />
                      </td>
                      <td className="py-2 px-3">
                        <div className="space-y-1">
                          <input
                            type="number"
                            min="0"
                            value={item.unitPrice}
                            onChange={e => handleItemChange(item.id, 'unitPrice', Number(e.target.value))}
                            className="w-full bg-slate-900 border border-slate-800 rounded-xl px-2 py-1.5 text-xs text-center text-slate-100 font-mono focus:border-teal-500 focus:outline-none font-bold"
                          />
                          {(() => {
                            const summary = computeMedicinePriceSummary('', item.itemName, marketPrices);
                            if (!summary || summary.lowestPrice === 0 || item.unitPrice === 0) return null;
                            const diff = item.unitPrice - summary.lowestPrice;
                            if (diff > 0) {
                              return (
                                <span className="inline-flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-300 font-bold border border-rose-500/30 whitespace-nowrap" title={`أقل سعر بالسوق: ${formatCurrency(summary.lowestPrice)} لدى ${summary.bestSupplierName}`}>
                                  <AlertTriangle className="w-2.5 h-2.5" />
                                  + {formatCurrency(diff)} أعلى من السوق
                                </span>
                              );
                            }
                            if (diff < 0) {
                              return (
                                <span className="inline-flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-500/30 whitespace-nowrap">
                                  <Check className="w-2.5 h-2.5" />
                                  توفير {formatCurrency(Math.abs(diff))}!
                                </span>
                              );
                            }
                            return (
                              <span className="inline-flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded bg-teal-500/20 text-teal-300 font-bold border border-teal-500/30 whitespace-nowrap">
                                <Check className="w-2.5 h-2.5" />
                                مطابق لأفضل سعر
                              </span>
                            );
                          })()}
                        </div>
                      </td>
                      <td className="py-2 px-3">
                        <input
                          type="text"
                          placeholder="مثل 10+1"
                          value={item.bonusScheme || ''}
                          onChange={e => handleItemChange(item.id, 'bonusScheme', e.target.value)}
                          className="w-full bg-slate-900 border border-slate-800 rounded-xl px-2 py-1.5 text-xs text-center text-emerald-300 font-mono focus:border-teal-500 focus:outline-none"
                        />
                      </td>
                      <td className="py-2 px-3 text-center font-mono font-bold text-slate-200">
                        {formatCurrency(item.totalPrice)}
                      </td>
                      <td className="py-2 px-2 text-center">
                        <button
                          type="button"
                          onClick={() => handleDeleteItem(item.id)}
                          className="text-slate-500 hover:text-rose-400 p-1 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Invoice Summary & Notes */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-3">
            <div>
              <label className="block text-xs font-bold text-slate-400 mb-1">
                ملاحظات الفاتورة:
              </label>
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                rows={2}
                placeholder="شروط السداد، المندوب، أو تفاصيل إضافية..."
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-xs text-slate-200 focus:outline-none focus:border-teal-500"
              />
            </div>

            <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 flex flex-col justify-between">
              <div className="flex justify-between items-center text-xs text-slate-400">
                <span>إجمالي الفاتورة المحسوب:</span>
                <span className="text-lg font-black text-emerald-400 font-mono">
                  {formatCurrency(totalInvoiceSum)}
                </span>
              </div>
              
              <div className="pt-3 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={handleSave}
                  className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-teal-500 to-emerald-500 hover:from-teal-400 hover:to-emerald-400 text-slate-950 font-black text-xs flex items-center gap-1.5 cursor-pointer shadow-lg shadow-teal-500/20 active:scale-95 transition-all"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>حفظ الفاتورة وتحديث قاعدة الأسعار</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* SIMILARITY RESOLUTION MODAL */}
        <SimilarityResolutionModal
          conflicts={similarityConflicts}
          isOpen={showSimilarityModal}
          onResolve={handleApplyResolutions}
          onClose={() => setShowSimilarityModal(false)}
        />
      </div>
    </div>
  );
};
