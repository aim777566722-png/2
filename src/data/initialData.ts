import { Medicine, Supplier, MarketPriceRecord, PharmacyOrder, PurchaseInvoice } from '../types';

export const INITIAL_MEDICINES: Medicine[] = [
  {
    id: 'med-panadol-extra',
    name: 'بندول اكسترا',
    scientificName: 'Paracetamol 500mg + Caffeine 65mg',
    barcode: '6281001001',
    category: 'مسكنات وخافض حرارة',
    notes: 'علبة 24 قرص',
    aliases: ['بنادول اكسترا', 'بندول احمر', 'بنادول الاحمر', 'Panadol Extra', 'بندول أزرق'],
    createdDate: '2026-01-10'
  },
  {
    id: 'med-zwagra-25',
    name: 'زواجرا 25 ملجم',
    scientificName: 'Sildenafil 25mg',
    barcode: '6281002025',
    category: 'صحة الرجال',
    notes: 'شريط 4 أقراص',
    aliases: ['زواجرا 25', 'زواجرا 25مجم', 'زواجرا 25مجم شفاكوا', 'زوجرا 25', 'Zwagra 25'],
    createdDate: '2026-01-12'
  },
  {
    id: 'med-zwagra-50',
    name: 'زواجرا 50 ملجم',
    scientificName: 'Sildenafil 50mg',
    barcode: '6281002050',
    category: 'صحة الرجال',
    notes: 'شريط 4 أقراص',
    aliases: ['زواجرا 50', 'زواجرا 50مجم', 'زواجرا 50مجم شفاكوا', 'زواجرا 50ملج شركة شفاكوا', 'زواجرا 50 شفاكوا', 'زوجرا 50', 'Zwagra 50mg', 'زواجرا50'],
    createdDate: '2026-01-12'
  },
  {
    id: 'med-zwagra-100',
    name: 'زواجرا 100 ملجم',
    scientificName: 'Sildenafil 100mg',
    barcode: '6281002100',
    category: 'صحة الرجال',
    notes: 'شريط 4 أقراص',
    aliases: ['زواجرا 100', 'زواجرا 100مجم', 'زواجرا 100مجم شفاكوا', 'زواجرا 100ملج شركة شفاكوا', 'زوجرا 100', 'Zwagra 100mg', 'زواجرا100'],
    createdDate: '2026-01-12'
  },
  {
    id: 'med-lover-5',
    name: 'لوفر 5 ملجم',
    scientificName: 'Rosuvastatin 5mg',
    barcode: '6281003005',
    category: 'أدوية الكوليسترول والدهون',
    notes: 'شريط 10 أقراص',
    aliases: ['لوفر 5', 'لوفر 5مجم', 'Lover 5'],
    createdDate: '2026-01-15'
  },
  {
    id: 'med-lover-10',
    name: 'لوفر 10 ملجم',
    scientificName: 'Rosuvastatin 10mg',
    barcode: '6281003010',
    category: 'أدوية الكوليسترول والدهون',
    notes: 'شريط 10 أقراص',
    aliases: ['لوفر 10', 'لوفر 10مجم', 'لوفر 10 مجم شفاكوا', 'Lover 10'],
    createdDate: '2026-01-15'
  },
  {
    id: 'med-augmentin-1g',
    name: 'أوجمنتين 1 جم',
    scientificName: 'Amoxicillin + Clavulanic Acid 1000mg',
    barcode: '6281004001',
    category: 'مضادات حيوية',
    notes: 'علبة 14 قرص',
    aliases: ['اوغمنتين 1 جم', 'اوجمنتين 1جم', 'اوغمنتين 1000', 'Augmentin 1g'],
    createdDate: '2026-01-15'
  },
  {
    id: 'med-concor-5',
    name: 'كونكور 5 مجم',
    scientificName: 'Bisoprolol 5mg',
    barcode: '6281005005',
    category: 'ضغط وقلب',
    notes: 'علبة 30 قرص',
    aliases: ['كونكور 5', 'كونكور 5ملجم', 'Concor 5mg'],
    createdDate: '2026-01-18'
  },
  {
    id: 'med-ompral-20',
    name: 'أوميبرال 20 ملجم',
    scientificName: 'Omeprazole 20mg',
    barcode: '6281006020',
    category: 'أدوية المعدة والجهاز الهضمي',
    notes: 'علبة 28 كبسولة',
    createdDate: '2026-01-20'
  }
];

