// src/components/LotDetail.tsx
// UPDATED: Added webcam support for desktop browsers
// Mobile: Uses native camera, Desktop: Uses getUserMedia webcam interface

import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useFooter } from '../context/FooterContext';
import ConnectivityService from '../services/ConnectivityService';
import { getNextLotNumber, isTemporaryNumber } from '../services/LotNumberService';
import offlineStorage from '../services/Offlinestorage';
import CameraService from '../services/CameraService';
import type { Lot, Photo } from '../types';
import { 
  ArrowLeft, 
  Save, 
  Trash2, 
  Upload,
  Camera, 
  Sparkles,
  Star,
  Image as ImageIcon,
  X,
  RotateCcw,
  Check
} from 'lucide-react';

// Simple UUID generator
function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

export default function LotDetail() {
  const { saleId, lotId } = useParams<{ saleId: string; lotId: string }>();
  const navigate = useNavigate();
  const { setActions, clearActions } = useFooter();
  const [isOnline, setIsOnline] = useState(ConnectivityService.getConnectionStatus());
  const [showCameraModal, setShowCameraModal] = useState(false);
  const [lot, setLot] = useState<Partial<Lot>>({
    name: '',
    description: '',
    quantity: 1,
    condition: '',
    category: '',
    style: '',
    origin: '',
    creator: '',
    materials: '',
    estimate_low: undefined,
    estimate_high: undefined,
    starting_bid: undefined,
    reserve_price: undefined,
    buy_now_price: undefined,
    sold_price: undefined,
    height: undefined,
    width: undefined,
    depth: undefined,
    weight: undefined,
    dimension_unit: 'inches',
    consignor: ''
  });
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const isNewLot = lotId === 'new';

  // Monitor connectivity
  useEffect(() => {
    const unsubscribe = ConnectivityService.onStatusChange((online) => {
      setIsOnline(online);
      if (online) {
        console.log('Connection restored - photos will sync automatically');
      }
    });
    return unsubscribe;
  }, []);

  // Load lot data
  useEffect(() => {
    if (isNewLot) {
      initializeNewLot();
    } else {
      loadLot();
    }
  }, [lotId, saleId]);

  // Load photos
  useEffect(() => {
    if (!isNewLot && lotId) {
      loadPhotos();
    }
  }, [lotId, isNewLot]);

  // Cleanup object URLs on unmount
  useEffect(() => {
    return () => {
      Object.values(photoUrls).forEach(url => {
        if (url.startsWith('blob:')) {
          URL.revokeObjectURL(url);
        }
      });
    };
  }, [photoUrls]);

  // Set footer actions
  useEffect(() => {
    setActions([
      {
        id: 'save',
        label: isNewLot ? 'Create Item' : 'Save Changes',
        icon: <Save className="w-4 h-4" />,
        onClick: handleSave,
        variant: 'primary',
        disabled: !lot.name || saving,
        loading: saving
      },
      ...(!isNewLot ? [{
        id: 'camera',
        label: 'Camera',
        icon: <Camera className="w-4 h-4" />,
        onClick: handleTakePhoto,
        variant: 'secondary' as const,
        disabled: false
      }] : []),
      ...(!isNewLot ? [{
        id: 'upload',
        label: 'Choose Files',
        icon: <Upload className="w-4 h-4" />,
        onClick: () => document.getElementById('photo-upload')?.click(),
        variant: 'secondary' as const,
        disabled: false
      }] : []),
      {
        id: 'back',
        label: 'Back',
        icon: <ArrowLeft className="w-4 h-4" />,
        onClick: () => navigate(`/sales/${saleId}`),
        variant: 'secondary' as const
      },
      ...(photos.length > 0 && isOnline ? [{
        id: 'ai-enrich',
        label: 'Magic',
        icon: <Sparkles className="w-4 h-4" />,
        onClick: handleAIEnrich,
        variant: 'ai' as const,
        disabled: false
      }] : []),
      ...(!isNewLot ? [{
        id: 'delete',
        label: 'Delete',
        icon: <Trash2 className="w-4 h-4" />,
        onClick: handleDelete,
        variant: 'danger' as const,
        disabled: false
      }] : [])
    ]);

    return () => clearActions();
  }, [lot, photos, isNewLot, saving, saleId, isOnline]);

  const initializeNewLot = async () => {
    try {
      const lotNumber = await getNextLotNumber(saleId!, isOnline);
      setLot(prev => ({
        ...prev,
        lot_number: lotNumber,
        sale_id: saleId
      }));
    } catch (error) {
      console.error('Error initializing new lot:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadLot = async () => {
    if (!lotId) return;

    setLoading(true);
    try {
      if (isOnline) {
        const { data, error } = await supabase
          .from('lots')
          .select('*')
          .eq('id', lotId)
          .single();

        if (error) throw error;
        if (data) {
          setLot(data);
          await offlineStorage.upsertLot(data);
        }
      } else {
        const offlineLot = await offlineStorage.getLot(lotId);
        if (offlineLot) {
          setLot(offlineLot);
        }
      }
    } catch (error) {
      console.error('Error loading lot:', error);
      alert('Failed to load item');
    } finally {
      setLoading(false);
    }
  };

  const loadPhotos = async () => {
    if (!lotId) return;

    try {
      let photoData: Photo[] = [];
      const urls: Record<string, string> = {};

      const localPhotos = await offlineStorage.getPhotosByLot(lotId);
      if (localPhotos && localPhotos.length > 0) {
        photoData = localPhotos;
        
        for (const photo of localPhotos) {
          const blob = await offlineStorage.getPhotoBlob(photo.id);
          if (blob) {
            const blobUrl = URL.createObjectURL(blob);
            urls[photo.id] = blobUrl;
          }
        }
      }

      if (isOnline) {
        const { data: remotePhotos, error } = await supabase
          .from('photos')
          .select('*')
          .eq('lot_id', lotId)
          .order('created_at', { ascending: true });

        if (error) throw error;

        if (remotePhotos && remotePhotos.length > 0) {
          const localPhotoIds = new Set(photoData.map(p => p.id));
          const newRemotePhotos = remotePhotos.filter(p => !localPhotoIds.has(p.id));
          photoData = [...photoData, ...newRemotePhotos];

          for (const photo of remotePhotos) {
            if (!urls[photo.id]) {
              const { data: urlData } = await supabase.storage
                .from('photos')
                .createSignedUrl(photo.file_path, 3600);
              
              if (urlData) {
                urls[photo.id] = urlData.signedUrl;
              }
            }
          }
        }
      }

      setPhotos(photoData);
      setPhotoUrls(urls);
    } catch (error) {
      console.error('Error loading photos:', error);
    }
  };

  const handleTakePhoto = async () => {
    if (!lotId || isNewLot) {
      alert('Please save the lot first before adding photos');
      return;
    }

    const platformCapabilities = CameraService.getPlatformCapabilities();
    
    if (platformCapabilities.isNative) {
      // NATIVE: Use Capacitor Camera
      try {
        const isPrimary = photos.length === 0;
        const result = await CameraService.takePhoto(lotId, isPrimary);
        
        if (!result.success) {
          alert(result.error || 'Failed to capture photo');
          return;
        }

        if (result.photoId && result.blobUrl) {
          const newPhoto: Photo = {
            id: result.photoId,
            lot_id: lotId,
            file_path: `${lotId}/${result.photoId}.jpg`,
            file_name: `Photo_${Date.now()}.jpg`,
            is_primary: isPrimary,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            synced: false
          };

          setPhotos(prev => [...prev, newPhoto]);
          setPhotoUrls(prev => ({ ...prev, [result.photoId!]: result.blobUrl! }));
        }
      } catch (error) {
        console.error('Error taking photo:', error);
        alert('Failed to capture photo');
      }
    } else {
      // WEB: Show webcam modal
      setShowCameraModal(true);
    }
  };

  const handleCaptureFromWebcam = async (blob: Blob) => {
    if (!lotId) return;

    try {
      const photoId = generateUUID();
      const isPrimary = photos.length === 0;
      const blobUrl = URL.createObjectURL(blob);

      // Save to IndexedDB
      const photoMetadata: Photo = {
        id: photoId,
        lot_id: lotId,
        file_path: `${lotId}/${photoId}.jpg`,
        file_name: `Webcam_${Date.now()}.jpg`,
        is_primary: isPrimary,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        synced: false
      };

      await offlineStorage.savePhoto(photoMetadata, blob);

      // Update UI
      setPhotos(prev => [...prev, photoMetadata]);
      setPhotoUrls(prev => ({ ...prev, [photoId]: blobUrl }));

      // Sync to Supabase if online (background)
      if (isOnline) {
        setTimeout(async () => {
          try {
            const file = new File([blob], `${photoId}.jpg`, { type: blob.type });
            const { error: uploadError } = await supabase.storage
              .from('photos')
              .upload(`${lotId}/${photoId}.jpg`, file, { upsert: true });

            if (!uploadError) {
              await supabase.from('photos').upsert({
                id: photoId,
                lot_id: lotId,
                file_path: `${lotId}/${photoId}.jpg`,
                file_name: photoMetadata.file_name,
                is_primary: isPrimary,
              });

              photoMetadata.synced = true;
              await offlineStorage.updatePhoto(photoMetadata);
            }
          } catch (err) {
            console.error('Background sync failed:', err);
          }
        }, 1000);
      }

      setShowCameraModal(false);
    } catch (error) {
      console.error('Error saving webcam photo:', error);
      alert('Failed to save photo');
    }
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    if (!lotId || isNewLot) {
      alert('Please save the lot first before adding photos');
      e.target.value = '';
      return;
    }

    try {
      const result = await CameraService.handleFileInput(files, lotId);
      
      if (result.success > 0) {
        const newPhotos = result.photos.map((p, index) => ({
          id: p.photoId,
          lot_id: lotId,
          file_path: `${lotId}/${p.photoId}.jpg`,
          file_name: `Photo_${Date.now()}_${index}.jpg`,
          is_primary: photos.length === 0 && index === 0,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          synced: false
        }));

        setPhotos(prev => [...prev, ...newPhotos]);

        const newUrls: Record<string, string> = {};
        result.photos.forEach(p => {
          newUrls[p.photoId] = p.blobUrl;
        });
        setPhotoUrls(prev => ({ ...prev, ...newUrls }));
      }

      if (result.failed > 0) {
        alert(`${result.failed} file(s) failed to upload`);
      }

      e.target.value = '';
    } catch (error) {
      console.error('Error uploading photos:', error);
      alert('Failed to upload photos');
      e.target.value = '';
    }
  };

  const handleSetPrimary = async (photoId: string) => {
    try {
      const updatedPhotos = photos.map(p => ({
        ...p,
        is_primary: p.id === photoId
      }));

      setPhotos(updatedPhotos);

      for (const photo of updatedPhotos) {
        await offlineStorage.upsertPhoto(photo);
      }

      if (isOnline) {
        await supabase
          .from('photos')
          .update({ is_primary: false })
          .eq('lot_id', lotId);

        await supabase
          .from('photos')
          .update({ is_primary: true })
          .eq('id', photoId);
      }
    } catch (error) {
      console.error('Error setting primary photo:', error);
      alert('Failed to set primary photo');
    }
  };

  const handleDeletePhoto = async (photoId: string) => {
    if (!window.confirm('Delete this photo?')) return;

    try {
      setPhotos(prev => prev.filter(p => p.id !== photoId));

      if (photoUrls[photoId] && photoUrls[photoId].startsWith('blob:')) {
        URL.revokeObjectURL(photoUrls[photoId]);
      }
      
      const newUrls = { ...photoUrls };
      delete newUrls[photoId];
      setPhotoUrls(newUrls);

      await offlineStorage.deletePhoto(photoId);

      if (isOnline) {
        const photo = photos.find(p => p.id === photoId);
        if (photo) {
          await supabase.storage.from('photos').remove([photo.file_path]);
          await supabase.from('photos').delete().eq('id', photoId);
        }
      }
    } catch (error) {
      console.error('Error deleting photo:', error);
      alert('Failed to delete photo');
    }
  };

  const handleAIEnrich = async () => {
    if (photos.length === 0) {
      alert('Add at least one photo to use AI enrichment');
      return;
    }

    if (!isOnline) {
      alert('AI enrichment requires an internet connection');
      return;
    }

    try {
      setSaving(true);

      const photosToAnalyze = photos.slice(0, 3);
      const photoBlobs: Blob[] = [];

      for (const photo of photosToAnalyze) {
        const blob = await offlineStorage.getPhotoBlob(photo.id);
        if (blob) {
          photoBlobs.push(blob);
        }
      }

      if (photoBlobs.length === 0) {
        alert('No photos available for analysis');
        return;
      }

      // Convert blobs to base64 for Gemini API
      const base64Photos = await Promise.all(
        photoBlobs.map(blob => new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => {
            const base64 = (reader.result as string).split(',')[1];
            resolve(base64);
          };
          reader.readAsDataURL(blob);
        }))
      );

      // Call Gemini API
      const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=' + import.meta.env.VITE_GEMINI_API_KEY, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [
              { text: `Analyze these ${photoBlobs.length} photos of an auction item and provide detailed information in JSON format:

{
  "title": "Catalog title (100 chars max)",
  "description": "Detailed description including condition (200+ words)",
  "category": "Item category",
  "style": "Style/period",
  "origin": "Country/region of origin",
  "creator": "Maker/artist (if identifiable)",
  "materials": "Materials used",
  "dimensions_estimate": "Estimated dimensions (H x W x D)",
  "estimate_low": Estimated low value in USD,
  "estimate_high": Estimated high value in USD,
  "starting_bid": Suggested starting bid in USD,
  "condition": "Condition report"
}` },
              ...base64Photos.map(data => ({
                inline_data: { mime_type: 'image/jpeg', data }
              }))
            ]
          }]
        })
      });

      if (!response.ok) {
        throw new Error('AI analysis failed');
      }

      const result = await response.json();
      const text = result.candidates[0].content.parts[0].text;
      
      // Extract JSON from response
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('Failed to parse AI response');
      }

      const aiData = JSON.parse(jsonMatch[0]);

      // Update lot with AI data
      setLot(prev => ({
        ...prev,
        name: aiData.title || prev.name,
        description: aiData.description || prev.description,
        category: aiData.category || prev.category,
        style: aiData.style || prev.style,
        origin: aiData.origin || prev.origin,
        creator: aiData.creator || prev.creator,
        materials: aiData.materials || prev.materials,
        condition: aiData.condition || prev.condition,
        estimate_low: aiData.estimate_low || prev.estimate_low,
        estimate_high: aiData.estimate_high || prev.estimate_high,
        starting_bid: aiData.starting_bid || prev.starting_bid,
      }));

      alert('✨ AI enrichment complete! Review and save changes.');
    } catch (error) {
      console.error('AI enrichment error:', error);
      alert('Failed to enrich data with AI');
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async () => {
    if (!lot.name) {
      alert('Please enter an item name');
      return;
    }

    setSaving(true);
    try {
      if (isNewLot) {
        // Create new lot
        const newLot = {
          ...lot,
          sale_id: saleId,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        };

        const newId = generateUUID();
        newLot.id = newId;

        // Save locally first
        await offlineStorage.upsertLot(newLot);

        // Save to Supabase if online
        if (isOnline) {
          const { error } = await supabase.from('lots').insert(newLot);
          if (error) throw error;
        }

        // Navigate to edit mode
        navigate(`/sales/${saleId}/lots/${newId}`, { replace: true });
      } else {
        // Update existing lot
        const updatedLot = {
          ...lot,
          updated_at: new Date().toISOString()
        };

        setLot(updatedLot);

        await offlineStorage.upsertLot(updatedLot);

        if (isOnline) {
          const { error } = await supabase
            .from('lots')
            .update(updatedLot)
            .eq('id', lotId);

          if (error) throw error;
        }

        alert('✅ Item saved successfully');
      }
    } catch (error) {
      console.error('Error saving lot:', error);
      alert('Failed to save item');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm('Delete this item? This cannot be undone.')) return;

    try {
      setSaving(true);

      // Delete photos
      for (const photo of photos) {
        await offlineStorage.deletePhoto(photo.id);
        if (isOnline) {
          await supabase.storage.from('photos').remove([photo.file_path]);
        }
      }

      // Delete lot
      await offlineStorage.upsertLot({ ...lot, id: lotId, deleted: true } as any);

      if (isOnline) {
        await supabase.from('lots').delete().eq('id', lotId);
      }

      navigate(`/sales/${saleId}`);
    } catch (error) {
      console.error('Error deleting lot:', error);
      alert('Failed to delete item');
      setSaving(false);
    }
  };

  const formatPrice = (value: number | undefined | null) => {
    // Handle both undefined and null (null comes from database NULL fields)
    if (value === null || value === undefined) return '';
    return value.toString();
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center pb-20">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading item...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 pb-24">
      {/* Hidden file inputs */}
      <input
        id="photo-upload"
        type="file"
        accept="image/*"
        multiple
        onChange={handlePhotoUpload}
        className="hidden"
      />

      {/* Lot Number Badge */}
      <div className="mb-4 flex items-center gap-3 flex-wrap">
        <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-indigo-100 text-indigo-800">
          Lot #{lot.lot_number || 'TBD'}
          {isTemporaryNumber(lot.lot_number) && (
            <span className="ml-2 text-xs text-indigo-600">(Temporary - will assign on sync)</span>
          )}
        </span>
        
        {/* Quantity Badge */}
        {!isNewLot && lot.quantity && lot.quantity > 1 && (
          <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-gray-100 text-gray-700">
            Qty: {lot.quantity}
          </span>
        )}
        
        {/* Condition Badge */}
        {!isNewLot && lot.condition && (
          <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-green-100 text-green-800">
            {lot.condition}
          </span>
        )}
      </div>

      {/* Photos Section */}
      {!isNewLot && (
        <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Photos</h2>
            <span className="text-sm text-gray-500">{photos.length} photo{photos.length !== 1 ? 's' : ''}</span>
          </div>

          {photos.length === 0 ? (
            <div className="text-center py-12 bg-gray-50 rounded-lg">
              <ImageIcon className="w-12 h-12 text-gray-400 mx-auto mb-3" />
              <p className="text-gray-500 mb-4">No photos yet</p>
              <p className="text-sm text-gray-400">
                Tap Camera to take a photo or Choose Files to upload
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
              {photos.map(photo => (
                <div key={photo.id} className="relative group">
                  <div className="aspect-square bg-gray-100 rounded-lg overflow-hidden">
                    {photoUrls[photo.id] ? (
                      <img
                        src={photoUrls[photo.id]}
                        alt={photo.file_name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <ImageIcon className="w-8 h-8 text-gray-400" />
                      </div>
                    )}
                  </div>

                  {photo.is_primary && (
                    <div className="absolute top-2 left-2 bg-indigo-600 text-white px-2 py-1 rounded text-xs font-medium">
                      Primary
                    </div>
                  )}

                  <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    {!photo.is_primary && (
                      <button
                        onClick={() => handleSetPrimary(photo.id)}
                        className="p-1.5 bg-white rounded-full shadow-md hover:bg-gray-50"
                        title="Set as primary"
                      >
                        <Star className="w-4 h-4 text-yellow-400" />
                      </button>
                    )}
                    <button
                      onClick={() => handleDeletePhoto(photo.id)}
                      className="p-1.5 bg-white rounded-full shadow-md hover:bg-red-50"
                      title="Delete photo"
                    >
                      <Trash2 className="w-4 h-4 text-red-600" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Lot Details Form */}
      <div className="bg-white rounded-lg shadow-sm p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Item Details</h2>

        <div className="space-y-6">
          {/* Basic Info */}
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Item Name *
              </label>
              <input
                type="text"
                value={lot.name || ''}
                onChange={(e) => setLot({ ...lot, name: e.target.value })}
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
                value={lot.description || ''}
                onChange={(e) => setLot({ ...lot, description: e.target.value })}
                rows={4}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-600"
                placeholder="Detailed description including condition, provenance, and notable features..."
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Condition
                </label>
                <select
                  value={lot.condition || ''}
                  onChange={(e) => setLot({ ...lot, condition: e.target.value })}
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
    value={lot.quantity ?? ''}
    onChange={(e) => {
      const val = e.target.value;
      setLot({ ...lot, quantity: val === '' ? undefined : parseInt(val) });
    }}
    onBlur={() => {
      if (!lot.quantity) {
        setLot({ ...lot, quantity: 1 });
      }
    }}
    min="1"
    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-600"
  />
</div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Category
                </label>
                <input
                  type="text"
                  value={lot.category || ''}
                  onChange={(e) => setLot({ ...lot, category: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-600"
                  placeholder="e.g., Furniture, Art, Jewelry"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Style/Period
                </label>
                <input
                  type="text"
                  value={lot.style || ''}
                  onChange={(e) => setLot({ ...lot, style: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-600"
                  placeholder="e.g., Victorian, Modern, Art Deco"
                />
              </div>
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
                  onChange={(e) => setLot({ ...lot, estimate_low: parseFloat(e.target.value) || undefined })}
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
                  onChange={(e) => setLot({ ...lot, estimate_high: parseFloat(e.target.value) || undefined })}
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
                  onChange={(e) => setLot({ ...lot, starting_bid: parseFloat(e.target.value) || undefined })}
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
                  onChange={(e) => setLot({ ...lot, reserve_price: parseFloat(e.target.value) || undefined })}
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
                  onChange={(e) => setLot({ ...lot, buy_now_price: parseFloat(e.target.value) || undefined })}
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
                  onChange={(e) => setLot({ ...lot, sold_price: parseFloat(e.target.value) || undefined })}
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
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Height (in)
                </label>
                <input
                  type="number"
                  value={formatPrice(lot.height)}
                  onChange={(e) => setLot({ ...lot, height: parseFloat(e.target.value) || undefined })}
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
                  onChange={(e) => setLot({ ...lot, width: parseFloat(e.target.value) || undefined })}
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
                  onChange={(e) => setLot({ ...lot, depth: parseFloat(e.target.value) || undefined })}
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
                  onChange={(e) => setLot({ ...lot, weight: parseFloat(e.target.value) || undefined })}
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
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Origin
                </label>
                <input
                  type="text"
                  value={lot.origin || ''}
                  onChange={(e) => setLot({ ...lot, origin: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-600"
                  placeholder="e.g., France, England, USA"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Creator/Maker
                </label>
                <input
                  type="text"
                  value={lot.creator || ''}
                  onChange={(e) => setLot({ ...lot, creator: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-600"
                  placeholder="e.g., John Smith, Unknown"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Materials
                </label>
                <input
                  type="text"
                  value={lot.materials || ''}
                  onChange={(e) => setLot({ ...lot, materials: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-600"
                  placeholder="e.g., Walnut, Oak, Bronze"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Consignor
                </label>
                <input
                  type="text"
                  value={lot.consignor || ''}
                  onChange={(e) => setLot({ ...lot, consignor: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-600"
                  placeholder="Consignor name or reference"
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Webcam Modal */}
      {showCameraModal && (
        <WebcamModal
          onCapture={handleCaptureFromWebcam}
          onClose={() => setShowCameraModal(false)}
        />
      )}
    </div>
  );
}

// Webcam Modal Component
function WebcamModal({ onCapture, onClose }: { onCapture: (blob: Blob) => void; onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    startCamera();
    return () => {
      stopCamera();
    };
  }, []);

  const startCamera = async () => {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'environment', // Prefer back camera on mobile
          width: { ideal: 1920 },
          height: { ideal: 1080 }
        }
      });

      setStream(mediaStream);
      
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
    } catch (err) {
      console.error('Camera access error:', err);
      setError('Unable to access camera. Please check permissions.');
    }
  };

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
    }
  };

  const capturePhoto = () => {
    if (!videoRef.current || !canvasRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const context = canvas.getContext('2d');

    if (!context) return;

    // Set canvas size to video size
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    // Draw video frame to canvas
    context.drawImage(video, 0, 0, canvas.width, canvas.height);

    // Get image as data URL
    const imageDataUrl = canvas.toDataURL('image/jpeg', 0.9);
    setCapturedImage(imageDataUrl);

    // Stop camera
    stopCamera();
  };

  const retake = () => {
    setCapturedImage(null);
    startCamera();
  };

  const confirm = () => {
    if (!capturedImage || !canvasRef.current) return;

    // Convert canvas to blob
    canvasRef.current.toBlob((blob) => {
      if (blob) {
        onCapture(blob);
      }
    }, 'image/jpeg', 0.9);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-90 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">
            {capturedImage ? 'Review Photo' : 'Take Photo'}
          </h2>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-all"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Camera/Preview Area */}
        <div className="relative bg-black aspect-[4/3]">
          {error ? (
            <div className="absolute inset-0 flex items-center justify-center p-8">
              <div className="text-center">
                <Camera className="w-12 h-12 text-red-500 mx-auto mb-4" />
                <p className="text-white text-lg mb-4">{error}</p>
                <button
                  onClick={startCamera}
                  className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-all"
                >
                  <RotateCcw className="w-4 h-4 inline mr-2" />
                  Try Again
                </button>
              </div>
            </div>
          ) : capturedImage ? (
            <img 
              src={capturedImage} 
              alt="Captured" 
              className="w-full h-full object-contain"
            />
          ) : (
            <video
              ref={videoRef}
              autoPlay
              playsInline
              className="w-full h-full object-contain"
            />
          )}
        </div>

        {/* Hidden canvas for capture */}
        <canvas ref={canvasRef} className="hidden" />

        {/* Controls */}
        <div className="p-4 bg-gray-50 border-t border-gray-200">
          {capturedImage ? (
            <div className="flex gap-3">
              <button
                onClick={retake}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-all font-medium"
              >
                <RotateCcw className="w-5 h-5" />
                Retake
              </button>
              <button
                onClick={confirm}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-all font-medium"
              >
                <Check className="w-5 h-5" />
                Use Photo
              </button>
            </div>
          ) : (
            <button
              onClick={capturePhoto}
              disabled={!stream || error !== null}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all font-medium"
            >
              <Camera className="w-5 h-5" />
              Capture Photo
            </button>
          )}
        </div>
      </div>
    </div>
  );
}