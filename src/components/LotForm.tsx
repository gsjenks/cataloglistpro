// src/components/LotForm.tsx
import { memo, useCallback } from 'react';
import { Sparkles } from 'lucide-react';
import LAAutocomplete from './LAAutocomplete';
import { toTitleCase } from '../utils/titleCase';
import {
  getLACategories,
  getLAOrigins,
  getLAStyles,
  getLACreators,
  getLAMaterials
} from '../services/LiveAuctioneersData';
import type { Lot } from '../types';

interface LotFormProps {
  lot: Partial<Lot>;
  onChange: (lot: Partial<Lot>) => void;
  isOnline: boolean;
  isNewLot: boolean;
  hasPhotos: boolean;
  saving: boolean;
  onAIEnrich: () => void;
}

const formatPrice = (value: number | undefined | null): string => {
  if (value === null || value === undefined) return '';
  return value.toString();
};

function LotForm({
  lot,
  onChange,
  isOnline,
  isNewLot,
  hasPhotos,
  saving,
  onAIEnrich
}: LotFormProps) {
  const updateField = useCallback(<K extends keyof Lot>(field: K, value: Lot[K]) => {
    onChange({ ...lot, [field]: value });
  }, [lot, onChange]);

  const handleNumberChange = useCallback((field: keyof Lot) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    updateField(field, val === '' ? undefined : parseFloat(val));
  }, [updateField]);

  const handleQuantityBlur = useCallback(() => {
    if (!lot.quantity) updateField('quantity', 1);
  }, [lot.quantity, updateField]);

  const handleNameBlur = useCallback((e: React.FocusEvent<HTMLInputElement>) => {
    const value = e.target.value;
    if (value) {
      updateField('name', toTitleCase(value));
    }
  }, [updateField]);

  return (
    <div className="bg-white rounded-lg shadow-sm p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-900">Item Details</h2>
        {hasPhotos && isOnline && !isNewLot && (
          <button
            onClick={onAIEnrich}
            disabled={saving}
            className="flex items-center gap-2 px-3 py-1.5 bg-gradient-to-r from-indigo-500 to-purple-500 text-white text-sm font-medium rounded-lg hover:from-indigo-600 hover:to-purple-600 disabled:opacity-50 transition-all shadow-sm"
          >
            <Sparkles className="w-4 h-4" />
            AI Detail Editor
          </button>
        )}
      </div>

      <div className="space-y-6">
        {/* Basic Info */}
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Item Name *</label>
            <input
              type="text"
              value={lot.name || ''}
              onChange={(e) => updateField('name', e.target.value)}
              onBlur={handleNameBlur}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-600"
              placeholder="e.g., Victorian Oak Dining Table"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <textarea
              value={lot.description || ''}
              onChange={(e) => updateField('description', e.target.value)}
              rows={4}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-600"
              placeholder="Detailed description including condition, provenance, and notable features..."
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Condition</label>
              <select
                value={lot.condition || ''}
                onChange={(e) => updateField('condition', e.target.value)}
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
              <label className="block text-sm font-medium text-gray-700 mb-1">Quantity</label>
              <input
                type="number"
                value={lot.quantity ?? ''}
                onChange={(e) => updateField('quantity', e.target.value === '' ? undefined : parseInt(e.target.value))}
                onBlur={handleQuantityBlur}
                min="1"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-600"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <LAAutocomplete
              label="Category"
              value={lot.category || ''}
              onChange={(value) => updateField('category', value)}
              items={getLACategories()}
              placeholder="Search categories..."
            />
            <LAAutocomplete
              label="Style/Period"
              value={lot.style || ''}
              onChange={(value) => updateField('style', value)}
              items={getLAStyles()}
              placeholder="Search styles..."
            />
          </div>
        </div>

        {/* Pricing */}
        <div className="space-y-4 mt-6">
          <h2 className="text-lg font-semibold text-gray-900">Pricing</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Low Estimate ($)</label>
              <input
                type="number"
                value={formatPrice(lot.estimate_low)}
                onChange={handleNumberChange('estimate_low')}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-600"
                placeholder="100"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">High Estimate ($)</label>
              <input
                type="number"
                value={formatPrice(lot.estimate_high)}
                onChange={handleNumberChange('estimate_high')}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-600"
                placeholder="200"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Starting Bid ($)</label>
              <input
                type="number"
                value={formatPrice(lot.starting_bid)}
                onChange={handleNumberChange('starting_bid')}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-600"
                placeholder="50"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Reserve Price ($)</label>
              <input
                type="number"
                value={formatPrice(lot.reserve_price)}
                onChange={handleNumberChange('reserve_price')}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-600"
                placeholder="75"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Buy Now Price ($)</label>
              <input
                type="number"
                value={formatPrice(lot.buy_now_price)}
                onChange={handleNumberChange('buy_now_price')}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-600"
                placeholder="250"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Sold Price ($)</label>
              <input
                type="number"
                value={formatPrice(lot.sold_price)}
                onChange={handleNumberChange('sold_price')}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-600"
                placeholder="Final hammer price"
              />
            </div>
          </div>
        </div>

        {/* Dimensions */}
        <div className="space-y-4 mt-6">
          <h2 className="text-lg font-semibold text-gray-900">Dimensions & Weight</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Height (in)</label>
              <input
                type="number"
                value={formatPrice(lot.height)}
                onChange={handleNumberChange('height')}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-600"
                placeholder="24"
                step="0.1"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Width (in)</label>
              <input
                type="number"
                value={formatPrice(lot.width)}
                onChange={handleNumberChange('width')}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-600"
                placeholder="36"
                step="0.1"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Depth (in)</label>
              <input
                type="number"
                value={formatPrice(lot.depth)}
                onChange={handleNumberChange('depth')}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-600"
                placeholder="18"
                step="0.1"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Weight (lbs)</label>
              <input
                type="number"
                value={formatPrice(lot.weight)}
                onChange={handleNumberChange('weight')}
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
              value={lot.origin || ''}
              onChange={(value) => updateField('origin', value)}
              items={getLAOrigins()}
              placeholder="Search origins..."
            />
            <LAAutocomplete
              label="Creator/Maker"
              value={lot.creator || ''}
              onChange={(value) => updateField('creator', value)}
              items={getLACreators()}
              placeholder="Search creators..."
            />
            <LAAutocomplete
              label="Materials"
              value={lot.materials || ''}
              onChange={(value) => updateField('materials', value)}
              items={getLAMaterials()}
              placeholder="Search materials..."
            />
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Consignor</label>
              <input
                type="text"
                value={lot.consignor || ''}
                onChange={(e) => updateField('consignor', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-600"
                placeholder="Consignor name or reference"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default memo(LotForm);