import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Home, ShieldAlert } from 'lucide-react';

export interface ErrorBoundaryProps {
  children: ReactNode;
}

export interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  public state: ErrorBoundaryState = {
    hasError: false,
    error: null,
    errorInfo: null,
  };

  public static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('Uncaught error caught by ErrorBoundary:', error, errorInfo);
    this.setState({ error, errorInfo });
  }

  private handleReload = () => {
    window.location.reload();
  };

  private handleResetToHome = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
    window.location.href = '/';
  };

  public render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div 
          className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-4 selection:bg-teal-500 selection:text-slate-950" 
          dir="rtl"
        >
          <div className="w-full max-w-md bg-slate-900/90 border border-slate-800 rounded-3xl p-6 sm:p-8 text-center space-y-6 shadow-2xl backdrop-blur-xl">
            <div className="w-16 h-16 rounded-3xl bg-rose-500/10 border border-rose-500/20 text-rose-400 mx-auto flex items-center justify-center shadow-lg shadow-rose-500/5">
              <AlertTriangle className="w-8 h-8" />
            </div>

            <div className="space-y-2">
              <h1 className="text-xl sm:text-2xl font-black text-white">عذراً، حدث خطأ غير متوقع</h1>
              <p className="text-xs sm:text-sm text-slate-400 leading-relaxed">
                واجه التطبيق مشكلة مؤقتة في عرض الصفحة. بياناتك ومستنداتك محفوظة بأمان في قاعدة البيانات المحلية.
              </p>
            </div>

            {this.state.error && (
              <div className="p-3 bg-slate-950/80 rounded-2xl border border-slate-800 text-right overflow-hidden">
                <div className="text-[11px] font-mono text-rose-400 truncate dir-ltr">
                  {this.state.error.toString()}
                </div>
              </div>
            )}

            <div className="flex flex-col sm:flex-row gap-3 pt-2">
              <button
                onClick={this.handleReload}
                className="flex-1 py-3 px-4 rounded-2xl bg-gradient-to-r from-teal-500 to-emerald-500 hover:from-teal-400 hover:to-emerald-400 text-slate-950 font-bold text-sm flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-teal-500/20 active:scale-95 transition-all"
              >
                <RefreshCw className="w-4 h-4" />
                <span>إعادة التحميل</span>
              </button>

              <button
                onClick={this.handleResetToHome}
                className="py-3 px-4 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-sm flex items-center justify-center gap-2 cursor-pointer border border-slate-700 active:scale-95 transition-all"
              >
                <Home className="w-4 h-4" />
                <span>الرئيسية</span>
              </button>
            </div>

            <div className="pt-2 text-[11px] text-slate-500 flex items-center justify-center gap-1.5 border-t border-slate-800/80">
              <ShieldAlert className="w-3.5 h-3.5 text-teal-400" />
              <span>مساعد المشتريات — حماية واستعادة الحالة</span>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
