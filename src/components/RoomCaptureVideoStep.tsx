// src/components/RoomCaptureVideoStep.tsx
// Record or pick narrated walkthrough clips of one room, analyse them, and hand the
// merged lot list to the room-capture review screen. Clips run one at a time (a
// phone uploading several large videos at once only slows each one down).

import { useEffect, useRef, useState } from 'react';
import { Video, Upload, X, Loader2, CheckCircle2, AlertTriangle, RotateCcw, Sparkles } from 'lucide-react';
import type { CapturePackage } from '../services/RoomCaptureImportService';
import { processClip, buildRoomPackage, type ClipResult, type ClipStage } from '../services/RoomCaptureVideoService';

interface Props {
  saleContext: string;
  onReady: (pkg: CapturePackage, images: Map<string, File>) => void;
}

interface Clip {
  id: string;
  file: File;
  status: 'waiting' | ClipStage | 'done' | 'failed';
  fraction?: number;
  error?: string;
  result?: ClipResult;
}

const STAGE_LABEL: Record<string, string> = {
  waiting: 'Waiting',
  uploading: 'Uploading',
  processing: 'Preparing video',
  analyzing: 'Finding items',
  cropping: 'Cutting photos',
  done: 'Done',
  failed: 'Failed',
};

const mb = (n: number) => `${Math.round(n / 1e6)} MB`;

