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

// ── Certificate of Insurance (movers) ───────────────────────────────────────
// The certificate goes to the private documents bucket, like resale
// certificates; only managers can read it back (signed URL).

export async function uploadCoi(companyId: string, file: File): Promise<string> {
  const ext = file.name.split('.').pop() || 'jpg';
  const path = `${companyId}/coi/${Math.random().toString(36).substring(2)}-${Date.now()}.${ext}`;
  const { error } = await supabase.storage
    .from('documents')
    .upload(path, file, { cacheControl: '3600', upsert: false });
  if (error) throw error;
  return path;
}

export async function coiUrl(path: string, seconds = 600): Promise<string | null> {
  const { data, error } = await supabase.storage.from('documents').createSignedUrl(path, seconds);
  if (error) return null;
  return data?.signedUrl ?? null;
}

export type CoiStatus = 'current' | 'expired' | 'none' | 'unknown';

/** current: on file and not past its expiry (or no expiry recorded). */
export function coiStatus(s: Pick<Shipper, 'coi_on_file' | 'coi_expires'>, today = new Date()): CoiStatus {
  if (s.coi_on_file == null) return 'unknown';
  if (!s.coi_on_file) return 'none';
  if (s.coi_expires) {
    const todayIso = today.toISOString().slice(0, 10);
    if (s.coi_expires < todayIso) return 'expired';
  }
  return 'current';
}

export function coiLabel(s: Pick<Shipper, 'coi_on_file' | 'coi_expires'>): string {
  switch (coiStatus(s)) {
    case 'current': return s.coi_expires ? `COI to ${s.coi_expires}` : 'COI on file';
    case 'expired': return `COI expired ${s.coi_expires}`;
    case 'none': return 'No COI';
    default: return 'COI not asked';
  }
}

export async function deleteShipper(id: string): Promise<void> {
  const { error } = await supabase.from('shippers').delete().eq('id', id);
  if (error) throw error;
}
