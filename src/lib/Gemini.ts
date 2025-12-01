// Gemini AI Integration - WORKING MODELS FROM YOUR API
import { GoogleGenerativeAI } from '@google/generative-ai';

let genAI: GoogleGenerativeAI | null = null;

// Models available in your API key (from discovery)
const VISION_MODELS = [
  'gemini-2.5-flash',           // Latest, fast
  'gemini-flash-latest',        // Alias to latest flash
  'gemini-2.0-flash',           // Stable 2.0
  'gemini-2.5-pro',             // Most powerful
  'gemini-pro-latest'           // Alias to latest pro
];

let workingModel: string | null = null;

export interface EnrichedLotData {
  enrichedDescription?: string;
  suggestedCategory?: string;
  estimatedPeriod?: string;
  keywords?: string[];
  condition?: string;
  error?: string;
}

export interface ImageProcessingOptions {
  removeBackground?: boolean;
  backgroundColor?: 'white' | 'black' | 'grey';
  straighten?: boolean;
  imageScale?: number;
  brightness?: number; // -100 to 100
  customPrompt?: string;
}

export interface ProcessedImageResult {
  success: boolean;
  processedImageData?: string;
  error?: string;
}

export function initializeGemini(apiKey: string): void {
  if (apiKey && apiKey.trim() !== '') {
    genAI = new GoogleGenerativeAI(apiKey);
    console.log('Gemini API initialized');
  }
}

function getApiKey(): string | null {
  return import.meta.env.VITE_GEMINI_API_KEY || null;
}

function isGeminiReady(): boolean {
  if (!genAI) {
    const apiKey = getApiKey();
    if (apiKey) {
      initializeGemini(apiKey);
    }
  }
  return genAI !== null;
}

async function getVisionModel() {
  if (!genAI) throw new Error('Gemini not initialized');

  if (workingModel) {
    return genAI.getGenerativeModel({ model: workingModel });
  }

  for (const modelName of VISION_MODELS) {
    try {
      console.log(`Trying model: ${modelName}`);
      const model = genAI.getGenerativeModel({ model: modelName });
      
      // Simple test
      const testResult = await model.generateContent(['Test']);
      await testResult.response;
      
      workingModel = modelName;
      console.log(`âœ… Found working model: ${modelName}`);
      return model;
    } catch {
      console.log(`âŒ Model ${modelName} failed`);
      continue;
    }
  }

  throw new Error('No working Gemini vision model found');
}

export async function processImages(
  imageBlobs: Blob[],
  options: ImageProcessingOptions
): Promise<ProcessedImageResult[]> {
  if (!isGeminiReady()) {
    return imageBlobs.map(() => ({
      success: false,
      error: 'Gemini API not configured'
    }));
  }

  const results: ProcessedImageResult[] = [];

  for (const blob of imageBlobs) {
    try {
      const result = await processSingleImage(blob, options);
      results.push(result);
    } catch (error) {
      results.push({
        success: false,
        error: error instanceof Error ? error.message : 'Processing failed'
      });
    }
  }

  return results;
}

async function processSingleImage(
  blob: Blob,
  options: ImageProcessingOptions
): Promise<ProcessedImageResult> {
  if (!genAI) {
    return {
      success: false,
      error: 'Gemini API not initialized'
    };
  }

  try {
    const base64 = await blobToBase64(blob);
    const prompt = buildProcessingPrompt(options);
    const model = await getVisionModel();
    
    const imagePart = {
      inlineData: {
        data: base64.split(',')[1],
        mimeType: blob.type
      }
    };

    const result = await model.generateContent([prompt, imagePart]);
    const response = await result.response;
    const text = response.text();

    return {
      success: true,
      processedImageData: base64,
      error: `AI Analysis: ${text}`
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Processing failed'
    };
  }
}

function buildProcessingPrompt(options: ImageProcessingOptions): string {
  const instructions: string[] = [];

  if (options.removeBackground) {
    instructions.push('Remove the background from this image');
  }

  if (options.backgroundColor) {
    instructions.push(`Change the background color to ${options.backgroundColor}`);
  }

  if (options.straighten) {
    instructions.push('Straighten the image if it appears tilted');
  }

  if (options.imageScale && options.imageScale !== 85) {
    instructions.push(`Ensure the main subject occupies ${options.imageScale}% of the frame`);
  }

  if (options.customPrompt) {
    instructions.push(options.customPrompt);
  }

  if (instructions.length === 0) {
    return 'Analyze this image and suggest improvements for an auction catalog photo';
  }

  return `Analyze this auction item image and provide instructions for: ${instructions.join(', ')}. Describe what edits would improve this image for an auction catalog.`;
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

export async function enrichLotData(photoUrls: string[]): Promise<EnrichedLotData> {
  if (!isGeminiReady()) {
    return {
      enrichedDescription: 'AI enrichment is not available',
      suggestedCategory: '',
      estimatedPeriod: '',
      keywords: [],
      condition: '',
      error: 'Gemini API not configured'
    };
  }

  console.log('AI enrichment requested for', photoUrls.length, 'photos');

  try {
    const model = await getVisionModel();

    const photoResponse = await fetch(photoUrls[0]);
    const photoBlob = await photoResponse.blob();
    const base64 = await blobToBase64(photoBlob);

    const imagePart = {
      inlineData: {
        data: base64.split(',')[1],
        mimeType: photoBlob.type
      }
    };

    const prompt = `Analyze this auction item image and provide:
1. A detailed description for an auction catalog
2. Suggested category
3. Estimated time period or era
4. Relevant keywords
5. Condition assessment

Format your response as JSON with keys: description, category, period, keywords (array), condition`;

    const result = await model.generateContent([prompt, imagePart]);
    const response = await result.response;
    const text = response.text();

    try {
      const parsed = JSON.parse(text);
      return {
        enrichedDescription: parsed.description,
        suggestedCategory: parsed.category,
        estimatedPeriod: parsed.period,
        keywords: parsed.keywords || [],
        condition: parsed.condition
      };
    } catch {
      return {
        enrichedDescription: text,
        suggestedCategory: '',
        estimatedPeriod: '',
        keywords: [],
        condition: ''
      };
    }
  } catch (error) {
    return {
      enrichedDescription: '',
      suggestedCategory: '',
      estimatedPeriod: '',
      keywords: [],
      condition: '',
      error: error instanceof Error ? error.message : 'Enrichment failed'
    };
  }
}

export default {
  enrichLotData,
  initializeGemini,
  processImages
};