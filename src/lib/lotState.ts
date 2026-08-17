// src/lib/lotState.ts
// The single answer to "did this lot actually sell?".
//
// `outcome` is authoritative whenever it is set. A lot that fell out of a sale —
// the buyer never paid, the lot came back — is marked outcome 'passed' but KEEPS its
// sold_price, because what it made at the block is worth remembering (and the
// underbidder is often offered that price). Treating a lingering sold_price as proof
// of sale is how a defaulted lot keeps getting billed to the buyer, paid out to the
// consignor, packed, labelled and counted as revenue.
//
// Lots imported before `outcome` existed have no outcome at all; for those, and only
// those, a sold_price still means sold.

import type { Lot } from '../types';

export function isSoldLot(l: Lot): boolean {
  if (l.outcome) return l.outcome === 'sold';
  return (l.sold_price ?? 0) > 0;
}

export function isUnsoldLot(l: Lot): boolean {
  return !isSoldLot(l);
}

/** Sold but the money never arrived — it fell back to unsold and can be re-sold. */
export function isDefaulted(l: Lot): boolean {
  return l.payment_status === 'defaulted';
}
