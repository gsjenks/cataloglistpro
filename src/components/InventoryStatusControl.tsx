// src/components/InventoryStatusControl.tsx
// Estate-sale floor control: staff mark a lot Available / Held / Sold at any
// time. This is independent of the online self-checkout delay (see
// src/lib/estateSale.ts) — staff are never gated.

import { memo } from 'react';
import type { Lot } from '../types';

type InventoryStatus = NonNullable<Lot['inventory_status']>;

const OPTIONS: { value: InventoryStatus; label: string; active: string }[] = [
  { value: 'available', label: 'Available', active: 'bg-green-600 text-white border-green-600' },
  { value: 'held', label: 'Held', active: 'bg-amber-500 text-white border-amber-500' },
  { value: 'sold', label: 'Sold', active: 'bg-gray-700 text-white border-gray-700' },
];

interface Props {
  status: InventoryStatus;
  onChange: (status: InventoryStatus) => void;
  disabled?: boolean;
}

function InventoryStatusControl({ status, onChange, disabled }: Props) {
  return (
    <div className="inline-flex rounded-md border border-gray-200 overflow-hidden" role="group">
      {OPTIONS.map((opt) => {
        const isActive = status === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            disabled={disabled}
            aria-pressed={isActive}
            onClick={() => !isActive && onChange(opt.value)}
            className={
              `px-2.5 py-1 text-xs font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed ` +
              (isActive ? opt.active : 'bg-white text-gray-600 hover:bg-gray-50')
            }
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

export default memo(InventoryStatusControl);
