// lib/camera.ts
// MOBILE-FIRST: Photos automatically saved to device photo gallery
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';

/**
 * Take a picture with device camera
 * CRITICAL: Photo is automatically saved to device photo gallery
 * VERIFIED: saveToGallery: true ensures native camera saves to gallery
 */
export async function takePicture() {
  const image = await Camera.getPhoto({
    quality: 90,
    allowEditing: false,
    resultType: CameraResultType.Uri,
    source: CameraSource.Camera,
    saveToGallery: true,  // GUARANTEED: Save to device gallery
    correctOrientation: true,
  });

  return image.webPath;
}

/**
 * Select a photo from device gallery
 */
export async function selectFromGallery() {
  const image = await Camera.getPhoto({
    quality: 90,
    allowEditing: false,
    resultType: CameraResultType.Uri,
    source: CameraSource.Photos
  });

  return image.webPath;
}