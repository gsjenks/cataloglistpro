// hooks/useWatchedLots.ts
// Loads the bidder's watched lot IDs from Supabase.
// Used by AuctionRoom3D to detect when a watched lot goes live.

import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export function useWatchedLots(bidderId: string | null) {
  const [watchedLotIds, setWatchedLotIds] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (!bidderId) { setWatchedLotIds(new Set()); return }

    supabase
      .from('watched_lots')
      .select('lot_id')
      .eq('bidder_id', bidderId)
      .then(({ data }) => {
        setWatchedLotIds(new Set((data ?? []).map((r: any) => r.lot_id)))
      })
  }, [bidderId])

  return watchedLotIds
}