/**
 * src/lib/PublicLotPage.tsx
 * Public lot page component
 * Displays lot details, photos, and contact form
 * This is what buyers see when they scan a QR code
 */

"use client";

import React, { useEffect, useState, useMemo } from "react";
import { createClient } from "@supabase/supabase-js";

interface Photo {
  id: string;
  file_path: string;
  public_url: string;
  caption?: string;
  sort_order: number;
}

interface Lot {
  id: string;
  lot_number: number;
  name: string;
  description?: string;
  condition?: string;
  category?: string;
  style?: string;
  materials?: string;
  origin?: string;
  height?: number;
  width?: number;
  depth?: number;
  dimension_unit?: string;
  buy_now_price?: number;
  qr_code_url?: string;
  photos: Photo[];
}

interface Sale {
  id: string;
  name: string;
  start_date?: string;
  location?: string;
}

interface PublicLotPageProps {
  saleId: string;
  lotNumber: number;
}

export function PublicLotPage({ saleId, lotNumber }: PublicLotPageProps) {
  const [lot, setLot] = useState<Lot | null>(null);
  const [sale, setSale] = useState<Sale | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentPhotoIndex, setCurrentPhotoIndex] = useState(0);
  const [contactForm, setContactForm] = useState({
    name: "",
    email: "",
    message: "",
    sending: false,
    sent: false,
    error: false,
  });

  // Memoize supabase client to avoid dependency issues
  const supabase = useMemo(
    () =>
      createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      ),
    [],
  );

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);

        // Fetch sale info
        const { data: saleData, error: saleError } = await supabase
          .from("sales")
          .select("id, name, start_date, location")
          .eq("id", saleId)
          .single();

        if (saleError) throw new Error("Sale not found");
        setSale(saleData);

        // Fetch lot with photos
        const { data: lotData, error: lotError } = await supabase
          .from("lots")
          .select(
            `
            id,
            lot_number,
            name,
            description,
            condition,
            category,
            style,
            materials,
            origin,
            height,
            width,
            depth,
            dimension_unit,
            buy_now_price,
            qr_code_url,
            photos (
              id,
              file_path,
              public_url,
              caption,
              sort_order
            )
          `,
          )
          .eq("sale_id", saleId)
          .eq("lot_number", lotNumber)
          .single();

        if (lotError) throw new Error("Item not found");

        // Sort photos by sort_order
        const sortedPhotos = (lotData.photos || []).sort(
          (a: Photo, b: Photo) => a.sort_order - b.sort_order,
        );

        setLot({ ...lotData, photos: sortedPhotos });
        setError(null);
      } catch (err) {
        console.error("Error fetching lot:", err);
        setError(err instanceof Error ? err.message : "Failed to load item");
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [saleId, lotNumber, supabase]);

  const handleContactSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    setContactForm({ ...contactForm, sending: true, error: false });

    try {
      const response = await fetch("/api/send-question", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lot_number: lotNumber,
          lot_name: lot?.name,
          sale_id: saleId,
          customer_name: contactForm.name,
          customer_email: contactForm.email,
          message: contactForm.message,
        }),
      });

      if (response.ok) {
        setContactForm({
          name: "",
          email: "",
          message: "",
          sending: false,
          sent: true,
          error: false,
        });
        // Clear success message after 3 seconds
        setTimeout(() => {
          setContactForm((prev) => ({ ...prev, sent: false }));
        }, 3000);
      } else {
        setContactForm((prev) => ({ ...prev, error: true }));
      }
    } catch (error) {
      console.error("Error sending message:", error);
      setContactForm((prev) => ({ ...prev, error: true }));
    } finally {
      setContactForm((prev) => ({ ...prev, sending: false }));
    }
  };

  // Loading state
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
          <p className="mt-4 text-gray-600">Loading item...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error || !lot) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="text-center max-w-md">
          <h1 className="text-2xl font-bold text-gray-900">Item not found</h1>
          <p className="mt-2 text-gray-600">
            {error || "This item may no longer be available"}
          </p>
        </div>
      </div>
    );
  }

  const primaryPhoto =
    lot.photos && lot.photos.length > 0 ? lot.photos[0] : null;
  const hasMultiplePhotos = lot.photos && lot.photos.length > 1;

  return (
    <div className="bg-white">
      {/* Header */}
      <div className="border-b border-gray-200 bg-gray-50 px-4 py-6 sm:px-6">
        <div className="max-w-4xl mx-auto">
          <p className="text-sm text-gray-600">
            {sale?.name}
            {sale?.start_date &&
              ` • ${new Date(sale.start_date).toLocaleDateString()}`}
            {sale?.location && ` • ${sale.location}`}
          </p>
          <h1 className="text-3xl font-bold text-gray-900 mt-2">{lot.name}</h1>
          <p className="text-sm text-gray-600 mt-1">Item #{lot.lot_number}</p>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {/* Photos Section */}
          <div className="md:col-span-2">
            {primaryPhoto ? (
              <div>
                {/* Main Photo */}
                <div className="relative w-full bg-gray-100 rounded-lg overflow-hidden mb-4">
                  <img
                    src={lot.photos[currentPhotoIndex].public_url}
                    alt={`${lot.name} photo ${currentPhotoIndex + 1}`}
                    className="w-full h-auto"
                  />
                  {hasMultiplePhotos && (
                    <div className="absolute bottom-4 right-4 bg-black bg-opacity-60 text-white px-3 py-1 rounded text-sm font-medium">
                      {currentPhotoIndex + 1} / {lot.photos.length}
                    </div>
                  )}
                </div>

                {/* Photo Navigation Thumbnails */}
                {hasMultiplePhotos && (
                  <div className="flex gap-2 overflow-x-auto pb-2">
                    {lot.photos.map((photo, idx) => (
                      <button
                        key={photo.id}
                        onClick={() => setCurrentPhotoIndex(idx)}
                        className={`relative flex-shrink-0 w-16 h-16 rounded overflow-hidden border-2 transition ${
                          currentPhotoIndex === idx
                            ? "border-blue-600 ring-2 ring-blue-400"
                            : "border-gray-300 hover:border-gray-400"
                        }`}
                        aria-label={`View photo ${idx + 1}`}
                      >
                        <img
                          src={photo.public_url}
                          alt={`Thumbnail ${idx + 1}`}
                          className="w-full h-full object-cover"
                        />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="w-full bg-gray-100 rounded-lg h-96 flex items-center justify-center">
                <p className="text-gray-400">No photos available</p>
              </div>
            )}
          </div>

          {/* Details Section (Right Column) */}
          <div className="md:col-span-1">
            {/* Price */}
            {lot.buy_now_price && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
                <p className="text-sm text-gray-600 font-medium">Price</p>
                <p className="text-4xl font-bold text-blue-600 mt-1">
                  ${lot.buy_now_price.toFixed(2)}
                </p>
              </div>
            )}

            {/* Item Details */}
            <div className="space-y-4 mb-6">
              {lot.category && (
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    Category
                  </p>
                  <p className="text-sm text-gray-900 mt-1">{lot.category}</p>
                </div>
              )}

              {lot.style && (
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    Style
                  </p>
                  <p className="text-sm text-gray-900 mt-1">{lot.style}</p>
                </div>
              )}

              {lot.origin && (
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    Origin
                  </p>
                  <p className="text-sm text-gray-900 mt-1">{lot.origin}</p>
                </div>
              )}

              {lot.materials && (
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    Materials
                  </p>
                  <p className="text-sm text-gray-900 mt-1">{lot.materials}</p>
                </div>
              )}
            </div>

            {/* Dimensions */}
            {(lot.height || lot.width || lot.depth) && (
              <div className="bg-gray-50 rounded-lg p-4 mb-6">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
                  Dimensions
                </p>
                <div className="text-sm text-gray-700 space-y-2">
                  {lot.height && (
                    <p>
                      Height:{" "}
                      <span className="font-semibold">{lot.height}"</span>
                    </p>
                  )}
                  {lot.width && (
                    <p>
                      Width: <span className="font-semibold">{lot.width}"</span>
                    </p>
                  )}
                  {lot.depth && (
                    <p>
                      Depth: <span className="font-semibold">{lot.depth}"</span>
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Call to Action */}
            <a
              href="#contact-form"
              className="w-full block bg-blue-600 text-white py-3 px-4 rounded-lg font-semibold hover:bg-blue-700 transition text-center"
            >
              Ask a Question
            </a>
          </div>
        </div>

        {/* Description & Condition (Full Width) */}
        {(lot.description || lot.condition) && (
          <div className="mt-12 grid grid-cols-1 md:grid-cols-2 gap-8">
            {lot.description && (
              <div>
                <h2 className="text-lg font-semibold text-gray-900 mb-4">
                  Description
                </h2>
                <p className="text-gray-700 leading-relaxed whitespace-pre-wrap">
                  {lot.description}
                </p>
              </div>
            )}

            {lot.condition && (
              <div>
                <h2 className="text-lg font-semibold text-gray-900 mb-4">
                  Condition
                </h2>
                <p className="text-gray-700 leading-relaxed whitespace-pre-wrap">
                  {lot.condition}
                </p>
              </div>
            )}
          </div>
        )}

        {/* Contact Form */}
        <div
          id="contact-form"
          className="mt-16 max-w-2xl border-t border-gray-200 pt-12"
        >
          <h2 className="text-2xl font-bold text-gray-900 mb-6">
            Have a Question?
          </h2>

          {contactForm.sent && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6 text-green-800">
              <p className="font-medium">✓ Message sent!</p>
              <p className="text-sm mt-1">We'll get back to you soon.</p>
            </div>
          )}

          {contactForm.error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6 text-red-800">
              <p className="font-medium">✕ Error sending message</p>
              <p className="text-sm mt-1">
                Please try again or email us directly.
              </p>
            </div>
          )}

          <form onSubmit={handleContactSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-gray-900 mb-2">
                Name
              </label>
              <input
                type="text"
                required
                value={contactForm.name}
                onChange={(e) =>
                  setContactForm({ ...contactForm, name: e.target.value })
                }
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-600 focus:border-transparent outline-none"
                placeholder="Your name"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-900 mb-2">
                Email
              </label>
              <input
                type="email"
                required
                value={contactForm.email}
                onChange={(e) =>
                  setContactForm({ ...contactForm, email: e.target.value })
                }
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-600 focus:border-transparent outline-none"
                placeholder="your@email.com"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-900 mb-2">
                Message
              </label>
              <textarea
                required
                value={contactForm.message}
                onChange={(e) =>
                  setContactForm({ ...contactForm, message: e.target.value })
                }
                rows={4}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-600 focus:border-transparent outline-none"
                placeholder="Your question about this item..."
              />
            </div>

            <button
              type="submit"
              disabled={contactForm.sending}
              className="bg-blue-600 text-white py-2 px-6 rounded-lg font-semibold hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {contactForm.sending ? "Sending..." : "Send Message"}
            </button>
          </form>

          <p className="text-sm text-gray-600 mt-6 pt-6 border-t border-gray-200">
            Or email us directly at:{" "}
            <a
              href="mailto:info@bensonestatesales.com"
              className="text-blue-600 hover:underline font-medium"
            >
              info@bensonestatesales.com
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
