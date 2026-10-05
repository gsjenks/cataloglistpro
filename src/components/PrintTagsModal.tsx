// src/components/PrintTagsModal.tsx
// Print Niimbot B1 lot tags over Bluetooth: one lot (from the lot screen) or a
// list (the Items tab's current filter, in lot-number order). Each printed tag
// stamps lots.tag_printed_at / tag_price so the Items tab can find tags that
// are missing or out of date. See docs/room-capture-spec.md, Lot tags.

import { useEffect, useMemo, useRef, useState } from 'react';
import { Printer, X, Bluetooth, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useApp } from '../context/AppContext';
import { NiimbotB1, isWebBluetoothAvailable } from '../lib/niimbot';
import { loadTagLogo, renderLotTag, tagBlocker, type TagBranding } from '../lib/lotTag';
import type { Lot } from '../types';

// One printer connection for the whole session, so it survives closing the dialog.
let printer: NiimbotB1 | null = null;

const DENSITY_KEY = 'tag_density';
// Off by default: tags want a one-colour wordmark, and a colour crest prints as a blob.
const LOGO_KEY = 'tag_use_logo';

interface Props {
  lots: Lot[];
  onClose: () => void;
  /** Called after each tag prints and is recorded. */
  onPrinted?: (lotId: string, printedAt: string, price: number | null) => void;
}

