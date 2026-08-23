import React, { useState, useRef, useEffect, useCallback } from 'react';
import { 
  ZoomIn, 
  ZoomOut, 
  RotateCw, 
  Maximize2, 
  Minimize2,
  ChevronLeft, 
  ChevronRight, 
  Eye, 
  FileText, 
  Sparkles, 
  Check, 
  Plus, 
  Trash2, 
  Search, 
  ArrowRight,
  AlertCircle, 
  RefreshCw, 
  Copy, 
  Building2, 
  Receipt, 
  Calendar,
  Layers,
  Save,
  Clock,
  Move,
  CheckCircle2
} from 'lucide-react';
import { Medicine, Supplier, PharmacyOrder, PurchaseInvoice, MarketPriceRecord } from '../types';

export interface ExtractedItem {
  id?: string;
  itemName: string;
  quantity?: number;
  unit?: string;
  unitPrice?: number;
  totalPrice?: number;
  expiryDate?: string;
  bonusScheme?: string;
  discountPercent?: number;
  isUncertain?: boolean;
  uncertaintyReason?: string;
  notes?: string;
  matchedMedicineId?: string;
}

export interface ExtractedDocumentData {
  detectedType?: 'order' | 'invoice' | 'price_list';
  documentTitle?: string;
  partyName?: string;
  documentNumber?: string;
  documentDate?: string;
  ocrQuality?: 'high' | 'medium' | 'low';
  rawExtractedText?: string;
  cleanedText?: string;
  totalAmount?: number;
  items: ExtractedItem[];
  summary?: string;
}

export interface UploadedFileSummary {
  id: string;
  name: string;
  type: string;
  mimeType?: string;
  base64?: string;
  extractedText?: string;
}

interface DocumentSplitPreviewProps {
  documentType: 'order' | 'invoice' | 'price_list';
  pharmacyName?: string;
  supplierName?: string;
  uploadedFiles: UploadedFileSummary[];
  pastedText?: string;
  extractedData: ExtractedDocumentData;
  knownMedicines: Medicine[];
  knownSuppliers: Supplier[];
  onUpdateItem: (index: number, field: string, value: any) => void;
  onDeleteItem: (index: number) => void;
  onAddItem: () => void;
  onConfirmOrder: (partyName: string, items: ExtractedItem[]) => void;
  onConfirmInvoice: (supplierName: string, items: ExtractedItem[], invoiceNumber?: string, date?: string) => void;
  onConfirmPriceList: (supplierName: string, items: ExtractedItem[], date?: string) => void;
  onBackToUpload: () => void;
  onResetAll: () => void;
}

