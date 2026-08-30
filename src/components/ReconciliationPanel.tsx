// src/components/ReconciliationPanel.tsx
// Stage 7 — reconciliation. One view of the sale's money: house revenue vs what
// is owed to consignors, a payout worklist (record check/ACH per consignor), and
// the accounting CSV export. Statements themselves live in SettlementStatement.

import { useEffect, useMemo, useState } from 'react';
import {
  Banknote, CheckCircle2, Download, FileText, Undo2, X, AlertTriangle, Landmark,
} from 'lucide-react';
import type { Consignment, Lot, HouseCharge, BuyerInvoiceRecord } from '../types';
import { listHouseCharges } from '../services/HouseChargeService';
import { listBuyerInvoices } from '../services/BuyerInvoiceImportService';
import { computeReconciliation, downloadAccountingCsv, type ConsignorRow } from '../lib/reconciliation';
import { recordPayout, clearPayout, markSettled } from '../services/ConsignmentService';
import { getRefunds, type RefundRecord } from '../services/RefundService';
import SettlementStatement from './SettlementStatement';

interface Props {
  saleId: string;
  saleName: string;
  consignments: Consignment[];
  lots: Lot[];
  consignorNames: Record<string, string>;
  saleType?: 'estate_sale' | 'auction' | 'social';
  onChanged: () => void;
}

const money = (n: number | undefined) =>
  (n ?? 0).toLocaleString('en-US', { style: 'currency', currency: 'USD' });

const METHODS = [
  { value: 'check', label: 'Check' },
  { value: 'ach', label: 'ACH' },
  { value: 'wire', label: 'Wire' },
  { value: 'cash', label: 'Cash' },
  { value: 'other', label: 'Other' },
];

const methodLabel = (v?: string) => METHODS.find((m) => m.value === v)?.label ?? v ?? '';
const today = () => new Date().toISOString().slice(0, 10);
const shortDate = (iso?: string) =>
  iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';

