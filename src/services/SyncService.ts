// services/SyncService.ts
// OPTIMIZED: Parallel downloads with concurrency control, batch operations
// SYNC ORDER: 1)Companies, 2)Sales, 3)Lots, 4)Contacts, 5)Primary Images, 6)Documents, 7)Remaining Images

import { supabase } from '../lib/supabase';
import offlineStorage from './Offlinestorage';
import PhotoService from './PhotoService';

const TOTAL_STEPS = 7;
const MAX_CONCURRENT_DOWNLOADS = 4; // Limit parallel downloads for mobile

class SyncService {
  private isSyncing = false;
  private activeOperations = 0;
  private syncProgress = {
    stage: '',
    current: 0,
    total: TOTAL_STEPS,
  };
  private progressListeners: Set<(progress: typeof this.syncProgress) => void> = new Set();
  private syncStatusListeners: Set<(isSyncing: boolean) => void> = new Set();

  getIsSyncing(): boolean {
    return this.isSyncing;
  }

  startOperation(): void {
    this.activeOperations++;
    if (!this.isSyncing) {
      this.isSyncing = true;
      this.notifySyncStatusChange();
    }
  }

  endOperation(): void {
    this.activeOperations = Math.max(0, this.activeOperations - 1);
    if (this.activeOperations === 0 && this.isSyncing) {
      this.isSyncing = false;
      this.notifySyncStatusChange();
    }
  }

  onSyncStatusChange(callback: (isSyncing: boolean) => void): () => void {
    this.syncStatusListeners.add(callback);
    callback(this.isSyncing);
    return () => this.syncStatusListeners.delete(callback);
  }

  private notifySyncStatusChange(): void {
    this.syncStatusListeners.forEach(listener => {
      try { listener(this.isSyncing); } catch (e) { console.error('Sync status listener error:', e); }
    });
  }

  onProgressChange(callback: (progress: typeof this.syncProgress) => void): () => void {
    this.progressListeners.add(callback);
    return () => this.progressListeners.delete(callback);
  }

  private notifyProgress(stage: string, current: number): void {
    this.syncProgress = { stage, current, total: TOTAL_STEPS };
    this.progressListeners.forEach(listener => {
      try { listener(this.syncProgress); } catch (e) { console.error('Progress listener error:', e); }
    });
  }

  // Utility: Run promises with concurrency limit
  private async runWithConcurrency<T>(
    items: T[],
    fn: (item: T) => Promise<void>,
    concurrency: number = MAX_CONCURRENT_DOWNLOADS
  ): Promise<void> {
    const queue = [...items];
    const running: Promise<void>[] = [];

    while (queue.length > 0 || running.length > 0) {
      while (running.length < concurrency && queue.length > 0) {
        const item = queue.shift()!;
        const promise = fn(item).finally(() => {
          const idx = running.indexOf(promise);
          if (idx > -1) running.splice(idx, 1);
        });
        running.push(promise);
      }
      if (running.length > 0) {
        await Promise.race(running);
      }
    }
  }

  /**
   * MAIN SYNC - ACTIVE companies/sales only
   */
  async performInitialSync(companyId: string): Promise<void> {
    console.log('=== SYNC START ===', companyId);
    
    if (this.isSyncing && this.activeOperations > 0) {
      console.log('Sync already in progress, skipping');
      return;
    }

    this.startOperation();
    
    try {
      // STEP 1: Company
      console.log('Step 1/7: Company');
      this.notifyProgress('Syncing company', 1);
      const company = await this.syncCompany(companyId);
      if (!company) {
        console.log('No company found - aborting sync');
        return;
      }

      // STEP 2: Sales (ACTIVE only)
      console.log('Step 2/7: Sales');
      this.notifyProgress('Syncing sales', 2);
      const activeSales = await this.syncActiveSales(companyId);
      console.log('  Active sales found:', activeSales.length);

      // STEP 3: Lots
      console.log('Step 3/7: Lots');
      this.notifyProgress('Syncing lots', 3);
      const lots = await this.syncLots(activeSales);
      console.log('  Lots found:', lots.length);

      // STEP 4: Contacts
      console.log('Step 4/7: Contacts');
      this.notifyProgress('Syncing contacts', 4);
      await this.syncContacts(companyId, activeSales);

      // STEP 5: Primary lot images (PARALLEL)
      console.log('Step 5/7: Primary images');
      this.notifyProgress('Syncing primary images', 5);
      await this.syncPrimaryImages(lots);

      // STEP 6: Documents
      console.log('Step 6/7: Documents');
      this.notifyProgress('Syncing documents', 6);
      await this.syncDocuments(companyId, activeSales);

      // STEP 7: Remaining images (PARALLEL)
      console.log('Step 7/7: Remaining images');
      this.notifyProgress('Syncing remaining images', 7);
      await this.syncRemainingImages(lots);

      await offlineStorage.setLastSyncTime(Date.now());
      console.log('=== SYNC COMPLETE ===');
      this.notifyProgress('Complete', TOTAL_STEPS);

    } catch (error) {
      console.error('=== SYNC FAILED ===', error);
      this.notifyProgress('Error', 0);
      throw error;
    } finally {
      this.endOperation();
    }
  }

