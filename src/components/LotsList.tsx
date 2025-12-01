// src/components/LotsList.tsx
// OPTIMIZED: Parallel photo loading, lazy images, memoization

import { useNavigate } from 'react-router-dom';
import type { Lot } from '../types';
import { Edit2, Trash2, Package } from 'lucide-react';
import { useState, useEffect, useCallback, useRef, memo } from 'react';
import { supabase } from '../lib/supabase';
import PhotoService from '../services/PhotoService';

interface LotsListProps {
  lots: Lot[];
  saleId: string;
  onRefresh: () => void;
}

// Lazy image component with intersection observer
const LazyImage = memo(({ 
  lotId, 
  alt, 
  loadPhoto 
}: { 
  lotId: string; 
  alt: string; 
  loadPhoto: (lotId: string) => Promise<string | null>;
}) => {
  const [src, setSrc] = useState<string | null>(null);
  const [isVisible, setIsVisible] = useState(false);
  const imgRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: '100px' }
    );

    if (imgRef.current) {
      observer.observe(imgRef.current);
    }

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!isVisible) return;
    
    let cancelled = false;
    loadPhoto(lotId).then(url => {
      if (!cancelled && url) setSrc(url);
    });

    return () => { cancelled = true; };
  }, [isVisible, lotId, loadPhoto]);

  return (
    <div ref={imgRef} className="w-32 h-32 bg-gray-100 rounded-lg overflow-hidden flex-shrink-0 border border-gray-200">
      {src ? (
        <img src={src} alt={alt} className="w-full h-full object-cover" loading="lazy" />
      ) : (
        <div className="w-full h-full flex items-center justify-center">
          <Package className="w-10 h-10 text-gray-300" />
        </div>
      )}
    </div>
  );
});

LazyImage.displayName = 'LazyImage';

// Lot card component - memoized
const LotCard = memo(({ 
  lot, 
  deleting, 
  onEdit, 
  onDelete,
  loadPhoto
}: {
  lot: Lot;
  deleting: string | null;
  onEdit: (lotId: string) => void;
  onDelete: (lot: Lot) => void;
  loadPhoto: (lotId: string) => Promise<string | null>;
}) => {
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
    if (lot.weight) result += ` • ${lot.weight} lbs`;
    
    return result || 'Not specified';
  };

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 hover:shadow-md transition-shadow">
      <div className="flex items-start gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-start gap-3 mb-3">
            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-indigo-600 text-white flex-shrink-0">
              #{lot.lot_number || 'TBD'}
            </span>
            <h3 className="text-lg font-semibold text-gray-900 line-clamp-2 flex-1">
              {lot.name}
            </h3>
          </div>

          <div className="space-y-2">
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

            <div className="flex items-baseline gap-2">
              <span className="text-xs text-gray-500 w-20 flex-shrink-0">Starting Bid:</span>
              <span className="text-sm font-semibold text-indigo-600">
                {lot.starting_bid ? formatCurrency(lot.starting_bid) : <span className="text-gray-400">Not set</span>}
              </span>
            </div>

            {lot.sold_price && (
              <div className="flex items-baseline gap-2">
                <span className="text-xs text-gray-500 w-20 flex-shrink-0">Sold Price:</span>
                <span className="text-sm font-semibold text-green-600">{formatCurrency(lot.sold_price)}</span>
              </div>
            )}

            <div className="flex items-baseline gap-2">
              <span className="text-xs text-gray-500 w-20 flex-shrink-0">Size:</span>
              <span className="text-xs text-gray-700">{formatDimensions(lot)}</span>
            </div>

            <div className="flex items-center gap-3 flex-wrap">
              {lot.quantity && lot.quantity > 1 && (
                <div className="inline-flex items-center gap-1.5">
                  <Package className="w-3.5 h-3.5 text-gray-500" />
                  <span className="text-xs font-medium text-gray-700">Qty: {lot.quantity}</span>
                </div>
              )}
              {lot.category && (
                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-indigo-50 text-indigo-700">
                  {lot.category}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-col items-end gap-2">
          <div className="flex items-center gap-1">
            <button
              onClick={() => onEdit(lot.id)}
              className="p-1.5 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded transition-colors"
              title="Edit item"
            >
              <Edit2 className="w-4 h-4" />
            </button>
            <button
              onClick={() => onDelete(lot)}
              disabled={deleting === lot.id}
              className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors disabled:opacity-50"
              title="Delete item"
            >
              {deleting === lot.id ? (
                <div className="animate-spin rounded-full h-4 w-4 border-2 border-red-600 border-t-transparent" />
              ) : (
                <Trash2 className="w-4 h-4" />
              )}
            </button>
          </div>

          <LazyImage lotId={lot.id} alt={lot.name} loadPhoto={loadPhoto} />
        </div>
      </div>
    </div>
  );
});

