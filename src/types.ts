// Complete types.ts file - Copy this entire file to src/types.ts

export interface User {
  id: string;
  email: string;
  created_at?: string;
}

export interface Company {
  id: string;
  name: string;
  address?: string;
  phone?: string;
  currency: string;
  units: 'metric' | 'imperial';
  logo_url?: string;
  created_at?: string;
  updated_at?: string;
  user_id?: string;
}

export interface Sale {
  id: string;
  company_id: string;
  name: string;
  start_date?: string;
  location?: string;
  status: 'upcoming' | 'active' | 'completed';
  // Selling path. estate_sale (on-site POS) / auction (live bidding) / social
  // (comment-selling via Facebook/Instagram Reels or Live). Defaults to
  // 'auction' for legacy sales created before this field existed.
  sale_type?: 'estate_sale' | 'auction' | 'social';
  // Buyer self-checkout (Square Mode 1). Only meaningful for estate sales.
  online_checkout_enabled?: boolean;
  // When public self-checkout opens. null/undefined = opens immediately once
  // enabled. A future timestamp gives in-person shoppers a priority window.
  online_checkout_opens_at?: string | null;
  // Auction lifecycle pipeline (#2). Fine-grained stage that drives the coarse
  // `status` above; see docs/auction-lifecycle-spec.md + src/lib/auctionStages.ts.
  stage?: SaleStage;
  stage_progress?: StageProgress;
  // LiveAuctioneers listing metadata (Stage 3 "Listed").
  la_auction_url?: string;
  auction_starts_at?: string;
  la_approved_at?: string;
  created_at?: string;
  updated_at?: string;
}

export interface Lot {
  id: string;
  sale_id: string;
  lot_number?: number | string;
  name: string;
  description?: string;
  quantity?: number;
  condition?: string;
  category?: string;
  style?: string;
  origin?: string;
  creator?: string;
  materials?: string;
  estimate_low?: number;
  estimate_high?: number;
  starting_bid?: number;
  reserve_price?: number;
  buy_now_price?: number;
  sold_price?: number;
  height?: number;
  width?: number;
  depth?: number;
  weight?: number;
  dimension_unit?: string;
  consignor?: string;
  // Estate-sale floor inventory state. Staff can set this at any time; it is
  // independent of the online self-checkout delay. Defaults to 'available'.
  inventory_status?: 'available' | 'held' | 'sold';
  // Buyer-basket hold (Phase 4a): when a buyer adds the item to their basket it
  // is held until `held_until`; `held_by` is the buyer's basket id.
  held_until?: string | null;
  held_by?: string | null;
  // Estate delivery: this item goes out for delivery, plus per-item delivery/mover
  // details used when the sale has no register transaction to carry them.
  for_delivery?: boolean;
  delivery_address?: string | null;
  delivery_date?: string | null;
  delivery_estimate?: string | null;
  delivery_company?: string | null;
  delivery_company_phone?: string | null;
  delivery_company_email?: string | null;
  // Auction lifecycle (#2). Consignor tag (supersedes the legacy free-text
  // `consignor` above) + cataloging and post-auction state. See
  // docs/auction-lifecycle-spec.md.
  consignment_id?: string;
  condition_report?: string;
  is_restricted?: boolean;
  restricted_category?: string;
  // Post-auction outcome + payment resolution (spec §4.1)
  outcome?: LotOutcome;
  payment_status?: LotPaymentStatus;
  payment_due_at?: string;         // won_at + 72h
  second_bidder_amount?: number;   // manual entry
  second_bidder_contact?: string;  // manual entry
  // Paid for, then given back. The lot returns to unsold; these record the money out.
  refund_amount?: number;
  refunded_at?: string;
  refund_method?: string;
  refund_reason?: string;
  // Unsold disposition cascade (spec §4.2)
  disposition?: LotDisposition;
  disposition_at?: string;
  disposition_note?: string;
  // Fulfillment (Stage 6)
  fulfillment_method?: 'ship' | 'pickup';
  fulfillment_carrier?: string;   // fedex|usps|ups|allied|crating|inhouse|pickup|store…
  tracking_number?: string;
  shipped_at?: string;
  delivered_at?: string;
  // Winning buyer + settlement extras captured from the LA EOA import (D3).
  buyer?: LotBuyer;
  buyers_premium?: number;
  la_invoice_id?: string;
  created_at?: string;
  updated_at?: string;
}

// Winning buyer as stored in lots.buyer (jsonb), from the LiveAuctioneers EOA export.
export interface LotBuyer {
  name?: string;
  username?: string;
  email?: string;
  phone?: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  country?: string;
}

