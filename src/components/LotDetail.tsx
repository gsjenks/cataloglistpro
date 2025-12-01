// src/components/LotDetail.tsx
// UPDATED: Added webcam support for desktop browsers
// Mobile: Uses native camera, Desktop: Uses getUserMedia webcam interface

import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useFooter, type FooterAction } from '../context/FooterContext';
import ConnectivityService from '../services/ConnectivityService';
import SyncService from '../services/SyncService';
import { getNextLotNumber, isTemporaryNumber } from '../services/LotNumberService';
import offlineStorage from '../services/Offlinestorage';
import CameraService from '../services/CameraService';
import { editWithPhotoRoom, type PhotoRoomEditOptions, type PhotoRoomEditResult } from '../services/PhotoRoomService';
import { 
  getLACategories, 
  getLAOrigins, 
  getLAStyles, 
  getLACreators, 
  getLAMaterials 
} from '../services/LiveAuctioneersData';
import LAAutocomplete from '../components/LAAutocomplete';
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
  Check,
  Sun,
  ChevronDown,
  ChevronUp
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

  // Photo selection and AI editing state
  const [selectedPhotos, setSelectedPhotos] = useState<Set<string>>(new Set());
  const [showEditPanel, setShowEditPanel] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [progressText, setProgressText] = useState('');
  const [showPreview, setShowPreview] = useState(false);
  const [previewImages, setPreviewImages] = useState<{photoId: string; originalUrl: string; enhancedUrl: string; enhancedBlob: Blob}[]>([]);
  const [editOptions, setEditOptions] = useState<PhotoRoomEditOptions>({
    removeBackground: false,
    backgroundColor: undefined,
    fillPercentage: 85,
    lightBalance: 0,
    addShadow: false
  });

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

  // Reload photos when background sync completes (photos may have been downloaded)
  useEffect(() => {
    if (isNewLot || !lotId) return;

    let wasSyncing = false;
    
    const unsubscribe = SyncService.onSyncStatusChange((syncing: boolean) => {
      // When sync transitions from true to false, reload photos
      if (wasSyncing && !syncing) {
        console.log('Sync completed - reloading photos...');
        loadPhotos();
      }
      wasSyncing = syncing;
    });

    return unsubscribe;
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

  // Set footer actions - build dynamically based on platform and lot state
  useEffect(() => {
    const platformCapabilities = CameraService.getPlatformCapabilities();
    const hasWebCamera = platformCapabilities.supportsWebCamera;
    const hasNativeCamera = platformCapabilities.supportsNativeCamera;
    
    console.log('Ã°Å¸â€œÂ± Footer Setup:', { 
      isNewLot, 
      lotId,
      platform: platformCapabilities.platform,
      hasWebCamera, 
      hasNativeCamera
    });

    const footerActions: FooterAction[] = [
      {
        id: 'save',
        label: isNewLot ? 'Create Item' : 'Save Changes',
        icon: <Save className="w-4 h-4" />,
        onClick: () => { handleSave(); },
        variant: 'primary',
        disabled: !lot.name || saving,
        loading: saving
      }
    ];

    // Camera button - show for existing lots when camera is available
    if (!isNewLot && (hasWebCamera || hasNativeCamera)) {
      footerActions.push({
        id: 'camera',
        label: hasNativeCamera ? 'Camera' : 'Webcam',
        icon: <Camera className="w-4 h-4" />,
        onClick: () => { handleTakePhoto(); },
        variant: 'secondary',
        disabled: false,
        loading: false
      });
    }

    // Upload button - always show for existing lots
    if (!isNewLot) {
      footerActions.push({
        id: 'upload',
        label: 'Choose Files',
        icon: <Upload className="w-4 h-4" />,
        onClick: () => { document.getElementById('photo-upload')?.click(); },
        variant: 'secondary',
        disabled: false,
        loading: false
      });
    }

    // Back button
    footerActions.push({
      id: 'back',
      label: 'Back',
      icon: <ArrowLeft className="w-4 h-4" />,
      onClick: () => { navigate(`/sales/${saleId}`); },
      variant: 'secondary',
      disabled: false,
      loading: false
    });

    // Delete button - only for existing lots
    if (!isNewLot) {
      footerActions.push({
        id: 'delete',
        label: 'Delete',
        icon: <Trash2 className="w-4 h-4" />,
        onClick: () => { handleDelete(); },
        variant: 'danger',
        disabled: false,
        loading: false
      });
    }

    console.log('Ã°Å¸â€œÂ± Footer Actions:', footerActions.map(a => a.id));
    setActions(footerActions);
    
    return () => clearActions();
  }, [lot.name, photos.length, isNewLot, saving, saleId, isOnline, lotId]);

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

      // First, get photos from local storage
      const localPhotos = await offlineStorage.getPhotosByLot(lotId);
      if (localPhotos && localPhotos.length > 0) {
        photoData = localPhotos;
        
        // Try to get local blobs for each photo
        for (const photo of localPhotos) {
          const blob = await offlineStorage.getPhotoBlob(photo.id);
          if (blob) {
            const blobUrl = URL.createObjectURL(blob);
            urls[photo.id] = blobUrl;
          }
        }
      }

      // If online, fetch from Supabase for any missing photos or URLs
      if (isOnline) {
        const { data: remotePhotos, error } = await supabase
          .from('photos')
          .select('*')
          .eq('lot_id', lotId)
          .order('created_at', { ascending: true });

        if (error) throw error;

        if (remotePhotos && remotePhotos.length > 0) {
          // Add any remote photos not in local storage
          const localPhotoIds = new Set(photoData.map(p => p.id));
          const newRemotePhotos = remotePhotos.filter(p => !localPhotoIds.has(p.id));
          photoData = [...photoData, ...newRemotePhotos];

          // Get signed URLs for photos without local blobs
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

      console.log(`Loaded ${photoData.length} photos, ${Object.keys(urls).length} with URLs`);
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
      setSelectedPhotos(prev => {
        const next = new Set(prev);
        next.delete(photoId);
        return next;
      });

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

  // Photo selection functions
  const togglePhotoSelection = (photoId: string) => {
    setSelectedPhotos(prev => {
      const next = new Set(prev);
      if (next.has(photoId)) {
        next.delete(photoId);
      } else {
        next.add(photoId);
      }
      return next;
    });
  };

  const selectAllPhotos = () => setSelectedPhotos(new Set(photos.map(p => p.id)));
  const clearSelection = () => setSelectedPhotos(new Set());

  const resetEditOptions = () => {
    setEditOptions({
      removeBackground: false,
      backgroundColor: undefined,
      fillPercentage: 85,
      lightBalance: 0,
      addShadow: false
    });
  };

  // AI Photo editing with PhotoRoom
  const handleGeneratePreview = async () => {
    if (selectedPhotos.size === 0) {
      alert('Select at least one photo by tapping on it');
      return;
    }

    if (!editOptions.removeBackground && !editOptions.backgroundColor && 
        (editOptions.lightBalance ?? 0) === 0) {
      alert('Select at least one edit option');
      return;
    }

    setProcessing(true);
    setProgressText('Starting...');
    const previews: {photoId: string; originalUrl: string; enhancedUrl: string; enhancedBlob: Blob}[] = [];

    // Helper to convert blob to data URL
    const blobToDataUrl = (blob: Blob): Promise<string> => {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    };

    try {
      const selectedArray = Array.from(selectedPhotos);
      
      for (let i = 0; i < selectedArray.length; i++) {
        const photoId = selectedArray[i];
        const originalUrl = photoUrls[photoId];
        
        if (!originalUrl) continue;
        
        setProgressText(`Processing ${i + 1} of ${selectedArray.length}...`);

        // Get blob from storage or fetch from URL
        let imageBlob = await offlineStorage.getPhotoBlob(photoId);
        if (!imageBlob) {
          const response = await fetch(originalUrl);
          imageBlob = await response.blob();
        }

        // Convert original to stable data URL for preview
        const originalDataUrl = await blobToDataUrl(imageBlob);

        const result: PhotoRoomEditResult = await editWithPhotoRoom(imageBlob, editOptions);

        if (result.success && result.editedDataUrl && result.editedBlob) {
          previews.push({
            photoId,
            originalUrl: originalDataUrl,  // Use stable data URL
            enhancedUrl: result.editedDataUrl,
            enhancedBlob: result.editedBlob
          });
        } else {
          console.error(`Failed to process photo ${photoId}:`, result.error);
        }
      }

      if (previews.length === 0) {
        throw new Error('No images were processed successfully');
      }

      setPreviewImages(previews);
      setShowPreview(true);
    } catch (error) {
      console.error('Preview generation error:', error);
      alert(error instanceof Error ? error.message : 'Failed to generate preview');
    } finally {
      setProcessing(false);
      setProgressText('');
    }
  };

  const handleAcceptEnhancements = async () => {
    setProcessing(true);
    setProgressText('Saving enhanced images...');

    try {
      for (let i = 0; i < previewImages.length; i++) {
        const preview = previewImages[i];
        const photo = photos.find(p => p.id === preview.photoId);
        if (!photo) continue;

        setProgressText(`Saving ${i + 1} of ${previewImages.length}...`);

        // Save to local storage
        await offlineStorage.savePhoto(photo, preview.enhancedBlob);

        // Update URL in state
        const newBlobUrl = URL.createObjectURL(preview.enhancedBlob);
        setPhotoUrls(prev => ({ ...prev, [photo.id]: newBlobUrl }));

        // Upload to Supabase if online
        if (isOnline) {
          const fileName = `${lotId}/${Date.now()}_enhanced_${Math.random().toString(36).substring(7)}.png`;
          
          const { error: uploadError } = await supabase.storage
            .from('photos')
            .upload(fileName, preview.enhancedBlob);

          if (!uploadError) {
            await supabase
              .from('photos')
              .update({ 
                file_path: fileName,
                file_name: `enhanced_${photo.file_name}`,
                updated_at: new Date().toISOString()
              })
              .eq('id', photo.id);

            // Delete old file
            await supabase.storage.from('photos').remove([photo.file_path]);
          }
        }
      }

      setShowPreview(false);
      setPreviewImages([]);
      setSelectedPhotos(new Set());
      alert('Photos enhanced successfully!');
    } catch (error) {
      console.error('Save error:', error);
      alert('Failed to save enhanced images');
    } finally {
      setProcessing(false);
      setProgressText('');
    }
  };

  const handleRejectEnhancements = () => {
    setShowPreview(false);
    setPreviewImages([]);
  };

  const handleAIEnrich = async () => {
    if (photos.length === 0) {
      alert('Add at least one photo to use AI Detail Editor');
      return;
    }

    if (!isOnline) {
      alert('AI Detail Editor requires an internet connection');
      return;
    }

    try {
      setSaving(true);

      // Get primary photo first, then up to 2 more
      const primaryPhoto = photos.find(p => p.is_primary) || photos[0];
      const otherPhotos = photos.filter(p => p.id !== primaryPhoto.id).slice(0, 2);
      const photosToAnalyze = [primaryPhoto, ...otherPhotos];
      
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

      // Get dropdown lists for validation
      const categories = getLACategories().map(c => c.name);
      const styles = getLAStyles().map(s => s.name);
      const origins = getLAOrigins().map(o => o.name);
      const creators = getLACreators().map(c => c.name);
      const materials = getLAMaterials().map(m => m.name);

      // Build current item context
      const currentItemContext = {
        title: lot.name || '',
        description: lot.description || '',
        category: lot.category || '',
        style: lot.style || '',
        origin: lot.origin || '',
        creator: lot.creator || '',
        materials: lot.materials || '',
        condition: lot.condition || '',
        estimate_low: lot.estimate_low,
        estimate_high: lot.estimate_high,
        starting_bid: lot.starting_bid
      };

      // Call Gemini API with enhanced prompt based on Effective Auction Descriptions
      const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=' + import.meta.env.VITE_GEMINI_API_KEY, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [
              { text: `You are an expert auction house cataloger and appraiser. Analyze these ${photoBlobs.length} photo(s) of an auction item and research similar items to provide professional auction catalog information.

CURRENT ITEM DATA (use as context, improve where possible):
${JSON.stringify(currentItemContext, null, 2)}

=== EFFECTIVE AUCTION DESCRIPTION GUIDELINES ===

**TITLE RULES (Under 50 Characters)**
- Front-load the most important identifiers: brand, era, material, or model
- Use standard abbreviations to maximize information density
- Search algorithms weight titles heavily

BAD: "Old Table" or "Nice Vase"
GOOD: "18th C. Chippendale Mahogany Dining Table" or "19th C. Porcelain Vase, Gold Trim"

**DESCRIPTION STRUCTURE (150-300 words)**
1. ENGAGING OVERVIEW: Start with provenance, history, or compelling context. A plain item with a story outperforms a valuable item with none.
2. DETAILED SPECIFICATIONS: Dimensions, weight, materials, provenance documentation, included accessories
3. HONEST CONDITION REPORT: Use ONLY observable facts, never subjective language
   - BAD: "runs great", "excellent condition", "beautiful"
   - GOOD: "3-inch scratch on left side", "motor turns over but untested", "minor wear consistent with age"
4. CLEAR RESTRICTIONS: Note any expiration dates, usage limitations, or constraints

**CONDITION REPORT RULES**
- Describe ONLY what you can observe in the photos
- No subjective language ("nice", "beautiful", "great")
- If you can't prove a statement, don't include it
- Note visible damage, wear, repairs, or missing parts

**ESTIMATE RESEARCH**
- Base estimates on recent comparable auction sales
- Consider condition, rarity, and current market demand
- Starting bid typically 25-40% of low estimate

=== VALID DROPDOWN VALUES ===

CATEGORIES (pick the best match):
${categories.slice(0, 100).join(', ')}
${categories.length > 100 ? `... and ${categories.length - 100} more` : ''}

STYLES/PERIODS (pick the best match):
${styles.slice(0, 80).join(', ')}
${styles.length > 80 ? `... and ${styles.length - 80} more` : ''}

ORIGINS (pick the best match):
${origins.slice(0, 80).join(', ')}
${origins.length > 80 ? `... and ${origins.length - 80} more` : ''}

CREATORS/MAKERS (pick the best match, or leave empty if unknown):
${creators.slice(0, 50).join(', ')}
${creators.length > 50 ? `... and ${creators.length - 50} more` : ''}

MATERIALS (pick the best match):
${materials.slice(0, 80).join(', ')}
${materials.length > 80 ? `... and ${materials.length - 80} more` : ''}

RESPOND WITH ONLY THIS JSON FORMAT (no markdown, no explanation):
{
  "title": "Under 50 chars, front-load key identifiers (era, maker, material, type)",
  "description": "Professional description: 1) Engaging overview with context/provenance, 2) Specifications, 3) Factual condition report with observable details only, 4) Any restrictions",
  "category": "Exact match from CATEGORIES list",
  "style": "Exact match from STYLES list",
  "origin": "Exact match from ORIGINS list",
  "creator": "Exact match from CREATORS list or empty string",
  "materials": "Exact match from MATERIALS list",
  "estimate_low": 100,
  "estimate_high": 200,
  "starting_bid": 50,
  "condition": "Excellent|Very Good|Good|Fair|Poor|As Is",
  "research_notes": "Comparable sales and market factors used for estimates"
}` },
              ...base64Photos.map(data => ({
                inline_data: { mime_type: 'image/jpeg', data }
              }))
            ]
          }],
          generationConfig: {
            temperature: 0.3,
            maxOutputTokens: 2048
          }
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('AI API error:', errorText);
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

      // Validate and find closest matches for dropdown fields
      const findClosestMatch = (value: string, list: string[]): string => {
        if (!value) return '';
        const exactMatch = list.find(item => item.toLowerCase() === value.toLowerCase());
        if (exactMatch) return exactMatch;
        // Try partial match
        const partialMatch = list.find(item => 
          item.toLowerCase().includes(value.toLowerCase()) || 
          value.toLowerCase().includes(item.toLowerCase())
        );
        return partialMatch || value;
      };

      const validatedData = {
        title: (aiData.title || '').substring(0, 50),
        description: aiData.description || '',
        category: findClosestMatch(aiData.category, categories),
        style: findClosestMatch(aiData.style, styles),
        origin: findClosestMatch(aiData.origin, origins),
        creator: findClosestMatch(aiData.creator, creators),
        materials: findClosestMatch(aiData.materials, materials),
        condition: aiData.condition || '',
        estimate_low: typeof aiData.estimate_low === 'number' ? aiData.estimate_low : undefined,
        estimate_high: typeof aiData.estimate_high === 'number' ? aiData.estimate_high : undefined,
        starting_bid: typeof aiData.starting_bid === 'number' ? aiData.starting_bid : undefined
      };

      // Update lot with AI data
      setLot(prev => ({
        ...prev,
        name: validatedData.title || prev.name,
        description: validatedData.description || prev.description,
        category: validatedData.category || prev.category,
        style: validatedData.style || prev.style,
        origin: validatedData.origin || prev.origin,
        creator: validatedData.creator || prev.creator,
        materials: validatedData.materials || prev.materials,
        condition: validatedData.condition || prev.condition,
        estimate_low: validatedData.estimate_low ?? prev.estimate_low,
        estimate_high: validatedData.estimate_high ?? prev.estimate_high,
        starting_bid: validatedData.starting_bid ?? prev.starting_bid,
      }));

      // Show research notes if available
      if (aiData.research_notes) {
        console.log('AI Research Notes:', aiData.research_notes);
      }

      alert('AI Detail Editor complete! Review the suggested values and save.');
    } catch (error) {
      console.error('AI Detail Editor error:', error);
      alert('Failed to analyze item with AI');
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
          SyncService.startOperation();
          try {
            const { error } = await supabase.from('lots').insert(newLot);
            if (error) throw error;
          } finally {
            SyncService.endOperation();
          }
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
          SyncService.startOperation();
          try {
            const { error } = await supabase
              .from('lots')
              .update(updatedLot)
              .eq('id', lotId);

            if (error) throw error;
          } finally {
            SyncService.endOperation();
          }
        }

        alert('Item saved successfully');
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

      if (isOnline) {
        SyncService.startOperation();
      }

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
        SyncService.endOperation();
      }

      navigate(`/sales/${saleId}`);
    } catch (error) {
      console.error('Error deleting lot:', error);
      alert('Failed to delete item');
      if (isOnline) {
        SyncService.endOperation();
      }
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
            <>
              {/* AI Photo Editor Panel */}
              <div className="bg-gradient-to-r from-indigo-50 to-purple-50 border border-indigo-200 rounded-xl overflow-hidden mb-4">
                <button
                  onClick={() => setShowEditPanel(!showEditPanel)}
                  className="w-full flex items-center justify-between px-4 py-3 hover:bg-indigo-100/50 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-5 h-5 text-indigo-600" />
                    <span className="font-semibold text-indigo-900">AI Photo Editor</span>
                    {selectedPhotos.size > 0 && (
                      <span className="px-2 py-0.5 bg-indigo-600 text-white text-xs rounded-full">
                        {selectedPhotos.size} selected
                      </span>
                    )}
                  </div>
                  <span className="text-indigo-600">{showEditPanel ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}</span>
                </button>

                {showEditPanel && (
                  <div className="p-4 border-t border-indigo-200 space-y-4">
                    {/* Selection Controls */}
                    <div className="flex items-center gap-3 flex-wrap">
                      <button onClick={selectAllPhotos} className="text-sm text-indigo-600 hover:underline">
                        Select All
                      </button>
                      <span className="text-gray-300">|</span>
                      <button onClick={clearSelection} className="text-sm text-indigo-600 hover:underline">
                        Clear Selection
                      </button>
                      <button onClick={resetEditOptions} className="ml-auto text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1">
                        <RotateCcw className="w-3 h-3" /> Reset
                      </button>
                    </div>

                    <p className="text-xs text-gray-500">Tap photos below to select them for editing</p>

                    {/* Background Options */}
                    <div className="space-y-2">
                      <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
                        <ImageIcon className="w-4 h-4" /> Background
                      </label>
                      <div className="flex flex-wrap gap-2">
                        {[
                          { value: undefined, label: 'Keep', color: 'bg-gray-200' },
                          { value: 'transparent', label: 'Remove', color: 'bg-gradient-to-br from-gray-100 to-gray-300' },
                          { value: 'white', label: 'White', color: 'bg-white border' },
                          { value: 'black', label: 'Black', color: 'bg-black' },
                          { value: 'grey', label: 'Grey', color: 'bg-gray-400' },
                        ].map((opt) => (
                          <button
                            key={opt.label}
                            onClick={() => setEditOptions({ 
                              ...editOptions, 
                              backgroundColor: opt.value as string | undefined,
                              removeBackground: opt.value === 'transparent'
                            })}
                            className={`px-3 py-1.5 rounded-lg text-sm transition-all ${
                              editOptions.backgroundColor === opt.value || 
                              (!editOptions.backgroundColor && !opt.value)
                                ? 'ring-2 ring-indigo-500 ring-offset-2'
                                : 'hover:ring-1 hover:ring-gray-300'
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              <div className={`w-4 h-4 rounded ${opt.color}`} />
                              <span>{opt.label}</span>
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Fill Percentage */}
                    <div className="space-y-2">
                      <label className="flex items-center justify-between text-sm font-medium text-gray-700">
                        <span>Fill Frame: {editOptions.fillPercentage ?? 85}%</span>
                      </label>
                      <input
                        type="range"
                        min="50"
                        max="100"
                        value={editOptions.fillPercentage ?? 85}
                        onChange={(e) => setEditOptions({ ...editOptions, fillPercentage: parseInt(e.target.value) })}
                        className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                      />
                    </div>

                    {/* Light Balance */}
                    <div className="space-y-2">
                      <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
                        <Sun className="w-4 h-4" /> Light: {(editOptions.lightBalance ?? 0) > 0 ? '+' : ''}{editOptions.lightBalance ?? 0}
                      </label>
                      <input
                        type="range"
                        min="-100"
                        max="100"
                        value={editOptions.lightBalance ?? 0}
                        onChange={(e) => setEditOptions({ ...editOptions, lightBalance: parseInt(e.target.value) })}
                        className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                      />
                    </div>

                    {/* Process Button */}
                    <button
                      onClick={handleGeneratePreview}
                      disabled={processing || selectedPhotos.size === 0}
                      className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:bg-indigo-300 disabled:cursor-not-allowed transition-colors font-medium"
                    >
                      {processing ? (
                        <>
                          <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
                          <span>{progressText || 'Processing...'}</span>
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-4 h-4" />
                          <span>Generate Preview</span>
                        </>
                      )}
                    </button>
                  </div>
                )}
              </div>

              {/* Photo Grid with Selection */}
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                {photos.map(photo => {
                  const isSelected = selectedPhotos.has(photo.id);
                  return (
                    <div 
                      key={photo.id} 
                      className={`relative rounded-lg overflow-hidden bg-gray-100 transition-all ${
                        isSelected ? 'ring-4 ring-indigo-500 shadow-lg scale-[1.02]' : ''
                      }`}
                    >
                      {/* Clickable Image for Selection */}
                      <div 
                        className="aspect-square cursor-pointer"
                        onClick={() => togglePhotoSelection(photo.id)}
                      >
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

                        {/* Selection Overlay */}
                        {isSelected && (
                          <div className="absolute inset-0 bg-indigo-600/20 flex items-center justify-center pointer-events-none">
                            <div className="w-10 h-10 bg-indigo-600 rounded-full flex items-center justify-center shadow-lg">
                              <Check className="w-6 h-6 text-white" />
                            </div>
                          </div>
                        )}
                      </div>

                      {photo.is_primary && (
                        <div className="absolute top-2 left-2 bg-indigo-600 text-white px-2 py-1 rounded text-xs font-medium shadow-sm">
                          Primary
                        </div>
                      )}

                      {/* Action buttons bar */}
                      <div className="flex items-center justify-between px-2 py-1.5 bg-gray-50 border-t border-gray-200">
                        <span className="text-xs text-gray-500 truncate max-w-[50%]">
                          {photo.file_name?.split('/').pop()?.substring(0, 12) || 'Photo'}
                        </span>
                        <div className="flex gap-1">
                          {!photo.is_primary && (
                            <button
                              onClick={(e) => { e.stopPropagation(); handleSetPrimary(photo.id); }}
                              className="p-1.5 bg-white rounded-full shadow-sm border border-gray-200 active:bg-yellow-100"
                              title="Set as primary"
                            >
                              <Star className="w-4 h-4 text-yellow-500" />
                            </button>
                          )}
                          <button
                            onClick={(e) => { e.stopPropagation(); handleDeletePhoto(photo.id); }}
                            className="p-1.5 bg-white rounded-full shadow-sm border border-gray-200 active:bg-red-100"
                            title="Delete photo"
                          >
                            <Trash2 className="w-4 h-4 text-red-600" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}

      {/* Lot Details Form */}
      <div className="bg-white rounded-lg shadow-sm p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Item Details</h2>
          {photos.length > 0 && isOnline && !isNewLot && (
            <button
              onClick={handleAIEnrich}
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
              <LAAutocomplete
                label="Category"
                value={lot.category || ''}
                onChange={(value) => setLot({ ...lot, category: value })}
                items={getLACategories()}
                placeholder="Search categories..."
              />

              <LAAutocomplete
                label="Style/Period"
                value={lot.style || ''}
                onChange={(value) => setLot({ ...lot, style: value })}
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
              <LAAutocomplete
                label="Origin"
                value={lot.origin || ''}
                onChange={(value) => setLot({ ...lot, origin: value })}
                items={getLAOrigins()}
                placeholder="Search origins..."
              />

              <LAAutocomplete
                label="Creator/Maker"
                value={lot.creator || ''}
                onChange={(value) => setLot({ ...lot, creator: value })}
                items={getLACreators()}
                placeholder="Search creators..."
              />

              <LAAutocomplete
                label="Materials"
                value={lot.materials || ''}
                onChange={(value) => setLot({ ...lot, materials: value })}
                items={getLAMaterials()}
                placeholder="Search materials..."
              />

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

      {/* AI Enhancement Preview Modal */}
      {showPreview && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-5xl w-full max-h-[90vh] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between p-4 border-b">
              <h2 className="text-lg font-semibold">Preview Enhanced Images</h2>
              <button onClick={handleRejectEnhancements} className="p-2 hover:bg-gray-100 rounded-full">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {previewImages.map((preview) => (
                  <div key={preview.photoId} className="space-y-3">
                    <div>
                      <p className="text-xs font-medium text-gray-500 mb-1">ORIGINAL</p>
                      <div className="aspect-square bg-gray-100 rounded-lg overflow-hidden">
                        <img src={preview.originalUrl} alt="Original" className="w-full h-full object-contain" />
                      </div>
                    </div>
                    <div>
                      <p className="text-xs font-medium text-indigo-600 mb-1">ENHANCED</p>
                      <div className="aspect-square bg-gray-100 rounded-lg overflow-hidden border-2 border-indigo-500">
                        <img src={preview.enhancedUrl} alt="Enhanced" className="w-full h-full object-contain" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 p-4 border-t bg-gray-50">
              <button onClick={handleRejectEnhancements}
                className="px-5 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-100 transition-colors">
                Cancel
              </button>
              <button onClick={handleAcceptEnhancements} disabled={processing}
                className="px-5 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:bg-indigo-300 transition-colors shadow-sm">
                {processing ? progressText || 'Saving...' : 'Accept & Apply'}
              </button>
            </div>
          </div>
        </div>
      )}

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