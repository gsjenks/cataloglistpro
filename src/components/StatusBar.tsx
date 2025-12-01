// src/components/StatusBar.tsx
// Safe zone header with wifi connection and sync status

import { useState, useEffect } from 'react';
import { Wifi, WifiOff, RefreshCw } from 'lucide-react';
import ConnectivityService from '../services/ConnectivityService';
import SyncService from '../services/SyncService';

export default function StatusBar() {
  const [isOnline, setIsOnline] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState({ stage: '', current: 0, total: 7 });

  useEffect(() => {
    // Get initial connectivity status
    setIsOnline(ConnectivityService.getConnectionStatus());
    
    // Get initial sync status
    setIsSyncing(SyncService.getIsSyncing());
    
    // Subscribe to connectivity changes
    const unsubscribeConnectivity = ConnectivityService.onStatusChange((online: boolean) => {
      setIsOnline(online);
    });

    // Subscribe to sync status changes
    const unsubscribeSync = SyncService.onSyncStatusChange((syncing: boolean) => {
      setIsSyncing(syncing);
    });

    // Subscribe to sync progress changes
    const unsubscribeProgress = SyncService.onProgressChange((progress) => {
      setSyncProgress(progress);
    });

    return () => {
      unsubscribeConnectivity();
      unsubscribeSync();
      unsubscribeProgress();
    };
  }, []);

  return (
    <div className="bg-gray-900 text-white px-4 py-1 flex items-center justify-between text-xs safe-area-top">
      {/* Left: Connection Status */}
      <div className="flex items-center gap-1.5">
        {isOnline ? (
          <>
            <Wifi className="w-3.5 h-3.5 text-green-400" />
            <span className="text-green-400">Online</span>
          </>
        ) : (
          <>
            <WifiOff className="w-3.5 h-3.5 text-red-400" />
            <span className="text-red-400">Offline</span>
          </>
        )}
      </div>

      {/* Right: Sync Status */}
      <div className="flex items-center gap-1.5">
        {isSyncing ? (
          <>
            <RefreshCw className="w-3.5 h-3.5 text-blue-400 animate-spin" />
            <span className="text-blue-400">
              {syncProgress.stage || 'Syncing...'}
              {syncProgress.current > 0 && syncProgress.total > 0 && (
                <span className="ml-1">({syncProgress.current}/{syncProgress.total})</span>
              )}
            </span>
          </>
        ) : (
          <span className="text-gray-400">Synced</span>
        )}
      </div>
    </div>
  );
}