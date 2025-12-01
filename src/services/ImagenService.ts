// src/services/ImagenService.ts - Google Imagen on Vertex AI
import type { ImageProcessingOptions } from '../lib/Gemini';

const PROJECT_ID = import.meta.env.VITE_GOOGLE_CLOUD_PROJECT_ID;
const LOCATION = import.meta.env.VITE_GOOGLE_CLOUD_LOCATION;
const API_KEY = import.meta.env.VITE_GOOGLE_CLOUD_API_KEY;

export interface ImagenEditResult {
  success: boolean;
  editedBlob?: Blob;
  editedDataUrl?: string;
  changes: string[];
  error?: string;
}

/**
 * Edit images using Google Imagen on Vertex AI
 */
export async function editImageWithImagen(
  imageBlob: Blob,
  options: ImageProcessingOptions
): Promise<ImagenEditResult> {
  const changes: string[] = [];

  if (!PROJECT_ID || !LOCATION || !API_KEY) {
    return {
      success: false,
      changes: [],
      error: 'Google Cloud credentials not configured. Check .env for PROJECT_ID, LOCATION, and API_KEY'
    };
  }

  try {
    // Convert image to base64
    const base64Image = await blobToBase64(imageBlob);
    const imageData = base64Image.split(',')[1];

    // Build edit prompt
    const prompt = buildEditPrompt(options, changes);
    
    if (!prompt) {
      return {
        success: false,
        changes: [],
        error: 'No edits selected'
      };
    }

    // Imagen endpoint - using generate with strong preservation instructions
    const endpoint = `https://${LOCATION}-aiplatform.googleapis.com/v1/projects/${PROJECT_ID}/locations/${LOCATION}/publishers/google/models/imagen-3.0-generate-001:predict`;

    // Build request with preservation focus
    const enhancedPrompt = `Using the provided reference image, ${prompt}. IMPORTANT: Keep the exact same object/subject from the reference image - only modify what was requested, do not replace or change the subject itself.`;
    
    const requestBody = {
      instances: [
        {
          prompt: enhancedPrompt,
          referenceImages: [
            {
              referenceType: 1,  // Subject reference
              referenceImage: {
                bytesBase64Encoded: imageData
              }
            }
          ]
        }
      ],
      parameters: {
        sampleCount: 1,
        negativePrompt: "different object, replaced subject, new item, completely different, unrealistic, blurry, low quality, distorted",
        sampleImageSize: "1024"
      }
    };

    console.log('🎨 Sending request to Imagen with subject preservation');
    console.log('📝 User prompt:', prompt);
    console.log('🔧 Enhanced prompt:', enhancedPrompt);

    const response = await fetch(`${endpoint}?key=${API_KEY}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Imagen API error:', errorText);
      throw new Error(`Imagen API error: ${response.status} - ${errorText}`);
    }

    const result = await response.json();
    
    if (!result.predictions || result.predictions.length === 0) {
      throw new Error('No edited image returned from Imagen');
    }

    // Extract edited image
    const editedImageBase64 = result.predictions[0].bytesBase64Encoded;
    const editedBlob = base64ToBlob(editedImageBase64, 'image/jpeg');
    const editedDataUrl = `data:image/jpeg;base64,${editedImageBase64}`;

    return {
      success: true,
      editedBlob,
      editedDataUrl,
      changes
    };

  } catch (error) {
    console.error('Imagen edit error:', error);
    return {
      success: false,
      changes: [],
      error: error instanceof Error ? error.message : 'Image edit failed'
    };
  }
}

/**
 * Build edit prompt from options
 */
function buildEditPrompt(options: ImageProcessingOptions, changes: string[]): string {
  // If custom prompt provided, pass it directly without modification
  if (options.customPrompt && options.customPrompt.trim()) {
    changes.push('Custom AI instructions applied');
    return options.customPrompt.trim();
  }

  // No custom prompt - use standard options only
  const instructions: string[] = [];

  if (options.removeBackground) {
    instructions.push('remove the background and replace it with a clean white background');
    changes.push('Background removed');
  }

  if (options.backgroundColor) {
    const colorNames = { white: 'white', black: 'black', grey: 'light grey' };
    instructions.push(`replace the background with a solid ${colorNames[options.backgroundColor]} background`);
    changes.push(`${options.backgroundColor} background`);
  }

  if (options.straighten) {
    instructions.push('straighten the image and ensure the subject is level and properly aligned');
    changes.push('Straightened');
  }

  if (options.brightness && options.brightness !== 0) {
    if (options.brightness > 0) {
      instructions.push(`increase brightness by ${options.brightness}%`);
      changes.push(`Brightened +${options.brightness}`);
    } else {
      instructions.push(`decrease brightness by ${Math.abs(options.brightness)}%`);
      changes.push(`Darkened ${options.brightness}`);
    }
  }

  if (instructions.length === 0) {
    return '';
  }

  return `Professional product photography: ${instructions.join(', ')}. Maintain the original subject and product details. Output should be clean, professional, and suitable for an auction catalog.`;
}

/**
 * Convert blob to base64
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
 * Convert base64 to blob
 */
function base64ToBlob(base64: string, mimeType: string): Blob {
  const byteCharacters = atob(base64);
  const byteNumbers = new Array(byteCharacters.length);
  
  for (let i = 0; i < byteCharacters.length; i++) {
    byteNumbers[i] = byteCharacters.charCodeAt(i);
  }
  
  const byteArray = new Uint8Array(byteNumbers);
  return new Blob([byteArray], { type: mimeType });
}

export default {
  editImageWithImagen
};