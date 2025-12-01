// services/CameraService.ts
// ENHANCED: Added web camera support, improved error handling, optimized performance

import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import offlineStorage from './Offlinestorage';
import { supabase } from '../lib/supabase';
import ConnectivityService from './ConnectivityService';
import PlatformService from './PlatformService';
import SyncService from './SyncService';

// Simple UUID v4 generator
function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

interface CaptureResult {
  success: boolean;
  photoId?: string;
  blobUrl?: string;
  error?: string;
}

interface FileUploadResult {
  success: number;
  failed: number;
  photos: Array<{
    photoId: string;
    blobUrl: string;
  }>;
}

class CameraService {
  private mediaStream: MediaStream | null = null;

  constructor() {
    PlatformService.logPlatformInfo();
  }

  /**
   * âœ¨ NEW: Web camera capture using MediaDevices API
   * Works on desktop/laptop browsers with webcam
   */
  async captureFromWebCamera(lotId: string, isPrimary: boolean = false): Promise<CaptureResult> {
    if (PlatformService.isNative()) {
      return {
        success: false,
        error: 'Use native camera on mobile devices'
      };
    }

    try {
      console.log('ðŸ“· Opening web camera...');

      // Request camera permission and get stream
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1920 },
          height: { ideal: 1080 },
          facingMode: 'environment' // Prefer back camera on tablets
        }
      });

      // Create video element
      const video = document.createElement('video');
      video.srcObject = this.mediaStream;
      video.autoplay = true;
      video.playsInline = true;

      // Wait for video to be ready
      await new Promise((resolve) => {
        video.onloadedmetadata = () => {
          video.play();
          resolve(null);
        };
      });

      // Create capture UI overlay
      const result = await this.showCameraUI(video, lotId, isPrimary);

      // Stop camera stream
      this.stopWebCamera();

      return result;
    } catch (error: any) {
      console.error('Web camera error:', error);
      this.stopWebCamera();
      
      return {
        success: false,
        error: error.name === 'NotAllowedError' 
          ? 'Camera permission denied. Please allow camera access in your browser settings.'
          : error.name === 'NotFoundError'
          ? 'No camera found. Please connect a webcam and try again.'
          : `Camera error: ${error.message}`
      };
    }
  }

  /**
   * âœ¨ NEW: Show camera capture UI
   */
  private async showCameraUI(
    video: HTMLVideoElement,
    lotId: string,
    isPrimary: boolean
  ): Promise<CaptureResult> {
    return new Promise((resolve) => {
      // Create overlay
      const overlay = document.createElement('div');
      overlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: black;
        z-index: 9999;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
      `;

      // Add video to overlay
      video.style.cssText = `
        max-width: 100%;
        max-height: calc(100% - 100px);
        object-fit: contain;
      `;
      overlay.appendChild(video);

      // Create controls
      const controls = document.createElement('div');
      controls.style.cssText = `
        position: absolute;
        bottom: 20px;
        left: 0;
        right: 0;
        display: flex;
        justify-content: center;
        gap: 20px;
        padding: 0 20px;
      `;

      // Capture button
      const captureBtn = document.createElement('button');
      captureBtn.textContent = 'ðŸ“¸ Capture';
      captureBtn.style.cssText = `
        padding: 15px 40px;
        font-size: 18px;
        font-weight: bold;
        background: #4f46e5;
        color: white;
        border: none;
        border-radius: 50px;
        cursor: pointer;
        box-shadow: 0 4px 6px rgba(0,0,0,0.3);
      `;
      captureBtn.onclick = async () => {
        const result = await this.captureFrame(video, lotId, isPrimary);
        document.body.removeChild(overlay);
        resolve(result);
      };

      // Cancel button
      const cancelBtn = document.createElement('button');
      cancelBtn.textContent = 'âœ• Cancel';
      cancelBtn.style.cssText = `
        padding: 15px 40px;
        font-size: 18px;
        font-weight: bold;
        background: #6b7280;
        color: white;
        border: none;
        border-radius: 50px;
        cursor: pointer;
        box-shadow: 0 4px 6px rgba(0,0,0,0.3);
      `;
      cancelBtn.onclick = () => {
        document.body.removeChild(overlay);
        resolve({
          success: false,
          error: 'Cancelled by user'
        });
      };

      controls.appendChild(captureBtn);
      controls.appendChild(cancelBtn);
      overlay.appendChild(controls);

      document.body.appendChild(overlay);
    });
  }

  /**
   * âœ¨ NEW: Capture current video frame
   */
  private async captureFrame(
    video: HTMLVideoElement,
    lotId: string,
    isPrimary: boolean
  ): Promise<CaptureResult> {
    try {
      // Create canvas to capture frame
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        throw new Error('Failed to get canvas context');
      }

      // Draw current video frame
      ctx.drawImage(video, 0, 0);

      // Convert to blob
      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((b) => {
          if (b) resolve(b);
          else reject(new Error('Failed to create blob'));
        }, 'image/jpeg', 0.9);
      });

      // Generate IDs
      const photoId = generateUUID();
      const blobUrl = URL.createObjectURL(blob);

      console.log('âœ… Web camera photo captured');

      // Save to IndexedDB (non-blocking)
      this.savePhotoToIndexedDB(photoId, lotId, blob, isPrimary).catch(err => {
        console.error('Failed to save to IndexedDB:', err);
      });

      // Sync to Supabase if online (non-blocking)
      if (ConnectivityService.getConnectionStatus()) {
        this.syncPhotoToSupabase(photoId, lotId, blob, isPrimary).catch(err => {
          console.error('Failed to sync to Supabase:', err);
        });
      }

      return {
        success: true,
        photoId,
        blobUrl
      };
    } catch (error: any) {
      console.error('Capture frame error:', error);
      return {
        success: false,
        error: error.message || 'Failed to capture photo'
      };
    }
  }

  /**
   * Stop web camera stream
   */
  private stopWebCamera(): void {
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(track => track.stop());
      this.mediaStream = null;
    }
  }

  /**
   * MOBILE: Native camera with device controls
   */
  async takePhoto(lotId: string, isPrimary: boolean = false): Promise<CaptureResult> {
    if (!PlatformService.isNative()) {
      return {
        success: false,
        error: 'Native camera only available on mobile devices. Use web camera or upload.'
      };
    }

    try {
      console.log('ðŸ“¸ Opening native camera...');

      const image = await Camera.getPhoto({
        quality: 90,
        allowEditing: false,
        resultType: CameraResultType.Base64,
        source: CameraSource.Camera,
        saveToGallery: true,
        correctOrientation: true,
      });

      if (!image.base64String) {
        return {
          success: false,
          error: 'No photo captured'
        };
      }

      const blob = this.base64ToBlob(image.base64String, image.format);
      const photoId = generateUUID();
      const blobUrl = URL.createObjectURL(blob);

      console.log('âœ… Photo captured with native camera');

      this.savePhotoToIndexedDB(photoId, lotId, blob, isPrimary).catch(err => {
        console.error('Failed to save to IndexedDB:', err);
      });

      if (ConnectivityService.getConnectionStatus()) {
        this.syncPhotoToSupabase(photoId, lotId, blob, isPrimary).catch(err => {
          console.error('Failed to sync to Supabase:', err);
        });
      }

      return {
        success: true,
        photoId,
        blobUrl
      };
    } catch (error: any) {
      console.error('Failed to capture photo:', error);
      return {
        success: false,
        error: error.message || 'Failed to capture photo'
      };
    }
  }

  /**
   * MOBILE: Pick from gallery
   */
  async pickFromGallery(lotId: string): Promise<CaptureResult> {
    if (!PlatformService.isNative()) {
      return {
        success: false,
        error: 'Gallery picker only available on mobile devices.'
      };
    }

    try {
      console.log('ðŸ–¼ï¸ Opening gallery...');

      const image = await Camera.getPhoto({
        quality: 90,
        allowEditing: false,
        resultType: CameraResultType.Base64,
        source: CameraSource.Photos,
      });

      if (!image.base64String) {
        return {
          success: false,
          error: 'No photo selected'
        };
      }

      const blob = this.base64ToBlob(image.base64String, image.format);
      const photoId = generateUUID();
      const blobUrl = URL.createObjectURL(blob);

      console.log('âœ… Photo selected from gallery');

      this.savePhotoToIndexedDB(photoId, lotId, blob, false).catch(err => {
        console.error('Failed to save to IndexedDB:', err);
      });

      if (ConnectivityService.getConnectionStatus()) {
        this.syncPhotoToSupabase(photoId, lotId, blob, false).catch(err => {
          console.error('Failed to sync to Supabase:', err);
        });
      }

      return {
        success: true,
        photoId,
        blobUrl
      };
    } catch (error: any) {
      console.error('Failed to pick photo:', error);
      return {
        success: false,
        error: error.message || 'Failed to pick photo'
      };
    }
  }

  /**
   * WEB/DESKTOP: File upload
   */
  async handleFileInput(files: FileList, lotId: string): Promise<FileUploadResult> {
    const result: FileUploadResult = {
      success: 0,
      failed: 0,
      photos: []
    };

    const platform = PlatformService.getPlatform();
    console.log(`ðŸ“‚ Processing ${files.length} file(s) from ${platform}...`);

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      
      // Validate file type
      if (!file.type.startsWith('image/')) {
        console.warn(`Skipping non-image file: ${file.name}`);
        result.failed++;
        continue;
      }

      // Validate file size (max 10MB)
      const maxSize = 10 * 1024 * 1024;
      if (file.size > maxSize) {
        console.warn(`File too large: ${file.name} (${(file.size / 1024 / 1024).toFixed(2)}MB)`);
        result.failed++;
        continue;
      }

      try {
        const blob = new Blob([await file.arrayBuffer()], { type: file.type });
        const photoId = generateUUID();
        const blobUrl = URL.createObjectURL(blob);

        result.photos.push({ photoId, blobUrl });
        result.success++;

        const isPrimary = i === 0 && result.photos.length === 1;
        this.savePhotoToIndexedDB(photoId, lotId, blob, isPrimary).catch(err => {
          console.error('Failed to save file to IndexedDB:', err);
        });

        if (ConnectivityService.getConnectionStatus()) {
          this.syncPhotoToSupabase(photoId, lotId, blob, isPrimary).catch(err => {
            console.error('Failed to sync file to Supabase:', err);
          });
        }
      } catch (error) {
        console.error('File processing error:', error);
        result.failed++;
      }
    }

    console.log(`âœ… Processed ${result.success} file(s), ${result.failed} failed`);
    return result;
  }

  /**
   * Convert base64 to blob
   */
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
   * Save photo to IndexedDB
   */
  private async savePhotoToIndexedDB(
    photoId: string,
    lotId: string,
    blob: Blob,
    isPrimary: boolean
  ): Promise<void> {
    const photoMetadata = {
      id: photoId,
      lot_id: lotId,
      file_path: `${lotId}/${photoId}.jpg`,
      file_name: `Photo_${Date.now()}.jpg`,
      is_primary: isPrimary,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      synced: false
    };

    await offlineStorage.savePhoto(photoMetadata, blob);
    console.log('âœ… Photo saved to IndexedDB');
  }

  /**
   * Sync photo to Supabase
   */
  private async syncPhotoToSupabase(
    photoId: string,
    lotId: string,
    blob: Blob,
    isPrimary: boolean
  ): Promise<void> {
    SyncService.startOperation();
    try {
      const fileName = `${lotId}/${photoId}.jpg`;
      const file = new File([blob], `${photoId}.jpg`, { type: blob.type });

      const { error: uploadError } = await supabase.storage
        .from('photos')
        .upload(fileName, file, {
          cacheControl: '3600',
          upsert: true
        });

      if (uploadError) {
        console.error('Supabase upload error:', uploadError);
        return;
      }

      const { error: dbError } = await supabase
        .from('photos')
        .upsert({
          id: photoId,
          lot_id: lotId,
          file_path: fileName,
          file_name: `Photo_${Date.now()}.jpg`,
          is_primary: isPrimary,
        }, {
          onConflict: 'id'
        });

      if (dbError) {
        console.error('Supabase database error:', dbError);
        return;
      }

      const photo = await offlineStorage.getPhoto(photoId);
      if (photo) {
        photo.synced = true;
        await offlineStorage.updatePhoto(photo);
      }

      console.log('Photo synced to Supabase');
    } catch (error) {
      console.error('Supabase sync error:', error);
    } finally {
      SyncService.endOperation();
    }
  }

  /**
   * Sync all unsynced photos
   */
  async syncUnsyncedPhotos(): Promise<void> {
    if (!ConnectivityService.getConnectionStatus()) {
      console.log('Cannot sync photos while offline');
      return;
    }

    try {
      const unsyncedPhotos = await offlineStorage.getUnsyncedPhotos();
      
      for (const photo of unsyncedPhotos) {
        const blob = await offlineStorage.getPhotoBlob(photo.id);
        if (blob) {
          await this.syncPhotoToSupabase(
            photo.id,
            photo.lot_id,
            blob,
            photo.is_primary
          );
        }
      }

      console.log(`âœ… Synced ${unsyncedPhotos.length} photos to Supabase`);
    } catch (error) {
      console.error('Batch sync error:', error);
    }
  }

  /**
   * Get platform capabilities
   */
  getPlatformCapabilities() {
    const caps = PlatformService.getPhotoCapabilities();
    return {
      ...caps,
      supportsWebCamera: caps.isWeb && caps.hasCamera,
      supportsNativeCamera: caps.isNative,
      supportsFileUpload: true
    };
  }

  /**
   * Cleanup resources
   */
  cleanup(): void {
    this.stopWebCamera();
  }
}

export default new CameraService();