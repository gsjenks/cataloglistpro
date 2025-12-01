// src/components/LotsList.tsx
// UPDATED: Compressed card layout with starting bid below estimate and photo display

import { useNavigate } from 'react-router-dom';
import type { Lot } from '../types';
import { Edit2, Trash2, Package } from 'lucide-react';
import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import PhotoService from '../services/PhotoService';

interface LotsListProps {
  lots: Lot[];
  saleId: string;
  onRefresh: () => void;
}

export default function LotsList({ lots, saleId, onRefresh }: LotsListProps) {
  const navigate = useNavigate();
  const [deleting, setDeleting] = useState<string | null>(null);
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({});

  // Load primary photos for all lots
  useEffect(() => {
    const loadPhotos = async () => {
      const urls: Record<string, string> = {};
      
      for (const lot of lots) {
        try {
          const photos = await PhotoService.getPhotosByLot(lot.id);
          const primaryPhoto = photos.find(p => p.is_primary) || photos[0];
          
          if (primaryPhoto) {
            const photoUrl = await PhotoService.getPhotoObjectUrl(primaryPhoto.id);
            if (photoUrl) {
              urls[lot.id] = photoUrl;
            }
          }
        } catch (error) {
          console.error(`Error loading photo for lot ${lot.id}:`, error);
        }
      }
      
      setPhotoUrls(urls);
    };

    if (lots.length > 0) {
      loadPhotos();
    }

    // Cleanup: revoke object URLs when component unmounts
    return () => {
      Object.values(photoUrls).forEach(url => {
        PhotoService.revokeObjectUrl(url);
      });
    };
  }, [lots]);

  const handleEdit = (lotId: string) => {
    navigate(`/sales/${saleId}/lots/${lotId}`);
  };

  const handleDelete = async (lot: Lot) => {
    if (!window.confirm(`Delete lot #${lot.lot_number}? This cannot be undone.`)) {
      return;
    }

    setDeleting(lot.id);
    try {
      // Delete associated photos from storage
      const { data: photos } = await supabase
        .from('photos')
        .select('file_path')
        .eq('lot_id', lot.id);

      if (photos && photos.length > 0) {
        const filePaths = photos.map(p => p.file_path);
        await supabase.storage.from('photos').remove(filePaths);
      }

      // Delete lot
      const { error } = await supabase
        .from('lots')
        .delete()
        .eq('id', lot.id);

      if (error) throw error;

      onRefresh();
    } catch (error) {
      console.error('Error deleting lot:', error);
      alert('Failed to delete lot');
    } finally {
      setDeleting(null);
    }
  };

  const formatCurrency = (value: number | null | undefined) => {
    if (value === null || value === undefined) return '';
    return `$${value.toLocaleString()}`;
  };

  const formatDimensions = (lot: Lot) => {
    const parts = [];
    if (lot.height) parts.push(`H: ${lot.height}"`);
    if (lot.width) parts.push(`W: ${lot.width}"`);
    if (lot.depth) parts.push(`D: ${lot.depth}"`);
    
    let result = parts.join(' × ');
    
    if (lot.weight) {
      result += ` • ${lot.weight} lbs`;
    }
    
    return result || 'Not specified';
  };

  if (lots.length === 0) {
    return (
      <div className="text-center py-12 bg-white rounded-lg border border-gray-200">
        <Package className="w-12 h-12 text-gray-400 mx-auto mb-4" />
        <p className="text-gray-500 text-lg mb-2">No items yet</p>
        <p className="text-gray-400 text-sm">
          Add your first item to get started
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {lots.map((lot) => (
        <div
          key={lot.id}
          className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 hover:shadow-md transition-shadow"
        >
          <div className="flex items-start gap-4">
            {/* Left side - Details */}
            <div className="flex-1 min-w-0">
              {/* Lot Number and Title on same line */}
              <div className="flex items-start gap-3 mb-3">
                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-indigo-600 text-white flex-shrink-0">
                  #{lot.lot_number || 'TBD'}
                </span>
                <h3 className="text-lg font-semibold text-gray-900 line-clamp-2 flex-1">
                  {lot.name}
                </h3>
              </div>

              {/* Compact info grid */}
              <div className="space-y-2">
                {/* Estimate */}
                <div className="flex items-baseline gap-2">
                  <span className="text-xs text-gray-500 w-20 flex-shrink-0">Estimate:</span>
                  <span className="text-sm font-semibold text-gray-900">
                    {lot.estimate_low && lot.estimate_high ? (
                      `${formatCurrency(lot.estimate_low)} - ${formatCurrency(lot.estimate_high)}`
                    ) : lot.estimate_low ? (
                      formatCurrency(lot.estimate_low)
                    ) : (
                      <span className="text-gray-400">Not set</span>
                    )}
                  </span>
                </div>

                {/* Starting Bid - MOVED BELOW ESTIMATE */}
                <div className="flex items-baseline gap-2">
                  <span className="text-xs text-gray-500 w-20 flex-shrink-0">Starting Bid:</span>
                  <span className="text-sm font-semibold text-indigo-600">
                    {lot.starting_bid ? (
                      formatCurrency(lot.starting_bid)
                    ) : (
                      <span className="text-gray-400">Not set</span>
                    )}
                  </span>
                </div>

                {/* Sold Price - shows if set */}
                {lot.sold_price && (
                  <div className="flex items-baseline gap-2">
                    <span className="text-xs text-gray-500 w-20 flex-shrink-0">Sold Price:</span>
                    <span className="text-sm font-semibold text-green-600">
                      {formatCurrency(lot.sold_price)}
                    </span>
                  </div>
                )}

                {/* Dimensions & Weight - compressed */}
                <div className="flex items-baseline gap-2">
                  <span className="text-xs text-gray-500 w-20 flex-shrink-0">Size:</span>
                  <span className="text-xs text-gray-700">
                    {formatDimensions(lot)}
                  </span>
                </div>

                {/* Quantity - inline with category */}
                <div className="flex items-center gap-3 flex-wrap">
                  {lot.quantity && lot.quantity > 1 && (
                    <div className="inline-flex items-center gap-1.5">
                      <Package className="w-3.5 h-3.5 text-gray-500" />
                      <span className="text-xs font-medium text-gray-700">
                        Qty: {lot.quantity}
                      </span>
                    </div>
                  )}
                  
                  {/* Category badge - inline */}
                  {lot.category && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-indigo-50 text-indigo-700">
                      {lot.category}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Right side - Image & Actions (more compact) */}
            <div className="flex flex-col items-end gap-2">
              {/* Action Buttons */}
              <div className="flex items-center gap-1">
                <button
                  onClick={() => handleEdit(lot.id)}
                  className="p-1.5 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded transition-colors"
                  title="Edit item"
                >
                  <Edit2 className="w-4 h-4" />
                </button>
                
                <button
                  onClick={() => handleDelete(lot)}
                  disabled={deleting === lot.id}
                  className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  title="Delete item"
                >
                  {deleting === lot.id ? (
                    <div className="animate-spin rounded-full h-4 w-4 border-2 border-red-600 border-t-transparent"></div>
                  ) : (
                    <Trash2 className="w-4 h-4" />
                  )}
                </button>
              </div>

              {/* Primary Photo - smaller */}
              <div className="w-32 h-32 bg-gray-100 rounded-lg overflow-hidden flex-shrink-0 border border-gray-200">
                {photoUrls[lot.id] ? (
                  <img
                    src={photoUrls[lot.id]}
                    alt={lot.name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <Package className="w-10 h-10 text-gray-300" />
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}