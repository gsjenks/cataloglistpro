// ClerkPanel.tsx
import { useState, useCallback } from "react";
import { useParams } from "react-router-dom";
import { useAuction } from "../hooks/useAuction";
import { supabase } from "../lib/supabase";
import { AuctionResults } from "./AuctionResults";
import { ClerkChat } from "./ClerkChat";
import type { Lot } from "../types/auction";

function fmt(n: number | null | undefined) {
  if (n == null) return "—";
  return "$" + n.toLocaleString();
}

function statusColor(status: string) {
  switch (status) {
    case "sold":
      return "#2d6a4f";
    case "open":
      return "#cc2200";
    case "passed":
      return "#888";
    default:
      return "#1a1a1a";
  }
}

const col: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  overflow: "hidden",
  borderRight: "1px solid #e0e0e0",
};

const sectionLabel: React.CSSProperties = {
  fontSize: 9,
  fontWeight: 700,
  letterSpacing: ".1em",
  color: "#aaa",
  textTransform: "uppercase",
  padding: "6px 12px 4px",
  background: "#f8f8f8",
  borderBottom: "1px solid #eee",
  flexShrink: 0,
};

const divider: React.CSSProperties = {
  borderTop: "1px solid #e8e8e8",
  margin: "0",
};

export function ClerkPanel() {
  const { saleId } = useParams<{ saleId: string }>();
  const id = saleId ?? "";

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

  const [floorPaddle, setFloorPaddle] = useState("");
  const [floorAmount, setFloorAmount] = useState("");
  const [floorMsg, setFloorMsg] = useState<string | null>(null);
  const [advancing, setAdvancing] = useState(false);
  const [calling, setCalling] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [retracting, setRetracting] = useState(false);

  // Selected lot for 2B/2C — defaults to currentLot, can be overridden by clicking in 3A
  const [selectedLotId, setSelectedLotId] = useState<string | null>(null);

  const displayLot: Lot | null =
    (selectedLotId ? allLots.find((l) => l.id === selectedLotId) : null) ??
    currentLot ??
    null;

  // Active image index per lot
  const [activeImageIdx, setActiveImageIdx] = useState(0);

  // Reset image index when displayed lot changes
  const handleSelectLot = useCallback((lot: Lot) => {
    setSelectedLotId(lot.id);
    setActiveImageIdx(0);
  }, []);

  const setCallStatus = useCallback(
    async (
      status: "open" | "going_once" | "going_twice" | "sold" | "passed",
      callText?: string,
    ) => {
      setCalling(true);
      await supabase
        .from("auction_state")
        .update({
          call_status: status,
          auctioneer_call: callText ?? auctionState?.auctioneer_call,
          updated_at: new Date().toISOString(),
        })
        .eq("sale_id", id);
      setCalling(false);
    },
    [id, auctionState],
  );

  const callGoingOnce = () =>
    setCallStatus(
      "going_once",
      `${fmt(auctionState?.current_bid)} — going once!`,
    );
  const callGoingTwice = () =>
    setCallStatus(
      "going_twice",
      `${fmt(auctionState?.current_bid)} — going twice!`,
    );

  const callSold = async () => {
    if (!currentLot || !auctionState?.current_bid) return;
    setCalling(true);
    await supabase
      .from("lots")
      .update({
        call_status: "sold",
        sold_price: auctionState.current_bid,
        sold_to_bidder: auctionState.current_bidder_id,
      })
      .eq("id", currentLot.id);
    await supabase
      .from("auction_state")
      .update({
        call_status: "sold",
        auctioneer_call: `SOLD! ${fmt(auctionState.current_bid)}`,
        updated_at: new Date().toISOString(),
      })
      .eq("sale_id", id);
    setCalling(false);
  };

  const callPass = async () => {
    if (!currentLot) return;
    setCalling(true);
    await supabase
      .from("lots")
      .update({ call_status: "passed" })
      .eq("id", currentLot.id);
    await supabase
      .from("auction_state")
      .update({
        call_status: "passed",
        auctioneer_call: "Lot passed — no sale",
        updated_at: new Date().toISOString(),
      })
      .eq("sale_id", id);
    setCalling(false);
  };

  const retractLastBid = async () => {
    if (!currentLot) return;
    setRetracting(true);
    const { error } = await supabase.rpc("retract_last_bid", {
      p_sale_id: id,
      p_lot_id: currentLot.id,
    });
    if (error) console.error("Retract error:", error.message);
    setRetracting(false);
  };

  const advanceLot = async () => {
    setAdvancing(true);
    const { error } = await supabase.rpc("advance_lot", { p_sale_id: id });
    if (error) console.error("Advance lot error:", error.message);
    setAdvancing(false);
  };

  const enterFloorBid = async () => {
    setFloorMsg(null);
    if (!currentLot) return;
    const amount = parseFloat(floorAmount);
    if (isNaN(amount) || amount <= 0) {
      setFloorMsg("Enter a valid bid amount");
      return;
    }
    const { data: reg } = await supabase
      .from("auction_registrations")
      .select("bidder_id, paddle_number")
      .eq("sale_id", id)
      .eq("paddle_number", parseInt(floorPaddle))
      .maybeSingle();
    if (!reg) {
      setFloorMsg(`Paddle ${floorPaddle} not found`);
      return;
    }
    const result = await placeBid(
      currentLot.id,
      reg.bidder_id,
      amount,
      "floor",
    );
    if (result && !result.success) {
      setFloorMsg("Error: " + result.error);
    } else {
      setFloorMsg(
        `✓ Floor bid $${amount.toLocaleString()} — Paddle ${floorPaddle}`,
      );
      setFloorPaddle("");
      setFloorAmount("");
    }
  };

  const jumpToLot = async (lot: Lot) => {
    await supabase
      .from("lots")
      .update({ call_status: "open" })
      .eq("id", lot.id);
    await supabase
      .from("auction_state")
      .update({
        current_lot_id: lot.id,
        current_bid: null,
        current_bidder_id: null,
        bid_count: 0,
        call_status: "open",
        auctioneer_call: `Now opening Lot ${lot.lot_number}: ${lot.title}`,
        updated_at: new Date().toISOString(),
      })
      .eq("sale_id", id);
  };

  const resetAuction = async () => {
    setResetting(true);
    await supabase.rpc("reset_auction", { p_sale_id: id });
    setResetting(false);
    setShowResetConfirm(false);
    window.location.reload();
  };

  if (loading)
    return <div className="clerk-loading">Connecting to auction…</div>;
  if (error) return <div className="clerk-error">⚠ {error}</div>;

  const callStatus = auctionState?.call_status ?? "open";
  const currentBid = auctionState?.current_bid;

  // Images for the displayed lot, sorted
  const displayImages = displayLot?.images
    ? [...displayLot.images].sort((a, b) => {
        if (a.is_primary && !b.is_primary) return -1;
        if (!a.is_primary && b.is_primary) return 1;
        return (a.sort_order ?? 0) - (b.sort_order ?? 0);
      })
    : [];

  const activeImage = displayImages[activeImageIdx] ?? null;

  return (
    <>
      {showResults && (
        <AuctionResults saleId={id} onClose={() => setShowResults(false)} />
      )}

      {/* Reset confirm modal */}
      {showResetConfirm && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,.5)",
            zIndex: 400,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div
            style={{
              background: "#fff",
              borderRadius: 8,
              padding: "24px",
              width: 360,
              boxShadow: "0 8px 40px rgba(0,0,0,.3)",
              fontFamily: "DM Sans, sans-serif",
            }}
          >
            <div
              style={{
                fontSize: 15,
                fontWeight: 700,
                color: "#cc2200",
                marginBottom: 8,
              }}
            >
              ⚠ Reset entire auction?
            </div>
            <div style={{ fontSize: 12, color: "#888", marginBottom: 18 }}>
              This will clear all bids and reset all lots to pending. This
              cannot be undone.
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={resetAuction}
                disabled={resetting}
                style={{
                  flex: 1,
                  padding: "10px",
                  background: "#cc2200",
                  border: "none",
                  borderRadius: 4,
                  color: "#fff",
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: "pointer",
                  fontFamily: "DM Sans, sans-serif",
                }}
              >
                {resetting ? "Resetting…" : "Yes, Reset"}
              </button>
              <button
                onClick={() => setShowResetConfirm(false)}
                style={{
                  flex: 1,
                  padding: "10px",
                  background: "#f0f0f0",
                  border: "none",
                  borderRadius: 4,
                  color: "#555",
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: "pointer",
                  fontFamily: "DM Sans, sans-serif",
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          height: "100vh",
          fontFamily: "DM Sans, sans-serif",
          background: "#f5f5f5",
          overflow: "hidden",
        }}
      >
        {/* ── Global Header ─────────────────────────── */}
        <div
          style={{
            background: "#1a1a1a",
            borderBottom: "2px solid #c9a84c",
            padding: "0 16px",
            height: 48,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexShrink: 0,
          }}
        >
          <div>
            <span
              style={{
                color: "#c9a84c",
                fontWeight: 700,
                fontSize: 14,
                letterSpacing: ".08em",
              }}
            >
              CLERK PANEL
            </span>
            <span
              style={{
                color: "rgba(255,255,255,.35)",
                fontSize: 11,
                marginLeft: 12,
              }}
            >
              Benson Auction Services · Fine Arts Winter Collection
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button
              onClick={() => setShowResults(true)}
              style={{
                background: "#c9a84c",
                border: "none",
                borderRadius: 4,
                color: "#1a1a1a",
                fontSize: 11,
                fontWeight: 700,
                padding: "6px 14px",
                cursor: "pointer",
                fontFamily: "DM Sans, sans-serif",
              }}
            >
              📊 Results
            </button>
            <button
              onClick={() => setShowResetConfirm(true)}
              style={{
                background: "transparent",
                border: "1.5px solid #ffaaaa",
                borderRadius: 4,
                color: "#ffaaaa",
                fontSize: 11,
                fontWeight: 700,
                padding: "6px 14px",
                cursor: "pointer",
                fontFamily: "DM Sans, sans-serif",
              }}
            >
              🔄 Reset
            </button>
            <div
              style={{
                padding: "4px 12px",
                borderRadius: 4,
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: ".06em",
                background:
                  callStatus === "sold"
                    ? "#2d6a4f"
                    : callStatus === "passed"
                      ? "#555"
                      : callStatus === "open"
                        ? "#cc2200"
                        : "#c9a84c",
                color: "#fff",
              }}
            >
              {callStatus.replace(/_/g, " ").toUpperCase()}
            </div>
          </div>
        </div>

        {/* ── Three columns ─────────────────────────── */}
        <div
          style={{
            flex: 1,
            display: "grid",
            gridTemplateColumns: "320px 1fr 300px",
            overflow: "hidden",
          }}
        >
          {/* ══════════════════════════════════════════
              COLUMN 1 — Auction Controls
          ══════════════════════════════════════════ */}
          <div style={{ ...col, background: "#fff" }}>
            {/* 1A — Call buttons */}
            <div style={{ flexShrink: 0 }}>
              <div style={sectionLabel}>1A · Call Controls</div>
              <div
                style={{
                  padding: "10px 10px 6px",
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr 1fr",
                  gap: 6,
                }}
              >
                <button
                  className="clerk-btn clerk-btn--pass"
                  onClick={callPass}
                  disabled={calling}
                >
                  ❌ Pass
                </button>
                <button
                  className="clerk-btn"
                  onClick={retractLastBid}
                  disabled={retracting || !currentBid}
                  style={{
                    background: "#fff8e1",
                    color: "#996600",
                    border: "1.5px solid #ffcc44",
                    fontSize: 11,
                    opacity: !currentBid ? 0.4 : 1,
                  }}
                >
                  {retracting ? "…" : "↩ Retract"}
                </button>
                <button
                  className="clerk-btn clerk-btn--open"
                  onClick={() =>
                    setCallStatus(
                      "open",
                      currentBid
                        ? `${fmt(currentBid)} — do I hear ${fmt(nextBidAmount)}?`
                        : `Now opening Lot ${currentLot?.lot_number} — ${currentLot?.title ?? currentLot?.name}. ${
                            currentLot?.estimate_low &&
                            currentLot?.estimate_high
                              ? `Estimated $${currentLot.estimate_low.toLocaleString()} to $${currentLot.estimate_high.toLocaleString()}. `
                              : ""
                          }Who will start us at $${currentLot?.opening_bid ?? currentLot?.starting_bid ?? ""}?`,
                    )
                  }
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
              </div>
              <div style={{ padding: "0 10px 10px" }}>
                <button
                  className="clerk-advance-btn"
                  onClick={advanceLot}
                  disabled={advancing}
                  style={{ width: "100%" }}
                >
                  {advancing ? "Advancing…" : "▶ Advance to Next Lot"}
                </button>
              </div>
            </div>

            <div style={divider} />

            {/* 1B — Floor bid */}
            <div style={{ flexShrink: 0 }}>
              <div style={sectionLabel}>1B · Enter Floor Bid</div>
              <div style={{ padding: "10px" }}>
                <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
                  <input
                    className="clerk-input"
                    type="number"
                    placeholder="Paddle #"
                    value={floorPaddle}
                    onChange={(e) => setFloorPaddle(e.target.value)}
                    style={{ width: 80 }}
                  />
                  <input
                    className="clerk-input clerk-input--amount"
                    type="number"
                    placeholder="Amount $"
                    value={floorAmount}
                    onChange={(e) => setFloorAmount(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") enterFloorBid();
                    }}
                    style={{ flex: 1 }}
                  />
                  <button
                    className="clerk-btn clerk-btn--floor"
                    onClick={enterFloorBid}
                  >
                    Enter
                  </button>
                </div>
                {floorMsg && (
                  <div
                    className={`clerk-floor-bid__msg ${floorMsg.startsWith("✓") ? "clerk-floor-bid__msg--ok" : "clerk-floor-bid__msg--err"}`}
                  >
                    {floorMsg}
                  </div>
                )}
              </div>
            </div>

            <div style={divider} />

            {/* 1C — Bid history */}
            <div
              style={{
                flex: 1,
                overflow: "hidden",
                display: "flex",
                flexDirection: "column",
              }}
            >
              <div style={sectionLabel}>1C · Bid History</div>
              <div style={{ flex: 1, overflowY: "auto", padding: "4px 0" }}>
                {recentBids.length === 0 && (
                  <div
                    style={{
                      padding: "12px",
                      fontSize: 11,
                      color: "#bbb",
                      textAlign: "center",
                    }}
                  >
                    No bids yet
                  </div>
                )}
                {recentBids.slice(0, 12).map((bid) => {
                  const isRetracted = bid.is_retracted;
                  const regs = bid.bidder?.registrations;
                  const reg = Array.isArray(regs)
                    ? regs.find(
                        (r: { sale_id: string; paddle_number: number }) =>
                          r.sale_id === id,
                      )
                    : null;
                  const paddleStr = reg?.paddle_number
                    ? `#${reg.paddle_number}`
                    : "—";
                  return (
                    <div
                      key={bid.id}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "52px 1fr 68px 60px",
                        padding: "5px 10px",
                        borderBottom: "1px solid #f5f5f5",
                        alignItems: "center",
                        background: isRetracted
                          ? "#fff0f0"
                          : bid.is_winning
                            ? "#f0faf4"
                            : "#fff",
                        fontSize: 11,
                      }}
                    >
                      <span
                        style={{
                          fontWeight: 700,
                          color: isRetracted ? "#cc2200" : "#555",
                        }}
                      >
                        {paddleStr}
                      </span>
                      <span style={{ color: "#888" }}>{bid.source}</span>
                      <span
                        style={{
                          fontWeight: 700,
                          color: isRetracted ? "#cc2200" : "#1a1a1a",
                          textDecoration: isRetracted ? "line-through" : "none",
                        }}
                      >
                        {fmt(bid.amount)}
                      </span>
                      <span style={{ color: "#bbb", fontSize: 9 }}>
                        {new Date(bid.placed_at).toLocaleTimeString()}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* ══════════════════════════════════════════
              COLUMN 2 — Current Lot
          ══════════════════════════════════════════ */}
          <div
            style={{
              ...col,
              borderRight: "1px solid #e0e0e0",
              background: "#fff",
            }}
          >
            {/* 2A — Lot header + current bid */}
            <div style={{ flexShrink: 0 }}>
              <div style={sectionLabel}>
                2A · Now on Block
                {displayLot && displayLot.id !== currentLot?.id && (
                  <span
                    style={{
                      marginLeft: 8,
                      color: "#c9a84c",
                      cursor: "pointer",
                    }}
                    onClick={() => {
                      setSelectedLotId(null);
                      setActiveImageIdx(0);
                    }}
                  >
                    ← back to live lot
                  </span>
                )}
              </div>
              <div
                style={{
                  padding: "10px 14px",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                  gap: 10,
                }}
              >
                <div style={{ flex: 1 }}>
                  <div
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      color: "#cc2200",
                      letterSpacing: ".08em",
                      marginBottom: 2,
                    }}
                  >
                    LOT {displayLot?.lot_number ?? "—"}
                  </div>
                  <div
                    style={{
                      fontSize: 16,
                      fontWeight: 700,
                      color: "#1a1a1a",
                      lineHeight: 1.3,
                      marginBottom: 4,
                    }}
                  >
                    {displayLot?.title ?? displayLot?.name ?? "No lot open"}
                  </div>
                  {displayLot?.artist && (
                    <div
                      style={{ fontSize: 12, color: "#555", marginBottom: 2 }}
                    >
                      {displayLot.artist}
                    </div>
                  )}
                  <div style={{ fontSize: 11, color: "#888" }}>
                    Est {fmt(displayLot?.estimate_low)} –{" "}
                    {fmt(displayLot?.estimate_high)}
                  </div>
                </div>
                <div style={{ textAlign: "right", flexShrink: 0 }}>
                  <div
                    style={{
                      fontSize: 9,
                      fontWeight: 700,
                      color: "#aaa",
                      letterSpacing: ".08em",
                      marginBottom: 2,
                    }}
                  >
                    CURRENT BID
                  </div>
                  <div
                    style={{
                      fontSize: 28,
                      fontWeight: 700,
                      color: currentBid ? "#cc2200" : "#bbb",
                      lineHeight: 1,
                    }}
                  >
                    {currentBid != null ? fmt(currentBid) : "—"}
                  </div>
                  <div style={{ fontSize: 10, color: "#aaa", marginTop: 3 }}>
                    Next: {fmt(nextBidAmount)} · {auctionState?.bid_count ?? 0}{" "}
                    bids
                  </div>
                </div>
              </div>
              <div
                style={{
                  margin: "0 14px 10px",
                  padding: "8px 10px",
                  background: "#fffbe6",
                  border: "1px solid #ffe58f",
                  borderRadius: 4,
                  fontSize: 12,
                  color: "#664d00",
                  fontStyle: "italic",
                }}
              >
                {auctionState?.auctioneer_call ?? "—"}
              </div>
            </div>

            <div style={divider} />

            {/* 2B — Horizontal lot strip + vertical image scroll */}
            <div style={{ flexShrink: 0 }}>
              <div style={sectionLabel}>2B · Lot Images</div>

              {/* Horizontal lot thumbnail strip */}
              <div
                style={{
                  display: "flex",
                  overflowX: "auto",
                  gap: 6,
                  padding: "8px 10px",
                  background: "#111",
                  borderBottom: "1px solid #333",
                  scrollbarWidth: "thin",
                }}
              >
                {allLots.map((lot) => {
                  const thumb = lot.images
                    ? [...lot.images].sort((a, b) => {
                        if (a.is_primary && !b.is_primary) return -1;
                        if (!a.is_primary && b.is_primary) return 1;
                        return (a.sort_order ?? 0) - (b.sort_order ?? 0);
                      })[0]
                    : null;
                  const isSelected = displayLot?.id === lot.id;
                  const isLive = lot.id === auctionState?.current_lot_id;
                  return (
                    <div
                      key={lot.id}
                      onClick={() => handleSelectLot(lot)}
                      style={{
                        flexShrink: 0,
                        width: 72,
                        cursor: "pointer",
                        borderRadius: 4,
                        border: isSelected
                          ? "2px solid #c9a84c"
                          : isLive
                            ? "2px solid #cc2200"
                            : "2px solid transparent",
                        overflow: "hidden",
                        position: "relative",
                        opacity: lot.status === "passed" ? 0.5 : 1,
                      }}
                    >
                      {thumb?.public_url ? (
                        <img
                          src={thumb.public_url}
                          alt={`Lot ${lot.lot_number}`}
                          style={{
                            width: "100%",
                            height: 56,
                            objectFit: "cover",
                            display: "block",
                          }}
                        />
                      ) : (
                        <div
                          style={{
                            width: "100%",
                            height: 56,
                            background: "#333",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontSize: 18,
                          }}
                        >
                          🖼
                        </div>
                      )}
                      <div
                        style={{
                          position: "absolute",
                          bottom: 0,
                          left: 0,
                          right: 0,
                          background: "rgba(0,0,0,.7)",
                          padding: "2px 4px",
                          fontSize: 8,
                          fontWeight: 700,
                          color: "#fff",
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                        }}
                      >
                        <span>#{lot.lot_number}</span>
                        <span
                          style={{
                            color: statusColor(lot.status),
                            fontSize: 7,
                          }}
                        >
                          {lot.status === "sold"
                            ? "SOLD"
                            : lot.status === "passed"
                              ? "PASS"
                              : isLive
                                ? "LIVE"
                                : ""}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Main image + vertical thumbnail strip */}
              <div
                style={{ display: "flex", background: "#1a1a1a", height: 220 }}
              >
                {/* Vertical thumbnail strip */}
                {displayImages.length > 1 && (
                  <div
                    style={{
                      width: 56,
                      overflowY: "auto",
                      display: "flex",
                      flexDirection: "column",
                      gap: 4,
                      padding: "6px 4px",
                      background: "#111",
                      borderRight: "1px solid #333",
                      scrollbarWidth: "thin",
                    }}
                  >
                    {displayImages.map((img, idx) => (
                      <button
                        key={img.id}
                        onClick={() => setActiveImageIdx(idx)}
                        style={{
                          width: 48,
                          height: 40,
                          flexShrink: 0,
                          padding: 0,
                          border:
                            idx === activeImageIdx
                              ? "2px solid #c9a84c"
                              : "2px solid transparent",
                          borderRadius: 3,
                          overflow: "hidden",
                          cursor: "pointer",
                          background: "#333",
                        }}
                      >
                        {img.public_url ? (
                          <img
                            src={img.public_url}
                            alt=""
                            style={{
                              width: "100%",
                              height: "100%",
                              objectFit: "cover",
                            }}
                          />
                        ) : (
                          <span
                            style={{
                              fontSize: 14,
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              height: "100%",
                              color: "#888",
                            }}
                          >
                            🖼
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                )}

                {/* Main image */}
                <div
                  style={{
                    flex: 1,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: "8px",
                  }}
                >
                  {activeImage?.public_url ? (
                    <img
                      src={activeImage.public_url}
                      alt={displayLot?.title ?? "Lot"}
                      style={{
                        maxHeight: "100%",
                        maxWidth: "100%",
                        objectFit: "contain",
                        borderRadius: 4,
                      }}
                    />
                  ) : (
                    <div style={{ color: "#555", fontSize: 13 }}>No image</div>
                  )}
                </div>
              </div>
            </div>

            <div style={divider} />

            {/* 2C — Lot metadata — updates with selectedLot */}
            <div
              style={{
                flex: 1,
                overflow: "hidden",
                display: "flex",
                flexDirection: "column",
              }}
            >
              <div style={sectionLabel}>
                2C · Lot Details — Lot {displayLot?.lot_number ?? "—"}
              </div>
              <div style={{ flex: 1, overflowY: "auto", padding: "10px 14px" }}>
                {displayLot ? (
                  <table
                    style={{
                      width: "100%",
                      borderCollapse: "collapse",
                      fontSize: 12,
                    }}
                  >
                    <tbody>
                      {[
                        ["Description", displayLot.description],
                        ["Artist / Maker", displayLot.artist],
                        [
                          "Medium / Materials",
                          displayLot.medium ?? displayLot.materials,
                        ],
                        ["Dimensions", displayLot.dimensions],
                        [
                          "Condition",
                          displayLot.condition_report ?? displayLot.condition,
                        ],
                        ["Category", displayLot.category],
                        ["Status", displayLot.status?.toUpperCase()],
                        [
                          "Estimate",
                          displayLot.estimate_low && displayLot.estimate_high
                            ? `${fmt(displayLot.estimate_low)} – ${fmt(displayLot.estimate_high)}`
                            : null,
                        ],
                        [
                          "Opening Bid",
                          fmt(
                            displayLot.opening_bid ?? displayLot.starting_bid,
                          ),
                        ],
                        ["Reserve", fmt(displayLot.reserve_price)],
                        ["Bid Increment", fmt(displayLot.bid_increment)],
                        [
                          "Sold Price",
                          displayLot.status === "sold"
                            ? fmt(
                                displayLot.sold_price ?? displayLot.sold_amount,
                              )
                            : null,
                        ],
                        ["Consignor", displayLot.consignor],
                      ]
                        .filter(([, v]) => v)
                        .map(([label, value]) => (
                          <tr
                            key={label as string}
                            style={{ borderBottom: "1px solid #f0f0f0" }}
                          >
                            <td
                              style={{
                                padding: "5px 8px 5px 0",
                                fontWeight: 600,
                                color: "#888",
                                whiteSpace: "nowrap",
                                verticalAlign: "top",
                                width: 120,
                              }}
                            >
                              {label}
                            </td>
                            <td
                              style={{
                                padding: "5px 0",
                                color:
                                  label === "Status"
                                    ? statusColor(
                                        (value as string).toLowerCase(),
                                      )
                                    : "#1a1a1a",
                                fontWeight: label === "Status" ? 700 : 400,
                                lineHeight: 1.4,
                              }}
                            >
                              {value}
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                ) : (
                  <div
                    style={{
                      color: "#bbb",
                      fontSize: 12,
                      textAlign: "center",
                      marginTop: 20,
                    }}
                  >
                    No lot selected
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ══════════════════════════════════════════
              COLUMN 3 — Communications & Operations
          ══════════════════════════════════════════ */}
          <div style={{ ...col, borderRight: "none", background: "#fff" }}>
            {/* 3A — All Lots list */}
            <div
              style={{
                flex: 1,
                overflow: "hidden",
                display: "flex",
                flexDirection: "column",
              }}
            >
              <div style={sectionLabel}>3A · All Lots</div>
              <div style={{ flex: 1, overflowY: "auto" }}>
                {allLots.map((lot) => {
                  const isActive = lot.id === auctionState?.current_lot_id;
                  const isViewing = lot.id === displayLot?.id;
                  return (
                    <div
                      key={lot.id}
                      onClick={() => handleSelectLot(lot)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        padding: "6px 10px",
                        borderBottom: "1px solid #f5f5f5",
                        background: isViewing
                          ? "#fffbe6"
                          : isActive
                            ? "#fff8f0"
                            : "#fff",
                        borderLeft: isActive
                          ? "3px solid #cc2200"
                          : isViewing
                            ? "3px solid #c9a84c"
                            : "3px solid transparent",
                        gap: 8,
                        cursor: "pointer",
                      }}
                    >
                      <span
                        style={{
                          fontSize: 10,
                          fontWeight: 700,
                          color: "#aaa",
                          width: 22,
                          flexShrink: 0,
                        }}
                      >
                        {lot.lot_number}
                      </span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div
                          style={{
                            fontSize: 11,
                            fontWeight: 600,
                            color: "#1a1a1a",
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          }}
                        >
                          {lot.title}
                        </div>
                        <div
                          style={{
                            fontSize: 9,
                            fontWeight: 700,
                            color: statusColor(lot.status),
                            letterSpacing: ".04em",
                          }}
                        >
                          {lot.status === "sold"
                            ? `SOLD ${fmt(lot.sold_amount)}`
                            : lot.status.toUpperCase()}
                        </div>
                      </div>
                      {isActive && (
                        <span
                          style={{
                            fontSize: 8,
                            fontWeight: 700,
                            background: "#cc2200",
                            color: "#fff",
                            padding: "1px 5px",
                            borderRadius: 3,
                            flexShrink: 0,
                          }}
                        >
                          LIVE
                        </span>
                      )}
                      {!isActive &&
                        lot.status !== "sold" &&
                        lot.status !== "passed" && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              jumpToLot(lot);
                            }}
                            style={{
                              background: "transparent",
                              border: "1px solid #ddd",
                              borderRadius: 3,
                              color: "#888",
                              fontSize: 10,
                              padding: "2px 6px",
                              cursor: "pointer",
                              flexShrink: 0,
                            }}
                          >
                            ▶
                          </button>
                        )}
                    </div>
                  );
                })}
              </div>
            </div>

            <div style={divider} />

            {/* 3B — Bidder Chat */}
            <div style={{ flexShrink: 0, height: 280 }}>
              <div style={sectionLabel}>3B · Bidder Chat</div>
              <div style={{ height: "calc(100% - 24px)" }}>
                <ClerkChat saleId={id} compact />
              </div>
            </div>

            <div style={divider} />

            {/* 3C — Operations */}
            <div style={{ flexShrink: 0 }}>
              <div style={sectionLabel}>3C · Operations</div>
              <div
                style={{
                  padding: "10px",
                  display: "flex",
                  flexDirection: "column",
                  gap: 6,
                }}
              >
                <button
                  disabled
                  style={{
                    width: "100%",
                    padding: "9px",
                    background: "#f8f8f8",
                    border: "1px solid #e0e0e0",
                    borderRadius: 4,
                    fontSize: 12,
                    fontWeight: 600,
                    color: "#555",
                    cursor: "not-allowed",
                    fontFamily: "DM Sans, sans-serif",
                    textAlign: "left",
                  }}
                >
                  📄 EOA Report{" "}
                  <span style={{ fontSize: 10, color: "#bbb", marginLeft: 6 }}>
                    coming soon
                  </span>
                </button>
                <button
                  disabled
                  style={{
                    width: "100%",
                    padding: "9px",
                    background: "#f8f8f8",
                    border: "1px solid #e0e0e0",
                    borderRadius: 4,
                    fontSize: 12,
                    fontWeight: 600,
                    color: "#555",
                    cursor: "not-allowed",
                    fontFamily: "DM Sans, sans-serif",
                    textAlign: "left",
                  }}
                >
                  🧾 Invoices{" "}
                  <span style={{ fontSize: 10, color: "#bbb", marginLeft: 6 }}>
                    coming soon
                  </span>
                </button>
                <button
                  disabled
                  style={{
                    width: "100%",
                    padding: "9px",
                    background: "#f8f8f8",
                    border: "1px solid #e0e0e0",
                    borderRadius: 4,
                    fontSize: 12,
                    fontWeight: 600,
                    color: "#555",
                    cursor: "not-allowed",
                    fontFamily: "DM Sans, sans-serif",
                    textAlign: "left",
                  }}
                >
                  💳 Billing{" "}
                  <span style={{ fontSize: 10, color: "#bbb", marginLeft: 6 }}>
                    coming soon
                  </span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
