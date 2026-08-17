// src/components/ConsignmentsManager.tsx
// Per-consignor consignment CRUD for a sale (#2, spec §8-D1). A sale pools lots
// from multiple consignors; each consignment holds that consignor's terms and
// (later) settlement. Consignor is picked from the sale's Contacts.

import { useState } from 'react';
import { Plus, Pencil, Trash2, UserPlus, X, FileText, Layers } from 'lucide-react';
import type { Consignment, Contact, ConsignmentFees, Lot } from '../types';
import { supabase } from '../lib/supabase';
import {
  createConsignment, updateConsignment, deleteConsignment,
} from '../services/ConsignmentService';
import { formatContactName } from '../utils/contactName';
import SettlementStatement from './SettlementStatement';
import { FLAT_FEE_KEYS, FEE_LABELS, DEFAULT_BUYIN_RATE, CUSTOM_FEE_SUGGESTIONS } from '../lib/settlement';

interface Props {
  saleId: string;
  companyId?: string;
  consignments: Consignment[];
  contacts: Contact[];
  lots: Lot[];
  saleName: string;
  onChanged: () => void;
}

type CustomFeeForm = { label: string; amount: string; note: string };

type FormState = {
  contact_id: string;
  commission_rate: string;
  buyers_premium_rate: string;
  reserve_policy: 'none' | 'per_lot' | 'blanket';
  lead_source: string;
  fees: Record<Exclude<keyof ConsignmentFees, 'custom'>, string>;
  custom: CustomFeeForm[];
};

const emptyForm: FormState = {
  contact_id: '',
  commission_rate: '',
  buyers_premium_rate: '',
  reserve_policy: 'none',
  lead_source: '',
  fees: { photography: '', cataloging: '', insurance: '', storage: '', buyin: String(DEFAULT_BUYIN_RATE) },
  custom: [],
};

const num = (s: string): number | undefined => {
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : undefined;
};

