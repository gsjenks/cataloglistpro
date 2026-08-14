// src/services/DispositionService.ts
// D5 — disposition of unsold (passed) lots (spec §4.2), plus aftersale. Each unsold
// lot goes to exactly one outcome: sold via aftersale, returned to consignor, held
// for a future sale, or charity. Returned vs charity are tracked separately so the
// charity donations can be receipted.

import { supabase } from '../lib/supabase';
import type { LotBuyer, LotDisposition } from '../types';

async function updateLot(lotId: string, patch: Record<string, unknown>): Promise<void> {
  const { error } = await supabase.from('lots').update(patch).eq('id', lotId);
  if (error) throw error;
}

// Aftersale: a post-auction offer was accepted. The lot becomes sold + unpaid so it
// flows into the Payments worklist and the consignor settlement.
export async function sellAftersale(lotId: string, buyerName: string, price: number): Promise<void> {
  const buyer: LotBuyer = { name: buyerName };
  await updateLot(lotId, {
    outcome: 'sold',
    sold_price: price,
    buyer,
    payment_status: 'unpaid',
    payment_due_at: new Date(Date.now() + 72 * 3600 * 1000).toISOString(),
    disposition: null,
    disposition_at: null,
  });
}

// Record where an unsold lot went: returned | hold_relist | charity.
export async function setDisposition(lotId: string, disposition: LotDisposition, note?: string): Promise<void> {
  await updateLot(lotId, {
    disposition,
    disposition_at: new Date().toISOString(),
    disposition_note: note ?? null,
  });
}

// Edit just the note on an already-dispositioned lot (keeps disposition + date).
export async function updateDispositionNote(lotId: string, note: string): Promise<void> {
  await updateLot(lotId, { disposition_note: note.trim() || null });
}

// Undo a disposition (back to pending).
export async function clearDisposition(lotId: string): Promise<void> {
  await updateLot(lotId, { disposition: null, disposition_at: null, disposition_note: null });
}
