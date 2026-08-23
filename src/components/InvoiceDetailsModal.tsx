import React, { useState } from 'react';
import { PurchaseInvoice, PharmacyOrder, MarketPriceRecord, Medicine } from '../types';
import { 
  formatCurrency, 
  formatDateAr, 
  extractMedicineAttributes,
  computeMedicinePriceSummary 
} from '../utils/helpers';
import { 
  Receipt, 
  Building2, 
  Calendar, 
  DollarSign, 
  X, 
  Printer, 
  FileCheck2, 
  CheckCircle2, 
  AlertTriangle, 
  Tag, 
  Gift, 
  Percent, 
  ArrowLeft,
  Share2,
  Trash2,
  Layers,
  ChevronLeft
} from 'lucide-react';

interface InvoiceDetailsModalProps {
  invoice: PurchaseInvoice | null;
  isOpen: boolean;
  onClose: () => void;
  orders?: PharmacyOrder[];
  marketPrices?: MarketPriceRecord[];
  medicines?: Medicine[];
  onNavigateToOrder?: (orderId: string) => void;
  onNavigateToReconciliation?: (orderId: string) => void;
  onDeleteInvoice?: (invoiceId: string) => void;
}

export const InvoiceDetailsModal: React.FC<InvoiceDetailsModalProps> = ({
  invoice,
  isOpen,
  onClose,
  orders = [],
  marketPrices = [],
  medicines = [],
  onNavigateToOrder,
  onNavigateToReconciliation,
  onDeleteInvoice
}) => {
  if (!isOpen || !invoice) return null;

  const matchedOrder = orders.find(o => o.id === invoice.matchedOrderId || o.matchedInvoiceId === invoice.id);
  const itemsCount = invoice.items?.length || 0;
  const totalQuantity = (invoice.items || []).reduce((sum, it) => sum + (it.quantity || 0), 0);
  const itemsWithBonus = (invoice.items || []).filter(it => it.bonusScheme && it.bonusScheme.trim() !== '');

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200" dir="rtl">
      <div className="w-full max-w-3xl max-h-[90vh] bg-slate-900 border border-slate-700/80 rounded-3xl shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-150">
        
        {/* Header */}
        <div className="p-5 sm:p-6 border-b border-slate-800 bg-slate-950/60 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-2xl bg-teal-500/10 text-teal-400 border border-teal-500/20">
              <Receipt className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base sm:text-lg font-black text-white">
                  تفاصيل فاتورة الشراء
                </h2>
                <span className="px-2.5 py-0.5 rounded-lg bg-teal-500/15 border border-teal-500/30 text-teal-300 text-xs font-mono font-bold">
                  {invoice.invoiceNumber || 'بدون رقم'}
                </span>
              </div>
              <div className="flex items-center gap-3 text-xs text-slate-400 mt-1 flex-wrap">
                <span className="flex items-center gap-1">
                  <Building2 className="w-3.5 h-3.5 text-slate-500" />
                  <strong className="text-slate-200">{invoice.supplierName}</strong>
                </span>
                <span>•</span>
                <span className="flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5 text-slate-500" />
                  <span>{formatDateAr(invoice.invoiceDate)}</span>
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors cursor-pointer"
              title="طباعة الفاتورة"
            >
              <Printer className="w-4 h-4" />
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors cursor-pointer"
              title="إغلاق"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Body Content */}
        <div className="p-5 sm:p-6 overflow-y-auto space-y-6 flex-1">
          
          {/* Summary Stats Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3.5 rounded-2xl bg-slate-950/80 border border-slate-800 space-y-1">
              <span className="text-[11px] text-slate-400 font-bold block">إجمالي الفاتورة</span>
              <p className="text-base sm:text-lg font-black text-emerald-400 font-mono">
                {formatCurrency(invoice.totalAmount)}
              </p>
            </div>

            <div className="p-3.5 rounded-2xl bg-slate-950/80 border border-slate-800 space-y-1">
              <span className="text-[11px] text-slate-400 font-bold block">عدد الأصناف</span>
              <p className="text-base sm:text-lg font-black text-slate-100 font-mono">
                {itemsCount} <span className="text-xs text-slate-400">صنف</span>
              </p>
            </div>

            <div className="p-3.5 rounded-2xl bg-slate-950/80 border border-slate-800 space-y-1">
              <span className="text-[11px] text-slate-400 font-bold block">إجمالي العلب/الوحدات</span>
              <p className="text-base sm:text-lg font-black text-teal-400 font-mono">
                {totalQuantity} <span className="text-xs text-slate-400">علبة</span>
              </p>
            </div>

            <div className="p-3.5 rounded-2xl bg-slate-950/80 border border-slate-800 space-y-1">
              <span className="text-[11px] text-slate-400 font-bold block">عروض البونص المطبقة</span>
              <p className="text-base sm:text-lg font-black text-indigo-400 font-mono">
                {itemsWithBonus.length} <span className="text-xs text-slate-400">بنود بونص</span>
              </p>
            </div>
          </div>

          {/* Matched Order Linked Banner */}
          {matchedOrder && (
            <div className="p-4 rounded-2xl bg-teal-950/30 border border-teal-500/30 flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2.5">
                <FileCheck2 className="w-5 h-5 text-teal-400 shrink-0" />
                <div>
                  <span className="text-xs text-teal-200 font-bold block">
                    الفاتورة مطابقة مع طلب الصيدلية: <strong className="text-white font-mono">{matchedOrder.orderNumber}</strong> ({matchedOrder.pharmacyName})
                  </span>
                  <span className="text-[11px] text-teal-400/80">
                    تم التحقق من استلام أصناف الطلب بنجاح.
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {onNavigateToOrder && (
                  <button
                    onClick={() => {
                      onClose();
                      onNavigateToOrder(matchedOrder.id);
                    }}
                    className="px-3 py-1.5 rounded-xl bg-teal-500/20 hover:bg-teal-500/30 text-teal-300 text-xs font-bold border border-teal-500/40 cursor-pointer"
                  >
                    عرض الطلب
                  </button>
                )}
                {onNavigateToReconciliation && (
                  <button
                    onClick={() => {
                      onClose();
                      onNavigateToReconciliation(matchedOrder.id);
                    }}
                    className="px-3 py-1.5 rounded-xl bg-teal-500 text-slate-950 text-xs font-black cursor-pointer shadow-sm"
                  >
                    تقرير المطابقة والتوفير
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Itemized Table */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs sm:text-sm font-bold text-white flex items-center gap-2">
                <Tag className="w-4 h-4 text-teal-400" />
                <span>جدول الأصناف والأسعار المفوترة ({itemsCount})</span>
              </h3>
              <span className="text-[11px] text-slate-400 font-medium">الأسعار تشمل الخصومات والبونص</span>
            </div>

            <div className="overflow-x-auto rounded-2xl border border-slate-800 bg-slate-950/70">
              <table className="w-full text-right text-xs">
                <thead>
                  <tr className="bg-slate-900 text-slate-400 border-b border-slate-800 text-[11px]">
                    <th className="py-3 px-3.5 text-center font-bold">#</th>
                    <th className="py-3 px-3.5 font-bold">اسم الصنف الدوائي والمواصفات</th>
                    <th className="py-3 px-3.5 text-center font-bold">الكمية</th>
                    <th className="py-3 px-3.5 text-center font-bold">سعر الوحدة</th>
                    <th className="py-3 px-3.5 text-center font-bold">البونص / الخصم</th>
                    <th className="py-3 px-3.5 text-left font-bold font-mono">الإجمالي</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {(invoice.items || []).map((item, idx) => {
                    const attrs = extractMedicineAttributes(item.itemName);
                    const summary = computeMedicinePriceSummary(item.matchedMedicineId || '', item.itemName, marketPrices, medicines);
                    const isBestPrice = summary && item.unitPrice <= summary.lowestPrice;

                    return (
                      <tr key={item.id || idx} className="hover:bg-slate-900/60 transition-colors">
                        <td className="py-3 px-3.5 text-center font-mono text-slate-500 font-bold">
                          {idx + 1}
                        </td>
                        <td className="py-3 px-3.5 font-bold text-slate-100">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span>{item.itemName}</span>
                              {attrs.strengthBadge && (
                                <span className="px-2 py-0.5 rounded-lg bg-teal-500/15 border border-teal-500/30 text-teal-300 text-[10px] font-mono font-bold">
                                  {attrs.strengthBadge}
                                </span>
                              )}
                              {attrs.formBadge && (
                                <span className="px-2 py-0.5 rounded-lg bg-indigo-500/15 border border-indigo-500/30 text-indigo-300 text-[10px] font-bold">
                                  {attrs.formBadge}
                                </span>
                              )}
                            </div>

                            {isBestPrice && (
                              <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-md bg-emerald-500/15 text-emerald-300 border border-emerald-500/25 font-bold">
                                <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                                أفضل سعر مسجل في السوق لهذا الصنف
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-3 px-3.5 text-center font-bold text-teal-400 font-mono">
                          {item.quantity}
                        </td>
                        <td className="py-3 px-3.5 text-center font-mono font-bold text-slate-200">
                          {formatCurrency(item.unitPrice)}
                        </td>
                        <td className="py-3 px-3.5 text-center">
                          {item.bonusScheme ? (
                            <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-lg bg-emerald-500/15 text-emerald-300 font-bold border border-emerald-500/25">
                              <Gift className="w-3 h-3" />
                              بونص {item.bonusScheme}
                            </span>
                          ) : item.discountPercent ? (
                            <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-lg bg-indigo-500/15 text-indigo-300 font-bold border border-indigo-500/25">
                              <Percent className="w-3 h-3" />
                              خصم {item.discountPercent}%
                            </span>
                          ) : (
                            <span className="text-slate-600">-</span>
                          )}
                        </td>
                        <td className="py-3 px-3.5 text-left font-mono font-black text-emerald-400">
                          {formatCurrency(item.totalPrice || (item.quantity * item.unitPrice))}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="bg-slate-900/90 border-t-2 border-slate-700 font-bold">
                    <td colSpan={2} className="py-3.5 px-4 text-slate-300">
                      الإجمالي النهائي للفاتورة
                    </td>
                    <td className="py-3.5 px-3.5 text-center text-teal-400 font-mono">
                      {totalQuantity} علبة
                    </td>
                    <td colSpan={2} className="py-3.5 px-3.5 text-slate-400 text-[11px] text-center">
                      {itemsCount} أصناف مفوترة
                    </td>
                    <td className="py-3.5 px-4 text-left font-black text-base text-emerald-400 font-mono">
                      {formatCurrency(invoice.totalAmount)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* Notes if any */}
          {invoice.notes && (
            <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 space-y-1">
              <span className="text-[11px] font-bold text-slate-400">ملاحظات الفاتورة:</span>
              <p className="text-xs text-slate-300">{invoice.notes}</p>
            </div>
          )}

        </div>

        {/* Footer Actions */}
        <div className="p-4 sm:p-5 border-t border-slate-800 bg-slate-950/80 flex items-center justify-between gap-3 flex-wrap">
          {onDeleteInvoice ? (
            <button
              onClick={() => {
                if (window.confirm(`هل أنت متأكد من حذف فاتورة ${invoice.invoiceNumber || 'المحددة'}؟`)) {
                  onDeleteInvoice(invoice.id);
                  onClose();
                }
              }}
              className="px-3.5 py-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 text-xs font-bold border border-rose-500/30 flex items-center gap-1.5 cursor-pointer transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>حذف الفاتورة</span>
            </button>
          ) : <div />}

          <button
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold cursor-pointer transition-colors"
          >
            إغلاق
          </button>
        </div>

      </div>
    </div>
  );
};
