import SyncService from './SyncService';

class ConnectivityService {
  private isOnline = navigator.onLine;
  private syncInterval: ReturnType<typeof setInterval> | null = null;
  private listeners: Set<(isOnline: boolean) => void> = new Set();

  constructor() {
    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    window.addEventListener('online', this.handleOnline.bind(this));
    window.addEventListener('offline', this.handleOffline.bind(this));
  }

  private handleOnline(): void {
    console.log('Connection restored');
    this.isOnline = true;
    this.notifyListeners(true);
    this.startAutoSync();
    this.performSync();
  }

  private handleOffline(): void {
    console.log('Connection lost');
    this.isOnline = false;
    this.notifyListeners(false);
    this.stopAutoSync();
  }

  private notifyListeners(isOnline: boolean): void {
    this.listeners.forEach(listener => {
      try {
        listener(isOnline);
      } catch (error) {
        console.error('Error in connectivity listener:', error);
      }
    });
  }

  /**
   * Subscribe to connectivity status changes
   * @param callback Function to call when connectivity changes
   * @returns Unsubscribe function
   */
  onStatusChange(callback: (isOnline: boolean) => void): () => void {
    this.listeners.add(callback);
    
    // Return unsubscribe function
    return () => {
      this.listeners.delete(callback);
    };
  }

  private startAutoSync(): void {
    if (this.syncInterval) return;

    // Sync every 5 minutes when online
    this.syncInterval = setInterval(() => {
      if (this.isOnline) {
        this.performSync();
      }
    }, 5 * 60 * 1000);
  }

  private stopAutoSync(): void {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
  }

  async performSync(): Promise<void> {
    if (!this.isOnline) {
      console.log('Cannot sync while offline');
      return;
    }

    try {
      await SyncService.performSync();
    } catch (error) {
      console.error('Sync error:', error);
    }
  }

  getConnectionStatus(): boolean {
    return this.isOnline;
  }

  destroy(): void {
    this.stopAutoSync();
    this.listeners.clear();
    window.removeEventListener('online', this.handleOnline);
    window.removeEventListener('offline', this.handleOffline);
  }
}

export default new ConnectivityService();