import { 
  Medicine, 
  Supplier, 
  MarketPriceRecord, 
  PharmacyOrder, 
  PurchaseInvoice, 
  OrderInvoiceReconciliation 
} from '../types';
import { 
  INITIAL_MEDICINES, 
  INITIAL_SUPPLIERS, 
  INITIAL_MARKET_PRICES, 
  INITIAL_ORDERS, 
  INITIAL_INVOICES 
} from './initialData';

const STORAGE_KEYS = {
  MEDICINES: 'pharmacy_purchasemate_medicines_v1',
  SUPPLIERS: 'pharmacy_purchasemate_suppliers_v1',
  MARKET_PRICES: 'pharmacy_purchasemate_prices_v1',
  ORDERS: 'pharmacy_purchasemate_orders_v1',
  INVOICES: 'pharmacy_purchasemate_invoices_v1',
  RECONCILIATIONS: 'pharmacy_purchasemate_reconciliations_v1',
  ACTIVE_TASK: 'pharmacy_purchasemate_active_task_v1'
};

// In-memory hot cache for instant O(1) synchronous reactivity
const memoryCache: {
  medicines?: Medicine[];
  suppliers?: Supplier[];
  marketPrices?: MarketPriceRecord[];
  orders?: PharmacyOrder[];
  invoices?: PurchaseInvoice[];
  reconciliations?: OrderInvoiceReconciliation[];
} = {};

// Simple Native IndexedDB Helper for high datasets (30,000+ items / 50MB+)
const DB_NAME = 'PharmacyPurchaseMate_HighCapacityDB';
const DB_VERSION = 1;
const STORE_NAME = 'app_keyval';

