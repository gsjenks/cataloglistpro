// src/services/RefundService.ts
// Refund a single estate-sale lot that was sold at the register. Removes the lot
// from its POS transaction, recomputes (or voids) that transaction, and returns
// the lot to Available. A sold lot can only leave "Sold" through this path — the
// floor control no longer un-sells it directly.

import { supabase } from '../lib/supabase';
import type { Lot } from '../types';

const round2 = (n: number) => Math.round(n * 100) / 100;

export interface RefundResult {
  success: boolean;
  refunded: number; // amount removed from the sale (the lot's line price)
  error?: string;
}

export interface RefundRecord {
  id: string;
  lot_name: string | null;
  lot_number: string | null;
  amount: number;
  buyer_name: string | null;
  reason: string | null;
  created_at: string;
}

export interface RefundOptions {
  companyId?: string | null;
  reason?: string | null;
}

export async function refundLotSale(lot: Lot, opts: RefundOptions = {}): Promise<RefundResult> {
  const lotId = lot.id;
  // The line item(s) that sold this lot.
  const { data: items, error: itemErr } = await supabase
    .from('sales_transaction_items')
    .select('id, transaction_id, price')
    .eq('lot_id', lotId);
  if (itemErr) return { success: false, refunded: 0, error: itemErr.message };

  const line = (items as { id: string; transaction_id: string; price: number }[] | null)?.[0];

  // Capture the buyer for the audit record before we touch the transaction.
  let buyerName: string | null = null;
  if (line?.transaction_id) {
    const { data: t } = await supabase
      .from('sales_transactions')
      .select('buyer_name')
      .eq('id', line.transaction_id)
      .maybeSingle();
    buyerName = (t as { buyer_name?: string } | null)?.buyer_name ?? null;
  }

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

  const logRefund = async (amount: number) => {
    // Best-effort audit record; never fail the refund over it.
    try {
      await supabase.from('refunds').insert({
        sale_id: lot.sale_id,
        company_id: opts.companyId ?? null,
        lot_id: lotId,
        lot_name: lot.name ?? null,
        lot_number: lot.lot_number != null ? String(lot.lot_number) : null,
        amount: round2(amount),
        buyer_name: buyerName,
        transaction_id: line?.transaction_id ?? null,
        reason: opts.reason?.trim() || null,
      });
    } catch { /* audit is non-fatal */ }
  };

  // No POS line (e.g. a legacy hand-marked "sold") — nothing to reverse, but the
  // amount given back is the lot's sold price. Still log it.
  if (!line) {
    const amt = Number(lot.sold_price) || 0;
    await logRefund(amt);
    return { success: true, refunded: amt };
  }

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

  await logRefund(refunded);
  return { success: true, refunded };
}

// Refund history for a sale (newest first). Returns [] if the table isn't
// migrated yet, so callers degrade gracefully.
export async function getRefunds(saleId: string): Promise<RefundRecord[]> {
  try {
    const { data } = await supabase
      .from('refunds')
      .select('id, lot_name, lot_number, amount, buyer_name, reason, created_at')
      .eq('sale_id', saleId)
      .order('created_at', { ascending: false });
    return (data as RefundRecord[] | null) ?? [];
  } catch {
    return [];
  }
}
