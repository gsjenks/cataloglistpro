// src/services/PhotoRoomService.ts - PhotoRoom AI for professional image editing

const PHOTOROOM_API_KEY = import.meta.env.VITE_PHOTOROOM_API_KEY;

export interface PhotoRoomEditOptions {
  removeBackground?: boolean;
  backgroundColor?: 'white' | 'black' | 'grey' | 'transparent' | string;
  fillPercentage?: number; // 50-100% of frame
  lightBalance?: number;   // -100 to +100
  addShadow?: boolean;
}

export interface PhotoRoomEditResult {
  success: boolean;
  editedBlob?: Blob;
  editedDataUrl?: string;
  changes: string[];
  error?: string;
}

const BG_COLOR_MAP: Record<string, string> = {
  white: 'ffffff',
  black: '000000',
  grey: 'cccccc',
  gray: 'cccccc',
  transparent: 'transparent'
};

/**
 * Edit images using PhotoRoom API
 */
export async function editWithPhotoRoom(
  imageBlob: Blob,
  options: PhotoRoomEditOptions
): Promise<PhotoRoomEditResult> {
  const changes: string[] = [];

  if (!PHOTOROOM_API_KEY) {
    return {
      success: false,
      changes: [],
      error: 'PhotoRoom API key not configured. Add VITE_PHOTOROOM_API_KEY to .env'
    };
  }

  try {
    // Build form data for PhotoRoom API
    const formData = new FormData();
    formData.append('image_file', imageBlob, 'image.jpg');

    // Shadow - use correct parameter name
    if (options.addShadow) {
      formData.append('shadow', 'ai.soft');
      changes.push('Added soft shadow');
    }

    // Fill percentage (padding calculation)
    if (options.fillPercentage && options.fillPercentage >= 50 && options.fillPercentage <= 100) {
      const paddingFraction = ((100 - options.fillPercentage) / 100) / 2;
      formData.append('padding', paddingFraction.toFixed(3));
      changes.push(`Resized to fill ${options.fillPercentage}% of frame`);
    }

    // Output format - PNG for transparency support
    formData.append('format', 'png');

    console.log('📸 PhotoRoom processing:', {
      backgroundColor: options.backgroundColor,
      fillPercentage: options.fillPercentage,
      lightBalance: options.lightBalance
    });

    // Call PhotoRoom segment API - returns transparent PNG
    const response = await fetch('https://sdk.photoroom.com/v1/segment', {
      method: 'POST',
      headers: {
        'x-api-key': PHOTOROOM_API_KEY
      },
      body: formData
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('PhotoRoom API error:', errorText);
      throw new Error(`PhotoRoom API error: ${response.status}`);
    }

    let editedBlob = await response.blob();

    // Apply background color by compositing onto colored canvas
    // PhotoRoom segment API only returns transparent PNGs
    if (options.backgroundColor && options.backgroundColor !== 'transparent') {
      editedBlob = await applyBackgroundColor(editedBlob, options.backgroundColor);
      changes.push(`Background: ${options.backgroundColor}`);
    } else if (options.removeBackground || options.backgroundColor === 'transparent') {
      changes.push('Background removed');
    }

    // Apply light balance adjustment if needed (client-side canvas processing)
    if (options.lightBalance && options.lightBalance !== 0) {
      editedBlob = await adjustLightBalance(editedBlob, options.lightBalance);
      changes.push(`Light balance: ${options.lightBalance > 0 ? '+' : ''}${options.lightBalance}`);
    }

    // Convert to data URL for preview
    const editedDataUrl = await blobToBase64(editedBlob);

    return {
      success: true,
      editedBlob,
      editedDataUrl,
      changes: changes.length > 0 ? changes : ['Image processed']
    };

  } catch (error) {
    console.error('PhotoRoom edit error:', error);
    return {
      success: false,
      changes: [],
      error: error instanceof Error ? error.message : 'Image edit failed'
    };
  }
}

/**
 * Apply background color by compositing transparent image onto colored canvas
 */
async function applyBackgroundColor(blob: Blob, bgColor: string): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      
      if (!ctx) {
        resolve(blob);
        return;
      }

      // Fill with background color
      const colorHex = BG_COLOR_MAP[bgColor.toLowerCase()] || bgColor;
      ctx.fillStyle = `#${colorHex}`;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      
      // Draw transparent image on top
      ctx.drawImage(img, 0, 0);
      
      canvas.toBlob((newBlob) => {
        URL.revokeObjectURL(img.src);
        resolve(newBlob || blob);
      }, 'image/png');
    };
    img.onerror = () => {
      URL.revokeObjectURL(img.src);
      reject(new Error('Failed to apply background color'));
    };
    img.src = URL.createObjectURL(blob);
  });
}

/**
 * Adjust light balance using canvas
 */
async function adjustLightBalance(blob: Blob, adjustment: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      
      if (!ctx) {
        resolve(blob);
        return;
      }

      ctx.drawImage(img, 0, 0);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;

      // Normalize adjustment to -1 to 1 range
      const factor = adjustment / 100;
      const brightnessAdjust = factor * 50; // Max Â±50 brightness

      for (let i = 0; i < data.length; i += 4) {
        data[i] = Math.min(255, Math.max(0, data[i] + brightnessAdjust));     // R
        data[i + 1] = Math.min(255, Math.max(0, data[i + 1] + brightnessAdjust)); // G
        data[i + 2] = Math.min(255, Math.max(0, data[i + 2] + brightnessAdjust)); // B
      }

      ctx.putImageData(imageData, 0, 0);
      canvas.toBlob((newBlob) => {
        URL.revokeObjectURL(img.src);
        resolve(newBlob || blob);
      }, 'image/png');
    };
    img.onerror = () => {
      URL.revokeObjectURL(img.src);
      reject(new Error('Failed to load image for brightness adjustment'));
    };
    img.src = URL.createObjectURL(blob);
  });
}

/**
 * Convert blob to base64 data URL
 */
function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * Process multiple images with same options
 */
export async function batchEditWithPhotoRoom(
  images: { id: string; blob: Blob }[],
  options: PhotoRoomEditOptions,
  onProgress?: (completed: number, total: number) => void
): Promise<Map<string, PhotoRoomEditResult>> {
  const results = new Map<string, PhotoRoomEditResult>();
  
  for (let i = 0; i < images.length; i++) {
    const { id, blob } = images[i];
    const result = await editWithPhotoRoom(blob, options);
    results.set(id, result);
    onProgress?.(i + 1, images.length);
  }
  
  return results;
}

export default {
  editWithPhotoRoom,
  batchEditWithPhotoRoom
};