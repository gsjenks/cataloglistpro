import { useState, useEffect, useRef } from "react";
import QRCode from "qrcode";
import { Printer, Download } from "lucide-react";
import type { Lot } from "../types/auction";
import { supabase } from "../lib/supabase";

interface Props {
  saleId: string;
  saleName: string;
}

export function QRCodeLabelGenerator({ saleId, saleName }: Props) {
  const [lots, setLots] = useState<Lot[]>([]);
  const [loading, setLoading] = useState(true);
  const [qrCodes, setQrCodes] = useState<{ [key: string]: string }>({});
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadLots();
  }, [saleId]);

  const loadLots = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("lots")
        .select("*")
        .eq("sale_id", saleId)
        .order("lot_number", { ascending: true });

      if (error) throw error;
      setLots(data || []);
    } catch (error) {
      console.error("Error loading lots:", error);
      alert("Failed to load lots");
    } finally {
      setLoading(false);
    }
  };

  const generateLotUrl = (lotId: string) => {
    // Use production URL for QR codes
    const baseUrl = "https://cataloglistpro.vercel.app";
    return `${baseUrl}/view/sales/${saleId}/lots/${lotId}`;
  };
  useEffect(() => {
    if (lots.length === 0) return;

    const generateQRCodes = async () => {
      const codes: { [key: string]: string } = {};
      for (const lot of lots) {
        try {
          const qrDataUrl = await QRCode.toDataURL(generateLotUrl(lot.id), {
            width: 150,
            margin: 0,
            color: {
              dark: "#000000",
              light: "#ffffff",
            },
          });
          codes[lot.id] = qrDataUrl;
        } catch (err) {
          console.error(`Failed to generate QR code for lot ${lot.id}:`, err);
        }
      }
      setQrCodes(codes);
    };

    generateQRCodes();
  }, [lots, saleId]);

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadPDF = () => {
    alert(
      "PDF download feature coming soon. Use browser Print to PDF instead.",
    );
    handlePrint();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 mx-auto mb-2" />
          <p className="text-sm text-gray-600">Loading lots...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex gap-2">
        <button
          onClick={handlePrint}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors"
        >
          <Printer className="w-4 h-4" />
          Print Labels
        </button>
        <button
          onClick={handleDownloadPDF}
          className="flex items-center gap-2 px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg transition-colors"
        >
          <Download className="w-4 h-4" />
          Download PDF
        </button>
      </div>

      {/* Label Count */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
        <p className="text-sm text-blue-800">
          Generating {lots.length} labels for printing on 1.75" × 1.1" tags
        </p>
      </div>

      {/* Print-friendly label grid */}
      <div
        ref={containerRef}
        className="print:p-0 print:m-0 print:bg-white"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
          gap: "8px",
          padding: "16px",
        }}
      >
        {lots.map((lot) => {
          const amount =
            lot.estimate_low && lot.estimate_high
              ? `$${lot.estimate_low}-$${lot.estimate_high}`
              : lot.opening_bid
                ? `$${lot.opening_bid}`
                : "TBD";

          const qrCodeDataUrl = qrCodes[lot.id];

          return (
            <div
              key={lot.id}
              className="print:break-inside-avoid"
              style={{
                width: "200px",
                height: "130px",
                border: "1px solid #ddd",
                borderRadius: "4px",
                padding: "8px",
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
                backgroundColor: "#fff",
                fontSize: "11px",
                fontFamily: "Arial, sans-serif",
              }}
            >
              {/* Title */}
              <div
                style={{
                  fontSize: "11px",
                  fontWeight: "bold",
                  lineHeight: "1.2",
                  marginBottom: "4px",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  display: "-webkit-box",
                  WebkitLineClamp: 3,
                  WebkitBoxOrient: "vertical",
                  minHeight: "36px",
                  color: "#000",
                }}
              >
                {lot.title || lot.name || "Untitled"}
              </div>

              {/* Amount */}
              <div
                style={{
                  fontSize: "12px",
                  fontWeight: "bold",
                  color: "#d32f2f",
                  marginBottom: "4px",
                  textAlign: "center",
                }}
              >
                {amount}
              </div>

              {/* QR Code */}
              <div style={{ display: "flex", justifyContent: "center" }}>
                {qrCodeDataUrl ? (
                  <img
                    src={qrCodeDataUrl}
                    alt="QR Code"
                    style={{ width: "64px", height: "64px" }}
                  />
                ) : (
                  <div
                    style={{
                      width: "64px",
                      height: "64px",
                      background: "#f0f0f0",
                    }}
                  />
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Print Styles */}
      <style>{`
        @media print {
          body {
            margin: 0;
            padding: 0;
            background: white;
          }
          * {
            box-sizing: border-box;
          }
          [class*="flex"],
          [class*="gap"],
          button,
          .print\\:hidden {
            display: none !important;
          }
          div[style*="grid"] {
            display: grid !important;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)) !important;
            gap: 8px !important;
            padding: 0 !important;
          }
        }
      `}</style>
    </div>
  );
}
