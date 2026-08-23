import React, { useState, useMemo } from 'react';
import { 
  PharmacyOrder, 
  MarketPriceRecord, 
  Medicine, 
  Supplier 
} from '../types';
import { 
  computeMedicinePriceSummary, 
  evaluatePriceQuality, 
  getFreshnessBadge, 
  getFreshness,
  formatCurrency, 
  formatDateAr 
} from '../utils/helpers';
import { 
  ShoppingCart, 
  TrendingDown, 
  CheckCircle2, 
  Building2, 
  Calendar, 
  Sparkles, 
  ArrowLeft, 
  Copy, 
  Check, 
  Receipt, 
  Clock, 
  Info,
  ChevronDown,
  Layers,
  Send,
  SlidersHorizontal,
  ChevronLeft,
  DollarSign,
  AlertTriangle,
  ArrowRight
} from 'lucide-react';

interface PriceComparisonProps {
  order: PharmacyOrder;
  marketPrices: MarketPriceRecord[];
  medicines: Medicine[];
  suppliers: Supplier[];
  onNavigateToInvoice: (orderId: string) => void;
  onBack: () => void;
}

export const PriceComparisonView: React.FC<PriceComparisonProps> = ({
  order,
  marketPrices,
  medicines,
  suppliers,
  onNavigateToInvoice,
  onBack
}) => {
  const [selectedMedicineHistory, setSelectedMedicineHistory] = useState<string | null>(null);
  const [copiedSupplier, setCopiedSupplier] = useState<string | null>(null);

  // Analyze each item in the order against market prices
  const itemsAnalysis = useMemo(() => {
    return order.items.map(item => {
      const summary = computeMedicinePriceSummary(
        item.matchedMedicineId || '',
        item.matchedMedicineName || item.rawText,
        marketPrices,
        medicines
      );

      const priceToEvaluate = summary?.lowestPrice || summary?.latestPrice || item.bestMarketPrice || item.referencePrice || 0;
      const quality = evaluatePriceQuality(priceToEvaluate, summary?.averagePrice, summary?.lowestPrice);
      const freshness = summary ? getFreshnessBadge(summary.freshness, summary.daysOld) : null;

      return {
        item,
        summary,
        quality,
        freshness,
        effectivePrice: priceToEvaluate,
        itemTotalCost: priceToEvaluate * item.quantity
      };
    });
  }, [order.items, marketPrices, medicines]);

  // Calculate Best Multi-Supplier Purchase Split (Optimal purchase allocation)
  const supplierSplits = useMemo<Map<string, { supplierName: string; items: { name: string; qty: number; unitPrice: number; total: number }[]; totalAmount: number }>>(() => {
    const splits = new Map<string, { supplierName: string; items: { name: string; qty: number; unitPrice: number; total: number }[]; totalAmount: number }>();

    itemsAnalysis.forEach(({ item, summary, effectivePrice }) => {
      const supName = summary?.bestSupplierName || 'مستودع عام';
      const existing = splits.get(supName);
      const itemCost = effectivePrice * item.quantity;

      if (existing) {
        existing.items.push({
          name: item.matchedMedicineName,
          qty: item.quantity,
          unitPrice: effectivePrice,
          total: itemCost
        });
        existing.totalAmount += itemCost;
      } else {
        splits.set(supName, {
          supplierName: supName,
          items: [{
            name: item.matchedMedicineName,
            qty: item.quantity,
            unitPrice: effectivePrice,
            total: itemCost
          }],
          totalAmount: itemCost
        });
      }
    });
    return splits;
  }, [itemsAnalysis]);

  // Total metrics
  const totalOptimizedCost = useMemo(() => {
    let sum = 0;
    supplierSplits.forEach(s => {
      sum += s.totalAmount;
    });
    return sum;
  }, [supplierSplits]);
  
  // Baseline cost if purchased at average/highest market price
  const baselineCost = useMemo(() => {
    return itemsAnalysis.reduce((sum, { item, summary }) => {
      const ref = summary?.highestPrice || summary?.averagePrice || 0;
      return sum + (ref * item.quantity);
    }, 0);
  }, [itemsAnalysis]);

  const potentialSavings = Math.max(0, baselineCost - totalOptimizedCost);
  const potentialSavingsPercent = baselineCost > 0 ? ((potentialSavings / baselineCost) * 100).toFixed(1) : '0';

  const handleCopySupplierOrder = (supplierName: string, itemsList: { name: string; qty: number }[]) => {
    const text = `طلب شراء من صيدلية (${order.pharmacyName})\nإلى: ${supplierName}\nالتاريخ: ${new Date().toLocaleDateString('ar-SA')}\n\nالأصناف المطلوبة:\n` +
      itemsList.map((it, idx) => `${idx + 1}. ${it.name} - عدد: ${it.qty}`).join('\n') +
      `\n\nيرجى تأكيد توفر الأصناف وإرسال الفاتورة.`;

    navigator.clipboard.writeText(text);
    setCopiedSupplier(supplierName);
    setTimeout(() => setCopiedSupplier(null), 2500);
  };

  return (
    <div className="space-y-6 pb-24 max-w-5xl mx-auto" dir="rtl">
      
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
              <TrendingDown className="w-6 h-6 text-teal-400" />
              <span>مقارنة أسعار السوق وخطة الشراء</span>
            </h1>
          </div>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            الطلب: <strong className="text-slate-200">{order.orderNumber}</strong> • صيدلية: <strong className="text-slate-200">{order.pharmacyName}</strong> ({order.items.length} أصناف)
          </p>
        </div>

        <button
          onClick={() => onNavigateToInvoice(order.id)}
          className="px-5 py-3 rounded-2xl bg-gradient-to-r from-teal-500 to-emerald-500 hover:from-teal-400 hover:to-emerald-400 text-slate-950 font-black text-xs sm:text-sm flex items-center justify-center gap-2 shadow-lg shadow-teal-500/20 cursor-pointer transition-all active:scale-95 shrink-0"
        >
          <Receipt className="w-4 h-4" />
          <span>الانتقال لتسجيل الفاتورة ومطابقة المشتريات</span>
        </button>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 sm:gap-4">
        <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-5 shadow-sm">
          <span className="text-xs font-semibold text-slate-400">أفضل تكلفة شراء متاحة</span>
          <div className="text-2xl sm:text-3xl font-black text-teal-400 mt-1 font-mono">{formatCurrency(totalOptimizedCost)}</div>
          <div className="text-[11px] text-slate-400 mt-0.5">موزعة على {supplierSplits.size} موردين بأقل سعر</div>
        </div>

        <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-5 shadow-sm">
          <span className="text-xs font-semibold text-slate-400">التكلفة المرجعية المتوقعة (أعلى سوق)</span>
          <div className="text-2xl sm:text-3xl font-black text-slate-200 mt-1 font-mono">{formatCurrency(baselineCost)}</div>
          <div className="text-[11px] text-slate-400 mt-0.5">بناءً على أعلى وأحدث تسعيرات المستودعات</div>
        </div>

        <div className="bg-gradient-to-br from-emerald-950/40 via-slate-900 to-slate-900 border border-emerald-500/30 rounded-3xl p-5 shadow-sm">
          <span className="text-xs font-bold text-emerald-400">التوفير المالي المحقق للطلب</span>
          <div className="text-2xl sm:text-3xl font-black text-emerald-400 mt-1 font-mono">
            {formatCurrency(potentialSavings)} 
            <span className="text-xs sm:text-sm font-semibold mr-2">({potentialSavingsPercent}%)</span>
          </div>
          <div className="text-[11px] text-emerald-300/80 mt-0.5">فارق السعر الصافي لصالح الصيدلية</div>
        </div>
      </div>

      {/* Item Price Matrix */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-5 sm:p-6 space-y-4 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShoppingCart className="w-5 h-5 text-teal-400" />
            <h2 className="text-base font-bold text-white">مقارنة أسعار أصناف الطلب في السوق</h2>
          </div>
          <span className="text-xs text-slate-400">{order.items.length} أصناف في الطلب</span>
        </div>

        <div className="space-y-3">
          {itemsAnalysis.map(({ item, summary, quality, freshness, effectivePrice, itemTotalCost }) => (
            <div 
              key={item.id}
              className="p-4 sm:p-5 rounded-2xl bg-slate-950/70 border border-slate-800 hover:border-slate-700 transition-all space-y-3.5"
            >
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                <div className="space-y-1.5">
                  <div className="flex items-center flex-wrap gap-2">
                    <span className="font-bold text-sm sm:text-base text-white">{item.matchedMedicineName}</span>
                    <span className="text-xs bg-slate-800 text-teal-300 px-2.5 py-0.5 rounded-full border border-slate-700 font-mono">
                      الكمية: {item.quantity} {item.unit || 'علبة'}
                    </span>
                    {quality && (
                      <span className={`text-[11px] px-2 py-0.5 rounded-full border font-semibold ${quality.colorClass}`}>
                        {quality.label}
                      </span>
                    )}
                  </div>
                  {freshness && (
                    <div className="flex items-center gap-2 text-xs text-slate-400">
                      <span className={`inline-block w-2 h-2 rounded-full ${freshness.dotClass}`} />
                      <span>حداثة السعر: {freshness.label}</span>
                    </div>
                  )}
                </div>

                {/* Price Breakdown Columns */}
                <div className="flex items-center justify-between md:justify-end gap-3 sm:gap-4 bg-slate-900/90 p-3 rounded-2xl border border-slate-800 shrink-0">
                  <div className="text-center">
                    <div className="text-[10px] text-slate-400">أقل سعر سوق</div>
                    <div className="text-xs sm:text-sm font-black text-emerald-400 font-mono">
                      {summary ? formatCurrency(summary.lowestPrice) : 'غير مسجل'}
                    </div>
                  </div>

                  <div className="h-6 w-px bg-slate-800" />

                  <div className="text-center">
                    <div className="text-[10px] text-slate-400">أفضل مورد متاح</div>
                    <div className="text-xs font-bold text-teal-300 truncate max-w-[120px]">
                      {summary?.bestSupplierName || 'غير محدد'}
                    </div>
                  </div>

                  <div className="h-6 w-px bg-slate-800" />

                  <div className="text-center">
                    <div className="text-[10px] text-slate-400">إجمالي الصنف</div>
                    <div className="text-xs sm:text-sm font-black text-white font-mono">
                      {formatCurrency(itemTotalCost)}
                    </div>
                  </div>
                </div>
              </div>

              {/* Historical Records Trigger */}
              {summary && summary.records.length > 0 && (
                <div className="pt-2 border-t border-slate-900 flex items-center justify-between text-xs">
                  <span className="text-slate-400">
                    يوجد {summary.records.length} تسعيرات وفواتير سابقة لهذا الصنف بالسوق
                  </span>

                  <button
                    onClick={() => setSelectedMedicineHistory(selectedMedicineHistory === item.id ? null : item.id)}
                    className="text-teal-400 hover:text-teal-300 font-bold flex items-center gap-1 cursor-pointer"
                  >
                    <span>{selectedMedicineHistory === item.id ? 'إخفاء سجل الموردين' : 'عرض تفاصيل عروض الموردين'}</span>
                    <ChevronDown className={`w-3.5 h-3.5 transition-transform ${selectedMedicineHistory === item.id ? 'rotate-180' : ''}`} />
                  </button>
                </div>
              )}

              {/* Expanded Records Table */}
              {selectedMedicineHistory === item.id && summary && (
                <div className="p-3.5 bg-slate-900 rounded-2xl border border-slate-800 mt-2 space-y-2">
                  <div className="text-[11px] font-bold text-slate-300">سجل عروض الموردين في السوق:</div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-right text-xs">
                      <thead className="text-slate-500 border-b border-slate-800">
                        <tr>
                          <th className="pb-2 font-bold">المورد / المستودع</th>
                          <th className="pb-2 font-bold">السعر للوحدة</th>
                          <th className="pb-2 font-bold">البونص / الخصم</th>
                          <th className="pb-2 font-bold">تاريخ الفاتورة</th>
                          <th className="pb-2 font-bold">حداثة السعر</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60">
                        {summary.records.map(rec => {
                          const fBadge = getFreshnessBadge(getFreshness(summary.daysOld), summary.daysOld);
                          return (
                            <tr key={rec.id} className="text-slate-300">
                              <td className="py-2 font-bold">{rec.supplierName}</td>
                              <td className="py-2 text-teal-400 font-bold font-mono">{formatCurrency(rec.unitPrice)}</td>
                              <td className="py-2 text-slate-400">{rec.bonusScheme || '-'}</td>
                              <td className="py-2">{formatDateAr(rec.invoiceDate)}</td>
                              <td className="py-2">
                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${fBadge.colorClass}`}>
                                  {fBadge.statusText}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Smart Multi-Supplier Purchase Allocation */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-5 sm:p-6 space-y-4 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Building2 className="w-5 h-5 text-emerald-400" />
            <h2 className="text-base font-bold text-white">خطة الشراء الذكية وتوزيع الموردين (أقل تكلفة إجمالية)</h2>
          </div>
          <span className="text-xs bg-emerald-500/10 text-emerald-400 px-3 py-1 rounded-full border border-emerald-500/20 font-bold">
            توزيع تلقائي لأفضل سعر
          </span>
        </div>

        <p className="text-xs text-slate-400 leading-relaxed">
          يقوم المساعد الذكي بتوزيع أصناف الطلبية على المستودعات التي تقدم أرخص سعر لكل صنف، مما يحقق أعلى توفير ممكن بدلاً من الشراء من مورد واحد.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {Array.from(supplierSplits.entries()).map(([supplierName, data]) => (
            <div 
              key={supplierName}
              className="bg-slate-950/70 border border-slate-800 rounded-2xl p-4 space-y-3"
            >
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div>
                  <h3 className="font-bold text-sm text-slate-100 flex items-center gap-1.5">
                    <Building2 className="w-4 h-4 text-teal-400" />
                    <span>{supplierName}</span>
                  </h3>
                  <span className="text-[11px] text-slate-400">{data.items.length} أصناف من هذا المورد</span>
                </div>

                <div className="text-left">
                  <div className="text-[11px] text-slate-400">إجمالي الطلبية</div>
                  <div className="text-sm font-black text-emerald-400 font-mono">{formatCurrency(data.totalAmount)}</div>
                </div>
              </div>

              {/* Items List */}
              <div className="space-y-1.5 text-xs">
                {data.items.map((it, idx) => (
                  <div key={idx} className="flex items-center justify-between text-slate-300 bg-slate-900/60 p-2 rounded-xl">
                    <span>{it.name} (عدد: {it.qty})</span>
                    <span className="font-mono text-teal-400 font-bold">{formatCurrency(it.total)}</span>
                  </div>
                ))}
              </div>

              {/* Copy Supplier Order Button */}
              <button
                onClick={() => handleCopySupplierOrder(supplierName, data.items)}
                className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold border border-slate-700 flex items-center justify-center gap-1.5 transition-colors cursor-pointer active:scale-95"
              >
                {copiedSupplier === supplierName ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                    <span className="text-emerald-400">تم نسخ نص الطلبية بنجاح!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5 text-slate-400" />
                    <span>نسخ نص الطلب للإرسال للواتساب/المورد</span>
                  </>
                )}
              </button>
            </div>
          ))}
        </div>
      </div>

    </div>
  );
};
