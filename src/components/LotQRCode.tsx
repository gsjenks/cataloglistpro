// src/components/LotQRCode.tsx
// Renders a lot's QR code, generated on the fly from the correct public route
// (/view/sales/:saleId/lots/:lotId) so it never depends on a possibly-stale
// stored qr_code_url. Used on lot cards and the public lot page.

import { useEffect, useState } from 'react';
import QRCode from 'qrcode';

interface Props {
  saleId: string;
  lotId: string;
  size?: number;
  className?: string;
}

export function lotPublicUrl(saleId: string, lotId: string): string {
  const base = import.meta.env.VITE_APP_URL || window.location.origin;
  return `${base}/view/sales/${saleId}/lots/${lotId}`;
}

export default function LotQRCode({ saleId, lotId, size = 96, className }: Props) {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    QRCode.toDataURL(lotPublicUrl(saleId, lotId), {
      width: size,
      margin: 1,
      errorCorrectionLevel: 'M',
    })
      .then((dataUrl) => {
        if (!cancelled) setSrc(dataUrl);
      })
      .catch((e) => console.error('QR render failed:', e));
    return () => {
      cancelled = true;
    };
  }, [saleId, lotId, size]);

  if (!src) {
    return (
      <div
        style={{ width: size, height: size }}
        className={`bg-gray-100 rounded ${className ?? ''}`}
        aria-hidden
      />
    );
  }

  return (
    <img
      src={src}
      alt="Lot QR code"
      width={size}
      height={size}
      className={className}
    />
  );
}
