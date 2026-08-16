// src/components/PaymentsPanel.tsx
// D4 — payment-resolution worklist. Lists sold lots that aren't paid, flags how
// overdue each is past its 72h due date, and drives the resolution actions:
// mark paid / offer 2nd bidder / (accept|decline) / mark defaulted. See PaymentService.

import { useState } from 'react';
import { CheckCircle2, AlertTriangle, UserPlus, X, ChevronRight, ChevronDown, Undo2, FileDown } from 'lucide-react';
import type { Lot } from '../types';
import {
  markLotPaid, markLotUnpaid, markAllPaid, offerSecondBidder, secondBidderAccepted, markDefaulted,
} from '../services/PaymentService';
import BuyerInvoiceImportModal from './BuyerInvoiceImportModal';
import type { ImportInvoicesResult } from '../services/BuyerInvoiceImportService';

interface Props {
  saleId: string;
  companyId?: string;
  lots: Lot[];
  onChanged: () => void;
}

const money = (n: number | undefined) =>
  (n ?? 0).toLocaleString('en-US', { style: 'currency', currency: 'USD' });

function overdueDays(due?: string): number | null {
  if (!due) return null;
  return Math.floor((Date.now() - new Date(due).getTime()) / 86_400_000);
}

export default function PaymentsPanel({ saleId, companyId, lots, onChanged }: Props) {
  const [busy, setBusy] = useState<string | null>(null);
  const [showInvoiceImport, setShowInvoiceImport] = useState(false);
  const [importResult, setImportResult] = useState<ImportInvoicesResult | null>(null);
  const [offerFor, setOfferFor] = useState<Lot | null>(null);
  const [offerName, setOfferName] = useState('');
  const [offerAmount, setOfferAmount] = useState('');
  const [showPaid, setShowPaid] = useState(false);

  const outstanding = lots.filter(
    (l) => l.outcome === 'sold' && (l.payment_status ?? 'unpaid') !== 'paid',
  );
  const totalOutstanding = outstanding.reduce((s, l) => s + (l.sold_price ?? 0), 0);
  const paid = lots
    .filter((l) => l.outcome === 'sold' && l.payment_status === 'paid')
    .sort((a, b) => (b.sold_price ?? 0) - (a.sold_price ?? 0));
  const totalPaid = paid.reduce((s, l) => s + (l.sold_price ?? 0), 0);

  const run = async (key: string, fn: () => Promise<unknown>) => {
    setBusy(key);
    try {
      await fn();
      onChanged();
    } catch (e) {
      console.error('Payment action failed:', e);
      alert('Action failed. See console.');
    } finally {
      setBusy(null);
    }
  };

  const doMarkAllPaid = () => {
    if (!confirm(`Mark all ${outstanding.length} outstanding lots as paid?`)) return;
    run('all', () => markAllPaid(saleId));
  };

  const submitOffer = () => {
    if (!offerFor) return;
    const amt = parseFloat(offerAmount);
    if (!offerName.trim() || !Number.isFinite(amt)) {
      alert('Enter the underbidder name and their bid amount.');
      return;
    }
    run(`offer:${offerFor.id}`, () => offerSecondBidder(offerFor.id, offerName.trim(), amt)).then(() => {
      setOfferFor(null);
      setOfferName('');
      setOfferAmount('');
    });
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Payments</h2>
          <p className="text-sm text-gray-500">
            {outstanding.length} outstanding · {money(totalOutstanding)} to collect
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowInvoiceImport(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium border border-gray-300 text-gray-700 hover:bg-gray-50"
            title="Import the LiveAuctioneers invoice PDF — tax, shipping and buyer balances"
          >
            <FileDown className="w-4 h-4" /> Import LA invoices
          </button>
          {outstanding.length > 0 && (
            <button
              onClick={doMarkAllPaid}
              disabled={busy === 'all'}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium bg-green-600 text-white hover:bg-green-700 disabled:opacity-50"
            >
              <CheckCircle2 className="w-4 h-4" /> Mark all paid
            </button>
          )}
        </div>
      </div>

      {importResult && (
        <div className="mt-3 rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-800">
          Imported {importResult.imported} invoice(s) covering {importResult.matchedLots} lot(s) in this sale ·{' '}
          {money(importResult.salesTax)} tax · {money(importResult.shipping)} shipping
          {importResult.markedPaid > 0 && <> · marked {importResult.markedPaid} lot(s) paid</>}
          {importResult.unmatchedInvoices.length > 0 && (
            <div className="text-xs text-amber-700 mt-1">
              {importResult.unmatchedInvoices.length} invoice(s) reference lots that aren't in this sale.
            </div>
          )}
          {importResult.flagged.length > 0 && (
            <div className="text-xs text-amber-700 mt-1">
              Flagged for review (LA's printed total doesn't add up): #{importResult.flagged.join(', #')}
            </div>
          )}
        </div>
      )}

      {outstanding.length === 0 ? (
        <div className="mt-6 text-center py-8 text-gray-400">
          <CheckCircle2 className="w-8 h-8 mx-auto mb-2 text-green-500" />
          <p className="text-sm">All sold lots are paid.</p>
        </div>
      ) : (
        <ul className="mt-4 divide-y divide-gray-100">
          {outstanding.map((l) => {
            const days = overdueDays(l.payment_due_at);
            const isSecond = l.payment_status === 'second_chance';
            return (
              <li key={l.id} className="py-3 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-medium text-gray-900">
                    #{l.lot_number} {l.name}
                  </div>
                  <div className="text-xs text-gray-500 flex flex-wrap gap-x-3">
                    <span className="text-gray-700 font-medium">{money(l.sold_price)}</span>
                    {l.buyer?.name && <span>{l.buyer.name}</span>}
                    {days != null && days >= 0 && (
                      <span className="inline-flex items-center gap-1 text-amber-600">
                        <AlertTriangle className="w-3 h-3" />
                        {days === 0 ? 'due today' : `${days}d overdue`}
                      </span>
                    )}
                  </div>
                  {isSecond && (
                    <div className="text-xs text-blue-700 mt-1">
                      2nd chance: {l.second_bidder_contact} @ {money(l.second_bidder_amount)}
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  {isSecond ? (
                    <>
                      <button
                        onClick={() => run(`acc:${l.id}`, () => secondBidderAccepted(l.id, l.second_bidder_contact ?? '', l.second_bidder_amount ?? 0))}
                        disabled={busy === `acc:${l.id}`}
                        className="px-2 py-1 text-xs rounded bg-green-600 text-white hover:bg-green-700 disabled:opacity-50"
                      >
                        2nd paid
                      </button>
                      <button
                        onClick={() => run(`dec:${l.id}`, () => markDefaulted(l.id))}
                        disabled={busy === `dec:${l.id}`}
                        className="px-2 py-1 text-xs rounded border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                      >
                        2nd declined
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={() => run(`paid:${l.id}`, () => markLotPaid(l.id))}
                        disabled={busy === `paid:${l.id}`}
                        className="px-2 py-1 text-xs rounded bg-green-600 text-white hover:bg-green-700 disabled:opacity-50"
                      >
                        Paid
                      </button>
                      <button
                        onClick={() => { setOfferFor(l); setOfferName(''); setOfferAmount(''); }}
                        className="p-1 text-gray-500 hover:text-blue-600"
                        title="Offer to 2nd bidder"
                      >
                        <UserPlus className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => {
                          if (confirm(`Mark #${l.lot_number} defaulted? It falls to unsold.`)) {
                            run(`def:${l.id}`, () => markDefaulted(l.id));
                          }
                        }}
                        disabled={busy === `def:${l.id}`}
                        className="px-2 py-1 text-xs rounded border border-gray-300 text-gray-700 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                      >
                        Default
                      </button>
                    </>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {paid.length > 0 && (
        <div className="mt-6 border-t border-gray-100 pt-4">
          <button
            onClick={() => setShowPaid((v) => !v)}
            className="flex items-center gap-1.5 text-sm font-medium text-gray-700 hover:text-gray-900"
          >
            {showPaid ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            Paid ({paid.length}) · {money(totalPaid)}
          </button>
          {showPaid && (
            <ul className="mt-2 divide-y divide-gray-100">
              {paid.map((l) => (
                <li key={l.id} className="py-2 flex items-center justify-between gap-3">
                  <div className="min-w-0 text-sm truncate">
                    <span className="text-gray-900">#{l.lot_number} {l.name}</span>
                    <span className="text-gray-500 ml-2">{money(l.sold_price)}</span>
                    {l.buyer?.name && <span className="text-gray-400 ml-2">{l.buyer.name}</span>}
                  </div>
                  <button
                    onClick={() => run(`unpaid:${l.id}`, () => markLotUnpaid(l.id))}
                    disabled={busy === `unpaid:${l.id}`}
                    className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded border border-gray-300 text-gray-600 hover:bg-gray-50 disabled:opacity-50 shrink-0"
                    title="Revert to unpaid"
                  >
                    <Undo2 className="w-3.5 h-3.5" /> Mark unpaid
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {showInvoiceImport && (
        <BuyerInvoiceImportModal
          saleId={saleId}
          companyId={companyId}
          onClose={() => setShowInvoiceImport(false)}
          onImported={(res) => {
            setImportResult(res);
            setShowInvoiceImport(false);
            onChanged();
          }}
        />
      )}

      {offerFor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-lg w-full max-w-sm p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-base font-semibold text-gray-900">
                Offer to 2nd bidder — #{offerFor.lot_number}
              </h3>
              <button onClick={() => setOfferFor(null)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Underbidder (name / contact)</label>
                <input
                  type="text" value={offerName} onChange={(e) => setOfferName(e.target.value)}
                  className="w-full border border-gray-300 rounded-md p-2 text-sm"
                  placeholder="name, email or phone"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Their bid amount</label>
                <input
                  type="number" inputMode="decimal" value={offerAmount} onChange={(e) => setOfferAmount(e.target.value)}
                  className="w-full border border-gray-300 rounded-md p-2 text-sm" placeholder="e.g. 250"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setOfferFor(null)} className="px-3 py-1.5 text-sm rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50">
                Cancel
              </button>
              <button
                onClick={submitOffer}
                disabled={busy === `offer:${offerFor.id}`}
                className="px-3 py-1.5 text-sm rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
              >
                Record offer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
