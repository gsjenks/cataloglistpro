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
  const btn = (active: boolean, activeCls: string, interactive: boolean) =>
    `px-2.5 py-1 text-xs font-medium transition-colors ` +
    (active ? activeCls : 'bg-white text-gray-600 ') +
    (interactive ? 'hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed ' : 'cursor-default ');

  return (
    <div className="inline-flex rounded-md border border-gray-200 overflow-hidden" role="group">
      <button
        type="button"
        disabled={disabled}
        aria-pressed={status === 'available'}
        onClick={() => status !== 'available' && onChange('available')}
        className={btn(status === 'available', 'bg-green-600 text-white', true)}
      >
        Available
      </button>
      <button
        type="button"
        disabled={disabled}
        aria-pressed={status === 'held'}
        onClick={() => (onHold ? onHold() : onChange('held'))}
        title="Put this item in a customer's basket"
        className={btn(status === 'held', 'bg-amber-500 text-white', true)}
      >
        Held
      </button>
      <button
        type="button"
        disabled
        aria-pressed={status === 'sold'}
        title="Set automatically when the item is paid for at checkout"
        className={btn(status === 'sold', 'bg-gray-700 text-white', false)}
      >
        Sold
      </button>
    </div>
  );
}

export default memo(InventoryStatusControl);
