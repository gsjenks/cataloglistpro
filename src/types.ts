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

export interface UserCompany {
  user_id: string;
  company_id: string;
  role: 'owner' | 'admin' | 'member';
  created_at?: string;
}