export const DocumentSplitPreview: React.FC<DocumentSplitPreviewProps> = ({
  documentType,
  pharmacyName = '',
  supplierName = '',
  uploadedFiles,
  pastedText = '',
  extractedData,
  knownMedicines,
  knownSuppliers,
  onUpdateItem,
  onDeleteItem,
  onAddItem,
  onConfirmOrder,
  onConfirmInvoice,
  onConfirmPriceList,
  onBackToUpload,
  onResetAll
}) => {
  // Top Pane Image & Gestures State
  const imageFiles = uploadedFiles.filter(f => f.base64 && (!f.mimeType || f.mimeType.startsWith('image/')));
  const [activeImageIdx, setActiveImageIdx] = useState(0);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [panPosition, setPanPosition] = useState({ x: 0, y: 0 });
  const [rotation, setRotation] = useState(0);
  const [isFullscreenModal, setIsFullscreenModal] = useState(false);
  const [activeTopTab, setActiveTopTab] = useState<'image' | 'text'>(imageFiles.length > 0 ? 'image' : 'text');

  // Dragging / Touch tracking state
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const touchDistanceRef = useRef<number | null>(null);
  const touchStartPanRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  // Search & Filter in Bottom List
  const [searchTerm, setSearchTerm] = useState('');
  const [copiedTextNotice, setCopiedTextNotice] = useState(false);

  // Pagination for high dataset volume (e.g. 2,500+ items)
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState<number | 'all'>(100);
  
  // Editable header fields
  const [partyInput, setPartyInput] = useState(
    extractedData.partyName || pharmacyName || supplierName || ''
  );
  const [docNumberInput, setDocNumberInput] = useState(
    extractedData.documentNumber || (documentType === 'invoice' ? `INV-${Date.now().toString().slice(-4)}` : '')
  );
  const [docDateInput, setDocDateInput] = useState(
    extractedData.documentDate || new Date().toISOString().split('T')[0]
  );

  const currentImage = imageFiles[activeImageIdx] || null;
  const totalImages = imageFiles.length;

  // Zoom handlers
  const handleZoomIn = () => setZoomLevel(prev => Math.min(prev + 0.3, 4));
  const handleZoomOut = () => setZoomLevel(prev => Math.max(prev - 0.3, 0.5));
  const handleResetZoom = () => {
    setZoomLevel(1);
    setPanPosition({ x: 0, y: 0 });
    setRotation(0);
  };
  const handleRotate = () => setRotation(prev => (prev + 90) % 360);

  // Touch Gesture Handlers (Pinch-to-zoom + Touch Pan)
  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length === 1) {
      setIsDragging(true);
      dragStartRef.current = {
        x: e.touches[0].clientX - panPosition.x,
        y: e.touches[0].clientY - panPosition.y
      };
    } else if (e.touches.length === 2) {
      setIsDragging(false);
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      touchDistanceRef.current = dist;
      touchStartPanRef.current = { ...panPosition };
    }
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length === 1 && isDragging) {
      const newX = e.touches[0].clientX - dragStartRef.current.x;
      const newY = e.touches[0].clientY - dragStartRef.current.y;
      setPanPosition({ x: newX, y: newY });
    } else if (e.touches.length === 2 && touchDistanceRef.current !== null) {
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      const factor = dist / touchDistanceRef.current;
      setZoomLevel(prev => Math.min(Math.max(prev * (factor > 1 ? 1.03 : 0.97), 0.5), 4));
      touchDistanceRef.current = dist;
    }
  };

  const handleTouchEnd = () => {
    setIsDragging(false);
    touchDistanceRef.current = null;
  };

  // Mouse Drag Handlers
  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
    dragStartRef.current = {
      x: e.clientX - panPosition.x,
      y: e.clientY - panPosition.y
    };
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isDragging) return;
    setPanPosition({
      x: e.clientX - dragStartRef.current.x,
      y: e.clientY - dragStartRef.current.y
    });
  };

  const handleMouseUp = () => setIsDragging(false);

  // Wheel Zoom
  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (e.deltaY < 0) {
      setZoomLevel(prev => Math.min(prev + 0.15, 4));
    } else {
      setZoomLevel(prev => Math.max(prev - 0.15, 0.5));
    }
  };

  // Copy raw text helper
  const handleCopyRawText = (text?: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedTextNotice(true);
    setTimeout(() => setCopiedTextNotice(false), 2000);
  };

  // Filter items in bottom list
  const filteredItems = (extractedData.items || []).filter(it => 
    !searchTerm.trim() || 
    (it.itemName && it.itemName.toLowerCase().includes(searchTerm.toLowerCase())) ||
    (it.notes && it.notes.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  // Pagination calculations
  const totalItemsCount = filteredItems.length;
  const effectivePageSize = pageSize === 'all' ? totalItemsCount : (pageSize as number);
  const totalPages = pageSize === 'all' ? 1 : Math.ceil(totalItemsCount / (pageSize as number)) || 1;
  const safeCurrentPage = Math.min(Math.max(1, currentPage), totalPages);
  
  const paginatedItems = pageSize === 'all'
    ? filteredItems
    : filteredItems.slice((safeCurrentPage - 1) * effectivePageSize, safeCurrentPage * effectivePageSize);

  // Calculate totals ONLY for invoice
  const invoiceTotalAmount = documentType === 'invoice'
    ? (extractedData.items || []).reduce((acc, item) => acc + ((Number(item.unitPrice) || 0) * (Number(item.quantity) || 1)), 0)
    : 0;

  return (
    <div className="space-y-4 max-w-6xl mx-auto pb-20" dir="rtl">
      {/* Top Header Controls Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-900/90 backdrop-blur-md p-3.5 rounded-2xl border border-slate-800 shadow-xl">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBackToUpload}
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-all cursor-pointer flex items-center gap-1.5 text-xs font-bold"
          >
            <ArrowRight className="w-4 h-4 text-teal-400" />
            <span>رجوع للرفع</span>
          </button>

          <div>
            <div className="flex items-center gap-2">
              <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold border ${
                documentType === 'order'
                  ? 'bg-teal-500/20 text-teal-300 border-teal-500/40'
                  : documentType === 'invoice'
                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                  : 'bg-amber-500/20 text-amber-300 border-amber-500/40'
              }`}>
                {documentType === 'order' ? 'طلب صيدلية جديد' : documentType === 'invoice' ? 'فاتورة شراء' : 'عروض سعر'}
              </span>
              <span className="text-xs font-black text-white">
                معاينة ومطابقة ذكية ({extractedData.items?.length || 0} صنف)
              </span>
            </div>
          </div>
        </div>

        {/* Primary Save Action Button in Top Bar */}
        <div className="flex items-center gap-2">
          {documentType === 'order' && (
            <button
              type="button"
              onClick={() => onConfirmOrder(partyInput || 'صيدلية النخبة', extractedData.items || [])}
              className="px-4 py-2 rounded-xl bg-gradient-to-r from-teal-500 to-cyan-600 hover:from-teal-400 hover:to-cyan-500 text-slate-950 font-black text-xs sm:text-sm flex items-center gap-2 shadow-lg shadow-teal-500/20 cursor-pointer transition-all active:scale-95"
            >
              <Check className="w-4 h-4" />
              <span>اعتماد وإنشاء الطلب ({extractedData.items?.length || 0})</span>
            </button>
          )}

          {documentType === 'invoice' && (
            <button
              type="button"
              onClick={() => onConfirmInvoice(partyInput || 'مورد الفاتورة', extractedData.items || [], docNumberInput, docDateInput)}
              className="px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-slate-950 font-black text-xs sm:text-sm flex items-center gap-2 shadow-lg shadow-emerald-500/20 cursor-pointer transition-all active:scale-95"
            >
              <Receipt className="w-4 h-4" />
              <span>حفظ الفاتورة في المشتريات</span>
            </button>
          )}

          {documentType === 'price_list' && (
            <button
              type="button"
              onClick={() => onConfirmPriceList(partyInput || 'مورد الأسعار', extractedData.items || [], docDateInput)}
              className="px-4 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-slate-950 font-black text-xs sm:text-sm flex items-center gap-2 shadow-lg shadow-amber-500/20 cursor-pointer transition-all active:scale-95"
            >
              <Save className="w-4 h-4" />
              <span>حفظ وتحديث أسعار السوق ({extractedData.items?.length || 0} صنف)</span>
            </button>
          )}

          <button
            type="button"
            onClick={onResetAll}
            className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold transition-all cursor-pointer"
            title="تحليل مستند جديد بالكامل"
          >
            مستند جديد
          </button>
        </div>
      </div>

      {/* Editable Header Meta (Party name, invoice number, date) */}
      <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-3.5 flex flex-wrap items-center gap-4">
        <div className="flex-1 min-w-[200px]">
          <label className="text-[11px] font-bold text-slate-400 flex items-center gap-1 mb-1">
            <Building2 className="w-3.5 h-3.5 text-teal-400" />
            <span>{documentType === 'order' ? 'اسم الصيدلية المطلوبة' : 'اسم المورد / الشركة'}</span>
          </label>
          <input
            type="text"
            value={partyInput}
            onChange={(e) => setPartyInput(e.target.value)}
            placeholder={documentType === 'order' ? 'اسم الصيدلية...' : 'اسم المورد أو المستودع...'}
            className="w-full bg-slate-950 border border-slate-700 focus:border-teal-500 rounded-xl px-3 py-1.5 text-xs text-white outline-none font-bold"
          />
        </div>

        {documentType === 'invoice' && (
          <div className="w-36">
            <label className="text-[11px] font-bold text-slate-400 flex items-center gap-1 mb-1">
              <Receipt className="w-3.5 h-3.5 text-slate-400" />
              <span>رقم الفاتورة</span>
            </label>
            <input
              type="text"
              value={docNumberInput}
              onChange={(e) => setDocNumberInput(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 focus:border-teal-500 rounded-xl px-3 py-1.5 text-xs text-white outline-none font-mono font-bold"
            />
          </div>
        )}

        <div className="w-36">
          <label className="text-[11px] font-bold text-slate-400 flex items-center gap-1 mb-1">
            <Calendar className="w-3.5 h-3.5 text-slate-400" />
            <span>التاريخ</span>
          </label>
          <input
            type="date"
            value={docDateInput}
            onChange={(e) => setDocDateInput(e.target.value)}
            className="w-full bg-slate-950 border border-slate-700 focus:border-teal-500 rounded-xl px-3 py-1.5 text-xs text-white outline-none font-mono"
          />
        </div>

        {/* Total calculation strictly for INVOICE only */}
        {documentType === 'invoice' && (
          <div className="bg-slate-950/80 px-3.5 py-1.5 rounded-xl border border-slate-800">
            <span className="text-[10px] text-slate-400 block">إجمالي الفاتورة</span>
            <span className="text-sm font-black text-emerald-400 font-mono">
              {invoiceTotalAmount.toLocaleString()} ر.ي
            </span>
          </div>
        )}
      </div>

      {/* ======================================================== */}
      {/* 🌟 1. TOP PANE: FIXED & INDEPENDENT SOURCE VIEWER        */}
      {/* ======================================================== */}
      <div className="bg-slate-900 border-2 border-teal-500/40 rounded-2xl overflow-hidden shadow-2xl sticky top-2 z-20">
        {/* Top Viewer Control Bar */}
        <div className="px-4 py-2 bg-gradient-to-r from-slate-950 via-slate-900 to-teal-950/40 border-b border-slate-800 flex flex-wrap items-center justify-between gap-2">
          {/* Left: View Mode Tabs & Multiple Image Navigator */}
          <div className="flex items-center gap-2">
            {imageFiles.length > 0 && (
              <div className="flex items-center bg-slate-950 p-0.5 rounded-xl border border-slate-800">
                <button
                  type="button"
                  onClick={() => setActiveTopTab('image')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold flex items-center gap-1 transition-all cursor-pointer ${
                    activeTopTab === 'image'
                      ? 'bg-teal-500 text-slate-950 shadow'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <Eye className="w-3.5 h-3.5" />
                  <span>الصورة الأصلية ({imageFiles.length})</span>
                </button>

                {(extractedData.rawExtractedText || pastedText) && (
                  <button
                    type="button"
                    onClick={() => setActiveTopTab('text')}
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold flex items-center gap-1 transition-all cursor-pointer ${
                      activeTopTab === 'text'
                        ? 'bg-teal-500 text-slate-950 shadow'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    <FileText className="w-3.5 h-3.5" />
                    <span>النص المرسل</span>
                  </button>
                )}
              </div>
            )}

            {/* If Multiple Images: Image Selector Pills */}
            {activeTopTab === 'image' && totalImages > 1 && (
              <div className="flex items-center gap-1 bg-slate-950/90 px-2 py-0.5 rounded-xl border border-slate-800">
                <button
                  type="button"
                  onClick={() => setActiveImageIdx(prev => (prev > 0 ? prev - 1 : totalImages - 1))}
                  className="p-1 rounded hover:bg-slate-800 text-slate-300 hover:text-teal-400"
                  title="الصورة السابقة"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>

                <div className="flex items-center gap-1">
                  {imageFiles.map((img, idx) => (
                    <button
                      key={img.id || idx}
                      type="button"
                      onClick={() => {
                        setActiveImageIdx(idx);
                        handleResetZoom();
                      }}
                      className={`px-2 py-0.5 rounded text-[11px] font-mono font-bold transition-all cursor-pointer ${
                        activeImageIdx === idx
                          ? 'bg-teal-500 text-slate-950 font-black'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      صورة {idx + 1}
                    </button>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={() => setActiveImageIdx(prev => (prev < totalImages - 1 ? prev + 1 : 0))}
                  className="p-1 rounded hover:bg-slate-800 text-slate-300 hover:text-teal-400"
                  title="الصورة التالية"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>

          {/* Right: Zoom, Pan & Touch Toolbar */}
          {activeTopTab === 'image' && currentImage && (
            <div className="flex items-center gap-1 bg-slate-950 p-0.5 rounded-xl border border-slate-800 text-xs">
              <span className="text-[10px] text-teal-400 font-bold px-1.5 hidden sm:inline-flex items-center gap-1">
                <Move className="w-3 h-3" />
                <span>تحريك وتقريب باللمس</span>
              </span>
              <button
                type="button"
                onClick={handleZoomIn}
                title="تكبير (+)"
                className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-300 hover:text-teal-400"
              >
                <ZoomIn className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={handleZoomOut}
                title="تصغير (-)"
                className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-300 hover:text-teal-400"
              >
                <ZoomOut className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={handleResetZoom}
                title="إعادة ضبط (100%)"
                className="px-2 py-0.5 rounded text-[11px] font-mono font-bold text-slate-300 hover:bg-slate-800 hover:text-teal-400"
              >
                {Math.round(zoomLevel * 100)}%
              </button>
              <button
                type="button"
                onClick={handleRotate}
                title="تدوير 90 درجة"
                className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-300 hover:text-teal-400"
              >
                <RotateCw className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setIsFullscreenModal(true)}
                title="ملء الشاشة"
                className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-300 hover:text-teal-400"
              >
                <Maximize2 className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {activeTopTab === 'text' && (
            <button
              type="button"
              onClick={() => handleCopyRawText(extractedData.rawExtractedText || pastedText)}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold transition-all"
            >
              {copiedTextNotice ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedTextNotice ? 'تم النسخ' : 'نسخ النص'}</span>
            </button>
          )}
        </div>

        {/* Fixed Bounded Interactive Viewer Area (280px to 320px) */}
        <div 
          className="relative h-[280px] sm:h-[320px] bg-slate-950 overflow-hidden flex items-center justify-center p-2 select-none touch-none"
          onWheel={handleWheel}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        >
          {activeTopTab === 'image' && currentImage ? (
            <div
              className="transition-transform duration-75 ease-out origin-center cursor-grab active:cursor-grabbing flex items-center justify-center will-change-transform"
              style={{
                transform: `translate(${panPosition.x}px, ${panPosition.y}px) scale(${zoomLevel}) rotate(${rotation}deg)`
              }}
            >
              <img
                src={currentImage.base64}
                alt={currentImage.name || 'الوثيقة الأصلية'}
                className="max-h-[260px] sm:max-h-[300px] w-auto object-contain rounded shadow-2xl pointer-events-none"
                draggable={false}
              />
            </div>
          ) : (
            <div className="w-full h-full p-4 overflow-y-auto font-mono text-xs sm:text-sm text-slate-300 whitespace-pre-wrap leading-relaxed bg-slate-950/90 rounded-xl border border-slate-800/80">
              {pastedText || extractedData.rawExtractedText || 'لا يوجد نص أصلي معروض'}
            </div>
          )}

          {/* Quick interactive hint badge */}
          {activeTopTab === 'image' && (
            <div className="absolute bottom-2 left-2 bg-slate-900/80 backdrop-blur-md px-2.5 py-1 rounded-lg border border-slate-800 text-[10px] text-slate-400 pointer-events-none flex items-center gap-1.5">
              <span>استخدم اللمس للتحريك والتكبير والتصغير</span>
            </div>
          )}
        </div>
      </div>

      {/* ======================================================== */}
      {/* 🌟 2. BOTTOM PANE: INDEPENDENT EXTRACTED ITEMS TABLE     */}
      {/* ======================================================== */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-xl overflow-hidden">
        {/* Table Top Bar */}
        <div className="p-3.5 bg-slate-950/80 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 flex-1 max-w-md">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-500 absolute right-3 top-2.5" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setCurrentPage(1);
                }}
                placeholder="بحث سريع في كافة الأصناف المستخرجة..."
                className="w-full bg-slate-900 border border-slate-800 focus:border-teal-500 rounded-xl pr-9 pl-3 py-1.5 text-xs text-white placeholder-slate-500 outline-none"
              />
            </div>
            <span className="text-xs text-slate-400 font-mono px-2 whitespace-nowrap">
              {filteredItems.length} من {extractedData.items?.length || 0}
            </span>
          </div>

          {/* Pagination & Page Size Control */}
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 bg-slate-900 px-2 py-1 rounded-xl border border-slate-800 text-xs text-slate-400">
              <span>عرض:</span>
              <select
                value={pageSize}
                onChange={(e) => {
                  const val = e.target.value === 'all' ? 'all' : Number(e.target.value);
                  setPageSize(val);
                  setCurrentPage(1);
                }}
                className="bg-slate-950 text-teal-400 border border-slate-700 rounded-lg px-2 py-0.5 text-xs font-bold outline-none cursor-pointer"
              >
                <option value={50}>50 صنف</option>
                <option value={100}>100 صنف</option>
                <option value={250}>250 صنف</option>
                <option value={500}>500 صنف</option>
                <option value="all">عرض الكل ({filteredItems.length})</option>
              </select>
            </div>

            {totalPages > 1 && (
              <div className="flex items-center gap-1 bg-slate-900 p-1 rounded-xl border border-slate-800 text-xs">
                <button
                  type="button"
                  disabled={safeCurrentPage <= 1}
                  onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                  className="p-1 rounded-lg hover:bg-slate-800 text-slate-300 disabled:opacity-40 disabled:hover:bg-transparent"
                  title="الصفحة السابقة"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>

                <span className="px-2 font-mono text-white text-xs font-bold">
                  {safeCurrentPage} / {totalPages}
                </span>

                <button
                  type="button"
                  disabled={safeCurrentPage >= totalPages}
                  onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                  className="p-1 rounded-lg hover:bg-slate-800 text-slate-300 disabled:opacity-40 disabled:hover:bg-transparent"
                  title="الصفحة التالية"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
              </div>
            )}

            <button
              type="button"
              onClick={onAddItem}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-teal-500/10 hover:bg-teal-500/20 text-teal-300 border border-teal-500/30 text-xs font-bold transition-all cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>إضافة صنف</span>
            </button>
          </div>
        </div>

        {/* Independent Scrollable Table Area (overflow-y-auto) */}
        <div className="overflow-x-auto overflow-y-auto max-h-[500px]">
          <table className="w-full text-right text-xs">
            <thead className="sticky top-0 z-10 bg-slate-950 border-b border-slate-800 text-slate-400 font-bold">
              <tr>
                <th className="p-3 w-10 text-center">#</th>
                <th className="p-3 min-w-[240px]">
                  <span>اسم الصنف</span>
                </th>

                {/* 🌟 ONLY FOR NEW ORDER */}
                {documentType === 'order' && (
                  <>
                    <th className="p-3 w-28 text-center">الكمية</th>
                    <th className="p-3 min-w-[160px]">ملاحظات الصنف</th>
                  </>
                )}

                {/* 🌟 ONLY FOR PURCHASE INVOICE */}
                {documentType === 'invoice' && (
                  <>
                    <th className="p-3 w-24 text-center">الكمية</th>
                    <th className="p-3 w-28 text-center">سعر الشراء</th>
                    <th className="p-3 w-28 text-center">
                      <span className="flex items-center justify-center gap-1 text-emerald-400">
                        <Clock className="w-3 h-3" />
                        <span>تاريخ الانتهاء</span>
                      </span>
                    </th>
                    <th className="p-3 w-28 text-center">الإجمالي</th>
                  </>
                )}

                {/* 🌟 ONLY FOR PRICE LIST (عروض سعر: صنف وسعر فقط!) */}
                {documentType === 'price_list' && (
                  <th className="p-3 w-36 text-center text-amber-400">
                    السعر
                  </th>
                )}

                <th className="p-3 w-14 text-center">حذف</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-800/60 bg-slate-900/50">
              {filteredItems.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-slate-500">
                    لا توجد أصناف مطابقة للبحث
                  </td>
                </tr>
              ) : (
                paginatedItems.map((item, idx) => {
                  const originalIndex = (extractedData.items || []).indexOf(item);
                  return (
                    <tr 
                      key={item.id || originalIndex}
                      className="hover:bg-slate-800/40 transition-colors group"
                    >
                      {/* # Index */}
                      <td className="p-3 text-center text-slate-500 font-mono">
                        {originalIndex + 1}
                      </td>

                      {/* Item Name */}
                      <td className="p-3">
                        <div className="space-y-1">
                          <input
                            type="text"
                            value={item.itemName}
                            onChange={(e) => onUpdateItem(originalIndex, 'itemName', e.target.value)}
                            className="w-full bg-slate-950/80 border border-slate-700/80 focus:border-teal-500 rounded-lg px-2.5 py-1.5 text-xs text-white font-bold outline-none"
                            placeholder="اسم الصنف الصيدلاني..."
                          />
                          {item.isUncertain && (
                            <span className="inline-flex items-center gap-1 text-[10px] text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20">
                              <AlertCircle className="w-2.5 h-2.5" />
                              <span>{item.uncertaintyReason || 'يرجى التأكد من اسم الصنف'}</span>
                            </span>
                          )}
                        </div>
                      </td>

                      {/* 🌟 NEW ORDER COLUMNS: Quantity & Notes */}
                      {documentType === 'order' && (
                        <>
                          <td className="p-3 text-center">
                            <input
                              type="number"
                              min="1"
                              value={item.quantity || 1}
                              onChange={(e) => onUpdateItem(originalIndex, 'quantity', Number(e.target.value) || 1)}
                              className="w-20 bg-slate-950/80 border border-slate-700/80 focus:border-teal-500 rounded-lg px-2 py-1.5 text-xs text-white font-bold text-center outline-none font-mono"
                            />
                          </td>
                          <td className="p-3">
                            <input
                              type="text"
                              value={item.notes || ''}
                              onChange={(e) => onUpdateItem(originalIndex, 'notes', e.target.value)}
                              placeholder="ملاحظة عن الصنف..."
                              className="w-full bg-slate-950/80 border border-slate-700/80 focus:border-teal-500 rounded-lg px-2.5 py-1.5 text-xs text-slate-300 outline-none"
                            />
                          </td>
                        </>
                      )}

                      {/* 🌟 PURCHASE INVOICE COLUMNS: Qty, Unit Price, Expiry, Total */}
                      {documentType === 'invoice' && (
                        <>
                          <td className="p-3 text-center">
                            <input
                              type="number"
                              min="1"
                              value={item.quantity || 1}
                              onChange={(e) => {
                                const q = Number(e.target.value) || 1;
                                onUpdateItem(originalIndex, 'quantity', q);
                                onUpdateItem(originalIndex, 'totalPrice', q * (item.unitPrice || 0));
                              }}
                              className="w-20 bg-slate-950/80 border border-slate-700/80 focus:border-teal-500 rounded-lg px-2 py-1.5 text-xs text-white font-bold text-center outline-none font-mono"
                            />
                          </td>
                          <td className="p-3 text-center">
                            <input
                              type="number"
                              min="0"
                              value={item.unitPrice || 0}
                              onChange={(e) => {
                                const p = Number(e.target.value) || 0;
                                onUpdateItem(originalIndex, 'unitPrice', p);
                                onUpdateItem(originalIndex, 'totalPrice', p * (item.quantity || 1));
                              }}
                              className="w-24 bg-slate-950/80 border border-slate-700/80 focus:border-teal-500 rounded-lg px-2 py-1.5 text-xs text-emerald-400 font-bold text-center outline-none font-mono"
                            />
                          </td>
                          <td className="p-3 text-center">
                            <input
                              type="text"
                              value={item.expiryDate || ''}
                              onChange={(e) => onUpdateItem(originalIndex, 'expiryDate', e.target.value)}
                              placeholder="2027-12 أو 12/27"
                              className="w-24 bg-slate-950/80 border border-slate-700/80 focus:border-teal-500 rounded-lg px-2 py-1.5 text-xs text-amber-300 text-center outline-none font-mono"
                            />
                          </td>
                          <td className="p-3 text-center font-mono font-bold text-slate-300">
                            {((Number(item.unitPrice) || 0) * (Number(item.quantity) || 1)).toLocaleString()}
                          </td>
                        </>
                      )}

                      {/* 🌟 PRICE LIST (عروض سعر): صنف وسعر فقط! */}
                      {documentType === 'price_list' && (
                        <td className="p-3 text-center">
                          <input
                            type="number"
                            min="0"
                            value={item.unitPrice || 0}
                            onChange={(e) => onUpdateItem(originalIndex, 'unitPrice', Number(e.target.value) || 0)}
                            className="w-32 bg-slate-950/80 border border-slate-700/80 focus:border-amber-500 rounded-lg px-3 py-1.5 text-xs text-amber-400 font-bold text-center outline-none font-mono"
                            placeholder="السعر..."
                          />
                        </td>
                      )}

                      {/* Delete Row */}
                      <td className="p-3 text-center">
                        <button
                          type="button"
                          onClick={() => onDeleteItem(originalIndex)}
                          className="p-1.5 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                          title="حذف هذا الصنف"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Bottom Status Footer */}
        <div className="p-4 bg-slate-950 border-t border-slate-800 flex flex-wrap items-center justify-between gap-3">
          <div className="text-xs text-slate-400">
            <span>القسم العلوي ثابت بالكامل ويمكنك تمرير القائمة السفلية بحرية لمطابقة أي سنف.</span>
          </div>

          <div className="flex items-center gap-2">
            {documentType === 'order' && (
              <button
                type="button"
                onClick={() => onConfirmOrder(partyInput || 'صيدلية النخبة', extractedData.items || [])}
                className="px-5 py-2 rounded-xl bg-gradient-to-r from-teal-500 to-cyan-600 hover:from-teal-400 hover:to-cyan-500 text-slate-950 font-black text-xs sm:text-sm flex items-center gap-2 shadow-lg cursor-pointer"
              >
                <Check className="w-4 h-4" />
                <span>اعتماد طلب الصيدلية</span>
              </button>
            )}

            {documentType === 'invoice' && (
              <button
                type="button"
                onClick={() => onConfirmInvoice(partyInput || 'مورد الفاتورة', extractedData.items || [], docNumberInput, docDateInput)}
                className="px-5 py-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-slate-950 font-black text-xs sm:text-sm flex items-center gap-2 shadow-lg cursor-pointer"
              >
                <Receipt className="w-4 h-4" />
                <span>حفظ وترحيل الفاتورة للمشتريات</span>
              </button>
            )}

            {documentType === 'price_list' && (
              <button
                type="button"
                onClick={() => onConfirmPriceList(partyInput || 'مورد الأسعار', extractedData.items || [], docDateInput)}
                className="px-5 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-slate-950 font-black text-xs sm:text-sm flex items-center gap-2 shadow-lg cursor-pointer"
              >
                <Save className="w-4 h-4" />
                <span>حفظ وتحديث أسعار السوق</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Fullscreen Image Modal */}
      {isFullscreenModal && currentImage && (
        <div className="fixed inset-0 z-50 bg-black/95 flex flex-col p-4 animate-in fade-in">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <span className="text-sm font-bold text-white">معاينة بملء الشاشة ({currentImage.name})</span>
            <button
              type="button"
              onClick={() => setIsFullscreenModal(false)}
              className="p-2 rounded-xl bg-slate-800 text-white hover:bg-slate-700"
            >
              <Minimize2 className="w-5 h-5" />
            </button>
          </div>
          <div className="flex-1 overflow-auto flex items-center justify-center p-4">
            <img
              src={currentImage.base64}
              alt="ملء الشاشة"
              className="max-h-full max-w-full object-contain"
            />
          </div>
        </div>
      )}
    </div>
  );
};
