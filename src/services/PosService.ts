// src/services/PosService.ts
// Estate-sale point-of-sale checkout. Creates a transaction with line items and
// marks the sold lots. Card tender is recorded but not charged until Phase 4
// (Square) wires in real payment processing.

import { supabase } from '../lib/supabase';
import type { TenderType, Fulfillment } from '../types';

export interface PosLineItem {
  lotId: string | null;
  description: string;
  price: number;
  fulfillment: Fulfillment;
}

export interface DeliveryInfo {
  address?: string;
  date?: string;
  estimate?: string;
  company?: string;
  companyPhone?: string;
  companyEmail?: string;
}

export interface CreateTransactionInput {
  saleId: string;
  companyId: string | null;
  items: PosLineItem[];
  taxRate: number; // percent, e.g. 8.5
  tenderType: TenderType;
  buyerName?: string;
  note?: string;
  delivery?: DeliveryInfo;
}

export interface TransactionTotals {
  subtotal: number;
  tax: number;
  total: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export function computeTotals(items: PosLineItem[], taxRate: number): TransactionTotals {
  const subtotal = round2(items.reduce((sum, i) => sum + (Number(i.price) || 0), 0));
  const tax = round2(subtotal * (Number(taxRate) || 0) / 100);
  const total = round2(subtotal + tax);
  return { subtotal, tax, total };
}

export interface CreateTransactionResult {
  success: boolean;
  transactionId?: string;
  totals?: TransactionTotals;
  error?: string;
}

/**
 * Create a completed transaction: inserts the transaction + its line items, then
 * marks each associated lot sold (inventory_status='sold', sold_price=price).
 */
export async function createTransaction(
  input: CreateTransactionInput,
): Promise<CreateTransactionResult> {
  const { saleId, companyId, items, taxRate, tenderType, buyerName, note, delivery } = input;

  if (!items.length) return { success: false, error: 'Cart is empty' };
  if (!buyerName || !buyerName.trim()) return { success: false, error: "Buyer's name is required" };

  const totals = computeTotals(items, taxRate);

  // 1. Transaction header
  const { data: txn, error: txnError } = await supabase
    .from('sales_transactions')
    .insert({
      sale_id: saleId,
      company_id: companyId,
      subtotal: totals.subtotal,
      tax: totals.tax,
      total: totals.total,
      tender_type: tenderType,
      status: 'completed',
      buyer_name: buyerName.trim(),
      note: note || null,
      delivery_address: delivery?.address || null,
      delivery_date: delivery?.date || null,
      delivery_estimate: delivery?.estimate || null,
      delivery_company: delivery?.company || null,
      delivery_company_phone: delivery?.companyPhone || null,
      delivery_company_email: delivery?.companyEmail || null,
    })
    .select('id')
    .single();

  if (txnError || !txn) {
    return { success: false, error: txnError?.message || 'Failed to create transaction' };
  }

  // 2. Line items
  const { error: itemsError } = await supabase.from('sales_transaction_items').insert(
    items.map((i) => ({
      transaction_id: txn.id,
      lot_id: i.lotId,
      description: i.description,
      price: round2(Number(i.price) || 0),
      fulfillment: i.fulfillment,
    })),
  );

  if (itemsError) {
    return { success: false, error: itemsError.message };
  }

  // 3. Mark lots sold. Best-effort per lot; a failure here doesn't void the sale
  // (the transaction is the source of truth), but we surface the first error.
  let lotError: string | undefined;
  await Promise.all(
    items
      .filter((i) => i.lotId)
      .map(async (i) => {
        const { error } = await supabase
          .from('lots')
          .update({
            inventory_status: 'sold',
            sold_price: round2(Number(i.price) || 0),
            held_by: null,
            held_until: null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', i.lotId as string);
        if (error && !lotError) lotError = error.message;
      }),
  );

  return { success: true, transactionId: txn.id, totals, error: lotError };
}