LotCard.displayName = 'LotCard';

export default function LotsList({ lots, saleId, onRefresh }: LotsListProps) {
  const navigate = useNavigate();
  const [deleting, setDeleting] = useState<string | null>(null);
  
  // Cache for loaded photo URLs
  const photoCache = useRef<Map<string, string>>(new Map());
  const pendingLoads = useRef<Map<string, Promise<string | null>>>(new Map());

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      photoCache.current.forEach(url => PhotoService.revokeObjectUrl(url));
      photoCache.current.clear();
    };
  }, []);

  // Load photo with caching and deduplication
  const loadPhoto = useCallback(async (lotId: string): Promise<string | null> => {
    // Return cached
    if (photoCache.current.has(lotId)) {
      return photoCache.current.get(lotId)!;
    }

    // Return pending promise if already loading
    if (pendingLoads.current.has(lotId)) {
      return pendingLoads.current.get(lotId)!;
    }

    // Start new load
    const loadPromise = (async () => {
      try {
        const photos = await PhotoService.getPhotosByLot(lotId);
        const primaryPhoto = photos.find(p => p.is_primary) || photos[0];
        
        if (primaryPhoto) {
          const url = await PhotoService.getPhotoObjectUrl(primaryPhoto.id);
          if (url) {
            photoCache.current.set(lotId, url);
            return url;
          }
        }
        return null;
      } catch (error) {
        console.error(`Error loading photo for lot ${lotId}:`, error);
        return null;
      } finally {
        pendingLoads.current.delete(lotId);
      }
    })();

    pendingLoads.current.set(lotId, loadPromise);
    return loadPromise;
  }, []);

  const handleEdit = useCallback((lotId: string) => {
    navigate(`/sales/${saleId}/lots/${lotId}`);
  }, [navigate, saleId]);

  const handleDelete = useCallback(async (lot: Lot) => {
    if (!window.confirm(`Delete lot #${lot.lot_number}? This cannot be undone.`)) {
      return;
    }

    setDeleting(lot.id);
    try {
      // Delete photos in parallel
      const { data: photos } = await supabase
        .from('photos')
        .select('file_path')
        .eq('lot_id', lot.id);

      if (photos && photos.length > 0) {
        await supabase.storage.from('photos').remove(photos.map(p => p.file_path));
      }

      const { error } = await supabase.from('lots').delete().eq('id', lot.id);
      if (error) throw error;

      // Clean up cached URL
      if (photoCache.current.has(lot.id)) {
        PhotoService.revokeObjectUrl(photoCache.current.get(lot.id)!);
        photoCache.current.delete(lot.id);
      }

      onRefresh();
    } catch (error) {
      console.error('Error deleting lot:', error);
      alert('Failed to delete lot');
    } finally {
      setDeleting(null);
    }
  }, [onRefresh]);

  if (lots.length === 0) {
    return (
      <div className="text-center py-12 bg-white rounded-lg border border-gray-200">
        <Package className="w-12 h-12 text-gray-400 mx-auto mb-4" />
        <p className="text-gray-500 text-lg mb-2">No items yet</p>
        <p className="text-gray-400 text-sm">Add your first item to get started</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {lots.map((lot) => (
        <LotCard
          key={lot.id}
          lot={lot}
          deleting={deleting}
          onEdit={handleEdit}
          onDelete={handleDelete}
          loadPhoto={loadPhoto}
        />
      ))}
    </div>
  );
}