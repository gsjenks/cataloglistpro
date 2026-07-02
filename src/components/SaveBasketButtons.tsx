// src/components/SaveBasketButtons.tsx
// Share / Copy buttons so a buyer can save a link back to their basket. Uses the
// native share sheet on phones (text/email/Notes to self), clipboard otherwise.

import { useState } from 'react';
import { Share2, Copy, Check } from 'lucide-react';

interface Props {
  url: string;
  title?: string;
}

export default function SaveBasketButtons({ url, title }: Props) {
  const [copied, setCopied] = useState(false);
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard blocked — the link is still in the address bar */
    }
  };

  const handleShare = async () => {
    if (canShare) {
      try {
        await navigator.share({ title: title || 'My basket', url });
      } catch {
        /* user dismissed the share sheet */
      }
    } else {
      handleCopy();
    }
  };

  return (
    <div className="flex gap-2 justify-center">
      {canShare && (
        <button
          onClick={handleShare}
          className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-md text-sm font-medium hover:bg-indigo-700"
        >
          <Share2 className="w-4 h-4" />
          Share / Save Link
        </button>
      )}
      <button
        onClick={handleCopy}
        className="inline-flex items-center gap-2 px-4 py-2 border border-indigo-300 text-indigo-700 bg-white rounded-md text-sm font-medium hover:bg-indigo-50"
      >
        {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
        {copied ? 'Copied!' : 'Copy Link'}
      </button>
    </div>
  );
}
