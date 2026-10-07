// src/components/ShippersManager.tsx
// Company-level shippers directory (Stage 6). Add/edit/delete shippers with contact
// info; used by the fulfillment carrier picker. See ShipperService. Estate sales
// use the same directory for movers, so every entry carries the Certificate of
// Insurance (COI) question.

import { useState } from 'react';
import { Plus, Pencil, Trash2, X, Phone, Mail } from 'lucide-react';
import type { Shipper } from '../types';
import { createShipper, updateShipper, deleteShipper, uploadCoi } from '../services/ShipperService';
import CoiFields, { coiMissing, emptyCoi, type CoiValue } from './CoiFields';
import { CoiBadge } from './DeliveryDetailsForm';

interface Props {
  companyId?: string;
  shippers: Shipper[];
  onChanged: () => void;
  onClose: () => void;
  title?: string;   // "Shippers" (auction) or "Movers" (estate)
}

type FormState = {
  name: string;
  kind: 'inhouse' | 'external';
  phone: string;
  email: string;
  address: string;
  notes: string;
};

const emptyForm: FormState = { name: '', kind: 'external', phone: '', email: '', address: '', notes: '' };

export default function ShippersManager({ companyId, shippers, onChanged, onClose, title = 'Shippers' }: Props) {
  const [editing, setEditing] = useState<Shipper | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [coi, setCoi] = useState<CoiValue>(emptyCoi);

  const openAdd = () => { setEditing(null); setForm(emptyForm); setCoi(emptyCoi); setShowForm(true); };
  const openEdit = (s: Shipper) => {
    setEditing(s);
    setForm({
      name: s.name || '', kind: (s.kind as FormState['kind']) || 'external',
      phone: s.phone || '', email: s.email || '', address: s.address || '', notes: s.notes || '',
    });
    setCoi({ onFile: s.coi_on_file ?? null, expires: s.coi_expires ?? '', file: null, existingPath: s.coi_path ?? null });
    setShowForm(true);
  };

  const save = async () => {
    if (!form.name.trim()) { alert('Enter a name.'); return; }
    // Movers must answer the COI question; for auction carriers it is optional.
    const missing = title === 'Movers' ? coiMissing(coi) : null;
    if (missing) { alert(missing); return; }
    setSaving(true);
    try {
      const newPath = coi.onFile && coi.file && companyId ? await uploadCoi(companyId, coi.file) : null;
      const payload = {
        name: form.name.trim(), kind: form.kind,
        phone: form.phone || undefined, email: form.email || undefined,
        address: form.address || undefined, notes: form.notes || undefined,
        coi_on_file: coi.onFile,
        coi_expires: coi.onFile && coi.expires ? coi.expires : null,
        coi_path: coi.onFile ? newPath ?? coi.existingPath : null,
      };
      if (editing) await updateShipper(editing.id, payload);
      else await createShipper({ ...payload, company_id: companyId, active: true });
      setShowForm(false);
      onChanged();
    } catch (e) {
      console.error('Failed to save shipper:', e);
      alert('Failed to save shipper.');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (s: Shipper) => {
    if (!confirm(`Delete shipper "${s.name}"?`)) return;
    try { await deleteShipper(s.id); onChanged(); }
    catch (e) { console.error(e); alert('Failed to delete shipper.'); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-lg w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-gray-200 px-5 py-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
          <div className="flex items-center gap-2">
            {!showForm && (
              <button onClick={openAdd} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-sm font-medium bg-blue-600 text-white hover:bg-blue-700">
                <Plus className="w-4 h-4" /> Add
              </button>
            )}
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
          </div>
        </div>

        <div className="p-5">
          {showForm ? (
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
                <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full border border-gray-300 rounded-md p-2 text-sm" placeholder="FedEx, Allied Shipping, In-house courier…" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
                  <select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as FormState['kind'] })}
                    className="w-full border border-gray-300 rounded-md p-2 text-sm">
                    <option value="external">External shipper</option>
                    <option value="inhouse">In-house</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                  <input type="text" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    className="w-full border border-gray-300 rounded-md p-2 text-sm" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <input type="text" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })}
                  className="w-full border border-gray-300 rounded-md p-2 text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Address</label>
                <input type="text" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })}
                  className="w-full border border-gray-300 rounded-md p-2 text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                <input type="text" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  className="w-full border border-gray-300 rounded-md p-2 text-sm" placeholder="account #, hours, etc." />
              </div>
              <CoiFields value={coi} onChange={(p) => setCoi((prev) => ({ ...prev, ...p }))} />
              <div className="flex justify-end gap-2 pt-1">
                <button onClick={() => setShowForm(false)} className="px-3 py-1.5 text-sm rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50">Cancel</button>
                <button onClick={save} disabled={saving} className="px-3 py-1.5 text-sm rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50">
                  {saving ? 'Saving…' : editing ? 'Save' : 'Add shipper'}
                </button>
              </div>
            </div>
          ) : shippers.length === 0 ? (
            <div className="text-center py-8 text-gray-400 text-sm">No shippers yet. Add FedEx, USPS, your in-house courier, etc.</div>
          ) : (
            <ul className="divide-y divide-gray-100">
              {shippers.map((s) => (
                <li key={s.id} className="py-3 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-gray-900 flex items-center gap-2 flex-wrap">
                      {s.name}
                      <span className="text-xs text-gray-400 capitalize font-normal">{s.kind}</span>
                      <CoiBadge mover={s} />
                    </div>
                    <div className="text-xs text-gray-500 flex flex-wrap gap-x-3 mt-0.5">
                      {s.phone && <span className="inline-flex items-center gap-1"><Phone className="w-3 h-3" />{s.phone}</span>}
                      {s.email && <span className="inline-flex items-center gap-1"><Mail className="w-3 h-3" />{s.email}</span>}
                    </div>
                    {s.address && <div className="text-xs text-gray-400 mt-0.5">{s.address}</div>}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button onClick={() => openEdit(s)} className="p-1.5 text-gray-500 hover:text-blue-600"><Pencil className="w-4 h-4" /></button>
                    <button onClick={() => remove(s)} className="p-1.5 text-gray-500 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
