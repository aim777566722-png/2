import React, { useState } from 'react';
import { Supplier, MarketPriceRecord, PurchaseInvoice } from '../types';
import { 
  Building2, 
  Phone, 
  MapPin, 
  Star, 
  Plus, 
  Receipt, 
  Layers, 
  Check, 
  TrendingDown,
  Search,
  PlusCircle,
  X,
  MessageCircle,
  ExternalLink
} from 'lucide-react';
import { formatCurrency } from '../utils/helpers';

interface SuppliersProps {
  suppliers: Supplier[];
  marketPrices: MarketPriceRecord[];
  invoices: PurchaseInvoice[];
  onAddSupplier: (supplier: Supplier) => void;
}

export const SuppliersView: React.FC<SuppliersProps> = ({
  suppliers,
  marketPrices,
  invoices,
  onAddSupplier
}) => {
  const [isAdding, setIsAdding] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [notes, setNotes] = useState('');

  const filteredSuppliers = suppliers.filter(sup => 
    sup.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (sup.address && sup.address.toLowerCase().includes(searchQuery.toLowerCase())) ||
    (sup.phone && sup.phone.includes(searchQuery))
  );

  const handleSave = () => {
    if (!name.trim()) {
      alert('يرجى إدخال اسم المورد أو المستودع');
      return;
    }

    const newSupplier: Supplier = {
      id: `sup-${Date.now()}`,
      name,
      phone,
      address,
      notes,
      rating: 4.8,
      createdDate: new Date().toISOString().split('T')[0]
    };

    onAddSupplier(newSupplier);
    setIsAdding(false);
    setName('');
    setPhone('');
    setAddress('');
    setNotes('');
  };

  return (
    <div className="space-y-6 pb-20 max-w-5xl mx-auto" dir="rtl">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-white flex items-center gap-2">
            <Building2 className="w-6 h-6 text-teal-400" />
            <span>دليل الموردين ومستودعات الأدوية</span>
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            إدارة مستودعات الأدوية وشركات التوزيع ومتابعة فواتيرها وسجل أسعارها
          </p>
        </div>

        <button
          onClick={() => setIsAdding(true)}
          className="px-4 py-2.5 rounded-2xl bg-teal-500 hover:bg-teal-400 text-slate-950 font-black text-xs sm:text-sm flex items-center gap-2 shadow-md cursor-pointer transition-all active:scale-95 self-start sm:self-auto"
        >
          <PlusCircle className="w-4 h-4" />
          <span>+ إضافة مورد جديد</span>
        </button>
      </div>

      {/* Search Bar */}
      <div className="relative bg-slate-900/80 p-3.5 rounded-2xl border border-slate-800">
        <Search className="w-4 h-4 absolute right-6 top-1/2 -translate-y-1/2 text-slate-500" />
        <input
          type="text"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          placeholder="ابحث عن مورد، مستودع، أو رقم هاتف..."
          className="w-full bg-slate-950 border border-slate-800 rounded-xl pr-10 pl-3.5 py-2 text-xs sm:text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-teal-500"
        />
      </div>

      {/* Suppliers Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredSuppliers.length === 0 ? (
          <div className="col-span-3 text-center py-16 bg-slate-900/40 rounded-3xl border border-slate-800/80 space-y-3">
            <Building2 className="w-12 h-12 mx-auto text-slate-600" />
            <p className="text-sm font-bold text-slate-300">لم يتم العثور على موردين مطابقين للبحث</p>
            <button
              onClick={() => setIsAdding(true)}
              className="px-4 py-2 rounded-xl bg-teal-500/15 text-teal-300 font-bold text-xs border border-teal-500/30 cursor-pointer"
            >
              + إضافة مورد الآن
            </button>
          </div>
        ) : (
          filteredSuppliers.map(sup => {
            const supNameClean = String(sup.name || '').trim().toLowerCase();
            const supPrices = marketPrices.filter(p => (sup.id && p.supplierId === sup.id) || (supNameClean && String(p.supplierName || '').trim().toLowerCase() === supNameClean));
            const supInvoices = invoices.filter(i => (sup.id && i.supplierId === sup.id) || (supNameClean && String(i.supplierName || '').trim().toLowerCase() === supNameClean));

            return (
              <div
                key={sup.id}
                className="bg-slate-900/90 border border-slate-800 hover:border-teal-500/40 rounded-3xl p-5 transition-all flex flex-col justify-between space-y-4 shadow-sm"
              >
                <div className="space-y-3">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="p-2.5 rounded-2xl bg-teal-500/10 text-teal-400 border border-teal-500/20">
                        <Building2 className="w-5 h-5" />
                      </div>
                      <div>
                        <h3 className="font-bold text-sm sm:text-base text-white">{sup.name}</h3>
                        <div className="flex items-center gap-1 text-xs text-amber-400 mt-0.5 font-bold">
                          <Star className="w-3.5 h-3.5 fill-amber-400" />
                          <span>{sup.rating || 4.8}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-1.5 text-xs text-slate-400">
                    {sup.phone && (
                      <div className="flex items-center justify-between bg-slate-950/60 p-2 rounded-xl border border-slate-800/80">
                        <div className="flex items-center gap-2">
                          <Phone className="w-3.5 h-3.5 text-slate-500" />
                          <span className="font-mono text-slate-200">{sup.phone}</span>
                        </div>
                        <a
                          href={`tel:${sup.phone}`}
                          className="text-[11px] text-teal-400 hover:underline font-bold"
                        >
                          اتصال
                        </a>
                      </div>
                    )}

                    {sup.address && (
                      <div className="flex items-center gap-2 pt-1">
                        <MapPin className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                        <span className="truncate">{sup.address}</span>
                      </div>
                    )}

                    {sup.notes && (
                      <p className="text-[11px] text-slate-400 bg-slate-950/40 p-2.5 rounded-xl border border-slate-800/60">
                        {sup.notes}
                      </p>
                    )}
                  </div>
                </div>

                {/* Stats Footer */}
                <div className="bg-slate-950/80 p-3 rounded-2xl border border-slate-800 grid grid-cols-2 gap-2 text-center text-xs">
                  <div>
                    <div className="text-[10px] text-slate-400">أسعار مسجلة بالسوق</div>
                    <div className="font-black text-teal-400 mt-0.5 font-mono">{supPrices.length} تسعيرة</div>
                  </div>

                  <div className="border-r border-slate-800">
                    <div className="text-[10px] text-slate-400">فواتير شراء</div>
                    <div className="font-black text-emerald-400 mt-0.5 font-mono">{supInvoices.length} فواتير</div>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Add Modal */}
      {isAdding && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-150" dir="rtl">
          <div className="w-full max-w-md bg-slate-900 border border-slate-700 rounded-3xl shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <Building2 className="w-5 h-5 text-teal-400" />
                <span>إضافة مورد أو مستودع أدوية جديد</span>
              </h2>
              <button onClick={() => setIsAdding(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-300 mb-1">اسم المورد / المستودع *</label>
                <input
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="مثال: شركة الرعاية الدوائية"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-slate-100 text-sm focus:outline-none focus:border-teal-500"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-300 mb-1">رقم الهاتف / الواتساب</label>
                <input
                  type="text"
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  placeholder="مثال: 0551234567"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-slate-100 font-mono text-sm focus:outline-none focus:border-teal-500"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-300 mb-1">العنوان / المدينة</label>
                <input
                  type="text"
                  value={address}
                  onChange={e => setAddress(e.target.value)}
                  placeholder="مثال: الرياض - حي السلي"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-slate-100 text-sm focus:outline-none focus:border-teal-500"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-300 mb-1">ملاحظات وشروط الدفع / الخصومات</label>
                <textarea
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  rows={2}
                  placeholder="مثال: خصم 2% عند السداد النقدي، توصيل مجاني للطلبات فوق 5000 ريال"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-slate-100 text-sm focus:outline-none focus:border-teal-500"
                />
              </div>
            </div>

            <div className="pt-2 flex items-center justify-end gap-2">
              <button
                onClick={() => setIsAdding(false)}
                className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 text-xs hover:bg-slate-700 cursor-pointer"
              >
                إلغاء
              </button>
              <button
                onClick={handleSave}
                className="px-5 py-2.5 rounded-xl bg-teal-500 text-slate-950 font-bold text-xs hover:bg-teal-400 cursor-pointer"
              >
                حفظ المورد
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
