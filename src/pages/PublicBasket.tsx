// src/pages/PublicBasket.tsx
// Dedicated, bookmarkable basket page for buyers (/view/sales/:saleId/basket).
// Lets a shopper who closed the app return to their basket with one tap.

import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { ShoppingBasket } from 'lucide-react';
import { supabasePublic } from '../lib/publicClient';
import { useBuyerBasket } from '../hooks/useBuyerBasket';
import { useHoldRenewal } from '../hooks/useHoldRenewal';
import { releaseLot } from '../lib/holds';
import BasketContents from '../components/BasketContents';
import SaveBasketButtons from '../components/SaveBasketButtons';

export default function PublicBasket() {
  const { saleId } = useParams<{ saleId: string }>();
  const basket = useBuyerBasket(saleId);
  const [saleName, setSaleName] = useState('');
  const shareUrl = typeof window !== 'undefined' ? window.location.href : '';

  // Keep holds alive while this page is open.
  useHoldRenewal(supabasePublic, !!saleId, basket);

  useEffect(() => {
    if (!saleId) return;
    supabasePublic
      .from('sales')
      .select('name')
      .eq('id', saleId)
      .single()
      .then(({ data }) => setSaleName((data as { name?: string } | null)?.name ?? ''));
  }, [saleId]);

  const handleRemove = async (lotId: string) => {
    await releaseLot(supabasePublic, lotId, basket.basketId);
    basket.removeItem(lotId);
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
          <SaveBasketButtons url={shareUrl} title={saleName ? `My basket — ${saleName}` : 'My basket'} />
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
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <BasketContents items={basket.items} total={basket.total} onRemove={handleRemove} />
          </div>
        )}
      </div>
    </div>
  );
}
