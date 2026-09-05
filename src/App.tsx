import React, { useState, useEffect } from 'react';
import { 
  PharmacyOrder, 
  PurchaseInvoice, 
  MarketPriceRecord, 
  Medicine, 
  Supplier, 
  OrderInvoiceReconciliation 
} from './types';
import { Storage } from './data/storage';
import { DashboardView } from './components/DashboardView';
import { OrdersView } from './components/OrdersView';
import { PriceComparisonView } from './components/PriceComparisonView';
import { InvoiceIntakeView } from './components/InvoiceIntakeView';
import { ReconciliationView } from './components/ReconciliationView';
import { MarketPricesView } from './components/MarketPricesView';
import { SuppliersView } from './components/SuppliersView';
import { MoreView } from './components/MoreView';
import { DocumentUploadView } from './components/DocumentUploadView';
import { BottomNavBar } from './components/BottomNavBar';
import { GlobalSearchModal } from './components/GlobalSearchModal';
import { NotificationsModal } from './components/NotificationsModal';
import { BackgroundAnalysisProvider } from './context/BackgroundAnalysisContext';
import { BackgroundProcessingBanner } from './components/BackgroundProcessingBanner';
import { computeMedicinePriceSummary } from './utils/helpers';
import { App as CapApp } from '@capacitor/app';
import { 
  TrendingDown, 
  Search, 
  Bell, 
  FileUp, 
  Plus, 
  Camera
} from 'lucide-react';

