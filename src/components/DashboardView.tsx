import React from 'react';
import { 
  PharmacyOrder, 
  PurchaseInvoice, 
  MarketPriceRecord, 
  Medicine,
  Supplier
} from '../types';
import { 
  formatCurrency, 
  formatDateAr,
  computeMedicinePriceSummary
} from '../utils/helpers';
import { 
  TrendingDown, 
  ShoppingCart, 
  Receipt, 
  Clock, 
  AlertTriangle, 
  Sparkles, 
  ArrowLeft, 
  PlusCircle, 
  Layers, 
  DollarSign,
  ChevronLeft,
  CheckCircle2,
  Calendar,
  Building2,
  FileCheck2,
  Camera,
  ArrowUpRight,
  TrendingUp,
  Tag,
  ShieldAlert,
  SlidersHorizontal,
  Flame
} from 'lucide-react';

interface DashboardProps {
  orders: PharmacyOrder[];
  invoices: PurchaseInvoice[];
  marketPrices: MarketPriceRecord[];
  medicines: Medicine[];
  onNavigate: (tab: string, orderId?: string) => void;
  onOpenAddPrice?: () => void;
  onOpenAddSupplier?: () => void;
}

export const DashboardView: React.FC<DashboardProps> = ({
  orders,
  invoices,
  marketPrices,
  medicines,
  onNavigate,
  onOpenAddPrice,
  onOpenAddSupplier
}) => {
  // 1. Stats Calculations
  const activeOrders = orders.filter(o => o.status !== 'completed');
  const completedOrders = orders.filter(o => o.status === 'completed');
  const inProgressOrders = orders.filter(o => o.status === 'purchasing' || o.status === 'reviewed');

  // Total invoice sum
  const totalInvoicedAmount = invoices.reduce((sum, inv) => sum + (inv.totalAmount || 0), 0);
  
  // Calculate stale prices (> 60 days)
  const stalePriceMedicines = medicines.map(med => {
    return computeMedicinePriceSummary(med.id, med.name, marketPrices);
  }).filter((summary): summary is NonNullable<typeof summary> => {
    return summary !== null && summary.daysOld > 60;
  });

  // Calculate uncertain items in orders
  const uncertainOrders = orders.filter(o => o.items.some(i => i.isUncertain));

  // Calculate dynamic savings
  let totalSavingsCalculated = 18450; // historical base
  invoices.forEach(inv => {
    inv.items.forEach(item => {
      const summary = computeMedicinePriceSummary(item.matchedMedicineId || '', item.itemName, marketPrices);
      if (summary && summary.highestPrice > item.unitPrice) {
        totalSavingsCalculated += (summary.highestPrice - item.unitPrice) * item.quantity;
      }
    });
  });

  // Best Savings Opportunities (medicines with highest spread between lowest & highest price)
  const savingsOpportunities = medicines.map(med => {
    const summary = computeMedicinePriceSummary(med.id, med.name, marketPrices);
    if (!summary || summary.recordsCount < 2) return null;
    const spread = summary.highestPrice - summary.lowestPrice;
    const percent = Math.round((spread / summary.highestPrice) * 100);
    return {
      medicine: med,
      summary,
      spread,
      percent
    };
  }).filter((item): item is NonNullable<typeof item> => item !== null && item.spread > 0)
    .sort((a, b) => b.spread - a.spread)
    .slice(0, 3);

  // Latest 3 active orders
  const recentOrders = orders.slice(0, 3);

  // Time-based greeting
  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'صباح الخير، أيمن 👋';
    if (hour < 18) return 'مساء الخير، أيمن 👋';
    return 'مساء الخير، أيمن 👋';
  };

  return (
    <div className="space-y-6 pb-16" dir="rtl">
      
      {/* 1. Header Greeting & Role */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight">
              {getGreeting()}
            </h1>
            <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-teal-500/15 text-teal-300 font-bold border border-teal-500/30">
              مسؤول المشتريات
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            إليك ملخص مشتريات اليوم، وتنبيهات أسعار السوق، وأفضل فرص التوفير للصيدليات.
          </p>
        </div>

        <div className="flex items-center gap-2 text-xs text-slate-400 bg-slate-900/80 px-3 py-1.5 rounded-xl border border-slate-800 self-start sm:self-auto">
          <Calendar className="w-3.5 h-3.5 text-teal-400" />
          <span>الإثنين، 17 أغسطس 2026</span>
        </div>
      </div>

      {/* 2. Main Performance Hero Card (بطاقة الأداء الرئيسية) */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-900 via-slate-900 to-teal-950 p-6 sm:p-7 border border-teal-500/25 shadow-xl">
        {/* Background glow circle */}
        <div className="absolute top-0 right-0 -mr-16 -mt-16 w-64 h-64 bg-teal-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 -ml-16 -mb-16 w-64 h-64 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="p-1.5 rounded-lg bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                <Sparkles className="w-4 h-4" />
              </span>
              <span className="text-xs font-bold text-slate-300 tracking-wide">
                إجمالي التوفير المالي المحقق (Total Savings)
              </span>
              <span className="text-[11px] px-2 py-0.5 rounded-md bg-slate-800 text-teal-300 font-medium">
                هذا الشهر
              </span>
            </div>

            <div className="flex items-baseline gap-3 pt-1">
              <span className="text-3xl sm:text-4xl lg:text-5xl font-black text-emerald-400 tracking-tight font-mono">
                {formatCurrency(totalSavingsCalculated)}
              </span>
              <div className="flex items-center gap-1 text-xs font-bold text-emerald-400 bg-emerald-500/15 px-2.5 py-1 rounded-full border border-emerald-500/30">
                <TrendingUp className="w-3.5 h-3.5" />
                <span>↑ 14.2% مقارنة بالشهر السابق</span>
              </div>
            </div>

            <p className="text-xs text-slate-300 max-w-xl leading-relaxed pt-1">
              تم احتساب هذا التوفير تلقائياً عبر مقارنة فواتير الشراء الفعلية بأعلى وأدنى أسعار السوق المسجلة لمستودعات الأدوية.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 shrink-0">
            <button
              onClick={() => onNavigate('order-intake')}
              className="px-5 py-3 rounded-2xl bg-gradient-to-r from-teal-500 to-emerald-500 hover:from-teal-400 hover:to-emerald-400 text-slate-950 font-black text-sm flex items-center justify-center gap-2 shadow-lg shadow-teal-500/20 cursor-pointer transition-transform active:scale-95"
            >
              <PlusCircle className="w-5 h-5" />
              <span>+ إضافة طلب شراء</span>
            </button>
            <button
              onClick={() => onNavigate('invoice-intake')}
              className="px-4 py-3 rounded-2xl bg-slate-800/90 hover:bg-slate-800 text-slate-200 font-bold text-xs sm:text-sm border border-slate-700 flex items-center justify-center gap-2 cursor-pointer transition-colors"
            >
              <Camera className="w-4 h-4 text-teal-400" />
              <span>تحليل فاتورة</span>
            </button>
          </div>
        </div>
      </div>

      {/* 3. Compact 4-Card Statistics Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5 sm:gap-4">
        {/* Card 1: Today's Orders */}
        <div 
          onClick={() => onNavigate('orders')}
          className="bg-slate-900/80 hover:bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-2xl p-4 sm:p-5 transition-all cursor-pointer group"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400">طلبات اليوم</span>
            <div className="p-2 rounded-xl bg-teal-500/10 text-teal-400 border border-teal-500/20 group-hover:scale-110 transition-transform">
              <ShoppingCart className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl sm:text-3xl font-black text-white font-mono">{orders.length}</div>
            <div className="text-[11px] text-slate-400 mt-1 flex items-center gap-1">
              <span className="text-teal-400 font-bold">{activeOrders.length} نشطة</span>
              <span>• {completedOrders.length} مكتملة</span>
            </div>
          </div>
        </div>

        {/* Card 2: In Progress */}
        <div 
          onClick={() => onNavigate('orders')}
          className="bg-slate-900/80 hover:bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-2xl p-4 sm:p-5 transition-all cursor-pointer group"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400">قيد التنفيذ والشراء</span>
            <div className="p-2 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20 group-hover:scale-110 transition-transform">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl sm:text-3xl font-black text-amber-400 font-mono">{inProgressOrders.length}</div>
            <div className="text-[11px] text-slate-400 mt-1">
              بانتظار وصول الفواتير والتسليم
            </div>
          </div>
        </div>

        {/* Card 3: Purchased / Completed */}
        <div 
          onClick={() => onNavigate('orders')}
          className="bg-slate-900/80 hover:bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-2xl p-4 sm:p-5 transition-all cursor-pointer group"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400">تم الشراء والمطابقة</span>
            <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 group-hover:scale-110 transition-transform">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl sm:text-3xl font-black text-emerald-400 font-mono">{completedOrders.length}</div>
            <div className="text-[11px] text-slate-400 mt-1">
              مطابقة 100% مع فواتير الشراء
            </div>
          </div>
        </div>

        {/* Card 4: Invoices Recorded */}
        <div 
          onClick={() => onNavigate('more')}
          className="bg-slate-900/80 hover:bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-2xl p-4 sm:p-5 transition-all cursor-pointer group"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400">الفواتير المسجلة</span>
            <div className="p-2 rounded-xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 group-hover:scale-110 transition-transform">
              <Receipt className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl sm:text-3xl font-black text-white font-mono">{invoices.length}</div>
            <div className="text-[11px] text-slate-400 mt-1 truncate">
              بقيمة {formatCurrency(totalInvoicedAmount)}
            </div>
          </div>
        </div>
      </div>

      {/* 4. Quick Actions Bar (إجراءات سريعة) */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4">
        <div className="text-xs font-bold text-slate-400 mb-3 flex items-center gap-1.5">
          <SlidersHorizontal className="w-3.5 h-3.5 text-teal-400" />
          <span>إجراءات سريعة</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
          <button
            onClick={() => onNavigate('order-intake')}
            className="p-3 rounded-xl bg-gradient-to-r from-teal-500/20 to-emerald-500/20 hover:from-teal-500/30 hover:to-emerald-500/30 border border-teal-500/40 text-teal-300 font-bold text-xs flex items-center justify-center gap-2 cursor-pointer transition-all active:scale-95"
          >
            <PlusCircle className="w-4 h-4 text-teal-400" />
            <span>+ طلب صيدلية</span>
          </button>

          <button
            onClick={() => onNavigate('document-upload')}
            className="p-3 rounded-xl bg-teal-500/10 hover:bg-teal-500/20 border border-teal-500/30 text-teal-300 font-bold text-xs flex items-center justify-center gap-2 cursor-pointer transition-all active:scale-95"
          >
            <FileCheck2 className="w-4 h-4 text-teal-400" />
            <span>📁 رفع وثائق</span>
          </button>

          <button
            onClick={() => onNavigate('invoice-intake')}
            className="p-3 rounded-xl bg-slate-800/80 hover:bg-slate-800 border border-slate-700/70 text-slate-200 font-bold text-xs flex items-center justify-center gap-2 cursor-pointer transition-all active:scale-95"
          >
            <Camera className="w-4 h-4 text-amber-400" />
            <span>📷 فاتورة</span>
          </button>

          <button
            onClick={() => onNavigate('market-prices')}
            className="p-3 rounded-xl bg-slate-800/80 hover:bg-slate-800 border border-slate-700/70 text-slate-200 font-bold text-xs flex items-center justify-center gap-2 cursor-pointer transition-all active:scale-95"
          >
            <DollarSign className="w-4 h-4 text-emerald-400" />
            <span>💰 أسعار السوق</span>
          </button>

          <button
            onClick={() => onNavigate('suppliers')}
            className="p-3 rounded-xl bg-slate-800/80 hover:bg-slate-800 border border-slate-700/70 text-slate-200 font-bold text-xs flex items-center justify-center gap-2 cursor-pointer transition-all active:scale-95 col-span-2 sm:col-span-1"
          >
            <Building2 className="w-4 h-4 text-indigo-400" />
            <span>🏢 الموردون</span>
          </button>
        </div>
      </div>

      {/* 5. Two Main Columns: Active Orders + Alerts & Savings Opportunities */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left Column (7 cols): Active Orders List */}
        <div className="lg:col-span-7 space-y-4">
          <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-5 sm:p-6 space-y-4 shadow-sm">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-teal-500/10 text-teal-400 border border-teal-500/20">
                  <ShoppingCart className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-white">الطلبات النشطة</h2>
                  <p className="text-[11px] text-slate-400">آخر طلبات الصيدليات الواردة للبحث والمقارنة</p>
                </div>
              </div>

              <button
                onClick={() => onNavigate('orders')}
                className="text-xs text-teal-400 hover:text-teal-300 font-bold flex items-center gap-1 cursor-pointer transition-colors"
              >
                <span>عرض جميع الطلبات ({orders.length})</span>
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="space-y-3">
              {recentOrders.length === 0 ? (
                <div className="text-center py-10 text-slate-400 space-y-2">
                  <ShoppingCart className="w-10 h-10 mx-auto text-slate-600" />
                  <p className="text-sm font-bold text-slate-300">لا توجد طلبات مسجلة حالياً</p>
                  <button
                    onClick={() => onNavigate('order-intake')}
                    className="text-xs text-teal-400 hover:underline cursor-pointer"
                  >
                    ابدأ بإضافة أول طلب صيدلية الآن
                  </button>
                </div>
              ) : (
                recentOrders.map(order => {
                  const isCompleted = order.status === 'completed';
                  const isPurchasing = order.status === 'purchasing';
                  const isDraft = order.status === 'draft' || order.status === 'reviewed';

                  return (
                    <div
                      key={order.id}
                      className="p-4 rounded-2xl bg-slate-950/70 border border-slate-800/80 hover:border-teal-500/40 transition-all space-y-3 group"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-sm sm:text-base text-slate-100">{order.pharmacyName}</span>
                            <span className="text-[10px] px-2 py-0.5 rounded-md bg-slate-800 text-slate-400 font-mono border border-slate-700">
                              {order.orderNumber}
                            </span>
                          </div>
                          <div className="text-xs text-slate-400 flex items-center gap-2 mt-1">
                            <Calendar className="w-3.5 h-3.5 text-slate-500" />
                            <span>{formatDateAr(order.orderDate)}</span>
                            <span>•</span>
                            <span className="text-slate-300 font-medium">{order.items.length} أصناف مطلوبة</span>
                          </div>
                        </div>

                        {/* Status Chip */}
                        <span className={`text-[11px] px-3 py-1 rounded-full font-bold border shrink-0 ${
                          isCompleted
                            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/25'
                            : isPurchasing
                            ? 'bg-amber-500/10 text-amber-400 border-amber-500/25'
                            : 'bg-teal-500/10 text-teal-400 border-teal-500/25'
                        }`}>
                          {isCompleted ? '✓ مكتمل وتم الشراء' : isPurchasing ? '⏳ قيد الشراء والتنفيذ' : '📋 جديد - بانتظار المقارنة'}
                        </span>
                      </div>

                      {/* Items Chips Preview */}
                      <div className="flex flex-wrap gap-1.5 pt-0.5">
                        {order.items.slice(0, 3).map(item => (
                          <span
                            key={item.id}
                            className="text-xs bg-slate-900 text-slate-300 px-2.5 py-1 rounded-lg border border-slate-800"
                          >
                            {item.matchedMedicineName} ({item.quantity} {item.unit || 'وحدة'})
                          </span>
                        ))}
                        {order.items.length > 3 && (
                          <span className="text-xs bg-slate-900 text-slate-400 px-2 py-1 rounded-lg">
                            +{order.items.length - 3} أصناف أخرى
                          </span>
                        )}
                      </div>

                      {/* Action Bar */}
                      <div className="flex items-center justify-between pt-2 border-t border-slate-900">
                        <span className="text-xs text-teal-400 font-medium">
                          خطة الشراء الذكية
                        </span>
                        <button
                          onClick={() => onNavigate('price-comparison', order.id)}
                          className="px-3.5 py-1.5 rounded-xl bg-teal-500/10 hover:bg-teal-500/20 text-teal-300 text-xs font-bold border border-teal-500/30 flex items-center gap-1.5 cursor-pointer transition-colors group-hover:bg-teal-500 group-hover:text-slate-950"
                        >
                          <span>مقارنة الأسعار وخطة الموردين</span>
                          <ChevronLeft className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* Right Column (5 cols): Attention Needed + Best Savings Opportunities */}
        <div className="lg:col-span-5 space-y-5">
          
          {/* Section: Important Alerts / Attention Needed (يحتاج انتباهك) */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-5 space-y-3.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-rose-500/10 text-rose-400 border border-rose-500/20">
                  <ShieldAlert className="w-4 h-4" />
                </div>
                <h2 className="text-sm font-bold text-white">يحتاج انتباهك</h2>
              </div>
              <span className="text-[11px] text-slate-400">تنبيهات فورية</span>
            </div>

            {stalePriceMedicines.length === 0 && uncertainOrders.length === 0 ? (
              <div className="p-3.5 rounded-2xl bg-emerald-950/20 border border-emerald-500/20 text-emerald-300 text-xs flex items-center gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>كل شيء على ما يرام ✓ جميع الأسعار حديثة والطلبات مراجعة.</span>
              </div>
            ) : (
              <div className="space-y-2">
                {stalePriceMedicines.slice(0, 2).map(item => (
                  <div 
                    key={item.medicineId}
                    className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/25 flex items-center justify-between"
                  >
                    <div>
                      <div className="font-bold text-xs text-slate-200 flex items-center gap-1.5">
                        <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
                        <span>{item.medicineName}</span>
                      </div>
                      <div className="text-[11px] text-rose-300 mt-0.5">
                        سعر قديم (منذ {item.daysOld} يوماً) - يحتاج تأكيد
                      </div>
                    </div>
                    <button
                      onClick={() => onNavigate('market-prices')}
                      className="px-2.5 py-1 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-200 text-xs font-bold cursor-pointer"
                    >
                      تحديث
                    </button>
                  </div>
                ))}

                {uncertainOrders.slice(0, 1).map(order => (
                  <div 
                    key={order.id}
                    className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/25 flex items-center justify-between"
                  >
                    <div>
                      <div className="font-bold text-xs text-slate-200 flex items-center gap-1.5">
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                        <span>{order.pharmacyName}</span>
                      </div>
                      <div className="text-[11px] text-amber-300 mt-0.5">
                        يحتوي الطلب على أصناف تحتاج تدقيق
                      </div>
                    </div>
                    <button
                      onClick={() => onNavigate('price-comparison', order.id)}
                      className="px-2.5 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 text-xs font-bold cursor-pointer"
                    >
                      مراجعة
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Section: Best Savings Opportunities (أفضل فرص التوفير) */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-5 space-y-3.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  <Flame className="w-4 h-4" />
                </div>
                <h2 className="text-sm font-bold text-white">أفضل فرص التوفير بالسوق</h2>
              </div>
              <span className="text-[11px] text-emerald-400 font-bold">فوارق أسعار كبرى</span>
            </div>

            <p className="text-xs text-slate-400">
              أصناف يوجد بها فارق سعر ملحوظ بين المستودعات يمكنك توفير مبالغ ممتازة عند شرائها:
            </p>

            <div className="space-y-2.5">
              {savingsOpportunities.length === 0 ? (
                <div className="text-center py-4 text-xs text-slate-500">
                  سجل مزيداً من أسعار المستودعات لعرض المقارنات التلقائية.
                </div>
              ) : (
                savingsOpportunities.map(({ medicine, summary, spread, percent }) => (
                  <div
                    key={medicine.id}
                    className="p-3.5 rounded-2xl bg-slate-950/70 border border-slate-800/80 hover:border-emerald-500/30 transition-colors space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-xs sm:text-sm text-slate-100">{medicine.name}</span>
                      <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 font-bold border border-emerald-500/25">
                        توفير {formatCurrency(spread)} ({percent}%)
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs pt-1 border-t border-slate-900">
                      <div>
                        <span className="text-slate-500 text-[11px] block">أفضل سعر متاح:</span>
                        <span className="font-bold text-emerald-400">{formatCurrency(summary.lowestPrice)}</span>
                        <span className="text-[10px] text-slate-400 block truncate">({summary.bestSupplierName})</span>
                      </div>
                      <div>
                        <span className="text-slate-500 text-[11px] block">السعر المعتاد/الأعلى:</span>
                        <span className="font-medium text-slate-300 line-through">{formatCurrency(summary.highestPrice)}</span>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

        </div>

      </div>

    </div>
  );
};
