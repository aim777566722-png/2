import React, { useState, useRef } from 'react';
import { 
  PurchaseInvoice, 
  PharmacyOrder, 
  MarketPriceRecord, 
  Supplier, 
  Medicine 
} from '../types';
import { Storage } from '../data/storage';
import { 
  formatCurrency, 
  formatDateAr,
  extractMedicineAttributes
} from '../utils/helpers';
import { 
  Menu, 
  Receipt, 
  FileCheck2, 
  Smartphone, 
  Settings, 
  RotateCcw, 
  HelpCircle, 
  ShieldCheck, 
  FolderTree, 
  Building2, 
  ChevronLeft, 
  ExternalLink,
  Info,
  Calendar,
  CheckCircle2,
  Trash2,
  Database,
  Search,
  ChevronDown,
  ChevronUp,
  Eye,
  Gift,
  Percent,
  Layers,
  ArrowUpRight,
  Filter,
  Download,
  Upload,
  AlertCircle
} from 'lucide-react';
import { InvoiceDetailsModal } from './InvoiceDetailsModal';

interface MoreViewProps {
  invoices: PurchaseInvoice[];
  orders: PharmacyOrder[];
  medicines: Medicine[];
  suppliers: Supplier[];
  marketPrices?: MarketPriceRecord[];
  onNavigate: (tab: string, id?: string) => void;
  onResetData: () => void;
  onDeleteInvoice?: (invoiceId: string) => void;
}

