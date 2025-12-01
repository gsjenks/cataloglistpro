// components/PhotoCaptureButton.tsx
// Multi-option photo capture: Web camera, Native camera, File upload

import { useState } from 'react';
import { Camera, Upload, Video } from 'lucide-react';
import CameraService from '../services/CameraService';

interface PhotoCaptureButtonProps {
  lotId: string;
  onPhotosCaptured: (photos: Array<{ photoId: string; blobUrl: string }>) => void;
  onError: (error: string) => void;
  disabled?: boolean;
}

export default function PhotoCaptureButton({
  lotId,
  onPhotosCaptured,
  onError,
  disabled = false
}: PhotoCaptureButtonProps) {
  const [showMenu, setShowMenu] = useState(false);
  const [capturing, setCapturing] = useState(false);

  const capabilities = CameraService.getPlatformCapabilities();

  const handleNativeCamera = async () => {
    setShowMenu(false);
    setCapturing(true);

    try {
      const result = await CameraService.takePhoto(lotId, false);
      
      if (result.success && result.photoId && result.blobUrl) {
        onPhotosCaptured([{
          photoId: result.photoId,
          blobUrl: result.blobUrl
        }]);
      } else {
        onError(result.error || 'Failed to capture photo');
      }
    } catch (error: unknown) {
      onError(error instanceof Error ? error.message : 'Camera error');
    } finally {
      setCapturing(false);
    }
  };

  const handleWebCamera = async () => {
    setShowMenu(false);
    setCapturing(true);

    try {
      const result = await CameraService.captureFromWebCamera(lotId, false);
      
      if (result.success && result.photoId && result.blobUrl) {
        onPhotosCaptured([{
          photoId: result.photoId,
          blobUrl: result.blobUrl
        }]);
      } else {
        onError(result.error || 'Failed to capture photo');
      }
    } catch (error: unknown) {
      onError(error instanceof Error ? error.message : 'Web camera error');
    } finally {
      setCapturing(false);
    }
  };

  const handleFileUpload = () => {
    setShowMenu(false);
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.multiple = true;
    
    input.onchange = async (e) => {
      const files = (e.target as HTMLInputElement).files;
      if (!files || files.length === 0) return;

      setCapturing(true);
      try {
        const result = await CameraService.handleFileInput(files, lotId);
        
        if (result.success > 0) {
          onPhotosCaptured(result.photos);
        }
        
        if (result.failed > 0) {
          onError(`${result.failed} file(s) failed to upload`);
        }
      } catch (error: unknown) {
        onError(error instanceof Error ? error.message : 'Upload error');
      } finally {
        setCapturing(false);
      }
    };

    input.click();
  };

  // If only one option available, render direct button
  const availableOptions = [
    capabilities.supportsNativeCamera,
    capabilities.supportsWebCamera,
    capabilities.supportsFileUpload
  ].filter(Boolean).length;

  if (availableOptions === 1) {
    if (capabilities.supportsNativeCamera) {
      return (
        <button
          onClick={handleNativeCamera}
          disabled={disabled || capturing}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
        >
          <Camera className="w-5 h-5" />
          <span>{capturing ? 'Opening Camera...' : 'Take Photo'}</span>
        </button>
      );
    }

    if (capabilities.supportsWebCamera) {
      return (
        <button
          onClick={handleWebCamera}
          disabled={disabled || capturing}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
        >
          <Video className="w-5 h-5" />
          <span>{capturing ? 'Opening Camera...' : 'Capture Photo'}</span>
        </button>
      );
    }

    return (
      <button
        onClick={handleFileUpload}
        disabled={disabled || capturing}
        className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
      >
        <Upload className="w-5 h-5" />
        <span>{capturing ? 'Uploading...' : 'Upload Photos'}</span>
      </button>
    );
  }

  // Multiple options - show dropdown menu
  return (
    <div className="relative">
      <button
        onClick={() => setShowMenu(!showMenu)}
        disabled={disabled || capturing}
        className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
      >
        {capturing ? (
          <>
            <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            <span>Processing...</span>
          </>
        ) : (
          <>
            <Camera className="w-5 h-5" />
            <span>Add Photos</span>
          </>
        )}
      </button>

      {showMenu && !capturing && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-10"
            onClick={() => setShowMenu(false)}
          />

          {/* Menu */}
          <div className="absolute bottom-full right-0 mb-2 bg-white border border-gray-200 rounded-lg shadow-xl z-20 min-w-[200px] overflow-hidden">
            {capabilities.supportsNativeCamera && (
              <button
                onClick={handleNativeCamera}
                className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 transition-colors border-b border-gray-100"
              >
                <div className="p-2 bg-indigo-100 rounded-lg">
                  <Camera className="w-5 h-5 text-indigo-600" />
                </div>
                <div className="flex-1">
                  <p className="font-medium text-gray-900">Native Camera</p>
                  <p className="text-xs text-gray-500">Device camera with flash, zoom, focus</p>
                </div>
              </button>
            )}

            {capabilities.supportsWebCamera && (
              <button
                onClick={handleWebCamera}
                className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 transition-colors border-b border-gray-100"
              >
                <div className="p-2 bg-blue-100 rounded-lg">
                  <Video className="w-5 h-5 text-blue-600" />
                </div>
                <div className="flex-1">
                  <p className="font-medium text-gray-900">Web Camera</p>
                  <p className="text-xs text-gray-500">Use your computer's webcam</p>
                </div>
              </button>
            )}

            {capabilities.supportsFileUpload && (
              <button
                onClick={handleFileUpload}
                className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 transition-colors"
              >
                <div className="p-2 bg-green-100 rounded-lg">
                  <Upload className="w-5 h-5 text-green-600" />
                </div>
                <div className="flex-1">
                  <p className="font-medium text-gray-900">Upload Files</p>
                  <p className="text-xs text-gray-500">Choose photos from your device</p>
                </div>
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}