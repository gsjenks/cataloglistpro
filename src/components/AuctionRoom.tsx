// AuctionRoom.tsx
// Top-level page component for the live auction.
// Composes all panels and wires them to useAuction + useBidder hooks.
//
// Usage in your router:
//   <Route path="/auction/:saleId" element={<AuctionRoom />} />

import React, { useState, useCallback } from "react";
import { useParams } from "react-router-dom";
import { useAuction } from "../hooks/useAuction";
import { useBidder } from "../hooks/useBidder";
import { LotRibbon } from "./LotRibbon";
import { BidPanel } from "./BidPanel";
import { LotViewer } from "./LotViewer";
import { InfoPanel } from "./InfoPanel";
import { LotDetailOverlay } from "./LotDetailOverlay";
import type { Lot } from "../types/auction";

export function AuctionRoom() {
  const { saleId } = useParams<{ saleId: string }>();
  const id = saleId ?? import.meta.env.VITE_AUCTION_ID ?? "";

  const {
    auctionState,
    currentLot,
    allLots,
    recentBids,
    nextBidAmount,
    loading,
    error,
    placeBid,
  } = useAuction(id);

  const { bidder, canBid } = useBidder(id);

  // Overlay state — when user clicks a ribbon card
  const [overlayLot, setOverlayLot] = useState<Lot | null>(null);

  // Place bid handler — closes overlay on success
  const handlePlaceBid = useCallback(
    async (amount: number) => {
      if (!currentLot || !bidder) return;
      return await placeBid(currentLot.id, bidder.id, amount, "web");
    },
    [currentLot, bidder, placeBid],
  );

  // Place bid from overlay
  const handleOverlayBid = useCallback(async () => {
    await handlePlaceBid(nextBidAmount ?? 0);
    setOverlayLot(null);
  }, [handlePlaceBid, nextBidAmount]);

  if (loading) {
    return (
      <div className="auction-loading">
        <div className="auction-loading__spinner" />
        <p>Connecting to live auction…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="auction-error">
        <p>⚠ Could not connect to auction: {error}</p>
        <button onClick={() => window.location.reload()}>Retry</button>
      </div>
    );
  }

  return (
    <div className="auction-room">
      {/* ── Top bar ─────────────────────────────────────────── */}
      <header className="auction-topbar">
        <div className="auction-topbar__logo">BENSON AUCTION SERVICES</div>
        <div className="auction-topbar__title">
          {auctionState
            ? `LOT ${currentLot?.lot_number ?? "—"} OF ${allLots.length} · Fine Arts Winter Collection`
            : "Loading auction…"}
        </div>
        <div className="auction-topbar__live">
          <span className="auction-topbar__dot" />
          LIVE
        </div>
      </header>

      {/* ── Lot ribbon ──────────────────────────────────────── */}
      <LotRibbon
        lots={allLots}
        activeLotId={auctionState?.current_lot_id ?? null}
        onLotClick={setOverlayLot}
      />

      {/* ── Main body ───────────────────────────────────────── */}
      <div className="auction-body">
        {/* Left: bid panel */}
        <BidPanel
          auctionState={auctionState}
          currentLot={currentLot}
          recentBids={recentBids}
          nextBidAmount={nextBidAmount}
          bidder={bidder}
          canBid={canBid}
          onPlaceBid={handlePlaceBid}
        />

        {/* Center: lot image viewer */}
        <LotViewer lot={currentLot} />

        {/* Right: lot info */}
        <InfoPanel lot={currentLot} />
      </div>

      {/* ── Lot detail overlay ─────────────────────────────── */}
      {overlayLot && (
        <LotDetailOverlay
          lot={overlayLot}
          auctionState={auctionState}
          nextBidAmount={nextBidAmount}
          canBid={canBid}
          onBid={handleOverlayBid}
          onClose={() => setOverlayLot(null)}
        />
      )}
    </div>
  );
}
