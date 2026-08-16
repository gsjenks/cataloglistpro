// src/components/HouseChargesModal.tsx
// Enter the shipping / handling / sales tax the HOUSE collects from one buyer —
// for lots the house ships itself and for post-sale purchases, neither of which
// LiveAuctioneers bills. Tax base is hammer + premium + shipping + handling.

import { useEffect, useMemo, useState } from 'react';
import { X, Trash2, AlertTriangle, BadgeCheck, Camera } from 'lucide-react';
import type { HouseCharge, TaxExemption } from '../types';
import { computeHouseTotals } from '../lib/invoices';
import { saveHouseCharge, deleteHouseCharge } from '../services/HouseChargeService';
import { listExemptions, findForBuyer, isExpired } from '../services/TaxExemptionService';
import TaxExemptionModal from './TaxExemptionModal';

interface Props {
  saleId: string;
  companyId?: string;
  buyerKey: string;
  buyerName: string;
  /** hammer + premium for this buyer's lots — the base the tax starts from. */
  goods: number;
  existing?: HouseCharge;
  /** Tax LiveAuctioneers already charged this buyer, if any — guards double-taxing. */
  laTax?: number;
  /** LA already collected shipping (their "Arranged by LiveAuctioneers" invoices). */
  laShipping?: number;
  defaultTaxRate?: number;
  onSaved: () => void;
  onClose: () => void;
}

const money = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
const METHODS = ['cash', 'check', 'card', 'other'];

// What gets printed on the invoice as the reason tax wasn't charged.
const certReason = (c: TaxExemption) =>
  [c.state, 'resale certificate', c.permit_number && `#${c.permit_number}`]
    .filter(Boolean).join(' ');

