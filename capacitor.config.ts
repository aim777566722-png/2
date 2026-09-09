import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.pharmacy.purchasemate',
  appName: 'مساعد المشتريات',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
    // All configured API endpoints are HTTPS; do not permit clear-text traffic.
    cleartext: false
  },
  plugins: {
    CapacitorHttp: {
      enabled: true
    }
  }
};

export default config;
