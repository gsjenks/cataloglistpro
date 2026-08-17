// src/components/AssignToBasketModal.tsx
// Put a single lot into a customer's basket (a hold) from the items list. Search
// an existing shopper or create one; on pick, the lot is held to them, the
// basket timer is renewed, and the basket is associated with the sale.

import { useState } from 'react';
import { X, Search, User, Plus } from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { Lot } from '../types';
import { renewBasketHolds, HOLD_MS } from '../lib/holds';
import { touchSaleBasket } from '../lib/saleBaskets';

interface Shopper { id: string; name: string; email: string | null; phone: string | null }

interface Props {
  saleId: string;
  companyId: string | null;
  lot: Lot;
  onClose: () => void;
  onAssigned: () => void;
}

const inputCls = 'w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:border-indigo-600';

export default function AssignToBasketModal({ saleId, companyId, lot, onClose, onAssigned }: Props) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Shopper[]>([]);
  const [newOpen, setNewOpen] = useState(false);
  const [newShopper, setNewShopper] = useState({ name: '', phone: '', email: '' });
  const [busy, setBusy] = useState(false);

  const search = async (q: string) => {
    setQuery(q);
    if (q.trim().length < 1) { setResults([]); return; }
    let qq = supabase.from('shoppers').select('id, name, email, phone');
    if (companyId) qq = qq.eq('company_id', companyId);
    const term = `%${q.trim()}%`;
    qq = qq.or(`name.ilike.${term},email.ilike.${term},phone.ilike.${term}`);
    const { data } = await qq.limit(20);
    setResults((data as Shopper[] | null) || []);
  };

  const assign = async (shopper: Shopper) => {
    setBusy(true);
    const { error } = await supabase.from('lots').update({
      inventory_status: 'held',
      held_by: shopper.id,
      held_until: new Date(Date.now() + HOLD_MS).toISOString(),
      updated_at: new Date().toISOString(),
    }).eq('id', lot.id);
    if (error) { setBusy(false); alert('Could not hold the item: ' + error.message); return; }
    await renewBasketHolds(supabase, saleId, shopper.id);
    await touchSaleBasket(supabase, saleId, shopper.id, companyId);
    setBusy(false);
    onAssigned();
    onClose();
  };

  const createAndAssign = async () => {
    const name = newShopper.name.trim();
    const email = newShopper.email.trim();
    const phone = newShopper.phone.trim();
    if (!name) return alert('Enter a name.');
    if (!email && !phone) return alert('Enter a phone or email.');
    setBusy(true);
    const { data, error } = await supabase
      .from('shoppers')
      .insert({ company_id: companyId, name, email: email || null, phone: phone || null })
      .select('id, name, email, phone')
      .single();
    setBusy(false);
    if (error || !data) return alert('Failed to create customer: ' + (error?.message ?? ''));
    await assign(data as Shopper);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-lg w-full max-w-md p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 mb-1">
          <div className="min-w-0">
            <h3 className="text-lg font-semibold text-gray-900">Hold for a customer</h3>
            <p className="text-sm text-gray-500 truncate">#{lot.lot_number ?? '—'} {lot.name}</p>
          </div>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-700"><X className="w-5 h-5" /></button>
        </div>

        {!newOpen ? (
          <div className="mt-3 space-y-2">
            <div className="relative">
              <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                value={query}
                onChange={(e) => search(e.target.value)}
                placeholder="Search a customer — name, email, or phone…"
                className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:border-indigo-600"
                autoFocus
              />
            </div>
            {results.length > 0 && (
              <ul className="border border-gray-200 rounded-md bg-white divide-y divide-gray-100 max-h-56 overflow-auto">
                {results.map((s) => (
                  <li key={s.id}>
                    <button
                      onClick={() => assign(s)}
                      disabled={busy}
                      className="w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-gray-50 disabled:opacity-50"
                    >
                      <User className="w-4 h-4 text-gray-400 shrink-0" />
                      <span className="min-w-0">
                        <span className="block text-sm font-medium text-gray-800 truncate">{s.name}</span>
                        <span className="block text-xs text-gray-500 truncate">{s.phone || s.email || 'No contact info'}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {query.trim() && results.length === 0 && (
              <p className="text-xs text-gray-500">No customer matches — create a new one below.</p>
            )}
            <button onClick={() => setNewOpen(true)} className="text-sm text-indigo-600 hover:underline">
              + New customer basket
            </button>
          </div>
        ) : (
          <div className="mt-3 space-y-2">
            <p className="text-sm font-medium text-gray-700">New customer</p>
            <input value={newShopper.name} onChange={(e) => setNewShopper({ ...newShopper, name: e.target.value })} placeholder="Name" className={inputCls} />
            <div className="flex gap-2">
              <input value={newShopper.phone} onChange={(e) => setNewShopper({ ...newShopper, phone: e.target.value })} placeholder="Phone" className={inputCls} />
              <input value={newShopper.email} onChange={(e) => setNewShopper({ ...newShopper, email: e.target.value })} placeholder="Email" className={inputCls} />
            </div>
            <p className="text-xs text-gray-400">Name required; phone or email required.</p>
            <div className="flex gap-2">
              <button onClick={createAndAssign} disabled={busy} className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-md hover:bg-indigo-700 disabled:bg-gray-300">
                Create &amp; hold item
              </button>
              <button onClick={() => setNewOpen(false)} disabled={busy} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">
                Back
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
