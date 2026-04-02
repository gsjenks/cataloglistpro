// components/LotDetailOverlay.tsx
// Full-screen overlay when a ribbon lot card is clicked.
// Shows all images, full description, and bid/watch button.

import React, { useEffect } from 'react'
import type { Lot, AuctionState } from '../types/auction'

interface Props {
  lot:           Lot
  auctionState:  AuctionState | null
  nextBidAmount: number | null
  canBid:        boolean
  onBid:         () => void
  onClose:       () => void
}

export function LotDetailOverlay({
  lot, auctionState, nextBidAmount, canBid, onBid, onClose
}: Props) {
  // ESC key closes
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  const isLive     = lot.status === 'open'
  const isSold     = lot.status === 'sold'
  const isUpcoming = lot.status === 'pending'

  const heroImage = lot.images?.[0]

  return (
    <div
      className="lo-overlay"
      role="dialog"
      aria-modal="true"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="lo-panel">

        {/* Header */}
        <div className="lo-header">
          <div>
            <div className="lo-lot-tag">
              LOT {lot.lot_number}
              {isLive     && <span className="lo-badge lo-badge--live">NOW!</span>}
              {isSold     && <span className="lo-badge lo-badge--sold">SOLD · ${lot.sold_amount?.toLocaleString()}</span>}
              {isUpcoming && <span className="lo-badge lo-badge--upcoming">UPCOMING</span>}
            </div>
            <h2 className="lo-title">{lot.title}</h2>
            <p className="lo-artist">{lot.artist}</p>
          </div>
          <button className="lo-close" onClick={onClose}>
            Close <kbd>ESC</kbd>
          </button>
        </div>

        {/* Images */}
        <div className="lo-imgs">
          {/* Hero */}
          <div className="lo-img-hero">
            {heroImage?.public_url ? (
              <img src={heroImage.public_url} alt={lot.title} />
            ) : (
              <div className="lo-img-placeholder">🖼</div>
            )}
          </div>
          {/* Thumbnails */}
          {lot.images?.slice(1).map(img => (
            <div key={img.id} className="lo-img-thumb">
              {img.public_url
                ? <img src={img.public_url} alt={img.caption ?? ''} />
                : <span>🖼</span>
              }
            </div>
          ))}
        </div>

        {/* Fields */}
        <div className="lo-fields">
          <div className="lo-field">
            <div className="lo-field-label">Artist / Maker</div>
            <div className="lo-field-val">{lot.artist ?? '—'}</div>
          </div>
          <div className="lo-field">
            <div className="lo-field-label">Medium</div>
            <div className="lo-field-val">{lot.medium ?? '—'}</div>
          </div>
          <div className="lo-field">
            <div className="lo-field-label">Dimensions</div>
            <div className="lo-field-val">{lot.dimensions ?? '—'}</div>
          </div>
          <div className="lo-field">
            <div className="lo-field-label">Condition</div>
            <div className="lo-field-val">{lot.condition_report ?? '—'}</div>
          </div>
          {lot.description && (
            <div className="lo-field lo-field--full">
              <div className="lo-field-label">Description</div>
              <div className="lo-field-val">{lot.description}</div>
            </div>
          )}
          {lot.provenance && (
            <div className="lo-field lo-field--full">
              <div className="lo-field-label">Provenance</div>
              <div className="lo-field-val">{lot.provenance}</div>
            </div>
          )}
          <div className="lo-field lo-field--full">
            <div className="lo-field-label">Estimate</div>
            <div className="lo-field-val lo-field-val--est">
              {lot.estimate_low && lot.estimate_high
                ? `$${lot.estimate_low.toLocaleString()} – $${lot.estimate_high.toLocaleString()}`
                : '—'
              }
            </div>
          </div>
        </div>

        {/* Action bar */}
        <div className="lo-action">
          <div>
            {isLive && auctionState?.current_bid != null && (
              <>
                <div className="lo-action-label">Current Bid</div>
                <div className="lo-action-amount">
                  ${auctionState.current_bid.toLocaleString()}
                </div>
              </>
            )}
            {isSold && (
              <>
                <div className="lo-action-label">Realized</div>
                <div className="lo-action-amount lo-action-amount--sold">
                  ${lot.sold_amount?.toLocaleString() ?? '—'}
                </div>
              </>
            )}
          </div>

          {isLive && canBid && nextBidAmount && (
            <button className="lo-bid-btn" onClick={onBid}>
              Bid ${nextBidAmount.toLocaleString()} →
            </button>
          )}
          {isUpcoming && (
            <button className="lo-watch-btn">Watch Lot</button>
          )}
          {isSold && (
            <span className="lo-sold-label">Bidding Closed</span>
          )}
        </div>

        {/* Dismiss */}
        <div className="lo-dismiss">
          <button className="lo-return" onClick={onClose}>← Return to Live Auction</button>
          <span className="lo-hint">or press ESC · click outside</span>
        </div>

      </div>
    </div>
  )
}
