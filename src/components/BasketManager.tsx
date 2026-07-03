// src/components/BasketManager.tsx
// Staff tool for estate-sale baskets:
//   • By Shopper — search a customer (name/phone/email), view/edit their basket
//     (add, hold, remove items).
//   • By Item — see every held item and WHO is holding it (who has the sofa?).
// Staff update lots directly (they're authenticated company members), bypassing
// the buyer self-checkout gate.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { X, Search, Trash2, Plus, User, ScanLine } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { parseBasketUrl } from '../services/ScannerService';
import QRScanner from './QRScanner';

interface Props {
  saleId: string;
  companyId: string | null;
  onClose: () => void;
  onChanged?: () => void;
}

interface LotRow {
  id: string;
  lot_number: number | string | null;
  name: string;
  starting_bid: number | null;
  inventory_status: string | null;
  held_by: string | null;
  held_until: string | null;
}
interface Shopper {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
}

const HOLD_MS = 30 * 60 * 1000;
const money = (n: number | null) => (n != null ? `$${n.toLocaleString()}` : '—');

export default function BasketManager({ saleId, companyId, onClose, onChanged }: Props) {
  const [tab, setTab] = useState<'shoppers' | 'items'>('shoppers');
  const [lots, setLots] = useState<LotRow[]>([]);
  const [shopperMap, setShopperMap] = useState<Record<string, Shopper>>({});
  const [shopperQuery, setShopperQuery] = useState('');
  const [shopperResults, setShopperResults] = useState<Shopper[]>([]);
  const [selected, setSelected] = useState<Shopper | null>(null);
  const [addSearch, setAddSearch] = useState('');
  const [itemSearch, setItemSearch] = useState('');
  const [busy, setBusy] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('lots')
      .select('id, lot_number, name, starting_bid, inventory_status, held_by, held_until')
      .eq('sale_id', saleId)
      .order('lot_number', { ascending: true });
    const rows = (data as LotRow[] | null) || [];
    setLots(rows);
    const ids = [...new Set(rows.filter((r) => r.held_by).map((r) => r.held_by as string))];
    if (ids.length) {
      const { data: shs } = await supabase.from('shoppers').select('id, name, email, phone').in('id', ids);
      const map: Record<string, Shopper> = {};
      ((shs as Shopper[] | null) || []).forEach((s) => { map[s.id] = s; });
      setShopperMap(map);
    } else {
      setShopperMap({});
    }
  }, [saleId]);

  useEffect(() => { load(); }, [load]);

  const searchShoppers = async (q: string) => {
    setShopperQuery(q);
    if (q.trim().length < 1) { setShopperResults([]); return; }
    let query = supabase.from('shoppers').select('id, name, email, phone');
    if (companyId) query = query.eq('company_id', companyId);
    const term = `%${q.trim()}%`;
    query = query.or(`name.ilike.${term},email.ilike.${term},phone.ilike.${term}`);
    const { data } = await query.limit(20);
    setShopperResults((data as Shopper[] | null) || []);
  };

  // Scan a customer's basket QR → look them up by the shopper id it encodes.
  const handleScanBasket = (raw: string): boolean => {
    const parsed = parseBasketUrl(raw);
    if (!parsed) return false;
    setShowScanner(false);
    setScanError(null);
    supabase
      .from('shoppers')
      .select('id, name, email, phone')
      .eq('id', parsed.basketId)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setSelected(data as Shopper);
          setShopperResults([]);
          setShopperQuery('');
        } else {
          setScanError('That basket QR isn’t linked to a registered shopper.');
        }
      });
    return true;
  };

  const now = Date.now();
  const isHeld = (l: LotRow) =>
    l.inventory_status === 'held' && !!l.held_until && new Date(l.held_until).getTime() > now;

  const basketItems = useMemo(
    () => (selected ? lots.filter((l) => l.held_by === selected.id && isHeld(l)) : []),
    [lots, selected, now], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const basketTotal = basketItems.reduce((s, l) => s + (l.starting_bid || 0), 0);

  const heldItems = useMemo(() => lots.filter(isHeld), [lots, now]); // eslint-disable-line react-hooks/exhaustive-deps

  const addable = useMemo(() => {
    const q = addSearch.trim().toLowerCase();
    return lots
      .filter((l) => (l.inventory_status ?? 'available') !== 'sold' && l.held_by !== selected?.id)
      .filter((l) => !q || l.name?.toLowerCase().includes(q) || String(l.lot_number ?? '').includes(q))
      .slice(0, 40);
  }, [lots, addSearch, selected]);

  const filteredHeld = useMemo(() => {
    const q = itemSearch.trim().toLowerCase();
    if (!q) return heldItems;
    return heldItems.filter((l) => l.name?.toLowerCase().includes(q) || String(l.lot_number ?? '').includes(q));
  }, [heldItems, itemSearch]);

  const staffHold = async (lotId: string, shopperId: string) => {
    setBusy(true);
    await supabase.from('lots').update({
      inventory_status: 'held', held_by: shopperId,
      held_until: new Date(Date.now() + HOLD_MS).toISOString(), updated_at: new Date().toISOString(),
    }).eq('id', lotId);
    await load(); setBusy(false); onChanged?.();
  };
  const staffRelease = async (lotId: string) => {
    setBusy(true);
    await supabase.from('lots').update({
      inventory_status: 'available', held_by: null, held_until: null, updated_at: new Date().toISOString(),
    }).eq('id', lotId);
    await load(); setBusy(false); onChanged?.();
  };

  const holderLabel = (l: LotRow) => {
    const s = l.held_by ? shopperMap[l.held_by] : undefined;
    if (!s) return 'Unknown';
    return s.name + (s.phone ? ` · ${s.phone}` : s.email ? ` · ${s.email}` : '');
  };

  return (
    <div className="fixed inset-0 z-50 bg-gray-50 flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 bg-white border-b border-gray-200">
        <h2 className="text-lg font-semibold text-gray-900">Baskets</h2>
        <button onClick={onClose} className="p-1.5 rounded-full hover:bg-gray-100" aria-label="Close">
          <X className="w-5 h-5 text-gray-500" />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex bg-white border-b border-gray-200">
        {(['shoppers', 'items'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 py-2.5 text-sm font-medium border-b-2 ${
              tab === t ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-600'
            }`}
          >
            {t === 'shoppers' ? 'Shopper Baskets' : "Who's Holding What"}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-auto p-4">
        {tab === 'shoppers' ? (
          <div className="max-w-lg mx-auto">
            {!selected ? (
              <>
                <div className="flex gap-2 mb-3">
                  <div className="relative flex-1">
                    <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      value={shopperQuery}
                      onChange={(e) => searchShoppers(e.target.value)}
                      placeholder="Name, email, or last 4 of phone…"
                      className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:border-indigo-600"
                    />
                  </div>
                  <button
                    onClick={() => { setScanError(null); setShowScanner(true); }}
                    className="inline-flex items-center gap-1.5 px-3 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50"
                  >
                    <ScanLine className="w-4 h-4" /> Scan
                  </button>
                </div>
                {scanError && (
                  <p className="mb-3 text-sm text-red-600">{scanError}</p>
                )}
                {shopperResults.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => { setSelected(s); setShopperResults([]); setShopperQuery(''); }}
                    className="w-full flex items-center gap-3 px-3 py-2.5 text-left bg-white border border-gray-200 rounded-md mb-2 hover:border-indigo-400"
                  >
                    <User className="w-4 h-4 text-gray-400" />
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-gray-800 truncate">{s.name}</span>
                      <span className="block text-xs text-gray-500 truncate">{s.phone || s.email}</span>
                    </span>
                  </button>
                ))}
                {shopperQuery && shopperResults.length === 0 && (
                  <p className="text-sm text-gray-400 text-center py-4">No shoppers match.</p>
                )}
              </>
            ) : (
              <>
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <p className="font-semibold text-gray-900">{selected.name}</p>
                    <p className="text-xs text-gray-500">{selected.phone || selected.email}</p>
                  </div>
                  <button onClick={() => setSelected(null)} className="text-sm text-indigo-600 hover:underline">
                    Change
                  </button>
                </div>

                {/* Basket items */}
                {basketItems.length === 0 ? (
                  <p className="text-sm text-gray-400 mb-4">This basket is empty.</p>
                ) : (
                  <ul className="divide-y divide-gray-100 border border-gray-200 rounded-md mb-2 bg-white">
                    {basketItems.map((l) => (
                      <li key={l.id} className="flex items-center justify-between px-3 py-2.5">
                        <span className="text-sm text-gray-800 truncate pr-2">
                          #{l.lot_number ?? '—'} {l.name}
                        </span>
                        <span className="flex items-center gap-3 whitespace-nowrap">
                          <span className="text-sm text-gray-600">{money(l.starting_bid)}</span>
                          <button onClick={() => staffRelease(l.id)} disabled={busy} className="text-gray-400 hover:text-red-600">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                <p className="text-right text-sm font-semibold text-gray-900 mb-4">Total: {money(basketTotal)}</p>

                {/* Add / hold items */}
                <div className="relative mb-2">
                  <Plus className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    value={addSearch}
                    onChange={(e) => setAddSearch(e.target.value)}
                    placeholder="Add / hold an item — search available lots…"
                    className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:border-indigo-600"
                  />
                </div>
                {addSearch && (
                  <ul className="border border-gray-200 rounded-md bg-white max-h-56 overflow-auto">
                    {addable.map((l) => {
                      const heldElsewhere = isHeld(l);
                      return (
                        <li key={l.id}>
                          <button
                            onClick={() => staffHold(l.id, selected.id)}
                            disabled={busy}
                            className="w-full flex items-center justify-between px-3 py-2 text-sm text-left hover:bg-gray-50"
                          >
                            <span className="truncate pr-2">
                              #{l.lot_number ?? '—'} {l.name}
                              {heldElsewhere && (
                                <span className="text-xs text-amber-600"> · held by {holderLabel(l)}</span>
                              )}
                            </span>
                            <span className="text-gray-500 whitespace-nowrap">{money(l.starting_bid)}</span>
                          </button>
                        </li>
                      );
                    })}
                    {addable.length === 0 && <li className="px-3 py-2 text-sm text-gray-400">No matching items.</li>}
                  </ul>
                )}
              </>
            )}
          </div>
        ) : (
          <div className="max-w-2xl mx-auto">
            <div className="relative mb-3">
              <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                value={itemSearch}
                onChange={(e) => setItemSearch(e.target.value)}
                placeholder="Search held items (e.g. sofa, dining table)…"
                className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:border-indigo-600"
              />
            </div>
            {filteredHeld.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-6">No items are currently held.</p>
            ) : (
              <ul className="divide-y divide-gray-100 border border-gray-200 rounded-md bg-white">
                {filteredHeld.map((l) => (
                  <li key={l.id} className="flex items-center justify-between px-3 py-2.5">
                    <div className="min-w-0">
                      <p className="text-sm text-gray-800 truncate">#{l.lot_number ?? '—'} {l.name}</p>
                      <p className="text-xs text-gray-500 truncate">Held by {holderLabel(l)}</p>
                    </div>
                    <button onClick={() => staffRelease(l.id)} disabled={busy} className="text-xs text-gray-400 hover:text-red-600 whitespace-nowrap">
                      Release
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      {showScanner && (
        <QRScanner
          onRawScan={handleScanBasket}
          hintText="Scan the customer's basket QR code."
          onClose={() => setShowScanner(false)}
        />
      )}
    </div>
  );
}
