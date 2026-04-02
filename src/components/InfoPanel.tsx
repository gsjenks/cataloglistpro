// components/InfoPanel.tsx
// Right-side white panel showing lot title, description,
// category, condition, provenance.

import React from 'react'
import type { Lot } from '../types/auction'

interface Props { lot: Lot | null }

export function InfoPanel({ lot }: Props) {
  if (!lot) return null

  return (
    <aside className="info-panel">
      <div className="info-panel__header">
        <div className="info-panel__tag">LOT {lot.lot_number} ★</div>
        <h3 className="info-panel__title">{lot.title}</h3>
        {lot.estimate_low && lot.estimate_high && (
          <p className="info-panel__est">
            Est ${lot.estimate_low.toLocaleString()} – ${lot.estimate_high.toLocaleString()}
          </p>
        )}
        {(lot.status === 'open') && (
          <p className="info-panel__now">NOW!</p>
        )}
      </div>

      <div className="info-panel__body">
        {lot.artist && (
          <div className="info-panel__section">
            <div className="info-panel__label">Artist</div>
            <div className="info-panel__text">{lot.artist}</div>
          </div>
        )}
        {lot.description && (
          <div className="info-panel__section">
            <div className="info-panel__label">Description</div>
            <div className="info-panel__text">{lot.description}</div>
          </div>
        )}
        {lot.provenance && (
          <div className="info-panel__section">
            <div className="info-panel__label">Provenance</div>
            <div className="info-panel__text">{lot.provenance}</div>
          </div>
        )}

        <div className="info-panel__grid">
          {lot.medium && (
            <div className="info-panel__cell">
              <div className="info-panel__cell-label">Medium</div>
              <div className="info-panel__cell-val">{lot.medium}</div>
            </div>
          )}
          {lot.dimensions && (
            <div className="info-panel__cell">
              <div className="info-panel__cell-label">Size</div>
              <div className="info-panel__cell-val">{lot.dimensions}</div>
            </div>
          )}
          {lot.condition_report && (
            <div className="info-panel__cell">
              <div className="info-panel__cell-label">Condition</div>
              <div className="info-panel__cell-val">{lot.condition_report}</div>
            </div>
          )}
        </div>
      </div>
    </aside>
  )
}
