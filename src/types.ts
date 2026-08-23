export interface Medicine {
  id: string;
  name: string; // Strength is part of the name (e.g. "زواجرا 50 ملجم", "بندول اكسترا")
  scientificName?: string;
  barcode?: string;
  category?: string;
  notes?: string;
  aliases?: string[]; // Alternative commercial / supplier names & variations e.g. ["زواجرا 50", "زواجرا 50مجم شفاكوا", "زواجرا 50ملج شركة شفاكوا"]
  createdDate: string;
}

export interface Supplier {
  id: string;
  name: string;
  phone?: string;
  address?: string;
  rating?: number;
  notes?: string;
  createdDate: string;
}

export interface MarketPriceRecord {
  id: string;
  medicineId: string;
  medicineName: string;
  supplierId: string;
  supplierName: string;
  unitPrice: number;
  invoiceDate: string; // YYYY-MM-DD
  invoiceNumber?: string;
  bonusScheme?: string; // e.g. "10+1" or "خصم نقدي 3%"
  discountPercent?: number;
  notes?: string;
  createdTimestamp: number;
}

export type PriceFreshness = 'fresh' | 'moderate' | 'old' | 'stale';

export interface MedicinePriceSummary {
  medicineId: string;
  medicineName: string;
  latestPrice: number;
  lowestPrice: number;
  averagePrice: number;
  highestPrice: number;
  bestSupplierId: string;
  bestSupplierName: string;
  latestDate: string;
  daysOld: number;
  freshness: PriceFreshness;
  recordsCount: number;
  records: MarketPriceRecord[];
}

export interface OrderItem {
  id: string;
  rawText: string;
  matchedMedicineName: string;
  matchedMedicineId?: string;
  quantity: number;
  unit?: string;
  isUncertain?: boolean;
  uncertaintyReason?: string;
  notes?: string;
  referencePrice?: number;
  bestSupplierId?: string;
  bestSupplierName?: string;
  bestMarketPrice?: number;
  isPurchased?: boolean;
  actualPurchasedPrice?: number;
  actualPurchasedQuantity?: number;
  purchasedSupplierId?: string;
  purchasedSupplierName?: string;
  purchasedInvoiceId?: string;
  purchasedInvoiceNumber?: string;
  purchasedDate?: string;
}

export type OrderStatus = 'draft' | 'analyzing' | 'reviewed' | 'purchasing' | 'pending' | 'partial' | 'completed';

export interface PharmacyOrder {
  id: string;
  orderNumber: string;
  pharmacyName: string;
  orderDate: string;
  status: OrderStatus;
  rawInputText?: string;
  imageUri?: string;
  items: OrderItem[];
  notes?: string;
  estimatedBudget?: number;
  matchedInvoiceId?: string;
  createdTimestamp: number;
}

export interface InvoiceItem {
  id: string;
  itemName: string;
  matchedMedicineId?: string;
  quantity: number;
  unitPrice: number;
  discountPercent?: number;
  bonusScheme?: string;
  totalPrice: number;
}

export interface PurchaseInvoice {
  id: string;
  invoiceNumber: string;
  supplierId: string;
  supplierName: string;
  invoiceDate: string;
  totalAmount: number;
  items: InvoiceItem[];
  matchedOrderId?: string;
  imageUri?: string;
  rawText?: string;
  notes?: string;
  createdTimestamp: number;
}

export interface ReconciliationMatch {
  orderItemId: string;
  orderItemName: string;
  invoiceItemName: string;
  orderedQty: number;
  invoicedQty: number;
  qtyStatus: 'exact' | 'deficit' | 'surplus' | 'missing';
  qtyDiff: number;
  referenceUnitPrice: number;
  actualUnitPrice: number;
  savingsPerUnit: number;
  totalSavings: number;
  savingsPercent: number;
  notes?: string;
}

export interface OrderInvoiceReconciliation {
  id: string;
  orderId: string;
  orderNumber: string;
  invoiceId: string;
  invoiceNumber: string;
  reconciliationDate: string;
  matches: ReconciliationMatch[];
  totalOrderedItems: number;
  totalInvoicedItems: number;
  totalReferenceAmount: number;
  totalActualAmount: number;
  totalSavingsAmount: number;
  savingsPercent: number;
  verdict: string;
}
