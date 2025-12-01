import { openDB } from 'idb';
import type { DBSchema, IDBPDatabase } from 'idb';
import type { Company, Sale, Lot, Photo, Contact, Document } from '../types';

interface PendingSyncItem {
  id: string;
  type: 'create' | 'update' | 'delete';
  table: string;
  data: Company | Sale | Lot | Photo | Contact | Document | Record<string, unknown>;
  timestamp: number;
  synced: boolean;
}

interface ConflictItem {
  id: string;
  table: string;
  localData: Company | Sale | Lot | Photo | Contact | Document | Record<string, unknown>;
  cloudData: Company | Sale | Lot | Photo | Contact | Document | Record<string, unknown>;
  timestamp: number;
  resolved: boolean;
}

interface MetadataItem {
  key: string;
  value: string | number | boolean;
}

interface PhotoInventoryDB extends DBSchema {
  companies: {
    key: string;
    value: Company;
    indexes: { 'by-updated': string };
  };
  sales: {
    key: string;
    value: Sale;
    indexes: { 'by-company': string; 'by-updated': string };
  };
  lots: {
    key: string;
    value: Lot;
    indexes: { 'by-sale': string; 'by-updated': string };
  };
  photos: {
    key: string;
    value: Photo;
    indexes: { 'by-lot': string };
  };
  contacts: {
    key: string;
    value: Contact;
    indexes: { 'by-company': string; 'by-sale': string };
  };
  documents: {
    key: string;
    value: Document;
    indexes: { 'by-company': string; 'by-sale': string };
  };
  photoBlobs: {
    key: string;
    value: { id: string; blob: Blob };
  };
  pendingSync: {
    key: string;
    value: PendingSyncItem;
    indexes: { 'by-synced': string };
  };
  conflicts: {
    key: string;
    value: ConflictItem;
  };
  metadata: {
    key: string;
    value: MetadataItem;
  };
}

class OfflineStorage {
  private db: IDBPDatabase<PhotoInventoryDB> | null = null;
  private readonly DB_NAME = 'PhotoInventoryDB';
  private readonly DB_VERSION = 4;

