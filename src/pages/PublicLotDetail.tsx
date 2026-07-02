import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { createClient } from "@supabase/supabase-js";
import { ArrowLeft, ShoppingBasket } from "lucide-react";
import type { Lot } from "../types/auction";
import LotQRCode from "../components/LotQRCode";
import BuyerBasket from "../components/BuyerBasket";
import { useBuyerBasket } from "../hooks/useBuyerBasket";
import { holdLot, releaseLot, effectiveStatus, HOLD_MINUTES } from "../lib/holds";

interface Photo {
  id: string;
  lot_id: string;
  file_path: string;
  file_name: string;
  is_primary?: boolean;
  created_at: string;
  url?: string;
}

const supabasePublic = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
);

export default function PublicLotDetail() {
  const { saleId, lotId } = useParams<{ saleId: string; lotId: string }>();
  const navigate = useNavigate();
  const [lot, setLot] = useState<Lot | null>(null);
  const [saleType, setSaleType] = useState<string | null>(null);
  const [checkoutEnabled, setCheckoutEnabled] = useState(false);
  const [checkoutOpensAt, setCheckoutOpensAt] = useState<string | null>(null);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const basket = useBuyerBasket(saleId);

  const loadLotData = useCallback(async () => {
    if (!lotId || !saleId) {
      setError("Invalid lot or sale");
      setLoading(false);
      return;
    }

    try {
      setLoading(true);

      const { data: lotData, error: lotError } = await supabasePublic
        .from("lots")
        .select("*")
        .eq("id", lotId)
        .eq("sale_id", saleId)
        .single();

      if (lotError) {
        console.error("Error loading lot:", lotError);
        throw new Error("Item not found");
      }

      setLot(lotData);

      // Sale type controls pricing display (estate = fixed price on starting_bid);
      // checkout fields gate the buyer self-checkout / basket.
      const { data: saleRow } = await supabasePublic
        .from("sales")
        .select("sale_type, online_checkout_enabled, online_checkout_opens_at")
        .eq("id", saleId)
        .single();
      setSaleType(saleRow?.sale_type ?? null);
      setCheckoutEnabled(saleRow?.online_checkout_enabled ?? false);
      setCheckoutOpensAt(saleRow?.online_checkout_opens_at ?? null);

      const { data: photoData, error: photoError } = await supabasePublic
        .from("photos")
        .select("*")
        .eq("lot_id", lotId)
        .order("is_primary", { ascending: false })
        .order("created_at", { ascending: true });

      if (!photoError && photoData) {
        // The photos bucket is public, so use public URLs. createSignedUrl
        // returns 404 on a public bucket, which left every image blank here.
        const photosWithUrls = photoData.map((photo: Photo) => {
          const { data } = supabasePublic.storage
            .from("photos")
            .getPublicUrl(photo.file_path);
          return { ...photo, url: data.publicUrl };
        });
        setPhotos(photosWithUrls);
      }
    } catch (e) {
      console.error("Error loading lot data:", e);
      setError(e instanceof Error ? e.message : "Failed to load item");
    } finally {
      setLoading(false);
    }
  }, [lotId, saleId]);

  useEffect(() => {
    loadLotData();
  }, [loadLotData]);

  // Renew all basket holds while the buyer is actively shopping (a lot page is
  // open), so items added earlier don't expire mid-shop. The hold_lot RPC
  // refreshes a hold the same basket already owns. Items lost to another buyer
  // (or sold) are dropped from the basket.
  const basketItemsRef = useRef(basket.items);
  basketItemsRef.current = basket.items;
  useEffect(() => {
    if (saleType !== "estate_sale") return;
    let cancelled = false;
    const renew = async () => {
      for (const item of basketItemsRef.current) {
        const res = await holdLot(supabasePublic, item.lotId, basket.basketId);
        if (cancelled) return;
        if (res.success && res.heldUntil) {
          basket.updateHeldUntil(item.lotId, res.heldUntil);
        } else if (res.error === "sold" || res.error === "held_by_other") {
          basket.removeItem(item.lotId);
        }
      }
    };
    renew(); // refresh on every page open (i.e. as the buyer scans new items)
    const t = setInterval(renew, 10 * 60 * 1000); // and every 10 minutes
    return () => {
      cancelled = true;
      clearInterval(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saleType, basket.basketId]);

  // Keep the lot (esp. its status) live so a buyer sees it sell in real time.
  useEffect(() => {
    if (!lotId) return;
    const channel = supabasePublic
      .channel(`public-lot:${lotId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "lots", filter: `id=eq.${lotId}` },
        (payload) => setLot((prev) => (prev ? { ...prev, ...(payload.new as Lot) } : prev)),
      )
      .subscribe();
    return () => {
      supabasePublic.removeChannel(channel);
    };
  }, [lotId]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4" />
          <p className="text-gray-600">Loading item...</p>
        </div>
      </div>
    );
  }

  if (error || !lot) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center max-w-md mx-auto px-4">
          <div className="text-6xl mb-4">⚠️</div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            Item Not Found
          </h1>
          <p className="text-gray-600 mb-6">
            {error || "This item could not be found"}
          </p>
          <button
            onClick={() => navigate("/")}
            className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back Home
          </button>
        </div>
      </div>
    );
  }

  const primaryPhoto = photos.find((p) => p.is_primary);
  const otherPhotos = photos.filter((p) => !p.is_primary);
  const allPhotos = primaryPhoto ? [primaryPhoto, ...otherPhotos] : photos;

  const isEstate = saleType === "estate_sale";
  // Estate sales: the price is the starting_bid; estimate is not shown.
  const priceLabel = isEstate ? "Price" : "Estimate";
  const priceDisplay = isEstate
    ? lot.starting_bid != null
      ? `$${lot.starting_bid.toLocaleString()}`
      : "Price TBD"
    : lot.estimate_low && lot.estimate_high
      ? `$${lot.estimate_low.toLocaleString()}-$${lot.estimate_high.toLocaleString()}`
      : lot.opening_bid
        ? `$${lot.opening_bid.toLocaleString()} (Opening Bid)`
        : "Price TBD";

  // Buyer self-checkout state: effective status (an expired hold counts as
  // available), whether this buyer already holds it, and if checkout is open.
  const l = lot as unknown as {
    id: string;
    name: string;
    lot_number: number | string | null;
    starting_bid?: number | null;
    inventory_status?: string | null;
    held_until?: string | null;
  };
  const eff = effectiveStatus(l.inventory_status, l.held_until);
  const inMyBasket = basket.has(l.id);
  const displayStatus = inMyBasket ? "in_basket" : eff;
  const checkoutOpen =
    isEstate &&
    checkoutEnabled &&
    (!checkoutOpensAt || new Date(checkoutOpensAt).getTime() <= Date.now());

  const statusBadge: Record<string, string> = {
    available: "bg-green-100 text-green-800",
    held: "bg-amber-100 text-amber-800",
    sold: "bg-gray-200 text-gray-700",
    in_basket: "bg-indigo-100 text-indigo-800",
  };
  const statusText: Record<string, string> = {
    available: "Available",
    held: "On Hold",
    sold: "Sold",
    in_basket: "In your basket",
  };

  const handleAdd = async () => {
    if (!lotId) return;
    setAdding(true);
    setAddError(null);
    const res = await holdLot(supabasePublic, lotId, basket.basketId);
    setAdding(false);
    if (!res.success || !res.heldUntil) {
      const map: Record<string, string> = {
        checkout_closed: "Online purchasing isn't open yet.",
        sold: "Sorry, this item was just sold.",
        held_by_other: "Another shopper just added this to their basket.",
      };
      setAddError(map[res.error ?? "unknown"] ?? "Could not add to basket. Please try again.");
      return;
    }
    basket.addItem({
      lotId: l.id,
      lotNumber: l.lot_number ?? null,
      name: l.name,
      price: l.starting_bid ?? 0,
      heldUntil: res.heldUntil,
    });
  };

  const handleRemove = async (removeLotId: string) => {
    await releaseLot(supabasePublic, removeLotId, basket.basketId);
    basket.removeItem(removeLotId);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <button
            onClick={() => navigate(-1)}
            className="inline-flex items-center gap-2 px-3 py-2 text-gray-600 hover:text-gray-900 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </button>
          <h1 className="text-lg font-bold text-gray-900">Item Details</h1>
          <div className="w-12" />
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* Status banner so buyers aren't confused about availability */}
        {isEstate && !inMyBasket && eff !== "available" && (
          <div
            className={`mb-6 rounded-lg p-4 text-center font-semibold ${
              eff === "sold"
                ? "bg-gray-800 text-white"
                : "bg-amber-100 text-amber-900"
            }`}
          >
            {eff === "sold"
              ? "This item has been sold."
              : "This item is currently on hold."}
          </div>
        )}

        {/* Photos */}
        {allPhotos.length > 0 && (
          <div className="mb-8">
            <div className="bg-white rounded-lg overflow-hidden border border-gray-200">
              {primaryPhoto?.url && (
                <div className="mb-4">
                  <img
                    src={primaryPhoto.url}
                    alt={lot.name}
                    className="w-full h-auto max-h-96 object-cover"
                  />
                </div>
              )}

              {otherPhotos.length > 0 && (
                <div className="px-4 pb-4 flex gap-2 overflow-x-auto">
                  {otherPhotos
                    .slice(0, 5)
                    .map(
                      (photo) =>
                        photo.url && (
                          <img
                            key={photo.id}
                            src={photo.url}
                            alt="Thumbnail"
                            className="h-20 w-20 object-cover rounded border border-gray-200 flex-shrink-0 cursor-pointer hover:border-indigo-500 transition-colors"
                          />
                        ),
                    )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Item Details Card */}
        <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
          <div className="mb-6">
            <div className="flex items-center gap-3 mb-2">
              <span className="inline-block px-3 py-1 bg-indigo-100 text-indigo-800 rounded-full text-sm font-medium">
                Lot #{lot.lot_number}
              </span>
              {isEstate && (
                <span
                  className={`inline-block px-3 py-1 rounded-full text-sm font-medium ${
                    statusBadge[displayStatus] ?? statusBadge.available
                  }`}
                >
                  {statusText[displayStatus] ?? "Available"}
                </span>
              )}
              {lot.condition && (
                <span className="inline-block px-3 py-1 bg-green-100 text-green-800 rounded-full text-sm font-medium">
                  {lot.condition}
                </span>
              )}
            </div>
            <h2 className="text-3xl font-bold text-gray-900">{lot.name}</h2>
          </div>

          <div className="bg-indigo-50 rounded-lg p-4 mb-6 border border-indigo-200">
            <p className="text-sm text-indigo-600 font-medium mb-1">{priceLabel}</p>
            <p className="text-2xl font-bold text-indigo-900">
              {priceDisplay}
            </p>
          </div>

          {/* Buyer self-checkout: add to basket (estate sales only) */}
          {isEstate && (
            <div className="mb-6">
              {inMyBasket ? (
                <div className="rounded-lg border border-indigo-200 bg-indigo-50 p-4 text-center text-sm font-medium text-indigo-800">
                  In your basket — held for {HOLD_MINUTES} minutes.
                </div>
              ) : eff === "sold" ? null : eff === "held" ? (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-center text-sm font-medium text-amber-800">
                  On hold by another shopper.
                </div>
              ) : checkoutOpen ? (
                <>
                  <button
                    onClick={handleAdd}
                    disabled={adding}
                    className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 bg-indigo-600 text-white rounded-md font-semibold hover:bg-indigo-700 disabled:bg-gray-200 disabled:text-gray-400"
                  >
                    <ShoppingBasket className="w-5 h-5" />
                    {adding ? "Adding…" : "Add to Basket"}
                  </button>
                  <p className="mt-2 text-center text-xs text-gray-500">
                    Held while you keep shopping. If you leave without paying, the hold
                    is released about {HOLD_MINUTES} minutes later and the item returns to the sale.
                  </p>
                  {addError && (
                    <p className="mt-2 text-center text-sm text-red-600">{addError}</p>
                  )}
                </>
              ) : (
                <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-center text-sm text-gray-600">
                  {checkoutEnabled && checkoutOpensAt
                    ? `Online purchasing opens ${new Date(checkoutOpensAt).toLocaleString()}.`
                    : "This item is available to purchase in person at the sale."}
                </div>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
            {lot.category && (
              <div>
                <p className="text-sm text-gray-600 font-medium mb-1">
                  Category
                </p>
                <p className="text-gray-900">{lot.category}</p>
              </div>
            )}
            {lot.origin && (
              <div>
                <p className="text-sm text-gray-600 font-medium mb-1">Origin</p>
                <p className="text-gray-900">{lot.origin}</p>
              </div>
            )}
            {lot.creator && (
              <div>
                <p className="text-sm text-gray-600 font-medium mb-1">
                  Creator/Artist
                </p>
                <p className="text-gray-900">{lot.creator}</p>
              </div>
            )}
            {lot.materials && (
              <div>
                <p className="text-sm text-gray-600 font-medium mb-1">
                  Materials
                </p>
                <p className="text-gray-900">{lot.materials}</p>
              </div>
            )}
            {lot.style && (
              <div>
                <p className="text-sm text-gray-600 font-medium mb-1">Style</p>
                <p className="text-gray-900">{lot.style}</p>
              </div>
            )}
            {lot.quantity && lot.quantity > 1 && (
              <div>
                <p className="text-sm text-gray-600 font-medium mb-1">
                  Quantity
                </p>
                <p className="text-gray-900">{lot.quantity}</p>
              </div>
            )}
          </div>

          {(lot.height || lot.width || lot.depth) && (
            <div className="mb-6">
              <p className="text-sm text-gray-600 font-medium mb-3">
                Dimensions
              </p>
              <div className="flex gap-4 text-gray-900">
                {lot.height && <span>H: {lot.height}"</span>}
                {lot.width && <span>W: {lot.width}"</span>}
                {lot.depth && <span>D: {lot.depth}"</span>}
              </div>
            </div>
          )}

          {lot.description && (
            <div>
              <p className="text-sm text-gray-600 font-medium mb-3">
                Description
              </p>
              <p className="text-gray-700 whitespace-pre-wrap">
                {lot.description}
              </p>
            </div>
          )}
        </div>

        {saleId && lotId && (
          <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6 flex flex-col items-center">
            <p className="text-sm text-gray-600 font-medium mb-3">
              Scan or share this item
            </p>
            <LotQRCode saleId={saleId} lotId={lotId} size={160} className="rounded" />
          </div>
        )}

        <div className="text-center text-sm text-gray-500 py-4">
          For questions about this item, contact the auctioneer.
        </div>
      </div>

      {isEstate && (
        <BuyerBasket items={basket.items} total={basket.total} onRemove={handleRemove} />
      )}
    </div>
  );
}
