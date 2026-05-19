// BidPanel.tsx — with watched lots drawer + winning/outbid status
/* eslint-disable @typescript-eslint/no-unused-vars */

import { useState, useEffect, useRef } from "react";
import { BidderLoginModal } from "./BidderLoginModal";
import type { AuctionState, Lot, Bid, BidderProfile } from "../types/auction";
import { supabase } from "../lib/supabase";

interface Props {
  auctionState: AuctionState | null;
  currentLot: Lot | null;
  recentBids: Bid[];
  nextBidAmount: number | null;
  bidder: BidderProfile | null;
  canBid: boolean;
  onPlaceBid: (amount: number) => Promise<void>;
  onJumpToLot?: (lot: Lot) => void;
}

interface WatchedLotRow {
  id: string;
  lot_id: string;
  lot: {
    id: string;
    lot_number: number;
    name: string;
    call_status: string | null;
    estimate_low: number | null;
    estimate_high: number | null;
    sold_price: number | null;
    images: { public_url: string | null; is_primary: boolean }[];
  };
}

function sourceLabel(source: string): string {
  const map: Record<string, string> = {
    floor: "Floor bid",
    phone: "Phone bid",
    web: "Web bid",
    liveauctioneers: "LiveAuctioneers",
    proxibid: "ProxiBid",
    hibid: "HiBid",
    absentee: "Absentee",
    maxbid: "Auto-bid",
  };
  return map[source] ?? source;
}

