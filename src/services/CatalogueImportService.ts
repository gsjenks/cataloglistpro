// src/services/CatalogueImportService.ts
// Import a LiveAuctioneers catalogue PDF to enrich a sale: matched lots get their
// estimates + description; lots in the catalogue but not the sale are created as
// UNSOLD (outcome 'passed'). Parsing runs in the browser via pdf.js; the DB writes
// run in the user's session so RLS holds. See docs/auction-lifecycle-spec.md (D5 prep).

import * as pdfjsLib from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { supabase } from '../lib/supabase';

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

export interface CatalogueLot {
  lotNumber: number;
  title: string;
  estimateLow: number;
  estimateHigh: number;
  description: string;
}

// A lot line: "<n>: <title> USD <low> - <high>"; following lines are its description.
const START = /^(\d+):\s+(.+?)\s+USD\s+([\d,]+)\s*[-–]\s*([\d,]+)\s*$/;
const SKIP = /^(Bid Live Online|The Estate of)/i;

export async function parseCatalogPdf(file: File): Promise<CatalogueLot[]> {
  const data = new Uint8Array(await file.arrayBuffer());
  const pdf = await pdfjsLib.getDocument({ data }).promise;

  // Reconstruct lines using pdf.js text-item EOL markers.
  const lines: string[] = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    let line = '';
    for (const it of content.items as Array<{ str?: string; hasEOL?: boolean }>) {
      if (typeof it.str !== 'string') continue;
      line += it.str;
      if (it.hasEOL) {
        if (line.trim()) lines.push(line.trim());
        line = '';
      }
    }
    if (line.trim()) lines.push(line.trim());
  }

  const lots: CatalogueLot[] = [];
  let cur: CatalogueLot | null = null;
  for (const l of lines) {
    const m = l.match(START);
    if (m) {
      if (cur) lots.push(cur);
      cur = {
        lotNumber: +m[1],
        title: m[2],
        estimateLow: +m[3].replace(/,/g, ''),
        estimateHigh: +m[4].replace(/,/g, ''),
        description: '',
      };
    } else if (cur && !SKIP.test(l)) {
      cur.description += (cur.description ? ' ' : '') + l;
    }
  }
  if (cur) lots.push(cur);

  if (lots.length === 0) {
    throw new Error('No lots found — is this a LiveAuctioneers catalogue PDF?');
  }
  return lots;
}

export interface CataloguePreview {
  total: number;
  matched: number; // will be enriched
  newUnsold: number; // will be created as passed
}

// How many catalogue lots match existing sale lots vs. are new (unsold).
export async function previewCatalogueImport(saleId: string, lots: CatalogueLot[]): Promise<CataloguePreview> {
  const existing = await existingLotNumbers(saleId);
  let matched = 0;
  for (const lot of lots) if (existing.has(lot.lotNumber)) matched++;
  return { total: lots.length, matched, newUnsold: lots.length - matched };
}

export interface CatalogueImportResult {
  updated: number;
  created: number;
}

export async function importCatalogueIntoSale(saleId: string, lots: CatalogueLot[]): Promise<CatalogueImportResult> {
  const existing = await existingLotNumbersToId(saleId);

  // New lots inherit the sole consignor when the sale has exactly one.
  const { data: cons } = await supabase.from('consignments').select('id').eq('sale_id', saleId);
  const defaultConsignmentId = cons && cons.length === 1 ? cons[0].id : null;

  const nowIso = new Date().toISOString();
  const updates: Promise<{ error: unknown }>[] = [];
  const newRows: Record<string, unknown>[] = [];

  for (const lot of lots) {
    const existingId = existing.get(lot.lotNumber);
    if (existingId) {
      updates.push(
        supabase
          .from('lots')
          .update({
            estimate_low: lot.estimateLow,
            estimate_high: lot.estimateHigh,
            description: lot.description,
          })
          .eq('id', existingId) as unknown as Promise<{ error: unknown }>,
      );
    } else {
      newRows.push({
        id: crypto.randomUUID(),
        sale_id: saleId,
        lot_number: lot.lotNumber,
        name: lot.title || `Lot ${lot.lotNumber}`,
        description: lot.description,
        estimate_low: lot.estimateLow,
        estimate_high: lot.estimateHigh,
        quantity: 1,
        condition: '',
        category: '',
        style: '',
        origin: '',
        creator: '',
        materials: '',
        dimension_unit: 'inches',
        outcome: 'passed',
        consignment_id: defaultConsignmentId,
        created_at: nowIso,
        updated_at: nowIso,
      });
    }
  }

  const results = await Promise.all(updates);
  const failed = results.find((r) => r.error);
  if (failed) throw failed.error;

  let created = 0;
  if (newRows.length) {
    const { error } = await supabase.from('lots').insert(newRows);
    if (error) throw error;
    created = newRows.length;
  }

  return { updated: updates.length, created };
}

async function existingLotNumbers(saleId: string): Promise<Set<number>> {
  return new Set((await existingLotNumbersToId(saleId)).keys());
}

async function existingLotNumbersToId(saleId: string): Promise<Map<number, string>> {
  const { data, error } = await supabase.from('lots').select('id, lot_number').eq('sale_id', saleId);
  if (error) throw error;
  const map = new Map<number, string>();
  (data || []).forEach((l) => {
    const n = Number(l.lot_number);
    if (Number.isFinite(n)) map.set(n, l.id as string);
  });
  return map;
}
