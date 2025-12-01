// src/components/LotDetail.tsx
// OPTIMIZED: Split into smaller components, memoized handlers

import { useState, useEffect, useCallback, useRef } from 'react';
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
import type { Lot, Photo } from '../types';
import { toTitleCase } from '../utils/titleCase';
import { ArrowLeft, Save, Trash2, Upload, Camera, Plus } from 'lucide-react';

// Split components
import WebcamModal from './WebcamModal';
import PhotoPreviewModal from './PhotoPreviewModal';
import LotPhotoSection from './LotPhotoSection';
import LotForm from './LotForm';

function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
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
    name: '', description: '', quantity: 1, condition: '', category: '',
    style: '', origin: '', creator: '', materials: '', dimension_unit: 'inches', consignor: ''
  });
  const lotRef = useRef(lot);
  
  // Keep ref in sync with state
  useEffect(() => {
    lotRef.current = lot;
  }, [lot]);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const isNewLot = lotId === 'new';

  // Photo editing state
  const [selectedPhotos, setSelectedPhotos] = useState<Set<string>>(new Set());
  const [showEditPanel, setShowEditPanel] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [progressText, setProgressText] = useState('');
  const [showPreview, setShowPreview] = useState(false);
  const [previewImages, setPreviewImages] = useState<{photoId: string; originalUrl: string; enhancedUrl: string; enhancedBlob: Blob}[]>([]);
  const [editOptions, setEditOptions] = useState<PhotoRoomEditOptions>({
    removeBackground: false, backgroundColor: undefined, fillPercentage: 85, lightBalance: 0, addShadow: false
  });

  // Connectivity monitoring
  useEffect(() => {
    const unsubscribe = ConnectivityService.onStatusChange(setIsOnline);
    return unsubscribe;
  }, []);

  // Load lot data
  useEffect(() => {
    setLoading(true);
    if (isNewLot) initializeNewLot();
    else loadLot();
  }, [lotId, saleId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load photos
  useEffect(() => {
    if (!isNewLot && lotId) loadPhotos();
  }, [lotId, isNewLot]); // eslint-disable-line react-hooks/exhaustive-deps

  // Sync completion reload
  useEffect(() => {
    if (isNewLot || !lotId) return;
    let wasSyncing = false;
    const unsubscribe = SyncService.onSyncStatusChange((syncing: boolean) => {
      if (wasSyncing && !syncing) loadPhotos();
      wasSyncing = syncing;
    });
    return unsubscribe;
  }, [lotId, isNewLot]); // eslint-disable-line react-hooks/exhaustive-deps

  // Cleanup URLs
  useEffect(() => {
    return () => {
      Object.values(photoUrls).forEach(url => {
        if (url.startsWith('blob:')) URL.revokeObjectURL(url);
      });
    };
  }, [photoUrls]);

  // Footer actions
  useEffect(() => {
    const caps = CameraService.getPlatformCapabilities();
    const actions: FooterAction[] = [
      {
        id: 'save', label: isNewLot ? 'Create Item' : 'Save Changes',
        icon: <Save className="w-4 h-4" />, onClick: handleSave,
        variant: 'primary', disabled: !lot.name || saving, loading: saving
      }
    ];

    if (!isNewLot) {
      actions.push({
        id: 'new-item', label: 'New Item',
        icon: <Plus className="w-4 h-4" />, onClick: handleSaveAndNew,
        variant: 'secondary', disabled: !lot.name || saving
      });
    }

    if (!isNewLot && (caps.supportsWebCamera || caps.supportsNativeCamera)) {
      actions.push({
        id: 'camera', label: caps.supportsNativeCamera ? 'Camera' : 'Webcam',
        icon: <Camera className="w-4 h-4" />, onClick: handleTakePhoto, variant: 'secondary'
      });
    }

    if (!isNewLot) {
      actions.push({
        id: 'upload', label: 'Choose Files', icon: <Upload className="w-4 h-4" />,
        onClick: () => document.getElementById('photo-upload')?.click(), variant: 'secondary'
      });
    }

    actions.push({
      id: 'back', label: 'Back', icon: <ArrowLeft className="w-4 h-4" />,
      onClick: () => navigate(`/sales/${saleId}`), variant: 'secondary'
    });

    if (!isNewLot) {
      actions.push({
        id: 'delete', label: 'Delete', icon: <Trash2 className="w-4 h-4" />,
        onClick: handleDelete, variant: 'danger'
      });
    }

    setActions(actions);
    return () => clearActions();
  }, [lot.name, isNewLot, saving, saleId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Data loading functions
  const initializeNewLot = async () => {
    try {
      const lotNumber = await getNextLotNumber(saleId!, isOnline);
      setLot({
        name: '', description: '', quantity: 1, condition: '', category: '',
        style: '', origin: '', creator: '', materials: '', dimension_unit: 'inches', consignor: '',
        lot_number: lotNumber, sale_id: saleId
      });
      setPhotos([]);
      setPhotoUrls({});
    } catch (e) { console.error('Error initializing new lot:', e); }
    finally { setLoading(false); }
  };

  const loadLot = async () => {
    if (!lotId) return;
    setLoading(true);
    try {
      if (isOnline) {
        const { data, error } = await supabase.from('lots').select('*').eq('id', lotId).single();
        if (error) throw error;
        if (data) { setLot(data); await offlineStorage.upsertLot(data); }
      } else {
        const offlineLot = await offlineStorage.getLot(lotId);
        if (offlineLot) setLot(offlineLot);
      }
    } catch (e) { console.error('Error loading lot:', e); alert('Failed to load item'); }
    finally { setLoading(false); }
  };

  const loadPhotos = async () => {
    if (!lotId) return;
    console.log(`ðŸ“· LotDetail loadPhotos for lot ${lotId.slice(0,8)}`);
    try {
      const urls: Record<string, string> = {};
      let photoData: Photo[] = [];

      // Get local photo metadata
      const localPhotos = await offlineStorage.getPhotosByLot(lotId);
      console.log(`ðŸ“· Local photos found: ${localPhotos?.length || 0}`);
      
      if (localPhotos?.length) {
        photoData = localPhotos;
        // Try to get local blobs
        for (const photo of localPhotos) {
          const blob = await offlineStorage.getPhotoBlob(photo.id);
          if (blob) urls[photo.id] = URL.createObjectURL(blob);
        }
        console.log(`ðŸ“· Local blobs found: ${Object.keys(urls).length}`);
      }

      if (isOnline) {
        // Fetch remote photos to ensure we have all metadata
        const { data: remotePhotos, error } = await supabase
          .from('photos').select('*').eq('lot_id', lotId).order('created_at', { ascending: true });
        
        console.log(`ðŸ“· Remote photos: ${remotePhotos?.length || 0}, error: ${error?.message || 'none'}`);
        
        if (error) throw error;

        if (remotePhotos?.length) {
          // Merge remote photos with local (in case any are missing locally)
          const localIds = new Set(photoData.map(p => p.id));
          for (const remote of remotePhotos) {
            if (!localIds.has(remote.id)) {
              photoData.push(remote);
              // Cache metadata locally
              await offlineStorage.upsertPhoto({ ...remote, synced: true });
            }
          }

          // Generate signed URLs for ALL photos that don't have local blobs
          let signedUrlCount = 0;
          for (const photo of photoData) {
            if (!urls[photo.id]) {
              const { data: urlData } = await supabase.storage.from('photos').createSignedUrl(photo.file_path, 3600);
              if (urlData?.signedUrl) {
                urls[photo.id] = urlData.signedUrl;
                signedUrlCount++;
              }
            }
          }
          console.log(`ðŸ“· Signed URLs generated: ${signedUrlCount}`);
        }
      }

      console.log(`ðŸ“· Final: ${photoData.length} photos, ${Object.keys(urls).length} URLs`);
      setPhotos(photoData);
      setPhotoUrls(urls);
    } catch (e) { console.error('Error loading photos:', e); }
  };

  // Photo handlers
  const handleTakePhoto = useCallback(async () => {
    if (!lotId || isNewLot) { alert('Please save the lot first'); return; }
    const caps = CameraService.getPlatformCapabilities();
    
    if (caps.isNative) {
      try {
        const isPrimary = photos.length === 0;
        const result = await CameraService.takePhoto(lotId, isPrimary);
        if (!result.success) { alert(result.error || 'Failed to capture photo'); return; }
        if (result.photoId && result.blobUrl) {
          const newPhoto: Photo = {
            id: result.photoId, lot_id: lotId, file_path: `${lotId}/${result.photoId}.jpg`,
            file_name: `Photo_${Date.now()}.jpg`, is_primary: isPrimary,
            created_at: new Date().toISOString(), updated_at: new Date().toISOString(), synced: false
          };
          setPhotos(prev => [...prev, newPhoto]);
          setPhotoUrls(prev => ({ ...prev, [result.photoId!]: result.blobUrl! }));
        }
      } catch (e) { console.error('Error taking photo:', e); alert('Failed to capture photo'); }
    } else {
      setShowCameraModal(true);
    }
  }, [lotId, isNewLot, photos.length]);

  const handleCaptureFromWebcam = useCallback(async (blob: Blob) => {
    if (!lotId) return;
    try {
      const photoId = generateUUID();
      const isPrimary = photos.length === 0;
      const blobUrl = URL.createObjectURL(blob);

      const metadata: Photo = {
        id: photoId, lot_id: lotId, file_path: `${lotId}/${photoId}.jpg`,
        file_name: `Webcam_${Date.now()}.jpg`, is_primary: isPrimary,
        created_at: new Date().toISOString(), updated_at: new Date().toISOString(), synced: false
      };

      await offlineStorage.savePhoto(metadata, blob);
      setPhotos(prev => [...prev, metadata]);
      setPhotoUrls(prev => ({ ...prev, [photoId]: blobUrl }));

      if (isOnline) {
        setTimeout(async () => {
          try {
            const file = new File([blob], `${photoId}.jpg`, { type: blob.type });
            const { error } = await supabase.storage.from('photos').upload(`${lotId}/${photoId}.jpg`, file, { upsert: true });
            if (!error) {
              await supabase.from('photos').upsert({ id: photoId, lot_id: lotId, file_path: `${lotId}/${photoId}.jpg`, file_name: metadata.file_name, is_primary: isPrimary });
              metadata.synced = true;
              await offlineStorage.updatePhoto(metadata);
            }
          } catch (e) { console.error('Background sync failed:', e); }
        }, 1000);
      }
      setShowCameraModal(false);
    } catch (e) { console.error('Error saving webcam photo:', e); alert('Failed to save photo'); }
  }, [lotId, photos.length, isOnline]);

  const handlePhotoUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files?.length || !lotId || isNewLot) {
      if (!lotId || isNewLot) alert('Please save the lot first');
      e.target.value = '';
      return;
    }

    try {
      const result = await CameraService.handleFileInput(files, lotId);
      if (result.success > 0) {
        const newPhotos = result.photos.map((p, i) => ({
          id: p.photoId, lot_id: lotId, file_path: `${lotId}/${p.photoId}.jpg`,
          file_name: `Photo_${Date.now()}_${i}.jpg`, is_primary: photos.length === 0 && i === 0,
          created_at: new Date().toISOString(), updated_at: new Date().toISOString(), synced: false
        }));
        setPhotos(prev => [...prev, ...newPhotos]);
        const newUrls: Record<string, string> = {};
        result.photos.forEach(p => { newUrls[p.photoId] = p.blobUrl; });
        setPhotoUrls(prev => ({ ...prev, ...newUrls }));
      }
      if (result.failed > 0) alert(`${result.failed} file(s) failed to upload`);
      e.target.value = '';
    } catch (err) { console.error('Error uploading photos:', err); alert('Failed to upload photos'); e.target.value = ''; }
  }, [lotId, isNewLot, photos.length]);

  const handleSetPrimary = useCallback(async (photoId: string) => {
    try {
      const updated = photos.map(p => ({ ...p, is_primary: p.id === photoId }));
      setPhotos(updated);
      await Promise.all(updated.map(p => offlineStorage.upsertPhoto(p)));
      if (isOnline) {
        await supabase.from('photos').update({ is_primary: false }).eq('lot_id', lotId);
        await supabase.from('photos').update({ is_primary: true }).eq('id', photoId);
      }
    } catch (e) { console.error('Error setting primary:', e); alert('Failed to set primary photo'); }
  }, [photos, lotId, isOnline]);

  const handleDeletePhoto = useCallback(async (photoId: string) => {
    if (!window.confirm('Delete this photo?')) return;
    try {
      setPhotos(prev => prev.filter(p => p.id !== photoId));
      setSelectedPhotos(prev => { const next = new Set(prev); next.delete(photoId); return next; });
      if (photoUrls[photoId]?.startsWith('blob:')) URL.revokeObjectURL(photoUrls[photoId]);
      setPhotoUrls(prev => { const next = { ...prev }; delete next[photoId]; return next; });
      await offlineStorage.deletePhoto(photoId);
      if (isOnline) {
        const photo = photos.find(p => p.id === photoId);
        if (photo) {
          await supabase.storage.from('photos').remove([photo.file_path]);
          await supabase.from('photos').delete().eq('id', photoId);
        }
      }
    } catch (e) { console.error('Error deleting photo:', e); alert('Failed to delete photo'); }
  }, [photos, photoUrls, isOnline]);

  // Photo selection handlers
  const togglePhotoSelection = useCallback((photoId: string) => {
    setSelectedPhotos(prev => { const next = new Set(prev); if (next.has(photoId)) { next.delete(photoId); } else { next.add(photoId); } return next; });
  }, []);
  const selectAllPhotos = useCallback(() => setSelectedPhotos(new Set(photos.map(p => p.id))), [photos]);
  const clearSelection = useCallback(() => setSelectedPhotos(new Set()), []);
  const resetEditOptions = useCallback(() => setEditOptions({ removeBackground: false, backgroundColor: undefined, fillPercentage: 85, lightBalance: 0, addShadow: false }), []);
  const toggleEditPanel = useCallback(() => setShowEditPanel(p => !p), []);

  // AI photo editing
  const handleGeneratePreview = useCallback(async () => {
    if (selectedPhotos.size === 0) { alert('Select at least one photo'); return; }
    if (!editOptions.removeBackground && !editOptions.backgroundColor && (editOptions.lightBalance ?? 0) === 0) {
      alert('Select at least one edit option'); return;
    }

    setProcessing(true);
    setProgressText('Starting...');
    const previews: typeof previewImages = [];

    const blobToDataUrl = (blob: Blob): Promise<string> => new Promise((res, rej) => {
      const reader = new FileReader();
      reader.onloadend = () => res(reader.result as string);
      reader.onerror = rej;
      reader.readAsDataURL(blob);
    });

    try {
      const selected = Array.from(selectedPhotos);
      for (let i = 0; i < selected.length; i++) {
        const photoId = selected[i];
        const originalUrl = photoUrls[photoId];
        if (!originalUrl) continue;
        setProgressText(`Processing ${i + 1} of ${selected.length}...`);

        let imageBlob = await offlineStorage.getPhotoBlob(photoId);
        if (!imageBlob) { const resp = await fetch(originalUrl); imageBlob = await resp.blob(); }
        const originalDataUrl = await blobToDataUrl(imageBlob);
        const result: PhotoRoomEditResult = await editWithPhotoRoom(imageBlob, editOptions);

        if (result.success && result.editedDataUrl && result.editedBlob) {
          previews.push({ photoId, originalUrl: originalDataUrl, enhancedUrl: result.editedDataUrl, enhancedBlob: result.editedBlob });
        }
      }

      if (previews.length === 0) throw new Error('No images processed successfully');
      setPreviewImages(previews);
      setShowPreview(true);
    } catch (e) { console.error('Preview error:', e); alert(e instanceof Error ? e.message : 'Failed to generate preview'); }
    finally { setProcessing(false); setProgressText(''); }
  }, [selectedPhotos, editOptions, photoUrls]);

  const handleAcceptEnhancements = useCallback(async () => {
    setProcessing(true);
    setProgressText('Saving enhanced images...');
    try {
      for (let i = 0; i < previewImages.length; i++) {
        const preview = previewImages[i];
        const photo = photos.find(p => p.id === preview.photoId);
        if (!photo) continue;
        setProgressText(`Saving ${i + 1} of ${previewImages.length}...`);

        await offlineStorage.savePhoto(photo, preview.enhancedBlob);
        const newBlobUrl = URL.createObjectURL(preview.enhancedBlob);
        setPhotoUrls(prev => ({ ...prev, [photo.id]: newBlobUrl }));

        if (isOnline) {
          const fileName = `${lotId}/${Date.now()}_enhanced_${Math.random().toString(36).substring(7)}.png`;
          const { error } = await supabase.storage.from('photos').upload(fileName, preview.enhancedBlob);
          if (!error) {
            await supabase.from('photos').update({ file_path: fileName, file_name: `enhanced_${photo.file_name}`, updated_at: new Date().toISOString() }).eq('id', photo.id);
            await supabase.storage.from('photos').remove([photo.file_path]);
          }
        }
      }
      setShowPreview(false);
      setPreviewImages([]);
      setSelectedPhotos(new Set());
      alert('Photos enhanced successfully!');
    } catch (e) { console.error('Save error:', e); alert('Failed to save enhanced images'); }
    finally { setProcessing(false); setProgressText(''); }
  }, [previewImages, photos, lotId, isOnline]);

  const handleRejectEnhancements = useCallback(() => { setShowPreview(false); setPreviewImages([]); }, []);

  // AI Enrich handler (kept inline due to Gemini API complexity)
  const handleAIEnrich = useCallback(async () => {
    if (photos.length === 0) { alert('Add at least one photo'); return; }
    if (!isOnline) { alert('AI Detail Editor requires internet'); return; }

    setSaving(true);
    try {
      const primaryPhoto = photos.find(p => p.is_primary) || photos[0];
      const otherPhotos = photos.filter(p => p.id !== primaryPhoto.id).slice(0, 2);
      const photosToAnalyze = [primaryPhoto, ...otherPhotos];

      const photoBlobs: Blob[] = [];
      for (const photo of photosToAnalyze) {
        const blob = await offlineStorage.getPhotoBlob(photo.id);
        if (blob) photoBlobs.push(blob);
      }
      if (photoBlobs.length === 0) { alert('No photos available'); return; }

      const base64Photos = await Promise.all(photoBlobs.map(blob => new Promise<string>((res) => {
        const reader = new FileReader();
        reader.onloadend = () => res((reader.result as string).split(',')[1]);
        reader.readAsDataURL(blob);
      })));

      const categories = getLACategories().map(c => c.name);
      const styles = getLAStyles().map(s => s.name);
      const origins = getLAOrigins().map(o => o.name);
      const creators = getLACreators().map(c => c.name);
      const materials = getLAMaterials().map(m => m.name);

      const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=' + import.meta.env.VITE_GEMINI_API_KEY, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [
              { text: `You are an auction cataloger. Analyze these photos and provide JSON with: title (under 50 chars), description, category, style, origin, creator, materials, condition, estimate_low, estimate_high, starting_bid. Use valid dropdown values from: CATEGORIES: ${categories.slice(0, 50).join(', ')}. STYLES: ${styles.slice(0, 40).join(', ')}. ORIGINS: ${origins.slice(0, 40).join(', ')}. CREATORS: ${creators.slice(0, 30).join(', ')}. MATERIALS: ${materials.slice(0, 40).join(', ')}. Respond with ONLY valid JSON.` },
              ...base64Photos.map(data => ({ inline_data: { mime_type: 'image/jpeg', data } }))
            ]
          }],
          generationConfig: { temperature: 0.3, maxOutputTokens: 2048 }
        })
      });

      if (!response.ok) throw new Error('AI analysis failed');
      const result = await response.json();
      const text = result.candidates[0].content.parts[0].text;
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('Failed to parse AI response');

      const aiData = JSON.parse(jsonMatch[0]);
      const findMatch = (val: string, list: string[]) => {
        if (!val) return '';
        return list.find(i => i.toLowerCase() === val.toLowerCase()) ||
               list.find(i => i.toLowerCase().includes(val.toLowerCase()) || val.toLowerCase().includes(i.toLowerCase())) || val;
      };

      setLot(prev => ({
        ...prev,
        name: toTitleCase((aiData.title || '').substring(0, 50)) || prev.name,
        description: aiData.description || prev.description,
        category: findMatch(aiData.category, categories) || prev.category,
        style: findMatch(aiData.style, styles) || prev.style,
        origin: findMatch(aiData.origin, origins) || prev.origin,
        creator: findMatch(aiData.creator, creators) || prev.creator,
        materials: findMatch(aiData.materials, materials) || prev.materials,
        condition: aiData.condition || prev.condition,
        estimate_low: typeof aiData.estimate_low === 'number' ? aiData.estimate_low : prev.estimate_low,
        estimate_high: typeof aiData.estimate_high === 'number' ? aiData.estimate_high : prev.estimate_high,
        starting_bid: typeof aiData.starting_bid === 'number' ? aiData.starting_bid : prev.starting_bid,
      }));
      alert('AI Detail Editor complete! Review and save.');
    } catch (e) { console.error('AI error:', e); alert('Failed to analyze item'); }
    finally { setSaving(false); }
  }, [photos, isOnline]);

  // Save/Delete handlers
  const handleSave = useCallback(async () => {
    const currentLot = lotRef.current;
    if (!currentLot.name) { alert('Please enter an item name'); return; }
    if (!saleId) { alert('No sale selected'); return; }
    setSaving(true);
    try {
      if (isNewLot) {
        const newLot: Lot = { ...currentLot, sale_id: saleId, id: generateUUID(), name: toTitleCase(currentLot.name || ''), created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
        await offlineStorage.upsertLot(newLot);
        if (isOnline) {
          SyncService.startOperation();
          try { await supabase.from('lots').insert(newLot); } finally { SyncService.endOperation(); }
        }
        navigate(`/sales/${saleId}/lots/${newLot.id}`, { replace: true });
      } else {
        if (!currentLot.id || !currentLot.sale_id) { alert('Invalid lot data'); return; }
        const updatedLot: Lot = { ...currentLot, id: currentLot.id, sale_id: currentLot.sale_id, name: toTitleCase(currentLot.name || ''), updated_at: new Date().toISOString() };
        setLot(updatedLot);
        await offlineStorage.upsertLot(updatedLot);
        if (isOnline) {
          SyncService.startOperation();
          try { await supabase.from('lots').update(updatedLot).eq('id', lotId); } finally { SyncService.endOperation(); }
        }
        alert('Item saved successfully');
      }
    } catch (e) { console.error('Error saving:', e); alert('Failed to save item'); }
    finally { setSaving(false); }
  }, [isNewLot, saleId, lotId, isOnline, navigate]);

  const handleSaveAndNew = useCallback(async () => {
    const currentLot = lotRef.current;
    if (!currentLot.name) { alert('Please enter an item name'); return; }
    if (!saleId) { alert('No sale selected'); return; }
    setSaving(true);
    try {
      if (isNewLot) {
        const newLot: Lot = { ...currentLot, sale_id: saleId, id: generateUUID(), name: toTitleCase(currentLot.name || ''), created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
        await offlineStorage.upsertLot(newLot);
        if (isOnline) {
          SyncService.startOperation();
          try { await supabase.from('lots').insert(newLot); } finally { SyncService.endOperation(); }
        }
      } else {
        if (!currentLot.id || !currentLot.sale_id) { alert('Invalid lot data'); return; }
        const updatedLot: Lot = { ...currentLot, id: currentLot.id, sale_id: currentLot.sale_id, name: toTitleCase(currentLot.name || ''), updated_at: new Date().toISOString() };
        setLot(updatedLot);
        await offlineStorage.upsertLot(updatedLot);
        if (isOnline) {
          SyncService.startOperation();
          try { await supabase.from('lots').update(updatedLot).eq('id', lotId); } finally { SyncService.endOperation(); }
        }
      }
      navigate(`/sales/${saleId}/lots/new`);
    } catch (e) { console.error('Error saving:', e); alert('Failed to save item'); }
    finally { setSaving(false); }
  }, [isNewLot, saleId, lotId, isOnline, navigate]);

  const handleDelete = useCallback(async () => {
    if (!window.confirm('Delete this item? Cannot be undone.')) return;
    setSaving(true);
    try {
      if (isOnline) SyncService.startOperation();
      for (const photo of photos) {
        await offlineStorage.deletePhoto(photo.id);
        if (isOnline) await supabase.storage.from('photos').remove([photo.file_path]);
      }
      await offlineStorage.upsertLot({ ...lotRef.current, id: lotId, deleted: true } as Lot & { deleted: boolean });
      if (isOnline) { await supabase.from('lots').delete().eq('id', lotId); SyncService.endOperation(); }
      navigate(`/sales/${saleId}`);
    } catch (e) {
      console.error('Error deleting:', e);
      alert('Failed to delete item');
      if (isOnline) SyncService.endOperation();
      setSaving(false);
    }
  }, [photos, lotId, saleId, isOnline, navigate]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center pb-20">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4" />
          <p className="text-gray-600">Loading item...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 pb-24">
      <input id="photo-upload" type="file" accept="image/*" multiple onChange={handlePhotoUpload} className="hidden" />

      {/* Lot badges */}
      <div className="mb-4 flex items-center gap-3 flex-wrap">
        <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-indigo-100 text-indigo-800">
          Lot #{lot.lot_number || 'TBD'}
          {isTemporaryNumber(lot.lot_number) && <span className="ml-2 text-xs text-indigo-600">(Temporary)</span>}
        </span>
        {!isNewLot && lot.quantity && lot.quantity > 1 && (
          <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-gray-100 text-gray-700">Qty: {lot.quantity}</span>
        )}
        {!isNewLot && lot.condition && (
          <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-green-100 text-green-800">{lot.condition}</span>
        )}
      </div>

      {/* Photos Section */}
      {!isNewLot && (
        <LotPhotoSection
          photos={photos}
          photoUrls={photoUrls}
          selectedPhotos={selectedPhotos}
          showEditPanel={showEditPanel}
          editOptions={editOptions}
          processing={processing}
          progressText={progressText}
          onToggleEditPanel={toggleEditPanel}
          onTogglePhotoSelection={togglePhotoSelection}
          onSelectAll={selectAllPhotos}
          onClearSelection={clearSelection}
          onResetEditOptions={resetEditOptions}
          onEditOptionsChange={setEditOptions}
          onGeneratePreview={handleGeneratePreview}
          onSetPrimary={handleSetPrimary}
          onDeletePhoto={handleDeletePhoto}
        />
      )}

      {/* Form */}
      <LotForm
        lot={lot}
        onChange={setLot}
        isOnline={isOnline}
        isNewLot={isNewLot}
        hasPhotos={photos.length > 0}
        saving={saving}
        onAIEnrich={handleAIEnrich}
      />

      {/* Modals */}
      {showPreview && (
        <PhotoPreviewModal
          previewImages={previewImages}
          processing={processing}
          progressText={progressText}
          onAccept={handleAcceptEnhancements}
          onReject={handleRejectEnhancements}
        />
      )}

      {showCameraModal && (
        <WebcamModal onCapture={handleCaptureFromWebcam} onClose={() => setShowCameraModal(false)} />
      )}
    </div>
  );
}