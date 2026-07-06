// src/components/PointOfSale.tsx
// Estate-sale register (Phase 3). Build a cart by scanning tags or picking from
// available lots, set tax, choose a tender, and complete the sale — which marks
// each lot sold and shows a printable receipt. Card tender arrives in Phase 4.

import { useEffect, useMemo, useState } from 'react';
import { X, ScanLine, Plus, Trash2, Search, Printer, CheckCircle2, ShoppingBasket, User } from 'lucide-react';
import type { Lot, TenderType } from '../types';
import { supabase } from '../lib/supabase';
import { createTransaction, computeTotals, type PosLineItem } from '../services/PosService';
import { parseBasketUrl, type ScannedLot } from '../services/ScannerService';
import {
  deliveryFromShopper,
  saveShopperDelivery,
  deliveryMissing,
  SHOPPER_DELIVERY_COLS,
} from '../lib/delivery';
import QRScanner from './QRScanner';

const STAFF_HOLD_MS = 30 * 60 * 1000;

interface Props {
  saleId: string;
  companyId: string | null;
  saleName?: string;
  lots: Lot[];
  onClose: () => void;
  onCompleted?: () => void;
}

const TENDERS: { value: TenderType; label: string; disabled?: boolean; note?: string }[] = [
  { value: 'cash', label: 'Cash' },
  { value: 'check', label: 'Check' },
  { value: 'venmo', label: 'Venmo' },
  { value: 'cashapp', label: 'Cash App' },
  { value: 'card', label: 'Card', disabled: true, note: 'Square — Phase 4' },
  { value: 'other', label: 'Other' },
];

const money = (n: number) => `$${n.toFixed(2)}`;

function defaultPrice(lot: Lot): number {
  // For estate sales the starting_bid field IS the item's price. Estimate is
  // never used for estate-sale pricing.
  return lot.starting_bid ?? 0;
}

// Levenshtein edit distance, for fuzzy "similar name" duplicate detection.
function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (!m) return n;
  if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  let curr = new Array(n + 1).fill(0);
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[n];
}

// Two names are "similar" if, normalized, they're equal, one contains the
// other, or their edit distance is within ~20% of the longer name.
function nameSimilar(a: string, b: string): boolean {
  const na = a.toLowerCase().replace(/[^a-z0-9]/g, '');
  const nb = b.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (na.length < 3 || nb.length < 3) return false;
  if (na === nb || na.includes(nb) || nb.includes(na)) return true;
  const maxLen = Math.max(na.length, nb.length);
  return (maxLen - levenshtein(na, nb)) / maxLen >= 0.8;
}

interface Receipt {
  transactionId: string;
  items: PosLineItem[];
  subtotal: number;
  tax: number;
  total: number;
  tender: TenderType;
  buyerName: string;
}

