/**
 * src/lib/estateSale.ts
 * Estate Sale path helpers.
 *
 * The "delay mechanism" for buyer self-checkout lives here. For some sales the
 * online (QR) "Buy" action is embargoed until `online_checkout_opens_at`, so
 * in-person shoppers get first pick. Staff floor actions (available/held/sold)
 * are NOT gated by this — they use `lot.inventory_status` directly.
 */

import type { Sale, Lot } from '../types';

/**
 * Whether public buyer self-checkout is currently open for a sale.
 * True only when: it's an estate sale, self-checkout is enabled, and either no
 * open time is set (opens immediately) or the open time has passed.
 */
export function isSelfCheckoutOpen(sale: Sale | null | undefined, now: Date = new Date()): boolean {
  if (!sale) return false;
  if (sale.sale_type !== 'estate_sale') return false;
  if (!sale.online_checkout_enabled) return false;
  if (!sale.online_checkout_opens_at) return true; // opens immediately
  return now.getTime() >= new Date(sale.online_checkout_opens_at).getTime();
}

/**
 * Milliseconds until self-checkout opens, or 0 if it is already open (or will
 * never open because it is disabled / not an estate sale). Useful for showing a
 * countdown on the public lot page.
 */
export function msUntilSelfCheckoutOpens(sale: Sale | null | undefined, now: Date = new Date()): number {
  if (!sale || sale.sale_type !== 'estate_sale' || !sale.online_checkout_enabled) return 0;
  if (!sale.online_checkout_opens_at) return 0;
  const diff = new Date(sale.online_checkout_opens_at).getTime() - now.getTime();
  return diff > 0 ? diff : 0;
}

/**
 * Whether a specific lot can be purchased online right now: self-checkout must
 * be open AND the lot must still be available on the floor. A missing
 * inventory_status is treated as 'available' for backwards compatibility.
 */
export function isLotPurchasableOnline(
  sale: Sale | null | undefined,
  lot: Pick<Lot, 'inventory_status'> | null | undefined,
  now: Date = new Date(),
): boolean {
  if (!isSelfCheckoutOpen(sale, now)) return false;
  if (!lot) return false;
  return (lot.inventory_status ?? 'available') === 'available';
}