export default function ConsignmentsManager({ saleId, companyId, consignments, contacts, lots, saleName, onChanged }: Props) {
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Consignment | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [busyAssign, setBusyAssign] = useState<string | null>(null);
  const [statementFor, setStatementFor] = useState<Consignment | null>(null);

  const contactById = (id?: string) => contacts.find((c) => c.id === id);

  const openAdd = () => {
    setEditing(null);
    setForm(emptyForm);
    setShowModal(true);
  };

  const openEdit = (c: Consignment) => {
    setEditing(c);
    setForm({
      contact_id: c.contact_id || '',
      commission_rate: c.commission_rate?.toString() ?? '',
      buyers_premium_rate: c.buyers_premium_rate?.toString() ?? '',
      reserve_policy: c.reserve_policy ?? 'none',
      lead_source: c.lead_source ?? '',
      fees: {
        photography: c.fee_schedule?.photography?.toString() ?? '',
        cataloging: c.fee_schedule?.cataloging?.toString() ?? '',
        insurance: c.fee_schedule?.insurance?.toString() ?? '',
        storage: c.fee_schedule?.storage?.toString() ?? '',
        buyin: c.fee_schedule?.buyin?.toString() ?? String(DEFAULT_BUYIN_RATE),
      },
      custom: (c.fee_schedule?.custom ?? []).map((f) => ({
        label: f.label ?? '',
        amount: f.amount != null ? String(f.amount) : '',
        note: f.note ?? '',
      })),
    });
    setShowModal(true);
  };

  const save = async () => {
    if (!form.contact_id) {
      alert('Pick a consignor (from this sale’s Contacts).');
      return;
    }
    setSaving(true);
    try {
      const fee_schedule: ConsignmentFees = {};
      (Object.keys(form.fees) as (keyof Omit<ConsignmentFees, 'custom'>)[]).forEach((k) => {
        const v = num(form.fees[k]);
        if (v !== undefined) fee_schedule[k] = v;
      });
      // Ad-hoc consignor fees: keep any line that has a label or a non-zero amount.
      const custom = form.custom
        .map((c) => ({ label: c.label.trim(), amount: num(c.amount) ?? 0, note: c.note.trim() || undefined }))
        .filter((c) => c.label !== '' || c.amount !== 0);
      if (custom.length) fee_schedule.custom = custom;
      const payload = {
        company_id: companyId,
        sale_id: saleId,
        contact_id: form.contact_id,
        commission_rate: num(form.commission_rate),
        buyers_premium_rate: num(form.buyers_premium_rate),
        reserve_policy: form.reserve_policy,
        lead_source: form.lead_source || undefined,
        fee_schedule,
      };
      if (editing) {
        await updateConsignment(editing.id, payload);
      } else {
        await createConsignment(payload);
      }
      setShowModal(false);
      onChanged();
    } catch (e) {
      console.error('Failed to save consignment:', e);
      alert('Failed to save consignment.');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (c: Consignment) => {
    if (!confirm(`Remove consignment for ${formatContactName(contactById(c.contact_id))}? Lots assigned to it will become unassigned.`)) return;
    try {
      await deleteConsignment(c.id);
      onChanged();
    } catch (e) {
      console.error('Failed to delete consignment:', e);
      alert('Failed to delete consignment.');
    }
  };

  // Lots in this sale not yet tied to any consignor. Until they are, reconciliation
  // has nothing to split them against (their gross shows but no commission/payout).
  const unassignedCount = lots.filter((l) => !l.consignment_id).length;

  // Bulk-assign every unassigned lot to one consignor — the fast path for a
  // single-owner estate sale.
  const assignUnassignedTo = async (c: Consignment) => {
    if (unassignedCount === 0) return;
    if (!confirm(`Assign ${unassignedCount} unassigned lot(s) to ${formatContactName(contactById(c.contact_id))}?`)) return;
    setBusyAssign(c.id);
    const { error } = await supabase
      .from('lots')
      .update({ consignment_id: c.id, updated_at: new Date().toISOString() })
      .eq('sale_id', saleId)
      .is('consignment_id', null);
    setBusyAssign(null);
    if (error) { alert('Could not assign lots: ' + error.message); return; }
    onChanged();
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Consignors</h2>
          <p className="text-sm text-gray-500">Terms per consignor; assign lots to a consignor on each item.</p>
        </div>
        <button
          onClick={openAdd}
          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-sm font-medium bg-blue-600 text-white hover:bg-blue-700"
        >
          <Plus className="w-4 h-4" /> Add consignor
        </button>
      </div>

      {consignments.length === 0 ? (
        <div className="mt-4 text-center py-8 text-gray-400">
          <UserPlus className="w-8 h-8 mx-auto mb-2" />
          <p className="text-sm">No consignors yet. Add one to capture terms and assign lots.</p>
        </div>
      ) : (
        <ul className="mt-4 divide-y divide-gray-100">
          {consignments.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-3 py-3">
              <div className="min-w-0">
                <div className="text-sm font-medium text-gray-900 truncate">
                  {formatContactName(contactById(c.contact_id))}
                </div>
                <div className="text-xs text-gray-500 flex flex-wrap gap-x-3">
                  {c.commission_rate != null && <span>Commission {c.commission_rate}%</span>}
                  {c.buyers_premium_rate != null && <span>BP {c.buyers_premium_rate}%</span>}
                  <span>Reserve: {c.reserve_policy ?? 'none'}</span>
                  {c.lead_source && <span>Source: {c.lead_source}</span>}
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {unassignedCount > 0 && (
                  <button
                    onClick={() => assignUnassignedTo(c)}
                    disabled={busyAssign === c.id}
                    className="inline-flex items-center gap-1 px-2 py-1 mr-1 rounded-md text-xs font-medium border border-indigo-300 text-indigo-700 hover:bg-indigo-50 disabled:opacity-50"
                    title="Assign all unassigned lots in this sale to this consignor"
                  >
                    <Layers className="w-3.5 h-3.5" /> {busyAssign === c.id ? 'Assigning…' : `Assign ${unassignedCount} lot${unassignedCount === 1 ? '' : 's'}`}
                  </button>
                )}
                <button onClick={() => setStatementFor(c)} className="p-1.5 text-gray-500 hover:text-green-600" aria-label="Settlement statement" title="Settlement statement">
                  <FileText className="w-4 h-4" />
                </button>
                <button onClick={() => openEdit(c)} className="p-1.5 text-gray-500 hover:text-blue-600" aria-label="Edit">
                  <Pencil className="w-4 h-4" />
                </button>
                <button onClick={() => remove(c)} className="p-1.5 text-gray-500 hover:text-red-600" aria-label="Delete">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-lg w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-4 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900">
                {editing ? 'Edit consignor' : 'Add consignor'}
              </h3>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Consignor *</label>
                <select
                  value={form.contact_id}
                  onChange={(e) => setForm({ ...form, contact_id: e.target.value })}
                  className="w-full border border-gray-300 rounded-md p-2 text-sm"
                >
                  <option value="">Select a contact…</option>
                  {contacts.map((c) => (
                    <option key={c.id} value={c.id}>{formatContactName(c)}</option>
                  ))}
                </select>
                {contacts.length === 0 && (
                  <p className="text-xs text-amber-600 mt-1">
                    No contacts on this sale yet — add one in the Contacts tab first.
                  </p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Commission %</label>
                  <input
                    type="number" inputMode="decimal" value={form.commission_rate}
                    onChange={(e) => setForm({ ...form, commission_rate: e.target.value })}
                    className="w-full border border-gray-300 rounded-md p-2 text-sm" placeholder="e.g. 20"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Buyer's premium %</label>
                  <input
                    type="number" inputMode="decimal" value={form.buyers_premium_rate}
                    onChange={(e) => setForm({ ...form, buyers_premium_rate: e.target.value })}
                    className="w-full border border-gray-300 rounded-md p-2 text-sm" placeholder="e.g. 18"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Reserve policy</label>
                  <select
                    value={form.reserve_policy}
                    onChange={(e) => setForm({ ...form, reserve_policy: e.target.value as FormState['reserve_policy'] })}
                    className="w-full border border-gray-300 rounded-md p-2 text-sm"
                  >
                    <option value="none">None</option>
                    <option value="per_lot">Per lot</option>
                    <option value="blanket">Blanket</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Lead source</label>
                  <input
                    type="text" value={form.lead_source}
                    onChange={(e) => setForm({ ...form, lead_source: e.target.value })}
                    className="w-full border border-gray-300 rounded-md p-2 text-sm" placeholder="referral, repeat…"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Flat fees ($)</label>
                <div className="grid grid-cols-4 gap-2">
                  {FLAT_FEE_KEYS.map((k) => (
                    <div key={k}>
                      <span className="block text-xs text-gray-500 mb-1">{FEE_LABELS[k]}</span>
                      <input
                        type="number" inputMode="decimal" value={form.fees[k]}
                        onChange={(e) => setForm({ ...form, fees: { ...form.fees, [k]: e.target.value } })}
                        className="w-full border border-gray-300 rounded-md p-1.5 text-sm"
                      />
                    </div>
                  ))}
                </div>
              </div>

              <div className="w-1/2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Buy-in rate (% of reserve)</label>
                <input
                  type="number" inputMode="decimal" value={form.fees.buyin}
                  onChange={(e) => setForm({ ...form, fees: { ...form.fees, buyin: e.target.value } })}
                  className="w-full border border-gray-300 rounded-md p-2 text-sm" placeholder="3"
                />
              </div>

              {/* Other fees — ad-hoc consignor charges (cleanout, parking, gate, setup…) */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Other fees ($)</label>
                <p className="text-xs text-gray-500 mb-2">
                  Extra charges billed to the consignor beyond the flat fees — e.g. estate
                  cleanout, parking, gate, setup. Add a line, name it, set the amount, and note
                  what it&apos;s for. These are deducted from the payout at settlement.
                </p>
                <datalist id="custom-fee-labels">
                  {CUSTOM_FEE_SUGGESTIONS.map((s) => <option key={s} value={s} />)}
                </datalist>
                {form.custom.length > 0 && (
                  <div className="space-y-2 mb-2">
                    {form.custom.map((cf, i) => (
                      <div key={i} className="flex gap-2 items-start">
                        <input
                          list="custom-fee-labels"
                          value={cf.label}
                          onChange={(e) => setForm({ ...form, custom: form.custom.map((c, j) => j === i ? { ...c, label: e.target.value } : c) })}
                          placeholder="Fee (e.g. Cleanout)"
                          className="flex-1 min-w-0 border border-gray-300 rounded-md p-1.5 text-sm"
                        />
                        <div className="relative w-24 shrink-0">
                          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                          <input
                            type="number" inputMode="decimal" value={cf.amount}
                            onChange={(e) => setForm({ ...form, custom: form.custom.map((c, j) => j === i ? { ...c, amount: e.target.value } : c) })}
                            placeholder="0"
                            className="w-full pl-5 pr-2 py-1.5 border border-gray-300 rounded-md text-sm"
                          />
                        </div>
                        <input
                          value={cf.note}
                          onChange={(e) => setForm({ ...form, custom: form.custom.map((c, j) => j === i ? { ...c, note: e.target.value } : c) })}
                          placeholder="Comment (optional)"
                          className="flex-1 min-w-0 border border-gray-300 rounded-md p-1.5 text-sm"
                        />
                        <button
                          type="button"
                          onClick={() => setForm({ ...form, custom: form.custom.filter((_, j) => j !== i) })}
                          className="p-1.5 text-gray-400 hover:text-red-600 shrink-0"
                          aria-label="Remove fee"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => setForm({ ...form, custom: [...form.custom, { label: '', amount: '', note: '' }] })}
                  className="inline-flex items-center gap-1 text-sm font-medium text-indigo-600 hover:underline"
                >
                  <Plus className="w-3.5 h-3.5" /> Add a fee line
                </button>
              </div>

              <div className="rounded-md bg-gray-50 border border-gray-200 p-3 text-xs text-gray-600 space-y-1">
                <p className="font-medium text-gray-700">How these are used at settlement</p>
                <p>
                  Consignor payout = total hammer &minus; commission &minus; fees. The
                  buyer&apos;s premium is paid by the buyer (house revenue) and is not
                  deducted from the consignor.
                </p>
                <ul className="list-disc pl-4 space-y-0.5">
                  <li>
                    <span className="font-medium">Commission</span> — the house&apos;s share
                    of each hammer price.
                  </li>
                  <li>
                    <span className="font-medium">Photography / Cataloging / Insurance /
                    Storage</span> — costs billed back to the consignor.
                  </li>
                  <li>
                    <span className="font-medium">Buy-in</span> — {DEFAULT_BUYIN_RATE}% (editable) of
                    the reserve on each unsold lot; only lots that had a reserve are charged.
                  </li>
                </ul>
              </div>
            </div>

            <div className="flex justify-end gap-2 p-4 border-t border-gray-200">
              <button onClick={() => setShowModal(false)} className="px-3 py-1.5 text-sm rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50">
                Cancel
              </button>
              <button onClick={save} disabled={saving} className="px-3 py-1.5 text-sm rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50">
                {saving ? 'Saving…' : editing ? 'Save changes' : 'Add consignor'}
              </button>
            </div>
          </div>
        </div>
      )}

      {statementFor && (
        <SettlementStatement
          consignment={statementFor}
          consignorName={formatContactName(contactById(statementFor.contact_id))}
          saleName={saleName}
          lots={lots}
          onClose={() => setStatementFor(null)}
        />
      )}
    </div>
  );
}
