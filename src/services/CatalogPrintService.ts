// src/services/CatalogPrintService.ts
// Printable sale catalog (Reports & Tools → Print Catalog), built as a letter PDF
// with jsPDF so page numbers ("Page 3 of 18") and page breaks come out the same on
// every device. Every page carries the company logo (or name), the sale name and
// date, the print date and the page number.
//
// No orphans: a lot's entry (photo, title, price, description, details) is never
// split across pages; a room heading always starts on the same page as its first
// lot; and the closing line stays with the last lot. A lot too long for one page
// has its description shortened with "…" rather than spilling over.
//
// Prices are the estimate (auctions) or the asking price (estate sales), plus the
// appraised value when asked for. Never the reserve, sold price, buyer or consignor.

import { supabase } from '../lib/supabase';
import type { Lot, Sale, SaleRoom } from '../types';
import PhotoService, { isImageBlob } from './PhotoService';
import { compareByLocation, lotLocationLabel } from '../lib/roomCodes';
import { loadTagLogo } from '../lib/lotTag';

export interface CatalogOptions {
  sale: Sale;
  lots: Lot[];
  rooms: SaleRoom[];
  companyName: string;
  companyPhone?: string | null;
  logoUrl?: string | null;
  includePhotos: boolean;
  includePrices: boolean;
  /** Add the lot's appraised value (lots.appraised_value) beside its price. */
  includeAppraisal: boolean;
  /** 'lot' = lot number order; 'walking' = estate walking order with room headings. */
  order: 'lot' | 'walking';
  /** Estate sales: leave out lots already sold. */
  skipSold: boolean;
  onProgress?: (done: number, total: number) => void;
  /** false = return the PDF without downloading it. */
  save?: boolean;
}

export interface CatalogResult {
  blob: Blob;
  pages: number;
  lots: number;
  photosMissing: number;
  fileName: string;
}

// Letter, inches.
const PAGE_W = 8.5;
const MX = 0.6;
const CONTENT_TOP = 1.2;     // below the running header
const CONTENT_BOTTOM = 10.25; // above the footer
const FOOTER_Y = 10.6;
const PHOTO_BOX = 1.7;
const GAP = 0.2;
const PAD = 0.12;
const PT = 1 / 72;
const lineH = (pt: number) => pt * PT * 1.25;

interface PhotoRow { id: string; lot_id: string; file_path: string; is_primary: boolean | null; created_at: string | null }
interface Img { data: string; w: number; h: number }

// The PDF's built-in fonts only know Windows-1252; anything else (×, ″, emoji)
// would print as garbage, so it is mapped or dropped.
const CP1252_EXTRA = '€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ';
function pdfText(s: string | null | undefined): string {
  if (!s) return '';
  return s
    .replace(/[′’]/g, '’')
    .replace(/[″”]/g, '”')
    .replace(/×/g, 'x')
    .replace(/\r\n?/g, '\n')
    .split('')
    .map((c) => {
      const code = c.charCodeAt(0);
      if (c === '\n' || (code >= 0x20 && code <= 0x7e) || (code >= 0xa0 && code <= 0xff) || CP1252_EXTRA.includes(c)) return c;
      const plain = c.normalize('NFKD').replace(/[̀-ͯ]/g, '');
      return /^[\x20-\x7e]+$/.test(plain) ? plain : '';
    })
    .join('');
}

const money = (n?: number | null) =>
  n == null ? '' : `$${Number(n).toLocaleString('en-US', { maximumFractionDigits: n % 1 ? 2 : 0, minimumFractionDigits: n % 1 ? 2 : 0 })}`;

