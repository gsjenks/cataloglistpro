// src/components/BasketIcon.tsx
// Persistent basket icon for the public header. Always visible (even when the
// basket is empty); shows a count badge when there are items. Links to the
// basket page for this shopper.

import { Link } from 'react-router-dom';
import { ShoppingBasket } from 'lucide-react';

interface Props {
  saleId: string;
  basketId?: string;
  count: number;
}

export default function BasketIcon({ saleId, basketId, count }: Props) {
  const to = basketId
    ? `/view/sales/${saleId}/basket?b=${basketId}`
    : `/view/sales/${saleId}/basket`;

  return (
    <Link
      to={to}
      className="relative inline-flex items-center p-2 text-gray-700 hover:text-indigo-600 transition-colors"
      aria-label={`Basket${count > 0 ? ` (${count})` : ''}`}
    >
      <ShoppingBasket className="w-6 h-6" />
      {count > 0 && (
        <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 flex items-center justify-center bg-indigo-600 text-white text-[10px] font-bold rounded-full">
          {count}
        </span>
      )}
    </Link>
  );
}
