// services/ImageAnalysisService.ts
// Image analysis using TensorFlow COCO-SSD for object detection/counting
// Reference object: Samsung Galaxy S6 (5.65" x 2.78")

import * as tf from '@tensorflow/tfjs';
import * as cocoSsd from '@tensorflow-models/coco-ssd';
import type { Photo, Lot } from '../types';

interface DetectedObject {
  class: string;
  score: number;
  bbox: [number, number, number, number]; // [x, y, width, height]
}

export interface AnalysisResult {
  count: number;
  measurements?: {
    height?: number;
    width?: number;
    depth?: number;
    unit: string;
  };
  weight?: number;
  detectedObjects: DetectedObject[];
  confidence: number;
  referenceFound: boolean;
  referenceType?: string;
}

// Default phone dimensions (Samsung Galaxy S6)
const DEFAULT_PHONE = {
  name: 'Samsung Galaxy S6',
  height: 5.65,  // inches
  width: 2.78,   // inches
};

// Get reference phone from localStorage or use default
function getReferencePhone(): { name: string; height: number; width: number } {
  try {
    const saved = localStorage.getItem('referencePhone');
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed.height && parsed.width) {
        return {
          name: parsed.name || 'Custom Phone',
          height: parsed.height,
          width: parsed.width
        };
      }
    }
  } catch (e) {
    console.error('Error reading reference phone from localStorage:', e);
  }
  return DEFAULT_PHONE;
}

// COCO-SSD classes that can be used as reference objects
// Note: 'cell phone' dimensions are loaded dynamically from settings
const REFERENCE_OBJECTS: Record<string, { height: number; width: number } | 'phone'> = {
  'cell phone': 'phone', // Special marker to use getReferencePhone()
  'apple': { height: 3.0, width: 3.0 },
  'banana': { height: 1.5, width: 7.0 },
  'remote': { height: 1.5, width: 6.5 },
  'mouse': { height: 2.5, width: 4.5 },
  'spoon': { height: 1.5, width: 7.0 },
  'fork': { height: 1.0, width: 7.0 },
  'knife': { height: 1.0, width: 8.0 },
  'keyboard': { height: 6.0, width: 17.0 },
};

// Weight estimates by object category (in ounces)
const WEIGHT_ESTIMATES: Record<string, number> = {
  'book': 14,
  'bottle': 18,
  'cup': 7,
  'bowl': 10,
  'vase': 28,
  'clock': 18,
  'wine glass': 5,
  'laptop': 64,
  'keyboard': 32,
  'mouse': 3,
  'remote': 4,
  'default': 8
};

class ImageAnalysisService {
  private model: cocoSsd.ObjectDetection | null = null;
  private modelLoading: Promise<void> | null = null;

  /**
   * Initialize TensorFlow and load COCO-SSD model
   */
  async initialize(): Promise<void> {
    if (this.model) return;
    
    if (this.modelLoading) {
      await this.modelLoading;
      return;
    }

    this.modelLoading = (async () => {
      try {
        console.log('🤖 Loading TensorFlow COCO-SSD model...');
        await tf.ready();
        this.model = await cocoSsd.load();
        console.log('[OK] Model loaded successfully');
      } catch (error) {
        console.error('Failed to load TensorFlow model:', error);
        throw error;
      }
    })();

    await this.modelLoading;
  }

