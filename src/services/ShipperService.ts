// src/services/ShipperService.ts
// CRUD for the company-level shippers directory (Stage 6). Shippers are reused
// across sales; lots reference the assigned handoff via lots.fulfillment_carrier
// (a shipper id, or the built-in 'pickup' / 'store').

import { supabase } from '../lib/supabase';
import type { Shipper } from '../types';

export async function listShippers(companyId: string): Promise<Shipper[]> {
  const { data, error } = await supabase
    .from('shippers')
    .select('*')
    .eq('company_id', companyId)
    .order('name', { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function createShipper(input: Omit<Shipper, 'id' | 'created_at' | 'updated_at'>): Promise<Shipper> {
  const { data, error } = await supabase.from('shippers').insert([input]).select().single();
  if (error) throw error;
  return data as Shipper;
}

export async function updateShipper(id: string, patch: Partial<Shipper>): Promise<void> {
  const { error } = await supabase.from('shippers').update(patch).eq('id', id);
  if (error) throw error;
}

export async function deleteShipper(id: string): Promise<void> {
  const { error } = await supabase.from('shippers').delete().eq('id', id);
  if (error) throw error;
}
