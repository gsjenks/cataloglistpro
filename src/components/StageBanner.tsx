// src/components/StageBanner.tsx
// Persistent auction-lifecycle stage banner for SaleDetail (#2, spec §8-B): the
// 8-stage stepper, current-stage gate progress, and an Advance control that force-
// advances (recording an override) when the gate is not satisfied.

import { useState } from 'react';
import { Check, ChevronRight, AlertTriangle } from 'lucide-react';
import type { Sale, Lot, Consignment, Document } from '../types';
import {
  STAGE_ORDER, STAGES, stageIndex, gateStatus, computeDerived, nextStage,
} from '../lib/auctionStages';
import { advanceStage } from '../services/SaleStageService';

interface Props {
  sale: Sale;
  lots: Lot[];
  consignments: Consignment[];
  documents: Document[];
  onChanged: () => void;      // refetch the sale after an advance
  onOpenSetup?: () => void;   // jump to the Setup tab
}

export default function StageBanner({ sale, lots, consignments, documents, onChanged, onOpenSetup }: Props) {
  const current = sale.stage || 'intake';
  const derived = computeDerived({ lots, consignments, documents });
  const gate = gateStatus(current, sale.stage_progress, derived);
  const target = nextStage(current);

  const [showOverride, setShowOverride] = useState(false);
  const [reason, setReason] = useState('');
  const [advancing, setAdvancing] = useState(false);

  const doAdvance = async (override?: { reason: string }) => {
    if (!target) return;
    setAdvancing(true);
    try {
      await advanceStage(sale.id, current, sale.stage_progress, override);
      setShowOverride(false);
      setReason('');
      onChanged();
    } catch (e) {
      console.error('Failed to advance stage:', e);
      alert('Failed to advance stage.');
    } finally {
      setAdvancing(false);
    }
  };

  const handleAdvanceClick = () => {
    if (gate.satisfied) doAdvance();
    else setShowOverride(true);
  };

  return (
    <div className="mt-4 rounded-lg border border-gray-200 bg-white p-4">
      {/* Stepper */}
      <div className="flex items-center gap-1 overflow-x-auto pb-1">
        {STAGE_ORDER.map((s, i) => {
          const isCurrent = s === current;
          const isPast = stageIndex(s) < stageIndex(current);
          return (
            <div key={s} className="flex items-center shrink-0">
              <span
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${
                  isCurrent
                    ? 'bg-blue-600 text-white'
                    : isPast
                    ? 'bg-blue-50 text-blue-700'
                    : 'bg-gray-100 text-gray-500'
                }`}
              >
                {isPast && <Check className="w-3 h-3" />}
                {STAGES[s].label}
              </span>
              {i < STAGE_ORDER.length - 1 && <ChevronRight className="w-3 h-3 text-gray-300" />}
            </div>
          );
        })}
      </div>

      {/* Gate progress + advance */}
      <div className="mt-3 flex items-center justify-between gap-3 flex-wrap">
        <div className="text-sm text-gray-600">
          <span className="font-medium text-gray-900">{STAGES[current].label}</span>
          {' — '}
          {gate.requiredDone}/{gate.requiredTotal} required complete
          {gate.satisfied ? (
            <span className="ml-2 text-green-600">gate ready</span>
          ) : (
            <span className="ml-2 text-amber-600">{gate.openRequired.length} open</span>
          )}
          {onOpenSetup && (
            <button onClick={onOpenSetup} className="ml-2 text-blue-600 hover:underline">
              view checklist
            </button>
          )}
        </div>

        {target && (
          <button
            onClick={handleAdvanceClick}
            disabled={advancing}
            className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-sm font-medium disabled:opacity-50 ${
              gate.satisfied
                ? 'bg-blue-600 text-white hover:bg-blue-700'
                : 'bg-amber-100 text-amber-800 hover:bg-amber-200'
            }`}
          >
            {!gate.satisfied && <AlertTriangle className="w-3.5 h-3.5" />}
            Advance to {STAGES[target].label}
          </button>
        )}
      </div>

      {/* Override modal */}
      {showOverride && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-lg p-5 w-full max-w-md">
            <h3 className="text-lg font-semibold text-gray-900">Advance early?</h3>
            <p className="text-sm text-gray-600 mt-1">
              {gate.openRequired.length} required item(s) still open in {STAGES[current].label}.
              Advancing now records an override on this sale.
            </p>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Reason for advancing early…"
              rows={3}
              className="mt-3 w-full border border-gray-300 rounded-md p-2 text-sm"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setShowOverride(false)}
                className="px-3 py-1.5 text-sm rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={() => doAdvance({ reason: reason.trim() || 'No reason given' })}
                disabled={advancing}
                className="px-3 py-1.5 text-sm rounded-md bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-50"
              >
                Override &amp; advance
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
