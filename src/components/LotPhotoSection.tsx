// src/components/LotPhotoSection.tsx
import { memo, useCallback } from 'react';
import {
  Sparkles,
  Image as ImageIcon,
  Trash2,
  Star,
  Check,
  RotateCcw,
  Sun,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import type { Photo } from '../types';
import type { PhotoRoomEditOptions } from '../services/PhotoRoomService';

interface LotPhotoSectionProps {
  photos: Photo[];
  photoUrls: Record<string, string>;
  selectedPhotos: Set<string>;
  showEditPanel: boolean;
  editOptions: PhotoRoomEditOptions;
  processing: boolean;
  progressText: string;
  onToggleEditPanel: () => void;
  onTogglePhotoSelection: (photoId: string) => void;
  onSelectAll: () => void;
  onClearSelection: () => void;
  onResetEditOptions: () => void;
  onEditOptionsChange: (options: PhotoRoomEditOptions) => void;
  onGeneratePreview: () => void;
  onSetPrimary: (photoId: string) => void;
  onDeletePhoto: (photoId: string) => void;
}

// Photo card component - memoized
const PhotoCard = memo(({
  photo,
  photoUrl,
  isSelected,
  onToggleSelection,
  onSetPrimary,
  onDelete
}: {
  photo: Photo;
  photoUrl: string | undefined;
  isSelected: boolean;
  onToggleSelection: () => void;
  onSetPrimary: () => void;
  onDelete: () => void;
}) => (
  <div
    className={`relative rounded-lg overflow-hidden bg-gray-100 transition-all ${
      isSelected ? 'ring-4 ring-indigo-500 shadow-lg scale-[1.02]' : ''
    }`}
  >
    <div className="aspect-square cursor-pointer" onClick={onToggleSelection}>
      {photoUrl ? (
        <img src={photoUrl} alt={photo.file_name} className="w-full h-full object-cover" />
      ) : (
        <div className="w-full h-full flex items-center justify-center">
          <ImageIcon className="w-8 h-8 text-gray-400" />
        </div>
      )}

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

    <div className="flex items-center justify-between px-2 py-1.5 bg-gray-50 border-t border-gray-200">
      <span className="text-xs text-gray-500 truncate max-w-[50%]">
        {photo.file_name?.split('/').pop()?.substring(0, 12) || 'Photo'}
      </span>
      <div className="flex gap-1">
        {!photo.is_primary && (
          <button
            onClick={(e) => { e.stopPropagation(); onSetPrimary(); }}
            className="p-1.5 bg-white rounded-full shadow-sm border border-gray-200 active:bg-yellow-100"
            title="Set as primary"
          >
            <Star className="w-4 h-4 text-yellow-500" />
          </button>
        )}
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          className="p-1.5 bg-white rounded-full shadow-sm border border-gray-200 active:bg-red-100"
          title="Delete photo"
        >
          <Trash2 className="w-4 h-4 text-red-600" />
        </button>
      </div>
    </div>
  </div>
));

PhotoCard.displayName = 'PhotoCard';

// Background options
const BACKGROUND_OPTIONS = [
  { value: undefined, label: 'Keep', color: 'bg-gray-200' },
  { value: 'transparent', label: 'Remove', color: 'bg-gradient-to-br from-gray-100 to-gray-300' },
  { value: 'white', label: 'White', color: 'bg-white border' },
  { value: 'black', label: 'Black', color: 'bg-black' },
  { value: 'grey', label: 'Grey', color: 'bg-gray-400' },
] as const;

function LotPhotoSection({
  photos,
  photoUrls,
  selectedPhotos,
  showEditPanel,
  editOptions,
  processing,
  progressText,
  onToggleEditPanel,
  onTogglePhotoSelection,
  onSelectAll,
  onClearSelection,
  onResetEditOptions,
  onEditOptionsChange,
  onGeneratePreview,
  onSetPrimary,
  onDeletePhoto
}: LotPhotoSectionProps) {
  const handleBackgroundChange = useCallback((value: string | undefined) => {
    onEditOptionsChange({
      ...editOptions,
      backgroundColor: value,
      removeBackground: value === 'transparent'
    });
  }, [editOptions, onEditOptionsChange]);

  const handleFillChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    onEditOptionsChange({ ...editOptions, fillPercentage: parseInt(e.target.value) });
  }, [editOptions, onEditOptionsChange]);

  const handleLightChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    onEditOptionsChange({ ...editOptions, lightBalance: parseInt(e.target.value) });
  }, [editOptions, onEditOptionsChange]);

  if (photos.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Photos</h2>
          <span className="text-sm text-gray-500">0 photos</span>
        </div>
        <div className="text-center py-12 bg-gray-50 rounded-lg">
          <ImageIcon className="w-12 h-12 text-gray-400 mx-auto mb-3" />
          <p className="text-gray-500 mb-4">No photos yet</p>
          <p className="text-sm text-gray-400">Tap Camera to take a photo or Choose Files to upload</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-900">Photos</h2>
        <span className="text-sm text-gray-500">{photos.length} photo{photos.length !== 1 ? 's' : ''}</span>
      </div>

      {/* AI Photo Editor Panel */}
      <div className="bg-gradient-to-r from-indigo-50 to-purple-50 border border-indigo-200 rounded-xl overflow-hidden mb-4">
        <button
          onClick={onToggleEditPanel}
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
          {showEditPanel ? <ChevronUp className="w-5 h-5 text-indigo-600" /> : <ChevronDown className="w-5 h-5 text-indigo-600" />}
        </button>

        {showEditPanel && (
          <div className="p-4 border-t border-indigo-200 space-y-4">
            {/* Selection Controls */}
            <div className="flex items-center gap-3 flex-wrap">
              <button onClick={onSelectAll} className="text-sm text-indigo-600 hover:underline">Select All</button>
              <span className="text-gray-300">|</span>
              <button onClick={onClearSelection} className="text-sm text-indigo-600 hover:underline">Clear Selection</button>
              <button onClick={onResetEditOptions} className="ml-auto text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1">
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
                {BACKGROUND_OPTIONS.map((opt) => (
                  <button
                    key={opt.label}
                    onClick={() => handleBackgroundChange(opt.value)}
                    className={`px-3 py-1.5 rounded-lg text-sm transition-all ${
                      editOptions.backgroundColor === opt.value || (!editOptions.backgroundColor && !opt.value)
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
                onChange={handleFillChange}
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
                onChange={handleLightChange}
                className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
              />
            </div>

            {/* Process Button */}
            <button
              onClick={onGeneratePreview}
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

      {/* Photo Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
        {photos.map(photo => (
          <PhotoCard
            key={photo.id}
            photo={photo}
            photoUrl={photoUrls[photo.id]}
            isSelected={selectedPhotos.has(photo.id)}
            onToggleSelection={() => onTogglePhotoSelection(photo.id)}
            onSetPrimary={() => onSetPrimary(photo.id)}
            onDelete={() => onDeletePhoto(photo.id)}
          />
        ))}
      </div>
    </div>
  );
}

export default memo(LotPhotoSection);