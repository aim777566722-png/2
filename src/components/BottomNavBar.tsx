import React from 'react';
import { 
  LayoutDashboard, 
  ShoppingCart, 
  Layers, 
  Building2, 
  MoreHorizontal,
  FileUp,
  Plus
} from 'lucide-react';

export type NavTab = 'dashboard' | 'orders' | 'market-prices' | 'suppliers' | 'more' | 'document-upload';

interface BottomNavBarProps {
  activeTab: string;
  onSelectTab?: (tab: string) => void;
  onTabChange?: (tab: string) => void;
  ordersBadgeCount?: number;
  ordersBadge?: number;
  alertsBadgeCount?: number;
  alertsBadge?: number;
  onQuickScan?: () => void;
}

export const BottomNavBar: React.FC<BottomNavBarProps> = ({
  activeTab,
  onSelectTab,
  onTabChange,
  ordersBadgeCount,
  ordersBadge,
  alertsBadgeCount,
  alertsBadge,
  onQuickScan
}) => {
  const triggerNavigation = (tab: string) => {
    if (onSelectTab) onSelectTab(tab);
    if (onTabChange) onTabChange(tab);
  };

  const finalOrdersBadge = ordersBadgeCount ?? ordersBadge ?? 0;
  const finalAlertsBadge = alertsBadgeCount ?? alertsBadge ?? 0;

  const navItems = [
    {
      id: 'dashboard',
      label: 'الرئيسية',
      icon: LayoutDashboard,
      badge: 0
    },
    {
      id: 'orders',
      label: 'الطلبات',
      icon: ShoppingCart,
      badge: finalOrdersBadge
    },
    {
      id: 'document-upload',
      label: 'رفع وثائق',
      icon: FileUp,
      badge: 0,
      highlight: true
    },
    {
      id: 'market-prices',
      label: 'الأسعار',
      icon: Layers,
      badge: 0
    },
    {
      id: 'more',
      label: 'المزيد',
      icon: MoreHorizontal,
      badge: finalAlertsBadge
    }
  ];

  // Determine if active tab belongs to one of the categories
  const getMappedTab = (tab: string): string => {
    if (tab === 'order-intake' || tab === 'price-comparison') return 'orders';
    if (tab === 'invoice-intake' || tab === 'reconciliation' || tab === 'android-info' || tab === 'suppliers') return 'more';
    if (tab === 'doc-scanner') return 'document-upload';
    return tab || 'dashboard';
  };

  const currentActive = getMappedTab(activeTab);

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 bg-slate-950/95 backdrop-blur-md border-t border-slate-800 shadow-2xl py-1.5 px-3 max-w-lg mx-auto md:max-w-2xl lg:max-w-4xl rounded-t-3xl transition-all">
      <nav className="flex items-center justify-around gap-1" dir="rtl">
        {navItems.map(item => {
          const Icon = item.icon;
          const isActive = currentActive === item.id;

          return (
            <button
              key={item.id}
              id={`nav-item-${item.id}`}
              onClick={() => triggerNavigation(item.id)}
              className={`relative flex flex-col items-center justify-center flex-1 py-1 px-1 rounded-2xl transition-all duration-200 cursor-pointer select-none group ${
                isActive
                  ? 'text-teal-400 font-bold'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
              }`}
            >
              {/* Active Indicator Pill or Center Special Button */}
              <div
                className={`relative px-3.5 py-1 rounded-full transition-all duration-200 flex items-center justify-center ${
                  item.highlight
                    ? isActive 
                      ? 'bg-gradient-to-r from-teal-500 to-emerald-500 text-slate-950 shadow-md font-bold'
                      : 'bg-teal-500/15 text-teal-300 border border-teal-500/30'
                    : isActive
                    ? 'bg-teal-500/15 text-teal-400 shadow-sm ring-1 ring-teal-500/30'
                    : 'bg-transparent text-slate-400 group-hover:text-slate-300'
                }`}
              >
                <Icon className={`w-5 h-5 transition-transform duration-200 ${isActive ? 'scale-110' : ''}`} />

                {/* Badge Notification */}
                {item.badge > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center border-2 border-slate-950 shadow-sm animate-pulse">
                    {item.badge > 9 ? '+9' : item.badge}
                  </span>
                )}
              </div>

              {/* Label */}
              <span className={`text-[11px] mt-0.5 tracking-tight transition-all duration-200 whitespace-nowrap ${
                isActive ? 'font-bold text-teal-300' : 'font-medium text-slate-400'
              }`}>
                {item.label}
              </span>
            </button>
          );
        })}
      </nav>
    </div>
  );
};