/** "Saturday, November 8, 2026" (+ time when the value carries one). */
export function catalogSaleDate(sale: Sale): string {
  const raw = sale.auction_starts_at || sale.start_date;
  if (!raw) return '';
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(raw);
  const d = new Date(dateOnly ? `${raw}T12:00:00` : raw);
  if (Number.isNaN(d.getTime())) return raw;
  const day = d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  return dateOnly ? day : `${day}, ${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
}

function priceLine(lot: Lot, isEstate: boolean): string {
  if (isEstate) return lot.starting_bid != null ? `Price ${money(lot.starting_bid)}` : '';
  if (lot.estimate_low != null && lot.estimate_high != null) return `Estimate ${money(lot.estimate_low)} – ${money(lot.estimate_high)}`;
  if (lot.estimate_low != null) return `Estimate ${money(lot.estimate_low)}`;
  return lot.starting_bid != null ? `Starting bid ${money(lot.starting_bid)}` : '';
}

function dimensions(lot: Lot): string {
  const unit = lot.dimension_unit || 'in';
  const parts = [
    lot.height ? `H ${lot.height}` : '',
    lot.width ? `W ${lot.width}` : '',
    lot.depth ? `D ${lot.depth}` : '',
  ].filter(Boolean);
  return parts.length ? `${parts.join(' x ')} ${unit}` : '';
}

/** The primary photo, else the oldest. */
function pickPrimary(rows: PhotoRow[]): PhotoRow | undefined {
  return [...rows].sort((a, b) => {
    if (!!a.is_primary !== !!b.is_primary) return a.is_primary ? -1 : 1;
    return (a.created_at ?? '').localeCompare(b.created_at ?? '');
  })[0];
}

/** Device cache first, else the public bucket; shrunk to a small JPEG for the page. */
async function loadImage(p: PhotoRow): Promise<Img | null> {
  let blob: Blob | null | undefined = await PhotoService.getPhotoBlob(p.id).catch(() => undefined);
  if (!isImageBlob(blob)) {
    const url = supabase.storage.from('photos').getPublicUrl(p.file_path).data.publicUrl;
    const res = await fetch(url).catch(() => null);
    blob = res?.ok ? await res.blob() : null;
    if (!isImageBlob(blob)) return null;
  }
  try {
    const bmp = await createImageBitmap(blob!, { imageOrientation: 'from-image' });
    const scale = Math.min(1, 560 / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bmp.width * scale));
    canvas.height = Math.max(1, Math.round(bmp.height * scale));
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    bmp.close();
    return { data: canvas.toDataURL('image/jpeg', 0.78), w: canvas.width, h: canvas.height };
  } catch {
    return null;
  }
}

async function loadPhotos(lots: Lot[], onProgress?: (d: number, t: number) => void): Promise<Map<string, Img>> {
  const rows: PhotoRow[] = [];
  const ids = lots.map((l) => l.id);
  for (let i = 0; i < ids.length; i += 150) {
    const { data, error } = await supabase
      .from('photos')
      .select('id, lot_id, file_path, is_primary, created_at')
      .in('lot_id', ids.slice(i, i + 150));
    if (error) throw new Error(`Could not read the photos: ${error.message}`);
    rows.push(...((data as PhotoRow[]) ?? []));
  }
  const byLot = new Map<string, PhotoRow[]>();
  rows.forEach((r) => byLot.set(r.lot_id, [...(byLot.get(r.lot_id) ?? []), r]));
  const jobs = lots.map((l) => ({ lotId: l.id, photo: pickPrimary(byLot.get(l.id) ?? []) }));
  const out = new Map<string, Img>();
  let done = 0;
  let next = 0;
  const worker = async () => {
    while (next < jobs.length) {
      const job = jobs[next++];
      if (job.photo) {
        const img = await loadImage(job.photo);
        if (img) out.set(job.lotId, img);
      }
      onProgress?.(++done, jobs.length);
    }
  };
  await Promise.all(Array.from({ length: 6 }, worker));
  return out;
}

function safeName(s: string) {
  return s.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);
}

export async function buildCatalogPdf(opts: CatalogOptions): Promise<CatalogResult> {
  const { sale, rooms, includePhotos, includePrices, includeAppraisal } = opts;
  const isEstate = sale.sale_type === 'estate_sale';
  const walking = isEstate && opts.order === 'walking';

  let lots = opts.lots.filter((l) => !(isEstate && opts.skipSold && l.inventory_status === 'sold'));
  lots = walking
    ? [...lots].sort(compareByLocation(rooms.map((r) => r.room_code)))
    : [...lots].sort((a, b) => (Number(a.lot_number) || 0) - (Number(b.lot_number) || 0));

  const [{ jsPDF }, logo, photos] = await Promise.all([
    import('jspdf'),
    loadTagLogo(opts.logoUrl).catch(() => null),
    includePhotos ? loadPhotos(lots, opts.onProgress) : Promise.resolve(new Map<string, Img>()),
  ]);
  const logoImg = logo ? { data: logo.toDataURL('image/png'), w: logo.width, h: logo.height } : null;

  const doc = new jsPDF({ orientation: 'portrait', unit: 'in', format: 'letter', compress: true });
  const saleName = pdfText(sale.name);
  const saleDate = pdfText(catalogSaleDate(sale));
  const company = pdfText(opts.companyName);
  const printed = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  const textX = includePhotos ? MX + PHOTO_BOX + GAP : MX;
  const textW = PAGE_W - MX - textX;
  const roomName = new Map(rooms.map((r) => [r.room_code, r.name]));

  const setFont = (style: 'normal' | 'bold' | 'italic', pt: number, gray = 0) => {
    doc.setFont('helvetica', style);
    doc.setFontSize(pt);
    doc.setTextColor(gray, gray, gray);
  };
  const wrap = (text: string, style: 'normal' | 'bold' | 'italic', pt: number, width: number) => {
    setFont(style, pt);
    return doc.splitTextToSize(text, width) as string[];
  };

  // ── Lay out one lot: measure first, so page breaks never split it. ──
  interface Block { lot: Lot; head: string[]; price: string; desc: string[]; meta: string[]; h: number }
  const maxBlockH = CONTENT_BOTTOM - CONTENT_TOP - 0.45; // leaves room for a heading
  const measure = (lot: Lot, maxH = maxBlockH): Block => {
    const head = wrap(pdfText(`Lot ${lot.lot_number ?? ''}  ${lot.name || 'Untitled'}`), 'bold', 11, textW);
    const price = pdfText([
      includePrices ? priceLine(lot, isEstate) : '',
      includeAppraisal && lot.appraised_value != null ? `Appraised ${money(lot.appraised_value)}` : '',
    ].filter(Boolean).join('   ·   '));
    let desc = wrap(pdfText(lot.description), 'normal', 9, textW);
    const metaParts = [
      dimensions(lot),
      lot.condition ? `Condition: ${lot.condition}` : '',
      walking ? '' : isEstate ? lotLocationLabel(lot) : '',
    ].filter(Boolean);
    const meta = metaParts.length ? wrap(pdfText(metaParts.join('   ·   ')), 'normal', 8.5, textW) : [];
    const textH = () =>
      head.length * lineH(11) + (price ? lineH(10) + 0.02 : 0) +
      (desc.length ? 0.04 + desc.length * lineH(9) : 0) + (meta.length ? 0.04 + meta.length * lineH(8.5) : 0);
    // Too tall for a page: shorten the description instead of splitting the lot.
    while (desc.length > 1 && PAD * 2 + Math.max(textH(), includePhotos ? PHOTO_BOX : 0) > maxH) {
      desc = desc.slice(0, -1);
      desc[desc.length - 1] = `${desc[desc.length - 1].replace(/\s*…$/, '').replace(/\s+\S*$/, '')} …`;
    }
    return { lot, head, price, desc, meta, h: PAD * 2 + Math.max(textH(), includePhotos ? PHOTO_BOX : 0) };
  };

  const drawBlock = (b: Block, y: number) => {
    const top = y + PAD;
    if (includePhotos) {
      const img = photos.get(b.lot.id);
      if (img) {
        const s = Math.min(PHOTO_BOX / img.w, PHOTO_BOX / img.h);
        const w = img.w * s;
        const h = img.h * s;
        doc.addImage(img.data, 'JPEG', MX + (PHOTO_BOX - w) / 2, top + (PHOTO_BOX - h) / 2, w, h, undefined, 'FAST');
      } else {
        doc.setDrawColor(220);
        doc.setLineWidth(0.01);
        doc.rect(MX, top, PHOTO_BOX, PHOTO_BOX);
        setFont('italic', 8, 150);
        doc.text('No photo', MX + PHOTO_BOX / 2, top + PHOTO_BOX / 2, { align: 'center', baseline: 'middle' });
      }
    }
    let ty = top + lineH(11) * 0.8;
    setFont('bold', 11);
    b.head.forEach((line) => { doc.text(line, textX, ty); ty += lineH(11); });
    if (b.price) {
      ty += 0.02;
      setFont('bold', 10, 60);
      doc.text(b.price, textX, ty);
      ty += lineH(10);
    }
    if (b.desc.length) {
      ty += 0.04;
      setFont('normal', 9, 30);
      b.desc.forEach((line) => { doc.text(line, textX, ty); ty += lineH(9); });
    }
    if (b.meta.length) {
      ty += 0.04;
      setFont('normal', 8.5, 110);
      b.meta.forEach((line) => { doc.text(line, textX, ty); ty += lineH(8.5); });
    }
    doc.setDrawColor(225);
    doc.setLineWidth(0.008);
    doc.line(MX, y + b.h, PAGE_W - MX, y + b.h);
  };

  // ── Title block (page 1). ──
  let y = CONTENT_TOP;
  {
    let ty = 0.75;
    if (logoImg) {
      const s = Math.min(2.6 / logoImg.w, 0.9 / logoImg.h);
      doc.addImage(logoImg.data, 'PNG', (PAGE_W - logoImg.w * s) / 2, ty, logoImg.w * s, logoImg.h * s);
      ty += logoImg.h * s + 0.3;
    } else {
      setFont('bold', 16, 40);
      doc.text(company, PAGE_W / 2, ty + 0.2, { align: 'center' });
      ty += 0.5;
    }
    setFont('bold', 20);
    const titleLines = doc.splitTextToSize(saleName, PAGE_W - MX * 2) as string[];
    titleLines.forEach((l) => { doc.text(l, PAGE_W / 2, ty, { align: 'center' }); ty += lineH(20); });
    setFont('normal', 11, 70);
    const sub = [
      saleDate,
      pdfText(sale.location),
      `${lots.length} ${lots.length === 1 ? 'lot' : 'lots'}`,
    ].filter(Boolean);
    sub.forEach((l) => { doc.text(l, PAGE_W / 2, ty, { align: 'center' }); ty += lineH(11); });
    if (logoImg || opts.companyPhone) {
      setFont('normal', 9, 110);
      // Without a logo the company name is already at the top; just add the phone.
      doc.text([logoImg ? company : '', pdfText(opts.companyPhone)].filter(Boolean).join('  ·  '), PAGE_W / 2, ty + 0.02, { align: 'center' });
      ty += lineH(9);
    }
    doc.setDrawColor(180);
    doc.setLineWidth(0.01);
    doc.line(MX, ty + 0.1, PAGE_W - MX, ty + 0.1);
    y = ty + 0.25;
  }

  const newPage = () => { doc.addPage(); y = CONTENT_TOP; };
  const HEADING_H = 0.42;
  const END_H = 0.4;
  const drawHeading = (text: string) => {
    setFont('bold', 12, 30);
    doc.text(text, MX, y + 0.27);
    doc.setDrawColor(150);
    doc.setLineWidth(0.012);
    doc.line(MX, y + 0.35, PAGE_W - MX, y + 0.35);
    y += HEADING_H;
  };

  const blocks = lots.map((l) => measure(l));
  // The first lot always starts on page 1, so the title never sits alone.
  if (blocks.length) {
    const heading = walking ? HEADING_H : 0;
    const end = blocks.length === 1 ? END_H : 0;
    blocks[0] = measure(blocks[0].lot, CONTENT_BOTTOM - y - heading - end);
  }
  let lastRoom: string | null | undefined;
  blocks.forEach((b, i) => {
    const room = walking ? (b.lot.room || '') : undefined;
    const heading = walking && room !== lastRoom
      ? pdfText(room ? `${room}  ${roomName.get(room) ?? ''}`.trim() : 'No room')
      : null;
    // Keep the heading with its first lot, and the closing line with the last.
    const need = (heading ? HEADING_H : 0) + b.h + (i === blocks.length - 1 ? END_H : 0);
    if (y + need > CONTENT_BOTTOM) newPage();
    if (heading) { drawHeading(heading); lastRoom = room; }
    drawBlock(b, y);
    y += b.h;
  });
  setFont('italic', 9, 120);
  doc.text(`End of catalog  ·  ${lots.length} ${lots.length === 1 ? 'lot' : 'lots'}`, PAGE_W / 2, y + 0.28, { align: 'center' });

  // ── Running header (pages 2+) and footer (every page), now the count is known. ──
  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    if (p > 1) {
      if (logoImg) {
        const s = Math.min(1.6 / logoImg.w, 0.45 / logoImg.h);
        doc.addImage(logoImg.data, 'PNG', MX, 0.45, logoImg.w * s, logoImg.h * s);
      } else {
        setFont('bold', 10, 40);
        doc.text(company, MX, 0.7);
      }
      setFont('bold', 10, 30);
      doc.text(doc.splitTextToSize(saleName, 4.2)[0], PAGE_W - MX, 0.62, { align: 'right' });
      if (saleDate) {
        setFont('normal', 8.5, 100);
        doc.text(saleDate, PAGE_W - MX, 0.8, { align: 'right' });
      }
      doc.setDrawColor(190);
      doc.setLineWidth(0.01);
      doc.line(MX, 1.0, PAGE_W - MX, 1.0);
    }
    doc.setDrawColor(210);
    doc.setLineWidth(0.008);
    doc.line(MX, FOOTER_Y - 0.17, PAGE_W - MX, FOOTER_Y - 0.17);
    setFont('normal', 8, 120);
    doc.text(`Printed ${printed}`, MX, FOOTER_Y);
    doc.text(company, PAGE_W / 2, FOOTER_Y, { align: 'center' });
    doc.text(`Page ${p} of ${pages}`, PAGE_W - MX, FOOTER_Y, { align: 'right' });
  }

  const fileName = `${safeName(sale.name || 'Sale')} - Catalog.pdf`;
  if (opts.save !== false) doc.save(fileName);
  return {
    blob: doc.output('blob'),
    pages,
    lots: lots.length,
    photosMissing: includePhotos ? lots.filter((l) => !photos.has(l.id)).length : 0,
    fileName,
  };
}
