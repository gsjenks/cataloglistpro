// src/lib/delivery.ts
// Shared delivery/mover details for the estate-sale delivery workflow, used by
// both the sales floor (basket tool) and the register. Per-item "for delivery"
// tagging lives on lots.for_delivery; the customer's mover details live on the
// shopper (one delivery per customer).

import type { SupabaseClient } from '@supabase/supabase-js';

export interface DeliveryDetails {
  address: string;
  date: string;
  estimate: string;
  company: string;
  companyPhone: string;
  companyEmail: string;
  // Access questions for the mover. null = not asked yet.
  property: DeliveryProperty | null;  // home, apartment, other: parking, access, planning
  stairs: boolean | null;    // carried up or down stairs?
  elevator: boolean | null;  // elevator required?
}

export type DeliveryProperty = 'home' | 'apartment' | 'other';
export const PROPERTY_LABELS: Record<DeliveryProperty, string> = {
  home: 'Home',
  apartment: 'Apartment',
  other: 'Other',
};

export const emptyDelivery: DeliveryDetails = {
  address: '', date: '', estimate: '', company: '', companyPhone: '', companyEmail: '',
  property: null, stairs: null, elevator: null,
};

// The delivery_* columns, named the same on shoppers, sales_transactions and lots.
export const DELIVERY_COLS =
  'delivery_address, delivery_date, delivery_estimate, delivery_company, delivery_company_phone, delivery_company_email, delivery_property, delivery_stairs, delivery_elevator';
export const SHOPPER_DELIVERY_COLS = DELIVERY_COLS;

/** Hydrate from a shopper, transaction or lot row (same column names on all three). */
export function deliveryFromShopper(s: Record<string, unknown> | null | undefined): DeliveryDetails {
  return {
    address: (s?.delivery_address as string) ?? '',
    date: (s?.delivery_date as string) ?? '',
    estimate: (s?.delivery_estimate as string) ?? '',
    company: (s?.delivery_company as string) ?? '',
    companyPhone: (s?.delivery_company_phone as string) ?? '',
    companyEmail: (s?.delivery_company_email as string) ?? '',
    property: (s?.delivery_property as DeliveryProperty | null | undefined) ?? null,
    stairs: (s?.delivery_stairs as boolean | null | undefined) ?? null,
    elevator: (s?.delivery_elevator as boolean | null | undefined) ?? null,
  };
}
export const deliveryFromRow = deliveryFromShopper;

/** The delivery_* column values for an update (blank text becomes NULL). */
export function deliveryColumns(d: DeliveryDetails) {
  return {
    delivery_address: d.address.trim() || null,
    delivery_date: d.date.trim() || null,
    delivery_estimate: d.estimate.trim() || null,
    delivery_company: d.company.trim() || null,
    delivery_company_phone: d.companyPhone.trim() || null,
    delivery_company_email: d.companyEmail.trim() || null,
    delivery_property: d.property,
    delivery_stairs: d.stairs,
    delivery_elevator: d.elevator,
  };
}

/** "Home" / "Apartment" / "Other" / "Not asked". */
export function propertyLabel(v: DeliveryProperty | null | undefined): string {
  return v ? PROPERTY_LABELS[v] : 'Not asked';
}

/** "Yes" / "No" / "Not asked", for the manifest and summaries. */
export function yesNo(v: boolean | null | undefined): string {
  return v == null ? 'Not asked' : v ? 'Yes' : 'No';
}

export async function saveShopperDelivery(
  client: SupabaseClient,
  shopperId: string,
  d: DeliveryDetails,
): Promise<{ error: unknown }> {
  const { error } = await client
    .from('shoppers')
    .update({ ...deliveryColumns(d), updated_at: new Date().toISOString() })
    .eq('id', shopperId);
  return { error };
}

// When any item is going out for delivery, the mover needs a date and at least
// one way to reach them. Returns an error message, or null if valid.
export function deliveryMissing(d: DeliveryDetails): string | null {
  if (!d.date.trim()) return 'Enter a delivery date for the mover.';
  if (!d.companyPhone.trim() && !d.companyEmail.trim()) return 'Enter a mover phone or email.';
  if (d.property == null) return 'Say whether the delivery is to a home, an apartment or other.';
  if (d.stairs == null || d.elevator == null) return 'Answer the stairs and elevator questions for the mover.';
  return null;
}
