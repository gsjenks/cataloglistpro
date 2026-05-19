// AuctionResults.tsx
// Full-screen results overlay for clerk panel.
// Shows all lots with status, sold price, buyer paddle.
// Print button triggers browser print with clean CSS.

import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

interface ResultLot {
  lot_number: number;
  name: string;
  creator: string | null;
  estimate_low: number | null;
  estimate_high: number | null;
  call_status: string | null;
  sold_price: number | null;
  buyer_paddle: number | null;
  buyer_name: string | null;
}

interface Props {
  saleId: string;
  onClose: () => void;
}

export function AuctionResults({ saleId, onClose }: Props) {
  const [lots, setLots] = useState<ResultLot[]>([]);
  const [loading, setLoading] = useState(true);
  const [saleTitle, setSaleTitle] = useState("Fine Arts Winter Collection");

  useEffect(() => {
    async function load() {
      setLoading(true);

      // Load lots with buyer info
      const { data } = await supabase
        .from("lots")
        .select(
          `
          lot_number, name, creator,
          estimate_low, estimate_high,
          call_status, sold_price, sold_to_bidder
        `,
        )
        .eq("sale_id", saleId)
        .order("lot_number");

      if (!data) {
        setLoading(false);
        return;
      }

      // For sold lots, get buyer paddle + name
      const soldBidderIds = data
        .filter((l) => l.sold_to_bidder)
        .map((l) => l.sold_to_bidder);

      let bidderMap: Record<string, { paddle: number | null; name: string }> =
        {};

      if (soldBidderIds.length > 0) {
        const { data: regs } = await supabase
          .from("auction_registrations")
          .select(
            "bidder_id, paddle_number, bidder:bidders(first_name, last_name)",
          )
          .eq("sale_id", saleId)
          .in("bidder_id", soldBidderIds);

        if (regs) {
          regs.forEach((r: any) => {
            bidderMap[r.bidder_id] = {
              paddle: r.paddle_number,
              name: `${r.bidder?.first_name ?? ""} ${r.bidder?.last_name ?? ""}`.trim(),
            };
          });
        }
      }

      const results: ResultLot[] = data.map((l) => ({
        lot_number: l.lot_number,
        name: l.name,
        creator: l.creator,
        estimate_low: l.estimate_low,
        estimate_high: l.estimate_high,
        call_status: l.call_status,
        sold_price: l.sold_price,
        buyer_paddle: l.sold_to_bidder
          ? (bidderMap[l.sold_to_bidder]?.paddle ?? null)
          : null,
        buyer_name: l.sold_to_bidder
          ? (bidderMap[l.sold_to_bidder]?.name ?? null)
          : null,
      }));

      setLots(results);
      setLoading(false);
    }

    load();
  }, [saleId]);

  const soldLots = lots.filter((l) => l.call_status === "sold");
  const passedLots = lots.filter((l) => l.call_status === "passed");
  const totalSold = soldLots.reduce((sum, l) => sum + (l.sold_price ?? 0), 0);
  const date = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const handlePrint = () => window.print();

  return (
    <>
      {/* Print styles */}
      <style>{`
        @media print {
          body > * { display: none !important; }
          .auction-results-print { display: block !important; position: static !important; }
          .auction-results-print .no-print { display: none !important; }
          .auction-results-print { font-family: Georgia, serif; color: #000; }
        }
        @media screen {
          .auction-results-print { display: block; }
        }
      `}</style>

      <div
        className="auction-results-print"
        style={{
          position: "fixed",
          inset: 0,
          background: "#f5f5f5",
          zIndex: 500,
          overflowY: "auto",
          fontFamily: "DM Sans, sans-serif",
        }}
      >
        {/* Screen header */}
        <div
          className="no-print"
          style={{
            background: "#1a1a1a",
            borderBottom: "2px solid #c9a84c",
            padding: "12px 24px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            position: "sticky",
            top: 0,
            zIndex: 10,
          }}
        >
          <div>
            <div
              style={{
                color: "#c9a84c",
                fontWeight: 700,
                fontSize: 16,
                letterSpacing: ".05em",
              }}
            >
              AUCTION RESULTS
            </div>
            <div
              style={{
                color: "rgba(255,255,255,.45)",
                fontSize: 11,
                marginTop: 2,
              }}
            >
              Benson Auction Services · {saleTitle}
            </div>
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <button
              onClick={handlePrint}
              style={{
                background: "#c9a84c",
                border: "none",
                borderRadius: 4,
                color: "#1a1a1a",
                fontSize: 12,
                fontWeight: 700,
                padding: "8px 18px",
                cursor: "pointer",
                fontFamily: "DM Sans, sans-serif",
              }}
            >
              🖨 Print / Save PDF
            </button>
            <button
              onClick={onClose}
              style={{
                background: "rgba(255,255,255,.1)",
                border: "1px solid rgba(255,255,255,.2)",
                borderRadius: 4,
                color: "#fff",
                fontSize: 12,
                padding: "8px 18px",
                cursor: "pointer",
                fontFamily: "DM Sans, sans-serif",
              }}
            >
              ← Back to Clerk Panel
            </button>
          </div>
        </div>

        {/* Report content */}
        <div style={{ maxWidth: 900, margin: "0 auto", padding: "32px 24px" }}>
          {/* Report header */}
          <div
            style={{
              textAlign: "center",
              marginBottom: 32,
              borderBottom: "2px solid #1a1a1a",
              paddingBottom: 20,
            }}
          >
            <div
              style={{
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: ".15em",
                color: "#888",
                marginBottom: 6,
              }}
            >
              BENSON AUCTION SERVICES
            </div>
            <div
              style={{
                fontSize: 26,
                fontWeight: 700,
                color: "#1a1a1a",
                fontFamily: "Playfair Display, Georgia, serif",
              }}
            >
              {saleTitle}
            </div>
            <div style={{ fontSize: 13, color: "#666", marginTop: 6 }}>
              {date}
            </div>
          </div>

          {loading ? (
            <div style={{ textAlign: "center", color: "#aaa", padding: 40 }}>
              Loading results…
            </div>
          ) : (
            <>
              {/* Summary stats */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr 1fr 1fr",
                  gap: 12,
                  marginBottom: 28,
                }}
              >
                {[
                  { label: "Total Lots", value: lots.length },
                  { label: "Lots Sold", value: soldLots.length },
                  { label: "Lots Passed", value: passedLots.length },
                  {
                    label: "Total Realized",
                    value: `$${totalSold.toLocaleString()}`,
                  },
                ].map((s) => (
                  <div
                    key={s.label}
                    style={{
                      background: "#fff",
                      borderRadius: 6,
                      padding: "14px 16px",
                      border: "1px solid #e0e0e0",
                      textAlign: "center",
                    }}
                  >
                    <div
                      style={{
                        fontSize: 9,
                        fontWeight: 700,
                        letterSpacing: ".1em",
                        color: "#aaa",
                        textTransform: "uppercase",
                        marginBottom: 4,
                      }}
                    >
                      {s.label}
                    </div>
                    <div
                      style={{
                        fontSize: 22,
                        fontWeight: 700,
                        color: "#1a1a1a",
                      }}
                    >
                      {s.value}
                    </div>
                  </div>
                ))}
              </div>

              {/* Results table */}
              <div
                style={{
                  background: "#fff",
                  borderRadius: 6,
                  border: "1px solid #e0e0e0",
                  overflow: "hidden",
                }}
              >
                {/* Table header */}
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "50px 1fr 120px 130px 130px 100px",
                    background: "#1a1a1a",
                    color: "#c9a84c",
                    fontSize: 9,
                    fontWeight: 700,
                    letterSpacing: ".1em",
                    padding: "10px 14px",
                  }}
                >
                  <div>LOT</div>
                  <div>DESCRIPTION</div>
                  <div>ESTIMATE</div>
                  <div>RESULT</div>
                  <div>BUYER</div>
                  <div>STATUS</div>
                </div>

                {/* Table rows */}
                {lots.map((lot, idx) => {
                  const isSold = lot.call_status === "sold";
                  const isPassed = lot.call_status === "passed";
                  const isPending = !isSold && !isPassed;

                  return (
                    <div
                      key={lot.lot_number}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "50px 1fr 120px 130px 130px 100px",
                        padding: "10px 14px",
                        borderBottom: "1px solid #f0f0f0",
                        background: idx % 2 === 0 ? "#fff" : "#fafafa",
                        alignItems: "center",
                      }}
                    >
                      <div
                        style={{ fontSize: 12, fontWeight: 700, color: "#888" }}
                      >
                        {lot.lot_number}
                      </div>
                      <div>
                        <div
                          style={{
                            fontSize: 12,
                            fontWeight: 600,
                            color: "#1a1a1a",
                            lineHeight: 1.3,
                          }}
                        >
                          {lot.name}
                        </div>
                        {lot.creator && (
                          <div
                            style={{
                              fontSize: 10,
                              color: "#888",
                              marginTop: 1,
                            }}
                          >
                            {lot.creator}
                          </div>
                        )}
                      </div>
                      <div style={{ fontSize: 11, color: "#888" }}>
                        {lot.estimate_low && lot.estimate_high
                          ? `$${lot.estimate_low.toLocaleString()} – $${lot.estimate_high.toLocaleString()}`
                          : "—"}
                      </div>
                      <div
                        style={{
                          fontSize: 13,
                          fontWeight: 700,
                          color: isSold
                            ? "#2d6a4f"
                            : isPassed
                              ? "#888"
                              : "#1a1a1a",
                        }}
                      >
                        {isSold
                          ? `$${lot.sold_price?.toLocaleString()}`
                          : isPassed
                            ? "Passed"
                            : "—"}
                      </div>
                      <div style={{ fontSize: 11, color: "#555" }}>
                        {isSold && lot.buyer_paddle ? (
                          <>
                            <div style={{ fontWeight: 700 }}>
                              Paddle #{lot.buyer_paddle}
                            </div>
                            {lot.buyer_name && (
                              <div style={{ fontSize: 10, color: "#888" }}>
                                {lot.buyer_name}
                              </div>
                            )}
                          </>
                        ) : (
                          "—"
                        )}
                      </div>
                      <div>
                        <span
                          style={{
                            fontSize: 9,
                            fontWeight: 700,
                            padding: "2px 7px",
                            borderRadius: 3,
                            letterSpacing: ".06em",
                            background: isSold
                              ? "#e8f5e9"
                              : isPassed
                                ? "#f5f5f5"
                                : "#fff3e0",
                            color: isSold
                              ? "#2d6a4f"
                              : isPassed
                                ? "#888"
                                : "#e65100",
                          }}
                        >
                          {isSold ? "SOLD" : isPassed ? "PASSED" : "PENDING"}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Footer totals */}
              <div
                style={{
                  marginTop: 16,
                  padding: "14px 16px",
                  background: "#1a1a1a",
                  borderRadius: 6,
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <div style={{ color: "rgba(255,255,255,.6)", fontSize: 12 }}>
                  {soldLots.length} of {lots.length} lots sold
                  {passedLots.length > 0 && ` · ${passedLots.length} passed`}
                </div>
                <div>
                  <span
                    style={{
                      color: "rgba(255,255,255,.5)",
                      fontSize: 11,
                      marginRight: 10,
                    }}
                  >
                    TOTAL REALIZED
                  </span>
                  <span
                    style={{ color: "#c9a84c", fontSize: 22, fontWeight: 700 }}
                  >
                    ${totalSold.toLocaleString()}
                  </span>
                </div>
              </div>

              {/* Print footer */}
              <div
                style={{
                  marginTop: 24,
                  textAlign: "center",
                  fontSize: 10,
                  color: "#bbb",
                }}
              >
                Benson Auction Services · Commerce, GA · Generated {date}
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
