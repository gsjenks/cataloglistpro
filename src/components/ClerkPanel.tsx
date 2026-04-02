// ClerkPanel.tsx
// Clerk/auctioneer control panel — Perry's view.
// Runs at /clerk/:saleId — separate from the bidder UI.
//
// Controls:
//   - Current lot display with bid status
//   - Going Once / Going Twice / SOLD / PASS buttons
//   - Enter floor bid (by paddle number)
//   - Advance to next lot
//   - All lots list with status

import { useState, useCallback } from 'react'
import { useParams }    from 'react-router-dom'
import { useAuction }   from '../hooks/useAuction'
import { supabase }     from '../lib/supabase'
import type { Lot }     from '../types/auction'

// ── Utility ───────────────────────────────────────────────
function fmt(n: number | null | undefined) {
  if (n == null) return '—'
  return '$' + n.toLocaleString()
}

function statusColor(status: string) {
  switch (status) {
    case 'sold':    return '#2d6a4f'
    case 'open':    return '#cc2200'
    case 'passed':  return '#888'
    default:        return '#1a1a1a'
  }
}

// ── Main component ────────────────────────────────────────
export function ClerkPanel() {
  const { saleId } = useParams<{ saleId: string }>()
  const id = saleId ?? ''

  const {
    auctionState,
    currentLot,
    allLots,
    recentBids,
    nextBidAmount,
    loading,
    error,
    placeBid,
  } = useAuction(id)

  const [floorPaddle,  setFloorPaddle]  = useState('')
  const [floorAmount,  setFloorAmount]  = useState('')
  const [floorMsg,     setFloorMsg]     = useState<string | null>(null)
  const [advancing,    setAdvancing]    = useState(false)
  const [calling,      setCalling]      = useState(false)

  // ── Call status actions ────────────────────────────────
  const setCallStatus = useCallback(async (
    status: 'open' | 'going_once' | 'going_twice' | 'sold' | 'passed',
    callText?: string
  ) => {
    setCalling(true)
    await supabase
      .from('auction_state')
      .update({
        call_status:    status,
        auctioneer_call: callText ?? auctionState?.auctioneer_call,
        updated_at:     new Date().toISOString(),
      })
      .eq('sale_id', id)
    setCalling(false)
  }, [id, auctionState])

  const callGoingOnce = () => {
    const amt = fmt(auctionState?.current_bid)
    setCallStatus('going_once', `${amt} — going once!`)
  }
  const callGoingTwice = () => {
    const amt = fmt(auctionState?.current_bid)
    setCallStatus('going_twice', `${amt} — going twice!`)
  }
  const callSold = async () => {
    if (!currentLot || !auctionState?.current_bid) return
    setCalling(true)

    // Mark lot as sold
    await supabase.from('lots').update({
      call_status:     'sold',
      sold_price:      auctionState.current_bid,
      sold_to_bidder:  auctionState.current_bidder_id,
    }).eq('id', currentLot.id)

    // Update auction state
    await supabase.from('auction_state').update({
      call_status:     'sold',
      auctioneer_call: `SOLD! ${fmt(auctionState.current_bid)}`,
      updated_at:      new Date().toISOString(),
    }).eq('sale_id', id)

    setCalling(false)
  }

  const callPass = async () => {
    if (!currentLot) return
    setCalling(true)
    await supabase.from('lots').update({ call_status: 'passed' }).eq('id', currentLot.id)
    await supabase.from('auction_state').update({
      call_status:     'passed',
      auctioneer_call: 'Lot passed — no sale',
      updated_at:      new Date().toISOString(),
    }).eq('sale_id', id)
    setCalling(false)
  }

  // ── Advance to next lot ────────────────────────────────
  const advanceLot = async () => {
    setAdvancing(true)
    const { error } = await supabase.rpc('advance_lot', { p_sale_id: id })
    if (error) console.error('Advance lot error:', error.message)
    setAdvancing(false)
  }

  // ── Enter floor bid ────────────────────────────────────
  const enterFloorBid = async () => {
    setFloorMsg(null)
    if (!currentLot) return

    const amount = parseFloat(floorAmount)
    if (isNaN(amount) || amount <= 0) {
      setFloorMsg('Enter a valid bid amount')
      return
    }

    // Look up bidder by paddle number
    const { data: reg } = await supabase
      .from('auction_registrations')
      .select('bidder_id, paddle_number')
      .eq('sale_id', id)
      .eq('paddle_number', parseInt(floorPaddle))
      .maybeSingle()

    if (!reg) {
      setFloorMsg(`Paddle ${floorPaddle} not found`)
      return
    }

    const result = await placeBid(currentLot.id, reg.bidder_id, amount, 'floor')
    if (result && !result.success) {
      setFloorMsg('Error: ' + result.error)
    } else {
      setFloorMsg(`✓ Floor bid $${amount.toLocaleString()} — Paddle ${floorPaddle}`)
      setFloorPaddle('')
      setFloorAmount('')
    }
  }

  // ── Jump to lot ────────────────────────────────────────
  const jumpToLot = async (lot: Lot) => {
    await supabase.from('lots').update({ call_status: 'open' }).eq('id', lot.id)
    await supabase.from('auction_state').update({
      current_lot_id:   lot.id,
      current_bid:      null,
      current_bidder_id: null,
      bid_count:        0,
      call_status:      'open',
      auctioneer_call:  `Now opening Lot ${lot.lot_number}: ${lot.title}`,
      updated_at:       new Date().toISOString(),
    }).eq('sale_id', id)
  }

  if (loading) return <div className="clerk-loading">Connecting to auction…</div>
  if (error)   return <div className="clerk-error">⚠ {error}</div>

  const callStatus = auctionState?.call_status ?? 'open'
  const currentBid = auctionState?.current_bid

  return (
    <div className="clerk-panel">

      {/* ── Header ─────────────────────────────────────── */}
      <div className="clerk-header">
        <div className="clerk-header__left">
          <div className="clerk-header__title">CLERK PANEL</div>
          <div className="clerk-header__sale">Benson Auction Services · Fine Arts Winter Collection</div>
        </div>
        <div className={`clerk-header__status clerk-header__status--${callStatus}`}>
          {callStatus.replace('_', ' ').toUpperCase()}
        </div>
      </div>

      <div className="clerk-body">

        {/* ── Left: current lot + controls ─────────────── */}
        <div className="clerk-main">

          {/* Current lot */}
          <div className="clerk-lot-card">
            <div className="clerk-lot-card__tag">
              NOW ON BLOCK — LOT {currentLot?.lot_number ?? '—'}
            </div>
            <div className="clerk-lot-card__title">
              {currentLot?.title ?? currentLot?.name ?? 'No lot open'}
            </div>
            <div className="clerk-lot-card__artist">
              {currentLot?.artist ?? ''}
            </div>
            <div className="clerk-lot-card__est">
              Est {fmt(currentLot?.estimate_low)} – {fmt(currentLot?.estimate_high)}
            </div>

            {/* Bid display */}
            <div className="clerk-bid-display">
              <div className="clerk-bid-display__label">Current Bid</div>
              <div className="clerk-bid-display__amount">
                {currentBid != null ? fmt(currentBid) : 'No bids yet'}
              </div>
              <div className="clerk-bid-display__next">
                Next bid: {fmt(nextBidAmount)}
                &nbsp;·&nbsp;
                {auctionState?.bid_count ?? 0} bids
              </div>
            </div>

            {/* Auctioneer call text */}
            <div className="clerk-call-text">
              {auctionState?.auctioneer_call ?? '—'}
            </div>
          </div>

          {/* ── Call buttons ─────────────────────────── */}
          <div className="clerk-call-buttons">
            <button
              className="clerk-btn clerk-btn--open"
              onClick={() => setCallStatus('open',
                `${fmt(currentBid)} — do I hear ${fmt(nextBidAmount)}?`)}
              disabled={calling}
            >
              🔓 Re-Open
            </button>
            <button
              className="clerk-btn clerk-btn--once"
              onClick={callGoingOnce}
              disabled={calling || !currentBid}
            >
              1️⃣ Going Once
            </button>
            <button
              className="clerk-btn clerk-btn--twice"
              onClick={callGoingTwice}
              disabled={calling || !currentBid}
            >
              2️⃣ Going Twice
            </button>
            <button
              className="clerk-btn clerk-btn--sold"
              onClick={callSold}
              disabled={calling || !currentBid}
            >
              🔨 SOLD!
            </button>
            <button
              className="clerk-btn clerk-btn--pass"
              onClick={callPass}
              disabled={calling}
            >
              ❌ Pass
            </button>
          </div>

          {/* ── Advance lot ──────────────────────────── */}
          <button
            className="clerk-advance-btn"
            onClick={advanceLot}
            disabled={advancing}
          >
            {advancing ? 'Advancing…' : '▶ Advance to Next Lot'}
          </button>

          {/* ── Floor bid entry ───────────────────────── */}
          <div className="clerk-floor-bid">
            <div className="clerk-floor-bid__title">Enter Floor Bid</div>
            <div className="clerk-floor-bid__row">
              <input
                className="clerk-input"
                type="number"
                placeholder="Paddle #"
                value={floorPaddle}
                onChange={e => setFloorPaddle(e.target.value)}
              />
              <input
                className="clerk-input clerk-input--amount"
                type="number"
                placeholder="Amount $"
                value={floorAmount}
                onChange={e => setFloorAmount(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') enterFloorBid() }}
              />
              <button
                className="clerk-btn clerk-btn--floor"
                onClick={enterFloorBid}
              >
                Enter
              </button>
            </div>
            {floorMsg && (
              <div className={`clerk-floor-bid__msg ${floorMsg.startsWith('✓') ? 'clerk-floor-bid__msg--ok' : 'clerk-floor-bid__msg--err'}`}>
                {floorMsg}
              </div>
            )}
          </div>

          {/* ── Recent bids ───────────────────────────── */}
          <div className="clerk-bid-feed">
            <div className="clerk-bid-feed__title">Recent Bids</div>
            {recentBids.slice(0, 6).map(bid => (
              <div key={bid.id} className={`clerk-bid-row ${bid.is_winning ? 'clerk-bid-row--winning' : ''}`}>
                <span className="clerk-bid-row__src">{bid.source}</span>
                <span className="clerk-bid-row__amt">{fmt(bid.amount)}</span>
                <span className="clerk-bid-row__time">
                  {new Date(bid.placed_at).toLocaleTimeString()}
                </span>
              </div>
            ))}
          </div>

        </div>

        {/* ── Right: lot list ───────────────────────────── */}
        <div className="clerk-lot-list">
          <div className="clerk-lot-list__title">
            All Lots ({allLots.length})
          </div>
          {allLots.map(lot => {
            const isActive = lot.id === auctionState?.current_lot_id
            return (
              <div
                key={lot.id}
                className={`clerk-lot-row ${isActive ? 'clerk-lot-row--active' : ''}`}
              >
                <div className="clerk-lot-row__num">
                  {lot.lot_number}
                </div>
                <div className="clerk-lot-row__info">
                  <div className="clerk-lot-row__name">
                    {lot.title ?? lot.title}
                  </div>
                  <div
                    className="clerk-lot-row__status"
                    style={{ color: statusColor(lot.status) }}
                  >
                    {lot.status === 'sold'
                      ? `SOLD ${fmt(lot.sold_amount)}`
                      : lot.status.toUpperCase()
                    }
                  </div>
                </div>
                {lot.status !== 'sold' && !isActive && (
                  <button
                    className="clerk-lot-row__jump"
                    onClick={() => jumpToLot(lot)}
                    title="Jump to this lot"
                  >
                    ▶
                  </button>
                )}
                {isActive && (
                  <span className="clerk-lot-row__live">LIVE</span>
                )}
              </div>
            )
          })}
        </div>

      </div>
    </div>
  )
}
