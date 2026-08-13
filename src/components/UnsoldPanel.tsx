// src/components/UnsoldPanel.tsx
// D5 — unsold (passed) lot disposition. Pending unsold lots get an action: aftersale
// (a post-auction offer → becomes sold), return to consignor, hold for a future sale,
// or charity. Dispositioned lots are shown in SEPARATE sections (returned vs charity
// tracked apart) each printable for records. See DispositionService.

import { useState } from 'react';
import { RotateCcw, Archive, Heart, X, Undo2, Printer, ChevronRight, ChevronDown } from 'lucide-react';
import type { Lot, LotDisposition } from '../types';
import { sellAftersale, setDisposition, clearDisposition } from '../services/DispositionService';
import DispositionPrintList from './DispositionPrintList';

interface Props {
  saleId: string;
  lots: Lot[];
  consignorNames?: Record<string, string>;
  saleName: string;
  onChanged: () => void;
}

const money = (n?: number) => (n == null ? '' : n.toLocaleString('en-US', { style: 'currency', currency: 'USD' }));

export default function UnsoldPanel({ lots, consignorNames, saleName, onChanged }: Props) {
  const [busy, setBusy] = useState<string | null>(null);
  const [afterFor, setAfterFor] = useState<Lot | null>(null);
  const [afterName, setAfterName] = useState('');
  const [afterPrice, setAfterPrice] = useState('');
  const [printCat, setPrintCat] = useState<{ title: string; lots: Lot[] } | null>(null);

  const passed = lots.filter((l) => l.outcome === 'passed');
  const pending = passed.filter((l) => !l.disposition);
  const returned = passed.filter((l) => l.disposition === 'returned');
  const held = passed.filter((l) => l.disposition === 'hold_relist');
  const charity = passed.filter((l) => l.disposition === 'charity');

  const consignorOf = (l: Lot) => (l.consignment_id ? consignorNames?.[l.consignment_id] : undefined);

  const run = async (key: string, fn: () => Promise<unknown>) => {
    setBusy(key);
    try {
      await fn();
      onChanged();
    } catch (e) {
      console.error('Disposition action failed:', e);
      alert('Action failed. See console.');
    } finally {
      setBusy(null);
    }
  };

  const disposition = (l: Lot, d: LotDisposition) => run(`${d}:${l.id}`, () => setDisposition(l.id, d));

  const submitAftersale = () => {
    if (!afterFor) return;
    const amt = parseFloat(afterPrice);
    if (!afterName.trim() || !Number.isFinite(amt)) {
      alert('Enter the buyer and the agreed price.');
      return;
    }
    run(`after:${afterFor.id}`, () => sellAftersale(afterFor.id, afterName.trim(), amt)).then(() => {
      setAfterFor(null);
      setAfterName('');
      setAfterPrice('');
    });
  };

  return (
    <div className="space-y-6">
      {/* Pending unsold */}
      <div className="bg-white rounded-lg border border-gray-200 p-5">
        <h2 className="text-lg font-semibold text-gray-900">Unsold — to disposition</h2>
        <p className="text-sm text-gray-500">{pending.length} lot(s) awaiting a decision.</p>

        {pending.length === 0 ? (
          <div className="mt-4 text-center py-6 text-gray-400 text-sm">Nothing pending.</div>
        ) : (
          <ul className="mt-3 divide-y divide-gray-100">
            {pending.map((l) => (
              <li key={l.id} className="py-3 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-medium text-gray-900">#{l.lot_number} {l.name}</div>
                  <div className="text-xs text-gray-500 flex flex-wrap gap-x-3">
                    {(l.estimate_low || l.estimate_high) && (
                      <span>Est. {money(l.estimate_low)}{l.estimate_high ? `–${money(l.estimate_high)}` : ''}</span>
                    )}
                    {consignorOf(l) && <span>{consignorOf(l)}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0 flex-wrap justify-end">
                  <button onClick={() => { setAfterFor(l); setAfterName(''); setAfterPrice(''); }}
                    className="px-2 py-1 text-xs rounded bg-green-600 text-white hover:bg-green-700">
                    Aftersale
                  </button>
                  <button onClick={() => disposition(l, 'returned')} disabled={busy === `returned:${l.id}`}
                    className="px-2 py-1 text-xs rounded border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50">
                    Return
                  </button>
                  <button onClick={() => disposition(l, 'hold_relist')} disabled={busy === `hold_relist:${l.id}`}
                    className="px-2 py-1 text-xs rounded border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50">
                    Hold
                  </button>
                  <button onClick={() => disposition(l, 'charity')} disabled={busy === `charity:${l.id}`}
                    className="px-2 py-1 text-xs rounded border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50">
                    Charity
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <DispositionSection title="Returned to consignor" icon={<RotateCcw className="w-4 h-4" />}
        lots={returned} consignorOf={consignorOf} busy={busy}
        onUndo={(l) => run(`undo:${l.id}`, () => clearDisposition(l.id))}
        onPrint={() => setPrintCat({ title: 'Returned to Consignor', lots: returned })} />

      <DispositionSection title="Held for future sale" icon={<Archive className="w-4 h-4" />}
        lots={held} consignorOf={consignorOf} busy={busy}
        onUndo={(l) => run(`undo:${l.id}`, () => clearDisposition(l.id))}
        onPrint={() => setPrintCat({ title: 'Held for Future Sale', lots: held })} />

      <DispositionSection title="Charity" icon={<Heart className="w-4 h-4" />}
        lots={charity} consignorOf={consignorOf} busy={busy}
        onUndo={(l) => run(`undo:${l.id}`, () => clearDisposition(l.id))}
        onPrint={() => setPrintCat({ title: 'Charity Donation', lots: charity })} />

      {/* Aftersale modal */}
      {afterFor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-lg w-full max-w-sm p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-base font-semibold text-gray-900">Aftersale — #{afterFor.lot_number}</h3>
              <button onClick={() => setAfterFor(null)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Buyer (name / contact)</label>
                <input type="text" value={afterName} onChange={(e) => setAfterName(e.target.value)}
                  className="w-full border border-gray-300 rounded-md p-2 text-sm" placeholder="name, email or phone" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Agreed price</label>
                <input type="number" inputMode="decimal" value={afterPrice} onChange={(e) => setAfterPrice(e.target.value)}
                  className="w-full border border-gray-300 rounded-md p-2 text-sm" placeholder="e.g. 150" />
              </div>
              <p className="text-xs text-gray-500">
                Records the lot as sold &amp; unpaid — it moves to the Payments tab to collect and counts toward settlement.
              </p>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setAfterFor(null)} className="px-3 py-1.5 text-sm rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50">Cancel</button>
              <button onClick={submitAftersale} disabled={busy === `after:${afterFor.id}`}
                className="px-3 py-1.5 text-sm rounded-md bg-green-600 text-white hover:bg-green-700 disabled:opacity-50">Record aftersale</button>
            </div>
          </div>
        </div>
      )}

      {printCat && (
        <DispositionPrintList title={printCat.title} saleName={saleName} lots={printCat.lots} onClose={() => setPrintCat(null)} />
      )}
    </div>
  );
}

function DispositionSection({
  title, icon, lots, consignorOf, busy, onUndo, onPrint,
}: {
  title: string;
  icon: React.ReactNode;
  lots: Lot[];
  consignorOf: (l: Lot) => string | undefined;
  busy: string | null;
  onUndo: (l: Lot) => void;
  onPrint: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-5">
      <div className="flex items-center justify-between gap-3">
        <button onClick={() => setOpen((v) => !v)} className="flex items-center gap-2 text-gray-800 hover:text-gray-900">
          {open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          {icon}
          <span className="font-semibold">{title}</span>
          <span className="text-sm text-gray-500">({lots.length})</span>
        </button>
        {lots.length > 0 && (
          <button onClick={onPrint} className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50">
            <Printer className="w-3.5 h-3.5" /> Print
          </button>
        )}
      </div>
      {open && lots.length > 0 && (
        <ul className="mt-3 divide-y divide-gray-100">
          {lots.map((l) => (
            <li key={l.id} className="py-2 flex items-center justify-between gap-3">
              <div className="min-w-0 text-sm truncate">
                <span className="text-gray-900">#{l.lot_number} {l.name}</span>
                {consignorOf(l) && <span className="text-gray-400 ml-2">{consignorOf(l)}</span>}
              </div>
              <button onClick={() => onUndo(l)} disabled={busy === `undo:${l.id}`}
                className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded border border-gray-300 text-gray-600 hover:bg-gray-50 disabled:opacity-50 shrink-0">
                <Undo2 className="w-3.5 h-3.5" /> Undo
              </button>
            </li>
          ))}
        </ul>
      )}
      {open && lots.length === 0 && <div className="mt-3 text-sm text-gray-400">None.</div>}
    </div>
  );
}
