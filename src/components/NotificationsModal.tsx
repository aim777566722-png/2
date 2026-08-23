import React from 'react';
import { 
  Bell, 
  X, 
  AlertTriangle, 
  CheckCircle2, 
  Clock, 
  Layers, 
  ShoppingCart, 
  Receipt,
  ChevronLeft
} from 'lucide-react';
import { Medicine, PharmacyOrder, PurchaseInvoice, MarketPriceRecord } from '../types';
import { computeMedicinePriceSummary, formatCurrency } from '../utils/helpers';

interface NotificationsModalProps {
  isOpen: boolean;
  onClose: () => void;
  medicines: Medicine[];
  marketPrices: MarketPriceRecord[];
  orders: PharmacyOrder[];
  invoices: PurchaseInvoice[];
  onNavigate: (tab: string, id?: string) => void;
}

export const NotificationsModal: React.FC<NotificationsModalProps> = ({
  isOpen,
  onClose,
  medicines,
  marketPrices,
  orders,
  invoices,
  onNavigate
}) => {
  if (!isOpen) return null;

  // Stale prices (> 60 days)
  const stalePriceMedicines = medicines.map(med => {
    return computeMedicinePriceSummary(med.id, med.name, marketPrices);
  }).filter((summary): summary is NonNullable<typeof summary> => {
    return summary !== null && summary.daysOld > 60;
  });

  // Orders with uncertain items
  const ordersWithUncertain = orders.filter(o => o.items.some(i => i.isUncertain));

  // Orders in purchasing state
  const pendingPurchasingOrders = orders.filter(o => o.status === 'purchasing');

  const totalAlerts = stalePriceMedicines.length + ordersWithUncertain.length + pendingPurchasingOrders.length;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-16 sm:pt-20 p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-150" dir="rtl">
      <div 
        className="w-full max-w-lg bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[80vh]"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-teal-500/10 text-teal-400 border border-teal-500/20">
              <Bell className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">مركز التنبيهات وإشعارات العمليات</h2>
              <p className="text-[11px] text-slate-400">تحديثات فورية لأسعار السوق وحالات الطلبات</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {totalAlerts === 0 ? (
            <div className="text-center py-10 text-slate-400 space-y-2">
              <CheckCircle2 className="w-10 h-10 mx-auto text-emerald-400" />
              <p className="text-sm font-bold text-slate-200">كل شيء على ما يرام ✓</p>
              <p className="text-xs text-slate-500">لا توجد تنبيهات عاجلة تتطلب تدخلك الآن.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {/* Stale Price Alerts */}
              {stalePriceMedicines.length > 0 && (
                <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-rose-400 font-bold text-xs">
                      <AlertTriangle className="w-4 h-4" />
                      <span>تنبيه: {stalePriceMedicines.length} أسعار سوق قديمة</span>
                    </div>
                    <span className="text-[10px] bg-rose-500/20 text-rose-300 px-2 py-0.5 rounded-full font-bold">
                      أكثر من 60 يوماً
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-300">
                    هذه الأصناف تحتاج لتأكيد السعر الحالي مع المستودع قبل الشراء:
                  </p>
                  <div className="space-y-1">
                    {stalePriceMedicines.map(med => (
                      <div key={med.medicineId} className="flex items-center justify-between text-xs py-1 border-t border-rose-500/20">
                        <span className="font-semibold text-slate-200">{med.medicineName}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-rose-400 text-[11px] font-mono">منذ {med.daysOld} يوماً</span>
                          <button
                            onClick={() => {
                              onNavigate('market-prices');
                              onClose();
                            }}
                            className="text-[11px] text-teal-400 hover:underline cursor-pointer"
                          >
                            تحديث السعر
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Uncertain Orders */}
              {ordersWithUncertain.length > 0 && (
                <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-amber-400 font-bold text-xs">
                      <AlertTriangle className="w-4 h-4" />
                      <span>طلب يحتوي على أصناف غير مؤكدة</span>
                    </div>
                  </div>
                  {ordersWithUncertain.map(order => (
                    <div key={order.id} className="flex items-center justify-between text-xs py-1">
                      <div>
                        <div className="font-bold text-slate-200">{order.pharmacyName}</div>
                        <div className="text-[11px] text-slate-400">{order.orderNumber}</div>
                      </div>
                      <button
                        onClick={() => {
                          onNavigate('price-comparison', order.id);
                          onClose();
                        }}
                        className="px-2.5 py-1 rounded-lg bg-amber-500/20 text-amber-300 text-xs hover:bg-amber-500/30 font-medium cursor-pointer"
                      >
                        مراجعة الأصناف
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Pending Orders */}
              {pendingPurchasingOrders.length > 0 && (
                <div className="p-3.5 rounded-xl bg-teal-500/10 border border-teal-500/30 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-teal-400 font-bold text-xs">
                      <Clock className="w-4 h-4" />
                      <span>{pendingPurchasingOrders.length} طلبات قيد التنفيذ والشراء</span>
                    </div>
                  </div>
                  {pendingPurchasingOrders.map(order => (
                    <div key={order.id} className="flex items-center justify-between text-xs py-1 border-t border-teal-500/20">
                      <div>
                        <div className="font-bold text-slate-200">{order.pharmacyName}</div>
                        <div className="text-[11px] text-slate-400">{order.items.length} أصناف مطلوبة</div>
                      </div>
                      <button
                        onClick={() => {
                          onNavigate('price-comparison', order.id);
                          onClose();
                        }}
                        className="px-2.5 py-1 rounded-lg bg-teal-500/20 text-teal-300 text-xs hover:bg-teal-500/30 font-medium cursor-pointer"
                      >
                        متابعة الطلب
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
