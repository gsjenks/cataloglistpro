// src/services/ScannerService.ts
// QR decoding for the estate-sale floor. Uses the native BarcodeDetector API
// when available (Chrome/Android, fast) and falls back to jsQR (pure JS) so it
// also works on iOS/Safari and desktop browsers that lack BarcodeDetector.

import jsQR from 'jsqr';

interface BarcodeDetectorLike {
  detect(source: CanvasImageSource): Promise<{ rawValue: string }[]>;
}

type BarcodeDetectorCtor = new (opts?: { formats?: string[] }) => BarcodeDetectorLike;

let detector: BarcodeDetectorLike | null = null;
let detectorChecked = false;

async function getDetector(): Promise<BarcodeDetectorLike | null> {
  if (detectorChecked) return detector;
  detectorChecked = true;
  try {
    const Ctor = (globalThis as unknown as { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector;
    if (Ctor) detector = new Ctor({ formats: ['qr_code'] });
  } catch {
    detector = null;
  }
  return detector;
}

/**
 * Decode a QR code from a video frame. Returns the raw string, or null if no
 * code is found in this frame.
 */
export async function decodeFrame(
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
): Promise<string | null> {
  const det = await getDetector();
  if (det) {
    try {
      const results = await det.detect(canvas);
      return results[0]?.rawValue ?? null;
    } catch {
      // fall through to jsQR
    }
  }
  const imageData = ctx.getImageData(0, 0, width, height);
  const result = jsQR(imageData.data, width, height, { inversionAttempts: 'dontInvert' });
  return result?.data ?? null;
}

export interface ScannedLot {
  saleId: string;
  lotId: string;
  raw: string;
}

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
// Matches both the public route (/view/sales/:id/lots/:id) and the internal
// route (/sales/:id/lots/:id). Legacy lot-number tags are intentionally not
// matched — they cannot resolve to a lot UUID without a lookup.
const LOT_URL_RE = new RegExp(`/sales?/(${UUID})/lots?/(${UUID})`, 'i');

/**
 * Parse a scanned QR value (a lot URL) into sale + lot ids, or null if it is
 * not a recognizable lot tag.
 */
export function parseLotUrl(raw: string): ScannedLot | null {
  const match = raw.match(LOT_URL_RE);
  if (!match) return null;
  return { saleId: match[1], lotId: match[2], raw };
}

const BASKET_URL_RE = new RegExp(`/sales?/(${UUID})/basket`, 'i');

export interface ScannedBasket {
  saleId: string;
  basketId: string;
  raw: string;
}

/**
 * Parse a scanned buyer-basket QR (…/view/sales/:saleId/basket?b=<basketId>).
 */
export function parseBasketUrl(raw: string): ScannedBasket | null {
  const saleMatch = raw.match(BASKET_URL_RE);
  if (!saleMatch) return null;
  const bMatch = raw.match(/[?&]b=([^&\s]+)/);
  if (!bMatch) return null;
  return { saleId: saleMatch[1], basketId: decodeURIComponent(bMatch[1]), raw };
}
