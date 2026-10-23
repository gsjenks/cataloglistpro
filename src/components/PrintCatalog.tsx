// src/components/PrintCatalog.tsx
// Reports & Tools -> Print Catalog: download the sale's catalog as a printable PDF
// (logo, sale date, page numbers, no lot split across pages). See CatalogPrintService.

import { useEffect, useState } from 'react';
import { ArrowLeft, Download, Loader2, CheckCircle2, AlertTriangle, BookOpen } from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { Company, Lot, Sale, SaleRoom } from '../types';
import { useApp } from '../context/AppContext';
import { buildCatalogPdf, catalogSaleDate, type CatalogResult } from '../services/CatalogPrintService';

interface Props {
  sale: Sale;
  lots: Lot[];
  rooms: SaleRoom[];
  onBack: () => void;
}

export default function PrintCatalog({ sale, lots, rooms, onBack }: Props) {
  const { currentCompany } = useApp();
  const isEstate = sale.sale_type === 'estate_sale';
  const [company, setCompany] = useState<Pick<Company, 'name' | 'phone' | 'logo_url'> | null>(
    currentCompany?.id === sale.company_id ? currentCompany : null,
  );
  const [includePhotos, setIncludePhotos] = useState(true);
  const [includePrices, setIncludePrices] = useState(true);
  const [includeAppraisal, setIncludeAppraisal] = useState(false);
  const [order, setOrder] = useState<'lot' | 'walking'>(isEstate && rooms.length ? 'walking' : 'lot');
  const [skipSold, setSkipSold] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [result, setResult] = useState<CatalogResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const busy = progress !== null && !result && !error;

  // The sale's own company, for its name, phone and logo.
  useEffect(() => {
    if (company || !sale.company_id) return;
    supabase
      .from('companies')
      .select('name, phone, logo_url')
      .eq('id', sale.company_id)
      .maybeSingle()
      .then(({ data }) => { if (data) setCompany(data as Pick<Company, 'name' | 'phone' | 'logo_url'>); });
  }, [company, sale.company_id]);

  const count = lots.filter((l) => !(isEstate && skipSold && l.inventory_status === 'sold')).length;
  const appraisedCount = lots.filter((l) => l.appraised_value != null).length;
  const saleDate = catalogSaleDate(sale);

  const run = async () => {
    setResult(null);
    setError(null);
    setProgress({ done: 0, total: 0 });
    try {
      setResult(await buildCatalogPdf({
        sale,
        lots,
        rooms,
        companyName: company?.name ?? '',
        companyPhone: company?.phone,
        logoUrl: company?.logo_url,
        includePhotos,
        includePrices,
        includeAppraisal,
        order,
        skipSold,
        onProgress: (done, total) => setProgress({ done, total }),
      }));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The catalog could not be made.');
    }
  };

  const Check = ({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) => (
    <label className="flex items-start gap-2 text-sm text-gray-700 cursor-pointer select-none">
      <input type="checkbox" checked={checked} disabled={busy} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 w-4 h-4" />
      <span>
        {label}
        {hint && <span className="block text-xs text-gray-500">{hint}</span>}
      </span>
    </label>
  );

  return (
    <div className="space-y-6">
      <button onClick={onBack} disabled={busy} className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 disabled:opacity-50">
        <ArrowLeft className="w-4 h-4" /> Back to Reports &amp; Tools
      </button>

      <div className="bg-white border border-gray-200 rounded-lg p-5 space-y-4">
        <div>
          <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-indigo-600" /> Print Catalog
          </h3>
          <p className="text-sm text-gray-600 mt-1">
            Downloads a letter-size PDF of {sale.name}: your logo, the sale date{saleDate ? ` (${saleDate})` : ''},
            and one entry per lot with its main photo, title, {isEstate ? 'price' : 'estimate'}, description and details.
            Every page is numbered, and no lot is split across two pages. Open the PDF to print it.
          </p>
          {!saleDate && (
            <p className="text-xs text-amber-700 mt-2">This sale has no date set, so none will print. Add one in the sale's details.</p>
          )}
          {company && !company.logo_url && (
            <p className="text-xs text-gray-500 mt-1">No company logo on file; the company name prints instead.</p>
          )}
        </div>

        <div className="space-y-3">
          <Check checked={includePhotos} onChange={setIncludePhotos} label="Include photos" hint="Leave out to print faster and use less paper." />
          <Check
            checked={includePrices}
            onChange={setIncludePrices}
            label={isEstate ? 'Include prices' : 'Include estimates'}
            hint="Leave out for a catalog without any prices."
          />
          <Check
            checked={includeAppraisal}
            onChange={setIncludeAppraisal}
            label="Include appraised value"
            hint={appraisedCount
              ? `Prints "Appraised $…" beside the price on the ${appraisedCount} ${appraisedCount === 1 ? 'lot' : 'lots'} that have one.`
              : 'No lot in this sale has an appraised value yet.'}
          />
          {isEstate && (
            <Check checked={skipSold} onChange={setSkipSold} label="Leave out sold items" />
          )}
          {isEstate && (
            <div className="text-sm text-gray-700">
              <p className="mb-1">Order</p>
              <div className="flex gap-2">
                {(['walking', 'lot'] as const).map((o) => (
                  <button
                    key={o}
                    type="button"
                    disabled={busy}
                    onClick={() => setOrder(o)}
                    className={`px-3 py-1.5 rounded-md border text-sm ${order === o ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'}`}
                  >
                    {o === 'walking' ? 'Walking order, by room' : 'Lot number'}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <button
          onClick={run}
          disabled={busy || count === 0}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-md text-sm font-semibold bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
          {busy
            ? includePhotos && progress && progress.total
              ? `Loading photos ${progress.done} of ${progress.total}…`
              : 'Making the catalog…'
            : `Download catalog (${count} ${count === 1 ? 'lot' : 'lots'})`}
        </button>

        {result && (
          <div className="flex items-start gap-2 text-sm text-green-800 bg-green-50 border border-green-200 rounded-md p-3">
            <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
            <div>
              <p><strong>{result.fileName}</strong>: {result.lots} lots on {result.pages} pages.</p>
              {result.photosMissing > 0 && (
                <p className="text-amber-800 mt-1">{result.photosMissing} lots have no photo and print with a blank box.</p>
              )}
            </div>
          </div>
        )}
        {error && (
          <div className="flex items-start gap-2 text-sm text-red-800 bg-red-50 border border-red-200 rounded-md p-3">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" /> {error}
          </div>
        )}
      </div>
    </div>
  );
}
