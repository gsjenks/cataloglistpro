// src/services/TaxExemptionService.ts
// Resale / sales-tax exemption certificates, company-scoped so a dealer is entered
// once and found again at every later sale. The certificate image (photographed on a
// phone or uploaded) goes to the private `documents` bucket and is read back through
// short-lived signed URLs — never a public URL.

import { supabase } from '../lib/supabase';
import type { TaxExemption } from '../types';

export async function listExemptions(companyId: string): Promise<TaxExemption[]> {
  const { data, error } = await supabase
    .from('tax_exemptions')
    .select('*')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

export type TaxExemptionInput = Omit<TaxExemption, 'id' | 'created_at' | 'updated_at'>;

export async function saveExemption(
  input: TaxExemptionInput,
  id?: string,
): Promise<TaxExemption> {
  const payload = { ...input, updated_at: new Date().toISOString() };
  const query = id
    ? supabase.from('tax_exemptions').update(payload).eq('id', id)
    : supabase.from('tax_exemptions').insert([payload]);
  const { data, error } = await query.select().single();
  if (error) throw error;
  return data as TaxExemption;
}

export async function deleteExemption(id: string): Promise<void> {
  const { error } = await supabase.from('tax_exemptions').delete().eq('id', id);
  if (error) throw error;
}

// Store the certificate image. Same bucket + path convention as DocumentsList.
export async function uploadCertificateImage(
  companyId: string,
  file: File,
): Promise<{ path: string; name: string }> {
  const ext = file.name.split('.').pop() || 'jpg';
  const objectName = `${Math.random().toString(36).substring(2)}-${Date.now()}.${ext}`;
  const path = `${companyId}/tax-exemptions/${objectName}`;
  const { error } = await supabase.storage
    .from('documents')
    .upload(path, file, { cacheControl: '3600', upsert: false });
  if (error) throw error;
  return { path, name: file.name };
}

export async function certificateUrl(path: string, seconds = 600): Promise<string | null> {
  const { data, error } = await supabase.storage.from('documents').createSignedUrl(path, seconds);
  if (error) {
    console.error('Failed to sign certificate URL:', error);
    return null;
  }
  return data?.signedUrl ?? null;
}

// ── Validity ─────────────────────────────────────────────────────────────────

/** A certificate with no stated expiry stays valid; an expired one never exempts. */
export function isExpired(ex: TaxExemption, on: Date = new Date()): boolean {
  if (!ex.expires_on) return false;
  // expires_on is a date-only column; compare at day granularity.
  return ex.expires_on < on.toISOString().slice(0, 10);
}

export function findForBuyer(
  exemptions: TaxExemption[],
  buyerKey: string,
): TaxExemption | undefined {
  const mine = exemptions.filter((e) => e.buyer_key === buyerKey);
  // Prefer a currently-valid certificate; fall back to an expired one so the UI can
  // say "expired" rather than "none on file".
  return mine.find((e) => !isExpired(e)) ?? mine[0];
}