export default function PrintTagsModal({ lots, onClose, onPrinted }: Props) {
  const { currentCompany } = useApp();
  const [branding, setBranding] = useState<TagBranding | null>(null);
  const [connected, setConnected] = useState(() => !!printer?.isConnected());
  const [printerName, setPrinterName] = useState<string | undefined>(() => printer?.name);
  const [connecting, setConnecting] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [done, setDone] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [density, setDensity] = useState<number>(() => {
    const v = Number(localStorage.getItem(DENSITY_KEY));
    return v >= 1 && v <= 5 ? v : 3;
  });
  const [useLogo, setUseLogo] = useState(() => localStorage.getItem(LOGO_KEY) === '1');
  const stopRef = useRef(false);

  const sorted = useMemo(
    () => [...lots].sort((a, b) => (Number(a.lot_number) || 0) - (Number(b.lot_number) || 0)),
    [lots],
  );
  const printable = useMemo(() => sorted.filter((l) => !tagBlocker(l)), [sorted]);
  const heldBack = useMemo(() => sorted.filter((l) => !!tagBlocker(l)), [sorted]);

  useEffect(() => {
    let cancelled = false;
    localStorage.setItem(LOGO_KEY, useLogo ? '1' : '0');
    loadTagLogo(useLogo ? currentCompany?.logo_url : null).then((logo) => {
      if (!cancelled) setBranding({ companyName: currentCompany?.name ?? '', logo });
    });
    return () => {
      cancelled = true;
    };
  }, [currentCompany?.logo_url, currentCompany?.name, useLogo]);

  useEffect(() => {
    if (printer) printer.onDisconnect = () => setConnected(false);
  }, []);

  const preview = useMemo(() => {
    if (!branding || printable.length === 0) return null;
    try {
      return renderLotTag(printable[0], branding).toDataURL('image/png');
    } catch (e) {
      console.error('Tag preview failed:', e);
      return null;
    }
  }, [branding, printable]);

  const connect = async () => {
    setError(null);
    setConnecting(true);
    try {
      printer ??= new NiimbotB1();
      printer.onDisconnect = () => setConnected(false);
      const name = await printer.connect();
      setPrinterName(name);
      setConnected(true);
    } catch (e) {
      // Closing the picker without choosing is not an error worth showing.
      if ((e as Error).name !== 'NotFoundError') setError((e as Error).message);
      setConnected(false);
    } finally {
      setConnecting(false);
    }
  };

  const print = async () => {
    if (!printer || !branding) return;
    setError(null);
    setNotice(null);
    setPrinting(true);
    setDone(0);
    stopRef.current = false;
    localStorage.setItem(DENSITY_KEY, String(density));

    let printed = 0;
    let unrecorded = 0;
    try {
      for (const lot of printable) {
        if (stopRef.current) break;
        // One job per tag: a failure part-way leaves an exact record of what printed.
        await printer.print([renderLotTag(lot, branding)], { density });
        printed++;
        setDone(printed);

        const printedAt = new Date().toISOString();
        const price = lot.starting_bid ?? null;
        const { error: upErr } = await supabase
          .from('lots')
          .update({ tag_printed_at: printedAt, tag_price: price })
          .eq('id', lot.id);
        if (upErr) unrecorded++;
        else onPrinted?.(lot.id, printedAt, price);
      }
      if (stopRef.current && printed < printable.length) {
        setNotice(`Stopped after ${printed} of ${printable.length}.`);
      } else {
        setNotice(`Printed ${printed} tag${printed === 1 ? '' : 's'}.`);
      }
    } catch (e) {
      setError(`Stopped after ${printed} of ${printable.length}: ${(e as Error).message}`);
    } finally {
      if (unrecorded) {
        setError((prev) =>
          `${prev ? `${prev} ` : ''}${unrecorded} printed tag${unrecorded === 1 ? ' was' : 's were'} not recorded (no connection?) and will still show as needing a tag.`,
        );
      }
      setPrinting(false);
      setConnected(!!printer?.isConnected());
    }
  };

  const supported = isWebBluetoothAvailable();
  const title = lots.length === 1 ? 'Print tag' : `Print ${printable.length} tag${printable.length === 1 ? '' : 's'}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 cursor-pointer" onClick={() => !printing && onClose()}>
      <div className="bg-white rounded-lg max-w-md w-full max-h-[90vh] overflow-auto cursor-default" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900 inline-flex items-center gap-2">
            <Printer className="w-5 h-5 text-indigo-600" /> {title}
          </h2>
          <button onClick={onClose} disabled={printing} className="p-1.5 rounded-full hover:bg-gray-100 disabled:opacity-40" aria-label="Close">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {!supported && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-md text-sm text-amber-900">
              This browser cannot reach Bluetooth printers. Open the app in <strong>Chrome</strong> on
              an Android phone or a computer to print tags. (iPhone Safari and the installed Android
              app do not support Web Bluetooth.)
            </div>
          )}

          {/* Printer */}
          {supported && (
            <div className="flex items-center justify-between gap-3 p-3 border border-gray-200 rounded-md">
              <div className="text-sm">
                {connected ? (
                  <span className="inline-flex items-center gap-1.5 text-green-700 font-medium">
                    <CheckCircle2 className="w-4 h-4" /> {printerName ?? 'Printer'} connected
                  </span>
                ) : (
                  <span className="text-gray-600">No printer connected</span>
                )}
              </div>
              <button
                onClick={connect}
                disabled={connecting || printing}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50"
              >
                <Bluetooth className="w-4 h-4" />
                {connecting ? 'Connecting…' : connected ? 'Change' : 'Connect B1'}
              </button>
            </div>
          )}

          {/* Preview of the first tag */}
          {preview ? (
            <div>
              <p className="text-xs text-gray-500 mb-1">
                {printable.length > 1 ? `First tag (Lot ${printable[0].lot_number})` : 'Tag'} — 50 × 30 mm
              </p>
              <img src={preview} alt="Tag preview" className="w-full border border-gray-300 rounded" style={{ imageRendering: 'pixelated' }} />
            </div>
          ) : printable.length > 0 ? (
            <div className="h-32 bg-gray-100 rounded animate-pulse" />
          ) : null}

          {heldBack.length > 0 && (
            <div className="p-3 bg-gray-50 border border-gray-200 rounded-md text-sm text-gray-700">
              <p className="font-medium mb-1">
                {heldBack.length} held back
              </p>
              <ul className="text-xs text-gray-600 space-y-0.5 max-h-24 overflow-auto">
                {heldBack.map((l) => (
                  <li key={l.id}>
                    {l.name || 'Untitled'} — {tagBlocker(l)}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {printable.length > 0 && currentCompany?.logo_url && (
            <label className="flex items-center justify-between text-sm text-gray-700">
              Use company logo (instead of the name)
              <input
                type="checkbox"
                checked={useLogo}
                onChange={(e) => setUseLogo(e.target.checked)}
                disabled={printing}
                className="ml-3"
              />
            </label>
          )}

          {printable.length > 0 && (
            <label className="flex items-center justify-between text-sm text-gray-700">
              Print darkness
              <select
                value={density}
                onChange={(e) => setDensity(Number(e.target.value))}
                disabled={printing}
                className="ml-3 px-2 py-1 border border-gray-300 rounded-md text-sm"
              >
                {[1, 2, 3, 4, 5].map((d) => (
                  <option key={d} value={d}>
                    {d}{d === 3 ? ' (default)' : ''}
                  </option>
                ))}
              </select>
            </label>
          )}

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-700 inline-flex gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" /> <span>{error}</span>
            </div>
          )}
          {notice && !error && (
            <div className="p-3 bg-green-50 border border-green-200 rounded-md text-sm text-green-800">{notice}</div>
          )}

          <div className="flex gap-2">
            {printing ? (
              <>
                <div className="flex-1 px-4 py-2.5 bg-indigo-50 text-indigo-800 rounded-md text-sm font-medium text-center">
                  Printing {Math.min(done + 1, printable.length)} of {printable.length}…
                </div>
                <button
                  onClick={() => (stopRef.current = true)}
                  className="px-4 py-2.5 border border-gray-300 rounded-md text-sm hover:bg-gray-50"
                >
                  Stop
                </button>
              </>
            ) : (
              <button
                onClick={print}
                disabled={!supported || !connected || printable.length === 0 || !branding}
                className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-600 text-white rounded-md font-semibold hover:bg-indigo-700 disabled:bg-gray-200 disabled:text-gray-400"
              >
                <Printer className="w-4 h-4" />
                {printable.length === 0 ? 'Nothing to print' : title}
              </button>
            )}
          </div>
          <p className="text-xs text-gray-500">
            Use removable labels (or a string tag) on gilding, finishes and paper. Tags fade in sun and heat.
          </p>
        </div>
      </div>
    </div>
  );
}