export interface Photo {
  id: string;
  lot_id: string;
  file_path: string;
  file_name: string;
  is_primary: boolean;
  display_order?: number;
  created_at: string;
  updated_at: string;
  ai_description?: string;
  ai_tags?: string[];
  ai_colors?: string[];
  ai_objects?: string[];
  ai_enriched?: boolean;
  ai_enriched_at?: string;
  synced?: boolean;  // Track sync status for offline-first
}

export interface Contact {
  id: string;
  company_id?: string;
  sale_id?: string;
  prefix?: string;
  first_name?: string;
  middle_name?: string;
  last_name?: string;
  suffix?: string;
  business_name?: string;
  email?: string;
  phone?: string;
  role?: string;
  address?: string;
  city?: string;
  state?: string;
  zip_code?: string;
  contact_type?: string;
  notes?: string;
  created_at?: string;
  updated_at?: string;
}

export interface Document {
  id: string;
  company_id?: string;
  sale_id?: string;
  name: string;
  file_path: string;
  file_name: string;
  file_url?: string;
  file_size?: number;
  file_type?: string;
  document_type?: string;
  description?: string;
  type?: string;
  created_at?: string;
  updated_at?: string;
}

export interface LookupCategory {
  id: string;
  company_id: string;
  type: 'category' | 'style' | 'origin' | 'creator' | 'material';
  value: string;
  created_at?: string;
}

export type TenderType = 'cash' | 'check' | 'venmo' | 'cashapp' | 'card' | 'other';

export type Fulfillment = 'carry' | 'delivery';

export interface SalesTransaction {
  id: string;
  sale_id: string;
  company_id?: string | null;
  subtotal: number;
  tax: number;
  total: number;
  tender_type: TenderType;
  status: 'completed' | 'voided';
  buyer_name?: string | null;
  note?: string | null;
  delivery_address?: string | null;
  delivery_date?: string | null;
  delivery_estimate?: string | null;
  delivery_company?: string | null;
  delivery_company_phone?: string | null;
  delivery_company_email?: string | null;
  created_at?: string;
}

export interface SalesTransactionItem {
  id: string;
  transaction_id: string;
  lot_id?: string | null;
  description?: string | null;
  price: number;
  fulfillment?: Fulfillment;
  created_at?: string;
}

// ── Social Media Sales Stream (comment-selling via Facebook / Instagram) ──────

export type SocialPlatform = 'facebook' | 'instagram';

// A connected Meta account (FB Page / IG business account). The access token is
// NOT exposed here — it lives in a service-role-only table.
export interface SocialConnection {
  id: string;
  company_id: string;
  platform: SocialPlatform;
  external_account_id: string;
  account_name?: string | null;
  status: 'active' | 'revoked' | 'expired';
  token_expires_at?: string | null;
  created_at?: string;
  updated_at?: string;
}

// One live/Reel selling session tied to a sale.
export interface SocialStream {
  id: string;
  sale_id: string;
  company_id: string;
  connection_id?: string | null;
  platform: SocialPlatform;
  media_type: 'reel' | 'live' | 'post';
  external_media_id?: string | null;
  status: 'draft' | 'live' | 'ended';
  claim_keyword?: string | null;
  created_at?: string;
  updated_at?: string;
}

