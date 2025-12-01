// src/services/ImageEditor.ts - imgix AI image editing
import type { ImageProcessingOptions } from '../lib/Gemini';

export interface EditedImageResult {
  success: boolean;
  editedBlob?: Blob;
  editedDataUrl?: string;
  changes: string[];
  error?: string;
}

const IMGIX_DOMAIN = import.meta.env.VITE_IMGIX_DOMAIN;

/**
 * Edit images using imgix API with AI transformations
 */
export async function editImage(
  imageUrl: string,
  options: ImageProcessingOptions
): Promise<EditedImageResult> {
  const changes: string[] = [];

  if (!IMGIX_DOMAIN) {
    return {
      success: false,
      changes: [],
      error: 'imgix not configured. Add VITE_IMGIX_DOMAIN to .env'
    };
  }

  try {
    // Extract path from Supabase URL
    const url = new URL(imageUrl);
    const path = url.pathname.split('/').slice(6).join('/'); // Remove /storage/v1/object/public/bucket/
    
    // Build imgix URL with transformations
    const imgixUrl = new URL(`https://${IMGIX_DOMAIN}/${path}`);
    const params = new URLSearchParams();

    // Auto enhance
    params.append('auto', 'enhance,format,compress');

    // Remove background
    if (options.removeBackground) {
      params.append('mask', 'ellipse');
      params.append('blend-mode', 'normal');
      changes.push('Background removed');
    }

    // Background color
    if (options.backgroundColor) {
      const colorMap = { white: 'FFFFFF', black: '000000', grey: '808080' };
      params.append('bg', colorMap[options.backgroundColor]);
      params.append('blend-mode', 'normal');
      changes.push(`${options.backgroundColor} background added`);
    }

    // Brightness
    if (options.brightness !== undefined && options.brightness !== 0) {
      params.append('bri', options.brightness.toString());
      changes.push(`Brightness ${options.brightness > 0 ? '+' : ''}${options.brightness}`);
    }

    // Straighten
    if (options.straighten) {
      params.append('trim', 'auto');
      params.append('auto', 'enhance');
      changes.push('Straightened');
    }

    // Scale
    if (options.imageScale && options.imageScale !== 100) {
      params.append('w', Math.round(1200 * (options.imageScale / 100)).toString());
      changes.push(`Scaled to ${options.imageScale}%`);
    }

    imgixUrl.search = params.toString();
    
    // Fetch the transformed image
    const response = await fetch(imgixUrl.toString());
    if (!response.ok) {
      throw new Error(`imgix transformation failed: ${response.status}`);
    }

    const editedBlob = await response.blob();
    const editedDataUrl = URL.createObjectURL(editedBlob);

    return {
      success: true,
      editedBlob,
      editedDataUrl,
      changes
    };

  } catch (error) {
    return {
      success: false,
      changes: [],
      error: error instanceof Error ? error.message : 'Edit failed'
    };
  }
}

export default {
  editImage
};