  // STEP 1: Company
  private async syncCompany(companyId: string): Promise<any> {
    const { data, error } = await supabase
      .from('companies')
      .select('*')
      .eq('id', companyId)
      .single();

    if (error) throw error;
    if (data) await offlineStorage.upsertCompany(data);
    return data;
  }

  // STEP 2: Active sales only
  private async syncActiveSales(companyId: string): Promise<any[]> {
    const { data, error } = await supabase
      .from('sales')
      .select('*')
      .eq('company_id', companyId)
      .in('status', ['upcoming', 'active'])
      .order('start_date', { ascending: false });

    if (error) throw error;

    const sales = data || [];
    // Batch upsert
    await Promise.all(sales.map(sale => offlineStorage.upsertSale(sale)));
    return sales;
  }

  // STEP 3: Lots for active sales
  private async syncLots(activeSales: any[]): Promise<any[]> {
    if (activeSales.length === 0) return [];

    const saleIds = activeSales.map(s => s.id);
    const { data, error } = await supabase
      .from('lots')
      .select('*')
      .in('sale_id', saleIds)
      .order('lot_number', { ascending: true });

    if (error) throw error;

    const lots = data || [];
    // Batch upsert
    await Promise.all(lots.map(lot => offlineStorage.upsertLot(lot)));
    return lots;
  }

  // STEP 4: Contacts (parallel fetch)
  private async syncContacts(companyId: string, activeSales: any[]): Promise<void> {
    const saleIds = activeSales.map(s => s.id);

    // Parallel fetch
    const [companyResult, saleResult] = await Promise.all([
      supabase.from('contacts').select('*').eq('company_id', companyId).is('sale_id', null),
      saleIds.length > 0 
        ? supabase.from('contacts').select('*').in('sale_id', saleIds)
        : Promise.resolve({ data: [] })
    ]);

    const allContacts = [...(companyResult.data || []), ...(saleResult.data || [])];
    
    // Batch upsert
    await Promise.all(allContacts.map(contact => offlineStorage.upsertContact(contact)));
    console.log('  Contacts synced:', allContacts.length);
  }

  // STEP 5: Primary images (PARALLEL with concurrency)
  private async syncPrimaryImages(lots: any[]): Promise<void> {
    if (lots.length === 0) {
      console.log('  No lots - skipping primary images');
      return;
    }

    const lotIds = lots.map(l => l.id);
    const { data: photos, error } = await supabase
      .from('photos')
      .select('*')
      .in('lot_id', lotIds)
      .eq('is_primary', true);

    if (error) {
      console.error('  Error fetching primary photos:', error);
      return;
    }

    const primaryPhotos = photos || [];
    console.log('  Primary photos found:', primaryPhotos.length);

    // Filter photos that need downloading
    const photosToDownload: any[] = [];
    await Promise.all(primaryPhotos.map(async (photo) => {
      await offlineStorage.upsertPhoto({ ...photo, synced: false });
      const existingBlob = await offlineStorage.getPhotoBlob(photo.id);
      if (!existingBlob) {
        photosToDownload.push(photo);
      }
    }));

    console.log('  Primary photos to download:', photosToDownload.length);

    // Download in parallel with concurrency limit
    let downloaded = 0;
    await this.runWithConcurrency(photosToDownload, async (photo) => {
      try {
        const { data: blob, error: dlError } = await supabase.storage
          .from('photos')
          .download(photo.file_path);

        if (!dlError && blob) {
          await offlineStorage.upsertPhotoBlob(photo.id, blob);
          await offlineStorage.upsertPhoto({ ...photo, synced: true });
          downloaded++;
        }
      } catch (err) {
        console.error('  Download error:', photo.id, err);
      }
    });

    console.log('  Primary images downloaded:', downloaded);
  }

