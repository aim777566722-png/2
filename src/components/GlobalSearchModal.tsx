import React, { useState, useEffect, useRef } from 'react';
import { 
  Search, 
  X, 
  ShoppingCart, 
  Layers, 
  Building2, 
  Receipt, 
  ArrowLeft,
  ChevronLeft,
  DollarSign
} from 'lucide-react';
import { Medicine, PharmacyOrder, PurchaseInvoice, Supplier, MarketPriceRecord } from '../types';
import { formatCurrency, formatDateAr } from '../utils/helpers';

interface GlobalSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  medicines: Medicine[];
  orders: PharmacyOrder[];
  invoices: PurchaseInvoice[];
  suppliers: Supplier[];
  marketPrices: MarketPriceRecord[];
  onNavigate: (tab: string, id?: string) => void;
}

export const GlobalSearchModal: React.FC<GlobalSearchModalProps> = ({
  isOpen,
  onClose,
  medicines,
  orders,
  invoices,
  suppliers,
  marketPrices,
  onNavigate
}) => {
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
    } else {
      setQuery('');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const cleanQuery = query.trim().toLowerCase();

  // Filter items
  const matchedMedicines = cleanQuery 
    ? medicines.filter(m => m.name.toLowerCase().includes(cleanQuery) || m.scientificName?.toLowerCase().includes(cleanQuery))
    : [];

  const matchedOrders = cleanQuery 
    ? orders.filter(o => o.pharmacyName.toLowerCase().includes(cleanQuery) || o.orderNumber.toLowerCase().includes(cleanQuery) || o.items.some(i => i.matchedMedicineName.toLowerCase().includes(cleanQuery)))
    : [];

  const matchedSuppliers = cleanQuery 
    ? suppliers.filter(s => s.name.toLowerCase().includes(cleanQuery) || s.phone?.includes(cleanQuery))
    : [];

  const matchedInvoices = cleanQuery 
    ? invoices.filter(inv => inv.invoiceNumber.toLowerCase().includes(cleanQuery) || inv.supplierName.toLowerCase().includes(cleanQuery) || inv.items.some(i => i.itemName.toLowerCase().includes(cleanQuery)))
    : [];

  const matchedPrices = cleanQuery 
    ? marketPrices.filter(p => p.medicineName.toLowerCase().includes(cleanQuery) || p.supplierName.toLowerCase().includes(cleanQuery))
    : [];

  const totalResults = matchedMedicines.length + matchedOrders.length + matchedSuppliers.length + matchedInvoices.length + matchedPrices.length;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-16 sm:pt-24 p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-150" dir="rtl">
      <div 
        className="w-full max-w-2xl bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[80vh]"
        onClick={e => e.stopPropagation()}
      >
        {/* Search Header */}
        <div className="p-4 border-b border-slate-800 flex items-center gap-3 bg-slate-950/50">
          <Search className="w-5 h-5 text-teal-400 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="ابحث عن صنف دوائي، صيدلية، مورد، فاتورة، أو سعر سوق..."
            className="w-full bg-transparent text-sm sm:text-base text-slate-100 placeholder:text-slate-500 focus:outline-none"
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              className="p-1 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          )}
          <button
            onClick={onClose}
            className="px-2.5 py-1 text-xs rounded-lg bg-slate-800 text-slate-400 hover:text-slate-200 cursor-pointer border border-slate-700"
          >
            إغلاق (Esc)
          </button>
        </div>

        {/* Results Container */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {!cleanQuery ? (
            <div className="text-center py-10 text-slate-500 text-xs space-y-2">
              <Search className="w-8 h-8 mx-auto text-slate-600" />
              <p className="text-slate-400 font-medium">ابدأ بالكتابة للبحث الشامل في كافة بيانات النظام</p>
              <div className="flex flex-wrap items-center justify-center gap-1.5 pt-2">
                <span className="text-[11px] bg-slate-800 text-slate-300 px-2.5 py-1 rounded-full cursor-pointer hover:bg-slate-700" onClick={() => setQuery('بندول')}>
                  بندول
                </span>
                <span className="text-[11px] bg-slate-800 text-slate-300 px-2.5 py-1 rounded-full cursor-pointer hover:bg-slate-700" onClick={() => setQuery('زواجرا')}>
                  زواجرا
                </span>
                <span className="text-[11px] bg-slate-800 text-slate-300 px-2.5 py-1 rounded-full cursor-pointer hover:bg-slate-700" onClick={() => setQuery('الشفاء')}>
                  شركة الشفاء
                </span>
                <span className="text-[11px] bg-slate-800 text-slate-300 px-2.5 py-1 rounded-full cursor-pointer hover:bg-slate-700" onClick={() => setQuery('النخبة')}>
                  صيدلية النخبة
                </span>
              </div>
            </div>
          ) : totalResults === 0 ? (
            <div className="text-center py-10 text-slate-500 text-xs">
              لم يتم العثور على نتائج تطابق: "{query}"
            </div>
          ) : (
            <div className="space-y-4">
              {/* Matched Medicines */}
              {matchedMedicines.length > 0 && (
                <div className="space-y-2">
                  <div className="text-[11px] font-bold text-teal-400 uppercase tracking-wider flex items-center gap-1.5">
                    <Layers className="w-3.5 h-3.5" />
                    <span>الأصناف الدوائية ({matchedMedicines.length})</span>
                  </div>
                  <div className="space-y-1.5">
                    {matchedMedicines.map(med => (
                      <div
                        key={med.id}
                        onClick={() => {
                          onNavigate('market-prices');
                          onClose();
                        }}
                        className="p-3 rounded-xl bg-slate-800/60 hover:bg-slate-800 border border-slate-700/50 flex items-center justify-between cursor-pointer transition-colors"
                      >
                        <div>
                          <div className="font-bold text-xs sm:text-sm text-slate-200">{med.name}</div>
                          <div className="text-[11px] text-slate-400">{med.scientificName || med.category || 'دواء مسجل'}</div>
                        </div>
                        <div className="text-xs text-teal-400 flex items-center gap-1">
                          <span>عرض الأسعار</span>
                          <ChevronLeft className="w-3.5 h-3.5" />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Matched Orders */}
              {matchedOrders.length > 0 && (
                <div className="space-y-2">
                  <div className="text-[11px] font-bold text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
                    <ShoppingCart className="w-3.5 h-3.5" />
                    <span>الطلبات ({matchedOrders.length})</span>
                  </div>
                  <div className="space-y-1.5">
                    {matchedOrders.map(order => (
                      <div
                        key={order.id}
                        onClick={() => {
                          onNavigate('price-comparison', order.id);
                          onClose();
                        }}
                        className="p-3 rounded-xl bg-slate-800/60 hover:bg-slate-800 border border-slate-700/50 flex items-center justify-between cursor-pointer transition-colors"
                      >
                        <div>
                          <div className="font-bold text-xs sm:text-sm text-slate-200">{order.pharmacyName} ({order.orderNumber})</div>
                          <div className="text-[11px] text-slate-400">{order.items.length} أصناف • {formatDateAr(order.orderDate)}</div>
                        </div>
                        <div className="text-xs text-amber-400 flex items-center gap-1">
                          <span>مقارنة الأسعار</span>
                          <ChevronLeft className="w-3.5 h-3.5" />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Matched Suppliers */}
              {matchedSuppliers.length > 0 && (
                <div className="space-y-2">
                  <div className="text-[11px] font-bold text-indigo-400 uppercase tracking-wider flex items-center gap-1.5">
                    <Building2 className="w-3.5 h-3.5" />
                    <span>الموردون ({matchedSuppliers.length})</span>
                  </div>
                  <div className="space-y-1.5">
                    {matchedSuppliers.map(sup => (
                      <div
                        key={sup.id}
                        onClick={() => {
                          onNavigate('suppliers');
                          onClose();
                        }}
                        className="p-3 rounded-xl bg-slate-800/60 hover:bg-slate-800 border border-slate-700/50 flex items-center justify-between cursor-pointer transition-colors"
                      >
                        <div>
                          <div className="font-bold text-xs sm:text-sm text-slate-200">{sup.name}</div>
                          <div className="text-[11px] text-slate-400">{sup.phone || sup.address || 'مورد مسجل'}</div>
                        </div>
                        <div className="text-xs text-indigo-400 flex items-center gap-1">
                          <span>عرض المورد</span>
                          <ChevronLeft className="w-3.5 h-3.5" />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Matched Invoices */}
              {matchedInvoices.length > 0 && (
                <div className="space-y-2">
                  <div className="text-[11px] font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
                    <Receipt className="w-3.5 h-3.5" />
                    <span>فواتير الشراء ({matchedInvoices.length})</span>
                  </div>
                  <div className="space-y-1.5">
                    {matchedInvoices.map(inv => (
                      <div
                        key={inv.id}
                        onClick={() => {
                          onNavigate('more');
                          onClose();
                        }}
                        className="p-3 rounded-xl bg-slate-800/60 hover:bg-slate-800 border border-slate-700/50 flex items-center justify-between cursor-pointer transition-colors"
                      >
                        <div>
                          <div className="font-bold text-xs sm:text-sm text-slate-200">{inv.supplierName} • {inv.invoiceNumber}</div>
                          <div className="text-[11px] text-slate-400">{formatCurrency(inv.totalAmount)} • {formatDateAr(inv.invoiceDate)}</div>
                        </div>
                        <div className="text-xs text-emerald-400 flex items-center gap-1">
                          <span>عرض الفاتورة</span>
                          <ChevronLeft className="w-3.5 h-3.5" />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
