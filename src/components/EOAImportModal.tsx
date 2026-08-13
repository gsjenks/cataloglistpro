// src/components/EOAImportModal.tsx
// D3 — upload a LiveAuctioneers EOA export (.xml/.txt) and create a sale from it:
// one consignor + a lot per sold item (sold, unpaid, 72h payment clock). Runs in the
// user's session so RLS is satisfied. See docs/auction-lifecycle-spec.md (§8-D3).

import { useState } from 'react';
import { X, Upload, Loader, FileText, AlertCircle } from 'lucide-react';
import { parseEoaXml, importEoaAsNewSale, type ParsedEOA } from '../services/EOAImportService';

interface Props {
  companyId: string;
  onClose: () => void;
  onImported: (saleId: string) => void;
}

const money = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });

export default function EOAImportModal({ companyId, onClose, onImported }: Props) {
  const [parsed, setParsed] = useState<ParsedEOA | null>(null);
  const [fileName, setFileName] = useState('');
  const [saleName, setSaleName] = useState('');
  const [consignorName, setConsignorName] = useState('');
  const [commission, setCommission] = useState('20');
  const [error, setError] = useState('');
  const [importing, setImporting] = useState(false);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setError('');
    setFileName(f.name);
    try {
      const text = await f.text();
      const p = parseEoaXml(text);
      setParsed(p);
      if (!saleName) setSaleName(f.name.replace(/\.[^.]+$/, '') + ' (imported)');
    } catch (err) {
      setParsed(null);
      setError(err instanceof Error ? err.message : 'Failed to parse file');
    }
  };

  const hammerTotal = parsed ? parsed.items.reduce((s, i) => s + i.hammer, 0) : 0;

  const doImport = async () => {
    if (!parsed) return;
    if (!saleName.trim()) return setError('Enter a sale name.');
    if (!consignorName.trim()) return setError('Enter a consignor name.');
    setImporting(true);
    setError('');
    try {
      const res = await importEoaAsNewSale(parsed, {
        companyId,
        saleName: saleName.trim(),
        consignorName: consignorName.trim(),
        commissionRate: parseFloat(commission) || 0,
        paymentTermsHours: 72,
      });
      onImported(res.saleId);
    } catch (err) {
      console.error('EOA import failed:', err);
      setError(err instanceof Error ? err.message : 'Import failed.');
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-lg w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-gray-200 px-5 py-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900">Import LiveAuctioneers auction</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <p className="text-sm text-gray-500">
            Upload a LiveAuctioneers End-of-Auction export (.xml or .txt). This creates a
            new sale in the Settlement stage with one lot per sold item.
          </p>

          <label className="flex items-center gap-2 px-4 py-3 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:bg-gray-50">
            <Upload className="w-5 h-5 text-gray-400" />
            <span className="text-sm text-gray-600">{fileName || 'Select EOA file (.xml / .txt)'}</span>
            <input type="file" accept=".xml,.txt" onChange={handleFile} className="hidden" />
          </label>

          {parsed && (
            <div className="rounded-md bg-blue-50 border border-blue-200 p-3 text-sm text-blue-800">
              <div className="flex items-center gap-2 font-medium">
                <FileText className="w-4 h-4" />
                {parsed.count} sold lots · {money(hammerTotal)} total hammer
              </div>
              {parsed.saleDate && (
                <div className="text-xs text-blue-700 mt-1">
                  Auction date: {parsed.saleDate.toLocaleDateString()}
                </div>
              )}
            </div>
          )}

          {parsed && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Sale name</label>
                <input
                  type="text"
                  value={saleName}
                  onChange={(e) => setSaleName(e.target.value)}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Consignor</label>
                  <input
                    type="text"
                    value={consignorName}
                    onChange={(e) => setConsignorName(e.target.value)}
                    placeholder="e.g. Liz Marshall Estate"
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Commission %</label>
                  <input
                    type="number"
                    inputMode="decimal"
                    value={commission}
                    onChange={(e) => setCommission(e.target.value)}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                  />
                </div>
              </div>
              <p className="text-xs text-gray-500">
                All {parsed.count} lots are assigned to this consignor and marked sold &amp; unpaid,
                with payment due 72h after the auction. You can adjust terms on the sale's Setup tab.
              </p>
            </>
          )}

          {error && (
            <div className="flex items-start gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-md p-2">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              {error}
            </div>
          )}
        </div>

        <div className="sticky bottom-0 bg-white border-t border-gray-200 px-5 py-4 flex justify-end gap-2">
          <button onClick={onClose} className="px-3 py-2 text-sm rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50">
            Cancel
          </button>
          <button
            onClick={doImport}
            disabled={!parsed || importing}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {importing && <Loader className="w-4 h-4 animate-spin" />}
            {importing ? 'Importing…' : parsed ? `Import ${parsed.count} lots` : 'Import'}
          </button>
        </div>
      </div>
    </div>
  );
}
