// components/LotViewer.tsx
// Center panel — lot image hero with vertical thumbnail strip,
// lot title/artist header, and detail strip at bottom.

import React, { useState } from 'react'
import type { Lot } from '../types/auction'

interface Props {
  lot: Lot | null
}

export function LotViewer({ lot }: Props) {
  const [activeIdx, setActiveIdx] = useState(0)

  // Reset image index when lot changes
  React.useEffect(() => { setActiveIdx(0) }, [lot?.id])

  if (!lot) {
    return (
      <div className="lot-viewer lot-viewer--empty">
        <span>Waiting for auction to begin…</span>
      </div>
    )
  }

  const images = lot.images ?? []
  const activeImage = images[activeIdx]

  const prev = () => setActiveIdx(i => (i - 1 + images.length) % images.length)
  const next = () => setActiveIdx(i => (i + 1) % images.length)

  return (
    <div className="lot-viewer">

      {/* Lot header */}
      <div className="lot-viewer__header">
        <span className="lot-viewer__tag">LOT {lot.lot_number}</span>
        <h2 className="lot-viewer__title">{lot.title}</h2>
        {lot.artist && (
          <p className="lot-viewer__artist">
            {lot.artist}
            {lot.medium ? ` · ${lot.medium}` : ''}
            {lot.dimensions ? ` · ${lot.dimensions}` : ''}
          </p>
        )}
      </div>

      {/* Image hero */}
      <div className="lot-viewer__img-zone">

        {/* Navigation arrows */}
        {images.length > 1 && (
          <>
            <button className="lot-viewer__arrow lot-viewer__arrow--prev" onClick={prev}>‹</button>
            <button className="lot-viewer__arrow lot-viewer__arrow--next" onClick={next}>›</button>
          </>
        )}

        {/* Main image */}
        {activeImage?.public_url ? (
          <img
            key={activeImage.id}
            src={activeImage.public_url}
            alt={activeImage.caption ?? lot.title}
            className="lot-viewer__img"
          />
        ) : (
          <div className="lot-viewer__placeholder">
            <span>🖼</span>
            <small>{activeImage?.caption ?? 'Image uploading…'}</small>
          </div>
        )}

        {/* Vertical thumbnail strip (right side) */}
        {images.length > 1 && (
          <div className="lot-viewer__thumbs">
            {images.map((img, idx) => (
              <button
                key={img.id}
                className={`lot-viewer__thumb ${idx === activeIdx ? 'lot-viewer__thumb--active' : ''}`}
                onClick={() => setActiveIdx(idx)}
                title={img.caption ?? `View ${idx + 1}`}
              >
                {img.public_url ? (
                  <img src={img.public_url} alt={img.caption ?? ''} />
                ) : (
                  <span>🖼</span>
                )}
              </button>
            ))}
          </div>
        )}

        {/* Image counter */}
        {images.length > 1 && (
          <div className="lot-viewer__counter">
            {activeIdx + 1} / {images.length}
          </div>
        )}
      </div>

      {/* Detail strip */}
      <div className="lot-viewer__details">
        {lot.condition_report && (
          <div className="lot-viewer__detail-item">
            <span className="lot-viewer__detail-label">Condition</span>
            <span className="lot-viewer__detail-val">{lot.condition_report}</span>
          </div>
        )}
        {lot.medium && (
          <div className="lot-viewer__detail-item">
            <span className="lot-viewer__detail-label">Medium</span>
            <span className="lot-viewer__detail-val">{lot.medium}</span>
          </div>
        )}
        {lot.dimensions && (
          <div className="lot-viewer__detail-item">
            <span className="lot-viewer__detail-label">Size</span>
            <span className="lot-viewer__detail-val">{lot.dimensions}</span>
          </div>
        )}
        {lot.provenance && (
          <div className="lot-viewer__detail-item">
            <span className="lot-viewer__detail-label">Provenance</span>
            <span className="lot-viewer__detail-val">{lot.provenance}</span>
          </div>
        )}
      </div>

    </div>
  )
}
