// components/LotDetailOverlay.tsx
// Full-screen overlay when a ribbon lot card is clicked.
// - Click thumbnail → promotes to hero
// - Click hero image → full-screen lightbox
// - Lightbox: prev/next arrows + ESC/click-outside to close
// - Watch Lot toggle persisted to watched_lots table

import React, { useEffect, useState, useCallback } from "react";
import { supabase } from "../lib/supabase";
import type { Lot, AuctionState } from "../types/auction";

interface Props {
  lot: Lot;
  auctionState: AuctionState | null;
  nextBidAmount: number | null;
  canBid: boolean;
  bidderId: string | null;
  onBid: () => void;
  onClose: () => void;
}

export function LotDetailOverlay({
  lot,
  auctionState,
  nextBidAmount,
  canBid,
  bidderId,
  onBid,
  onClose,
}: Props) {
  const images = lot.images ?? [];
  const [activeIdx, setActiveIdx] = useState(0);
  const [lightbox, setLightbox] = useState(false);
  const [watching, setWatching] = useState(false);
  const [watchLoading, setWatchLoading] = useState(false);

  // ESC + arrow keys
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (lightbox) setLightbox(false);
        else onClose();
      }
      if (lightbox && e.key === "ArrowRight")
        setActiveIdx((i) => Math.min(i + 1, images.length - 1));
      if (lightbox && e.key === "ArrowLeft")
        setActiveIdx((i) => Math.max(i - 1, 0));
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose, lightbox, images.length]);

  // Check if already watching
  useEffect(() => {
    if (!bidderId || !lot.id) return;
    supabase
      .from("watched_lots")
      .select("id")
      .eq("bidder_id", bidderId)
      .eq("lot_id", lot.id)
      .maybeSingle()
      .then(({ data }) => setWatching(!!data));
  }, [bidderId, lot.id]);

  const toggleWatch = useCallback(async () => {
    if (!bidderId) return;
    setWatchLoading(true);
    if (watching) {
      await supabase
        .from("watched_lots")
        .delete()
        .eq("bidder_id", bidderId)
        .eq("lot_id", lot.id);
      setWatching(false);
    } else {
      await supabase
        .from("watched_lots")
        .insert({ bidder_id: bidderId, lot_id: lot.id, sale_id: lot.sale_id });
      setWatching(true);
    }
    setWatchLoading(false);
  }, [bidderId, lot.id, lot.sale_id, watching]);

  const isLive = lot.status === "open";
  const isSold = lot.status === "sold";
  const isUpcoming = lot.status === "pending";
  const activeImage = images[activeIdx];

  return (
    <>
      <div
        className="lo-overlay"
        role="dialog"
        aria-modal="true"
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        <div className="lo-panel">
          {/* Header */}
          <div className="lo-header">
            <div>
              <div className="lo-lot-tag">
                LOT {lot.lot_number}
                {isLive && (
                  <span className="lo-badge lo-badge--live">NOW!</span>
                )}
                {isSold && (
                  <span className="lo-badge lo-badge--sold">
                    SOLD · ${lot.sold_amount?.toLocaleString()}
                  </span>
                )}
                {isUpcoming && (
                  <span className="lo-badge lo-badge--upcoming">UPCOMING</span>
                )}
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
            <div
              className="lo-img-hero"
              style={{
                cursor: activeImage?.public_url ? "zoom-in" : "default",
              }}
              onClick={() => {
                if (activeImage?.public_url) setLightbox(true);
              }}
              title="Click to enlarge"
            >
              {activeImage?.public_url ? (
                <img src={activeImage.public_url} alt={lot.title} />
              ) : (
                <div className="lo-img-placeholder">🖼</div>
              )}
              {images.length > 1 && (
                <div
                  style={{
                    position: "absolute",
                    bottom: 6,
                    right: 8,
                    background: "rgba(0,0,0,.55)",
                    borderRadius: 3,
                    padding: "2px 7px",
                    fontSize: 10,
                    color: "rgba(255,255,255,.7)",
                    fontFamily: "DM Sans, sans-serif",
                  }}
                >
                  {activeIdx + 1} / {images.length} · 🔍 click to enlarge
                </div>
              )}
            </div>

            {images.map((img, idx) => (
              <div
                key={img.id}
                className="lo-img-thumb"
                onClick={() => setActiveIdx(idx)}
                style={{
                  cursor: "pointer",
                  border:
                    idx === activeIdx
                      ? "2px solid #cc2200"
                      : "2px solid transparent",
                  boxSizing: "border-box",
                  transition: "border-color .15s, transform .15s",
                  transform: idx === activeIdx ? "scale(1.04)" : "scale(1)",
                }}
              >
                {img.public_url ? (
                  <img
                    src={img.public_url}
                    alt={img.caption ?? `View ${idx + 1}`}
                  />
                ) : (
                  <span className="lo-img-placeholder">🖼</span>
                )}
              </div>
            ))}
          </div>

          {/* Fields */}
          <div className="lo-fields">
            <div className="lo-field">
              <div className="lo-field-label">Artist / Maker</div>
              <div className="lo-field-val">{lot.artist ?? "—"}</div>
            </div>
            <div className="lo-field">
              <div className="lo-field-label">Medium</div>
              <div className="lo-field-val">{lot.medium ?? "—"}</div>
            </div>
            <div className="lo-field">
              <div className="lo-field-label">Dimensions</div>
              <div className="lo-field-val">{lot.dimensions ?? "—"}</div>
            </div>
            <div className="lo-field">
              <div className="lo-field-label">Condition</div>
              <div className="lo-field-val">{lot.condition_report ?? "—"}</div>
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
                  : "—"}
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
                    ${lot.sold_amount?.toLocaleString() ?? "—"}
                  </div>
                </>
              )}
            </div>

            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              {isLive && canBid && nextBidAmount && (
                <button className="lo-bid-btn" onClick={onBid}>
                  Bid ${nextBidAmount.toLocaleString()} →
                </button>
              )}

              {!isSold && (
                <button
                  className="lo-watch-btn"
                  onClick={toggleWatch}
                  disabled={!bidderId || watchLoading}
                  style={{
                    background: watching ? "#e8f5e9" : undefined,
                    color: watching ? "#2d6a4f" : undefined,
                    border: watching ? "1px solid #a5d6a7" : undefined,
                    opacity: !bidderId ? 0.5 : 1,
                    cursor: !bidderId ? "not-allowed" : "pointer",
                  }}
                  title={!bidderId ? "Log in to watch lots" : undefined}
                >
                  {watchLoading ? "…" : watching ? "★ Watching" : "☆ Watch Lot"}
                </button>
              )}

              {isSold && <span className="lo-sold-label">Bidding Closed</span>}
            </div>
          </div>

          {/* Dismiss */}
          <div className="lo-dismiss">
            <button className="lo-return" onClick={onClose}>
              ← Return to Live Auction
            </button>
            <span className="lo-hint">or press ESC · click outside</span>
          </div>
        </div>
      </div>

      {/* Lightbox */}
      {lightbox && activeImage?.public_url && (
        <div
          onClick={() => setLightbox(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,.93)",
            zIndex: 400,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {activeIdx > 0 && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setActiveIdx((i) => i - 1);
              }}
              style={arrowStyle("left")}
            >
              ‹
            </button>
          )}

          <img
            src={activeImage.public_url}
            alt={lot.title}
            onClick={(e) => e.stopPropagation()}
            style={{
              maxWidth: "92vw",
              maxHeight: "90vh",
              objectFit: "contain",
              borderRadius: 4,
              boxShadow: "0 8px 48px rgba(0,0,0,.6)",
            }}
          />

          {activeIdx < images.length - 1 && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setActiveIdx((i) => i + 1);
              }}
              style={arrowStyle("right")}
            >
              ›
            </button>
          )}

          <div
            style={{
              position: "absolute",
              bottom: 20,
              left: "50%",
              transform: "translateX(-50%)",
              color: "rgba(255,255,255,.5)",
              fontSize: 12,
              fontFamily: "DM Sans, sans-serif",
              display: "flex",
              gap: 16,
              alignItems: "center",
            }}
          >
            <span>
              {activeIdx + 1} / {images.length}
            </span>
            <span>· click outside or ESC to close</span>
          </div>

          <button
            onClick={() => setLightbox(false)}
            style={{
              position: "absolute",
              top: 16,
              right: 20,
              background: "rgba(255,255,255,.15)",
              border: "none",
              borderRadius: 4,
              color: "#fff",
              fontSize: 18,
              width: 36,
              height: 36,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            ✕
          </button>
        </div>
      )}
    </>
  );
}

function arrowStyle(side: "left" | "right"): React.CSSProperties {
  return {
    position: "absolute",
    [side]: 16,
    top: "50%",
    transform: "translateY(-50%)",
    background: "rgba(255,255,255,.15)",
    border: "1px solid rgba(255,255,255,.25)",
    borderRadius: 4,
    color: "#fff",
    fontSize: 36,
    width: 48,
    height: 64,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 401,
  };
}
