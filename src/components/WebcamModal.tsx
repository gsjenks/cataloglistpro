// src/components/WebcamModal.tsx
import { useRef, useState, useEffect, memo } from 'react';
import { Camera, X, RotateCcw, Check, Plus } from 'lucide-react';

interface WebcamModalProps {
  onCapture: (blob: Blob) => void;
  onClose: () => void;
}

function WebcamModal({ onCapture, onClose }: WebcamModalProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [photoCount, setPhotoCount] = useState(0);

  useEffect(() => {
    startCamera();
    return () => stopCamera();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const startCamera = async () => {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'environment',
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
    stream?.getTracks().forEach(track => track.stop());
  };

  const capturePhoto = () => {
    if (!videoRef.current || !canvasRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const context = canvas.getContext('2d');
    if (!context) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    context.drawImage(video, 0, 0, canvas.width, canvas.height);

    const imageDataUrl = canvas.toDataURL('image/jpeg', 0.9);
    setCapturedImage(imageDataUrl);
    stopCamera();
  };

  const retake = () => {
    setCapturedImage(null);
    startCamera();
  };

  const confirm = () => {
    if (!capturedImage || !canvasRef.current) return;
    canvasRef.current.toBlob((blob) => {
      if (blob) {
        onCapture(blob);
        setPhotoCount(prev => prev + 1);
        setCapturedImage(null);
        startCamera();
      }
    }, 'image/jpeg', 0.9);
  };

  const handleDone = () => {
    stopCamera();
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-90 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-2xl overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">
            {capturedImage ? 'Review Photo' : 'Take Photo'}
            {photoCount > 0 && (
              <span className="ml-2 text-sm font-normal text-indigo-600">
                ({photoCount} captured)
              </span>
            )}
          </h2>
          <button
            onClick={handleDone}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-all"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

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
            <img src={capturedImage} alt="Captured" className="w-full h-full object-contain" />
          ) : (
            <video ref={videoRef} autoPlay playsInline className="w-full h-full object-contain" />
          )}
        </div>

        <canvas ref={canvasRef} className="hidden" />

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
                <Plus className="w-5 h-5" />
                Save & Take More
              </button>
              <button
                onClick={() => {
                  if (canvasRef.current) {
                    canvasRef.current.toBlob((blob) => {
                      if (blob) onCapture(blob);
                      handleDone();
                    }, 'image/jpeg', 0.9);
                  }
                }}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-all font-medium"
              >
                <Check className="w-5 h-5" />
                Save & Done
              </button>
            </div>
          ) : (
            <div className="flex gap-3">
              <button
                onClick={capturePhoto}
                disabled={!stream || error !== null}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all font-medium"
              >
                <Camera className="w-5 h-5" />
                Capture Photo
              </button>
              {photoCount > 0 && (
                <button
                  onClick={handleDone}
                  className="flex items-center justify-center gap-2 px-4 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-all font-medium"
                >
                  <Check className="w-5 h-5" />
                  Done ({photoCount})
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default memo(WebcamModal);