export const INITIAL_SUPPLIERS: Supplier[] = [
  {
    id: 'sup-shifa',
    name: 'شركة الشفاء للأدوية',
    phone: '0501234567',
    address: 'الرياض - المنطقة الصناعية الثانية',
    rating: 4.8,
    notes: 'أفضل أسعار على المسكنات وأدوية القلب مع توصيل سريع',
    createdDate: '2026-01-05'
  },
  {
    id: 'sup-united',
    name: 'مستودع المتحدة للأدوية',
    phone: '0509876543',
    address: 'جدة - مستودعات الخمرة',
    rating: 4.6,
    notes: 'عروض بونص قوية 10+2 على المضادات الحيوية',
    createdDate: '2026-01-05'
  },
  {
    id: 'sup-nour',
    name: 'شركة النور الدوائية',
    phone: '0551122334',
    address: 'الدمام - حي الخالدية',
    rating: 4.3,
    notes: 'خصم نقدي 3% عند الدفع الفوري',
    createdDate: '2026-01-10'
  },
  {
    id: 'sup-aman',
    name: 'مستودع الأمان',
    phone: '0533344556',
    address: 'الرياض - السلي',
    rating: 4.0,
    notes: 'أسعار مستقرة وتوفر دائم للأصناف النادرة',
    createdDate: '2026-01-12'
  }
];

// Reference timestamps calculated relative to current date (Aug 2026)
export const INITIAL_MARKET_PRICES: MarketPriceRecord[] = [
  // زواجرا 50 ملجم prices from multiple suppliers
  {
    id: 'price-1',
    medicineId: 'med-zwagra-50',
    medicineName: 'زواجرا 50 ملجم',
    supplierId: 'sup-shifa',
    supplierName: 'شركة الشفاء للأدوية',
    unitPrice: 2450,
    invoiceDate: '2026-08-14', // Fresh (3 days ago)
    invoiceNumber: 'INV-78901',
    bonusScheme: '10+1',
    discountPercent: 5,
    notes: 'سعر ترويجي معتمد',
    createdTimestamp: Date.now() - 3 * 86400000
  },
  {
    id: 'price-2',
    medicineId: 'med-zwagra-50',
    medicineName: 'زواجرا 50 ملجم',
    supplierId: 'sup-nour',
    supplierName: 'شركة النور الدوائية',
    unitPrice: 2580,
    invoiceDate: '2026-08-07', // Moderate (10 days ago)
    invoiceNumber: 'INV-44120',
    bonusScheme: '',
    discountPercent: 3,
    notes: '',
    createdTimestamp: Date.now() - 10 * 86400000
  },
  {
    id: 'price-3',
    medicineId: 'med-zwagra-50',
    medicineName: 'زواجرا 50 ملجم',
    supplierId: 'sup-aman',
    supplierName: 'مستودع الأمان',
    unitPrice: 2650,
    invoiceDate: '2026-04-15', // Stale (120+ days ago) - Needs check!
    invoiceNumber: 'INV-11029',
    bonusScheme: '',
    discountPercent: 0,
    notes: 'سعر قديم مسجل من دورة المشتريات السابقة',
    createdTimestamp: Date.now() - 124 * 86400000
  },

  // بندول اكسترا prices
  {
    id: 'price-4',
    medicineId: 'med-panadol-extra',
    medicineName: 'بندول اكسترا',
    supplierId: 'sup-shifa',
    supplierName: 'شركة الشفاء للأدوية',
    unitPrice: 1450,
    invoiceDate: '2026-08-15', // Fresh (2 days ago)
    invoiceNumber: 'INV-88310',
    bonusScheme: '20+2',
    discountPercent: 4,
    notes: '',
    createdTimestamp: Date.now() - 2 * 86400000
  },
  {
    id: 'price-5',
    medicineId: 'med-panadol-extra',
    medicineName: 'بندول اكسترا',
    supplierId: 'sup-united',
    supplierName: 'مستودع المتحدة للأدوية',
    unitPrice: 1520,
    invoiceDate: '2026-07-28', // Moderate (20 days ago)
    invoiceNumber: 'INV-55901',
    bonusScheme: '',
    discountPercent: 2,
    notes: '',
    createdTimestamp: Date.now() - 20 * 86400000
  },

  // لوفر 10 ملجم prices
  {
    id: 'price-6',
    medicineId: 'med-lover-10',
    medicineName: 'لوفر 10 ملجم',
    supplierId: 'sup-shifa',
    supplierName: 'شركة الشفاء للأدوية',
    unitPrice: 1200,
    invoiceDate: '2026-08-16', // Fresh (1 day ago)
    invoiceNumber: 'INV-99012',
    bonusScheme: '10+1',
    discountPercent: 5,
    notes: '',
    createdTimestamp: Date.now() - 1 * 86400000
  },
  {
    id: 'price-7',
    medicineId: 'med-lover-10',
    medicineName: 'لوفر 10 ملجم',
    supplierId: 'sup-united',
    supplierName: 'مستودع المتحدة للأدوية',
    unitPrice: 1280,
    invoiceDate: '2026-08-02', // 15 days ago
    invoiceNumber: 'INV-32109',
    bonusScheme: '',
    discountPercent: 0,
    notes: '',
    createdTimestamp: Date.now() - 15 * 86400000
  },

  // أوجمنتين 1 جم
  {
    id: 'price-8',
    medicineId: 'med-augmentin-1g',
    medicineName: 'أوجمنتين 1 جم',
    supplierId: 'sup-united',
    supplierName: 'مستودع المتحدة للأدوية',
    unitPrice: 4850,
    invoiceDate: '2026-08-12', // 5 days ago
    invoiceNumber: 'INV-77211',
    bonusScheme: '10+2',
    discountPercent: 6,
    notes: '',
    createdTimestamp: Date.now() - 5 * 86400000
  },
  {
    id: 'price-9',
    medicineId: 'med-augmentin-1g',
    medicineName: 'أوجمنتين 1 جم',
    supplierId: 'sup-nour',
    supplierName: 'شركة النور الدوائية',
    unitPrice: 5100,
    invoiceDate: '2026-03-20', // Stale (150 days ago)
    invoiceNumber: 'INV-09122',
    bonusScheme: '',
    discountPercent: 0,
    notes: 'يحتاج تأكيد',
    createdTimestamp: Date.now() - 150 * 86400000
  }
];

