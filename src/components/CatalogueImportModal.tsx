// src/components/CatalogueImportModal.tsx
// D5-prep — upload a LiveAuctioneers catalogue PDF to enrich an existing sale:
// matched lots gain estimates + description; catalogue lots not in the sale are
// added as UNSOLD (passed). See docs/auction-lifecycle-spec.md.

import { useState } from 'react';
import { X, Upload, Loader, FileText, AlertCircle } from 'lucide-react';
import {
  parseCatalogPdf,
  previewCatalogueImport,
  importCatalogueIntoSale,
  type CatalogueLot,
  type CataloguePreview,
} from '../services/CatalogueImportService';

interface Props {
  saleId: string;
  onClose: () => void;
  onImported: (result: { updated: number; created: number }) => void;
}

export default function CatalogueImportModal({ saleId, onClose, onImported }: Props) {
  const [lots, setLots] = useState<CatalogueLot[] | null>(null);
  const [preview, setPreview] = useState<CataloguePreview | null>(null);
  const [fileName, setFileName] = useState('');
  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState('');

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setError('');
    setFileName(f.name);
    setLots(null);
    setPreview(null);
    setParsing(true);
    try {
      const parsed = await parseCatalogPdf(f);
      setLots(parsed);
      setPreview(await previewCatalogueImport(saleId, parsed));
    } catch (err) {
      const e2 = err as { message?: string } | null;
      setError(e2?.message || 'Failed to read the catalogue PDF.');
    } finally {
      setParsing(false);
    }
  };

  const doImport = async () => {
    if (!lots) return;
    setImporting(true);
    setError('');
    try {
      const res = await importCatalogueIntoSale(saleId, lots);
      onImported(res);
    } catch (err) {
      console.error('Catalogue import failed:', err);
      const e2 = err as { message?: string; details?: string } | null;
      setError([e2?.message, e2?.details].filter(Boolean).join(' — ') || 'Import failed.');
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-lg w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-gray-200 px-5 py-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900">Import catalogue PDF</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <p className="text-sm text-gray-500">
            Upload the LiveAuctioneers catalogue PDF. Matched lots get their estimates and
            description; catalogue lots not already in this sale are added as unsold.
          </p>

          <label className="flex items-center gap-2 px-4 py-3 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:bg-gray-50">
            {parsing ? <Loader className="w-5 h-5 text-gray-400 animate-spin" /> : <Upload className="w-5 h-5 text-gray-400" />}
            <span className="text-sm text-gray-600">
              {parsing ? 'Reading catalogue…' : fileName || 'Select catalogue PDF'}
            </span>
            <input type="file" accept=".pdf" onChange={handleFile} className="hidden" disabled={parsing} />
          </label>

          {preview && (
            <div className="rounded-md bg-blue-50 border border-blue-200 p-3 text-sm text-blue-800 space-y-1">
              <div className="flex items-center gap-2 font-medium">
                <FileText className="w-4 h-4" />
                {preview.total} lots in the catalogue
              </div>
              <div className="text-xs text-blue-700">
                {preview.matched} match existing lots (add estimates + description)
                <br />
                {preview.newUnsold} new lots will be added as <span className="font-medium">unsold</span>
              </div>
            </div>
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
            disabled={!lots || importing || parsing}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {importing && <Loader className="w-4 h-4 animate-spin" />}
            {importing ? 'Importing…' : preview ? `Import (${preview.matched} + ${preview.newUnsold})` : 'Import'}
          </button>
        </div>
      </div>
    </div>
  );
}
