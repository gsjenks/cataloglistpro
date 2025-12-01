// services/SyncService.ts
// SYNC ORDER: 1)Companies, 2)Sales, 3)Lots, 4)Contacts, 5)Primary Images, 6)Documents, 7)Remaining Images
// Only syncs ACTIVE companies and sales

import { supabase } from '../lib/supabase';
import offlineStorage from './Offlinestorage';
import PhotoService from './PhotoService';

const TOTAL_STEPS = 7;

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
    return () => {
      this.syncStatusListeners.delete(callback);
    };
  }

  private notifySyncStatusChange(): void {
    this.syncStatusListeners.forEach(listener => {
      try {
        listener(this.isSyncing);
      } catch (error) {
        console.error('Error in sync status listener:', error);
      }
    });
  }

  onProgressChange(callback: (progress: typeof this.syncProgress) => void): () => void {
    this.progressListeners.add(callback);
    return () => {
      this.progressListeners.delete(callback);
    };
  }

  private notifyProgress(stage: string, current: number): void {
    this.syncProgress = { stage, current, total: TOTAL_STEPS };
    this.progressListeners.forEach(listener => {
      try {
        listener(this.syncProgress);
      } catch (error) {
        console.error('Error in progress listener:', error);
      }
    });
  }

  /**
   * MAIN SYNC - ACTIVE companies/sales only
   * Order: 1)Companies, 2)Sales, 3)Lots, 4)Contacts, 5)Primary Images, 6)Documents, 7)Remaining Images
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
      console.log('  Company result:', company?.name, company?.status);
      
      // Allow sync even if company status isn't 'active' - many companies don't use status field
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

      // STEP 5: Primary lot images
      console.log('Step 5/7: Primary images');
      this.notifyProgress('Syncing primary images', 5);
      await this.syncPrimaryImages(lots);

      // STEP 6: Documents
      console.log('Step 6/7: Documents');
      this.notifyProgress('Syncing documents', 6);
      await this.syncDocuments(companyId, activeSales);

      // STEP 7: Remaining images
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
    if (data) {
      await offlineStorage.upsertCompany(data);
    }
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
    for (const sale of sales) {
      await offlineStorage.upsertSale(sale);
    }
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
    for (const lot of lots) {
      await offlineStorage.upsertLot(lot);
    }
    return lots;
  }

  // STEP 4: Contacts (company + sale level)
  private async syncContacts(companyId: string, activeSales: any[]): Promise<void> {
    let totalContacts = 0;

    // Company contacts
    const { data: companyContacts } = await supabase
      .from('contacts')
      .select('*')
      .eq('company_id', companyId)
      .is('sale_id', null);

    if (companyContacts) {
      for (const contact of companyContacts) {
        await offlineStorage.upsertContact(contact);
      }
      totalContacts += companyContacts.length;
    }

    // Sale contacts
    if (activeSales.length > 0) {
      const saleIds = activeSales.map(s => s.id);
      const { data: saleContacts } = await supabase
        .from('contacts')
        .select('*')
        .in('sale_id', saleIds);

      if (saleContacts) {
        for (const contact of saleContacts) {
          await offlineStorage.upsertContact(contact);
        }
        totalContacts += saleContacts.length;
      }
    }

    console.log('  Contacts synced:', totalContacts);
  }

  // STEP 5: Primary images only
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

    for (const photo of primaryPhotos) {
      await offlineStorage.upsertPhoto({ ...photo, synced: false });
      
      // Download blob
      const existingBlob = await offlineStorage.getPhotoBlob(photo.id);
      if (!existingBlob) {
        try {
          console.log('  Downloading primary image:', photo.id);
          const { data: blob, error: dlError } = await supabase.storage
            .from('photos')
            .download(photo.file_path);

          if (dlError) {
            console.error('  Download error:', dlError);
          } else if (blob) {
            await offlineStorage.upsertPhotoBlob(photo.id, blob);
            await offlineStorage.upsertPhoto({ ...photo, synced: true });
            console.log('  Downloaded:', photo.id);
          }
        } catch (err) {
          console.error('  Download exception:', err);
        }
      } else {
        console.log('  Already have:', photo.id);
      }
    }
  }

  // STEP 6: Documents (company + sale level)
  private async syncDocuments(companyId: string, activeSales: any[]): Promise<void> {
    let totalDocs = 0;

    // Company documents
    const { data: companyDocs } = await supabase
      .from('documents')
      .select('*')
      .eq('company_id', companyId)
      .is('sale_id', null);

    if (companyDocs) {
      for (const doc of companyDocs) {
        await offlineStorage.upsertDocument(doc);
      }
      totalDocs += companyDocs.length;
    }

    // Sale documents
    if (activeSales.length > 0) {
      const saleIds = activeSales.map(s => s.id);
      const { data: saleDocs } = await supabase
        .from('documents')
        .select('*')
        .in('sale_id', saleIds);

      if (saleDocs) {
        for (const doc of saleDocs) {
          await offlineStorage.upsertDocument(doc);
        }
        totalDocs += saleDocs.length;
      }
    }

    console.log('  Documents synced:', totalDocs);
  }

  // STEP 7: Remaining (non-primary) images
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

    let downloaded = 0;
    for (const photo of remainingPhotos) {
      await offlineStorage.upsertPhoto({ ...photo, synced: false });
      
      const existingBlob = await offlineStorage.getPhotoBlob(photo.id);
      if (!existingBlob) {
        try {
          const { data: blob, error: dlError } = await supabase.storage
            .from('photos')
            .download(photo.file_path);

          if (dlError) {
            console.error('  Download error:', photo.id, dlError);
          } else if (blob) {
            await offlineStorage.upsertPhotoBlob(photo.id, blob);
            await offlineStorage.upsertPhoto({ ...photo, synced: true });
            downloaded++;
          }
        } catch (err) {
          console.error('  Download exception:', photo.id, err);
        }
      } else {
        downloaded++;
      }
    }
    console.log('  Remaining images downloaded:', downloaded, '/', remainingPhotos.length);
  }

  // Push local changes to Supabase
  async pushLocalChanges(): Promise<void> {
    this.startOperation();
    try {
      // Push unsynced photos only (lots sync via pending items)
      const unsyncedPhotos = await offlineStorage.getUnsyncedPhotos();
      for (const photo of unsyncedPhotos) {
        const blob = await offlineStorage.getPhotoBlob(photo.id);
        if (blob) {
          await PhotoService.uploadToSupabase(blob, photo.file_path);
          await PhotoService.saveMetadataToSupabase(photo);
        }
      }

      // Push pending sync items
      const pendingItems = await offlineStorage.getPendingSyncItems();
      for (const item of pendingItems) {
        try {
          const { error } = await supabase.from(item.table).upsert(item.data);
          if (!error) {
            await offlineStorage.markSynced(item.id);
          }
        } catch (err) {
          // Continue on error
        }
      }
    } finally {
      this.endOperation();
    }
  }

  async performFullSync(companyId: string): Promise<void> {
    await this.performInitialSync(companyId);
    await this.pushLocalChanges();
  }

  // Alias for compatibility
  async performSync(): Promise<void> {
    await this.pushLocalChanges();
  }

  // Initialize - called on app start
  async initialize(): Promise<void> {
    // Nothing to initialize - sync happens on demand
  }

  getSyncProgress() {
    return this.syncProgress;
  }

  isSyncInProgress() {
    return this.isSyncing;
  }
}

export default new SyncService();