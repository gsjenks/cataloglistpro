// Updated Photogallery.tsx with device gallery saving
// Key changes: All camera captures now save to device gallery first

import React, { useState, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { takePicture, selectFromGallery } from '../lib/camera';
import type { Photo } from '../types';
import { 
  Camera, 
  Upload, 
  Star, 
  Trash2, 
  Check, 
  Sparkles,
  X
} from 'lucide-react';

interface PhotoGalleryProps {
  photos: Photo[];
  photoUrls: Record<string, string>;
  lotId: string;
  onPhotosChange: () => void;
}

interface AIEnhancementOptions {
  applyToAll: boolean;
  backgroundColor: 'none' | 'white' | 'black' | 'grey';
  straighten: boolean;
  brighten: boolean;
  customCommand: string;
}

interface PreviewImage {
  originalPhotoId: string;
  originalUrl: string;
  enhancedUrl: string;
}

export default function PhotoGallery({
  photos,
  photoUrls,
  lotId,
  onPhotosChange,
}: PhotoGalleryProps) {
  const [selectedPhotos, setSelectedPhotos] = useState<Set<string>>(new Set());
  const [uploading, setUploading] = useState(false);
  const [enhancementOptions, setEnhancementOptions] = useState<AIEnhancementOptions>({
    applyToAll: false,
    backgroundColor: 'none',
    straighten: false,
    brighten: false,
    customCommand: '',
  });
  const [showPreview, setShowPreview] = useState(false);
  const [previewImages, setPreviewImages] = useState<PreviewImage[]>([]);
  const [processing, setProcessing] = useState(false);

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

  const toggleSelectAll = () => {
    if (enhancementOptions.applyToAll) {
      setSelectedPhotos(new Set());
      setEnhancementOptions({ ...enhancementOptions, applyToAll: false });
    } else {
      setSelectedPhotos(new Set(photos.map(p => p.id)));
      setEnhancementOptions({ ...enhancementOptions, applyToAll: true });
    }
  };

  const uriToFile = async (uri: string, fileName: string): Promise<File> => {
    const response = await fetch(uri);
    const blob = await response.blob();
    return new File([blob], fileName, { type: blob.type || 'image/jpeg' });
  };

  /**
   * Handle native camera capture
   * MOBILE-FIRST: Photo is saved to device gallery first, then uploaded
   */
  const handleNativeCamera = async () => {
    if (lotId === 'new') {
      alert('Please save the lot first before adding photos');
      return;
    }

    try {
      setUploading(true);
      
      // Use native camera API - photo will be saved to device gallery automatically
      // See camera.ts: saveToGallery: true
      const webPath = await takePicture();
      
      if (!webPath) {
        throw new Error('No image captured');
      }

      // Convert to File for upload
      const fileName = `camera_${Date.now()}.jpg`;
      const file = await uriToFile(webPath, fileName);
      
      // Upload to Supabase (photo already saved to device gallery)
      await uploadPhotos([file]);
      
      console.log('Photo saved to device gallery and uploaded to cloud');
    } catch (error) {
      console.error('Error capturing photo:', error);
      if (error instanceof Error && !error.message.includes('cancelled')) {
        alert('Failed to capture photo. Please try again.');
      }
    } finally {
      setUploading(false);
    }
  };

  /**
   * Handle native gallery selection
   */
  const handleNativeGallery = async () => {
    if (lotId === 'new') {
      alert('Please save the lot first before adding photos');
      return;
    }

    try {
      setUploading(true);
      
      // Use native gallery picker
      const webPath = await selectFromGallery();
      
      if (!webPath) {
        throw new Error('No image selected');
      }

      const fileName = `gallery_${Date.now()}.jpg`;
      const file = await uriToFile(webPath, fileName);
      
      await uploadPhotos([file]);
    } catch (error) {
      console.error('Error selecting photo:', error);
      if (error instanceof Error && !error.message.includes('cancelled')) {
        alert('Failed to select photo. Please try again.');
      }
    } finally {
      setUploading(false);
    }
  };

  /**
   * Fallback: Handle file upload (for web browser)
   */
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    await uploadPhotos(Array.from(files));
    
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  /**
   * Upload photos to Supabase
   * Note: For camera captures, photo is already in device gallery
   */
  const uploadPhotos = async (files: File[]) => {
    if (lotId === 'new') {
      alert('Please save the lot first before adding photos');
      return;
    }

    setUploading(true);
    try {
      for (const file of files) {
        const fileExt = file.name.split('.').pop();
        const fileName = `${lotId}/${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;

        const { error: uploadError } = await supabase.storage
          .from('photos')
          .upload(fileName, file);

        if (uploadError) throw uploadError;

        const isPrimary = photos.length === 0;

        const { error: dbError } = await supabase
          .from('photos')
          .insert({
            lot_id: lotId,
            file_path: fileName,
            file_name: file.name,
            is_primary: isPrimary,
          });

        if (dbError) throw dbError;
      }

      onPhotosChange();
    } catch (error) {
      console.error('Error uploading photos:', error);
      alert('Failed to upload photos');
    } finally {
      setUploading(false);
    }
  };

  const handleDeletePhoto = async (photo: Photo) => {
    if (!confirm('Delete this photo?')) return;

    try {
      await supabase.storage.from('photos').remove([photo.file_path]);

      await supabase
        .from('photos')
        .delete()
        .eq('id', photo.id);

      onPhotosChange();
    } catch (error) {
      console.error('Error deleting photo:', error);
      alert('Failed to delete photo');
    }
  };

  const handleSetPrimary = async (photo: Photo) => {
    try {
      await supabase
        .from('photos')
        .update({ is_primary: false })
        .eq('lot_id', lotId);

      await supabase
        .from('photos')
        .update({ is_primary: true })
        .eq('id', photo.id);

      onPhotosChange();
    } catch (error) {
      console.error('Error setting primary photo:', error);
      alert('Failed to set primary photo');
    }
  };

  const handleGeneratePreview = async () => {
    if (selectedPhotos.size === 0 && !enhancementOptions.applyToAll) {
      alert('Please select at least one photo');
      return;
    }

    setProcessing(true);
    try {
      // TODO: Implement AI enhancement preview
      alert('AI enhancement preview coming soon');
    } catch (error) {
      console.error('Error generating preview:', error);
      alert('Failed to generate preview');
    } finally {
      setProcessing(false);
    }
  };

  const handleAcceptEnhancements = async () => {
    setProcessing(true);
    try {
      // TODO: Implement AI enhancement acceptance
      alert('AI enhancement acceptance coming soon');
      setShowPreview(false);
    } catch (error) {
      console.error('Error accepting enhancements:', error);
      alert('Failed to apply enhancements');
    } finally {
      setProcessing(false);
    }
  };

  const handleRejectEnhancements = () => {
    setShowPreview(false);
    setPreviewImages([]);
  };

  return (
    <div className="space-y-6">
      {/* Action Buttons */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={handleNativeCamera}
          disabled={uploading}
          className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:bg-indigo-300 disabled:cursor-not-allowed transition-colors shadow-sm"
        >
          <Camera className="w-4 h-4" />
          <span>Camera</span>
        </button>

        <button
          onClick={handleNativeGallery}
          disabled={uploading}
          className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 disabled:bg-gray-100 disabled:cursor-not-allowed transition-colors shadow-sm"
        >
          <Upload className="w-4 h-4" />
          <span>Gallery</span>
        </button>

        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 disabled:bg-gray-100 disabled:cursor-not-allowed transition-colors shadow-sm"
        >
          <Upload className="w-4 h-4" />
          <span>Upload Files</span>
        </button>

        {uploading && (
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-indigo-600" />
            <span>Processing...</span>
          </div>
        )}
      </div>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        onChange={handleFileUpload}
        className="hidden"
      />

      {/* AI Enhancement Controls */}
      {photos.length > 0 && (
        <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-indigo-900">AI Photo Enhancement</h3>
            <button
              onClick={handleGeneratePreview}
              disabled={processing || (selectedPhotos.size === 0 && !enhancementOptions.applyToAll)}
              className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:bg-indigo-300 disabled:cursor-not-allowed transition-colors shadow-sm text-sm"
            >
              <Sparkles className="w-4 h-4" />
              <span>{processing ? 'Processing...' : 'Generate Preview'}</span>
            </button>
          </div>

          {/* Apply to all checkbox */}
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={enhancementOptions.applyToAll}
              onChange={toggleSelectAll}
              className="w-4 h-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
            />
            <span className="text-sm font-medium text-gray-700">Apply to all images</span>
          </label>

          {/* Background color options */}
          {enhancementOptions.applyToAll && (
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">Background Color</label>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="backgroundColor"
                    value="none"
                    checked={enhancementOptions.backgroundColor === 'none'}
                    onChange={() => setEnhancementOptions({ ...enhancementOptions, backgroundColor: 'none' })}
                    className="w-4 h-4 text-indigo-600 border-gray-300 focus:ring-indigo-500"
                  />
                  <span className="text-sm text-gray-700">None</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="backgroundColor"
                    value="white"
                    checked={enhancementOptions.backgroundColor === 'white'}
                    onChange={() => setEnhancementOptions({ ...enhancementOptions, backgroundColor: 'white' })}
                    className="w-4 h-4 text-indigo-600 border-gray-300 focus:ring-indigo-500"
                  />
                  <span className="text-sm text-gray-700">White</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="backgroundColor"
                    value="black"
                    checked={enhancementOptions.backgroundColor === 'black'}
                    onChange={() => setEnhancementOptions({ ...enhancementOptions, backgroundColor: 'black' })}
                    className="w-4 h-4 text-indigo-600 border-gray-300 focus:ring-indigo-500"
                  />
                  <span className="text-sm text-gray-700">Black</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="backgroundColor"
                    value="grey"
                    checked={enhancementOptions.backgroundColor === 'grey'}
                    onChange={() => setEnhancementOptions({ ...enhancementOptions, backgroundColor: 'grey' })}
                    className="w-4 h-4 text-indigo-600 border-gray-300 focus:ring-indigo-500"
                  />
                  <span className="text-sm text-gray-700">Grey</span>
                </label>
              </div>
            </div>
          )}

          {/* Enhancement Checkboxes */}
          <div className="flex items-center gap-6">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={enhancementOptions.straighten}
                onChange={(e) => setEnhancementOptions({ ...enhancementOptions, straighten: e.target.checked })}
                className="w-4 h-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
              />
              <span className="text-sm text-gray-700">Straighten Image</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={enhancementOptions.brighten}
                onChange={(e) => setEnhancementOptions({ ...enhancementOptions, brighten: e.target.checked })}
                className="w-4 h-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
              />
              <span className="text-sm text-gray-700">Brighten Image</span>
            </label>
          </div>

          {/* Custom Command Input */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Custom Command (Optional)
            </label>
            <input
              type="text"
              value={enhancementOptions.customCommand}
              onChange={(e) => setEnhancementOptions({ ...enhancementOptions, customCommand: e.target.value })}
              placeholder="e.g., Isolate image, remove hand, enhance colors..."
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-sm"
            />
          </div>

          {/* Selection Info */}
          {!enhancementOptions.applyToAll && selectedPhotos.size > 0 && (
            <p className="text-sm text-indigo-600">
              {selectedPhotos.size} image{selectedPhotos.size !== 1 ? 's' : ''} selected
            </p>
          )}
        </div>
      )}

      {/* Photo Grid */}
      {photos.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <Camera className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <p className="text-sm mb-2">No photos yet</p>
          <p className="text-xs text-gray-400">
            Use the Camera or Gallery button to add photos
          </p>
          <p className="text-xs text-indigo-600 mt-2 font-medium">
            📸 Photos are automatically saved to your device gallery
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {photos.map((photo) => {
            const isSelected = selectedPhotos.has(photo.id);
            const url = photoUrls[photo.id];

            return (
              <div
                key={photo.id}
                className={`relative group aspect-square rounded-lg overflow-hidden bg-gray-100 transition-all ${
                  isSelected 
                    ? 'ring-4 ring-indigo-500 shadow-lg' 
                    : 'hover:shadow-md'
                }`}
              >
                {url ? (
                  <img
                    src={url}
                    alt={photo.file_name}
                    className="w-full h-full object-cover cursor-pointer"
                    onClick={() => togglePhotoSelection(photo.id)}
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
                  </div>
                )}

                {isSelected && (
                  <div className="absolute inset-0 bg-indigo-600 bg-opacity-20 flex items-center justify-center">
                    <div className="w-8 h-8 bg-indigo-600 rounded-full flex items-center justify-center">
                      <Check className="w-5 h-5 text-white" />
                    </div>
                  </div>
                )}

                {photo.is_primary && (
                  <div className="absolute top-2 left-2 bg-indigo-600 text-white px-2 py-1 rounded text-xs font-medium shadow-sm">
                    Primary
                  </div>
                )}

                <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  {!photo.is_primary && (
                    <button
                      onClick={() => handleSetPrimary(photo)}
                      className="p-1.5 bg-white rounded-full hover:bg-yellow-50 transition-colors shadow-sm"
                      title="Set as primary"
                    >
                      <Star className="w-4 h-4 text-yellow-400" />
                    </button>
                  )}
                  <button
                    onClick={() => handleDeletePhoto(photo)}
                    className="p-1.5 bg-white rounded-full hover:bg-red-50 transition-colors shadow-sm"
                    title="Delete photo"
                  >
                    <Trash2 className="w-4 h-4 text-red-600" />
                  </button>
                </div>

                <div className="absolute bottom-0 left-0 right-0 bg-black bg-opacity-50 text-white text-xs p-2 truncate opacity-0 group-hover:opacity-100 transition-opacity">
                  {photo.file_name}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Preview Modal */}
      {showPreview && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-6xl w-full max-h-[90vh] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between p-6 border-b border-gray-200">
              <h2 className="text-xl font-semibold text-gray-900">Preview Enhanced Images</h2>
              <button
                onClick={handleRejectEnhancements}
                className="p-2 hover:bg-gray-100 rounded-full transition-colors"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {previewImages.map((preview) => (
                  <div key={preview.originalPhotoId} className="space-y-2">
                    <div>
                      <p className="text-sm font-medium text-gray-700 mb-2">Original</p>
                      <div className="aspect-square bg-gray-100 rounded-lg overflow-hidden">
                        <img
                          src={preview.originalUrl}
                          alt="Original"
                          className="w-full h-full object-contain"
                        />
                      </div>
                    </div>

                    <div>
                      <p className="text-sm font-medium text-gray-700 mb-2">Enhanced</p>
                      <div className="aspect-square bg-gray-100 rounded-lg overflow-hidden border-2 border-indigo-500">
                        <img
                          src={preview.enhancedUrl}
                          alt="Enhanced"
                          className="w-full h-full object-contain"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 p-6 border-t border-gray-200">
              <button
                onClick={handleRejectEnhancements}
                className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleAcceptEnhancements}
                disabled={processing}
                className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:bg-indigo-300 disabled:cursor-not-allowed transition-colors shadow-sm"
              >
                {processing ? 'Saving...' : 'Accept & Apply'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}