// src/components/BuyerBasket.tsx
// Floating basket button + slide-up panel for the public lot page. The panel
// body is the shared BasketContents; a link opens the bookmarkable full page.

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ShoppingBasket, X } from 'lucide-react';
import type { BasketItem } from '../hooks/useBuyerBasket';
import BasketContents from './BasketContents';

const money = (n: number) => `$${n.toFixed(2)}`;

interface Props {
  items: BasketItem[];
  total: number;
  onRemove: (lotId: string) => void;
  saleId: string;
}

export default function BuyerBasket({ items, total, onRemove, saleId }: Props) {
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

            <div className="flex-1 overflow-auto px-4 py-3">
              <BasketContents items={items} total={total} onRemove={onRemove} />
              <div className="mt-4 text-center">
                <Link
                  to={`/view/sales/${saleId}/basket`}
                  onClick={() => setOpen(false)}
                  className="text-sm text-indigo-600 hover:underline"
                >
                  Open full basket page →
                </Link>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
