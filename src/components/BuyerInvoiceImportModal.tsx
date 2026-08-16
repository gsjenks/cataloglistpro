// src/components/BuyerInvoiceImportModal.tsx
// Import the LiveAuctioneers end-of-auction invoice PDF (partners → catalog → print).
// Parses in the browser, previews what was found, then upserts buyer_invoices —
// the only place sales tax, shipping and buyer balances exist on the LA path.

import { useState } from 'react';
import { X, Upload, Loader, FileText, AlertCircle, CheckCircle2 } from 'lucide-react';
import {
  parseInvoicePdf, importBuyerInvoices, type ImportInvoicesResult,
} from '../services/BuyerInvoiceImportService';
import type { LaInvoice } from '../lib/laInvoiceParse';

interface Props {
  saleId: string;
  companyId?: string;
  onClose: () => void;
  onImported: (result: ImportInvoicesResult) => void;
}

const money = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });

export default function BuyerInvoiceImportModal({ saleId, companyId, onClose, onImported }: Props) {
  const [invoices, setInvoices] = useState<LaInvoice[] | null>(null);
  const [fileName, setFileName] = useState('');
  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [applyPaymentStatus, setApplyPaymentStatus] = useState(true);
  const [error, setError] = useState('');

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setError('');
    setFileName(f.name);
    setInvoices(null);
    setParsing(true);
    try {
      const parsed = await parseInvoicePdf(f);
      if (parsed.length === 0) {
        setError("No invoices found. Expected the LiveAuctioneers partners invoice print-out (each invoice starts with its number and Paid/Unpaid).");
      }
      setInvoices(parsed);
    } catch (err) {
      const e2 = err as { message?: string } | null;
      setError(e2?.message || 'Failed to read the invoice PDF.');
    } finally {
      setParsing(false);
    }
  };

  const doImport = async () => {
    if (!invoices?.length) return;
    setImporting(true);
    setError('');
    try {
      onImported(await importBuyerInvoices(invoices, { saleId, companyId, applyPaymentStatus }));
    } catch (err) {
      console.error('Invoice import failed:', err);
      const e2 = err as { message?: string; details?: string } | null;
      setError([e2?.message, e2?.details].filter(Boolean).join(' — ') || 'Import failed.');
    } finally {
      setImporting(false);
    }
  };

  const totals = invoices
    ? {
        lots: invoices.reduce((n, i) => n + i.lots.length, 0),
        tax: invoices.reduce((n, i) => n + i.salesTax, 0),
        shipping: invoices.reduce((n, i) => n + i.shipping, 0),
        hammer: invoices.reduce((n, i) => n + i.hammerTotal, 0),
        owing: invoices.filter((i) => i.balanceDue > 0),
        flagged: invoices.filter((i) => !i.totalsBalance),
      }
    : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-lg w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">Import LiveAuctioneers invoices</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-4 space-y-4">
          <p className="text-sm text-gray-600">
            The end-of-auction invoice PDF carries the sales tax, shipping charges and
            buyer balances that the EOA results file leaves out.
          </p>

          <label className="block border-2 border-dashed border-gray-300 rounded-lg p-6 text-center cursor-pointer hover:border-blue-400">
            <input type="file" accept="application/pdf,.pdf" onChange={handleFile} className="hidden" />
            {parsing ? (
              <span className="inline-flex items-center gap-2 text-sm text-gray-600">
                <Loader className="w-4 h-4 animate-spin" /> Reading {fileName}…
              </span>
            ) : (
              <span className="inline-flex items-center gap-2 text-sm text-gray-600">
                <Upload className="w-4 h-4" /> {fileName || 'Choose the invoice PDF'}
              </span>
            )}
          </label>

          {error && (
            <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {invoices && invoices.length > 0 && totals && (
            <div className="space-y-3">
              <div className="rounded-md border border-gray-200 bg-gray-50 p-3 text-sm">
                <div className="flex items-center gap-2 text-gray-900 font-medium">
                  <FileText className="w-4 h-4" /> {invoices.length} invoice(s) · {totals.lots} lot(s)
                </div>
                <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-gray-600">
                  <span>Hammer <span className="text-gray-900 tabular-nums">{money(totals.hammer)}</span></span>
                  <span>Sales tax <span className="text-gray-900 tabular-nums">{money(totals.tax)}</span></span>
                  <span>Shipping <span className="text-gray-900 tabular-nums">{money(totals.shipping)}</span></span>
                  <span>Owing <span className="text-gray-900 tabular-nums">{totals.owing.length} invoice(s)</span></span>
                </div>
              </div>

              {totals.flagged.length > 0 && (
                <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                  <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                  <span>
                    {totals.flagged.length} invoice(s) don't add up on LA's own sheet
                    (#{totals.flagged.map((i) => i.invoiceId).join(', #')}) — usually shipping
                    added after the total was printed. They import, flagged for review.
                  </span>
                </div>
              )}

              <label className="flex items-start gap-2 text-sm text-gray-700">
                <input
                  type="checkbox" checked={applyPaymentStatus}
                  onChange={(e) => setApplyPaymentStatus(e.target.checked)}
                  className="mt-0.5 rounded border-gray-300"
                />
                <span>
                  Mark lots paid where LiveAuctioneers shows a zero balance
                  <span className="block text-xs text-gray-500">
                    LA is the payment processor on this path, so its balance is authoritative.
                  </span>
                </span>
              </label>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 p-4 border-t border-gray-200">
          <button onClick={onClose} className="px-3 py-1.5 text-sm rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50">
            Cancel
          </button>
          <button
            onClick={doImport}
            disabled={!invoices?.length || importing}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {importing ? <Loader className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
            {importing ? 'Importing…' : 'Import invoices'}
          </button>
        </div>
      </div>
    </div>
  );
}