  // STEP 6: Documents (parallel fetch)
  private async syncDocuments(companyId: string, activeSales: any[]): Promise<void> {
    const saleIds = activeSales.map(s => s.id);

    // Parallel fetch
    const [companyResult, saleResult] = await Promise.all([
      supabase.from('documents').select('*').eq('company_id', companyId).is('sale_id', null),
      saleIds.length > 0
        ? supabase.from('documents').select('*').in('sale_id', saleIds)
        : Promise.resolve({ data: [] })
    ]);

    const allDocs = [...(companyResult.data || []), ...(saleResult.data || [])];
    
    // Batch upsert
    await Promise.all(allDocs.map(doc => offlineStorage.upsertDocument(doc)));
    console.log('  Documents synced:', allDocs.length);
  }

  // STEP 7: Remaining images (PARALLEL with concurrency)
  private async syncRemainingImages(lots: any[]): Promise<void> {
    if (lots.length === 0) {
      console.log('  No lots - skipping remaining images');
      return;
    }

    const lotIds = lots.map(l => l.id);
    const { data: photos, error } = await supabase
      .from('photos')
      .select('*')
      .in('lot_id', lotIds)
      .eq('is_primary', false);

    if (error) {
      console.error('  Error fetching remaining photos:', error);
      return;
    }

    const remainingPhotos = photos || [];
    console.log('  Remaining photos found:', remainingPhotos.length);

    // Filter photos that need downloading
    const photosToDownload: any[] = [];
    await Promise.all(remainingPhotos.map(async (photo) => {
      await offlineStorage.upsertPhoto({ ...photo, synced: false });
      const existingBlob = await offlineStorage.getPhotoBlob(photo.id);
      if (!existingBlob) {
        photosToDownload.push(photo);
      }
    }));

    console.log('  Remaining photos to download:', photosToDownload.length);

    // Download in parallel with concurrency limit
    let downloaded = 0;
    await this.runWithConcurrency(photosToDownload, async (photo) => {
      try {
        const { data: blob, error: dlError } = await supabase.storage
          .from('photos')
          .download(photo.file_path);

        if (!dlError && blob) {
          await offlineStorage.upsertPhotoBlob(photo.id, blob);
          await offlineStorage.upsertPhoto({ ...photo, synced: true });
          downloaded++;
        }
      } catch (err) {
        console.error('  Download error:', photo.id, err);
      }
    });

    console.log('  Remaining images downloaded:', downloaded, '/', photosToDownload.length);
  }

  // Push local changes (PARALLEL)
  async pushLocalChanges(): Promise<void> {
    this.startOperation();
    try {
      const [unsyncedPhotos, pendingItems] = await Promise.all([
        offlineStorage.getUnsyncedPhotos(),
        offlineStorage.getPendingSyncItems()
      ]);

      // Upload photos in parallel
      await this.runWithConcurrency(unsyncedPhotos, async (photo) => {
        const blob = await offlineStorage.getPhotoBlob(photo.id);
        if (blob) {
          await PhotoService.uploadToSupabase(blob, photo.file_path);
          await PhotoService.saveMetadataToSupabase(photo);
        }
      });

      // Push pending items in parallel
      await Promise.all(pendingItems.map(async (item) => {
        try {
          const { error } = await supabase.from(item.table).upsert(item.data);
          if (!error) await offlineStorage.markSynced(item.id);
        } catch (err) {
          // Continue on error
        }
      }));
    } finally {
      this.endOperation();
    }
  }

  async performFullSync(companyId: string): Promise<void> {
    await this.performInitialSync(companyId);
    await this.pushLocalChanges();
  }

  async performSync(): Promise<void> {
    await this.pushLocalChanges();
  }

  async initialize(): Promise<void> {
    // Nothing to initialize
  }

  getSyncProgress() {
    return this.syncProgress;
  }

  isSyncInProgress() {
    return this.isSyncing;
  }
}

export default new SyncService();