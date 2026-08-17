// src/components/SaleSetupTab.tsx
// The Setup / Checklist tab for SaleDetail (#2, spec §8-C). Renders the current
// stage's checklist: manual items are togglable; derived items are read-only and
// computed live from lots / consignments / documents.

import { useState } from 'react';
import { Check, Square, CheckSquare, Lock } from 'lucide-react';
import type { Sale, Lot, Consignment, Document } from '../types';
import { gateStatus, computeDerived, stageLabel } from '../lib/auctionStages';
import { setSaleChecklistItem } from '../services/SaleStageService';

interface Props {
  sale: Sale;
  lots: Lot[];
  consignments: Consignment[];
  documents: Document[];
  onChanged: () => void;
}

export default function SaleSetupTab({ sale, lots, consignments, documents, onChanged }: Props) {
  const current = sale.stage || 'intake';
  const derived = computeDerived({ lots, consignments, documents });
  const gate = gateStatus(current, sale.stage_progress, derived, sale.sale_type);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const overrides = sale.stage_progress?.overrides ?? [];

  const toggle = async (key: string, done: boolean) => {
    setBusyKey(key);
    try {
      await setSaleChecklistItem(sale.id, sale.stage_progress, key, { done });
      onChanged();
    } catch (e) {
      console.error('Failed to update checklist:', e);
      alert('Failed to update checklist item.');
    } finally {
      setBusyKey(null);
    }
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-5">
      <div className="flex items-baseline justify-between">
        <h2 className="text-lg font-semibold text-gray-900">{stageLabel(current, sale.sale_type)} checklist</h2>
        <span className="text-sm text-gray-500">{gate.requiredDone}/{gate.requiredTotal} required</span>
      </div>

      <ul className="mt-4 divide-y divide-gray-100">
        {gate.items.map((item) => (
          <li key={item.key} className="flex items-start gap-3 py-3">
            {item.derived ? (
              <span title="Automatically determined from your data" className="mt-0.5">
                {item.done ? (
                  <Check className="w-5 h-5 text-green-600" />
                ) : (
                  <Lock className="w-5 h-5 text-gray-300" />
                )}
              </span>
            ) : (
              <button
                type="button"
                onClick={() => toggle(item.key, !item.done)}
                disabled={busyKey === item.key}
                className="mt-0.5 disabled:opacity-50"
                aria-label={item.done ? 'Mark not done' : 'Mark done'}
              >
                {item.done ? (
                  <CheckSquare className="w-5 h-5 text-blue-600" />
                ) : (
                  <Square className="w-5 h-5 text-gray-400" />
                )}
              </button>
            )}

            <div className="flex-1">
              <div className={`text-sm ${item.done ? 'text-gray-900' : 'text-gray-700'}`}>
                {item.label}
                {item.required ? (
                  <span className="ml-2 text-xs text-gray-400">required</span>
                ) : (
                  <span className="ml-2 text-xs text-gray-300">optional</span>
                )}
                {item.derived && <span className="ml-2 text-xs text-gray-400">auto</span>}
              </div>
              {item.note && <div className="text-xs text-gray-500 mt-0.5">{item.note}</div>}
            </div>
          </li>
        ))}
      </ul>

      {overrides.length > 0 && (
        <div className="mt-4 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">
          {overrides.length} stage override(s) recorded on this sale.
        </div>
      )}
    </div>
  );
}
