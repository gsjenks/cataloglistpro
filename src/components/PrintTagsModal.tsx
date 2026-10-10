// src/components/PrintTagsModal.tsx
// Print Niimbot B1 lot tags over Bluetooth: one lot (from the lot screen) or a
// list (the Items tab's current filter), in walking order. Every tag is listed
// with the image that will print; tags that need printing (new, or the price
// changed since) start ticked, untick one to skip it this time ("hold"), tick an
// already-printed one to reprint it, or Mark as tagged to take it off the Needs
// tag list without printing. Each printed tag stamps lots.tag_printed_at /
// tag_price so the Items tab can find tags that are missing or out of date.
// See docs/room-capture-spec.md, Lot tags.

import { useEffect, useMemo, useRef, useState } from 'react';
import { Printer, X, Bluetooth, AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight, Tag } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useApp } from '../context/AppContext';
import { NiimbotB1, isWebBluetoothAvailable } from '../lib/niimbot';
import { loadTagLogo, renderLotTag, tagBlocker, tagOutOfDate, type TagBranding } from '../lib/lotTag';
import type { Lot } from '../types';
import { compareByLocation } from '../lib/roomCodes';

// One printer connection for the whole session, so it survives closing the dialog.
let printer: NiimbotB1 | null = null;

const DENSITY_KEY = 'tag_density';
// Off by default: tags want a one-colour wordmark, and a colour crest prints as a blob.
const LOGO_KEY = 'tag_use_logo';

interface Props {
  lots: Lot[];
  /**
   * The lots the Items tab would show without the Needs tag filter: offered
   * behind "Show already-printed tags" so any of them can be reprinted.
   */
  reprintPool?: Lot[];
  /** Printed under each tag's QR code. */
  sale?: { name?: string | null; start_date?: string | null } | null;
  /** The sale room codes in walking order; tags print room by room. */
  roomOrder?: string[];
  onClose: () => void;
  /** Called after each tag prints (or is marked as tagged) and is recorded. */
  onPrinted?: (lotId: string, printedAt: string, price: number | null) => void;
}

type Stamp = { tag_printed_at: string; tag_price: number | null };

const money = (v: number | null | undefined) => (v == null ? 'no price' : `$${Number(v).toLocaleString()}`);
const shortDate = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

