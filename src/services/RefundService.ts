// src/services/RefundService.ts
// Refund a single estate-sale lot that was sold at the register. Removes the lot
// from its POS transaction, recomputes (or voids) that transaction, and returns
// the lot to Available. A sold lot can only leave "Sold" through this path — the
// floor control no longer un-sells it directly.

import { supabase } from '../lib/supabase';

const round2 = (n: number) => Math.round(n * 100) / 100;

export interface RefundResult {
  success: boolean;
  refunded: number; // amount removed from the sale (the lot's line price)
  error?: string;
}

export async function refundLotSale(lotId: string): Promise<RefundResult> {
  // The line item(s) that sold this lot.
  const { data: items, error: itemErr } = await supabase
    .from('sales_transaction_items')
    .select('id, transaction_id, price')
    .eq('lot_id', lotId);
  if (itemErr) return { success: false, refunded: 0, error: itemErr.message };

  const line = (items as { id: string; transaction_id: string; price: number }[] | null)?.[0];

  // Always return the lot to the floor.
  const { error: lotErr } = await supabase
    .from('lots')
    .update({
      inventory_status: 'available',
      sold_price: null,
      held_by: null,
      held_until: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', lotId);
  if (lotErr) return { success: false, refunded: 0, error: lotErr.message };

  // No POS line (e.g. a legacy hand-marked "sold") — nothing to reverse.
  if (!line) return { success: true, refunded: 0 };

  const refunded = Number(line.price) || 0;

  // Drop the line, then recompute (or void) its transaction.
  const { error: delErr } = await supabase.from('sales_transaction_items').delete().eq('id', line.id);
  if (delErr) return { success: false, refunded: 0, error: delErr.message };

  const { data: txn } = await supabase
    .from('sales_transactions')
    .select('subtotal, tax')
    .eq('id', line.transaction_id)
    .maybeSingle();
  const { data: rest } = await supabase
    .from('sales_transaction_items')
    .select('price')
    .eq('transaction_id', line.transaction_id);
  const remaining = (rest as { price: number }[] | null) ?? [];

  if (remaining.length === 0) {
    // Whole sale reversed — void it and zero the totals.
    await supabase
      .from('sales_transactions')
      .update({ status: 'voided', subtotal: 0, tax: 0, total: 0 })
      .eq('id', line.transaction_id);
  } else {
    // Keep the tax rate the sale was rung up at, apply to the new subtotal.
    const oldSubtotal = Number((txn as { subtotal?: number } | null)?.subtotal) || 0;
    const oldTax = Number((txn as { tax?: number } | null)?.tax) || 0;
    const rate = oldSubtotal > 0 ? oldTax / oldSubtotal : 0;
    const subtotal = round2(remaining.reduce((s, r) => s + (Number(r.price) || 0), 0));
    const tax = round2(subtotal * rate);
    const total = round2(subtotal + tax);
    await supabase.from('sales_transactions').update({ subtotal, tax, total }).eq('id', line.transaction_id);
  }

  return { success: true, refunded };
}
