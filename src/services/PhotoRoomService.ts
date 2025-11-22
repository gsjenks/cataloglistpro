// src/services/PhotoRoomService.ts - PhotoRoom AI for professional image editing
import type { ImageProcessingOptions } from '../lib/Gemini';

const PHOTOROOM_API_KEY = import.meta.env.VITE_PHOTOROOM_API_KEY;

export interface ImagenEditResult {
  success: boolean;
  editedBlob?: Blob;
  editedDataUrl?: string;
  changes: string[];
  error?: string;
}

/**
 * Edit images using PhotoRoom AI
 */
export async function editImageWithImagen(
  imageBlob: Blob,
  options: ImageProcessingOptions
): Promise<ImagenEditResult> {
  const changes: string[] = [];

  if (!PHOTOROOM_API_KEY) {
    return {
      success: false,
      changes: [],
      error: 'PhotoRoom API key not configured. Add VITE_PHOTOROOM_API_KEY to .env'
    };
  }

  try {
    const prompt = options.customPrompt?.trim();
    
    if (!prompt) {
      return {
        success: false,
        changes: [],
        error: 'No editing instructions provided'
      };
    }

    // PhotoRoom API endpoint
    const endpoint = 'https://sdk.photoroom.com/v1/segment';

    // Build form data
    const formData = new FormData();
    formData.append('image_file', imageBlob, 'image.jpg');
    
    // Parse user instructions into PhotoRoom parameters
    const lowerPrompt = prompt.toLowerCase();
    
    // Background removal
    if (lowerPrompt.includes('remove background') || lowerPrompt.includes('white background')) {
      formData.append('bg.color', 'ffffff');
      changes.push('Background removed');
    } else if (lowerPrompt.includes('black background')) {
      formData.append('bg.color', '000000');
      changes.push('Black background');
    } else if (lowerPrompt.includes('gray background') || lowerPrompt.includes('grey background')) {
      formData.append('bg.color', 'cccccc');
      changes.push('Grey background');
    }
    
    // Shadow
    if (lowerPrompt.includes('shadow')) {
      formData.append('shadow.mode', 'ai');
      changes.push('Added shadow');
    }
    
    // Padding/margin
    if (lowerPrompt.includes('padding') || lowerPrompt.includes('margin')) {
      formData.append('padding', '0.1');
    }

    console.log('🎨 Sending to PhotoRoom:', prompt);
    console.log('📋 Changes:', changes);

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'x-api-key': PHOTOROOM_API_KEY
      },
      body: formData
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('PhotoRoom API error:', errorText);
      throw new Error(`PhotoRoom API error: ${response.status} - ${errorText}`);
    }

    // Get edited image as blob
    const editedBlob = await response.blob();
    
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

export default {
  editImageWithImagen
};