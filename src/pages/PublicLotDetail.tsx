import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { createClient } from "@supabase/supabase-js";
import { ArrowLeft } from "lucide-react";
import type { Lot } from "../types/auction";

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
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

      const { data: photoData, error: photoError } = await supabasePublic
        .from("photos")
        .select("*")
        .eq("lot_id", lotId)
        .order("is_primary", { ascending: false })
        .order("created_at", { ascending: true });

      if (!photoError && photoData) {
        const photosWithUrls = await Promise.all(
          photoData.map(async (photo: Photo) => {
            const { data } = await supabasePublic.storage
              .from("photos")
              .createSignedUrl(photo.file_path, 3600);
            return {
              ...photo,
              url: data?.signedUrl || undefined,
            };
          }),
        );
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

  const estimateDisplay =
    lot.estimate_low && lot.estimate_high
      ? `$${lot.estimate_low.toLocaleString()}-$${lot.estimate_high.toLocaleString()}`
      : lot.opening_bid
        ? `$${lot.opening_bid.toLocaleString()} (Opening Bid)`
        : "Price TBD";

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
              {lot.condition && (
                <span className="inline-block px-3 py-1 bg-green-100 text-green-800 rounded-full text-sm font-medium">
                  {lot.condition}
                </span>
              )}
            </div>
            <h2 className="text-3xl font-bold text-gray-900">{lot.name}</h2>
          </div>

          <div className="bg-indigo-50 rounded-lg p-4 mb-6 border border-indigo-200">
            <p className="text-sm text-indigo-600 font-medium mb-1">Estimate</p>
            <p className="text-2xl font-bold text-indigo-900">
              {estimateDisplay}
            </p>
          </div>

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

        <div className="text-center text-sm text-gray-500 py-4">
          For questions about this item, contact the auctioneer.
        </div>
      </div>
    </div>
  );
}
