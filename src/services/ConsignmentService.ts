// src/services/ConsignmentService.ts
// CRUD for per-consignor consignments (#2) + lot→consignment assignment. A sale
// pools lots from multiple consignors; terms and settlement are per consignment.
// See docs/auction-lifecycle-spec.md.

import { supabase } from '../lib/supabase';
import type { Consignment } from '../types';

export async function listConsignments(saleId: string): Promise<Consignment[]> {
  const { data, error } = await supabase
    .from('consignments')
    .select('*')
    .eq('sale_id', saleId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function createConsignment(
  input: Omit<Consignment, 'id' | 'created_at' | 'updated_at'>,
): Promise<Consignment> {
  const { data, error } = await supabase
    .from('consignments')
    .insert([input])
    .select()
    .single();
  if (error) throw error;
  return data as Consignment;
}

export async function updateConsignment(id: string, patch: Partial<Consignment>): Promise<void> {
  const { error } = await supabase.from('consignments').update(patch).eq('id', id);
  if (error) throw error;
}

export async function deleteConsignment(id: string): Promise<void> {
  const { error } = await supabase.from('consignments').delete().eq('id', id);
  if (error) throw error;
}

// ── Reconciliation (Stage 7) ─────────────────────────────────────────────────
// The statement is generated from live lot data every time (see lib/settlement).
// These write the payout RECORD: what we owed, when we settled, and how we paid.

export interface PayoutInput {
  amount: number;
  method: string;           // check | ach | wire | cash | other
  reference?: string;       // check #, ACH/wire confirmation
  note?: string;
  paidAt?: string;          // ISO; defaults to now
}

// Lock the figures: mark the statement as generated for this consignor.
export async function markSettled(id: string, netDue: number): Promise<void> {
  await updateConsignment(id, { net_due: netDue, settled_at: new Date().toISOString() });
}

// Paying implies settling, so a payout on a never-settled consignment stamps
// settled_at too (an existing one is left alone — that's when the figures were locked).
export async function recordPayout(consignment: Consignment, payout: PayoutInput): Promise<void> {
  const now = new Date().toISOString();
  // Written through supabase directly so blanked-out fields persist as NULL
  // (undefined would simply be dropped from the request body).
  const { error } = await supabase
    .from('consignments')
    .update({
      net_due: payout.amount,
      settled_at: consignment.settled_at || now,
      paid_at: payout.paidAt || now,
      payment_method: payout.method,
      payment_reference: payout.reference?.trim() || null,
      payout_note: payout.note?.trim() || null,
    })
    .eq('id', consignment.id);
  if (error) throw error;
}

// Undo a payout record (mis-keyed check #, wrong consignor, payment bounced).
export async function clearPayout(id: string): Promise<void> {
  const { error } = await supabase
    .from('consignments')
    .update({
      paid_at: null,
      payment_method: null,
      payment_reference: null,
      payout_note: null,
    })
    .eq('id', id);
  if (error) throw error;
}

// Assign (or clear, with null) the consignor for a set of lots.
export async function assignLotsToConsignment(
  lotIds: string[],
  consignmentId: string | null,
): Promise<void> {
  if (!lotIds.length) return;
  const { error } = await supabase
    .from('lots')
    .update({ consignment_id: consignmentId })
    .in('id', lotIds);
  if (error) throw error;
}
