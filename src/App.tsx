// src/App.tsx
// FALLBACK VERSION: Works with or without isPasswordRecovery in AppContext
// FIXED: Non-blocking sync, all TypeScript errors resolved

import { useState, useEffect, useRef } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AppProvider, useApp } from './context/AppContext';
import { FooterProvider } from './context/FooterContext';
import Auth from './components/Auth';
import CompanySetup from './components/CompanySetup';
import Dashboard from './components/Dashboard';
import SaleDetail from './components/SaleDetail';
import LotDetail from './components/LotDetail';
import Header from './components/Header';
import ContextFooter from './components/Contextfooter';
import ConnectivityService from './services/ConnectivityService';
import SyncService from './services/SyncService';
import { RefreshCw, AlertCircle, CheckCircle2 } from 'lucide-react';

function AppContent() {
  // Get context - use try-catch to handle missing properties gracefully
  const context = useApp();
  const { 
    user, 
    loading, 
    currentCompany, 
    companySwitched, 
    setCompanySwitched
  } = context;
  
  // Safely access isPasswordRecovery if it exists
  const isPasswordRecovery = 'isPasswordRecovery' in context ? context.isPasswordRecovery : false;
  
  const [syncing, setSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState({ stage: '', current: 0, total: 0 });
  const [syncError, setSyncError] = useState<string | null>(null);
  const [showSyncBanner, setShowSyncBanner] = useState(false);
  
  // Fixed: Added proper types and initial values
  const syncTimeoutRef = useRef<NodeJS.Timeout | undefined>(undefined);
  const hasPerformedInitialSync = useRef<boolean>(false);

  // Background sync on initial load or company switch (NON-BLOCKING)
  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    let isMounted = true;

    const performBackgroundSync = async () => {
      // Skip if no user or company
      if (!user || !currentCompany) return;

      // Skip if in password recovery mode (if that property exists)
      if (isPasswordRecovery) {
        console.log('🔐 Password recovery mode - skipping sync');
        return;
      }

      // Skip if already synced this session and company hasn't changed
      if (hasPerformedInitialSync.current && !companySwitched) return;

      const isOnline = ConnectivityService.getConnectionStatus();
      if (!isOnline) {
        console.log('🔴 Offline - skipping sync');
        hasPerformedInitialSync.current = true;
        setCompanySwitched(false);
        return;
      }

      try {
        if (companySwitched) {
          console.log(`🔄 Company switched to: ${currentCompany.name}`);
          setShowSyncBanner(true);
        } else {
          console.log('🚀 App opened - starting background sync...');
          setShowSyncBanner(true);
        }

        if (!isMounted) return;
        setSyncing(true);
        setSyncError(null);

        // Set sync timeout (30 seconds)
        syncTimeoutRef.current = setTimeout(() => {
          if (isMounted) {
            console.warn('⚠️ Sync timeout - continuing with cached data');
            setSyncError('Sync is taking longer than expected. Using cached data.');
            setSyncing(false);
            hasPerformedInitialSync.current = true;
            setCompanySwitched(false);
          }
        }, 30000);

        // Subscribe to progress updates
        unsubscribe = SyncService.onProgressChange((progress) => {
          if (isMounted) {
            setSyncProgress(progress);
          }
        });

        // Perform priority sync with timeout protection
        await Promise.race([
          SyncService.performInitialSync(currentCompany.id),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Sync timeout')), 30000)
          )
        ]);

        if (syncTimeoutRef.current) {
          clearTimeout(syncTimeoutRef.current);
        }

        if (isMounted) {
          console.log('✅ Sync complete');
          hasPerformedInitialSync.current = true;
          setCompanySwitched(false);
          setSyncing(false);
          
          // Hide banner after 2 seconds
          setTimeout(() => {
            if (isMounted) {
              setShowSyncBanner(false);
            }
          }, 2000);
        }
      } catch (error) {
        if (syncTimeoutRef.current) {
          clearTimeout(syncTimeoutRef.current);
        }

        if (isMounted) {
          console.error('❌ Sync failed:', error);
          setSyncError(error instanceof Error ? error.message : 'Sync failed. Using cached data.');
          // Don't block app usage if sync fails
          hasPerformedInitialSync.current = true;
          setCompanySwitched(false);
          setSyncing(false);
          
          // Hide error after 5 seconds
          setTimeout(() => {
            if (isMounted) {
              setShowSyncBanner(false);
              setSyncError(null);
            }
          }, 5000);
        }
      } finally {
        if (unsubscribe) {
          unsubscribe();
        }
      }
    };

    // Run sync in background - don't block UI
    performBackgroundSync();

    return () => {
      isMounted = false;
      if (syncTimeoutRef.current) {
        clearTimeout(syncTimeoutRef.current);
      }
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, [user, currentCompany, companySwitched, setCompanySwitched, isPasswordRecovery]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  // Show Auth component if no user OR in password recovery mode
  if (!user || isPasswordRecovery) {
    return <Auth />;
  }

  if (!currentCompany) {
    return <CompanySetup />;
  }

  // Sync banner (non-blocking, appears at top of screen)
  const SyncBanner = () => {
    if (!showSyncBanner) return null;

    return (
      <div className="fixed top-0 left-0 right-0 z-50 bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-3">
          <div className="flex items-center gap-3">
            {syncError ? (
              <>
                <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-red-600 font-medium">
                    {syncError}
                  </p>
                </div>
              </>
            ) : syncing ? (
              <>
                <RefreshCw className="w-5 h-5 text-indigo-600 animate-spin flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-700 font-medium">
                    {companySwitched 
                      ? `Loading ${currentCompany.name}...`
                      : 'Syncing data...'}
                  </p>
                  {syncProgress.total > 0 && (
                    <div className="mt-1">
                      <div className="flex justify-between text-xs text-gray-500 mb-1">
                        <span className="capitalize">{syncProgress.stage}</span>
                        <span>{syncProgress.current} / {syncProgress.total}</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-1.5">
                        <div 
                          className="bg-indigo-600 h-1.5 rounded-full transition-all duration-300"
                          style={{ width: `${(syncProgress.current / syncProgress.total) * 100}%` }}
                        ></div>
                      </div>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <>
                <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0" />
                <p className="text-sm text-green-600 font-medium">
                  Sync complete
                </p>
              </>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <SyncBanner />
      <div style={{ paddingTop: showSyncBanner ? '60px' : '0' }} className="transition-all duration-200">
        <Header />
        <main className="content-with-footer">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/sales/:saleId" element={<SaleDetail />} />
            <Route path="/sales/:saleId/lots/:lotId" element={<LotDetail />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
        <ContextFooter />
      </div>
    </div>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AppProvider>
        <FooterProvider>
          <AppContent />
        </FooterProvider>
      </AppProvider>
    </BrowserRouter>
  );
}

export default App;