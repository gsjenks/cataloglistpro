// src/components/EstateSalesNetExport.tsx
// Reports & Tools -> EstateSales.net photos: download a ZIP of every lot's
// primary photo, in walking order, for the EstateSales.net listing uploader.

import { useState } from 'react';
import { ArrowLeft, Download, Loader2, CheckCircle2, AlertTriangle, Images } from 'lucide-react';
import type { Lot } from '../types';
import { exportEstateSalesNetPhotos, type PhotoExportProgress, type PhotoExportResult } from '../services/EstateSalesNetExport';

interface Props {
  saleId: string;
  saleName: string;
  lots: Lot[];
  onBack: () => void;
}

const list = (nums: (number | string)[]) => nums.slice(0, 30).join(', ') + (nums.length > 30 ? `, … (${nums.length} in all)` : '');

export default function EstateSalesNetExport({ saleId, saleName, lots, onBack }: Props) {
  const [skipCrops, setSkipCrops] = useState(false);
  const [progress, setProgress] = useState<PhotoExportProgress | null>(null);
  const [result, setResult] = useState<PhotoExportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const busy = progress !== null && !result && !error;

  const run = async () => {
    setResult(null);
    setError(null);
    setProgress({ done: 0, total: 0 });
    try {
      setResult(await exportEstateSalesNetPhotos({ saleId, saleName, lots, skipCrops, onProgress: setProgress }));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The export failed.');
    }
  };

  return (
    <div className="space-y-6">
      <button onClick={onBack} disabled={busy} className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 disabled:opacity-50">
        <ArrowLeft className="w-4 h-4" /> Back to Reports &amp; Tools
      </button>

      <div className="bg-white border border-gray-200 rounded-lg p-5 space-y-4">
        <div>
          <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <Images className="w-5 h-5 text-indigo-600" /> EstateSales.net photos
          </h3>
          <p className="text-sm text-gray-600 mt-1">
            Downloads one ZIP with the <strong>primary photo of each lot</strong> ({lots.length} lots), named in walking
            order (<em>001 - Lot 12 - Walnut highboy.jpg</em>) and sized for upload, plus <em>captions.csv</em> with each
            photo's lot, item, price and location. Unzip it and drag the photos into your EstateSales.net listing.
          </p>
        </div>

        <label className="flex items-start gap-2 text-sm text-gray-700 cursor-pointer select-none">
          <input type="checkbox" checked={skipCrops} disabled={busy} onChange={(e) => setSkipCrops(e.target.checked)} className="mt-0.5 w-4 h-4" />
          <span>
            Leave out lots whose only photo is a room-capture crop
            <span className="block text-xs text-gray-500">Crops are low-resolution placeholders until a real photo is taken.</span>
          </span>
        </label>

        <button
          onClick={run}
          disabled={busy || lots.length === 0}
          className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-md hover:bg-indigo-700 disabled:bg-gray-300"
        >
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
          {busy
            ? progress && progress.total ? `Adding photos ${progress.done} of ${progress.total}…` : 'Gathering photos…'
            : 'Download ZIP'}
        </button>

        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-700 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" /> {error}
          </div>
        )}

        {result && (
          <div className="space-y-2 text-sm">
            <p className="p-3 bg-green-50 border border-green-200 rounded-md text-green-800 flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
              <span>
                <strong>{result.added}</strong> photo{result.added === 1 ? '' : 's'} saved to <em>{result.fileName}</em>
                {result.cropsIncluded > 0 && <> ({result.cropsIncluded} of them room-capture crops)</>}.
              </span>
            </p>
            {result.noPhoto.length > 0 && (
              <p className="text-amber-800">No photo yet, not included: lot {list(result.noPhoto)}.</p>
            )}
            {result.cropsSkipped > 0 && (
              <p className="text-gray-600">{result.cropsSkipped} lot{result.cropsSkipped === 1 ? '' : 's'} left out with only a crop.</p>
            )}
            {result.failed.length > 0 && (
              <p className="text-red-700">Could not fetch the photo for lot {list(result.failed)}. Try again on a stronger connection.</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
