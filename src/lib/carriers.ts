// src/lib/carriers.ts
// Fulfillment carriers / handoffs (Stage 6). `kind` groups them into in-house,
// external shipper, or pickup; `ships` = uses the ship flow (tracking + shipped),
// otherwise the pickup flow (handed over = delivered).

export type CarrierKind = 'inhouse' | 'external' | 'pickup';

export interface Carrier {
  value: string;
  label: string;
  kind: CarrierKind;
  ships: boolean; // true → ship flow (tracking); false → pickup/handoff
}

export const CARRIERS: Carrier[] = [
  { value: 'inhouse', label: 'In-house delivery', kind: 'inhouse', ships: true },
  { value: 'fedex', label: 'FedEx', kind: 'external', ships: true },
  { value: 'usps', label: 'USPS', kind: 'external', ships: true },
  { value: 'ups', label: 'UPS', kind: 'external', ships: true },
  { value: 'allied', label: 'Allied Shipping', kind: 'external', ships: true },
  { value: 'crating', label: 'Crating & Freight', kind: 'external', ships: true },
  { value: 'pickup', label: 'Pickup', kind: 'pickup', ships: false },
  { value: 'store', label: 'Store hold', kind: 'pickup', ships: false },
];

export const CARRIER_BY_VALUE: Record<string, Carrier> = Object.fromEntries(
  CARRIERS.map((c) => [c.value, c]),
);

export function carrierLabel(value?: string): string {
  return value ? CARRIER_BY_VALUE[value]?.label ?? value : 'Unassigned';
}
