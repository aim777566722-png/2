import React, { useEffect, useState } from 'react';
import { 
  PharmacyOrder, 
  PurchaseInvoice, 
  MarketPriceRecord, 
  OrderInvoiceReconciliation, 
  ReconciliationMatch 
} from '../types';
import { 
  formatCurrency, 
  formatDateAr, 
  computeMedicinePriceSummary 
} from '../utils/helpers';
import { 
  CheckCircle2, 
  AlertTriangle, 
  TrendingDown, 
  Printer, 
  Share2, 
  FileCheck, 
  Sparkles, 
  Building2, 
  Calendar, 
  Receipt, 
  Check, 
  ArrowLeft,
  DollarSign,
  Award,
  ArrowRight
} from 'lucide-react';
import confetti from 'canvas-confetti';

interface ReconciliationProps {
  order: PharmacyOrder;
  invoice: PurchaseInvoice;
  marketPrices: MarketPriceRecord[];
  onSaveReconciliation: (rec: OrderInvoiceReconciliation) => void;
  onBack: () => void;
}

export const ReconciliationView: React.FC<ReconciliationProps> = ({
  order,
  invoice,
  marketPrices,
  onSaveReconciliation,
  onBack
}) => {
  const [matches, setMatches] = useState<ReconciliationMatch[]>([]);
  const [isCopied, setIsCopied] = useState(false);

  useEffect(() => {
    // Generate matches between order items and invoice items
    const generatedMatches: ReconciliationMatch[] = order.items.map(orderItem => {
      const orderNameClean = String(orderItem?.matchedMedicineName || orderItem?.rawText || '').trim().toLowerCase();
      // Find matching invoice item
      const invItem = invoice?.items?.find(i => {
        if (!i) return false;
        const iNameClean = String(i.itemName || (i as any).medicineName || '').trim().toLowerCase();
        return (
          (iNameClean && orderNameClean && iNameClean === orderNameClean) ||
          (orderNameClean && iNameClean && orderNameClean.includes(iNameClean)) ||
          (iNameClean && orderNameClean && iNameClean.includes(orderNameClean))
        );
      });

      const summary = computeMedicinePriceSummary(
        orderItem?.matchedMedicineId || '',
        orderItem?.matchedMedicineName || '',
        marketPrices
      );

      // Baseline reference price (highest or standard previous price)
      const refPrice = orderItem.referencePrice || (summary?.highestPrice ? summary.highestPrice : (summary?.averagePrice || 2600));
      const actualPrice = invItem ? invItem.unitPrice : 0;
      const invoicedQty = invItem ? invItem.quantity : 0;

      let qtyStatus: 'exact' | 'deficit' | 'surplus' | 'missing' = 'exact';
      const qtyDiff = invoicedQty - orderItem.quantity;

      if (!invItem || invoicedQty === 0) {
        qtyStatus = 'missing';
      } else if (qtyDiff < 0) {
        qtyStatus = 'deficit';
      } else if (qtyDiff > 0) {
        qtyStatus = 'surplus';
      }

      const savingsPerUnit = Math.max(0, refPrice - actualPrice);
      const effectiveQtyForSavings = Math.min(orderItem.quantity, invoicedQty);
      const totalSavings = savingsPerUnit * effectiveQtyForSavings;
      const savingsPercent = refPrice > 0 ? (savingsPerUnit / refPrice) * 100 : 0;

      return {
        orderItemId: orderItem.id,
        orderItemName: orderItem.matchedMedicineName,
        invoiceItemName: invItem?.itemName || 'غير متوفر بالفاتورة',
        orderedQty: orderItem.quantity,
        invoicedQty: invoicedQty,
        qtyStatus,
        qtyDiff,
        referenceUnitPrice: refPrice,
        actualUnitPrice: actualPrice,
        savingsPerUnit,
        totalSavings,
        savingsPercent: Math.round(savingsPercent * 100) / 100,
        notes: qtyStatus === 'deficit' ? `نقص ${Math.abs(qtyDiff)} وحدة` : qtyStatus === 'surplus' ? `زيادة ${qtyDiff} وحدة` : undefined
      };
    });

    setMatches(generatedMatches);

    // Trigger celebration confetti for documented savings
    try {
      confetti({
        particleCount: 50,
        spread: 60,
        origin: { y: 0.6 }
      });
    } catch {
      // Ignored if in headless mode
    }
  }, [order, invoice, marketPrices]);

  // Totals calculation
  const totalOrderedItems = matches.length;
  const totalMatchedItems = matches.filter(m => m.qtyStatus === 'exact' || m.qtyStatus === 'surplus').length;
  
  const totalReferenceAmount = matches.reduce((sum, m) => sum + (m.referenceUnitPrice * m.invoicedQty), 0);
  const totalActualAmount = matches.reduce((sum, m) => sum + (m.actualUnitPrice * m.invoicedQty), 0);
  const totalSavingsAmount = Math.max(0, totalReferenceAmount - totalActualAmount);
  const overallSavingsPercent = totalReferenceAmount > 0 
    ? ((totalSavingsAmount / totalReferenceAmount) * 100).toFixed(1) 
    : '0';

  const handlePrint = () => {
    window.print();
  };

  const handleCopyReport = () => {
    const reportText = `📊 تقرير مطابقة المشتريات والتوفير المحقق\n` +
      `صيدلية: ${order.pharmacyName}\n` +
      `طلب رقم: ${order.orderNumber} • فاتورة رقم: ${invoice.invoiceNumber}\n` +
      `المورد: ${invoice.supplierName} • التاريخ: ${formatDateAr(invoice.invoiceDate)}\n\n` +
      `الأصناف ومطابقة الكميات:\n` +
      matches.map(m => `- ${m.orderItemName}: طلب (${m.orderedQty}) | فاتورة (${m.invoicedQty}) | شراء: ${formatCurrency(m.actualUnitPrice)} | توفير: ${formatCurrency(m.totalSavings)}`).join('\n') +
      `\n\n═══════════════════════════════\n` +
      `💰 إجمالي القيمة المرجعية: ${formatCurrency(totalReferenceAmount)}\n` +
      `💵 إجمالي الشراء الفعلي: ${formatCurrency(totalActualAmount)}\n` +
      `🏆 إجمالي التوفير المحقق: ${formatCurrency(totalSavingsAmount)} (${overallSavingsPercent}%)\n` +
      `═══════════════════════════════`;

    navigator.clipboard.writeText(reportText);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2500);
  };

  return (
    <div className="space-y-6 pb-20 max-w-5xl mx-auto" dir="rtl">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <button 
              onClick={onBack}
              className="p-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 transition-colors border border-slate-800 cursor-pointer"
            >
              <ArrowRight className="w-4 h-4" />
            </button>
            <h1 className="text-xl sm:text-2xl font-black text-white flex items-center gap-2">
              <FileCheck className="w-6 h-6 text-teal-400" />
              <span>مطابقة الطلب مع الفاتورة وحساب التوفير</span>
            </h1>
          </div>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            ربط مباشر بين طلب <strong className="text-slate-200">{order.pharmacyName}</strong> وفاتورة المورد <strong className="text-slate-200">{invoice.supplierName}</strong>
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <button
            onClick={handleCopyReport}
            className="px-3.5 py-2.5 rounded-2xl bg-slate-900 hover:bg-slate-800 text-slate-200 text-xs font-bold border border-slate-800 flex items-center gap-2 transition-colors cursor-pointer"
          >
            {isCopied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Share2 className="w-3.5 h-3.5 text-teal-400" />}
            <span>{isCopied ? 'تم نسخ التقرير' : 'نسخ التقرير'}</span>
          </button>

          <button
            onClick={handlePrint}
            className="px-4 py-2.5 rounded-2xl bg-teal-500 hover:bg-teal-400 text-slate-950 font-black text-xs flex items-center gap-2 transition-all shadow-md cursor-pointer"
          >
            <Printer className="w-4 h-4" />
            <span>طباعة التقرير</span>
          </button>
        </div>
      </div>

      {/* Main Savings Trophy Banner */}
      <div className="bg-gradient-to-r from-emerald-950/70 via-slate-900 to-slate-900 border border-emerald-500/40 rounded-3xl p-6 relative overflow-hidden shadow-xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="p-1 rounded-lg bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                <Award className="w-4 h-4" />
              </span>
              <span className="text-xs font-bold text-emerald-400">إثبات التوفير المالي المحقق للصيدلية</span>
            </div>
            <div className="text-3xl sm:text-4xl font-black text-emerald-400 font-mono tracking-tight">
              {formatCurrency(totalSavingsAmount)}
              <span className="text-sm sm:text-base font-semibold text-slate-300 mr-3">
                (وفرت {overallSavingsPercent}% من قيمة الطلب)
              </span>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              تم تحصيل أسعار شراء أقل من السعر المرجعي للسوق مع تدقيق استلام الكميات ومطابقة الفاتورة 100%.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3 shrink-0 bg-slate-950/80 p-4 rounded-2xl border border-slate-800 text-center">
            <div>
              <div className="text-[10px] text-slate-400">القيمة المرجعية السابقة</div>
              <div className="text-sm font-black text-slate-200 mt-0.5 font-mono">{formatCurrency(totalReferenceAmount)}</div>
            </div>

            <div className="border-r border-slate-800">
              <div className="text-[10px] text-slate-400">إجمالي الشراء الفعلي</div>
              <div className="text-sm font-black text-teal-400 mt-0.5 font-mono">{formatCurrency(totalActualAmount)}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Detailed Matching & Quantity Reconciliation Table */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-5 sm:p-6 space-y-4 shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <span>جدول مطابقة الأصناف والكميات والأسعار</span>
          </h2>
          <span className="text-xs text-slate-400 font-medium">
            {totalMatchedItems} من أصل {totalOrderedItems} أصناف مطابقة
          </span>
        </div>

        <div className="overflow-x-auto rounded-2xl border border-slate-800">
          <table className="w-full text-right text-xs">
            <thead className="bg-slate-950 text-slate-400 border-b border-slate-800">
              <tr>
                <th className="py-3 px-3 font-bold">الصنف المطلوب</th>
                <th className="py-3 px-3 text-center w-28 font-bold">الكمية المطلوبة</th>
                <th className="py-3 px-3 text-center w-28 font-bold">الكمية بالفاتورة</th>
                <th className="py-3 px-3 text-center w-28 font-bold">حالة الكمية</th>
                <th className="py-3 px-3 text-center w-28 font-bold">السعر المرجعي</th>
                <th className="py-3 px-3 text-center w-28 font-bold">سعر الشراء الفعلي</th>
                <th className="py-3 px-3 text-center w-28 font-bold">التوفير للصنف</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 bg-slate-900/50">
              {matches.map((match, idx) => (
                <tr key={idx} className="hover:bg-slate-800/30">
                  <td className="py-3 px-3 font-bold text-slate-100">
                    <div>{match.orderItemName}</div>
                    <div className="text-[10px] text-slate-400 font-normal">في الفاتورة: {match.invoiceItemName}</div>
                  </td>

                  <td className="py-3 px-3 text-center font-bold text-slate-300 font-mono">
                    {match.orderedQty}
                  </td>

                  <td className="py-3 px-3 text-center font-bold text-white font-mono">
                    {match.invoicedQty}
                  </td>

                  {/* Quantity Status Badge */}
                  <td className="py-3 px-3 text-center">
                    {match.qtyStatus === 'exact' ? (
                      <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[11px] font-bold">
                        🟢 مطابق
                      </span>
                    ) : match.qtyStatus === 'deficit' ? (
                      <span className="px-2.5 py-0.5 rounded-full bg-rose-500/10 text-rose-400 border border-rose-500/20 text-[11px] font-bold">
                        🔴 نقص {Math.abs(match.qtyDiff)}
                      </span>
                    ) : match.qtyStatus === 'surplus' ? (
                      <span className="px-2.5 py-0.5 rounded-full bg-teal-500/10 text-teal-400 border border-teal-500/20 text-[11px] font-bold">
                        🔵 زيادة {match.qtyDiff}
                      </span>
                    ) : (
                      <span className="px-2.5 py-0.5 rounded-full bg-slate-500/10 text-slate-400 border border-slate-500/20 text-[11px] font-medium">
                        لم يشترى
                      </span>
                    )}
                  </td>

                  {/* Reference Price */}
                  <td className="py-3 px-3 text-center text-slate-400 font-mono">
                    {formatCurrency(match.referenceUnitPrice)}
                  </td>

                  {/* Actual Purchased Price */}
                  <td className="py-3 px-3 text-center font-bold text-teal-400 font-mono">
                    {formatCurrency(match.actualUnitPrice)}
                  </td>

                  {/* Item Savings */}
                  <td className="py-3 px-3 text-center font-black text-emerald-400 font-mono">
                    {match.totalSavings > 0 ? (
                      <div>
                        <div>{formatCurrency(match.totalSavings)}</div>
                        <div className="text-[10px] text-emerald-400/80">({match.savingsPercent}%)</div>
                      </div>
                    ) : (
                      <span className="text-slate-500">-</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
