// src/components/TaxExemptionModal.tsx
// Capture a buyer's resale certificate: the permit details plus a photo of the
// document itself. `capture="environment"` opens the rear camera straight on a phone
// (the S24 target) and falls back to a normal file picker on desktop.
//
// Stored company-wide, so the same dealer is recognised at the next sale.

import { useEffect, useState } from 'react';
import { X, Camera, Loader, ExternalLink, Trash2, AlertTriangle } from 'lucide-react';
import type { TaxExemption } from '../types';
import {
  saveExemption, deleteExemption, uploadCertificateImage, certificateUrl, isExpired,
} from '../services/TaxExemptionService';

interface Props {
  companyId?: string;
  buyerKey: string;
  buyerName: string;
  existing?: TaxExemption;
  /** Opened from the certificates list rather than a buyer's row — let the buyer be typed. */
  allowBuyerEdit?: boolean;
  onSaved: (ex: TaxExemption | null) => void;
  onClose: () => void;
}

export default function TaxExemptionModal({
  companyId, buyerKey, buyerName, existing, allowBuyerEdit, onSaved, onClose,
}: Props) {
  // The buyer key is an email wherever possible — that's how buyers are matched
  // everywhere else in the app (LA gives us one on every invoice).
  const [keyInput, setKeyInput] = useState(existing?.buyer_key ?? buyerKey);
  const [nameInput, setNameInput] = useState(existing?.buyer_name ?? buyerName);
  const [business, setBusiness] = useState(existing?.business_name ?? '');
  const [state, setState] = useState(existing?.state ?? '');
  const [permit, setPermit] = useState(existing?.permit_number ?? '');
  const [issued, setIssued] = useState(existing?.issued_on ?? '');
  const [expires, setExpires] = useState(existing?.expires_on ?? '');
  const [note, setNote] = useState(existing?.note ?? '');
  const [imagePath, setImagePath] = useState(existing?.image_path ?? '');
  const [imageName, setImageName] = useState(existing?.image_name ?? '');
  const [preview, setPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Signed URL for an already-stored image, so it can be viewed/verified here.
  useEffect(() => {
    let live = true;
    if (imagePath) {
      certificateUrl(imagePath).then((url) => { if (live) setPreview(url); });
    } else {
      setPreview(null);
    }
    return () => { live = false; };
  }, [imagePath]);

  const handleImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f || !companyId) return;
    setUploading(true);
    try {
      const { path, name } = await uploadCertificateImage(companyId, f);
      setImagePath(path);
      setImageName(name);
    } catch (err) {
      console.error('Certificate upload failed:', err);
      alert('Could not upload that image. See console.');
    } finally {
      setUploading(false);
    }
  };

  const save = async () => {
    if (!permit.trim() && !imagePath) {
      alert('Enter the permit number or attach a photo of the certificate.');
      return;
    }
    if (!keyInput.trim()) {
      alert("Enter the buyer's email (or name, if you have no email for them).");
      return;
    }
    setSaving(true);
    try {
      const saved = await saveExemption({
        company_id: companyId,
        buyer_key: keyInput.trim(),
        buyer_name: nameInput.trim() || undefined,
        business_name: business || undefined,
        state: state.trim().toUpperCase() || undefined,
        permit_number: permit || undefined,
        issued_on: issued || undefined,
        expires_on: expires || undefined,
        image_path: imagePath || undefined,
        image_name: imageName || undefined,
        note: note || undefined,
        verified_at: new Date().toISOString(),
      }, existing?.id);
      onSaved(saved);
    } catch (err) {
      console.error('Failed to save certificate:', err);
      alert('Could not save the certificate. See console.');
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!existing) return;
    if (!confirm(`Remove the resale certificate on file for ${buyerName}?`)) return;
    setSaving(true);
    try {
      await deleteExemption(existing.id);
      onSaved(null);
    } catch (err) {
      console.error('Failed to delete certificate:', err);
      alert('Could not delete. See console.');
    } finally {
      setSaving(false);
    }
  };

  const expired = existing ? isExpired({ ...existing, expires_on: expires || undefined }) : false;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-lg w-full max-w-sm max-h-[90vh] overflow-y-auto p-5">
        <div className="flex items-start justify-between mb-3">
          <div>
            <h3 className="text-base font-semibold text-gray-900">Resale certificate</h3>
            <p className="text-xs text-gray-500">{buyerName}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>

        {expired && (
          <div className="mb-3 flex items-start gap-2 rounded-md border border-red-200 bg-red-50 p-2.5 text-xs text-red-700">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>This certificate has expired — it won't exempt new purchases until renewed.</span>
          </div>
        )}

        <div className="space-y-3">
          {allowBuyerEdit && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Buyer name</label>
                <input
                  type="text" value={nameInput} onChange={(e) => setNameInput(e.target.value)}
                  className="w-full border border-gray-300 rounded-md p-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Buyer email *</label>
                <input
                  type="email" value={keyInput} onChange={(e) => setKeyInput(e.target.value)}
                  className="w-full border border-gray-300 rounded-md p-2 text-sm"
                  placeholder="used to match them later"
                />
              </div>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Business name</label>
            <input
              type="text" value={business} onChange={(e) => setBusiness(e.target.value)}
              className="w-full border border-gray-300 rounded-md p-2 text-sm"
              placeholder="as printed on the certificate"
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">State</label>
              <input
                type="text" value={state} onChange={(e) => setState(e.target.value)}
                maxLength={2}
                className="w-full border border-gray-300 rounded-md p-2 text-sm uppercase"
                placeholder="GA"
              />
            </div>
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Permit number</label>
              <input
                type="text" value={permit} onChange={(e) => setPermit(e.target.value)}
                className="w-full border border-gray-300 rounded-md p-2 text-sm"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Issued</label>
              <input
                type="date" value={issued} onChange={(e) => setIssued(e.target.value)}
                className="w-full border border-gray-300 rounded-md p-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Expires</label>
              <input
                type="date" value={expires} onChange={(e) => setExpires(e.target.value)}
                className="w-full border border-gray-300 rounded-md p-2 text-sm"
              />
            </div>
          </div>

          {/* The certificate itself. */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Certificate image</label>
            <label className="block border-2 border-dashed border-gray-300 rounded-lg p-4 text-center cursor-pointer hover:border-blue-400">
              <input
                type="file" accept="image/*,application/pdf" capture="environment"
                onChange={handleImage} className="hidden" disabled={!companyId || uploading}
              />
              {uploading ? (
                <span className="inline-flex items-center gap-2 text-sm text-gray-600">
                  <Loader className="w-4 h-4 animate-spin" /> Uploading…
                </span>
              ) : (
                <span className="inline-flex items-center gap-2 text-sm text-gray-600">
                  <Camera className="w-4 h-4" />
                  {imageName || 'Photograph or upload the certificate'}
                </span>
              )}
            </label>
            {imagePath && (
              <div className="mt-2 flex items-center justify-between gap-2 text-xs">
                {preview ? (
                  <a href={preview} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-blue-600 hover:underline">
                    <ExternalLink className="w-3.5 h-3.5" /> View stored image
                  </a>
                ) : <span className="text-gray-400">Stored</span>}
                <button
                  onClick={() => { setImagePath(''); setImageName(''); }}
                  className="text-gray-500 hover:text-red-600"
                >
                  Replace
                </button>
              </div>
            )}
            {preview && (
              <img
                src={preview} alt="Resale certificate"
                className="mt-2 w-full max-h-48 object-contain rounded border border-gray-200"
                onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
              />
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Note</label>
            <input
              type="text" value={note} onChange={(e) => setNote(e.target.value)}
              className="w-full border border-gray-300 rounded-md p-2 text-sm"
              placeholder="optional"
            />
          </div>

          <p className="text-xs text-gray-400">
            Kept for this company, not just this sale — the same buyer is recognised next time.
          </p>
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
              onClick={save} disabled={saving || uploading}
              className="px-3 py-1.5 text-sm rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save certificate'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