export default function RoomCaptureVideoStep({ saleContext, onReady }: Props) {
  const [room, setRoom] = useState('');
  const [clips, setClips] = useState<Clip[]>([]);
  const [running, setRunning] = useState(false);
  const [merging, setMerging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const clipsRef = useRef<Clip[]>([]);
  clipsRef.current = clips;
  const wakeLock = useRef<{ release: () => Promise<void> } | null>(null);

  useEffect(() => () => {
    wakeLock.current?.release().catch(() => undefined);
  }, []);

  const add = (list: FileList | null) => {
    if (!list) return;
    const vids = Array.from(list).filter((f) => f.type.startsWith('video/') || /\.(mp4|mov|m4v|webm)$/i.test(f.name));
    setClips((cs) => [
      ...cs,
      ...vids.map((file) => ({ id: crypto.randomUUID(), file, status: 'waiting' as const })),
    ]);
  };

  const update = (id: string, patch: Partial<Clip>) =>
    setClips((cs) => cs.map((c) => (c.id === id ? { ...c, ...patch } : c)));

  const keepAwake = async (on: boolean) => {
    try {
      if (on && 'wakeLock' in navigator && !wakeLock.current) {
        wakeLock.current = await (navigator as Navigator & {
          wakeLock: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> };
        }).wakeLock.request('screen');
      } else if (!on && wakeLock.current) {
        await wakeLock.current.release();
        wakeLock.current = null;
      }
    } catch {
      /* not supported or refused: processing still works with the screen on */
    }
  };

  const runAll = async () => {
    setError(null);
    setRunning(true);
    await keepAwake(true);
    try {
      for (const clip of clipsRef.current) {
        if (clip.status === 'done') continue;
        try {
          const result = await processClip(clip.file, room.trim(), saleContext, (stage, fraction) =>
            update(clip.id, { status: stage, fraction, error: undefined }),
          );
          update(clip.id, { status: 'done', result, fraction: undefined });
        } catch (e) {
          update(clip.id, { status: 'failed', error: e instanceof Error ? e.message : String(e) });
        }
      }
    } finally {
      setRunning(false);
      await keepAwake(false);
    }
  };

  const merge = async () => {
    const done = clipsRef.current.filter((c) => c.status === 'done' && c.result);
    if (!done.length) return;
    setError(null);
    setMerging(true);
    await keepAwake(true);
    try {
      const { pkg, images } = await buildRoomPackage(
        room.trim() || 'Room',
        done.map((c) => ({ label: c.file.name, result: c.result! })),
      );
      onReady(pkg, images);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not merge the clips.');
    } finally {
      setMerging(false);
      await keepAwake(false);
    }
  };

  const doneCount = clips.filter((c) => c.status === 'done').length;
  const pending = clips.filter((c) => c.status === 'waiting' || c.status === 'failed').length;
  const itemCount = clips.reduce((n, c) => n + (c.result?.items.length ?? 0), 0);
  const busy = running || merging;

  return (
    <div className="p-4 sm:p-6 space-y-4 overflow-auto">
      <label className="block">
        <span className="text-sm font-medium text-gray-700">Room</span>
        <input
          value={room}
          disabled={busy}
          onChange={(e) => setRoom(e.target.value)}
          placeholder="Office"
          className="mt-1 w-full sm:w-80 px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:border-indigo-600"
        />
      </label>

      <div className="rounded-md bg-indigo-50 border border-indigo-100 px-3 py-2 text-xs text-indigo-900 space-y-1">
        <p>One clip per wall or area, starting at the doorway and working left to right; then the centre of the room.</p>
        <p>Talk as you go: maker, material, condition, price, and anything that isn't for sale. Move slowly and pause on each piece.</p>
        <p>1080p at 30 fps is plenty. Keep this screen open while clips process.</p>
      </div>

      <div className="flex flex-wrap gap-2">
        <label className={`inline-flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium ${busy ? 'bg-gray-200 text-gray-400' : 'bg-indigo-600 text-white hover:bg-indigo-700 cursor-pointer'}`}>
          <Video className="w-4 h-4" /> Record clip
          <input type="file" accept="video/*" capture="environment" className="hidden" disabled={busy} onChange={(e) => { add(e.target.files); e.target.value = ''; }} />
        </label>
        <label className={`inline-flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium border ${busy ? 'border-gray-200 text-gray-400' : 'border-gray-300 text-gray-700 hover:bg-gray-50 cursor-pointer'}`}>
          <Upload className="w-4 h-4" /> Choose videos
          <input type="file" accept="video/*" multiple className="hidden" disabled={busy} onChange={(e) => { add(e.target.files); e.target.value = ''; }} />
        </label>
      </div>

      {clips.length > 0 && (
        <ul className="divide-y divide-gray-100 border border-gray-200 rounded-md">
          {clips.map((c, i) => {
            const active = c.status !== 'waiting' && c.status !== 'done' && c.status !== 'failed';
            return (
              <li key={c.id} className="p-3 flex items-start gap-3">
                <span className="mt-0.5 w-6 text-xs text-gray-400">#{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">{c.file.name}</p>
                  <p className="text-xs text-gray-500">
                    {mb(c.file.size)} · {STAGE_LABEL[c.status]}
                    {c.fraction !== undefined && active ? ` ${Math.round(c.fraction * 100)}%` : ''}
                    {c.result ? ` · ${c.result.items.length} items` : ''}
                  </p>
                  {c.result?.summary && <p className="text-xs text-gray-600 mt-0.5">{c.result.summary}</p>}
                  {active && (
                    <div className="mt-1 h-1.5 bg-gray-100 rounded overflow-hidden">
                      <div className="h-full bg-indigo-500 transition-all" style={{ width: `${Math.round((c.fraction ?? 0.05) * 100)}%` }} />
                    </div>
                  )}
                  {c.error && <p className="text-xs text-red-600 mt-1">{c.error}</p>}
                </div>
                <span className="mt-0.5">
                  {active && <Loader2 className="w-4 h-4 text-indigo-500 animate-spin" />}
                  {c.status === 'done' && <CheckCircle2 className="w-4 h-4 text-green-600" />}
                  {c.status === 'failed' && <AlertTriangle className="w-4 h-4 text-red-500" />}
                </span>
                {!busy && c.status !== 'done' && (
                  <button onClick={() => setClips((cs) => cs.filter((x) => x.id !== c.id))} className="p-1 text-gray-400 hover:text-gray-700" aria-label="Remove clip">
                    <X className="w-4 h-4" />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {error && <div className="rounded-md bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">{error}</div>}

      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={runAll}
          disabled={busy || pending === 0}
          className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-md hover:bg-indigo-700 disabled:bg-gray-300"
        >
          {clips.some((c) => c.status === 'failed') ? <RotateCcw className="w-4 h-4" /> : <Sparkles className="w-4 h-4" />}
          {running ? 'Processing…' : clips.some((c) => c.status === 'failed') ? 'Retry failed clips' : `Process ${pending} clip${pending === 1 ? '' : 's'}`}
        </button>
        <button
          onClick={merge}
          disabled={busy || doneCount === 0}
          className="inline-flex items-center gap-2 px-4 py-2 border border-gray-300 text-sm font-medium rounded-md hover:bg-gray-50 disabled:opacity-40"
        >
          {merging ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
          {merging ? 'Merging the room…' : `Review ${itemCount} items from ${doneCount} clip${doneCount === 1 ? '' : 's'}`}
        </button>
      </div>
    </div>
  );
}
