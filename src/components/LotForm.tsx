// src/components/LotForm.tsx
// UPDATED: Added Print Label button for QR code printing

import { memo, useCallback } from "react";
import { Sparkles, Printer } from "lucide-react";
import { printLabelViaBrowser } from "../lib/printing";
import LAAutocomplete from "./LAAutocomplete";
import { toTitleCase } from "../utils/titleCase";
import {
  getLACategories,
  getLAOrigins,
  getLAStyles,
  getLACreators,
  getLAMaterials,
} from "../services/LiveAuctioneersData";
import type { Lot, Consignment, Contact, SaleRoom } from "../types";
import { MAX_LOCATION, formatZone, parseZone } from "../lib/roomCodes";
import { formatContactName } from "../utils/contactName";

interface LotFormProps {
  lot: Partial<Lot>;
  onChange: (lot: Partial<Lot>) => void;
  isOnline: boolean;
  isNewLot: boolean;
  hasPhotos: boolean;
  saving: boolean;
  onAIEnrich: () => void;
  /** Estate sales: opens the Niimbot tag printer in place of the 4x6 browser label. */
  onPrintTag?: () => void;
  // True while the AI Detail Editor is researching (it can take ~30s)
  aiBusy?: boolean;
  // Auction lifecycle (#2): consignor assignment source. Optional so other callers
  // of LotForm keep working.
  consignments?: Consignment[];
  contacts?: Contact[];
  /** Estate sales: the sale room list. When given, the form shows Room / Location. */
  rooms?: SaleRoom[];
}

const formatPrice = (value: number | undefined | null): string => {
  if (value === null || value === undefined) return "";
  return value.toString();
};