export const INITIAL_ORDERS: PharmacyOrder[] = [
  {
    id: 'order-101',
    orderNumber: 'ORD-2026-081',
    pharmacyName: 'صيدلية النخبة المركزية',
    orderDate: '2026-08-16',
    status: 'pending',
    rawInputText: `4 بندول اكسترا\nزواجرا 50 4\nلوفر 10 عدد 5`,
    items: [
      {
        id: 'item-1',
        rawText: '4 بندول اكسترا',
        matchedMedicineName: 'بندول اكسترا',
        matchedMedicineId: 'med-panadol-extra',
        quantity: 4,
        unit: 'علبة',
        referencePrice: 1550,
        bestMarketPrice: 1450,
        bestSupplierName: 'شركة الشفاء للأدوية',
        isPurchased: false
      },
      {
        id: 'item-2',
        rawText: 'زواجرا 50 4',
        matchedMedicineName: 'زواجرا 50 ملجم',
        matchedMedicineId: 'med-zwagra-50',
        quantity: 4,
        unit: 'شريط',
        referencePrice: 2600,
        bestMarketPrice: 2450,
        bestSupplierName: 'شركة الشفاء للأدوية',
        isPurchased: false
      },
      {
        id: 'item-3',
        rawText: 'لوفر 10 عدد 5',
        matchedMedicineName: 'لوفر 10 ملجم',
        matchedMedicineId: 'med-lover-10',
        quantity: 5,
        unit: 'شريط',
        referencePrice: 1300,
        bestMarketPrice: 1200,
        bestSupplierName: 'شركة الشفاء للأدوية',
        isPurchased: false
      }
    ],
    notes: 'طلبية عاجلة - تفضيل استلام الصباح',
    estimatedBudget: 22500,
    createdTimestamp: Date.now() - 86400000
  },
  {
    id: 'order-102',
    orderNumber: 'ORD-2026-082',
    pharmacyName: 'صيدلية الأمل الحديثة',
    orderDate: '2026-08-15',
    status: 'partial',
    rawInputText: `أوجمنتين 1 جم 6\nبندول اكسترا 10\nأوميبرازول 20 ملجم 8`,
    items: [
      {
        id: 'item-102-1',
        rawText: 'أوجمنتين 1 جم 6',
        matchedMedicineName: 'أوجمنتين 1 جم',
        matchedMedicineId: 'med-augmentin-1g',
        quantity: 6,
        unit: 'باكت',
        referencePrice: 5200,
        bestMarketPrice: 4800,
        bestSupplierName: 'مستودع المتحدة للأدوية',
        isPurchased: false
      },
      {
        id: 'item-102-2',
        rawText: 'بندول اكسترا 10',
        matchedMedicineName: 'بندول اكسترا',
        matchedMedicineId: 'med-panadol-extra',
        quantity: 10,
        unit: 'علبة',
        referencePrice: 1550,
        bestMarketPrice: 1450,
        bestSupplierName: 'شركة الشفاء للأدوية',
        isPurchased: true,
        actualPurchasedPrice: 1450,
        actualPurchasedQuantity: 10,
        purchasedSupplierName: 'شركة الشفاء للأدوية',
        purchasedInvoiceNumber: 'INV-99012',
        purchasedDate: '2026-08-16'
      },
      {
        id: 'item-102-3',
        rawText: 'أوميبرازول 20 ملجم 8',
        matchedMedicineName: 'أوميبرازول 20 ملجم',
        matchedMedicineId: 'med-omeprazole-20',
        quantity: 8,
        unit: 'علبة',
        referencePrice: 1950,
        bestMarketPrice: 1800,
        bestSupplierName: 'شركة النور الدوائية',
        isPurchased: true,
        actualPurchasedPrice: 1800,
        actualPurchasedQuantity: 8,
        purchasedSupplierName: 'شركة النور الدوائية',
        purchasedInvoiceNumber: 'INV-44120',
        purchasedDate: '2026-08-15'
      }
    ],
    notes: 'تم شراء البندول والأوميبرازول، متبقي الأوجمنتين لعدم توفره',
    estimatedBudget: 45000,
    createdTimestamp: Date.now() - 2 * 86400000
  },
  {
    id: 'order-103',
    orderNumber: 'ORD-2026-080',
    pharmacyName: 'صيدلية السلامة الكبرى',
    orderDate: '2026-08-14',
    status: 'completed',
    rawInputText: `زواجرا 50 10\nلوفر 10 15`,
    items: [
      {
        id: 'item-103-1',
        rawText: 'زواجرا 50 10',
        matchedMedicineName: 'زواجرا 50 ملجم',
        matchedMedicineId: 'med-zwagra-50',
        quantity: 10,
        unit: 'شريط',
        referencePrice: 2600,
        bestMarketPrice: 2450,
        bestSupplierName: 'شركة الشفاء للأدوية',
        isPurchased: true,
        actualPurchasedPrice: 2450,
        actualPurchasedQuantity: 10,
        purchasedSupplierName: 'شركة الشفاء للأدوية',
        purchasedInvoiceNumber: 'INV-99012',
        purchasedDate: '2026-08-14'
      },
      {
        id: 'item-103-2',
        rawText: 'لوفر 10 15',
        matchedMedicineName: 'لوفر 10 ملجم',
        matchedMedicineId: 'med-lover-10',
        quantity: 15,
        unit: 'شريط',
        referencePrice: 1300,
        bestMarketPrice: 1200,
        bestSupplierName: 'شركة الشفاء للأدوية',
        isPurchased: true,
        actualPurchasedPrice: 1200,
        actualPurchasedQuantity: 15,
        purchasedSupplierName: 'شركة الشفاء للأدوية',
        purchasedInvoiceNumber: 'INV-99012',
        purchasedDate: '2026-08-14'
      }
    ],
    notes: 'تم استلام الفاتورة وتوريد كامل الطلب بنجاح',
    estimatedBudget: 42500,
    createdTimestamp: Date.now() - 3 * 86400000
  }
];