export default function ReconciliationPanel({
  saleId, saleName, consignments, lots, consignorNames, saleType, onChanged,
}: Props) {
  const isEstate = saleType === 'estate_sale';
  const [busy, setBusy] = useState<string | null>(null);
  const [statementFor, setStatementFor] = useState<ConsignorRow | null>(null);
  const [payFor, setPayFor] = useState<ConsignorRow | null>(null);
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('check');
  const [reference, setReference] = useState('');
  const [paidOn, setPaidOn] = useState(today());
  const [note, setNote] = useState('');

  // Money the house billed buyers directly, and what LA collected on its own side.
  const [houseCharges, setHouseCharges] = useState<HouseCharge[]>([]);
  const [laInvoices, setLaInvoices] = useState<BuyerInvoiceRecord[]>([]);
  const [refunds, setRefunds] = useState<RefundRecord[]>([]);
  useEffect(() => {
    let live = true;
    listHouseCharges(saleId)
      .then((rows) => { if (live) setHouseCharges(rows); })
      .catch((e) => console.error('Failed to load house charges:', e));
    listBuyerInvoices(saleId)
      .then((rows) => { if (live) setLaInvoices(rows); })
      .catch((e) => console.error('Failed to load buyer invoices:', e));
    getRefunds(saleId)
      .then((rows) => { if (live) setRefunds(rows); })
      .catch((e) => console.error('Failed to load refunds:', e));
    return () => { live = false; };
  }, [saleId]);

  const shortDateTime = (iso: string) =>
    new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });

  const recon = useMemo(
    () => computeReconciliation(consignments, lots, consignorNames, houseCharges, laInvoices, refunds),
    [consignments, lots, consignorNames, houseCharges, laInvoices, refunds],
  );

  const run = async (key: string, fn: () => Promise<unknown>) => {
    setBusy(key);
    try {
      await fn();
      onChanged();
    } catch (e) {
      console.error('Reconciliation action failed:', e);
      alert('Action failed. See console.');
    } finally {
      setBusy(null);
    }
  };

  const openPayout = (row: ConsignorRow) => {
    setPayFor(row);
    setAmount(String(row.settlement.net));
    setMethod(row.consignment.payment_method || 'check');
    setReference(row.consignment.payment_reference || '');
    setPaidOn(row.paidAt ? row.paidAt.slice(0, 10) : today());
    setNote(row.consignment.payout_note || '');
  };

  const submitPayout = () => {
    if (!payFor) return;
    const amt = parseFloat(amount);
    if (!Number.isFinite(amt)) {
      alert('Enter the payout amount.');
      return;
    }
    const row = payFor;
    run(`pay:${row.consignment.id}`, () =>
      recordPayout(row.consignment, {
        amount: amt,
        method,
        reference,
        note,
        // Keep the time-of-day from a same-day entry; a back-dated one lands at noon
        // local so it can't drift across a day boundary in another timezone.
        paidAt: paidOn === today() ? new Date().toISOString() : new Date(`${paidOn}T12:00:00`).toISOString(),
      }),
    ).then(() => setPayFor(null));
  };

  const unpaidRows = recon.rows.filter((r) => !r.paid);
  const paidRows = recon.rows.filter((r) => r.paid);

  return (
    <div className="space-y-6">
      {/* ── Money summary ──────────────────────────────────────────────── */}
      <div className="bg-white rounded-lg border border-gray-200 p-5">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Reconciliation</h2>
            <p className="text-sm text-gray-500">
              {recon.paidCount} of {recon.rows.length} consignors paid
              {recon.outstanding > 0 && <> · {money(recon.outstanding)} still owed</>}
            </p>
          </div>
          <button
            onClick={() => downloadAccountingCsv(saleName, recon)}
            disabled={recon.rows.length === 0}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            <Download className="w-4 h-4" /> Accounting CSV
          </button>
        </div>

        <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 gap-3">
          {isEstate ? (
            <>
              <Stat label="Gross sales" value={money(recon.grossBeforeRefunds)} />
              <Stat label="Net sales" value={money(recon.grossHammer)} strong />
            </>
          ) : (
            <>
              <Stat label="Gross hammer" value={money(recon.grossHammer)} />
              <Stat label="Buyer's premium" value={money(recon.buyersPremium)} />
            </>
          )}
          <Stat label="Commission" value={money(recon.commission)} />
          <Stat label="Fees billed" value={money(recon.feesCharged)} />
          {recon.houseShipping > 0 && (
            <Stat label="Shipping billed in-house" value={money(recon.houseShipping)} />
          )}
          <Stat label="House revenue" value={money(recon.houseRevenue)} strong />
          <Stat label={isEstate ? 'Consignor / owner payouts' : 'Consignor payouts'} value={money(recon.payoutsDue)} />
        </div>

        {/* Unassigned money — sold lots not tied to any consignor never split into
            commission/fees/payout, so the totals look "wrong" until they're assigned. */}
        {recon.unassignedSoldCount > 0 && (
          <div className="mt-4 rounded-md border border-amber-300 bg-amber-50 p-4 flex items-start gap-2.5">
            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="text-sm text-amber-900">
              <p className="font-semibold">
                {money(recon.unassignedHammer)} across {recon.unassignedSoldCount} sold lot{recon.unassignedSoldCount === 1 ? '' : 's'} isn’t assigned to {isEstate ? 'an owner' : 'a consignor'}.
              </p>
              <p className="text-amber-800 mt-0.5">
                That money can’t split into commission, fees, or a payout until it’s assigned. Open
                <span className="font-medium"> Setup → {isEstate ? 'Client / Estate' : 'Consignors'}</span> and use
                <span className="font-medium"> “Assign lots”</span> to tie them to {isEstate ? 'the owner' : 'a consignor'}.
              </p>
            </div>
          </div>
        )}

        {/* Refund audit trail */}
        {recon.refundsIssued > 0 && (
          <div className="mt-4 rounded-md border border-gray-200 bg-gray-50 p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-gray-500">
                <Undo2 className="w-3.5 h-3.5" /> Refunds ({recon.refundCount})
              </div>
              <span className="text-sm font-semibold text-gray-900">{money(recon.refundsIssued)} refunded</span>
            </div>
            <ul className="mt-2 divide-y divide-gray-100">
              {refunds.map((r) => (
                <li key={r.id} className="py-2 flex items-start justify-between gap-3 text-sm">
                  <div className="min-w-0">
                    <div className="text-gray-900 truncate">
                      {r.lot_number ? `#${r.lot_number} ` : ''}{r.lot_name || 'Item'}
                      {r.buyer_name && <span className="text-gray-500"> · {r.buyer_name}</span>}
                    </div>
                    <div className="text-xs text-gray-500">
                      {shortDateTime(r.created_at)}{r.reason ? ` · ${r.reason}` : ''}
                    </div>
                  </div>
                  <span className="text-gray-900 font-medium whitespace-nowrap">− {money(r.amount)}</span>
                </li>
              ))}
            </ul>
            {refunds.length === 0 && (
              <p className="mt-2 text-xs text-gray-500">
                Recorded on the lots themselves — see the refunded lots on the Unsold tab.
              </p>
            )}
          </div>
        )}

        {/* Money that passes through the house without ever being its own. Kept out
            of House revenue above — sales tax is owed to the state, and anything
            LiveAuctioneers collected never reaches the house's books at all. */}
        {(recon.taxLiability > 0 || recon.laTaxCollected > 0 || recon.laShippingCollected > 0 || recon.refundsIssued > 0) && (
          <div className="mt-4 rounded-md border border-gray-200 bg-gray-50 p-4">
            <div className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-gray-500">
              <Landmark className="w-3.5 h-3.5" /> Held or collected for others — not revenue
            </div>

            {recon.taxLiability > 0 && (
              <div className="mt-3 flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-medium text-gray-900">Sales tax collected in-house</div>
                  <div className="text-xs text-gray-500">
                    Owed to the state, not income · {recon.taxCollectedCount} buyer(s)
                    {recon.exemptCount > 0 && <> · {recon.exemptCount} billed exempt</>}
                  </div>
                </div>
                <span className="text-lg font-bold tabular-nums text-amber-700 shrink-0">
                  {money(recon.taxLiability)}
                </span>
              </div>
            )}

            {recon.refundsIssued > 0 && (
              <div className="mt-3 pt-3 border-t border-gray-200 flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-medium text-gray-900">Refunds issued to buyers</div>
                  <div className="text-xs text-gray-500">
                    {recon.refundCount} lot(s) returned · already out of the sales figures above
                  </div>
                </div>
                <span className="text-lg font-bold tabular-nums text-amber-700 shrink-0">
                  {money(recon.refundsIssued)}
                </span>
              </div>
            )}

            {(recon.laTaxCollected > 0 || recon.laShippingCollected > 0) && (
              <div className="mt-3 pt-3 border-t border-gray-200">
                <div className="text-sm font-medium text-gray-700">Collected by LiveAuctioneers</div>
                <div className="text-xs text-gray-500">
                  Billed and remitted by LA — excluded from every figure above.
                </div>
                <div className="mt-1.5 flex flex-wrap gap-x-6 gap-y-1 text-sm text-gray-600">
                  <span>Sales tax <span className="tabular-nums text-gray-900">{money(recon.laTaxCollected)}</span></span>
                  <span>Shipping <span className="tabular-nums text-gray-900">{money(recon.laShippingCollected)}</span></span>
                </div>
              </div>
            )}
          </div>
        )}

        <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-gray-500">
          <span>
            Sell-through <span className="text-gray-800 font-medium">{recon.sellThrough}%</span>{' '}
            ({recon.soldCount} of {recon.lotCount} lots)
          </span>
          <span>
            Paid out <span className="text-gray-800 font-medium">{money(recon.paidOut)}</span>
          </span>
          <span>
            Outstanding <span className="text-gray-800 font-medium">{money(recon.outstanding)}</span>
          </span>
        </div>

        {/* Things that would make the numbers wrong if ignored. */}
        {(recon.unpaidSoldCount > 0 || recon.unassignedSoldCount > 0) && (
          <div className="mt-4 space-y-2">
            {recon.unpaidSoldCount > 0 && (
              <Warning>
                {recon.unpaidSoldCount} sold {recon.unpaidSoldCount === 1 ? 'lot is' : 'lots are'} still
                unpaid by the buyer — those hammer prices are counted here but the money isn't in yet.
                Clear them in Payments before paying consignors.
              </Warning>
            )}
            {recon.unassignedSoldCount > 0 && (
              <Warning>
                {recon.unassignedSoldCount} sold {recon.unassignedSoldCount === 1 ? 'lot has' : 'lots have'} no
                consignor ({money(recon.unassignedHammer)} hammer) — that money appears on no statement.
                Assign them in Setup.
              </Warning>
            )}
          </div>
        )}
      </div>

      {/* ── Payout worklist ────────────────────────────────────────────── */}
      <div className="bg-white rounded-lg border border-gray-200 p-5">
        <h3 className="text-base font-semibold text-gray-900">Consignor payouts</h3>

        {recon.rows.length === 0 ? (
          <div className="mt-4 text-center py-8 text-gray-400">
            <Banknote className="w-8 h-8 mx-auto mb-2" />
            <p className="text-sm">No consignors on this sale yet — add them in Setup.</p>
          </div>
        ) : (
          <>
            {unpaidRows.length === 0 ? (
              <div className="mt-4 flex items-center gap-2 text-sm text-green-700">
                <CheckCircle2 className="w-5 h-5" /> Every consignor has been paid.
              </div>
            ) : (
              <ul className="mt-3 divide-y divide-gray-100">
                {unpaidRows.map((r) => (
                  <PayoutRow
                    key={r.consignment.id}
                    row={r}
                    busy={busy}
                    isEstate={isEstate}
                    onStatement={() => setStatementFor(r)}
                    onPay={() => openPayout(r)}
                    onSettle={() => run(`settle:${r.consignment.id}`, () => markSettled(r.consignment.id, r.settlement.net))}
                  />
                ))}
              </ul>
            )}

            {paidRows.length > 0 && (
              <div className="mt-6 border-t border-gray-100 pt-4">
                <h4 className="text-sm font-medium text-gray-700">
                  Paid ({paidRows.length}) · {money(recon.paidOut)}
                </h4>
                <ul className="mt-2 divide-y divide-gray-100">
                  {paidRows.map((r) => (
                    <li key={r.consignment.id} className="py-3 flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-gray-900 truncate">{r.name}</div>
                        <div className="text-xs text-gray-500 flex flex-wrap gap-x-3">
                          <span className="text-green-700">
                            {money(r.recorded ?? r.settlement.net)} paid {shortDate(r.paidAt)}
                          </span>
                          {r.method && <span>{methodLabel(r.method)}{r.reference ? ` #${r.reference}` : ''}</span>}
                        </div>
                        {r.drifted && (
                          <div className="text-xs text-amber-600 mt-1 flex items-center gap-1">
                            <AlertTriangle className="w-3 h-3" />
                            Statement now nets {money(r.settlement.net)} — lots changed after the payout.
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          onClick={() => setStatementFor(r)}
                          className="p-1.5 text-gray-500 hover:text-green-600"
                          title="Settlement statement"
                        >
                          <FileText className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => openPayout(r)}
                          className="px-2 py-1 text-xs rounded border border-gray-300 text-gray-700 hover:bg-gray-50"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => {
                            if (confirm(`Undo the payout record for ${r.name}?`)) {
                              run(`undo:${r.consignment.id}`, () => clearPayout(r.consignment.id));
                            }
                          }}
                          disabled={busy === `undo:${r.consignment.id}`}
                          className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded border border-gray-300 text-gray-600 hover:bg-gray-50 disabled:opacity-50"
                          title="Undo payout"
                        >
                          <Undo2 className="w-3.5 h-3.5" /> Undo
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Record-payout modal ────────────────────────────────────────── */}
      {payFor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-lg w-full max-w-sm p-5">
            <div className="flex items-start justify-between mb-3">
              <div>
                <h3 className="text-base font-semibold text-gray-900">Record payout</h3>
                <p className="text-xs text-gray-500">{payFor.name}</p>
              </div>
              <button onClick={() => setPayFor(null)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Amount</label>
                  <input
                    type="number" inputMode="decimal" value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="w-full border border-gray-300 rounded-md p-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Paid on</label>
                  <input
                    type="date" value={paidOn} onChange={(e) => setPaidOn(e.target.value)}
                    className="w-full border border-gray-300 rounded-md p-2 text-sm"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Method</label>
                  <select
                    value={method} onChange={(e) => setMethod(e.target.value)}
                    className="w-full border border-gray-300 rounded-md p-2 text-sm"
                  >
                    {METHODS.map((m) => (
                      <option key={m.value} value={m.value}>{m.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Reference</label>
                  <input
                    type="text" value={reference} onChange={(e) => setReference(e.target.value)}
                    className="w-full border border-gray-300 rounded-md p-2 text-sm"
                    placeholder="check # / conf."
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Note</label>
                <input
                  type="text" value={note} onChange={(e) => setNote(e.target.value)}
                  className="w-full border border-gray-300 rounded-md p-2 text-sm"
                  placeholder="optional"
                />
              </div>
              {Math.abs((parseFloat(amount) || 0) - payFor.settlement.net) >= 0.01 && (
                <p className="text-xs text-amber-600">
                  Statement nets {money(payFor.settlement.net)}.
                </p>
              )}
            </div>

            <div className="flex justify-end gap-2 mt-4">
              <button
                onClick={() => setPayFor(null)}
                className="px-3 py-1.5 text-sm rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={submitPayout}
                disabled={busy === `pay:${payFor.consignment.id}`}
                className="px-3 py-1.5 text-sm rounded-md bg-green-600 text-white hover:bg-green-700 disabled:opacity-50"
              >
                Record payout
              </button>
            </div>
          </div>
        </div>
      )}

      {statementFor && (
        <SettlementStatement
          consignment={statementFor.consignment}
          consignorName={statementFor.name}
          saleName={saleName}
          lots={lots}
          saleType={saleType}
          onClose={() => setStatementFor(null)}
        />
      )}
    </div>
  );
}

function PayoutRow({
  row, busy, isEstate, onStatement, onPay, onSettle,
}: {
  row: ConsignorRow;
  busy: string | null;
  isEstate: boolean;
  onStatement: () => void;
  onPay: () => void;
  onSettle: () => void;
}) {
  const s = row.settlement;
  return (
    <li className="py-3 flex items-start justify-between gap-3">
      <div className="min-w-0">
        <div className="text-sm font-medium text-gray-900 truncate">{row.name}</div>
        <div className="text-xs text-gray-500 flex flex-wrap gap-x-3">
          <span className="text-gray-800 font-medium">{money(s.net)} due</span>
          <span>{s.soldCount} sold · {money(s.gross)}{isEstate ? '' : ' hammer'}</span>
          {s.commission > 0 && <span>− {money(s.commission)} commission</span>}
          {s.feesTotal > 0 && <span>− {money(s.feesTotal)} fees</span>}
        </div>
        <div className="mt-1">
          {row.consignment.settled_at ? (
            <span className="inline-flex items-center gap-1 text-xs text-blue-700">
              <CheckCircle2 className="w-3 h-3" /> Statement generated {shortDate(row.consignment.settled_at)}
            </span>
          ) : (
            <button onClick={onSettle} disabled={busy === `settle:${row.consignment.id}`} className="text-xs text-gray-500 underline hover:text-gray-700 disabled:opacity-50">
              Mark statement generated
            </button>
          )}
        </div>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <button onClick={onStatement} className="p-1.5 text-gray-500 hover:text-green-600" title="Settlement statement">
          <FileText className="w-4 h-4" />
        </button>
        <button
          onClick={onPay}
          className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded bg-green-600 text-white hover:bg-green-700"
        >
          <Banknote className="w-3.5 h-3.5" /> Record payout
        </button>
      </div>
    </li>
  );
}

function Stat({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`rounded-md border p-3 ${strong ? 'border-green-200 bg-green-50' : 'border-gray-200 bg-gray-50'}`}>
      <div className="text-xs text-gray-500">{label}</div>
      <div className={`tabular-nums ${strong ? 'text-green-800 font-semibold' : 'text-gray-900'}`}>{value}</div>
    </div>
  );
}

function Warning({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
      <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
      <p>{children}</p>
    </div>
  );
}
