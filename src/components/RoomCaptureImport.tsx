// src/components/RoomCaptureImport.tsx
// Review a room-capture package and turn it into lots in this sale. The package
// (lots.json + crops) comes from the capture/AI step; here staff exclude, combine
// and re-price rows before anything is written. See docs/room-capture-spec.md.

import { useEffect, useMemo, useState } from 'react';
import { X, FolderOpen, Files, Combine, Check, Ban, Mic, AlertTriangle, Camera, Video } from 'lucide-react';
import type { Consignment } from '../types';
import {
  readCapturePackage,
  findImage,
  importCaptureLots,
  type CaptureLot,
  type CapturePackage,
  type ImportProgress,
  type ImportResult,
} from '../services/RoomCaptureImportService';
import RoomCaptureVideoStep from './RoomCaptureVideoStep';

interface Props {
  saleId: string;
  /** Where the sale is, for the AI's pricing (e.g. "Estate sale in Richmond, VA"). */
  saleContext?: string;
  consignments: Consignment[];
  consignorNames: Record<string, string>;
  onClose: () => void;
  onImported: () => void;
}

interface Row extends CaptureLot {
  included: boolean;
  selected: boolean;
}

const money = (n: number) => `$${Math.round(n).toLocaleString()}`;
const inputCls = 'px-2 py-1 text-sm border border-gray-300 rounded-md focus:outline-none focus:border-indigo-600';
// Folder picking: not in React's input typings.
const folderProps = { webkitdirectory: '', directory: '' } as Record<string, string>;

