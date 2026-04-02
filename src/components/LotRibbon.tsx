// components/LotRibbon.tsx
// Horizontal scrolling lot ribbon — identical look to the HTML prototype
// but powered by real Lot data from Supabase.

import React, { useRef } from 'react'
import type { Lot } from '../types/auction'

interface Props {
  lots:          Lot[]
  activeLotId:   string | null
  onLotClick:    (lot: Lot) => void
}

function lotBadge(lot: Lot) {
  if (lot.status === 'live' || lot.status === 'open')
    return <span className="ribbon-tag ribbon-tag--live">NOW!</span>
  if (lot.status === 'sold')
    return <span className="ribbon-tag ribbon-tag--sold">SOLD</span>
  return null
}

function lotThumb(lot: Lot): string | null {
  if (!lot.images?.length) return null
  const hero = lot.images.find(i => i.sort_order === 0) ?? lot.images[0]
  return hero.public_url ?? null
}

export function LotRibbon({ lots, activeLotId, onLotClick }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null)

  const scroll = (dir: number) => {
    scrollRef.current?.scrollBy({ left: dir * 220, behavior: 'smooth' })
  }

  return (
    <div className="ribbon-wrap">
      <button className="ribbon-arrow" onClick={() => scroll(-1)} aria-label="Scroll left">‹</button>

      <div className="ribbon-inner" ref={scrollRef}>
        {lots.map(lot => {
          const thumb = lotThumb(lot)
          const isActive = lot.id === activeLotId
          const isSold   = lot.status === 'sold'

          return (
            <button
              key={lot.id}
              className={[
                'ribbon-card',
                isActive ? 'ribbon-card--active' : '',
                isSold   ? 'ribbon-card--sold'   : '',
              ].join(' ')}
              onClick={() => onLotClick(lot)}
              title={`Lot ${lot.lot_number}: ${lot.title}`}
            >
              {/* Thumbnail */}
              <div className="ribbon-card__img">
                {lotBadge(lot)}
                {thumb ? (
                  <img src={thumb} alt={lot.title} />
                ) : (
                  <span className="ribbon-card__emoji">🖼</span>
                )}
              </div>

              {/* Footer */}
              <div className="ribbon-card__foot">
                <div className="ribbon-card__num">{lot.lot_number}</div>
                <div className="ribbon-card__price">
                  {lot.status === 'sold' && lot.sold_amount
                    ? `$${lot.sold_amount.toLocaleString()}`
                    : lot.estimate_low
                    ? `$${lot.estimate_low.toLocaleString()}`
                    : '—'
                  }
                </div>
              </div>
            </button>
          )
        })}
      </div>

      <button className="ribbon-arrow" onClick={() => scroll(1)} aria-label="Scroll right">›</button>
    </div>
  )
}
