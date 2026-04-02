export interface Auction {
  id: string
  title: string
  subtitle: string | null
  auction_date: string
  status: 'scheduled' | 'live' | 'paused' | 'closed'
  buyer_premium: number
  current_lot_id: string | null
}

export interface AuctionState {
  auction_id: string
  current_lot_id: string | null
  current_bid: number | null
  current_bidder_id: string | null
  bid_count: number
  call_status: 'open' | 'going_once' | 'going_twice' | 'sold' | 'passed'
  watching_count: number
  auctioneer_call: string | null
  updated_at: string
}

export interface LotImage {
  id: string
  storage_path: string
  public_url: string | null
  caption: string | null
  sort_order: number
}

export interface Lot {
  id: string
  auction_id: string
  lot_number: number
  title: string
  description: string | null
  artist: string | null
  medium: string | null
  dimensions: string | null
  condition_report: string | null
  provenance: string | null
  estimate_low: number | null
  estimate_high: number | null
  bid_increment: number
  opening_bid: number
  status: 'pending' | 'open' | 'sold' | 'passed' | 'withdrawn'
  sold_amount: number | null
  sort_order: number
  images: LotImage[]
}

export interface Bid {
  id: string
  lot_id: string
  amount: number
  source: string
  is_winning: boolean
  placed_at: string
  bidder?: {
    first_name: string
    last_name: string
    paddle_number: number
  } | null
}

export interface BidderProfile {
  id: string
  first_name: string
  last_name: string
  email: string
  paddle_number: number | null
  is_approved: boolean
}

export type PlaceBidResult =
  | { success: true;  bid_id: string; amount: number; next_bid: number }
  | { success: false; error: string }
