import React, { useState, useEffect } from 'react';
import type { Sale } from '../types';
import { toTitleCase } from '../utils/titleCase';
import { supabase } from '../lib/supabase';
import { X } from 'lucide-react';

interface SaleModalProps {
  sale: Sale | null;
  companyId: string;
  onClose: () => void;
  onSave: () => void;
}

// Convert a stored ISO timestamp to the value a datetime-local input expects
// ('YYYY-MM-DDTHH:mm' in local time). Returns '' for null/undefined.
function isoToLocalInput(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

// Convert a datetime-local value back to an ISO timestamp, or null if blank.
function localInputToIso(value: string): string | null {
  if (!value) return null;
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

export default function SaleModal({ sale, companyId, onClose, onSave }: SaleModalProps) {
  const [name, setName] = useState('');
  const [date, setDate] = useState('');
  const [location, setLocation] = useState('');
  const [status, setStatus] = useState<Sale['status']>('upcoming');
  // New sales default to the estate-sale path (the priority business).
  const [saleType, setSaleType] = useState<NonNullable<Sale['sale_type']>>('estate_sale');
  const [onlineCheckoutEnabled, setOnlineCheckoutEnabled] = useState(false);
  // datetime-local value ('YYYY-MM-DDTHH:mm'); blank = opens immediately.
  const [onlineOpensAt, setOnlineOpensAt] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (sale) {
      setName(sale.name);
      setDate(sale.start_date || '');
      setLocation(sale.location || '');
      setStatus(sale.status);
      setSaleType(sale.sale_type ?? 'auction'); // legacy sales are auctions
      setOnlineCheckoutEnabled(sale.online_checkout_enabled ?? false);
      setOnlineOpensAt(isoToLocalInput(sale.online_checkout_opens_at));
    }
  }, [sale]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    // Self-checkout settings only apply to estate sales.
    const isEstate = saleType === 'estate_sale';
    const checkoutEnabled = isEstate && onlineCheckoutEnabled;
    const salePayload = {
      name,
      start_date: date || null,
      location: location || null,
      status,
      sale_type: saleType,
      online_checkout_enabled: checkoutEnabled,
      online_checkout_opens_at: checkoutEnabled ? localInputToIso(onlineOpensAt) : null,
    };

    try {
      if (sale) {
        // Update existing sale
        const { error: updateError } = await supabase
          .from('sales')
          .update({
            ...salePayload,
            updated_at: new Date().toISOString(),
          })
          .eq('id', sale.id);

        if (updateError) throw updateError;
      } else {
        // Create new sale
        const { error: insertError } = await supabase
          .from('sales')
          .insert({
            company_id: companyId,
            ...salePayload,
          });

        if (insertError) throw insertError;
      }

      onSave();
    } catch (err: unknown) {
      console.error('Error saving sale:', err);
      setError(err instanceof Error ? err.message : 'Failed to save sale');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">
            {sale ? 'Edit Sale' : 'New Sale'}
          </h2>
          <button
            onClick={onClose}
            className="p-1 rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-all"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Error Message */}
        {error && (
          <div className="mx-6 mt-4 p-3 bg-red-50 text-red-600 rounded-md border border-red-200 text-sm">
            {error}
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
              Sale Name *
            </label>
            <input
              id="name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={() => setName(toTitleCase(name))}
              required
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:border-indigo-600 focus:ring-2 focus:ring-indigo-600 focus:ring-opacity-10 transition-all"
              placeholder="Spring Auction 2025"
            />
          </div>

          <div>
            <label htmlFor="saleType" className="block text-sm font-medium text-gray-700 mb-1">
              Sale Type *
            </label>
            <select
              id="saleType"
              value={saleType}
              onChange={(e) => setSaleType(e.target.value as NonNullable<Sale['sale_type']>)}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:border-indigo-600 focus:ring-2 focus:ring-indigo-600 focus:ring-opacity-10 transition-all"
            >
              <option value="estate_sale">Estate Sale</option>
              <option value="auction">Auction</option>
            </select>
          </div>

          <div>
            <label htmlFor="date" className="block text-sm font-medium text-gray-700 mb-1">
              Start Date
            </label>
            <input
              id="date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:border-indigo-600 focus:ring-2 focus:ring-indigo-600 focus:ring-opacity-10 transition-all"
            />
          </div>

          <div>
            <label htmlFor="location" className="block text-sm font-medium text-gray-700 mb-1">
              Location
            </label>
            <input
              id="location"
              type="text"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:border-indigo-600 focus:ring-2 focus:ring-indigo-600 focus:ring-opacity-10 transition-all"
              placeholder="123 Main St, City"
            />
          </div>

          <div>
            <label htmlFor="status" className="block text-sm font-medium text-gray-700 mb-1">
              Status
            </label>
            <select
              id="status"
              value={status}
              onChange={(e) => setStatus(e.target.value as Sale['status'])}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:border-indigo-600 focus:ring-2 focus:ring-indigo-600 focus:ring-opacity-10 transition-all"
            >
              <option value="upcoming">Upcoming</option>
              <option value="active">Active</option>
              <option value="completed">Completed</option>
            </select>
          </div>

          {/* Estate-sale buyer self-checkout (Square Mode 1) */}
          {saleType === 'estate_sale' && (
            <div className="rounded-md border border-gray-200 bg-gray-50 p-3 space-y-3">
              <label className="flex items-start gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={onlineCheckoutEnabled}
                  onChange={(e) => setOnlineCheckoutEnabled(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-600"
                />
                <span>
                  <span className="block text-sm font-medium text-gray-700">
                    Enable buyer self-checkout (online)
                  </span>
                  <span className="block text-xs text-gray-500">
                    Lets shoppers buy items by scanning the QR tag and paying with Square.
                  </span>
                </span>
              </label>

              {onlineCheckoutEnabled && (
                <div>
                  <label
                    htmlFor="onlineOpensAt"
                    className="block text-sm font-medium text-gray-700 mb-1"
                  >
                    Online checkout opens at
                  </label>
                  <input
                    id="onlineOpensAt"
                    type="datetime-local"
                    value={onlineOpensAt}
                    onChange={(e) => setOnlineOpensAt(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:border-indigo-600 focus:ring-2 focus:ring-indigo-600 focus:ring-opacity-10 transition-all"
                  />
                  <p className="mt-1 text-xs text-gray-500">
                    Leave blank to open immediately. Set a later time to give in-person
                    shoppers first pick before online buyers can purchase.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Footer Buttons */}
          <div className="flex items-center justify-end gap-2 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 shadow-sm transition-all"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-md hover:bg-indigo-700 disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed shadow-sm transition-all"
            >
              {loading ? 'Saving...' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}