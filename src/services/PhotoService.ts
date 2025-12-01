// services/PhotoService.ts
import offlineStorage from './Offlinestorage';
import { supabase } from '../lib/supabase';
import type { Photo } from '../types';

interface PhotoMetadata {
  id: string;
  lot_id: string;
  file_path: string;
  file_name: string;
  is_primary: boolean;
  created_at: string;
  updated_at: string;
}

class PhotoService {
  private dbReady: Promise<void>;
  private signedUrlCache: Map<string, { url: string; expires: number }> = new Map();
  private pendingRequests: Map<string, Promise<string | null>> = new Map();

  constructor() {
    this.dbReady = offlineStorage.initialize().catch(error => {
      console.error('PhotoService: Failed to initialize database:', error);
      throw error;
    });
  }

  private async ensureReady(): Promise<void> {
    await this.dbReady;
  }

  async savePhotoBlob(photoId: string, blob: Blob): Promise<void> {
    await this.ensureReady();
    await offlineStorage.upsertPhotoBlob(photoId, blob);
  }

  async getPhotoBlob(photoId: string): Promise<Blob | undefined> {
    await this.ensureReady();
    return await offlineStorage.getPhotoBlob(photoId);
  }

  async savePhotoMetadata(photo: PhotoMetadata): Promise<void> {
    await this.ensureReady();
    await offlineStorage.upsertPhoto({
      ...photo,
      synced: false,
    });
  }

  async getPhotosByLot(lotId: string): Promise<Photo[]> {
    await this.ensureReady();
    // Return local photos - sync populates local storage with metadata
    return await offlineStorage.getPhotosByLot(lotId);
  }

  async getPhotosForLot(lotId: string): Promise<Photo[]> {
    return this.getPhotosByLot(lotId);
  }