export default function HouseChargesModal({
  saleId, companyId, buyerKey, buyerName, goods, existing, laTax = 0, laShipping = 0,
  defaultTaxRate = 0, onSaved, onClose,
}: Props) {
  const [shipping, setShipping] = useState(String(existing?.shipping ?? ''));
  const [handling, setHandling] = useState(String(existing?.handling ?? ''));
  const [taxRate, setTaxRate] = useState(String(existing?.tax_rate ?? defaultTaxRate ?? ''));
  const [exempt, setExempt] = useState(!!existing?.tax_exempt);
  // If LA already charged this buyer sales tax, taxing the lots again here would
  // double-tax them — only the house's own shipping/handling is taxable.
  const [taxGoods, setTaxGoods] = useState(
    existing?.tax_includes_goods ?? laTax <= 0,
  );
  const [exemptReason, setExemptReason] = useState(existing?.exempt_reason ?? '');
  const [collected, setCollected] = useState(!!existing?.collected_at);
  const [method, setMethod] = useState(existing?.payment_method ?? 'cash');
  const [note, setNote] = useState(existing?.note ?? '');
  const [saving, setSaving] = useState(false);

  // A resale certificate on file exempts this buyer automatically; an expired one
  // never does — it says so instead, so nobody exempts a sale they can't defend.
  const [cert, setCert] = useState<TaxExemption | null>(null);
  const [showCert, setShowCert] = useState(false);
  useEffect(() => {
    if (!companyId) return;
    let live = true;
    // No company filter: a permit given to the estate-sale side counts here too.
    listExemptions()
      .then((all) => {
        if (!live) return;
        const found = findForBuyer(all, buyerKey) ?? null;
        setCert(found);
        // Don't override a decision already recorded on an existing charge row.
        if (found && !isExpired(found) && !existing) {
          setExempt(true);
          setExemptReason(certReason(found));
        }
      })
      .catch((e) => console.error('Failed to load tax exemptions:', e));
    return () => { live = false; };
  }, [companyId, buyerKey, existing]);

  const certValid = !!cert && !isExpired(cert);
  const certLabel = cert
    ? [cert.state, cert.permit_number && `#${cert.permit_number}`].filter(Boolean).join(' ')
    : '';

  const num = (s: string) => {
    const n = parseFloat(s);
    return Number.isFinite(n) ? n : 0;
  };

  const totals = useMemo(
    () => computeHouseTotals(goods, {
      shipping: num(shipping), handling: num(handling), taxRate: num(taxRate), exempt, taxGoods,
    }),
    [goods, shipping, handling, taxRate, exempt, taxGoods],
  );

  const save = async () => {
    setSaving(true);
    try {
      await saveHouseCharge({
        company_id: companyId,
        sale_id: saleId,
        buyer_key: buyerKey,
        buyer_name: buyerName,
        shipping: totals.shipping,
        handling: totals.handling,
        tax_rate: totals.taxRate,
        tax_includes_goods: totals.taxGoods,
        taxable_base: totals.taxableBase,
        tax: totals.tax,
        tax_exempt: exempt,
        exempt_reason: exempt ? (exemptReason || undefined) : undefined,
        collected_at: collected ? (existing?.collected_at ?? new Date().toISOString()) : undefined,
        payment_method: collected ? method : undefined,
        note: note || undefined,
      });
      onSaved();
    } catch (e) {
      console.error('Failed to save house charges:', e);
      alert('Could not save. See console.');
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!confirm(`Remove the house charges for ${buyerName}?`)) return;
    setSaving(true);
    try {
      await deleteHouseCharge(saleId, buyerKey);
      onSaved();
    } catch (e) {
      console.error('Failed to delete house charges:', e);
      alert('Could not delete. See console.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-lg w-full max-w-sm max-h-[90vh] overflow-y-auto p-5">
        <div className="flex items-start justify-between mb-3">
          <div>
            <h3 className="text-base font-semibold text-gray-900">House charges</h3>
            <p className="text-xs text-gray-500">{buyerName} · {money(goods)} in lots</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>

        {(laTax > 0 || laShipping > 0) && (
          <div className="mb-3 flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-800">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>
              LiveAuctioneers already billed this buyer
              {laShipping > 0 && <> {money(laShipping)} shipping</>}
              {laTax > 0 && laShipping > 0 && ' and'}
              {laTax > 0 && <> {money(laTax)} sales tax</>}. Only add what the house
              collects itself.
            </span>
          </div>
        )}

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Shipping" value={shipping} onChange={setShipping} />
            <Field label="Handling" value={handling} onChange={setHandling} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Tax rate %" value={taxRate} onChange={setTaxRate} disabled={exempt} />
            <div className="flex items-end">
              <label className="flex items-center gap-1.5 text-sm text-gray-700 pb-2">
                <input
                  type="checkbox" checked={exempt}
                  onChange={(e) => setExempt(e.target.checked)}
                  className="rounded border-gray-300"
                />
                Tax exempt
              </label>
            </div>
          </div>

          {/* Resale certificate on file for this buyer, company-wide. */}
          <div className={`rounded-md border p-2.5 text-xs ${
            certValid ? 'border-green-200 bg-green-50' : cert ? 'border-red-200 bg-red-50' : 'border-gray-200 bg-gray-50'
          }`}>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                {certValid ? (
                  <span className="inline-flex items-center gap-1 text-green-800 font-medium">
                    <BadgeCheck className="w-3.5 h-3.5" /> Resale certificate on file
                  </span>
                ) : cert ? (
                  <span className="inline-flex items-center gap-1 text-red-700 font-medium">
                    <AlertTriangle className="w-3.5 h-3.5" /> Certificate expired
                  </span>
                ) : (
                  <span className="text-gray-600">No resale certificate on file</span>
                )}
                {cert && (
                  <div className="text-gray-600 mt-0.5">
                    {[certLabel, cert.business_name].filter(Boolean).join(' · ')}
                    {cert.expires_on && <> · {isExpired(cert) ? 'expired' : 'expires'} {cert.expires_on}</>}
                  </div>
                )}
              </div>
              <button
                onClick={() => setShowCert(true)}
                disabled={!companyId}
                className="inline-flex items-center gap-1 px-2 py-1 rounded border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 shrink-0 disabled:opacity-50"
              >
                <Camera className="w-3.5 h-3.5" /> {cert ? 'View / update' : 'Add'}
              </button>
            </div>
          </div>

          {exempt && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Exemption reason</label>
              <input
                type="text" value={exemptReason} onChange={(e) => setExemptReason(e.target.value)}
                className="w-full border border-gray-300 rounded-md p-2 text-sm"
                placeholder="resale certificate #, out of state…"
              />
              {!certValid && (
                <p className="text-xs text-amber-600 mt-1">
                  No valid certificate on file — attach one so the exemption is defensible.
                </p>
              )}
            </div>
          )}

          {!exempt && (
            <label className="flex items-start gap-2 text-sm text-gray-700">
              <input
                type="checkbox" checked={taxGoods}
                onChange={(e) => setTaxGoods(e.target.checked)}
                className="mt-0.5 rounded border-gray-300"
              />
              <span>
                Tax the lots too ({money(goods)})
                <span className="block text-xs text-gray-500">
                  {laTax > 0
                    ? 'Off — LiveAuctioneers already taxed these lots.'
                    : 'On — the house is collecting the tax on this sale.'}
                </span>
              </span>
            </label>
          )}

          <div className="rounded-md border border-gray-200 bg-gray-50 p-3 text-sm space-y-1">
            <Row
              label="Taxable base"
              value={money(totals.taxableBase)}
              hint={totals.taxGoods ? 'lots + shipping + handling' : 'shipping + handling only'}
            />
            <Row label={exempt ? 'Sales tax (exempt)' : `Sales tax (${totals.taxRate}%)`} value={money(totals.tax)} />
            <div className="flex items-center justify-between border-t border-gray-300 pt-1.5 mt-1.5">
              <span className="font-medium text-gray-900">Collected by house</span>
              <span className="font-bold tabular-nums text-gray-900">{money(totals.charged)}</span>
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox" checked={collected}
              onChange={(e) => setCollected(e.target.checked)}
              className="rounded border-gray-300"
            />
            Already collected
          </label>

          {collected && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Paid by</label>
              <select
                value={method} onChange={(e) => setMethod(e.target.value)}
                className="w-full border border-gray-300 rounded-md p-2 text-sm capitalize"
              >
                {METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Note</label>
            <input
              type="text" value={note} onChange={(e) => setNote(e.target.value)}
              className="w-full border border-gray-300 rounded-md p-2 text-sm"
              placeholder="optional"
            />
          </div>
        </div>

        <div className="flex justify-between gap-2 mt-4">
          {existing ? (
            <button
              onClick={remove} disabled={saving}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-sm rounded-md border border-gray-300 text-gray-600 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
            >
              <Trash2 className="w-4 h-4" /> Remove
            </button>
          ) : <span />}
          <div className="flex gap-2">
            <button onClick={onClose} className="px-3 py-1.5 text-sm rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50">
              Cancel
            </button>
            <button
              onClick={save} disabled={saving}
              className="px-3 py-1.5 text-sm rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save charges'}
            </button>
          </div>
        </div>

        {showCert && (
          <TaxExemptionModal
            companyId={companyId}
            buyerKey={buyerKey}
            buyerName={buyerName}
            existing={cert ?? undefined}
            onSaved={(ex) => {
              setCert(ex);
              setShowCert(false);
              if (ex && !isExpired(ex)) {
                setExempt(true);
                setExemptReason(certReason(ex));
              } else if (!ex) {
                setExempt(false);
              }
            }}
            onClose={() => setShowCert(false)}
          />
        )}
      </div>
    </div>
  );
}

function Field({ label, value, onChange, disabled }: {
  label: string; value: string; onChange: (v: string) => void; disabled?: boolean;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <input
        type="number" inputMode="decimal" value={value} disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="w-full border border-gray-300 rounded-md p-2 text-sm disabled:bg-gray-100 disabled:text-gray-400"
        placeholder="0"
      />
    </div>
  );
}

function Row({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-gray-600">
        {label}
        {hint && <span className="block text-xs text-gray-400">{hint}</span>}
      </span>
      <span className="tabular-nums text-gray-900">{value}</span>
    </div>
  );
}
