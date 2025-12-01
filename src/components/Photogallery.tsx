// src/components/Photogallery.tsx - Photo gallery with integrated PhotoRoom editing

import React, { useState, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { takePicture, selectFromGallery } from '../lib/camera';
import { editWithPhotoRoom, type PhotoRoomEditOptions, type PhotoRoomEditResult } from '../services/PhotoRoomService';
import type { Photo } from '../types';
import { 
  Camera, 
  Upload, 
  Star, 
  Trash2, 
  Check, 
  Sparkles,
  X,
  Sun,
  RotateCcw,
  Image as ImageIcon
} from 'lucide-react';

interface PhotoGalleryProps {
  photos: Photo[];
  photoUrls: Record<string, string>;
  lotId: string;
  onPhotosChange: () => void;
}

interface PreviewImage {
  photoId: string;
  originalUrl: string;
  enhancedUrl: string;
  enhancedBlob: Blob;
}

export default function PhotoGallery({
  photos,
  photoUrls,
  lotId,
  onPhotosChange,
}: PhotoGalleryProps) {
  const [selectedPhotos, setSelectedPhotos] = useState<Set<string>>(new Set());
  const [uploading, setUploading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [showEditPanel, setShowEditPanel] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [previewImages, setPreviewImages] = useState<PreviewImage[]>([]);
  const [progressText, setProgressText] = useState('');

  // Edit options
  const [editOptions, setEditOptions] = useState<PhotoRoomEditOptions>({
    removeBackground: false,
    backgroundColor: undefined,
    fillPercentage: 85,
    lightBalance: 0,
    addShadow: false
  });

  const fileInputRef = useRef<HTMLInputElement>(null);

  const togglePhotoSelection = (photoId: string) => {
    const newSelected = new Set(selectedPhotos);
    if (newSelected.has(photoId)) {
      newSelected.delete(photoId);
    } else {
      newSelected.add(photoId);
    }
    setSelectedPhotos(newSelected);
  };

  const selectAll = () => setSelectedPhotos(new Set(photos.map(p => p.id)));
  const clearSelection = () => setSelectedPhotos(new Set());

  // File handling
  const uriToFile = async (uri: string, fileName: string): Promise<File> => {
    const response = await fetch(uri);
    const blob = await response.blob();
    return new File([blob], fileName, { type: blob.type || 'image/jpeg' });
  };

  const handleNativeCamera = async () => {
    if (lotId === 'new') { alert('Save lot first'); return; }
    try {
      setUploading(true);
      const webPath = await takePicture();
      if (!webPath) throw new Error('No image captured');
      const file = await uriToFile(webPath, `camera_${Date.now()}.jpg`);
      await uploadPhotos([file]);
    } catch (error) {
      if (error instanceof Error && !error.message.includes('cancelled')) {
        alert('Failed to capture photo');
      }
    } finally {
      setUploading(false);
    }
  };

  const handleNativeGallery = async () => {
    if (lotId === 'new') { alert('Save lot first'); return; }
    try {
      setUploading(true);
      const webPath = await selectFromGallery();
      if (!webPath) throw new Error('No image selected');
      const file = await uriToFile(webPath, `gallery_${Date.now()}.jpg`);
      await uploadPhotos([file]);
    } catch (error) {
      if (error instanceof Error && !error.message.includes('cancelled')) {
        alert('Failed to select photo');
      }
    } finally {
      setUploading(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    await uploadPhotos(Array.from(files));
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const uploadPhotos = async (files: File[]) => {
    if (lotId === 'new') { alert('Save lot first'); return; }
    setUploading(true);
    try {
      for (const file of files) {
        const fileExt = file.name.split('.').pop();
        const fileName = `${lotId}/${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
        const { error: uploadError } = await supabase.storage.from('photos').upload(fileName, file);
        if (uploadError) throw uploadError;

        const { error: dbError } = await supabase.from('photos').insert({
          lot_id: lotId,
          file_path: fileName,
          file_name: file.name,
          is_primary: photos.length === 0,
        });
        if (dbError) throw dbError;
      }
      onPhotosChange();
    } catch (error) {
      console.error('Upload error:', error);
      alert('Failed to upload photos');
    } finally {
      setUploading(false);
    }
  };

  const handleDeletePhoto = async (photo: Photo) => {
    if (!confirm('Delete this photo?')) return;
    try {
      await supabase.storage.from('photos').remove([photo.file_path]);
      await supabase.from('photos').delete().eq('id', photo.id);
      onPhotosChange();
    } catch (error) {
      alert('Failed to delete photo');
    }
  };

  const handleSetPrimary = async (photo: Photo) => {
    try {
      await supabase.from('photos').update({ is_primary: false }).eq('lot_id', lotId);
      await supabase.from('photos').update({ is_primary: true }).eq('id', photo.id);
      onPhotosChange();
    } catch (error) {
      alert('Failed to set primary photo');
    }
  };

  // PhotoRoom editing
  const handleGeneratePreview = async () => {
    if (selectedPhotos.size === 0) {
      alert('Select at least one photo');
      return;
    }

    // Validate that at least one option is selected
    if (!editOptions.removeBackground && !editOptions.backgroundColor && 
        (editOptions.lightBalance ?? 0) === 0) {
      alert('Select at least one edit option');
      return;
    }

    setProcessing(true);
    setProgressText('Starting...');
    const previews: PreviewImage[] = [];

    try {
      const selectedArray = Array.from(selectedPhotos);
      
      for (let i = 0; i < selectedArray.length; i++) {
        const photoId = selectedArray[i];
        const originalUrl = photoUrls[photoId];
        
        if (!originalUrl) continue;
        
        setProgressText(`Processing ${i + 1} of ${selectedArray.length}...`);

        // Fetch original image as blob
        const response = await fetch(originalUrl);
        const imageBlob = await response.blob();

        // Process with PhotoRoom
        const result: PhotoRoomEditResult = await editWithPhotoRoom(imageBlob, editOptions);

        if (result.success && result.editedDataUrl && result.editedBlob) {
          previews.push({
            photoId,
            originalUrl,
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

        // Upload enhanced image
        const fileExt = 'png';
        const fileName = `${lotId}/${Date.now()}_enhanced_${Math.random().toString(36).substring(7)}.${fileExt}`;

        const { error: uploadError } = await supabase.storage
          .from('photos')
          .upload(fileName, preview.enhancedBlob);

        if (uploadError) throw uploadError;

        // Update photo record with new path
        const { error: dbError } = await supabase
          .from('photos')
          .update({ 
            file_path: fileName,
            file_name: `enhanced_${photo.file_name}`,
            updated_at: new Date().toISOString()
          })
          .eq('id', photo.id);

        if (dbError) throw dbError;

        // Optionally delete old file
        await supabase.storage.from('photos').remove([photo.file_path]);
      }

      setShowPreview(false);
      setPreviewImages([]);
      setSelectedPhotos(new Set());
      onPhotosChange();
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

  const resetEditOptions = () => {
    setEditOptions({
      removeBackground: false,
      backgroundColor: undefined,
      fillPercentage: 85,
      lightBalance: 0,
      addShadow: false
    });
  };

  return (
    <div className="space-y-4">
      {/* Action Buttons */}
      <div className="flex flex-wrap gap-2">
        <button onClick={handleNativeCamera} disabled={uploading}
          className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:bg-indigo-300 transition-colors shadow-sm">
          <Camera className="w-4 h-4" /><span>Camera</span>
        </button>
        <button onClick={handleNativeGallery} disabled={uploading}
          className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 disabled:bg-gray-100 transition-colors shadow-sm">
          <Upload className="w-4 h-4" /><span>Gallery</span>
        </button>
        <button onClick={() => fileInputRef.current?.click()} disabled={uploading}
          className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 disabled:bg-gray-100 transition-colors shadow-sm">
          <Upload className="w-4 h-4" /><span>Upload</span>
        </button>
        {uploading && (
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-indigo-600" />
            <span>Uploading...</span>
          </div>
        )}
      </div>

      <input ref={fileInputRef} type="file" accept="image/*" multiple onChange={handleFileUpload} className="hidden" />

      {/* AI Photo Edit Panel - Contained within the card */}
      {photos.length > 0 && (
        <div className="bg-gradient-to-r from-indigo-50 to-purple-50 border border-indigo-200 rounded-xl overflow-hidden">
          {/* Panel Header */}
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
            <span className="text-indigo-600">{showEditPanel ? 'â–²' : 'â–¼'}</span>
          </button>

          {/* Edit Controls */}
          {showEditPanel && (
            <div className="p-4 border-t border-indigo-200 space-y-4">
              {/* Selection Controls */}
              <div className="flex items-center gap-3">
                <button onClick={selectAll} className="text-sm text-indigo-600 hover:underline">
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

              {/* Background Options */}
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
                  <ImageIcon className="w-4 h-4" /> Background
                </label>
                <div className="flex flex-wrap gap-2">
                  {[
                    { value: undefined, label: 'Keep Original', color: 'bg-gray-200' },
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
                  <span className="text-xs text-gray-500">(75-95% recommended)</span>
                </label>
                <input
                  type="range"
                  min="50"
                  max="100"
                  value={editOptions.fillPercentage ?? 85}
                  onChange={(e) => setEditOptions({ ...editOptions, fillPercentage: parseInt(e.target.value) })}
                  className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                />
                <div className="flex justify-between text-xs text-gray-400">
                  <span>More padding</span>
                  <span>Less padding</span>
                </div>
              </div>

              {/* Light Balance */}
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
                  <Sun className="w-4 h-4" /> Light Balance: {(editOptions.lightBalance ?? 0) > 0 ? '+' : ''}{editOptions.lightBalance ?? 0}
                </label>
                <input
                  type="range"
                  min="-100"
                  max="100"
                  value={editOptions.lightBalance ?? 0}
                  onChange={(e) => setEditOptions({ ...editOptions, lightBalance: parseInt(e.target.value) })}
                  className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                />
                <div className="flex justify-between text-xs text-gray-400">
                  <span>Darker</span>
                  <span>Brighter</span>
                </div>
              </div>

              {/* Shadow Option */}
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={editOptions.addShadow}
                  onChange={(e) => setEditOptions({ ...editOptions, addShadow: e.target.checked })}
                  className="w-4 h-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
                />
                <span className="text-sm text-gray-700">Add soft shadow</span>
              </label>

              {/* Process Button */}
              <button
                onClick={handleGeneratePreview}
                disabled={processing || selectedPhotos.size === 0}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:bg-indigo-300 disabled:cursor-not-allowed transition-colors shadow-sm font-medium"
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
      )}

      {/* Photo Grid */}
      {photos.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <Camera className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <p className="text-sm mb-2">No photos yet</p>
          <p className="text-xs text-gray-400">Use Camera or Gallery to add photos</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {photos.map((photo) => {
            const isSelected = selectedPhotos.has(photo.id);
            const url = photoUrls[photo.id];

            return (
              <div
                key={photo.id}
                className={`relative rounded-lg overflow-hidden bg-gray-100 transition-all ${
                  isSelected ? 'ring-4 ring-indigo-500 shadow-lg scale-[1.02]' : 'hover:shadow-md'
                }`}
              >
                {/* Image */}
                <div 
                  className="aspect-square cursor-pointer"
                  onClick={() => togglePhotoSelection(photo.id)}
                >
                  {url ? (
                    <img src={url} alt={photo.file_name} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
                    </div>
                  )}

                  {isSelected && (
                    <div className="absolute inset-0 bg-indigo-600/20 flex items-center justify-center pointer-events-none">
                      <div className="w-8 h-8 bg-indigo-600 rounded-full flex items-center justify-center shadow-lg">
                        <Check className="w-5 h-5 text-white" />
                      </div>
                    </div>
                  )}

                  {photo.is_primary && (
                    <div className="absolute top-2 left-2 bg-indigo-600 text-white px-2 py-1 rounded text-xs font-medium shadow-sm">
                      Primary
                    </div>
                  )}
                </div>

                {/* Action buttons bar - always visible */}
                <div className="flex items-center justify-between px-2 py-1.5 bg-gray-50 border-t border-gray-200">
                  <span className="text-xs text-gray-500 truncate max-w-[60%]">{photo.file_name}</span>
                  <div className="flex gap-1">
                    {!photo.is_primary && (
                      <button
                        onClick={(e) => { e.stopPropagation(); handleSetPrimary(photo); }}
                        className="p-1.5 bg-white rounded-full shadow-sm border border-gray-200 active:bg-yellow-100"
                        title="Set as primary"
                      >
                        <Star className="w-4 h-4 text-yellow-500" />
                      </button>
                    )}
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDeletePhoto(photo); }}
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
      )}

      {/* Preview Modal */}
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
    </div>
  );
}