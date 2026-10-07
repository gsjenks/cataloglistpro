// src/components/DeliveryDetailsForm.tsx
// Delivery & mover details with checks, for the basket tool:
//   address  checked against the US Census geocoder (address-check function);
//            a match can replace what was typed, and a miss can be kept anyway
//   date     a calendar (<input type="date">, stored as YYYY-MM-DD)
//   mover    picked from the company shippers directory, or added to it
//   phone    masked to (555) 555-5555, 10 digits required
//   email    name@domain.tld
//   access   for the mover: home / apartment / other, stairs?, elevator required?
// The parent owns the values and the Save button; this reports what is still
// wrong through onErrorsChange so Save can refuse with a reason.

import { useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, AlertTriangle, Loader2, Plus, Truck } from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { Shipper } from '../types';
import { PROPERTY_LABELS, type DeliveryDetails, type DeliveryProperty } from '../lib/delivery';
import { listShippers, createShipper } from '../services/ShipperService';
import { formatPhone, phoneDigits, isValidPhone, isValidEmail, isIsoDate } from '../lib/contactFormat';

type AddressState =
  | { kind: 'saved' }                       // loaded from the record, not edited
  | { kind: 'unchecked' }
  | { kind: 'checking' }
  | { kind: 'verified'; match: string }
  | { kind: 'suggest'; matches: string[] }  // found, but worded differently
  | { kind: 'notfound' }
  | { kind: 'error'; message: string };

interface Props {
  value: DeliveryDetails;
  onChange: (patch: Partial<DeliveryDetails>) => void;
  companyId: string | null;
  onErrorsChange: (errors: string[]) => void;
}

const inputCls = 'w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:border-indigo-600';
const errCls = 'border-red-400 focus:border-red-500';

/** A yes/no question with an unanswered state (null). */
export function YesNoQuestion({ label, value, onChange }: {
  label: string;
  value: boolean | null;
  onChange: (v: boolean) => void;
}) {
  const btn = (v: boolean) =>
    `px-3 py-1 ${value === v ? (v ? 'bg-amber-500 text-white' : 'bg-gray-700 text-white') : 'bg-white text-gray-600 hover:bg-gray-50'}`;
  return (
    <div className="flex items-center justify-between gap-3">
      <span className={`text-sm ${value == null ? 'text-gray-800 font-medium' : 'text-gray-700'}`}>{label}</span>
      <div className="inline-flex rounded-md border border-gray-300 overflow-hidden text-xs font-medium shrink-0" role="group" aria-label={label}>
        <button type="button" aria-pressed={value === true} onClick={() => onChange(true)} className={btn(true)}>Yes</button>
        <button type="button" aria-pressed={value === false} onClick={() => onChange(false)} className={`border-l border-gray-300 ${btn(false)}`}>No</button>
      </div>
    </div>
  );
}

