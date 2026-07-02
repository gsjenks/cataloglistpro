// src/components/BasketContents.tsx
// The body of a buyer basket: item rows with live hold countdowns, total, the
// hold notice, and the (Phase 4b) card-payment placeholder. Shared by the
// floating basket modal and the dedicated basket page.

import { useEffect, useState } from 'react';
import { Trash2, Clock } from 'lucide-react';
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

export default function BasketContents({ items, total, onRemove }: Props) {
  return (
    <>
      <div className="divide-y divide-gray-100">
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

      <div className="border-t border-gray-200 pt-3 mt-1 space-y-3">
        <div className="flex justify-between text-lg font-bold text-gray-900">
          <span>Total</span><span>{money(total)}</span>
        </div>
        <div className="p-3 bg-amber-50 border border-amber-200 rounded-md text-xs text-amber-800">
          Your items stay held while you're shopping. If you leave without paying,
          the holds release about 30 minutes later and the items return to the sale.
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
    </>
  );
}
