import React, { useState, useRef, useMemo, useCallback } from 'react';
import { 
  PharmacyOrder, 
  OrderItem, 
  Medicine, 
  Supplier, 
  MarketPriceRecord, 
  PurchaseInvoice, 
  InvoiceItem,
  MedicinePriceSummary
} from '../types';
import { 
  formatDateAr, 
  formatCurrency, 
  computeMedicinePriceSummary,
  parseMedicineOrderLine,
  cleanAndFormatMedicineName,
  extractMedicineAttributes
} from '../utils/helpers';
import { parseUploadedFile } from '../utils/documentParser';
import { findSimilarMedicine, findTopSimilarMedicines, SimilarityConflict } from '../utils/similarity';
import { ImageComparisonHeader } from './ImageComparisonHeader';
import { SimilarityResolutionModal } from './SimilarityResolutionModal';
import { Storage } from '../data/storage';
import { parsePharmacyOrderClientSide } from '../services/geminiClient';
import { 
  ShoppingCart, 
  PlusCircle, 
  Search, 
  Filter, 
  Calendar, 
  ChevronLeft, 
  Trash2, 
  Edit3, 
  FileText, 
  Camera, 
  Upload, 
  Sparkles, 
  AlertTriangle, 
  CheckCircle2, 
  Plus, 
  Minus, 
  ArrowRight, 
  Check, 
  Layers, 
  FileUp,
  FileSpreadsheet,
  X,
  RefreshCw,
  HelpCircle,
  TrendingUp,
  TrendingDown,
  Building2,
  Clock,
  ArrowLeft,
  Receipt,
  Eye,
  CheckSquare,
  Square,
  PackageCheck,
  AlertCircle,
  Store,
  CheckCheck,
  DollarSign,
  Wand2
} from 'lucide-react';

interface OrdersViewProps {
  orders: PharmacyOrder[];
  knownMedicines: Medicine[];
  knownSuppliers?: Supplier[];
  marketPrices?: MarketPriceRecord[];
  onOrderApproved: (order: PharmacyOrder) => void;
  onUpdateOrder?: (order: PharmacyOrder) => void;
  onSavePurchaseInvoice?: (invoice: PurchaseInvoice, targetOrderId?: string, updatedOrder?: PharmacyOrder) => void;
  onNavigateToPriceComparison: (orderId: string) => void;
  onNavigateToInvoice?: (orderId?: string) => void;
  onDeleteOrder?: (orderId: string) => void;
  initialMode?: 'list' | 'create';
}

