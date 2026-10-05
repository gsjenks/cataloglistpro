// src/lib/lotTag.ts
// Lot price tags for the Niimbot B1 (50 x 30 mm labels). Drawn on a 1-bit
// canvas: QR code on the left, then the company logo (or name), lot number,
// title (2 lines), description (up to 3 lines) and price. See docs/room-capture-spec.md, Lot tags.
//
// The label is 50 mm across but the B1 print head is 48 mm (384 dots), so the
// tag is 384 x 240 dots (203 dpi).

import QRCode from 'qrcode';
import type { Lot } from '../types';

export const TAG_WIDTH = 384;
export const TAG_HEIGHT = 240;

const MARGIN = 8;
const QR_TARGET = 176; // about 22 mm
const FONT = 'Arial, Helvetica, sans-serif';

/**
 * The short link printed in tag QR codes. /l/<id> opens the staff lot screen
 * for signed-in staff and the public lot page for everyone else. Fewer
 * characters means larger QR modules, which scan more easily.
 */
export function shortLotUrl(lotId: string): string {
  const base = import.meta.env.VITE_APP_URL || window.location.origin;
  return `${base}/l/${lotId}`;
}

export interface TagBranding {
  companyName: string;
  /** Trimmed logo (loadTagLogo), or null to print the company name instead. */
  logo: HTMLCanvasElement | null;
}

/** Lots that cannot be tagged yet: a temporary (offline) lot number has not synced. */
export function tagBlocker(lot: Pick<Lot, 'lot_number'>): string | null {
  const n = Number(lot.lot_number);
  if (lot.lot_number == null || lot.lot_number === '') return 'no lot number';
  if (Number.isFinite(n) && n < 0) return 'temporary lot number (not synced yet)';
  return null;
}

/** True when the tag was never printed, or the price changed since it was. */
export function tagOutOfDate(lot: Pick<Lot, 'tag_printed_at' | 'tag_price' | 'starting_bid'>): boolean {
  if (!lot.tag_printed_at) return true;
  const printed = lot.tag_price == null ? null : Number(lot.tag_price);
  const current = lot.starting_bid == null ? null : Number(lot.starting_bid);
  return printed !== current;
}

/**
 * Loads the company logo for tags, trimmed of its white border so it prints as
 * large as possible. Resolves null when there is none or it fails (CORS, 404).
 */
export function loadTagLogo(url: string | null | undefined): Promise<HTMLCanvasElement | null> {
  if (!url) return Promise.resolve(null);
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        resolve(trimWhite(img));
      } catch {
        resolve(null); // tainted canvas: the logo host sent no CORS header
      }
    };
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

// Crop to the bounding box of non-white, non-transparent pixels.
function trimWhite(img: HTMLImageElement): HTMLCanvasElement | null {
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  if (!w || !h) return null;
  const src = document.createElement('canvas');
  src.width = w;
  src.height = h;
  const sctx = src.getContext('2d', { willReadFrequently: true })!;
  sctx.drawImage(img, 0, 0);
  const d = sctx.getImageData(0, 0, w, h).data;
  let minX = w, minY = h, maxX = -1, maxY = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (d[i + 3] > 32 && (d[i] < 235 || d[i + 1] < 235 || d[i + 2] < 235)) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return null;
  const out = document.createElement('canvas');
  out.width = maxX - minX + 1;
  out.height = maxY - minY + 1;
  out.getContext('2d')!.drawImage(src, minX, minY, out.width, out.height, 0, 0, out.width, out.height);
  return out;
}

function formatPrice(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(Number(n))) return '';
  const v = Number(n);
  return `$${v.toLocaleString(undefined, { maximumFractionDigits: v % 1 === 0 ? 0 : 2, minimumFractionDigits: v % 1 === 0 ? 0 : 2 })}`;
}

// Word-wrap into at most `maxLines`; the last line ends in "…" when text is cut.
function wrap(ctx: CanvasRenderingContext2D, text: string, width: number, maxLines: number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of text.replace(/\s+/g, ' ').trim().split(' ')) {
    const next = line ? `${line} ${word}` : word;
    if (!line || ctx.measureText(next).width <= width) {
      line = next;
    } else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);

  const out = lines.slice(0, maxLines);
  const cut = lines.length > maxLines;
  return out.map((l, i) => {
    const isLast = i === out.length - 1;
    if (!(isLast && cut) && ctx.measureText(l).width <= width) return l;
    let t = l;
    while (t.length > 1 && ctx.measureText(`${t}…`).width > width) t = t.slice(0, -1);
    return `${t.trimEnd()}…`;
  });
}

