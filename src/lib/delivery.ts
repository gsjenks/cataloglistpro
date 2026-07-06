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
}

export const emptyDelivery: DeliveryDetails = {
  address: '', date: '', estimate: '', company: '', companyPhone: '', companyEmail: '',
};

// Columns to select from shoppers to hydrate delivery details.
export const SHOPPER_DELIVERY_COLS =
  'delivery_address, delivery_date, delivery_estimate, delivery_company, delivery_company_phone, delivery_company_email';

export function deliveryFromShopper(s: Record<string, unknown> | null | undefined): DeliveryDetails {
  return {
    address: (s?.delivery_address as string) ?? '',
    date: (s?.delivery_date as string) ?? '',
    estimate: (s?.delivery_estimate as string) ?? '',
    company: (s?.delivery_company as string) ?? '',
    companyPhone: (s?.delivery_company_phone as string) ?? '',
    companyEmail: (s?.delivery_company_email as string) ?? '',
  };
}

export async function saveShopperDelivery(
  client: SupabaseClient,
  shopperId: string,
  d: DeliveryDetails,
): Promise<{ error: unknown }> {
  const { error } = await client
    .from('shoppers')
    .update({
      delivery_address: d.address.trim() || null,
      delivery_date: d.date.trim() || null,
      delivery_estimate: d.estimate.trim() || null,
      delivery_company: d.company.trim() || null,
      delivery_company_phone: d.companyPhone.trim() || null,
      delivery_company_email: d.companyEmail.trim() || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', shopperId);
  return { error };
}

// When any item is going out for delivery, the mover needs a date and at least
// one way to reach them. Returns an error message, or null if valid.
export function deliveryMissing(d: DeliveryDetails): string | null {
  if (!d.date.trim()) return 'Enter a delivery date for the mover.';
  if (!d.companyPhone.trim() && !d.companyEmail.trim()) return 'Enter a mover phone or email.';
  return null;
}