export const MoreView: React.FC<MoreViewProps> = ({
  invoices,
  orders,
  medicines,
  suppliers,
  marketPrices = [],
  onNavigate,
  onResetData,
  onDeleteInvoice
}) => {
  const [activeSection, setActiveSection] = useState<'menu' | 'invoices' | 'android'>('menu');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSupplierFilter, setSelectedSupplierFilter] = useState('all');
  const [expandedInvoiceIds, setExpandedInvoiceIds] = useState<Set<string>>(new Set());
  const [selectedInvoiceForModal, setSelectedInvoiceForModal] = useState<PurchaseInvoice | null>(null);

  const [backupStatus, setBackupStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleExportBackup = () => {
    try {
      const jsonString = Storage.exportAllData();
      const blob = new Blob([jsonString], { type: 'application/json;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      const dateStr = new Date().toISOString().split('T')[0];
      link.href = url;
      link.setAttribute('download', `purchasemate-backup-${dateStr}.json`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      setBackupStatus({
        type: 'success',
        message: 'تم تصدير النسخة الاحتياطية بنجاح وحفظها كملف JSON.'
      });
      setTimeout(() => setBackupStatus(null), 6000);
    } catch (err: any) {
      setBackupStatus({
        type: 'error',
        message: `فشل تصدير النسخة الاحتياطية: ${err?.message || 'خطأ غير معروف'}`
      });
    }
  };

  const handleImportBackup = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target?.result as string;
        const result = Storage.importAllData(text);
        if (result.success) {
          setBackupStatus({
            type: 'success',
            message: `تم استيراد النسخة الاحتياطية بنجاح! (${result.counts.medicines} دواء، ${result.counts.suppliers} مورد، ${result.counts.orders} طلبات، ${result.counts.invoices} فواتير). جاري تحديث الشاشة...`
          });
          setTimeout(() => {
            window.location.reload();
          }, 1500);
        } else {
          setBackupStatus({
            type: 'error',
            message: `فشل استيراد النسخة: ${result.error || 'صيغة ملف غير صالحة'}`
          });
        }
      } catch (err: any) {
        setBackupStatus({
          type: 'error',
          message: `خطأ أثناء قراءة الملف: ${err?.message || 'الملف تالف'}`
        });
      }
    };
    reader.readAsText(file);
    if (event.target) event.target.value = '';
  };

  const toggleInvoiceExpansion = (id: string) => {
    setExpandedInvoiceIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const filteredInvoices = invoices.filter(inv => {
    const matchesSearch = 
      (inv.invoiceNumber && inv.invoiceNumber.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (inv.supplierName && inv.supplierName.toLowerCase().includes(searchQuery.toLowerCase())) ||
      inv.items.some(item => item.itemName.toLowerCase().includes(searchQuery.toLowerCase()));

    const matchesSupplier = selectedSupplierFilter === 'all' || inv.supplierId === selectedSupplierFilter || inv.supplierName === selectedSupplierFilter;

    return matchesSearch && matchesSupplier;
  });

  const totalInvoicesAmount = invoices.reduce((sum, inv) => sum + (inv.totalAmount || 0), 0);
  const totalItemsCount = invoices.reduce((sum, inv) => sum + (inv.items?.length || 0), 0);

  return (
    <div className="space-y-6 pb-20 max-w-5xl mx-auto" dir="rtl">
      
      {/* Header */}
      <div>
        <h1 className="text-xl sm:text-2xl font-black text-white flex items-center gap-2">
          <Menu className="w-6 h-6 text-teal-400" />
          <span>المزيد والإعدادات</span>
        </h1>
        <p className="text-xs sm:text-sm text-slate-400 mt-1">
          سجل فواتير الشراء وتفاصيلها، مشروع أندرويد الأصلي، إعدادات الحساب والنسخ الاحتياطي.
        </p>
      </div>

      {activeSection === 'menu' && (
        <div className="space-y-4">
          
          {/* Backup Status Toast/Alert */}
          {backupStatus && (
            <div className={`p-4 rounded-2xl border flex items-center gap-3 text-xs sm:text-sm font-bold ${
              backupStatus.type === 'success' 
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' 
                : 'bg-rose-500/10 border-rose-500/30 text-rose-400'
            }`}>
              {backupStatus.type === 'success' ? <CheckCircle2 className="w-5 h-5 shrink-0" /> : <AlertCircle className="w-5 h-5 shrink-0" />}
              <span className="leading-relaxed">{backupStatus.message}</span>
            </div>
          )}

          {/* Backup & Data Management Card */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-5 sm:p-6 space-y-4 shadow-sm">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2.5 rounded-2xl bg-teal-500/10 text-teal-400 border border-teal-500/20">
                  <Database className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-sm sm:text-base font-bold text-white">النسخ الاحتياطي واستيراد البيانات</h2>
                  <p className="text-xs text-slate-400">حفظ ونقل بيانات الأدوية والموردين والطلبات والفواتير كملف محلي</p>
                </div>
              </div>
            </div>

            <p className="text-xs text-slate-400 leading-relaxed">
              تُحفظ كافة البيانات محلياً على جهازك لضمان الخصوصية والسرعة الفائقة. يوصى بتصدير نسخة احتياطية بشكل دوري لحفظ بياناتك قبل تغيير الهاتف أو إعادة تثبيت التطبيق.
            </p>

            {/* Hidden File Input for Backup Import */}
            <input 
              type="file" 
              ref={fileInputRef}
              onChange={handleImportBackup}
              accept=".json,application/json"
              className="hidden"
            />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <button
                type="button"
                onClick={handleExportBackup}
                className="py-3 px-4 rounded-2xl bg-teal-500/10 hover:bg-teal-500/20 text-teal-300 border border-teal-500/30 font-bold text-xs sm:text-sm flex items-center justify-center gap-2 cursor-pointer transition-all active:scale-95 shadow-sm"
              >
                <Download className="w-4 h-4 text-teal-400" />
                <span>تصدير نسخة احتياطية (JSON)</span>
              </button>

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="py-3 px-4 rounded-2xl bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 font-bold text-xs sm:text-sm flex items-center justify-center gap-2 cursor-pointer transition-all active:scale-95 shadow-sm"
              >
                <Upload className="w-4 h-4 text-indigo-400" />
                <span>استيراد نسخة احتياطية</span>
              </button>
            </div>
          </div>

          {/* Main Quick Links */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            
            {/* Link 1: Invoices History */}
            <div 
              onClick={() => setActiveSection('invoices')}
              className="p-5 rounded-3xl bg-slate-900/90 border border-slate-800 hover:border-teal-500/40 transition-all cursor-pointer group flex items-center justify-between shadow-sm"
            >
              <div className="flex items-center gap-3.5">
                <div className="p-3 rounded-2xl bg-teal-500/10 text-teal-400 border border-teal-500/20 group-hover:scale-105 transition-transform">
                  <Receipt className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-sm sm:text-base text-white">سجل فواتير الشراء والتفاصيل</h3>
                  <p className="text-xs text-slate-400 mt-0.5">{invoices.length} فواتير مسجلة ومطابقة ({formatCurrency(totalInvoicesAmount)})</p>
                </div>
              </div>
              <ChevronLeft className="w-5 h-5 text-slate-500 group-hover:text-teal-400 transition-colors" />
            </div>

            {/* Link 2: Android Native Code */}
            <div 
              onClick={() => setActiveSection('android')}
              className="p-5 rounded-3xl bg-slate-900/90 border border-slate-800 hover:border-emerald-500/40 transition-all cursor-pointer group flex items-center justify-between shadow-sm"
            >
              <div className="flex items-center gap-3.5">
                <div className="p-3 rounded-2xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 group-hover:scale-105 transition-transform">
                  <Smartphone className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-sm sm:text-base text-white">مشروع Android Native</h3>
                  <p className="text-xs text-emerald-400 font-medium mt-0.5">Kotlin + Jetpack Compose جاهز</p>
                </div>
              </div>
              <ChevronLeft className="w-5 h-5 text-slate-500 group-hover:text-emerald-400 transition-colors" />
            </div>

            {/* Link 3: Suppliers Directory */}
            <div 
              onClick={() => onNavigate('suppliers')}
              className="p-5 rounded-3xl bg-slate-900/90 border border-slate-800 hover:border-indigo-500/40 transition-all cursor-pointer group flex items-center justify-between shadow-sm"
            >
              <div className="flex items-center gap-3.5">
                <div className="p-3 rounded-2xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 group-hover:scale-105 transition-transform">
                  <Building2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-sm sm:text-base text-white">دليل مستودعات الأدوية</h3>
                  <p className="text-xs text-slate-400 mt-0.5">{suppliers.length} موردين معتمدين</p>
                </div>
              </div>
              <ChevronLeft className="w-5 h-5 text-slate-500 group-hover:text-indigo-400 transition-colors" />
            </div>

            {/* Link 4: Database & System Reset */}
            <div 
              onClick={onResetData}
              className="p-5 rounded-3xl bg-slate-900/90 border border-slate-800 hover:border-rose-500/40 transition-all cursor-pointer group flex items-center justify-between shadow-sm"
            >
              <div className="flex items-center gap-3.5">
                <div className="p-3 rounded-2xl bg-rose-500/10 text-rose-400 border border-rose-500/20 group-hover:scale-105 transition-transform">
                  <RotateCcw className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-sm sm:text-base text-white">إعادة تعيين البيانات الافتراضية</h3>
                  <p className="text-xs text-slate-400 mt-0.5">استعادة النماذج والأصناف التجريبية</p>
                </div>
              </div>
              <ChevronLeft className="w-5 h-5 text-slate-500 group-hover:text-rose-400 transition-colors" />
            </div>

          </div>

          {/* Application Info Box */}
          <div className="bg-slate-900/60 border border-slate-800 rounded-3xl p-5 sm:p-6 space-y-3">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-teal-400" />
              <h2 className="text-sm font-bold text-white">عن نظام «مساعد المشتريات»</h2>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              نظام مخصص لمسؤولي مشتريات الصيدليات لإدارة طلبات الشراء، كشف أفضل عروض الأسعار في السوق، استخراج بيانات الفواتير بالذكاء الاصطناعي، ومطابقة الكميات لحساب التوفير المالي المحقق بدقة واحترافية.
            </p>
            <div className="flex items-center justify-between pt-2 border-t border-slate-800/80 text-[11px] text-slate-500">
              <span>الإصدار: 1.0.0 (Material 3 Native UX)</span>
              <span>يعمل بنمط Offline-First مع دعم المعالجة في الخلفية</span>
            </div>
          </div>

        </div>
      )}

      {/* Invoices History Section */}
      {activeSection === 'invoices' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <button
              onClick={() => setActiveSection('menu')}
              className="text-xs text-teal-400 hover:text-teal-300 font-bold flex items-center gap-1 cursor-pointer self-start"
            >
              <ChevronLeft className="w-4 h-4 rotate-180" />
              <span>العودة لقائمة المزيد</span>
            </button>

            <button
              onClick={() => onNavigate('invoice-intake')}
              className="px-3.5 py-1.5 rounded-xl bg-teal-500 hover:bg-teal-400 text-slate-950 font-bold text-xs cursor-pointer shadow-md transition-all active:scale-95 flex items-center gap-1.5 self-start sm:self-auto"
            >
              <Receipt className="w-4 h-4" />
              <span>+ تسجيل فاتورة شراء جديدة</span>
            </button>
          </div>

          {/* Stats Bar */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-4 rounded-2xl bg-slate-900/90 border border-slate-800 space-y-1">
              <span className="text-[11px] text-slate-400 font-bold block">إجمالي الفواتير</span>
              <p className="text-base sm:text-lg font-black text-white font-mono">{invoices.length} <span className="text-xs font-sans text-slate-400">فاتورة</span></p>
            </div>
            <div className="p-4 rounded-2xl bg-slate-900/90 border border-slate-800 space-y-1">
              <span className="text-[11px] text-slate-400 font-bold block">إجمالي المشتريات</span>
              <p className="text-base sm:text-lg font-black text-emerald-400 font-mono">{formatCurrency(totalInvoicesAmount)}</p>
            </div>
            <div className="p-4 rounded-2xl bg-slate-900/90 border border-slate-800 space-y-1">
              <span className="text-[11px] text-slate-400 font-bold block">إجمالي البنود المشتراة</span>
              <p className="text-base sm:text-lg font-black text-teal-400 font-mono">{totalItemsCount} <span className="text-xs font-sans text-slate-400">صنف</span></p>
            </div>
            <div className="p-4 rounded-2xl bg-slate-900/90 border border-slate-800 space-y-1">
              <span className="text-[11px] text-slate-400 font-bold block">الموردين المسجلين</span>
              <p className="text-base sm:text-lg font-black text-indigo-400 font-mono">{suppliers.length} <span className="text-xs font-sans text-slate-400">مستودع</span></p>
            </div>
          </div>

          {/* Search & Filter Toolbar */}
          <div className="p-3 rounded-2xl bg-slate-900/80 border border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="relative w-full sm:w-72">
              <Search className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="بحث برقم الفاتورة، المورد، أو اسم الدواء..."
                className="w-full bg-slate-950 border border-slate-800 rounded-xl pr-9 pl-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-teal-500"
              />
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto">
              <Filter className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <select
                value={selectedSupplierFilter}
                onChange={e => setSelectedSupplierFilter(e.target.value)}
                className="bg-slate-950 border border-slate-800 text-slate-200 text-xs rounded-xl px-3 py-1.5 focus:outline-none focus:border-teal-500 cursor-pointer w-full sm:w-auto"
              >
                <option value="all">كافة الموردين ({invoices.length})</option>
                {suppliers.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Invoices List */}
          <div className="space-y-3.5">
            {filteredInvoices.length === 0 ? (
              <div className="text-center py-12 bg-slate-900/60 rounded-3xl border border-slate-800 text-xs text-slate-400">
                {invoices.length === 0 ? 'لا توجد فواتير مسجلة حتى الآن.' : 'لا توجد فواتير مطابقة للبحث أو المورد المختار.'}
              </div>
            ) : (
              filteredInvoices.map(inv => {
                const isExpanded = expandedInvoiceIds.has(inv.id);
                const matchedOrder = orders.find(o => o.id === inv.matchedOrderId || o.matchedInvoiceId === inv.id);

                return (
                  <div
                    key={inv.id}
                    className="p-5 rounded-3xl bg-slate-900/90 border border-slate-800 hover:border-teal-500/40 transition-all space-y-4 shadow-sm"
                  >
                    {/* Top Row: Supplier & Invoice Number & Total */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-sm sm:text-base text-white">{inv.supplierName}</span>
                          <span className="text-xs px-2 py-0.5 rounded-md bg-slate-800 text-teal-300 font-mono font-bold border border-slate-700">
                            {inv.invoiceNumber}
                          </span>
                          {matchedOrder && (
                            <span className="text-[10px] px-2 py-0.5 rounded-md bg-emerald-500/15 text-emerald-300 font-bold border border-emerald-500/30">
                              مطابقة مع طلب: {matchedOrder.orderNumber}
                            </span>
                          )}
                        </div>

                        <div className="text-xs text-slate-400 flex items-center gap-2 flex-wrap">
                          <span className="flex items-center gap-1">
                            <Calendar className="w-3.5 h-3.5 text-slate-500" />
                            <span>{formatDateAr(inv.invoiceDate)}</span>
                          </span>
                          <span>•</span>
                          <span>{inv.items.length} أصناف</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 self-end sm:self-center">
                        <div className="text-left sm:text-right">
                          <div className="text-[11px] text-slate-400">إجمالي الفاتورة</div>
                          <div className="text-base sm:text-lg font-black text-emerald-400 font-mono">
                            {formatCurrency(inv.totalAmount)}
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => setSelectedInvoiceForModal(inv)}
                          className="px-3 py-2 rounded-xl bg-teal-500/15 hover:bg-teal-500/25 text-teal-300 border border-teal-500/30 text-xs font-bold flex items-center gap-1 cursor-pointer transition-colors shadow-sm"
                          title="عرض تفاصيل الفاتورة كاملة"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>التفاصيل</span>
                        </button>
                      </div>
                    </div>

                    {/* Inline Quick Items Preview or Full Table */}
                    <div className="border-t border-slate-800/80 pt-3">
                      <div className="flex items-center justify-between mb-2">
                        <button
                          type="button"
                          onClick={() => toggleInvoiceExpansion(inv.id)}
                          className="text-xs text-slate-300 hover:text-teal-300 font-bold flex items-center gap-1.5 cursor-pointer"
                        >
                          <span>{isExpanded ? 'إخفاء جدول الأصناف التفصيلي' : `عرض جدول أصناف الفاتورة (${inv.items.length})`}</span>
                          {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                        </button>

                        <span className="text-[11px] text-slate-500">
                          {inv.items.reduce((sum, it) => sum + (it.quantity || 0), 0)} علبة إجمالاً
                        </span>
                      </div>

                      {isExpanded ? (
                        <div className="overflow-x-auto rounded-2xl border border-slate-800 bg-slate-950/80 mt-2">
                          <table className="w-full text-right text-xs">
                            <thead>
                              <tr className="bg-slate-900 text-slate-400 border-b border-slate-800 text-[11px]">
                                <th className="py-2.5 px-3 text-center font-bold">#</th>
                                <th className="py-2.5 px-3 font-bold">اسم الصنف والمواصفات</th>
                                <th className="py-2.5 px-3 text-center font-bold">الكمية</th>
                                <th className="py-2.5 px-3 text-center font-bold">سعر الوحدة</th>
                                <th className="py-2.5 px-3 text-center font-bold">بونص / خصم</th>
                                <th className="py-2.5 px-3 text-left font-bold font-mono">الإجمالي</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-800/60">
                              {inv.items.map((item, idx) => {
                                const attrs = extractMedicineAttributes(item.itemName);
                                return (
                                  <tr key={item.id || idx} className="hover:bg-slate-900/50">
                                    <td className="py-2 px-3 text-center font-mono text-slate-500">{idx + 1}</td>
                                    <td className="py-2 px-3 font-bold text-slate-200">
                                      <div className="flex items-center gap-1.5 flex-wrap">
                                        <span>{item.itemName}</span>
                                        {attrs.strengthBadge && (
                                          <span className="px-1.5 py-0.5 rounded bg-teal-500/15 text-teal-300 text-[10px] font-mono">
                                            {attrs.strengthBadge}
                                          </span>
                                        )}
                                      </div>
                                    </td>
                                    <td className="py-2 px-3 text-center font-bold text-teal-400 font-mono">{item.quantity}</td>
                                    <td className="py-2 px-3 text-center font-mono text-slate-300">{formatCurrency(item.unitPrice)}</td>
                                    <td className="py-2 px-3 text-center">
                                      {item.bonusScheme ? (
                                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300 font-bold">
                                          +{item.bonusScheme}
                                        </span>
                                      ) : item.discountPercent ? (
                                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-500/15 text-indigo-300 font-bold">
                                          {item.discountPercent}%
                                        </span>
                                      ) : <span className="text-slate-600">-</span>}
                                    </td>
                                    <td className="py-2 px-3 text-left font-mono font-bold text-emerald-400">
                                      {formatCurrency(item.totalPrice || (item.quantity * item.unitPrice))}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      ) : (
                        <div className="flex flex-wrap gap-1.5 pt-1">
                          {inv.items.slice(0, 6).map(item => (
                            <span key={item.id} className="text-xs bg-slate-950 px-2.5 py-1 rounded-xl text-slate-300 border border-slate-800">
                              {item.itemName} ({item.quantity} × {formatCurrency(item.unitPrice)})
                            </span>
                          ))}
                          {inv.items.length > 6 && (
                            <span 
                              onClick={() => toggleInvoiceExpansion(inv.id)}
                              className="text-xs bg-teal-500/10 text-teal-300 px-2.5 py-1 rounded-xl border border-teal-500/20 cursor-pointer font-bold"
                            >
                              +{inv.items.length - 6} أصناف أخرى...
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* Android Native Source Code Info */}
      {activeSection === 'android' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <button
              onClick={() => setActiveSection('menu')}
              className="text-xs text-teal-400 hover:text-teal-300 font-bold flex items-center gap-1 cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4 rotate-180" />
              <span>العودة لقائمة المزيد</span>
            </button>
          </div>

          <div className="bg-slate-900/90 border border-emerald-500/30 rounded-3xl p-6 space-y-4 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-2xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                <Smartphone className="w-7 h-7" />
              </div>
              <div>
                <h2 className="text-lg sm:text-xl font-bold text-white">مشروع أندرويد الأصلي (Kotlin + Jetpack Compose)</h2>
                <p className="text-xs text-slate-400 mt-0.5">جاهز للتصدير والتشغيل المباشر داخل Android Studio</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2 text-xs">
              <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-1">
                <span className="font-bold text-teal-400">1. لغة البرمجة وواجهة المستخدم</span>
                <p className="text-slate-300">Kotlin 2.1.0 مع Jetpack Compose Material 3 وتنسيق RTL عربي كامل.</p>
              </div>

              <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-1">
                <span className="font-bold text-emerald-400">2. المعمارية (Architecture)</span>
                <p className="text-slate-300">نمط MVVM مع StateFlows ومستودعات البيانات (Repository Pattern).</p>
              </div>

              <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-1">
                <span className="font-bold text-amber-400">3. إدارة الحزم (Version Catalog)</span>
                <p className="text-slate-300">ملف <code>libs.versions.toml</code> لإدارة حزم Compose و Coroutines و Navigation.</p>
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-slate-950/80 border border-slate-800 text-xs text-slate-300 space-y-2">
              <div className="font-bold text-white flex items-center gap-2">
                <FolderTree className="w-4 h-4 text-teal-400" />
                <span>مسار ملفات أندرويد الأصلية المحفوظة في المستودع:</span>
              </div>
              <code className="text-teal-300 bg-slate-900 px-3.5 py-2 rounded-xl block font-mono text-xs" dir="ltr">
                /android/app/src/main/java/com/pharmacy/purchasemate/...
              </code>
            </div>
          </div>
        </div>
      )}

      {/* Invoice Details Modal */}
      <InvoiceDetailsModal
        invoice={selectedInvoiceForModal}
        isOpen={!!selectedInvoiceForModal}
        onClose={() => setSelectedInvoiceForModal(null)}
        orders={orders}
        marketPrices={marketPrices}
        medicines={medicines}
        onNavigateToOrder={(orderId) => {
          setSelectedInvoiceForModal(null);
          onNavigate('orders', orderId);
        }}
        onNavigateToReconciliation={(orderId) => {
          setSelectedInvoiceForModal(null);
          onNavigate('reconciliation', orderId);
        }}
        onDeleteInvoice={onDeleteInvoice}
      />

    </div>
  );
};