export const INITIAL_INVOICES: PurchaseInvoice[] = [
  {
    id: 'inv-shifa-9901',
    invoiceNumber: 'INV-99012',
    supplierId: 'sup-shifa',
    supplierName: 'شركة الشفاء للأدوية',
    invoiceDate: '2026-08-16',
    totalAmount: 48200,
    items: [
      {
        id: 'inv-item-1',
        itemName: 'بندول اكسترا',
        matchedMedicineId: 'med-panadol-extra',
        quantity: 20,
        unitPrice: 1450,
        discountPercent: 0,
        bonusScheme: '20+2',
        totalPrice: 29000
      },
      {
        id: 'inv-item-2',
        itemName: 'زواجرا 50 ملجم',
        matchedMedicineId: 'med-zwagra-50',
        quantity: 10,
        unitPrice: 2450,
        discountPercent: 0,
        bonusScheme: '',
        totalPrice: 24500
      },
      {
        id: 'inv-item-3',
        itemName: 'لوفر 10 ملجم',
        matchedMedicineId: 'med-lover-10',
        quantity: 5,
        unitPrice: 1200,
        discountPercent: 0,
        bonusScheme: '5+1',
        totalPrice: 6000
      }
    ],
    notes: 'فاتورة تسوية مشتريات السوق الأسبوعية',
    createdTimestamp: Date.now() - 43200000
  }
];
