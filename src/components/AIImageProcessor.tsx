// src/components/AIImageProcessor.tsx - PhotoRoom AI Image Editor
import { useState } from 'react';
import { X, Sparkles, Loader2, Check } from 'lucide-react';
import { editWithPhotoRoom } from '../services/PhotoRoomService';
import ConnectivityService from '../services/ConnectivityService';
import PhotoService from '../services/PhotoService';
import offlineStorage from '../services/Offlinestorage';
import type { Photo } from '../types';
import type { ImageProcessingOptions } from '../lib/Gemini';

interface AIImageProcessorProps {
  photos: Photo[];
  photoUrls: Record<string, string>;
  onClose: () => void;
  onProcessComplete: () => void;
}

interface PreviewImage {
  photoId: string;
  originalUrl: string;
  editedUrl: string;
  editedBlob: Blob;
  changes: string[];
}

export default function AIImageProcessor({
  photos,
  photoUrls,
  onClose,
  onProcessComplete
}: AIImageProcessorProps) {
  const [selectedPhotos, setSelectedPhotos] = useState<Set<string>>(new Set());
  const [processing, setProcessing] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [previewImages, setPreviewImages] = useState<PreviewImage[]>([]);
  const [options, setOptions] = useState<ImageProcessingOptions>({
    customPrompt: ''
  });

  const isOnline = ConnectivityService.getConnectionStatus();

  const togglePhotoSelection = (photoId: string) => {
    const newSelection = new Set(selectedPhotos);
    if (newSelection.has(photoId)) {
      newSelection.delete(photoId);
    } else {
      newSelection.add(photoId);
    }
    setSelectedPhotos(newSelection);
  };

  const selectAll = () => {
    setSelectedPhotos(new Set(photos.map(p => p.id)));
  };

  const deselectAll = () => {
    setSelectedPhotos(new Set());
  };

  // Generate preview of edits
  const handleProcess = async () => {
    if (!isOnline) {
      alert('Currently offline - unable to process images');
      return;
    }

    if (selectedPhotos.size === 0) {
      alert('Please select at least one photo');
      return;
    }

    if (!options.customPrompt || !options.customPrompt.trim()) {
      alert('Please enter AI instructions');
      return;
    }

    setProcessing(true);

    try {
      const previews: PreviewImage[] = [];
      const errors: string[] = [];

      // Process each selected photo
      for (const photoId of selectedPhotos) {
        const blob = await offlineStorage.getPhotoBlob(photoId);
        if (!blob) {
          errors.push(`Failed to load photo ${photoId}`);
          continue;
        }

        // Edit the image using Imagen
        const editResult = await editWithPhotoRoom(blob, options);

        if (editResult.success && editResult.editedBlob && editResult.editedDataUrl) {
          previews.push({
            photoId,
            originalUrl: photoUrls[photoId],
            editedUrl: editResult.editedDataUrl,
            editedBlob: editResult.editedBlob,
            changes: editResult.changes
          });
        } else if (editResult.error) {
          errors.push(editResult.error);
        }
      }

      if (errors.length > 0) {
        alert(errors.join('\n'));
        setProcessing(false);
        return;
      }

      if (previews.length > 0) {
        setPreviewImages(previews);
        setShowPreview(true);
      } else {
        alert('Failed to process any images');
      }
    } catch (error) {
      console.error('Processing error:', error);
      alert('Failed to process images');
    } finally {
      setProcessing(false);
    }
  };

  // Save accepted edits
  const handleAcceptEdits = async () => {
    setProcessing(true);

    try {
      let successCount = 0;

      for (const preview of previewImages) {
        try {
          await PhotoService.savePhotoBlob(preview.photoId, preview.editedBlob);
          console.log(`âœ… Saved edited image for ${preview.photoId}`);
          successCount++;
        } catch (error) {
          console.error(`Failed to save ${preview.photoId}:`, error);
        }
      }

      alert(`Successfully saved ${successCount} of ${previewImages.length} edited images`);
      
      setShowPreview(false);
      setPreviewImages([]);
      setSelectedPhotos(new Set());
      
      onProcessComplete();
      onClose();
    } catch (error) {
      console.error('Save error:', error);
      alert('Failed to save images');
    } finally {
      setProcessing(false);
    }
  };

  // Reject edits
  const handleRejectEdits = () => {
    setShowPreview(false);
    setPreviewImages([]);
  };

  // Preview Modal
  if (showPreview) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl w-full max-w-6xl max-h-[90vh] overflow-hidden flex flex-col">
          {/* Preview Header */}
          <div className="flex items-center justify-between p-6 border-b border-gray-200">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-100 rounded-lg">
                <Check className="w-6 h-6 text-green-600" />
              </div>
              <div>
                <h2 className="text-xl font-semibold text-gray-900">Preview Edits</h2>
                <p className="text-sm text-gray-500">
                  {previewImages.length} image{previewImages.length !== 1 ? 's' : ''} edited
                </p>
              </div>
            </div>
            <button
              onClick={handleRejectEdits}
              className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-all"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Preview Content */}
          <div className="flex-1 overflow-y-auto p-6">
            <div className="space-y-8">
              {previewImages.map((preview, index) => (
                <div key={preview.photoId} className="border border-gray-200 rounded-xl p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold text-gray-900">
                      Image {index + 1}
                    </h3>
                    <div className="flex flex-wrap gap-2">
                      {preview.changes.map((change, i) => (
                        <span key={i} className="px-3 py-1 bg-indigo-100 text-indigo-700 text-xs font-medium rounded-full">
                          {change}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm font-medium text-gray-600 mb-2">Original</p>
                      <img
                        src={preview.originalUrl}
                        alt="Original"
                        className="w-full rounded-lg border border-gray-200"
                      />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-600 mb-2">Edited</p>
                      <img
                        src={preview.editedUrl}
                        alt="Edited"
                        className="w-full rounded-lg border border-indigo-300"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Preview Footer */}
          <div className="flex gap-3 p-6 border-t border-gray-200 bg-gray-50">
            <button
              onClick={handleRejectEdits}
              className="flex-1 px-4 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-all font-medium"
            >
              Cancel Changes
            </button>
            <button
              onClick={handleAcceptEdits}
              disabled={processing}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-green-600 to-emerald-600 text-white rounded-lg hover:from-green-700 hover:to-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all font-medium"
            >
              {processing ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Check className="w-5 h-5" />
                  Save Changes
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Main Modal
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-6xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-gradient-to-br from-purple-500 to-indigo-600 rounded-lg">
              <Sparkles className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-gray-900">AI Image Editor</h2>
              <p className="text-sm text-gray-500">Powered by PhotoRoom AI</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-all"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Photo Selection */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-medium text-gray-900">Select Photos</h3>
              <div className="flex gap-2">
                <button
                  onClick={selectAll}
                  className="text-sm text-indigo-600 hover:text-indigo-700 font-medium"
                >
                  Select All
                </button>
                <span className="text-gray-300">|</span>
                <button
                  onClick={deselectAll}
                  className="text-sm text-gray-600 hover:text-gray-700 font-medium"
                >
                  Deselect All
                </button>
              </div>
            </div>

            <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
              {photos.map((photo) => (
                <button
                  key={photo.id}
                  onClick={() => togglePhotoSelection(photo.id)}
                  className={`relative aspect-square rounded-lg overflow-hidden border-3 transition-all ${
                    selectedPhotos.has(photo.id)
                      ? 'border-green-500'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                  style={{
                    borderWidth: selectedPhotos.has(photo.id) ? '3px' : '2px'
                  }}
                >
                  <img
                    src={photoUrls[photo.id]}
                    alt={photo.file_name}
                    className="w-full h-full object-cover"
                  />
                  {selectedPhotos.has(photo.id) && (
                    <div className="absolute top-2 left-2 w-6 h-6 bg-green-500 rounded-sm flex items-center justify-center">
                      <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Processing Options */}
          <div className="space-y-6">
            <h3 className="text-sm font-medium text-gray-900">AI Instructions</h3>

            {/* Custom AI Instructions */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Custom AI Instructions
              </label>
              <textarea
                value={options.customPrompt || ''}
                onChange={(e) => setOptions({ ...options, customPrompt: e.target.value })}
                placeholder="e.g., 'focus on the chair, remove the rug in background, add shadow under lamp, enhance the wood grain'"
                rows={4}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-600 text-sm resize-none"
              />
              <p className="text-xs text-gray-500 mt-1">
                Tell the AI exactly what you want: remove objects, enhance details, adjust specific areas, etc.
              </p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex gap-3 p-6 border-t border-gray-200 bg-gray-50">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-all font-medium"
          >
            Cancel
          </button>
          <button
            onClick={handleProcess}
            disabled={processing || !isOnline || selectedPhotos.size === 0}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-lg hover:from-purple-700 hover:to-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all font-medium"
          >
            {processing ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Processing...
              </>
            ) : (
              <>
                <Sparkles className="w-5 h-5" />
                Preview Edits
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}