function normalize(a: string) {
  return a.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export default function DeliveryDetailsForm({ value, onChange, companyId, onErrorsChange }: Props) {
  const [address, setAddress] = useState<AddressState>({ kind: value.address ? 'saved' : 'unchecked' });
  const [keepAddress, setKeepAddress] = useState(false);
  const lastChecked = useRef<string>('');
  // An address that arrives from the record (not typed here) counts as saved.
  const typed = useRef(false);
  useEffect(() => {
    if (!typed.current) setAddress({ kind: value.address ? 'saved' : 'unchecked' });
    typed.current = false;
  }, [value.address]);

  const [movers, setMovers] = useState<Shipper[]>([]);
  const [moverOpen, setMoverOpen] = useState(false);
  const [addingMover, setAddingMover] = useState(false);

  useEffect(() => {
    if (!companyId) return;
    listShippers(companyId)
      .then((rows) => setMovers(rows.filter((r) => r.active !== false)))
      .catch((e) => console.warn('Mover list unavailable:', e));
  }, [companyId]);

  // ── Address ──────────────────────────────────────────────────────────────
  const checkAddress = async () => {
    const text = value.address.trim();
    if (!text) { setAddress({ kind: 'unchecked' }); return; }
    if (text === lastChecked.current && address.kind !== 'unchecked' && address.kind !== 'error') return;
    lastChecked.current = text;
    setAddress({ kind: 'checking' });
    const { data, error } = await supabase.functions.invoke('address-check', { body: { address: text } });
    if (error || data?.error) {
      setAddress({ kind: 'error', message: 'Could not check the address right now.' });
      return;
    }
    const matches = ((data?.matches ?? []) as { address: string }[]).map((m) => m.address);
    if (matches.length === 0) setAddress({ kind: 'notfound' });
    else if (matches.length === 1 && normalize(matches[0]) === normalize(text)) setAddress({ kind: 'verified', match: matches[0] });
    else setAddress({ kind: 'suggest', matches });
  };

  const editAddress = (text: string) => {
    typed.current = true;
    onChange({ address: text });
    setKeepAddress(false);
    setAddress({ kind: 'unchecked' });
  };

  const useMatch = (m: string) => {
    typed.current = true;
    onChange({ address: m });
    lastChecked.current = m;
    setKeepAddress(false);
    setAddress({ kind: 'verified', match: m });
  };

  // ── Mover ────────────────────────────────────────────────────────────────
  const moverMatches = useMemo(() => {
    const q = value.company.trim().toLowerCase();
    return q ? movers.filter((m) => m.name.toLowerCase().includes(q)) : movers;
  }, [movers, value.company]);
  const moverKnown = movers.some((m) => m.name.trim().toLowerCase() === value.company.trim().toLowerCase());

  const pickMover = (m: Shipper) => {
    onChange({
      company: m.name,
      companyPhone: m.phone ? formatPhone(m.phone) : value.companyPhone,
      companyEmail: m.email ?? value.companyEmail,
    });
    setMoverOpen(false);
  };

  const addMover = async () => {
    const name = value.company.trim();
    if (!name || !companyId) return;
    setAddingMover(true);
    try {
      const created = await createShipper({
        company_id: companyId,
        name,
        kind: 'external',
        phone: isValidPhone(value.companyPhone) ? formatPhone(value.companyPhone) : undefined,
        email: isValidEmail(value.companyEmail) ? value.companyEmail.trim() : undefined,
        active: true,
      });
      setMovers((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
      setMoverOpen(false);
    } catch (e) {
      alert('Could not add the mover: ' + (e instanceof Error ? e.message : 'unknown error'));
    } finally {
      setAddingMover(false);
    }
  };

  // ── Validation ───────────────────────────────────────────────────────────
  const phoneBad = !!value.companyPhone && !isValidPhone(value.companyPhone);
  const emailBad = !!value.companyEmail && !isValidEmail(value.companyEmail);
  const legacyDate = !!value.date && !isIsoDate(value.date);

  const errors = useMemo(() => {
    const e: string[] = [];
    if (value.address.trim()) {
      if (address.kind === 'checking') e.push('Wait for the address check to finish.');
      else if (address.kind === 'unchecked') e.push('Check the delivery address.');
      else if ((address.kind === 'notfound' || address.kind === 'suggest' || address.kind === 'error') && !keepAddress)
        e.push('Pick a suggested address, or tick "Keep the address as entered".');
    }
    if (phoneBad) e.push('Mover phone needs 10 digits, area code first.');
    if (emailBad) e.push('Mover email should look like name@company.com.');
    return e;
  }, [value.address, address.kind, keepAddress, phoneBad, emailBad]);

  useEffect(() => { onErrorsChange(errors); }, [errors, onErrorsChange]);

  return (
    <div className="space-y-2">
      {/* Address */}
      <div>
        <div className="flex gap-2">
          <input
            value={value.address}
            onChange={(e) => editAddress(e.target.value)}
            onBlur={() => { if (address.kind !== 'saved') checkAddress(); }}
            placeholder="Delivery address (street, city, state ZIP)"
            autoComplete="street-address"
            className={inputCls}
          />
          <button
            type="button"
            onClick={checkAddress}
            disabled={!value.address.trim() || address.kind === 'checking'}
            className="px-3 py-2 text-xs font-medium rounded-md border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-50 whitespace-nowrap"
          >
            Check
          </button>
        </div>
        {address.kind === 'checking' && (
          <p className="mt-1 text-xs text-gray-500 flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> Checking address…</p>
        )}
        {address.kind === 'verified' && (
          <p className="mt-1 text-xs text-green-700 flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" /> Address found</p>
        )}
        {address.kind === 'suggest' && (
          <div className="mt-1 text-xs text-amber-800">
            <p className="mb-1">Did you mean:</p>
            {address.matches.map((m) => (
              <button key={m} type="button" onClick={() => useMatch(m)} className="block text-left text-indigo-700 hover:underline">
                {m}
              </button>
            ))}
          </div>
        )}
        {address.kind === 'notfound' && (
          <p className="mt-1 text-xs text-amber-800 flex items-center gap-1">
            <AlertTriangle className="w-3.5 h-3.5" /> No such address found. Check the spelling, or keep it if it is new or rural.
          </p>
        )}
        {address.kind === 'error' && (
          <p className="mt-1 text-xs text-amber-800 flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5" /> {address.message}</p>
        )}
        {(address.kind === 'notfound' || address.kind === 'suggest' || address.kind === 'error') && (
          <label className="mt-1 inline-flex items-center gap-2 text-xs text-gray-700 cursor-pointer select-none">
            <input type="checkbox" checked={keepAddress} onChange={(e) => setKeepAddress(e.target.checked)} className="w-4 h-4" />
            Keep the address as entered
          </label>
        )}
      </div>

      {/* Date + estimate */}
      <div className="flex gap-2">
        <div className="w-full">
          <input
            type="date"
            value={isIsoDate(value.date) ? value.date : ''}
            onChange={(e) => onChange({ date: e.target.value })}
            aria-label="Delivery date"
            className={inputCls}
          />
          {legacyDate && <p className="mt-0.5 text-xs text-gray-500">Was: {value.date}. Pick a date to replace it.</p>}
        </div>
        <input
          value={value.estimate}
          onChange={(e) => onChange({ estimate: e.target.value })}
          placeholder="Time / estimate"
          className={inputCls}
        />
      </div>

      {/* Access questions for the mover */}
      <div className="space-y-1.5 py-1">
        <div className="flex items-center justify-between gap-3">
          <span className={`text-sm ${value.property == null ? 'text-gray-800 font-medium' : 'text-gray-700'}`}>Delivering to a</span>
          <div className="inline-flex rounded-md border border-gray-300 overflow-hidden text-xs font-medium shrink-0" role="group" aria-label="Property type">
            {(Object.keys(PROPERTY_LABELS) as DeliveryProperty[]).map((p, i) => (
              <button
                key={p}
                type="button"
                aria-pressed={value.property === p}
                onClick={() => onChange({ property: p })}
                className={`px-3 py-1 ${i ? 'border-l border-gray-300' : ''} ${
                  value.property === p ? 'bg-indigo-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'
                }`}
              >
                {PROPERTY_LABELS[p]}
              </button>
            ))}
          </div>
        </div>
        <YesNoQuestion label="Moving up or down stairs?" value={value.stairs} onChange={(v) => onChange({ stairs: v })} />
        <YesNoQuestion label="Elevator required?" value={value.elevator} onChange={(v) => onChange({ elevator: v })} />
      </div>

      {/* Mover */}
      <div className="relative">
        <div className="relative">
          <Truck className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            value={value.company}
            onChange={(e) => { onChange({ company: e.target.value }); setMoverOpen(true); }}
            onFocus={() => setMoverOpen(true)}
            onBlur={() => setTimeout(() => setMoverOpen(false), 150)}
            placeholder={movers.length ? 'Mover: pick from the list or type a new one' : 'Mover / delivery company'}
            className={`${inputCls} pl-9`}
          />
        </div>
        {moverOpen && (moverMatches.length > 0 || (value.company.trim() && !moverKnown)) && (
          <ul className="absolute z-20 mt-1 w-full max-h-48 overflow-auto bg-white border border-gray-200 rounded-md shadow-lg">
            {moverMatches.map((m) => (
              <li key={m.id}>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => pickMover(m)}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-indigo-50"
                >
                  <span className="block text-gray-900">{m.name}</span>
                  {(m.phone || m.email) && (
                    <span className="block text-xs text-gray-500">{[m.phone, m.email].filter(Boolean).join(' · ')}</span>
                  )}
                </button>
              </li>
            ))}
            {value.company.trim() && !moverKnown && (
              <li>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={addMover}
                  disabled={addingMover || !companyId}
                  className="w-full text-left px-3 py-2 text-sm text-indigo-700 hover:bg-indigo-50 flex items-center gap-1.5 border-t border-gray-100"
                >
                  <Plus className="w-4 h-4" /> {addingMover ? 'Adding…' : `Add "${value.company.trim()}" as a new mover`}
                </button>
              </li>
            )}
          </ul>
        )}
      </div>

      {/* Mover phone + email */}
      <div className="flex gap-2">
        <div className="w-full">
          <input
            type="tel"
            inputMode="tel"
            value={value.companyPhone}
            onChange={(e) => {
              // Backspacing over ")", " " or "-" removes no digit; drop one so it is not stuck.
              let digits = phoneDigits(e.target.value);
              if (e.target.value.length < value.companyPhone.length && digits === phoneDigits(value.companyPhone)) {
                digits = digits.slice(0, -1);
              }
              onChange({ companyPhone: formatPhone(digits) });
            }}
            placeholder="Mover phone (555) 555-5555"
            className={`${inputCls} ${phoneBad ? errCls : ''}`}
          />
          {phoneBad && <p className="mt-0.5 text-xs text-red-600">10 digits, area code first</p>}
        </div>
        <div className="w-full">
          <input
            type="email"
            inputMode="email"
            value={value.companyEmail}
            onChange={(e) => onChange({ companyEmail: e.target.value.trim() })}
            placeholder="Mover email name@company.com"
            className={`${inputCls} ${emailBad ? errCls : ''}`}
          />
          {emailBad && <p className="mt-0.5 text-xs text-red-600">Like name@company.com</p>}
        </div>
      </div>
    </div>
  );
}
