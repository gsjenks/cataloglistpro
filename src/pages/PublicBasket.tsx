// src/pages/PublicBasket.tsx
// Dedicated, bookmarkable basket page. The basket is server-backed and live.
//   ?b=<shopperId>            identifies the basket (staff scan this from the QR).
//   ?b=<shopperId>&t=<token>  the "save your basket" link: the token is what
//                             actually opens it, so it works on another device.
// The shopper id alone shows nothing — it is not a credential.

import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { ShoppingBasket } from 'lucide-react';
import { fetchPublicSale } from '../lib/publicLots';
import { useServerBasket } from '../hooks/useServerBasket';
import { useShopper } from '../hooks/useShopper';
import BasketContents from '../components/BasketContents';
import SaveBasketButtons from '../components/SaveBasketButtons';
import UrlQRCode from '../components/UrlQRCode';

export default function PublicBasket() {
  const { saleId } = useParams<{ saleId: string }>();
  const [searchParams] = useSearchParams();
  const bParam = searchParams.get('b') || undefined;
  const tParam = searchParams.get('t') || undefined;
  const { shopperId, token: myToken, name, email, phone, register } = useShopper();
  // A link's own token wins; otherwise this device's token, but only for its
  // own basket (or no ?b= at all).
  const token = tParam ?? (!bParam || bParam === shopperId ? myToken : null);
  const basket = useServerBasket(saleId, token);
  // We only hold this shopper's own contact info (in localStorage), so only show
  // the name/phone/email header when viewing your own basket.
  const isOwnBasket = !!myToken && !!basket.basketId && basket.basketId === shopperId;
  const [saleName, setSaleName] = useState('');

  // Opening a saved basket link on a device with no shopper signs that device
  // in as the link's shopper, so items added from here land in the same basket.
  useEffect(() => {
    if (tParam && !myToken && basket.basketId) {
      register(basket.basketId, tParam, basket.shopperName ?? '');
    }
  }, [tParam, myToken, basket.basketId, basket.shopperName, register]);

  const base = import.meta.env.VITE_APP_URL || (typeof window !== 'undefined' ? window.location.origin : '');
  // Staff-facing QR: the basket id only. Save link: id + token.
  const basketUrl = `${base}/view/sales/${saleId}/basket?b=${basket.basketId}`;
  const saveUrl = token ? `${basketUrl}&t=${encodeURIComponent(token)}` : basketUrl;

  useEffect(() => {
    if (!saleId) return;
    fetchPublicSale(saleId).then((sale) => setSaleName(sale?.name ?? ''));
  }, [saleId]);

  const handleRemove = (lotId: string) => {
    basket.remove(lotId);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center gap-3">
          <ShoppingBasket className="w-5 h-5 text-indigo-600 shrink-0" />
          <div className="min-w-0">
            <h1 className="text-lg font-bold text-gray-900 leading-tight">
              {isOwnBasket && name
                ? `${name}'s Basket`
                : basket.shopperName
                  ? `${basket.shopperName}'s Basket`
                  : 'Your Basket'}
            </h1>
            {isOwnBasket && (phone || email) && (
              <p className="text-xs text-gray-500 truncate">
                {[phone, email].filter(Boolean).join(' · ')}
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-6">
        {basket.basketId && (
          <div className="mb-4 p-4 bg-indigo-50 border border-indigo-200 rounded-lg">
            <p className="text-sm text-indigo-900 font-medium text-center mb-3">
              Save your basket so you can come back to it.
            </p>
            <SaveBasketButtons url={saveUrl} title={saleName ? `My basket — ${saleName}` : 'My basket'} />
            <p className="mt-3 text-xs text-indigo-700 text-center">
              Text or email the link to yourself — tapping it reopens your basket.
            </p>
          </div>
        )}

        {saleName && <p className="text-sm text-gray-500 mb-4">{saleName}</p>}

        {(!token || basket.invalidToken) && bParam && (
          <div className="mb-4 p-4 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-900 text-center">
            This basket opens on the phone that started it, or from the link that
            was saved from it. If that was you, tap Add to Basket on any item and
            register with the same email or phone to get your basket back.
          </div>
        )}

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
