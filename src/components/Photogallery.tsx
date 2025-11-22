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
    customCommand: '',
  });
  const [showPreview, setShowPreview] = useState(false);
  const [previewImages, setPreviewImages] = useState<PreviewImage[]>([]);
  const [processing, setProcessing] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Toggle photo selection
  const togglePhotoSelection = (photoId: string) => {
    const newSelected = new Set(selectedPhotos);
    if (newSelected.has(photoId)) {
      newSelected.delete(photoId);
    } else {
      newSelected.add(photoId);
    }
    setSelectedPhotos(newSelected);
  };

  // Select all photos
  const toggleSelectAll = () => {
    if (enhancementOptions.applyToAll) {
      setSelectedPhotos(new Set());
      setEnhancementOptions({ ...enhancementOptions, applyToAll: false });
    } else {
      setSelectedPhotos(new Set(photos.map(p => p.id)));
      setEnhancementOptions({ ...enhancementOptions, applyToAll: true });
    }
  };

  // Convert webPath/URI to File for upload
  const uriToFile = async (uri: string, fileName: string): Promise<File> => {
    const response = await fetch(uri);
    const blob = await response.blob();
    return new File([blob], fileName, { type: blob.type || 'image/jpeg' });
  };

  // Handle native camera capture
  const handleNativeCamera = async () => {
    if (lotId === 'new') {
      alert('Please save the lot first before adding photos');
      return;
    }

    try {
      setUploading(true);
      
      // Use native camera API
      const webPath = await takePicture();
      
      if (!webPath) {
        throw new Error('No image captured');
      }

      // Convert to File for upload
      const fileName = `camera_${Date.now()}.jpg`;
      const file = await uriToFile(webPath, fileName);
      
      await uploadPhotos([file]);
    } catch (error) {
      console.error('Error capturing photo:', error);
      // Don't show error if user cancelled
      if (error instanceof Error && !error.message.includes('cancelled')) {
        alert('Failed to capture photo. Please try again.');
      }
    } finally {
      setUploading(false);
    }
  };

  // Handle native gallery selection
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

      // Convert to File for upload
      const fileName = `gallery_${Date.now()}.jpg`;
      const file = await uriToFile(webPath, fileName);
      
      await uploadPhotos([file]);
    } catch (error) {
      console.error('Error selecting photo:', error);
      // Don't show error if user cancelled
      if (error instanceof Error && !error.message.includes('cancelled')) {
        alert('Failed to select photo. Please try again.');
      }
    } finally {
      setUploading(false);
    }
  };

  // Fallback: Handle file upload (for web browser)
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    await uploadPhotos(Array.from(files));
    
    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Upload photos to Supabase
  const uploadPhotos = async (files: File[]) => {
    if (lotId === 'new') {
      alert('Please save the lot first before adding photos');
      return;
    }

    setUploading(true);
    try {
      for (const file of files) {
        // Generate unique file name
        const fileExt = file.name.split('.').pop();
        const fileName = `${lotId}/${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;

        // Upload to storage
        const { error: uploadError } = await supabase.storage
          .from('photos')
          .upload(fileName, file);

        if (uploadError) throw uploadError;

        // Check if this is the first photo (should be primary)
        const isPrimary = photos.length === 0;

        // Create photo record
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

  // Delete photo
  const handleDeletePhoto = async (photo: Photo) => {
    if (!confirm('Delete this photo?')) return;

    try {
      // Delete from storage
      await supabase.storage.from('photos').remove([photo.file_path]);

      // Delete from database
      await supabase.from('photos').delete().eq('id', photo.id);

      // If this was the primary photo and there are other photos, make the first one primary
      if (photo.is_primary && photos.length > 1) {
        const nextPrimary = photos.find(p => p.id !== photo.id);
        if (nextPrimary) {
          await supabase
            .from('photos')
            .update({ is_primary: true })
            .eq('id', nextPrimary.id);
        }
      }

      onPhotosChange();
    } catch (error) {
      console.error('Error deleting photo:', error);
      alert('Failed to delete photo');
    }
  };

  // Set primary photo
  const handleSetPrimary = async (photo: Photo) => {
    try {
      // Unset all primary flags
      await supabase
        .from('photos')
        .update({ is_primary: false })
        .eq('lot_id', lotId);

      // Set this photo as primary
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

  // Build AI enhancement prompt
  const buildEnhancementPrompt = (): string => {
    if (enhancementOptions.customCommand.trim()) {
      return enhancementOptions.customCommand.trim();
    }

    return '';
  };

  // Apply AI enhancements
  const handleApplyAIEnhancements = async () => {
    const photosToProcess = enhancementOptions.applyToAll 
      ? photos 
      : photos.filter(p => selectedPhotos.has(p.id));

    if (photosToProcess.length === 0) {
      alert('Please select at least one photo to enhance');
      return;
    }

    const prompt = buildEnhancementPrompt();
    if (!prompt) {
      alert('Please enter an enhancement command');
      return;
    }

    setProcessing(true);
    try {
      // TODO: Implement AI enhancement logic
      // This would call your AI service to process the images
      alert('AI enhancement feature coming soon!');
      
      // Mock preview data (replace with actual AI processing)
      const mockPreviews: PreviewImage[] = photosToProcess.map(photo => ({
        originalPhotoId: photo.id,
        originalUrl: photoUrls[photo.id],
        enhancedUrl: photoUrls[photo.id], // Would be the AI-enhanced version
      }));

      setPreviewImages(mockPreviews);
      setShowPreview(true);
    } catch (error) {
      console.error('Error applying AI enhancements:', error);
      alert('Failed to apply AI enhancements');
    } finally {
      setProcessing(false);
    }
  };

  // Accept enhancements
  const handleAcceptEnhancements = async () => {
    setProcessing(true);
    try {
      // TODO: Replace original photos with enhanced versions
      // This would involve uploading the enhanced images and updating the database
      alert('Enhancements applied!');
      setShowPreview(false);
      setPreviewImages([]);
      onPhotosChange();
    } catch (error) {
      console.error('Error saving enhancements:', error);
      alert('Failed to save enhancements');
    } finally {
      setProcessing(false);
    }
  };

  // Reject enhancements
  const handleRejectEnhancements = () => {
    setShowPreview(false);
    setPreviewImages([]);
  };

  return (
    <div className="space-y-6">
      {/* Action Buttons */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Native Camera Button */}
        <button
          onClick={handleNativeCamera}
          disabled={uploading || lotId === 'new'}
          className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors shadow-sm"
        >
          <Camera className="w-5 h-5" />
          {uploading ? 'Capturing...' : 'Camera'}
        </button>

        {/* Native Gallery Button */}
        <button
          onClick={handleNativeGallery}
          disabled={uploading || lotId === 'new'}
          className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 disabled:bg-gray-100 disabled:cursor-not-allowed transition-colors shadow-sm"
        >
          <Upload className="w-5 h-5" />
          {uploading ? 'Uploading...' : 'Upload'}
        </button>

        {/* Hidden file input for web fallback */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          onChange={handleFileUpload}
          className="hidden"
        />

        {/* AI Enhancement Button */}
        {photos.length > 0 && (
          <>
            <div className="flex-1 min-w-[1px]" />
            <button
              onClick={toggleSelectAll}
              className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
            >
              <Check className="w-5 h-5" />
              {enhancementOptions.applyToAll ? 'Deselect All' : 'Select All'}
            </button>
            <button
              onClick={handleApplyAIEnhancements}
              disabled={processing || (!enhancementOptions.applyToAll && selectedPhotos.size === 0)}
              className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-100 text-indigo-700 rounded-lg hover:bg-indigo-200 disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed transition-colors"
            >
              <Sparkles className="w-5 h-5" />
              {processing ? 'Processing...' : 'AI Enhance'}
            </button>
          </>
        )}
      </div>

      {/* AI Enhancement Options */}
      {photos.length > 0 && (selectedPhotos.size > 0 || enhancementOptions.applyToAll) && (
        <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-indigo-900">AI Enhancement Options</h3>
            {enhancementOptions.applyToAll && (
              <span className="text-xs text-indigo-600 font-medium">
                Apply to all {photos.length} images
              </span>
            )}
          </div>

          {/* Custom Command Input */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              AI Enhancement Command
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
            Use the Camera or Upload button to add photos
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
                {/* Image */}
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

                {/* Selection Overlay */}
                {isSelected && (
                  <div className="absolute inset-0 bg-indigo-600 bg-opacity-20 flex items-center justify-center">
                    <div className="w-8 h-8 bg-indigo-600 rounded-full flex items-center justify-center">
                      <Check className="w-5 h-5 text-white" />
                    </div>
                  </div>
                )}

                {/* Primary Badge */}
                {photo.is_primary && (
                  <div className="absolute top-2 left-2 bg-indigo-600 text-white px-2 py-1 rounded text-xs font-medium shadow-sm">
                    Primary
                  </div>
                )}

                {/* Action Buttons */}
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

                {/* File Name */}
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
            {/* Modal Header */}
            <div className="flex items-center justify-between p-6 border-b border-gray-200">
              <h2 className="text-xl font-semibold text-gray-900">Preview Enhanced Images</h2>
              <button
                onClick={handleRejectEnhancements}
                className="p-2 hover:bg-gray-100 rounded-full transition-colors"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {previewImages.map((preview) => (
                  <div key={preview.originalPhotoId} className="space-y-2">
                    {/* Original */}
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

                    {/* Enhanced */}
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

            {/* Modal Footer */}
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