export default function PointOfSale({ saleId, companyId, saleName, lots, onClose, onCompleted }: Props) {
  const [cart, setCart] = useState<PosLineItem[]>([]);
  const [taxRate, setTaxRate] = useState<number>(() => {
    const saved = localStorage.getItem(`pos_taxrate_${saleId}`);
    return saved ? Number(saved) || 0 : 0;
  });
  const [buyerName, setBuyerName] = useState('');
  const [tender, setTender] = useState<TenderType | null>(null);
  const [showScanner, setShowScanner] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const [pickerSearch, setPickerSearch] = useState('');
  const [newLotPrice, setNewLotPrice] = useState('');
  const [newLotDelivery, setNewLotDelivery] = useState(false);
  const [creatingItem, setCreatingItem] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [buyerBasketId, setBuyerBasketId] = useState<string | null>(null);
  const [buyerContact, setBuyerContact] = useState<{ name?: string; phone?: string; email?: string } | null>(null);
  const [scanMode, setScanMode] = useState<'item' | 'basket'>('item');
  type CustomerRow = { id: string; name: string; email: string | null; phone: string | null };
  type MatchRow = CustomerRow & { reason: 'contact' | 'name' };
  const [customerResults, setCustomerResults] = useState<CustomerRow[]>([]);
  const [showNewCustomer, setShowNewCustomer] = useState(false);
  const [newCustomer, setNewCustomer] = useState({ name: '', phone: '', email: '' });
  const [dupMatches, setDupMatches] = useState<MatchRow[]>([]);
  const [savingCustomer, setSavingCustomer] = useState(false);
  const [customerFormError, setCustomerFormError] = useState<string | null>(null);
  // Staff must confirm mover/delivery details before completing a delivery sale.
  const [deliveryConfirmed, setDeliveryConfirmed] = useState(false);
  const [delivery, setDelivery] = useState({
    address: '', date: '', estimate: '', company: '', companyPhone: '', companyEmail: '',
  });

  useEffect(() => {
    localStorage.setItem(`pos_taxrate_${saleId}`, String(taxRate));
  }, [saleId, taxRate]);

  const totals = useMemo(() => computeTotals(cart, taxRate), [cart, taxRate]);

  const cartLotIds = useMemo(() => new Set(cart.map((c) => c.lotId)), [cart]);
  const availableLots = useMemo(
    () =>
      lots.filter(
        (l) => (l.inventory_status ?? 'available') !== 'sold' && !cartLotIds.has(l.id),
      ),
    [lots, cartLotIds],
  );

  const filteredPicker = useMemo(() => {
    const q = pickerSearch.trim().toLowerCase();
    if (!q) return availableLots;
    return availableLots.filter(
      (l) =>
        l.name?.toLowerCase().includes(q) ||
        String(l.lot_number ?? '').toLowerCase().includes(q),
    );
  }, [availableLots, pickerSearch]);

  const addLot = async (lot: Lot) => {
    if (cartLotIds.has(lot.id)) return;
    setCart((prev) => [
      ...prev,
      {
        lotId: lot.id,
        description: `#${lot.lot_number ?? '—'} ${lot.name}`,
        price: defaultPrice(lot),
        fulfillment: 'carry',
      },
    ]);
    setError(null);
    // When ringing up a shared basket, hold the item under it so it also shows
    // on the buyer's phone. Staff update lots directly (bypasses the buyer gate).
    if (buyerBasketId) {
      await supabase
        .from('lots')
        .update({
          inventory_status: 'held',
          held_by: buyerBasketId,
          held_until: new Date(Date.now() + STAFF_HOLD_MS).toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', lot.id);
    }
  };

  // Create a lot that isn't in the sale yet (uncatalogued / missing item) and
  // add it to the cart. If a customer basket is loaded, hold it under them too.
  const createAndAddItem = async (name: string, priceStr: string, forDelivery: boolean) => {
    const nm = name.trim();
    if (!nm) return;
    const price = Number(priceStr);
    setCreatingItem(true);
    const { data: lot, error } = await supabase
      .from('lots')
      .insert({
        sale_id: saleId,
        name: nm,
        starting_bid: isNaN(price) ? 0 : price,
        inventory_status: buyerBasketId ? 'held' : 'available',
        held_by: buyerBasketId || null,
        held_until: buyerBasketId ? new Date(Date.now() + STAFF_HOLD_MS).toISOString() : null,
        for_delivery: forDelivery,
        updated_at: new Date().toISOString(),
      })
      .select('id, lot_number, name')
      .single();
    setCreatingItem(false);
    if (error || !lot) {
      setError('Could not create item: ' + (error?.message ?? ''));
      return;
    }
    setCart((prev) => [
      ...prev,
      {
        lotId: lot.id,
        description: `#${lot.lot_number ?? '—'} ${lot.name}`,
        price: isNaN(price) ? 0 : price,
        fulfillment: forDelivery ? 'delivery' : 'carry',
      },
    ]);
    // Marking a new item for delivery means the mover details need re-confirming.
    if (forDelivery) setDeliveryConfirmed(false);
    setError(null);
    setPickerSearch('');
    setNewLotPrice('');
    setNewLotDelivery(false);
  };

  const handleScan = (scanned: ScannedLot) => {
    setShowScanner(false);
    const lot = lots.find((l) => l.id === scanned.lotId);
    if (!lot) {
      setError('Scanned item is not part of this sale.');
      return;
    }
    if ((lot.inventory_status ?? 'available') === 'sold') {
      setError(`"${lot.name}" is already marked sold.`);
      return;
    }
    addLot(lot);
  };

  // Staff: load a buyer's basket (held items) into the cart by scanning its QR.
  const loadBuyerBasket = async (bId: string) => {
    const { data } = await supabase
      .from('lots')
      .select('id, lot_number, name, starting_bid, held_until, inventory_status, held_by, for_delivery')
      .eq('sale_id', saleId)
      .eq('held_by', bId)
      .eq('inventory_status', 'held');
    const now = Date.now();
    const held = ((data as (Lot & { for_delivery?: boolean })[] | null) || []).filter(
      (l) => l.held_until && new Date(l.held_until).getTime() > now,
    );
    setCart((prev) => {
      const existing = new Set(prev.map((i) => i.lotId));
      const additions = held
        .filter((l) => !existing.has(l.id))
        .map((l) => ({
          lotId: l.id,
          description: `#${l.lot_number ?? '—'} ${l.name}`,
          price: defaultPrice(l),
          // Carry over the floor's delivery tag on each item.
          fulfillment: (l.for_delivery ? 'delivery' : 'carry') as 'carry' | 'delivery',
        }));
      return [...prev, ...additions];
    });
    setBuyerBasketId(bId);
    setError(null);

    // Pull the shopper's contact + delivery details (staff can read shoppers) so
    // the register shows who this basket belongs to and pre-fills the mover info
    // the floor already collected. Staff still confirm it before completing.
    const { data: shopper } = await supabase
      .from('shoppers')
      .select(`name, email, phone, ${SHOPPER_DELIVERY_COLS}`)
      .eq('id', bId)
      .maybeSingle();
    if (shopper) {
      setBuyerContact(shopper as { name?: string; phone?: string; email?: string });
      setBuyerName((shopper as { name?: string }).name || '');
      setDelivery(deliveryFromShopper(shopper as Record<string, unknown>));
      setDeliveryConfirmed(false);
    }
  };

  const handleBasketRaw = (raw: string): boolean => {
    const parsed = parseBasketUrl(raw);
    if (!parsed || parsed.saleId !== saleId) return false;
    setShowScanner(false);
    loadBuyerBasket(parsed.basketId);
    return true;
  };

  // Find a customer by any part of their name, email, or phone, then load their
  // basket. Matching is done client-side on normalized values so it's tolerant
  // of phone formatting (e.g. "+15615551234" matches "561-555" and "5551234").
  const searchCustomers = async (q: string) => {
    const term = q.trim().toLowerCase();
    if (!term) {
      setCustomerResults([]);
      return;
    }
    let query = supabase.from('shoppers').select('id, name, email, phone').order('name');
    if (companyId) query = query.eq('company_id', companyId);
    const { data, error } = await query.limit(500);
    if (error) {
      console.error('Customer search failed:', error);
      setError('Customer search failed: ' + error.message);
      setCustomerResults([]);
      return;
    }
    const digits = term.replace(/\D/g, '');
    const rows =
      (data as { id: string; name: string; email: string | null; phone: string | null }[] | null) || [];
    const matched = rows
      .filter((c) => {
        const name = (c.name || '').toLowerCase();
        const email = (c.email || '').toLowerCase();
        const phoneDigits = (c.phone || '').replace(/\D/g, '');
        return (
          name.includes(term) ||
          email.includes(term) ||
          (digits.length >= 2 && phoneDigits.includes(digits))
        );
      })
      .slice(0, 20);
    setCustomerResults(matched);
  };

  const pickCustomer = (id: string) => {
    setCustomerResults([]);
    loadBuyerBasket(id);
  };

  // Open the "new customer" popup, prefilled with whatever was typed in search.
  const openNewCustomer = () => {
    const typed = buyerName.trim();
    // If the typed text looks like an email or phone, seed the right field.
    const isEmail = typed.includes('@');
    const isPhone = /\d/.test(typed) && !isEmail && typed.replace(/\D/g, '').length >= 4;
    setNewCustomer({
      name: isEmail || isPhone ? '' : typed,
      phone: isPhone ? typed : '',
      email: isEmail ? typed : '',
    });
    setDupMatches([]);
    setCustomerFormError(null);
    setShowNewCustomer(true);
  };

  // Look for an existing customer that may be the same person: an exact
  // phone/email match (normalized) OR a similar name (fuzzy). Returns each with
  // the reason it matched, so we don't create a duplicate record / second cart.
  const findExistingCustomers = async (
    name: string,
    phone: string,
    email: string,
  ): Promise<MatchRow[]> => {
    const phoneDigits = phone.replace(/\D/g, '');
    const em = email.trim().toLowerCase();
    const nm = name.trim();
    if (!phoneDigits && !em && !nm) return [];
    let query = supabase.from('shoppers').select('id, name, email, phone');
    if (companyId) query = query.eq('company_id', companyId);
    const { data } = await query.limit(500);
    const matches: MatchRow[] = [];
    for (const c of (data as CustomerRow[] | null) || []) {
      const cPhone = (c.phone || '').replace(/\D/g, '');
      const cEmail = (c.email || '').toLowerCase();
      if ((phoneDigits && cPhone === phoneDigits) || (em && cEmail === em)) {
        matches.push({ ...c, reason: 'contact' });
      } else if (nm && nameSimilar(nm, c.name || '')) {
        matches.push({ ...c, reason: 'name' });
      }
    }
    // Show exact contact matches first.
    return matches.sort((a, b) => (a.reason === b.reason ? 0 : a.reason === 'contact' ? -1 : 1));
  };

  // Save a new customer. On the first attempt, if a matching record already
  // exists we surface it (so staff can load that existing cart instead of
  // creating a duplicate). Passing force=true creates the record anyway.
  const saveNewCustomer = async (force: boolean) => {
    const name = newCustomer.name.trim();
    const phone = newCustomer.phone.trim();
    const email = newCustomer.email.trim();
    if (!name) return setCustomerFormError('Enter the customer name.');
    if (!phone && !email) return setCustomerFormError('Enter a phone or email so their cart can be found later.');
    setCustomerFormError(null);
    setSavingCustomer(true);
    if (!force) {
      const existing = await findExistingCustomers(name, phone, email);
      if (existing.length > 0) {
        setDupMatches(existing);
        setSavingCustomer(false);
        return;
      }
    }
    const { data, error } = await supabase
      .from('shoppers')
      .insert({ company_id: companyId, name, email: email || null, phone: phone || null })
      .select('id')
      .single();
    setSavingCustomer(false);
    if (error || !data) {
      setCustomerFormError('Could not save customer: ' + (error?.message ?? ''));
      return;
    }
    setShowNewCustomer(false);
    setCustomerResults([]);
    loadBuyerBasket(data.id);
  };

  const useExistingCustomer = (id: string) => {
    setShowNewCustomer(false);
    setDupMatches([]);
    setCustomerResults([]);
    loadBuyerBasket(id);
  };

  const updatePrice = (index: number, value: string) => {
    const price = Number(value);
    setCart((prev) => prev.map((it, i) => (i === index ? { ...it, price: isNaN(price) ? 0 : price } : it)));
  };

  const setItemFulfillment = (index: number, f: 'carry' | 'delivery') => {
    setCart((prev) => prev.map((it, i) => (i === index ? { ...it, fulfillment: f } : it)));
    // Persist the tag on the lot so it stays with the item (floor ↔ register).
    const lotId = cart[index]?.lotId;
    if (lotId) {
      supabase.from('lots').update({ for_delivery: f === 'delivery', updated_at: new Date().toISOString() }).eq('id', lotId);
    }
    if (f === 'delivery') setDeliveryConfirmed(false);
  };

  // Editing any mover/delivery field invalidates a prior confirmation, forcing
  // staff to re-validate the updated details before completing the sale.
  const updateDelivery = (patch: Partial<typeof delivery>) => {
    setDelivery((prev) => ({ ...prev, ...patch }));
    setDeliveryConfirmed(false);
  };

  // Save/validate the mover details: require a date + a contact, persist them to
  // the customer's record (so the floor and any later sale see them), and mark
  // them confirmed so the sale can complete.
  const saveDeliveryDetails = async () => {
    const missing = deliveryMissing(delivery);
    if (missing) {
      setError(missing);
      return;
    }
    setError(null);
    if (buyerBasketId) await saveShopperDelivery(supabase, buyerBasketId, delivery);
    setDeliveryConfirmed(true);
  };

  const hasDelivery = cart.some((i) => i.fulfillment === 'delivery');

  const removeItem = async (index: number) => {
    const item = cart[index];
    setCart((prev) => prev.filter((_, i) => i !== index));
    // Release the hold if this item was held under the loaded buyer basket.
    if (buyerBasketId && item?.lotId) {
      await supabase
        .from('lots')
        .update({ inventory_status: 'available', held_by: null, held_until: null, updated_at: new Date().toISOString() })
        .eq('id', item.lotId)
        .eq('held_by', buyerBasketId);
    }
  };

  const completeSale = async () => {
    if (!tender || !cart.length || processing) return;
    if (!buyerName.trim()) {
      setError("Please enter the buyer's name.");
      return;
    }
    setProcessing(true);
    setError(null);
    const result = await createTransaction({
      saleId,
      companyId,
      items: cart,
      taxRate,
      tenderType: tender,
      buyerName: buyerName.trim(),
      note: buyerBasketId ? `basket ${buyerBasketId.slice(0, 8)}` : undefined,
      delivery: hasDelivery
        ? {
            address: delivery.address,
            date: delivery.date,
            estimate: delivery.estimate,
            company: delivery.company,
            companyPhone: delivery.companyPhone,
            companyEmail: delivery.companyEmail,
          }
        : undefined,
    });
    setProcessing(false);
    if (!result.success || !result.transactionId || !result.totals) {
      setError(result.error || 'Checkout failed.');
      return;
    }
    setReceipt({
      transactionId: result.transactionId,
      items: cart,
      subtotal: result.totals.subtotal,
      tax: result.totals.tax,
      total: result.totals.total,
      tender,
      buyerName: buyerName.trim(),
    });
    onCompleted?.();
  };

  const startNewSale = () => {
    setReceipt(null);
    setCart([]);
    setTender(null);
    setBuyerName('');
    setError(null);
    setBuyerBasketId(null);
    setBuyerContact(null);
    setScanMode('item');
    setPickerSearch('');
    setNewLotPrice('');
    setNewLotDelivery(false);
    setCustomerResults([]);
    setShowNewCustomer(false);
    setNewCustomer({ name: '', phone: '', email: '' });
    setDupMatches([]);
    setCustomerFormError(null);
    setDeliveryConfirmed(false);
    setDelivery({ address: '', date: '', estimate: '', company: '', companyPhone: '', companyEmail: '' });
  };

  // ---- Receipt view -------------------------------------------------------
  if (receipt) {
    return (
      <div className="fixed inset-0 z-50 bg-gray-50 overflow-auto">
        <div className="max-w-md mx-auto p-6">
          <div className="text-center mb-6">
            <CheckCircle2 className="w-12 h-12 text-green-600 mx-auto mb-2" />
            <h2 className="text-xl font-bold text-gray-900">Sale Complete</h2>
            <p className="text-sm text-gray-500">Transaction {receipt.transactionId.slice(0, 8)}</p>
          </div>

          <div id="pos-receipt" className="bg-white rounded-lg border border-gray-200 p-5 mb-6">
            <h3 className="font-semibold text-gray-900 mb-1">{saleName || 'Estate Sale'}</h3>
            {receipt.buyerName && (
              <p className="text-sm text-gray-600 mb-3">Buyer: {receipt.buyerName}</p>
            )}
            <div className="divide-y divide-gray-100">
              {receipt.items.map((it, i) => (
                <div key={i} className="flex justify-between py-2 text-sm">
                  <span className="text-gray-700 pr-2">
                    {it.description}
                    {it.fulfillment === 'delivery' && (
                      <span className="ml-1 text-xs text-amber-700">· delivery</span>
                    )}
                  </span>
                  <span className="text-gray-900 font-medium whitespace-nowrap">{money(it.price)}</span>
                </div>
              ))}
            </div>
            <div className="mt-3 pt-3 border-t border-gray-200 space-y-1 text-sm">
              <div className="flex justify-between text-gray-600">
                <span>Subtotal</span><span>{money(receipt.subtotal)}</span>
              </div>
              <div className="flex justify-between text-gray-600">
                <span>Tax</span><span>{money(receipt.tax)}</span>
              </div>
              <div className="flex justify-between text-lg font-bold text-gray-900">
                <span>Total</span><span>{money(receipt.total)}</span>
              </div>
              <div className="flex justify-between text-gray-600 pt-1">
                <span>Paid via</span><span className="capitalize">{receipt.tender}</span>
              </div>
            </div>
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => window.print()}
              className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
            >
              <Printer className="w-4 h-4" /> Print
            </button>
            <button
              onClick={startNewSale}
              className="flex-1 px-4 py-2.5 bg-indigo-600 text-white rounded-md hover:bg-indigo-700"
            >
              New Sale
            </button>
            <button
              onClick={onClose}
              className="flex-1 px-4 py-2.5 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ---- Register view ------------------------------------------------------
  return (
    <div className="fixed inset-0 z-50 bg-gray-50 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-white border-b border-gray-200">
        <h2 className="text-lg font-semibold text-gray-900">Register</h2>
        <button onClick={onClose} className="p-1.5 rounded-full hover:bg-gray-100" aria-label="Close register">
          <X className="w-5 h-5 text-gray-500" />
        </button>
      </div>

      {/* Customer / buyer — the single place to identify who is buying. Search
          saved shoppers; if none match, the typed name/phone/email becomes the
          buyer for an unregistered walk-up sale. */}
      <div className="px-4 py-3 bg-white border-b border-gray-200">
        {buyerBasketId ? (
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-xs font-medium text-indigo-700">Customer basket loaded</p>
              <p className="text-sm font-semibold text-gray-900 truncate">{buyerName || buyerContact?.name}</p>
              {(buyerContact?.phone || buyerContact?.email) && (
                <p className="text-xs text-gray-500 truncate">
                  {buyerContact?.phone && (
                    <a href={`tel:${buyerContact.phone}`} className="hover:underline">{buyerContact.phone}</a>
                  )}
                  {buyerContact?.phone && buyerContact?.email && ' · '}
                  {buyerContact?.email && (
                    <a href={`mailto:${buyerContact.email}`} className="hover:underline">{buyerContact.email}</a>
                  )}
                </p>
              )}
              <p className="text-xs text-gray-400 mt-0.5">Items you add sync to their basket.</p>
            </div>
            <button
              onClick={() => { setBuyerBasketId(null); setBuyerContact(null); setBuyerName(''); setCustomerResults([]); }}
              className="text-xs text-indigo-600 underline shrink-0"
            >
              Change
            </button>
          </div>
        ) : (
          <>
            <div className="relative">
              <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                value={buyerName}
                onChange={(e) => { setBuyerName(e.target.value); searchCustomers(e.target.value); }}
                placeholder="Customer name, phone, or email…"
                className={
                  `w-full pl-9 pr-3 py-2 text-sm border rounded-md focus:outline-none focus:border-indigo-600 ` +
                  (buyerName.trim() ? 'border-gray-300' : 'border-amber-300')
                }
              />
            </div>
            {customerResults.length > 0 && (
              <div className="mt-1 border border-gray-200 rounded-md divide-y divide-gray-100 max-h-56 overflow-auto">
                {customerResults.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => pickCustomer(c.id)}
                    className="w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-gray-50"
                  >
                    <User className="w-4 h-4 text-gray-400 shrink-0" />
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-gray-800 truncate">{c.name}</span>
                      <span className="block text-xs text-gray-500 truncate">
                        {[c.phone, c.email].filter(Boolean).join(' · ') || 'No contact info'}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            )}
            {buyerName.trim() && customerResults.length === 0 && (
              <div className="mt-1.5 flex items-center justify-between gap-2">
                <p className="text-xs text-gray-500 min-w-0">
                  No saved customer matches. Selling to “{buyerName.trim()}” as an unregistered customer, or:
                </p>
                <button
                  onClick={openNewCustomer}
                  className="inline-flex items-center gap-1 text-sm font-medium text-indigo-600 hover:underline whitespace-nowrap shrink-0"
                >
                  <Plus className="w-3.5 h-3.5" /> Add customer
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Add buttons */}
      <div className="px-4 py-3 flex gap-2 bg-white border-b border-gray-100">
        <button
          onClick={() => { setScanMode('item'); setShowScanner(true); }}
          className="flex-1 inline-flex items-center justify-center gap-2 px-3 py-2 bg-indigo-600 text-white rounded-md text-sm font-medium hover:bg-indigo-700"
        >
          <ScanLine className="w-4 h-4" /> Scan
        </button>
        <button
          onClick={() => setShowPicker((s) => !s)}
          className="flex-1 inline-flex items-center justify-center gap-2 px-3 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          <Plus className="w-4 h-4" /> Add Item
        </button>
        <button
          onClick={() => { setScanMode('basket'); setShowScanner(true); }}
          className="flex-1 inline-flex items-center justify-center gap-2 px-3 py-2 border border-indigo-300 text-indigo-700 rounded-md text-sm font-medium hover:bg-indigo-50"
        >
          <ShoppingBasket className="w-4 h-4" /> Basket
        </button>
      </div>

      {/* Picker */}
      {showPicker && (
        <div className="px-4 py-3 bg-white border-b border-gray-200 max-h-64 overflow-auto">
          <div className="relative mb-2">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              value={pickerSearch}
              onChange={(e) => setPickerSearch(e.target.value)}
              placeholder="Search available items…"
              className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:border-indigo-600"
            />
          </div>
          {filteredPicker.length === 0 ? (
            <p className="text-sm text-gray-400 py-2 text-center">No matching items in this sale.</p>
          ) : (
            filteredPicker.slice(0, 50).map((lot) => (
              <button
                key={lot.id}
                onClick={() => addLot(lot)}
                className="w-full flex justify-between items-center px-2 py-2 text-sm text-left hover:bg-gray-50 rounded"
              >
                <span className="text-gray-700 truncate pr-2">
                  #{lot.lot_number ?? '—'} {lot.name}
                </span>
                <span className="text-gray-500 whitespace-nowrap">{money(defaultPrice(lot))}</span>
              </button>
            ))
          )}

          {/* Create a missing / uncatalogued item on the spot */}
          {pickerSearch.trim() && (
            <div className="mt-2 pt-2 border-t border-gray-100">
              <p className="text-xs text-gray-500 mb-1.5">
                Not in the sale? Add “{pickerSearch.trim()}” as a new item:
              </p>
              <div className="flex gap-2">
                <div className="relative w-28 shrink-0">
                  <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                  <input
                    type="number"
                    inputMode="decimal"
                    value={newLotPrice}
                    onChange={(e) => setNewLotPrice(e.target.value)}
                    placeholder="Price"
                    className="w-full pl-5 pr-2 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:border-indigo-600"
                  />
                </div>
                <button
                  onClick={() => createAndAddItem(pickerSearch, newLotPrice, newLotDelivery)}
                  disabled={creatingItem}
                  className="flex-1 inline-flex items-center justify-center gap-1 px-3 py-2 bg-indigo-600 text-white text-sm font-medium rounded-md hover:bg-indigo-700 disabled:bg-gray-300"
                >
                  <Plus className="w-4 h-4" /> {creatingItem ? 'Adding…' : 'Add new item'}
                </button>
              </div>
              <label className="mt-1.5 inline-flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={newLotDelivery}
                  onChange={(e) => setNewLotDelivery(e.target.checked)}
                  className="w-4 h-4 accent-amber-500"
                />
                <span className={`text-xs font-medium ${newLotDelivery ? 'text-amber-700' : 'text-gray-500'}`}>
                  For delivery
                </span>
              </label>
            </div>
          )}
        </div>
      )}

      {/* Cart */}
      <div className="flex-1 overflow-auto px-4 py-3">
        {cart.length === 0 ? (
          <div className="text-center text-gray-400 py-12">
            <p className="text-sm">Cart is empty — scan a tag or add an item.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {cart.map((item, i) => (
              <div key={item.lotId ?? i} className="bg-white rounded-lg border border-gray-200 p-3">
                <div className="flex items-center gap-2">
                  <span className="flex-1 text-sm text-gray-800 truncate">{item.description}</span>
                  <div className="relative">
                    <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                    <input
                      type="number"
                      inputMode="decimal"
                      value={item.price}
                      onChange={(e) => updatePrice(i, e.target.value)}
                      className="w-24 pl-5 pr-2 py-1.5 text-sm text-right border border-gray-300 rounded-md focus:outline-none focus:border-indigo-600"
                    />
                  </div>
                  <button onClick={() => removeItem(i)} className="p-1.5 text-gray-400 hover:text-red-600" aria-label="Remove item">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
                <label className="mt-2 inline-flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={item.fulfillment === 'delivery'}
                    onChange={(e) => setItemFulfillment(i, e.target.checked ? 'delivery' : 'carry')}
                    className="w-4 h-4 accent-amber-500"
                  />
                  <span
                    className={
                      `text-xs font-medium ` +
                      (item.fulfillment === 'delivery' ? 'text-amber-700' : 'text-gray-500')
                    }
                  >
                    {item.fulfillment === 'delivery' ? 'For delivery' : 'Carry out'}
                  </span>
                </label>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer: totals + tender + complete */}
      <div className="bg-white border-t border-gray-200 px-4 py-3 space-y-3">
        {error && (
          <div className="p-2.5 bg-red-50 border border-red-200 rounded-md text-sm text-red-700">{error}</div>
        )}

        <div className="flex items-center justify-end gap-3">
          <label className="flex items-center gap-1.5 text-sm text-gray-600 whitespace-nowrap">
            Tax %
            <input
              type="number"
              inputMode="decimal"
              value={taxRate}
              onChange={(e) => setTaxRate(Number(e.target.value) || 0)}
              className="w-16 px-2 py-2 text-sm text-right border border-gray-300 rounded-md focus:outline-none focus:border-indigo-600"
            />
          </label>
        </div>

        {/* Delivery / mover details — shown when any item is checked for delivery */}
        {hasDelivery && (
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-md space-y-2">
            <p className="text-xs font-semibold text-amber-900">
              Delivery &amp; mover details ({cart.filter((i) => i.fulfillment === 'delivery').length} item
              {cart.filter((i) => i.fulfillment === 'delivery').length === 1 ? '' : 's'} for delivery)
            </p>
            <input
              placeholder="Delivery address"
              value={delivery.address}
              onChange={(e) => updateDelivery({ address: e.target.value })}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:border-indigo-600"
            />
            <div className="flex gap-2">
              <input
                placeholder="Delivery date"
                value={delivery.date}
                onChange={(e) => updateDelivery({ date: e.target.value })}
                className="flex-1 min-w-0 px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:border-indigo-600"
              />
              <input
                placeholder="Estimate"
                value={delivery.estimate}
                onChange={(e) => updateDelivery({ estimate: e.target.value })}
                className="flex-1 min-w-0 px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:border-indigo-600"
              />
            </div>
            <input
              placeholder="Mover / delivery company"
              value={delivery.company}
              onChange={(e) => updateDelivery({ company: e.target.value })}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:border-indigo-600"
            />
            <div className="flex gap-2">
              <input
                placeholder="Mover phone"
                value={delivery.companyPhone}
                onChange={(e) => updateDelivery({ companyPhone: e.target.value })}
                className="flex-1 min-w-0 px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:border-indigo-600"
              />
              <input
                placeholder="Mover email"
                value={delivery.companyEmail}
                onChange={(e) => updateDelivery({ companyEmail: e.target.value })}
                className="flex-1 min-w-0 px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:border-indigo-600"
              />
            </div>
            {deliveryConfirmed ? (
              <div className="flex items-center justify-between pt-1">
                <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700">
                  <CheckCircle2 className="w-4 h-4" /> Delivery details saved
                </span>
                <button
                  onClick={() => setDeliveryConfirmed(false)}
                  className="text-xs text-amber-800 underline"
                >
                  Edit
                </button>
              </div>
            ) : (
              <button
                onClick={saveDeliveryDetails}
                className="w-full mt-1 px-3 py-2 bg-amber-600 text-white text-sm font-medium rounded-md hover:bg-amber-700"
              >
                Save delivery details
              </button>
            )}
          </div>
        )}

        <div className="space-y-1 text-sm">
          <div className="flex justify-between text-gray-600"><span>Subtotal</span><span>{money(totals.subtotal)}</span></div>
          <div className="flex justify-between text-gray-600"><span>Tax</span><span>{money(totals.tax)}</span></div>
          <div className="flex justify-between text-lg font-bold text-gray-900"><span>Total</span><span>{money(totals.total)}</span></div>
        </div>

        <div className="grid grid-cols-3 gap-2">
          {TENDERS.map((t) => (
            <button
              key={t.value}
              disabled={t.disabled}
              onClick={() => setTender(t.value)}
              className={
                `px-2 py-2 rounded-md text-sm font-medium border transition-colors ` +
                (t.disabled
                  ? 'bg-gray-50 text-gray-300 border-gray-200 cursor-not-allowed'
                  : tender === t.value
                    ? 'bg-indigo-600 text-white border-indigo-600'
                    : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50')
              }
              title={t.note}
            >
              {t.label}
            </button>
          ))}
        </div>

        {hasDelivery && !deliveryConfirmed && (
          <p className="text-xs text-amber-700 text-center">
            Save the delivery details above to complete this sale.
          </p>
        )}
        <button
          disabled={
            !tender ||
            cart.length === 0 ||
            processing ||
            !buyerName.trim() ||
            (hasDelivery && !deliveryConfirmed)
          }
          onClick={completeSale}
          className="w-full px-4 py-3 bg-green-600 text-white rounded-md font-semibold hover:bg-green-700 disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed"
        >
          {processing ? 'Processing…' : `Complete Sale · ${money(totals.total)}`}
        </button>
      </div>

      {showScanner &&
        (scanMode === 'basket' ? (
          <QRScanner
            onRawScan={handleBasketRaw}
            hintText="That's not a basket code — ask the shopper to open their basket page."
            onClose={() => setShowScanner(false)}
          />
        ) : (
          <QRScanner onScan={handleScan} onClose={() => setShowScanner(false)} />
        ))}

      {/* New-customer popup: collect contact info and check for an existing
          record/cart before creating a duplicate. */}
      {showNewCustomer && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4"
          onClick={() => setShowNewCustomer(false)}
        >
          <div className="bg-white rounded-lg max-w-sm w-full p-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-bold text-gray-900">New customer</h3>
              <button onClick={() => setShowNewCustomer(false)} className="p-1 rounded-full hover:bg-gray-100" aria-label="Close">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            {customerFormError && (
              <div className="mb-3 p-2.5 bg-red-50 border border-red-200 rounded-md text-sm text-red-700">
                {customerFormError}
              </div>
            )}

            <div className="space-y-2">
              <input
                value={newCustomer.name}
                onChange={(e) => { setNewCustomer({ ...newCustomer, name: e.target.value }); setDupMatches([]); }}
                placeholder="Name"
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:border-indigo-600"
              />
              <div className="flex gap-2">
                <input
                  value={newCustomer.phone}
                  onChange={(e) => { setNewCustomer({ ...newCustomer, phone: e.target.value }); setDupMatches([]); }}
                  placeholder="Phone"
                  inputMode="tel"
                  className="flex-1 min-w-0 px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:border-indigo-600"
                />
                <input
                  value={newCustomer.email}
                  onChange={(e) => { setNewCustomer({ ...newCustomer, email: e.target.value }); setDupMatches([]); }}
                  placeholder="Email"
                  inputMode="email"
                  className="flex-1 min-w-0 px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:border-indigo-600"
                />
              </div>
              <p className="text-xs text-gray-400">Name required; phone or email required so their cart can be found later.</p>
            </div>

            {dupMatches.length > 0 && (
              <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-md">
                <p className="text-sm font-medium text-amber-900 mb-2">
                  This customer may already have a cart — use it instead of creating a duplicate?
                </p>
                <div className="space-y-2">
                  {dupMatches.map((m) => (
                    <div key={m.id} className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-800 truncate">
                          {m.name}
                          <span
                            className={
                              `ml-2 align-middle px-1.5 py-0.5 rounded text-[10px] font-medium ` +
                              (m.reason === 'contact'
                                ? 'bg-red-100 text-red-700'
                                : 'bg-amber-100 text-amber-800')
                            }
                          >
                            {m.reason === 'contact' ? 'same phone/email' : 'similar name'}
                          </span>
                        </p>
                        <p className="text-xs text-gray-500 truncate">
                          {[m.phone, m.email].filter(Boolean).join(' · ') || 'No contact info'}
                        </p>
                      </div>
                      <button
                        onClick={() => useExistingCustomer(m.id)}
                        className="px-3 py-1.5 bg-indigo-600 text-white text-xs font-medium rounded-md hover:bg-indigo-700 shrink-0"
                      >
                        Use this cart
                      </button>
                    </div>
                  ))}
                </div>
                <button
                  onClick={() => saveNewCustomer(true)}
                  disabled={savingCustomer}
                  className="mt-3 text-xs text-amber-800 underline"
                >
                  None of these — create a new customer anyway
                </button>
              </div>
            )}

            {dupMatches.length === 0 && (
              <div className="flex gap-2 mt-4">
                <button
                  onClick={() => saveNewCustomer(false)}
                  disabled={savingCustomer}
                  className="flex-1 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-md hover:bg-indigo-700 disabled:bg-gray-300"
                >
                  {savingCustomer ? 'Checking…' : 'Save & start cart'}
                </button>
                <button
                  onClick={() => setShowNewCustomer(false)}
                  className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
