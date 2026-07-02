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
  // Estate Sale vs Auction path (see Phase 0 of the estate-sale POS work).
  // Defaults to 'auction' for legacy sales created before this field existed.
  sale_type?: 'estate_sale' | 'auction';
  // Buyer self-checkout (Square Mode 1). Only meaningful for estate sales.
  online_checkout_enabled?: boolean;
  // When public self-checkout opens. null/undefined = opens immediately once
  // enabled. A future timestamp gives in-person shoppers a priority window.
  online_checkout_opens_at?: string | null;
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
  created_at?: string;
  updated_at?: string;
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
  created_at?: string;
}

export interface SalesTransactionItem {
  id: string;
  transaction_id: string;
  lot_id?: string | null;
  description?: string | null;
  price: number;
  created_at?: string;
}

export interface UserCompany {
  user_id: string;
  company_id: string;
  role: 'owner' | 'admin' | 'member';
  created_at?: string;
}