// One buyer comment claiming a lot.
export interface SocialClaim {
  id: string;
  stream_id?: string | null;
  sale_id?: string | null;
  company_id: string;
  lot_id?: string | null;
  platform?: SocialPlatform | null;
  external_comment_id?: string | null;
  commenter_external_id?: string | null;
  commenter_name?: string | null;
  comment_text?: string | null;
  matched_token?: string | null;
  shopper_id?: string | null;
  status: 'pending' | 'held' | 'checkout_sent' | 'purchased' | 'released' | 'failed';
  checkout_url?: string | null;
  hold_basket_id?: string | null;
  note?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface UserCompany {
  user_id: string;
  company_id: string;
  role: 'owner' | 'admin' | 'member';
  created_at?: string;
}

// A shipper / handler in the company's directory (Stage 6 fulfillment).
export interface Shipper {
  id: string;
  company_id?: string;
  name: string;
  kind?: 'inhouse' | 'external';
  phone?: string;
  email?: string;
  address?: string;
  notes?: string;
  active?: boolean;
  created_at?: string;
  updated_at?: string;
}

// ── Auction lifecycle (#2 Setup) ─────────────────────────────────────────────
// Backing types for the sale stage pipeline, per-consignor consignments, and the
// post-auction lot state machines. See docs/auction-lifecycle-spec.md.

export type SaleStage =
  | 'intake' | 'setup' | 'listed' | 'live'
  | 'settlement' | 'fulfillment' | 'reconciliation' | 'closed';

export type LotOutcome = 'pending' | 'sold' | 'passed';
export type LotPaymentStatus = 'unpaid' | 'paid' | 'second_chance' | 'defaulted' | 'refunded';
export type LotDisposition = 'returned' | 'hold_relist' | 'charity' | 'discarded';

// One checklist item's state within sales.stage_progress.
export interface ChecklistItemState {
  done: boolean;
  done_at?: string;
  done_by?: string;
  note?: string;
}

// Recorded whenever an operator force-advances past an unsatisfied gate.
export interface StageOverride {
  stage: SaleStage;
  at: string;
  by?: string;
  reason: string;
}

// Shape of the sales.stage_progress jsonb column.
export interface StageProgress {
  items?: Record<string, ChecklistItemState>;
  overrides?: StageOverride[];
}

// A free-form consignor fee line (e.g. cleanout, parking, gate, setup, other),
// with an optional comment explaining the charge.
export interface CustomFee {
  label: string;
  amount: number;
  note?: string;
}

export interface ConsignmentFees {
  photography?: number;
  cataloging?: number;
  insurance?: number;
  storage?: number;
  buyin?: number;
  // Extra ad-hoc fees charged to the consignor (estate cleanout, parking, gate,
  // setup, or anything else). Each carries a label + amount + optional comment.
  custom?: CustomFee[];
}

// A buyer's resale / sales-tax exemption certificate. Company-scoped and not tied to a
// sale, so a returning dealer is recognised automatically. `image_path` is an object in
// the private `documents` bucket — read it through a signed URL, never a public one.
export interface TaxExemption {
  id: string;
  company_id?: string;
  contact_id?: string;
  buyer_key: string;            // buyer email, else name
  buyer_name?: string;
  business_name?: string;
  state?: string;
  permit_number?: string;
  issued_on?: string;           // date-only
  expires_on?: string;          // date-only; absent = no stated expiry
  image_path?: string;
  image_name?: string;
  note?: string;
  verified_at?: string;
  verified_by?: string;
  created_at?: string;
  updated_at?: string;
}

// Shipping, handling and sales tax the AUCTION HOUSE collects from a buyer directly —
// as opposed to whatever LiveAuctioneers collected (BuyerInvoiceRecord). Only these
// touch the house's books. One row per buyer per sale; also covers post-sale purchases,
// which have no LA invoice.
export interface HouseCharge {
  id: string;
  company_id?: string;
  sale_id?: string;
  buyer_key: string;            // buyer email, else name
  buyer_name?: string;
  shipping: number;
  handling: number;
  tax_rate: number;             // percent
  // False when LA already taxed the lots — only the house's shipping/handling is taxed.
  tax_includes_goods?: boolean;
  taxable_base: number;         // (goods, if included) + shipping + handling
  tax: number;
  tax_exempt?: boolean;
  exempt_reason?: string;
  collected_at?: string;
  payment_method?: string;
  note?: string;
  created_at?: string;
  updated_at?: string;
}

// A buyer's invoice as printed by LiveAuctioneers, imported from the end-of-auction
// invoice PDF. The only source of sales tax, shipping and the online-payments fee —
// the EOA XML carries hammer + premium alone. Joins to lots on la_invoice_id.
export interface BuyerInvoiceRecord {
  id: string;
  company_id?: string;
  sale_id?: string;
  la_invoice_id: string;
  status?: 'paid' | 'unpaid';
  buyer_name?: string;
  buyer_email?: string;
  buyer_phone?: string;
  ship_to?: {
    lines?: string[];
    address?: string; city?: string; state?: string; zip?: string; country?: string;
  };
  shipping_method?: string;
  hammer_total?: number;
  premium_total?: number;
  shipping?: number;
  online_fee?: number;
  sales_tax?: number;
  total?: number;
  balance_due?: number;
  payment_method?: string;
  paid_at_text?: string;
  lot_numbers?: number[];
  // Per-lot lines exactly as LA billed them, for crediting a lot that falls off.
  lines?: { lotNumber: number; title: string; hammer: number; premium: number; price: number }[];
  totals_balance?: boolean;   // false = LA's printed total doesn't add up; review it
  imported_at?: string;
  created_at?: string;
  updated_at?: string;
}

// One consignor's terms + settlement for a sale. A sale pools lots from many
// consignments; each lot carries consignment_id.
export interface Consignment {
  id: string;
  company_id?: string;
  sale_id?: string;
  contact_id?: string;          // the consignor (references contacts)
  commission_rate?: number;
  buyers_premium_rate?: number;
  reserve_policy?: 'none' | 'per_lot' | 'blanket';
  fee_schedule?: ConsignmentFees;
  lead_source?: string;
  // Reconciliation (Stage 7)
  net_due?: number;             // amount of the payout that was recorded
  settled_at?: string;          // statement generated / figures locked
  paid_at?: string;
  payment_method?: string;      // check | ach | wire | cash | other
  payment_reference?: string;   // check #, ACH/wire confirmation
  payout_note?: string;
  created_at?: string;
  updated_at?: string;
}