// src/services/HouseChargeService.ts
// Shipping / handling / sales tax the auction house collects itself, per buyer per
// sale. Kept apart from buyer_invoices (the LA mirror) so re-importing a corrected
// LA PDF can't overwrite hand-entered figures. See lib/invoices.ts for the math.

import { supabase } from '../lib/supabase';
import type { HouseCharge } from '../types';

export async function listHouseCharges(saleId: string): Promise<HouseCharge[]> {
  const { data, error } = await supabase
    .from('house_charges')
    .select('*')
    .eq('sale_id', saleId);
  if (error) throw error;
  return data || [];
}

export type HouseChargeInput = Omit<
  HouseCharge, 'id' | 'created_at' | 'updated_at'
>;

// One row per (sale, buyer) — saving again updates that buyer's charges in place.
export async function saveHouseCharge(input: HouseChargeInput): Promise<void> {
  const { error } = await supabase
    .from('house_charges')
    .upsert({ ...input, updated_at: new Date().toISOString() }, { onConflict: 'sale_id,buyer_key' });
  if (error) throw error;
}

export async function deleteHouseCharge(saleId: string, buyerKey: string): Promise<void> {
  const { error } = await supabase
    .from('house_charges')
    .delete()
    .eq('sale_id', saleId)
    .eq('buyer_key', buyerKey);
  if (error) throw error;
}