  /**
   * Analyze image for object counting and measurements
   */
  async analyzeImage(imageUrl: string): Promise<AnalysisResult> {
    await this.initialize();

    if (!this.model) {
      throw new Error('Model not initialized');
    }

    try {
      console.log('🔍 Analyzing image...');

      // Load image
      const img = await this.loadImage(imageUrl);
      
      // Detect objects (lower threshold to catch more)
      const predictions = await this.model.detect(img, undefined, 0.3);
      
      console.log(`📱 Found ${predictions.length} objects:`, predictions.map(p => `${p.class} (${Math.round(p.score * 100)}%)`));
      
      // Specifically log phone detections
      const phoneDetections = predictions.filter(p => p.class === 'cell phone');
      console.log(`📱 Cell phone detections: ${phoneDetections.length}`, phoneDetections);

      // Convert to our format
      const detectedObjects: DetectedObject[] = predictions.map(p => ({
        class: p.class,
        score: p.score,
        bbox: p.bbox as [number, number, number, number]
      }));

      // Find reference object (cell phone preferred)
      const referenceObject = this.findReferenceObject(detectedObjects);
      const referenceFound = referenceObject !== null;
      const referenceType = referenceObject ? this.getReferenceName(referenceObject.class) : undefined;

      // Get target objects (exclude reference)
      const targetObjects = detectedObjects.filter(obj => 
        !this.isReferenceObject(obj.class) && obj.score > 0.3
      );
      const count = targetObjects.length;

      // Calculate measurements if reference found
      let measurements = undefined;
      if (referenceFound && referenceObject && targetObjects.length > 0) {
        const pixelsPerInch = this.calculatePixelsPerInch(referenceObject);
        measurements = this.calculateMeasurements(targetObjects[0].bbox, pixelsPerInch);
      }

      // Estimate weight based on object types
      const weight = this.estimateWeight(targetObjects, measurements);

      // Overall confidence
      const confidence = targetObjects.length > 0
        ? targetObjects.reduce((sum, obj) => sum + obj.score, 0) / targetObjects.length
        : 0;

      return {
        count,
        measurements,
        weight,
        detectedObjects,
        confidence: Math.round(confidence * 100) / 100,
        referenceFound,
        referenceType
      };
    } catch (error) {
      console.error('Image analysis error:', error);
      throw error;
    }
  }

  /**
   * Analyze multiple images and combine results
   */
  async analyzeMultipleImages(imageUrls: string[]): Promise<AnalysisResult> {
    if (imageUrls.length === 0) {
      throw new Error('No images to analyze');
    }

    const results: AnalysisResult[] = [];
    
    for (const url of imageUrls) {
      try {
        const result = await this.analyzeImage(url);
        results.push(result);
      } catch (error) {
        console.error('Error analyzing image:', error);
      }
    }

    if (results.length === 0) {
      throw new Error('Failed to analyze any images');
    }

    // Use result with reference if available
    const withReference = results.filter(r => r.referenceFound);
    const bestResult = withReference.length > 0 ? withReference[0] : results[0];

    // Sum counts (rough - may double count)
    const totalCount = Math.max(...results.map(r => r.count));

    // Combine detected objects
    const allObjects = results.flatMap(r => r.detectedObjects);

    // Average confidence
    const avgConfidence = results.reduce((sum, r) => sum + r.confidence, 0) / results.length;

    return {
      count: totalCount,
      measurements: bestResult.measurements,
      weight: bestResult.weight,
      detectedObjects: allObjects,
      confidence: Math.round(avgConfidence * 100) / 100,
      referenceFound: withReference.length > 0,
      referenceType: bestResult.referenceType
    };
  }