export default function PrintTagsModal({ lots, reprintPool, sale, roomOrder, onClose, onPrinted }: Props) {
  const { currentCompany } = useApp();
  const [branding, setBranding] = useState<TagBranding | null>(null);
  const [connected, setConnected] = useState(() => !!printer?.isConnected());
  const [printerName, setPrinterName] = useState<string | undefined>(() => printer?.name);
  const [connecting, setConnecting] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [printingId, setPrintingId] = useState<string | null>(null);
  const [run, setRun] = useState({ done: 0, total: 0 });
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [density, setDensity] = useState<number>(() => {
    const v = Number(localStorage.getItem(DENSITY_KEY));
    return v >= 1 && v <= 5 ? v : 3;
  });
  const [useLogo, setUseLogo] = useState(() => localStorage.getItem(LOGO_KEY) === '1');
  const stopRef = useRef(false);

  // The lists as they were when the dialog opened: printing a tag must not make
  // its row vanish (the Items tab's Needs tag filter drops it from `lots`).
  const [base] = useState(lots);
  const [pool] = useState(reprintPool ?? []);
  // Tags printed or marked in this dialog.
  const [stamps, setStamps] = useState<Map<string, Stamp>>(new Map());
  const [justPrinted, setJustPrinted] = useState<Set<string>>(new Set());
  const [showPrinted, setShowPrinted] = useState(false);

  const current = (l: Lot): Lot => ({ ...l, ...(stamps.get(l.id) ?? {}) });

  const extras = useMemo(() => {
    const inBase = new Set(base.map((l) => l.id));
    return pool.filter((l) => !inBase.has(l.id) && !tagOutOfDate(l));
  }, [base, pool]);

  // Walking order: the sale room list, then location, then lot number.
  const rows = useMemo(
    () => [...base, ...(showPrinted ? extras : [])].sort(compareByLocation(roomOrder ?? [])),
    [base, extras, showPrinted, roomOrder],
  );

  // Ticked = will print. One lot opened from its own screen prints whatever its
  // state; in a list, the tags that need printing start ticked.
  const [ticked, setTicked] = useState<Set<string>>(
    () => new Set(lots.filter((l) => !tagBlocker(l) && (lots.length === 1 || tagOutOfDate(l))).map((l) => l.id)),
  );
  const toggle = (id: string, on?: boolean) =>
    setTicked((t) => {
      const n = new Set(t);
      if (on ?? !n.has(id)) n.add(id);
      else n.delete(id);
      return n;
    });

  const toPrint = rows.filter((l) => ticked.has(l.id) && !tagBlocker(l));
  const needing = rows.filter((l) => !tagBlocker(l) && tagOutOfDate(current(l)));

  useEffect(() => {
    let cancelled = false;
    localStorage.setItem(LOGO_KEY, useLogo ? '1' : '0');
    loadTagLogo(useLogo ? currentCompany?.logo_url : null).then((logo) => {
      if (!cancelled) {
        setBranding({
          companyName: currentCompany?.name ?? '',
          logo,
          saleName: sale?.name ?? null,
          saleStartDate: sale?.start_date ?? null,
        });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [currentCompany?.logo_url, currentCompany?.name, useLogo, sale?.name, sale?.start_date]);

  useEffect(() => {
    if (printer) printer.onDisconnect = () => setConnected(false);
  }, []);

  // The image of every tag, drawn a few at a time so a long list doesn't freeze
  // the screen. Redrawn when the branding (logo on/off) changes.
  const [thumbs, setThumbs] = useState<Map<string, string>>(new Map());
  const drawnFor = useRef<TagBranding | null>(null);
  useEffect(() => {
    if (!branding) return;
    let cancelled = false;
    const fresh = drawnFor.current !== branding;
    drawnFor.current = branding;
    const todo = rows.filter((l) => !tagBlocker(l) && (fresh || !thumbs.has(l.id)));
    if (!todo.length) return;
    const acc = fresh ? new Map<string, string>() : new Map(thumbs);
    let i = 0;
    const step = () => {
      if (cancelled) return;
      for (const end = Math.min(todo.length, i + 8); i < end; i++) {
        try {
          acc.set(todo[i].id, renderLotTag(todo[i], branding).toDataURL('image/png'));
        } catch (e) {
          console.error('Tag preview failed:', e);
        }
      }
      setThumbs(new Map(acc));
      if (i < todo.length) setTimeout(step, 0);
    };
    step();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branding, rows]);

  // Full-size view, stepping through the list.
  const [viewing, setViewing] = useState<number | null>(null);
  const viewable = rows.filter((l) => !tagBlocker(l));
  const viewLot = viewing != null ? viewable[viewing] : null;

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
      const err = e as Error;
      // NotFoundError: the picker was closed without choosing, often because the
      // printer never appeared in it. Say what to check rather than nothing.
      if (err.name === 'NotFoundError') {
        setError(
          'No printer was chosen. Check the B1 is switched on and nearby, Bluetooth is on, and Chrome is allowed "Nearby devices" (Android Settings > Apps > Chrome > Permissions), then tap Connect printer again.',
        );
      } else if (err.name === 'SecurityError' || err.name === 'NotAllowedError') {
        setError('Chrome was not allowed to use Bluetooth. Allow "Nearby devices" for Chrome, then try again.');
      } else {
        setError(err.message);
      }
      setConnected(false);
    } finally {
      setConnecting(false);
    }
  };

  /** Record a tag as on the item (printed, or marked by hand). */
  const stamp = async (lot: Lot): Promise<boolean> => {
    const printedAt = new Date().toISOString();
    const price = lot.starting_bid ?? null;
    const { error: upErr } = await supabase
      .from('lots')
      .update({ tag_printed_at: printedAt, tag_price: price })
      .eq('id', lot.id);
    if (upErr) return false;
    setStamps((m) => new Map(m).set(lot.id, { tag_printed_at: printedAt, tag_price: price }));
    onPrinted?.(lot.id, printedAt, price);
    return true;
  };

  const markTagged = async (lot: Lot) => {
    setError(null);
    if (await stamp(lot)) toggle(lot.id, false);
    else setError(`Could not mark Lot ${lot.lot_number} as tagged (no connection?).`);
  };

  const print = async () => {
    if (!printer || !branding) return;
    setError(null);
    setNotice(null);
    setPrinting(true);
    stopRef.current = false;
    localStorage.setItem(DENSITY_KEY, String(density));

    const batch = toPrint;
    setRun({ done: 0, total: batch.length });
    let printed = 0;
    let unrecorded = 0;
    try {
      for (const lot of batch) {
        if (stopRef.current) break;
        setPrintingId(lot.id);
        // One job per tag: a failure part-way leaves an exact record of what printed.
        await printer.print([renderLotTag(lot, branding)], { density });
        printed++;
        setRun({ done: printed, total: batch.length });
        setJustPrinted((s) => new Set(s).add(lot.id));
        toggle(lot.id, false);
        if (!(await stamp(lot))) unrecorded++;
      }
      if (stopRef.current && printed < batch.length) {
        setNotice(`Stopped after ${printed} of ${batch.length}.`);
      } else {
        setNotice(`Printed ${printed} tag${printed === 1 ? '' : 's'}.`);
      }
    } catch (e) {
      setError(`Stopped after ${printed} of ${batch.length}: ${(e as Error).message}`);
    } finally {
      if (unrecorded) {
        setError((prev) =>
          `${prev ? `${prev} ` : ''}${unrecorded} printed tag${unrecorded === 1 ? ' was' : 's were'} not recorded (no connection?) and will still show as needing a tag.`,
        );
      }
      setPrintingId(null);
      setPrinting(false);
      setConnected(!!printer?.isConnected());
    }
  };

  const status = (l: Lot): { text: string; cls: string } => {
    const blocker = tagBlocker(l);
    if (blocker) return { text: `Held back: ${blocker}`, cls: 'text-gray-500' };
    if (printingId === l.id) return { text: 'Printing…', cls: 'text-indigo-700' };
    const c = current(l);
    if (justPrinted.has(l.id)) return { text: 'Printed just now', cls: 'text-green-700' };
    if (!c.tag_printed_at) return { text: 'New tag', cls: 'text-amber-700' };
    if (tagOutOfDate(c)) return { text: `Price changed: ${money(c.tag_price)} → ${money(c.starting_bid)}`, cls: 'text-amber-700' };
    return { text: `Tagged ${shortDate(c.tag_printed_at)}${ticked.has(l.id) ? ' · will reprint' : ''}`, cls: 'text-gray-500' };
  };

  const supported = isWebBluetoothAvailable();
  const single = base.length === 1;
  const printLabel = toPrint.length === 0 ? 'Nothing ticked' : `Print ${toPrint.length} tag${toPrint.length === 1 ? '' : 's'}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-2 sm:p-4 cursor-pointer" onClick={() => !printing && onClose()}>
      <div className="relative bg-white rounded-lg max-w-lg w-full max-h-[94vh] flex flex-col cursor-default" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900 inline-flex items-center gap-2">
            <Printer className="w-5 h-5 text-indigo-600" /> {single ? 'Print tag' : 'Print tags'}
          </h2>
          <button onClick={onClose} disabled={printing} className="p-1.5 rounded-full hover:bg-gray-100 disabled:opacity-40" aria-label="Close">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div className="p-4 space-y-3 overflow-auto">
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
                {connecting ? 'Connecting…' : connected ? 'Change' : 'Connect printer'}
              </button>
            </div>
          )}

          {/* Every tag: what will print, in order */}
          {!single && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-600">
              <span><b className="text-gray-900">{toPrint.length}</b> ticked of {rows.length}</span>
              <button onClick={() => setTicked(new Set(needing.map((l) => l.id)))} disabled={printing} className="text-indigo-600 hover:underline disabled:opacity-40">
                Tick the {needing.length} needing tags
              </button>
              <button onClick={() => setTicked(new Set())} disabled={printing} className="text-indigo-600 hover:underline disabled:opacity-40">
                Untick all
              </button>
              {extras.length > 0 && (
                <label className="inline-flex items-center gap-1">
                  <input type="checkbox" checked={showPrinted} onChange={(e) => setShowPrinted(e.target.checked)} disabled={printing} />
                  Show {extras.length} already-printed (to reprint)
                </label>
              )}
            </div>
          )}

          <ul className={`divide-y divide-gray-100 border border-gray-200 rounded-md ${single ? '' : 'max-h-[46vh] overflow-auto'}`}>
            {rows.map((l) => {
              const blocked = !!tagBlocker(l);
              const st = status(l);
              const img = thumbs.get(l.id);
              const c = current(l);
              const idx = viewable.findIndex((v) => v.id === l.id);
              return (
                <li key={l.id} className={`p-2 flex items-center gap-2.5 ${printingId === l.id ? 'bg-indigo-50' : ''} ${blocked ? 'opacity-60' : ''}`}>
                  <input
                    type="checkbox"
                    checked={ticked.has(l.id)}
                    disabled={blocked || printing}
                    onChange={() => toggle(l.id)}
                    aria-label={`Print the tag for lot ${l.lot_number}`}
                    className="w-4 h-4 shrink-0"
                  />
                  <button
                    type="button"
                    onClick={() => idx >= 0 && setViewing(idx)}
                    disabled={!img}
                    className={`shrink-0 border border-gray-300 rounded overflow-hidden bg-white ${single ? 'w-full' : 'w-28'}`}
                    title="See it full size"
                  >
                    {img ? (
                      <img src={img} alt={`Tag for lot ${l.lot_number}`} className="w-full" style={{ imageRendering: 'pixelated' }} />
                    ) : (
                      <div className="aspect-[384/240] bg-gray-100 animate-pulse" />
                    )}
                  </button>
                  {!single && (
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-900 truncate">
                        <span className="font-semibold">#{l.lot_number}</span> {l.name || 'Untitled'}
                      </p>
                      <p className={`text-xs ${st.cls}`}>{st.text}</p>
                      {!blocked && tagOutOfDate(c) && !justPrinted.has(l.id) && (
                        <button
                          onClick={() => markTagged(l)}
                          disabled={printing}
                          className="mt-0.5 inline-flex items-center gap-1 text-xs text-gray-600 hover:text-indigo-700 disabled:opacity-40"
                          title="It already has a tag (or one by hand): take it off the Needs tag list without printing"
                        >
                          <Tag className="w-3 h-3" /> Mark as tagged
                        </button>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
          {single && <p className="text-xs text-gray-500 -mt-1">{status(base[0]).text} · 50 × 30 mm</p>}

          {currentCompany?.logo_url && (
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

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-700 inline-flex gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" /> <span>{error}</span>
            </div>
          )}
          {notice && !error && (
            <div className="p-3 bg-green-50 border border-green-200 rounded-md text-sm text-green-800">{notice}</div>
          )}
        </div>

        <div className="px-4 pb-4 pt-2 border-t border-gray-100 space-y-2">
          <div className="flex gap-2">
            {printing ? (
              <>
                <div className="flex-1 px-4 py-2.5 bg-indigo-50 text-indigo-800 rounded-md text-sm font-medium text-center">
                  Printing {Math.min(run.done + 1, run.total)} of {run.total}…
                </div>
                <button
                  onClick={() => (stopRef.current = true)}
                  className="px-4 py-2.5 border border-gray-300 rounded-md text-sm hover:bg-gray-50"
                >
                  Stop
                </button>
              </>
            ) : supported && !connected && toPrint.length > 0 ? (
              // Not connected yet: the main button connects, so it is never a dead tap.
              <button
                onClick={connect}
                disabled={connecting}
                className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-600 text-white rounded-md font-semibold hover:bg-indigo-700 disabled:bg-gray-200 disabled:text-gray-400"
              >
                <Bluetooth className="w-4 h-4" />
                {connecting ? 'Connecting…' : 'Connect printer'}
              </button>
            ) : (
              <button
                onClick={print}
                disabled={!supported || !connected || toPrint.length === 0 || !branding}
                className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-600 text-white rounded-md font-semibold hover:bg-indigo-700 disabled:bg-gray-200 disabled:text-gray-400"
              >
                <Printer className="w-4 h-4" />
                {printLabel}
              </button>
            )}
          </div>
          <p className="text-xs text-gray-500">
            Use removable labels (or a string tag) on gilding, finishes and paper. Tags fade in sun and heat.
          </p>
        </div>

        {/* Full-size view */}
        {viewLot && viewing != null && (
          <div className="absolute inset-0 z-10 bg-white rounded-lg flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
              <p className="text-sm text-gray-900 truncate">
                <span className="font-semibold">#{viewLot.lot_number}</span> {viewLot.name || 'Untitled'}
                <span className="text-gray-400"> · {viewing + 1} of {viewable.length}</span>
              </p>
              <button onClick={() => setViewing(null)} className="p-1.5 rounded-full hover:bg-gray-100" aria-label="Back to the list">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            <div className="flex-1 flex flex-col items-center justify-center gap-3 p-4">
              {thumbs.get(viewLot.id) ? (
                <img src={thumbs.get(viewLot.id)} alt="" className="w-full border border-gray-300 rounded" style={{ imageRendering: 'pixelated' }} />
              ) : (
                <div className="w-full aspect-[384/240] bg-gray-100 animate-pulse rounded" />
              )}
              <p className={`text-xs ${status(viewLot).cls}`}>{status(viewLot).text}</p>
              <label className="inline-flex items-center gap-2 text-sm text-gray-800">
                <input type="checkbox" checked={ticked.has(viewLot.id)} disabled={printing} onChange={() => toggle(viewLot.id)} />
                Print this tag
              </label>
            </div>
            <div className="flex items-center justify-between px-4 pb-4">
              <button
                onClick={() => setViewing(Math.max(0, viewing - 1))}
                disabled={viewing === 0}
                className="inline-flex items-center gap-1 px-3 py-2 border border-gray-300 rounded-md text-sm hover:bg-gray-50 disabled:opacity-40"
              >
                <ChevronLeft className="w-4 h-4" /> Previous
              </button>
              <button
                onClick={() => setViewing(Math.min(viewable.length - 1, viewing + 1))}
                disabled={viewing >= viewable.length - 1}
                className="inline-flex items-center gap-1 px-3 py-2 border border-gray-300 rounded-md text-sm hover:bg-gray-50 disabled:opacity-40"
              >
                Next <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
