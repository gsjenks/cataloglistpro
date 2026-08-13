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
