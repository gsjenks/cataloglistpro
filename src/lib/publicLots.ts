// src/lib/publicLots.ts
// Read access for the public (no-auth) buyer pages. anon cannot read the lots
// or sales tables; everything goes through SECURITY DEFINER functions that
// return allow-listed columns only (migration 20261004000000_lots_public_access):
//   public_sale / public_sale_lots / public_lot  — anyone
//   my_lot / my_basket                          — only with the shopper's token
// Never add a direct `.from('lots')` read to a public page.

import { supabasePublic } from './publicClient';

export interface PublicSaleInfo {
  id: string;
  name: string;
  subtitle: string | null;
  sale_type: string | null;
  online_checkout_enabled: boolean | null;
  online_checkout_opens_at: string | null;
}

export interface PublicLot {
  id: string;
  sale_id: string;
  lot_number: number | string | null;
  name: string;
  description: string | null;
  condition: string | null;
  category: string | null;
  origin: string | null;
  creator: string | null;
  materials: string | null;
  style: string | null;
  height: number | null;
  width: number | null;
  depth: number | null;
  dimension_unit: string | null;
  starting_bid: number | null;
  opening_bid: number | null;
  estimate_low: number | null;
  estimate_high: number | null;
  inventory_status: string | null;
  held_until: string | null;
  primary_file_path?: string | null;
}

export interface MyLotDelivery {
  address: string | null;
  date: string | null;
  estimate: string | null;
  company: string | null;
  company_phone: string | null;
  company_email: string | null;
}

export type MyLot =
  | { relation: 'holder'; held_until: string | null }
  | {
      relation: 'buyer';
      price: number | null;
      purchased_at: string;
      fulfillment: 'carry' | 'delivery';
      delivery: MyLotDelivery | null;
    };

export async function fetchPublicSale(saleId: string): Promise<PublicSaleInfo | null> {
  const { data, error } = await supabasePublic.rpc('public_sale', { p_sale_id: saleId });
  if (error) console.warn('public_sale failed:', error.message);
  return (data as PublicSaleInfo | null) ?? null;
}

export async function fetchPublicSaleLots(saleId: string): Promise<PublicLot[]> {
  const { data, error } = await supabasePublic.rpc('public_sale_lots', { p_sale_id: saleId });
  if (error) console.warn('public_sale_lots failed:', error.message);
  return (data as PublicLot[] | null) ?? [];
}

export async function fetchPublicLot(lotId: string): Promise<PublicLot | null> {
  const { data, error } = await supabasePublic.rpc('public_lot', { p_lot_id: lotId });
  if (error) console.warn('public_lot failed:', error.message);
  return (data as PublicLot | null) ?? null;
}

/** The shopper's own hold or purchase of this lot; null for anyone else. */
export async function fetchMyLot(lotId: string, token: string | null | undefined): Promise<MyLot | null> {
  if (!token) return null;
  const { data, error } = await supabasePublic.rpc('my_lot', { p_lot_id: lotId, p_token: token });
  if (error) console.warn('my_lot failed:', error.message);
  return (data as MyLot | null) ?? null;
}

// ── Live updates ───────────────────────────────────────────────────────────
// A trigger on lots sends a content-free broadcast ('lot_changed', {lot_id})
// on topic 'sale-lots:<saleId>'; listeners re-fetch through the functions
// above. One channel per sale, shared by every listener on the page (the
// catalog and the basket both listen), with a slow poll as a backstop for a
// dropped socket.

type Listener = (lotId: string | null) => void;

interface SaleSub {
  listeners: Set<Listener>;
  teardown: () => void;
}

const subs = new Map<string, SaleSub>();
const POLL_MS = 60 * 1000;
const DEBOUNCE_MS = 400;

function notifyAll(saleId: string, lotId: string | null) {
  subs.get(saleId)?.listeners.forEach((fn) => fn(lotId));
}

export function subscribeSaleLots(saleId: string, onChange: Listener): () => void {
  let sub = subs.get(saleId);
  if (!sub) {
    // A bulk write (e.g. reclaiming expired holds) sends one message per lot;
    // coalesce them into one refresh.
    let timer: ReturnType<typeof setTimeout> | null = null;
    let pendingLot: string | null = null;
    let pendingMany = false;
    const flush = () => {
      timer = null;
      notifyAll(saleId, pendingMany ? null : pendingLot);
      pendingLot = null;
      pendingMany = false;
    };
    const channel = supabasePublic
      .channel(`sale-lots:${saleId}`)
      .on('broadcast', { event: 'lot_changed' }, (msg) => {
        const lotId = (msg.payload as { lot_id?: string } | undefined)?.lot_id ?? null;
        if (timer) pendingMany = pendingMany || pendingLot !== lotId;
        else pendingLot = lotId;
        if (timer) clearTimeout(timer);
        timer = setTimeout(flush, DEBOUNCE_MS);
      })
      .subscribe();
    const poll = setInterval(() => {
      if (document.visibilityState === 'visible') notifyAll(saleId, null);
    }, POLL_MS);
    sub = {
      listeners: new Set(),
      teardown: () => {
        if (timer) clearTimeout(timer);
        clearInterval(poll);
        supabasePublic.removeChannel(channel);
      },
    };
    subs.set(saleId, sub);
  }
  sub.listeners.add(onChange);
  return () => {
    const s = subs.get(saleId);
    if (!s) return;
    s.listeners.delete(onChange);
    if (s.listeners.size === 0) {
      s.teardown();
      subs.delete(saleId);
    }
  };
}

/** Public URL for a file in the (public) photos bucket. */
export function photoUrl(filePath: string): string {
  return supabasePublic.storage.from('photos').getPublicUrl(filePath).data.publicUrl;
}