function fitFont(ctx: CanvasRenderingContext2D, text: string, width: number, max: number, min: number, weight = 'bold') {
  let size = max;
  for (; size > min; size -= 2) {
    ctx.font = `${weight} ${size}px ${FONT}`;
    if (ctx.measureText(text).width <= width) break;
  }
  ctx.font = `${weight} ${size}px ${FONT}`;
  return size;
}

/** Draws one tag. Pixels are pure black or white, ready for the printer. */
export function renderLotTag(
  lot: Pick<Lot, 'id' | 'lot_number' | 'name' | 'starting_bid'> & { description?: string | null },
  branding: TagBranding,
): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = TAG_WIDTH;
  canvas.height = TAG_HEIGHT;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, TAG_WIDTH, TAG_HEIGHT);
  ctx.fillStyle = '#000';
  ctx.textBaseline = 'top';

  // QR: draw modules on whole pixels so they stay crisp at 203 dpi.
  const qr = QRCode.create(shortLotUrl(lot.id), { errorCorrectionLevel: 'M' });
  const n = qr.modules.size;
  const quiet = 1;
  const cell = Math.max(1, Math.floor(QR_TARGET / (n + quiet * 2)));
  const qrSize = cell * (n + quiet * 2);
  const qrX = MARGIN;
  const qrY = Math.round((TAG_HEIGHT - qrSize) / 2);
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (qr.modules.get(r, c)) ctx.fillRect(qrX + (c + quiet) * cell, qrY + (r + quiet) * cell, cell, cell);
    }
  }

  const x = qrX + qrSize + 8;
  const w = TAG_WIDTH - x - MARGIN;
  let y = MARGIN;

  // Logo, or the company name in bold.
  if (branding.logo) {
    const maxH = 40;
    const scale = Math.min(maxH / branding.logo.height, w / branding.logo.width);
    const lw = Math.round(branding.logo.width * scale);
    const lh = Math.round(branding.logo.height * scale);
    ctx.drawImage(branding.logo, x, y, lw, lh);
    y += lh + 6;
  } else if (branding.companyName) {
    fitFont(ctx, branding.companyName, w, 18, 12);
    ctx.fillText(wrap(ctx, branding.companyName, w, 1)[0] ?? '', x, y);
    y += 22;
  }

  // Rule under the header.
  ctx.fillRect(x, y, w, 2);
  y += 8;

  // Lot number.
  ctx.font = `bold 22px ${FONT}`;
  ctx.fillText(`Lot ${lot.lot_number ?? ''}`, x, y);
  y += 25;

  // Title, two lines.
  ctx.font = `bold 18px ${FONT}`;
  for (const line of wrap(ctx, lot.name || '', w, 2)) {
    ctx.fillText(line, x, y);
    y += 20;
  }
  y += 2;

  // Price, as large as fits, along the bottom. Measured first so the
  // description stops above it.
  const price = formatPrice(lot.starting_bid);
  const priceSize = price ? fitFont(ctx, price, w, 46, 24) : 0;
  const priceTop = price ? TAG_HEIGHT - MARGIN - Math.round(priceSize * 0.78) : TAG_HEIGHT - MARGIN;

  // Description, up to three lines, in the space left above the price.
  const DESC_LINE = 17;
  const descLines = Math.min(3, Math.floor((priceTop - 4 - y) / DESC_LINE));
  if (lot.description && descLines > 0) {
    ctx.font = `15px ${FONT}`;
    for (const line of wrap(ctx, lot.description, w, descLines)) {
      ctx.fillText(line, x, y);
      y += DESC_LINE;
    }
  }

  if (price) {
    ctx.font = `bold ${priceSize}px ${FONT}`;
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(price, x, TAG_HEIGHT - MARGIN - Math.round(priceSize * 0.05));
  }

  // Threshold to 1-bit so antialiasing does not print as grey speckle.
  const img = ctx.getImageData(0, 0, TAG_WIDTH, TAG_HEIGHT);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const lum = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    const v = d[i + 3] > 127 && lum < 140 ? 0 : 255;
    d[i] = d[i + 1] = d[i + 2] = v;
    d[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}
