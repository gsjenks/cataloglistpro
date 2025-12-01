import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import offlineStorage from '../services/Offlinestorage';
import type { Lot, Photo } from '../types';
import { X, Edit, Trash2, ChevronLeft, ChevronRight, Star, ArrowLeft } from 'lucide-react';

interface LotViewModalProps {
  lot: Lot;
  saleId: string;
  onClose: () => void;
  onDelete: () => void;
}

export default function LotViewModal({ lot, saleId, onClose, onDelete }: LotViewModalProps) {
  const navigate = useNavigate();
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({});
  const [currentPhotoIndex, setCurrentPhotoIndex] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadPhotos();
    
    // Cleanup object URLs on unmount
    return () => {
      Object.values(photoUrls).forEach(url => {
        if (url.startsWith('blob:')) {
          URL.revokeObjectURL(url);
        }
      });
    };
  }, [lot.id]);

  const loadPhotos = async () => {
    setLoading(true);
    try {
      let photoData: Photo[] = [];
      const urls: Record<string, string> = {};

      // Try loading from IndexedDB first (for local/offline photos)
      const localPhotos = await offlineStorage.getPhotosByLot(lot.id);
      if (localPhotos && localPhotos.length > 0) {
        photoData = localPhotos;
        
        // Create object URLs from blobs stored in IndexedDB
        for (const photo of localPhotos) {
          const blob = await offlineStorage.getPhotoBlob(photo.id);
          if (blob) {
            urls[photo.id] = URL.createObjectURL(blob);
          }
        }
      }

      // Also try loading from Supabase (for synced photos)
      try {
        const { data, error } = await supabase
          .from('photos')
          .select('*')
          .eq('lot_id', lot.id)
          .order('is_primary', { ascending: false })
          .order('created_at');

        if (!error && data && data.length > 0) {
          // Merge with local photos, preferring Supabase data for synced items
          const photoMap = new Map(photoData.map(p => [p.id, p]));
          data.forEach(p => photoMap.set(p.id, p));
          photoData = Array.from(photoMap.values());

          // Load URLs for all photos from Supabase
          for (const photo of data) {
            // Skip if we already have a URL from IndexedDB
            if (urls[photo.id]) continue;

            // Validate file_path exists
            if (!photo.file_path) {
              console.debug(`Photo ${photo.id} has no file_path, skipping`);
              continue;
            }

            try {
              const { data: urlData, error: storageError } = await supabase.storage
                .from('photos')
                .createSignedUrl(photo.file_path, 3600);
              
              if (storageError) {
                console.debug(`Storage error for photo ${photo.id}:`, storageError.message);
                continue; // Skip this photo, don't crash
              }

              if (urlData?.signedUrl) {
                urls[photo.id] = urlData.signedUrl;
              }
            } catch (urlError) {
              console.debug(`Failed to create signed URL for photo ${photo.id}:`, urlError);
              // Continue with other photos
            }
          }
        }
      } catch (supabaseError) {
        // Silently handle Supabase errors (might be offline)
        console.debug('Supabase photo fetch failed:', supabaseError);
      }

      setPhotos(photoData);
      setPhotoUrls(urls);
    } catch (error) {
      console.error('Error loading photos:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm(`Are you sure you want to delete "${lot.name}"? This will also delete all associated photos. This action cannot be undone.`)) {
      return;
    }

    try {
      // Delete all photos from storage first
      if (photos.length > 0) {
        const filePaths = photos.map(photo => photo.file_path);
        await supabase.storage.from('photos').remove(filePaths);
      }

      // Delete all photo records
      await supabase
        .from('photos')
        .delete()
        .eq('lot_id', lot.id);

      // Delete the lot
      const { error } = await supabase
        .from('lots')
        .delete()
        .eq('id', lot.id);

      if (error) throw error;

      onDelete();
      onClose();
    } catch (error) {
      console.error('Error deleting lot:', error);
      alert('Failed to delete lot');
    }
  };

  const handleEdit = () => {
    navigate(`/sales/${saleId}/lots/${lot.id}`);
    onClose();
  };

  const nextPhoto = () => {
    if (currentPhotoIndex < photos.length - 1) {
      setCurrentPhotoIndex(currentPhotoIndex + 1);
    }
  };

  const prevPhoto = () => {
    if (currentPhotoIndex > 0) {
      setCurrentPhotoIndex(currentPhotoIndex - 1);
    }
  };

  const formatPrice = (price?: number) => {
    if (!price) return '-';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
    }).format(price);
  };

  const formatDimensions = (lot: Lot) => {
    const parts = [];
    if (lot.height) parts.push(`H: ${lot.height}"`);
    if (lot.width) parts.push(`W: ${lot.width}"`);
    if (lot.depth) parts.push(`D: ${lot.depth}"`);
    return parts.length > 0 ? parts.join(' × ') : '-';
  };

  const formatWeight = (weight?: number) => {
    if (!weight) return '-';
    return `${weight} lbs`;
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-6xl w-full max-h-[95vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div>
            {lot.lot_number && (
              <p className="text-sm font-bold text-indigo-600 mb-1">
                LOT #{lot.lot_number}
              </p>
            )}
            <h2 className="text-2xl font-semibold text-gray-900">{lot.name}</h2>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="flex items-center gap-2 px-3 py-2 hover:bg-gray-100 rounded-lg transition-colors"
              title="Back to list"
            >
              <ArrowLeft className="w-5 h-5 text-gray-600" />
              <span className="text-sm font-medium text-gray-700">Back</span>
            </button>
            <div className="w-px h-6 bg-gray-300"></div>
            <button
              onClick={handleEdit}
              className="p-2 hover:bg-gray-100 rounded-full transition-colors"
              title="Edit lot"
            >
              <Edit className="w-5 h-5 text-gray-600" />
            </button>
            <button
              onClick={handleDelete}
              className="p-2 hover:bg-red-50 rounded-full transition-colors"
              title="Delete lot"
            >
              <Trash2 className="w-5 h-5 text-red-600" />
            </button>
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 rounded-full transition-colors"
              title="Close"
            >
              <X className="w-5 h-5 text-gray-600" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Photo Gallery Column */}
            <div className="space-y-4">
              {loading ? (
                <div className="aspect-square bg-gray-100 rounded-lg flex items-center justify-center">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600" />
                </div>
              ) : photos.length === 0 ? (
                <div className="aspect-square bg-gray-100 rounded-lg flex items-center justify-center border-2 border-dashed border-gray-300">
                  <div className="text-center">
                    <p className="text-gray-500 text-sm">No photos</p>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Main Photo Display */}
                  <div className="relative aspect-square bg-gray-100 rounded-lg overflow-hidden">
                    {photoUrls[photos[currentPhotoIndex]?.id] ? (
                      <img
                        src={photoUrls[photos[currentPhotoIndex].id]}
                        alt={photos[currentPhotoIndex].file_name}
                        className="w-full h-full object-contain"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600" />
                      </div>
                    )}

                    {/* Primary Badge */}
                    {photos[currentPhotoIndex]?.is_primary && (
                      <div className="absolute top-4 left-4">
                        <div className="flex items-center gap-2 px-3 py-1.5 bg-white rounded-full shadow-md">
                          <Star className="w-4 h-4 text-yellow-400 fill-yellow-400" />
                          <span className="text-sm font-medium text-gray-700">Primary</span>
                        </div>
                      </div>
                    )}

                    {/* Navigation Arrows */}
                    {photos.length > 1 && (
                      <>
                        <button
                          onClick={prevPhoto}
                          disabled={currentPhotoIndex === 0}
                          className="absolute left-4 top-1/2 -translate-y-1/2 p-2 bg-white rounded-full shadow-lg hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                        >
                          <ChevronLeft className="w-6 h-6 text-gray-700" />
                        </button>
                        <button
                          onClick={nextPhoto}
                          disabled={currentPhotoIndex === photos.length - 1}
                          className="absolute right-4 top-1/2 -translate-y-1/2 p-2 bg-white rounded-full shadow-lg hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                        >
                          <ChevronRight className="w-6 h-6 text-gray-700" />
                        </button>
                      </>
                    )}

                    {/* Photo Counter */}
                    {photos.length > 1 && (
                      <div className="absolute bottom-4 right-4 px-3 py-1.5 bg-black bg-opacity-60 text-white text-sm rounded-full">
                        {currentPhotoIndex + 1} / {photos.length}
                      </div>
                    )}
                  </div>

                  {/* Thumbnail Strip */}
                  {photos.length > 1 && (
                    <div className="flex gap-2 overflow-x-auto pb-2">
                      {photos.map((photo, index) => (
                        <button
                          key={photo.id}
                          onClick={() => setCurrentPhotoIndex(index)}
                          className={`flex-shrink-0 w-20 h-20 rounded-lg overflow-hidden border-2 transition-all ${
                            index === currentPhotoIndex
                              ? 'border-indigo-600 ring-2 ring-indigo-200'
                              : 'border-gray-200 hover:border-gray-300'
                          }`}
                        >
                          {photoUrls[photo.id] ? (
                            <img
                              src={photoUrls[photo.id]}
                              alt={`Thumbnail ${index + 1}`}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="w-full h-full bg-gray-200" />
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Lot Details Column - ALWAYS SHOW ALL FIELDS */}
            <div className="space-y-6">
              <h3 className="text-lg font-semibold text-gray-900">Details</h3>

              {/* Description */}
              <div>
                <p className="text-sm font-medium text-gray-500 mb-2">Description</p>
                <p className="text-gray-900 whitespace-pre-wrap">{lot.description || '-'}</p>
              </div>

              {/* Pricing Grid - ESTIMATE AND STARTING BID ONLY */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm font-medium text-gray-500 mb-1">Estimate</p>
                  <p className="text-base font-semibold text-gray-900">
                    {formatPrice(lot.estimate_low)} - {formatPrice(lot.estimate_high)}
                  </p>
                </div>

                <div>
                  <p className="text-sm font-medium text-gray-500 mb-1">Starting Bid</p>
                  <p className="text-base font-semibold text-gray-900">
                    {formatPrice(lot.starting_bid)}
                  </p>
                </div>
              </div>

              {/* Physical Details Grid - COMBINED DIMENSIONS & WEIGHT */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm font-medium text-gray-500 mb-1">Dimensions & Weight</p>
                  <p className="text-base font-semibold text-gray-900">
                    {formatDimensions(lot)} • {formatWeight(lot.weight)}
                  </p>
                </div>

                <div>
                  <p className="text-sm font-medium text-gray-500 mb-1">Quantity</p>
                  <p className="text-base font-semibold text-gray-900">
                    {lot.quantity || '-'}
                  </p>
                </div>
              </div>

              {/* Metadata Grid - ALWAYS SHOW ALL FIELDS */}
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <div>
                  <p className="text-sm font-medium text-gray-500 mb-1">Category</p>
                  {lot.category ? (
                    <span className="inline-block px-3 py-1 bg-indigo-100 text-indigo-700 rounded-full text-sm font-medium">
                      {lot.category}
                    </span>
                  ) : (
                    <p className="text-base text-gray-900">-</p>
                  )}
                </div>

                <div>
                  <p className="text-sm font-medium text-gray-500 mb-1">Condition</p>
                  <p className="text-base text-gray-900">{lot.condition || '-'}</p>
                </div>

                <div>
                  <p className="text-sm font-medium text-gray-500 mb-1">Style/Period</p>
                  <p className="text-base text-gray-900">{lot.style || '-'}</p>
                </div>

                <div>
                  <p className="text-sm font-medium text-gray-500 mb-1">Origin</p>
                  <p className="text-base text-gray-900">{lot.origin || '-'}</p>
                </div>

                <div>
                  <p className="text-sm font-medium text-gray-500 mb-1">Creator/Maker</p>
                  <p className="text-base text-gray-900">{lot.creator || '-'}</p>
                </div>

                <div>
                  <p className="text-sm font-medium text-gray-500 mb-1">Materials</p>
                  <p className="text-base text-gray-900">{lot.materials || '-'}</p>
                </div>

                <div>
                  <p className="text-sm font-medium text-gray-500 mb-1">Consignor</p>
                  <p className="text-base text-gray-900">{lot.consignor || '-'}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}