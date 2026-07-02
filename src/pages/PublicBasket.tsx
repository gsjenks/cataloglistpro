// src/pages/PublicBasket.tsx
// Dedicated, bookmarkable/shareable basket page. The basket is server-backed and
// live; ?b=<basketId> lets a shared link (or staff) open the exact same basket.
// A basket QR lets staff pull it up / (Phase 4c step 2) load it into the register.

import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { ShoppingBasket } from 'lucide-react';
import { supabasePublic } from '../lib/publicClient';
import { useServerBasket } from '../hooks/useServerBasket';
import BasketContents from '../components/BasketContents';
import SaveBasketButtons from '../components/SaveBasketButtons';
import UrlQRCode from '../components/UrlQRCode';

export default function PublicBasket() {
  const { saleId } = useParams<{ saleId: string }>();
  const [searchParams] = useSearchParams();
  const bParam = searchParams.get('b') || undefined;
  const basket = useServerBasket(saleId, bParam);
  const [saleName, setSaleName] = useState('');

  const base = import.meta.env.VITE_APP_URL || (typeof window !== 'undefined' ? window.location.origin : '');
  const basketUrl = `${base}/view/sales/${saleId}/basket?b=${basket.basketId}`;

  useEffect(() => {
    if (!saleId) return;
    supabasePublic
      .from('sales')
      .select('name')
      .eq('id', saleId)
      .single()
      .then(({ data }) => setSaleName((data as { name?: string } | null)?.name ?? ''));
  }, [saleId]);

  const handleRemove = (lotId: string) => {
    basket.remove(lotId);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center gap-2">
          <ShoppingBasket className="w-5 h-5 text-indigo-600" />
          <h1 className="text-lg font-bold text-gray-900">Your Basket</h1>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-6">
        <div className="mb-4 p-4 bg-indigo-50 border border-indigo-200 rounded-lg">
          <p className="text-sm text-indigo-900 font-medium text-center mb-3">
            Save your basket so you can come back to it.
          </p>
          <SaveBasketButtons url={basketUrl} title={saleName ? `My basket — ${saleName}` : 'My basket'} />
          <p className="mt-3 text-xs text-indigo-700 text-center">
            Text or email the link to yourself — tapping it reopens your basket.
          </p>
        </div>

        {saleName && <p className="text-sm text-gray-500 mb-4">{saleName}</p>}

        {basket.items.length === 0 ? (
          <div className="text-center text-gray-500 py-16">
            <ShoppingBasket className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="font-medium">Your basket is empty</p>
            <p className="text-sm text-gray-400 mt-1">
              Scan an item's QR code at the sale to add it here.
            </p>
          </div>
        ) : (
          <>
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <BasketContents items={basket.items} total={basket.total} onRemove={handleRemove} />
            </div>

            {/* Basket QR — staff can scan this to see/ring up this basket */}
            <div className="mt-6 bg-white rounded-lg border border-gray-200 p-6 flex flex-col items-center">
              <p className="text-sm font-medium text-gray-700 mb-1">Checking out?</p>
              <p className="text-xs text-gray-500 mb-3 text-center">
                Show this code to staff to pay at the register.
              </p>
              <UrlQRCode url={basketUrl} size={160} className="rounded" />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