function callStatusLabel(status: AuctionState["call_status"]): string {
  switch (status) {
    case "going_once":
      return "Going once…";
    case "going_twice":
      return "Going twice…";
    case "sold":
      return "SOLD! 🔨";
    case "passed":
      return "Passed";
    default:
      return "Bidding open";
  }
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function watchedLotStatus(callStatus: string | null) {
  switch (callStatus) {
    case "sold":
      return { label: "SOLD", color: "#2d6a4f", bg: "#e8f5e9" };
    case "passed":
      return { label: "PASSED", color: "#888", bg: "#f5f5f5" };
    case "open":
    case "going_once":
    case "going_twice":
      return { label: "LIVE NOW", color: "#cc2200", bg: "#fff0f0" };
    default:
      return { label: "UPCOMING", color: "#1a6496", bg: "#e8f4f8" };
  }
}

export function BidPanel({
  auctionState,
  currentLot,
  recentBids,
  nextBidAmount,
  bidder,
  canBid,
  onPlaceBid,
  onJumpToLot,
}: Props) {
  const [placing, setPlacing] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [showLogin, setShowLogin] = useState(false);
  const [showWatched, setShowWatched] = useState(false);
  const [watchedLots, setWatchedLots] = useState<WatchedLotRow[]>([]);
  const [watchLoading, setWatchLoading] = useState(false);
  const [outbidFlash, setOutbidFlash] = useState(false);
  const prevWinnerRef = useRef<string | null>(null);

  // ── Winning / outbid detection ───────────────────────
  const currentBidderId = auctionState?.current_bidder_id ?? null;
  const isWinning = !!(
    bidder &&
    currentBidderId &&
    currentBidderId === bidder.id &&
    auctionState?.current_bid != null
  );

  useEffect(() => {
    if (!bidder || !currentBidderId) return;
    const prev = prevWinnerRef.current;
    prevWinnerRef.current = currentBidderId;

    if (prev === bidder.id && currentBidderId !== bidder.id) {
      setOutbidFlash(true);
      const t = setTimeout(() => setOutbidFlash(false), 5000);
      return () => clearTimeout(t);
    }
    // If bidder retakes lead, clear outbid flash immediately
    if (currentBidderId === bidder.id) {
      setOutbidFlash(false);
    }
  }, [currentBidderId, bidder]);

  // Reset outbid flash when lot changes
  useEffect(() => {
    setOutbidFlash(false);
    prevWinnerRef.current = null;
  }, [currentLot?.id]);

  // Load watched lots when drawer opens
  useEffect(() => {
    if (!showWatched || !bidder?.id) return;
    setWatchLoading(true);
    supabase
      .from("watched_lots")
      .select(
        `
        id, lot_id,
        lot:lots (
          id, lot_number, name, call_status,
          estimate_low, estimate_high, sold_price,
          images:photos ( public_url, is_primary )
        )
      `,
      )
      .eq("bidder_id", bidder.id)
      .order("created_at", { ascending: true })
      .then(({ data }) => {
        setWatchedLots((data as any) ?? []);
        setWatchLoading(false);
      });
  }, [showWatched, bidder?.id]);

  const handleBid = async () => {
    if (!nextBidAmount || placing) return;
    setPlacing(true);
    setFeedback(null);
    await onPlaceBid(nextBidAmount);
    setFeedback(`✓ $${nextBidAmount.toLocaleString()} placed!`);
    setPlacing(false);
    setTimeout(() => setFeedback(null), 2000);
  };

  const removeWatch = async (watchId: string) => {
    await supabase.from("watched_lots").delete().eq("id", watchId);
    setWatchedLots((prev) => prev.filter((w) => w.id !== watchId));
  };

  const currentBid = auctionState?.current_bid;
  const callStatus = auctionState?.call_status ?? "open";
  const callText = auctionState?.auctioneer_call;
  const openingBid =
    currentLot?.opening_bid ?? (currentLot as any)?.starting_bid ?? 0;

  return (
    <>
      <aside className="bid-panel">
        {/* Lot header */}
        {currentLot && (
          <div className="bid-panel__header">
            <div className="bid-panel__lot-num">{currentLot.lot_number}</div>
            <div className="bid-panel__lot-name">
              {currentLot.title.toUpperCase()}
            </div>
            {currentLot.estimate_low && currentLot.estimate_high && (
              <div className="bid-panel__est">
                Est ${currentLot.estimate_low.toLocaleString()}
                {" – "}${currentLot.estimate_high.toLocaleString()}
              </div>
            )}
          </div>
        )}

        {/* NOW badge */}
        {currentLot?.status === "open" && (
          <div className="bid-panel__now">NOW!</div>
        )}

        {/* ── Winning / Outbid banner ───────────────────── */}
        {canBid &&
          currentBid != null &&
          (isWinning && !outbidFlash ? (
            <div
              style={{
                background: "#2d6a4f",
                color: "#fff",
                textAlign: "center",
                padding: "7px 10px",
                fontSize: 12,
                fontWeight: 700,
                fontFamily: "DM Sans, sans-serif",
                letterSpacing: ".06em",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
              }}
            >
              <span style={{ fontSize: 16 }}>🏆</span>
              YOU'RE WINNING!
            </div>
          ) : outbidFlash ? (
            <div
              style={{
                background: "#cc2200",
                color: "#fff",
                textAlign: "center",
                padding: "7px 10px",
                fontSize: 12,
                fontWeight: 700,
                fontFamily: "DM Sans, sans-serif",
                letterSpacing: ".06em",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
                animation: "pulse .5s infinite",
              }}
            >
              <span style={{ fontSize: 16 }}>⚠️</span>
              YOU'VE BEEN OUTBID!
            </div>
          ) : null)}

        {/* Current bid */}
        <div className="bid-panel__bid-block">
          <div className="bid-panel__bid-label">Current Bid</div>
          <div
            className="bid-panel__bid-amount"
            style={{
              color: isWinning ? "#7fff9a" : outbidFlash ? "#ff8888" : "#fff",
              transition: "color .3s",
            }}
          >
            {currentBid != null
              ? `$${currentBid.toLocaleString()}`
              : currentLot
                ? `$${openingBid.toLocaleString()}`
                : "—"}
          </div>
          {currentLot && (
            <div className="bid-panel__increment">
              (Bid increment is{" "}
              <strong>${currentLot.bid_increment.toLocaleString()}</strong>)
            </div>
          )}
        </div>

        {/* BID / Login button */}
        <div className="bid-panel__btn-wrap">
          {canBid ? (
            <button
              className={`bid-panel__btn ${placing ? "bid-panel__btn--placed" : ""}`}
              onClick={handleBid}
              disabled={placing || !nextBidAmount || callStatus === "sold"}
              style={
                outbidFlash && !placing
                  ? { background: "#cc2200", animation: "pulse .6s 3" }
                  : undefined
              }
            >
              {feedback
                ? feedback
                : placing
                  ? "Placing…"
                  : nextBidAmount
                    ? `BID $${nextBidAmount.toLocaleString()}`
                    : "BID"}
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

        {/* Watched lots button */}
        {bidder && (
          <button
            onClick={() => setShowWatched(true)}
            style={{
              margin: "0 10px 8px",
              padding: "7px 10px",
              background: "rgba(0,0,0,.2)",
              border: "1px solid rgba(255,255,255,.2)",
              borderRadius: 4,
              color: "rgba(255,255,255,.8)",
              fontSize: 11,
              fontWeight: 600,
              fontFamily: "DM Sans, sans-serif",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            ★ My Watched Lots
            {watchedLots.length > 0 && (
              <span
                style={{
                  background: "#cc2200",
                  color: "#fff",
                  borderRadius: 10,
                  fontSize: 9,
                  padding: "1px 6px",
                  fontWeight: 700,
                }}
              >
                {watchedLots.length}
              </span>
            )}
          </button>
        )}

        {/* Live bid feed */}
        <div className="bid-feed">
          <div className="bid-feed__header">Live Bid Feed</div>
          {recentBids.length === 0 ? (
            <div className="bid-feed__empty">No bids yet</div>
          ) : (
            recentBids.map((bid) => (
              <div
                key={bid.id}
                className={`bid-feed__row ${bid.is_winning ? "bid-feed__row--winning" : ""}`}
                style={
                  bidder && (bid as any).bidder_id === bidder.id
                    ? { background: "rgba(45,106,79,.2)" }
                    : undefined
                }
              >
                <div>
                  <div className="bid-feed__src">
                    {sourceLabel(bid.source)}
                    {bidder && (bid as any).bidder_id === bidder.id && (
                      <span
                        style={{
                          marginLeft: 4,
                          fontSize: 8,
                          color: "#7fff9a",
                          fontWeight: 700,
                        }}
                      >
                        YOU
                      </span>
                    )}
                  </div>
                  <div className="bid-feed__time">
                    {formatTime(bid.placed_at)}
                  </div>
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
          {callText && <div className="bid-panel__call-text">"{callText}"</div>}
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
              <span className="bid-panel__paddle-num" style={{ flex: 1 }}>
                PADDLE {bidder.paddle_number ?? "—"} · {bidder.first_name}{" "}
                {bidder.last_name}
              </span>
              <button
                onClick={() => supabase.auth.signOut()}
                style={{
                  background: "transparent",
                  border: "none",
                  color: "rgba(255,255,255,.45)",
                  fontSize: 9,
                  cursor: "pointer",
                  fontFamily: "DM Sans, sans-serif",
                  textDecoration: "underline",
                  padding: 0,
                  marginLeft: 6,
                }}
              >
                logout
              </button>
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

      {/* ── Watched Lots Drawer ─────────────────────────── */}
      {showWatched && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,.6)",
            zIndex: 300,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 20,
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowWatched(false);
          }}
        >
          <div
            style={{
              background: "#fff",
              borderRadius: 8,
              width: "100%",
              maxWidth: 480,
              maxHeight: "80vh",
              overflow: "hidden",
              display: "flex",
              flexDirection: "column",
              boxShadow: "0 20px 60px rgba(0,0,0,.5)",
            }}
          >
            <div
              style={{
                background: "#1a1a1a",
                padding: "14px 18px",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                borderBottom: "2px solid #c9a84c",
              }}
            >
              <div>
                <div
                  style={{
                    color: "#c9a84c",
                    fontWeight: 700,
                    fontSize: 15,
                    fontFamily: "DM Sans, sans-serif",
                    letterSpacing: ".05em",
                  }}
                >
                  ★ MY WATCHED LOTS
                </div>
                <div
                  style={{
                    color: "rgba(255,255,255,.45)",
                    fontSize: 11,
                    fontFamily: "DM Sans, sans-serif",
                    marginTop: 2,
                  }}
                >
                  {bidder?.first_name} {bidder?.last_name} · Paddle{" "}
                  {bidder?.paddle_number}
                </div>
              </div>
              <button
                onClick={() => setShowWatched(false)}
                style={{
                  background: "rgba(255,255,255,.1)",
                  border: "none",
                  borderRadius: 4,
                  color: "rgba(255,255,255,.6)",
                  width: 28,
                  height: 28,
                  cursor: "pointer",
                  fontSize: 12,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                ✕
              </button>
            </div>

            <div style={{ flex: 1, overflowY: "auto" }}>
              {watchLoading ? (
                <div
                  style={{
                    padding: 24,
                    textAlign: "center",
                    color: "#aaa",
                    fontSize: 13,
                    fontFamily: "DM Sans, sans-serif",
                  }}
                >
                  Loading…
                </div>
              ) : watchedLots.length === 0 ? (
                <div
                  style={{
                    padding: 24,
                    textAlign: "center",
                    color: "#aaa",
                    fontSize: 13,
                    fontFamily: "DM Sans, sans-serif",
                  }}
                >
                  No watched lots yet.
                  <br />
                  <span style={{ fontSize: 11, color: "#ccc" }}>
                    Click ☆ Watch Lot on any upcoming lot.
                  </span>
                </div>
              ) : (
                watchedLots.map((w) => {
                  const status = watchedLotStatus(w.lot?.call_status ?? null);
                  const thumb =
                    w.lot?.images?.find((i: any) => i.is_primary)?.public_url ??
                    w.lot?.images?.[0]?.public_url;
                  const isLive =
                    w.lot?.call_status === "open" ||
                    w.lot?.call_status === "going_once" ||
                    w.lot?.call_status === "going_twice";
                  return (
                    <div
                      key={w.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        padding: "10px 14px",
                        borderBottom: "1px solid #f0f0f0",
                        background: isLive ? "#fff8f0" : "#fff",
                      }}
                    >
                      <div
                        style={{
                          width: 52,
                          height: 44,
                          borderRadius: 4,
                          overflow: "hidden",
                          background: "#f0f0f0",
                          flexShrink: 0,
                          border: isLive
                            ? "2px solid #cc2200"
                            : "2px solid #eee",
                        }}
                      >
                        {thumb ? (
                          <img
                            src={thumb}
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
                              fontSize: 20,
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              height: "100%",
                            }}
                          >
                            🖼
                          </span>
                        )}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div
                          style={{
                            fontSize: 9,
                            fontWeight: 700,
                            color: "#aaa",
                            fontFamily: "DM Sans, sans-serif",
                            letterSpacing: ".08em",
                          }}
                        >
                          LOT {w.lot?.lot_number}
                        </div>
                        <div
                          style={{
                            fontSize: 12,
                            fontWeight: 600,
                            color: "#1a1a1a",
                            fontFamily: "DM Sans, sans-serif",
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          }}
                        >
                          {w.lot?.name}
                        </div>
                        <div
                          style={{
                            fontSize: 10,
                            color: "#aaa",
                            fontFamily: "DM Sans, sans-serif",
                            marginTop: 1,
                          }}
                        >
                          {w.lot?.estimate_low && w.lot?.estimate_high
                            ? `Est $${w.lot.estimate_low.toLocaleString()} – $${w.lot.estimate_high.toLocaleString()}`
                            : w.lot?.call_status === "sold" && w.lot?.sold_price
                              ? `Sold $${w.lot.sold_price.toLocaleString()}`
                              : ""}
                        </div>
                      </div>
                      <div
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "flex-end",
                          gap: 4,
                          flexShrink: 0,
                        }}
                      >
                        <span
                          style={{
                            fontSize: 9,
                            fontWeight: 700,
                            padding: "2px 7px",
                            borderRadius: 3,
                            background: status.bg,
                            color: status.color,
                            fontFamily: "DM Sans, sans-serif",
                            letterSpacing: ".06em",
                          }}
                        >
                          {status.label}
                        </span>
                        <div style={{ display: "flex", gap: 4 }}>
                          {isLive && onJumpToLot && (
                            <button
                              onClick={() => {
                                setShowWatched(false);
                                onJumpToLot(w.lot as any);
                              }}
                              style={{
                                background: "#cc2200",
                                border: "none",
                                borderRadius: 3,
                                color: "#fff",
                                fontSize: 9,
                                fontWeight: 700,
                                padding: "3px 8px",
                                cursor: "pointer",
                                fontFamily: "DM Sans, sans-serif",
                              }}
                            >
                              BID NOW
                            </button>
                          )}
                          <button
                            onClick={() => removeWatch(w.id)}
                            style={{
                              background: "#f0f0f0",
                              border: "none",
                              borderRadius: 3,
                              color: "#aaa",
                              fontSize: 9,
                              padding: "3px 6px",
                              cursor: "pointer",
                              fontFamily: "DM Sans, sans-serif",
                            }}
                            title="Remove from watchlist"
                          >
                            ✕
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <div
              style={{
                padding: "10px 14px",
                borderTop: "1px solid #eee",
                background: "#f8f8f8",
                textAlign: "center",
              }}
            >
              <button
                onClick={() => setShowWatched(false)}
                style={{
                  background: "transparent",
                  border: "1px solid #ccc",
                  borderRadius: 4,
                  padding: "6px 20px",
                  fontSize: 12,
                  color: "#555",
                  cursor: "pointer",
                  fontFamily: "DM Sans, sans-serif",
                }}
              >
                ← Return to Auction
              </button>
            </div>
          </div>
        </div>
      )}

      {showLogin && (
        <BidderLoginModal
          onClose={() => setShowLogin(false)}
          onSuccess={() => setShowLogin(false)}
        />
      )}
    </>
  );
}
