// components/LotDetail_CameraIntegration.tsx
// EXAMPLE: How to integrate enhanced camera system into existing LotDetail

import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import PhotoCaptureButton from './PhotoCaptureButton';
import CameraService from '../services/CameraService';
import PhotoService from '../services/PhotoService';
import { AlertCircle, CheckCircle, Trash2, Star } from 'lucide-react';

export default function LotDetailWithCameraIntegration() {
  const { lotId } = useParams();
  const [photos, setPhotos] = useState<Array<{ photoId: string; blobUrl: string; isPrimary: boolean }>>([]);
  const [loading, setLoading] = useState(false);
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Load existing photos
  useEffect(() => {
    if (lotId) {
      loadPhotos();
    }
  }, [lotId]);

  const loadPhotos = async () => {
    if (!lotId) return;

    setLoading(true);
    try {
      const photoData = await PhotoService.getPhotosByLot(lotId);
      
      // Load blob URLs for display
      const photosWithBlobs = await Promise.all(
        photoData.map(async (photo) => {
          const blobUrl = await PhotoService.getPhotoObjectUrl(photo.id);
          return {
            photoId: photo.id,
            blobUrl: blobUrl || '',
            isPrimary: photo.is_primary
          };
        })
      );

      setPhotos(photosWithBlobs.filter(p => p.blobUrl));
    } catch (error) {
      console.error('Failed to load photos:', error);
      showNotification('error', 'Failed to load photos');
    } finally {
      setLoading(false);
    }
  };

  // Handle new photos from camera/upload
  const handlePhotosCaptured = async (newPhotos: Array<{ photoId: string; blobUrl: string }>) => {
    // Add to display immediately
    const photosToAdd = newPhotos.map(p => ({
      ...p,
      isPrimary: photos.length === 0 // First photo is primary
    }));

    setPhotos(prev => [...prev, ...photosToAdd]);
    
    showNotification('success', `${newPhotos.length} photo(s) added successfully!`);

    // Reload to get synced status
    setTimeout(() => {
      loadPhotos();
    }, 1000);
  };

  // Handle camera/upload errors
  const handleCameraError = (error: string) => {
    showNotification('error', error);
  };

  // Set primary photo
  const handleSetPrimary = async (photoId: string) => {
    if (!lotId) return;

    try {
      await PhotoService.setPrimaryPhoto(lotId, photoId);
      
      // Update local state
      setPhotos(prev => prev.map(p => ({
        ...p,
        isPrimary: p.photoId === photoId
      })));

      showNotification('success', 'Primary photo updated');
    } catch (error) {
      showNotification('error', 'Failed to update primary photo');
    }
  };

  // Delete photo
  const handleDeletePhoto = async (photoId: string) => {
    if (!confirm('Delete this photo?')) return;

    try {
      await PhotoService.deletePhoto(photoId);
      
      setPhotos(prev => prev.filter(p => p.photoId !== photoId));
      
      showNotification('success', 'Photo deleted');
    } catch (error) {
      showNotification('error', 'Failed to delete photo');
    }
  };

  // Show notification
  const showNotification = (type: 'success' | 'error', message: string) => {
    setNotification({ type, message });
    setTimeout(() => setNotification(null), 5000);
  };

  // Get platform capabilities for UI customization
  const capabilities = CameraService.getPlatformCapabilities();

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      {/* Notification Banner */}
      {notification && (
        <div className={`
          fixed top-4 right-4 z-50 p-4 rounded-lg shadow-lg border-2 flex items-start gap-3 max-w-md
          ${notification.type === 'success' 
            ? 'bg-green-50 border-green-200' 
            : 'bg-red-50 border-red-200'
          }
        `}>
          {notification.type === 'success' ? (
            <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
          ) : (
            <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
          )}
          <div className="flex-1">
            <p className={`font-medium ${
              notification.type === 'success' ? 'text-green-900' : 'text-red-900'
            }`}>
              {notification.message}
            </p>
          </div>
          <button
            onClick={() => setNotification(null)}
            className="text-gray-400 hover:text-gray-600"
          >
            ×
          </button>
        </div>
      )}

      {/* Header with Camera Button */}
      <div className="bg-white rounded-lg shadow-md p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Lot Photos</h1>
            <p className="text-sm text-gray-600 mt-1">
              {photos.length} photo(s) • {capabilities.platform} platform
            </p>
          </div>

          {/* Enhanced Photo Capture Button */}
          <PhotoCaptureButton
            lotId={lotId!}
            onPhotosCaptured={handlePhotosCaptured}
            onError={handleCameraError}
            disabled={!lotId || loading}
          />
        </div>

        {/* Platform Info Card (helpful for users) */}
        <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
          <p className="text-sm text-blue-900">
            <strong>📱 Your device:</strong> {capabilities.platform}
            {capabilities.supportsNativeCamera && ' • Native camera available'}
            {capabilities.supportsWebCamera && ' • Web camera available'}
          </p>
          <p className="text-xs text-blue-700 mt-1">
            {capabilities.supportsNativeCamera && 'Use native camera for best quality with flash, zoom, and focus controls.'}
            {capabilities.supportsWebCamera && !capabilities.supportsNativeCamera && 'Use web camera to capture photos directly, or upload existing files.'}
            {!capabilities.supportsNativeCamera && !capabilities.supportsWebCamera && 'Upload photos from your device.'}
          </p>
        </div>
      </div>

      {/* Photo Grid */}
      <div className="bg-white rounded-lg shadow-md p-6">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : photos.length === 0 ? (
          <div className="text-center py-12">
            <div className="w-24 h-24 mx-auto mb-4 bg-gray-100 rounded-full flex items-center justify-center">
              <svg className="w-12 h-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">No photos yet</h3>
            <p className="text-gray-600 mb-4">
              {capabilities.supportsNativeCamera && 'Take a photo with your camera to get started'}
              {capabilities.supportsWebCamera && !capabilities.supportsNativeCamera && 'Capture a photo or upload files to get started'}
              {!capabilities.supportsNativeCamera && !capabilities.supportsWebCamera && 'Upload photos to get started'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {photos.map((photo) => (
              <div
                key={photo.photoId}
                className="relative group aspect-square bg-gray-100 rounded-lg overflow-hidden border-2 border-gray-200 hover:border-indigo-500 transition-all"
              >
                {/* Image */}
                <img
                  src={photo.blobUrl}
                  alt="Lot photo"
                  className="w-full h-full object-cover"
                />

                {/* Primary Badge */}
                {photo.isPrimary && (
                  <div className="absolute top-2 left-2 px-2 py-1 bg-indigo-600 text-white text-xs font-medium rounded flex items-center gap-1">
                    <Star className="w-3 h-3 fill-current" />
                    Primary
                  </div>
                )}

                {/* Hover Actions */}
                <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-50 transition-all flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100">
                  {!photo.isPrimary && (
                    <button
                      onClick={() => handleSetPrimary(photo.photoId)}
                      className="p-2 bg-white rounded-full hover:bg-indigo-50 transition-colors"
                      title="Set as primary"
                    >
                      <Star className="w-5 h-5 text-indigo-600" />
                    </button>
                  )}
                  
                  <button
                    onClick={() => handleDeletePhoto(photo.photoId)}
                    className="p-2 bg-white rounded-full hover:bg-red-50 transition-colors"
                    title="Delete photo"
                  >
                    <Trash2 className="w-5 h-5 text-red-600" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Helpful Tips Section */}
      <div className="mt-6 bg-yellow-50 border border-yellow-200 rounded-lg p-4">
        <h4 className="font-medium text-yellow-900 mb-2">💡 Photo Tips</h4>
        <ul className="text-sm text-yellow-800 space-y-1">
          <li>• Take photos in good lighting for best results</li>
          <li>• Include multiple angles of the item</li>
          <li>• Show any damage or unique features</li>
          <li>• First photo is automatically set as primary</li>
          <li>• Photos work offline and sync when connected</li>
          {capabilities.supportsNativeCamera && <li>• Use flash for dark items or low light</li>}
        </ul>
      </div>

      {/* Debug Info (Remove in production) */}
      {process.env.NODE_ENV === 'development' && (
        <div className="mt-6 bg-gray-100 border border-gray-300 rounded-lg p-4 text-xs font-mono">
          <h4 className="font-bold mb-2">Debug Info:</h4>
          <pre className="overflow-auto">
            {JSON.stringify({
              lotId,
              photoCount: photos.length,
              capabilities: {
                platform: capabilities.platform,
                nativeCamera: capabilities.supportsNativeCamera,
                webCamera: capabilities.supportsWebCamera,
                fileUpload: capabilities.supportsFileUpload
              }
            }, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}

// HOW TO USE:
// 1. Copy PhotoCaptureButton component
// 2. Import and use as shown above
// 3. Customize styling to match your design system
// 4. Add additional features as needed (filters, cropping, etc.)