export default function RoomCaptureImport({ saleId, saleContext = '', consignments, consignorNames, onClose, onImported }: Props) {
  const [pkg, setPkg] = useState<CapturePackage | null>(null);
  const [images, setImages] = useState<Map<string, File>>(new Map());
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showExcluded, setShowExcluded] = useState(true);
  const [adjustPct, setAdjustPct] = useState('');
  const [consignmentId, setConsignmentId] = useState<string>(consignments.length === 1 ? consignments[0].id : '');
  const [progress, setProgress] = useState<ImportProgress | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  // Walkthrough videos analysed here, instead of a ready-made package.
  const [videoMode, setVideoMode] = useState(false);

  // One object URL per image, released when the dialog closes.
  const thumbs = useMemo(() => {
    const m = new Map<File, string>();
    images.forEach((f) => {
      if (!m.has(f)) m.set(f, URL.createObjectURL(f));
    });
    return m;
  }, [images]);
  useEffect(() => () => thumbs.forEach((u) => URL.revokeObjectURL(u)), [thumbs]);

  const loadPackage = (p: CapturePackage, imgs: Map<string, File>) => {
    setPkg(p);
    setImages(imgs);
    setRows(p.lots.map((l) => ({ ...l, included: !l.not_for_sale, selected: false })));
  };

  const pick = async (list: FileList | null) => {
    if (!list || list.length === 0) return;
    setError(null);
    try {
      const loaded = await readCapturePackage(Array.from(list));
      loadPackage(loaded.pkg, loaded.images);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not read the package.');
    }
  };

  const update = (key: string, patch: Partial<Row>) =>
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const selected = rows.filter((r) => r.selected);
  const included = rows.filter((r) => r.included);
  const total = included.reduce((s, r) => s + (r.price || 0), 0);
  const visible = showExcluded ? rows : rows.filter((r) => r.included);
  const missing = rows.reduce((n, r) => n + r.photos.filter((p) => !findImage(images, p)).length, 0);

  const setSelectedIncluded = (on: boolean) =>
    setRows((rs) => rs.map((r) => (r.selected ? { ...r, included: on, selected: false } : r)));

  // Merge the selected rows into the first of them (table order): one lot, all photos.
  const combine = () => {
    if (selected.length < 2) return;
    const [keep, ...rest] = selected;
    const narr = selected.map((r) => r.narration).filter(Boolean);
    const merged: Row = {
      ...keep,
      quantity: selected.reduce((s, r) => s + (r.quantity || 1), 0),
      price: selected.reduce((s, r) => s + (r.price || 0), 0),
      narration: narr.length ? Array.from(new Set(narr)).join('; ') : keep.narration,
      members: selected.flatMap((r) => r.members),
      photos: selected.flatMap((r) => r.photos),
      possibly_restricted: selected.some((r) => r.possibly_restricted),
      needs_detail: selected.some((r) => r.needs_detail),
      included: true,
      selected: false,
    };
    const drop = new Set(rest.map((r) => r.key));
    setRows((rs) => rs.filter((r) => !drop.has(r.key)).map((r) => (r.key === keep.key ? merged : r)));
  };

  const applyAdjust = () => {
    const pct = Number(adjustPct);
    if (!Number.isFinite(pct) || pct === 0) return;
    const targets = selected.length ? new Set(selected.map((r) => r.key)) : null;
    setRows((rs) =>
      rs.map((r) => (!targets || targets.has(r.key) ? { ...r, price: Math.max(0, Math.round(r.price * (1 + pct / 100))) } : r)),
    );
    setAdjustPct('');
  };

  const roundTo = (step: number) =>
    setRows((rs) => rs.map((r) => ({ ...r, price: r.price > 0 ? Math.max(step, Math.round(r.price / step) * step) : 0 })));

  const runImport = async () => {
    setError(null);
    setProgress({ done: 0, total: included.length, stage: 'Starting' });
    try {
      const res = await importCaptureLots({
        saleId,
        lots: included,
        images,
        consignmentId: consignmentId || null,
        roomName: pkg?.room?.name,
        roomCode: pkg?.room?.code,
        onProgress: setProgress,
      });
      setResult(res);
      onImported();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Import failed.');
    } finally {
      setProgress(null);
    }
  };

  const busy = progress !== null;

  // Analysed clips live only in this dialog until lots are created.
  const close = () => {
    if (!result && (videoMode || pkg) && !window.confirm('Close room capture? Anything not yet created as lots will be lost.')) return;
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-2 sm:p-4 cursor-pointer" onClick={busy ? undefined : close}>
      <div
        className="bg-white rounded-lg w-full max-w-6xl max-h-[94vh] flex flex-col cursor-default"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 p-4 border-b border-gray-200">
          <div className="min-w-0">
            <h3 className="text-lg font-semibold text-gray-900">Room capture: create lots</h3>
            <p className="text-sm text-gray-500 truncate">
              {pkg
                ? `${pkg.room?.name || 'Room'}${pkg.room?.code ? ` (${pkg.room.code})` : ''} · ${pkg.source || ''}`
                : videoMode
                  ? 'Walkthrough videos: one clip per wall, narrated.'
                  : 'Record walkthrough videos, or pick a capture folder.'}
            </p>
          </div>
          <button onClick={close} disabled={busy} className="p-1 text-gray-400 hover:text-gray-700 disabled:opacity-30">
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="mx-4 mt-3 rounded-md bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">{error}</div>
        )}

        {result ? (
          <div className="p-6 space-y-3">
            <p className="text-base text-gray-900">
              Created <b>{result.created}</b> lots (#{result.firstNumber}–#{result.lastNumber}) with <b>{result.photos}</b> photos.
            </p>
            {result.missingPhotos > 0 && (
              <p className="text-sm text-amber-700">
                {result.missingPhotos} photo(s) were missing from the package or failed to upload; those lots still need photos.
              </p>
            )}
            <p className="text-sm text-gray-600">
              Lots flagged for detail shots and lots that only have capture crops still need proper photos.
            </p>
            <button onClick={onClose} className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-md hover:bg-indigo-700">
              Done
            </button>
          </div>
        ) : !pkg && videoMode ? (
          <RoomCaptureVideoStep saleId={saleId} saleContext={saleContext} onReady={loadPackage} />
        ) : !pkg ? (
          <div className="p-6 flex flex-col sm:flex-row gap-3">
            <button
              onClick={() => setVideoMode(true)}
              className="flex-1 flex flex-col items-center gap-2 border-2 border-indigo-300 bg-indigo-50/50 rounded-lg p-6 hover:border-indigo-500"
            >
              <Video className="w-8 h-8 text-indigo-500" />
              <span className="text-sm font-medium text-gray-700">Walkthrough videos</span>
              <span className="text-xs text-gray-500">Record or choose narrated clips; the AI finds the items</span>
            </button>
            <label className="flex-1 flex flex-col items-center gap-2 border-2 border-dashed border-gray-300 rounded-lg p-6 cursor-pointer hover:border-indigo-400">
              <FolderOpen className="w-8 h-8 text-gray-400" />
              <span className="text-sm font-medium text-gray-700">Choose capture folder</span>
              <span className="text-xs text-gray-500">The folder holding lots.json and crops/</span>
              <input type="file" className="hidden" multiple {...folderProps} onChange={(e) => pick(e.target.files)} />
            </label>
            <label className="flex-1 flex flex-col items-center gap-2 border-2 border-dashed border-gray-300 rounded-lg p-6 cursor-pointer hover:border-indigo-400">
              <Files className="w-8 h-8 text-gray-400" />
              <span className="text-sm font-medium text-gray-700">Choose files</span>
              <span className="text-xs text-gray-500">lots.json plus all its images, selected together</span>
              <input type="file" className="hidden" multiple accept=".json,image/*" onChange={(e) => pick(e.target.files)} />
            </label>
          </div>
        ) : (
          <>
            <div className="px-4 py-3 border-b border-gray-200 flex flex-wrap items-center gap-2 text-sm">
              <span className="text-gray-700">
                <b>{included.length}</b> of {rows.length} lots · {money(total)}
              </span>
              {missing > 0 && <span className="text-amber-700">· {missing} photo(s) missing</span>}
              <span className="flex-1" />
              <button onClick={combine} disabled={selected.length < 2 || busy} className="inline-flex items-center gap-1 px-3 py-1.5 border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-40">
                <Combine className="w-4 h-4" /> Combine{selected.length > 1 ? ` ${selected.length}` : ''}
              </button>
              <button onClick={() => setSelectedIncluded(false)} disabled={!selected.length || busy} className="inline-flex items-center gap-1 px-3 py-1.5 border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-40">
                <Ban className="w-4 h-4" /> Exclude
              </button>
              <button onClick={() => setSelectedIncluded(true)} disabled={!selected.length || busy} className="inline-flex items-center gap-1 px-3 py-1.5 border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-40">
                <Check className="w-4 h-4" /> Include
              </button>
              <span className="inline-flex items-center gap-1">
                <input value={adjustPct} onChange={(e) => setAdjustPct(e.target.value)} placeholder="±%" className={`${inputCls} w-16`} />
                <button onClick={applyAdjust} disabled={busy} className="px-2 py-1.5 border border-gray-300 rounded-md hover:bg-gray-50">
                  Adjust {selected.length ? 'selected' : 'all'}
                </button>
              </span>
              <button onClick={() => roundTo(5)} disabled={busy} className="px-2 py-1.5 border border-gray-300 rounded-md hover:bg-gray-50">Round $5</button>
              <button onClick={() => roundTo(10)} disabled={busy} className="px-2 py-1.5 border border-gray-300 rounded-md hover:bg-gray-50">Round $10</button>
              <label className="inline-flex items-center gap-1 text-gray-600">
                <input type="checkbox" checked={showExcluded} onChange={(e) => setShowExcluded(e.target.checked)} /> Show excluded
              </label>
            </div>

            <div className="flex-1 overflow-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-gray-50 text-xs text-gray-500 text-left">
                  <tr>
                    <th className="p-2 w-8" />
                    <th className="p-2">Photo</th>
                    <th className="p-2">Lot</th>
                    <th className="p-2 w-16">Qty</th>
                    <th className="p-2 w-24">Price</th>
                    <th className="p-2 hidden md:table-cell">Where</th>
                    <th className="p-2 w-20" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {visible.map((r) => {
                    const file = r.photos.length ? findImage(images, r.photos[0]) : undefined;
                    const src = file ? thumbs.get(file) : undefined;
                    return (
                      <tr key={r.key} className={`${r.included ? '' : 'opacity-40'} ${r.selected ? 'bg-indigo-50' : ''}`}>
                        <td className="p-2 align-top">
                          <input type="checkbox" checked={r.selected} disabled={busy} onChange={(e) => update(r.key, { selected: e.target.checked })} />
                        </td>
                        <td className="p-2 align-top">
                          <div className="relative w-20 h-20 bg-gray-100 rounded overflow-hidden">
                            {src ? (
                              <img src={src} alt="" className="w-full h-full object-cover" />
                            ) : (
                              <Camera className="w-6 h-6 text-gray-300 m-auto mt-7" />
                            )}
                            {r.photos.length > 1 && (
                              <span className="absolute bottom-0 right-0 bg-black/60 text-white text-[11px] px-1 rounded-tl">{r.photos.length}</span>
                            )}
                          </div>
                        </td>
                        <td className="p-2 align-top min-w-[220px]">
                          <input value={r.name} disabled={busy} onChange={(e) => update(r.key, { name: e.target.value })} className={`${inputCls} w-full font-medium`} />
                          {r.narration && (
                            <p className="mt-1 text-xs text-indigo-700 flex gap-1"><Mic className="w-3 h-3 mt-0.5 shrink-0" />{r.narration}</p>
                          )}
                          <div className="mt-1 flex flex-wrap gap-1 text-[11px]">
                            {r.not_for_sale && <span className="px-1.5 py-0.5 rounded bg-gray-200 text-gray-700">Not for sale</span>}
                            {r.needs_detail && <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-800">Needs detail shot</span>}
                            {r.possibly_restricted && (
                              <span className="px-1.5 py-0.5 rounded bg-red-100 text-red-700 inline-flex items-center gap-0.5"><AlertTriangle className="w-3 h-3" />Check material</span>
                            )}
                            {r.members.length > 1 && <span className="px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">{r.members.length} views merged</span>}
                          </div>
                        </td>
                        <td className="p-2 align-top">
                          <input type="number" min={1} value={r.quantity} disabled={busy} onChange={(e) => update(r.key, { quantity: Number(e.target.value) || 1 })} className={`${inputCls} w-14`} />
                        </td>
                        <td className="p-2 align-top">
                          <input type="number" min={0} value={r.price} disabled={busy} onChange={(e) => update(r.key, { price: Number(e.target.value) || 0 })} className={`${inputCls} w-20`} />
                        </td>
                        <td className="p-2 align-top text-xs text-gray-500 hidden md:table-cell">{r.location}</td>
                        <td className="p-2 align-top">
                          <button onClick={() => update(r.key, { included: !r.included })} disabled={busy} className="text-xs text-indigo-600 hover:underline">
                            {r.included ? 'Exclude' : 'Include'}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="p-4 border-t border-gray-200 flex flex-wrap items-center gap-3">
              {consignments.length > 0 && (
                <label className="text-sm text-gray-700 inline-flex items-center gap-2">
                  Client
                  <select value={consignmentId} disabled={busy} onChange={(e) => setConsignmentId(e.target.value)} className={inputCls}>
                    <option value="">None</option>
                    {consignments.map((c) => (
                      <option key={c.id} value={c.id}>{consignorNames[c.id] || 'Client'}</option>
                    ))}
                  </select>
                </label>
              )}
              <span className="flex-1 text-sm text-gray-600">
                {progress ? `${progress.stage}… ${progress.done} / ${progress.total}` : 'Lots are numbered after this sale’s last lot, in the order shown.'}
              </span>
              <button onClick={onClose} disabled={busy} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 disabled:opacity-40">Cancel</button>
              <button
                onClick={runImport}
                disabled={busy || included.length === 0}
                className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-md hover:bg-indigo-700 disabled:bg-gray-300"
              >
                {busy ? 'Creating…' : `Create ${included.length} lots`}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
