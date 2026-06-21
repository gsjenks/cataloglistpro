// hooks/useAuction.ts
import { useEffect, useState, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'
import type { AuctionState, Lot, Bid, PlaceBidResult } from '../types/auction'

interface DatabaseLot {
  id: string
  sale_id: string
  lot_number: number
  name: string
  description: string | null
  creator: string | null
  materials: string | null
  height: number | null
  width: number | null
  depth: number | null
  dimension_unit: string | null
  condition: string | null
  call_status: string | null
  sold_price: number | null
  images: { public_url: string | null; is_primary: boolean }[]
  [key: string]: unknown
}

export function useAuction(saleId: string) {
  const [state,      setState]   = useState<AuctionState | null>(null)
  const [currentLot, setLot]     = useState<Lot | null>(null)
  const [allLots,    setAllLots] = useState<Lot[]>([])
  const [recentBids, setBids]    = useState<Bid[]>([])
  const [loading,    setLoading] = useState(true)
  const [error,      setError]   = useState<string | null>(null)
  const currentLotRef = useRef<string | null>(null)

  // ── Loaders ───────────────────────────────────────────────
  const loadAllLots = useCallback(async () => {
    const { data, error } = await supabase
      .from('lots')
      .select(`
        id, sale_id, lot_number, name, description,
        creator, materials, condition, category,
        estimate_low, estimate_high, opening_bid,
        starting_bid, reserve_price, sold_price,
        bid_increment, sort_order, call_status,
        sold_to_bidder, consignor,
        height, width, depth, dimension_unit,
        images:photos (
          id, file_path, public_url, is_primary,
          sort_order, caption, ai_description
        )
      `)
      .eq('sale_id', saleId)
      .order('sort_order', { nullsFirst: false })
      .order('lot_number', { nullsFirst: false })

    if (error) { setError(error.message); return }

    const sorted = (data || []).map((lot: DatabaseLot) => ({
      ...lot,
      title:            lot.name,
      artist:           lot.creator,
      medium:           lot.materials,
      dimensions: [lot.height, lot.width, lot.depth]
        .filter(Boolean)
        .map((d: number) => d.toString())
        .join(' × ') + (lot.dimension_unit ? ` ${lot.dimension_unit}.` : ''),
      condition_report: lot.condition,
      status:           callStatusToLotStatus(lot.call_status),
      sold_amount:      lot.sold_price,
      images:           sortImages(lot.images || []),
    }))

    setAllLots(sorted)
  }, [saleId])

  const loadLotDetail = useCallback(async (lotId: string) => {
    const { data, error } = await supabase
      .from('lots')
      .select(`
        id, sale_id, lot_number, name, description,
        creator, materials, condition, category,
        estimate_low, estimate_high, opening_bid,
        starting_bid, reserve_price, sold_price,
        bid_increment, sort_order, call_status,
        provenance:description,
        height, width, depth, dimension_unit,
        images:photos (
          id, file_path, public_url, is_primary,
          sort_order, caption, ai_description
        )
      `)
      .eq('id', lotId)
      .single()

    if (error) { setError(error.message); return }

    const lot = {
      ...data,
      title:            data.name,
      artist:           data.creator,
      medium:           data.materials,
      condition_report: data.condition,
      dimensions: [data.height, data.width, data.depth]
        .filter(Boolean)
        .map((d: number) => d.toString())
        .join(' × ') + (data.dimension_unit ? ` ${data.dimension_unit}.` : ''),
      status:      callStatusToLotStatus(data.call_status),
      sold_amount: data.sold_price,
      images:      sortImages(data.images || []),
    }

    setLot(lot)
    currentLotRef.current = lotId
  }, [])

  const loadRecentBids = useCallback(async (lotId: string) => {
    const { data, error } = await supabase
      .from('bids')
      .select(`
        id, lot_id, sale_id, amount, source, is_winning, is_retracted, placed_at,
        bidder:bidders (
          first_name, last_name,
          registrations:auction_registrations ( paddle_number, sale_id )
        )
      `)
      .eq('lot_id', lotId)
      .order('placed_at', { ascending: false })
      .limit(8)

    if (error) { setError(error.message); return }
    setBids(data || [])
  }, [])

  // ── Initial load ──────────────────────────────────────────
  useEffect(() => {
    let cancelled = false

    async function init() {
      setLoading(true)

      const { data: st, error: stErr } = await supabase
        .from('auction_state')
        .select('*')
        .eq('sale_id', saleId)
        .maybeSingle()

if (stErr || cancelled) {
  setError(stErr?.message ?? null)
  setLoading(false)
  return
}

if (st) {
  setState(st)
  if (st.current_lot_id) {
    await loadLotDetail(st.current_lot_id)
    await loadRecentBids(st.current_lot_id)
  }
}

await loadAllLots()

      if (!cancelled) setLoading(false)
    }

    init()
    return () => { cancelled = true }
  }, [saleId, loadAllLots, loadLotDetail, loadRecentBids])

  // ── Realtime subscription ─────────────────────────────────
  useEffect(() => {
    const channel = supabase
      .channel(`auction:${saleId}`)

      // auction_state UPDATE — this is the key one for winning/outbid detection
      .on(
        'postgres_changes',
        {
          event:  'UPDATE',
          schema: 'public',
          table:  'auction_state',
          filter: `sale_id=eq.${saleId}`,
        },
        async (payload) => {
          const newState = payload.new as AuctionState
          setState(newState)

          if (
            newState.current_lot_id &&
            newState.current_lot_id !== currentLotRef.current
          ) {
            await loadLotDetail(newState.current_lot_id)
            await loadRecentBids(newState.current_lot_id)
            await loadAllLots()
          }
        }
      )

      // bids INSERT — optimistic update for new bids
      .on(
        'postgres_changes',
        {
          event:  'INSERT',
          schema: 'public',
          table:  'bids',
          filter: `sale_id=eq.${saleId}`,
        },
        async (payload) => {
          const { data } = await supabase
            .from('bids')
            .select(`
              id, lot_id, sale_id, amount, source, is_winning, is_retracted, placed_at,
              bidder:bidders (
                first_name, last_name,
                registrations:auction_registrations ( paddle_number, sale_id )
              )
            `)
            .eq('id', (payload.new as Bid).id)
            .single()

          if (data) {
            setBids(prev => {
              if (prev.some(b => b.id === data.id)) return prev
              const cleared = prev.map(b => ({ ...b, is_winning: false }))
              return [data, ...cleared].slice(0, 8)
            })
          }
        }
      )

      // bids UPDATE — handles retractions
      .on(
        'postgres_changes',
        {
          event:  'UPDATE',
          schema: 'public',
          table:  'bids',
          filter: `sale_id=eq.${saleId}`,
        },
        async () => {
          if (currentLotRef.current) {
            await loadRecentBids(currentLotRef.current)
          }
        }
      )

      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [saleId, loadLotDetail, loadRecentBids, loadAllLots])

  // ── Place bid ─────────────────────────────────────────────
  const placeBid = useCallback(async (
    lotId:    string,
    bidderId: string,
    amount:   number,
    source    = 'web',
  ): Promise<PlaceBidResult> => {
    const { data, error } = await supabase.rpc('place_bid', {
      p_lot_id:    lotId,
      p_bidder_id: bidderId,
      p_amount:    amount,
      p_source:    source,
    })
    if (error) return { success: false, error: error.message }
    return data as PlaceBidResult
  }, [])

  // ── Helpers ───────────────────────────────────────────────
  const nextBidAmount = state && currentLot
    ? (state.current_bid ??
       (currentLot.opening_bid ?? currentLot.starting_bid ?? 0) -
       (currentLot.bid_increment ?? 50)
      ) + (currentLot.bid_increment ?? 50)
    : null

  return {
    auctionState:  state,
    currentLot,
    allLots,
    recentBids,
    loading,
    error,
    nextBidAmount,
    winningBid:   recentBids.find(b => b.is_winning) ?? null,
    soldLots:     allLots.filter(l => l.status === 'sold'),
    pendingLots:  allLots.filter(l => l.status === 'pending'),
    placeBid,
  }
}

// ── Utilities ─────────────────────────────────────────────────
function sortImages(images: { is_primary: boolean; sort_order?: number }[]) {
  return [...images].sort((a, b) => {
    if (a.is_primary && !b.is_primary) return -1
    if (!a.is_primary && b.is_primary) return 1
    return (a.sort_order ?? 0) - (b.sort_order ?? 0)
  })
}

function callStatusToLotStatus(callStatus: string | null) {
  switch (callStatus) {
    case 'open':        return 'open'
    case 'going_once':  return 'open'
    case 'going_twice': return 'open'
    case 'sold':        return 'sold'
    case 'passed':      return 'passed'
    case 'withdrawn':   return 'withdrawn'
    default:            return 'pending'
  }
}