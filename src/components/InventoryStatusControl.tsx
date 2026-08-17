// src/components/InventoryStatusControl.tsx
// Estate-sale floor control (Available / Held / Sold):
//  • Available — release the lot back to the floor.
//  • Held      — put the lot in a customer's basket (opens a picker via onHold);
//                a hold is never a plain status flip, it always names a customer.
//  • Sold      — read-only. A lot only becomes Sold when it's paid at checkout,
//                so staff can't set it by hand here.

import { memo } from 'react';
import type { Lot } from '../types';

type InventoryStatus = NonNullable<Lot['inventory_status']>;

interface Props {
  status: InventoryStatus;
  onChange: (status: InventoryStatus) => void; // used for Available (release)
  onHold?: () => void;                         // Held → assign to a basket
  disabled?: boolean;
}

function InventoryStatusControl({ status, onChange, onHold, disabled }: Props) {
  // A sold lot is locked: it can only leave "Sold" through a refund, never by
  // flipping the status here.
  const sold = status === 'sold';
  const btn = (active: boolean, activeCls: string, interactive: boolean) =>
    `px-2.5 py-1 text-xs font-medium transition-colors ` +
    (active ? activeCls : 'bg-white text-gray-600 ') +
    (interactive ? 'hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed ' : 'cursor-default disabled:opacity-60 ');

  return (
    <div className="inline-flex rounded-md border border-gray-200 overflow-hidden" role="group">
      <button
        type="button"
        disabled={disabled || sold}
        aria-pressed={status === 'available'}
        onClick={() => status !== 'available' && onChange('available')}
        className={btn(status === 'available', 'bg-green-600 text-white', !sold)}
      >
        Available
      </button>
      <button
        type="button"
        disabled={disabled || sold}
        aria-pressed={status === 'held'}
        onClick={() => (onHold ? onHold() : onChange('held'))}
        title={sold ? 'Refund the sale to move this item' : "Put this item in a customer's basket"}
        className={btn(status === 'held', 'bg-amber-500 text-white', !sold)}
      >
        Held
      </button>
      <button
        type="button"
        disabled
        aria-pressed={sold}
        title="Set automatically when the item is paid for at checkout"
        className={btn(sold, 'bg-gray-700 text-white', false)}
      >
        Sold
      </button>
    </div>
  );
}

export default memo(InventoryStatusControl);
