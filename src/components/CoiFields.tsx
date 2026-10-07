// src/components/CoiFields.tsx
// The Certificate of Insurance (COI) question for a mover: is one on file, and
// if so when it expires, with an optional photo or PDF of the certificate.
// Used wherever a mover is added or edited (delivery form, movers directory).

import { useState } from 'react';
import { FileCheck, Upload } from 'lucide-react';
import YesNoQuestion from './YesNoQuestion';
import { coiUrl } from '../services/ShipperService';
import { useRole } from '../context/RoleContext';

export interface CoiValue {
  onFile: boolean | null;
  expires: string;        // YYYY-MM-DD or ''
  file: File | null;      // a new certificate to upload on save
  existingPath: string | null;
}

export const emptyCoi: CoiValue = { onFile: null, expires: '', file: null, existingPath: null };

/** What is still missing before a mover can be saved, or null. */
export function coiMissing(v: CoiValue): string | null {
  if (v.onFile == null) return 'Say whether the mover has a Certificate of Insurance (COI).';
  if (v.onFile && !v.expires) return 'Enter the date the COI expires.';
  return null;
}

export default function CoiFields({ value, onChange }: {
  value: CoiValue;
  onChange: (patch: Partial<CoiValue>) => void;
}) {
  // The certificate is in the private documents bucket: managers can open it.
  const canView = useRole().can('money');
  const [opening, setOpening] = useState(false);

  const view = async () => {
    if (!value.existingPath) return;
    setOpening(true);
    const url = await coiUrl(value.existingPath);
    setOpening(false);
    if (url) window.open(url, '_blank', 'noopener');
    else alert('Could not open the certificate.');
  };

  return (
    <div className="rounded-md border border-gray-200 bg-gray-50 p-2.5 space-y-2">
      <YesNoQuestion
        label="Certificate of Insurance (COI) on file?"
        value={value.onFile}
        onChange={(v) => onChange({ onFile: v })}
      />
      <p className="text-xs text-gray-500">The one-page summary proving the mover has active insurance.</p>

      {value.onFile && (
        <div className="space-y-2">
          <label className="block">
            <span className="text-xs font-medium text-gray-700">Expires</span>
            <input
              type="date"
              value={value.expires}
              onChange={(e) => onChange({ expires: e.target.value })}
              className="mt-0.5 w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:border-indigo-600"
            />
          </label>
          <div className="flex items-center gap-3 flex-wrap">
            <label className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 cursor-pointer">
              <Upload className="w-3.5 h-3.5" />
              {value.file ? 'Replace photo / PDF' : value.existingPath ? 'Upload a newer COI' : 'Photo or PDF of the COI'}
              <input
                type="file"
                accept="image/*,application/pdf"
                capture="environment"
                className="hidden"
                onChange={(e) => onChange({ file: e.target.files?.[0] ?? null })}
              />
            </label>
            {value.file && <span className="text-xs text-gray-600 truncate max-w-[12rem]">{value.file.name}</span>}
            {!value.file && value.existingPath && canView && (
              <button type="button" onClick={view} disabled={opening} className="inline-flex items-center gap-1 text-xs text-indigo-700 hover:underline">
                <FileCheck className="w-3.5 h-3.5" /> {opening ? 'Opening…' : 'View COI on file'}
              </button>
            )}
            {!value.file && value.existingPath && !canView && (
              <span className="text-xs text-green-700 inline-flex items-center gap-1"><FileCheck className="w-3.5 h-3.5" /> Certificate on file</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