  /**
   * OPTIMIZED: Save photo with minimal blocking
   * Saves metadata immediately, processes blob in background
   */
  async savePhotoFast(
    photoId: string,
    lotId: string,
    photoData: Blob | { base64String?: string; format?: string; webPath?: string },
    filePath: string,
    fileName: string,
    isPrimary: boolean = false
  ): Promise<{ success: boolean; error?: string }> {
    try {
      await this.ensureReady();

      // Save metadata immediately (lightweight)
      const metadata: PhotoMetadata = {
        id: photoId,
        lot_id: lotId,
        file_path: filePath,
        file_name: fileName,
        is_primary: isPrimary,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      await this.savePhotoMetadata(metadata);

      // Process blob in background (non-blocking)
      setTimeout(async () => {
        try {
          const blob = await this.convertToBlob(photoData);
          await this.savePhotoBlob(photoId, blob);

          // Sync to Supabase if online (background)
          if (navigator.onLine) {
            setTimeout(async () => {
              try {
                await this.syncSinglePhoto(blob, filePath, metadata);
              } catch {
                console.log('Background sync will retry later');
              }
            }, 3000);
          }
        } catch (error) {
          console.error('Background blob processing failed:', error);
        }
      }, 500);

      return { success: true };
    } catch (error) {
      console.error('Failed to save photo fast:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to save photo',
      };
    }
  }

  /**
   * Convert photo data to blob
   */
  private async convertToBlob(photoData: { base64String?: string; format?: string; webPath?: string } | Blob): Promise<Blob> {
    if (!(photoData instanceof Blob) && photoData.base64String) {
      return this.base64ToBlob(photoData.base64String, photoData.format || 'jpeg');
    }
    
    if (!(photoData instanceof Blob) && photoData.webPath) {
      const response = await fetch(photoData.webPath);
      return await response.blob();
    }

    if (photoData instanceof Blob) {
      return photoData;
    }
    
    throw new Error('Cannot convert photo data to blob');
  }

  private base64ToBlob(base64: string, format: string): Blob {
    const byteString = atob(base64);
    const arrayBuffer = new ArrayBuffer(byteString.length);
    const uint8Array = new Uint8Array(arrayBuffer);
    
    for (let i = 0; i < byteString.length; i++) {
      uint8Array[i] = byteString.charCodeAt(i);
    }
    
    return new Blob([arrayBuffer], { type: `image/${format}` });
  }

  /**
   * Background sync single photo to Supabase
   */
  private async syncSinglePhoto(
    blob: Blob,
    filePath: string,
    metadata: PhotoMetadata
  ): Promise<void> {
    const uploadResult = await this.uploadToSupabase(blob, filePath);
    if (!uploadResult.success) {
      throw new Error(uploadResult.error);
    }

    await this.saveMetadataToSupabase(metadata);
  }

  /**
   * LEGACY: Synchronous save (kept for compatibility)
   */
  async savePhoto(
    photoId: string,
    lotId: string,
    blob: Blob,
    filePath: string,
    fileName: string,
    isPrimary: boolean = false
  ): Promise<{ success: boolean; error?: string }> {
    try {
      await this.ensureReady();
      await this.savePhotoBlob(photoId, blob);

      const metadata: PhotoMetadata = {
        id: photoId,
        lot_id: lotId,
        file_path: filePath,
        file_name: fileName,
        is_primary: isPrimary,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      await this.savePhotoMetadata(metadata);
      return { success: true };
    } catch (error) {
      console.error('Failed to save photo:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to save photo',
      };
    }
  }

  async deletePhoto(photoId: string): Promise<void> {
    await this.ensureReady();
    await offlineStorage.deletePhoto(photoId);
    await offlineStorage.deletePhotoBlob(photoId);
  }

  async uploadToSupabase(
    blob: Blob,
    filePath: string
  ): Promise<{ success: boolean; url?: string; error?: string }> {
    try {
      const { error } = await supabase.storage
        .from('photos')
        .upload(filePath, blob, {
          contentType: blob.type,
          upsert: true,
        });

      if (error) {
        return { success: false, error: error.message };
      }

      const { data: urlData } = supabase.storage
        .from('photos')
        .getPublicUrl(filePath);

      return { success: true, url: urlData.publicUrl };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Upload failed',
      };
    }
  }

  async saveMetadataToSupabase(photo: PhotoMetadata): Promise<boolean> {
    try {
      const { error } = await supabase.from('photos').upsert(photo);

      if (error) {
        return false;
      }

      await offlineStorage.upsertPhoto({ ...photo, synced: true });
      return true;
    } catch {
      return false;
    }
  }

  async getPhotoObjectUrl(photoId: string): Promise<string | null> {
    await this.ensureReady();
    
    // Check if request is already pending (deduplication)
    if (this.pendingRequests.has(photoId)) {
      return this.pendingRequests.get(photoId)!;
    }
    
    const requestPromise = this._getPhotoObjectUrlInternal(photoId);
    this.pendingRequests.set(photoId, requestPromise);
    
    try {
      return await requestPromise;
    } finally {
      this.pendingRequests.delete(photoId);
    }
  }
  
  private async _getPhotoObjectUrlInternal(photoId: string): Promise<string | null> {
    // Try local blob first (fastest)
    const blob = await this.getPhotoBlob(photoId);
    if (blob) {
      return URL.createObjectURL(blob);
    }
    
    // Check signed URL cache
    const cached = this.signedUrlCache.get(photoId);
    if (cached && cached.expires > Date.now()) {
      return cached.url;
    }
    
    // Need to get file_path - check local metadata first
    const localPhoto = await offlineStorage.getPhoto(photoId);
    const filePath = localPhoto?.file_path;
    
    if (!filePath) {
      // No metadata locally - photo hasn't been synced yet
      return null;
    }
    
    if (!navigator.onLine) {
      return null;
    }
    
    // Get signed URL from Supabase
    try {
      const { data: urlData, error } = await supabase.storage
        .from('photos')
        .createSignedUrl(filePath, 3600);
      
      if (error) {
        console.error(`📷 Photo ${photoId.slice(0,8)}: Signed URL error:`, error);
        return null;
      }
      
      if (urlData?.signedUrl) {
        // Cache the signed URL
        this.signedUrlCache.set(photoId, {
          url: urlData.signedUrl,
          expires: Date.now() + (55 * 60 * 1000)
        });
        
        // Download blob in background for future offline use
        fetch(urlData.signedUrl)
          .then(res => res.blob())
          .then(downloadedBlob => this.savePhotoBlob(photoId, downloadedBlob))
          .catch(() => {});
        
        return urlData.signedUrl;
      }
    } catch (error) {
      console.error(`📷 Photo ${photoId.slice(0,8)}: Failed to get signed URL:`, error);
    }
    
    return null;
  }

  dataURLtoBlob(dataUrl: string): Blob {
    const arr = dataUrl.split(',');
    const mime = arr[0].match(/:(.*?);/)?.[1] || 'image/jpeg';
    const bstr = atob(arr[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) {
      u8arr[n] = bstr.charCodeAt(n);
    }
    return new Blob([u8arr], { type: mime });
  }

  revokeObjectUrl(url: string): void {
    if (url.startsWith('blob:')) {
      URL.revokeObjectURL(url);
    }
  }

  async setPrimaryPhoto(lotId: string, photoId: string): Promise<void> {
    await this.ensureReady();
    const photos = await this.getPhotosByLot(lotId);
    
    for (const photo of photos) {
      const updatedPhoto = {
        ...photo,
        is_primary: photo.id === photoId,
        updated_at: new Date().toISOString(),
        synced: false,
      };
      await offlineStorage.upsertPhoto(updatedPhoto);
    }
  }

  async syncPhotos(lotId?: string): Promise<{ success: number; failed: number }> {
    await this.ensureReady();
    
    let photos: Photo[];
    if (lotId) {
      photos = await this.getPhotosByLot(lotId);
      photos = photos.filter(p => !p.synced);
    } else {
      photos = await offlineStorage.getUnsyncedPhotos();
    }

    let success = 0;
    let failed = 0;

    for (const photo of photos) {
      try {
        const blob = await this.getPhotoBlob(photo.id);
        if (!blob) {
          failed++;
          continue;
        }

        const uploadResult = await this.uploadToSupabase(blob, photo.file_path);
        if (!uploadResult.success) {
          failed++;
          continue;
        }

        const metadataSaved = await this.saveMetadataToSupabase(photo);
        if (metadataSaved) {
          success++;
        } else {
          failed++;
        }
      } catch {
        failed++;
      }
    }

    return { success, failed };
  }

  async downloadPhotosForLot(lotId: string): Promise<{ success: number; failed: number }> {
    try {
      await this.ensureReady();

      const { data: photos, error } = await supabase
        .from('photos')
        .select('*')
        .eq('lot_id', lotId);

      if (error) {
        return { success: 0, failed: 0 };
      }

      if (!photos || photos.length === 0) {
        return { success: 0, failed: 0 };
      }

      let success = 0;
      let failed = 0;

      for (const photo of photos) {
        try {
          const { data: blob, error: downloadError } = await supabase.storage
            .from('photos')
            .download(photo.file_path);

          if (downloadError || !blob) {
            failed++;
            continue;
          }

          await this.savePhotoBlob(photo.id, blob);
          await offlineStorage.upsertPhoto({ ...photo, synced: true });
          success++;
        } catch {
          failed++;
        }
      }

      return { success, failed };
    } catch {
      return { success: 0, failed: 0 };
    }
  }
}

export default new PhotoService();