function getIndexedDB(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  return new Promise((resolve) => {
    try {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

function persistToIndexedDB(key: string, value: any) {
  getIndexedDB().then(db => {
    if (!db) return;
    try {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.put(value, key);
    } catch (e) {
      console.warn('IDB write error:', e);
    }
  });
}

function safeLocalStorageSet(key: string, value: any) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (err) {
    // If QuotaExceededError happens when storing 30,000+ items,
    // fallback gracefully to IndexedDB while maintaining in-memory cache!
    console.warn(`LocalStorage quota exceeded for ${key}. Falling back to IndexedDB persistent storage.`);
  }
  // Always persist to IndexedDB in parallel for durability
  persistToIndexedDB(key, value);
}

export const Storage = {
  getMedicines(): Medicine[] {
    if (memoryCache.medicines) return memoryCache.medicines;
    try {
      const data = localStorage.getItem(STORAGE_KEYS.MEDICINES);
      if (!data) {
        safeLocalStorageSet(STORAGE_KEYS.MEDICINES, INITIAL_MEDICINES);
        memoryCache.medicines = INITIAL_MEDICINES;
        return INITIAL_MEDICINES;
      }
      const parsed = JSON.parse(data);
      memoryCache.medicines = Array.isArray(parsed) ? parsed : INITIAL_MEDICINES;
      return memoryCache.medicines;
    } catch {
      memoryCache.medicines = INITIAL_MEDICINES;
      return INITIAL_MEDICINES;
    }
  },

  saveMedicines(medicines: Medicine[]) {
    memoryCache.medicines = medicines;
    safeLocalStorageSet(STORAGE_KEYS.MEDICINES, medicines);
  },

  addMedicine(medicine: Medicine): Medicine[] {
    const list = this.getMedicines();
    const medNameClean = String(medicine.name || '').trim().toLowerCase();
    const existingIndex = list.findIndex(m => (medicine.id && m.id === medicine.id) || (medNameClean && String(m.name || '').trim().toLowerCase() === medNameClean));
    let updated: Medicine[];
    if (existingIndex >= 0) {
      const existing = list[existingIndex];
      const mergedAliases = Array.from(new Set([...(existing.aliases || []), ...(medicine.aliases || [])]));
      updated = [...list];
      updated[existingIndex] = {
        ...existing,
        ...medicine,
        aliases: mergedAliases
      };
    } else {
      updated = [medicine, ...list];
    }
    this.saveMedicines(updated);
    return updated;
  },

  addAliasToMedicine(medicineId: string, aliasName: string): Medicine[] {
    const list = this.getMedicines();
    const cleanAlias = String(aliasName || '').trim();
    if (!cleanAlias) return list;

    const index = list.findIndex(m => (medicineId && m.id === medicineId) || (m.name && m.name.trim().toLowerCase() === cleanAlias.toLowerCase()));
    if (index >= 0) {
      const med = list[index];
      const existingAliases = Array.isArray(med.aliases) ? med.aliases : [];
      const alreadyHas = existingAliases.some(a => a.trim().toLowerCase() === cleanAlias.toLowerCase()) || 
                         med.name.trim().toLowerCase() === cleanAlias.toLowerCase();
      if (!alreadyHas) {
        const updatedMed: Medicine = {
          ...med,
          aliases: [...existingAliases, cleanAlias]
        };
        const updated = [...list];
        updated[index] = updatedMed;
        this.saveMedicines(updated);
        return updated;
      }
    }
    return list;
  },

  getSuppliers(): Supplier[] {
    if (memoryCache.suppliers) return memoryCache.suppliers;
    try {
      const data = localStorage.getItem(STORAGE_KEYS.SUPPLIERS);
      if (!data) {
        safeLocalStorageSet(STORAGE_KEYS.SUPPLIERS, INITIAL_SUPPLIERS);
        memoryCache.suppliers = INITIAL_SUPPLIERS;
        return INITIAL_SUPPLIERS;
      }
      const parsed = JSON.parse(data);
      memoryCache.suppliers = Array.isArray(parsed) ? parsed : INITIAL_SUPPLIERS;
      return memoryCache.suppliers;
    } catch {
      memoryCache.suppliers = INITIAL_SUPPLIERS;
      return INITIAL_SUPPLIERS;
    }
  },

  saveSuppliers(suppliers: Supplier[]) {
    memoryCache.suppliers = suppliers;
    safeLocalStorageSet(STORAGE_KEYS.SUPPLIERS, suppliers);
  },

  addSupplier(supplier: Supplier): Supplier[] {
    const list = this.getSuppliers();
    const supNameClean = String(supplier.name || '').trim().toLowerCase();
    const existingIndex = list.findIndex(s => (supplier.id && s.id === supplier.id) || (supNameClean && String(s.name || '').trim().toLowerCase() === supNameClean));
    let updated: Supplier[];
    if (existingIndex >= 0) {
      updated = [...list];
      updated[existingIndex] = supplier;
    } else {
      updated = [supplier, ...list];
    }
    this.saveSuppliers(updated);
    return updated;
  },

  getMarketPrices(): MarketPriceRecord[] {
    if (memoryCache.marketPrices) return memoryCache.marketPrices;
    try {
      const data = localStorage.getItem(STORAGE_KEYS.MARKET_PRICES);
      if (!data) {
        safeLocalStorageSet(STORAGE_KEYS.MARKET_PRICES, INITIAL_MARKET_PRICES);
        memoryCache.marketPrices = INITIAL_MARKET_PRICES;
        return INITIAL_MARKET_PRICES;
      }
      const parsed = JSON.parse(data);
      memoryCache.marketPrices = Array.isArray(parsed) ? parsed : INITIAL_MARKET_PRICES;
      return memoryCache.marketPrices;
    } catch {
      memoryCache.marketPrices = INITIAL_MARKET_PRICES;
      return INITIAL_MARKET_PRICES;
    }
  },

  saveMarketPrices(prices: MarketPriceRecord[]) {
    memoryCache.marketPrices = prices;
    safeLocalStorageSet(STORAGE_KEYS.MARKET_PRICES, prices);
  },

  addMarketPrice(record: MarketPriceRecord): MarketPriceRecord[] {
    const list = this.getMarketPrices();
    const updated = [record, ...list];
    this.saveMarketPrices(updated);
    return updated;
  },

  deleteMarketPrice(recordId: string): MarketPriceRecord[] {
    const list = this.getMarketPrices();
    const updated = list.filter(r => r.id !== recordId);
    this.saveMarketPrices(updated);
    return updated;
  },

  deleteMarketPricesForMedicine(medicineId: string, medicineName?: string): MarketPriceRecord[] {
    const list = this.getMarketPrices();
    const medIdClean = String(medicineId || '').trim();
    const medNameClean = String(medicineName || '').trim().toLowerCase();
    
    const updated = list.filter(r => {
      if (medIdClean && r.medicineId === medIdClean) return false;
      if (medNameClean && String(r.medicineName || '').trim().toLowerCase() === medNameClean) return false;
      return true;
    });
    this.saveMarketPrices(updated);
    return updated;
  },

  deduplicateMarketPricesForMedicine(medicineId: string, medicineName?: string): MarketPriceRecord[] {
    const list = this.getMarketPrices();
    const medIdClean = String(medicineId || '').trim();
    const medNameClean = String(medicineName || '').trim().toLowerCase();

    const seen = new Set<string>();
    const updated: MarketPriceRecord[] = [];

    for (const r of list) {
      const isTarget = (medIdClean && r.medicineId === medIdClean) ||
                       (medNameClean && String(r.medicineName || '').trim().toLowerCase() === medNameClean);
      if (isTarget) {
        // Key based on supplier, price, date, bonus
        const key = `${r.supplierName.trim().toLowerCase()}_${r.unitPrice}_${r.invoiceDate || ''}_${r.bonusScheme || ''}`;
        if (!seen.has(key)) {
          seen.add(key);
          updated.push(r);
        }
      } else {
        updated.push(r);
      }
    }

    this.saveMarketPrices(updated);
    return updated;
  },

  addPricesFromInvoice(invoice: PurchaseInvoice): MarketPriceRecord[] {
    const currentPrices = this.getMarketPrices();
    if (!invoice || !Array.isArray(invoice.items)) return currentPrices;

    const newRecords: MarketPriceRecord[] = invoice.items
      .filter(item => item)
      .map(item => {
        const rawName = item.itemName || (item as any).medicineName || 'صنف غير محدد';
        const safeName = String(rawName).trim();
        const safeIdPart = safeName.replace(/\s+/g, '-').toLowerCase();

        return {
          id: `price-inv-${invoice.id || Date.now()}-${item.id || Math.random().toString(36).slice(2, 7)}`,
          medicineId: item.matchedMedicineId || `med-${safeIdPart}`,
          medicineName: safeName,
          supplierId: invoice.supplierId || 'sup-1',
          supplierName: invoice.supplierName || 'مورد عام',
          unitPrice: Number(item.unitPrice ?? (item as any).purchaseUnitPrice ?? 0) || 0,
          invoiceDate: invoice.invoiceDate || new Date().toISOString().split('T')[0],
          invoiceNumber: invoice.invoiceNumber || 'INV-0',
          bonusScheme: item.bonusScheme || '',
          discountPercent: Number(item.discountPercent) || 0,
          notes: `مسجل من الفاتورة رقم ${invoice.invoiceNumber || ''}`,
          createdTimestamp: Date.now()
        };
      });

    const updated = [...newRecords, ...currentPrices];
    this.saveMarketPrices(updated);
    return updated;
  },

  getOrders(): PharmacyOrder[] {
    if (memoryCache.orders) return memoryCache.orders;
    try {
      const data = localStorage.getItem(STORAGE_KEYS.ORDERS);
      if (!data) {
        safeLocalStorageSet(STORAGE_KEYS.ORDERS, INITIAL_ORDERS);
        memoryCache.orders = INITIAL_ORDERS;
        return INITIAL_ORDERS;
      }
      const parsed = JSON.parse(data);
      memoryCache.orders = Array.isArray(parsed) ? parsed : INITIAL_ORDERS;
      return memoryCache.orders;
    } catch {
      memoryCache.orders = INITIAL_ORDERS;
      return INITIAL_ORDERS;
    }
  },

  saveOrders(orders: PharmacyOrder[]) {
    memoryCache.orders = orders;
    safeLocalStorageSet(STORAGE_KEYS.ORDERS, orders);
  },

  saveOrder(order: PharmacyOrder): PharmacyOrder[] {
    const list = this.getOrders();
    const index = list.findIndex(o => o.id === order.id);
    let updated: PharmacyOrder[];
    if (index >= 0) {
      updated = [...list];
      updated[index] = order;
    } else {
      updated = [order, ...list];
    }
    this.saveOrders(updated);
    return updated;
  },

  getInvoices(): PurchaseInvoice[] {
    if (memoryCache.invoices) return memoryCache.invoices;
    try {
      const data = localStorage.getItem(STORAGE_KEYS.INVOICES);
      if (!data) {
        safeLocalStorageSet(STORAGE_KEYS.INVOICES, INITIAL_INVOICES);
        memoryCache.invoices = INITIAL_INVOICES;
        return INITIAL_INVOICES;
      }
      const parsed = JSON.parse(data);
      memoryCache.invoices = Array.isArray(parsed) ? parsed : INITIAL_INVOICES;
      return memoryCache.invoices;
    } catch {
      memoryCache.invoices = INITIAL_INVOICES;
      return INITIAL_INVOICES;
    }
  },

  saveInvoices(invoices: PurchaseInvoice[]) {
    memoryCache.invoices = invoices;
    safeLocalStorageSet(STORAGE_KEYS.INVOICES, invoices);
  },

  saveInvoice(invoice: PurchaseInvoice): PurchaseInvoice[] {
    const list = this.getInvoices();
    const index = list.findIndex(i => i.id === invoice.id);
    let updated: PurchaseInvoice[];
    if (index >= 0) {
      updated = [...list];
      updated[index] = invoice;
    } else {
      updated = [invoice, ...list];
    }
    this.saveInvoices(updated);
    this.addPricesFromInvoice(invoice);
    return updated;
  },

  getReconciliations(): OrderInvoiceReconciliation[] {
    if (memoryCache.reconciliations) return memoryCache.reconciliations;
    try {
      const data = localStorage.getItem(STORAGE_KEYS.RECONCILIATIONS);
      const parsed = data ? JSON.parse(data) : [];
      memoryCache.reconciliations = Array.isArray(parsed) ? parsed : [];
      return memoryCache.reconciliations;
    } catch {
      memoryCache.reconciliations = [];
      return [];
    }
  },

  saveReconciliation(rec: OrderInvoiceReconciliation): OrderInvoiceReconciliation[] {
    const list = this.getReconciliations();
    const index = list.findIndex(r => r.id === rec.id);
    let updated: OrderInvoiceReconciliation[];
    if (index >= 0) {
      updated = [...list];
      updated[index] = rec;
    } else {
      updated = [rec, ...list];
    }
    memoryCache.reconciliations = updated;
    safeLocalStorageSet(STORAGE_KEYS.RECONCILIATIONS, updated);
    return updated;
  },

  getActiveTask(): any | null {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.ACTIVE_TASK);
      return data ? JSON.parse(data) : null;
    } catch {
      return null;
    }
  },

  saveActiveTask(task: any) {
    if (!task) {
      this.clearActiveTask();
      return;
    }
    safeLocalStorageSet(STORAGE_KEYS.ACTIVE_TASK, task);
  },

  clearActiveTask() {
    try {
      localStorage.removeItem(STORAGE_KEYS.ACTIVE_TASK);
      persistToIndexedDB(STORAGE_KEYS.ACTIVE_TASK, null);
    } catch (e) {
      console.warn('Error clearing active task:', e);
    }
  },

  exportAllData(): string {
    const bundle = {
      app: 'PharmacyPurchaseMate',
      version: '1.0.0',
      exportedAt: new Date().toISOString(),
      medicines: this.getMedicines(),
      suppliers: this.getSuppliers(),
      marketPrices: this.getMarketPrices(),
      orders: this.getOrders(),
      invoices: this.getInvoices(),
      reconciliations: this.getReconciliations()
    };
    return JSON.stringify(bundle, null, 2);
  },

  importAllData(jsonOrObject: string | Record<string, any>): { success: boolean; counts: Record<string, number>; error?: string } {
    try {
      let data: any;
      if (typeof jsonOrObject === 'string') {
        data = JSON.parse(jsonOrObject);
      } else {
        data = jsonOrObject;
      }

      if (!data || typeof data !== 'object') {
        return { success: false, counts: {}, error: 'صيغة الملف غير صحيحة' };
      }

      const importedMedicines = Array.isArray(data.medicines) ? data.medicines : [];
      const importedSuppliers = Array.isArray(data.suppliers) ? data.suppliers : [];
      const importedPrices = Array.isArray(data.marketPrices) ? data.marketPrices : [];
      const importedOrders = Array.isArray(data.orders) ? data.orders : [];
      const importedInvoices = Array.isArray(data.invoices) ? data.invoices : [];
      const importedRecs = Array.isArray(data.reconciliations) ? data.reconciliations : [];

      if (importedMedicines.length > 0) this.saveMedicines(importedMedicines);
      if (importedSuppliers.length > 0) this.saveSuppliers(importedSuppliers);
      if (importedPrices.length > 0) this.saveMarketPrices(importedPrices);
      if (importedOrders.length > 0) this.saveOrders(importedOrders);
      if (importedInvoices.length > 0) this.saveInvoices(importedInvoices);
      if (importedRecs.length > 0) {
        memoryCache.reconciliations = importedRecs;
        safeLocalStorageSet(STORAGE_KEYS.RECONCILIATIONS, importedRecs);
      }

      return {
        success: true,
        counts: {
          medicines: importedMedicines.length,
          suppliers: importedSuppliers.length,
          marketPrices: importedPrices.length,
          orders: importedOrders.length,
          invoices: importedInvoices.length,
          reconciliations: importedRecs.length
        }
      };
    } catch (err: any) {
      return { success: false, counts: {}, error: err?.message || 'فشل استيراد النسخة الاحتياطية' };
    }
  },

  resetAll() {
    memoryCache.medicines = undefined;
    memoryCache.suppliers = undefined;
    memoryCache.marketPrices = undefined;
    memoryCache.orders = undefined;
    memoryCache.invoices = undefined;
    memoryCache.reconciliations = undefined;

    localStorage.clear();
    safeLocalStorageSet(STORAGE_KEYS.MEDICINES, INITIAL_MEDICINES);
    safeLocalStorageSet(STORAGE_KEYS.SUPPLIERS, INITIAL_SUPPLIERS);
    safeLocalStorageSet(STORAGE_KEYS.MARKET_PRICES, INITIAL_MARKET_PRICES);
    safeLocalStorageSet(STORAGE_KEYS.ORDERS, INITIAL_ORDERS);
    safeLocalStorageSet(STORAGE_KEYS.INVOICES, INITIAL_INVOICES);
  }
};