  async initialize(): Promise<void> {
    this.db = await openDB<PhotoInventoryDB>(this.DB_NAME, this.DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('companies')) {
          const companyStore = db.createObjectStore('companies', { keyPath: 'id' });
          companyStore.createIndex('by-updated', 'updated_at');
        }
        if (!db.objectStoreNames.contains('sales')) {
          const salesStore = db.createObjectStore('sales', { keyPath: 'id' });
          salesStore.createIndex('by-company', 'company_id');
          salesStore.createIndex('by-updated', 'updated_at');
        }
        if (!db.objectStoreNames.contains('lots')) {
          const lotsStore = db.createObjectStore('lots', { keyPath: 'id' });
          lotsStore.createIndex('by-sale', 'sale_id');
          lotsStore.createIndex('by-updated', 'updated_at');
        }
        if (!db.objectStoreNames.contains('photos')) {
          const photosStore = db.createObjectStore('photos', { keyPath: 'id' });
          photosStore.createIndex('by-lot', 'lot_id');
        }
        if (!db.objectStoreNames.contains('contacts')) {
          const contactsStore = db.createObjectStore('contacts', { keyPath: 'id' });
          contactsStore.createIndex('by-company', 'company_id');
          contactsStore.createIndex('by-sale', 'sale_id');
        }
        if (!db.objectStoreNames.contains('documents')) {
          const documentsStore = db.createObjectStore('documents', { keyPath: 'id' });
          documentsStore.createIndex('by-company', 'company_id');
          documentsStore.createIndex('by-sale', 'sale_id');
        }
        if (!db.objectStoreNames.contains('photoBlobs')) {
          db.createObjectStore('photoBlobs', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('pendingSync')) {
          const syncStore = db.createObjectStore('pendingSync', { keyPath: 'id' });
          syncStore.createIndex('by-synced', 'synced');
        }
        if (!db.objectStoreNames.contains('conflicts')) {
          db.createObjectStore('conflicts', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('metadata')) {
          db.createObjectStore('metadata', { keyPath: 'key' });
        }
      },
    });
  }

  async upsertCompany(company: Company): Promise<void> {
    if (!this.db) await this.initialize();
    await this.db!.put('companies', company);
  }

  async getCompany(id: string): Promise<Company | undefined> {
    if (!this.db) await this.initialize();
    return await this.db!.get('companies', id);
  }

  async getAllCompanies(): Promise<Company[]> {
    if (!this.db) await this.initialize();
    return await this.db!.getAll('companies');
  }

  async upsertSale(sale: Sale): Promise<void> {
    if (!this.db) await this.initialize();
    await this.db!.put('sales', sale);
  }

  async getSale(id: string): Promise<Sale | undefined> {
    if (!this.db) await this.initialize();
    return await this.db!.get('sales', id);
  }

  async getSalesByCompany(companyId: string): Promise<Sale[]> {
    if (!this.db) await this.initialize();
    return await this.db!.getAllFromIndex('sales', 'by-company', companyId);
  }

  async upsertLot(lot: Lot): Promise<void> {
    if (!this.db) await this.initialize();
    await this.db!.put('lots', lot);
  }

  async getLot(id: string): Promise<Lot | undefined> {
    if (!this.db) await this.initialize();
    return await this.db!.get('lots', id);
  }

  async getLotsBySale(saleId: string): Promise<Lot[]> {
    if (!this.db) await this.initialize();
    return await this.db!.getAllFromIndex('lots', 'by-sale', saleId);
  }

  async savePhoto(photo: Photo, blob?: Blob): Promise<void> {
    if (!this.db) await this.initialize();
    await this.db!.put('photos', photo);
    if (blob) {
      await this.db!.put('photoBlobs', { id: photo.id, blob });
    }
  }

  async getPhotosByLot(lotId: string): Promise<Photo[]> {
    if (!this.db) await this.initialize();
    return await this.db!.getAllFromIndex('photos', 'by-lot', lotId);
  }

  async getPhoto(photoId: string): Promise<Photo | undefined> {
    if (!this.db) await this.initialize();
    return await this.db!.get('photos', photoId);
  }

  async getPhotoBlob(photoId: string): Promise<Blob | undefined> {
    if (!this.db) await this.initialize();
    const record = await this.db!.get('photoBlobs', photoId);
    return record?.blob;
  }

  async deletePhoto(photoId: string): Promise<void> {
    if (!this.db) await this.initialize();
    const tx = this.db!.transaction(['photos', 'photoBlobs'], 'readwrite');
    await tx.objectStore('photos').delete(photoId);
    await tx.objectStore('photoBlobs').delete(photoId);
    await tx.done;
  }

  async updatePhoto(photo: Photo): Promise<void> {
    if (!this.db) await this.initialize();
    await this.db!.put('photos', photo);
  }

  async upsertPhoto(photo: Photo): Promise<void> {
    if (!this.db) await this.initialize();
    await this.db!.put('photos', photo);
  }

  async upsertPhotoBlob(photoId: string, blob: Blob): Promise<void> {
    if (!this.db) await this.initialize();
    await this.db!.put('photoBlobs', { id: photoId, blob });
  }

  async deletePhotoBlob(photoId: string): Promise<void> {
    if (!this.db) await this.initialize();
    await this.db!.delete('photoBlobs', photoId);
  }

  async getUnsyncedPhotos(): Promise<Photo[]> {
    if (!this.db) await this.initialize();
    const allPhotos = await this.db!.getAll('photos');
    return allPhotos.filter(photo => !photo.synced);
  }

  // Contacts
  async upsertContact(contact: Contact): Promise<void> {
    if (!this.db) await this.initialize();
    await this.db!.put('contacts', contact);
  }

  async getContact(id: string): Promise<Contact | undefined> {
    if (!this.db) await this.initialize();
    return await this.db!.get('contacts', id);
  }

  async getContactsByCompany(companyId: string): Promise<Contact[]> {
    if (!this.db) await this.initialize();
    return await this.db!.getAllFromIndex('contacts', 'by-company', companyId);
  }

  async getContactsBySale(saleId: string): Promise<Contact[]> {
    if (!this.db) await this.initialize();
    return await this.db!.getAllFromIndex('contacts', 'by-sale', saleId);
  }

  // Documents
  async upsertDocument(document: Document): Promise<void> {
    if (!this.db) await this.initialize();
    await this.db!.put('documents', document);
  }

  async getDocument(id: string): Promise<Document | undefined> {
    if (!this.db) await this.initialize();
    return await this.db!.get('documents', id);
  }

  async getDocumentsByCompany(companyId: string): Promise<Document[]> {
    if (!this.db) await this.initialize();
    return await this.db!.getAllFromIndex('documents', 'by-company', companyId);
  }

  async getDocumentsBySale(saleId: string): Promise<Document[]> {
    if (!this.db) await this.initialize();
    return await this.db!.getAllFromIndex('documents', 'by-sale', saleId);
  }

  async upsertItem(table: string, item: Company | Sale | Lot | Photo | Contact | Document): Promise<void> {
    if (!this.db) await this.initialize();
    await this.db!.put(table as 'companies' | 'sales' | 'lots' | 'photos' | 'contacts' | 'documents', item as Company & Sale & Lot & Photo & Contact & Document);
  }

  async addPendingSyncItem(item: {
    id: string;
    type: 'create' | 'update' | 'delete';
    table: string;
    data: Company | Sale | Lot | Photo | Record<string, unknown>;
  }): Promise<void> {
    if (!this.db) await this.initialize();
    await this.db!.put('pendingSync', { ...item, timestamp: Date.now(), synced: false });
  }

  async getPendingSyncItems(): Promise<PendingSyncItem[]> {
    if (!this.db) await this.initialize();
    return await this.db!.getAllFromIndex('pendingSync', 'by-synced');
  }

  async markSynced(itemId: string): Promise<void> {
    if (!this.db) await this.initialize();
    const item = await this.db!.get('pendingSync', itemId);
    if (item) {
      item.synced = true;
      await this.db!.put('pendingSync', item);
    }
  }

  async clearSyncedItems(): Promise<void> {
    if (!this.db) await this.initialize();
    const syncedItems = await this.db!.getAllFromIndex('pendingSync', 'by-synced');
    const tx = this.db!.transaction('pendingSync', 'readwrite');
    for (const item of syncedItems) {
      await tx.store.delete(item.id);
    }
    await tx.done;
  }

  async addConflict(conflict: {
    id: string;
    table: string;
    localData: Company | Sale | Lot | Photo | Record<string, unknown>;
    cloudData: Company | Sale | Lot | Photo | Record<string, unknown>;
  }): Promise<void> {
    if (!this.db) await this.initialize();
    await this.db!.put('conflicts', { ...conflict, timestamp: Date.now(), resolved: false });
  }

  async getConflictedItems(): Promise<ConflictItem[]> {
    if (!this.db) await this.initialize();
    const allConflicts = await this.db!.getAll('conflicts');
    return allConflicts.filter(c => !c.resolved);
  }

  async markConflictResolved(itemId: string): Promise<void> {
    if (!this.db) await this.initialize();
    const conflict = await this.db!.get('conflicts', itemId);
    if (conflict) {
      conflict.resolved = true;
      await this.db!.put('conflicts', conflict);
    }
  }

  async setLastSyncTime(timestamp: number): Promise<void> {
    if (!this.db) await this.initialize();
    await this.db!.put('metadata', { key: 'lastSyncTime', value: timestamp });
  }

  async getLastSyncTime(): Promise<number> {
    if (!this.db) await this.initialize();
    const metadata = await this.db!.get('metadata', 'lastSyncTime');
    return (metadata?.value as number) || 0;
  }

  async clearAll(): Promise<void> {
    if (!this.db) await this.initialize();
    const stores = ['companies', 'sales', 'lots', 'photos', 'contacts', 'documents', 'photoBlobs', 'pendingSync', 'conflicts', 'metadata'] as const;
    const tx = this.db!.transaction([...stores], 'readwrite');
    for (const store of stores) {
      await tx.objectStore(store).clear();
    }
    await tx.done;
  }

  async close(): Promise<void> {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }
}

export default new OfflineStorage();