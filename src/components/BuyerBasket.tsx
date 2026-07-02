// src/components/BuyerBasket.tsx
// Buyer-facing basket for estate-sale self-checkout. A floating button opens a
// panel listing held items, each with a live 30-minute countdown. Card payment
// arrives in Phase 4b (Square); for now items are held and paid at the register.

import { useEffect, useState } from 'react';
import { ShoppingBasket, X, Trash2, Clock } from 'lucide-react';
import type { BasketItem } from '../hooks/useBuyerBasket';

const money = (n: number) => `$${n.toFixed(2)}`;

function Countdown({ heldUntil }: { heldUntil: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const msLeft = Math.max(0, new Date(heldUntil).getTime() - now);
  const mins = Math.floor(msLeft / 60000);
  const secs = Math.floor((msLeft % 60000) / 1000);
  const low = msLeft < 5 * 60000;
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium ${low ? 'text-red-600' : 'text-gray-500'}`}>
      <Clock className="w-3.5 h-3.5" />
      {mins}:{secs.toString().padStart(2, '0')}
    </span>
  );
}

interface Props {
  items: BasketItem[];
  total: number;
  onRemove: (lotId: string) => void;
}

export default function BuyerBasket({ items, total, onRemove }: Props) {
  const [open, setOpen] = useState(false);

  if (items.length === 0) return null;

  return (
    <>
      {/* Floating trigger */}
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-5 right-5 z-40 inline-flex items-center gap-2 px-4 py-3 bg-indigo-600 text-white rounded-full shadow-lg hover:bg-indigo-700"
      >
        <ShoppingBasket className="w-5 h-5" />
        <span className="font-semibold">{items.length}</span>
        <span className="opacity-90">·</span>
        <span className="font-semibold">{money(total)}</span>
      </button>

      {/* Panel */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40" onClick={() => setOpen(false)}>
          <div
            className="bg-white w-full sm:max-w-md sm:rounded-lg rounded-t-2xl max-h-[85vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">Your Basket</h2>
              <button onClick={() => setOpen(false)} className="p-1.5 rounded-full hover:bg-gray-100" aria-label="Close basket">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            <div className="flex-1 overflow-auto px-4 py-3 divide-y divide-gray-100">
              {items.map((item) => (
                <div key={item.lotId} className="flex items-center gap-3 py-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">
                      #{item.lotNumber ?? '—'} {item.name}
                    </p>
                    <div className="mt-0.5">
                      <Countdown heldUntil={item.heldUntil} />
                    </div>
                  </div>
                  <span className="text-sm font-semibold text-gray-900 whitespace-nowrap">{money(item.price)}</span>
                  <button onClick={() => onRemove(item.lotId)} className="p-1.5 text-gray-400 hover:text-red-600" aria-label="Remove from basket">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>

            <div className="border-t border-gray-200 px-4 py-3 space-y-3">
              <div className="flex justify-between text-lg font-bold text-gray-900">
                <span>Total</span><span>{money(total)}</span>
              </div>
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-md text-xs text-amber-800">
                Items in your basket are held for 30 minutes. If they aren't paid for,
                the hold is released and they become available to other shoppers.
              </div>
              <button
                disabled
                className="w-full px-4 py-3 bg-gray-200 text-gray-500 rounded-md font-semibold cursor-not-allowed"
                title="Card checkout is coming soon"
              >
                Pay by Card — Coming Soon
              </button>
              <p className="text-center text-xs text-gray-500">
                For now, take your held items to the register to pay.
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