  /**
   * Load image from URL
   */
  private loadImage(url: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Failed to load image'));
      img.src = url;
    });
  }

  /**
   * Find best reference object (prefer cell phone)
   */
  private findReferenceObject(objects: DetectedObject[]): DetectedObject | null {
    // Prioritize cell phone (lower threshold to 0.3)
    const phone = objects.find(obj => obj.class === 'cell phone' && obj.score > 0.3);
    if (phone) {
      console.log(`[OK] Found reference phone with ${Math.round(phone.score * 100)}% confidence`);
      return phone;
    }

    // Fall back to other reference objects
    for (const obj of objects) {
      if (this.isReferenceObject(obj.class) && obj.score > 0.3) {
        console.log(`[OK] Found reference ${obj.class} with ${Math.round(obj.score * 100)}% confidence`);
        return obj;
      }
    }
    
    console.log('âŒ No reference object found');
    return null;
  }

  /**
   * Check if object is a known reference
   */
  private isReferenceObject(className: string): boolean {
    return className in REFERENCE_OBJECTS;
  }

  /**
   * Get reference object display name
   */
  private getReferenceName(className: string): string {
    if (className === 'cell phone') {
      return getReferencePhone().name;
    }
    return className;
  }

  /**
   * Calculate pixels per inch from reference object
   */
  private calculatePixelsPerInch(refObject: DetectedObject): number {
    const [, , pixelWidth, pixelHeight] = refObject.bbox;
    
    // Get reference size - handle cell phone specially
    let refSize: { height: number; width: number };
    if (refObject.class === 'cell phone') {
      const phone = getReferencePhone();
      refSize = { height: phone.height, width: phone.width };
    } else {
      const size = REFERENCE_OBJECTS[refObject.class];
      if (!size || size === 'phone') {
        return 100; // fallback
      }
      refSize = size;
    }
    
    // Use the larger dimension for more accuracy
    const pixelsPerInchWidth = pixelWidth / refSize.width;
    const pixelsPerInchHeight = pixelHeight / refSize.height;
    
    return (pixelsPerInchWidth + pixelsPerInchHeight) / 2;
  }

  /**
   * Calculate real-world measurements
   */
  private calculateMeasurements(
    bbox: [number, number, number, number],
    pixelsPerInch: number
  ): { height?: number; width?: number; depth?: number; unit: string } {
    const [, , pixelWidth, pixelHeight] = bbox;
    
    const widthInches = pixelWidth / pixelsPerInch;
    const heightInches = pixelHeight / pixelsPerInch;

    return {
      width: Math.round(widthInches * 10) / 10,
      height: Math.round(heightInches * 10) / 10,
      unit: 'inches'
    };
  }

  /**
   * Estimate weight based on object type and size
   */
  private estimateWeight(
    objects: DetectedObject[],
    measurements?: { height?: number; width?: number; depth?: number; unit: string }
  ): number | undefined {
    if (objects.length === 0) return undefined;

    const primaryObject = objects[0];
    const baseWeight = WEIGHT_ESTIMATES[primaryObject.class] || WEIGHT_ESTIMATES.default;

    // Scale weight by size if measurements available
    let scaledWeight = baseWeight;
    if (measurements?.width && measurements?.height) {
      const area = measurements.width * measurements.height;
      const scaleFactor = Math.sqrt(area / 30); // normalize to ~30 sq inches
      scaledWeight = baseWeight * Math.max(0.5, Math.min(2.5, scaleFactor));
    }

    // Convert to pounds
    const weightLbs = (scaledWeight * objects.length) / 16;
    return Math.round(weightLbs * 10) / 10;
  }

  /**
   * Batch analyze photos for a lot
   */
  async analyzeLotPhotos(photos: Photo[], photoUrls: Record<string, string>): Promise<AnalysisResult> {
    if (photos.length === 0) {
      throw new Error('No photos to analyze');
    }

    const urls = photos
      .map(p => photoUrls[p.id])
      .filter(url => url && url.length > 0);

    if (urls.length === 0) {
      throw new Error('No photo URLs available');
    }

    return this.analyzeMultipleImages(urls);
  }

  /**
   * Get suggested lot values from analysis
   */
  getSuggestedMeasurements(result: AnalysisResult): Partial<Lot> {
    const updates: Partial<Lot> = {};

    if (result.count > 0) {
      updates.quantity = result.count;
    }

    if (result.measurements) {
      updates.height = result.measurements.height;
      updates.width = result.measurements.width;
      updates.depth = result.measurements.depth;
      updates.dimension_unit = result.measurements.unit;
    }

    if (result.weight) {
      updates.weight = result.weight;
    }

    return updates;
  }

  /**
   * Cleanup
   */
  dispose(): void {
    if (this.model) {
      this.model = null;
    }
  }
}

export default new ImageAnalysisService();