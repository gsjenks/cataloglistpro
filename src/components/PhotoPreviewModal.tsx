// src/components/PhotoPreviewModal.tsx
import { memo } from 'react';
import { X } from 'lucide-react';

interface PreviewImage {
  photoId: string;
  originalUrl: string;
  enhancedUrl: string;
  enhancedBlob: Blob;
}

interface PhotoPreviewModalProps {
  previewImages: PreviewImage[];
  processing: boolean;
  progressText: string;
  onAccept: () => void;
  onReject: () => void;
}

function PhotoPreviewModal({
  previewImages,
  processing,
  progressText,
  onAccept,
  onReject
}: PhotoPreviewModalProps) {
  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl max-w-5xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-lg font-semibold">Preview Enhanced Images</h2>
          <button onClick={onReject} className="p-2 hover:bg-gray-100 rounded-full">
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
          <button
            onClick={onReject}
            className="px-5 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-100 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onAccept}
            disabled={processing}
            className="px-5 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:bg-indigo-300 transition-colors shadow-sm"
          >
            {processing ? progressText || 'Saving...' : 'Accept & Apply'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default memo(PhotoPreviewModal);