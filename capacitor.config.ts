import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.app.CatalogListPro',
  appName: 'CatalogListPro',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
    // Uncomment below for local development testing
    // url: 'http://192.168.1.100:5173',
    // cleartext: true
  },
  plugins: {
    Camera: {
      // Camera plugin is ready to use
    },
  },
};

export default config;