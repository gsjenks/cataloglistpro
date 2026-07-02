// src/components/QRScanner.tsx
// Full-screen camera QR scanner for the estate-sale floor. Opens the rear
// camera, decodes frames via ScannerService, and returns the scanned lot.

import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { decodeFrame, parseLotUrl, type ScannedLot } from '../services/ScannerService';

interface Props {
  onScan: (lot: ScannedLot) => void;
  onClose: () => void;
}

export default function QRScanner({ onScan, onClose }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number | undefined>(undefined);
  const streamRef = useRef<MediaStream | null>(null);
  const doneRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const stop = () => {
      if (rafRef.current !== undefined) cancelAnimationFrame(rafRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };

    const tick = async () => {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas || video.readyState !== video.HAVE_ENOUGH_DATA) {
        rafRef.current = requestAnimationFrame(tick);
        return;
      }
      const w = video.videoWidth;
      const h = video.videoHeight;
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) {
        rafRef.current = requestAnimationFrame(tick);
        return;
      }
      ctx.drawImage(video, 0, 0, w, h);

      try {
        const raw = await decodeFrame(canvas, ctx, w, h);
        if (raw && !doneRef.current) {
          const parsed = parseLotUrl(raw);
          if (parsed) {
            doneRef.current = true;
            stop();
            onScan(parsed);
            return;
          }
          setHint('That QR code is not a lot tag — try another.');
        }
      } catch {
        // ignore per-frame decode errors and keep scanning
      }
      rafRef.current = requestAnimationFrame(tick);
    };

    const start = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        const video = videoRef.current;
        if (video) {
          video.srcObject = stream;
          video.setAttribute('playsinline', 'true');
          await video.play();
          rafRef.current = requestAnimationFrame(tick);
        }
      } catch (e) {
        console.error('Camera error:', e);
        setError(
          'Could not access the camera. Grant camera permission and use a secure (https) connection.',
        );
      }
    };

    start();

    return () => {
      cancelled = true;
      stop();
    };
  }, [onScan]);

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 text-white">
        <span className="text-sm font-medium">Scan a lot QR tag</span>
        <button onClick={onClose} className="p-1.5 rounded-full hover:bg-white/10" aria-label="Close scanner">
          <X className="w-6 h-6" />
        </button>
      </div>

      <div className="relative flex-1 flex items-center justify-center overflow-hidden">
        {error ? (
          <div className="text-center text-white/90 px-6 max-w-sm">
            <p className="mb-4">{error}</p>
            <button onClick={onClose} className="px-4 py-2 bg-white/10 rounded-md hover:bg-white/20">
              Close
            </button>
          </div>
        ) : (
          <>
            <video ref={videoRef} className="w-full h-full object-cover" muted playsInline />
            {/* Reticle */}
            <div className="absolute w-56 h-56 border-2 border-white/80 rounded-2xl shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]" />
          </>
        )}
        <canvas ref={canvasRef} className="hidden" />
      </div>

      {hint && !error && (
        <div className="px-4 py-3 text-center text-sm text-amber-300 bg-black/60">{hint}</div>
      )}
    </div>
  );
}