export default function App() {
  const [activeTab, setActiveTab] = useState<string>('dashboard');
  
  // Application Data States
  const [medicines, setMedicines] = useState<Medicine[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [marketPrices, setMarketPrices] = useState<MarketPriceRecord[]>([]);
  const [orders, setOrders] = useState<PharmacyOrder[]>([]);
  const [invoices, setInvoices] = useState<PurchaseInvoice[]>([]);
  const [reconciliations, setReconciliations] = useState<OrderInvoiceReconciliation[]>([]);

  // Modals & UI States
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [isFabOpen, setIsFabOpen] = useState(false);

  // Current active selections for workflow
  const [activeOrderId, setActiveOrderId] = useState<string | null>(null);
  const [activeInvoiceId, setActiveInvoiceId] = useState<string | null>(null);

  // Load from storage
  useEffect(() => {
    let mounted = true;
    const load = async () => {
      await Storage.hydrate();
      if (!mounted) return;
      setMedicines(Storage.getMedicines());
      setSuppliers(Storage.getSuppliers());
      setMarketPrices(Storage.getMarketPrices());
      setOrders(Storage.getOrders());
      setInvoices(Storage.getInvoices());
      setReconciliations(Storage.getReconciliations());
    };
    void load();
    return () => { mounted = false; };
  }, []);

  // Hardware Back Button listener for Android via Capacitor
  useEffect(() => {
    let listenerHandle: { remove: () => Promise<void> | void } | null = null;
    let isMounted = true;

    const setupListener = async () => {
      try {
        if (typeof CapApp !== 'undefined' && typeof CapApp.addListener === 'function') {
          const handle = await CapApp.addListener('backButton', () => {
            if (isSearchOpen) {
              setIsSearchOpen(false);
            } else if (isNotificationsOpen) {
              setIsNotificationsOpen(false);
            } else if (isFabOpen) {
              setIsFabOpen(false);
            } else if (activeTab !== 'dashboard') {
              handleNavigate('dashboard');
            } else {
              try {
                CapApp.exitApp();
              } catch (e) {
                console.warn('exitApp failed:', e);
              }
            }
          });

          if (isMounted) {
            listenerHandle = handle;
          } else {
            if (handle && typeof handle.remove === 'function') {
              try {
                handle.remove();
              } catch (e) {
                // ignore
              }
            }
          }
        }
      } catch (err) {
        console.warn('Capacitor App listener not available in standard browser environment:', err);
      }
    };

    setupListener();

    return () => {
      isMounted = false;
      if (listenerHandle && typeof listenerHandle.remove === 'function') {
        try {
          listenerHandle.remove();
        } catch (e) {
          // ignore
        }
      }
    };
  }, [isSearchOpen, isNotificationsOpen, isFabOpen, activeTab]);

  // Navigation Handler
  const handleNavigate = (tab: string, orderId?: string) => {
    if (orderId) {
      setActiveOrderId(orderId);
    }
    setActiveTab(tab);
    setIsFabOpen(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleOrderApproved = (newOrder: PharmacyOrder) => {
    try {
      const updated = Storage.saveOrder(newOrder);
      setOrders(updated);
      setActiveOrderId(newOrder.id);
      setActiveTab('price-comparison');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      console.error('Error approving order:', err);
    }
  };

  const handleDeleteOrder = (orderId: string) => {
    if (window.confirm('هل أنت متأكد من حذف هذا الطلب؟')) {
      const updated = orders.filter(o => o.id !== orderId);
      Storage.saveOrders(updated);
      setOrders(updated);
    }
  };

  const handleDeleteInvoice = (invoiceId: string) => {
    if (window.confirm('هل أنت متأكد من حذف هذه الفاتورة؟')) {
      const updated = invoices.filter(inv => inv.id !== invoiceId);
      Storage.saveInvoices(updated);
      setInvoices(updated);
    }
  };

  const handleUpdateOrder = (updatedOrder: PharmacyOrder) => {
    const updated = Storage.saveOrder(updatedOrder);
    setOrders(updated);
  };

  const handleInvoiceSaved = (newInvoice: PurchaseInvoice, targetOrderId?: string) => {
    try {
      const updatedInvoices = Storage.saveInvoice(newInvoice);
      setInvoices(updatedInvoices);
      setMarketPrices(Storage.getMarketPrices());

      const orderIdToMatch = targetOrderId || newInvoice.matchedOrderId;
      if (orderIdToMatch) {
        const currentOrders = Storage.getOrders();
        const matchedOrder = currentOrders.find(o => o.id === orderIdToMatch);
        if (matchedOrder) {
          // Update order items with purchased information from invoice
          const updatedItems = (matchedOrder.items || []).map(orderItem => {
            const invMatch = (newInvoice.items || []).find(it => {
              const invName = String(it.itemName || '').trim().toLowerCase();
              const ordName = String(orderItem.matchedMedicineName || orderItem.rawText || '').trim().toLowerCase();
              return invName === ordName || (it.matchedMedicineId && it.matchedMedicineId === orderItem.matchedMedicineId);
            });

            if (invMatch) {
              return {
                ...orderItem,
                isPurchased: true,
                actualPurchasedPrice: invMatch.unitPrice,
                actualPurchasedQuantity: invMatch.quantity,
                purchasedSupplierId: newInvoice.supplierId,
                purchasedSupplierName: newInvoice.supplierName,
                purchasedInvoiceId: newInvoice.id,
                purchasedInvoiceNumber: newInvoice.invoiceNumber,
                purchasedDate: newInvoice.invoiceDate
              };
            }
            return orderItem;
          });

          const allPurchased = updatedItems.length > 0 && updatedItems.every(i => i.isPurchased);
          const somePurchased = updatedItems.some(i => i.isPurchased);
          const newStatus = allPurchased ? 'completed' : somePurchased ? 'partial' : 'pending';

          const updatedOrder: PharmacyOrder = {
            ...matchedOrder,
            status: newStatus,
            matchedInvoiceId: newInvoice.id,
            items: updatedItems
          };

          const finalOrders = Storage.saveOrder(updatedOrder);
          setOrders(finalOrders);
        }

        setActiveOrderId(orderIdToMatch);
        setActiveInvoiceId(newInvoice.id);
        setActiveTab('orders');
      } else {
        setActiveInvoiceId(newInvoice.id);
        setActiveTab('reconciliation');
      }
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      console.error('Error saving invoice:', err);
    }
  };

  const handleSaveReconciliation = (rec: OrderInvoiceReconciliation) => {
    const updated = Storage.saveReconciliation(rec);
    setReconciliations(updated);
    
    // Mark order as completed
    const matchedOrder = orders.find(o => o.id === rec.orderId);
    if (matchedOrder) {
      const updatedOrder: PharmacyOrder = { ...matchedOrder, status: 'completed' };
      setOrders(Storage.saveOrder(updatedOrder));
    }
  };

  const handleAddPriceRecord = (record: MarketPriceRecord) => {
    const updated = Storage.addMarketPrice(record);
    setMarketPrices(updated);
  };

  const handleDeletePriceRecord = (recordId: string) => {
    const updated = Storage.deleteMarketPrice(recordId);
    setMarketPrices(updated);
  };

  const handleDeletePricesForMedicine = (medicineId: string, medicineName?: string) => {
    const updated = Storage.deleteMarketPricesForMedicine(medicineId, medicineName);
    setMarketPrices(updated);
  };

  const handleDeduplicatePricesForMedicine = (medicineId: string, medicineName?: string) => {
    const updated = Storage.deduplicateMarketPricesForMedicine(medicineId, medicineName);
    setMarketPrices(updated);
  };

  const handleImportMarketPrices = (records: MarketPriceRecord[]) => {
    const current = Storage.getMarketPrices();
    const updated = [...records, ...current];
    Storage.saveMarketPrices(updated);
    setMarketPrices(updated);
    setActiveTab('market-prices');
  };

  const handleAddMedicine = (medicine: Medicine) => {
    const updated = Storage.addMedicine(medicine);
    setMedicines(updated);
  };

  const handleAddSupplier = (supplier: Supplier) => {
    const updated = Storage.addSupplier(supplier);
    setSuppliers(updated);
  };

  const handleResetData = () => {
    if (window.confirm('هل تريد إعادة تعيين البيانات إلى النماذج التجريبية الافتراضية؟')) {
      Storage.resetAll();
      setMedicines(Storage.getMedicines());
      setSuppliers(Storage.getSuppliers());
      setMarketPrices(Storage.getMarketPrices());
      setOrders(Storage.getOrders());
      setInvoices(Storage.getInvoices());
      setReconciliations([]);
      setActiveTab('dashboard');
    }
  };

  // Stale price alerts count
  const stalePriceCount = medicines.filter(med => {
    const summary = computeMedicinePriceSummary(med.id, med.name, marketPrices);
    return summary && summary.daysOld > 60;
  }).length;

  // Active uncompleted orders
  const activeOrdersCount = orders.filter(o => o.status !== 'completed').length;

  // Currently focused order and invoice
  const currentOrder = orders.find(o => o.id === activeOrderId) || orders[0] || {
    id: 'default',
    orderNumber: 'ORD-SAMPLE',
    pharmacyName: 'صيدلية النخبة',
    orderDate: new Date().toISOString().split('T')[0],
    status: 'draft',
    rawInputText: '',
    items: [],
    createdTimestamp: Date.now()
  };
  const currentInvoice = invoices.find(i => i.id === activeInvoiceId) || invoices[0];

  return (
    <BackgroundAnalysisProvider>
      <div className="min-h-screen bg-slate-950 text-slate-100 font-sans selection:bg-teal-500 selection:text-slate-950 flex flex-col" dir="rtl">
        
        {/* Top App Bar with safe area padding */}
        <header className="border-b border-slate-800/80 bg-slate-950/90 backdrop-blur-md sticky top-0 z-40">
          <div className="px-4 sm:px-6 py-2.5 max-w-6xl mx-auto flex items-center justify-between gap-3">
            
            {/* Logo & Identity */}
            <div 
              onClick={() => handleNavigate('dashboard')}
              className="flex items-center gap-2.5 cursor-pointer select-none group"
            >
              <div className="w-9 h-9 rounded-2xl bg-gradient-to-tr from-teal-500 to-emerald-400 p-0.5 shadow-md shadow-teal-500/20 group-hover:scale-105 transition-transform flex items-center justify-center shrink-0">
                <div className="w-full h-full bg-slate-950 rounded-[14px] flex items-center justify-center">
                  <TrendingDown className="w-4 h-4 text-teal-400" />
                </div>
              </div>

              <div>
                <div className="flex items-center gap-1.5">
                  <span className="text-sm sm:text-base font-black text-white tracking-tight">مساعد المشتريات</span>
                  <span className="text-[9px] px-1.5 py-0.2 rounded-full bg-teal-500/15 text-teal-300 font-bold border border-teal-500/30">
                    أندرويد
                  </span>
                </div>
                <p className="text-[10px] text-slate-400 truncate max-w-[170px] sm:max-w-none">إدارة مشتريات الصيدليات ومقارنة الأسعار</p>
              </div>
            </div>

            {/* Quick Header Actions */}
            <div className="flex items-center gap-1.5">
              
              {/* Document Upload Quick Icon */}
              <button
                onClick={() => handleNavigate('document-upload')}
                className={`p-2 rounded-xl border transition-all cursor-pointer flex items-center gap-1.5 active:scale-95 ${
                  activeTab === 'document-upload' 
                    ? 'bg-teal-500/20 text-teal-300 border-teal-500/50' 
                    : 'bg-slate-900/90 hover:bg-slate-800 text-slate-300 border-slate-800'
                }`}
                title="رفع وثائق ومستندات (PDF / Excel / Word / صور)"
              >
                <FileUp className="w-4 h-4 text-teal-400" />
                <span className="text-[11px] font-bold text-teal-300 hidden md:inline">رفع وثيقة</span>
              </button>

              {/* Global Search Button */}
              <button
                onClick={() => setIsSearchOpen(true)}
                className="p-2 rounded-xl bg-slate-900/90 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-800 transition-all cursor-pointer active:scale-95"
                title="بحث شامل"
              >
                <Search className="w-4 h-4 text-slate-300" />
              </button>

              {/* Notifications Button */}
              <button
                onClick={() => setIsNotificationsOpen(true)}
                className="relative p-2 rounded-xl bg-slate-900/90 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-800 transition-all cursor-pointer active:scale-95"
                title="التنبيهات"
              >
                <Bell className="w-4 h-4 text-slate-300" />
                {stalePriceCount > 0 && (
                  <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-rose-500 text-white text-[9px] font-bold flex items-center justify-center animate-pulse">
                    {stalePriceCount}
                  </span>
                )}
              </button>

            </div>

          </div>
        </header>

        {/* Real-time Background Processing Banner */}
        <BackgroundProcessingBanner onNavigate={handleNavigate} />

        {/* Main Content Area */}
        <main className="flex-1 w-full px-3 sm:px-6 py-4 max-w-6xl mx-auto pb-24">
          {activeTab === 'dashboard' && (
            <DashboardView
              orders={orders}
              invoices={invoices}
              marketPrices={marketPrices}
              medicines={medicines}
              onNavigate={handleNavigate}
            />
          )}

          {activeTab === 'orders' && (
            <OrdersView
              orders={orders}
              knownMedicines={medicines}
              knownSuppliers={suppliers}
              marketPrices={marketPrices}
              onOrderApproved={handleOrderApproved}
              onUpdateOrder={handleUpdateOrder}
              onSavePurchaseInvoice={handleInvoiceSaved}
              onNavigateToPriceComparison={(orderId) => handleNavigate('price-comparison', orderId)}
              onNavigateToInvoice={(orderId) => handleNavigate('invoices', orderId)}
              onDeleteOrder={handleDeleteOrder}
              initialMode="list"
            />
          )}

          {activeTab === 'order-intake' && (
            <OrdersView
              orders={orders}
              knownMedicines={medicines}
              knownSuppliers={suppliers}
              marketPrices={marketPrices}
              onOrderApproved={handleOrderApproved}
              onUpdateOrder={handleUpdateOrder}
              onSavePurchaseInvoice={handleInvoiceSaved}
              onNavigateToPriceComparison={(orderId) => handleNavigate('price-comparison', orderId)}
              onNavigateToInvoice={(orderId) => handleNavigate('invoices', orderId)}
              onDeleteOrder={handleDeleteOrder}
              initialMode="create"
            />
          )}

          {activeTab === 'document-upload' && (
            <DocumentUploadView
              knownMedicines={medicines}
              knownSuppliers={suppliers}
              onOrderCreated={handleOrderApproved}
              onInvoiceCreated={handleInvoiceSaved}
              onMarketPricesImported={handleImportMarketPrices}
              onAddMedicine={handleAddMedicine}
              onAddSupplier={handleAddSupplier}
              onNavigate={handleNavigate}
              onBack={() => handleNavigate('dashboard')}
            />
          )}

          {activeTab === 'price-comparison' && (
            <PriceComparisonView
              order={currentOrder}
              marketPrices={marketPrices}
              medicines={medicines}
              suppliers={suppliers}
              onNavigateToInvoice={(orderId) => handleNavigate('invoice-intake', orderId)}
              onBack={() => handleNavigate('orders')}
            />
          )}

          {activeTab === 'market-prices' && (
            <MarketPricesView
              medicines={medicines}
              suppliers={suppliers}
              marketPrices={marketPrices}
              onAddPriceRecord={handleAddPriceRecord}
              onDeletePriceRecord={handleDeletePriceRecord}
              onDeletePricesForMedicine={handleDeletePricesForMedicine}
              onDeduplicatePricesForMedicine={handleDeduplicatePricesForMedicine}
              onAddMedicine={handleAddMedicine}
            />
          )}

          {activeTab === 'suppliers' && (
            <SuppliersView
              suppliers={suppliers}
              marketPrices={marketPrices}
              invoices={invoices}
              onAddSupplier={handleAddSupplier}
            />
          )}

          {activeTab === 'invoice-intake' && (
            <InvoiceIntakeView
              knownSuppliers={suppliers}
              knownMedicines={medicines}
              marketPrices={marketPrices}
              orders={orders}
              preSelectedOrderId={activeOrderId || undefined}
              onInvoiceSaved={handleInvoiceSaved}
              onCancel={() => handleNavigate('dashboard')}
            />
          )}

          {activeTab === 'reconciliation' && (
            <ReconciliationView
              order={currentOrder}
              invoice={currentInvoice}
              marketPrices={marketPrices}
              onSaveReconciliation={handleSaveReconciliation}
              onBack={() => handleNavigate('dashboard')}
            />
          )}

          {activeTab === 'more' && (
            <MoreView
              invoices={invoices}
              orders={orders}
              medicines={medicines}
              suppliers={suppliers}
              marketPrices={marketPrices}
              onNavigate={handleNavigate}
              onResetData={handleResetData}
              onDeleteInvoice={handleDeleteInvoice}
            />
          )}
        </main>

        {/* Floating Action Speed Dial */}
        <div className="fixed bottom-20 left-4 z-40 flex flex-col items-center gap-2">
          {isFabOpen && (
            <div className="flex flex-col items-center gap-2 bg-slate-900/95 backdrop-blur-md p-2.5 rounded-3xl border border-slate-800 shadow-2xl animate-in fade-in zoom-in duration-200">
              <button
                onClick={() => handleNavigate('order-intake')}
                className="w-10 h-10 rounded-2xl bg-teal-500/20 hover:bg-teal-500/30 text-teal-300 border border-teal-500/40 flex items-center justify-center cursor-pointer shadow-md transition-all active:scale-95"
                title="طلب صيدلية جديد"
              >
                <Plus className="w-5 h-5" />
              </button>
              <button
                onClick={() => handleNavigate('document-upload')}
                className="w-10 h-10 rounded-2xl bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 flex items-center justify-center cursor-pointer shadow-md transition-all active:scale-95"
                title="رفع ملف PDF/Excel/Word"
              >
                <FileUp className="w-5 h-5" />
              </button>
              <button
                onClick={() => handleNavigate('invoice-intake')}
                className="w-10 h-10 rounded-2xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 flex items-center justify-center cursor-pointer shadow-md transition-all active:scale-95"
                title="تصوير وتسجيل فاتورة شراء"
              >
                <Camera className="w-5 h-5" />
              </button>
            </div>
          )}

          <button
            onClick={() => setIsFabOpen(!isFabOpen)}
            className={`w-12 h-12 rounded-2xl shadow-xl flex items-center justify-center cursor-pointer transition-all duration-200 active:scale-90 ${
              isFabOpen
                ? 'bg-slate-800 text-slate-200 border border-slate-700 rotate-45'
                : 'bg-gradient-to-r from-teal-500 to-emerald-500 text-slate-950 font-bold shadow-teal-500/30'
            }`}
            title="إجراءات سريعة"
          >
            <Plus className="w-6 h-6" />
          </button>
        </div>

        {/* Android Material 3 Bottom Navigation Bar */}
        <BottomNavBar
          activeTab={activeTab}
          onTabChange={(tab) => handleNavigate(tab)}
          onSelectTab={(tab) => handleNavigate(tab)}
          ordersBadge={activeOrdersCount > 0 ? activeOrdersCount : undefined}
          alertsBadge={stalePriceCount > 0 ? stalePriceCount : undefined}
        />

        {/* Global Search Modal */}
        <GlobalSearchModal
          isOpen={isSearchOpen}
          onClose={() => setIsSearchOpen(false)}
          medicines={medicines}
          suppliers={suppliers}
          orders={orders}
          invoices={invoices}
          marketPrices={marketPrices}
          onNavigate={handleNavigate}
        />

        {/* Notifications & Alerts Modal */}
        <NotificationsModal
          isOpen={isNotificationsOpen}
          onClose={() => setIsNotificationsOpen(false)}
          medicines={medicines}
          marketPrices={marketPrices}
          orders={orders}
          invoices={invoices}
          onNavigate={handleNavigate}
        />

      </div>
    </BackgroundAnalysisProvider>
  );
}
