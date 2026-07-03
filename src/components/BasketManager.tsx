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
import { parseBasketUrl, type ScannedLot } from '../services/ScannerService';
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
  description: string | null;
  category: string | null;
  condition: string | null;
  height: number | null;
  width: number | null;
  depth: number | null;
  dimension_unit: string | null;
  starting_bid: number | null;
  sold_price: number | null;
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
  const [showItemScanner, setShowItemScanner] = useState(false);
  const [selectedLot, setSelectedLot] = useState<LotRow | null>(null);
  const [lotPhotoUrl, setLotPhotoUrl] = useState<string | null>(null);
  const [lotBuyer, setLotBuyer] = useState<string | null>(null);
  const [lotFulfillment, setLotFulfillment] = useState<string | null>(null);
  const [lotDelivery, setLotDelivery] = useState<{
    address?: string | null; date?: string | null; estimate?: string | null;
    company?: string | null; phone?: string | null; email?: string | null;
  } | null>(null);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('lots')
      .select('id, lot_number, name, description, category, condition, height, width, depth, dimension_unit, starting_bid, sold_price, inventory_status, held_by, held_until')
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

  // Open the full detail card for a lot: photo + data + status + customer.
  const openDetail = async (lot: LotRow) => {
    setSelectedLot(lot);
    setLotPhotoUrl(null);
    setLotBuyer(null);
    setLotFulfillment(null);
    setLotDelivery(null);

    const { data: photos } = await supabase
      .from('photos')
      .select('file_path, is_primary')
      .eq('lot_id', lot.id)
      .order('is_primary', { ascending: false })
      .limit(1);
    const fp = (photos as { file_path: string }[] | null)?.[0]?.file_path;
    if (fp) setLotPhotoUrl(supabase.storage.from('photos').getPublicUrl(fp).data.publicUrl);

    if (lot.inventory_status === 'sold') {
      const { data: items } = await supabase
        .from('sales_transaction_items')
        .select('transaction_id, fulfillment')
        .eq('lot_id', lot.id)
        .limit(1);
      const item = (items as { transaction_id: string; fulfillment?: string }[] | null)?.[0];
      setLotFulfillment(item?.fulfillment ?? null);
      if (item?.transaction_id) {
        const { data: txn } = await supabase
          .from('sales_transactions')
          .select('buyer_name, delivery_address, delivery_date, delivery_estimate, delivery_company, delivery_company_phone, delivery_company_email')
          .eq('id', item.transaction_id)
          .maybeSingle();
        const t = txn as {
          buyer_name?: string; delivery_address?: string; delivery_date?: string;
          delivery_estimate?: string; delivery_company?: string;
          delivery_company_phone?: string; delivery_company_email?: string;
        } | null;
        setLotBuyer(t?.buyer_name || 'Buyer (name not recorded)');
        setLotDelivery({
          address: t?.delivery_address, date: t?.delivery_date, estimate: t?.delivery_estimate,
          company: t?.delivery_company, phone: t?.delivery_company_phone, email: t?.delivery_company_email,
        });
      }
    }
  };

  // Scan an item's QR (lot tag) → open its detail card.
  const handleScanItem = (scanned: ScannedLot) => {
    setShowItemScanner(false);
    const lot = lots.find((l) => l.id === scanned.lotId);
    if (lot) openDetail(lot);
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
      .filter(
        (l) =>
          !q ||
          l.name?.toLowerCase().includes(q) ||
          l.description?.toLowerCase().includes(q) ||
          String(l.lot_number ?? '').includes(q),
      )
      .slice(0, 40);
  }, [lots, addSearch, selected]);

  // Item lookup: with a query, search ALL lots (any status); with no query,
  // default to an overview of what's currently held.
  const itemResults = useMemo(() => {
    const q = itemSearch.trim().toLowerCase();
    if (!q) return heldItems;
    return lots.filter(
      (l) =>
        l.name?.toLowerCase().includes(q) ||
        l.description?.toLowerCase().includes(q) ||
        String(l.lot_number ?? '').includes(q),
    );
  }, [lots, heldItems, itemSearch]);

  const dimensions = (l: LotRow) => {
    const parts = [l.height, l.width, l.depth].filter((d) => d != null).map(String);
    return parts.length ? `${parts.join(' × ')}${l.dimension_unit ? ` ${l.dimension_unit}` : ''}` : null;
  };
  const statusOf = (l: LotRow) => (isHeld(l) ? 'held' : l.inventory_status === 'sold' ? 'sold' : 'available');
  const STATUS_BADGE: Record<string, string> = {
    available: 'bg-green-100 text-green-800',
    held: 'bg-amber-100 text-amber-800',
    sold: 'bg-gray-200 text-gray-700',
  };

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
            {t === 'shoppers' ? 'Shopper Baskets' : 'Item Lookup'}
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
            {selectedLot ? (
              <div>
                <button onClick={() => setSelectedLot(null)} className="text-sm text-indigo-600 hover:underline mb-3">
                  ← Back to results
                </button>
                <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                  {lotPhotoUrl && (
                    <img src={lotPhotoUrl} alt={selectedLot.name} className="w-full max-h-72 object-cover" />
                  )}
                  <div className="p-4 space-y-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-semibold text-indigo-700">#{selectedLot.lot_number ?? '—'}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_BADGE[statusOf(selectedLot)]}`}>
                        {statusOf(selectedLot) === 'held' ? 'Held' : statusOf(selectedLot) === 'sold' ? 'Sold' : 'Available'}
                      </span>
                    </div>
                    <h3 className="text-lg font-bold text-gray-900">{selectedLot.name}</h3>

                    {statusOf(selectedLot) === 'held' && (
                      <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-md text-sm text-amber-900">
                        <span className="font-medium">Held by:</span> {holderLabel(selectedLot)}
                      </div>
                    )}
                    {statusOf(selectedLot) === 'sold' && (
                      <>
                        <div className="p-2.5 bg-gray-100 border border-gray-200 rounded-md text-sm text-gray-800">
                          <span className="font-medium">Bought by:</span> {lotBuyer ?? '…'}
                          {lotFulfillment && (
                            <span
                              className={`ml-2 text-xs px-2 py-0.5 rounded-full font-medium ${
                                lotFulfillment === 'delivery' ? 'bg-amber-100 text-amber-800' : 'bg-green-100 text-green-800'
                              }`}
                            >
                              {lotFulfillment === 'delivery' ? 'Delivery / pickup' : 'Carried out'}
                            </span>
                          )}
                        </div>
                        {lotFulfillment === 'delivery' && lotDelivery && (
                          <div className="p-2.5 bg-blue-50 border border-blue-200 rounded-md text-sm text-blue-900 space-y-0.5">
                            <p className="font-medium">Delivery details</p>
                            {lotDelivery.address && <p>Address: {lotDelivery.address}</p>}
                            {lotDelivery.date && <p>Date: {lotDelivery.date}</p>}
                            {lotDelivery.estimate && <p>Estimate: {lotDelivery.estimate}</p>}
                            {lotDelivery.company && <p>Company: {lotDelivery.company}</p>}
                            {lotDelivery.phone && <p>Phone: {lotDelivery.phone}</p>}
                            {lotDelivery.email && <p>Email: {lotDelivery.email}</p>}
                            {!lotDelivery.address && !lotDelivery.company && (
                              <p className="text-blue-700">No delivery details recorded.</p>
                            )}
                          </div>
                        )}
                      </>
                    )}

                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <p className="text-xs text-gray-500">Price</p>
                        <p className="text-gray-900">{money(selectedLot.sold_price ?? selectedLot.starting_bid)}</p>
                      </div>
                      {selectedLot.category && (
                        <div><p className="text-xs text-gray-500">Category</p><p className="text-gray-900">{selectedLot.category}</p></div>
                      )}
                      {selectedLot.condition && (
                        <div><p className="text-xs text-gray-500">Condition</p><p className="text-gray-900">{selectedLot.condition}</p></div>
                      )}
                      {dimensions(selectedLot) && (
                        <div><p className="text-xs text-gray-500">Dimensions</p><p className="text-gray-900">{dimensions(selectedLot)}</p></div>
                      )}
                    </div>

                    {selectedLot.description && (
                      <div>
                        <p className="text-xs text-gray-500 mb-1">Description</p>
                        <p className="text-sm text-gray-700 whitespace-pre-wrap">{selectedLot.description}</p>
                      </div>
                    )}

                    {statusOf(selectedLot) === 'held' && (
                      <button
                        onClick={() => { staffRelease(selectedLot.id); setSelectedLot(null); }}
                        disabled={busy}
                        className="text-xs text-gray-400 hover:text-red-600"
                      >
                        Release hold
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <>
                <div className="flex gap-2 mb-3">
                  <div className="relative flex-1">
                    <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      value={itemSearch}
                      onChange={(e) => setItemSearch(e.target.value)}
                      placeholder="Lot #, title, or description (e.g. sofa)…"
                      className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:border-indigo-600"
                    />
                  </div>
                  <button
                    onClick={() => setShowItemScanner(true)}
                    className="inline-flex items-center gap-1.5 px-3 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50"
                  >
                    <ScanLine className="w-4 h-4" /> Scan
                  </button>
                </div>
                <p className="text-xs text-gray-400 mb-2">
                  {itemSearch
                    ? 'Tap an item for full details.'
                    : 'Showing items currently held. Search or scan any item for full details.'}
                </p>
                {itemResults.length === 0 ? (
                  <p className="text-sm text-gray-400 text-center py-6">
                    {itemSearch ? 'No items match.' : 'No items are currently held.'}
                  </p>
                ) : (
                  <ul className="divide-y divide-gray-100 border border-gray-200 rounded-md bg-white">
                    {itemResults.map((l) => (
                      <li key={l.id}>
                        <button onClick={() => openDetail(l)} className="w-full flex items-center justify-between px-3 py-2.5 text-left hover:bg-gray-50">
                          <div className="min-w-0">
                            <p className="text-sm text-gray-800 truncate">#{l.lot_number ?? '—'} {l.name}</p>
                            {isHeld(l) && <p className="text-xs text-gray-500 truncate">Held by {holderLabel(l)}</p>}
                          </div>
                          <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${STATUS_BADGE[statusOf(l)]}`}>
                            {statusOf(l) === 'held' ? 'Held' : statusOf(l) === 'sold' ? 'Sold' : 'Available'}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </>
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

      {showItemScanner && (
        <QRScanner
          onScan={handleScanItem}
          hintText="Scan the item's QR tag."
          onClose={() => setShowItemScanner(false)}
        />
      )}
    </div>
  );
}
