// src/components/UrlQRCode.tsx
// Generic QR code for any URL (e.g. a basket link staff can scan).

import { useEffect, useState } from 'react';
import QRCode from 'qrcode';

interface Props {
  url: string;
  size?: number;
  className?: string;
}

export default function UrlQRCode({ url, size = 160, className }: Props) {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    QRCode.toDataURL(url, { width: size, margin: 1, errorCorrectionLevel: 'M' })
      .then((dataUrl) => {
        if (!cancelled) setSrc(dataUrl);
      })
      .catch((e) => console.error('QR render failed:', e));
    return () => {
      cancelled = true;
    };
  }, [url, size]);

  if (!src) {
    return <div style={{ width: size, height: size }} className={`bg-gray-100 rounded ${className ?? ''}`} aria-hidden />;
  }
  return <img src={src} alt="QR code" width={size} height={size} className={className} />;
}
