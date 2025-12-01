// services/initializeOfflineStorage.ts
// Initialize offline storage when the app starts

import offlineStorage from './Offlinestorage';
import SyncService from './SyncService';

let initialized = false;

export async function initializeOfflineStorage(): Promise<void> {
  if (initialized) {
    return;
  }

  try {
    console.log('Initializing offline storage...');
    
    // Initialize IndexedDB
    await offlineStorage.initialize();
    
    // Initialize sync service
    await SyncService.initialize();
    
    initialized = true;
    console.log('Offline storage initialized successfully');
  } catch (error) {
    console.error('Failed to initialize offline storage:', error);
    throw error;
  }
}

export function isInitialized(): boolean {
  return initialized;
}