function LotForm({
  lot,
  onChange,
  isOnline,
  isNewLot,
  hasPhotos,
  saving,
  onAIEnrich,
  onPrintTag,
  aiBusy,
  consignments,
  contacts,
  rooms,
}: LotFormProps) {
  const updateField = useCallback(
    <K extends keyof Lot>(field: K, value: Lot[K]) => {
      onChange({ ...lot, [field]: value });
    },
    [lot, onChange],
  );

  const handleNumberChange = useCallback(
    (field: keyof Lot) => (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = e.target.value;
      updateField(field, val === "" ? undefined : parseFloat(val));
    },
    [updateField],
  );

  const handleQuantityBlur = useCallback(() => {
    if (!lot.quantity) updateField("quantity", 1);
  }, [lot.quantity, updateField]);

  const handleNameBlur = useCallback(
    (e: React.FocusEvent<HTMLInputElement>) => {
      const value = e.target.value;
      if (value) {
        updateField("name", toTitleCase(value));
      }
    },
    [updateField],
  );

  const handlePrintLabel = useCallback(() => {
    printLabelViaBrowser({
      lotNumber: lot.lot_number || 0,
      lotName: lot.name || "Untitled",
      price: lot.buy_now_price,
      qrCodeUrl: lot.qr_code_url,
    });
  }, [lot.lot_number, lot.name, lot.buy_now_price, lot.qr_code_url]);

  return (
    <div className="bg-white rounded-lg shadow-sm p-6">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-4">
        <h2 className="text-lg font-semibold text-gray-900">Item Details</h2>
        <div className="flex gap-2 flex-wrap">
          {hasPhotos && isOnline && !isNewLot && (
            <>
              <button
                onClick={onAIEnrich}
                disabled={saving}
                className="flex items-center gap-2 px-3 py-1.5 bg-gradient-to-r from-indigo-500 to-purple-500 text-white text-sm font-medium rounded-lg hover:from-indigo-600 hover:to-purple-600 disabled:opacity-50 transition-all shadow-sm"
                title="Use AI to research the item and fill in its details"
              >
                <Sparkles className={`w-4 h-4 ${aiBusy ? "animate-pulse" : ""}`} />
                {aiBusy ? "Researching…" : "AI Detail Editor"}
              </button>

              {/* Print Label Button (auctions: 4x6 sheet via the browser) */}
              {!onPrintTag && (
              <button
                onClick={handlePrintLabel}
                disabled={saving || !lot.qr_code_url}
                className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm"
                title={
                  lot.qr_code_url
                    ? "Print 4x6 label with QR code"
                    : "Save lot first to generate QR code"
                }
              >
                <Printer className="w-4 h-4" />
                Print Label
              </button>
              )}
            </>
          )}
          {/* Estate sales: Niimbot B1 tag (same as the footer's Print tag) */}
          {onPrintTag && !isNewLot && (
            <button
              onClick={onPrintTag}
              disabled={saving}
              className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm"
              title="Print a price tag on the Niimbot B1"
            >
              <Printer className="w-4 h-4" />
              Print tag
            </button>
          )}
        </div>
      </div>

      <div className="space-y-6">
        {/* Basic Info */}
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Item Name *
            </label>
            <input
              type="text"
              value={lot.name || ""}
              onChange={(e) => updateField("name", e.target.value)}
              onBlur={handleNameBlur}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-600"
              placeholder="e.g., Victorian Oak Dining Table"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Description
            </label>
            <textarea
              value={lot.description || ""}
              onChange={(e) => updateField("description", e.target.value)}
              rows={4}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-600"
              placeholder="Detailed description including condition, provenance, and notable features..."
            />
          </div>

          {/* Estate sales: where the item is (room + location from the flip charts). */}
          {rooms && (
            <RoomLocationFields lot={lot} rooms={rooms} onChange={onChange} />
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Condition
              </label>
              <select
                value={lot.condition || ""}
                onChange={(e) => updateField("condition", e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-600"
              >
                <option value="">Select condition</option>
                <option value="Excellent">Excellent</option>
                <option value="Very Good">Very Good</option>
                <option value="Good">Good</option>
                <option value="Fair">Fair</option>
                <option value="Poor">Poor</option>
                <option value="As Is">As Is</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Quantity
              </label>
              <input
                type="number"
                value={lot.quantity ?? ""}
                onChange={(e) =>
                  updateField(
                    "quantity",
                    e.target.value === ""
                      ? undefined
                      : parseInt(e.target.value),
                  )
                }
                onBlur={handleQuantityBlur}
                min="1"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-600"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <LAAutocomplete
              label="Category"
              value={lot.category || ""}
              onChange={(value) => updateField("category", value)}
              items={getLACategories()}
              placeholder="Search categories..."
            />
            <LAAutocomplete
              label="Style/Period"
              value={lot.style || ""}
              onChange={(value) => updateField("style", value)}
              items={getLAStyles()}
              placeholder="Search styles..."
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Condition Report
            </label>
            <textarea
              value={lot.condition_report || ""}
              onChange={(e) => updateField("condition_report", e.target.value)}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-600"
              placeholder="Detailed condition: wear, damage, repairs, provenance notes buyers rely on..."
            />
          </div>
        </div>

        {/* Pricing */}
        <div className="space-y-4 mt-6">
          <h2 className="text-lg font-semibold text-gray-900">Pricing</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Low Estimate ($)
              </label>
              <input
                type="number"
                value={formatPrice(lot.estimate_low)}
                onChange={handleNumberChange("estimate_low")}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-600"
                placeholder="100"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                High Estimate ($)
              </label>
              <input
                type="number"
                value={formatPrice(lot.estimate_high)}
                onChange={handleNumberChange("estimate_high")}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-600"
                placeholder="200"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Starting Bid ($)
              </label>
              <input
                type="number"
                value={formatPrice(lot.starting_bid)}
                onChange={handleNumberChange("starting_bid")}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-600"
                placeholder="50"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Reserve Price ($)
              </label>
              <input
                type="number"
                value={formatPrice(lot.reserve_price)}
                onChange={handleNumberChange("reserve_price")}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-600"
                placeholder="75"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Buy Now Price ($)
              </label>
              <input
                type="number"
                value={formatPrice(lot.buy_now_price)}
                onChange={handleNumberChange("buy_now_price")}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-600"
                placeholder="250"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Sold Price ($)
              </label>
              <input
                type="number"
                value={formatPrice(lot.sold_price)}
                onChange={handleNumberChange("sold_price")}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-600"
                placeholder="Final hammer price"
              />
            </div>
          </div>
        </div>

        {/* Dimensions */}
        <div className="space-y-4 mt-6">
          <h2 className="text-lg font-semibold text-gray-900">
            Dimensions & Weight
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Height (in)
              </label>
              <input
                type="number"
                value={formatPrice(lot.height)}
                onChange={handleNumberChange("height")}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-600"
                placeholder="24"
                step="0.1"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Width (in)
              </label>
              <input
                type="number"
                value={formatPrice(lot.width)}
                onChange={handleNumberChange("width")}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-600"
                placeholder="36"
                step="0.1"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Depth (in)
              </label>
              <input
                type="number"
                value={formatPrice(lot.depth)}
                onChange={handleNumberChange("depth")}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-600"
                placeholder="18"
                step="0.1"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Weight (lbs)
              </label>
              <input
                type="number"
                value={formatPrice(lot.weight)}
                onChange={handleNumberChange("weight")}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-600"
                placeholder="50"
                step="0.1"
              />
            </div>
          </div>
        </div>

        {/* Provenance */}
        <div className="space-y-4 mt-6">
          <h2 className="text-lg font-semibold text-gray-900">Provenance</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <LAAutocomplete
              label="Origin"
              value={lot.origin || ""}
              onChange={(value) => updateField("origin", value)}
              items={getLAOrigins()}
              placeholder="Search origins..."
            />
            <LAAutocomplete
              label="Creator/Maker"
              value={lot.creator || ""}
              onChange={(value) => updateField("creator", value)}
              items={getLACreators()}
              placeholder="Search creators..."
            />
            <LAAutocomplete
              label="Materials"
              value={lot.materials || ""}
              onChange={(value) => updateField("materials", value)}
              items={getLAMaterials()}
              placeholder="Search materials..."
            />
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Consignor
              </label>
              <select
                value={lot.consignment_id || ""}
                onChange={(e) =>
                  updateField("consignment_id", e.target.value || undefined)
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-600"
              >
                <option value="">Unassigned</option>
                {(consignments || []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {formatContactName(
                      (contacts || []).find((ct) => ct.id === c.contact_id),
                    )}
                  </option>
                ))}
              </select>
              {(!consignments || consignments.length === 0) && (
                <p className="text-xs text-amber-600 mt-1">
                  Add consignors in the sale's Setup tab to assign here.
                </p>
              )}
            </div>
          </div>

          {/* Compliance */}
          <div className="mt-2">
            <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
              <input
                type="checkbox"
                checked={!!lot.is_restricted}
                onChange={(e) => updateField("is_restricted", e.target.checked)}
                className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-600"
              />
              Restricted / regulated item (ivory, firearm, hazmat, etc.)
            </label>
            {lot.is_restricted && (
              <input
                type="text"
                value={lot.restricted_category || ""}
                onChange={(e) =>
                  updateField("restricted_category", e.target.value)
                }
                className="mt-2 w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-600"
                placeholder="Restriction type / notes"
              />
            )}
          </div>
        </div>

        {/* Buyer — captured from the LiveAuctioneers EOA import (read-only) */}
        {lot.buyer && (lot.buyer.name || lot.buyer.email || lot.buyer.phone || lot.buyer.address) && (
          <div className="space-y-4 mt-6">
            <h2 className="text-lg font-semibold text-gray-900">Buyer</h2>
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm space-y-1">
              {lot.buyer.name && (
                <div className="font-medium text-gray-900">
                  {lot.buyer.name}
                  {lot.buyer.username ? ` (${lot.buyer.username})` : ""}
                </div>
              )}
              {lot.buyer.email && <div className="text-gray-700">{lot.buyer.email}</div>}
              {lot.buyer.phone && <div className="text-gray-700">{lot.buyer.phone}</div>}
              {(lot.buyer.address || lot.buyer.city) && (
                <div className="text-gray-700">
                  {[
                    lot.buyer.address,
                    [lot.buyer.city, lot.buyer.state, lot.buyer.zip].filter(Boolean).join(" "),
                  ]
                    .filter(Boolean)
                    .join(", ")}
                  {lot.buyer.country && lot.buyer.country !== "US" ? ` ${lot.buyer.country}` : ""}
                </div>
              )}
              {(lot.la_invoice_id || lot.buyers_premium != null) && (
                <div className="text-xs text-gray-500 pt-1">
                  {lot.la_invoice_id && <span>Invoice {lot.la_invoice_id}</span>}
                  {lot.la_invoice_id && lot.buyers_premium != null ? " · " : ""}
                  {lot.buyers_premium != null && (
                    <span>Buyer&apos;s premium ${lot.buyers_premium.toLocaleString()}</span>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default memo(LotForm);

// Room picker + location number (1-20) -> lots.room and lots.zone ("BD02-5"),
// plus the needs-detail-photo flag that room capture sets.
function RoomLocationFields({
  lot,
  rooms,
  onChange,
}: {
  lot: Partial<Lot>;
  rooms: SaleRoom[];
  onChange: (lot: Partial<Lot>) => void;
}) {
  const room = lot.room ?? parseZone(lot.zone)?.room ?? "";
  const location = parseZone(lot.zone)?.location;
  // Keep a room the lot already has even if it is no longer in the list.
  const options = room && !rooms.some((r) => r.room_code === room)
    ? [...rooms, { id: room, room_code: room, name: "(not in this sale’s room list)" } as SaleRoom]
    : rooms;

  const setRoom = (code: string) =>
    onChange({ ...lot, room: code || null, zone: code ? formatZone(code, location) : null });
  const setLocation = (value: string) => {
    const n = value === "" ? undefined : parseInt(value, 10);
    onChange({ ...lot, room: room || null, zone: room ? formatZone(room, n) : null });
  };

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
      <div className="col-span-2 md:col-span-1">
        <label className="block text-sm font-medium text-gray-700 mb-1">Room</label>
        <select
          value={room}
          onChange={(e) => setRoom(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-600"
        >
          <option value="">{rooms.length ? "No room" : "No rooms yet (Items tab → Rooms)"}</option>
          {options.map((r) => (
            <option key={r.room_code} value={r.room_code}>
              {r.room_code} — {r.name}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Location</label>
        <input
          type="number"
          inputMode="numeric"
          min={1}
          max={MAX_LOCATION}
          value={location ?? ""}
          onChange={(e) => setLocation(e.target.value)}
          disabled={!room}
          placeholder={room ? "1–20" : "Pick a room"}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-600 disabled:bg-gray-50"
        />
        {lot.zone && <p className="mt-1 text-xs font-mono text-indigo-700">{lot.zone}</p>}
      </div>
      <label className="flex items-center gap-2 text-sm text-gray-700 md:mt-7">
        <input
          type="checkbox"
          checked={!!lot.needs_detail}
          onChange={(e) => onChange({ ...lot, needs_detail: e.target.checked })}
        />
        Needs a detail photo
      </label>
    </div>
  );
}
