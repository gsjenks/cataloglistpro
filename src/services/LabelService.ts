// src/services/LabelService.ts
// Packing artifact #3 — one shipping label per LOT (Avery 55163: 2" x 4", 10 per
// letter sheet). Every piece carries the buyer, their address, the lot number and
// a "piece n of m" count, so a shipment that gets split at the shipper's dock can
// still be reassembled — or at least routed — from any single box.
//
// Labels come out grouped by buyer (then lot #) to match how a packing table works.
// Unlike the old EOAProcessing label run, the header comes from the company record
// rather than being hardcoded.

import type { Lot } from '../types';
import { addressLines, buyerKeyOf, isSold } from '../lib/invoices';

export interface LabelOptions {
  saleName: string;
  companyName?: string;
  companyPhone?: string;
  carrierLabel: (value?: string) => string;
  /** Only lots not yet shipped/delivered. Default true. */
  pendingOnly?: boolean;
}

// Avery 55163 / 5163 geometry, in inches.
const LABEL_W = 4;
const LABEL_H = 2;
const LEFT_MARGIN = 0.16;
const TOP_MARGIN = 0.5;
const H_GAP = 0.18;
const PER_PAGE = 10;

const lotNum = (v: number | string | undefined) =>
  typeof v === 'number' ? v : parseInt(String(v ?? ''), 10) || 0;

interface LabelData {
  lot: Lot;
  buyerName: string;
  address: string[];
  phone?: string;
  piece: number;
  pieces: number;
  shipper: string;
}

// Sold lots → one label each, grouped by buyer, numbered piece n of m.
export function buildLabels(lots: Lot[], opts: LabelOptions): LabelData[] {
  const pendingOnly = opts.pendingOnly !== false;
  const eligible = lots
    .filter(isSold)
    .filter((l) => (pendingOnly ? !l.shipped_at && !l.delivered_at : true));

  const byBuyer = new Map<string, Lot[]>();
  for (const l of eligible) {
    const key = buyerKeyOf(l);
    if (!byBuyer.has(key)) byBuyer.set(key, []);
    byBuyer.get(key)!.push(l);
  }

  const groups = [...byBuyer.values()].sort((a, b) =>
    (a[0].buyer?.name || '').localeCompare(b[0].buyer?.name || ''),
  );

  const out: LabelData[] = [];
  for (const group of groups) {
    group.sort((a, b) => lotNum(a.lot_number) - lotNum(b.lot_number));
    group.forEach((lot, i) => {
      out.push({
        lot,
        buyerName: lot.buyer?.name || 'Unknown buyer',
        address: addressLines(lot.buyer ?? {}),
        phone: lot.buyer?.phone,
        piece: i + 1,
        pieces: group.length,
        shipper: opts.carrierLabel(lot.fulfillment_carrier),
      });
    });
  }
  return out;
}

const sanitize = (s: string) => s.replace(/[^a-z0-9]+/gi, '_').replace(/^_|_$/g, '') || 'sale';

export async function generateShippingLabels(lots: Lot[], opts: LabelOptions): Promise<number> {
  const labels = buildLabels(lots, opts);
  if (labels.length === 0) return 0;

  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ orientation: 'portrait', unit: 'in', format: 'letter' });

  // Trim a string to fit a column width at the current font size.
  const fit = (text: string, maxW: number): string => {
    if (doc.getTextWidth(text) <= maxW) return text;
    let t = text;
    while (t.length > 1 && doc.getTextWidth(`${t}…`) > maxW) t = t.slice(0, -1);
    return `${t}…`;
  };

  labels.forEach((d, i) => {
    if (i > 0 && i % PER_PAGE === 0) doc.addPage();
    const slot = i % PER_PAGE;
    const row = Math.floor(slot / 2);
    const col = slot % 2;
    const x = LEFT_MARGIN + col * (LABEL_W + H_GAP);
    const y = TOP_MARGIN + row * LABEL_H;

    const padX = x + 0.18;
    const innerW = LABEL_W - 0.36;
    let cy = y + 0.26;

    // Header: auction house on the left, lot number on the right.
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.text(fit(opts.companyName || opts.saleName, innerW - 1.1), padX, cy);

    doc.setFontSize(11);
    doc.setTextColor(200, 0, 0);
    const lotText = `LOT ${d.lot.lot_number ?? '—'}`;
    doc.text(lotText, x + LABEL_W - 0.18 - doc.getTextWidth(lotText), cy);
    doc.setTextColor(0, 0, 0);
    cy += 0.14;

    doc.setFontSize(6.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(110, 110, 110);
    doc.text(fit([opts.saleName, opts.companyPhone].filter(Boolean).join(' · '), innerW), padX, cy);
    doc.setTextColor(0, 0, 0);
    cy += 0.2;

    // Buyer + address — the part that matters if the piece goes astray.
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text(fit(d.buyerName, innerW), padX, cy);
    cy += 0.17;

    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    d.address.slice(0, 3).forEach((line) => {
      doc.text(fit(line, innerW), padX, cy);
      cy += 0.15;
    });
    if (d.phone) {
      doc.text(fit(d.phone, innerW), padX, cy);
      cy += 0.15;
    }

    // Footer: item, piece count, shipper.
    const footY = y + LABEL_H - 0.3;
    doc.setFontSize(7);
    doc.setTextColor(80, 80, 80);
    doc.text(fit(d.lot.name || '', innerW), padX, footY);

    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(0, 0, 0);
    doc.text(`Piece ${d.piece} of ${d.pieces}`, padX, footY + 0.15);
    const shipText = fit(d.shipper || '', innerW - 1.1);
    doc.setFont('helvetica', 'normal');
    doc.text(shipText, x + LABEL_W - 0.18 - doc.getTextWidth(shipText), footY + 0.15);
  });

  doc.save(`${sanitize(opts.saleName)}_Lot_Labels.pdf`);
  return labels.length;
}
