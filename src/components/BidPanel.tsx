// BidPanel.tsx — updated with login modal trigger
/* eslint-disable @typescript-eslint/no-unused-vars */

import { useState } from 'react'
import { BidderLoginModal } from './BidderLoginModal'
import type { AuctionState, Lot, Bid, BidderProfile } from '../types/auction'

interface Props {
  auctionState:  AuctionState | null
  currentLot:    Lot | null
  recentBids:    Bid[]
  nextBidAmount: number | null
  bidder:        BidderProfile | null
  canBid:        boolean
  onPlaceBid:    (amount: number) => Promise<void>
}

function sourceLabel(source: string): string {
  const map: Record<string, string> = {
    floor:          'Floor bid',
    phone:          'Phone bid',
    web:            'Web bid',
    liveauctioneers:'LiveAuctioneers',
    proxibid:       'ProxiBid',
    hibid:          'HiBid',
    absentee:       'Absentee',
    maxbid:         'Auto-bid',
  }
  return map[source] ?? source
}

function callStatusLabel(status: AuctionState['call_status']): string {
  switch (status) {
    case 'going_once':  return 'Going once…'
    case 'going_twice': return 'Going twice…'
    case 'sold':        return 'SOLD! 🔨'
    case 'passed':      return 'Passed'
    default:            return 'Bidding open'
  }
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', {
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  })
}

export function BidPanel({
  auctionState, currentLot, recentBids,
  nextBidAmount, bidder, canBid, onPlaceBid,
}: Props) {
  const [placing,   setPlacing]   = useState(false)
  const [feedback,  setFeedback]  = useState<string | null>(null)
  const [showLogin, setShowLogin] = useState(false)

  const handleBid = async () => {
    if (!nextBidAmount || placing) return
    setPlacing(true)
    setFeedback(null)
    await onPlaceBid(nextBidAmount)
    setFeedback(`✓ $${nextBidAmount.toLocaleString()} placed!`)
    setPlacing(false)
    setTimeout(() => setFeedback(null), 2000)
  }

  const currentBid = auctionState?.current_bid
  const callStatus = auctionState?.call_status ?? 'open'
  const callText   = auctionState?.auctioneer_call

  const openingBid = currentLot?.opening_bid ?? (currentLot as any)?.starting_bid ?? 0

  return (
    <>
      <aside className="bid-panel">

        {/* Lot header */}
        {currentLot && (
          <div className="bid-panel__header">
            <div className="bid-panel__lot-num">{currentLot.lot_number}</div>
            <div className="bid-panel__lot-name">{currentLot.title.toUpperCase()}</div>
            {currentLot.estimate_low && currentLot.estimate_high && (
              <div className="bid-panel__est">
                Est ${currentLot.estimate_low.toLocaleString()}
                {' – '}
                ${currentLot.estimate_high.toLocaleString()}
              </div>
            )}
          </div>
        )}

        {/* NOW badge */}
        {currentLot?.status === 'open' && (
          <div className="bid-panel__now">NOW!</div>
        )}

        {/* Current bid */}
        <div className="bid-panel__bid-block">
          <div className="bid-panel__bid-label">Current Bid</div>
          <div className="bid-panel__bid-amount">
            {currentBid != null
              ? `$${currentBid.toLocaleString()}`
              : currentLot
              ? `$${openingBid.toLocaleString()}`
              : '—'}
          </div>
          {currentLot && (
            <div className="bid-panel__increment">
              (Bid increment is{' '}
              <strong>${currentLot.bid_increment.toLocaleString()}</strong>)
            </div>
          )}
        </div>

        {/* BID / Login button */}
        <div className="bid-panel__btn-wrap">
          {canBid ? (
            <button
              className={`bid-panel__btn ${placing ? 'bid-panel__btn--placed' : ''}`}
              onClick={handleBid}
              disabled={placing || !nextBidAmount || callStatus === 'sold'}
            >
              {feedback
                ? feedback
                : placing
                ? 'Placing…'
                : nextBidAmount
                ? `BID $${nextBidAmount.toLocaleString()}`
                : 'BID'}
            </button>
          ) : bidder ? (
            <div className="bid-panel__login-prompt">
              ⏳ Awaiting paddle approval
            </div>
          ) : (
            <button
              className="bid-panel__btn"
              onClick={() => setShowLogin(true)}
            >
              Log in to bid
            </button>
          )}
        </div>

        {/* Live bid feed */}
        <div className="bid-feed">
          <div className="bid-feed__header">Live Bid Feed</div>
          {recentBids.length === 0 ? (
            <div className="bid-feed__empty">No bids yet</div>
          ) : (
            recentBids.map(bid => (
              <div
                key={bid.id}
                className={`bid-feed__row ${bid.is_winning ? 'bid-feed__row--winning' : ''}`}
              >
                <div>
                  <div className="bid-feed__src">{sourceLabel(bid.source)}</div>
                  <div className="bid-feed__time">{formatTime(bid.placed_at)}</div>
                </div>
                <div className="bid-feed__amount">
                  ${bid.amount.toLocaleString()}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Auctioneer call */}
        <div className="bid-panel__call">
          <div className="bid-panel__call-status">
            {callStatusLabel(callStatus)}
          </div>
          {callText && (
            <div className="bid-panel__call-text">"{callText}"</div>
          )}
          <div className="bid-panel__watching">
            <span className="bid-panel__dot" />
            {auctionState?.watching_count ?? 0} watching
          </div>
        </div>

        {/* Paddle bar */}
        <div className="bid-panel__paddle">
          {bidder ? (
            <>
              <span className="bid-panel__paddle-dot" />
              <span className="bid-panel__paddle-num">
                PADDLE {bidder.paddle_number ?? '—'} · {bidder.first_name} {bidder.last_name}
              </span>
            </>
          ) : (
            <button
              className="bid-panel__paddle-login"
              onClick={() => setShowLogin(true)}
            >
              Guest — log in to bid
            </button>
          )}
        </div>

      </aside>

      {showLogin && (
        <BidderLoginModal
          onClose={() => setShowLogin(false)}
          onSuccess={() => setShowLogin(false)}
        />
      )}
    </>
  )
}