export const OrdersView: React.FC<OrdersViewProps> = ({
  orders,
  knownMedicines,
  knownSuppliers = [],
  marketPrices = [],
  onOrderApproved,
  onUpdateOrder,
  onSavePurchaseInvoice,
  onNavigateToPriceComparison,
  onNavigateToInvoice,
  onDeleteOrder,
  initialMode = 'list'
}) => {
  const [viewMode, setViewMode] = useState<'list' | 'create' | 'details'>(initialMode);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'completed' | 'partial'>('all');
  
  // Selected Order for Details View
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [selectedSupplierFilter, setSelectedSupplierFilter] = useState<string>('all');

  // Purchase Invoice Modal State
  const [isPurchaseModalOpen, setIsPurchaseModalOpen] = useState(false);
  const [invoiceSupplierName, setInvoiceSupplierName] = useState('');
  const [invoiceNumber, setInvoiceNumber] = useState(`INV-${Math.floor(10000 + Math.random() * 90000)}`);
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().split('T')[0]);
  const [invoiceItemsState, setInvoiceItemsState] = useState<Array<{
    orderItemId: string;
    medicineName: string;
    quantity: number;
    unitPrice: number;
    bonusScheme: string;
    isIncluded: boolean;
    lowestPrice: number;
    bestSupplier: string;
  }>>([]);
  const [invoiceSuccessMsg, setInvoiceSuccessMsg] = useState<string | null>(null);

  // Add Order Form States
  const [pharmacyName, setPharmacyName] = useState('صيدلية النخبة المركزية');
  const [orderNumber, setOrderNumber] = useState(`ORD-${new Date().getFullYear()}-${Math.floor(100 + Math.random() * 900)}`);
  const [inputMode, setInputMode] = useState<'text' | 'camera' | 'file'>('text');
  const [orderText, setOrderText] = useState(`4 بندول اكسترا\nزواجرا 50 4\nلوفر 10 عدد 5\n6 بندول اكسترا`);
  const [uploadedImages, setUploadedImages] = useState<Array<{ id: string; name: string; base64: string; mimeType: string }>>([]);
  const [fileName, setFileName] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [parseProgress, setParseProgress] = useState(0);
  const [analysisError, setAnalysisError] = useState<string | null>(null);

  // Review Stage States
  const [isReviewed, setIsReviewed] = useState(false);
  const [parsedItems, setParsedItems] = useState<OrderItem[]>([]);
  const [duplicateBanner, setDuplicateBanner] = useState<{ name: string; sum: number; originalCounts: number[] } | null>(null);
  const [reviewFilter, setReviewFilter] = useState<'all' | 'priced' | 'unpriced'>('all');
  const [reviewSearch, setReviewSearch] = useState('');

  // Similarity Conflict Modal State
  const [similarityConflicts, setSimilarityConflicts] = useState<SimilarityConflict[]>([]);
  const [showSimilarityModal, setShowSimilarityModal] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const docInputRef = useRef<HTMLInputElement>(null);
  const addMoreImgRef = useRef<HTMLInputElement>(null);

  // Currently selected order object
  const selectedOrder = useMemo(() => {
    return orders.find(o => o.id === selectedOrderId) || null;
  }, [orders, selectedOrderId]);

  // Statistics Calculation
  const totalCount = orders.length;
  const pendingCount = orders.filter(o => 
    o.status === 'pending' || o.status === 'draft' || o.status === 'reviewed' || o.status === 'purchasing'
  ).length;
  const completedCount = orders.filter(o => o.status === 'completed').length;
  const partialCount = orders.filter(o => o.status === 'partial').length;

  // Filter orders
  const filteredOrders = useMemo(() => {
    return orders.filter(order => {
      const matchesSearch = 
        order.pharmacyName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        order.orderNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
        order.items.some(i => (i.matchedMedicineName || i.rawText || '').toLowerCase().includes(searchQuery.toLowerCase()));

      if (!matchesSearch) return false;

      if (statusFilter === 'all') return true;
      if (statusFilter === 'pending') {
        return order.status === 'pending' || order.status === 'draft' || order.status === 'reviewed' || order.status === 'purchasing';
      }
      if (statusFilter === 'completed') return order.status === 'completed';
      if (statusFilter === 'partial') return order.status === 'partial';
      return true;
    });
  }, [orders, searchQuery, statusFilter]);

  // Handle Opening Order Details
  const handleOpenOrderDetails = (order: PharmacyOrder) => {
    setSelectedOrderId(order.id);
    setSelectedSupplierFilter('all');
    setViewMode('details');
  };

  // Memoized map of enriched prices for the selected order for fast O(1) lookups
  const enrichedPricesMap = useMemo(() => {
    const map = new Map<string, { lowestPrice: number; bestSupplier: string; summary: MedicinePriceSummary | null }>();
    if (!selectedOrder) return map;
    selectedOrder.items.forEach(item => {
      const summary = computeMedicinePriceSummary(
        item.matchedMedicineId || '',
        item.matchedMedicineName || item.rawText,
        marketPrices,
        knownMedicines
      );

      if (summary && summary.lowestPrice > 0) {
        map.set(item.id, {
          lowestPrice: summary.lowestPrice,
          bestSupplier: summary.bestSupplierName || 'أفضل سعر مسجل',
          summary
        });
      } else if (item.bestMarketPrice && item.bestMarketPrice > 0) {
        map.set(item.id, {
          lowestPrice: item.bestMarketPrice,
          bestSupplier: item.bestSupplierName || 'أفضل سعر مسجل',
          summary: null
        });
      } else {
        map.set(item.id, {
          lowestPrice: item.referencePrice || 0,
          bestSupplier: 'غير محدد',
          summary: null
        });
      }
    });
    return map;
  }, [selectedOrder, marketPrices, knownMedicines]);

  // Fast O(1) Helper to enrich order items with market lowest prices
  const getEnrichedItemPrice = useCallback((item: OrderItem) => {
    if (enrichedPricesMap.has(item.id)) {
      return enrichedPricesMap.get(item.id)!;
    }
    return {
      lowestPrice: item.bestMarketPrice || item.referencePrice || 0,
      bestSupplier: item.bestSupplierName || 'غير محدد',
      summary: null
    };
  }, [enrichedPricesMap]);

  // Prepare purchase invoice modal for the selected order
  const handleOpenPurchaseModal = () => {
    if (!selectedOrder) return;
    
    // Default supplier to the supplier of the first unpurchased item or known supplier
    const unpurchased = selectedOrder.items.filter(i => !i.isPurchased);
    const targetItems = unpurchased.length > 0 ? unpurchased : selectedOrder.items;
    
    const firstSupplier = targetItems[0]?.bestSupplierName || targetItems[0]?.purchasedSupplierName || (knownSuppliers[0]?.name || 'شركة الشفاء للأدوية');
    setInvoiceSupplierName(firstSupplier);
    setInvoiceNumber(`INV-${Math.floor(10000 + Math.random() * 90000)}`);
    setInvoiceDate(new Date().toISOString().split('T')[0]);

    const initialInvoiceItems = selectedOrder.items.map(item => {
      const priceInfo = getEnrichedItemPrice(item);
      return {
        orderItemId: item.id,
        medicineName: item.matchedMedicineName || item.rawText,
        quantity: item.quantity,
        unitPrice: item.actualPurchasedPrice || priceInfo.lowestPrice || item.referencePrice || 0,
        bonusScheme: '',
        isIncluded: !item.isPurchased, // checked by default if not yet purchased
        lowestPrice: priceInfo.lowestPrice,
        bestSupplier: priceInfo.bestSupplier
      };
    });

    setInvoiceItemsState(initialInvoiceItems);
    setIsPurchaseModalOpen(true);
    setInvoiceSuccessMsg(null);
  };

  // Save Purchase Invoice & Update Order Status
  const handleSavePurchase = () => {
    if (!selectedOrder) return;
    if (!invoiceSupplierName.trim()) {
      alert('يرجى تحديد اسم المورد');
      return;
    }

    const includedItems = invoiceItemsState.filter(i => i.isIncluded);
    if (includedItems.length === 0) {
      alert('يرجى تحديد صنف واحد على الأقل تم شراؤه في هذه الفاتورة');
      return;
    }

    // Build PurchaseInvoice
    const newInvoiceItems: InvoiceItem[] = includedItems.map((it, idx) => ({
      id: `inv-it-${Date.now()}-${idx}`,
      itemName: it.medicineName,
      quantity: it.quantity,
      unitPrice: it.unitPrice,
      bonusScheme: it.bonusScheme,
      discountPercent: 0,
      totalPrice: it.quantity * it.unitPrice
    }));

    const totalInvoiceAmount = newInvoiceItems.reduce((acc, it) => acc + it.totalPrice, 0);
    const matchedSupplier = knownSuppliers.find(s => s.name === invoiceSupplierName.trim());

    const newInvoice: PurchaseInvoice = {
      id: `inv-${Date.now()}`,
      invoiceNumber: invoiceNumber.trim() || `INV-${Date.now()}`,
      supplierId: matchedSupplier?.id || `supp-${Date.now()}`,
      supplierName: invoiceSupplierName.trim(),
      invoiceDate: invoiceDate || new Date().toISOString().split('T')[0],
      totalAmount: totalInvoiceAmount,
      matchedOrderId: selectedOrder.id,
      items: newInvoiceItems,
      notes: `فاتورة شراء مسجلة للطلب ${selectedOrder.orderNumber}`,
      createdTimestamp: Date.now()
    };

    // Update order items
    const updatedOrderItems: OrderItem[] = selectedOrder.items.map(orderItem => {
      const purchaseMatch = includedItems.find(p => p.orderItemId === orderItem.id);
      if (purchaseMatch) {
        return {
          ...orderItem,
          isPurchased: true,
          actualPurchasedPrice: purchaseMatch.unitPrice,
          actualPurchasedQuantity: purchaseMatch.quantity,
          purchasedSupplierName: invoiceSupplierName.trim(),
          purchasedInvoiceNumber: newInvoice.invoiceNumber,
          purchasedDate: newInvoice.invoiceDate,
          purchasedInvoiceId: newInvoice.id
        };
      }
      return orderItem;
    });

    const allPurchased = updatedOrderItems.every(i => i.isPurchased);
    const somePurchased = updatedOrderItems.some(i => i.isPurchased);
    const newStatus: PharmacyOrder['status'] = allPurchased ? 'completed' : somePurchased ? 'partial' : 'pending';

    const updatedOrder: PharmacyOrder = {
      ...selectedOrder,
      status: newStatus,
      matchedInvoiceId: newInvoice.id,
      items: updatedOrderItems
    };

    // Save invoice to storage & add prices to market price list
    Storage.saveInvoice(newInvoice);
    const updatedOrders = Storage.saveOrder(updatedOrder);

    if (onSavePurchaseInvoice) {
      onSavePurchaseInvoice(newInvoice, selectedOrder.id, updatedOrder);
    } else if (onUpdateOrder) {
      onUpdateOrder(updatedOrder);
    }

    setIsPurchaseModalOpen(false);
    setInvoiceSuccessMsg(`✅ تم حفظ فاتورة الشراء وتحديث حالة الطلب إلى "${newStatus === 'completed' ? 'ناجح ومكتمل 100%' : 'طلب جزئي'}" بنجاح!`);
    setTimeout(() => setInvoiceSuccessMsg(null), 6000);
  };

  // Unique suppliers for current order (for filtering in details view)
  const orderSuppliers = useMemo(() => {
    if (!selectedOrder) return [];
    const set = new Set<string>();
    selectedOrder.items.forEach(it => {
      const priceInfo = enrichedPricesMap.get(it.id);
      if (it.purchasedSupplierName) set.add(it.purchasedSupplierName);
      else if (priceInfo?.bestSupplier && priceInfo.bestSupplier !== 'غير محدد') set.add(priceInfo.bestSupplier);
    });
    return Array.from(set);
  }, [selectedOrder, enrichedPricesMap]);

  // Handle Multi Image Upload
  const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      const newImgs: Array<{ id: string; name: string; base64: string; mimeType: string }> = [];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        try {
          const parsed = await parseUploadedFile(file);
          if (parsed.base64) {
            newImgs.push({
              id: `ord-img-${Date.now()}-${i}-${Math.random().toString(36).substr(2, 4)}`,
              name: file.name,
              base64: parsed.base64,
              mimeType: parsed.mimeType || 'image/jpeg'
            });
          }
        } catch (err) {
          console.error('Error reading order image:', err);
        }
      }
      setUploadedImages(prev => [...prev, ...newImgs]);
      setAnalysisError(null);
    }
  };

  const handleRemoveImage = (id: string) => {
    setUploadedImages(prev => prev.filter(img => img.id !== id));
  };

  // Handle Document File Upload
  const handleDocumentChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setFileName(file.name);
      try {
        const parsed = await parseUploadedFile(file);
        if (parsed.extractedText) {
          setOrderText(parsed.extractedText);
          setInputMode('text');
        } else if (parsed.tableData && parsed.tableData.length > 0) {
          // If spreadsheet with rows, format each row as a clean order line
          const tableLines = parsed.tableData.map(row => {
            const vals = Object.values(row).filter(v => v !== undefined && v !== null && String(v).trim() !== '');
            const itemName = String(vals[0] || '').trim();
            const qty = Number(vals[1]) || 1;
            return `${itemName} ${qty}`;
          }).filter(Boolean);
          setOrderText(tableLines.join('\n'));
          setInputMode('text');
        }

        if (parsed.base64) {
          setUploadedImages([{
            id: `ord-doc-${Date.now()}`,
            name: file.name,
            base64: parsed.base64,
            mimeType: parsed.mimeType || 'application/pdf'
          }]);
        }
      } catch (err: any) {
        setAnalysisError('تعذر استخراج النص من الملف.');
      }
    }
  };

  // Parse and Extract Order Items (Guaranteed 100% Extraction for all 170+ items)
  const handleParseAndReview = async () => {
    setIsAnalyzing(true);
    setAnalysisError(null);
    setDuplicateBanner(null);
    setReviewFilter('all');
    setReviewSearch('');

    try {
      const rawLines = (orderText || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean);
      
      // Step 1: Pre-compute 100% deterministic local baseline parsing for all lines
      const localParsedItems = rawLines.map((rawLine, idx) => {
        const parsed = parseMedicineOrderLine(rawLine);
        return {
          rawText: parsed.rawText || rawLine,
          matchedMedicineName: parsed.name || rawLine,
          quantity: parsed.quantity,
          unit: parsed.unit,
          isUncertain: parsed.isUncertain
        };
      });

      let extractedRawList: any[] = [];

      // Step 2: Call Client-Side Gemini directly
      try {
        const imagesPayload = ((inputMode === 'camera' || inputMode === 'file') && uploadedImages.length > 0)
          ? uploadedImages.map(img => ({
              base64: img.base64,
              mimeType: img.mimeType,
              name: img.name
            }))
          : undefined;

        const json = await parsePharmacyOrderClientSide({
          text: orderText,
          images: imagesPayload,
          knownMedicines,
          onProgress: (pct) => setParseProgress(pct)
        });

        if (json && json.success) {
          if (Array.isArray(json.data)) extractedRawList = json.data;
          else if (json.data && Array.isArray(json.data.items)) extractedRawList = json.data.items;
          else if (Array.isArray((json as any).items)) extractedRawList = (json as any).items;
        }
      } catch (networkErr) {
        console.warn('Client Gemini warning, switching to instant local parser:', networkErr);
      }

      // Step 3: Ensure 100% coverage. If AI returned fewer items than input lines (or failed), guarantee all items
      if (rawLines.length > 0) {
        if (extractedRawList.length === 0) {
          extractedRawList = localParsedItems;
        } else if (extractedRawList.length < rawLines.length) {
          // Merge AI parsed results with local list for any missed lines
          const aiRawTexts = new Set(extractedRawList.map(it => (it.rawText || '').trim().toLowerCase()));
          localParsedItems.forEach(localItem => {
            const cleanRaw = (localItem.rawText || '').trim().toLowerCase();
            if (!aiRawTexts.has(cleanRaw)) {
              extractedRawList.push(localItem);
            }
          });
        }
      }

      // Step 4: Map and enrich each item with fuzzy medicine matching and market price comparisons
      // EVERY item (whether existing in database or completely new) is preserved and enriched
      const rawItems: OrderItem[] = extractedRawList.map((it: any, idx: number) => {
        let rawName = (it.matchedMedicineName || it.matchedName || it.medicineName || it.rawText || `صنف ${idx + 1}`).trim();
        let medName = cleanAndFormatMedicineName(rawName);
        let medId = it.matchedMedicineId || '';

        // Match against knownMedicines for canonical naming if a strong similarity exists
        const sim = findSimilarMedicine(medName, knownMedicines);
        if (sim && (sim.isExact || sim.similarityScore >= 0.70)) {
          medName = sim.existingMedicine.name;
          medId = sim.existingMedicine.id;
        }

        // Query market price summary (returns best market price if known, or 0 for brand new items)
        const summary = computeMedicinePriceSummary(medId, medName, marketPrices, knownMedicines);

        return {
          id: `item-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 6)}`,
          rawText: cleanAndFormatMedicineName(it.rawText || rawName),
          matchedMedicineName: medName,
          matchedMedicineId: medId || (summary?.medicineId || undefined),
          quantity: Number(it.quantity) > 0 ? Number(it.quantity) : 1,
          unit: it.unit || 'علبة',
          isUncertain: it.isUncertain || false,
          uncertaintyReason: it.uncertaintyReason || '',
          referencePrice: Number(it.referencePrice) || 0,
          bestMarketPrice: summary?.lowestPrice || 0,
          bestSupplierName: summary?.bestSupplierName || '',
          isPurchased: false
        };
      });

      // Duplicate Aggregation: Combine quantities ONLY when exact medicine name and strength match
      const aggregatedMap = new Map<string, { item: OrderItem; counts: number[] }>();
      let foundDuplicates: { name: string; sum: number; originalCounts: number[] } | null = null;

      rawItems.forEach(item => {
        const key = item.matchedMedicineName.trim().toLowerCase();
        if (aggregatedMap.has(key)) {
          const existing = aggregatedMap.get(key)!;
          existing.counts.push(item.quantity);
          existing.item.quantity += item.quantity;
          foundDuplicates = {
            name: item.matchedMedicineName,
            sum: existing.item.quantity,
            originalCounts: existing.counts
          };
        } else {
          aggregatedMap.set(key, { item: { ...item }, counts: [item.quantity] });
        }
      });

      const mergedItems = Array.from(aggregatedMap.values()).map(v => v.item);
      setParsedItems(mergedItems);
      if (foundDuplicates) setDuplicateBanner(foundDuplicates);

      // Check for slight similarity conflicts
      const conflicts: SimilarityConflict[] = [];
      mergedItems.forEach((it, idx) => {
        const sim = findSimilarMedicine(it.matchedMedicineName, knownMedicines);
        if (sim && sim.isNearMatch && sim.existingMedicine.name !== it.matchedMedicineName) {
          conflicts.push({
            id: it.id || `conflict-${idx}`,
            candidateName: it.matchedMedicineName,
            existingMedicine: sim.existingMedicine as Medicine,
            similarityScore: sim.similarityScore,
            quantity: it.quantity,
            originalIndex: idx
          });
        }
      });

      if (conflicts.length > 0) {
        setSimilarityConflicts(conflicts);
        setShowSimilarityModal(true);
      }

      setIsReviewed(true);
    } catch (err: any) {
      console.warn('Parsing fallback:', err);
      setAnalysisError('حدث خطأ أثناء استخراج الأصناف. يرجى مراجعة النص وإعادة المحاولة.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleApplyResolutions = (resolutions: Map<string, { action: 'merge_existing' | 'create_new' | 'custom_name'; chosenName: string; medicineId?: string }>) => {
    setParsedItems(prev => prev.map(item => {
      const res = resolutions.get(item.id);
      if (res) {
        const summary = computeMedicinePriceSummary(res.medicineId || '', res.chosenName, marketPrices, knownMedicines);
        return {
          ...item,
          matchedMedicineName: res.chosenName,
          matchedMedicineId: res.medicineId,
          bestMarketPrice: summary?.lowestPrice || item.bestMarketPrice,
          bestSupplierName: summary?.bestSupplierName || item.bestSupplierName
        };
      }
      return item;
    }));
    setShowSimilarityModal(false);
  };

  const handleApproveOrder = () => {
    if (parsedItems.length === 0) {
      alert('يرجى إضافة صنف واحد على الأقل');
      return;
    }

    // Persist all resolved aliases into storage so the system continuously learns
    parsedItems.forEach(it => {
      if (it.matchedMedicineId && it.rawText && it.rawText.trim() !== it.matchedMedicineName.trim()) {
        try {
          Storage.addAliasToMedicine(it.matchedMedicineId, it.rawText);
        } catch (e) {
          console.warn('Could not persist alias on order approval:', e);
        }
      }
    });

    const newOrder: PharmacyOrder = {
      id: `ord-${Date.now()}`,
      orderNumber: orderNumber.trim() || `ORD-${Date.now()}`,
      pharmacyName: pharmacyName.trim() || 'صيدلية غير محددة',
      orderDate: new Date().toISOString().split('T')[0],
      status: 'pending',
      rawInputText: inputMode === 'text' ? orderText : undefined,
      imageUri: uploadedImages.length > 0 ? uploadedImages[0].base64 : undefined,
      items: parsedItems,
      notes: 'تم إنشاؤه واعتماده',
      createdTimestamp: Date.now()
    };

    onOrderApproved(newOrder);
    setViewMode('list');
    setIsReviewed(false);
    setParsedItems([]);
    setUploadedImages([]);
  };

  const handleChangeAdoptedName = (itemId: string, newName: string) => {
    const clean = newName.trim();
    const sim = findSimilarMedicine(clean, knownMedicines);
    const matched = sim?.existingMedicine;
    const resolvedId = matched ? matched.id : undefined;
    const summary = computeMedicinePriceSummary(resolvedId || '', clean, marketPrices, knownMedicines);

    setParsedItems(prev => prev.map(it => {
      if (it.id === itemId) {
        return {
          ...it,
          matchedMedicineName: newName,
          matchedMedicineId: resolvedId || it.matchedMedicineId,
          isUncertain: false,
          bestMarketPrice: summary?.lowestPrice || 0,
          bestSupplierName: summary?.bestSupplierName || ''
        };
      }
      return it;
    }));
  };

  const updateQuantity = (itemId: string, delta: number) => {
    setParsedItems(prev => prev.map(it => {
      if (it.id === itemId) {
        const newQty = Math.max(1, it.quantity + delta);
        return { ...it, quantity: newQty };
      }
      return it;
    }));
  };

  const handleDeleteItem = (itemId: string) => {
    setParsedItems(prev => prev.filter(it => it.id !== itemId));
  };

  const handleAutoCleanAllParsedItems = () => {
    setParsedItems(prev => prev.map(item => {
      const cleaned = cleanAndFormatMedicineName(item.matchedMedicineName);
      const sim = findSimilarMedicine(cleaned, knownMedicines);
      const finalName = (sim && (sim.isExact || sim.similarityScore >= 0.70)) ? sim.existingMedicine.name : cleaned;
      const finalId = (sim && (sim.isExact || sim.similarityScore >= 0.70)) ? sim.existingMedicine.id : item.matchedMedicineId;
      const summary = computeMedicinePriceSummary(finalId || '', finalName, marketPrices, knownMedicines);
      return {
        ...item,
        rawText: cleanAndFormatMedicineName(item.rawText),
        matchedMedicineName: finalName,
        matchedMedicineId: finalId,
        bestMarketPrice: summary?.lowestPrice || item.bestMarketPrice,
        bestSupplierName: summary?.bestSupplierName || item.bestSupplierName
      };
    }));
  };

  const handleAddManualRow = () => {
    const defaultMed = knownMedicines[0]?.name || 'بندول اكسترا';
    const summary = computeMedicinePriceSummary(knownMedicines[0]?.id || '', defaultMed, marketPrices, knownMedicines);
    const newItem: OrderItem = {
      id: `item-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      rawText: 'صنف يدوي جديد',
      matchedMedicineName: defaultMed,
      matchedMedicineId: knownMedicines[0]?.id,
      quantity: 1,
      unit: 'علبة',
      bestMarketPrice: summary?.lowestPrice || 0,
      bestSupplierName: summary?.bestSupplierName || '',
      isPurchased: false
    };
    setParsedItems(prev => [...prev, newItem]);
  };

  return (
    <div className="space-y-5 pb-12" dir="rtl">
      
      {/* Toast / Success Message Banner */}
      {invoiceSuccessMsg && (
        <div className="p-4 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-sm font-bold flex items-center gap-3 animate-in fade-in shadow-lg">
          <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
          <span>{invoiceSuccessMsg}</span>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 1. TOP STATISTICS BAR (احصائيات أعلى القائمة الأربعة التفاعلية)            */}
      {/* ========================================================================= */}
      {viewMode === 'list' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h1 className="text-xl sm:text-2xl font-black text-white flex items-center gap-2">
                <Store className="w-6 h-6 text-teal-400" />
                <span>إدارة طلبات الصيدليات</span>
              </h1>
              <p className="text-xs sm:text-sm text-slate-400 mt-0.5">
                متابعة وتجهيز طلبيات الأدوية، مقارنة الأسعار مع الموردين، وإدارة فواتير الشراء
              </p>
            </div>

            <button
              type="button"
              onClick={() => {
                setViewMode('create');
                setIsReviewed(false);
                setUploadedImages([]);
              }}
              className="px-4 py-2.5 rounded-2xl bg-teal-500 hover:bg-teal-400 text-slate-950 font-black text-xs sm:text-sm flex items-center justify-center gap-2 shadow-lg shadow-teal-500/20 cursor-pointer transition-all active:scale-95"
            >
              <PlusCircle className="w-4 h-4" />
              <span>+ إضافة طلب صيدلية جديد</span>
            </button>
          </div>

          {/* 4 Interactive Statistics Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            
            {/* 1. Total Orders (إجمالي الطلبات) */}
            <button
              type="button"
              onClick={() => setStatusFilter('all')}
              className={`p-3.5 sm:p-4 rounded-2xl border text-right transition-all cursor-pointer flex flex-col justify-between ${
                statusFilter === 'all'
                  ? 'bg-slate-900 border-teal-500 ring-2 ring-teal-500/30 shadow-lg shadow-teal-500/10'
                  : 'bg-slate-950/70 border-slate-800/80 hover:border-slate-700 hover:bg-slate-900/60'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] sm:text-xs font-bold text-slate-400">إجمالي الطلبات</span>
                <div className={`p-2 rounded-xl ${statusFilter === 'all' ? 'bg-teal-500/20 text-teal-300' : 'bg-slate-800 text-slate-400'}`}>
                  <ShoppingCart className="w-4 h-4" />
                </div>
              </div>
              <div className="mt-2">
                <span className="text-2xl sm:text-3xl font-black text-white font-mono">{totalCount}</span>
                <span className="text-[10px] sm:text-xs text-slate-400 block mt-0.5">جميع الطلبيات المسجلة</span>
              </div>
            </button>

            {/* 2. Pending Orders (الطلبات المعلقة) */}
            <button
              type="button"
              onClick={() => setStatusFilter('pending')}
              className={`p-3.5 sm:p-4 rounded-2xl border text-right transition-all cursor-pointer flex flex-col justify-between ${
                statusFilter === 'pending'
                  ? 'bg-amber-950/30 border-amber-500 ring-2 ring-amber-500/30 shadow-lg shadow-amber-500/10'
                  : 'bg-slate-950/70 border-slate-800/80 hover:border-slate-700 hover:bg-slate-900/60'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] sm:text-xs font-bold text-amber-400">الطلبات المعلقة</span>
                <div className={`p-2 rounded-xl ${statusFilter === 'pending' ? 'bg-amber-500/20 text-amber-300' : 'bg-slate-800 text-slate-400'}`}>
                  <Clock className="w-4 h-4" />
                </div>
              </div>
              <div className="mt-2">
                <span className="text-2xl sm:text-3xl font-black text-amber-400 font-mono">{pendingCount}</span>
                <span className="text-[10px] sm:text-xs text-slate-400 block mt-0.5">بانتظار الشراء والمطابقة</span>
              </div>
            </button>

            {/* 3. Successful Orders (الطلبات الناجحة) */}
            <button
              type="button"
              onClick={() => setStatusFilter('completed')}
              className={`p-3.5 sm:p-4 rounded-2xl border text-right transition-all cursor-pointer flex flex-col justify-between ${
                statusFilter === 'completed'
                  ? 'bg-emerald-950/30 border-emerald-500 ring-2 ring-emerald-500/30 shadow-lg shadow-emerald-500/10'
                  : 'bg-slate-950/70 border-slate-800/80 hover:border-slate-700 hover:bg-slate-900/60'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] sm:text-xs font-bold text-emerald-400">الطلبات الناجحة</span>
                <div className={`p-2 rounded-xl ${statusFilter === 'completed' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-slate-800 text-slate-400'}`}>
                  <CheckCheck className="w-4 h-4" />
                </div>
              </div>
              <div className="mt-2">
                <span className="text-2xl sm:text-3xl font-black text-emerald-400 font-mono">{completedCount}</span>
                <span className="text-[10px] sm:text-xs text-slate-400 block mt-0.5">تم شراؤها واكتمالها 100%</span>
              </div>
            </button>

            {/* 4. Partial Orders (الطلبات الجزئية) */}
            <button
              type="button"
              onClick={() => setStatusFilter('partial')}
              className={`p-3.5 sm:p-4 rounded-2xl border text-right transition-all cursor-pointer flex flex-col justify-between ${
                statusFilter === 'partial'
                  ? 'bg-indigo-950/40 border-indigo-500 ring-2 ring-indigo-500/30 shadow-lg shadow-indigo-500/10'
                  : 'bg-slate-950/70 border-slate-800/80 hover:border-slate-700 hover:bg-slate-900/60'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] sm:text-xs font-bold text-indigo-400">الطلبات الجزئية</span>
                <div className={`p-2 rounded-xl ${statusFilter === 'partial' ? 'bg-indigo-500/20 text-indigo-300' : 'bg-slate-800 text-slate-400'}`}>
                  <Sparkles className="w-4 h-4" />
                </div>
              </div>
              <div className="mt-2">
                <span className="text-2xl sm:text-3xl font-black text-indigo-400 font-mono">{partialCount}</span>
                <span className="text-[10px] sm:text-xs text-slate-400 block mt-0.5">تم شراء جزء منها ومتبقي بنود</span>
              </div>
            </button>

          </div>

          {/* Search & Filter Bar */}
          <div className="flex flex-col sm:flex-row gap-2.5 items-stretch sm:items-center justify-between bg-slate-900/80 p-3 rounded-2xl border border-slate-800">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="ابحث برقم الطلب، اسم الصيدلية، أو الصنف..."
                className="w-full bg-slate-950 border border-slate-800 rounded-xl pr-10 pl-3.5 py-2 text-xs sm:text-sm text-slate-200 focus:outline-none focus:border-teal-500"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 text-xs"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 text-xs font-bold">
              <button
                type="button"
                onClick={() => setStatusFilter('all')}
                className={`px-3 py-1.5 rounded-xl transition-colors whitespace-nowrap cursor-pointer ${
                  statusFilter === 'all' ? 'bg-teal-500 text-slate-950 font-black' : 'bg-slate-950 text-slate-400 hover:text-white border border-slate-800'
                }`}
              >
                الكل ({totalCount})
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter('pending')}
                className={`px-3 py-1.5 rounded-xl transition-colors whitespace-nowrap cursor-pointer ${
                  statusFilter === 'pending' ? 'bg-amber-500 text-slate-950 font-black' : 'bg-slate-950 text-amber-400/80 hover:text-amber-300 border border-slate-800'
                }`}
              >
                معلقة ({pendingCount})
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter('completed')}
                className={`px-3 py-1.5 rounded-xl transition-colors whitespace-nowrap cursor-pointer ${
                  statusFilter === 'completed' ? 'bg-emerald-500 text-slate-950 font-black' : 'bg-slate-950 text-emerald-400/80 hover:text-emerald-300 border border-slate-800'
                }`}
              >
                ناجحة ({completedCount})
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter('partial')}
                className={`px-3 py-1.5 rounded-xl transition-colors whitespace-nowrap cursor-pointer ${
                  statusFilter === 'partial' ? 'bg-indigo-500 text-white font-black' : 'bg-slate-950 text-indigo-400/80 hover:text-indigo-300 border border-slate-800'
                }`}
              >
                جزئية ({partialCount})
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 2. ORDERS LIST VIEW (عدم إظهار أصناف الطلب داخل الكرت - الضغط يفتح التفاصيل)*/}
      {/* ========================================================================= */}
      {viewMode === 'list' && (
        <div className="space-y-3">
          {filteredOrders.length === 0 ? (
            <div className="text-center py-16 bg-slate-900/40 rounded-3xl border border-slate-800/80 p-8 space-y-3">
              <ShoppingCart className="w-12 h-12 text-slate-600 mx-auto" />
              <h3 className="text-base font-bold text-slate-300">لا توجد طلبات مطابقة للفلتر المحدد</h3>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                يمكنك تغيير حالة الفلتر من الأزرار بالأعلى أو إضافة طلب صيدلية جديد.
              </p>
              <button
                type="button"
                onClick={() => setStatusFilter('all')}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold"
              >
                عرض جميع الطلبات
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              {filteredOrders.map(order => {
                const purchasedItemsCount = order.items.filter(i => i.isPurchased).length;
                const totalItemsCount = order.items.length;
                const progressPct = totalItemsCount > 0 ? Math.round((purchasedItemsCount / totalItemsCount) * 100) : 0;
                
                // Status Badge details
                let statusBadge = {
                  label: 'طلب معلق',
                  colorClass: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
                  icon: <Clock className="w-3.5 h-3.5" />
                };
                if (order.status === 'completed') {
                  statusBadge = {
                    label: 'ناجح ومكتمل (100%)',
                    colorClass: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
                    icon: <CheckCircle2 className="w-3.5 h-3.5" />
                  };
                } else if (order.status === 'partial') {
                  statusBadge = {
                    label: `طلب جزئي (${purchasedItemsCount}/${totalItemsCount})`,
                    colorClass: 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30',
                    icon: <Sparkles className="w-3.5 h-3.5" />
                  };
                }

                return (
                  <div
                    key={order.id}
                    onClick={() => handleOpenOrderDetails(order)}
                    className="p-4 sm:p-5 rounded-2xl bg-slate-900/90 border border-slate-800 hover:border-teal-500/50 hover:bg-slate-900 transition-all duration-200 shadow-md hover:shadow-xl cursor-pointer group flex flex-col justify-between space-y-3.5"
                  >
                    {/* Card Top: Pharmacy & Order # */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] font-mono font-bold px-2 py-0.5 rounded-md bg-slate-950 text-slate-300 border border-slate-800">
                            {order.orderNumber}
                          </span>
                          <span className={`inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 rounded-full border ${statusBadge.colorClass}`}>
                            {statusBadge.icon}
                            <span>{statusBadge.label}</span>
                          </span>
                        </div>
                        <h3 className="text-sm sm:text-base font-black text-white group-hover:text-teal-300 transition-colors">
                          {order.pharmacyName}
                        </h3>
                      </div>

                      <span className="text-[11px] text-slate-400 font-mono flex items-center gap-1 shrink-0">
                        <Calendar className="w-3 h-3 text-slate-500" />
                        {order.orderDate}
                      </span>
                    </div>

                    {/* Progress & Item Metrics */}
                    <div className="p-3 bg-slate-950/70 rounded-xl border border-slate-800/60 space-y-2">
                      <div className="flex items-center justify-between text-xs font-bold">
                        <span className="text-slate-400">
                          الأصناف: <strong className="text-slate-200">{totalItemsCount} أصناف</strong>
                        </span>
                        <span className={order.status === 'completed' ? 'text-emerald-400' : order.status === 'partial' ? 'text-indigo-400' : 'text-amber-400'}>
                          {order.status === 'completed' 
                            ? 'تم شراء جميع الأصناف ✓' 
                            : order.status === 'partial'
                            ? `تم شراء ${purchasedItemsCount} من ${totalItemsCount} (${progressPct}%)`
                            : 'بانتظار الشراء'}
                        </span>
                      </div>

                      {/* Progress bar */}
                      <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden">
                        <div 
                          className={`h-full transition-all duration-500 ${
                            order.status === 'completed' 
                              ? 'bg-emerald-500' 
                              : order.status === 'partial' 
                              ? 'bg-indigo-500' 
                              : 'bg-amber-500/50'
                          }`}
                          style={{ width: `${Math.max(5, progressPct)}%` }}
                        />
                      </div>
                    </div>

                    {/* Card Actions & Click Cue */}
                    <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-xs">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleOpenOrderDetails(order);
                        }}
                        className="text-teal-400 font-bold flex items-center gap-1 group-hover:translate-x-[-2px] transition-transform"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>عرض تفاصيل وأصناف الطلب</span>
                        <ChevronLeft className="w-3.5 h-3.5" />
                      </button>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onNavigateToPriceComparison(order.id);
                          }}
                          className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-teal-300 text-[11px] font-bold transition-colors"
                          title="مقارنة الأسعار"
                        >
                          مقارنة الأسعار
                        </button>

                        {onDeleteOrder && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onDeleteOrder(order.id);
                            }}
                            className="p-1 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-slate-800 transition-colors"
                            title="حذف الطلب"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>

                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* 3. ORDER DETAILS VIEW (عرض تفاصيل وأصناف الطلب مع فلترة الموردين)           */}
      {/* ========================================================================= */}
      {viewMode === 'details' && selectedOrder && (
        <div className="space-y-4">
          
          {/* Header Bar */}
          <div className="p-4 sm:p-5 rounded-3xl bg-slate-900/90 border border-slate-800 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setViewMode('list')}
                  className="p-2 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors cursor-pointer"
                  title="العودة لقائمة الطلبات"
                >
                  <ArrowRight className="w-4 h-4" />
                </button>

                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono font-bold px-2.5 py-0.5 rounded-md bg-slate-950 text-teal-400 border border-slate-800">
                      {selectedOrder.orderNumber}
                    </span>
                    <span className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full border ${
                      selectedOrder.status === 'completed'
                        ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                        : selectedOrder.status === 'partial'
                        ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30'
                        : 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                    }`}>
                      {selectedOrder.status === 'completed'
                        ? 'ناجح ومكتمل ✓'
                        : selectedOrder.status === 'partial'
                        ? 'طلب جزئي (مشتريات غير مكتملة)'
                        : 'طلب معلق'}
                    </span>
                  </div>
                  <h2 className="text-lg sm:text-xl font-black text-white mt-1">
                    {selectedOrder.pharmacyName}
                  </h2>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handleOpenPurchaseModal}
                  className="px-4 py-2.5 rounded-2xl bg-gradient-to-r from-teal-500 to-emerald-500 hover:from-teal-400 hover:to-emerald-400 text-slate-950 font-black text-xs sm:text-sm flex items-center gap-2 shadow-lg shadow-teal-500/20 cursor-pointer transition-transform active:scale-95"
                >
                  <Receipt className="w-4 h-4" />
                  <span>+ إضافة فاتورة شراء للطلب</span>
                </button>

                <button
                  type="button"
                  onClick={() => onNavigateToPriceComparison(selectedOrder.id)}
                  className="px-3.5 py-2.5 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs sm:text-sm font-bold flex items-center gap-1.5 transition-colors"
                >
                  <TrendingUp className="w-4 h-4 text-teal-400" />
                  <span>مقارنة الأسعار بالسوق</span>
                </button>
              </div>
            </div>

            {/* Supplier Filter Bar (فلترة الأصناف بناء على الموردين) */}
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <div className="flex items-center gap-1 text-xs font-bold text-slate-400 ml-1">
                <Filter className="w-3.5 h-3.5 text-teal-400" />
                <span>تصفية حسب المورد:</span>
              </div>

              <button
                type="button"
                onClick={() => setSelectedSupplierFilter('all')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors cursor-pointer ${
                  selectedSupplierFilter === 'all'
                    ? 'bg-teal-500 text-slate-950 font-black'
                    : 'bg-slate-950 text-slate-400 hover:text-white border border-slate-800'
                }`}
              >
                جميع الموردين ({selectedOrder.items.length})
              </button>

              {orderSuppliers.map(supName => {
                const count = selectedOrder.items.filter(it => {
                  const p = getEnrichedItemPrice(it);
                  return it.purchasedSupplierName === supName || p.bestSupplier === supName;
                }).length;

                return (
                  <button
                    key={supName}
                    type="button"
                    onClick={() => setSelectedSupplierFilter(supName)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5 ${
                      selectedSupplierFilter === supName
                        ? 'bg-teal-500 text-slate-950 font-black'
                        : 'bg-slate-950 text-slate-300 hover:text-white border border-slate-800'
                    }`}
                  >
                    <Building2 className="w-3 h-3 text-teal-400" />
                    <span>{supName}</span>
                    <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-slate-800 text-slate-300">
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* ===================================================================== */}
          {/* ITEMS BREAKDOWN: PARTIAL / COMPLETED / PENDING                         */}
          {/* ===================================================================== */}

          {(() => {
            // Apply supplier filter to items
            const filteredItems = selectedOrder.items.filter(it => {
              if (selectedSupplierFilter === 'all') return true;
              const p = getEnrichedItemPrice(it);
              return it.purchasedSupplierName === selectedSupplierFilter || p.bestSupplier === selectedSupplierFilter;
            });

            const unpurchasedItems = filteredItems.filter(i => !i.isPurchased);
            const purchasedItems = filteredItems.filter(i => i.isPurchased);

            return (
              <div className="space-y-5">
                
                {/* SECTION 1: Unpurchased / Pending Items (الأصناف المتبقية للشراء - تظهر في الأعلى) */}
                {(selectedOrder.status === 'partial' || unpurchasedItems.length > 0) && (
                  <div className="p-4 sm:p-5 rounded-3xl bg-slate-900/90 border border-amber-500/30 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="p-1.5 rounded-xl bg-amber-500/20 text-amber-300">
                          <AlertTriangle className="w-4 h-4" />
                        </span>
                        <div>
                          <h3 className="text-sm sm:text-base font-black text-amber-300">
                            الأصناف المتبقية للشراء (لم يتم شراؤها بعد)
                          </h3>
                          <p className="text-[11px] text-slate-400">
                            أصناف مطلوبة في هذا الطلب وتنتظر إصدار فاتورة شراء من أفضل مورد
                          </p>
                        </div>
                      </div>

                      <span className="text-xs px-2.5 py-1 rounded-full bg-amber-500/20 text-amber-300 font-bold border border-amber-500/30 font-mono">
                        {unpurchasedItems.length} أصناف متبقية
                      </span>
                    </div>

                    {unpurchasedItems.length === 0 ? (
                      <div className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800 text-center text-xs text-slate-400">
                        لا توجد أصناف متبقية مطابقة لهذا المورد المحدد.
                      </div>
                    ) : (
                      <div className="overflow-x-auto rounded-2xl border border-slate-800">
                        <table className="w-full text-right text-xs">
                          <thead className="bg-slate-950 text-slate-400 border-b border-slate-800 font-bold">
                            <tr>
                              <th className="py-3 px-3">#</th>
                              <th className="py-3 px-3">اسم الصنف الصيدلاني (مع القوة)</th>
                              <th className="py-3 px-3 text-center">الكمية</th>
                              <th className="py-3 px-3 text-center">أقل سعر في السوق</th>
                              <th className="py-3 px-3">المورد صاحب أقل سعر</th>
                              <th className="py-3 px-3 text-center">الإجمالي التقديري</th>
                              <th className="py-3 px-3 text-center">حالة الشراء</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-800/60 bg-slate-950/40">
                            {unpurchasedItems.map((item, idx) => {
                              const priceInfo = getEnrichedItemPrice(item);
                              const totalEst = item.quantity * priceInfo.lowestPrice;

                              return (
                                <tr key={item.id} className="hover:bg-slate-900/60">
                                  <td className="py-3 px-3 font-mono text-slate-500">{idx + 1}</td>
                                  <td className="py-3 px-3 font-bold text-white">
                                    {item.matchedMedicineName || item.rawText}
                                  </td>
                                  <td className="py-3 px-3 text-center font-bold text-teal-400 font-mono">
                                    {item.quantity} {item.unit || 'علبة'}
                                  </td>
                                  <td className="py-3 px-3 text-center font-mono font-bold text-emerald-400">
                                    {formatCurrency(priceInfo.lowestPrice)}
                                  </td>
                                  <td className="py-3 px-3 text-slate-300 flex items-center gap-1.5">
                                    <Building2 className="w-3.5 h-3.5 text-teal-400 shrink-0" />
                                    <span>{priceInfo.bestSupplier}</span>
                                  </td>
                                  <td className="py-3 px-3 text-center font-mono font-bold text-slate-200">
                                    {formatCurrency(totalEst)}
                                  </td>
                                  <td className="py-3 px-3 text-center">
                                    <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30">
                                      <Clock className="w-3 h-3" />
                                      لم يشترَ بعد
                                    </span>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}

                {/* SECTION 2: Purchased Items (الأصناف التي تم شراؤها - تظهر في الأسفل مع إشارة صح) */}
                {purchasedItems.length > 0 && (
                  <div className="p-4 sm:p-5 rounded-3xl bg-slate-900/90 border border-emerald-500/30 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="p-1.5 rounded-xl bg-emerald-500/20 text-emerald-300">
                          <CheckCircle2 className="w-4 h-4" />
                        </span>
                        <div>
                          <h3 className="text-sm sm:text-base font-black text-emerald-300">
                            الأصناف التي تم شراؤها بنجاح (معتمدة وموردة)
                          </h3>
                          <p className="text-[11px] text-slate-400">
                            بنود تم توريدها وحفظ فواتيرها وأسعارها في البرنامج
                          </p>
                        </div>
                      </div>

                      <span className="text-xs px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-500/30 font-mono">
                        {purchasedItems.length} أصناف تم شراؤها ✓
                      </span>
                    </div>

                    <div className="overflow-x-auto rounded-2xl border border-slate-800">
                      <table className="w-full text-right text-xs">
                        <thead className="bg-slate-950 text-slate-400 border-b border-slate-800 font-bold">
                          <tr>
                            <th className="py-3 px-3">#</th>
                            <th className="py-3 px-3">اسم الصنف الصيدلاني</th>
                            <th className="py-3 px-3 text-center">الكمية المشتراة</th>
                            <th className="py-3 px-3 text-center">سعر الشراء الفعلي</th>
                            <th className="py-3 px-3">المورد الفعلي</th>
                            <th className="py-3 px-3 text-center">رقم الفاتورة والتاريخ</th>
                            <th className="py-3 px-3 text-center">حالة الشراء</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/60 bg-slate-950/40">
                          {purchasedItems.map((item, idx) => {
                            const priceInfo = getEnrichedItemPrice(item);
                            const actualPrice = item.actualPurchasedPrice || priceInfo.lowestPrice;
                            const diff = actualPrice - priceInfo.lowestPrice;

                            return (
                              <tr key={item.id} className="hover:bg-slate-900/60 bg-emerald-950/5">
                                <td className="py-3 px-3 font-mono text-slate-500">{idx + 1}</td>
                                <td className="py-3 px-3 font-bold text-white">
                                  {item.matchedMedicineName || item.rawText}
                                </td>
                                <td className="py-3 px-3 text-center font-bold text-emerald-400 font-mono">
                                  {item.actualPurchasedQuantity || item.quantity} {item.unit || 'علبة'}
                                </td>
                                <td className="py-3 px-3 text-center font-mono">
                                  <span className="font-bold text-emerald-300 block">
                                    {formatCurrency(actualPrice)}
                                  </span>
                                  {diff > 0 ? (
                                    <span className="text-[10px] text-rose-400 block font-bold">
                                      (+{diff} زيادة عن السوق)
                                    </span>
                                  ) : diff < 0 ? (
                                    <span className="text-[10px] text-emerald-400 block font-bold">
                                      ({diff} توفير!)
                                    </span>
                                  ) : (
                                    <span className="text-[10px] text-teal-400 block">
                                      (مطابق لأفضل سعر)
                                    </span>
                                  )}
                                </td>
                                <td className="py-3 px-3 text-slate-200 font-medium">
                                  {item.purchasedSupplierName || priceInfo.bestSupplier}
                                </td>
                                <td className="py-3 px-3 text-center font-mono text-slate-400">
                                  <span className="text-slate-300 font-bold block">
                                    {item.purchasedInvoiceNumber || 'INV-0'}
                                  </span>
                                  <span className="text-[10px] text-slate-500">
                                    {item.purchasedDate || selectedOrder.orderDate}
                                  </span>
                                </td>
                                <td className="py-3 px-3 text-center">
                                  <span className="inline-flex items-center gap-1.5 text-[11px] font-bold px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-sm shadow-emerald-500/10">
                                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                                    تم الشراء بنجاح
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
            );
          })()}

        </div>
      )}

      {/* ========================================================================= */}
      {/* 4. PURCHASE INVOICE MODAL (إضافة فاتورة شراء مع مقارنة الأسعار الفورية)    */}
      {/* ========================================================================= */}
      {isPurchaseModalOpen && selectedOrder && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-teal-500/40 rounded-3xl w-full max-w-3xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in-95">
            
            {/* Modal Header */}
            <div className="p-4 sm:p-5 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
              <div>
                <h3 className="text-base sm:text-lg font-black text-white flex items-center gap-2">
                  <Receipt className="w-5 h-5 text-teal-400" />
                  <span>إضافة فاتورة شراء للطلب: {selectedOrder.orderNumber}</span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  حدد الأصناف التي تم شراؤها، وأدخل أسعار الشراء لمقارنتها فوراً بأقل أسعار السوق المحفوظة
                </p>
              </div>

              <button
                type="button"
                onClick={() => setIsPurchaseModalOpen(false)}
                className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-4 sm:p-5 overflow-y-auto space-y-4 flex-1">
              
              {/* Supplier & Invoice Info Row */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">
                    اسم المورد <span className="text-rose-400">*</span>:
                  </label>
                  <input
                    type="text"
                    list="modal-suppliers-list"
                    value={invoiceSupplierName}
                    onChange={e => setInvoiceSupplierName(e.target.value)}
                    placeholder="اختر أو اكتب اسم المورد..."
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs sm:text-sm text-white font-bold focus:outline-none focus:border-teal-500"
                  />
                  <datalist id="modal-suppliers-list">
                    {knownSuppliers.map(s => (
                      <option key={s.id} value={s.name} />
                    ))}
                    {orderSuppliers.map(s => (
                      <option key={`ord-${s}`} value={s} />
                    ))}
                  </datalist>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">
                    رقم الفاتورة:
                  </label>
                  <input
                    type="text"
                    value={invoiceNumber}
                    onChange={e => setInvoiceNumber(e.target.value)}
                    placeholder="INV-..."
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs sm:text-sm text-white font-mono focus:outline-none focus:border-teal-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">
                    تاريخ الفاتورة:
                  </label>
                  <input
                    type="date"
                    value={invoiceDate}
                    onChange={e => setInvoiceDate(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs sm:text-sm text-white font-mono focus:outline-none focus:border-teal-500"
                  />
                </div>
              </div>

              {/* Items Selection & Real-Time Price Comparison Table */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs font-bold text-slate-300">
                  <span>أصناف الطلب ومقارنة الأسعار بالسوق:</span>
                  <span className="text-teal-400">
                    محدد للشراء: {invoiceItemsState.filter(i => i.isIncluded).length} من {invoiceItemsState.length} أصناف
                  </span>
                </div>

                <div className="space-y-3">
                  {invoiceItemsState.map((item, idx) => {
                    const diff = item.unitPrice - item.lowestPrice;
                    const isPriceHigher = diff > 0 && item.lowestPrice > 0;
                    const isPriceLower = diff < 0 && item.lowestPrice > 0;
                    const isPriceExact = diff === 0 && item.lowestPrice > 0;

                    return (
                      <div
                        key={item.orderItemId}
                        className={`p-3.5 rounded-2xl border transition-all ${
                          item.isIncluded
                            ? 'bg-slate-950/80 border-slate-700'
                            : 'bg-slate-950/30 border-slate-800/50 opacity-60'
                        }`}
                      >
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                          
                          {/* Checkbox & Name */}
                          <div className="flex items-center gap-2.5">
                            <input
                              type="checkbox"
                              checked={item.isIncluded}
                              onChange={e => {
                                const checked = e.target.checked;
                                setInvoiceItemsState(prev => prev.map((it, i) => i === idx ? { ...it, isIncluded: checked } : it));
                              }}
                              className="w-4 h-4 rounded text-teal-500 focus:ring-teal-500 bg-slate-900 border-slate-700 cursor-pointer"
                            />
                            <div>
                              <span className="text-xs sm:text-sm font-bold text-white block">
                                {item.medicineName}
                              </span>
                              <span className="text-[11px] text-slate-400">
                                أقل سعر بالسوق: <strong className="text-emerald-400 font-mono">{formatCurrency(item.lowestPrice)}</strong> لدى ({item.bestSupplier})
                              </span>
                            </div>
                          </div>

                          {/* Price & Quantity Controls */}
                          {item.isIncluded && (
                            <div className="flex items-center gap-2 self-end sm:self-center">
                              <div>
                                <label className="block text-[10px] text-slate-400 mb-0.5">الكمية:</label>
                                <input
                                  type="number"
                                  min="1"
                                  value={item.quantity}
                                  onChange={e => {
                                    const val = Number(e.target.value);
                                    setInvoiceItemsState(prev => prev.map((it, i) => i === idx ? { ...it, quantity: val } : it));
                                  }}
                                  className="w-16 bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-xs text-center text-teal-400 font-mono font-bold"
                                />
                              </div>

                              <div>
                                <label className="block text-[10px] text-slate-400 mb-0.5">سعر الشراء:</label>
                                <input
                                  type="number"
                                  min="0"
                                  value={item.unitPrice}
                                  onChange={e => {
                                    const val = Number(e.target.value);
                                    setInvoiceItemsState(prev => prev.map((it, i) => i === idx ? { ...it, unitPrice: val } : it));
                                  }}
                                  className="w-24 bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-xs text-center text-white font-mono font-bold focus:border-teal-500"
                                />
                              </div>

                              <div>
                                <label className="block text-[10px] text-slate-400 mb-0.5">بونص:</label>
                                <input
                                  type="text"
                                  placeholder="10+1"
                                  value={item.bonusScheme}
                                  onChange={e => {
                                    const val = e.target.value;
                                    setInvoiceItemsState(prev => prev.map((it, i) => i === idx ? { ...it, bonusScheme: val } : it));
                                  }}
                                  className="w-16 bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-xs text-center text-emerald-400 font-mono"
                                />
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Real-time Price Comparison Alert Banner */}
                        {item.isIncluded && item.unitPrice > 0 && (
                          <div className="mt-2.5 pt-2 border-t border-slate-800/60 flex items-center justify-between text-xs">
                            {isPriceHigher && (
                              <div className="flex items-center gap-1.5 text-rose-400 font-bold">
                                <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
                                <span>
                                  ⚠️ سعر الشراء أعلى من أقل سعر بالسوق بـ +{formatCurrency(diff)} (أقل سعر كان: {formatCurrency(item.lowestPrice)} لدى {item.bestSupplier})
                                </span>
                              </div>
                            )}

                            {isPriceLower && (
                              <div className="flex items-center gap-1.5 text-emerald-400 font-bold">
                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                                <span>
                                  🟢 تم الشراء بسعر أقل / وفرت -{formatCurrency(Math.abs(diff))} مقارنة بأقل سعر سوق!
                                </span>
                              </div>
                            )}

                            {isPriceExact && (
                              <div className="flex items-center gap-1.5 text-teal-400 font-bold">
                                <Check className="w-3.5 h-3.5 text-teal-400" />
                                <span>✓ مطابق لأفضل سعر سوق</span>
                              </div>
                            )}

                            <span className="font-mono text-slate-300 font-bold">
                              الإجمالي: {formatCurrency(item.quantity * item.unitPrice)}
                            </span>
                          </div>
                        )}

                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Invoice Summary Notice */}
              <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 flex items-center justify-between">
                <div>
                  <span className="text-xs text-slate-400 block">إجمالي الفاتورة المحسوب:</span>
                  <span className="text-lg font-black text-emerald-400 font-mono">
                    {formatCurrency(
                      invoiceItemsState
                        .filter(i => i.isIncluded)
                        .reduce((sum, it) => sum + (it.quantity * it.unitPrice), 0)
                    )}
                  </span>
                </div>

                <div className="text-left text-xs text-slate-400">
                  {invoiceItemsState.filter(i => i.isIncluded).length < invoiceItemsState.length ? (
                    <span className="text-indigo-300 font-bold block">
                      ⚡ سيتم تحديث حالة الطلب إلى "طلب جزئي" لوجود بنود متبقية
                    </span>
                  ) : (
                    <span className="text-emerald-300 font-bold block">
                      ✓ سيتم اعتماد الطلب كـ "ناجح ومكتمل 100%"
                    </span>
                  )}
                </div>
              </div>

            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-slate-950 border-t border-slate-800 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setIsPurchaseModalOpen(false)}
                className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold transition-colors"
              >
                إلغاء
              </button>

              <button
                type="button"
                onClick={handleSavePurchase}
                className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-teal-500 to-emerald-500 hover:from-teal-400 hover:to-emerald-400 text-slate-950 text-xs sm:text-sm font-black flex items-center gap-2 shadow-lg shadow-teal-500/20 cursor-pointer"
              >
                <Check className="w-4 h-4" />
                <span>حفظ فاتورة الشراء وتحديث الطلب</span>
              </button>
            </div>

          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 5. CREATE ORDER VIEW (إنشاء طلب صيدلية جديد - بالصور أو النص)              */}
      {/* ========================================================================= */}
      {viewMode === 'create' && (
        <div className="space-y-4">
          
          <div className="flex items-center justify-between pb-2 border-b border-slate-800">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setViewMode('list')}
                className="p-2 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors"
              >
                <ArrowRight className="w-4 h-4" />
              </button>
              <h2 className="text-lg sm:text-xl font-black text-white">
                إضافة طلب صيدلية جديد
              </h2>
            </div>

            <button
              type="button"
              onClick={() => setViewMode('list')}
              className="text-xs text-slate-400 hover:text-white"
            >
              إلغاء وعودة للقائمة
            </button>
          </div>

          {!isReviewed ? (
            <div className="p-4 sm:p-6 rounded-3xl bg-slate-900/90 border border-slate-800 space-y-4">
              
              {/* Pharmacy & Order Info */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">اسم الصيدلية:</label>
                  <input
                    type="text"
                    value={pharmacyName}
                    onChange={e => setPharmacyName(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs sm:text-sm text-white font-bold focus:border-teal-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">رقم الطلب:</label>
                  <input
                    type="text"
                    value={orderNumber}
                    onChange={e => setOrderNumber(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs sm:text-sm text-white font-mono focus:border-teal-500 focus:outline-none"
                  />
                </div>
              </div>

              {/* Mode Selector (Text / Multiple Images / Document) */}
              <div className="flex items-center gap-2 p-1 bg-slate-950 rounded-2xl border border-slate-800 text-xs font-bold">
                <button
                  type="button"
                  onClick={() => setInputMode('text')}
                  className={`flex-1 py-2 rounded-xl transition-colors flex items-center justify-center gap-1.5 cursor-pointer ${
                    inputMode === 'text' ? 'bg-teal-500 text-slate-950 font-black' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <FileText className="w-3.5 h-3.5" />
                  <span>كتابة نص الطلب</span>
                </button>

                <button
                  type="button"
                  onClick={() => setInputMode('camera')}
                  className={`flex-1 py-2 rounded-xl transition-colors flex items-center justify-center gap-1.5 cursor-pointer ${
                    inputMode === 'camera' ? 'bg-teal-500 text-slate-950 font-black' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <Camera className="w-3.5 h-3.5" />
                  <span>رفع صور الطلب (متعدد)</span>
                </button>

                <button
                  type="button"
                  onClick={() => setInputMode('file')}
                  className={`flex-1 py-2 rounded-xl transition-colors flex items-center justify-center gap-1.5 cursor-pointer ${
                    inputMode === 'file' ? 'bg-teal-500 text-slate-950 font-black' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>ملف PDF / إكسل</span>
                </button>
              </div>

              {/* Multiple Images Upload Box */}
              {inputMode === 'camera' && (
                <div className="space-y-3">
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    className="border-2 border-dashed border-slate-800 hover:border-teal-500/60 rounded-3xl p-6 text-center cursor-pointer bg-slate-950/60 hover:bg-slate-950 transition-all group"
                  >
                    <input
                      ref={fileInputRef}
                      type="file"
                      multiple
                      accept="image/*"
                      onChange={handleImageChange}
                      className="hidden"
                    />
                    <div className="w-12 h-12 rounded-2xl bg-slate-900 border border-slate-800 group-hover:border-teal-500/50 flex items-center justify-center mx-auto text-teal-400 mb-2">
                      <Camera className="w-6 h-6" />
                    </div>
                    <p className="text-xs sm:text-sm font-bold text-slate-200">
                      اضغط لاختيار أو تصوير صور الطلبية (يمكنك اختيار أكثر من صورة)
                    </p>
                    <p className="text-[11px] text-slate-500 mt-1">
                      يدعم صور متعددة، كاميرا الموبايل، ولقطات شاشة الواتساب
                    </p>
                  </div>

                  {uploadedImages.length > 0 && (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-2">
                      {uploadedImages.map((img, idx) => (
                        <div key={img.id} className="relative rounded-2xl overflow-hidden border border-slate-700 group aspect-video bg-slate-950">
                          <img src={img.base64} alt={img.name} className="w-full h-full object-cover" />
                          <button
                            type="button"
                            onClick={() => handleRemoveImage(img.id)}
                            className="absolute top-1.5 left-1.5 p-1 bg-rose-500/80 hover:bg-rose-600 text-white rounded-lg text-xs"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                          <span className="absolute bottom-1.5 right-1.5 text-[10px] bg-slate-900/90 text-slate-300 px-1.5 py-0.5 rounded font-mono">
                            صورة #{idx + 1}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Text Input Box */}
              {inputMode === 'text' && (
                <div>
                  <textarea
                    value={orderText}
                    onChange={e => setOrderText(e.target.value)}
                    rows={5}
                    placeholder="مثال:&#10;4 بندول اكسترا&#10;زواجرا 50 عدد 4&#10;لوفر 10 5"
                    className="w-full bg-slate-950 border border-slate-800 rounded-2xl p-3.5 text-xs sm:text-sm text-slate-200 font-mono focus:outline-none focus:border-teal-500"
                  />
                </div>
              )}

              {/* Document File Input Box */}
              {inputMode === 'file' && (
                <div>
                  <input
                    ref={docInputRef}
                    type="file"
                    accept=".pdf,.xlsx,.xls,.csv"
                    onChange={handleDocumentChange}
                    className="hidden"
                  />
                  <div
                    onClick={() => docInputRef.current?.click()}
                    className="border-2 border-dashed border-slate-800 hover:border-teal-500/60 rounded-3xl p-6 text-center cursor-pointer bg-slate-950/60"
                  >
                    <Upload className="w-8 h-8 text-teal-400 mx-auto mb-2" />
                    <span className="text-xs sm:text-sm font-bold text-slate-200 block">
                      {fileName || 'اختر ملف PDF أو جدول Excel لاستخراج الأصناف'}
                    </span>
                  </div>
                </div>
              )}

              {analysisError && (
                <p className="text-xs text-rose-400 font-bold">{analysisError}</p>
              )}

              {isAnalyzing && parseProgress > 0 && (
                <div className="space-y-1.5 bg-teal-950/40 p-3 rounded-2xl border border-teal-500/30">
                  <div className="flex items-center justify-between text-xs font-bold text-teal-300">
                    <span>جاري تحليل وفك الروشتة والأصناف بالذكاء الاصطناعي...</span>
                    <span className="font-mono text-teal-400 font-black">{parseProgress}%</span>
                  </div>
                  <div className="w-full h-2 bg-slate-950 rounded-full overflow-hidden p-0.5 border border-slate-800">
                    <div 
                      className="h-full bg-gradient-to-r from-teal-500 to-emerald-400 rounded-full transition-all duration-300"
                      style={{ width: `${parseProgress}%` }}
                    />
                  </div>
                </div>
              )}

              <button
                type="button"
                onClick={handleParseAndReview}
                disabled={isAnalyzing}
                className="w-full py-3.5 rounded-2xl bg-teal-500 hover:bg-teal-400 disabled:opacity-50 text-slate-950 font-black text-xs sm:text-sm flex items-center justify-center gap-2 shadow-lg shadow-teal-500/20 cursor-pointer"
              >
                {isAnalyzing ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>جاري استخراج الأصناف والكميات ({parseProgress || 35}%)...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    <span>استخراج الأصناف ومطابقة الأسماء للمراجعة</span>
                  </>
                )}
              </button>

            </div>
          ) : (
            /* Review and Confirm Stage */
            <div className="space-y-4">
              
              {/* Duplicate Banner */}
              {duplicateBanner && (
                <div className="p-3.5 rounded-2xl bg-teal-500/10 border border-teal-500/30 text-teal-300 text-xs flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-teal-400 shrink-0" />
                  <span>
                    تم دمج تكرار الصنف <strong>"{duplicateBanner.name}"</strong> تلقائياً: ({duplicateBanner.originalCounts.join(' + ')}) = <strong>{duplicateBanner.sum}</strong>
                  </span>
                </div>
              )}

              {/* Order Overview & Price Recognition Stats */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                <div className="p-3 rounded-2xl bg-slate-900/90 border border-slate-800 text-center">
                  <span className="text-[11px] font-bold text-slate-400 block mb-0.5">إجمالي الأصناف المستخرجة</span>
                  <span className="text-base font-black text-white font-mono">{parsedItems.length}</span>
                </div>

                <div className="p-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-center">
                  <span className="text-[11px] font-bold text-emerald-300 block mb-0.5">أصناف تم التعرف على أسعارها</span>
                  <span className="text-base font-black text-emerald-400 font-mono">
                    {parsedItems.filter(i => (i.bestMarketPrice || 0) > 0).length}
                  </span>
                </div>

                <div className="p-3 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-center">
                  <span className="text-[11px] font-bold text-amber-300 block mb-0.5">أصناف جديدة بدون سعر</span>
                  <span className="text-base font-black text-amber-400 font-mono">
                    {parsedItems.filter(i => (!i.bestMarketPrice || i.bestMarketPrice <= 0)).length}
                  </span>
                </div>

                <div className="p-3 rounded-2xl bg-teal-500/10 border border-teal-500/30 text-center">
                  <span className="text-[11px] font-bold text-teal-300 block mb-0.5">إجمالي التكلفة التقديرية</span>
                  <span className="text-base font-black text-teal-400 font-mono">
                    {parsedItems.reduce((acc, it) => acc + (it.quantity * (it.bestMarketPrice || 0)), 0).toLocaleString()} <span className="text-[10px]">ريال</span>
                  </span>
                </div>
              </div>

              {/* Filtering, Search and Auto-Clean Toolbar for Review List */}
              <div className="p-3 rounded-2xl bg-slate-900/80 border border-slate-800 flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <button
                    type="button"
                    onClick={() => setReviewFilter('all')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors ${
                      reviewFilter === 'all'
                        ? 'bg-teal-500 text-slate-950 shadow-md shadow-teal-500/20'
                        : 'bg-slate-950 text-slate-400 hover:text-white border border-slate-800'
                    }`}
                  >
                    الكل ({parsedItems.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setReviewFilter('priced')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors ${
                      reviewFilter === 'priced'
                        ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/20'
                        : 'bg-slate-950 text-slate-400 hover:text-white border border-slate-800'
                    }`}
                  >
                    مسجلة بأسعار ({parsedItems.filter(i => (i.bestMarketPrice || 0) > 0).length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setReviewFilter('unpriced')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors ${
                      reviewFilter === 'unpriced'
                        ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                        : 'bg-slate-950 text-slate-400 hover:text-white border border-slate-800'
                    }`}
                  >
                    أصناف جديدة ({parsedItems.filter(i => (!i.bestMarketPrice || i.bestMarketPrice <= 0)).length})
                  </button>

                  <button
                    type="button"
                    onClick={handleAutoCleanAllParsedItems}
                    className="px-3 py-1.5 rounded-xl bg-teal-500/15 hover:bg-teal-500/25 border border-teal-500/30 text-teal-300 text-xs font-bold transition-colors flex items-center gap-1.5 cursor-pointer shadow-sm mr-auto sm:mr-0"
                    title="تنقية وتنسيق أسماء كافة الأصناف المستخرجة وتوحيد صيغ التركيز والشكل الصيدلاني"
                  >
                    <Wand2 className="w-3.5 h-3.5 text-teal-400" />
                    <span>تنقية وتنسيق كافة الأسماء</span>
                  </button>
                </div>

                <div className="relative w-full lg:w-64">
                  <Search className="w-3.5 h-3.5 absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={reviewSearch}
                    onChange={e => setReviewSearch(e.target.value)}
                    placeholder="بحث في الأصناف المستخرجة..."
                    className="w-full bg-slate-950 border border-slate-800 focus:border-teal-500/50 rounded-xl pr-8 pl-3 py-1.5 text-xs text-white placeholder:text-slate-500 focus:outline-none"
                  />
                </div>
              </div>

              {/* Image Preview for Verification */}
              <ImageComparisonHeader
                images={uploadedImages}
                rawText={inputMode === 'text' ? orderText : undefined}
                title="معاينة صور الطلب الأصلية للمطابقة"
                subtitle="طابق الأصناف المستخرجة أدناه مع صورة الطلب المرفقة بالأعلى للتأكد من صحة الأسماء المستخرجة"
              />

              {/* Extracted Items Confirmation List */}
              <div className="space-y-3">
                {parsedItems
                  .filter(item => {
                    const matchesSearch = !reviewSearch.trim() ||
                      item.matchedMedicineName.toLowerCase().includes(reviewSearch.toLowerCase()) ||
                      item.rawText.toLowerCase().includes(reviewSearch.toLowerCase());
                    if (!matchesSearch) return false;
                    if (reviewFilter === 'priced') return (item.bestMarketPrice || 0) > 0;
                    if (reviewFilter === 'unpriced') return !item.bestMarketPrice || item.bestMarketPrice <= 0;
                    return true;
                  })
                  .map((item, index) => {
                  const similarity = findSimilarMedicine(item.matchedMedicineName, knownMedicines);
                  const isNear = similarity && similarity.isNearMatch && similarity.existingMedicine.name !== item.matchedMedicineName;
                  const isExact = similarity && similarity.isExact;
                  const attributes = extractMedicineAttributes(item.matchedMedicineName);
                  const rawAttributes = extractMedicineAttributes(item.rawText);
                  const hasPrice = item.bestMarketPrice && item.bestMarketPrice > 0;
                  const itemEstimatedTotal = (item.bestMarketPrice || 0) * item.quantity;

                  return (
                    <div
                      key={item.id}
                      className="p-4 rounded-3xl bg-slate-900/90 border border-slate-800 space-y-3 hover:border-slate-700 transition-colors"
                    >
                      <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
                        <div className="md:col-span-5 bg-slate-950 p-3 rounded-2xl border border-slate-800 space-y-1.5">
                          <span className="text-[11px] font-bold text-slate-400 block">الاسم المكتوب / المستخرج:</span>
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-xs sm:text-sm font-mono text-slate-200 font-bold">"{item.rawText}"</p>
                            {rawAttributes.strengthBadge && (
                              <span className="px-2 py-0.5 rounded-lg bg-slate-800 text-slate-300 text-[10px] font-mono font-bold">
                                {rawAttributes.strengthBadge}
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="hidden md:flex md:col-span-1 justify-center text-teal-400">
                          <ArrowRight className="w-4 h-4 rotate-180" />
                        </div>

                        <div className="md:col-span-6 bg-slate-950 p-3 rounded-2xl border border-teal-500/30 space-y-2">
                          <div className="flex items-center justify-between flex-wrap gap-1">
                            <span className="text-[11px] font-bold text-teal-300 flex items-center gap-1">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              الاسم المعتمد في التطبيق:
                            </span>
                            <div className="flex items-center gap-1.5">
                              {isExact && (
                                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-500/30">
                                  مطابق لمعيار النظام 100%
                                </span>
                              )}
                              {isNear && (
                                <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 font-bold border border-amber-500/30">
                                  مشابه لقاعدة الأدوية
                                </span>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            <input
                              type="text"
                              list={`med-list-${item.id}`}
                              value={item.matchedMedicineName}
                              onChange={e => handleChangeAdoptedName(item.id, e.target.value)}
                              className="w-full bg-slate-900 border border-slate-700 focus:border-teal-400 rounded-xl px-2.5 py-1.5 text-xs sm:text-sm text-white font-bold focus:outline-none"
                            />
                            {attributes.strengthBadge && (
                              <span className="shrink-0 px-2 py-1 rounded-lg bg-teal-500/15 border border-teal-500/30 text-teal-300 text-[10px] font-mono font-bold">
                                {attributes.strengthBadge}
                              </span>
                            )}
                            {attributes.formBadge && (
                              <span className="shrink-0 px-2 py-1 rounded-lg bg-indigo-500/15 border border-indigo-500/30 text-indigo-300 text-[10px] font-bold">
                                {attributes.formBadge}
                              </span>
                            )}
                          </div>
                          <datalist id={`med-list-${item.id}`}>
                            {knownMedicines.map(m => (
                              <option key={m.id} value={m.name} />
                            ))}
                          </datalist>
                        </div>
                      </div>

                      {/* Similar Medicines Suggestions Strip */}
                      {(() => {
                        const suggestions = findTopSimilarMedicines(item.rawText || item.matchedMedicineName, knownMedicines, 3, 0.45);
                        // Filter out exact match if already adopted
                        const relevantSuggestions = suggestions.filter(s => s.medicine.name.trim().toLowerCase() !== item.matchedMedicineName.trim().toLowerCase());
                        if (relevantSuggestions.length === 0) return null;

                        return (
                          <div className="p-2.5 rounded-2xl bg-slate-950/90 border border-amber-500/20 space-y-1.5">
                            <span className="text-[11px] font-bold text-amber-300 flex items-center gap-1.5">
                              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                              أصناف مشابهة ومقترحة من قاعدة الأسعار:
                            </span>
                            <div className="flex items-center gap-1.5 flex-wrap">
                              {relevantSuggestions.map((sug, sIdx) => {
                                const sugSummary = computeMedicinePriceSummary(sug.medicine.id, sug.medicine.name, marketPrices, knownMedicines);
                                return (
                                  <button
                                    key={sIdx}
                                    type="button"
                                    onClick={() => {
                                      handleChangeAdoptedName(item.id, sug.medicine.name);
                                      if (sug.medicine.id && item.rawText) {
                                        Storage.addAliasToMedicine(sug.medicine.id, item.rawText);
                                      }
                                    }}
                                    className="px-2.5 py-1 rounded-xl bg-slate-900 hover:bg-slate-850 border border-slate-700 hover:border-teal-500/60 text-slate-200 hover:text-teal-300 text-[11px] font-bold transition-all cursor-pointer flex items-center gap-1.5 group shadow-sm active:scale-95"
                                    title="اضغط لاختيار هذا الصنف وتثبيته كاسم معتمد"
                                  >
                                    <span>{sug.medicine.name}</span>
                                    {sugSummary && sugSummary.lowestPrice > 0 ? (
                                      <span className="text-[10px] text-emerald-400 font-mono font-bold">
                                        ({sugSummary.lowestPrice.toLocaleString()} ريال)
                                      </span>
                                    ) : (
                                      <span className="text-[10px] text-slate-400 font-mono">
                                        (تطابق {Math.round(sug.similarityScore * 100)}%)
                                      </span>
                                    )}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })()}

                      {/* Alias learning confirmation indicator */}
                      {item.rawText && item.matchedMedicineName && item.rawText.trim().toLowerCase() !== item.matchedMedicineName.trim().toLowerCase() && (
                        <div className="px-3 py-1.5 rounded-xl bg-teal-500/10 border border-teal-500/20 text-teal-300 text-[11px] flex items-center justify-between">
                          <span className="flex items-center gap-1.5">
                            <Check className="w-3.5 h-3.5 text-teal-400" />
                            <span>سيتم حفظ "{item.rawText}" كاسم مرادف دائم للصنف "{item.matchedMedicineName}"</span>
                          </span>
                          <span className="text-[10px] text-slate-400">حفظ تلقائي</span>
                        </div>
                      )}

                      {/* Price Comparison & Market Summary Box */}
                      <div className={`p-2.5 rounded-2xl border text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2 ${
                        hasPrice
                          ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300'
                          : 'bg-amber-500/5 border-amber-500/20 text-amber-300/80'
                      }`}>
                        <div className="flex items-center gap-2 flex-wrap">
                          {hasPrice ? (
                            <>
                              <span className="font-bold flex items-center gap-1 text-emerald-400">
                                <DollarSign className="w-3.5 h-3.5" />
                                أقل سعر مسجل بالسوق: <strong className="font-mono text-white text-sm">{item.bestMarketPrice?.toLocaleString()} ريال</strong>
                              </span>
                              {item.bestSupplierName && (
                                <span className="text-slate-400 text-[11px]">
                                  لدى ({item.bestSupplierName})
                                </span>
                              )}
                            </>
                          ) : (
                            <span className="text-amber-400/90 text-[11px] flex items-center gap-1">
                              <AlertCircle className="w-3.5 h-3.5" />
                              صنف جديد: لم تسجل له أسعار سابقة (سيتم حفظ سعره تلقائياً عند إنشاء فاتورة الشراء)
                            </span>
                          )}
                        </div>

                        {hasPrice && (
                          <div className="text-left font-mono font-bold text-teal-300 text-xs">
                            الإجمالي التقديري: {itemEstimatedTotal.toLocaleString()} ريال
                          </div>
                        )}
                      </div>

                      <div className="flex items-center justify-between pt-2 border-t border-slate-800 text-xs">
                        <span className="font-mono text-slate-500">بند #{index + 1}</span>

                        <div className="flex items-center gap-2">
                          <span className="text-slate-400">الكمية:</span>
                          <div className="flex items-center gap-1 bg-slate-950 border border-slate-800 rounded-xl p-1">
                            <button
                              type="button"
                              onClick={() => updateQuantity(item.id, -1)}
                              className="p-1 rounded-lg text-slate-300 hover:text-white"
                            >
                              <Minus className="w-3 h-3" />
                            </button>
                            <span className="w-8 text-center font-bold text-teal-400 font-mono">
                              {item.quantity}
                            </span>
                            <button
                              type="button"
                              onClick={() => updateQuantity(item.id, 1)}
                              className="p-1 rounded-lg text-slate-300 hover:text-white"
                            >
                              <Plus className="w-3 h-3" />
                            </button>
                          </div>

                          <button
                            type="button"
                            onClick={() => handleDeleteItem(item.id)}
                            className="p-1.5 text-slate-500 hover:text-rose-400"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Add manual row */}
              <div className="text-center">
                <button
                  type="button"
                  onClick={handleAddManualRow}
                  className="px-4 py-2 rounded-2xl bg-slate-900 text-slate-300 text-xs font-bold border border-slate-800 hover:bg-slate-800"
                >
                  + إضافة صنف إضافي
                </button>
              </div>

              {/* Approve & Save Order Button */}
              <div className="p-4 bg-slate-950 rounded-3xl border border-teal-500/30 flex flex-col sm:flex-row items-center justify-between gap-3">
                <div>
                  <span className="text-xs font-bold text-white block">
                    إجمالي الأصناف المعتمدة: <strong className="text-teal-400">{parsedItems.length} أصناف</strong>
                  </span>
                  <span className="text-[11px] text-slate-400">
                    سيتم حفظ الطلب وإضافته لقائمة الطلبيات
                  </span>
                </div>

                <button
                  type="button"
                  onClick={handleApproveOrder}
                  className="w-full sm:w-auto px-6 py-3 rounded-2xl bg-teal-500 hover:bg-teal-400 text-slate-950 font-black text-xs sm:text-sm flex items-center justify-center gap-2 shadow-lg shadow-teal-500/20 cursor-pointer"
                >
                  <Check className="w-4 h-4" />
                  <span>اعتماد وحفظ الطلب</span>
                </button>
              </div>

            </div>
          )}

        </div>
      )}

      {/* SIMILARITY RESOLUTION MODAL */}
      <SimilarityResolutionModal
        conflicts={similarityConflicts}
        isOpen={showSimilarityModal}
        onResolve={handleApplyResolutions}
        onClose={() => setShowSimilarityModal(false)}
      />

    </div>
  );
};
