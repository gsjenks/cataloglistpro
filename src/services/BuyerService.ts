// src/services/BuyerService.ts
// Edit the buyer recorded on lots. LiveAuctioneers-imported buyers arrive complete,
// but a second-chance or aftersale buyer is entered by hand — and anything captured
// before there was somewhere to type an address needs fixing up.

import { supabase } from '../lib/supabase';
import type { LotBuyer } from '../types';

// Applies to every lot in a buyer's shipment at once — they share one address.
export async function updateBuyerForLots(lotIds: string[], buyer: LotBuyer): Promise<void> {
  if (!lotIds.length) return;
  const { error } = await supabase.from('lots').update({ buyer }).in('id', lotIds);
  if (error) throw error;
}
