// src/components/BuyerFields.tsx
// Shared buyer detail inputs. LiveAuctioneers hands us a full buyer record on the
// EOA import, but a second-chance or aftersale buyer is someone we found ourselves —
// their address has to be typed, and until it is, they have no shipping label, no
// packing-list address and no invoice address.

import type { LotBuyer } from '../types';

interface Props {
  value: LotBuyer;
  onChange: (buyer: LotBuyer) => void;
  /** Hide the name field when it's captured elsewhere on the form. */
  hideName?: boolean;
}

export default function BuyerFields({ value, onChange, hideName }: Props) {
  const set = (patch: Partial<LotBuyer>) => onChange({ ...value, ...patch });

  return (
    <div className="space-y-3">
      {!hideName && (
        <Text label="Buyer name" value={value.name} onChange={(v) => set({ name: v })} />
      )}
      <div className="grid grid-cols-2 gap-3">
        <Text label="Email" type="email" value={value.email} onChange={(v) => set({ email: v })} />
        <Text label="Phone" value={value.phone} onChange={(v) => set({ phone: v })} />
      </div>
      <Text label="Address" value={value.address} onChange={(v) => set({ address: v })} />
      <div className="grid grid-cols-6 gap-2">
        <div className="col-span-3">
          <Text label="City" value={value.city} onChange={(v) => set({ city: v })} />
        </div>
        <div className="col-span-1">
          <Text label="St" value={value.state} onChange={(v) => set({ state: v })} maxLength={2} />
        </div>
        <div className="col-span-2">
          <Text label="ZIP" value={value.zip} onChange={(v) => set({ zip: v })} />
        </div>
      </div>
    </div>
  );
}

function Text({
  label, value, onChange, type = 'text', maxLength,
}: {
  label: string;
  value?: string;
  onChange: (v: string) => void;
  type?: string;
  maxLength?: number;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <input
        type={type}
        value={value ?? ''}
        maxLength={maxLength}
        onChange={(e) => onChange(e.target.value)}
        className="w-full border border-gray-300 rounded-md p-2 text-sm"
      />
    </div>
  );
}
